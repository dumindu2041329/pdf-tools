"use client"

import { useState, useCallback } from "react"
import type { ProcessingStep } from "@/components/tools/ProcessingModal"

export type ToolState =
  | { status: "idle" }
  | { status: "files-selected"; files: File[] }
  | { status: "processing"; step: ProcessingStep; uploadProgress?: number }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean }

function uploadWithProgress(
  url: string,
  formData: FormData
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    body: formData,
  })
}

export function useTool(toolSlug: string) {
  const [state, setState] = useState<ToolState>({ status: "idle" })

  const process = useCallback(
    async (files: File[], options: Record<string, unknown> = {}) => {
      setState({ status: "processing", step: "start" })

      const form = new FormData()
      for (const file of files) {
        console.log("[DEBUG] Adding file:", file.name, file.size, file.type)
        form.append("file", file)
      }
      form.append("options", JSON.stringify(options))
      console.log("[DEBUG] FormData entries:", Array.from(form.entries()).map(e => [e[0], typeof e[1]]))

      setState({ status: "processing", step: "upload", uploadProgress: 0 })



      if (toolSlug === "local-split") {
        try {
          setState({ status: "processing", step: "process" })
          
          if (files.length === 0) throw new Error("No file provided");
          const file = files[0];
          const arrayBuffer = await file.arrayBuffer();
          
          const start = Date.now();
          const { processSplitLocal } = await import("@/lib/pdf/split-client");
          const result = await processSplitLocal(arrayBuffer, options, file.name);
          const end = Date.now();
          
          setState({ status: "processing", step: "download" })
          
          const blob = new Blob([result.buffer as unknown as BlobPart], { 
            type: result.downloadFilename.endsWith(".zip") ? "application/zip" : "application/pdf" 
          });
          const downloadUrl = URL.createObjectURL(blob);
          
          setState({
            status: "success",
            downloadUrl,
            filename: result.downloadFilename,
            processingTime: ((end - start) / 1000).toFixed(2),
            outputSize: blob.size,
          });
          return;
        } catch (err) {
          console.error("Local split error:", err);
          setState({ status: "error", message: "Failed to process PDF locally. Error: " + (err as Error).message, retryable: true });
          return;
        }
      }

      try {
        const response = await uploadWithProgress(
          `/api/tools/${toolSlug}`,
          form
        )

        setState({ status: "processing", step: "process" })

        if (!response.ok) {
          let errMsg = "Processing failed"
          let upgradeRequired = false
          try {
            const err = await response.json()
            errMsg = err.error || errMsg
            upgradeRequired = !!err.upgradeRequired
          } catch {
            // blob response, can't parse JSON
          }
          setState({ status: "error", message: errMsg, retryable: true, upgradeRequired })
          return
        }

        setState({ status: "processing", step: "download" })

        const data = await response.json()
        const downloadUrl = `/api/download/${data.downloadId}`

        setState({
          status: "success",
          downloadUrl,
          filename: data.filename || "output.pdf",
          processingTime: data.processingTime || "0",
          outputSize: Number(data.outputSize || 0),
        })
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
  }, [])

  return { state, process, reset, forceSuccess }
}
