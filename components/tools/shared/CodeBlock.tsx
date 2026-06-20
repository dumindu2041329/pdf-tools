"use client"

// Fenced code block (non-mermaid). Shows a small header strip with the
// language label and a monospace body. Shared by the AI summarizer
// chat panel and the translate view so both surfaces render code the
// same way.
export function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-foreground/[0.03]">
      {language ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>{language}</span>
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3 text-xs font-mono leading-6 text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  )
}
