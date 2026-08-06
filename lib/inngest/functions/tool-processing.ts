// lib/inngest/functions/tool-processing.ts
// The background processor for heavy PDF jobs.
//
// Triggered by `tool/job.requested` (sent from the async branch of
// `/api/tools/[tool]`). Each job runs as Inngest steps:
//
//   - Adobe / local tools: one `step.run` per file, so every file gets a
//     fresh Vercel invocation + timeout window instead of one monolithic
//     request.
//   - iLoveAPI tools: tasks are started in webhook mode and the function
//     parks on `step.waitForEvent("iloveapi/task.completed", …)` while
//     iLovePDF does the heavy lifting — no serverless function is held
//     open at all.
//
// Results are uploaded to Supabase Storage (`results/<jobId>/…`), zipped
// when a job produced multiple files, and the job record in
// `lib/jobs.ts` is updated so the client can poll `/api/jobs/[jobId]`.

import { inngest } from "@/lib/inngest/client"
import { getJob, RESULTS_BUCKET, updateJob } from "@/lib/jobs"
import {
  deleteFromStorage,
  downloadFromStorage,
  uploadToStorage,
} from "@/lib/supabase-storage"
import { startTaskWithWebhook, type StartedTask } from "@/lib/iloveapi/webhook"
import { runTool } from "@/lib/iloveapi/tools"
import { getToolBySlug } from "@/lib/tools-config"
import { mapPageNumberOptions } from "@/lib/iloveapi/page-number-mapper"
import { mapWatermarkOptions } from "@/lib/iloveapi/watermark-mapper"
import {
  convertPdfToPowerpointAdobe,
  convertPdfToWordAdobe,
  ocrPdfAdobe,
  resolveOcrLocale,
} from "@/lib/pdf/adobe-export-converter"
import { convertPdfToExcel } from "@/lib/pdf/office-converter"
import { processRotateLocal } from "@/lib/pdf/rotate-client"
import { recordProcessingEvent } from "@/lib/usage"

export interface ToolJobData {
  jobId: string
  userId: string | null
  toolSlug: string
  blobUrls: Array<{ url: string; filename: string }>
  options: Record<string, unknown>
  watermarkImageUrl?: string
  watermarkImageFilename?: string
}

const ADOBE_TOOLS = new Set([
  "ocr-pdf",
  "pdf-to-excel",
  "pdf-to-word",
  "pdf-to-powerpoint",
])

// Tools whose multi-file path runs one iLoveAPI task per file (the
// route zips the individual results). jpg-to-pdf / scan-to-pdf only
// loop when `merge_after` is false, otherwise they merge in one task.
const PER_FILE_ILOVEAPI_TOOLS = new Set([
  "compress-pdf",
  "repair-pdf",
  "jpg-to-pdf",
  "scan-to-pdf",
  "word-to-pdf",
  "excel-to-pdf",
  "powerpoint-to-pdf",
  "pdf-to-pdfa",
  "watermark-pdf",
  "protect-pdf",
  "add-page-numbers",
])

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return cleaned.length > 0 ? cleaned : "output.pdf"
}

function byteLength(b: ArrayBuffer | Uint8Array): number {
  return b.byteLength
}

/** Strips client-only fields and applies tool-specific option mapping —
 *  mirrors the cleanup the sync route performs before `runTool`. */
function cleanIloveapiOptions(
  toolSlug: string,
  options: Record<string, unknown>
): Record<string, unknown> {
  const clean = { ...options }
  delete clean._toolSlug
  if (toolSlug === "watermark-pdf") {
    return mapWatermarkOptions(clean) as unknown as Record<string, unknown>
  }
  if (toolSlug === "add-page-numbers") {
    return mapPageNumberOptions(clean) as unknown as Record<string, unknown>
  }
  if (toolSlug !== "watermark-pdf") delete clean.mode
  delete clean.ocr_languages
  return clean
}

function getWebhookBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  )
}

function iloveapiToolFor(toolSlug: string): string {
  const config = getToolBySlug(toolSlug)
  return typeof config?.iloveapiTool === "string" ? config.iloveapiTool : toolSlug
}

interface TaskPlan {
  files: Array<{ url: string; filename: string }>
  options: Record<string, unknown>
  watermarkImage?: { url: string; filename: string }
}

/**
 * Decides how a job's files map onto iLoveAPI tasks: one task per file
 * (loop tools), one task with all files (merge-style tools), or one
 * task for a URL (html-to-pdf).
 */
