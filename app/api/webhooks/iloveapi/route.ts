import { NextResponse } from "next/server"

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
      console.log("[iLoveAPI Webhook] Signature completed:", data?.signature?.uuid)
      break

    case "signature.declined":
      console.log("[iLoveAPI Webhook] Signature declined:", data?.signature?.uuid)
      break

    default:
      console.log("[iLoveAPI Webhook] Unhandled event:", event)
  }

  return new NextResponse("OK", { status: 200 })
}
