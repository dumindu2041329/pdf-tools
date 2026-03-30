"use client"

import { useState } from "react"
import { getToolBySlug } from "@/lib/tools-config"
import { ToolHero } from "@/components/tools/ToolHero"
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

  const handleProcess = () => {
    if (files.length === 0) return
    process(files, options)
  }

  const handleReset = () => {
    setFiles([])
    setOptions({})
    reset()
  }

  const isProcessing = state.status === "processing"
  const isSuccess = state.status === "success"
  const isError = state.status === "error"

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-20">
      <ToolHero tool={tool} />

      {/* Main content */}
      {!isSuccess && (
        <>
          {/* File uploader */}
          <FileUploader
            accept={tool.acceptedFileTypes}
            multiple={tool.maxFiles > 1}
            maxFiles={tool.maxFiles}
            maxSizeMB={tool.maxSizeMB}
            onFilesSelected={setFiles}
            isDisabled={isProcessing}
          />

          {/* Tool-specific options */}
          {files.length > 0 && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <ToolOptions
                toolSlug={tool.slug}
                options={options}
                onChange={setOptions}
              />
            </motion.div>
          )}

          {/* Process button */}
          {files.length > 0 && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex justify-center"
            >
              <Button
                size="lg"
                onClick={handleProcess}
                className="shadow-lg shadow-primary/25 text-base px-10"
              >
                <Zap className="mr-2 h-4 w-4" />
                {tool.title}
              </Button>
            </motion.div>
          )}

          {/* Error state */}
          <AnimatePresence>
            {isError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
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
        </>
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
