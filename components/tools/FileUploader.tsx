"use client"

import { useCallback, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, X, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FileUploaderProps {
  accept: string[]
  multiple?: boolean
  maxFiles?: number
  maxSizeMB?: number
  onFilesSelected: (files: File[]) => void
  isDisabled?: boolean
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUploader({
  accept,
  multiple = false,
  maxFiles = 1,
  maxSizeMB = 20,
  onFilesSelected,
  isDisabled = false,
}: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
          "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all duration-200 cursor-pointer",
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

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {files.map((file, i) => (
                <motion.div
                  key={`${file.name}-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative flex flex-col items-center justify-center rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <FileText className="mb-3 h-8 w-8 text-primary/80 transition-colors group-hover:text-primary" />
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
                    className="absolute -right-2 -top-2 h-6 w-6 scale-0 items-center justify-center rounded-full opacity-0 shadow-sm transition-all group-hover:scale-100 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                    disabled={isDisabled}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
