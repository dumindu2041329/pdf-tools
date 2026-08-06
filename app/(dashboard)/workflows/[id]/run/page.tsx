"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Upload, CheckCircle, XCircle, Loader2, ArrowRight, Download } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getToolBySlug } from "@/lib/tools-config"
import { mimeTypeForFilename } from "@/lib/utils"
import type { Workflow } from "@/lib/workflowStore"
import { createWorkflowSession, clearWorkflowSession, loadWorkflowSession } from "@/lib/workflowSession"
import { toast } from "sonner"

type WorkflowStatus = "idle" | "uploading" | "processing" | "success" | "error"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseWorkflow(value: unknown): Workflow | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === "string" ? value.id : ""
  const name = typeof value.name === "string" ? value.name : ""
  const lastRun =
    value.lastRun === null ? null : typeof value.lastRun === "string" ? value.lastRun : null
  const runCount = typeof value.runCount === "number" ? value.runCount : 0
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : Date.now()

  if (!id || !name) return null

  const stepsRaw = value.steps
  if (!Array.isArray(stepsRaw)) return null
  const steps = stepsRaw
    .map((s) => {
      if (!isRecord(s)) return null
      const tool = typeof s.tool === "string" ? s.tool : ""
      const label = typeof s.label === "string" ? s.label : ""
      if (!tool || !label) return null
      return { tool, label }
    })
    .filter((s): s is { tool: string; label: string } => s !== null)

  return { id, name, steps, lastRun, runCount, createdAt }
}

interface StepResult {
  status: "pending" | "running" | "success" | "error"
  outputBuffer?: ArrayBuffer
  error?: string
}

interface WorkflowState {
  workflow: Workflow | null
  files: File[]
  status: WorkflowStatus
  currentStepIndex: number
  stepResults: StepResult[]
  finalResult: { buffer: ArrayBuffer; filename: string } | null
  errorMessage: string
}

