import { NextResponse } from "next/server"
import {
  deleteFromStorage,
  deleteStoragePrefix,
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
// Sentinel file written by the mobile page when the user taps "Save".
// Its presence is what the desktop poll keys off to auto-navigate
// into the Scan Editor — keeping it as a separate blob (rather than
// stuffing a flag into `_device.json`) means the device-join payload
// and the save-signal payload stay decoupled and each route handler
// stays small.
const SAVED_FILENAME = "_saved.json"

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
    // don't have to filter it themselves. Same treatment for the
    // `_saved.json` sentinel — its mere presence is the signal.
    let device: DeviceInfo | null = null
    let saved = false
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
          const buffer = await downloadFromStorage(url)
          const parsed = JSON.parse(buffer.toString("utf-8")) as DeviceInfo
          if (parsed && typeof parsed.label === "string") {
            device = parsed
          }
        } catch (err) {
          // Device-info blob is best-effort metadata — never fail the
          // whole poll if it can't be parsed.
          console.warn("[scan-session] failed to read device blob:", err)
        }
        continue
      }

      if (leaf === SAVED_FILENAME) {
        saved = true
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

    return NextResponse.json({ images, device, saved })
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

  const { device, saved } = payload as { device?: unknown; saved?: unknown }

  // Two flavors of POST on this endpoint:
  //   1. `{ device }`    — phone/tablet joining the session (records _device.json)
  //   2. `{ saved: true }` — phone/tablet tapped "Save"; we drop a
  //                         `_saved.json` sentinel that the desktop poll
  //                         keys off to auto-navigate into the editor.
  // We handle them as separate branches so the validation stays tight
  // for each (a stray `saved: true` from a misbehaving client can't
  // clobber the device blob and vice-versa).

  if (saved === true) {
    try {
      await uploadToStorage({
        bucket: SCAN_SESSIONS_BUCKET,
        pathname: `${sessionId}/${SAVED_FILENAME}`,
        // Storing a small JSON object (with a timestamp) makes the
        // sentinel self-describing in the Supabase dashboard — handy
        // when debugging "did the mobile actually fire the save
        // signal?" Without the timestamp we'd just see a 2-byte `{}`.
        body: JSON.stringify({ savedAt: new Date().toISOString() }),
        contentType: "application/json",
        upsert: true,
      })
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error("[scan-session] save signal failed:", err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to record save signal" },
        { status: 500 }
      )
    }
  }

  if (!device || typeof device !== "object") {
    return NextResponse.json(
      { error: "Expected `device` payload or `{ saved: true }`" },
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

/**
 * Deletes a single image (or `_device.json`) from a scan session. The
 * Scan Editor page calls this when the user removes a page from the
 * preview list — both the desktop gallery and the editor's local
 * state update on the next poll / refetch.
 *
 * Body: `{ pathname: string }` where `pathname` is the bucket-relative
 * path of the object to delete (e.g. `<sessionId>/IMG_1234.jpg`).
 * The route rejects any pathname that escapes the session's prefix so
 * a caller can't delete an unrelated object by guessing a sessionId.
 */
export async function DELETE(
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

  const { pathname, destroy } = payload as {
    pathname?: unknown
    destroy?: unknown
  }

  // `destroy: true` wipes the entire session: every object under
  // `scan-sessions/<sessionId>/…` plus any nested sub-folders. The
  // Scan Editor triggers this when the user clicks "Process
  // another" so the next visit to /tools/scan-to-pdf starts with a
  // clean storage prefix. In Supabase Storage folders are virtual,
  // so removing every object beneath the prefix removes the folder
  // itself from the dashboard listing.
  if (destroy === true) {
    try {
      const deleted = await deleteStoragePrefix({
        bucket: SCAN_SESSIONS_BUCKET,
        prefix: `${sessionId}/`,
      })
      return NextResponse.json({ ok: true, deleted })
    } catch (err) {
      console.error("[scan-session] destroy failed:", err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to destroy session" },
        { status: 500 }
      )
    }
  }

  if (typeof pathname !== "string" || pathname.length === 0) {
    return NextResponse.json(
      { error: "Missing `pathname` payload" },
      { status: 400 }
    )
  }

  // Strip a leading slash so callers can pass either `<id>/file.jpg`
  // (bucket-relative, what the GET endpoint returns) or `/<id>/file.jpg`.
  const normalized = pathname.replace(/^\/+/, "")

  // Defence-in-depth: only allow deleting objects inside this session's
  // prefix. `..` segments are also blocked to prevent path traversal.
  const expectedPrefix = `${sessionId}/`
  if (
    !normalized.startsWith(expectedPrefix) ||
    normalized.includes("..") ||
    normalized.includes("//")
  ) {
    return NextResponse.json(
      { error: "Pathname is outside this session" },
      { status: 403 }
    )
  }

  // Leaf must be a sane filename (same regex the upload route uses).
  const leaf = normalized.slice(expectedPrefix.length)
  if (leaf.length === 0 || leaf.length > 200 || !/^[a-zA-Z0-9._-]+$/.test(leaf)) {
    return NextResponse.json(
      { error: "Invalid filename" },
      { status: 400 }
    )
  }

  try {
    const url = publicUrlFor(SCAN_SESSIONS_BUCKET, normalized)
    await deleteFromStorage(url)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[scan-session] delete failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete image" },
      { status: 500 }
    )
  }
}