function buildTaskPlans(data: ToolJobData): TaskPlan[] {
  const { toolSlug, blobUrls, options, watermarkImageUrl, watermarkImageFilename } = data

  const mergeFlagged = toolSlug === "jpg-to-pdf" || toolSlug === "scan-to-pdf"
  const perFileLoop =
    (PER_FILE_ILOVEAPI_TOOLS.has(toolSlug) && !mergeFlagged) ||
    (mergeFlagged && options.merge_after === false)

  const filePages = (options.filePages as Record<number, string> | undefined) || {}
  const optionsForAll = { ...options }
  delete optionsForAll.filePages
  const baseOptions = cleanIloveapiOptions(toolSlug, optionsForAll)

  const watermarkImage =
    toolSlug === "watermark-pdf" && watermarkImageUrl
      ? { url: watermarkImageUrl, filename: watermarkImageFilename ?? "watermark.png" }
      : undefined

  if (perFileLoop && blobUrls.length > 0) {
    return blobUrls.map((entry, i) => {
      const fileOptions: Record<string, unknown> = { ...baseOptions }
      if (filePages[i]) fileOptions.pages = filePages[i]
      return { files: [entry], options: fileOptions, watermarkImage }
    })
  }

  if (blobUrls.length > 0) {
    return [{ files: blobUrls, options: baseOptions, watermarkImage }]
  }

  // html-to-pdf style: no uploaded files, the page URL lives in options.
  return [{ files: [], options: { ...baseOptions, url: options.url }, watermarkImage }]
}

async function processSingleFile(
  toolSlug: string,
  buffer: Buffer,
  filename: string,
  options: Record<string, unknown>
): Promise<{ buffer: ArrayBuffer | Uint8Array; filename: string }> {
  if (toolSlug === "rotate-pdf") {
    const r = await processRotateLocal([{ buffer, filename }], options)
    return { buffer: r.buffer, filename: r.downloadFilename }
  }
  if (toolSlug === "ocr-pdf") {
    const langs = (options.ocr_languages as string[]) || ["en-US"]
    const locale = resolveOcrLocale(langs[0])
    const r = await ocrPdfAdobe(buffer, filename, locale)
    return { buffer: r.buffer, filename: r.filename }
  }
  if (toolSlug === "pdf-to-excel") {
    const r = await convertPdfToExcel(buffer, filename)
    return { buffer: r.buffer, filename: r.filename }
  }
  if (toolSlug === "pdf-to-word") {
    const r = await convertPdfToWordAdobe(buffer, filename)
    return { buffer: r.buffer, filename: r.filename }
  }
  if (toolSlug === "pdf-to-powerpoint") {
    const r = await convertPdfToPowerpointAdobe(buffer, filename)
    return { buffer: r.buffer, filename: r.filename }
  }
  throw new Error(`Unsupported tool for per-file processing: ${toolSlug}`)
}

