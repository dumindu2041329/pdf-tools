"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { getToolBySlug } from "@/lib/tools-config"
import { getLimitsForPlan } from "@/lib/usageLimits"
import { FileUploader } from "@/components/tools/FileUploader"
import { ProcessingModal } from "@/components/tools/ProcessingModal"
import { DownloadCard } from "@/components/tools/DownloadCard"
import { ToolOptions, hasToolOptions } from "@/components/tools/options/ToolOptions"
import { RotatePreview } from "@/components/tools/options/RotatePreview"
import { WatermarkPreview } from "@/components/tools/options/WatermarkPreview"
import { PageNumberPreview } from "@/components/tools/options/PageNumberPreview"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTool } from "@/hooks/useTool"
import { uploadFileDirect } from "@/lib/supabase-upload"
import { getEditResult, deleteEditResult } from "@/lib/editResultStore"
import { AiSummarizerView } from "@/components/tools/ai-summarizer/AiSummarizerView"
import { TranslatePdfView } from "@/components/tools/translate-pdf/TranslatePdfView"
import { ScanToPdfView } from "@/components/tools/scan-to-pdf/ScanToPdfView"
import { validateToolOptions } from "@/lib/toolValidation"
import type { Workflow } from "@/lib/workflowStore"
import { getWorkflowSession, updateWorkflowSession, loadWorkflowSession } from "@/lib/workflowSession"
import type { WorkflowSession } from "@/lib/workflowSession"
import { Zap, CheckCircle, Clock, ArrowRight, ArrowLeft, Download, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

interface ToolPageClientProps {
  slug: string
}

export function ToolPageClient({ slug }: ToolPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const tool = getToolBySlug(slug)!
  const toolHasOptions = hasToolOptions(tool.slug)

  const userPlan = ((user?.publicMetadata as Record<string, unknown>)?.plan as string) ?? "free"
  const planLimits = getLimitsForPlan(userPlan)
  const effectiveMaxFiles = userPlan === "premium" && tool.maxFilesPremium
    ? tool.maxFilesPremium
    : (tool.maxFilesFree ?? tool.maxFiles)

  const workflowId = searchParams.get("workflowId")
  const stepIndex = parseInt(searchParams.get("stepIndex") || "0", 10)
  const isWorkflowMode = workflowId !== null && !isNaN(stepIndex)

  const [workflow, setWorkflow] = useState<Workflow | null>(null)

  useEffect(() => {
    if (!isWorkflowMode || !workflowId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset workflow when leaving workflow mode
      setWorkflow(null)
      return
    }
    fetch(`/api/workflows/${workflowId}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (typeof data === "object" && data !== null) {
          const d = data as Record<string, unknown>
          const wf = typeof d.workflow === "object" && d.workflow !== null ? (d.workflow as Workflow) : null
          setWorkflow(wf)
        } else {
          setWorkflow(null)
        }
      })
      .catch(() => setWorkflow(null))
  }, [isWorkflowMode, workflowId])

  const [workflowSession, setWorkflowSession] = useState<WorkflowSession | null>(
    () => isWorkflowMode ? getWorkflowSession() : null
  )

  // Load workflow session on mount/transition (async fallback only)
  useEffect(() => {
    if (!isWorkflowMode) return
    if (workflowSession) return

    loadWorkflowSession().then((loadedSession) => {
      if (loadedSession) {
        setWorkflowSession(loadedSession)
      }
    })
  }, [isWorkflowMode, workflowSession])

  const [files, setFiles] = useState<File[]>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [isSavingAndRedirecting, setIsSavingAndRedirecting] = useState(false)
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [dailyLimitOpen, setDailyLimitOpen] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [isUploadingForEditor, setIsUploadingForEditor] = useState(false)
  const { state, process, reset, cancel, forceSuccess } = useTool(tool.slug)
  const isProcessingRef = useRef(false)

  // Handle edit-pdf result coming back from the editor page —
  // reads the ArrayBuffer from IndexedDB (stored there by the editor)
  // so the DownloadCard appears instantly without a Storage round-trip.
  useEffect(() => {
    if (tool.slug !== "edit-pdf") return
    const editResult = searchParams.get("editResult")
    const resultKey = searchParams.get("resultKey")
    const resultFilename = searchParams.get("resultFilename")
    const resultSize = searchParams.get("resultSize")
    const resultTime = searchParams.get("resultTime")

    if (editResult !== "1" || !resultKey) return

    // Clean the URL params from the browser bar so refresh doesn't re-trigger
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, "", cleanUrl)

    ;(async () => {
      const buffer = await getEditResult(resultKey)
      await deleteEditResult(resultKey)
      if (!buffer) {
        toast.error("Could not retrieve the edited PDF. Please try again.")
        return
      }
      const blob = new Blob([buffer], { type: "application/pdf" })
      const file = new File([blob], resultFilename || `edited-document.pdf`, { type: "application/pdf" })
      forceSuccess(file, {
        processingTime: resultTime || undefined,
        outputSize: resultSize ? Number(resultSize) : undefined,
      })
    })()
  }, [searchParams, tool.slug, forceSuccess])

  // Reset loaded state when stepIndex changes to allow loading new step files
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset files when stepping between workflow steps
    setFilesLoaded(false)
    setFiles([])
    setIsSavingAndRedirecting(false)
    setIsUploadingForEditor(false)
  }, [stepIndex])

  useEffect(() => {
    if (!isWorkflowMode || !workflowSession || filesLoaded) return

    const prevResult = stepIndex > 0 ? workflowSession.stepResults[stepIndex - 1] : null
    if (prevResult) {
      const buffer = prevResult.outputBuffer
      const view = new Uint8Array(buffer.slice(0, 4))
      const isZip = view[0] === 0x50 && view[1] === 0x4B && view[2] === 0x03 && view[3] === 0x04

      if (isZip) {
        import("jszip").then(({ default: JSZip }) => {
          JSZip.loadAsync(buffer).then((zip) => {
            const filePromises: Promise<File>[] = []
            zip.forEach((relativePath, file) => {
              if (!file.dir) {
                filePromises.push(
                  file.async("arraybuffer").then((data) => {
                    const mimeType = relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")
                      ? "image/jpeg"
                      : relativePath.endsWith(".png")
                      ? "image/png"
                      : relativePath.endsWith(".gif")
                      ? "image/gif"
                      : "application/pdf"
                    return new File([data], relativePath.split("/").pop() || "file", { type: mimeType })
                  })
                )
              }
            })
            Promise.all(filePromises).then((extractedFiles) => {
              if (extractedFiles.length > 0) {
                setFiles(extractedFiles)
                setFilesLoaded(true)
              } else {
                const blob = new Blob([buffer], { type: "application/pdf" })
                const fallbackFile = new File([blob], prevResult.filename || "input.pdf", { type: "application/pdf" })
                setFiles([fallbackFile])
                setFilesLoaded(true)
              }
            })
          }).catch(() => {
            const blob = new Blob([buffer], { type: "application/pdf" })
            const fallbackFile = new File([blob], prevResult.filename || "input.pdf", { type: "application/pdf" })
            setFiles([fallbackFile])
            setFilesLoaded(true)
          })
        })
      } else {
        const blob = new Blob([buffer], { type: "application/pdf" })
        const file = new File([blob], prevResult.filename || "input.pdf", { type: "application/pdf" })
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync file load from workflow session on step transition
        setFiles([file])
        setFilesLoaded(true)
      }
    } else if (workflowSession.inputFiles.length > 0 && stepIndex === 0) {
      const fileObjects = workflowSession.inputFiles.map(wf => {
        const blob = new Blob([wf.arrayBuffer], { type: wf.type })
        return new File([blob], wf.name, { type: wf.type })
      })
      setFiles(fileObjects)
      setFilesLoaded(true)
    }
  }, [isWorkflowMode, workflowSession, stepIndex, filesLoaded])

  const handleProcess = async () => {
    if ((files.length === 0 && tool.slug !== "html-to-pdf") || isProcessingRef.current) return

    // edit-pdf has its own dedicated editor page. The "Next" button
    // uploads the source PDF to Supabase Storage and navigates the
    // user to that page; we bypass the normal iLoveAPI processing path.
    if (tool.slug === "edit-pdf") {
      await handleEditPdfNext()
      return
    }

    // Enforce the daily file limit before sending anything to the server.
    // Premium has daily = -1 (unlimited) so this check only blocks free users.
    // The server is the source of truth (canProcessFile) and will reject again
    // if the client check is stale.
    //
    // Guest users: /api/usage returns `isGuest: true` and zero counters.
    // Their actual count lives in a server-side cookie (see
    // lib/guest-usage.ts) so we read it from the same /api/usage response
    // and, if they've hit the cap, bounce them straight to the sign-up
    // page rather than the in-app "Daily limit reached" dialog (they have
    // no plan to upgrade to without an account).
    const dailyLimit = planLimits.daily
    if (dailyLimit > 0) {
      try {
        const res = await fetch("/api/usage", { cache: "no-store" })
        if (res.ok) {
          const data = (await res.json()) as {
            filesProcessedToday?: number
            isGuest?: boolean
          }
          const usedToday = typeof data.filesProcessedToday === "number"
            ? data.filesProcessedToday
            : 0
          if (usedToday >= dailyLimit) {
            if (data.isGuest) {
              toast.error("You've reached the daily limit for guests. Sign up for a free account to continue.")
              router.replace("/sign-up")
              return
            }
            setDailyLimitOpen(true)
            return
          }
        }
      } catch {
        // If the usage check fails, fall through and let the server enforce it.
      }
    }

    const validationMsg = validateToolOptions(tool.slug, options, files)
    if (validationMsg) {
      toast.error(validationMsg)
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
    setIsSavingAndRedirecting(false)
    reset()
  }

  const handleCancel = () => {
    cancel()
    setFiles([])
    setOptions({})
    isProcessingRef.current = false
  }

  const handleEditPdfNext = async () => {
    if (files.length === 0 || isUploadingForEditor) return
    const file = files[0]

    // Guest daily/monthly cap mirrors the other tool flows.
    const dailyLimit = planLimits.daily
    if (dailyLimit > 0) {
      try {
        const res = await fetch("/api/usage", { cache: "no-store" })
        if (res.ok) {
          const data = (await res.json()) as {
            filesProcessedToday?: number
            isGuest?: boolean
          }
          const usedToday = typeof data.filesProcessedToday === "number"
            ? data.filesProcessedToday
            : 0
          if (usedToday >= dailyLimit) {
            if (data.isGuest) {
              toast.error("You've reached the daily limit for guests. Sign up for a free account to continue.")
              router.replace("/sign-up")
              return
            }
            setDailyLimitOpen(true)
            return
          }
        }
      } catch {
        // If the usage check fails, fall through and let the server enforce it.
      }
    }

    setIsUploadingForEditor(true)
    try {
      // Upload straight to Supabase Storage so the editor page can
      // re-hydrate the file via its public URL. `uploadFileDirect`
      // handles the signed-URL handshake for us and is the same
      // mechanism the regular `/api/tools/[tool]` flow uses for
      // files above the 4 MB FormData cap.
      const { url } = await uploadFileDirect(file, {
        pathname: `edit-pdf/${file.name}`,
        bucket: "pdf-uploads",
        contentType: "application/pdf",
      })

      const params = new URLSearchParams({
        file: url,
        filename: file.name,
      })
      router.push(`/edit-pdf-editor?${params.toString()}`)
    } catch (err) {
      console.error("Failed to upload PDF for editor:", err)
      toast.error(err instanceof Error ? err.message : "Failed to prepare the file for editing. Please try again.")
    } finally {
      setIsUploadingForEditor(false)
    }
  }

  const handleUpgrade = async () => {
    if (upgradeLoading) return
    setUpgradeLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("Could not start checkout.")
    } finally {
      setUpgradeLoading(false)
    }
  }

  const handleContinue = useCallback(() => {
    if (!workflow || !workflowSession) return

    const nextIndex = stepIndex + 1
    if (nextIndex < workflow.steps.length) {
      const nextTool = workflow.steps[nextIndex].tool
      router.push(`/tools/${nextTool}?workflowId=${workflowId}&stepIndex=${nextIndex}`)
    } else {
      router.push(`/workflows/${workflowId}/run?complete=1`)
    }
  }, [workflow, workflowSession, stepIndex, workflowId, router])

  const isProcessing = state.status === "processing"
  const isSuccess = state.status === "success"
  const isValidationSuccess = state.status === "validation-success"
  const isError = state.status === "error"

  const isBoldItalicSelected = (tool.slug === "watermark-pdf" || tool.slug === "add-page-numbers") && options.font_weight === "bold" && options.font_style === "italic"
  const isFontSizeInvalid = tool.slug === "watermark-pdf" && options.mode !== "image" && !!(options._fontSizeInvalid)

  useEffect(() => {
    if (isBoldItalicSelected) {
      toast.error("Bold Italic combination is not supported. Please select only Bold or only Italic.")
    }
  }, [isBoldItalicSelected])

  useEffect(() => {
    if (isError && "message" in state && state.message) {
      toast.error(state.message)
      isProcessingRef.current = false
      reset()
    }
  }, [isError, state, reset])

  useEffect(() => {
    if (isSuccess && isWorkflowMode && state.status === "success" && "downloadUrl" in state) {
      const session = getWorkflowSession()
      if (session) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Start workflow save flow synchronously when success detected
        setIsSavingAndRedirecting(true)
        fetch(state.downloadUrl)
          .then(res => res.arrayBuffer())
          .then(buffer => {
            updateWorkflowSession({
              stepResults: session.stepResults.map((result, idx) =>
                idx === stepIndex ? { outputBuffer: buffer, filename: state.filename, toolSlug: tool.slug } : result
              ),
            })
            // Automatically navigate to next step or workflow page
            if (workflow) {
              const nextIndex = stepIndex + 1
              if (nextIndex < workflow.steps.length) {
                const nextTool = workflow.steps[nextIndex].tool
                router.push(`/tools/${nextTool}?workflowId=${workflowId}&stepIndex=${nextIndex}`)
              } else {
                router.push(`/workflows/${workflowId}/run?complete=1`)
              }
            }
          })
          .catch(err => {
            console.error("Failed to save workflow result:", err)
            setIsSavingAndRedirecting(false)
          })
      }
    }
  }, [isSuccess, isWorkflowMode, state, stepIndex, workflow, workflowId, router, tool])

  const isMergePdfTool = tool.slug === "merge-pdf"
  const hasEnoughFilesForMerge = !isMergePdfTool || files.length >= 2
  const showOptionsAndProcess = (files.length > 0 || tool.slug === "html-to-pdf") && hasEnoughFilesForMerge

  useEffect(() => {
    if (isMergePdfTool && files.length === 1) {
      toast.info("Please add at least one more PDF file to merge", {
        duration: 4000,
      })
    }
  }, [isMergePdfTool, files.length])

  // AI tools with dedicated split-view layouts.
  if (tool.slug === "ai-summarizer") {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        <h1 className="mb-8 text-3xl sm:text-4xl font-serif font-bold text-center text-foreground">
          {tool.title}
        </h1>
        <AiSummarizerView maxSizeMB={planLimits.maxFileSizeMB} />
      </div>
    )
  }

  if (tool.slug === "translate-pdf") {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        <h1 className="mb-8 text-3xl sm:text-4xl font-serif font-bold text-center text-foreground">
          {tool.title}
        </h1>
        <TranslatePdfView maxSizeMB={planLimits.maxFileSizeMB} />
      </div>
    )
  }

  if (tool.slug === "scan-to-pdf") {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        <h1 className="mb-8 text-3xl sm:text-4xl font-serif font-bold text-center text-foreground">
          {tool.title}
        </h1>
        <ScanToPdfView />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
      <div className="relative mb-10">
        {isWorkflowMode && stepIndex > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const prevTool = workflow!.steps[stepIndex - 1].tool
                router.push(`/tools/${prevTool}?workflowId=${workflowId}&stepIndex=${stepIndex - 1}`)
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-center text-foreground">
          {tool.title}
        </h1>
      </div>

      {!isSuccess && !isValidationSuccess && (
        <div className="space-y-8">
          <div className={`grid grid-cols-1 ${(tool.slug === "rotate-pdf" || tool.slug === "watermark-pdf" || tool.slug === "add-page-numbers") && files.length > 0 ? "lg:grid-cols-3" : toolHasOptions && files.length > 0 && tool.slug !== "html-to-pdf" ? "lg:grid-cols-2" : "max-w-2xl mx-auto"} gap-8 items-start`}>
            {tool.slug !== "html-to-pdf" && (
              <FileUploader
                accept={tool.acceptedFileTypes}
                multiple={effectiveMaxFiles > 1}
                maxFiles={effectiveMaxFiles}
                maxSizeMB={planLimits.maxFileSizeMB}
                files={files}
                onFilesSelected={setFiles}
                isDisabled={isProcessing}
                colorCodeBySourceFile={tool.slug === "organize-pdf"}
                reorderable={tool.slug === "organize-pdf"}
                layout={tool.slug === "organize-pdf" ? "list" : "grid"}
              />
            )}

            {tool.slug === "rotate-pdf" && files.length > 0 ? (
              <RotatePreview
                files={files}
                rotation={(options.rotate as number) || 0}
              />
            ) : tool.slug === "watermark-pdf" && files.length > 0 ? (
              <WatermarkPreview
                files={files}
                options={options}
                onFileSelect={(fileIndex, pageCount) => {
                  setOptions((prev) => ({
                    ...prev,
                    selectedPreviewFileIndex: fileIndex,
                    selectedPreviewPageCount: pageCount,
                  }))
                }}
              />
            ) : tool.slug === "add-page-numbers" && files.length > 0 ? (
              <PageNumberPreview
                files={files}
                options={options}
                onFileSelect={(fileIndex, pageCount) => {
                  setOptions((prev) => ({
                    ...prev,
                    selectedPreviewFileIndex: fileIndex,
                    selectedPreviewPageCount: pageCount,
                  }))
                }}
              />
            ) : (
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
                        disabled={isUploadingForEditor}
                        className="w-full shadow-lg shadow-primary/25 text-base"
                      >
                        {tool.slug === "edit-pdf" ? (
                          isUploadingForEditor ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading…
                            </>
                          ) : (
                            <>
                              Next
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )
                        ) : isWorkflowMode ? (
                          <>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            {tool.title}
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {tool.slug === "rotate-pdf" && files.length > 0 && (
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
                        {isWorkflowMode ? (
                          <>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            {tool.title}
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {tool.slug === "watermark-pdf" && files.length > 0 && (
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
                  {showOptionsAndProcess && !isProcessing && !isBoldItalicSelected && !isFontSizeInvalid && (
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
                        {isWorkflowMode ? (
                          <>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            {tool.title}
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {tool.slug === "add-page-numbers" && files.length > 0 && (
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
                  {showOptionsAndProcess && !isProcessing && !isBoldItalicSelected && (
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
                        {isWorkflowMode ? (
                          <>
                            Continue
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            {tool.title}
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      {isSuccess && !isWorkflowMode && (
        <div className="space-y-6">
          {/* For last step in workflow, only show download card */}
          {isWorkflowMode && workflow && stepIndex === workflow.steps.length - 1 ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/20 text-green-500 mx-auto mb-4">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-1">All Steps Completed!</h3>
                <p className="text-muted-foreground mb-6">
                  Your file has been processed through all {workflow.steps.length} steps.
                </p>
                <div className="flex items-center justify-center gap-6 mb-8">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {state.processingTime}s
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {state.outputSize && (
                      <>({(state.outputSize / 1024 / 1024).toFixed(2)} MB)</>
                    )}
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={() => {
                    const a = document.createElement("a")
                    a.href = state.downloadUrl
                    a.download = state.filename
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                  }}
                  className="flex items-center gap-2 mx-auto"
                >
                  <Download className="h-4 w-4" />
                  Download Result
                </Button>
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/workflows/${workflowId}/run?complete=1`)}
                >
                  Back to Workflow
                </Button>
              </div>
            </div>
          ) : isWorkflowMode && workflow ? (
            <div className="flex justify-center gap-4">
              {stepIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const prevTool = workflow.steps[stepIndex - 1].tool
                    router.push(`/tools/${prevTool}?workflowId=${workflowId}&stepIndex=${stepIndex - 1}`)
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous Step
                </Button>
              )}
              <Button
                onClick={handleContinue}
                className="flex items-center gap-2"
              >
                Continue to {workflow.steps[stepIndex + 1]?.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <DownloadCard
              downloadUrl={state.downloadUrl}
              filename={state.filename}
              processingTime={state.processingTime}
              outputSize={state.outputSize}
              onReset={handleReset}
            />
          )}
        </div>
      )}

      {isValidationSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-green-500/30 bg-green-500/5 p-8"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/20 text-green-500 mb-4">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold mb-1">PDF validation is success</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Your PDF file has been validated and conforms to the selected PDF/A standard.
            </p>
            <div className="flex items-center justify-center gap-6 mb-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {state.processingTime}s
              </div>
            </div>
            <Button size="lg" variant="outline" onClick={handleReset}>
              Validate Another File
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      <ProcessingModal
        open={isProcessing || isSavingAndRedirecting}
        onClose={() => {
          // The modal's auto-close timer and the backdrop click both
          // land here. Cancellation goes through the modal's own
          // cancel button (which calls `cancel()` directly), so this
          // handler is only ever invoked when the work is already
          // done — nothing to do.
        }}
        toolSlug={tool.slug}
        toolName={tool.title}
        state={isSavingAndRedirecting ? { status: "success" } as typeof state : state}
        cancel={handleCancel}
      />

      <ConfirmDialog
        isOpen={dailyLimitOpen}
        title="Daily limit reached"
        description="You've used up your daily limit. You can process more files tomorrow, or upgrade your plan to Premium for unlimited processing."
        confirmLabel="Upgrade to Premium"
        cancelLabel="Close"
        loading={upgradeLoading}
        loadingLabel="Redirecting to checkout..."
        onConfirm={handleUpgrade}
        onCancel={() => setDailyLimitOpen(false)}
      />
    </div>
  )
}
