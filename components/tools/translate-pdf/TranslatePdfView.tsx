"use client"

import { useCallback, useMemo, useState } from "react"
import { FileUploader } from "@/components/tools/FileUploader"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { extractPdfText } from "@/components/tools/ai-summarizer/extract-pdf-text"
import { TranslateOptions } from "@/components/tools/options/TranslateOptions"
import { Sparkles, X } from "lucide-react"
type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; documentText?: string }

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
          yield JSON.parse(data) as StreamEvent
        } catch {
          // ignore
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

function DocumentBubble({
  fileName,
  content,
  isStreaming,
}: {
  fileName: string
  content: string
  isStreaming?: boolean
}) {
  return (
    <div className="order-2 w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Translation
        </span>
      </div>

      <div className="px-6 py-5 text-[0.9rem] leading-7 text-foreground whitespace-pre-wrap break-words">
        {content}
        {isStreaming ? (
          <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 align-middle bg-current animate-pulse" />
        ) : null}
      </div>
    </div>
  )
}

export function TranslatePdfView({ maxSizeMB }: { maxSizeMB: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [translatedText, setTranslatedText] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setFile(null)
    setTranslatedText("")
    setIsTranslating(false)
    setError(null)
  }, [])

  const handleFilesSelected = useCallback((files: File[]) => {
    setFile(files[0] ?? null)
    setTranslatedText("")
    setError(null)
  }, [])

  const startTranslate = useCallback(async () => {
    if (!file || isTranslating) return
    setIsTranslating(true)
    setError(null)

    try {
      const documentText = await extractPdfText(file)
      if (!documentText.trim()) {
        throw new Error("Could not extract text from this PDF.")
      }

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
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || "Translation failed.")
      }

      let acc = ""
      for await (const event of readSseStream(res)) {
        if (event.type === "chunk") {
          acc += event.text
          setTranslatedText(acc)
        } else if (event.type === "done") {
          setIsTranslating(false)
          return
        }
      }
      setIsTranslating(false)
    } catch (e) {
      setIsTranslating(false)
      setError(e instanceof Error ? e.message : "Translation failed.")
    }
  }, [file, isTranslating, targetLanguageLabel])

  if (!file) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
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
        <div className="flex-1 min-h-0 overflow-auto p-0">
          <div className="h-full">
            <DocumentBubble
              fileName={file.name}
              content={translatedText || (isTranslating ? "" : "Click Translate to start.")}
              isStreaming={isTranslating}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
