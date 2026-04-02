"use client"

import { CompressOptions } from "./CompressOptions"
import { SplitOptions } from "./SplitOptions"
import { RotateOptions } from "./RotateOptions"
import { WatermarkOptions } from "./WatermarkOptions"
import { PageNumberOptions } from "./PageNumberOptions"
import { ProtectOptions } from "./ProtectOptions"
import { UnlockOptions } from "./UnlockOptions"
import { ImageToPdfOptions } from "./ImageToPdfOptions"
import { HtmlToPdfOptions } from "./HtmlToPdfOptions"
import { PdfaOptions } from "./PdfaOptions"
import { OcrOptions } from "./OcrOptions"
import { ExtractOptions } from "./ExtractOptions"

interface ToolOptionsProps {
  toolSlug: string
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

const optionsMap: Record<
  string,
  React.ComponentType<{ options: Record<string, unknown>; onChange: (opts: Record<string, unknown>) => void }>
> = {
  "compress-pdf": CompressOptions,
  "split-pdf": SplitOptions,
  "remove-pages": SplitOptions,
  "rotate-pdf": RotateOptions,
  "watermark-pdf": WatermarkOptions,
  "add-page-numbers": PageNumberOptions,
  "protect-pdf": ProtectOptions,
  "unlock-pdf": UnlockOptions,
  "jpg-to-pdf": ImageToPdfOptions,
  "scan-to-pdf": ImageToPdfOptions,
  "html-to-pdf": HtmlToPdfOptions,
  "pdf-to-pdfa": PdfaOptions,
  "validate-pdfa": PdfaOptions,
  "ocr-pdf": OcrOptions,
  "extract-pages": ExtractOptions,
}

export function ToolOptions({ toolSlug, options, onChange }: ToolOptionsProps) {
  const OptionsComponent = optionsMap[toolSlug]
  if (!OptionsComponent) return null

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold mb-4">Options</h3>
      <OptionsComponent options={options} onChange={onChange} />
    </div>
  )
}

export const hasToolOptions = (slug: string) => slug in optionsMap
