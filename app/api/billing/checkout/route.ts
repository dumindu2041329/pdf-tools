// app/api/billing/checkout/route.ts
// Creates a Stripe Checkout Session for the Premium plan and returns its URL.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  stripe,
  STRIPE_PREMIUM_PRICE_ID,
} from "@/lib/stripe"

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!STRIPE_PREMIUM_PRICE_ID) {
    return NextResponse.json(
      { error: "Stripe price ID is not configured." },
      { status: 500 }
    )
  }

  const appUrl = getAppUrl()
  const successUrl = `${appUrl}/account/billing?success=true&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${appUrl}/account/billing?canceled=true`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
      client_reference_id: userId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: { userId, plan: "premium" },
      subscription_data: {
        metadata: { userId, plan: "premium" },
      },
    })

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session." },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error("[billing/checkout] Stripe error:", err)
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 500 }
    )
  }
}
