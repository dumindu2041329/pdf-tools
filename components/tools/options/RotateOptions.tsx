"use client"

import { RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  toolSlug: string
  files?: File[]
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function RotateOptions({ options, onChange }: Props) {
  const current = (options.rotate as number) || 0
  const step = (options.rotateStep as number) || 90

  function handleRight() {
    const next = (current + 90) % 360
    onChange({ ...options, rotate: next, rotateStep: next === 0 ? 90 : step })
  }

  function handleLeft() {
    const next = (current - 90) % 360
    onChange({ ...options, rotate: next === 0 ? 0 : next, rotateStep: step })
  }

  function reset() {
    onChange({ ...options, rotate: 0, rotateStep: 90 })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Rotation</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleLeft}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 transition-all cursor-pointer",
              "border-border hover:border-primary/30"
            )}
          >
            <RotateCw className="h-4 w-4 -scale-x-100" />
            <span className="text-base font-medium">Left</span>
          </button>
          <button
            type="button"
            onClick={reset}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 transition-all cursor-pointer",
              current === 0 ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            )}
          >
            <RotateCw className="h-4 w-4" />
            <span className="text-base font-medium">Reset</span>
          </button>
          <button
            type="button"
            onClick={handleRight}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-3 transition-all cursor-pointer",
              "border-border hover:border-primary/30"
            )}
          >
            <RotateCw className="h-4 w-4" />
            <span className="text-base font-medium">Right</span>
          </button>
        </div>
      </div>

      {current !== 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2">
          <span className="text-sm text-muted-foreground">Current rotation</span>
          <span className="text-sm font-semibold">
            {current > 0 ? `+${current}°` : `${current}°`}
          </span>
        </div>
      )}
    </div>
  )
}
