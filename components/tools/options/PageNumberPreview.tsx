"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2 } from "lucide-react"
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
  files: File[]
  options: Record<string, unknown>
  className?: string
}

interface PageItem {
  id: string
  fileIndex: number
  pageIndex: number
  dataUrl: string
  width: number
  height: number
}

function drawPageNumber(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: Record<string, unknown>,
  isLeftPage: boolean = false
) {
  const verticalPos = (opts.vertical_position as string) || "bottom"
  let horizontalPos = (opts.horizontal_position as string) || "center"
  const verticalAdjustment = (opts.vertical_position_adjustment as number) || 0
  const horizontalAdjustment = (opts.horizontal_position_adjustment as number) || 0

  const pageMode = (opts.page_mode as string) || "single"

  if (pageMode === "facing" && isLeftPage) {
    if (horizontalPos === "left") horizontalPos = "right"
    else if (horizontalPos === "right") horizontalPos = "left"
  }

  ctx.save()

  const radius = 24

  let x = width / 2 + horizontalAdjustment
  if (horizontalPos === "left") x = 20 + horizontalAdjustment
  if (horizontalPos === "right") x = width - 20 - horizontalAdjustment

  let y = height - 20 - verticalAdjustment
  if (verticalPos === "top") y = 20 + verticalAdjustment

  // Draw the red circle
  ctx.fillStyle = "#ef4444"
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

export function PageNumberPreview({ files, options, className }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const pagesDataRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!files || files.length === 0) {
      setItems([])
      return
    }

    setIsLoading(true)
    pagesDataRef.current.clear()

    const newItems: PageItem[] = []
    let completed = 0

    files.forEach((file, fileIdx) => {
      const objUrl = URL.createObjectURL(file)

      getPdfJs().then((pdfjs) => {
        pdfjs
          .getDocument(objUrl)
          .promise.then(async (pdf) => {
            for (let pageIdx = 1; pageIdx <= pdf.numPages; pageIdx++) {
              const page = await pdf.getPage(pageIdx)
              const viewport = page.getViewport({ scale: 1 })

              const canvas = document.createElement("canvas")
              canvas.width = viewport.width
              canvas.height = viewport.height
              const ctx = canvas.getContext("2d")
              if (!ctx) continue

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await page.render({ canvasContext: ctx, viewport } as any).promise

              const dataUrl = canvas.toDataURL("image/jpeg", 0.6)
              const itemId = `${fileIdx}-${pageIdx}`
              pagesDataRef.current.set(itemId, dataUrl)

              newItems.push({
                id: itemId,
                fileIndex: fileIdx,
                pageIndex: pageIdx,
                dataUrl,
                width: viewport.width,
                height: viewport.height,
              })
            }
          })
          .catch((err) => {
            console.error("Failed to load PDF preview", err)
          })
          .finally(() => {
            URL.revokeObjectURL(objUrl)
            completed++
            if (completed === files.length) {
              newItems.sort((a, b) => {
                if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex
                return a.pageIndex - b.pageIndex
              })
              setItems(newItems)
              setIsLoading(false)
            }
          })
      })
    })
  }, [files])

  useEffect(() => {
    if (items.length === 0) return

    const pagesStr = (options.pages as string) || ""

    const canvasesToDraw: Array<{ canvas: HTMLCanvasElement; item: PageItem }> = []

    items.forEach((item) => {
      const canvas = document.getElementById(`pagenumber-canvas-${item.id}`) as HTMLCanvasElement
      if (!canvas) return

      canvas.width = item.width
      canvas.height = item.height

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      canvasesToDraw.push({ canvas, item })
    })

    canvasesToDraw.forEach(({ canvas, item }) => {
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const pageDataUrl = pagesDataRef.current.get(item.id)
      if (!pageDataUrl) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const img = new window.Image()

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        let shouldDraw = true
        if (pagesStr && pagesStr !== "all") {
          const ranges = pagesStr.split(",")
          shouldDraw = ranges.some((range) => {
            const parts = range.split("-")
            if (parts.length === 1) {
              return item.pageIndex === parseInt(parts[0], 10)
            } else if (parts.length === 2) {
              const from = parts[0] ? parseInt(parts[0], 10) : 1
              const to = parts[1] ? parseInt(parts[1], 10) : Infinity
              return item.pageIndex >= from && item.pageIndex <= to
            }
            return false
          })
        }

        if (shouldDraw) {
          const firstCover = !!options.first_cover
          const globalIndex = items.findIndex((i) => i.id === item.id)
          const pageMode = (options.page_mode as string) || "single"

          let isLeftPage = false
          if (pageMode === "facing") {
            if (firstCover) {
              isLeftPage = globalIndex % 2 !== 0
            } else {
              isLeftPage = globalIndex % 2 === 0
            }
          }
          drawPageNumber(ctx, canvas.width, canvas.height, options, isLeftPage)
        }
      }

      img.src = pageDataUrl
    })
  }, [items, options])

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) return null

  const pageMode = (options.page_mode as string) || "single"
  const firstCover = !!options.first_cover

  interface Spread {
    id: string
    leftPage?: PageItem
    rightPage?: PageItem
  }

  const spreads: Spread[] = []
  if (pageMode === "facing") {
    let i = 0
    if (firstCover && items.length > 0) {
      spreads.push({ id: `spread-cover`, rightPage: items[0] })
      i = 1
    }
    for (; i < items.length; i += 2) {
      spreads.push({
        id: `spread-${i}`,
        leftPage: items[i],
        rightPage: i + 1 < items.length ? items[i + 1] : undefined,
      })
    }
  }

  if (pageMode === "facing") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="flex flex-col gap-4 overflow-y-auto max-h-96">
          {spreads.map((spread) => (
            <div
              key={spread.id}
              className="relative rounded-lg border border-border bg-muted/20 p-2 sm:p-4 flex justify-center items-center"
            >
              <div className="flex max-w-full h-20 sm:h-28">
                <div className="flex-1 flex justify-end items-center border-r border-muted/50 pr-[1px]">
                  {spread.leftPage ? (
                    <canvas
                      id={`pagenumber-canvas-${spread.leftPage.id}`}
                      className="h-full w-auto object-contain bg-white shadow-sm"
                    />
                  ) : (
                    <div className="h-full aspect-[1/1.4] bg-transparent" />
                  )}
                </div>
                <div className="flex-1 flex justify-start items-center pl-[1px]">
                  {spread.rightPage ? (
                    <canvas
                      id={`pagenumber-canvas-${spread.rightPage.id}`}
                      className="h-full w-auto object-contain bg-white shadow-sm"
                    />
                  ) : (
                    <div className="h-full aspect-[1/1.4] bg-transparent" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-96 pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative rounded-lg overflow-hidden border border-border bg-muted/20 flex items-center justify-center p-2"
          >
            <canvas
              id={`pagenumber-canvas-${item.id}`}
              className="max-h-full max-w-full object-contain bg-white shadow-sm h-40"
            />
          </div>
        ))}
      </div>
    </div>
  )
}