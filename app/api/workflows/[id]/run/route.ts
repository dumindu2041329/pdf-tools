import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { runWorkflow, upsertUser } from "@/lib/db"
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // When Inngest is available, run the workflow in the background so the
  // client gets an immediate acknowledgement and transient DB failures
  // are retried by the function. Otherwise run inline as before.
  if (isInngestConfigured()) {
    const sent = await sendEvent("workflow/run.requested", {
      userId,
      workflowId: id,
    })
    if (sent) {
      return NextResponse.json({ ok: true, queued: true })
    }
  }

  await upsertUser(userId)
  await runWorkflow(userId, id)

  return NextResponse.json({ ok: true })
}
