// app/api/webhooks/stripe/route.ts
// Stripe webhook handler — keeps the user's plan in sync with
// subscription lifecycle events.
//
// Signature is verified here; the actual plan change is applied by the
// Inngest function (`handleStripeEvent`) so the route can acknowledge
// Stripe immediately instead of holding the function open for DB writes.
// The event is idempotent via `event.id` (Stripe redelivers webhooks, so
// this prevents double-applying a plan change).
//
// When Inngest isn't configured, the same logic runs inline so the
// billing flow keeps working untouched.

import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe"
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client"
import {
  applyStripeEventData,
  type StripeEventData,
} from "@/lib/inngest/functions/stripe-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function resolveUserIdFromSession(
  session: Stripe.Checkout.Session
): string | null {
  if (session.client_reference_id) return session.client_reference_id
  const meta = session.metadata?.userId
  if (typeof meta === "string" && meta.length > 0) return meta
  return null
}

function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  const meta = subscription.metadata?.userId
  if (typeof meta === "string" && meta.length > 0) return meta
  return null
}

function extractEventData(event: Stripe.Event): StripeEventData {
  const data: StripeEventData = { eventType: event.type }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    data.sessionMode = session.mode ?? undefined
    data.userId = resolveUserIdFromSession(session)
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription
    data.subscriptionStatus = subscription.status
    data.userId = resolveUserIdFromSubscription(subscription)
  }

  return data
}

export async function POST(req: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 500 }
    )
  }

  const signature = req.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    )
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err)
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    )
  }

  const data = extractEventData(event)

  try {
    if (isInngestConfigured()) {
      // Acknowledge Stripe immediately; the Inngest function applies the
      // plan change with retries. `event.id` dedupes redeliveries.
      const sent = await sendEvent(
        "stripe/event.received",
        data as unknown as Record<string, unknown>,
        event.id
      )
      if (!sent) {
        // Send failed for a non-config reason — apply inline so the plan
        // change isn't lost.
        await applyStripeEventData(data)
      }
    } else {
      await applyStripeEventData(data)
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err)
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true })
}
