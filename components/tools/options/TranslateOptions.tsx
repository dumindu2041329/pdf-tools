"use client"

import { ArrowLeftRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const languages = [
  { code: "auto", label: "Detect language" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "tr", label: "Turkish" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "no", label: "Norwegian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "uk", label: "Ukrainian" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
]

const DEFAULT_FROM = "auto"
const DEFAULT_TO = "es"

export function TranslateOptions({ options, onChange }: Props) {
  const fromLanguage = (options.fromLanguage as string) || DEFAULT_FROM
  const toLanguage = (options.toLanguage as string) || DEFAULT_TO

  const handleSwitch = () => {
    // "Detect language" can't be a target, so fall back to English.
    const nextFrom = toLanguage === "auto" ? "en" : toLanguage
    onChange({
      ...options,
      fromLanguage: nextFrom,
      toLanguage: fromLanguage === "auto" ? "en" : fromLanguage,
    })
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-muted-foreground">Language</label>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <span className="text-xs text-muted-foreground">From</span>
          <select
            value={fromLanguage}
            onChange={(e) => onChange({ ...options, fromLanguage: e.target.value })}
            className={cn(
              "w-full rounded-lg border border-input bg-background px-3 py-2 text-base",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            )}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code} disabled={lang.code === "auto" ? false : toLanguage === lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSwitch}
          aria-label="Switch languages"
          title="Switch languages"
          className={cn(
            "shrink-0 inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-input bg-background",
            "hover:bg-muted transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          )}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <span className="text-xs text-muted-foreground">To</span>
          <select
            value={toLanguage}
            onChange={(e) => onChange({ ...options, toLanguage: e.target.value })}
            className={cn(
              "w-full rounded-lg border border-input bg-background px-3 py-2 text-base",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            )}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code} disabled={lang.code === fromLanguage}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
