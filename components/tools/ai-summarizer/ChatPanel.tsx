"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, Copy, Download, Send, Sparkles, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Server-Sent Events payload shape. Kept in sync with the API route.
export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; documentText?: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  /** True while the assistant is still being streamed. Renders a caret. */
  isStreaming?: boolean
}

interface ChatPanelProps {
  file: File
  onStreamSummary: (file: File) => Promise<AsyncIterable<StreamEvent>>
  onStreamFollowUp: (
    messages: { role: "user" | "assistant"; content: string }[],
    documentText: string
  ) => Promise<AsyncIterable<StreamEvent>>
  className?: string
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

// Copy plain text to the clipboard. Falls back to a hidden <textarea>
// + `document.execCommand("copy")` when the modern Clipboard API is
// unavailable (e.g. insecure context, older browsers).
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path below
    }
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    ta.style.pointerEvents = "none"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Build a filesystem-safe name from the original PDF name and the
// message role, e.g. "Week 1-OOP summary.txt" or
// "Week 1-OOP reply-1.txt".
function buildDownloadName(sourceName: string, role: "summary" | "reply", index: number): string {
  const stem = sourceName.replace(/\.pdf$/i, "").trim() || "document"
  const safe = stem.replace(/[\\/:*?"<>|]+/g, "_")
  if (role === "summary") return `${safe}-summary.txt`
  return `${safe}-reply-${index + 1}.txt`
}

function formatContent(content: string) {
  // Render the AI's response as a sequence of block-level elements
  // (paragraphs, bullet lists, numbered lists, and pipe tables) with
  // inline bold/italic/code spans. We do this by hand instead of pulling
  // in a markdown library to keep the bundle small and avoid
  // `dangerouslySetInnerHTML`.
  const blocks = splitIntoBlocks(content)
  return blocks.map((block, bIdx) => {
    switch (block.kind) {
      case "bullet":
        return (
          <ul key={bIdx} className="list-disc pl-5 space-y-1 my-2">
            {block.lines.map((line, lIdx) => (
              <li key={lIdx}>{renderInline(line)}</li>
            ))}
          </ul>
        )
      case "ordered":
        return (
          <ol key={bIdx} className="list-decimal pl-5 space-y-1 my-2">
            {block.lines.map((line, lIdx) => (
              <li key={lIdx}>{renderInline(line)}</li>
            ))}
          </ol>
        )
      case "table":
        return renderTable(block, bIdx)
      case "heading":
        return (
          <h4 key={bIdx} className="font-semibold mt-3 mb-1 text-base">
            {renderInline(block.text)}
          </h4>
        )
      case "paragraph":
      default:
        return (
          <p key={bIdx} className="my-2 leading-relaxed">
            {renderInline(block.text)}
          </p>
        )
    }
  })
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; lines: string[] }
  | { kind: "ordered"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }

function splitIntoBlocks(content: string): Block[] {
  const blocks: Block[] = []
  // Normalize line endings, then split on blank-line boundaries.
  const normalized = content.replace(/\r\n?/g, "\n")
  const chunks = normalized.split(/\n{2,}/)

  for (const rawChunk of chunks) {
    const chunk = rawChunk.replace(/^\n+|\n+$/g, "")
    if (!chunk.trim()) continue

    // 1) A pipe-table block must start with a header row, then a
    //    separator like `| --- | --- |` (the dashes may have colons
    //    for alignment markers).
    if (/\|/.test(chunk.split("\n")[0])) {
      const table = tryParseTable(chunk)
      if (table) {
        blocks.push(table)
        continue
      }
    }

    const lines = chunk.split("\n")
    const allBullets = lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l))
    if (allBullets) {
      blocks.push({
        kind: "bullet",
        lines: lines.map((l) => l.replace(/^\s*[-*•]\s+/, "")),
      })
      continue
    }

    const allOrdered = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))
    if (allOrdered) {
      blocks.push({
        kind: "ordered",
        lines: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")),
      })
      continue
    }

    // Single-line `#` / `##` / `###` headings inside a paragraph.
    if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
      blocks.push({ kind: "heading", text: lines[0].replace(/^#{1,6}\s+/, "") })
      continue
    }

    blocks.push({ kind: "paragraph", text: lines.join("\n") })
  }

  return blocks
}

