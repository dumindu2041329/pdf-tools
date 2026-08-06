import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getLimitsForPlan } from "@/lib/usageLimits"
import { getClientIp, rateLimitKey, uploadLimiter } from "@/lib/ratelimit"
import {
  createSignedUploadUrl,
  isSupabaseStorageConfigured,
  PDF_UPLOADS_BUCKET,
  SCAN_SESSIONS_BUCKET,
} from "@/lib/supabase-storage"

/**
 * Issues Supabase Storage signed upload URLs.
 *
 * Mirrors the old Vercel Blob client-upload pattern:
 *
 *   1. Browser asks this route for an upload token (POST /api/upload).
 *   2. We validate the request (bucket, content type, size, optional
 *      `scan-sessions/<id>/` prefix) and call
 *      `supabase.storage.createSignedUploadUrl(path)`.
 *   3. Browser PUTs the file directly to Supabase with the returned
 *      signed URL — the Next.js serverless body cap never applies.
 *   4. The browser forwards the resulting public URL to
 *      `/api/tools/[tool]` via the `blobUrls` form field.
 *
 * Why we need this: the previous pipeline shipped PDFs to
 * `/api/tools/[tool]` inside a multipart FormData, which Vercel
 * truncates at ~4.5 MB. The free tier allows files up to 20 MB and
 * the premium tier up to 4 GB — neither is reachable without the
 * direct-to-storage leg.
 */

export const runtime = "nodejs"

// PDFs max out at 4 GB on the premium plan, so the route must not be
// short-circuited by Vercel's default 10 s / 60 s function timeout.
export const maxDuration = 60

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

const ALLOWED_BUCKETS = new Set<string>([PDF_UPLOADS_BUCKET, SCAN_SESSIONS_BUCKET])

const SAFE_SESSION = /^[a-zA-Z0-9-]{1,100}$/

interface UploadTokenRequest {
  bucket?: unknown
  pathname?: unknown
  contentType?: unknown
  size?: unknown
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSupabaseStorageConfigured()) {
    console.error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set."
    )
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase credentials. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and redeploy.",
      },
      { status: 500 }
    )
  }

  const { userId } = await auth()
  const isGuest = !userId

  // Burst protection (Upstash Redis) — issue signed upload URLs at most
  // 30x/min per user/IP.
  const rl = await uploadLimiter.limit(rateLimitKey(userId, getClientIp(request)))
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many upload requests. Please try again shortly." },
      { status: 429 }
    )
  }

  let payload: UploadTokenRequest
  try {
    payload = (await request.json()) as UploadTokenRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const bucket = typeof payload.bucket === "string" ? payload.bucket : PDF_UPLOADS_BUCKET
  const pathname = typeof payload.pathname === "string" ? payload.pathname : ""
  const contentType = typeof payload.contentType === "string" ? payload.contentType : ""
  const size = typeof payload.size === "number" ? payload.size : 0

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: `Unknown bucket: ${bucket}` }, { status: 400 })
  }

  if (pathname.length === 0 || pathname.length > 1024) {
    return NextResponse.json({ error: "Invalid pathname length" }, { status: 400 })
  }
  if (pathname.includes("..") || pathname.startsWith("/")) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 400 }
    )
  }

  // Per-file cap. Guests inherit the free-plan limit (20 MB); signed-in
  // users get the premium 4 GB cap. The client also enforces this via
  // `getLimitsForPlan`, but the server is the source of truth.
  const maxBytes = isGuest
    ? getLimitsForPlan("free").maxFileSizeMB * 1024 * 1024
    : 4 * 1024 * 1024 * 1024
  if (size <= 0 || size > maxBytes) {
    return NextResponse.json(
      {
        error: `File too large for ${isGuest ? "guest" : "signed-in"} plan (max ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`,
      },
      { status: 413 }
    )
  }

  // Scan-session flows must upload under `scan-sessions/<sessionId>/…`.
  // We validate the prefix up front so a leaked signed URL can't be
  // abused to write into another session's namespace.
  if (bucket === SCAN_SESSIONS_BUCKET) {
    const expectedPrefix = `${SCAN_SESSIONS_BUCKET}/`
    if (!pathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: `Pathname must start with ${expectedPrefix}` },
        { status: 400 }
      )
    }
    const rest = pathname.slice(expectedPrefix.length)
    const sessionSegment = rest.split("/")[0]
    if (!SAFE_SESSION.test(sessionSegment)) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 })
    }
  }

  // Strip the bucket prefix from the client-provided pathname before
  // handing the path to the SDK. Supabase Storage treats `pathname` as
  // a path *relative* to the bucket, but our public API mirrors the
  // old Vercel Blob shape where the client passes the full key (bucket
  // name included). Validating the full path keeps the API stable and
  // gives us a single place to enforce "only this bucket's prefix is
  // writable" without leaking the bucket-vs-key distinction to callers.
  const pathRelativeToBucket = pathname.startsWith(`${bucket}/`)
    ? pathname.slice(bucket.length + 1)
    : pathname

  // Append a random suffix to the leaf filename so concurrent uploads
  // of `report.pdf` from different users don't collide on the same
  // object path.
  const finalPath = withRandomSuffix(pathRelativeToBucket)

  try {
    const { signedUrl, token, path } = await createSignedUploadUrl(bucket, finalPath)
    return NextResponse.json({ signedUrl, token, path })
  } catch (err) {
    console.error("[supabase] createSignedUploadUrl failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create signed upload URL" },
      { status: 500 }
    )
  }
}

/**
 * Adds a short random suffix to the leaf of `path` so concurrent
 * uploads of the same filename don't overwrite each other. Mirrors
 * Vercel Blob's `addRandomSuffix: true` behaviour.
 */
function withRandomSuffix(path: string): string {
  const slash = path.lastIndexOf("/")
  const dir = slash === -1 ? "" : path.slice(0, slash + 1)
  const name = slash === -1 ? path : path.slice(slash + 1)
  if (name.length === 0) return path
  const dot = name.lastIndexOf(".")
  const stem = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? "" : name.slice(dot)
  const suffix = randomToken()
  return `${dir}${stem}-${suffix}${ext}`
}

function randomToken(): string {
  // 9-char base36 token → ~47 bits of entropy. Cheap and URL-safe.
  return Math.random().toString(36).slice(2, 11)
}