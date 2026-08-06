// app/api/jobs/[jobId]/route.ts
// Job status endpoint for the background-processing pipeline.
//
// GET  — returns the job record the client polls while the Inngest
//        function processes the job.
// DELETE — cancels the job: clears the record (the client stops
//        polling; the Inngest function still cleans up its source
//        blobs on completion).

import { NextResponse } from "next/server"
import { getJob, updateJob } from "@/lib/jobs"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 })
  }
  const job = await getJob(jobId)
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }
  return NextResponse.json(job)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 })
  }
  // Mark the job cancelled rather than removing the record: the Inngest
  // function's complete step checks for this status and skips publishing
  // a result, so a cancelled job can't be resurrected as "completed".
  await updateJob(jobId, { status: "cancelled" }).catch(() => {})
  return NextResponse.json({ ok: true })
}
