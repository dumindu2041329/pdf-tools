// lib/inngest/functions/stripe-events.ts
// Applies Stripe subscription lifecycle events to the user's plan.
//
// The webhook route verifies the signature, extracts the minimal event
// data, and forwards it here (idempotent via `event.id`) so the route
// can acknowledge Stripe immediately. Retries + durability come from
// Inngest instead of Stripe's redelivery window.
//
// `applyStripeEventData` is exported so the webhook route can run the
// same logic inline when Inngest isn't configured.

import { inngest } from "@/lib/inngest/client"
import { grantPremiumAccess, revokePremiumAccess } from "@/lib/auth"

export interface StripeEventData {
  eventType: string
  userId?: string | null
  sessionMode?: string
  subscriptionStatus?: string
}

export async function applyStripeEventData(data: StripeEventData): Promise<void> {
  switch (data.eventType) {
    case "checkout.session.completed": {
      if (data.sessionMode === "subscription" && data.userId) {
        await grantPremiumAccess(data.userId)
      }
      break
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!data.userId) break
      const isActive =
        data.subscriptionStatus === "active" ||
        data.subscriptionStatus === "trialing" ||
        data.subscriptionStatus === "past_due"
      if (data.eventType === "customer.subscription.deleted" || !isActive) {
        await revokePremiumAccess(data.userId)
      } else {
        await grantPremiumAccess(data.userId)
      }
      break
    }
    default:
      // Unhandled events are acknowledged to keep Stripe retrying at a minimum.
      break
  }
}

export const handleStripeEvent = inngest.createFunction(
  {
    id: "handle-stripe-event",
    retries: 3,
    triggers: { event: "stripe/event.received" },
  },
  async ({ event }) => {
    const data = event.data as unknown as StripeEventData
    await applyStripeEventData(data)
  }
)
