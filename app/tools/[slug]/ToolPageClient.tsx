"use client"

import { useState, useRef } from "react"
import { getToolBySlug } from "@/lib/tools-config"
import { FileUploader } from "@/components/tools/FileUploader"
import { ProcessingModal } from "@/components/tools/ProcessingModal"
import { DownloadCard } from "@/components/tools/DownloadCard"
import { ToolOptions } from "@/components/tools/options/ToolOptions"
import { Button } from "@/components/ui/button"
import { useTool } from "@/hooks/useTool"
import { Zap, AlertCircle, RotateCw } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface ToolPageClientProps {
  slug: string
}

export function ToolPageClient({ slug }: ToolPageClientProps) {
  const tool = getToolBySlug(slug)!
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const { state, process, reset } = useTool(tool.iloveapiTool)
  const isProcessingRef = useRef(false)

  const handleProcess = () => {
    if (files.length === 0 || isProcessingRef.current) return
    isProcessingRef.current = true
    process(files, options)
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

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-center text-white mb-10">
        {tool.title}
      </h1>

      {/* Main content */}
      {!isSuccess && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* LEFT: File uploader */}
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

          {/* RIGHT: Tool options + Process button */}
          <div className="flex flex-col gap-6">
            {/* Tool-specific options */}
            <AnimatePresence>
              {files.length > 0 && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <ToolOptions
                    toolSlug={tool.slug}
                    options={options}
                    onChange={setOptions}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Process button */}
            <AnimatePresence>
              {files.length > 0 && !isProcessing && (
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

            {/* Error state */}
            <AnimatePresence>
              {isError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
                >
                  <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-3" />
                  <p className="text-sm font-medium text-destructive mb-4">
                    {state.message}
                  </p>
                  <div className="flex justify-center gap-3">
                    {state.retryable && (
                      <Button variant="outline" size="sm" onClick={handleProcess}>
                        <RotateCw className="mr-2 h-3 w-3" />
                        Retry
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      Start Over
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Success state */}
      {isSuccess && (
        <DownloadCard
          downloadUrl={state.downloadUrl}
          filename={state.filename}
          processingTime={state.processingTime}
          outputSize={state.outputSize}
          onReset={handleReset}
        />
      )}

      {/* Processing modal */}
      <ProcessingModal
        currentStep={isProcessing ? state.step : "start"}
        uploadProgress={isProcessing ? state.uploadProgress : undefined}
        isOpen={isProcessing}
      />
    </div>
  )
}
