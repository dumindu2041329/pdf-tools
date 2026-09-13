import { getSupabaseServer } from "@/lib/supabase"

/**
 * Server-side helpers for Supabase Storage.
 *
 * This replaces the old Vercel Blob helpers (`lib/blob-storage.ts`).
 * Two buckets back the app today:
 *  - `pdf-uploads`   — source PDFs / images uploaded via the tool page.
 *  - `scan-sessions` — mobile-scan captures grouped by session id.
 *
 * Both buckets are public, so reads go via `getPublicUrl()` (no signed
 * download URL required). Writes are server-issued via signed upload
 * URLs (see `app/api/upload/route.ts`), so direct browser uploads never
 * need a service role key on the client.
 */

export const PDF_UPLOADS_BUCKET = "pdf-uploads"
export const SCAN_SESSIONS_BUCKET = "scan-sessions"

/**
 * Outbound Storage fetches must not be allowed to hang until the
 * serverless invocation is killed by the platform — a slow or malicious
 * object URL would otherwise tie up the whole function.
 */
const STORAGE_FETCH_TIMEOUT_MS = 60_000

/**
 * Origin of the configured Supabase project (`https://<ref>.supabase.co`).
 * Returns null when the env var is missing or malformed.
 */
function getStorageOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/**
 * Returns true when the configured Supabase environment looks usable.
 * Routes can use this to short-circuit with a friendly error before
 * hitting the network (e.g. when `NEXT_PUBLIC_SUPABASE_URL` is missing
 * in a brand-new deployment).
 */
export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export interface UploadToStorageInput {
  /** Bucket id (e.g. `pdf-uploads`). */
  bucket: string
  /** Object body to upload. Buffers / blobs / file-likes are all accepted. */
  body: Buffer | Uint8Array | ArrayBuffer | Blob | string
  /** Path inside the bucket, e.g. `uploads/source.pdf`. */
  pathname: string
  /** MIME type. Defaults to `application/octet-stream`. */
  contentType?: string
  /** Append a random suffix to avoid collisions. Defaults to `true`. */
  upsert?: boolean
}

export interface StorageObject {
  /** Public URL of the object (works for public buckets). */
  url: string
  /** Path inside the bucket. */
  pathname: string
}

/**
 * Uploads a body to a Supabase Storage bucket. Returns the resulting
 * public URL + final pathname. Wraps the SDK so callers can stay
 * storage-agnostic.
 */
export async function uploadToStorage(input: UploadToStorageInput): Promise<StorageObject> {
  const supabase = getSupabaseServer()
  const buffer = normalizeToArrayBuffer(input.body)

  const { data, error } = await supabase.storage
    .from(input.bucket)
    .upload(input.pathname, buffer, {
      contentType: input.contentType ?? "application/octet-stream",
      upsert: input.upsert ?? false,
    })

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`)
  }

  const { data: pub } = supabase.storage.from(input.bucket).getPublicUrl(data.path)
  return { url: pub.publicUrl, pathname: data.path }
}

/**
 * Thrown when a download is refused because the object exceeds the
 * caller-supplied byte limit. Distinct type so callers can map it to a
 * user-facing "file too large" response instead of a generic 502.
 */
export class StorageLimitExceededError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Refusing to download: object is larger than the ${maxBytes} byte limit`)
    this.name = "StorageLimitExceededError"
  }
}

/**
 * Fetches an object by its public URL and returns the bytes as a
 * `Buffer`. Mirrors the old `downloadFromBlob` helper so the tool
 * pipeline can swap engines with minimal churn.
 */
