"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, X, FileText, AlertCircle, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const FILE_COLORS = [
  { border: "border-red-500", bg: "bg-red-500/10", text: "text-red-500" },
  { border: "border-blue-500", bg: "bg-blue-500/10", text: "text-blue-500" },
  { border: "border-green-500", bg: "bg-green-500/10", text: "text-green-500" },
  { border: "border-yellow-500", bg: "bg-yellow-500/10", text: "text-yellow-500" },
  { border: "border-purple-500", bg: "bg-purple-500/10", text: "text-purple-500" },
  { border: "border-orange-500", bg: "bg-orange-500/10", text: "text-orange-500" },
  { border: "border-pink-500", bg: "bg-pink-500/10", text: "text-pink-500" },
  { border: "border-teal-500", bg: "bg-teal-500/10", text: "text-teal-500" },
  { border: "border-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-500" },
  { border: "border-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-500" },
  { border: "border-lime-500", bg: "bg-lime-500/10", text: "text-lime-500" },
  { border: "border-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-500" },
  { border: "border-fuchsia-500", bg: "bg-fuchsia-500/10", text: "text-fuchsia-500" },
  { border: "border-rose-500", bg: "bg-rose-500/10", text: "text-rose-500" },
  { border: "border-sky-500", bg: "bg-sky-500/10", text: "text-sky-500" },
  { border: "border-violet-500", bg: "bg-violet-500/10", text: "text-violet-500" },
  { border: "border-amber-500", bg: "bg-amber-500/10", text: "text-amber-500" },
  { border: "border-zinc-500", bg: "bg-zinc-500/10", text: "text-zinc-500" },
  { border: "border-stone-500", bg: "bg-stone-500/10", text: "text-stone-500" },
  { border: "border-neutral-500", bg: "bg-neutral-500/10", text: "text-neutral-500" },
]

interface FileUploaderProps {
  accept: string[]
  multiple?: boolean
  maxFiles?: number
  maxSizeMB?: number
  onFilesSelected: (files: File[]) => void
  isDisabled?: boolean
  files?: File[]
  colorCodeBySourceFile?: boolean
  reorderable?: boolean
  layout?: "grid" | "list"
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface SortableFileItemProps {
  file: File
  index: number
  fileColor: { border: string; bg: string; text: string } | null
  isDisabled: boolean
  onRemove: (index: number) => void
}

function SortableFileItem({ file, index, fileColor, isDisabled, onRemove }: SortableFileItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: index })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: isDragging ? 0 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-xl border bg-card p-4 transition-all hover:shadow-sm cursor-grab active:cursor-grabbing",
        fileColor ? `${fileColor.border} ${fileColor.bg}` : "border-border hover:border-primary/50",
        isDragging && "opacity-0"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <FileText className={cn("mb-3 h-8 w-8 transition-colors group-hover:text-primary", fileColor ? fileColor.text : "text-primary/80")} />
      <p className="w-full truncate text-center text-sm font-medium" title={file.name}>
        {file.name}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{formatSize(file.size)}</p>
      <Button
        variant="destructive"
        size="icon"
        className="absolute -right-2 -top-2 h-6 w-6 scale-100 items-center justify-center rounded-full opacity-100 shadow-sm transition-all sm:scale-0 sm:opacity-0 group-hover:scale-100 group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onRemove(index) }}
        disabled={isDisabled}
      >
        <X className="h-3 w-3" />
      </Button>
    </motion.div>
  )
}

function SortableFileListItem({ file, index, fileColor, isDisabled, onRemove }: SortableFileItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: index })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isDragging ? 0 : 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg border bg-card p-3 transition-all hover:shadow-sm cursor-grab active:cursor-grabbing",
        fileColor ? `${fileColor.border} ${fileColor.bg}` : "border-border hover:border-primary/50",
        isDragging && "opacity-0"
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
      <FileText className={cn("h-6 w-6 shrink-0 transition-colors group-hover:text-primary", fileColor ? fileColor.text : "text-primary/80")} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-8 w-8 opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onRemove(index) }}
        disabled={isDisabled}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}

