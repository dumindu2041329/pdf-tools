// lib/inngest/client.ts
// Inngest client singleton + helpers.
//
// Inngest runs background jobs (webhook processing, long PDF tasks) as
// durable, retried functions. On Vercel each function step is invoked as
// its own HTTP request to /api/inngest, so no single request ever needs
// to outlive the serverless timeout window.
//
// Graceful degradation: when the Inngest keys aren't configured in
// production, `isInngestConfigured()` returns false and callers fall
// back to their synchronous paths — the app keeps working untouched.

import { Inngest } from "inngest"

export const inngest = new Inngest({ id: "pdf-tools" })

/**
 * True when Inngest events can actually be delivered. In development the
 * Inngest dev server accepts events with no keys; in production BOTH
 * keys must be set — serve() authenticates the /api/inngest endpoint
 * with the signing key, and send() needs the event key.
 */
export function isInngestConfigured(): boolean {
  if (process.env.NODE_ENV !== "production") return true
  return Boolean(
    process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_EVENT_KEY
  )
}

/**
 * Fire an Inngest event. Returns false (without throwing) when Inngest
 * isn't configured or the send fails, so callers can fall back.
 *
 * `id` provides idempotency — Inngest ignores duplicates with the same
 * id, which is exactly what Stripe webhook redeliveries need.
 */
export async function sendEvent(
  name: string,
  data: Record<string, unknown>,
  id?: string
): Promise<boolean> {
  if (!isInngestConfigured()) return false
  try {
    await inngest.send({
      name,
      data,
      ...(id ? { id } : {}),
    })
    return true
  } catch (err) {
    console.error(`[inngest] failed to send ${name}:`, err)
    return false
  }
}
