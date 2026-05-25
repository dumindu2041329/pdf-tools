import { getUserPlan } from "@/lib/auth"
import type { UserPlan } from "@/lib/auth"
import { getLimitsForPlan } from "@/lib/usageLimits"
import type { UsageLimits } from "@/lib/usageLimits"

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

  return { allowed: true }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recordProcessingEvent(_input: {
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
  return ""
}

export async function getUsageStats(userId: string): Promise<{
  filesProcessedToday: number
  filesProcessedThisMonth: number
  subscriptionPlan: UserPlan
  limits: UsageLimits
}> {
  const subscriptionPlan = await getUserPlan(userId)
  const limits = getLimitsForPlan(subscriptionPlan)

  return {
    filesProcessedToday: 0,
    filesProcessedThisMonth: 0,
    subscriptionPlan,
    limits,
  }
}
