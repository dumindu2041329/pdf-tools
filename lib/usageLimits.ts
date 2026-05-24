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

