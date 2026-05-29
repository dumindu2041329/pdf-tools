export interface UsageLimits {
  daily: number
  monthly: number
  maxFileSizeMB: number
}

const planLimits: Record<string, UsageLimits> = {
  free: { daily: 5, monthly: 30, maxFileSizeMB: 20 },
  premium: { daily: -1, monthly: -1, maxFileSizeMB: 200 },
}

export function getLimitsForPlan(plan: string): UsageLimits {
  return planLimits[plan] ?? planLimits.free
}