export function FileUploader({
  accept,
  multiple = false,
  maxFiles = 1,
  maxSizeMB = 20,
  onFilesSelected,
  isDisabled = false,
  files: propFiles,
  colorCodeBySourceFile = false,
  reorderable = false,
  layout = "grid",
}: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>(propFiles || [])
  const [isDragging, setIsDragging] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (propFiles !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing external files prop into local file list state
      setFiles(propFiles)
    }
  }, [propFiles])

  const validateFiles = useCallback(
    (incoming: File[]): { valid: File[]; error: string | null } => {
      const allFiles = [...files, ...incoming]
      if (allFiles.length > maxFiles) {
        return { valid: [], error: `Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""} allowed` }
      }
      for (const f of incoming) {
        if (f.size > maxSizeMB * 1024 * 1024) {
          return { valid: [], error: `File "${f.name}" exceeds ${maxSizeMB} MB limit` }
        }
        const ext = `.${f.name.split(".").pop()?.toLowerCase()}`
        if (accept.length > 0 && !accept.includes(ext)) {
          return { valid: [], error: `File type "${ext}" is not accepted` }
        }
      }
      return { valid: incoming, error: null }
    },
    [files, maxFiles, maxSizeMB, accept]
  )

  const addFiles = useCallback(
    (incoming: File[]) => {
      const { valid, error: err } = validateFiles(incoming)
      if (err) {
        setError(err)
        return
      }
      setError(null)
      const updated = [...files, ...valid]
      setFiles(updated)
      onFilesSelected(updated)
    },
    [files, validateFiles, onFilesSelected]
  )

  const removeFile = useCallback(
    (index: number) => {
      const updated = files.filter((_, i) => i !== index)
      setFiles(updated)
      onFilesSelected(updated)
      setError(null)
    },
    [files, onFilesSelected]
  )

  const handleFileDragStart = useCallback(
    (event: { active: { id: number | string } }) => {
      setActiveId(Number(event.active.id))
    },
    []
  )

  const handleFileDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIndex = files.findIndex((_, i) => i === Number(active.id))
        const newIndex = files.findIndex((_, i) => i === Number(over.id))
        const updated = arrayMove(files, oldIndex, newIndex)
        setFiles(updated)
        onFilesSelected(updated)
      }
    },
    [files, onFilesSelected]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (isDisabled) return
      const dropped = Array.from(e.dataTransfer.files)
      addFiles(dropped)
    },
    [addFiles, isDisabled]
  )

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!isDisabled) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isDisabled && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all duration-200 cursor-pointer bg-white dark:bg-card",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/40 hover:bg-muted/30",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(",")}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files))
            e.target.value = ""
          }}
          className="hidden"
          disabled={isDisabled}
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <Upload className="h-8 w-8" />
        </div>
        <p className="text-lg font-semibold">
          {isDragging ? "Drop your files here" : "Drag & drop files here"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          or <span className="text-primary font-medium">browse files</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Accepted: {accept.join(", ")} · Max {maxSizeMB} MB
          {multiple && ` · Up to ${maxFiles} files`}
        </p>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* File count indicator */}
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-medium text-foreground">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </span>
              {files.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFiles([])
                    onFilesSelected([])
                    setError(null)
                  }}
                  disabled={isDisabled}
                >
                  Clear all
                </Button>
              )}
            </div>

            {reorderable ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleFileDragStart}
                onDragEnd={handleFileDragEnd}
              >
                <SortableContext items={files.map((_, i) => i)} strategy={rectSortingStrategy}>
                  {layout === "list" ? (
                    <div className="flex flex-col gap-2 max-h-85 overflow-y-auto custom-scrollbar">
                      {files.map((file, i) => {
                        const fileColor = colorCodeBySourceFile ? FILE_COLORS[i % FILE_COLORS.length] : null
                        return (
                          <SortableFileListItem
                            key={`${file.name}-${i}`}
                            file={file}
                            index={i}
                            fileColor={fileColor}
                            isDisabled={isDisabled}
                            onRemove={removeFile}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-85 overflow-y-auto custom-scrollbar pt-2 pr-2">
                      {files.map((file, i) => {
                        const fileColor = colorCodeBySourceFile ? FILE_COLORS[i % FILE_COLORS.length] : null
                        return (
                          <SortableFileItem
                            key={`${file.name}-${i}`}
                            file={file}
                            index={i}
                            fileColor={fileColor}
                            isDisabled={isDisabled}
                            onRemove={removeFile}
                          />
                        )
                      })}
                    </div>
                  )}
                </SortableContext>
                <DragOverlay>
                  {activeId !== null && files[activeId] && (
                    <div className="opacity-90 shadow-2xl">
                      {layout === "list" ? (
                        <SortableFileListItem
                          file={files[activeId]}
                          index={activeId}
                          fileColor={colorCodeBySourceFile ? FILE_COLORS[activeId % FILE_COLORS.length] : null}
                          isDisabled={isDisabled}
                          onRemove={() => {}}
                        />
                      ) : (
                        <SortableFileItem
                          file={files[activeId]}
                          index={activeId}
                          fileColor={colorCodeBySourceFile ? FILE_COLORS[activeId % FILE_COLORS.length] : null}
                          isDisabled={isDisabled}
                          onRemove={() => {}}
                        />
                      )}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-85 overflow-y-auto custom-scrollbar pt-2 pr-2">
                {files.map((file, i) => {
                  const fileColor = colorCodeBySourceFile ? FILE_COLORS[i % FILE_COLORS.length] : null
                  return (
                    <motion.div
                      key={`${file.name}-${i}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={cn(
                        "group relative flex flex-col items-center justify-center rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
                        fileColor ? `${fileColor.border} ${fileColor.bg}` : "border-border hover:border-primary/50"
                      )}
                    >
                      <FileText className={cn("mb-3 h-8 w-8 transition-colors group-hover:text-primary", fileColor ? fileColor.text : "text-primary/80")} />
                      <p
                        className="w-full truncate text-center text-sm font-medium"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatSize(file.size)}
                      </p>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -right-2 -top-2 h-6 w-6 scale-100 items-center justify-center rounded-full opacity-100 shadow-sm transition-all sm:scale-0 sm:opacity-0 group-hover:scale-100 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        disabled={isDisabled}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
