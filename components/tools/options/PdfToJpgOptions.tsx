"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const conversionModes = [
  {
    value: "pages",
    label: "Page to JPG",
    desc: "Every page of this PDF will be converted into a JPG file.",
  },
  {
    value: "extract",
    label: "Extract Images",
    desc: "All embedded images inside the PDF will be extracted as JPG images.",
  },
]

const qualityLevels = [
  { value: "normal", label: "Normal", desc: "Recommended" },
  { value: "high", label: "High", desc: "" },
]

export function PdfToJpgOptions({ options, onChange }: Props) {
  const mode = (options.pdfjpg_mode as string) || "pages"
  const quality = (options.jpg_quality as string) || "normal"

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Conversion Mode</label>
        <div className="grid gap-3">
          {conversionModes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange({ ...options, pdfjpg_mode: m.value })}
              className={cn(
                "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
                mode === m.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <span className="text-base font-medium">{m.label}</span>
              <span className="text-sm text-muted-foreground mt-1">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "pages" && (
        <div className="space-y-3">
          <label className="text-sm text-muted-foreground">Image Quality</label>
          <div className="grid gap-2">
            {qualityLevels.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => onChange({ ...options, jpg_quality: q.value })}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
                  quality === q.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
              >
                <span className="text-base font-medium">{q.label}</span>
                {q.desc && <span className="text-sm text-muted-foreground">{q.desc}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
