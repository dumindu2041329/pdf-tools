"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: Record<string, unknown>,
  wmMode: string
) {
  if (wmMode !== "text") {
    drawImageWatermark(ctx, width, height, opts)
    return
  }

  const text = (opts.text as string) || "WATERMARK"
  const fontFamily = (opts.font_family as string) || "Arial"
  const fontSize = (opts.font_size as number) || 48
  const fontColor = (opts.font_color as string) || "#000000"
  const fontWeight = (opts.font_weight as string) || "normal"
  const fontStyle = (opts.font_style as string) || "normal"
  const fontDecoration = (opts.font_decoration as string) || "none"
  const rotation = (opts.rotation as number) || 0
  const transparency = (opts.transparency as number) ?? 100
  const verticalPos = (opts.vertical_position as string) || "middle"
  const horizontalPos = (opts.horizontal_position as string) || "center"
  const layer = (opts.layer as string) || "above"
  const mosaic = !!opts.mosaic

  ctx.save()

  if (layer === "below") {
    ctx.globalCompositeOperation = "destination-over"
  }

  ctx.globalAlpha = transparency / 100
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.fillStyle = fontColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  let startX = width / 2
  if (horizontalPos === "left") startX = fontSize * 2
  if (horizontalPos === "right") startX = width - fontSize * 2

  let startY = height / 2
  if (verticalPos === "top") startY = fontSize * 2
  if (verticalPos === "bottom") startY = height - fontSize * 2

  const drawSingleText = (x: number, y: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-x, -y)
    ctx.fillText(text, x, y)

    if (fontDecoration === "underline") {
      const metrics = ctx.measureText(text)
      const lineY = y + fontSize * 0.4
      ctx.beginPath()
      ctx.moveTo(x - metrics.width / 2, lineY)
      ctx.lineTo(x + metrics.width / 2, lineY)
      ctx.strokeStyle = fontColor
      ctx.lineWidth = fontSize * 0.05
      ctx.stroke()
    }
    ctx.restore()
  }

  if (mosaic) {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const mx = (width / 3) * (col + 0.5)
        const my = (height / 3) * (row + 0.5)
        drawSingleText(mx, my)
      }
    }
  } else {
    drawSingleText(startX, startY)
  }

  ctx.restore()
}

function drawImageWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: Record<string, unknown>
) {
  const imageFile = opts.image as File
  if (!imageFile) return

  const rotation = (opts.rotation as number) || 0
  const transparency = (opts.transparency as number) ?? 100
  const verticalPos = (opts.vertical_position as string) || "middle"
  const horizontalPos = (opts.horizontal_position as string) || "center"
  const layer = (opts.layer as string) || "above"
  const mosaic = !!opts.mosaic

  const img = new window.Image()
  img.onload = () => {
    ctx.save()

    if (layer === "below") {
      ctx.globalCompositeOperation = "destination-over"
    }

    ctx.globalAlpha = transparency / 100

    const imgWidth = img.width * 0.3
    const imgHeight = img.height * 0.3

    let startX = width / 2 - imgWidth / 2
    if (horizontalPos === "left") startX = imgWidth
    if (horizontalPos === "right") startX = width - imgWidth * 2

    let startY = height / 2 - imgHeight / 2
    if (verticalPos === "top") startY = imgHeight
    if (verticalPos === "bottom") startY = height - imgHeight * 2

    const drawSingleImage = (x: number, y: number) => {
      ctx.save()
      ctx.translate(x + imgWidth / 2, y + imgHeight / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-(x + imgWidth / 2), -(y + imgHeight / 2))
      ctx.drawImage(img, x, y, imgWidth, imgHeight)
      ctx.restore()
    }

    if (mosaic) {
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
          const cx = (width / 3) * (col + 0.5)
          const cy = (height / 3) * (row + 0.5)
          drawSingleImage(cx - imgWidth / 2, cy - imgHeight / 2)
        }
      }
    } else {
      drawSingleImage(startX, startY)
    }

    ctx.restore()
  }
  img.src = URL.createObjectURL(imageFile)
}

export function WatermarkPreview({ files, options, className }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const pagesDataRef = useRef<Map<string, string>>(new Map())

  const mode = (options.mode as string) || "text"

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

  const drawAllWatermarks = useCallback(() => {
    const pagesStr = (options.pages as string) || ""

    items.forEach((item) => {
      const canvas = document.getElementById(`watermark-canvas-${item.id}`) as HTMLCanvasElement
      if (!canvas) return

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
          drawWatermark(ctx, canvas.width, canvas.height, options, mode)
        }
      }
      img.src = pageDataUrl
    })
  }, [items, options, mode])

  useEffect(() => {
    if (items.length === 0) return
    drawAllWatermarks()
  }, [drawAllWatermarks, items.length])

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-96 pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative rounded-lg overflow-hidden border border-border bg-muted/20 flex items-center justify-center p-2"
          >
            <canvas
              id={`watermark-canvas-${item.id}`}
              width={item.width}
              height={item.height}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  )
}