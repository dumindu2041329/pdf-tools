"use client"

import { useEffect, useState, useRef } from "react"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, Loader2, RotateCw } from "lucide-react"
import * as pdfjsLib from "pdfjs-dist"
import { cn } from "@/lib/utils"

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

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

function SortableItem({ item, onRemove, onRotate }: { item: PageItem; onRemove: (id: string) => void; onRotate: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 bg-background p-2 group shadow-sm transition-shadow",
        isDragging ? "border-primary shadow-lg ring-2 ring-primary/20" : "border-border hover:border-primary/50"
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
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
    // Pass the ranges and rotations to the splitting logic
    const ranges = itemsRef.current.map(item => item.pageIndex + 1).join(",")
    const rotations = itemsRef.current.map(item => item.rotation).join(",")
    
    if (options.ranges !== ranges || options.rotations !== rotations || options.split_mode !== 'ranges' || options.merge_after !== true) {
      onChange({ ...options, ranges, rotations, split_mode: 'ranges', merge_after: true })
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

      const newItems: PageItem[] = []
      try {
        for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
          const file = files[fileIdx]
          const objUrl = URL.createObjectURL(file)
          const pdf = await pdfjsLib.getDocument(objUrl).promise

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
          
          // Generate a fingerprint function
          const getFingerprint = (f: File) => `${f.name}-${f.size}-${f.lastModified}`
          const currentFingerprints = new Set(files.map(getFingerprint))
          
          // 1. Keep previous items only if their source file still exists
          const keptPrevItems = prev.filter(p => currentFingerprints.has(getFingerprint(p.file)))
          
          // 2. We need to update fileIndex on kept items since the files array might have shifted
          const updatedPrevItems = keptPrevItems.map(p => {
            const newIndex = files.findIndex(f => getFingerprint(f) === getFingerprint(p.file))
            return { ...p, fileIndex: newIndex, id: `${newIndex}-${p.pageIndex}` }
          })
          
          // 3. Find completely new items that were just added
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto max-h-[500px] p-2 pr-4 custom-scrollbar">
            {items.map((item) => (
              <SortableItem key={item.id} item={item} onRemove={removePage} onRotate={rotatePage} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
