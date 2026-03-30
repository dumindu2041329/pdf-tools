"use client"

import { motion } from "framer-motion"
import { Download, FileText, Clock, HardDrive, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DownloadCardProps {
  downloadUrl: string
  filename: string
  processingTime: string
  outputSize: number
  onReset: () => void
}

export function DownloadCard({
  downloadUrl,
  filename,
  processingTime,
  outputSize,
  onReset,
}: DownloadCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-green-500/30 bg-green-500/5 p-8"
    >
      <div className="flex flex-col items-center text-center">
        {/* Success icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/20 text-green-500 mb-4">
          <FileText className="h-8 w-8" />
        </div>

        <h3 className="text-xl font-bold mb-1">File Ready!</h3>
        <p className="text-sm text-muted-foreground mb-6">{filename}</p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            {formatSize(outputSize)}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {processingTime}s
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Button size="lg" className="flex-1" asChild>
            <a href={downloadUrl} download={filename}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          <Button size="lg" variant="outline" className="flex-1" onClick={onReset}>
            Process Another
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
