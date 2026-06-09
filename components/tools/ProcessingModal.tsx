"use client"

import { motion } from "framer-motion"
import { Server, Upload, Zap, Download, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProcessingStep = "start" | "upload" | "process" | "download" | "done"

export type UploadProgress = {
  loaded: number
  total: number
}

const steps: { id: ProcessingStep; label: string; icon: React.ElementType }[] = [
  { id: "start", label: "Connecting to server...", icon: Server },
  { id: "upload", label: "Uploading your file...", icon: Upload },
  { id: "process", label: "Processing with iLoveAPI...", icon: Zap },
  { id: "download", label: "Preparing download...", icon: Download },
  { id: "done", label: "Ready!", icon: Check },
]

interface ProcessingModalProps {
  currentStep: ProcessingStep
  uploadProgress?: number
  uploadBytes?: UploadProgress
  isOpen: boolean
  /**
   * True when the browser-to-server upload (XHR) finished and the server is
   * now forwarding the file to iLoveAPI/Adobe. Used to swap the concrete
   * percent bar for an indeterminate pulse so the user knows work is still
   * happening.
   */
  serverProcessing?: boolean
}

/**
 * Circular progress ring for the active upload step.
 * Fills clockwise based on the upload percentage.
 */
function UploadRing({ percent }: { percent: number }) {
  const size = 40
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, percent))
  const offset = circumference * (1 - safe / 100)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.05, ease: "linear" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/**
 * Indeterminate circular spinner for the active process step.
 * Rotates a dashed arc continuously.
 */
function SpinnerRing() {
  const size = 40
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashLength = circumference * 0.25

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block animate-spin"
      aria-hidden="true"
      style={{ transformOrigin: "center" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

function getStepIndex(step: ProcessingStep) {
  return steps.findIndex((s) => s.id === step)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  // Show 1 decimal for KB+, 0 decimals for B
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function ProcessingModal({
  currentStep,
  uploadProgress,
  uploadBytes,
  isOpen,
  serverProcessing,
}: ProcessingModalProps) {
  if (!isOpen) return null
  const currentIdx = getStepIndex(currentStep)
  const showUploadVisualizer =
    currentStep === "upload" && (uploadProgress !== undefined || uploadBytes !== undefined)
  const safePercent = Math.max(0, Math.min(100, uploadProgress ?? 0))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl"
      >
        <h3 className="text-xl font-bold text-center mb-8">
          {currentStep === "done" ? "Processing Complete!" : "Processing Your File"}
        </h3>

        <div className="space-y-4">
          {steps.map((step, i) => {
            const isActive = i === currentIdx
            const isCompleted = i < currentIdx
            const isPending = i > currentIdx
            const isUploadStep = step.id === "upload"
            const showVisualizer = isActive && isUploadStep && showUploadVisualizer
            const Icon = step.icon

            return (
              <div key={step.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  {/* Step indicator */}
                  <motion.div
                    initial={false}
                    animate={{
                      scale: isActive ? 1.1 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                      isCompleted && "bg-green-500/20 text-green-500",
                      isActive && step.id === "done" && "bg-green-500/20 text-green-500",
                      isActive && step.id !== "done" && "bg-primary/20 text-primary",
                      isPending && "bg-muted text-muted-foreground"
                    )}
                  >
                    {isActive && step.id === "upload" && !serverProcessing && uploadProgress !== undefined ? (
                      <UploadRing percent={safePercent} />
                    ) : isActive && step.id === "upload" && serverProcessing ? (
                      <SpinnerRing />
                    ) : isActive && step.id !== "done" ? (
                      <SpinnerRing />
                    ) : isActive && step.id === "done" ? (
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        <Check className="h-5 w-5" />
                      </motion.div>
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </motion.div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium transition-colors",
                        isCompleted && "text-green-500",
                        isActive && "text-foreground",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {step.id === "upload" && serverProcessing
                        ? "Forwarding to processing server..."
                        : step.label}
                    </p>
                  </div>

                  {/* Percentage on the right of the label, only while uploading */}
                  {showVisualizer && !serverProcessing && (
                    <motion.span
                      key={safePercent}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm font-semibold tabular-nums text-primary shrink-0"
                    >
                      {safePercent}%
                    </motion.span>
                  )}

                  {/* Completed checkmark */}
                  {isCompleted && (
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                </div>

                {/* Real upload progress visualizer */}
                {showVisualizer && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="pl-14 pr-1"
                  >
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                      {serverProcessing ? (
                        // Indeterminate pulse: a glowing segment travels back and
                        // forth across the full bar so the user can see work is
                        // still happening on the server.
                        <motion.div
                          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
                          initial={false}
                          animate={{ x: ["-100%", "300%"] }}
                          transition={{
                            duration: 1.4,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      ) : (
                        <>
                          {/* Animated gradient fill */}
                          <motion.div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary"
                            initial={false}
                            animate={{ width: `${safePercent}%` }}
                            transition={{ duration: 0.05, ease: "linear" }}
                          >
                            {/* Shimmer overlay that travels across the filled portion */}
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                              animate={{ x: ["-100%", "200%"] }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                          </motion.div>

                          {/* Pulsing leading edge highlight */}
                          <motion.div
                            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary/70 blur-[2px]"
                            initial={false}
                            animate={{
                              left: `calc(${safePercent}% - 6px)`,
                              opacity: safePercent > 0 && safePercent < 100 ? [0.4, 0.9, 0.4] : 0,
                            }}
                            transition={{
                              opacity: {
                                duration: 1,
                                repeat: Infinity,
                                ease: "easeInOut",
                              },
                            }}
                          />
                        </>
                      )}
                    </div>

                    {/* Byte counters — hidden while the server is processing so we
                        don't imply the bytes are still streaming in. */}
                    {uploadBytes && uploadBytes.total > 0 && !serverProcessing && (
                      <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground tabular-nums">
                        <span>{formatBytes(uploadBytes.loaded)} uploaded</span>
                        <span>{formatBytes(uploadBytes.total)} total</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
