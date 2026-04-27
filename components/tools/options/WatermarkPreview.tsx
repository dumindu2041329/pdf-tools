"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Loader2 } from "lucide-react"
import * as pdfjsLib from "pdfjs-dist"
import { cn } from "@/lib/utils"

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

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

export function WatermarkPreview({ files, options, className }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const mode = (options.mode as string) || "text"

  useEffect(() => {
    if (!files || files.length === 0) {
      setItems([])
      return
    }

    setIsLoading(true)

    const newItems: PageItem[] = []
    let completed = 0

    files.forEach((file, fileIdx) => {
      const objUrl = URL.createObjectURL(file)

      pdfjsLib
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

            drawWatermark(ctx, viewport.width, viewport.height, options, mode)

            newItems.push({
              id: `${fileIdx}-${pageIdx}`,
              fileIndex: fileIdx,
              pageIndex: pageIdx,
              dataUrl: canvas.toDataURL("image/jpeg", 0.6),
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
            setItems(newItems)
            setIsLoading(false)
          }
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, options])

  function drawWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    opts: Record<string, unknown>,
    wmMode: string
  ) {
    if (wmMode !== "text") return

    const text = (opts.text as string) || "WATERMARK"
    const fontFamily = (opts.font_family as string) || "Arial"
    const fontSize = (opts.font_size as number) || 48
    const fontColor = (opts.font_color as string) || "#000000"
    const fontWeight = (opts.font_weight as string) || "normal"
    const fontStyle = (opts.font_style as string) || "normal"
    const fontDecoration = (opts.font_decoration as string) || "none"
    const rotation = (opts.rotation as number) || 0
    const transparency = (opts.transparency as number) ?? 0
    const verticalPos = (opts.vertical_position as string) || "middle"
    const horizontalPos = (opts.horizontal_position as string) || "center"
    const layer = (opts.layer as string) || "above"
    const mosaic = !!opts.mosaic

    ctx.save()

    if (layer === "below") {
      ctx.globalCompositeOperation = "destination-over"
    }

    ctx.globalAlpha = 1 - transparency / 100
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
    ctx.fillStyle = fontColor
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    // Calculate base position
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
      // Draw a 3x3 mosaic roughly
      for (let mx = width * 0.2; mx < width; mx += width * 0.4) {
        for (let my = height * 0.2; my < height; my += height * 0.4) {
          drawSingleText(mx, my)
        }
      }
    } else {
      drawSingleText(startX, startY)
    }

    ctx.restore()
  }

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
            <Image
              src={item.dataUrl}
              alt={`Page ${item.pageIndex}`}
              width={200}
              height={Math.round((200 / item.width) * item.height)}
              className="max-h-full max-w-full object-contain"
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  )
}