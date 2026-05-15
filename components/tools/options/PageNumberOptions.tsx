"use client"

import { cn } from "@/lib/utils"
import { CheckCircle2 } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
  files?: File[]
}

const fonts = ["Arial", "Impact", "Arial Unicode MS", "Verdana", "Courier", "Comic Sans MS", "Times New Roman"] as const

const marginPresets: Record<string, { top: number; bottom: number; left: number; right: number }> = {
  small: { top: 10, bottom: 10, left: 10, right: 10 },
  recommended: { top: 20, bottom: 20, left: 20, right: 20 },
  big: { top: 30, bottom: 30, left: 30, right: 30 },
}

const textFormats = [
  { label: "Insert only page number", value: "{n}" },
  { label: "Page {n}", value: "Page {n}" },
  { label: "Page {n} of {p}", value: "Page {n} of {p}" },
]

export function PageNumberOptions({ options, onChange, files }: Props) {
  const update = useCallback((key: string, val: unknown) => onChange({ ...options, [key]: val }), [options, onChange])

  const autoFilledRef = useRef(false)

  useEffect(() => {
    if (!files || files.length === 0) {
      autoFilledRef.current = false
      return
    }

    let isMounted = true
    let total = 0
    let completed = 0

    files.forEach((file) => {
      const objUrl = URL.createObjectURL(file)
      getPdfJs().then((pdfjs) => {
        pdfjs
          .getDocument(objUrl)
          .promise.then((pdf) => {
            if (isMounted) {
              total += pdf.numPages
            }
          })
          .catch((err) => {
            console.error("Failed to read PDF pages", err)
          })
          .finally(() => {
            URL.revokeObjectURL(objUrl)
            completed++
            if (completed === files.length && isMounted) {
              if (!autoFilledRef.current) {
                onChange({ ...options, pages: `1-${total}` })
                autoFilledRef.current = true
              }
            }
          })
      })
    })

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  const pageMode = (options.page_mode as string) || "single"
  const margin = (options.margin as string) || "recommended"
  const textFormat = (options.text_format as string) || "{n}"
  const customText = (options.custom_text as string) || ""

  const currentV = (options.vertical_position as string) || "bottom"
  const currentH = (options.horizontal_position as string) || "center"

  const setPosition = (v: string, h: string) => {
    onChange({ ...options, vertical_position: v, horizontal_position: h })
  }

  const pagesRaw = (options.pages as string) || ""
  const [fromPageStr, toPageStr] = pagesRaw.split("-")
  const fromPage = fromPageStr || ""
  const toPage = toPageStr || ""

  const updatePages = (from: string, to: string) => {
    if (!from && !to) {
      update("pages", "")
    } else {
      update("pages", `${from || 1}-${to || ""}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Page mode</label>
        <div className="grid grid-cols-2 gap-0 border-b border-border">
          <button
            type="button"
            onClick={() => update("page_mode", "single")}
            className={cn(
              "relative flex flex-col items-center justify-center py-4 px-4 border-b-2 transition-colors",
              pageMode === "single" ? "border-primary bg-muted/20" : "border-transparent hover:bg-muted/10"
            )}
          >
            {pageMode === "single" && (
              <CheckCircle2 className="absolute top-2 left-2 w-4 h-4 text-green-500 fill-white" />
            )}
            <div className="w-8 h-10 border border-current rounded-sm mx-auto mb-1" />
            <span className="text-sm font-medium">Single page</span>
          </button>

          <button
            type="button"
            onClick={() => update("page_mode", "facing")}
            className={cn(
              "relative flex flex-col items-center justify-center py-4 px-4 border-l border-border border-b-2 transition-colors",
              pageMode === "facing" ? "border-b-primary bg-muted/20" : "border-b-transparent hover:bg-muted/10"
            )}
          >
            {pageMode === "facing" && (
              <CheckCircle2 className="absolute top-2 left-2 w-4 h-4 text-green-500 fill-white" />
            )}
            <div className="flex gap-0.5 mx-auto mb-1">
              <div className="w-5 h-10 border border-current rounded-sm" />
              <div className="w-5 h-10 border border-current rounded-sm" />
            </div>
            <span className="text-sm font-medium">Facing pages</span>
          </button>
        </div>

        {pageMode === "facing" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!options.first_cover}
              onChange={(e) => update("first_cover", e.target.checked)}
              className="rounded"
            />
            First page is cover page
          </label>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-base font-semibold">Position:</label>
        <div className="flex items-center gap-6">
          <div className="grid grid-cols-3 w-24 h-24 border border-border">
            {(["top", "middle", "bottom"] as const).map((v) =>
              (["left", "center", "right"] as const).map((h) => {
                if (v === "middle") {
                  return <div key={`${v}-${h}`} className="w-full h-full border-[0.5px] border-border border-dashed bg-muted/10" />
                }
                const isActive = currentV === v && currentH === h
                return (
                  <button
                    key={`${v}-${h}`}
                    type="button"
                    onClick={() => setPosition(v, h)}
                    className={cn(
                      "w-full h-full border-[0.5px] border-border border-dashed flex items-center justify-center transition-colors",
                      isActive ? "bg-muted/50" : "hover:bg-muted/50"
                    )}
                  >
                    {isActive && <div className="w-4 h-4 rounded-full bg-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Margin</label>
        <div className="flex gap-2">
          {(["small", "recommended", "big"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                update("margin", m)
                const preset = marginPresets[m]
                onChange({ ...options, margin: m, margin_top: preset.top, margin_bottom: preset.bottom, margin_left: preset.left, margin_right: preset.right })
              }}
              className={cn(
                "flex-1 py-2 px-3 rounded-md border text-sm transition-colors capitalize",
                margin === m ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Pages</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="number"
              min={1}
              value={fromPage}
              onChange={(e) => updatePages(e.target.value, toPage)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
              placeholder="1"
            />
          </div>
          <div className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">To</span>
            <input
              type="number"
              min={1}
              value={toPage}
              onChange={(e) => updatePages(fromPage, e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
              placeholder="All"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">First number</label>
        <input
          type="number"
          min={1}
          value={(options.first_number as number) || 1}
          onChange={(e) => update("first_number", Number(e.target.value))}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Text</label>
        <select
          value={customText ? "custom" : textFormat}
          onChange={(e) => {
            if (e.target.value === "custom") {
              update("text_format", "custom")
            } else {
              onChange({ ...options, text_format: e.target.value, custom_text: "" })
            }
          }}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        >
          {textFormats.map((tf) => (
            <option key={tf.value} value={tf.value}>{tf.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {customText !== "" || textFormat === "custom" ? (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Custom text (use {"{n}"} for page number, {"{p}"} for total pages)</span>
            <input
              type="text"
              value={customText || textFormat}
              onChange={(e) => onChange({ ...options, text_format: e.target.value, custom_text: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
              placeholder="Page {n} of {p}"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="text-sm text-muted-foreground">Text format</label>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={(options.font_family as string) || "Arial Unicode MS"}
              onChange={(e) => update("font_family", e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50 outline-none min-w-36"
            >
              {fonts.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <div className="flex items-center border border-border rounded-md bg-background px-3 py-1.5 gap-2">
              <input
                type="number"
                min={6}
                max={72}
                value={(options.font_size as number) || 14}
                onChange={(e) => update("font_size", Number(e.target.value))}
                className="w-14 bg-transparent outline-none text-base"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => update("font_weight", options.font_weight === "bold" ? "normal" : "bold")}
              className={cn("p-1.5 rounded hover:bg-muted transition-colors", options.font_weight === "bold" && "bg-muted")}
            >
              <strong className="font-serif text-lg px-1">B</strong>
            </button>
            <button
              type="button"
              onClick={() => update("font_style", options.font_style === "italic" ? "normal" : "italic")}
              className={cn("p-1.5 rounded hover:bg-muted transition-colors", options.font_style === "italic" && "bg-muted")}
            >
              <em className="font-serif text-lg px-1">I</em>
            </button>
            <button
              type="button"
              onClick={() => update("text_decoration", options.text_decoration === "underline" ? "none" : "underline")}
              className={cn("p-1.5 rounded hover:bg-muted transition-colors", options.text_decoration === "underline" && "bg-muted")}
            >
              <span className="font-serif text-lg px-1 underline">U</span>
            </button>

            <div className="relative ml-2 p-1.5 rounded hover:bg-muted transition-colors cursor-pointer flex flex-col items-center">
              <span className="font-serif font-bold text-lg leading-none">A</span>
              <div className="w-4 h-1 mt-0.5" style={{ backgroundColor: (options.font_color as string) || "#000000" }} />
              <input
                type="color"
                value={(options.font_color as string) || "#000000"}
                onChange={(e) => update("font_color", e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}