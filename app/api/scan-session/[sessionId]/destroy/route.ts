import { NextResponse } from "next/server"
import {
  deleteStoragePrefix,
  isSupabaseStorageConfigured,
  SCAN_SESSIONS_BUCKET,
} from "@/lib/supabase-storage"

export const runtime = "nodejs"

const SAFE_SESSION = /^[a-zA-Z0-9-]{1,100}$/

/**
 * Destroys a scan session. Used by the page-leave `sendBeacon`
 * listener on the desktop / mobile / editor pages — the browser
 * fires `sendBeacon` with a POST body on `pagehide`, so this endpoint
 * accepts POST (not DELETE) to match that constraint.
 *
 * The work is the same as `DELETE` with `destroy: true` on the main
 * `/api/scan-session/[sessionId]` route: recursively remove every
 * object under `scan-sessions/<sessionId>/…` so the virtual folder
 * disappears from the Supabase dashboard listing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params

  if (!SAFE_SESSION.test(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 })
  }

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server is missing Supabase credentials. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and redeploy.",
      },
      { status: 500 }
    )
  }

  // Be permissive about the body: `sendBeacon` sends a Blob with the
  // right content-type, but we only need to confirm the caller asked
  // for a destroy. Some browsers don't send a body at all on beacon.
  let body: { destroy?: unknown } = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    // Empty or malformed body — proceed to destroy since the URL
    // alone identifies the target session.
  }

  if (body.destroy !== true) {
    return NextResponse.json(
      { error: "Expected `destroy: true` in body" },
      { status: 400 }
    )
  }

  try {
    const deleted = await deleteStoragePrefix({
      bucket: SCAN_SESSIONS_BUCKET,
      prefix: `${sessionId}/`,
    })
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error("[scan-session/destroy] failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to destroy session" },
      { status: 500 }
    )
  }
}