export default function WorkflowRunPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = params.id as string
  const isComplete = searchParams.get("complete") === "1"

  const isInitializedRef = useRef(false)

  const [state, setState] = useState<WorkflowState>(() => {
    return {
      workflow: null,
      files: [],
      status: "idle",
      currentStepIndex: 0,
      stepResults: [],
      finalResult: null,
      errorMessage: ""
    }
  })

  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    fetch(`/api/workflows/${workflowId}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (typeof data === "object" && data !== null) {
          const d = data as Record<string, unknown>
          const wf = parseWorkflow(d.workflow)
          if (!wf) {
            toast.error("Workflow not found")
            router.push("/workflows")
            return
          }
          setState((prev) => ({
            ...prev,
            workflow: wf,
            stepResults: Array(wf.steps.length).fill({ status: "pending" }),
          }))
        }
      })
      .catch(() => {
        toast.error("Failed to load workflow")
        router.push("/workflows")
      })
  }, [workflowId, router])

  useEffect(() => {
    if (!isComplete || !state.workflow) return
    fetch(`/api/workflows/${workflowId}/run`, { method: "POST" }).catch(() => {})
  }, [isComplete, state.workflow, workflowId])

  // Hydrate completed workflow session on page load/refresh
  useEffect(() => {
    if (isComplete && !state.finalResult && state.workflow) {
      loadWorkflowSession().then((session) => {
        if (session) {
          const lastResult = session.stepResults[session.stepResults.length - 1]
          if (lastResult) {
            setState(prev => ({
              ...prev,
              status: "success",
              stepResults: session.stepResults.map(r => ({
                status: "success" as const,
                outputBuffer: r?.outputBuffer
              })),
              finalResult: { buffer: lastResult.outputBuffer, filename: lastResult.filename }
            }))
          }
        }
      })
    }
  }, [isComplete, state.finalResult, state.workflow])

  const { workflow, files, status, stepResults, finalResult, errorMessage } = state

  function handleFilesSelected(selectedFiles: File[]) {
    setState(prev => ({ ...prev, files: selectedFiles }))
  }

  async function startStepByStepWorkflow() {
    if (!workflow || files.length === 0) return

    await createWorkflowSession(workflowId, workflow.steps.length, files)
    const firstStep = workflow.steps[0]
    router.push(`/tools/${firstStep.tool}?workflowId=${workflowId}&stepIndex=0`)
  }

  function downloadResult() {
    if (!finalResult) return

    const blob = new Blob([finalResult.buffer], {
      type: mimeTypeForFilename(finalResult.filename),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = finalResult.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function finishStepByStepWorkflow() {
    if (!finalResult) return

    const blob = new Blob([finalResult.buffer], {
      type: mimeTypeForFilename(finalResult.filename),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = finalResult.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    clearWorkflowSession()
    router.push("/workflows")
  }

  function resetWorkflow() {
    setState(prev => ({
      ...prev,
      files: [],
      status: "idle",
      currentStepIndex: 0,
      stepResults: prev.workflow ? Array(prev.workflow.steps.length).fill({ status: "pending" }) : [],
      finalResult: null,
      errorMessage: ""
    }))
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link href="/workflows">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Run Workflow</h1>
          <p className="mt-1 text-sm text-muted-foreground truncate">{workflow.name}</p>
        </div>
      </div>

      {/* Steps Overview */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 mb-6 sm:mb-8">
        <h2 className="text-lg font-semibold mb-4">Workflow Steps</h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {workflow.steps.map((step, index) => {
            const tool = getToolBySlug(step.tool)
            const Icon = tool?.icon
            const result = stepResults[index]
            const isCompleted = result?.status === "success"
            const isFailed = result?.status === "error"

            return (
              <div key={index} className="flex items-center gap-2 sm:gap-3">
                <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 ${
                  isCompleted ? "border-green-500 bg-green-500/10" :
                  isFailed ? "border-red-500 bg-red-500/10" :
                  "border-border bg-muted"
                }`}>
                  {result?.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : result?.status === "error" ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : Icon ? (
                    <Icon className="h-4 w-4" />
                  ) : null}
                  <span className="text-xs sm:text-sm font-medium">{step.label}</span>
                </div>
                {index < workflow.steps.length - 1 && (
                  <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* File Upload or Results */}
      {status === "idle" && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Upload Files</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload the PDF files you want to process through this workflow. The files will be processed by each step in sequence.
            </p>

            <div
              className="border-2 border-dashed border-border rounded-xl p-8 sm:p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => {
                const input = document.createElement("input")
                input.type = "file"
                input.accept=".pdf"
                input.multiple = true
                input.onchange = (e) => {
                  const selectedFiles = (e.target as HTMLInputElement).files
                  if (selectedFiles) {
                    handleFilesSelected(Array.from(selectedFiles))
                  }
                }
                input.click()
              }}
            >
              <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base sm:text-lg font-medium mb-2">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground">PDF files only</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{files.length} file(s) selected:</p>
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground break-all">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="min-w-0 flex-1">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                onClick={startStepByStepWorkflow}
                disabled={files.length === 0}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-500 bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-red-500">Workflow Failed</h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <Button onClick={resetWorkflow} variant="outline" className="w-full sm:w-auto">
                Try Again
              </Button>
              <Link href="/workflows" className="w-full sm:w-auto">
                <Button variant="ghost" className="w-full sm:w-auto border border-border bg-muted/50 sm:border-0 sm:bg-transparent">Back to Workflows</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {status === "success" && finalResult && (
        <div className="rounded-xl border border-green-500 bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-green-500">Workflow Completed Successfully!</h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your files have been processed through all {workflow.steps.length} steps.
            </p>
            <div className="flex items-center gap-2 text-sm break-all">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              <span className="min-w-0">{finalResult.filename} ({(finalResult.buffer.byteLength / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
              {isComplete ? (
                <Button onClick={finishStepByStepWorkflow} className="flex items-center gap-2 w-full sm:w-auto">
                  <Download className="h-4 w-4" />
                  Download & Finish
                </Button>
              ) : (
                <>
                  <Button onClick={downloadResult} className="flex items-center gap-2 w-full sm:w-auto">
                    <Download className="h-4 w-4" />
                    Download Result
                  </Button>
                  <Button onClick={resetWorkflow} variant="outline" className="w-full sm:w-auto">
                    Run Again
                  </Button>
                </>
              )}
              <Link href="/workflows" className="w-full sm:w-auto">
                <Button variant="ghost" className="w-full sm:w-auto border border-border bg-muted/50 sm:border-0 sm:bg-transparent">Back to Workflows</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
