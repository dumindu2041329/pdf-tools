"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2,
  RotateCw,
  Save,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProcessingModal } from "@/components/tools/ProcessingModal"
import { DownloadCard } from "@/components/tools/DownloadCard"
import { useTool } from "@/hooks/useTool"
import { cn } from "@/lib/utils"

interface ScanImage {
  url: string
  pathname: string
  uploadedAt: string
}

interface EditorImage extends ScanImage {
  /** Client-only rotation applied in the editor preview (0/90/180/270). */
  rotation: 0 | 90 | 180 | 270
  naturalWidth?: number
  naturalHeight?: number
}

const SAFE_SESSION = /^[a-zA-Z0-9-]{1,100}$/

type Orientation = "portrait" | "landscape"
type PageSize = "fit" | "A4" | "letter"

interface EditorOptions {
  orientation: Orientation
  pagesize: PageSize
  margin: number
  mergeAfter: boolean
}

const DEFAULT_OPTIONS: EditorOptions = {
  orientation: "portrait",
  pagesize: "A4",
  margin: 0,
  mergeAfter: true,
}

function getPreviewAspect(
  orientation: Orientation,
  pagesize: PageSize
): string {
  const isPortrait = orientation === "portrait"
  if (pagesize === "A4") return isPortrait ? "210 / 297" : "297 / 210"
  if (pagesize === "letter") {
    return isPortrait ? "215.9 / 279.4" : "279.4 / 215.9"
  }
  return isPortrait ? "3 / 4" : "4 / 3"
}

function getFitPreviewSize(
  naturalWidth: number,
  naturalHeight: number,
  maxPx: number
): { width: number; height: number } {
  const maxDim = Math.max(naturalWidth, naturalHeight)
  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    return { width: maxPx, height: Math.round((maxPx * 4) / 3) }
  }
  const scale = maxPx / maxDim
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

/**
 * Loads an image URL into an HTMLImageElement. Resolves once the
 * browser has fully decoded it (so the canvas draw below doesn't
 * paint a blank frame for large JPEGs).
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to decode image"))
    img.src = url
  })
}

/**
 * Re-encodes an image after rotating it by `degrees` on a canvas. We
 * re-encode at quality 0.92 — close to "visually lossless" for the
 * scan use case while still producing a JPEG smaller than the
 * uncompressed bitmap.
 *
 * Returns a `File` whose name mirrors the original (extension
 * normalised to `.jpg`) so iLoveAPI's imagepdf tool picks the right
 * MIME type.
 */
async function rotateImageFile(
  image: EditorImage,
  degrees: number
): Promise<File> {
  const img = await loadImage(image.url)
  const radians = (degrees * Math.PI) / 180
  // When rotating 90/270 the canvas dimensions swap.
  const swap = degrees === 90 || degrees === 270
  const width = swap ? img.height : img.width
  const height = swap ? img.width : img.height

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")

  ctx.translate(width / 2, height / 2)
  ctx.rotate(radians)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      0.92
    )
  })

  const leaf = image.pathname.split("/").pop() ?? "page.jpg"
  const baseName = leaf.replace(/\.[^.]+$/, "")
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
}

/**
 * Downloads an image (no rotation) and re-wraps it as a File so the
 * existing tool pipeline (which expects File[] via FormData) can send
 * it to iLoveAPI's imagepdf task without a separate code path.
 */
async function downloadAsFile(image: EditorImage): Promise<File> {
  const res = await fetch(image.url)
  if (!res.ok) {
    throw new Error(`Failed to download ${image.pathname} (${res.status})`)
  }
  const blob = await res.blob()
  const leaf = image.pathname.split("/").pop() ?? "page.jpg"
  return new File([blob], leaf, { type: blob.type || "image/jpeg" })
}

