import { NextResponse } from "next/server"
import { runTool } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"
import { convertExtractFormat } from "@/lib/extractFormatConverter"
import { storeFile } from "@/lib/fileStore"
import { convertPdfToExcel } from "@/lib/pdf/office-converter"
import { convertPdfToWordAdobe, convertPdfToPowerpointAdobe } from "@/lib/pdf/adobe-export-converter"
import { processOcrLocal } from "@/lib/pdf/ocr-local"

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

  if (tool === "pdfocr") {
    try {
      const start = Date.now()
      const ocrLanguages = (options.ocr_languages as string[]) || ["eng"]

      const result = await processOcrLocal(
        files[0].buffer,
        files[0].filename,
        ocrLanguages
      )

      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      const downloadId = storeFile(result.buffer, result.filename, "application/pdf")

      return NextResponse.json({
        downloadId,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Local OCR processing error:", err)
      return NextResponse.json({ error: "Failed to process PDF with local OCR" }, { status: 500 })
    }
  }

  if (tool === "pdf-to-excel") {
    try {
      const start = Date.now()

      const result = await convertPdfToExcel(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      const downloadId = storeFile(
        result.buffer,
        result.filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )

      return NextResponse.json({
        downloadId,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Adobe Excel conversion error:", err)
      return NextResponse.json({ error: "Failed to convert PDF to Excel format" }, { status: 500 })
    }
  }

  if (tool === "pdf-to-word") {
    try {
      const start = Date.now()

      const result = await convertPdfToWordAdobe(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      const downloadId = storeFile(
        result.buffer,
        result.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )

      return NextResponse.json({
        downloadId,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Adobe Word conversion error:", err)
      return NextResponse.json({ error: "Failed to convert PDF to Word format" }, { status: 500 })
    }
  }

  if (tool === "pdf-to-powerpoint") {
    try {
      const start = Date.now()

      const result = await convertPdfToPowerpointAdobe(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      const downloadId = storeFile(
        result.buffer,
        result.filename,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )

      return NextResponse.json({
        downloadId,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Adobe PowerPoint conversion error:", err)
      return NextResponse.json({ error: "Failed to convert PDF to PowerPoint format" }, { status: 500 })
    }
  }

  try {
    const cleanOptions = { ...options }
    delete cleanOptions._toolSlug
    // Only strip mode/ocr_languages for non-OCR tools (officepdf conversion pipeline uses these)
    if (tool !== "pdfocr") {
      delete cleanOptions.mode
      delete cleanOptions.ocr_languages
    }

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
    // Log the full error including iLoveAPI response body for diagnosis
    const axiosErr = err as { response?: { data?: unknown; status?: number } }
    if (axiosErr?.response) {
      console.error("Tool processing error (iLoveAPI response):", JSON.stringify(axiosErr.response.data, null, 2), "status:", axiosErr.response.status)
    } else {
      console.error("Tool processing error:", err)
    }
    const errMessage = axiosErr?.response?.data && typeof axiosErr.response.data === "object"
      ? JSON.stringify(axiosErr.response.data)
      : "Processing failed"
    return NextResponse.json({ error: errMessage }, { status: 500 })
  }
}
