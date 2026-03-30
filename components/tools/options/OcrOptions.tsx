"use client"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const commonLanguages = [
  { code: "eng", label: "English" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "chi_tra", label: "Chinese (Traditional)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "ara", label: "Arabic" },
  { code: "hin", label: "Hindi" },
  { code: "rus", label: "Russian" },
  { code: "tur", label: "Turkish" },
  { code: "pol", label: "Polish" },
  { code: "nld", label: "Dutch" },
  { code: "swe", label: "Swedish" },
  { code: "dan", label: "Danish" },
  { code: "nor", label: "Norwegian" },
  { code: "fin", label: "Finnish" },
]

export function OcrOptions({ options, onChange }: Props) {
  const selected = ((options.ocr_languages as string[]) || ["eng"])

  const toggle = (code: string) => {
    const next = selected.includes(code)
      ? selected.filter((c: string) => c !== code)
      : [...selected, code]
    if (next.length === 0) return
    onChange({ ...options, ocr_languages: next })
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">OCR Languages</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
        {commonLanguages.map((lang) => (
          <label
            key={lang.code}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(lang.code)}
              onChange={() => toggle(lang.code)}
              className="rounded"
            />
            {lang.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Free users: English only. Upgrade for 80+ languages.</p>
    </div>
  )
}
