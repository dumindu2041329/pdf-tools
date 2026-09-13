import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { recordProcessingEvent } from "@/lib/usage"
import { checkGuestLimits, incrementGuestUsage } from "@/lib/guest-usage"
import { getToolBySlug } from "@/lib/tools-config"
import { getClientIp, rateLimitKey, toolLimiter } from "@/lib/ratelimit"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const toolSlug = typeof body.toolSlug === "string" ? body.toolSlug : ""
  const fileName = typeof body.fileName === "string" ? body.fileName : null
  const outputSize = typeof body.outputSize === "number" ? body.outputSize : null

  if (!toolSlug) {
    return NextResponse.json({ error: "toolSlug is required" }, { status: 400 })
  }
  // Only registered tool slugs may be recorded — an arbitrary string
  // would let a caller write junk rows into the usage/analytics tables.
  if (!getToolBySlug(toolSlug)) {
    return NextResponse.json({ error: "Unknown toolSlug" }, { status: 400 })
  }

  const { userId } = await auth()

  // Burst protection — the endpoint is reachable unauthenticated and
  // writes a usage event per call.
  const rl = await toolLimiter.limit(rateLimitKey(userId, getClientIp(req)))
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 }
    )
  }

  if (!userId) {
    // Guest path for the local tools (merge / split / remove-pages /
    // organize-pdf). These never hit /api/tools/[tool] so they aren't
    // caught by the limit check there. Each /api/activity POST
    // represents one client-side processing event, so we apply the
    // same daily/monthly cap and bounce the guest to the sign-up page
    // if they try to exceed it.
    const gate = await checkGuestLimits(1)
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: gate.reason ?? "Processing limit reached",
          upgradeRequired: true,
          redirectToSignUp: true,
        },
        { status: 402 }
      )
    }
    await incrementGuestUsage(1)
  }

  await recordProcessingEvent({
    userId,
    toolSlug,
    status: "success",
    engine: "client",
    inputFilesCount: 1,
    outputFilename: fileName ?? undefined,
    outputSizeBytes: outputSize ?? undefined,
  })

  return NextResponse.json({ ok: true })
}

