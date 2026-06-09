import {
  ensureDbSchema,
  ensureDbSchemaIfStale,
  isMissingRelationError,
  resetSchemaInit,
  sql,
  upsertUser,
} from "@/lib/db"
import { getUserPlan } from "@/lib/auth"
import type { UserPlan } from "@/lib/auth"
import { getLimitsForPlan } from "@/lib/usageLimits"
import type { UsageLimits } from "@/lib/usageLimits"

export interface ProcessingEventInput {
  userId: string | null
  toolSlug: string
  status: "success" | "error"
  engine?: string
  inputFilesCount?: number
  outputFilename?: string
  outputSizeBytes?: number
  processingTimeMs?: number
  errorMessage?: string
}

export interface UsageStats {
  filesProcessedToday: number
  filesProcessedThisMonth: number
  subscriptionPlan: UserPlan
  limits: UsageLimits
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

interface CounterCounts {
  daily: number
  monthly: number
}

/**
 * Fast O(1) read from the denormalized usage_counter table.
 * Returns 0s if no row exists (new user) — the counter is created on the
 * first successful processing event.
 */
async function readCounterCounts(userId: string): Promise<CounterCounts> {
  try {
    await ensureDbSchema()
    const rows = (await sql`
      SELECT
        CASE
          WHEN daily_date = (now() AT TIME ZONE 'UTC')::date THEN daily_count
          ELSE 0
        END AS daily,
        CASE
          WHEN monthly_year_month = to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM') THEN monthly_count
          ELSE 0
        END AS monthly
      FROM usage_counter
      WHERE user_id = ${userId}
      LIMIT 1
    `) as Array<{ daily: number | string; monthly: number | string }>

    if (rows.length === 0) {
      return { daily: 0, monthly: 0 }
    }
    return {
      daily: asCount(rows[0].daily),
      monthly: asCount(rows[0].monthly),
    }
  } catch (err) {
    console.error("[usage] failed to read counter:", err)
    return { daily: 0, monthly: 0 }
  }
}

export async function canProcessFile(
  userId: string,
  fileSizeBytes: number,
  plan = "free"
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getLimitsForPlan(plan)
  const fileSizeMB = fileSizeBytes / (1024 * 1024)

  if (fileSizeMB > limits.maxFileSizeMB) {
    return {
      allowed: false,
      reason: `File exceeds ${limits.maxFileSizeMB} MB limit for your plan`,
    }
  }

  // Fast path: read denormalized counters (single row lookup, O(1))
  const { daily, monthly } = await readCounterCounts(userId)

  if (limits.daily > 0 && daily >= limits.daily) {
    return {
      allowed: false,
      reason: "You've reached your daily processing limit.",
    }
  }

  if (limits.monthly > 0 && monthly >= limits.monthly) {
    return {
      allowed: false,
      reason: "You've reached your monthly processing limit.",
    }
  }

  return { allowed: true }
}

export async function recordProcessingEvent(
  input: ProcessingEventInput
): Promise<string> {
  if (!input.userId) return ""

  // Fire-and-forget proactive self-heal: at most once per hour per server
  // instance, checks that ALL expected tables (app_user, workflow,
  // workflow_step, usage_counter) still exist. If any are missing,
  // triggers a schema re-init so the next call can write successfully.
  ensureDbSchemaIfStale()

  try {
    await ensureDbSchema()
    await upsertUser(input.userId)

    // Upsert the denormalized counter (only successful events count;
    // resets automatically when daily_date / monthly_year_month change).
    // All date math uses explicit UTC to stay correct regardless of session timezone.
    if (input.status === "success") {
      await sql`
        INSERT INTO usage_counter (user_id, daily_count, daily_date, monthly_count, monthly_year_month, updated_at)
        VALUES (
          ${input.userId},
          1,
          (now() AT TIME ZONE 'UTC')::date,
          1,
          to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM'),
          now()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          daily_count = CASE
            WHEN usage_counter.daily_date = (now() AT TIME ZONE 'UTC')::date
            THEN usage_counter.daily_count + 1
            ELSE 1
          END,
          daily_date = (now() AT TIME ZONE 'UTC')::date,
          monthly_count = CASE
            WHEN usage_counter.monthly_year_month = to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM')
            THEN usage_counter.monthly_count + 1
            ELSE 1
          END,
          monthly_year_month = to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM'),
          updated_at = now()
      `
    }

    return input.toolSlug
  } catch (err) {
    // If usage_counter is missing (e.g. it was dropped externally), the
    // cached schema-init promise is still resolved, so the DDL never re-ran.
    // Reset it and retry once: the next ensureDbSchema() will recreate it.
    if (isMissingRelationError(err)) {
      console.warn(
        "[usage] missing relation detected, re-initialising schema and retrying"
      )
      resetSchemaInit()
      try {
        return await recordProcessingEvent(input)
      } catch (retryErr) {
        console.error("[usage] failed to record event (retry):", retryErr)
        return ""
      }
    }
    console.error("[usage] failed to record event:", err)
    return ""
  }
}

export async function getUsageStats(userId: string): Promise<UsageStats> {
  const subscriptionPlan = await getUserPlan(userId)
  const limits = getLimitsForPlan(subscriptionPlan)

  const { daily, monthly } = await readCounterCounts(userId)

  return {
    filesProcessedToday: daily,
    filesProcessedThisMonth: monthly,
    subscriptionPlan,
    limits,
  }
}
