"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const layoutOptions = [
  {
    value: "single",
    label: "One Sheet",
    desc: "All data will be merged into a single Excel sheet.",
  },
  {
    value: "multiple",
    label: "Multiple Sheets",
    desc: "Each page or section will be saved as a separate Excel sheet.",
  },
]

export function PdfToExcelOptions({ options, onChange }: Props) {
  const layout = (options.excel_layout as string) || "single"

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Layout</label>
        <div className="grid gap-3">
          {layoutOptions.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => onChange({ ...options, excel_layout: l.value })}
              className={cn(
                "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
                layout === l.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <span className="text-base font-medium">{l.label}</span>
              <span className="text-sm text-muted-foreground mt-1">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}