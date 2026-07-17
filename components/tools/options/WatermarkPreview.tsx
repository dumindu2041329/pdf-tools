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
  onFileSelect?: (fileIndex: number, pageCount: number) => void
}

interface PageItem {
  id: string
  fileIndex: number
  pageIndex: number
  dataUrl: string
  width: number
  height: number
}

function drawWatermarkPosition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: Record<string, unknown>
) {
  const rotation = (opts.rotation as number) || 0
  const verticalPos = (opts.vertical_position as string) || "middle"
  const horizontalPos = (opts.horizontal_position as string) || "center"
  const mosaic = !!opts.mosaic

  const radius = 24

  const computeX = (baseX: number) => {
    let x = baseX
    if (horizontalPos === "left") x = radius * 3
    else if (horizontalPos === "right") x = width - radius * 3
    else x = width / 2
    return x
  }

  const computeY = (baseY: number) => {
    let y = baseY
    if (verticalPos === "top") y = radius * 3
    else if (verticalPos === "bottom") y = height - radius * 3
    else y = height / 2
    return y
  }

  const drawDot = (x: number, y: number) => {
    ctx.save()
    ctx.translate(x, y)
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180)
    }
    ctx.fillStyle = "#ef4444"
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (mosaic) {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const mx = (width / 3) * (col + 0.5)
        const my = (height / 3) * (row + 0.5)
        drawDot(mx, my)
      }
    }
  } else {
    drawDot(computeX(width / 2), computeY(height / 2))
  }
}

export function WatermarkPreview({ files, options, className, onFileSelect }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const pagesDataRef = useRef<Map<string, string>>(new Map())
  const filePageCountsRef = useRef<Map<number, number>>(new Map())
  const prevFileIndexRef = useRef<number>(-1)

  // Reset selected file index when files change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset selection when file list changes
    setSelectedFileIndex(0)
    prevFileIndexRef.current = -1
  }, [files])

  // Call onFileSelect when selected file index actually changes
  useEffect(() => {
    if (prevFileIndexRef.current === selectedFileIndex) return
    if (onFileSelect && files.length > 0) {
      const pageCount = filePageCountsRef.current.get(selectedFileIndex) || 0
      onFileSelect(selectedFileIndex, pageCount)
    }
    prevFileIndexRef.current = selectedFileIndex
  }, [selectedFileIndex, files, onFileSelect])

  const handleFileSelect = (index: number) => {
    setSelectedFileIndex(index)
  }

  useEffect(() => {
    if (!files || files.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset items when files are cleared
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
          .getDocument({ url: objUrl })
          .promise.then(async (pdf) => {
            filePageCountsRef.current.set(fileIdx, pdf.numPages)
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
          drawWatermarkPosition(ctx, canvas.width, canvas.height, options)
        }
      }
      img.src = pageDataUrl
    })
  }, [items, options])

  useEffect(() => {
    if (items.length === 0) return
    drawAllWatermarks()
  }, [drawAllWatermarks, items.length, options, selectedFileIndex])

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) return null

  const visibleItems = files.length > 1 ? items.filter((item) => item.fileIndex === selectedFileIndex) : items

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {files.length > 1 && (
        <select
          value={selectedFileIndex}
          onChange={(e) => handleFileSelect(Number(e.target.value))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none cursor-pointer"
        >
          {files.map((file, idx) => (
            <option key={idx} value={idx}>{file.name}</option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-96 pr-1">
        {visibleItems.map((item) => (
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