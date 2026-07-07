"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Loader2, Upload, Cpu, Download, Sparkles, X } from "lucide-react"
import { useTool } from "@/hooks/useTool"

export type ProcessingStep = "start" | "upload" | "process" | "download" | "done"

interface ProcessingModalProps {
  open: boolean
  onClose: () => void
  toolSlug: string
  toolName: string
  state: ReturnType<typeof useTool>["state"]
  /**
   * Aborts the in-flight run. Invoked by the cancel buttons in this
   * modal. Triggers an `AbortController.abort()` in `useTool`, which
   * rejects the XHR(s) with an `AbortError` and cleans up any
   * direct-uploaded Supabase Storage objects.
   */
  cancel: () => void
}

const STEPS: { id: ProcessingStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "start", label: "Connecting to server", icon: Sparkles },
  { id: "upload", label: "Uploading your file", icon: Upload },
  { id: "process", label: "Processing on server", icon: Cpu },
  { id: "download", label: "Preparing download", icon: Download },
  { id: "done", label: "Ready!", icon: Check },
]

function getActiveStep(state: ReturnType<typeof useTool>["state"]): ProcessingStep {
  if (state.status === "processing") return state.step
  if (state.status === "success" || state.status === "validation-success") return "done"
  return "start"
}

function getStepIndex(step: ProcessingStep): number {
  return STEPS.findIndex((s) => s.id === step)
}

export function ProcessingModal({ open, onClose, toolSlug, toolName, state, cancel }: ProcessingModalProps) {
  const activeStep = getActiveStep(state)
  const activeIndex = getStepIndex(activeStep)

  // Track whether the user has clicked Cancel at least once so we can
  // show a "Cancelled" subline instead of the usual "hang tight" hint
  // — gives them feedback that the click landed, since the modal
  // closes almost immediately after the abort.
  const [wasCancelled, setWasCancelled] = useState(false)

  // Suppress the unused-var lint warning for toolSlug / toolName —
  // they're passed in so the parent can keep its prop surface stable,
  // even though we don't need them inside the modal.
  void toolSlug
  void toolName

  // Auto-close the modal shortly after we hit "done" so the success
  // animation has time to play. The parent also dismisses on the
  // download CTA; this is the no-CTA fallback.
  useEffect(() => {
    if (state.status === "success" || state.status === "validation-success") {
      const t = setTimeout(() => onClose(), 600)
      return () => clearTimeout(t)
    }
  }, [state.status, onClose])

  // Reset the "cancelled" flag whenever a fresh run starts, so a
  // subsequent successful run shows the normal copy.
  useEffect(() => {
    if (state.status === "processing" && state.step === "start") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWasCancelled(false)
    }
  }, [state.status, state])

  // While we're still on "done" (or "validation-success"), don't show
  // the cancel button anymore — the work is finished, only a download
  // CTA is meaningful.
  const showCancel = state.status === "processing"

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => {
            // Clicking the backdrop while we're done is a shortcut to close.
            // While still processing, we don't dismiss (the cancel button
            // is the explicit escape hatch).
            if (state.status !== "processing") onClose()
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md"
          >
            {/* Cancel button (top-right) — only while processing. */}
            {showCancel && (
              <button
                type="button"
                aria-label="Cancel processing"
                onClick={() => {
                  setWasCancelled(true)
                  cancel()
                }}
                className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1">
              Processing your file
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {wasCancelled
                ? "Cancelling…"
                : showCancel
                ? "Hang tight — this may take a moment for large files."
                : "All set!"}
            </p>

            {/* Step list with icons + checkmarks for completed steps. */}
            <ol className="space-y-3">
              {STEPS.map((s, i) => {
                const isDone = i < activeIndex || state.status === "success" || state.status === "validation-success"
                const isActive = i === activeIndex && state.status === "processing"
                const isPending = i > activeIndex
                const Icon = s.icon
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <div
                      className={
                        "flex h-8 w-8 items-center justify-center rounded-full border " +
                        (isDone
                          ? "bg-primary/10 border-primary text-primary"
                          : isActive
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground")
                      }
                    >
                      {isDone ? (
                        <Check className="h-4 w-4" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={
                        "text-sm " +
                        (isDone || isActive
                          ? "text-foreground font-medium"
                          : "text-muted-foreground")
                      }
                    >
                      {s.label}
                      {isPending ? "…" : ""}
                    </span>
                  </li>
                )
              })}
            </ol>

            {/* Upload progress bar — only while we're in the upload step. */}
            {state.status === "processing" && state.step === "upload" && (
              <div className="mt-6">
                {state.uploadProgress !== undefined && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Uploading…</span>
                      <span>{state.uploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${state.uploadProgress}%` }}
                        transition={{ ease: "easeOut", duration: 0.2 }}
                      />
                    </div>
                    {state.uploadBytes && (
                      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                        {formatBytes(state.uploadBytes.loaded)} / {formatBytes(state.uploadBytes.total)}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Cancel button at the bottom — explicit, always visible while processing. */}
            {showCancel && (
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setWasCancelled(true)
                    cancel()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
