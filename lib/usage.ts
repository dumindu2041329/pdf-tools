// lib/usage.ts
// Stubbed usage tracking — DB integration added when Prisma is set up

export interface UsageLimits {
  daily: number
  monthly: number
  maxFileSizeMB: number
}

const planLimits: Record<string, UsageLimits> = {
  free: { daily: 5, monthly: 30, maxFileSizeMB: 20 },
  premium: { daily: 999, monthly: 9999, maxFileSizeMB: 200 },
  business: { daily: 9999, monthly: 99999, maxFileSizeMB: 500 },
}

export function getLimitsForPlan(plan: string): UsageLimits {
  return planLimits[plan] ?? planLimits.free
}

// Stubbed — always allows processing until DB is connected
export async function canProcessFile(
  _userId: string,
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

  // TODO: Check daily/monthly counts from DB
  return { allowed: true }
}

// Stubbed — no-op until DB is connected
export async function recordCreditUsage(
  _userId: string,
  _tool: string,
  _filesProcessed: number,
  _creditsUsed: number
): Promise<void> {
  // TODO: await db.creditUsage.create({ data: { ... } })
}

// Stubbed — returns mock data until DB is connected
export async function getUsageStats(_userId: string) {
  return {
    filesProcessedToday: 0,
    filesProcessedThisMonth: 0,
    plan: "free" as const,
    limits: planLimits.free,
  }
}
