import { NextResponse } from "next/server"
import { runTool } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"
import { convertExtractFormat } from "@/lib/extractFormatConverter"
import { storeFile } from "@/lib/fileStore"
import { convertPdfToExcel } from "@/lib/pdf/office-converter"
import { convertPdfToWordAdobe, convertPdfToPowerpointAdobe, ocrPdfAdobe } from "@/lib/pdf/adobe-export-converter"
import { OCRSupportedLocale } from "@adobe/pdfservices-node-sdk"
import { processRotateLocal } from "@/lib/pdf/rotate-client"
import { getToolBySlug } from "@/lib/tools-config"
import { mapWatermarkOptions } from "@/lib/iloveapi/watermark-mapper"

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

  const files: Array<{ buffer: Buffer; filename: string; password?: string }> = []
  let watermarkImage: { buffer: Buffer; filename: string } | undefined

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

  // Extract watermark image if provided
  const watermarkImageFile = formData.get("watermark_image")
  if (watermarkImageFile && typeof watermarkImageFile === "object") {
    const file = watermarkImageFile as File
    try {
      watermarkImage = {
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name || "watermark.png",
      }
    } catch (err) {
      console.warn("Failed to read watermark image buffer:", err)
    }
  }

  const optionsRaw = formData.get("options")
  const options = optionsRaw ? JSON.parse(optionsRaw as string) : {}

  if (files.length === 0) {
    if (tool === "html-to-pdf" && options.url) {
      try {
        const start = Date.now()
        const result = await runTool({
          tool: "htmlpdf",
          files: [],
          options: { url: options.url },
        })
        const elapsed = ((Date.now() - start) / 1000).toFixed(2)
        const fileData =
          result.buffer instanceof Uint8Array
            ? result.buffer
            : new Uint8Array(result.buffer as ArrayBuffer)
        const downloadId = storeFile(fileData, result.downloadFilename, "application/pdf")

        return NextResponse.json({
          downloadId,
          filename: result.downloadFilename,
          processingTime: elapsed,
          outputSize: result.outputFilesize,
        })
      } catch (err) {
        console.error("HTML to PDF processing error:", err)
        return NextResponse.json({ error: "Failed to convert HTML to PDF" }, { status: 500 })
      }
    }
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  if (tool === "jpg-to-pdf" && options.merge_after === false) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const singleResult = await runTool({
          tool: "imagepdf",
          files: [file],
          options: { ...options },
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const pdfFilename = file.filename.replace(/\.[^.]+$/, ".pdf")
        zip.file(pdfFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      const downloadId = storeFile(zipBuffer, "converted-pdfs.zip", "application/zip")

      return NextResponse.json({
        downloadId,
        filename: "converted-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("JPG to PDF (no merge) processing error:", err)
      return NextResponse.json({ error: "Failed to convert images to PDF" }, { status: 500 })
    }
  }

  if (tool === "ocr-pdf") {
    try {
      const start = Date.now()

      const ocrLanguages = (options.ocr_languages as string[]) || ["eng"]
      const locale = ocrLanguages[0] === "eng" ? OCRSupportedLocale.EN_US : undefined

      const result = await ocrPdfAdobe(
        files[0].buffer,
        files[0].filename,
        locale
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
      console.error("Adobe OCR processing error:", err)
      return NextResponse.json({ error: "Failed to process PDF with OCR" }, { status: 500 })
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

  if (tool === "validate-pdfa") {
    try {
      const start = Date.now()
      const toolConfig = getToolBySlug(tool)
      const iloveapiTool = typeof toolConfig?.iloveapiTool === "string" ? toolConfig.iloveapiTool : tool

      const cleanOptions = { ...options }
      delete cleanOptions._toolSlug

      const result = await runTool({ tool: iloveapiTool, files, options: cleanOptions })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      const resultText = new TextDecoder().decode(result.buffer as ArrayBuffer)

      return NextResponse.json({
        validationSuccess: true,
        message: "PDF validation is success",
        result: resultText,
        processingTime: elapsed,
      })
    } catch (err) {
      console.error("PDF/A validation error:", err)
      if (err instanceof ILoveAPIError) {
        const { userMessage } = mapILoveAPIError(err)
        return NextResponse.json({ validationSuccess: false, message: userMessage, error: userMessage }, { status: 200 })
      }
      const errMessage = (err as Error).message || "PDF validation failed"
      return NextResponse.json({ validationSuccess: false, message: errMessage, error: errMessage }, { status: 200 })
    }
  }

  if (tool === "rotate-pdf") {
    try {
      const start = Date.now()

      const result = await processRotateLocal(
        files,
        options
      )

      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      const downloadId = storeFile(result.buffer, result.downloadFilename, "application/pdf")

      return NextResponse.json({
        downloadId,
        filename: result.downloadFilename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Rotate PDF processing error:", err)
      return NextResponse.json({ error: "Failed to rotate PDF" }, { status: 500 })
    }
  }

  try {
    const toolConfig = getToolBySlug(tool)
    if (!toolConfig) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }

    const iloveapiTool = typeof toolConfig?.iloveapiTool === "string" ? toolConfig.iloveapiTool : tool

    if (iloveapiTool.startsWith("local-")) {
      return NextResponse.json({ error: "This tool is processed client-side" }, { status: 400 })
    }

    let cleanOptions = { ...options }
    delete cleanOptions._toolSlug

    // Handle unlock-pdf specially: password goes in file object, not options
    if (tool === "unlock-pdf") {
      const password = options.password as string
      if (password) {
        for (const file of files) {
          file.password = password
        }
        delete options.password
      }
    }

    // Apply tool-specific parameter mapping
    if (tool === "watermark-pdf") {
      cleanOptions = mapWatermarkOptions(cleanOptions)
    }

    // Only strip mode/ocr_languages for non-OCR tools (officepdf conversion pipeline uses these)
    // Note: watermark-pdf needs mode preserved for its image/text mode handling
    if (tool !== "ocr-pdf" && tool !== "watermark-pdf") {
      delete cleanOptions.mode
    }
    delete cleanOptions.ocr_languages

    const runToolInput: Parameters<typeof runTool>[0] = { tool: iloveapiTool, files, options: cleanOptions }
    if (tool === "watermark-pdf" && watermarkImage) {
      runToolInput.watermarkImage = watermarkImage
    }

    const result = await runTool(runToolInput)

    let { buffer: finalBuffer, downloadFilename } = result

    if (iloveapiTool === "extract") {
      if (options.detailed) {
        const format = (options.format as string) || "json"
        const conversion = convertExtractFormat(finalBuffer as ArrayBuffer, format, downloadFilename)
        finalBuffer = conversion.buffer
        downloadFilename = conversion.filename
      } else {
        // Standard mode returns plain text directly from iLovePDF
        downloadFilename = downloadFilename.replace(/\.pdf$/i, ".txt").replace(/\.csv$/i, ".txt")
        if (!downloadFilename.endsWith(".txt")) downloadFilename += ".txt"
      }
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
            : downloadFilename.endsWith(".txt")
              ? "text/plain"
              : downloadFilename.endsWith(".json")
                ? "application/json"
                : downloadFilename.endsWith(".csv")
                  ? "text/csv"
                  : downloadFilename.endsWith(".md")
                    ? "text/markdown"
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
    let errMessage = "Processing failed. Please try again."
    if (axiosErr?.response?.data) {
      const data = axiosErr.response.data
      if (typeof data === "object" && data !== null) {
        const errorObj = data as Record<string, unknown>
        if (typeof errorObj.message === "string" && errorObj.message.length > 0) {
          errMessage = errorObj.message
        } else if (typeof errorObj.error === "string" && errorObj.error.length > 0) {
          errMessage = errorObj.error
        } else if (typeof errorObj.error === "object" && errorObj.error !== null) {
          const nestedError = errorObj.error as Record<string, unknown>
          errMessage = (nestedError.message as string) || (nestedError.error as string) || errMessage
        }
      } else if (typeof data === "string" && data.length > 0 && data.length < 200) {
        errMessage = data
      }
    }
    return NextResponse.json({ error: errMessage }, { status: 500 })
  }
}
