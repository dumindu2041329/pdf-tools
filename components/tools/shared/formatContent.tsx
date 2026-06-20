"use client"

import { CodeBlock } from "./CodeBlock"

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; lines: string[] }
  | { kind: "ordered"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "code"; language: string; code: string }

function splitIntoBlocks(content: string): Block[] {
  const blocks: Block[] = []
  // Normalize line endings, then walk line-by-line. Line-based scanning
  // (rather than splitting on blank lines) lets us correctly capture
  // fenced code blocks whose bodies may contain blank lines.
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

    // Fenced code block. Accepts ``` or ~~~ fences of length 3+,
    // with an optional language tag. The body extends until a
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
      while (i < lines.length) {
        const closeRe = new RegExp(`^\\${fenceChar === "`" ? "`" : fenceChar}{${fenceLen},}\\s*$`)
        if (closeRe.test(lines[i])) {
          i++
          break
        }
        body.push(lines[i])
        i++
      }
      const code = body.join("\n")
      blocks.push({ kind: "code", language, code })
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

// Render a chunk of plain text (or in-progress streaming text) as a
// sequence of block-level elements with inline bold/italic/code spans.
// Mirrors the rendering used by the AI summarizer chat panel.
export function formatContent(content: string) {
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

// Copy plain text to the clipboard. Falls back to a hidden <textarea>
// + `document.execCommand("copy")` when the modern Clipboard API is
// unavailable (e.g. insecure context, older browsers).
export async function copyTextToClipboard(text: string): Promise<boolean> {
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
