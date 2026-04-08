"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const conformances = [
  { value: "pdfa-1b", label: "PDF/A-1b" },
  { value: "pdfa-2b", label: "PDF/A-2b" },
  { value: "pdfa-3b", label: "PDF/A-3b" },
]

export function PdfaOptions({ options, onChange }: Props) {
  const selected = (options.conformance as string) || "pdfa-2b"

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Conformance Level</label>
        <div className="flex gap-2">
          {conformances.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange({ ...options, conformance: c.value })}
              className={cn(
                "rounded-lg border px-4 py-2 text-base font-medium transition-all cursor-pointer",
                selected === c.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              )}
            >{c.label}</button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-base cursor-pointer">
        <input
          type="checkbox"
          checked={options.allow_downgrade !== false}
          onChange={(e) => onChange({ ...options, allow_downgrade: e.target.checked })}
          className="rounded"
        />
        Allow downgrade if conversion fails
      </label>
    </div>
  )
}
