import { sql, ensureDbSchema, upsertUser } from "@/lib/db"
import { getUserPlan } from "@/lib/auth"
import type { UserPlan } from "@/lib/auth"
import { getLimitsForPlan } from "@/lib/usageLimits"
import type { UsageLimits } from "@/lib/usageLimits"

function firstRow(rows: unknown): Record<string, unknown> | null {
  if (!Array.isArray(rows)) return null
  const row = rows[0]
  if (typeof row !== "object" || row === null) return null
  return row as Record<string, unknown>
}

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? Math.trunc(n) : 0
  }
  return 0
}

export async function canProcessFile(
  userId: string,
  fileSizeBytes: number,
  plan = "free",
  filesToProcess = 1
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getLimitsForPlan(plan)
  const fileSizeMB = fileSizeBytes / (1024 * 1024)

  if (fileSizeMB > limits.maxFileSizeMB) {
    return {
      allowed: false,
      reason: `File exceeds ${limits.maxFileSizeMB} MB limit for your plan`,
    }
  }

  await ensureDbSchema()
  await upsertUser(userId)

  const rows = (await sql`
    SELECT
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN input_files_count ELSE 0 END), 0)::int AS files_today,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN input_files_count ELSE 0 END), 0)::int AS files_month
    FROM processing_event
    WHERE user_id = ${userId}
      AND status = 'success'
      AND created_at >= date_trunc('month', now())
  `) as unknown

  const row = firstRow(rows)
  const filesProcessedToday = toInt(row?.files_today)
  const filesProcessedThisMonth = toInt(row?.files_month)

  if (filesProcessedToday + filesToProcess > limits.daily) {
    return { allowed: false, reason: "Daily processing limit reached" }
  }
  if (filesProcessedThisMonth + filesToProcess > limits.monthly) {
    return { allowed: false, reason: "Monthly processing limit reached" }
  }

  return { allowed: true }
}

export async function recordProcessingEvent(input: {
  userId: string | null
  toolSlug: string
  status: "success" | "error"
  engine?: string
  inputFilesCount?: number
  outputFilename?: string
  outputSizeBytes?: number
  processingTimeMs?: number
  errorMessage?: string
}): Promise<string> {
  await ensureDbSchema()
  if (input.userId) {
    await upsertUser(input.userId)
  }

  const rows = (await sql`
    INSERT INTO processing_event (
      user_id,
      tool_slug,
      status,
      engine,
      input_files_count,
      output_filename,
      output_size_bytes,
      processing_time_ms,
      error_message
    )
    VALUES (
      ${input.userId},
      ${input.toolSlug},
      ${input.status},
      ${input.engine ?? null},
      ${input.inputFilesCount ?? 1},
      ${input.outputFilename ?? null},
      ${input.outputSizeBytes ?? null},
      ${input.processingTimeMs ?? null},
      ${input.errorMessage ?? null}
    )
    RETURNING id::text AS id
  `) as unknown

  const id = firstRow(rows)?.id
  if (!id) {
    throw new Error("Failed to record processing event")
  }
  return String(id)
}

export async function getUsageStats(userId: string): Promise<{
  filesProcessedToday: number
  filesProcessedThisMonth: number
  subscriptionPlan: UserPlan
  limits: UsageLimits
}> {
  await ensureDbSchema()
  await upsertUser(userId)

  const subscriptionPlan = await getUserPlan(userId)
  const limits = getLimitsForPlan(subscriptionPlan)

  const rows = (await sql`
    SELECT
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN input_files_count ELSE 0 END), 0)::int AS files_today,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN input_files_count ELSE 0 END), 0)::int AS files_month
    FROM processing_event
    WHERE user_id = ${userId}
      AND status = 'success'
      AND created_at >= date_trunc('month', now())
  `) as unknown

  const row = firstRow(rows)

  return {
    filesProcessedToday: toInt(row?.files_today),
    filesProcessedThisMonth: toInt(row?.files_month),
    subscriptionPlan,
    limits,
  }
}