function tryParseTable(chunk: string): Block | null {
  const lines = chunk.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null
  // Header row must contain a pipe.
  if (!lines[0].includes("|")) return null
  // Second line must be a separator of dashes and optional colons.
  if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[1])) {
    return null
  }
  const splitRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())

  const header = splitRow(lines[0])
  const rows = lines.slice(2).map(splitRow)
  return { kind: "table", header, rows }
}

function renderTable(block: Extract<Block, { kind: "table" }>, key: number) {
  return (
    <div key={key} className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted">
          <tr>
            {block.header.map((cell, cIdx) => (
              <th
                key={cIdx}
                className="px-3 py-2 text-left font-semibold border border-border"
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rIdx) => (
            <tr key={rIdx} className="align-top">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2 border border-border">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderInline(text: string) {
  // We tokenize a single line into a flat array of segments so we can
  // nest spans (e.g. **bold *italic***) without regex hell. The grammar
  // is intentionally tiny: bold (`**`), italic (`*` or `_`), and
  // inline code (backticks). Anything else is plain text.
  const segments: Array<{ kind: "text" | "bold" | "italic" | "code"; value: string }> = []
  let i = 0
  let buffer = ""

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ kind: "text", value: buffer })
      buffer = ""
    }
  }

  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === "**") {
      const end = text.indexOf("**", i + 2)
      if (end !== -1) {
        flush()
        segments.push({ kind: "bold", value: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1)
      if (end !== -1) {
        flush()
        segments.push({ kind: "code", value: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (text[i] === "*" || text[i] === "_") {
      const ch = text[i]
      const end = text.indexOf(ch, i + 1)
      // Avoid turning the leading "**" of a bold run into an italic
      // when there's no matching close.
      if (end !== -1 && !(ch === "*" && text[i + 1] === "*")) {
        flush()
        segments.push({ kind: "italic", value: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    buffer += text[i]
    i++
  }
  flush()

  return segments.map((seg, idx) => {
    switch (seg.kind) {
      case "bold":
        return <strong key={idx}>{renderInline(seg.value)}</strong>
      case "italic":
        return <em key={idx}>{renderInline(seg.value)}</em>
      case "code":
        return (
          <code
            key={idx}
            className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]"
          >
            {seg.value}
          </code>
        )
      default:
        return <span key={idx}>{seg.value}</span>
    }
  })
}

export function ChatPanel({
  file,
  onStreamSummary,
  onStreamFollowUp,
  className,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [documentText, setDocumentText] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isSummarizing, setIsSummarizing] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const appendToMessage = (id: string, text: string) => {
    if (!text) return
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m))
    )
  }

  const markMessageDone = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
    )
  }

  // Kick off the initial summary on mount. The parent passes `file` and
  // a callback that yields SSE events; we append each chunk to the
  // assistant's first message and stash the extracted text once the
  // stream completes.
  useEffect(() => {
    let cancelled = false
    const assistantId = uid()
    setMessages([{ id: assistantId, role: "assistant", content: "", isStreaming: true }])
    setIsSummarizing(true)
    setSummaryError(null)
    setDocumentText(null)

    ;(async () => {
      try {
        const stream = await onStreamSummary(file)
        for await (const event of stream) {
          if (cancelled) return
          if (event.type === "chunk") {
            appendToMessage(assistantId, event.text)
          } else if (event.type === "done") {
            if (event.documentText) setDocumentText(event.documentText)
            markMessageDone(assistantId)
            setIsSummarizing(false)
            return
          }
        }
        // Stream ended without a `done` event (shouldn't happen, but be
        // defensive). Mark the message done so the caret goes away.
        if (!cancelled) {
          markMessageDone(assistantId)
          setIsSummarizing(false)
        }
      } catch (err) {
        if (cancelled) return
        setSummaryError(err instanceof Error ? err.message : "Could not summarize the document.")
        markMessageDone(assistantId)
        setIsSummarizing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, onStreamSummary])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isSummarizing, isSending])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isSending) return
    if (!documentText) {
      setFollowUpError("Summary is not ready yet. Please wait a moment.")
      return
    }

    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed }
    const assistantId = uid()
    const nextMessages = [...messages, userMsg]
    setMessages([
      ...nextMessages,
      { id: assistantId, role: "assistant", content: "", isStreaming: true },
    ])
    setInput("")
    setFollowUpError(null)
    setIsSending(true)

    try {
      const stream = await onStreamFollowUp(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        documentText
      )
      for await (const event of stream) {
        if (event.type === "chunk") {
          appendToMessage(assistantId, event.text)
        } else if (event.type === "done") {
          markMessageDone(assistantId)
          return
        }
      }
      markMessageDone(assistantId)
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Failed to get a response.")
      markMessageDone(assistantId)
    } finally {
      setIsSending(false)
    }
  }

  const chatDisabled = isSummarizing || isSending || !documentText
  const showInitialLoader = isSummarizing && messages.length === 0

  return (
    <div className={cn("flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">AI Summary · {file.name}</p>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {showInitialLoader && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading and summarizing your document…
              </div>
            </div>
          </div>
        )}

        {summaryError && !showInitialLoader && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {summaryError}
          </div>
        )}

        {messages.map((m, mIdx) => {
          // Index of the assistant message in the conversation. We
          // need this to number download filenames when the user
          // exports a reply.
          let replyIndex = -1
          if (m.role === "assistant") {
            replyIndex = messages
              .slice(0, mIdx + 1)
              .reduce((n, prev) => (prev.role === "assistant" ? n + 1 : n), 0) - 1
          }
          const isFirstAssistant = m.role === "assistant" && replyIndex === 0

          return (
          <div
            key={m.id}
            className={cn("flex items-start gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-foreground/10 text-foreground" : "bg-primary/10 text-primary"
              )}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={cn(
                // User messages flow horizontally so the copy button can
                // sit *next to* the bubble (to its left). Assistant
                // messages keep the original vertical stack: bubble on
                // top, toolbar below. We swap the visual order with
                // Tailwind's `order-*` utilities so the JSX always
                // renders the bubble before the toolbar.
                "flex min-w-0 flex-1",
                m.role === "user"
                  ? "flex-row items-center justify-end gap-1.5"
                  : "flex-col items-start gap-1"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm max-w-[85%] order-2",
                  m.role === "user"
                    ? // Override the global `::selection` so the user's own
                      // text stays visible while highlighted (the global
                      // primary-on-primary would be invisible on this
                      // bubble).
                      "rounded-tr-sm bg-primary text-primary-foreground selection:bg-white/30 selection:text-primary-foreground"
                    : "rounded-tl-sm bg-muted text-foreground"
                )}
              >
                {m.role === "assistant" ? (
                  <div>
                    {formatContent(m.content)}
                    {m.isStreaming ? (
                      <span
                        aria-hidden
                        className="ml-0.5 inline-block h-4 w-1.5 align-middle bg-current animate-pulse"
                      />
                    ) : null}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                )}
              </div>
              {!m.isStreaming && m.content.trim().length > 0 ? (
                <div
                  className={cn(
                    // The toolbar's `order` is flipped per role: for
                    // user (flex-row + justify-end) we want the
                    // toolbar to render *before* the bubble in the
                    // visual order so it sits to the LEFT of it; for
                    // assistant (flex-col + items-start) we want it
                    // *after* the bubble so it sits BELOW it.
                    "flex items-center gap-1 text-muted-foreground",
                    m.role === "user" ? "order-1 shrink-0" : "order-2"
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(m.content)
                      toast[ok ? "success" : "error"](
                        ok ? "Copied to clipboard" : "Could not copy the message."
                      )
                    }}
                    aria-label="Copy message"
                    title="Copy"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {m.role === "assistant" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const filename = buildDownloadName(
                          file.name,
                          isFirstAssistant ? "summary" : "reply",
                          replyIndex
                        )
                        downloadTextFile(filename, m.content)
                      }}
                      aria-label="Download message"
                      title="Download as .txt"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          )
        })}

        {followUpError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {followUpError}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-background/60 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder={
              isSummarizing
                ? "Waiting for the initial summary…"
                : "Ask anything about the document…"
            }
            rows={1}
            disabled={chatDisabled}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={chatDisabled || input.trim().length === 0}
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Press Enter to send, Shift+Enter for a new line.
        </p>
      </form>
    </div>
  )
}
