import { auth } from "@clerk/nextjs/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { getLimitsForPlan } from "@/lib/usageLimits"

/**
 * Issues Vercel Blob client-upload tokens.
 *
 * The flow is the official "client upload" pattern from
 * https://vercel.com/docs/vercel-blob/client-upload :
 *
 *   1. Browser asks this route for an upload token (POST /api/upload).
 *   2. We call `handleUpload` which validates the request, runs our
 *      `onBeforeGenerateToken` hook, and returns a signed token + URL.
 *   3. Browser POSTs the file directly to the signed URL (this never
 *      touches our Next.js server, so it bypasses Vercel's ~4.5 MB
 *      serverless function body limit).
 *   4. Vercel Blob calls back to `onUploadCompleted` with the resulting
 *      blob URL so we can persist it / kick off downstream processing.
 *
 * Why we need this: the previous pipeline shipped PDFs to /api/tools/[tool]
 * inside a multipart FormData, which Vercel truncates at ~4.5 MB. The
 * free tier allows files up to 20 MB, the premium tier up to 4 GB — neither
 * is reachable without a direct-to-blob leg.
 *
 * Guests are allowed to use this route too, but with the free-plan
 * per-file cap (20 MB). The premium cap is reserved for signed-in
 * users; the guest's `userId` is simply absent from the token payload.
 */

export const runtime = "nodejs"

// PDFs max out at 4 GB on the premium plan, so the route must not be
// short-circuited by Vercel's default 10 s / 60 s function timeout.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth()
  const isGuest = !userId

  // Fail fast with a useful message if the Blob token isn't visible to
  // the serverless function. This is the #1 cause of "Failed to retrieve
  // the client token" — usually a missing env var or a deployment that
  // pre-dates when the variable was added. Vercel does NOT re-inject
  // env vars into already-deployed functions; you must redeploy.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "[blob] BLOB_READ_WRITE_TOKEN is not set on the server. " +
        "Add it in the Vercel dashboard (Project → Settings → Environment Variables) " +
        "for Production and Preview, then redeploy."
    )
    return NextResponse.json(
      {
        error:
          "Server is missing BLOB_READ_WRITE_TOKEN. Add it in Vercel project settings and redeploy.",
      },
      { status: 500 }
    )
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload /*, multipart */) => {
        // The client SDK sends whatever pathname the browser used to call
        // `upload()` (typically just the file name, e.g. `report.pdf`).
        // We don't try to enforce a `uploads/<userId>/` prefix here —
        // doing so rejects every legitimate request — but we DO block
        // path traversal and absolute paths so a stolen token can't be
        // used to escape the store.
        if (pathname.length === 0 || pathname.length > 1024) {
          throw new Error("Invalid pathname length")
        }
        if (pathname.includes("..") || pathname.startsWith("/")) {
          throw new Error("Invalid pathname")
        }

        // Only allow PDF / image uploads. The browser should also
        // validate, but the server is the source of truth.
        const allowed = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ]

        // `clientPayload` is a JSON string (or null) per the SDK
        // signature — see `HandleUploadOptions.onBeforeGenerateToken` in
        // `@vercel/blob/client`. The browser forwards it from the
        // `upload(file, { clientPayload })` call in `lib/blob-upload.ts`.
        // We use it to forward the file's content type without forcing
        // the client to round-trip through a separate API.
        if (clientPayload) {
          try {
            const payload = JSON.parse(clientPayload) as { contentType?: string }
            if (payload.contentType && !allowed.includes(payload.contentType)) {
              throw new Error(`Unsupported content type: ${payload.contentType}`)
            }
          } catch (err) {
            // Malformed client payload — reject so a stolen token can't
            // smuggle an unsupported content type past the server check.
            if (err instanceof Error && err.message.startsWith("Unsupported content type")) {
              throw err
            }
            throw new Error("Invalid clientPayload")
          }
        }

        return {
          // Public read so the server route can `fetch()` the URL during
          // processing and the user can re-download via the same URL.
          // Switch to "private" + `access: "private"` reads if the store
          // is later configured as private.
          allowedContentTypes: allowed,
          // Per-file cap. Guests inherit the free-plan limit (20 MB);
          // signed-in users get the premium 4 GB cap. The client also
          // enforces this via `getLimitsForPlan`, but the server is the
          // source of truth.
          maximumSizeInBytes: isGuest
            ? getLimitsForPlan("free").maxFileSizeMB * 1024 * 1024
            : 4 * 1024 * 1024 * 1024,
          // Different users uploading `report.pdf` shouldn't clobber each
          // other — the SDK appends a random suffix to make the final
          // pathname unique.
          addRandomSuffix: true,
          // Carries the userId (or "guest") into `onUploadCompleted` so
          // future cleanup hooks know who owns the blob.
          tokenPayload: JSON.stringify({ userId: userId ?? "guest" }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // No-op for now: the browser hands the blob URL to /api/tools/[tool]
        // in the same request, so we don't need to persist anything here.
        // Hook is kept so future iterations (e.g. background virus scan)
        // can plug in without changing the route signature.
        console.log(
          `[blob] Upload complete: ${blob.url} (payload=${tokenPayload ?? "none"})`
        )
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (err) {
    console.error("[blob] handleUpload error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload token request failed" },
      { status: 400 }
    )
  }
}
