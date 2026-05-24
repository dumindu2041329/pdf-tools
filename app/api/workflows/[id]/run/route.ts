import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ensureDbSchema, sql, upsertUser } from "@/lib/db"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await ensureDbSchema()
  await upsertUser(userId)

  await sql`
    UPDATE workflow
    SET run_count = run_count + 1,
        last_run = now(),
        updated_at = now()
    WHERE user_id = ${userId}
      AND id = (${id})::uuid
  `

  return NextResponse.json({ ok: true })
}

