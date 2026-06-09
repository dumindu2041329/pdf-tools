import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getUserPlan } from "@/lib/auth"
import { canProcessFile } from "@/lib/usage"

/**
 * Issues a signed Vercel Blob upload token for a single file.
 *
 * The browser cannot POST a 200 MB file to a Vercel serverless function
 * (the request body limit is 4.5 MB), so large files are uploaded
 * directly to Vercel Blob from the client. The blob URL is then passed
 * to `/api/tools/[tool]`, which downloads the file from Blob and runs
 * the requested tool.
 *
 * Plan-aware limits: free users are capped at the free plan byte limit,
 * premium users can upload up to 4 GB.
 */
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "Sign in to upload files" }, { status: 401 })
  }

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const userPlan = await getUserPlan(userId)
  const freeLimit = 100 * 1024 * 1024 // 100 MB
  const premiumLimit = 4 * 1024 * 1024 * 1024 // 4 GB
  const maxBytes = userPlan === "free" ? freeLimit : premiumLimit

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        // `pathname` is provided by the @vercel/blob client (it's the
        // destination path the client is requesting). We don't pin the path
        // ourselves — `allowedPathnamePattern` and `addRandomSuffix` below
        // are what keep uploads inside the `tools/<slug>/` namespace — but
        // the callback signature requires the parameter, so we acknowledge
        // it explicitly to satisfy the linter.
        void pathname
        // Per-request sanity check based on the plan.
        const planGate = await canProcessFile(userId, 0, userPlan ?? "free")
        if (!planGate.allowed) {
          throw new Error(planGate.reason ?? "Plan does not allow uploads")
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/tiff",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ],
          // Restrict uploads to a folder keyed by the tool, with a flat
          // filename. Prevents the client from writing blobs outside the
          // `tools/<slug>/` namespace (e.g. clobbering other tenants).
          allowedPathnamePattern: `^tools/${tool.replace(/[^a-z0-9-]/gi, "-")}/[A-Za-z0-9._-]+$`,
          maximumSizeInBytes: maxBytes,
          tokenPayload: JSON.stringify({ userId, tool, plan: userPlan ?? "free" }),
          // NOTE: do NOT enable `addRandomSuffix` here. The @vercel/blob client
          // sends the original (unsuffixed) pathname in the PUT URL, but with
          // `addRandomSuffix: true` the server mints the token for the
          // suffixed pathname, so the Vercel Blob API returns 400
          // (`client_token_pathname_mismatch`). Blobs are deleted server-side
          // after processing, so collision is not a concern.
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log(
          `[blob] upload completed for tool=${tool} url=${blob.url} payload=${tokenPayload}`
        )
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = (error as Error).message || "Failed to generate upload token"
    console.error(`[blob] upload-url error: ${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
