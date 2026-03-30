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
            onChange={(e) => onChange({ ...options, detailed: e.target.checked })}
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
    </div>
  )
}
