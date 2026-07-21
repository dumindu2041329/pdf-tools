"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Bot, Clock, Copy, FileText, GitBranch, Loader2, Maximize2, Send, Sparkles, User, X, ZoomIn, ZoomOut } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CodeBlock } from "@/components/tools/shared/CodeBlock"
import { copyTextToClipboard } from "@/components/tools/shared/formatContent"

// Server-Sent Events payload shape. Kept in sync with the API route.
export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; documentText?: string }
  | { type: "error"; message: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  /** True while the assistant is still being streamed. Renders a caret. */
  isStreaming?: boolean
  /** Epoch ms when the message was first created. Powers the document footer. */
  createdAt?: number
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

function formatContent(content: string, isStreaming: boolean = false) {
  // Render the AI's response as a sequence of block-level elements
  // (paragraphs, bullet lists, numbered lists, pipe tables, and
  // fenced code / mermaid blocks) with inline bold/italic/code spans.
  // We do this by hand instead of pulling in a markdown library to keep
  // the bundle small and avoid `dangerouslySetInnerHTML`.
  const blocks = splitIntoBlocks(content)
  return blocks.map((block, bIdx) => {
    switch (block.kind) {
      case "bullet":
        return (
          <ul key={bIdx} className="list-disc pl-6 space-y-1.5 my-3 marker:text-muted-foreground">
            {block.lines.map((line, lIdx) => (
              <li key={lIdx} className="leading-7">{renderInline(line)}</li>
            ))}
          </ul>
        )
      case "ordered":
        return (
          <ol key={bIdx} className="list-decimal pl-6 space-y-1.5 my-3 marker:text-muted-foreground marker:font-medium">
            {block.lines.map((line, lIdx) => (
              <li key={lIdx} className="leading-7">{renderInline(line)}</li>
            ))}
          </ol>
        )
      case "table":
        return renderTable(block, bIdx)
      case "heading":
        return (
          <h4
            key={bIdx}
            className="font-semibold mt-5 mb-2 text-[1rem] tracking-tight text-foreground"
          >
            {renderInline(block.text)}
          </h4>
        )
      case "code":
        return <CodeBlock key={bIdx} language={block.language} code={block.code} />
      case "mermaid":
        return (
          <MermaidDiagram
            key={bIdx}
            code={block.code}
            closed={block.closed}
            isStreaming={isStreaming}
          />
        )
      case "paragraph":
      default:
        return (
          <p key={bIdx} className="my-2.5 leading-7">
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
  | { kind: "code"; language: string; code: string }
  | { kind: "mermaid"; code: string; closed: boolean }

function splitIntoBlocks(content: string): Block[] {
  const blocks: Block[] = []
  // Normalize line endings, then walk line-by-line. Line-based scanning
  // (rather than splitting on blank lines) lets us correctly capture
  // fenced code/mermaid blocks whose bodies may contain blank lines.
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  let i = 0
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const lines = paragraphBuffer

    // 1) Tables must start with a header row that contains a pipe.
    if (lines[0]?.includes("|")) {
      const table = tryParseTable(lines.join("\n"))
      if (table) {
        blocks.push(table)
        paragraphBuffer = []
        return
      }
    }

    // 2) Bullet / ordered lists — every line must be a list item.
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      blocks.push({
        kind: "bullet",
        lines: lines.map((l) => l.replace(/^\s*[-*•]\s+/, "")),
      })
      paragraphBuffer = []
      return
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({
        kind: "ordered",
        lines: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")),
      })
      paragraphBuffer = []
      return
    }

    // 3) Single-line `#` / `##` / `###` headings.
    if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
      blocks.push({ kind: "heading", text: lines[0].replace(/^#{1,6}\s+/, "") })
      paragraphBuffer = []
      return
    }

    blocks.push({ kind: "paragraph", text: lines.join("\n") })
    paragraphBuffer = []
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code/mermaid block. Accepts ``` or ~~~ fences of length
    // 3+, with an optional language tag. The body extends until a
    // matching closing fence (or end-of-content for unclosed blocks
    // during streaming).
    const fenceMatch = line.match(/^(`{3,}|~{3,})\s*([\w-]*)\s*$/)
    if (fenceMatch) {
      flushParagraph()
      const fenceChar = fenceMatch[1][0]
      const fenceLen = fenceMatch[1].length
      const language = (fenceMatch[2] || "").toLowerCase()
      i++

      const body: string[] = []
      let closed = false
      while (i < lines.length) {
        const closeRe = new RegExp(`^\\${fenceChar === "`" ? "`" : fenceChar}{${fenceLen},}\\s*$`)
        if (closeRe.test(lines[i])) {
          i++
          closed = true
          break
        }
        body.push(lines[i])
        i++
      }
      const code = body.join("\n")
      if (language === "mermaid") {
        blocks.push({ kind: "mermaid", code, closed })
      } else {
        blocks.push({ kind: "code", language, code })
      }
      continue
    }

    // Blank line = paragraph boundary.
    if (!line.trim()) {
      flushParagraph()
      i++
      continue
    }

    paragraphBuffer.push(line)
    i++
  }
  flushParagraph()

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
    <div key={key} className="my-4 overflow-x-auto rounded-lg border border-border bg-background/50">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-muted/60 border-b border-border">
          <tr>
            {block.header.map((cell, cIdx) => (
              <th
                key={cIdx}
                className="px-4 py-2.5 text-left font-semibold text-foreground"
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rIdx) => (
            <tr key={rIdx} className="align-top border-b border-border last:border-b-0">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-4 py-2.5 leading-6">
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

// Document-style "page" wrapper for assistant messages. Renders a
// paper-like card with a header strip (file name + "AI Summary" /
// "Response" label), a generously padded body, and a small footer with
// the generation timestamp. Visually similar to Claude's Artifacts.
function DocumentBubble({
  fileName,
  content,
  isStreaming,
  isSummary,
  generatedAt,
}: {
  fileName: string
  content: string
  isStreaming?: boolean
  isSummary?: boolean
  generatedAt?: number
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
          <span className="text-xs font-medium text-foreground truncate">
            {isSummary ? fileName : "AI Response"}
          </span>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isSummary ? "AI Summary" : "Response"}
        </span>
      </div>

      {/* Document body */}
      <div className="px-6 py-5 text-[0.9rem] leading-7 text-foreground">
        {formatContent(content, isStreaming ?? false)}
        {isStreaming ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-1.5 align-middle bg-current animate-pulse"
          />
        ) : null}
      </div>

      {/* Document footer */}
      {formattedTime && !isStreaming ? (
        <div className="flex items-center justify-end gap-1.5 px-5 py-1.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formattedTime}</span>
        </div>
      ) : null}
    </div>
  )
}

// Mermaid diagram renderer. Dynamically imports the (heavy) mermaid
// library on first use so the initial bundle stays small. While the
// message is still streaming — or the fence hasn't been closed yet —
// we fall back to a plain code preview instead of attempting to
// render an incomplete diagram.
function MermaidDiagram({
  code,
  closed,
  isStreaming,
}: {
  code: string
  closed: boolean
  isStreaming: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Fullscreen zoom level. The wrapper width is set to `${zoom *
  // 100}%` so 1 = 100% (default), 2 = 200% (double size, scrollable),
  // 0.5 = 50% (centered, smaller). Bounded so users can't blow the
  // diagram off-screen or shrink it into oblivion.
  const [zoom, setZoom] = useState(1)
  // useCallback keeps these referentially stable so the keydown
  // listener below doesn't re-attach on every render (ESLint flags
  // the exhaustive-deps otherwise).
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), [])
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), [])
  const resetZoom = useCallback(() => setZoom(1), [])
  // Pan-to-drag state (desktop space+drag, mobile = native touch
  // scroll on the same overflow-auto container). The cursor and
  // `select-none` are derived from these.
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  // Snapshot of the cursor + scroll position at drag start. Stored in
  // a ref (not state) so the mousemove handler doesn't re-render on
  // every pixel of movement.
  const dragStateRef = useRef<{
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  // Ref to the scrollable fullscreen canvas; pan handlers read its
  // current scrollLeft/scrollTop to compute the new position.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // Stable, SSR-safe unique id used by mermaid to namespace its temp
  // DOM nodes. `useId` is the React-blessed way to get one.
  const diagramId = `mermaid-${useId().replace(/:/g, "")}`

  useEffect(() => {
    // Don't try to render until the fence is closed AND the message
    // is fully streamed. Showing a half-built diagram flashing as
    // chunks arrive is much worse UX than a stable code preview.
    if (isStreaming || !closed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset diagram state when stream updates arrive
      setSvg(null)
      setError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import("mermaid")).default
        // `securityLevel: "strict"` blocks any node/click/JS handlers
        // injected by the diagram text — required because we ultimately
        // mount the rendered SVG via `dangerouslySetInnerHTML`.
        // `useMaxWidth: true` makes the SVG fill the available width
        // (otherwise it renders at its natural size, which is usually
        // much smaller than the document body and looks lost). The
        // `themeVariables.fontSize` bump makes node/edge labels easier
        // to read at chat-bubble scale.
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
          flowchart: { useMaxWidth: true, htmlLabels: true },
          themeVariables: { fontSize: "16px" },
        })
        const { svg: rendered } = await mermaid.render(diagramId, code.trim())
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render the diagram.")
          setSvg(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, closed, isStreaming, resolvedTheme, diagramId])

  // Fullscreen keyboard shortcuts: Esc closes, Cmd/Ctrl +/- zooms,
  // Cmd/Ctrl + 0 resets, Space (held) arms pan-to-drag. Without
  // these the user has to click the tiny icon buttons every time,
  // which is annoying for repeated zoom adjustments.
  useEffect(() => {
    if (!isFullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false)
        return
      }
      if (e.code === "Space" && !e.repeat) {
        // `preventDefault` so the browser doesn't scroll the page
        // when the user is just hovering with space held. We only do
        // this when the modal is open so the rest of the app behaves
        // normally.
        e.preventDefault()
        setIsSpacePressed(true)
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        zoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        zoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        resetZoom()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false)
        setIsDragging(false)
        dragStateRef.current = null
      }
    }
    // If the user alt-tabs away with space held, the keyup never
    // fires and we'd be stuck in "pan mode". Reset on window blur.
    const onBlur = () => {
      setIsSpacePressed(false)
      setIsDragging(false)
      dragStateRef.current = null
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [isFullscreen, zoomIn, zoomOut, resetZoom])

  // Reset pan state whenever the modal closes so reopening starts
  // fresh (no stuck grab cursor, no half-completed drag).
  useEffect(() => {
    if (isFullscreen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Cleanup pan state when fullscreen closes
    setIsSpacePressed(false)
    setIsDragging(false)
    dragStateRef.current = null
  }, [isFullscreen])

  // Mouse drag on the canvas. We only START the drag when space is
  // held (the "pan" gesture) so normal clicks still work — e.g.
  // selecting node labels in the SVG. The actual scroll update
  // happens via document-level listeners (below) so the drag keeps
  // tracking even if the cursor leaves the canvas mid-drag.
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSpacePressed) return
    if (e.button !== 0) return // only main (left) button
    e.preventDefault()
    const el = scrollContainerRef.current
    if (!el) return
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    }
    setIsDragging(true)
  }

  // Document-level move/up so the drag survives the cursor briefly
  // leaving the canvas (e.g. over the header). Stored handlers read
  // the latest drag state from the ref to avoid stale closures.
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const state = dragStateRef.current
      const el = scrollContainerRef.current
      if (!state || !el) return
      e.preventDefault()
      el.scrollLeft = state.scrollLeft - (e.clientX - state.startX)
      el.scrollTop = state.scrollTop - (e.clientY - state.startY)
    }
    const onUp = () => {
      setIsDragging(false)
      dragStateRef.current = null
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [isDragging])

  const copyCode = async () => {
    const ok = await copyTextToClipboard(code)
    toast[ok ? "success" : "error"](
      ok ? "Copied mermaid code to clipboard" : "Could not copy the code."
    )
  }

  // Streaming or unclosed: show the raw code so the user can watch it
  // build up. This is the same look as a normal code block, but with
  // a "Mermaid" language chip so it's clear what's coming.
  if (isStreaming || !closed) {
    return <CodeBlock language="mermaid" code={code} />
  }

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
        <p className="font-semibold mb-1">Diagram could not be rendered</p>
        <p className="opacity-80">{error}</p>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-foreground/[0.02] p-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Rendering diagram…
      </div>
    )
  }

  return (
    <>
      {/* In-chat diagram card. Header mirrors the document body so it
          reads as a sub-section; the SVG itself is forced to fill the
          width so wide flowcharts don't end up as a small centered
          strip in a sea of whitespace. */}
      <div className="my-4 overflow-hidden rounded-lg border border-border bg-background/50">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Diagram</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyCode}
              title="Copy mermaid code"
              aria-label="Copy mermaid code"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsFullscreen(true)}
              title="View fullscreen"
              aria-label="View fullscreen"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="p-4 [&_svg]:!w-full [&_svg]:!h-auto">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>

      {/* Fullscreen overlay. Backdrop click + Escape both close it;
          the inner card swallows clicks so the user can pan/scroll the
          diagram without accidentally dismissing the modal. */}
      {isFullscreen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-8"
          onClick={() => setIsFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Diagram fullscreen view"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 backdrop-blur px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Diagram</span>
                {/* Gesture hint. Hidden on small screens where the
                    header is already cramped. Uses a real <kbd> so
                    the keycap looks like a keycap, matching the
                    keyboard-shortcut convention users expect. */}
                <span className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  Hold
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-sm">
                    Space
                  </kbd>
                  <span>+ drag to pan ·</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-sm">
                    Esc
                  </kbd>
                  <span>to close</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Zoom controls. The percentage label is itself a
                    button — clicking it snaps back to 100%. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomOut}
                  disabled={zoom <= 0.5}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetZoom}
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium tabular-nums"
                  title="Reset zoom"
                  aria-label="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomIn}
                  disabled={zoom >= 3}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Close fullscreen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Scrollable canvas. The outer wrapper's width is driven
                by `zoom` so 1.5x = 150% wide, 0.5x = 50% wide, etc.
                When the wrapper is narrower than the parent, `mx-auto`
                centers it. When it's wider (zoom > 1), the parent
                scrolls horizontally so the user can pan. The inner
                flex container vertically centers the diagram at any
                zoom level.

                The same `overflow-auto` container is also the target
                of our pan-to-drag gesture: hold Space + click and
                drag on desktop (handled by `handleCanvasMouseDown` +
                the document-level move/up listeners above), or just
                swipe with a finger on mobile — native touch scroll
                works out of the box here. */}
            <div
              ref={scrollContainerRef}
              onMouseDown={handleCanvasMouseDown}
              className={cn(
                "flex-1 overflow-auto",
                // `cursor-grab` only appears once space is held, so
                // the rest of the time the user can click / select
                // text in the SVG without surprise.
                isSpacePressed && !isDragging && "cursor-grab",
                isDragging && "cursor-grabbing select-none"
              )}
            >
              <div
                className="mx-auto transition-[width] duration-200 ease-out"
                style={{ width: `${zoom * 100}%` }}
              >
                <div
                  className="flex min-h-[60vh] items-center justify-center p-6 sm:p-10 [&_svg]:!w-full [&_svg]:!h-auto [&_svg]:!max-w-none"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-grow the chat input: reset to `auto` so the browser can
  // measure the new content's full scrollHeight, then snap the
  // element's height to that value. Capped at ~6 rows of pixels so
  // the input doesn't push the chat off-screen on long pastes.
  const resizeInput = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    const max = 6 * 24 // ~6 lines at ~24px line-height
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden"
  }

  useEffect(() => {
    resizeInput()
  }, [input])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize streaming summary on mount
    setMessages([
      { id: assistantId, role: "assistant", content: "", isStreaming: true, createdAt: Date.now() },
    ])
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
        const message = err instanceof Error ? err.message : "Could not summarize the document."
        setSummaryError(message)
        // Clear the partial content the server may have streamed
        // before it detected a bad response (e.g. a free model
        // returning a safety classification instead of a summary).
        // The error banner is the only thing the user needs to see.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "", isStreaming: false } : m
          )
        )
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
      { id: assistantId, role: "assistant", content: "", isStreaming: true, createdAt: Date.now() },
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
  // The very first assistant message is always the document summary;
  // every later one is a follow-up "Response". Used to label the
  // document-style header strip.
  const firstAssistantId = messages.find((msg) => msg.role === "assistant")?.id

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

        {messages.map((m) => (
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
              {m.role === "assistant" ? (
                <DocumentBubble
                  fileName={file.name}
                  content={m.content}
                  isStreaming={m.isStreaming}
                  isSummary={m.id === firstAssistantId}
                  generatedAt={m.createdAt}
                />
              ) : (
                <div
                  className={cn(
                    // User bubble: chat-style chip on the right. Uses
                    // `order-2` so the toolbar (rendered after in JSX)
                    // can sit to its left via `order-1`.
                    "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground selection:bg-white/30 selection:text-primary-foreground",
                    "px-4 py-3 text-sm max-w-[85%] order-2 whitespace-pre-wrap leading-relaxed"
                  )}
                >
                  {m.content}
                </div>
              )}
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
                </div>
              ) : null}
            </div>
          </div>
        ))}

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
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
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
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-h-36"
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
