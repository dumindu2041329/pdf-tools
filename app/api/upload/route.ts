import { auth } from "@clerk/nextjs/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

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
 */

export const runtime = "nodejs"

// PDFs max out at 4 GB on the premium plan, so the route must not be
// short-circuited by Vercel's default 10 s / 60 s function timeout.
export const maxDuration = 60

function isHandleUploadBody(value: unknown): value is HandleUploadBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as unknown
  if (!isHandleUploadBody(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Scope every upload to the requesting user so a stolen token
        // can't be used to overwrite someone else's file.
        if (!pathname.startsWith(`uploads/${userId}/`)) {
          throw new Error("Pathname must be scoped to the current user")
        }

        // Only allow PDF / image uploads. This is the only content-type
        // filter that runs on the server; the client should also validate,
        // but the server is the source of truth.
        const allowed = new Set([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ])
        const payload = (clientPayload ?? {}) as { contentType?: string }
        if (payload.contentType && !allowed.has(payload.contentType)) {
          throw new Error(`Unsupported content type: ${payload.contentType}`)
        }

        return {
          // Public read so the server route can `fetch()` the URL during
          // processing and the user can re-download via the same URL.
          // Switch to "private" + `access: "private"` reads if the store
          // is later configured as private.
          allowedContentTypes: Array.from(allowed),
          // 4 GB hard cap matches the premium plan's max file size.
          maximumSizeInBytes: 4 * 1024 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId }),
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
