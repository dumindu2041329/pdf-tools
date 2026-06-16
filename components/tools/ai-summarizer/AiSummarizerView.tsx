"use client"

import { useCallback, useState } from "react"
import { FileUploader } from "@/components/tools/FileUploader"
import { ChatPanel, type StreamEvent } from "./ChatPanel"
import { PdfPreview } from "./PdfPreview"
import { extractPdfText } from "./extract-pdf-text"
import { Button } from "@/components/ui/button"
import { Sparkles, X } from "lucide-react"

interface AiSummarizerViewProps {
  maxSizeMB: number
}

// Minimal SSE consumer for the summarizer API. Each `data: {json}` line
// is parsed into a `StreamEvent`; the loop terminates on `data: [DONE]`
// or when the underlying stream closes.
async function* readSseStream(res: Response): AsyncGenerator<StreamEvent, void, undefined> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      // The last element is either an empty string (clean split) or a
      // partial line that belongs to the next chunk. Keep it for next
      // round.
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (!data || data === "[DONE]") continue
        try {
          const parsed = JSON.parse(data) as StreamEvent
          yield parsed
        } catch {
          // Skip malformed lines; the server is expected to always emit
          // valid JSON in the data slot.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Already released; ignore.
    }
  }
}

export function AiSummarizerView({ maxSizeMB }: AiSummarizerViewProps) {
  const [file, setFile] = useState<File | null>(null)

  const reset = useCallback(() => {
    setFile(null)
  }, [])

  const handleFilesSelected = useCallback((files: File[]) => {
    setFile(files[0] ?? null)
  }, [])

  // Initial summary: extract the PDF text entirely in the browser
  // (pdfjs-dist) and send just the plain text to the server. The server
  // never sees the raw PDF — it just streams the OpenRouter response.
  const streamSummary = useCallback(
    async (target: File): Promise<AsyncIterable<StreamEvent>> => {
      const documentText = await extractPdfText(target)

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          length: "standard",
          filename: target.name,
          fileSize: target.size,
          documentText,
        }),
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || "Could not summarize the document.")
      }
      return readSseStream(res)
    },
    []
  )

  // Follow-up chat: same SSE endpoint, JSON body this time.
  const streamFollowUp = useCallback(
    async (
      messages: { role: "user" | "assistant"; content: string }[],
      documentText: string
    ): Promise<AsyncIterable<StreamEvent>> => {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "chat", documentText, messages }),
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || "The assistant could not reply.")
      }
      return readSseStream(res)
    },
    []
  )

  // ── Step 1: file picker ──────────────────────────────────────
  if (!file) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">Upload a PDF to summarize</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Drop a PDF and we&apos;ll show a live preview alongside an AI summary you can chat with.
          </p>
          <div className="mt-6">
            <FileUploader
              accept={[".pdf"]}
              multiple={false}
              maxFiles={1}
              maxSizeMB={maxSizeMB}
              files={[]}
              onFilesSelected={handleFilesSelected}
              layout="grid"
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: split view (preview | chat) ──────────────────────
  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-220px)] min-h-560px">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Preview on the left, chat with the AI on the right.
        </p>
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="mr-1 h-4 w-4" />
          Use a different file
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <PdfPreview
          key={`preview:${file.name}:${file.size}:${file.lastModified}`}
          file={file}
        />
        <ChatPanel
          key={`chat:${file.name}:${file.size}:${file.lastModified}`}
          file={file}
          onStreamSummary={streamSummary}
          onStreamFollowUp={streamFollowUp}
        />
      </div>
    </div>
  )
}
