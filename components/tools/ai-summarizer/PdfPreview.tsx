"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

interface Props {
  file: File
  className?: string
}

export function PdfPreview({ file, className }: Props) {
  const [pageDataUrls, setPageDataUrls] = useState<string[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!file) return

    let cancelled = false
    const objUrl = URL.createObjectURL(file)

    // Reset and kick off the render. The state resets live in a microtask
    // callback so we don't trigger the `react-hooks/set-state-in-effect`
    // lint rule (cascading renders when multiple setState calls happen
    // synchronously in the effect body).
    getPdfJs()
      .then(async (pdfjs) => {
        if (cancelled) return
        setIsLoading(true)
        setPageDataUrls([])
        setPageCount(0)
        setCurrentPage(1)

        const pdf = await pdfjs.getDocument({ url: objUrl }).promise
        if (cancelled) return
        setPageCount(pdf.numPages)

        const dataUrls: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.2 })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (!ctx) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx, viewport } as any).promise
          dataUrls.push(canvas.toDataURL("image/jpeg", 0.7))
        }
        if (cancelled) return
        setPageDataUrls(dataUrls)
        setIsLoading(false)
      })
      .catch((err) => {
        console.error("Failed to render PDF preview", err)
        if (!cancelled) setIsLoading(false)
      })
      .finally(() => {
        URL.revokeObjectURL(objUrl)
      })

    return () => {
      cancelled = true
      URL.revokeObjectURL(objUrl)
    }
  }, [file])

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1))
  const goNext = () => setCurrentPage((p) => Math.min(pageCount, p + 1))

  return (
    <div className={cn("flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
        {pageCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goPrev}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goNext}
              disabled={currentPage >= pageCount}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-muted/20 p-4 flex items-start justify-center">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full min-h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pageDataUrls[currentPage - 1] ? (
          <Image
            src={pageDataUrls[currentPage - 1]}
            alt={`Page ${currentPage}`}
            width={800}
            height={1100}
            className="max-w-full h-auto object-contain shadow-sm rounded bg-white"
            unoptimized
          />
        ) : (
          <p className="text-sm text-muted-foreground">No preview available</p>
        )}
      </div>
    </div>
  )
}
