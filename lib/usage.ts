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

  // Fast path: read denormalized counters (single row lookup, O(1))
  const { daily, monthly } = await readUsageCounter(userId)

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

  const { daily, monthly }: CounterCounts = await readUsageCounter(userId)

  return {
    filesProcessedToday: daily,
    filesProcessedThisMonth: monthly,
    subscriptionPlan,
    limits,
  }
}
