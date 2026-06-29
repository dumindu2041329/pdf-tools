import { NextResponse } from "next/server"
import { listBlobs } from "@/lib/blob-storage"
import { put } from "@vercel/blob"
import type { DeviceInfo } from "@/lib/device-info"

/**
 * Lists the scanned images (and joined device) that belong to a
 * Scan-to-PDF session.
 *
 * Mobile captures uploaded through `/api/upload` are stored under
 * `scan-sessions/<sessionId>/…` (see `app/api/upload/route.ts`). When
 * the mobile page first mounts it POSTs the phone's coarse device
 * info, which we persist as `_device.json` under the same prefix.
 * The desktop side of the flow polls this endpoint every couple of
 * seconds and renders the resulting URLs as thumbnails + the device
 * label as the "connected device" badge.
 *
 * The route is intentionally public — anyone with the sessionId can
 * read its images. sessionIds are randomUUIDs so they're effectively
 * unguessable, and the images are throwaway scan captures (not
 * long-lived user documents). If we ever need to harden this we can
 * move to a per-session token model.
 */
export const runtime = "nodejs"

const DEVICE_FILENAME = "_device.json"

function isValidSessionId(id: string): boolean {
  return /^[a-zA-Z0-9-]{1,100}$/.test(id)
}

function ensureToken(): NextResponse | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Server is missing BLOB_READ_WRITE_TOKEN. Add it in Vercel project settings and redeploy.",
      },
      { status: 500 }
    )
  }
  return null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 })
  }

  const tokenError = ensureToken()
  if (tokenError) return tokenError

  try {
    const result = await listBlobs(`scan-sessions/${sessionId}/`)

    // Pull the special device-info blob out of the listing so callers
    // don't have to filter it themselves.
    let device: DeviceInfo | null = null
    const images = []
    for (const blob of result.blobs) {
      if (blob.pathname.endsWith(`/${DEVICE_FILENAME}`)) {
        try {
          const res = await fetch(`${blob.url}?t=${blob.uploadedAt.getTime()}`, {
            cache: "no-store",
          })
          if (res.ok) {
            const parsed = (await res.json()) as DeviceInfo
            if (parsed && typeof parsed.label === "string") {
              device = parsed
            }
          }
        } catch (err) {
          // Device-info blob is best-effort metadata — never fail the
          // whole poll if it can't be parsed.
          console.warn("[scan-session] failed to read device blob:", err)
        }
        continue
      }
      images.push({
        url: blob.url,
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt.toISOString(),
      })
    }

    // Stable ordering — newest capture last so the desktop UI shows
    // them in the order they were scanned.
    images.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))

    return NextResponse.json({ images, device })
  } catch (err) {
    console.error("[scan-session] list failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list images" },
      { status: 500 }
    )
  }
}

/**
 * Records the phone that just joined this scan session. Idempotent —
 * re-joining (e.g. refreshing the mobile page) overwrites the device
 * blob with the latest info. We store as a regular Vercel Blob rather
 * than in-memory so the desktop poll can read it across serverless
 * cold starts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 })
  }

  const tokenError = ensureToken()
  if (tokenError) return tokenError

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 })
  }

  const { device } = payload as { device?: unknown }
  if (!device || typeof device !== "object") {
    return NextResponse.json(
      { error: "Missing `device` payload" },
      { status: 400 }
    )
  }

  const d = device as Partial<DeviceInfo>
  if (
    typeof d.label !== "string" ||
    typeof d.os !== "string" ||
    typeof d.browser !== "string" ||
    !["mobile", "tablet", "desktop"].includes(d.type as string)
  ) {
    return NextResponse.json(
      { error: "Invalid device payload" },
      { status: 400 }
    )
  }

  const sanitized: DeviceInfo = {
    type: d.type as DeviceInfo["type"],
    os: d.os.slice(0, 60),
    browser: d.browser.slice(0, 60),
    label: d.label.slice(0, 120),
  }

  try {
    await put(
      `scan-sessions/${sessionId}/${DEVICE_FILENAME}`,
      JSON.stringify(sanitized),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
      }
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[scan-session] join failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record device" },
      { status: 500 }
    )
  }
}
