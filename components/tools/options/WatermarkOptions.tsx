"use client"

import { cn } from "@/lib/utils"
import { Image as ImageIcon, CheckCircle2, Layers } from "lucide-react"
import { useRef, useEffect, useCallback } from "react"

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

const fonts = ["Arial", "Arial Unicode MS", "Verdana", "Courier", "Times New Roman", "Comic Sans MS", "WenQuanYi Zen Hei", "Lohit Marathi"] as const

export function WatermarkOptions({ options, onChange, files }: Props) {
  const mode = (options.mode as string) || "text"
  const update = useCallback((key: string, val: unknown) => onChange({ ...options, [key]: val }), [options, onChange])
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!files || files.length === 0) return
    const file = files[0]
    const objUrl = URL.createObjectURL(file)
    getPdfJs().then((pdfjs) => {
      pdfjs
        .getDocument(objUrl)
        .promise.then((pdf) => {
          if (!options.pages) {
            update("pages", `1-${pdf.numPages}`)
          }
        })
        .finally(() => URL.revokeObjectURL(objUrl))
    })
  }, [files, options.pages, update])

  // Derive current position for the 3x3 grid
  const vPos = (options.vertical_position as string) || "middle"
  const hPos = (options.horizontal_position as string) || "center"

  const setPosition = (v: string, h: string) => {
    onChange({ ...options, vertical_position: v, horizontal_position: h })
  }

  // Parse pages
  const pagesRaw = (options.pages as string) || ""
  const [fromPageStr, toPageStr] = pagesRaw.split("-")
  const fromPage = fromPageStr || "1"
  const toPage = toPageStr || ""

  const updatePages = (from: string, to: string) => {
    if (!from && !to) {
      update("pages", "")
    } else {
      update("pages", `${from || 1}-${to || ""}`)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      update("image", e.target.files[0])
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Mode Selector */}
      <div className="grid grid-cols-2 gap-0 border-b border-border">
        <button
          type="button"
          onClick={() => update("mode", "text")}
          className={cn(
            "relative flex flex-col items-center justify-center py-6 px-4 border-b-2 transition-colors",
            mode === "text" ? "border-primary bg-muted/20" : "border-transparent hover:bg-muted/10"
          )}
        >
          {mode === "text" && (
            <CheckCircle2 className="absolute top-3 left-3 w-5 h-5 text-green-500 fill-white" />
          )}
          <div className="text-4xl font-serif font-bold mb-2 border-b-4 border-foreground px-2">A</div>
          <span className="text-sm font-medium">Place text</span>
        </button>

        <button
          type="button"
          onClick={() => update("mode", "image")}
          className={cn(
            "relative flex flex-col items-center justify-center py-6 px-4 border-l border-border border-b-2 transition-colors",
            mode === "image" ? "border-b-primary bg-muted/20" : "border-b-transparent hover:bg-muted/10"
          )}
        >
          {mode === "image" && (
            <CheckCircle2 className="absolute top-3 left-3 w-5 h-5 text-green-500 fill-white" />
          )}
          <ImageIcon className="w-12 h-12 mb-2 text-muted-foreground" strokeWidth={1} />
          <span className="text-sm font-medium text-muted-foreground">Place image</span>
        </button>
      </div>

      <div className="space-y-6 px-1">
        {mode === "text" ? (
          <>
            {/* Text Input */}
            <div className="space-y-2">
              <label className="text-base font-semibold">Text:</label>
              <input
                type="text"
                placeholder="iLovePDF"
                value={(options.text as string) || ""}
                onChange={(e) => update("text", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              />
            </div>

            {/* Text Format */}
            <div className="space-y-3">
              <label className="text-base font-semibold">Text format:</label>
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
                    min={8}
                    max={200}
                    value={(options.font_size as number) || 14}
                    onChange={(e) => update("font_size", Number(e.target.value))}
                    className="w-16 bg-transparent outline-none text-base"
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
                  onClick={() => update("font_decoration", options.font_decoration === "underline" ? "none" : "underline")}
                  className={cn("p-1.5 rounded hover:bg-muted transition-colors", options.font_decoration === "underline" && "bg-muted")}
                >
                  <u className="font-serif text-lg px-1">U</u>
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
          </>
        ) : (
          /* Image Upload */
          <div className="flex justify-center py-4">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 rounded-md bg-muted/30 border border-border pr-6 pl-0 overflow-hidden hover:bg-muted/50 transition-colors w-full max-w-sm"
            >
              <div className="bg-red-500 p-4 text-white">
                <ImageIcon className="w-6 h-6" />
              </div>
              <span className="font-medium">
                {options.image instanceof File ? options.image.name : "ADD IMAGE"}
              </span>
            </button>
          </div>
        )}

        {/* Position */}
        <div className="space-y-2">
          <label className="text-base font-semibold">Position:</label>
          <div className="flex items-center gap-6">
            <div className="grid grid-cols-3 w-24 h-24 border border-border">
              {["top", "middle", "bottom"].map((v) =>
                ["left", "center", "right"].map((h) => {
                  const isActive = vPos === v && hPos === h
                  return (
                    <button
                      key={`${v}-${h}`}
                      type="button"
                      onClick={() => setPosition(v, h)}
                      className={cn(
                        "w-full h-full border-[0.5px] border-border border-dashed flex items-center justify-center transition-colors",
                        isActive ? "bg-red-100 dark:bg-red-950/30" : "hover:bg-muted/50"
                      )}
                    >
                      {isActive && <div className="w-4 h-4 rounded-full bg-red-500" />}
                    </button>
                  )
                })
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!options.mosaic}
                onChange={(e) => update("mosaic", e.target.checked)}
                className="w-5 h-5 rounded border-border"
              />
              <span className="text-base text-muted-foreground">Mosaic</span>
            </label>
          </div>
        </div>

        {/* Transparency & Rotation */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-base font-semibold">Transparency:</label>
            <select
              value={(options.transparency as number) ?? 100}
              onChange={(e) => update("transparency", Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
            >
              <option value={100}>No transparency</option>
              <option value={75}>25%</option>
              <option value={50}>50%</option>
              <option value={25}>75%</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-base font-semibold">Rotation:</label>
            <select
              value={(options.rotation as number) || 0}
              onChange={(e) => update("rotation", Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
            >
              <option value={0}>Do not rotate</option>
              <option value={45}>45 degrees</option>
              <option value={90}>90 degrees</option>
              <option value={180}>180 degrees</option>
              <option value={270}>270 degrees</option>
            </select>
          </div>
        </div>

        {/* Pages */}
        <div className="space-y-2">
          <label className="text-base font-semibold">Pages:</label>
          <div className="flex items-center gap-4">
            <div className="flex items-center border border-input rounded-md overflow-hidden bg-background">
              <span className="px-3 py-2 text-sm text-muted-foreground bg-muted/20 border-r border-input">from page</span>
              <input
                type="number"
                min={1}
                value={fromPage}
                onChange={(e) => updatePages(e.target.value, toPage)}
                className="w-16 px-2 py-2 text-center outline-none bg-transparent"
              />
            </div>
            <div className="flex items-center border border-input rounded-md overflow-hidden bg-background">
              <span className="px-3 py-2 text-sm text-muted-foreground bg-muted/20 border-r border-input">to</span>
              <input
                type="number"
                min={1}
                value={toPage}
                onChange={(e) => updatePages(fromPage, e.target.value)}
                className="w-16 px-2 py-2 text-center outline-none bg-transparent"
              />
            </div>
          </div>
        </div>

        {/* Layer */}
        <div className="space-y-2">
          <label className="text-base font-semibold text-muted-foreground">Layer</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => update("layer", "above")}
              className={cn(
                "flex flex-col items-center justify-center py-6 px-4 rounded-lg border-2 transition-colors",
                (options.layer || "above") === "above"
                  ? "border-red-500 text-red-500 bg-red-50/50 dark:bg-red-950/20"
                  : "border-transparent bg-muted/30 hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <Layers className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium text-center">Over the PDF<br/>content</span>
            </button>

            <button
              type="button"
              onClick={() => update("layer", "below")}
              className={cn(
                "flex flex-col items-center justify-center py-6 px-4 rounded-lg border-2 transition-colors",
                options.layer === "below"
                  ? "border-red-500 text-red-500 bg-red-50/50 dark:bg-red-950/20"
                  : "border-transparent bg-muted/30 hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <Layers className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium text-center">Below the PDF<br/>content</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
