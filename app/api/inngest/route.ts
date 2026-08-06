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

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processToolJob, handleStripeEvent, runWorkflowJob],
})
