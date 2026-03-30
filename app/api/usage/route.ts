import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getUsageStats } from "@/lib/usage"

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stats = await getUsageStats(userId)
  return NextResponse.json(stats)
}
