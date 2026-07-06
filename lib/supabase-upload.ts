"use client"

import { getSupabaseBrowser } from "@/lib/supabase"

/**
 * Browser-side helpers for direct uploads to Supabase Storage.
 *
 * Mirrors the old Vercel Blob client-upload pattern: the browser asks
 * `/api/upload` for a signed upload URL, then PUTs the file straight
 * to Supabase Storage. The result is a public URL that the browser
 * hands back to the server for downstream processing — the Next.js
 * serverless body cap never sees the bytes.
 */

const MAX_DIRECT_BODY_BYTES = 4 * 1024 * 1024 // 4 MB — under the 4.5 MB Vercel cap, with margin.

/**
 * Returns true when a file is too large to be sent as a FormData body
 * to a serverless function. Anything above the cutoff takes the
 * direct-to-storage path instead.
 */
export function shouldUseDirectUpload(file: File): boolean {
  return file.size > MAX_DIRECT_BODY_BYTES
}

export interface DirectUploadOptions {
  /**
   * Optional callback fired periodically during the upload with the
   * current byte progress. Used by `useTool` to drive the progress bar.
   */
  onProgress?: (loaded: number, total: number) => void
  /**
   * Optional override for the object path. By default the SDK uses the
   * file's `name`, but some flows (e.g. mobile-scan captures that need
   * a `scan-sessions/<id>/…` prefix so the server can group them by
   * session) need to inject a prefix before the filename.
   */
  pathname?: string
  /**
   * Override the bucket. Defaults to `pdf-uploads`.
   */
  bucket?: string
  /**
   * Override the content type. Defaults to `file.type`.
   */
  contentType?: string
}

export interface DirectUploadResult {
  url: string
  pathname: string
  contentType: string
  bucket: string
}

/**
 * Two-phase upload:
 *  1. POST `/api/upload` with `{ pathname, bucket, contentType }` to
 *     get back a `{ signedUrl, token, path }` triple from the server.
 *  2. PUT the file directly to Supabase Storage with the signed token
 *     via `uploadToSignedUrl`. Reports progress via the optional
 *     `onProgress` callback.
 *
 *   const { url } = await uploadFileDirect(file, {
 *     onProgress: (loaded, total) => setProgress(loaded / total),
 *   })
 */
export async function uploadFileDirect(
  file: File,
  options: DirectUploadOptions = {}
): Promise<DirectUploadResult> {
  const bucket = options.bucket ?? "pdf-uploads"
  const pathname = options.pathname ?? file.name
  const contentType = options.contentType ?? file.type ?? "application/octet-stream"

  const tokenRes = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, pathname, contentType, size: file.size }),
  })

  if (!tokenRes.ok) {
    let detail = `Failed to obtain upload token (${tokenRes.status})`
    try {
      const data = (await tokenRes.json()) as { error?: string }
      if (data.error) detail = data.error
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(detail)
  }

  // Only `token` and `path` are needed downstream. The SDK's
  // `uploadToSignedUrl` derives the upload URL from these itself, and
  // when we need to wire up progress events we build the URL ourselves
  // (see `uploadToSignedUrlWithProgress`).
  const { token, path } = (await tokenRes.json()) as {
    signedUrl: string
    token: string
    path: string
  }

  const supabase = getSupabaseBrowser()
  await uploadToSignedUrlWithProgress(supabase, bucket, path, token, file, contentType, options.onProgress)

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)

  return {
    url: pub.publicUrl,
    pathname: path,
    contentType,
    bucket,
  }
}

/**
 * Wraps `supabase.storage.from(bucket).uploadToSignedUrl(...)` with an
 * XMLHttpRequest so we can emit real byte progress (the SDK's helper
 * doesn't expose upload progress events).
 */
async function uploadToSignedUrlWithProgress(
  supabase: ReturnType<typeof getSupabaseBrowser>,
  bucket: string,
  path: string,
  token: string,
  file: File,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  if (!onProgress) {
    // Fast path: SDK helper handles the PUT for us. The signature is
    // `(path, token, body, options)` — `token` is a separate positional
    // arg, not part of the options object.
    const { error } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, file, { contentType })
    if (error) throw new Error(error.message)
    return
  }

  // Slow path: build the signed URL ourselves so we can wire up
  // XMLHttpRequest progress. The Supabase REST API uses PUT to upload
  // the body to `/storage/v1/object/upload/sign/<bucket>/<encoded-path>?token=…`
  // (matches what `uploadToSignedUrl` does internally — see
  // `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts`).
  // We read the project URL from the public env var since the SDK's
  // internal `supabaseUrl` field is protected.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY on the client. Add them to .env.local."
    )
  }
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  const url = `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${encodedPath}?token=${encodeURIComponent(token)}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.setRequestHeader("x-upsert", "false")
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`)
    xhr.setRequestHeader("apikey", anonKey)
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(e.loaded, e.total)
      }
    })
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size, file.size)
        resolve()
      } else {
        reject(new Error(parseXhrError(xhr) ?? `Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")))
    xhr.send(file)
  })
}

function parseXhrError(xhr: XMLHttpRequest): string | null {
  try {
    const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
    if (body.message) return body.message
    if (body.error) return body.error
  } catch {
    // not JSON
  }
  return null
}

/**
 * Browser-side delete: removes a file from Supabase Storage given its
 * public URL. Mirrors the server-side `deleteFromStorage` — swallows
 * errors so callers can fire-and-forget.
 */
export async function deleteFromStorageBrowser(url: string): Promise<void> {
  try {
    const parsed = parsePublicUrlClient(url)
    if (!parsed) return
    const supabase = getSupabaseBrowser()
    await supabase.storage.from(parsed.bucket).remove([parsed.pathname])
  } catch {
    // fire-and-forget
  }
}

function parsePublicUrlClient(url: string): { bucket: string; pathname: string } | null {
  try {
    const parsed = new URL(url)
    const marker = "/storage/v1/object/public/"
    const idx = parsed.pathname.indexOf(marker)
    if (idx === -1) return null
    const rest = parsed.pathname.slice(idx + marker.length)
    const slash = rest.indexOf("/")
    if (slash === -1) return null
    return { bucket: rest.slice(0, slash), pathname: rest.slice(slash + 1) }
  } catch {
    return null
  }
}