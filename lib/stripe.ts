// lib/stripe.ts
// Stripe client singleton (server-side only).

import Stripe from "stripe"

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.warn("Missing STRIPE_SECRET_KEY in environment variables.")
}

const globalForStripe = globalThis as unknown as {
  __pdfToolsStripe?: Stripe
}

export const stripe: Stripe =
  globalForStripe.__pdfToolsStripe ??
  new Stripe(STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    typescript: true,
  })

if (process.env.NODE_ENV !== "production") {
  globalForStripe.__pdfToolsStripe = stripe
}

export const STRIPE_PREMIUM_PRICE_ID =
  process.env.STRIPE_PREMIUM_PRICE_ID ?? ""

export const STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET ?? ""
