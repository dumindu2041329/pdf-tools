"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Loader2 } from "lucide-react"
import * as pdfjsLib from "pdfjs-dist"
import { cn } from "@/lib/utils"

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

interface PageItem {
  id: string
  fileIndex: number
  pageIndex: number
  file: File
  dataUrl: string
}

interface Props {
  files: File[]
  rotation: number
  className?: string
}

export function RotatePreview({ files, rotation, className }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

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
          for (let pageIdx = 1; pageIdx <= 1; pageIdx++) {
            const page = await pdf.getPage(pageIdx)
            const viewport = page.getViewport({ scale: 1 })

            const canvas = document.createElement("canvas")
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext("2d")
            if (!ctx) continue

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await page.render({ canvasContext: ctx, viewport } as any).promise

            newItems.push({
              id: `${fileIdx}-${pageIdx}`,
              fileIndex: fileIdx,
              pageIndex: pageIdx,
              file,
              dataUrl: canvas.toDataURL("image/jpeg", 0.6),
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
  }, [files])

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
              alt={`PDF ${item.fileIndex + 1}`}
              width={200}
              height={280}
              className="max-h-full max-w-full object-contain transition-transform duration-300"
              style={{ transform: `rotate(${rotation}deg)` }}
              unoptimized
            />
          </div>
        ))}
      </div>
    </div>
  )
}
