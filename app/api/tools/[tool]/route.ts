import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { runTool } from "@/lib/iloveapi/tools"
import { ILoveAPIError, mapILoveAPIError } from "@/lib/iloveapi/errors"
import { convertExtractFormat } from "@/lib/extractFormatConverter"
import { convertPdfToExcel } from "@/lib/pdf/office-converter"
import { convertPdfToWordAdobe, convertPdfToPowerpointAdobe, ocrPdfAdobe, resolveOcrLocale } from "@/lib/pdf/adobe-export-converter"
import { ServiceApiError } from "@adobe/pdfservices-node-sdk"
import { processRotateLocal } from "@/lib/pdf/rotate-client"
import { getToolBySlug } from "@/lib/tools-config"
import { mapWatermarkOptions } from "@/lib/iloveapi/watermark-mapper"
import { mapPageNumberOptions } from "@/lib/iloveapi/page-number-mapper"
import { canProcessFile, recordProcessingEvent } from "@/lib/usage"
import { getUserPlan } from "@/lib/auth"
import { getLimitsForPlan } from "@/lib/usageLimits"
import { checkGuestLimits, incrementGuestUsage } from "@/lib/guest-usage"
import {
  deleteFromStorage,
  deleteStoragePrefix,
  downloadFromStorage,
  uploadToStorage,
} from "@/lib/supabase-storage"
import { getClientIp, rateLimitKey, toolLimiter } from "@/lib/ratelimit"
import { isInngestConfigured, sendEvent } from "@/lib/inngest/client"
import { createJob, deleteJob, newJobId, RESULTS_BUCKET } from "@/lib/jobs"

/**
 * Map an error thrown by the Adobe PDF Services SDK into a user-friendly
 * JSON response. In particular, the SDK throws a `ServiceApiError` with
 * `errorCode === "INPUT_TOO_LARGE"` when the input asset exceeds Adobe's
 * per-file limit (currently ~100 MB for Export PDF / OCR). Surfacing that
 * as a generic 500 hides the real cause from the user.
 */
function adobeErrorResponse(err: unknown, fallbackMessage: string): NextResponse {
  if (err instanceof ServiceApiError) {
    if (err.errorCode === "INPUT_TOO_LARGE") {
      console.warn(`[Adobe] Input too large: ${err.message}`)
      return NextResponse.json(
        {
          error:
            "This PDF is too large for Adobe's processing service (limit ~100 MB). Try splitting the file or using a smaller PDF.",
        },
        { status: 413 }
      )
    }
    console.error(`[Adobe] Service API error (${err.errorCode}): ${err.message}`)
    return NextResponse.json(
      { error: `${fallbackMessage} (${err.errorCode})` },
      { status: err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500 }
    )
  }
  console.error(fallbackMessage + ":", err)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

// Adobe PDF Services rejects input assets larger than this. Returning a 413
// up front saves the user from waiting through a multi-minute upload only to
// get a generic 500.
const ADOBE_MAX_INPUT_BYTES = 100 * 1024 * 1024

function adobePreflightCheck(
  files: Array<{ buffer: Buffer; filename: string }>,
  fallbackName: string
): NextResponse | null {
  for (const file of files) {
    if (file.buffer.length > ADOBE_MAX_INPUT_BYTES) {
      console.warn(
        `[Adobe] Preflight reject: ${file.filename} is ${file.buffer.length} bytes (max ${ADOBE_MAX_INPUT_BYTES})`
      )
      return NextResponse.json(
        {
          error: `"${file.filename}" is ${(file.buffer.length / (1024 * 1024)).toFixed(1)} MB, which exceeds Adobe's ${fallbackName} limit of 100 MB. Try splitting the PDF first.`,
        },
        { status: 413 }
      )
    }
  }
  return null
}

export const maxDuration = 60

export const dynamic = "force-dynamic"

// Jobs above this total size (or with more than one file) are dispatched
// to the Inngest background pipeline instead of blocking this function.
const ASYNC_THRESHOLD_BYTES = 10 * 1024 * 1024

// Tools backed by the Adobe PDF Services SDK (100 MB per-file limit).
const ADOBE_SDK_TOOLS = new Set([
  "ocr-pdf",
  "pdf-to-excel",
  "pdf-to-word",
  "pdf-to-powerpoint",
])

function safeJobFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return cleaned.length > 0 ? cleaned : "file"
}

function randomToken(): string {
  // 9-char base36 token — ~47 bits of entropy, URL-safe, cheap.
  return Math.random().toString(36).slice(2, 11)
}

/**
 * True when a request should be processed as an async Inngest job.
 * Multi-file jobs (the sequential loops that blow the 60s/120s budget)
 * and single files above the size threshold are the heavy cases.
 * validate-pdfa keeps its dedicated synchronous response shape and
 * rotate-pdf is a fast local (pdf-lib) operation.
 */
