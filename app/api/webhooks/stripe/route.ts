// app/api/webhooks/stripe/route.ts
// Stripe webhook handler — keeps the user's plan in sync with subscription lifecycle events.

import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe"
import { grantPremiumAccess, revokePremiumAccess } from "@/lib/auth"

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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === "subscription") {
          const userId = resolveUserIdFromSession(session)
          if (userId) {
            await grantPremiumAccess(userId)
          } else {
            console.warn(
              "[stripe webhook] checkout.session.completed without userId"
            )
          }
        }
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const userId = resolveUserIdFromSubscription(subscription)
        if (!userId) break

        const status = subscription.status
        const isActive =
          status === "active" ||
          status === "trialing" ||
          status === "past_due"

        if (event.type === "customer.subscription.deleted" || !isActive) {
          await revokePremiumAccess(userId)
        } else if (isActive) {
          await grantPremiumAccess(userId)
        }
        break
      }
      default:
        // Unhandled events are acknowledged to keep Stripe retrying at a minimum.
        break
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
