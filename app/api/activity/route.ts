import { NextResponse } from "next/server"
import { recordProcessingEvent } from "@/lib/usage"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const toolSlug = typeof body.toolSlug === "string" ? body.toolSlug : ""
  const fileName = typeof body.fileName === "string" ? body.fileName : null
  const outputSize = typeof body.outputSize === "number" ? body.outputSize : null

  if (!toolSlug) {
    return NextResponse.json({ error: "toolSlug is required" }, { status: 400 })
  }

  await recordProcessingEvent({
    userId: null,
    toolSlug,
    status: "success",
    engine: "client",
    inputFilesCount: 1,
    outputFilename: fileName ?? undefined,
    outputSizeBytes: outputSize ?? undefined,
  })

  return NextResponse.json({ ok: true })
}

