import { NextResponse } from "next/server"
import { runTool, runPdfOcrForOffice } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"
import { convertExtractFormat } from "@/lib/extractFormatConverter"
import { storeFile } from "@/lib/fileStore"
import { convertPdfToOffice } from "@/lib/pdf/office-converter"

const localOfficeSlugs = new Set([
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-powerpoint",
])

export const maxDuration = 60

export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params

  const contentType = req.headers.get("content-type")
  const contentLength = req.headers.get("content-length")
  console.log("[DEBUG] Content-Type:", contentType, "Content-Length:", contentLength)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error("FormData parse error:", err)
    return NextResponse.json({ error: "Failed to parse file upload request" }, { status: 400 })
  }

  const files: Array<{ buffer: Buffer; filename: string }> = []

  const uploadedFiles = formData.getAll("file")
  for (const value of uploadedFiles) {
    if (value && typeof value === "object") {
      const file = value as File
      try {
        files.push({
          buffer: Buffer.from(await file.arrayBuffer()),
          filename: file.name || "upload.pdf",
        })
      } catch (err) {
        console.warn("Failed to read file buffer:", err)
      }
    }
  }

  const optionsRaw = formData.get("options")
  const options = optionsRaw ? JSON.parse(optionsRaw as string) : {}

  const toolSlug = typeof options._toolSlug === "string" ? options._toolSlug : undefined

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  if (tool === "officepdf" && toolSlug && localOfficeSlugs.has(toolSlug)) {
    try {
      const start = Date.now()
      const mode = (options.mode as string) || "no-ocr"
      const ocrLanguages = (options.ocr_languages as string[]) || ["eng"]

      const result = await convertPdfToOffice(
        files[0].buffer,
        files[0].filename,
        toolSlug,
        mode === "ocr",
        ocrLanguages,
        (buf, name, langs) => runPdfOcrForOffice(buf, name, langs)
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      const mimeMap: Record<string, string> = {
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }
      const mimeType = mimeMap[result.filename.split(".").pop() ?? ""] ?? "application/octet-stream"
      const downloadId = storeFile(result.buffer, result.filename, mimeType)

      return NextResponse.json({
        downloadId,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Office conversion error:", err)
      return NextResponse.json({ error: "Failed to convert PDF to Office format" }, { status: 500 })
    }
  }

  try {
    const cleanOptions = { ...options }
    delete cleanOptions.mode
    delete cleanOptions.ocr_languages
    delete cleanOptions._toolSlug

    const result = await runTool({ tool, files, options: cleanOptions })

    let { buffer: finalBuffer, downloadFilename } = result

    if (tool === "extract" && options.detailed) {
      const format = (options.format as string) || "json"
      const conversion = convertExtractFormat(finalBuffer as ArrayBuffer, format, downloadFilename)
      finalBuffer = conversion.buffer
      downloadFilename = conversion.filename
    }

    const fileData =
      finalBuffer instanceof Uint8Array ? finalBuffer : new Uint8Array(finalBuffer as ArrayBuffer)
    const mimeType = downloadFilename.endsWith(".zip")
      ? "application/zip"
      : downloadFilename.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : downloadFilename.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : downloadFilename.endsWith(".pptx")
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/pdf"
    const downloadId = storeFile(fileData, downloadFilename, mimeType)

    return NextResponse.json({
      downloadId,
      filename: downloadFilename,
      processingTime: String(result.timer),
      outputSize: result.outputFilesize,
    })
  } catch (err) {
    if (err instanceof ILoveAPIError) {
      console.error("[ILoveAPIError Detailed]", JSON.stringify(err, null, 2))
      const { userMessage } = mapILoveAPIError(err)
      return NextResponse.json({ error: userMessage, type: err.type }, { status: 400 })
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
