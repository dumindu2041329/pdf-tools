// app/api/inngest/route.ts
// Inngest's durable-execution endpoint. The Inngest cloud calls this
// route once per function step; each individual request stays well
// within Vercel's timeout window even when the overall job spans
// minutes. Register any new Inngest function here.

import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { processToolJob } from "@/lib/inngest/functions/tool-processing"
import { handleStripeEvent } from "@/lib/inngest/functions/stripe-events"
import { runWorkflowJob } from "@/lib/inngest/functions/workflow-run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const handlers = serve({
  client: inngest,
  functions: [processToolJob, handleStripeEvent, runWorkflowJob],
})

/**
 * Fail closed when the signing key is absent in production. `serve()`
 * authenticates incoming requests with `INNGEST_SIGNING_KEY`; without it
 * the SDK's verification behaviour is version-dependent, and an
 * unauthenticated `/api/inngest` would let anyone invoke our functions
 * (driving paid Adobe / iLoveAPI work, or replaying Stripe handling).
 * Outside production we leave the Inngest dev-server workflow intact.
 */
function withSignatureGuard(
  handler: (typeof handlers)["GET"]
): (typeof handlers)["GET"] {
  return async (request, context) => {
    if (process.env.NODE_ENV === "production" && !process.env.INNGEST_SIGNING_KEY) {
      console.error(
        "[inngest] INNGEST_SIGNING_KEY is not set — refusing to serve /api/inngest in production."
      )
      return new Response("Inngest is not configured", { status: 503 })
    }
    return handler(request, context)
  }
}

export const GET = withSignatureGuard(handlers.GET)
export const POST = withSignatureGuard(handlers.POST)
export const PUT = withSignatureGuard(handlers.PUT)
