"use client"

import { useState, useCallback } from "react"
import type { ProcessingStep } from "@/components/tools/ProcessingModal"
import { recordActivity } from "@/lib/activityStore"

function postActivity(toolSlug: string, fileName: string, outputSize: number): void {
  fetch("/api/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolSlug, fileName, outputSize }),
  }).catch(() => {})
}

export type UploadProgress = {
  loaded: number
  total: number
}

export type ToolState =
  | { status: "idle" }
  | { status: "files-selected"; files: File[] }
  | {
      status: "processing"
      step: ProcessingStep
      uploadProgress?: number
      uploadBytes?: UploadProgress
      /**
       * True when the browser-to-server upload (XHR) is finished but the
       * server has not yet responded. During this window the server is
       * forwarding the file to iLoveAPI/Adobe, so the progress bar should
       * show an indeterminate animation rather than a static 100%.
       */
      serverProcessing?: boolean
    }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "validation-success"; message: string; result?: string; processingTime: string }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean }

// Minimum display time per step so the user can see each transition
// (the actual upload + processing work is on top of these).
const STEP_DELAY_START_MS = 500
const STEP_DELAY_UPLOAD_LOCAL_MS = 300
const STEP_DELAY_DOWNLOAD_MS = 400
const STEP_DELAY_DONE_MS = 600

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface UploadResult {
  ok: boolean
  status: number
  json: () => unknown
}

/**
 * POSTs FormData using XMLHttpRequest so we get real upload progress
 * events (the `fetch` API does not expose upload progress). Returns an
 * object with the same surface as `Response.ok` / `Response.json()` so
 * the rest of the flow is unchanged.
 */
function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100))
        onProgress(percent, e.loaded, e.total)
      }
    })
    xhr.addEventListener("load", () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => {
          try {
            return JSON.parse(xhr.responseText)
          } catch {
            return {}
          }
        },
      })
    })
    xhr.addEventListener("error", () => reject(new Error("Network error")))
    xhr.addEventListener("abort", () => reject(new Error("Aborted")))
    xhr.send(formData)
  })
}

