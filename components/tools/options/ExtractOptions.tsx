"use client"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function ExtractOptions({ options, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/30 transition-colors">
        <div className="mt-0.5">
          <input
            type="checkbox"
            checked={!!options.detailed}
            onChange={(e) => {
              const detailed = e.target.checked
              onChange({ 
                ...options, 
                detailed,
                format: detailed ? (options.format || "json") : undefined 
              })
            }}
            className="rounded"
          />
        </div>
        <div>
          <span className="block text-sm font-medium">Detailed Extraction Mode</span>
          <span className="block text-xs text-muted-foreground mt-1">
            Standard mode returns plain text. Detailed mode includes coordinates, fonts, and bounding boxes for every word.
          </span>
        </div>
      </label>

      {!!options.detailed && (
        <div className="space-y-2 pl-2">
          <label className="text-xs text-muted-foreground">Output Format</label>
          <select
            value={(options.format as string) || "json"}
            onChange={(e) => onChange({ ...options, format: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="json">JSON Extract (.json)</option>
            <option value="csv">CSV Spreadsheet (.csv)</option>
            <option value="md">Markdown Table (.md)</option>
          </select>
        </div>
      )}
    </div>
  )
}
