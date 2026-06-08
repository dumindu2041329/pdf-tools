import { NextResponse } from "next/server"
import { runUsageEventRetention } from "@/lib/db"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Daily retention cron: drops monthly partitions of usage_event older than 90 days
 * and ensures partitions for the next 3 months exist. Scheduled via vercel.json.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 * Set CRON_SECRET in your Vercel project environment to enable the check.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const retentionDays = Number(process.env.USAGE_RETENTION_DAYS) || 90
    const monthsAhead = Number(process.env.USAGE_PARTITION_MONTHS_AHEAD) || 3
    const log = await runUsageEventRetention(retentionDays, monthsAhead)
    console.log("[cron/retention] complete", log)
    return NextResponse.json({ ok: true, retentionDays, monthsAhead, log })
  } catch (err) {
    console.error("[cron/retention] failed:", err)
    return NextResponse.json(
      { error: "Retention run failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
