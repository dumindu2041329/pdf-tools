"use client"

import { motion } from "framer-motion"
import { Server, Upload, Zap, Download, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProcessingStep = "start" | "upload" | "process" | "download" | "done"

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
  isOpen: boolean
}

function getStepIndex(step: ProcessingStep) {
  return steps.findIndex((s) => s.id === step)
}

export function ProcessingModal({
  currentStep,
  uploadProgress,
  isOpen,
}: ProcessingModalProps) {
  if (!isOpen) return null
  const currentIdx = getStepIndex(currentStep)

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
            const Icon = step.icon

            return (
              <div key={step.id} className="flex items-center gap-4">
                {/* Step indicator */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    isCompleted && "bg-green-500/20 text-green-500",
                    isActive && "bg-primary/20 text-primary",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                >
                  {isActive && step.id !== "done" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

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
                    {step.label}
                  </p>

                  {/* Upload progress bar */}
                  {isActive && step.id === "upload" && uploadProgress !== undefined && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </div>

                {/* Checkmark */}
                {isCompleted && (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
