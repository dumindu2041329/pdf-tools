// app/api/webhooks/iloveapi/route.ts
// iLovePDF task webhooks.
//
// When a job runs in webhook mode (see lib/iloveapi/webhook.ts), iLovePDF
// POSTs here once per completed/failed task. This handler:
//   1. rate-limits + best-effort HMAC-validates the request,
//   2. downloads the finished file from iLovePDF and stores it in
//      Supabase Storage (`results/<jobId>/<filename>`),
//   3. forwards the outcome to Inngest as an `iloveapi/task.completed`
//      event so the waiting `step.waitForEvent` can resume.
//
// iLovePDF calls with `task.completed` for success and `task.failed` for
// errors (some dashboards list the failure event as `task.fail` — both are
// accepted here).
//
// Without Inngest configured it degrades to recording the usage event
// directly, so the webhook still does something useful standalone.

import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { downloadTaskResult } from "@/lib/iloveapi/webhook"
import { getClientIp, webhookLimiter } from "@/lib/ratelimit"
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client"
import { recordProcessingEvent } from "@/lib/usage"
import {
  PDF_UPLOADS_BUCKET,
  uploadToStorage,
} from "@/lib/supabase-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return cleaned.length > 0 ? cleaned : "output.pdf"
}

// Ids are used to build Storage keys, so restrict them to a safe charset
// (matches the shape of `newJobId()` UUIDs and iLovePDF task ids).
const JOB_ID_RE = /^[a-zA-Z0-9-]{1,100}$/
const TASK_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/

/**
 * Webhook signature check.
 *
 * When `ILOVEAPI_WEBHOOK_SECRET` is configured we verify a hex
 * HMAC-SHA256 of the raw body provided in the `x-ilovepdf-signature`
 * header. Without a secret the check FAILS CLOSED in production: an
 * unsigned webhook is a forgeable one (it can be used to make the server
 * download attacker-chosen "task results" into our bucket), so we refuse
 * it rather than silently accepting it.
 *
 * Operators who run iLovePDF webhooks in an environment where the
 * provider does not (yet) sign them can acknowledge the risk explicitly
 * with `ILOVEAPI_WEBHOOK_ALLOW_UNSIGNED=true`. Development builds keep
 * working without the flag.
 */
function verifySignature(rawBody: string, req: Request): boolean {
  const secret = process.env.ILOVEAPI_WEBHOOK_SECRET
  if (!secret) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ILOVEAPI_WEBHOOK_ALLOW_UNSIGNED !== "true"
    ) {
      console.error(
        "[iLoveAPI Webhook] ILOVEAPI_WEBHOOK_SECRET is not set — rejecting unsigned webhook. " +
          "Set the secret (or explicitly opt out with ILOVEAPI_WEBHOOK_ALLOW_UNSIGNED=true)."
      )
      return false
    }
    return true
  }
  const signature = req.headers.get("x-ilovepdf-signature")
  if (!signature) return false
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected, "utf-8")
  const b = Buffer.from(signature, "utf-8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const rl = await webhookLimiter.limit(getClientIp(req))
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const url = new URL(req.url)
  const jobId = url.searchParams.get("jobId")

  const rawBody = await req.text()
  if (!verifySignature(rawBody, req)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let body: { event?: unknown; data?: unknown }
  try {
    body = JSON.parse(rawBody) as { event?: unknown; data?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const event = typeof body.event === "string" ? body.event : ""
  const data =
    typeof body.data === "object" && body.data !== null
      ? (body.data as Record<string, unknown>)
      : {}
  const task =
    typeof data.task === "object" && data.task !== null
      ? (data.task as Record<string, unknown>)
      : {}

  const taskId = typeof task.task === "string" ? task.task : ""
  const server = typeof task.server === "string" ? task.server : ""
  const tool = typeof task.tool === "string" ? task.tool : ""

  // Both ids are interpolated into Storage keys (`results/<jobId>/…`)
  // and the iLovePDF download path. The body is HMAC-signed, but the
  // `jobId` query param is NOT part of the signed payload, so it is
  // attacker-mutable on a replayed body — validate both before use.
  if (taskId && !TASK_ID_RE.test(taskId)) {
    return NextResponse.json({ error: "Invalid taskId" }, { status: 400 })
  }
  if (jobId && !JOB_ID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 })
  }

  try {
    if (event === "task.completed" && taskId && server) {
      const result = await downloadTaskResult(taskId, server)

      const webhookFilename =
        typeof task.download_filename === "string" && task.download_filename
          ? task.download_filename
          : undefined
      const filename = safeFilename(webhookFilename ?? result.filename ?? "output.pdf")

      // Prefix with the task id: multi-file jobs fire one callback per
      // file, and iLovePDF's `download_filename` is usually "output.pdf"
      // for every one — without the prefix they'd all overwrite each
      // other in the same storage path.
      const stored = await uploadToStorage({
        bucket: PDF_UPLOADS_BUCKET,
        pathname: `results/${jobId ?? taskId}/${taskId}-${filename}`,
        body: result.buffer,
        contentType: result.contentType,
        upsert: true,
      })

      const outputSize = Number(task.output_filesize) || result.buffer.byteLength
      const timer = typeof task.timer === "number" ? task.timer : undefined

      if (isInngestConfigured()) {
        // Resume the waiting Inngest step with the stored result URL.
        await sendEvent(
          "iloveapi/task.completed",
          {
            taskId,
            jobId: jobId ?? null,
            server,
            tool,
            url: stored.url,
            filename,
            size: outputSize,
            processingTimeMs:
              timer !== undefined ? Math.round(timer * 1000) : undefined,
          },
          `iloveapi-${taskId}`
        )
      } else {
        // Standalone mode (no Inngest): record the usage event here so
        // the activity feed still sees the success.
        await recordProcessingEvent({
          userId: null,
          toolSlug: tool,
          status: "success",
          engine: "iloveapi",
          inputFilesCount: 1,
          outputFilename: filename,
          outputSizeBytes: outputSize,
          processingTimeMs: timer !== undefined ? Math.round(timer * 1000) : undefined,
        })
      }
    } else if (event === "task.failed" || event === "task.fail") {
      console.log("[iLoveAPI Webhook] Task failed:", data?.task)
      if (isInngestConfigured() && taskId) {
        await sendEvent(
          "iloveapi/task.completed",
          {
            taskId,
            jobId: jobId ?? null,
            server,
            tool,
            error:
              typeof task.status_message === "string"
                ? task.status_message
                : "iLoveAPI task failed",
          },
          `iloveapi-${taskId}`
        )
      }
    } else if (event === "signature.completed" || event === "signature.declined") {
      const signature =
        typeof data.signature === "object" && data.signature !== null
          ? (data.signature as Record<string, unknown>)
          : {}
      console.log(`[iLoveAPI Webhook] ${event}:`, signature?.uuid)
    } else {
      console.log("[iLoveAPI Webhook] Unhandled event:", event)
    }
  } catch (err) {
    console.error("[iLoveAPI Webhook] handler error:", err)
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 })
  }

  return new NextResponse("OK", { status: 200 })
}