export async function downloadFromStorage(
  url: string,
  scope: StorageScope,
  options?: { maxBytes?: number }
): Promise<Buffer> {
  // Callers pass URLs that originated from the client (`blobUrls` /
  // `watermarkImageUrl` form fields), so an unvalidated `fetch()` here is
  // an SSRF sink — a caller could point us at cloud metadata endpoints
  // (169.254.169.254) or internal hosts. `scope` also pins the read to
  // objects the caller is allowed to touch, so a leaked public URL can't
  // be used to pull another tenant's file into a job.
  if (!parseScopedStorageUrl(url, scope)) {
    throw new Error(
      "Refusing to download: URL is not a permitted Supabase Storage object"
    )
  }
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Failed to download from Supabase Storage (${res.status} ${res.statusText})`)
  }
  // Reject oversized objects before buffering them. Supabase serves a
  // Content-Length, so this stops a mis-reported (or absent) client
  // `size` from pulling a multi-GB body into memory.
  if (options?.maxBytes) {
    const declared = Number(res.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      throw new StorageLimitExceededError(options.maxBytes)
    }
  }
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (options?.maxBytes && buffer.byteLength > options.maxBytes) {
    throw new StorageLimitExceededError(options.maxBytes)
  }
  return buffer
}

/**
 * Deletes an object given its public URL. Swallows errors so callers
 * can fire-and-forget cleanup — the previous `deleteFromBlob` had the
 * same shape, so the call sites don't need to change.
 */
export async function deleteFromStorage(
  url: string,
  scope: StorageScope
): Promise<void> {
  try {
    const parsed = parseScopedStorageUrl(url, scope)
    if (!parsed) {
      // Out of scope — refuse rather than delete. A public URL is not a
      // deletion capability, so a caller-supplied URL for another
      // tenant's (or another bucket's) object must be ignored.
      console.warn(`[supabase-storage] Refusing to delete out-of-scope URL: ${url}`)
      return
    }
    const supabase = getSupabaseServer()
    const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.pathname])
    if (error) {
      console.warn(`[supabase-storage] Delete failed for ${url}: ${error.message}`)
    }
  } catch (err) {
    console.warn(`[supabase-storage] Failed to delete ${url}:`, err)
  }
}

/**
 * Lists objects in a bucket under an optional prefix. Returns the raw
 * SDK shape so callers can read `name`, `metadata`, etc. without an
 * extra mapping layer.
 */
export interface ListStorageObjectsOptions {
  bucket: string
  /** Path prefix to filter by (e.g. `scan-sessions/<id>/`). */
  prefix?: string
  /** Max items to return. Defaults to 1000. */
  limit?: number
}

export async function listStorageObjects(options: ListStorageObjectsOptions) {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase.storage
    .from(options.bucket)
    .list(options.prefix ?? "", {
      limit: options.limit ?? 1000,
      sortBy: { column: "name", order: "asc" },
    })
  if (error) {
    throw new Error(`Supabase list failed: ${error.message}`)
  }
  return data
}

/**
 * Recursively deletes every object under `prefix` in `bucket`. Walks
 * sub-folders (Supabase Storage's flat namespace still reports them
 * via `list()`) and batches up to 100 removes per call — the SDK
 * rejects larger arrays. The Supabase console hides the prefix
 * folder once every object beneath it is gone, which is how callers
 * "delete a folder" in Supabase Storage.
 *
 * Returns the number of objects removed (for logging / API response).
 */
export async function deleteStoragePrefix(options: {
  bucket: string
  prefix: string
}): Promise<number> {
  return collectAndDelete(options.bucket, options.prefix)
}

async function collectAndDelete(
  bucket: string,
  prefix: string
): Promise<number> {
  const supabase = getSupabaseServer()
  // Supabase `list` caps at 1000 rows and has no cursor, and deleting
  // shifts the result set — so re-list from the top after each page and
  // stop once a pass removes nothing. This makes "destroy" complete for
  // folders with >1000 objects (the old single-page version silently
  // left the remainder behind).
  const PAGE_SIZE = 1000
  let total = 0
  for (;;) {
    const entries = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE })
    if (entries.error) {
      throw new Error(
        `Supabase list failed for prefix ${prefix}: ${entries.error.message}`
      )
    }
    const rows = entries.data ?? []
    if (rows.length === 0) break

    let removedThisPass = 0
    for (const entry of rows) {
      const rel = `${prefix}${entry.name}`
      // `id` is null for sub-folders in the Supabase SDK; descend
      // recursively. `id` is a non-null UUID for actual file objects.
      if (!entry.id) {
        total += await collectAndDelete(bucket, `${rel}/`)
      } else {
        const { error } = await supabase.storage.from(bucket).remove([rel])
        if (error) {
          throw new Error(
            `Supabase remove failed for ${rel}: ${error.message}`
          )
        }
        total += 1
        removedThisPass += 1
      }
    }
    // No progress this pass (only an empty/stale folder remains) —
    // stop rather than loop forever.
    if (removedThisPass === 0) break
  }
  return total
}

/**
 * Parses a Supabase Storage public URL into its `{ bucket, pathname }`
 * parts. Returns null for non-Supabase URLs so `deleteFromStorage`
 * degrades gracefully on stale entries.
 *
 * The origin is validated against the configured Supabase project — a
 * URL like `https://evil.com/storage/v1/object/public/pdf-uploads/x`
 * must not be treated as one of our own objects (that would turn
 * `deleteFromStorage` into a cross-host confusion vector).
 *
 * Public URL shape:
 *   <SUPABASE_URL>/storage/v1/object/public/<bucket>/<pathname>
 */
export function parsePublicUrl(url: string): { bucket: string; pathname: string } | null {
  try {
    const parsed = new URL(url)
    const origin = getStorageOrigin()
    if (!origin || parsed.origin !== origin) return null
    const marker = "/storage/v1/object/public/"
    const idx = parsed.pathname.indexOf(marker)
    if (idx === -1) return null
    const rest = parsed.pathname.slice(idx + marker.length)
    const slash = rest.indexOf("/")
    if (slash === -1) return null
    const bucket = rest.slice(0, slash)
    const pathname = rest.slice(slash + 1)
    return { bucket, pathname }
  } catch {
    return null
  }
}

/**
 * Namespace under which a caller's client-uploaded source files live.
 * Signed-in callers are keyed by their Clerk id; everyone else shares
 * the `guest` namespace. Must mirror the path built in
 * `app/api/upload/route.ts`, which owns the write side of this contract.
 */
export function ownerNamespace(userId: string | null): string {
  if (!userId) return "guest"
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  return safe.length > 0 ? safe : "user"
}

/** Path prefix owned by a caller for client-uploaded source files. */
export function ownerUploadPrefix(userId: string | null): string {
  return `uploads/${ownerNamespace(userId)}/`
}

/**
 * Restricts which Storage objects a service-role read/delete may touch.
 * Public bucket URLs are visible to anyone, so possession of a URL must
 * never by itself be treated as authority over the object — callers
 * declare the bucket (and optionally the path prefixes) they may act on.
 */
export interface StorageScope {
  /** Only objects in this bucket are eligible. */
  bucket: string
  /**
   * Eligible pathname prefixes (any match). Omit to allow any path in
   * the bucket; pass an empty array to deny everything (a safe default
   * until the caller's identity is known).
   */
  prefixes?: string[]
}

/**
 * Parses a public URL and returns its parts only when it resolves to
 * `scope.bucket` and one of `scope.prefixes` (when provided). Returns
 * null for anything out of scope so callers can refuse the operation.
 */
export function parseScopedStorageUrl(
  url: string,
  scope: StorageScope
): { bucket: string; pathname: string } | null {
  const parsed = parsePublicUrl(url)
  if (!parsed || parsed.bucket !== scope.bucket) return null
  if (scope.prefixes) {
    if (!scope.prefixes.some((prefix) => parsed.pathname.startsWith(prefix))) {
      return null
    }
  }
  return parsed
}

/**
 * Issues a short-lived signed upload URL. The browser POSTs the file
 * directly to Supabase with this token, bypassing the Next.js server
 * body cap. Mirrors the old Vercel Blob `handleUpload()` flow.
 */
export async function createSignedUploadUrl(
  bucket: string,
  pathname: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(pathname)
  if (error || !data) {
    throw new Error(`Failed to create signed upload URL: ${error?.message ?? "unknown"}`)
  }
  return data
}

function normalizeToArrayBuffer(input: UploadToStorageInput["body"]): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input
  if (typeof Buffer !== "undefined" && input instanceof Buffer) {
    // Buffer extends Uint8Array — copy into a fresh ArrayBuffer so
    // the SDK doesn't have to special-case Node buffers.
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
  }
  if (input instanceof Uint8Array) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    // Sync fallback: a Blob isn't backed by a synchronous ArrayBuffer.
    // The SDK also accepts `Blob` directly, but TypeScript narrows
    // `input` to `ArrayBuffer` after the conversion — return an empty
    // placeholder to keep the helper simple. Callers that need Blob
    // should use `uploadToStorageFromBlob` (TODO) or the SDK directly.
    throw new Error("Blob bodies should be uploaded via the SDK directly, not this helper")
  }
  if (typeof input === "string") {
    return new TextEncoder().encode(input).buffer as ArrayBuffer
  }
  throw new Error("Unsupported body type for uploadToStorage")
}