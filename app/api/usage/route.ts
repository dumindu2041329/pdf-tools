import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getUsageStats } from "@/lib/usage"
import { getLimitsForPlan } from "@/lib/usageLimits"

/**
 * Returns usage stats for the current user.
 *
 * Non-logged-in (guest) users get a "guest" response: free-plan limits
 * and zero counters. This lets the client-side pre-flight check in
 * `ToolPageClient` work seamlessly for guests without raising 401s in
 * the network tab, and it also gives the UI a single source of truth
 * for "how big a file can I upload right now".
 *
 * Authenticated users get their real counters from the `usage_counter`
 * table via `getUsageStats`.
 */
export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    const limits = getLimitsForPlan("free")
    return NextResponse.json({
      filesProcessedToday: 0,
      filesProcessedThisMonth: 0,
      subscriptionPlan: "free",
      limits,
      isGuest: true,
    })
  }

  const stats = await getUsageStats(userId)
  return NextResponse.json({ ...stats, isGuest: false })
}
