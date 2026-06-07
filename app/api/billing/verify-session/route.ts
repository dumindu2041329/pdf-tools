// app/api/billing/verify-session/route.ts
// Verifies a completed Stripe Checkout Session and grants premium access on success.

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { grantPremiumAccess } from "@/lib/auth"

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sessionId =
    typeof body === "object" && body !== null && "sessionId" in body
      ? (body as { sessionId?: unknown }).sessionId
      : undefined

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    )
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.client_reference_id !== userId) {
      return NextResponse.json(
        { error: "Session does not belong to the current user." },
        { status: 403 }
      )
    }

    const paid =
      session.payment_status === "paid" ||
      session.status === "complete"

    if (!paid) {
      return NextResponse.json(
        { error: "Payment not completed.", status: session.status },
        { status: 402 }
      )
    }

    await grantPremiumAccess(userId)

    return NextResponse.json({ success: true, plan: "premium" })
  } catch (err) {
    console.error("[billing/verify-session] error:", err)
    return NextResponse.json(
      { error: "Failed to verify session." },
      { status: 500 }
    )
  }
}
