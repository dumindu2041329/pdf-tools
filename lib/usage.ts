import {
  ensureDbSchema,
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
 * Fast read from denormalized counter table.
 * Returns 0s if no row exists (new user) — counter is created on first successful event.
 * Falls back to counting usage_event rows when counter is missing (should be rare
 * after the backfill migration; kept for safety).
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

    if (rows.length > 0) {
      return {
        daily: asCount(rows[0].daily),
        monthly: asCount(rows[0].monthly),
      }
    }

    // No counter yet — backfill from event log so future reads are O(1).
    const daily = await getTodayUsageCount(userId)
    const monthly = await getThisMonthUsageCount(userId)
    if (daily > 0 || monthly > 0) {
      await sql`
        INSERT INTO usage_counter (user_id, daily_count, daily_date, monthly_count, monthly_year_month)
        VALUES (
          ${userId},
          ${daily},
          (now() AT TIME ZONE 'UTC')::date,
          ${monthly},
          to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM')
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          daily_count = EXCLUDED.daily_count,
          daily_date = EXCLUDED.daily_date,
          monthly_count = EXCLUDED.monthly_count,
          monthly_year_month = EXCLUDED.monthly_year_month,
          updated_at = now()
      `
    }
    return { daily, monthly }
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

  try {
    await ensureDbSchema()
    await upsertUser(input.userId)

    // 1) Append to event log (audit trail + per-tool analytics)
    const rows = (await sql`
      INSERT INTO usage_event (user_id, status, tool_slug)
      VALUES (${input.userId}, ${input.status}, ${input.toolSlug})
      RETURNING id::text
    `) as Array<{ id: string }>

    // 2) Upsert denormalized counter (only counts successful events;
    //    resets automatically when daily_date / monthly_year_month change).
    //    All date math uses explicit UTC to stay correct regardless of session timezone.
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

    return rows[0]?.id ?? ""
  } catch (err) {
    // If a usage table is missing (e.g. it was dropped externally), the
    // cached schema-init promise is still resolved, so the DDL never re-ran.
    // Reset it and retry once: the next ensureDbSchema() will recreate
    // usage_event (and its partitions) and usage_counter.
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

  // Use the same fast counter path as canProcessFile
  const { daily, monthly } = await readCounterCounts(userId)

  return {
    filesProcessedToday: daily,
    filesProcessedThisMonth: monthly,
    subscriptionPlan,
    limits,
  }
}

export async function getTodayUsageCount(userId: string): Promise<number> {
  try {
    await ensureDbSchema()
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM usage_event
      WHERE user_id = ${userId}
        AND status = 'success'
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    `) as Array<{ count: number | string }>
    return asCount(rows[0]?.count)
  } catch (err) {
    console.error("[usage] failed to read today's count:", err)
    return 0
  }
}

export async function getThisMonthUsageCount(userId: string): Promise<number> {
  try {
    await ensureDbSchema()
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM usage_event
      WHERE user_id = ${userId}
        AND status = 'success'
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    `) as Array<{ count: number | string }>
    return asCount(rows[0]?.count)
  } catch (err) {
    console.error("[usage] failed to read this month's count:", err)
    return 0
  }
}

// ---------------------------------------------------------------------------
// Analytics: per-tool usage breakdowns (reads from partitioned usage_event)
// ---------------------------------------------------------------------------

export interface ToolUsageStat {
  toolSlug: string
  totalCount: number
  successCount: number
  errorCount: number
  lastUsedAt: string | null
}

/**
 * Returns per-tool usage counts for a user (or all users when userId is null),
 * ordered by total count descending. Reads from the partitioned usage_event
 * table — uses the (user_id, tool_slug, created_at) index for fast lookup.
 */
export async function getToolUsageStats(
  userId: string | null,
  options: { sinceDays?: number; limit?: number } = {}
): Promise<ToolUsageStat[]> {
  const { sinceDays = 30, limit = 50 } = options
  try {
    await ensureDbSchema()
    const rows = (await sql`
      SELECT
        tool_slug,
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
        COUNT(*) FILTER (WHERE status = 'error')::int AS error_count,
        MAX(created_at) AS last_used_at
      FROM usage_event
      WHERE created_at >= now() - (${sinceDays} || ' days')::interval
        AND (${userId}::text IS NULL OR user_id = ${userId})
        AND tool_slug <> ''
      GROUP BY tool_slug
      ORDER BY total_count DESC
      LIMIT ${limit}
    `) as Array<{
      tool_slug: string
      total_count: number | string
      success_count: number | string
      error_count: number | string
      last_used_at: string | null
    }>
    return rows.map((r) => ({
      toolSlug: r.tool_slug,
      totalCount: asCount(r.total_count),
      successCount: asCount(r.success_count),
      errorCount: asCount(r.error_count),
      lastUsedAt: r.last_used_at,
    }))
  } catch (err) {
    console.error("[usage] failed to read tool usage stats:", err)
    return []
  }
}

export interface DailyUsagePoint {
  date: string
  count: number
}

/**
 * Returns daily usage counts for a user (or all users when userId is null)
 * over the last N days. Useful for sparkline / trend charts.
 */
export async function getDailyUsageSeries(
  userId: string | null,
  options: { days?: number } = {}
): Promise<DailyUsagePoint[]> {
  const { days = 14 } = options
  try {
    await ensureDbSchema()
    const rows = (await sql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS count
      FROM usage_event
      WHERE created_at >= now() - (${days} || ' days')::interval
        AND status = 'success'
        AND (${userId}::text IS NULL OR user_id = ${userId})
      GROUP BY 1
      ORDER BY 1
    `) as Array<{ day: string; count: number | string }>
    return rows.map((r) => ({ date: r.day, count: asCount(r.count) }))
  } catch (err) {
    console.error("[usage] failed to read daily usage series:", err)
    return []
  }
}
