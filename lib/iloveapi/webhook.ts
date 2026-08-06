// lib/iloveapi/webhook.ts
// Webhook-mode iLoveAPI task management.
//
// The synchronous path (`runTool` in lib/iloveapi/tools.ts) blocks the
// serverless function while iLovePDF processes the task, which is the
// root cause of Vercel timeouts on heavy PDFs. This module offers the
// async alternative:
//
//   1. `startTaskWithWebhook` starts a task, uploads the files and
//      requests processing WITH a `webhook` URL — the process endpoint
//      returns immediately (status "TaskAccepted") instead of holding
//      the connection open.
//   2. iLovePDF calls the webhook when the task finishes.
//   3. `downloadTaskResult` fetches the finished file.
//
// We deliberately bypass the SDK's `process()` here: it validates the
// response for synchronous fields (`download_filename`, `filesize`, …)
// that webhook-mode responses don't include, and would throw.

import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile"
import { ilovepdf, getRawToken } from "./client"
import type { ILoveAPITool } from "./types"

export interface WebhookSourceFile {
  /** Supabase Storage public URL — iLovePDF fetches it directly. */
  url?: string
  /** Raw bytes (for small inline files). */
  buffer?: Buffer
  filename: string
  password?: string
  rotate?: 0 | 90 | 180 | 270
}

export interface StartTaskWithWebhookInput {
  tool: string
  files: WebhookSourceFile[]
  options?: Record<string, unknown>
  /** Full public webhook URL, e.g. `https://app/api/webhooks/iloveapi?jobId=…` */
  webhookUrl: string
  watermarkImage?: { url?: string; buffer?: Buffer; filename: string }
}

export interface StartedTask {
  taskId: string
  server: string
  tool: string
}

export interface DownloadResult {
  buffer: Buffer
  filename?: string
  contentType: string
}

/**
 * Starts an iLoveAPI task in webhook mode: task created, files uploaded
 * (by URL or buffer), and `process` called with the given webhook URL.
 * Resolves as soon as iLovePDF accepts the task — it does NOT wait for
 * the result.
 */
export async function startTaskWithWebhook(
  input: StartTaskWithWebhookInput
): Promise<StartedTask> {
  const task = ilovepdf.newTask(input.tool as ILoveAPITool)
  await task.start()
  const taskMeta = task as unknown as { id: string; type: string; server: string }

  const files: WebhookSourceFile[] = [...input.files]
  const processOptions: Record<string, unknown> = { ...input.options }

  // unlock-pdf: for async jobs the password travels in `options` (the
  // sync route moves it onto each file before processing). Attach it to
  // every file here, mirroring that per-file behavior.
  const sharedPassword =
    typeof processOptions.password === "string" ? processOptions.password : undefined
  if (sharedPassword) delete processOptions.password

  // html-to-pdf: the page URL is added as a cloud file, mirroring the
  // sync runTool path (addFile(url) + strip `url` from process options).
  if (input.tool === "htmlpdf" && typeof processOptions.url === "string") {
    files.push({ url: processOptions.url, filename: "index.html" })
    delete processOptions.url
  }

  for (const f of files) {
    if (f.url) {
      await task.addFile(f.url)
    } else if (f.buffer) {
      const file = ILovePDFFile.fromArray(f.buffer, f.filename)
      if (f.password || sharedPassword) {
        ;(file as unknown as { params?: Record<string, unknown> }).params = {
          ...(file as unknown as { params?: Record<string, unknown> }).params,
          password: f.password ?? sharedPassword,
        }
      }
      if (f.rotate !== undefined) {
        ;(file as unknown as { params?: Record<string, unknown> }).params = {
          ...(file as unknown as { params?: Record<string, unknown> }).params,
          rotate: f.rotate,
        }
      }
      await task.addFile(file)
    }
  }

  // Watermark tool (image mode): the SDK adds the image as a task file
  // AND passes its server filename in the `image` option.
  if (input.watermarkImage) {
    const w = input.watermarkImage
    const added = w.url
      ? await task.addFile(w.url)
      : await task.addFile(ILovePDFFile.fromArray(w.buffer as Buffer, w.filename))
    const serverFilename = (added as unknown as { serverFilename?: string }).serverFilename
    if (serverFilename && processOptions.mode === "image") {
      processOptions.image = serverFilename
    }
  }

  processOptions.webhook = input.webhookUrl

  // `getFilesBodyFormat` is protected in the SDK's type, but it's a real
  // method on the compiled task and produces the exact payload the API
  // expects for the `files` field.
  const filesBody = (
    task as unknown as {
      getFilesBodyFormat(): Array<{
        server_filename: string
        filename: string
        rotate?: number
        password?: string
      }>
    }
  ).getFilesBodyFormat()

  // URL-added files (cloud files) don't carry password params; apply the
  // shared unlock password to every file entry so unlock works in webhook
  // mode regardless of how the file was added.
  if (sharedPassword) {
    for (const entry of filesBody) {
      if (!entry.password) entry.password = sharedPassword
    }
  }

  const token = getRawToken()
  const body = {
    task: taskMeta.id,
    tool: taskMeta.type,
    files: filesBody,
    ...processOptions,
  }

  const res = await fetch(`https://${taskMeta.server}/v1/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = ""
    try {
      const json = (await res.json()) as { error?: { msg?: string; message?: string } }
      detail = json.error?.msg ?? json.error?.message ?? ""
    } catch {
      // non-JSON error body
    }
    throw new Error(
      `iLoveAPI webhook task rejected (${res.status})${detail ? `: ${detail}` : ""}`
    )
  }

  return { taskId: taskMeta.id, server: taskMeta.server, tool: taskMeta.type }
}

/**
 * Downloads a finished task's result from iLovePDF and deletes the task
 * from their servers (mirrors what `runTool`'s `task.download()` +
 * `task.delete()` do in the synchronous path).
 */
export async function downloadTaskResult(
  taskId: string,
  server: string
): Promise<DownloadResult> {
  const token = getRawToken()
  const res = await fetch(`https://${server}/v1/download/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to download iLoveAPI result (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") || "application/pdf"

  const disposition = res.headers.get("content-disposition") || ""
  let filename: string | undefined
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  if (match?.[1]) {
    filename = match[1].replace(/^["']|["']$/g, "")
  }

  // Release the task on iLovePDF's side — best-effort.
  await fetch(`https://${server}/v1/task/${taskId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})

  return { buffer, filename, contentType }
}
