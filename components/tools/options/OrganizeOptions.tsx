"use client"

import { useEffect, useState, useRef } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, Loader2, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

interface PageItem {
  id: string
  fileIndex: number
  pageIndex: number // 0-based
  file: File
  originalWidth: number
  originalHeight: number
  rotation: number // 0, 90, 180, 270
  dataUrl: string
}

interface Props {
  toolSlug: string
  files?: File[]
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const FILE_COLORS = [
  "border-red-500",
  "border-blue-500",
  "border-green-500",
  "border-yellow-500",
  "border-purple-500",
  "border-orange-500",
  "border-pink-500",
  "border-teal-500",
  "border-indigo-500",
  "border-cyan-500",
  "border-lime-500",
  "border-emerald-500",
  "border-fuchsia-500",
  "border-rose-500",
  "border-sky-500",
  "border-violet-500",
  "border-amber-500",
  "border-zinc-500",
  "border-stone-500",
  "border-neutral-500",
]

function SortableItem({ item, onRemove, onRotate }: { item: PageItem; onRemove: (id: string) => void; onRotate: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  }

  const fileColor = FILE_COLORS[item.fileIndex % FILE_COLORS.length]

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 bg-background p-2 group shadow-sm transition-shadow",
        fileColor,
        isDragging ? "shadow-lg ring-2 ring-primary/20 opacity-90" : "hover:shadow-md hover:border-primary/50"
      )}
    >
      <div className="relative w-full aspect-[1/1.4] overflow-hidden rounded-md bg-muted/30 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.dataUrl}
          alt={`Page ${item.pageIndex + 1}`}
          className="max-h-full max-w-full object-contain transition-transform"
          style={{ transform: `rotate(${item.rotation}deg)` }}
        />
        <div className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            className="p-1.5 bg-primary/80 hover:bg-primary text-white rounded-md backdrop-blur-md transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onRotate(item.id)
            }}
            title="Rotate Page"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 bg-destructive/80 hover:bg-destructive text-white rounded-md backdrop-blur-md transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(item.id)
            }}
            title="Remove Page"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-muted-foreground w-full text-center truncate">
        {item.pageIndex + 1}
      </div>
    </div>
  )
}

export function OrganizeOptions({ files, options, onChange }: Props) {
  const [items, setItems] = useState<PageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const itemsRef = useRef<PageItem[]>([]) // keep a ref so buildOrganizedPdf uses latest state

  // Update ref whenever items change
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Register the interceptor
  useEffect(() => {
    const currentItems = itemsRef.current
    // Compute per-file page counts from the loaded items (these are the original page counts per file)
    const filePageCounts: Record<number, number> = {}
    for (const item of currentItems) {
      const count = filePageCounts[item.fileIndex] ?? 0
      if (item.pageIndex + 1 > count) filePageCounts[item.fileIndex] = item.pageIndex + 1
    }
    // Build cumulative offset: how many pages come before each fileIndex in the merged PDF
    const fileOffsets: Record<number, number> = {}
    // We need the offsets in original file order (0, 1, 2, ...)
    const maxFileIndex = Math.max(-1, ...Object.keys(filePageCounts).map(Number))
    let offset = 0
    for (let fi = 0; fi <= maxFileIndex; fi++) {
      fileOffsets[fi] = offset
      offset += filePageCounts[fi] ?? 0
    }
    // Absolute 1-based page number in the merged PDF
    const ranges = currentItems.map(item => fileOffsets[item.fileIndex] + item.pageIndex + 1).join(",")
    const rotations = currentItems.map(item => item.rotation).join(",")

    if (options.ranges !== ranges || options.rotations !== rotations || options.split_mode !== "ranges" || options.merge_after !== true) {
      onChange({ ...options, ranges, rotations, split_mode: "ranges", merge_after: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, onChange, options.ranges, options.rotations, options.split_mode, options.merge_after])

  useEffect(() => {
    async function loadThumbnails() {
      if (!files || files.length === 0) {
        setItems([])
        return
      }
      setIsLoading(true)

      const pdfjs = await getPdfJs()
      const newItems: PageItem[] = []
      try {
        for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
          const file = files[fileIdx]
          const objUrl = URL.createObjectURL(file)
          const pdf = await pdfjs.getDocument({ url: objUrl }).promise

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const viewport = page.getViewport({ scale: 0.5 }) // Load lower scale for speed

            const canvas = document.createElement("canvas")
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext("2d")
            if (ctx) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await page.render({ canvasContext: ctx, viewport } as any).promise
              newItems.push({
                id: `${fileIdx}-${i - 1}`,
                fileIndex: fileIdx,
                pageIndex: i - 1,
                file,
                originalWidth: viewport.width,
                originalHeight: viewport.height,
                rotation: 0,
                dataUrl: canvas.toDataURL("image/jpeg", 0.6),
              })
            }
          }
          URL.revokeObjectURL(objUrl)
        }

        setItems((prev) => {
          if (prev.length === 0) return newItems

          const getFingerprint = (f: File) => `${f.name}-${f.size}-${f.lastModified}`

          const currentFingerprints = files.map(getFingerprint)
          const prevFingerprints = prev.map(p => getFingerprint(p.file))

          const sameFilesReordered = currentFingerprints.length === prevFingerprints.length &&
            currentFingerprints.every((fp, idx) => fp === prevFingerprints[idx])

          if (sameFilesReordered) {
            const updatedPrevItems = prev.map(p => {
              const newFileIndex = files.findIndex(f => getFingerprint(f) === getFingerprint(p.file))
              return { ...p, fileIndex: newFileIndex, id: `${newFileIndex}-${p.pageIndex}` }
            })
            updatedPrevItems.sort((a, b) => {
              if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex
              return a.pageIndex - b.pageIndex
            })
            return updatedPrevItems
          }

          const currentFingerprintsSet = new Set(currentFingerprints)
          const keptPrevItems = prev.filter(p => currentFingerprintsSet.has(getFingerprint(p.file)))

          const updatedPrevItems = keptPrevItems.map(p => {
            const newIndex = files.findIndex(f => getFingerprint(f) === getFingerprint(p.file))
            return { ...p, fileIndex: newIndex, id: `${newIndex}-${p.pageIndex}` }
          })

          updatedPrevItems.sort((a, b) => {
            if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex
            return a.pageIndex - b.pageIndex
          })

          const keptPrevFingerprintsAndPages = new Set(
            updatedPrevItems.map(p => `${getFingerprint(p.file)}-${p.pageIndex}`)
          )
          const appendedItems = newItems.filter(
            n => !keptPrevFingerprintsAndPages.has(`${getFingerprint(n.file)}-${n.pageIndex}`)
          )

          return [...updatedPrevItems, ...appendedItems]
        })
      } catch (err) {
        console.error("Failed to load PDF thumbnails", err)
      } finally {
        setIsLoading(false)
      }
    }

    // Trigger load when files array changes (new files added)
    loadThumbnails()
  }, [files])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const removePage = (id: string) => {
    setItems((items) => items.filter((i) => i.id !== id))
  }

  const rotatePage = (id: string) => {
    setItems((items) => items.map(i => i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i))
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-base">Generating page thumbnails...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">Arrange, rotate, or remove pages</label>
        <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
          {items.length} page{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 custom-scrollbar">
            {items.map((item) => (
              <SortableItem key={item.id} item={item} onRemove={removePage} onRotate={rotatePage} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
