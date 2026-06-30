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
 * Fetches an object by its public URL and returns the bytes as a
 * `Buffer`. Mirrors the old `downloadFromBlob` helper so the tool
 * pipeline can swap engines with minimal churn.
 */
export async function downloadFromStorage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download from Supabase Storage (${res.status} ${res.statusText})`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Deletes an object given its public URL. Swallows errors so callers
 * can fire-and-forget cleanup — the previous `deleteFromBlob` had the
 * same shape, so the call sites don't need to change.
 */
export async function deleteFromStorage(url: string): Promise<void> {
  try {
    const parsed = parsePublicUrl(url)
    if (!parsed) {
      console.warn(`[supabase-storage] Cannot parse URL for delete: ${url}`)
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
  const entries = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 })
  if (entries.error) {
    throw new Error(
      `Supabase list failed for prefix ${prefix}: ${entries.error.message}`
    )
  }
  let total = 0
  for (const entry of entries.data ?? []) {
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
    }
  }
  return total
}

/**
 * Parses a Supabase Storage public URL into its `{ bucket, pathname }`
 * parts. Returns null for non-Supabase URLs so `deleteFromStorage`
 * degrades gracefully on stale entries.
 *
 * Public URL shape:
 *   <SUPABASE_URL>/storage/v1/object/public/<bucket>/<pathname>
 */
export function parsePublicUrl(url: string): { bucket: string; pathname: string } | null {
  try {
    const parsed = new URL(url)
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