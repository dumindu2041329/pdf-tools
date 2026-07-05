import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { runWorkflow, upsertUser } from "@/lib/db"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await upsertUser(userId)
  await runWorkflow(userId, id)

  return NextResponse.json({ ok: true })
}
