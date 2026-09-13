// app/api/jobs/[jobId]/route.ts
// Job status endpoint for the background-processing pipeline.
//
// GET  — returns the job record the client polls while the Inngest
//        function processes the job.
// DELETE — cancels the job: clears the record (the client stops
//        polling; the Inngest function still cleans up its source
//        blobs on completion).

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getJob, updateJob, type JobRecord } from "@/lib/jobs"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * A job created while signed in belongs to that user only. Guest jobs
 * (`userId === null`) have no account to key on, so their unguessable
 * UUID job id acts as a bearer capability — the guest is the only party
 * that ever saw it.
 */
function canAccessJob(job: JobRecord, userId: string | null): boolean {
  if (job.userId) return job.userId === userId
  return true
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 })
  }
  const { userId } = await auth()
  const job = await getJob(jobId)
  // Return 404 (not 403) for jobs the caller doesn't own so the endpoint
  // doesn't confirm the existence of another user's job.
  if (!job || !canAccessJob(job, userId)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }
  // Never expose the owner's Clerk id to the client — return an explicit
  // projection of the fields the polling client actually needs.
  return NextResponse.json({
    jobId: job.jobId,
    toolSlug: job.toolSlug,
    status: job.status,
    resultUrl: job.resultUrl,
    filename: job.filename,
    outputSize: job.outputSize,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 })
  }
  const { userId } = await auth()
  const job = await getJob(jobId)
  if (!job || !canAccessJob(job, userId)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }
  // Mark the job cancelled rather than removing the record: the Inngest
  // function's complete step checks for this status and skips publishing
  // a result, so a cancelled job can't be resurrected as "completed".
  await updateJob(jobId, { status: "cancelled" }).catch(() => {})
  return NextResponse.json({ ok: true })
}
