import { cookies } from "next/headers"
import { getLimitsForPlan } from "@/lib/usageLimits"
import type { UsageLimits } from "@/lib/usageLimits"

/**
 * Cookie-backed usage counter for unauthenticated ("guest") users.
 *
 * The free plan in `usageLimits.ts` already defines a 5-files/day and
 * 30-files/month cap. Logged-in users get those limits enforced via
 * the `usage_counter` table in Neon (see `lib/usage.ts`). Guests have
 * no userId, so there's no row to update — we instead persist the
 * counter in an HTTP-only cookie keyed by browser.
 *
 * Threat model: this is a soft gate, not a security boundary. A
 * determined user can clear their cookies to reset the counter, and
 * we cannot link identities across browsers. The point is to prevent
 * casual abuse and to drive the desired UX: a guest who tries to
 * "bypass" the limit by repeatedly processing files is bounced to
 * the sign-up page.
 *
 * Cookie shape: a tiny JSON object with the running daily and monthly
 * counts plus the date strings they correspond to. When the current
 * UTC date no longer matches the stored date, the counter is
 * considered stale and implicitly resets to zero.
 */

const GUEST_COOKIE = "pdf_tools_guest_usage"

// 35 days is just over a month, so the monthly bucket survives a full
// calendar month without forcing the browser to re-issue a cookie.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 35

export interface GuestUsage {
  daily: number
  dailyDate: string
  monthly: number
  monthlyYearMonth: string
}

function utcDateParts(): { date: string; yearMonth: string } {
  const now = new Date()
  const date = now.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const yearMonth = date.slice(0, 7) // YYYY-MM
  return { date, yearMonth }
}

function defaultUsage(): GuestUsage {
  const { date, yearMonth } = utcDateParts()
  return { daily: 0, dailyDate: date, monthly: 0, monthlyYearMonth: yearMonth }
}

/**
 * Read the current guest counter from cookies. Buckets older than today
 * (UTC) or last month are treated as zero. Invalid JSON in the cookie
 * is treated the same as a missing cookie so a corrupted value can't
 * lock the user out.
 *
 * `cookies()` returns a Promise in Next.js 16+, so all helpers in this
 * module are async to match.
 */
export async function getGuestUsage(): Promise<GuestUsage> {
  const raw = (await cookies()).get(GUEST_COOKIE)?.value
  if (!raw) return defaultUsage()
  try {
    const parsed = JSON.parse(raw) as Partial<GuestUsage>
    const { date, yearMonth } = utcDateParts()
    const daily = parsed.dailyDate === date ? Number(parsed.daily) || 0 : 0
    const monthly =
      parsed.monthlyYearMonth === yearMonth ? Number(parsed.monthly) || 0 : 0
    return { daily, dailyDate: date, monthly, monthlyYearMonth: yearMonth }
  } catch {
    return defaultUsage()
  }
}

async function writeGuestUsage(usage: GuestUsage): Promise<void> {
  ;(await cookies()).set({
    name: GUEST_COOKIE,
    value: JSON.stringify(usage),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * Increment the guest counter by `delta` (defaults to 1 — one
 * processing event). Callers should pre-check with `checkGuestLimits`
 * first; this helper just records the increment.
 */
export async function incrementGuestUsage(delta = 1): Promise<GuestUsage> {
  const current = await getGuestUsage()
  const next: GuestUsage = {
    daily: current.daily + delta,
    dailyDate: current.dailyDate,
    monthly: current.monthly + delta,
    monthlyYearMonth: current.monthlyYearMonth,
  }
  await writeGuestUsage(next)
  return next
}

export interface GuestLimitResult {
  allowed: boolean
  reason?: string
  daily: number
  monthly: number
  limits: UsageLimits
}

/**
 * Pre-flight check: would adding `delta` more processing events push the
 * guest over the free-plan daily or monthly cap? Uses the same limits
 * source of truth as the authenticated path (`getLimitsForPlan("free")`).
 */
export async function checkGuestLimits(delta = 1): Promise<GuestLimitResult> {
  const limits = getLimitsForPlan("free")
  const usage = await getGuestUsage()
  const projectedDaily = usage.daily + delta
  const projectedMonthly = usage.monthly + delta

  if (limits.daily > 0 && projectedDaily > limits.daily) {
    return {
      allowed: false,
      reason: `You've reached the daily limit of ${limits.daily} files for guests. Sign up for a free account to continue.`,
      daily: usage.daily,
      monthly: usage.monthly,
      limits,
    }
  }

  if (limits.monthly > 0 && projectedMonthly > limits.monthly) {
    return {
      allowed: false,
      reason: `You've reached the monthly limit of ${limits.monthly} files for guests. Sign up for a free account to continue.`,
      daily: usage.daily,
      monthly: usage.monthly,
      limits,
    }
  }

  return {
    allowed: true,
    daily: usage.daily,
    monthly: usage.monthly,
    limits,
  }
}
