"use client"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const commonLanguages = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "bg-BG", label: "Bulgarian (Bulgaria)" },
  { code: "ca-CA", label: "Catalan (Spain)" },
  { code: "cs-CZ", label: "Czech (Czech Republic)" },
  { code: "da-DK", label: "Danish (Denmark)" },
  { code: "de-CH", label: "German (Switzerland)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "el-GR", label: "Greek (Greece)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "et-EE", label: "Estonian (Estonia)" },
  { code: "fi-FI", label: "Finnish (Finland)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "hr-HR", label: "Croatian (Croatia)" },
  { code: "hu-HU", label: "Hungarian (Hungary)" },
  { code: "it-IT", label: "Italian (Italy)" },
  { code: "iw-IL", label: "Hebrew (Israel)" },
  { code: "ja-JP", label: "Japanese (Japan)" },
  { code: "ko-KR", label: "Korean (Korea)" },
  { code: "lt-LT", label: "Lithuanian (Lithuania)" },
  { code: "lv-LV", label: "Latvian (Latvia)" },
  { code: "mk-MK", label: "Macedonian (North Macedonia)" },
  { code: "mt-MT", label: "Maltese (Malta)" },
  { code: "nb-NO", label: "Norwegian Bokmål (Norway)" },
  { code: "nl-NL", label: "Dutch (Netherlands)" },
  { code: "no-NO", label: "Norwegian (Norway)" },
  { code: "pl-PL", label: "Polish (Poland)" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ro-RO", label: "Romanian (Romania)" },
  { code: "ru-RU", label: "Russian (Russia)" },
  { code: "sk-SK", label: "Slovak (Slovakia)" },
  { code: "sl-SI", label: "Slovenian (Slovenia)" },
  { code: "sr-SR", label: "Serbian (Serbia)" },
  { code: "sv-SE", label: "Swedish (Sweden)" },
  { code: "tr-TR", label: "Turkish (Turkey)" },
  { code: "uk-UA", label: "Ukrainian (Ukraine)" },
  { code: "zh-CN", label: "Chinese (Simplified, China)" },
  { code: "zh-HK", label: "Chinese (Hong Kong)" },
]

export function OcrOptions({ options, onChange }: Props) {
  const selected = ((options.ocr_languages as string[]) || ["en-US"])

  const toggle = (code: string) => {
    const next = selected.includes(code)
      ? selected.filter((c: string) => c !== code)
      : [...selected, code]
    if (next.length === 0) return
    onChange({ ...options, ocr_languages: next })
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-muted-foreground">OCR Languages</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
        {commonLanguages.map((lang) => (
          <label
            key={lang.code}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-base cursor-pointer hover:bg-muted/30 transition-colors"
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
    </div>
  )
}
