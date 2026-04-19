"use client"

import { useState, useRef, useEffect } from "react"
import { getToolBySlug } from "@/lib/tools-config"
import { FileUploader } from "@/components/tools/FileUploader"
import { ProcessingModal } from "@/components/tools/ProcessingModal"
import { DownloadCard } from "@/components/tools/DownloadCard"
import { ToolOptions, hasToolOptions } from "@/components/tools/options/ToolOptions"
import { Button } from "@/components/ui/button"
import { useTool } from "@/hooks/useTool"
import { validateToolOptions } from "@/lib/toolValidation"
import { Zap } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

interface ToolPageClientProps {
  slug: string
}

export function ToolPageClient({ slug }: ToolPageClientProps) {
  const tool = getToolBySlug(slug)!
  const toolHasOptions = hasToolOptions(tool.slug)
  const isOrganize = tool.slug === "organize-pdf"
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const { state, process, reset } = useTool(tool.slug)
  const isProcessingRef = useRef(false)

  const handleProcess = () => {
    if ((files.length === 0 && tool.slug !== "html-to-pdf") || isProcessingRef.current) return

    const validationMsg = validateToolOptions(tool.slug, options, files)
    if (validationMsg) {
      return
    }
    isProcessingRef.current = true

    const payloadOptions: Record<string, unknown> = { ...options, _toolSlug: tool.slug }

    if (tool.iloveapiTool === "local-split") {
      const mode = tool.slug === "remove-pages" ? "remove_pages" : (payloadOptions.split_mode || "ranges")
      payloadOptions.split_mode = mode
      if (mode === "ranges") {
        delete payloadOptions.fixed_range
        delete payloadOptions.remove_pages
      } else if (mode === "fixed_range") {
        delete payloadOptions.ranges
        delete payloadOptions.remove_pages
      } else if (mode === "remove_pages") {
        delete payloadOptions.ranges
        delete payloadOptions.fixed_range
      }
    }

    if (typeof payloadOptions.ranges === "string") {
      payloadOptions.ranges = payloadOptions.ranges.split(",").filter(Boolean).join(",")
    }
    if (typeof payloadOptions.remove_pages === "string") {
      payloadOptions.remove_pages = payloadOptions.remove_pages.split(",").filter(Boolean).join(",")
    }

    if (tool.iloveapiTool === "imagepdf") {
      payloadOptions.pagesize = payloadOptions.pagesize || "A4"
      payloadOptions.orientation = payloadOptions.orientation || "portrait"
    }

    process(files, payloadOptions)
  }

  const handleReset = () => {
    setFiles([])
    setOptions({})
    isProcessingRef.current = false
    reset()
  }

  const isProcessing = state.status === "processing"
  const isSuccess = state.status === "success"
  const isError = state.status === "error"

  useEffect(() => {
    if (isError && "message" in state && state.message) {
      toast.error(state.message)
      isProcessingRef.current = false
      reset()
    }
  }, [isError, state, reset])

  const showOptionsAndProcess = files.length > 0 || tool.slug === "html-to-pdf"

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-center text-white mb-10">
        {tool.title}
      </h1>

      {!isSuccess && (
        <div className="space-y-8">
          <div className={`grid grid-cols-1 ${toolHasOptions && files.length > 0 && !isOrganize && tool.slug !== "html-to-pdf" ? "lg:grid-cols-2" : "max-w-2xl mx-auto"} gap-8 items-start`}>
            {tool.slug !== "html-to-pdf" && (
              <div>
                <FileUploader
                  accept={tool.acceptedFileTypes}
                  multiple={tool.maxFiles > 1}
                  maxFiles={tool.maxFiles}
                  maxSizeMB={tool.maxSizeMB}
                  onFilesSelected={setFiles}
                  isDisabled={isProcessing}
                />
              </div>
            )}

            <div className="flex flex-col gap-6">
              <AnimatePresence>
                {showOptionsAndProcess && !isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <ToolOptions
                      toolSlug={tool.slug}
                      files={files}
                      options={options}
                      onChange={(opts) => {
                        setOptions(opts)
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showOptionsAndProcess && !isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                  >
                    <Button
                      size="lg"
                      onClick={handleProcess}
                      className="w-full shadow-lg shadow-primary/25 text-base"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {tool.title}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {isSuccess && (
        <DownloadCard
          downloadUrl={state.downloadUrl}
          filename={state.filename}
          processingTime={state.processingTime}
          outputSize={state.outputSize}
          onReset={handleReset}
        />
      )}

      <ProcessingModal
        currentStep={isProcessing ? state.step : "start"}
        uploadProgress={isProcessing ? state.uploadProgress : undefined}
        isOpen={isProcessing}
      />
    </div>
  )
}
