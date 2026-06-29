"use client"

import { upload } from "@vercel/blob/client"

/**
 * Browser-side helpers for Vercel Blob direct uploads.
 *
 * Vercel serverless functions truncate request bodies at ~4.5 MB. The
 * official workaround is the "client upload" pattern: the browser asks
 * `/api/upload` for a signed token, then PUTs the file straight to Blob.
 * The result is a public URL that the browser can hand back to the
 * server for downstream processing.
 *
 * See: https://vercel.com/docs/vercel-blob/client-upload
 */

/**
 * Vercel's documented payload shape. Mirrored locally so we don't need
 * to import the SDK type (which is large) just for a constant.
 */
const MAX_DIRECT_BODY_BYTES = 4 * 1024 * 1024 // 4 MB — under the 4.5 MB Vercel cap, with margin.

/**
 * Returns true when a file is too large to be sent as a FormData body to a
 * serverless function. The exact cutoff depends on Vercel's per-function
 * body limit (currently 4.5 MB on Hobby), so we sit a bit below it.
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
   * Optional context string forwarded to the server's
   * `onBeforeGenerateToken` hook (via `clientPayload`). The server uses
   * this to decide the final `pathname` inside the store; the client
   * itself cannot set the pathname directly.
   */
  clientPayload?: string
  /**
   * Optional override for the blob pathname. By default the SDK uses the
   * file's `name`, but some flows (e.g. mobile-scan captures that need
   * a `scan-sessions/<id>/…` prefix so the server can group them by
   * session) need to inject a prefix before the filename.
   */
  pathname?: string
}

export interface DirectUploadResult {
  url: string
  pathname: string
  contentType: string
  contentDisposition: string
}

/**
 * Uploads a single File to Vercel Blob via the official client SDK.
 * Requires the user to be signed in (the token route enforces this).
 *
 *   const { url } = await uploadFileDirect(file, {
 *     onProgress: (loaded, total) => setProgress(loaded / total),
 *   })
 */
export async function uploadFileDirect(
  file: File,
  options: DirectUploadOptions = {}
): Promise<DirectUploadResult> {
  const result = await upload(options.pathname ?? file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: file.type || undefined,
    clientPayload: options.clientPayload,
    onUploadProgress: ({ loaded, total }) => {
      options.onProgress?.(loaded, total)
    },
  })

  return {
    url: result.url,
    pathname: result.pathname,
    contentType: result.contentType ?? file.type ?? "application/octet-stream",
    contentDisposition: result.contentDisposition ?? "",
  }
}