export function ScanEditorClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const validSession = SAFE_SESSION.test(sessionId)

  const [images, setImages] = useState<EditorImage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [options, setOptions] = useState<EditorOptions>(DEFAULT_OPTIONS)
  const [pendingDelete, setPendingDelete] = useState<EditorImage | null>(null)
  const [building, setBuilding] = useState(false)

  const { state, process, cancel } = useTool("jpg-to-pdf")

  const handleCancel = useCallback(async () => {
    cancel()
    if (validSession && sessionId) {
      try {
        await fetch(`/api/scan-session/${sessionId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destroy: true }),
        })
      } catch {
        // Best-effort — navigate regardless
      }
    }
    router.push("/tools/scan-to-pdf")
  }, [cancel, validSession, sessionId, router])

  const refresh = useCallback(async () => {
    if (!validSession) return
    try {
      const res = await fetch(`/api/scan-session/${sessionId}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        setLoadError(`Failed to load session (${res.status})`)
        return
      }
      const data = (await res.json()) as { images: ScanImage[] }
      setImages(
        (data.images ?? []).map((img) => ({ ...img, rotation: 0 as const }))
      )
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load session")
    } finally {
      setLoading(false)
    }
  }, [validSession, sessionId])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    refreshRef.current()
  }, [validSession, sessionId])

  // Once the user's PDF is ready and the download card shows up, the
  // original scan captures in Supabase have done their job. Wipe the
  // session folder eagerly so it doesn't linger between visits — the
  // download card itself is a local React state (the PDF is held in
  // a Blob URL on the client), so removing the storage objects
  // doesn't affect what's already on screen. The page-leave beacon
  // still acts as a safety net for users who close the tab straight
  // after the PDF renders.
  const cleanupFiredRef = useRef(false)
  useEffect(() => {
    if (!validSession) return
    if (state.status !== "success") return
    if (cleanupFiredRef.current) return
    cleanupFiredRef.current = true

    fetch(`/api/scan-session/${sessionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destroy: true }),
    }).catch((err) => {
      // Best-effort — a stale session is harmless. The page-leave
      // beacon will retry on navigation/close if this one fails.
      console.warn("[scan-editor] post-success cleanup failed:", err)
    })
  }, [validSession, sessionId, state.status])

  const rotate = (pathname: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.pathname === pathname
          ? { ...img, rotation: ((img.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
          : img
      )
    )
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    // Optimistically remove from the local list so the UI updates
    // instantly. If the network call fails we re-add it so the user's
    // data isn't silently lost.
    setImages((prev) => prev.filter((img) => img.pathname !== target.pathname))
    try {
      const res = await fetch(`/api/scan-session/${sessionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: target.pathname }),
      })
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`)
      }
      toast.success("Page removed")
    } catch (err) {
      console.error("delete failed:", err)
      toast.error("Could not remove page — try again")
      setImages((prev) => {
        if (prev.some((img) => img.pathname === target.pathname)) return prev
        return [...prev, target].sort((a, b) =>
          a.uploadedAt.localeCompare(b.uploadedAt)
        )
      })
    }
  }

  const handleSave = async () => {
    if (images.length === 0) {
      toast.error("Add at least one page before saving")
      return
    }
    setBuilding(true)
    try {
      const files = await Promise.all(
        images.map((img) =>
          img.rotation === 0 ? downloadAsFile(img) : rotateImageFile(img, img.rotation)
        )
      )
      // Mirror the same option keys jpg-to-pdf expects server-side.
      const payloadOptions: Record<string, unknown> = {
        orientation: options.orientation,
        pagesize: options.pagesize,
        margin: options.margin,
        merge_after: options.mergeAfter,
        _toolSlug: "jpg-to-pdf",
      }
      process(files, payloadOptions)
    } catch (err) {
      console.error("build failed:", err)
      toast.error(
        err instanceof Error ? err.message : "Failed to prepare pages"
      )
    } finally {
      setBuilding(false)
    }
  }

  const handleReset = async () => {
    // Destroy the current scan session in storage so the next visit
    // to the scan-to-PDF tool starts with a clean slate, then send
    // the user back to that page (without any sessionId in the URL
    // so the tool view mints a fresh one).
    if (sessionId) {
      try {
        await fetch(`/api/scan-session/${sessionId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destroy: true }),
        })
      } catch (err) {
        // Best-effort — the navigation still happens even if the
        // server-side cleanup fails. A stale session is harmless.
        console.warn("[scan-editor] session destroy failed:", err)
      }
    }
    router.push("/tools/scan-to-pdf")
  }

  const isProcessing = state.status === "processing" || building
  const isSuccess = state.status === "success"

  const subtitle = useMemo(() => {
    if (images.length === 0) return "No pages captured yet"
    if (images.length === 1) return "1 page ready"
    return `${images.length} pages ready`
  }, [images.length])

  if (!validSession) {
    return (
      <main className="min-h-svh flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-md p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-card-foreground">
            No active scan session
          </h1>
          <p className="text-sm text-muted-foreground">
            Open this page by returning to the Scan-to-PDF tool on your
            computer and clicking Save from the live captures panel.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-20">

        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-foreground">
            Review &amp; Save as PDF
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {subtitle}
          </p>
        </header>

        {isSuccess ? (
          <DownloadCardWrapper state={state} onReset={handleReset} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* ── Left: Image preview ─────────────────────────── */}
            <section className="lg:col-span-3 bg-card rounded-2xl shadow-md p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">Pages</h2>
                <span className="text-xs text-muted-foreground">
                  Tap rotate / trash to edit each page
                </span>
              </div>

              {loading ? (
                <PreviewSkeleton />
              ) : loadError ? (
                <PreviewMessage
                  title="Could not load pages"
                  description={loadError}
                  action={
                    <Button variant="outline" size="sm" onClick={refresh}>
                      Try again
                    </Button>
                  }
                />
              ) : images.length === 0 ? (
                <PreviewMessage
                  title="No pages captured"
                  description="Scan pages with your phone, then return to this page. They will appear here automatically."
                />
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 max-h-[60vh] overflow-y-auto pr-2">
                  {images.map((img, idx) => {
                    const isFit = options.pagesize === "fit"

                    // Effective natural dimensions, accounting for 90/270 rotation
                    // (rotated image swaps width/height in the PDF page).
                    const swap = img.rotation === 90 || img.rotation === 270
                    const effectiveW = swap ? img.naturalHeight : img.naturalWidth
                    const effectiveH = swap ? img.naturalWidth : img.naturalHeight

                    const fitSize =
                      isFit && effectiveW && effectiveH
                        ? getFitPreviewSize(effectiveW, effectiveH, 96)
                        : null

                    // While dimensions haven't loaded yet in "fit" mode, reserve a
                    // fixed square placeholder so the grid doesn't jump on load.
                    const fitPending = isFit && !fitSize

                    return (
                      <li
                        key={img.pathname}
                        className={cn(
                          "group relative mx-auto rounded-xl overflow-hidden border border-border",
                          // Fit mode: the <img> defines the height; bg-white shows the margin area.
                          isFit ? "max-w-[96px] w-full bg-white" : "w-24 bg-white"
                        )}
                        style={
                          isFit && options.margin > 0
                            ? { padding: `${Math.min(options.margin / 4, 24)}px` }
                            : undefined
                        }
                      >
                        {/* ── Fit-to-image: raw <img> with natural aspect ratio, zero white space ── */}
                        {isFit ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.url}
                              alt={`Page ${idx + 1}`}
                              className="block w-full h-auto transition-transform duration-300"
                              style={
                                fitPending
                                  ? { minHeight: 72, transform: `rotate(${img.rotation}deg)` }
                                  : { transform: `rotate(${img.rotation}deg)` }
                              }
                              loading="lazy"
                              onLoad={(e) => {
                                const el = e.currentTarget
                                if (
                                  !img.naturalWidth &&
                                  !img.naturalHeight &&
                                  el.naturalWidth &&
                                  el.naturalHeight
                                ) {
                                  setImages((prev) =>
                                    prev.map((p) =>
                                      p.pathname === img.pathname
                                        ? {
                                            ...p,
                                            naturalWidth: el.naturalWidth,
                                            naturalHeight: el.naturalHeight,
                                          }
                                        : p
                                    )
                                  )
                                }
                              }}
                            />
                          </>
                        ) : (
                        /* ── Fixed page size (A4 / letter): aspect-ratio box with object-contain ── */
                        <div
                          className="relative overflow-hidden bg-white"
                          style={{
                            aspectRatio: getPreviewAspect(
                              options.orientation,
                              options.pagesize
                            ),
                          }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{
                              padding:
                                options.margin > 0
                                  ? `${Math.min(options.margin / 4, 24)}px`
                                  : "0",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.url}
                              alt={`Page ${idx + 1}`}
                              className="w-full h-full object-contain transition-transform duration-300"
                              style={{ transform: `rotate(${img.rotation}deg)` }}
                              loading="lazy"
                              onLoad={(e) => {
                                const el = e.currentTarget
                                if (
                                  !img.naturalWidth &&
                                  !img.naturalHeight &&
                                  el.naturalWidth &&
                                  el.naturalHeight
                                ) {
                                  setImages((prev) =>
                                    prev.map((p) =>
                                      p.pathname === img.pathname
                                        ? {
                                            ...p,
                                            naturalWidth: el.naturalWidth,
                                            naturalHeight: el.naturalHeight,
                                          }
                                        : p
                                    )
                                  )
                                }
                              }}
                            />
                          </div>
                        </div>
                        )}
                      <div className="absolute top-2 left-2 bg-background/85 text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        Page {idx + 1}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 bg-background/90 hover:bg-background"
                          onClick={() => rotate(img.pathname)}
                          aria-label={`Rotate page ${idx + 1}`}
                          disabled={isProcessing}
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPendingDelete(img)}
                          aria-label={`Delete page ${idx + 1}`}
                          disabled={isProcessing}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* ── Right: Tool options ─────────────────────────── */}
            <aside className="lg:col-span-2 bg-card rounded-2xl shadow-md p-6 flex flex-col gap-5 sticky top-6">
              <h2 className="text-base font-semibold">PDF options</h2>

              <OptionGroup label="Orientation">
                <SegmentedControl
                  value={options.orientation}
                  onChange={(v) =>
                    setOptions((o) => ({ ...o, orientation: v as Orientation }))
                  }
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                  disabled={isProcessing}
                />
              </OptionGroup>

              <OptionGroup label="Page size">
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      { value: "fit", label: "Fit to image" },
                      { value: "A4", label: "A4 (297 × 210 mm)" },
                      { value: "letter", label: "US Letter (215 × 279.4 mm)" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setOptions((o) => ({ ...o, pagesize: opt.value }))
                      }
                      disabled={isProcessing}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                        options.pagesize === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </OptionGroup>

              <OptionGroup label="Margin (px)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={options.margin}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      margin: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    }))
                  }
                  disabled={isProcessing}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                />
              </OptionGroup>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.mergeAfter}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, mergeAfter: e.target.checked }))
                  }
                  disabled={isProcessing}
                  className="mt-0.5 rounded"
                />
                <span className="text-sm leading-snug">
                  Merge all images in one PDF file
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Uncheck to download one PDF per page (zipped).
                  </span>
                </span>
              </label>

              <Button
                size="lg"
                className="w-full mt-2"
                onClick={handleSave}
                disabled={images.length === 0 || isProcessing}
              >
                {building ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save to PDF
                  </>
                )}
              </Button>
            </aside>
          </div>
        )}
      </div>

      <ProcessingModal
        open={state.status === "processing"}
        onClose={() => {
          // Backdrop / auto-close — nothing to do here. Cancellation
          // goes through the cancel button rendered inside the modal,
          // which calls `cancel()` directly.
        }}
        toolSlug="scan-to-pdf"
        toolName="Scan to PDF"
        state={state}
        cancel={handleCancel}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Remove this page?"
        description="The page will be deleted from this scan session. This can't be undone."
        confirmLabel="Remove"
        cancelLabel="Keep"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  )
}

// ── Small helpers (kept local to avoid bloating global UI) ─────────

function OptionGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
            value === opt.value
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pr-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="w-28 mx-auto rounded-xl border border-border bg-muted animate-pulse"
          style={{
            aspectRatio: getPreviewAspect(
              DEFAULT_OPTIONS.orientation,
              DEFAULT_OPTIONS.pagesize
            ),
          }}
        />
      ))}
    </ul>
  )
}

function PreviewMessage({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-xl py-12 px-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * Adapts `useTool`'s success state to the existing `DownloadCard`
 * component. Lives here rather than in `DownloadCard.tsx` because the
 * shape of `state` is owned by the hook.
 */
function DownloadCardWrapper({
  state,
  onReset,
}: {
  state: Extract<ReturnType<typeof useTool>["state"], { status: "success" }>
  onReset: () => void
}) {
  return (
    <DownloadCard
      downloadUrl={state.downloadUrl}
      filename={state.filename}
      processingTime={state.processingTime}
      outputSize={state.outputSize}
      onReset={onReset}
    />
  )
}
