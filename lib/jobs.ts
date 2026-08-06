// lib/jobs.ts
// Async job records for the background-processing pipeline.
//
// Job status lives as a small JSON object in Supabase Storage
// (`jobs/<jobId>/status.json`), the same proven pattern the scan-session
// flow uses for `_device.json` / `_saved.json` sentinels. This needs no
// database migration — Supabase owns the schema in this project — and
// the bucket is already public + writable via the service-role client.
//
// Results produced by jobs are stored under `results/<jobId>/…`.

import { randomUUID } from "crypto"
import { getSupabaseServer } from "@/lib/supabase"
import {
  deleteStoragePrefix,
  downloadFromStorage,
  isSupabaseStorageConfigured,
  PDF_UPLOADS_BUCKET,
  uploadToStorage,
} from "@/lib/supabase-storage"

export const RESULTS_BUCKET = PDF_UPLOADS_BUCKET

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"

export interface JobRecord {
  jobId: string
  userId: string | null
  toolSlug: string
  status: JobStatus
  resultUrl?: string
  filename?: string
  outputSize?: number
  error?: string
  createdAt: string
  updatedAt: string
}

function jobStatusPath(jobId: string): string {
  return `jobs/${jobId}/status.json`
}

function jobPublicUrl(jobId: string): string {
  const supabase = getSupabaseServer()
  const { data } = supabase.storage
    .from(RESULTS_BUCKET)
    .getPublicUrl(jobStatusPath(jobId))
  return data.publicUrl
}

export function newJobId(): string {
  return randomUUID()
}

export async function createJob(input: {
  jobId: string
  userId: string | null
  toolSlug: string
}): Promise<void> {
  const now = new Date().toISOString()
  await uploadToStorage({
    bucket: RESULTS_BUCKET,
    pathname: jobStatusPath(input.jobId),
    body: JSON.stringify({
      ...input,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    } satisfies JobRecord),
    contentType: "application/json",
    upsert: true,
  })
}

export async function updateJob(
  jobId: string,
  patch: Partial<Omit<JobRecord, "jobId" | "userId" | "toolSlug" | "createdAt">>
): Promise<void> {
  const current = await getJob(jobId)
  if (!current) return
  await uploadToStorage({
    bucket: RESULTS_BUCKET,
    pathname: jobStatusPath(jobId),
    body: JSON.stringify({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    } satisfies JobRecord),
    contentType: "application/json",
    upsert: true,
  })
}

/**
 * Reads the job record, or null when it doesn't exist (storage not
 * configured, job never created, or already cleaned up).
 */
export async function getJob(jobId: string): Promise<JobRecord | null> {
  if (!isSupabaseStorageConfigured()) return null
  try {
    // Cache-buster: public Storage URLs can be CDN-cached, and the
    // client polls this every couple of seconds.
    const buf = await downloadFromStorage(
      `${jobPublicUrl(jobId)}?t=${Date.now()}`
    )
    const parsed = JSON.parse(buf.toString("utf-8")) as Partial<JobRecord>
    if (typeof parsed.jobId !== "string" || parsed.jobId.length === 0) {
      return null
    }
    return parsed as JobRecord
  } catch {
    return null
  }
}

/** Deletes the job record (used when a job is cancelled/cleaned up). */
export async function deleteJob(jobId: string): Promise<void> {
  try {
    await deleteStoragePrefix({
      bucket: RESULTS_BUCKET,
      prefix: `jobs/${jobId}/`,
    })
  } catch (err) {
    console.warn(`[jobs] deleteJob failed for ${jobId}:`, err)
  }
}
