"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const modes = [
  { value: "ranges", label: "By Ranges", desc: "e.g. 1-3, 5, 8-10" },
  { value: "fixed_range", label: "Every N Pages", desc: "Split into chunks" },
  { value: "remove_pages", label: "Remove Pages", desc: "Delete specific pages" },
]

export function SplitOptions({ options, onChange }: Props) {
  const mode = (options.split_mode as string) || "ranges"

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Split Mode</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange({ ...options, split_mode: m.value })}
              className={cn(
                "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
                mode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              )}
            >
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "ranges" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Page Ranges</label>
          <input
            type="text"
            placeholder="e.g. 1-3, 5, 8-10"
            value={(options.ranges as string) || ""}
            onChange={(e) => onChange({ ...options, ranges: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      {mode === "fixed_range" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Pages per split</label>
          <input
            type="number"
            min={1}
            placeholder="e.g. 3"
            value={(options.fixed_range as number) || ""}
            onChange={(e) => onChange({ ...options, fixed_range: Number(e.target.value) })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      {mode === "remove_pages" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Pages to Remove</label>
          <input
            type="text"
            placeholder="e.g. 1, 4, 8-12"
            value={(options.remove_pages as string) || ""}
            onChange={(e) => onChange({ ...options, remove_pages: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}
