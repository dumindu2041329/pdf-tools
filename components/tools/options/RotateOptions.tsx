"use client"

import { RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const rotations = [
  { value: 90, label: "90°" },
  { value: 180, label: "180°" },
  { value: 270, label: "270°" },
]

export function RotateOptions({ options, onChange }: Props) {
  const selected = (options.rotate as number) || 90

  return (
    <div className="space-y-2">
      <label className="text-sm text-muted-foreground">Rotation</label>
      <div className="flex gap-3">
        {rotations.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange({ ...options, rotate: r.value })}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 transition-all cursor-pointer",
              selected === r.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            )}
          >
            <RotateCw className="h-4 w-4" style={{ transform: `rotate(${r.value}deg)` }} />
            <span className="text-base font-medium">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
