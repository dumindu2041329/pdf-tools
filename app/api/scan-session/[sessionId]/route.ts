import { NextResponse } from "next/server"
import { listBlobs } from "@/lib/blob-storage"

/**
 * Lists the scanned images that belong to a Scan-to-PDF session.
 *
 * Mobile captures uploaded through `/api/upload` are stored under
 * `scan-sessions/<sessionId>/…` (see `app/api/upload/route.ts`). The
 * desktop side of the flow polls this endpoint every couple of seconds
 * and renders the resulting URLs as thumbnails.
 *
 * The route is intentionally public — anyone with the sessionId can
 * read its images. sessionIds are randomUUIDs so they're effectively
 * unguessable, and the images are throwaway scan captures (not
 * long-lived user documents). If we ever need to harden this we can
 * move to a per-session token model.
 */
export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params

  // Mirror the same charset/length constraints enforced on upload so a
  // weird value can't be used to probe unrelated prefixes.
  const safe = sessionId.replace(/[^a-zA-Z0-9-]/g, "")
  if (safe.length === 0 || safe.length > 100 || safe !== sessionId) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Server is missing BLOB_READ_WRITE_TOKEN. Add it in Vercel project settings and redeploy.",
      },
      { status: 500 }
    )
  }

  try {
    const result = await listBlobs(`scan-sessions/${safe}/`)
    // Stable ordering — newest capture last so the desktop UI shows
    // them in the order they were scanned.
    const images = result.blobs
      .map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt.toISOString(),
      }))
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))

    return NextResponse.json({ images })
  } catch (err) {
    console.error("[scan-session] list failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list images" },
      { status: 500 }
    )
  }
}