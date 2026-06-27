"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FileUploader } from "@/components/tools/FileUploader"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { extractPdfText } from "@/components/tools/ai-summarizer/extract-pdf-text"
import { TranslateOptions } from "@/components/tools/options/TranslateOptions"
import { copyTextToClipboard, formatContent } from "@/components/tools/shared/formatContent"
import { Clock, Copy, FileText, Languages, X } from "lucide-react"
import { toast } from "sonner"

type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; documentText?: string }
  | { type: "error"; message: string }

type TranslateRequestBody = {
  mode: "translate"
  targetLanguageLabel: string
  documentText: string
  filename: string
  fileSize: number
}

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
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (!data || data === "[DONE]") continue
        try {
          const parsed = JSON.parse(data) as StreamEvent
          if (parsed.type === "error") {
            // Surface the server's error message to the outer try/catch.
            throw new Error(parsed.message)
          }
          yield parsed
        } catch (err) {
          if (err instanceof Error && err.message) throw err
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }
}

// Document-style "page" wrapper for the translated output. Mirrors
// the AI summarizer's DocumentBubble: header strip (file + label),
// padded body with rendered markdown, and a footer with a timestamp
// + the Copy toolbar.
function DocumentBubble({
  fileName,
  languageLabel,
  content,
  isStreaming,
  generatedAt,
  onCopy,
}: {
  fileName: string
  languageLabel: string
  content: string
  isStreaming?: boolean
  generatedAt?: number
  onCopy: () => void
}) {
  const formattedTime = generatedAt
    ? new Date(generatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <div className="order-2 w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Document header strip */}
      <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Translation · {languageLabel}
        </span>
      </div>

      {/* Document body */}
      <div className="px-6 py-5 text-[0.9rem] leading-7 text-foreground min-h-[6rem]">
        {content ? (
          formatContent(content)
        ) : (
          <p className="text-muted-foreground italic">Click Translate to start.</p>
        )}
        {isStreaming ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-1.5 align-middle bg-current animate-pulse"
          />
        ) : null}
      </div>

      {/* Document footer: Copy toolbar + timestamp. Mirrors the AI
          summarizer's footer style. */}
      <div className="flex items-center justify-between gap-3 px-5 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onCopy}
            disabled={!content}
            title="Copy translation"
            aria-label="Copy translation"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
        {formattedTime && !isStreaming ? (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>{formattedTime}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TranslatePdfView({ maxSizeMB }: { maxSizeMB: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [translatedText, setTranslatedText] = useState("")
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Aborts the in-flight fetch + SSE reader when the user picks a
  // different file or clears the current one mid-translation. Each
  // startTranslate() creates a fresh controller so stale async work
  // can detect cancellation via signal.aborted and bail out.
  const abortRef = useRef<AbortController | null>(null)

  const cancelTranslate = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsTranslating(false)
  }, [])

  const targetLanguage = useMemo(() => {
    // TranslateOptions uses `toLanguage`
    return (options.toLanguage as string) || "es"
  }, [options.toLanguage])

  const targetLanguageLabel = useMemo(() => {
    // Keep user-facing labels simple; endpoint mainly uses language code.
    // Default matches TranslateOptions default "Spanish".
    switch (targetLanguage) {
      case "en":
        return "English"
      case "es":
        return "Spanish"
      case "fr":
        return "French"
      case "de":
        return "German"
      case "it":
        return "Italian"
      case "pt":
        return "Portuguese"
      case "ru":
        return "Russian"
      case "zh":
        return "Chinese"
      case "ja":
        return "Japanese"
      case "ko":
        return "Korean"
      case "ar":
        return "Arabic"
      case "hi":
        return "Hindi"
      default:
        // Fall back to code if unsupported label mapping.
        return targetLanguage
    }
  }, [targetLanguage])

  const reset = useCallback(() => {
    cancelTranslate()
    setFile(null)
    setTranslatedText("")
    setGeneratedAt(null)
    setError(null)
  }, [cancelTranslate])

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      // Selecting a new PDF mid-translation aborts the in-flight
      // request so the previous translation doesn't bleed into the
      // new file's output panel.
      cancelTranslate()
      setFile(files[0] ?? null)
      setTranslatedText("")
      setGeneratedAt(null)
      setError(null)
    },
    [cancelTranslate]
  )

  // Ensure any pending translation is aborted if the component
  // unmounts (e.g. navigation away from the tool).
  useEffect(() => {
    return () => cancelTranslate()
  }, [cancelTranslate])

  const startTranslate = useCallback(async () => {
    if (!file || isTranslating) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsTranslating(true)
    setError(null)
    setGeneratedAt(null)

    try {
      const documentText = await extractPdfText(file)
      if (controller.signal.aborted) return

      const body: TranslateRequestBody = {
        mode: "translate",
        targetLanguageLabel,
        documentText,
        filename: file.name,
        fileSize: file.size,
      }

      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || "Translation failed.")
      }

      let acc = ""
      for await (const event of readSseStream(res)) {
        if (controller.signal.aborted) return
        if (event.type === "chunk") {
          acc += event.text
          setTranslatedText(acc)
        } else if (event.type === "done") {
          setIsTranslating(false)
          setGeneratedAt(Date.now())
          if (abortRef.current === controller) abortRef.current = null
          return
        }
      }
      if (controller.signal.aborted) return
      setIsTranslating(false)
      setGeneratedAt(Date.now())
      if (abortRef.current === controller) abortRef.current = null
    } catch (e) {
      // Swallow the abort noise — the user explicitly cancelled by
      // picking a new file or clearing the current one.
      if (controller.signal.aborted) return
      if (e instanceof DOMException && e.name === "AbortError") return
      if (abortRef.current === controller) abortRef.current = null
      setIsTranslating(false)
      setError(e instanceof Error ? e.message : "Translation failed.")
    }
  }, [file, isTranslating, targetLanguageLabel])

  const handleCopy = useCallback(async () => {
    if (!translatedText) return
    const ok = await copyTextToClipboard(translatedText)
    toast[ok ? "success" : "error"](
      ok ? "Translation copied to clipboard" : "Could not copy the translation."
    )
  }, [translatedText])

  if (!file) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Languages className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">Upload a PDF to translate</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Drop a PDF and we&apos;ll stream the translated text.
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

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-220px)] min-h-560px">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Translate PDF text. Options on the left, streamed translation on the right.</p>
        <Button variant="ghost" size="sm" onClick={reset} className="inline-flex items-center gap-2">
          <X className="h-4 w-4" />
          Use a different file
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: tool options */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/30">
              <p className="text-sm font-medium truncate">Options</p>
              <span className="text-xs text-muted-foreground">Target: {targetLanguageLabel}</span>
            </div>
            <div className="p-4">
              <TranslateOptions options={options} onChange={setOptions} />
              <div className="mt-4">
                <Button
                  size="lg"
                  onClick={() => void startTranslate()}
                  disabled={isTranslating}
                  className={cn("w-full", isTranslating && "opacity-70")}
                >
                  {isTranslating ? "Translating..." : `Translate to ${targetLanguageLabel}`}
                </Button>
              </div>
              {error ? (
                <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right: translated text output */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="h-full">
            <DocumentBubble
              fileName={file.name}
              languageLabel={targetLanguageLabel}
              content={translatedText}
              isStreaming={isTranslating}
              generatedAt={generatedAt ?? undefined}
              onCopy={() => void handleCopy()}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