export const processToolJob = inngest.createFunction(
  {
    id: "process-tool-job",
    retries: 2,
    triggers: { event: "tool/job.requested" },
  },
  async ({ event, step }) => {
    const data = event.data as unknown as ToolJobData
    const { jobId, userId, toolSlug, blobUrls, options } = data
    const isAdobe = ADOBE_TOOLS.has(toolSlug)
    const isLocalRotate = toolSlug === "rotate-pdf"
    const multi = blobUrls.length > 1

    const results: Array<{ url: string; filename: string; size: number }> = []

    try {
      // Job store is best-effort — never fail the run because the
      // status blob couldn't be written.
      await step
        .run("mark-processing", async () => {
          await updateJob(jobId, { status: "processing" }).catch(() => {})
          return true
        })
        .catch(() => {})

      if (isAdobe || isLocalRotate) {
        // Per-file steps: each file gets its own function invocation,
        // so each gets a fresh Vercel timeout window.
        for (let i = 0; i < blobUrls.length; i++) {
          const entry = blobUrls[i]
          const res = await step.run(`process-file-${i}`, async () => {
            const buffer = await downloadFromStorage(entry.url)
            const out = await processSingleFile(toolSlug, buffer, entry.filename, options)
            const stored = await uploadToStorage({
              bucket: RESULTS_BUCKET,
              pathname: `results/${jobId}/${i}-${safeFilename(entry.filename)}`,
              body: out.buffer,
              contentType:
                out.filename.toLowerCase().endsWith(".xlsx")
                  ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  : "application/pdf",
            })
            return { url: stored.url, filename: out.filename, size: byteLength(out.buffer) }
          })
          results.push(res)
        }
      } else {
        const webhookBase = getWebhookBase()
        const plans = buildTaskPlans(data)
        const iloveapiTool = iloveapiToolFor(toolSlug)

        if (webhookBase) {
          // Webhook mode: start every task, then park on events. No
          // serverless function is held open while iLovePDF works.
          const webhookUrl = `${webhookBase}/api/webhooks/iloveapi?jobId=${jobId}`
          const started = await step.run("start-iloveapi-tasks", async () => {
            const tasks: StartedTask[] = []
            for (const plan of plans) {
              tasks.push(
                await startTaskWithWebhook({
                  tool: iloveapiTool,
                  files: plan.files,
                  options: plan.options,
                  webhookUrl,
                  watermarkImage: plan.watermarkImage,
                })
              )
            }
            return tasks
          })

          for (const t of started) {
            const evt = await step.waitForEvent(`wait-${t.taskId}`, {
              event: "iloveapi/task.completed",
              match: `event.data.taskId == '${t.taskId}'`,
              timeout: "30m",
            })
            const d = (evt as { data?: Record<string, unknown> } | null)?.data
            if (!evt || !d) {
              throw new Error(`Timed out waiting for iLoveAPI task ${t.taskId}`)
            }
            if (typeof d.error === "string" && d.error.length > 0) {
              throw new Error(d.error)
            }
            results.push({
              url: String(d.url),
              filename: String(d.filename || "output.pdf"),
              size: Number(d.size) || 0,
            })
          }
        } else {
          // Fallback (no public webhook URL): block inside per-task
          // steps. Each task is still its own invocation, so multi-file
          // jobs get per-file timeout windows.
          for (let i = 0; i < plans.length; i++) {
            const plan = plans[i]
            const res = await step.run(`process-task-${i}`, async () => {
              // unlock-pdf: the password travels in options for async jobs
              // (the sync route moves it onto each file) — apply it here.
              const password =
                typeof plan.options.password === "string"
                  ? plan.options.password
                  : undefined
              const opts = { ...plan.options }
              if (password) delete opts.password
              const files: Array<{
                buffer: Buffer
                filename: string
                password?: string
              }> = []
              for (const f of plan.files) {
                files.push({
                  buffer: await downloadFromStorage(f.url),
                  filename: f.filename,
                  ...(password ? { password } : {}),
                })
              }
              let watermarkImage: { buffer: Buffer; filename: string } | undefined
              if (plan.watermarkImage) {
                watermarkImage = {
                  buffer: await downloadFromStorage(plan.watermarkImage.url),
                  filename: plan.watermarkImage.filename,
                }
              }
              const r = await runTool({
                tool: iloveapiTool,
                files,
                options: opts,
                ...(watermarkImage ? { watermarkImage } : {}),
              })
              const stored = await uploadToStorage({
                bucket: RESULTS_BUCKET,
                pathname: `results/${jobId}/${i}-result-${safeFilename(r.downloadFilename)}`,
                body: r.buffer,
                contentType: "application/pdf",
              })
              return {
                url: stored.url,
                filename: r.downloadFilename,
                size: r.outputFilesize || byteLength(r.buffer),
              }
            })
            results.push(res)
          }
        }
      }

      // Finalize: zip multiple results into one download, else keep the
      // single result as-is.
      const final = await step.run("finalize", async () => {
        if (multi) {
          const JSZip = (await import("jszip")).default
          const zip = new JSZip()
          for (const r of results) {
            const buf = await downloadFromStorage(r.url)
            zip.file(r.filename, buf)
            // Per-file results are superseded by the zip.
            await deleteFromStorage(r.url).catch(() => {})
          }
          const zipBuffer = await zip.generateAsync({ type: "uint8array" })
          const stored = await uploadToStorage({
            bucket: RESULTS_BUCKET,
            pathname: `results/${jobId}/output.zip`,
            body: zipBuffer,
            contentType: "application/zip",
          })
          return { url: stored.url, filename: "output.zip", size: zipBuffer.byteLength }
        }
        return results[0]
      })

      await step.run("complete", async () => {
        // If the user cancelled while this job was running, drop the
        // result instead of resurrecting the record.
        const current = await getJob(jobId).catch(() => null)
        if (current?.status === "cancelled") {
          await Promise.allSettled(blobUrls.map((u) => deleteFromStorage(u.url)))
          if (data.watermarkImageUrl) {
            await deleteFromStorage(data.watermarkImageUrl).catch(() => {})
          }
          return
        }

        await updateJob(jobId, {
          status: "completed",
          resultUrl: final.url,
          filename: final.filename,
          outputSize: final.size,
        })
        await recordProcessingEvent({
          userId,
          toolSlug,
          status: "success",
          engine: isAdobe ? "adobe" : isLocalRotate ? "pdf-lib" : "iloveapi",
          inputFilesCount: blobUrls.length,
          outputFilename: final.filename,
          outputSizeBytes: final.size,
        })
        // Source blobs are no longer needed once the job is done.
        await Promise.allSettled(blobUrls.map((u) => deleteFromStorage(u.url)))
        if (data.watermarkImageUrl) {
          await deleteFromStorage(data.watermarkImageUrl).catch(() => {})
        }
      })

      return { ok: true, jobId }
    } catch (err) {
      console.error(`[inngest] tool job ${jobId} failed:`, err)
      await updateJob(jobId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Processing failed",
      }).catch(() => {})
      throw err
    }
  }
)
