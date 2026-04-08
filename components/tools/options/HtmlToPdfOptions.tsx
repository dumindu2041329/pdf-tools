"use client"

interface Props {
  files?: File[]
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function HtmlToPdfOptions({ options, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground">Website URL</label>
      <input
        type="url"
        placeholder="https://example.com"
        value={(options.url as string) || ""}
        onChange={(e) => onChange({ ...options, url: e.target.value })}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
      />
      <p className="text-sm text-muted-foreground mt-1">
        Enter the full URL of the page to convert to PDF.
      </p>
    </div>
  )
}
