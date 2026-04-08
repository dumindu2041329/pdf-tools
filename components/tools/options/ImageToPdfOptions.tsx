"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function ImageToPdfOptions({ options, onChange }: Props) {
  const update = (key: string, val: unknown) => onChange({ ...options, [key]: val })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Orientation</label>
          <div className="flex gap-2">
            {(["portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => update("orientation", o)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-base font-medium capitalize transition-all cursor-pointer",
                  (options.orientation || "portrait") === o ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                )}
              >{o}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Page Size</label>
          <select
            value={(options.pagesize as string) || "A4"}
            onChange={(e) => update("pagesize", e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          >
            <option value="A4">A4 (297x210 mm)</option>
            <option value="fit">Fit to Image</option>
            <option value="letter">US Letter (215x279.4 mm)</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Margin (px)</label>
        <input
          type="number"
          min={0}
          max={100}
          value={(options.margin as number) || 0}
          onChange={(e) => update("margin", Number(e.target.value))}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      <label className="flex items-center gap-2 text-base cursor-pointer">
        <input
          type="checkbox"
          checked={options.merge_after !== false}
          onChange={(e) => update("merge_after", e.target.checked)}
          className="rounded"
        />
        Merge all images into one PDF
      </label>
    </div>
  )
}
