import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { runTool } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { userId } = await auth()
  // Note: we removed the strict 401 check here because free tools can be used without login.
  // In a robust production environment, you would check if the requested tool requires premium access here.

  const { tool } = await params

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error("FormData parse error (often due to cancelled XHR or broken upload):", err)
    return NextResponse.json({ error: "Failed to parse file upload request" }, { status: 400 })
  }

  const files: Array<{ buffer: Buffer; filename: string }> = []

  for (const [, value] of formData.entries()) {
    if (typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value) {
      const file = value as File
      files.push({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
      })
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  const optionsRaw = formData.get("options")
  const options = optionsRaw ? JSON.parse(optionsRaw as string) : {}

  try {
    const result = await runTool({ tool, files, options })

    return new NextResponse(result.buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${result.downloadFilename}"`,
        "X-Processing-Time": result.timer,
        "X-Output-Size": String(result.outputFilesize),
      },
    })
  } catch (err) {
    if (err instanceof ILoveAPIError) {
      console.error("[ILoveAPIError Detailed]", JSON.stringify(err, null, 2))
      const { userMessage } = mapILoveAPIError(err)
      return NextResponse.json(
        { error: userMessage, type: err.type },
        { status: 400 }
      )
    }
    if ((err as Error).message === "ILOVEAPI_OUT_OF_CREDITS") {
      return NextResponse.json(
        { error: "Processing credits exhausted", upgradeRequired: true },
        { status: 402 }
      )
    }
    console.error("Tool processing error:", err)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
