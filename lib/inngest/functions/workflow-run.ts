// lib/inngest/functions/workflow-run.ts
// Executes a saved workflow's steps in the background.
//
// The RPC that actually runs the workflow (`pdf_tools_run_workflow`) is
// fast, but moving it out of the request/response cycle means the run
// route can acknowledge immediately, and Inngest retries transient DB
// failures instead of the client.

import { inngest } from "@/lib/inngest/client"
import { runWorkflow } from "@/lib/db"

export interface WorkflowRunData {
  userId: string
  workflowId: string
}

export const runWorkflowJob = inngest.createFunction(
  {
    id: "run-workflow-job",
    retries: 2,
    triggers: { event: "workflow/run.requested" },
  },
  async ({ event }) => {
    const { userId, workflowId } = event.data as unknown as WorkflowRunData
    await runWorkflow(userId, workflowId)
  }
)
