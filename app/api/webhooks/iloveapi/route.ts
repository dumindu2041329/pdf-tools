import { NextResponse } from "next/server"
import { ensureDbSchema, sql } from "@/lib/db"

export async function POST(req: Request) {
  const body = await req.json()
  const { event, data } = body

  // TODO: Validate webhook signature when iLoveAPI provides HMAC signing

  switch (event) {
    case "task.completed":
      // TODO: Update task record in DB to "completed"
      // await db.task.update({
      //   where: { iloveapiTaskId: data.task.task },
      //   data: { status: "completed", downloadFilename: data.task.download_filename },
      // })
      console.log("[iLoveAPI Webhook] Task completed:", data?.task?.task)
      break

    case "task.failed":
      // TODO: Update task record in DB to "failed"
      // await db.task.update({
      //   where: { iloveapiTaskId: data.task.task },
      //   data: { status: "failed" },
      // })
      console.log("[iLoveAPI Webhook] Task failed:", data?.task?.task)
      break

    case "signature.completed":
      await ensureDbSchema()
      if (typeof data?.signature?.uuid === "string") {
        await sql`
          UPDATE signature_request
          SET status = 'completed', updated_at = now()
          WHERE uuid = ${data.signature.uuid}
        `
      }
      console.log("[iLoveAPI Webhook] Signature completed:", data?.signature?.uuid)
      break

    case "signature.declined":
      await ensureDbSchema()
      if (typeof data?.signature?.uuid === "string") {
        await sql`
          UPDATE signature_request
          SET status = 'declined', updated_at = now()
          WHERE uuid = ${data.signature.uuid}
        `
      }
      console.log("[iLoveAPI Webhook] Signature declined:", data?.signature?.uuid)
      break

    default:
      console.log("[iLoveAPI Webhook] Unhandled event:", event)
  }

  return new NextResponse("OK", { status: 200 })
}
