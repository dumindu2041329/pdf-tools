import {
  ensureDbSchemaIfStale,
  isMissingRelationError,
  readUsageCounter,
  recordUsageEvent,
  resetSchemaInit,
  upsertUser,
  type CounterCounts,
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

  // Fast path: read denormalized counters (single row lookup, O(1)).
  // Fail CLOSED if the read fails — treating an unreadable counter as
  // "zero usage" would silently disable the free-plan caps for everyone.
  let daily: number
  let monthly: number
  try {
    ;({ daily, monthly } = await readUsageCounter(userId))
  } catch (err) {
    console.error("[usage] readUsageCounter failed; denying request:", err)
    return {
      allowed: false,
      reason: "Usage limits are temporarily unavailable. Please try again in a moment.",
    }
  }

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
  // logs a warning so an operator can re-run the Supabase migration.
  ensureDbSchemaIfStale()

  try {
    await upsertUser(input.userId)
    await recordUsageEvent(input.userId, input.status)
    return input.toolSlug
  } catch (err) {
    // If a relation is missing (e.g. it was dropped externally), the
    // cached schema-init promise is still resolved, so we can retry
    // once. The next upsertUser() will re-ensure the schema.
    if (isMissingRelationError(err)) {
      console.warn(
        "[usage] missing relation detected, re-initialising schema and retrying"
      )
      resetSchemaInit()
      try {
        await upsertUser(input.userId)
        await recordUsageEvent(input.userId, input.status)
        return input.toolSlug
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

  // Display-only path (/api/usage). Unlike the enforcement path, a read
  // failure here must not break the meter — fall back to zeros.
  let counts: CounterCounts = { daily: 0, monthly: 0 }
  try {
    counts = await readUsageCounter(userId)
  } catch (err) {
    console.error("[usage] getUsageStats counter read failed:", err)
  }

  return {
    filesProcessedToday: counts.daily,
    filesProcessedThisMonth: counts.monthly,
    subscriptionPlan,
    limits,
  }
}
