import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getUsageStats } from "@/lib/usage"
import { getLimitsForPlan } from "@/lib/usageLimits"
import { getGuestUsage } from "@/lib/guest-usage"

/**
 * Returns usage stats for the current user.
 *
 * Non-logged-in (guest) users get a "guest" response sourced from the
 * cookie-backed counter in `lib/guest-usage.ts`. This lets the
 * client-side pre-flight check in `ToolPageClient` see the real
 * daily/monthly count (so it can redirect to /sign-up on the 6th
 * request) and also gives the UI a single source of truth for "how
 * big a file can I upload right now".
 *
 * Authenticated users get their real counters from the `usage_counter`
 * table via `getUsageStats`.
 */
export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    const limits = getLimitsForPlan("free")
    const usage = await getGuestUsage()
    return NextResponse.json({
      filesProcessedToday: usage.daily,
      filesProcessedThisMonth: usage.monthly,
      subscriptionPlan: "free",
      limits,
      isGuest: true,
    })
  }

  const stats = await getUsageStats(userId)
  return NextResponse.json({ ...stats, isGuest: false })
}
