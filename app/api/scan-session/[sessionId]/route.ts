import { NextResponse } from "next/server"
import {
  downloadFromStorage,
  isSupabaseStorageConfigured,
  listStorageObjects,
  SCAN_SESSIONS_BUCKET,
  uploadToStorage,
} from "@/lib/supabase-storage"
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
  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase credentials. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and redeploy.",
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
    // List under `<sessionId>/` (relative to the bucket). The /api/upload
    // route strips the bucket prefix before storing, so files live at
    // `<sessionId>/<filename>` — not `scan-sessions/<sessionId>/<filename>`.
    const prefix = `${sessionId}/`
    const objects = await listStorageObjects({ bucket: SCAN_SESSIONS_BUCKET, prefix })

    // Pull the special device-info blob out of the listing so callers
    // don't have to filter it themselves.
    let device: DeviceInfo | null = null
    const images: Array<{ url: string; pathname: string; uploadedAt: string }> = []

    for (const obj of objects) {
      // Supabase Storage returns `name` as the path RELATIVE to the
      // listed prefix. So `obj.name` is just the leaf filename — we
      // re-attach the prefix to get the full path used by public URLs
      // and download helpers.
      const leaf = obj.name
      const fullPath = `${prefix}${leaf}`
      const url = publicUrlFor(SCAN_SESSIONS_BUCKET, fullPath)

      if (leaf === DEVICE_FILENAME) {
        try {
<<<<<<< HEAD
          const buffer = await downloadFromStorage(url)
          const parsed = JSON.parse(buffer.toString("utf-8")) as DeviceInfo
          if (parsed && typeof parsed.label === "string") {
            device = parsed
=======
          const res = await fetch(`${blob.url}?t=${blob.uploadedAt.getTime()}`, {
            cache: "no-store",
          })
          if (res.ok) {
            const parsed = (await res.json()) as DeviceInfo
            if (parsed && typeof parsed.label === "string") {
              device = parsed
            }
>>>>>>> 8b11c997319b9bc2d2ada88a978ddf0ba5127f98
          }
        } catch (err) {
          // Device-info blob is best-effort metadata — never fail the
          // whole poll if it can't be parsed.
          console.warn("[scan-session] failed to read device blob:", err)
        }
        continue
      }

      images.push({
        url,
        pathname: fullPath,
        uploadedAt: (obj.updated_at ?? obj.created_at ?? new Date().toISOString()),
      })
    }

    // Stable ordering — oldest capture first so the desktop UI shows
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
 * blob with the latest info. We store as a regular object in the
 * Supabase bucket rather than in-memory so the desktop poll can read
 * it across serverless cold starts.
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
    // `pathname` is relative to the bucket (Supabase Storage convention).
    await uploadToStorage({
      bucket: SCAN_SESSIONS_BUCKET,
      pathname: `${sessionId}/${DEVICE_FILENAME}`,
      body: JSON.stringify(sanitized),
      contentType: "application/json",
      upsert: true,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[scan-session] join failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record device" },
      { status: 500 }
    )
  }
}
<<<<<<< HEAD

/**
 * Builds the public URL of an object. The Supabase SDK exposes
 * `getPublicUrl()` but we already have the bucket + path; using the
 * project URL keeps the helper pure (no extra SDK call per list
 * item).
 */
function publicUrlFor(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) {
    // `ensureToken()` already guards against this for the happy path;
    // this fallback exists so a misconfigured server still returns a
    // syntactically valid URL rather than throwing mid-list.
    return ""
  }
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}
=======
>>>>>>> 8b11c997319b9bc2d2ada88a978ddf0ba5127f98
