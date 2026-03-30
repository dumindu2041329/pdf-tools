"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const levels = [
  { value: "extreme", label: "Maximum", desc: "Smallest file, lower quality" },
  { value: "recommended", label: "Recommended", desc: "Best balance of size and quality" },
  { value: "low", label: "Minimal", desc: "Largest file, highest quality" },
]

export function CompressOptions({ options, onChange }: Props) {
  const selected = (options.compression_level as string) || "recommended"

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Compression Level</label>
      <div className="grid gap-2">
        {levels.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => onChange({ ...options, compression_level: level.value })}
            className={cn(
              "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
              selected === level.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
          >
            <span className="text-sm font-medium">{level.label}</span>
            <span className="text-xs text-muted-foreground">{level.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
