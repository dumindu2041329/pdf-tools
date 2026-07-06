"use client"

import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import type { ProcessingStep } from "@/components/tools/ProcessingModal"
import { recordActivity } from "@/lib/activityStore"
import { shouldUseDirectUpload, uploadFileDirect, deleteFromStorageBrowser } from "@/lib/supabase-upload"

function postActivity(toolSlug: string, fileName: string, outputSize: number): void {
  fetch("/api/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolSlug, fileName, outputSize }),
  })
    .then(async (res) => {
      // Guest users who exhaust their daily/monthly cap get sent to
      // the sign-up page. The local tools have already produced their
      // result by the time we POST here, so the user keeps what they
      // got, but we bounce them off the page so they can't keep
      // firing local-only requests indefinitely.
      if (res.status === 402 && typeof window !== "undefined") {
        try {
          const data = (await res.json()) as { error?: string }
          if (data.error) {
            toast.error(data.error)
          }
        } catch {
          // ignore JSON parse failure
        }
        window.location.href = "/sign-up"
      }
    })
    .catch(() => {})
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
    }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "validation-success"; message: string; result?: string; processingTime: string }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean; redirectToSignUp?: boolean }

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
 *
 * When `signal` is provided, triggering it aborts the in-flight XHR
 * and this resolves with a synthetic `{ ok: false, status: 0 }` so
 * callers can detect the cancellation without us throwing a
 * `DOMException`/`AbortError` (which Next.js's dev overlay surfaces
 * in the runtime-error panel even when it's caught). Callers that
 * need a hard "this was cancelled" signal should also check
 * `signal.aborted` after the call returns.
 */
function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number, loaded: number, total: number) => void,
  signal?: AbortSignal,
  onUploadBodySent?: () => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ ok: false, status: 0, json: () => ({}) })
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100))
        onProgress(percent, e.loaded, e.total)
      }
    })
    // Fires when the request body is fully sent — the server is now
    // processing but hasn't responded yet. This is the right moment to
    // transition the UI from "uploading" to "processing".
    if (onUploadBodySent) {
      xhr.upload.addEventListener("load", () => {
        if (!signal?.aborted) onUploadBodySent()
      })
    }
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
    xhr.addEventListener("abort", () => {
      resolve({ ok: false, status: 0, json: () => ({}) })
    })
    signal?.addEventListener(
      "abort",
      () => {
        xhr.abort()
      },
      { once: true }
    )
    xhr.send(formData)
  })
}

interface BuildUploadPayloadArgs {
  files: File[]
  watermarkImage: File | undefined
  options: Record<string, unknown>
}

/**
 * Uploads any file that exceeds the direct-body limit to Supabase Storage
 * via the client SDK. Files under the limit are returned untouched so
 * the caller can keep the cheap multipart path for small PDFs.
 *
 * If any individual upload throws, every file that already made it to
 * Storage is deleted before the error re-throws — otherwise a partially
 * uploaded batch would leak storage objects (the server only cleans up
 * URLs it sees in the eventual `/api/tools/[tool]` request).
 *
 * `signal` aborts each in-flight upload as soon as it's triggered.
 * On abort the function stops uploading further files, runs the
 * same cleanup it runs on a genuine failure, and re-throws a plain
 * `Error("Upload aborted")` — we deliberately do NOT throw a
 * `DOMException` here, because Next.js's dev overlay surfaces those
 * in the runtime-error panel even when the calling code catches them.
 */
