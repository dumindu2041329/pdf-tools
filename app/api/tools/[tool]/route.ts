import { NextResponse } from "next/server"
import { runTool } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"
import { convertExtractFormat } from "@/lib/extractFormatConverter"
import { storeFile } from "@/lib/fileStore"

export const maxDuration = 60; // 60 seconds (useful for Vercel Hobby/Pro)

// Ensure app router accepts large formData
export const dynamic = 'force-dynamic';

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
  
  const uploadedFiles = formData.getAll("file");
  for (const value of uploadedFiles) {
    if (value && typeof value === "object") {
      const file = value as File;
      try {
        files.push({
          buffer: Buffer.from(await file.arrayBuffer()),
          filename: file.name || "upload.pdf",
        })
      } catch (err) {
         console.warn("Failed to read file buffer:", err);
      }
    }
  }

  const optionsRaw = formData.get("options")
  const options = optionsRaw ? JSON.parse(optionsRaw as string) : {}

  if (files.length === 0 && !(tool === "htmlpdf" && options.url)) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  try {
    const result = await runTool({ tool, files, options })

    let { buffer: finalBuffer, downloadFilename } = result;

    if (tool === "extract" && options.detailed) {
      const format = options.format || "json";
      const conversion = convertExtractFormat(finalBuffer as ArrayBuffer, format as string, downloadFilename);
      finalBuffer = conversion.buffer;
      downloadFilename = conversion.filename;
    }

    // Store the file and return JSON with a download link
    const fileData = finalBuffer instanceof Uint8Array
      ? finalBuffer
      : new Uint8Array(finalBuffer as ArrayBuffer);
    const mimeType = downloadFilename.endsWith(".zip") ? "application/zip" : "application/pdf";
    const downloadId = storeFile(fileData, downloadFilename, mimeType);

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
