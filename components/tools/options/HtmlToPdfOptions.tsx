"use client"

interface Props {
  files?: File[]
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function HtmlToPdfOptions({ files = [], options, onChange }: Props) {
  const hasFiles = files.length > 0;
  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground">Website URL or Uploaded File</label>
      <input
        type="url"
        placeholder={hasFiles ? "Using uploaded HTML file..." : "https://example.com"}
        value={hasFiles ? "" : ((options.url as string) || "")}
        onChange={(e) => !hasFiles && onChange({ ...options, url: e.target.value })}
        disabled={hasFiles}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base disabled:opacity-50"
      />
      <p className="text-sm text-muted-foreground mt-1">
        {hasFiles ? "File provided. Clear it to use a URL instead." : "Enter the full URL of the page or upload an HTML file to convert to PDF."}
      </p>
    </div>
  )
}