function shouldEnqueueAsync(
  tool: string,
  files: Array<{ buffer: Buffer; filename: string }>,
  blobEntries: Array<{ url: string; filename: string; size?: number }>
): boolean {
  if (tool === "validate-pdfa" || tool === "rotate-pdf" || tool === "edit-pdf") {
    return false
  }
  const totalBytes =
    files.reduce((sum, f) => sum + f.buffer.byteLength, 0) +
    blobEntries.reduce((sum, e) => sum + (e.size ?? 0), 0)
  return files.length + blobEntries.length > 1 || totalBytes > ASYNC_THRESHOLD_BYTES
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  return await processToolRequest(req, params)
}

async function processToolRequest(
  req: Request,
  params: Promise<{ tool: string }>
) {
  // Track every blob URL we hydrate (or attempt to hydrate) so we can
  // clean them up regardless of how the request ends. `deleteFromStorage`
  // is safe to call on unknown URLs and swallows errors, so this is
  // fire-and-forget — a failed tool run (iLoveAPI/Adobe error, guest
  // cap, etc.) still releases the storage objects.
  const downloadedBlobUrls: string[] = []
  // URL + filename pairs for files that came in via the direct-to-Storage
  // path. Needed by the async job pipeline so the background function can
  // re-hydrate each file by URL. `size` is optional metadata sent by the
  // client so the quota gates and the async threshold can be evaluated
  // without downloading every blob into this function.
  const blobEntries: Array<{ url: string; filename: string; size?: number }> = []

  try {
    const { tool } = await params
    const { userId } = await auth()

    // Burst protection (Upstash Redis) — complements the daily/monthly
    // quotas enforced below. Guards iLoveAPI/Adobe credits from abuse.
    const rl = await toolLimiter.limit(rateLimitKey(userId, getClientIp(req)))
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 }
      )
    }

  const contentType = req.headers.get("content-type")
  console.log("[DEBUG] Content-Type:", contentType)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    console.error("FormData parse error:", err)
    return NextResponse.json({ error: "Failed to parse file upload request" }, { status: 400 })
  }

  const files: Array<{
    buffer: Buffer
    filename: string
    password?: string
    // True when this file was re-hydrated from a direct-to-Storage blob
    // (already reachable by URL for background jobs).
    fromBlob?: boolean
  }> = []
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

  // Direct-to-Storage uploads arrive as a JSON list of `{ url, filename }`
  // pairs in the `blobUrls` form field. The client uploads the file
  // straight to Supabase Storage (bypassing the ~4.5 MB serverless body
  // cap) and hands the resulting URL back here so we can `fetch()` it.
  // The legacy `file` multipart field is kept for backward compatibility
  // with the small-file path.
  const blobUrlsRaw = formData.get("blobUrls")
  if (typeof blobUrlsRaw === "string" && blobUrlsRaw.length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(blobUrlsRaw)
    } catch (err) {
      console.error("blobUrls JSON parse error:", err)
      return NextResponse.json({ error: "Invalid blobUrls payload" }, { status: 400 })
    }
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "blobUrls must be an array" }, { status: 400 })
    }
    for (const entry of parsed) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as { url?: unknown }).url !== "string" ||
        typeof (entry as { filename?: unknown }).filename !== "string"
      ) {
        return NextResponse.json(
          { error: "Each blobUrls entry must include `url` and `filename`" },
          { status: 400 }
        )
      }
      const { url, filename, size } = entry as {
        url: string
        filename: string
        size?: unknown
      }
      // Metadata only — the bytes stay in Storage. The async pipeline
      // enqueues these URLs directly; the synchronous fallback below
      // hydrates them only when this request actually needs the buffers.
      // Downloading every blob here would burn the function timeout
      // budget before a background job had even started.
      blobEntries.push({
        url,
        filename,
        size: typeof size === "number" && Number.isFinite(size) ? size : undefined,
      })
    }
  }

  // Extract watermark image if provided (blob URL form, e.g. `watermarkImageUrl`).
  // Parsed eagerly but downloaded only when the request falls through to the
  // synchronous path — the async pipeline passes the URL straight through.
  const watermarkImageUrlRaw = formData.get("watermarkImageUrl")
  const watermarkImageUrl =
    typeof watermarkImageUrlRaw === "string" && watermarkImageUrlRaw.length > 0
      ? watermarkImageUrlRaw
      : undefined
  const watermarkImageFilenameRaw = formData.get("watermarkImageFilename")
  const watermarkImageFilename =
    typeof watermarkImageFilenameRaw === "string" && watermarkImageFilenameRaw.length > 0
      ? watermarkImageFilenameRaw
      : "watermark.png"

  const userPlan = userId ? await getUserPlan(userId) : null

  const totalFileCount = files.length + blobEntries.length
  if (totalFileCount === 0) {
    if (tool === "html-to-pdf" && options.url) {
      try {
        if (userId) {
          const gate = await canProcessFile(userId, 0, userPlan ?? "free")
          if (!gate.allowed) {
            return NextResponse.json(
              { error: gate.reason ?? "Processing limit reached", upgradeRequired: true },
              { status: 402 }
            )
          }
        } else {
          // Guest html-to-pdf path: same daily/monthly cap as the
          // file-based path, since this is still a server-side
          // processing event.
          const gate = await checkGuestLimits(1)
          if (!gate.allowed) {
            return NextResponse.json(
              {
                error: gate.reason ?? "Processing limit reached",
                upgradeRequired: true,
                redirectToSignUp: true,
              },
              { status: 402 }
            )
          }
          await incrementGuestUsage(1)
        }

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
        await recordProcessingEvent({
          userId,
          toolSlug: tool,
          status: "success",
          engine: "iloveapi",
          inputFilesCount: 1,
          outputFilename: result.downloadFilename,
          outputSizeBytes: result.outputFilesize,
          processingTimeMs: Date.now() - start,
        })
        const fileDataBase64 = Buffer.from(fileData).toString("base64")
        return NextResponse.json({
          fileData: fileDataBase64,
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

  if (userId) {
    const totalBytes =
      files.reduce((sum, f) => sum + f.buffer.byteLength, 0) +
      blobEntries.reduce((sum, e) => sum + (e.size ?? 0), 0)
    const gate = await canProcessFile(userId, totalBytes, userPlan ?? "free")
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason ?? "Processing limit reached", upgradeRequired: true },
        { status: 402 }
      )
    }
  } else {
    // Guest path: enforce the free-plan per-file cap so anonymous users
    // can't bypass the 20 MB limit by skipping the auth check. This
    // mirrors the limits advertised in the UI (which uses the same
    // `getLimitsForPlan("free")` for guests via `/api/usage`).
    const guestLimits = getLimitsForPlan("free")
    const guestMaxBytes = guestLimits.maxFileSizeMB * 1024 * 1024
    const oversized = files.find((f) => f.buffer.byteLength > guestMaxBytes)
    if (oversized) {
      return NextResponse.json(
        {
          error: `"${oversized.filename}" is ${(oversized.buffer.byteLength / (1024 * 1024)).toFixed(1)} MB. Guests can process files up to ${guestLimits.maxFileSizeMB} MB. Sign in for a free account to continue, or upgrade to Premium for files up to 4 GB.`,
          upgradeRequired: true,
        },
        { status: 402 }
      )
    }
    const oversizedBlob = blobEntries.find((e) => (e.size ?? 0) > guestMaxBytes)
    if (oversizedBlob) {
      return NextResponse.json(
        {
          error: `"${oversizedBlob.filename}" is ${((oversizedBlob.size ?? 0) / (1024 * 1024)).toFixed(1)} MB. Guests can process files up to ${guestLimits.maxFileSizeMB} MB. Sign in for a free account to continue, or upgrade to Premium for files up to 4 GB.`,
          upgradeRequired: true,
        },
        { status: 402 }
      )
    }

    // Guest daily/monthly cap (cookie-backed). One processing event =
    // one request, regardless of how many files the tool consumed (a
    // merge of 10 PDFs still costs 1 against the daily quota). The
    // client mirrors this with a pre-flight check; the server is the
    // source of truth. We increment optimistically here so a request
    // that ends up failing still costs the guest a slot — this is the
    // defensive "prevent bypass" behaviour the spec asks for.
    const gate = await checkGuestLimits(1)
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: gate.reason ?? "Processing limit reached",
          upgradeRequired: true,
          redirectToSignUp: true,
        },
        { status: 402 }
      )
    }
    await incrementGuestUsage(1)
  }

  // ── Background job (Inngest) — heavy requests ──────────────────────
  // Multi-file jobs and files above the size threshold are dispatched to
  // the Inngest function (lib/inngest/functions/tool-processing.ts): this
  // route responds immediately with a jobId and the client polls
  // /api/jobs/[jobId]. Each Inngest step runs as its own Vercel request,
  // so no single invocation ever outlives the function timeout.
  if (isInngestConfigured() && shouldEnqueueAsync(tool, files, blobEntries)) {
    // Adobe rejects >100MB inputs — fail fast before enqueueing.
    // Inline files are checked against their buffers; direct-uploaded
    // blobs aren't hydrated yet, so use the client-reported size.
    if (ADOBE_SDK_TOOLS.has(tool)) {
      const adobePreflight = adobePreflightCheck(files, tool)
      if (adobePreflight) return adobePreflight
      const oversizedBlob = blobEntries.find(
        (e) => (e.size ?? 0) > ADOBE_MAX_INPUT_BYTES
      )
      if (oversizedBlob) {
        return NextResponse.json(
          {
            error: `"${oversizedBlob.filename}" is ${((oversizedBlob.size ?? 0) / (1024 * 1024)).toFixed(1)} MB, which exceeds Adobe's ${tool} limit of 100 MB. Try splitting the PDF first.`,
          },
          { status: 413 }
        )
      }
    }

    const jobId = newJobId()
    try {
      await createJob({ jobId, userId, toolSlug: tool })

      // Every file must be reachable by the background job via a storage
      // URL. Blob-hydrated files already are; files that arrived inline
      // (small multipart uploads) are persisted now. Dedupe by name+size
      // (two distinct files may share a filename) and give each upload a
      // unique suffix so same-named files can't overwrite each other.
      const jobFiles: Array<{ url: string; filename: string }> = [...blobEntries]
      const inlineSeen = new Set<string>()
      for (const f of files) {
        if (f.fromBlob) continue
        const key = `${f.filename}:${f.buffer.byteLength}`
        if (inlineSeen.has(key)) continue
        inlineSeen.add(key)
        const stored = await uploadToStorage({
          bucket: RESULTS_BUCKET,
          pathname: `uploads/${jobId}/${safeJobFilename(f.filename)}-${randomToken()}`,
          body: f.buffer,
          contentType: "application/pdf",
        })
        jobFiles.push({ url: stored.url, filename: f.filename })
      }

      // Watermark image: pass through the direct-upload URL when present,
      // otherwise persist the in-memory buffer for the job.
      let asyncWatermarkImageUrl = watermarkImageUrl
      let asyncWatermarkImageFilename = watermarkImageFilename
      if (!asyncWatermarkImageUrl && watermarkImage) {
        const stored = await uploadToStorage({
          bucket: RESULTS_BUCKET,
          pathname: `uploads/${jobId}/watermark-${safeJobFilename(watermarkImage.filename)}`,
          body: watermarkImage.buffer,
          contentType: "application/octet-stream",
        })
        asyncWatermarkImageUrl = stored.url
        asyncWatermarkImageFilename = watermarkImage.filename
      }

      const sent = await sendEvent("tool/job.requested", {
        jobId,
        userId,
        toolSlug: tool,
        blobUrls: jobFiles,
        options,
        ...(asyncWatermarkImageUrl
          ? {
              watermarkImageUrl: asyncWatermarkImageUrl,
              watermarkImageFilename: asyncWatermarkImageFilename,
            }
          : {}),
      })
      if (!sent) throw new Error("Failed to enqueue job")

      return NextResponse.json({ jobId })
    } catch (err) {
      console.error("Failed to enqueue background job:", err)
      await deleteJob(jobId).catch(() => {})
      await deleteStoragePrefix({
        bucket: RESULTS_BUCKET,
        prefix: `uploads/${jobId}/`,
      }).catch(() => {})
      // Fall through to the synchronous path — the file buffers are still
      // in memory, so nothing about the request was consumed.
    }
  }

  // ── Synchronous fallback — hydrate file buffers now ─────────────────
  // We're here because Inngest isn't configured or the job didn't qualify
  // for the background pipeline, so the file bytes are needed in memory.
  // The direct-uploaded blobs were deliberately NOT downloaded earlier.
  if (blobEntries.length > 0) {
    for (const entry of blobEntries) {
      // Track BEFORE downloading so a download failure (502) still
      // results in the blob being cleaned up by the finally block.
      downloadedBlobUrls.push(entry.url)
      try {
        const buffer = await downloadFromStorage(entry.url)
        files.push({ buffer, filename: entry.filename, fromBlob: true })
      } catch (err) {
        console.error(`Failed to download blob ${entry.url}:`, err)
        return NextResponse.json(
          { error: `Failed to download uploaded file "${entry.filename}"` },
          { status: 502 }
        )
      }
    }
  }
  if (watermarkImageUrl && !watermarkImage) {
    downloadedBlobUrls.push(watermarkImageUrl)
    try {
      const buffer = await downloadFromStorage(watermarkImageUrl)
      watermarkImage = { buffer, filename: watermarkImageFilename }
    } catch (err) {
      console.error(`Failed to download watermark blob ${watermarkImageUrl}:`, err)
      return NextResponse.json(
        { error: "Failed to download watermark image" },
        { status: 502 }
      )
    }
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
        const pdfFilename = `pdf_${i + 1}.pdf`
        zip.file(pdfFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "converted-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
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
    const preflight = adobePreflightCheck(files, "OCR")
    if (preflight) return preflight
    try {
      const start = Date.now()

      if (files.length > 1) {
        const JSZip = (await import("jszip")).default
        const zip = new JSZip()

        const ocrLanguages = (options.ocr_languages as string[]) || ["en-US"]
        const locale = resolveOcrLocale(ocrLanguages[0])

        console.log(`[OCR] Processing ${files.length} files`)

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          console.log(`[OCR] Processing file ${i + 1}/${files.length}: ${file.filename}`)
          const result = await ocrPdfAdobe(file.buffer, file.filename, locale)
          console.log(`[OCR] Result for ${file.filename}: buffer length = ${result.buffer.length}`)
          const ocrFilename = `ocr_${i + 1}.pdf`
          console.log(`[OCR] Adding to zip as: ${ocrFilename}`)
          zip.file(ocrFilename, result.buffer)
          if (i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" })
        console.log(`[OCR] ZIP generated, size: ${zipBuffer.length} bytes`)
        const elapsed = ((Date.now() - start) / 1000).toFixed(2)
        await recordProcessingEvent({
          userId,
          toolSlug: tool,
          status: "success",
          engine: "adobe",
          inputFilesCount: files.length,
          outputFilename: "ocr-pdfs.zip",
          outputSizeBytes: zipBuffer.byteLength,
          processingTimeMs: Date.now() - start,
        })
        const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "ocr-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
      }

      const ocrLanguages = (options.ocr_languages as string[]) || ["en-US"]
      const locale = resolveOcrLocale(ocrLanguages[0])

      const result = await ocrPdfAdobe(
        files[0].buffer,
        files[0].filename,
        locale
      )

      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "adobe",
        inputFilesCount: 1,
        outputFilename: result.filename,
        outputSizeBytes: result.buffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const ocrBase64 = Buffer.from(result.buffer).toString("base64")
      return NextResponse.json({
        fileData: ocrBase64,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      return adobeErrorResponse(err, "Failed to process PDF with OCR")
    }
  }

  if (tool === "pdf-to-excel") {
    const preflight = adobePreflightCheck(files, "PDF to Excel")
    if (preflight) return preflight
    try {
      const start = Date.now()

      if (files.length > 1) {
        const JSZip = (await import("jszip")).default
        const zip = new JSZip()

        console.log(`[Excel] Processing ${files.length} files`)

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          console.log(`[Excel] Processing file ${i + 1}/${files.length}: ${file.filename}`)
          const result = await convertPdfToExcel(file.buffer, file.filename)
          console.log(`[Excel] Result for ${file.filename}: buffer length = ${result.buffer.length}`)
          const excelFilename = `excel_${i + 1}.xlsx`
          console.log(`[Excel] Adding to zip as: ${excelFilename}`)
          zip.file(excelFilename, result.buffer)
          if (i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" })
        console.log(`[Excel] ZIP generated, size: ${zipBuffer.length} bytes`)
        const elapsed = ((Date.now() - start) / 1000).toFixed(2)
        await recordProcessingEvent({
          userId,
          toolSlug: tool,
          status: "success",
          engine: "adobe",
          inputFilesCount: files.length,
          outputFilename: "converted-excels.zip",
          outputSizeBytes: zipBuffer.byteLength,
          processingTimeMs: Date.now() - start,
        })
        const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "converted-excels.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
      }

      const result = await convertPdfToExcel(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "adobe",
        inputFilesCount: 1,
        outputFilename: result.filename,
        outputSizeBytes: result.buffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const excelBase64 = Buffer.from(result.buffer).toString("base64")
      return NextResponse.json({
        fileData: excelBase64,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      return adobeErrorResponse(err, "Failed to convert PDF to Excel format")
    }
  }

  if (tool === "pdf-to-word") {
    const preflight = adobePreflightCheck(files, "PDF to Word")
    if (preflight) return preflight
    try {
      const start = Date.now()

      if (files.length > 1) {
        const JSZip = (await import("jszip")).default
        const zip = new JSZip()

        console.log(`[Word] Processing ${files.length} files`)

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          console.log(`[Word] Processing file ${i + 1}/${files.length}: ${file.filename}`)
          const result = await convertPdfToWordAdobe(file.buffer, file.filename)
          console.log(`[Word] Result for ${file.filename}: buffer length = ${result.buffer.length}`)
          const wordFilename = `word_${i + 1}.docx`
          console.log(`[Word] Adding to zip as: ${wordFilename}`)
          zip.file(wordFilename, result.buffer)
          if (i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" })
        console.log(`[Word] ZIP generated, size: ${zipBuffer.length} bytes`)
        const elapsed = ((Date.now() - start) / 1000).toFixed(2)
        await recordProcessingEvent({
          userId,
          toolSlug: tool,
          status: "success",
          engine: "adobe",
          inputFilesCount: files.length,
          outputFilename: "converted-words.zip",
          outputSizeBytes: zipBuffer.byteLength,
          processingTimeMs: Date.now() - start,
        })
        const zipBase64 = Buffer.from(zipBuffer).toString("base64")
        return NextResponse.json({
          fileData: zipBase64,
          filename: "converted-words.zip",
          processingTime: elapsed,
          outputSize: zipBuffer.byteLength,
        })
      }

      const result = await convertPdfToWordAdobe(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "adobe",
        inputFilesCount: 1,
        outputFilename: result.filename,
        outputSizeBytes: result.buffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const wordBase64 = Buffer.from(result.buffer).toString("base64")
      return NextResponse.json({
        fileData: wordBase64,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      return adobeErrorResponse(err, "Failed to convert PDF to Word format")
    }
  }

  if (tool === "pdf-to-powerpoint") {
    const preflight = adobePreflightCheck(files, "PDF to PowerPoint")
    if (preflight) return preflight
    try {
      const start = Date.now()

      if (files.length > 1) {
        const JSZip = (await import("jszip")).default
        const zip = new JSZip()

        console.log(`[PowerPoint] Processing ${files.length} files`)

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          console.log(`[PowerPoint] Processing file ${i + 1}/${files.length}: ${file.filename}`)
          const result = await convertPdfToPowerpointAdobe(file.buffer, file.filename)
          console.log(`[PowerPoint] Result for ${file.filename}: buffer length = ${result.buffer.length}`)
          const pptxFilename = `powerpoint_${i + 1}.pptx`
          console.log(`[PowerPoint] Adding to zip as: ${pptxFilename}`)
          zip.file(pptxFilename, result.buffer)
          if (i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }

        const zipBuffer = await zip.generateAsync({ type: "uint8array" })
        console.log(`[PowerPoint] ZIP generated, size: ${zipBuffer.length} bytes`)
        const elapsed = ((Date.now() - start) / 1000).toFixed(2)
        await recordProcessingEvent({
          userId,
          toolSlug: tool,
          status: "success",
          engine: "adobe",
          inputFilesCount: files.length,
          outputFilename: "converted-powerpoints.zip",
          outputSizeBytes: zipBuffer.byteLength,
          processingTimeMs: Date.now() - start,
        })
        const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "converted-powerpoints.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
      }

      const result = await convertPdfToPowerpointAdobe(
        files[0].buffer,
        files[0].filename
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)

      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "adobe",
        inputFilesCount: 1,
        outputFilename: result.filename,
        outputSizeBytes: result.buffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const pptxBase64 = Buffer.from(result.buffer).toString("base64")
      return NextResponse.json({
        fileData: pptxBase64,
        filename: result.filename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      return adobeErrorResponse(err, "Failed to convert PDF to PowerPoint format")
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

      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputSizeBytes: resultText.length,
        processingTimeMs: Date.now() - start,
      })
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
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "pdf-lib",
        inputFilesCount: files.length,
        outputFilename: result.downloadFilename,
        outputSizeBytes: result.buffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const rotateBase64 = Buffer.from(result.buffer).toString("base64")
      return NextResponse.json({
        fileData: rotateBase64,
        filename: result.downloadFilename,
        processingTime: elapsed,
        outputSize: result.buffer.byteLength,
      })
    } catch (err) {
      console.error("Rotate PDF processing error:", err)
      return NextResponse.json({ error: "Failed to rotate PDF" }, { status: 500 })
    }
  }

  if (tool === "compress-pdf" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const singleResult = await runTool({
          tool: "compress",
          files: [file],
          options: { ...options },
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const compressedFilename = `compressed_${i + 1}.pdf`
        zip.file(compressedFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "compressed-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const compressBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: compressBase64,
        filename: "compressed-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Compress PDF (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to compress PDFs" }, { status: 500 })
    }
  }

  if (tool === "repair-pdf" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const singleResult = await runTool({
          tool: "repair",
          files: [file],
          options: { ...options },
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const repairedFilename = `repaired_${i + 1}.pdf`
        zip.file(repairedFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "repaired-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "repaired-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Repair PDF (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to repair PDFs" }, { status: 500 })
    }
  }

  if (tool === "scan-to-pdf" && options.merge_after === false) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      const CONCURRENCY = 4
      let successCount = 0
      const failures: { index: number; filename: string; error: unknown }[] = []

      console.log(`[ScanPDF] Processing ${files.length} files with concurrency=${CONCURRENCY}`)

      const tasks = files.map((file, i) => async () => {
        try {
          const singleResult = await runTool({
            tool: "imagepdf",
            files: [file],
            options: { ...options },
          })
          const pdfBuffer = singleResult.buffer instanceof Uint8Array
            ? singleResult.buffer
            : new Uint8Array(singleResult.buffer as ArrayBuffer)
          const pdfFilename = `pdf_${i + 1}.pdf`
          zip.file(pdfFilename, pdfBuffer)
          successCount++
          console.log(`[ScanPDF] Added to zip: ${pdfFilename}`)
        } catch (err) {
          console.warn(`[ScanPDF] File ${i + 1} (${file.filename}) failed:`, err)
          failures.push({ index: i, filename: file.filename, error: err })
        }
      })

      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const chunk = tasks.slice(i, i + CONCURRENCY)
        await Promise.allSettled(chunk.map((t) => t()))
      }

      if (successCount === 0) {
        console.error(`[ScanPDF] All ${files.length} files failed`)
        return NextResponse.json({ error: "Failed to convert images to PDF" }, { status: 500 })
      }

      if (failures.length > 0) {
        console.warn(`[ScanPDF] ${failures.length}/${files.length} files failed but ${successCount} succeeded`)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "scanned-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "scanned-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Scan to PDF (no merge) processing error:", err)
      return NextResponse.json({ error: "Failed to convert images to PDF" }, { status: 500 })
    }
  }

  if ((tool === "word-to-pdf" || tool === "excel-to-pdf" || tool === "powerpoint-to-pdf") && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      // Process files concurrently (same pattern as the scan-to-pdf
      // branch) so a large batch finishes inside the function timeout
      // even when the job can't be dispatched to the Inngest pipeline.
      // Per-file failures are collected and skipped — the zip still
      // ships with every file that converted.
      const CONCURRENCY = 4
      let successCount = 0
      const failures: { index: number; filename: string; error: unknown }[] = []

      console.log(`[OfficePDF] Processing ${files.length} files with concurrency=${CONCURRENCY}`)

      const tasks = files.map((file, i) => async () => {
        try {
          const singleResult = await runTool({
            tool: "officepdf",
            files: [file],
            options: { ...options },
          })
          const pdfBuffer = singleResult.buffer instanceof Uint8Array
            ? singleResult.buffer
            : new Uint8Array(singleResult.buffer as ArrayBuffer)
          const pdfFilename = `pdf_${i + 1}.pdf`
          zip.file(pdfFilename, pdfBuffer)
          successCount++
          console.log(`[OfficePDF] Added to zip: ${pdfFilename}`)
        } catch (err) {
          console.warn(`[OfficePDF] File ${i + 1} (${file.filename}) failed:`, err)
          failures.push({ index: i, filename: file.filename, error: err })
        }
      })

      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const chunk = tasks.slice(i, i + CONCURRENCY)
        await Promise.allSettled(chunk.map((t) => t()))
      }

      if (successCount === 0) {
        console.error(`[OfficePDF] All ${files.length} files failed`)
        return NextResponse.json({ error: `Failed to convert files to PDF` }, { status: 500 })
      }

      if (failures.length > 0) {
        console.warn(`[OfficePDF] ${failures.length}/${files.length} files failed but ${successCount} succeeded`)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "converted-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "converted-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error(`${tool} (multiple) processing error:`, err)
      return NextResponse.json({ error: `Failed to convert files to PDF` }, { status: 500 })
    }
  }

  if (tool === "pdf-to-pdfa" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      console.log(`[PDFA] Processing ${files.length} files`)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`[PDFA] Processing file ${i + 1}/${files.length}: ${file.filename}`)
        const singleResult = await runTool({
          tool: "pdfa",
          files: [file],
          options: { ...options },
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const pdfaFilename = `pdfa_${i + 1}.pdf`
        console.log(`[PDFA] Adding to zip as: ${pdfaFilename}`)
        zip.file(pdfaFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      console.log(`[PDFA] ZIP generated, size: ${zipBuffer.length} bytes`)
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "converted-pdfas.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "converted-pdfas.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("PDF to PDF/A (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to convert PDF to PDF/A format" }, { status: 500 })
    }
  }

  if (tool === "watermark-pdf" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      const optionsWithoutSlug = { ...options }
      delete optionsWithoutSlug._toolSlug
      const filePages = (optionsWithoutSlug.filePages as Record<number, string>) || {}
      delete optionsWithoutSlug.filePages
      const cleanOptions = mapWatermarkOptions(optionsWithoutSlug)

      console.log(`[Watermark] Processing ${files.length} files`)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`[Watermark] Processing file ${i + 1}/${files.length}: ${file.filename}`)

        const fileOptions = { ...cleanOptions }
        if (filePages[i]) {
          fileOptions.pages = filePages[i]
        }

        const runToolInput: Parameters<typeof runTool>[0] = {
          tool: "watermark",
          files: [file],
          options: fileOptions as unknown as Record<string, unknown>,
        }
        if (watermarkImage) {
          runToolInput.watermarkImage = watermarkImage
        }

        const singleResult = await runTool(runToolInput)
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const watermarkFilename = `watermark_${i + 1}.pdf`
        console.log(`[Watermark] Adding to zip as: ${watermarkFilename}`)
        zip.file(watermarkFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      console.log(`[Watermark] ZIP generated, size: ${zipBuffer.length} bytes`)
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "watermarked-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "watermarked-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Watermark PDF (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to watermark PDF files" }, { status: 500 })
    }
  }

  if (tool === "protect-pdf" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      console.log(`[Protect] Processing ${files.length} files`)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`[Protect] Processing file ${i + 1}/${files.length}: ${file.filename}`)
        const singleResult = await runTool({
          tool: "protect",
          files: [file],
          options: { ...options },
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const protectedFilename = `protected_${i + 1}.pdf`
        console.log(`[Protect] Adding to zip as: ${protectedFilename}`)
        zip.file(protectedFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      console.log(`[Protect] ZIP generated, size: ${zipBuffer.length} bytes`)
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "protected-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "protected-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Protect PDF (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to protect PDF files" }, { status: 500 })
    }
  }

  if (tool === "add-page-numbers" && files.length > 1) {
    try {
      const start = Date.now()
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      const optionsWithoutSlug = { ...options }
      delete optionsWithoutSlug._toolSlug
      const filePages = (optionsWithoutSlug.filePages as Record<number, string>) || {}
      delete optionsWithoutSlug.filePages
      const cleanOptions = mapPageNumberOptions(optionsWithoutSlug)

      console.log(`[PageNumber] Processing ${files.length} files`)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`[PageNumber] Processing file ${i + 1}/${files.length}: ${file.filename}`)

        const fileOptions = { ...cleanOptions }
        if (filePages[i]) {
          fileOptions.pages = filePages[i]
        }

        const singleResult = await runTool({
          tool: "pagenumber",
          files: [file],
          options: fileOptions as unknown as Record<string, unknown>,
        })
        const pdfBuffer = singleResult.buffer instanceof Uint8Array
          ? singleResult.buffer
          : new Uint8Array(singleResult.buffer as ArrayBuffer)
        const pagenumberFilename = `pagenumber_${i + 1}.pdf`
        console.log(`[PageNumber] Adding to zip as: ${pagenumberFilename}`)
        zip.file(pagenumberFilename, pdfBuffer)
      }

      const zipBuffer = await zip.generateAsync({ type: "uint8array" })
      console.log(`[PageNumber] ZIP generated, size: ${zipBuffer.length} bytes`)
      const elapsed = ((Date.now() - start) / 1000).toFixed(2)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "success",
        engine: "iloveapi",
        inputFilesCount: files.length,
        outputFilename: "paged-pdfs.zip",
        outputSizeBytes: zipBuffer.byteLength,
        processingTimeMs: Date.now() - start,
      })
      const zipBase64 = Buffer.from(zipBuffer).toString("base64")
      return NextResponse.json({
        fileData: zipBase64,
        filename: "paged-pdfs.zip",
        processingTime: elapsed,
        outputSize: zipBuffer.byteLength,
      })
    } catch (err) {
      console.error("Add Page Numbers (multiple) processing error:", err)
      return NextResponse.json({ error: "Failed to add page numbers to PDF files" }, { status: 500 })
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
    if (tool === "add-page-numbers") {
      cleanOptions = mapPageNumberOptions(cleanOptions)
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
    const timerSeconds = Number(result.timer)
    const processingTimeMs = Number.isFinite(timerSeconds) ? Math.round(timerSeconds * 1000) : undefined
    await recordProcessingEvent({
      userId,
      toolSlug: tool,
      status: "success",
      engine: "iloveapi",
      inputFilesCount: files.length,
      outputFilename: downloadFilename,
      outputSizeBytes: fileData.byteLength,
      processingTimeMs,
    })
    const fileDataBase64 = Buffer.from(fileData).toString("base64")
    return NextResponse.json({
      fileData: fileDataBase64,
      filename: downloadFilename,
      processingTime: String(result.timer),
      outputSize: result.outputFilesize,
    })
  } catch (err) {
    if (err instanceof ILoveAPIError) {
      console.error("[ILoveAPIError Detailed]", JSON.stringify(err, null, 2))
      const { userMessage } = mapILoveAPIError(err)
      await recordProcessingEvent({
        userId,
        toolSlug: tool,
        status: "error",
        engine: "iloveapi",
        inputFilesCount: files.length,
        errorMessage: userMessage,
      })
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
    await recordProcessingEvent({
      userId,
      toolSlug: tool,
      status: "error",
      engine: "iloveapi",
      inputFilesCount: files.length,
      errorMessage: errMessage,
    })
    return NextResponse.json({ error: errMessage }, { status: 500 })
  }
  } finally {
    // Clean up the uploaded source blobs regardless of whether the
    // request produced a usable result. Deleting in parallel keeps it
    // fast; `deleteFromStorage` swallows per-URL errors so one bad URL
    // can't block the others.
    await Promise.allSettled(
      downloadedBlobUrls.map((url) => deleteFromStorage(url))
    )
  }
}
