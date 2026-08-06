// lib/ratelimit.ts
// Burst-protection rate limiters backed by Upstash Redis.
//
// These are a COMPLEMENT to the daily/monthly quotas enforced in
// lib/usage.ts + lib/guest-usage.ts, not a replacement. Quotas answer
// "how much can a user process today?"; these answer "how fast can one
// user/IP hit us right now?" — protecting paid upstream calls
// (OpenRouter, iLoveAPI credits) from abusive bursts.
//
// When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set,
// every limiter degrades to a no-op that always allows the request, so
// the app keeps working before the dependency is configured.

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const REST_URL = process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const isConfigured = Boolean(REST_URL && REST_TOKEN)

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

type Limiter = {
  limit: (identifier: string) => Promise<RateLimitResult>
}

function noopLimiter(): Limiter {
  return {
    limit: async () => ({
      success: true,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      reset: 0,
    }),
  }
}

function realLimiter(
  tokens: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1]
): Limiter {
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: "pdf-tools-ratelimit",
    analytics: true,
  })
  return {
    limit: async (identifier: string) => {
      try {
        const res = await ratelimit.limit(identifier)
        return {
          success: res.success,
          limit: res.limit,
          remaining: res.remaining,
          reset: res.reset,
        }
      } catch (err) {
        // Fail-open: a Redis outage (or a misconfigured URL in
        // .env.local) must never break the request it was protecting.
        console.error("[ratelimit] Upstash error, failing open:", err)
        return {
          success: true,
          limit: Number.POSITIVE_INFINITY,
          remaining: Number.POSITIVE_INFINITY,
          reset: 0,
        }
      }
    },
  }
}

const makeLimiter = isConfigured ? realLimiter : noopLimiter

/** AI endpoints — 10 calls / minute. Highest priority: each call burns
 *  real OpenRouter credits. */
export const aiLimiter = makeLimiter(10, "60 s")

/** Tool processing — 20 calls / minute. Protects iLoveAPI credits. */
export const toolLimiter = makeLimiter(20, "60 s")

/** Signed upload URL issuance — 30 / minute per IP. */
export const uploadLimiter = makeLimiter(30, "60 s")

/** Inbound webhooks (iLovePDF bursts a callback per completed task). */
export const webhookLimiter = makeLimiter(120, "60 s")

/** Scan-session polling — 60 / minute per sessionId (the desktop side
 *  polls every ~2s, so this allows a few concurrent sessions per IP). */
export const pollLimiter = makeLimiter(60, "60 s")

/** Best-effort client IP from the proxy chain (Vercel sets
 *  `x-forwarded-for`). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) {
    const first = fwd.split(",")[0]?.trim()
    if (first) return first
  }
  return "unknown"
}

/** Rate-limit key: authenticated users are keyed by userId, everyone
 *  else by IP. */
export function rateLimitKey(userId: string | null, ip: string): string {
  return userId && userId.length > 0 ? userId : ip
}