export function useTool(toolSlug: string) {
  const [state, setState] = useState<ToolState>({ status: "idle" })

  const process = useCallback(
    async (files: File[], options: Record<string, unknown> = {}) => {
      if (toolSlug !== "html-to-pdf" && files.length === 0) {
        setState({ status: "error", message: "No files provided", retryable: true })
        return
      }

      // Step 1: "Connecting to server..."
      setState({ status: "processing", step: "start" })
      await delay(STEP_DELAY_START_MS)

      const form = new FormData()
      for (const file of files) {
        console.log("[DEBUG] Adding file:", file.name, file.size, file.type)
        form.append("file", file)
      }

      // Handle watermark image separately since File objects can't be JSON stringified
      let watermarkImage: File | undefined
      if (toolSlug === "watermark-pdf" && options.mode === "image" && options.image instanceof File) {
        watermarkImage = options.image
        // Remove image from options since we'll send it separately
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image, ...optionsWithoutImage } = options
        form.append("options", JSON.stringify(optionsWithoutImage))
      } else {
        form.append("options", JSON.stringify(options))
      }

      if (watermarkImage) {
        form.append("watermark_image", watermarkImage)
      }

      console.log("[DEBUG] FormData entries:", Array.from(form.entries()).map(e => [e[0], typeof e[1]]))

      if (toolSlug === "split-pdf" || toolSlug === "remove-pages" || toolSlug === "organize-pdf") {
        try {
          // Local tools: there's no real upload, but show the step briefly
          // for visual consistency with server tools.
          setState({ status: "processing", step: "upload", uploadProgress: 0 })
          await delay(STEP_DELAY_UPLOAD_LOCAL_MS)

          setState({ status: "processing", step: "process" })

          if (files.length === 0) throw new Error("No file provided");

          let arrayBuffer: ArrayBuffer;
          const firstName = files[0].name;
          if (toolSlug === "organize-pdf" && files.length > 1) {
            const { processMergeLocal } = await import("@/lib/pdf/merge-client");
            const fileBuffers = await Promise.all(files.map(async f => ({ buffer: await f.arrayBuffer(), filename: f.name })));
            const merged = await processMergeLocal(fileBuffers, {});
            // merged.buffer is Uint8Array from pdf-lib; read via Response to get a typed ArrayBuffer
            arrayBuffer = await new Response(merged.buffer as BlobPart).arrayBuffer();
          } else {
            arrayBuffer = await files[0].arrayBuffer();
          }

          const start = Date.now();
          const { processSplitLocal } = await import("@/lib/pdf/split-client");
          const result = await processSplitLocal(arrayBuffer, options, firstName);
          const end = Date.now();

          setState({ status: "processing", step: "download" })
          await delay(STEP_DELAY_DOWNLOAD_MS)

          const blob = new Blob([result.buffer as unknown as BlobPart], {
            type: result.downloadFilename.endsWith(".zip") ? "application/zip" : "application/pdf"
          });
          const downloadUrl = URL.createObjectURL(blob);

          // Show "Ready!" briefly before the modal closes
          setState({ status: "processing", step: "done" })
          await delay(STEP_DELAY_DONE_MS)

          setState({
            status: "success",
            downloadUrl,
            filename: result.downloadFilename,
            processingTime: ((end - start) / 1000).toFixed(2),
            outputSize: blob.size,
          });
          recordActivity(toolSlug, result.downloadFilename, blob.size)
          postActivity(toolSlug, result.downloadFilename, blob.size)
          return;
        } catch (err) {
          console.error("Local split error:", err);
          setState({ status: "error", message: "Failed to process PDF locally. Error: " + (err as Error).message, retryable: true });
          return;
        }
      }

      if (toolSlug === "merge-pdf") {
        try {
          setState({ status: "processing", step: "upload", uploadProgress: 0 })
          await delay(STEP_DELAY_UPLOAD_LOCAL_MS)

          setState({ status: "processing", step: "process" })

          if (files.length === 0) throw new Error("No files provided");
          const fileBuffers = await Promise.all(
            files.map(async (file) => ({
              buffer: await file.arrayBuffer(),
              filename: file.name,
            }))
          );

          const start = Date.now();
          const { processMergeLocal } = await import("@/lib/pdf/merge-client");
          const result = await processMergeLocal(fileBuffers, options);
          const end = Date.now();

          setState({ status: "processing", step: "download" })
          await delay(STEP_DELAY_DOWNLOAD_MS)

          const blob = new Blob([result.buffer as unknown as BlobPart], { type: "application/pdf" });
          const downloadUrl = URL.createObjectURL(blob);

          setState({ status: "processing", step: "done" })
          await delay(STEP_DELAY_DONE_MS)

          setState({
            status: "success",
            downloadUrl,
            filename: result.downloadFilename,
            processingTime: ((end - start) / 1000).toFixed(2),
            outputSize: blob.size,
          });
          recordActivity(toolSlug, result.downloadFilename, blob.size)
          postActivity(toolSlug, result.downloadFilename, blob.size)
          return;
        } catch (err) {
          console.error("Local merge error:", err);
          setState({ status: "error", message: "Failed to merge PDFs locally. Error: " + (err as Error).message, retryable: true });
          return;
        }
      }

      try {
        // Step 2: "Uploading your file..." with real XHR progress.
        // We keep the "upload" step pinned (with progress at 100%) until the
        // server has actually finished — for large files the browser-to-server
        // leg finishes quickly, but the server then has to forward the file to
        // iLoveAPI/Adobe which can take a long time. Showing the upload
        // progress bar for the full round-trip gives the user honest feedback.
        setState({ status: "processing", step: "upload", uploadProgress: 0 })

        const response = await uploadWithProgress(
          `/api/tools/${toolSlug}`,
          form,
          (percent, loaded, total) => {
            const safeTotal = total > 0 ? total : loaded
            // The last XHR progress event fires when the browser has sent all
            // bytes; the server then takes over to forward the file to
            // iLoveAPI/Adobe. Mark that handoff so the UI can switch from a
            // concrete percent to an indeterminate animation.
            const serverProcessing = total > 0 && loaded >= total
            setState({
              status: "processing",
              step: "upload",
              uploadProgress: percent,
              uploadBytes: { loaded, total: safeTotal },
              serverProcessing,
            })
          }
        )

        // Step 3: "Processing with iLoveAPI..." — server has acknowledged the
        // upload, so the file is actually on the server now. Move instantly.
        setState({ status: "processing", step: "process" })

        if (!response.ok) {
          let errMsg = "Processing failed"
          let upgradeRequired = false
          try {
            const err = response.json() as { error?: string; upgradeRequired?: boolean }
            errMsg = err.error || errMsg
            upgradeRequired = !!err.upgradeRequired
          } catch {
            // blob response, can't parse JSON
          }
          setState({ status: "error", message: errMsg, retryable: true, upgradeRequired })
          return
        }

        // Step 4: "Preparing download..."
        setState({ status: "processing", step: "download" })
        await delay(STEP_DELAY_DOWNLOAD_MS)

        const data = response.json() as {
          fileData?: string
          downloadId?: string
          filename?: string
          processingTime?: string
          outputSize?: number | string
          validationSuccess?: boolean
          message?: string
          result?: string
        }

        if (data.validationSuccess !== undefined) {
          setState({
            status: "validation-success",
            message: data.message || "PDF validation is success",
            result: data.result,
            processingTime: data.processingTime || "0",
          })
          return
        }

        let downloadUrl: string
        if (data.fileData) {
          const binaryString = atob(data.fileData)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          const blob = new Blob([bytes], { type: "application/pdf" })
          downloadUrl = URL.createObjectURL(blob)
        } else {
          downloadUrl = `/api/download/${data.downloadId}`
        }

        // Step 5: "Ready!" — shown briefly before the modal closes
        setState({ status: "processing", step: "done" })
        await delay(STEP_DELAY_DONE_MS)

        setState({
          status: "success",
          downloadUrl,
          filename: data.filename || "output.pdf",
          processingTime: data.processingTime || "0",
          outputSize: Number(data.outputSize || 0),
        })
        // Server tools: /api/tools/[tool] already records the event server-side.
        // We only update the local activity feed here.
        recordActivity(toolSlug, data.filename || "output.pdf", Number(data.outputSize || 0))
      } catch {
        setState({ status: "error", message: "A network error occurred. Please try again.", retryable: true })
      }
    },
    [toolSlug]
  )

  const reset = useCallback(() => setState({ status: "idle" }), [])

  const forceSuccess = useCallback((file: File) => {
    const downloadUrl = URL.createObjectURL(file)
    setState({
      status: "success",
      downloadUrl,
      filename: file.name,
      processingTime: "Instant (Local)",
      outputSize: file.size,
    })
    recordActivity(toolSlug, file.name, file.size)
    postActivity(toolSlug, file.name, file.size)
  }, [toolSlug])

  return { state, process, reset, forceSuccess }
}