async function uploadLargeFilesToStorage(
  files: File[],
  watermarkImage: File | undefined,
  onFileProgress: (file: File, loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<{
  blobUploads: Array<{ file: File; url: string; pathname: string }>
  watermarkBlobUpload: { url: string; filename: string } | undefined
}> {
  const blobUploads: Array<{ file: File; url: string; pathname: string }> = []
  let watermarkBlobUpload: { url: string; filename: string } | undefined
  try {
    for (const file of files) {
      if (signal?.aborted) break
      if (!shouldUseDirectUpload(file)) continue
      const result = await uploadFileDirect(file, {
        onProgress: (loaded, total) => onFileProgress(file, loaded, total),
        signal,
      })
      if (signal?.aborted) break
      blobUploads.push({ file, url: result.url, pathname: result.pathname })
    }

    if (watermarkImage && shouldUseDirectUpload(watermarkImage)) {
      if (signal?.aborted) {
        throw new Error("Upload aborted")
      }
      const result = await uploadFileDirect(watermarkImage, {
        onProgress: (loaded, total) => onFileProgress(watermarkImage, loaded, total),
        signal,
      })
      if (signal?.aborted) {
        throw new Error("Upload aborted")
      }
      watermarkBlobUpload = { url: result.url, filename: watermarkImage.name }
    }

    if (signal?.aborted) {
      throw new Error("Upload aborted")
    }
    return { blobUploads, watermarkBlobUpload }
  } catch (err) {
    // Best-effort cleanup of anything that already landed in Storage
    // before the failure. `deleteFromStorageBrowser` swallows errors so
    // a single bad URL can't block the rest.
    const urlsToCleanup = [
      ...blobUploads.map((u) => u.url),
      ...(watermarkBlobUpload ? [watermarkBlobUpload.url] : []),
    ]
    await Promise.allSettled(
      urlsToCleanup.map((url) => deleteFromStorageBrowser(url))
    )
    throw err
  }
}

/**
 * Helper used by the catch blocks below to release any direct-uploaded
 * Storage objects after a tool request fails. Safe to call when nothing
 * was uploaded (the arrays are empty) — every call short-circuits.
 */
async function cleanupDirectUploads(
  directUploads: Array<{ file: File; url: string; pathname: string }>,
  watermarkDirectUpload: { url: string; filename: string } | undefined
): Promise<void> {
  const urls = [
    ...directUploads.map((u) => u.url),
    ...(watermarkDirectUpload ? [watermarkDirectUpload.url] : []),
  ]
  if (urls.length === 0) return
  await Promise.allSettled(urls.map((url) => deleteFromStorageBrowser(url)))
}

/**
 * Detects whether a caught error came from the user clicking Cancel.
 * We check `signal?.aborted` first because it's the most reliable
 * signal — the upload helpers deliberately throw plain `Error`s (not
 * `DOMException`s) to avoid the Next.js dev overlay surfacing them,
 * so we can't rely on `err.name === "AbortError"`.
 *
 * The `err` fallback exists for paths where we don't have a signal
 * in scope (e.g. a race that didn't have one wired up) — it matches
 * the messages we throw from the upload helpers.
 */
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (typeof err !== "object" || err === null) return false
  if ((err as { name?: string }).name === "AbortError") return true
  const msg = (err as { message?: string }).message
  return msg === "Aborted" || msg === "Upload aborted"
}

/**
 * Builds the FormData sent to `/api/tools/[tool]`. Files can arrive two ways:
 *
 *  - **Inline**: appended as a `file` multipart entry (cheap, works for
 *    PDFs under ~4 MB).
 *  - **Via Storage**: uploaded directly to Supabase Storage first, then their
 *    public URLs are forwarded as a JSON `blobUrls` field. The server
 *    route fetches each URL and falls back into the same processing
 *    pipeline.
 *
 * The caller decides which path to take via the optional `directUploads`
 * argument; if omitted, every file is inlined.
 */
function buildUploadPayload({
  files,
  watermarkImage,
  options,
  directUploads,
  watermarkDirectUpload,
}: BuildUploadPayloadArgs & {
  directUploads?: Array<{ file: File; url: string; pathname: string }>
  watermarkDirectUpload?: { url: string; filename: string }
}): FormData {
  const form = new FormData()
  form.append("options", JSON.stringify(options))

  // Inline the files that didn't take the Blob path. The ones in
  // `directUploads` are forwarded as URLs instead — see `blobUrls` below.
  const directSet = new Set(
    (directUploads ?? []).map((u) => u.file.name + ":" + u.file.size)
  )
  for (const file of files) {
    if (directSet.has(file.name + ":" + file.size)) continue
    form.append("file", file)
  }

  if (directUploads && directUploads.length > 0) {
    form.append(
      "blobUrls",
      JSON.stringify(
        directUploads.map((u) => ({ url: u.url, filename: u.file.name }))
      )
    )
  }

  if (watermarkDirectUpload) {
    form.append("watermarkImageUrl", watermarkDirectUpload.url)
    form.append("watermarkImageFilename", watermarkDirectUpload.filename)
  } else if (watermarkImage) {
    form.append("watermark_image", watermarkImage)
  }
  return form
}

export function useTool(toolSlug: string) {
  const [state, setState] = useState<ToolState>({ status: "idle" })
  // Tracks the AbortController for the in-flight run so the cancel button
  // (rendered by ProcessingModal) can abort it. We keep this in a ref so
  // the cancel handler is stable across renders.
  const abortRef = useRef<AbortController | null>(null)

  const process = useCallback(
    async (files: File[], options: Record<string, unknown> = {}) => {
      if (toolSlug !== "html-to-pdf" && files.length === 0) {
        setState({ status: "error", message: "No files provided", retryable: true })
        return
      }

      // Step 1: "Connecting to server..."
      setState({ status: "processing", step: "start" })
      await delay(STEP_DELAY_START_MS)

      // Create the abort controller for this run and stash it on the ref
      // so the cancel handler can abort the in-flight XHR(s) and Supabase
      // SDK calls. We always install a fresh controller — a previous
      // run's controller (if any) was either already settled or is now
      // stale.
      const abortController = new AbortController()
      abortRef.current = abortController
      const { signal } = abortController

      // Handle watermark image separately since File objects can't be JSON stringified
      let watermarkImage: File | undefined
      let cleanOptions = options
      if (toolSlug === "watermark-pdf" && options.mode === "image" && options.image instanceof File) {
        watermarkImage = options.image
        // Remove image from options since we'll send it separately
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image, ...optionsWithoutImage } = options
        cleanOptions = optionsWithoutImage
      }

      // Decide which files need the direct-to-Storage path. Anything
      // exceeding `MAX_DIRECT_BODY_BYTES` (4 MB, see lib/supabase-upload.ts)
      // is uploaded to Supabase Storage first so we don't run into Vercel's
      // ~4.5 MB serverless function body limit. Smaller files stay on
      // the cheap multipart path.
      const needsDirectUpload =
        files.some(shouldUseDirectUpload) ||
        (watermarkImage !== undefined && shouldUseDirectUpload(watermarkImage))

      let directUploads: Array<{ file: File; url: string; pathname: string }> = []
      let watermarkDirectUpload: { url: string; filename: string } | undefined

      if (needsDirectUpload) {
        setState({ status: "processing", step: "upload", uploadProgress: 0 })
        const totalBytes = files.reduce(
          (sum, f) => sum + (shouldUseDirectUpload(f) ? f.size : 0),
          0
        )
        const loadedByFile = new Map<File, number>()
        const onFileProgress = (file: File, loaded: number) => {
          loadedByFile.set(file, loaded)
          const combinedLoaded = Array.from(loadedByFile.values()).reduce(
            (a, b) => a + b,
            0
          )
          const percent =
            totalBytes > 0 ? Math.min(100, Math.round((combinedLoaded / totalBytes) * 100)) : 0
          setState({
            status: "processing",
            step: "upload",
            uploadProgress: percent,
            uploadBytes: { loaded: combinedLoaded, total: totalBytes },
          })
        }
        try {
          const result = await uploadLargeFilesToStorage(
            files,
            watermarkImage,
            onFileProgress,
            signal
          )
          directUploads = result.blobUploads
          watermarkDirectUpload = result.watermarkBlobUpload
        } catch (err) {
          if (isAbortError(err, signal)) {
            return
          }
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to upload files. Please try again.",
            retryable: true,
          })
          return
        }
      }

      // Build the multipart payload. Files that took the Storage path are
      // omitted from the `file` field and forwarded via `blobUrls` JSON
      // instead. The server route re-hydrates them with `downloadFromStorage`.
      const onUploadProgress = (percent: number, loaded: number, total: number) => {
        const safeTotal = total > 0 ? total : loaded
        setState({
          status: "processing",
          step: "upload",
          uploadProgress: percent,
          uploadBytes: { loaded, total: safeTotal },
        })
      }

      const form = buildUploadPayload({
        files,
        watermarkImage,
        options: cleanOptions,
        directUploads,
        watermarkDirectUpload,
      })

      for (const file of files) {
        console.log("[DEBUG] Adding file:", file.name, file.size, file.type)
      }
      console.log(
        "[DEBUG] FormData entries:",
        Array.from(form.entries()).map((e) => [e[0], typeof e[1]])
      )

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
          // Local tools never reach `/api/tools/[tool]`, so the server's
          // `finally` cleanup doesn't run — release the Supabase objects
          // here, on the success path, instead.
          await cleanupDirectUploads(directUploads, watermarkDirectUpload)
          recordActivity(toolSlug, result.downloadFilename, blob.size)
          postActivity(toolSlug, result.downloadFilename, blob.size)
          return;
        } catch (err) {
          if (isAbortError(err, signal)) {
            // Cancelled by the user — the catch in the outer try/catch
            // already ran the cleanup, so just bail.
            return
          }
          console.error("Local split error:", err);
          await cleanupDirectUploads(directUploads, watermarkDirectUpload)
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
          // Local tools never reach `/api/tools/[tool]`, so the server's
          // `finally` cleanup doesn't run — release the Supabase objects
          // here, on the success path, instead.
          await cleanupDirectUploads(directUploads, watermarkDirectUpload)
          recordActivity(toolSlug, result.downloadFilename, blob.size)
          postActivity(toolSlug, result.downloadFilename, blob.size)
          return;
        } catch (err) {
          if (isAbortError(err, signal)) {
            return
          }
          console.error("Local merge error:", err);
          await cleanupDirectUploads(directUploads, watermarkDirectUpload)
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
          onUploadProgress,
          signal,
          () => setState({ status: "processing", step: "process" })
        )

        // `uploadWithProgress` resolves with `{ ok: false, status: 0 }`
        // when the XHR was aborted (rather than rejecting, so the
        // dev overlay doesn't flag it as a runtime exception). Detect
        // that here so the error-toast path below doesn't fire.
        if (signal.aborted || response.status === 0) {
          // The server never saw the request, so its `finally`
          // cleanup never ran. Release the direct-uploaded objects
          // before bailing.
          await cleanupDirectUploads(directUploads, watermarkDirectUpload)
          return
        }

        // Step 3: "Processing with iLoveAPI..." — server has acknowledged the
        // upload, so the file is actually on the server now. Move instantly.
        setState({ status: "processing", step: "process" })

        if (!response.ok) {
          let errMsg = "Processing failed"
          let upgradeRequired = false
          let redirectToSignUp = false
          try {
            const err = response.json() as {
              error?: string
              upgradeRequired?: boolean
              redirectToSignUp?: boolean
            }
            errMsg = err.error || errMsg
            upgradeRequired = !!err.upgradeRequired
            redirectToSignUp = !!err.redirectToSignUp
          } catch {
            // blob response, can't parse JSON
          }
          // Guest users who exhaust their daily/monthly cap get sent
          // to the sign-up page. We still surface the error in the UI
          // first so the user understands what just happened, then
          // navigate after a short delay.
          if (redirectToSignUp && typeof window !== "undefined") {
            toast.error(errMsg)
            setState({ status: "error", message: errMsg, retryable: false, upgradeRequired, redirectToSignUp })
            setTimeout(() => {
              window.location.href = "/sign-up"
            }, 1200)
            return
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
      } catch (err) {
        if (isAbortError(err, signal)) {
          // Cancellation: cleanup already happened in the inner try
          // (the upload was either aborted mid-flight or any partial
          // Supabase objects were deleted in the catch). Just reset
          // to idle silently — the cancel button gave the user the
          // feedback they needed.
          return
        }
        // Release any direct-uploaded Storage objects before surfacing
        // the error — on a network blip the server never saw the URLs
        // and so its own cleanup (in the /api/tools/[tool] `finally`)
        // never ran. A second delete from the client is harmless.
        await cleanupDirectUploads(directUploads, watermarkDirectUpload)
        setState({ status: "error", message: "A network error occurred. Please try again.", retryable: true })
      }
    },
    [toolSlug]
  )

  const reset = useCallback(() => setState({ status: "idle" }), [])

  /**
   * Aborts the in-flight run (if any). Triggered by the cancel button
   * in `ProcessingModal`. The AbortController rejects the XHR(s) with
   * an `AbortError`, the `isAbortError` checks in the catch blocks
   * swallow it silently, and any direct-uploaded Supabase objects
   * are released by the surrounding `try/catch`'s cleanup path.
   *
   * Safe to call when nothing is in flight (no-op).
   */
  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    // Reset to idle immediately so the modal closes; the rejected
    // promises that propagate up will see `isAbortError` and bail
    // without re-setting state.
    setState({ status: "idle" })
  }, [])

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

  return { state, process, reset, forceSuccess, cancel }
}
