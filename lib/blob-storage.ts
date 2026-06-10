import { del, getDownloadUrl, head, list, put } from "@vercel/blob"
import type { PutBlobResult } from "@vercel/blob"

/**
 * Server-side helpers for Vercel Blob storage.
 *
 * Why this exists: the app previously kept processed PDFs in an in-memory
 * `fileStore` (Map-based) and shipped them back to the browser as base64.
 * That works for small files but blows through Vercel's ~4.5 MB serverless
 * function body limit on anything larger. Vercel Blob is the official escape
 * hatch — the browser uploads directly to Blob via a presigned token, and the
 * server fetches the file from the returned URL.
 *
 * See: https://vercel.com/docs/vercel-blob/using-blob-sdk
 */

export interface UploadToBlobInput {
  /**
   * Blob body to upload. `Uint8Array` is accepted for convenience and
   * wrapped in a `Buffer` before the SDK call (the SDK's `PutBody` type
   * excludes raw `Uint8Array`).
   */
  body: Buffer | Uint8Array | ArrayBuffer | Blob | string
  /** Path inside the store, e.g. `uploads/${userId}/source.pdf`. */
  pathname: string
  /** Required for private stores; defaults to "public" since the demo store is public. */
  access?: "public" | "private"
  /** MIME type. Defaults to `application/pdf` because this app only handles PDFs. */
  contentType?: string
  /** Append a random suffix to avoid filename collisions. Defaults to `true`. */
  addRandomSuffix?: boolean
}

/**
 * Uploads a buffer/file to Vercel Blob and returns the resulting `PutBlobResult`
 * (with `url`, `downloadUrl`, `pathname`, `contentType`, `contentDisposition`).
 *
 * Usage:
 *   const blob = await uploadToBlob({ body: pdfBuffer, pathname: `processed/${userId}/out.pdf` })
 *   return NextResponse.json({ downloadId: blob.pathname, filename: "out.pdf", ... })
 */
export async function uploadToBlob(input: UploadToBlobInput): Promise<PutBlobResult> {
  const access = input.access ?? "private"
  // The SDK's PutBody type excludes raw `Uint8Array`; normalize to Buffer
  // (which IS accepted) so callers can pass whichever flavor they have.
  const body: Buffer | Blob | string =
    typeof input.body === "string"
      ? input.body
      : input.body instanceof Uint8Array && !(input.body instanceof Buffer)
        ? Buffer.from(input.body)
        : (input.body as Buffer | Blob)
  return put(input.pathname, body, {
    access,
    contentType: input.contentType ?? "application/pdf",
    addRandomSuffix: input.addRandomSuffix ?? true,
  })
}

/**
 * Fetches a Blob URL and returns its bytes as a `Buffer`. Useful on the server
 * when the client uploaded directly to Blob and we need to forward the file
 * to iLoveAPI / Adobe / pdf-lib.
 *
 * The URL passed in is whatever the client's `upload()` returned — for
 * private stores that URL is a short-lived, browser-grade signed URL that
 * is meant to expire quickly. By the time the tools route runs (seconds
 * later) it may already be rejected with 403, so we ignore the input
 * URL's signature and ask the SDK to mint a fresh, server-side signed URL
 * via `getDownloadUrl()`. For public stores the SDK just returns the same
 * URL, so the public path is unchanged.
 */
export async function downloadFromBlob(url: string): Promise<Buffer> {
  // The URL passed in is whatever the client's `upload()` returned — for
  // private stores that's a short-lived, browser-grade signed URL that
  // may 403 from a server-side `fetch` within seconds. We discard the
  // input signature and mint a fresh, server-side signed URL via the
  // SDK so the server can re-hydrate the file reliably.
  const pathname = new URL(url).pathname.replace(/^\//, "")

  // Try `getDownloadUrl` first (newer SDK API, single call). If this
  // version of `@vercel/blob` doesn't export it, fall back to `head()`
  // which returns a `downloadUrl` field on its metadata.
  const downloadUrl = await resolveDownloadUrl(pathname)

  const res = await fetch(downloadUrl)
  if (!res.ok) {
    throw new Error(`Failed to download blob (${res.status} ${res.statusText})`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function resolveDownloadUrl(pathname: string): Promise<string> {
  if (typeof getDownloadUrl === "function") {
    return getDownloadUrl(pathname)
  }
  const metadata = await head(pathname)
  if (!metadata) {
    throw new Error(`Blob not found: ${pathname}`)
  }
  return metadata.downloadUrl
}

/**
 * Deletes a blob by URL. Safe to call with unknown URLs — the SDK throws and
 * we swallow the error so the caller can fire-and-forget cleanup.
 */
export async function deleteFromBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    console.warn(`[blob] Failed to delete ${url}:`, err)
  }
}

/**
 * Lists blobs in the store. The SDK paginates transparently and yields a
 * single `BlobListResult`. We narrow it for convenience.
 */
export async function listBlobs(prefix?: string) {
  return list({ prefix })
}
