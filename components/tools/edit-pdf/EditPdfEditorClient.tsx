"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRightCircle,
  ChevronDown,
  ChevronUp,
  Crown,
  Hand,
  Image as ImageIcon,
  Info,
  ListFilter,
  Loader2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Settings,
  Shapes,
  SquarePen,
  Type,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

// The scale the preview canvas is rasterised at. Annotation coordinates are
// captured in this scaled space, so `handleSave` divides by it to recover PDF
// points (origin = bottom-left).
const RENDER_SCALE = 1.4

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

interface TextAnnotation {
  id: string
  pageIndex: number
  // Coordinates are stored in the RENDER_SCALE canvas space (px, origin = top-left).
  x: number
  y: number
  text: string
  fontSize: number
  width: number
  height: number
}

interface RenderedPage {
  pageIndex: number
  dataUrl: string
  width: number
  height: number
}

interface Props {
  fileUrl: string
  filename: string
}

// The top-toolbar tools. Only "select" (hand) and "text" are wired to real
// behaviour; the rest are visual placeholders that hint at what's coming.
type ToolId = "hand" | "text" | "image" | "draw" | "shape"

type ResizeDirection = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right"

const TOOLBAR_TOOLS: { id: ToolId; label: string; icon: typeof Hand; ready: boolean }[] = [
  { id: "hand", label: "Pan", icon: Hand, ready: true },
  { id: "text", label: "Add text", icon: Type, ready: true },
  { id: "image", label: "Add image", icon: ImageIcon, ready: false },
  { id: "draw", label: "Draw", icon: Pencil, ready: false },
  { id: "shape", label: "Shapes", icon: Shapes, ready: false },
]

export function EditPdfEditorClient({ fileUrl, filename }: Props) {
  const router = useRouter()
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([])
  const [activeTool, setActiveTool] = useState<ToolId>("hand")
  const [draftText, setDraftText] = useState("")
  const [draftPosition, setDraftPosition] = useState<{ pageIndex: number; x: number; y: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [zoomInitialized, setZoomInitialized] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const justCommittedRef = useRef(false)
  const canvasScrollRef = useRef<HTMLDivElement | null>(null)
  // Pan bookkeeping for the hand tool. Stored in a ref so mousemove updates
  // don't re-render the editor on every frame.
  const panStateRef = useRef<{
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
  } | null>(null)
  // Drag bookkeeping for text annotation boxes. Same rationale as
  // panStateRef — a ref keeps the mousemove handler from re-rendering the
  // canvas on every pointer move.
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null)
  const dragStateRef = useRef<{
    annotationId: string
    startMouseX: number
    startMouseY: number
    startAnnotationX: number
    startAnnotationY: number
  } | null>(null)
  const [resizingAnnotationId, setResizingAnnotationId] = useState<string | null>(null)
  const resizeStateRef = useRef<{
    annotationId: string
    direction: ResizeDirection
    startMouseX: number
    startMouseY: number
    startWidth: number
    startHeight: number
    startX: number
    startY: number
  } | null>(null)
  // Set when the user activates the text tool. The placeholder is dropped
  // in a useEffect below so we still insert it if the page wasn't rendered
  // yet at the moment the user clicked the tool.
  const wantPlaceholderRef = useRef(false)
  // Hidden measurement spans — one per annotation. The auto-fit helpers
  // read offsetWidth/offsetHeight to size the wrapper to the text's
  // natural rendered size.
  const measureRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  // Tracks annotation IDs that have already been auto-fit by the initial
  // useLayoutEffect below. After the first auto-fit, the annotation keeps
  // its current size until the user "leaves" it (mouseleave) or finishes
  // resizing (mouseup → fitAnnotationToContent).
  const autoFitDoneRef = useRef<Set<string>>(new Set())
  // pageIndex → the rendered page element, used for scroll-to-page and the
  // visibility observer that drives the current-page indicator.
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const displayScale = zoom / 100

  const setPageRef = useCallback(
    (pageIndex: number) => (el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageIndex, el)
      else pageRefs.current.delete(pageIndex)
    },
    []
  )

  // 1. Download the source PDF from Supabase Storage.
  useEffect(() => {
    if (!fileUrl) return
    let cancelled = false

    async function load() {
      setIsDownloading(true)
      try {
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`)
        const buf = await res.arrayBuffer()
        if (cancelled) return
        setFileBuffer(buf)
      } catch (err) {
        console.error("Failed to load source PDF:", err)
        toast.error(err instanceof Error ? err.message : "Failed to load PDF.")
      } finally {
        if (!cancelled) setIsDownloading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [fileUrl])

  // 2. Render every page to a JPEG dataURL for the in-browser preview.
  useEffect(() => {
    if (!fileBuffer) return
    const sourceBuffer = fileBuffer
    let cancelled = false

    async function render() {
      setIsRendering(true)
      try {
        const pdfjs = await getPdfJs()
        // pdfjs mutates the underlying buffer (it transfers it to a
        // worker) so we hand it a fresh copy each time.
        const copy = sourceBuffer.slice(0)
        const pdf = await pdfjs.getDocument({ data: copy }).promise
        if (cancelled) return
        setPageCount(pdf.numPages)

        const pages: RenderedPage[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: RENDER_SCALE })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (!ctx) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx, viewport } as any).promise
          pages.push({
            pageIndex: i - 1,
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
            width: viewport.width,
            height: viewport.height,
          })
        }
        if (cancelled) return
        setRenderedPages(pages)
      } catch (err) {
        console.error("Failed to render PDF pages:", err)
        toast.error("Failed to render PDF pages.")
      } finally {
        if (!cancelled) setIsRendering(false)
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [fileBuffer])

  const activeRenderedPage = renderedPages.find((p) => p.pageIndex === currentPage - 1)

  // Fit the first rendered page to the available canvas width once.
  useEffect(() => {
    if (zoomInitialized) return
    if (!activeRenderedPage || !canvasScrollRef.current) return
    const available = canvasScrollRef.current.clientWidth - 96 // account for padding
    if (available <= 0) return
    const fit = Math.round((available / activeRenderedPage.width) * 100)
    setZoom(Math.max(25, Math.min(150, fit)))
    setZoomInitialized(true)
  }, [activeRenderedPage, zoomInitialized])

  // Focus the draft input as soon as it appears.
  useEffect(() => {
    if (draftPosition && draftInputRef.current) {
      draftInputRef.current.focus()
    }
  }, [draftPosition])

  // Track which page is most visible in the scroll viewport and reflect it in
  // the page indicator. Uses the page whose center is closest to the viewport
  // center.
  useEffect(() => {
    const scroller = canvasScrollRef.current
    if (!scroller || renderedPages.length === 0) return

    let ticking = false
    const update = () => {
      ticking = false
      const viewportCenter = scroller.scrollTop + scroller.clientHeight / 2
      let bestPage = 1
      let bestDistance = Infinity
      pageRefs.current.forEach((el, pageIndex) => {
        const center = el.offsetTop + el.offsetHeight / 2
        const distance = Math.abs(center - viewportCenter)
        if (distance < bestDistance) {
          bestDistance = distance
          bestPage = pageIndex + 1
        }
      })
      setCurrentPage((prev) => (prev === bestPage ? prev : bestPage))
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    update()
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [renderedPages, displayScale])

  const handlePageClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
      if (activeTool !== "text") return
      if (justCommittedRef.current) {
        justCommittedRef.current = false
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      // The container is displayed at `displayScale`; divide back out to
      // recover coordinates in the RENDER_SCALE canvas space.
      const x = (event.clientX - rect.left) / displayScale
      const y = (event.clientY - rect.top) / displayScale
      setDraftPosition({ pageIndex, x, y })
      setDraftText("")
    },
    [activeTool, displayScale]
  )

  const commitDraft = useCallback(() => {
    if (!draftPosition) return
    justCommittedRef.current = true
    const text = draftText.trim()
    if (text.length === 0) {
      setDraftPosition(null)
      setActiveTool("hand")
      return
    }
    setAnnotations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        pageIndex: draftPosition.pageIndex,
        x: draftPosition.x,
        y: draftPosition.y,
        text,
        fontSize: 16,
        width: 200,
        height: 28,
      },
    ])
    setDraftPosition(null)
    setDraftText("")
    setActiveTool("hand")
  }, [draftPosition, draftText])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Drop a placeholder text box at the center of the current page. Called
  // when the user activates the text tool so they always have something to
  // drag or edit right away.
  const insertPlaceholderAtCenter = useCallback(() => {
    if (!activeRenderedPage) return
    const pageWidth = activeRenderedPage.width
    const pageHeight = activeRenderedPage.height
    setAnnotations((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        pageIndex: currentPage - 1,
        x: pageWidth / 2,
        y: pageHeight / 2,
        text: "Your text",
        fontSize: 16,
        width: 200,
        height: 28,
      },
    ])
  }, [activeRenderedPage, currentPage])

  // Mousedown on an annotation starts a drag. The document-level listeners
  // in the effect below keep the drag alive even if the pointer leaves the
  // page element.
  const handleAnnotationMouseDown = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>, annotation: TextAnnotation) => {
      event.preventDefault()
      event.stopPropagation()
      dragStateRef.current = {
        annotationId: annotation.id,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startAnnotationX: annotation.x,
        startAnnotationY: annotation.y,
      }
      setDraggingAnnotationId(annotation.id)
    },
    []
  )

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent, annotation: TextAnnotation, direction: ResizeDirection) => {
      event.preventDefault()
      event.stopPropagation()
      resizeStateRef.current = {
        annotationId: annotation.id,
        direction,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startWidth: annotation.width,
        startHeight: annotation.height,
        startX: annotation.x,
        startY: annotation.y,
      }
      setResizingAnnotationId(annotation.id)
    },
    []
  )

  // Double-clicking an existing annotation moves it into the draft slot so
  // the user can edit its text in place. On commit the draft becomes a new
  // annotation at the same coordinates.
  const startEditingAnnotation = useCallback(
    (id: string) => {
      const annotation = annotations.find((a) => a.id === id)
      if (!annotation) return
      setActiveTool("text")
      setAnnotations((prev) => prev.filter((a) => a.id !== id))
      setDraftPosition({ pageIndex: annotation.pageIndex, x: annotation.x, y: annotation.y })
      setDraftText(annotation.text)
    },
    [annotations]
  )

  const selectTool = useCallback((tool: (typeof TOOLBAR_TOOLS)[number]) => {
    if (!tool.ready) {
      toast.info(`${tool.label} is coming soon.`)
      return
    }
    setActiveTool(tool.id)
    if (tool.id !== "text") {
      setDraftPosition(null)
      wantPlaceholderRef.current = false
    } else if (activeTool !== "text") {
      // Activating the text tool from another tool queues a placeholder at
      // the center of the current page. The useEffect below drops it as
      // soon as the page is available.
      wantPlaceholderRef.current = true
    }
  }, [activeTool])

  // Drop the queued placeholder as soon as the current page is rendered.
  useEffect(() => {
    if (wantPlaceholderRef.current && activeTool === "text" && activeRenderedPage) {
      insertPlaceholderAtCenter()
      wantPlaceholderRef.current = false
    }
  }, [activeTool, activeRenderedPage, insertPlaceholderAtCenter])

  const changeZoom = useCallback((delta: number) => {
    setZoom((z) => Math.max(25, Math.min(300, z + delta)))
    setZoomInitialized(true)
  }, [])

  // Ctrl + mouse wheel zooming on the canvas. The handler must live on
  // `document` so it fires before the browser's native page-zoom kicks in.
  // We only act when the pointer is inside the canvas scroll container.
  useEffect(() => {
    const scroller = canvasScrollRef.current
    if (!scroller) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      if (!scroller.contains(e.target as Node)) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -10 : 10
      changeZoom(delta)
    }

    document.addEventListener("wheel", onWheel, { passive: false })
    return () => document.removeEventListener("wheel", onWheel)
  }, [changeZoom])

  const fitToWidth = useCallback(() => {
    if (!activeRenderedPage || !canvasScrollRef.current) return
    const available = canvasScrollRef.current.clientWidth - 96
    if (available <= 0) return
    const fit = Math.round((available / activeRenderedPage.width) * 100)
    setZoom(Math.max(25, Math.min(300, fit)))
    setZoomInitialized(true)
  }, [activeRenderedPage])

  const goToPage = useCallback(
    (target: number) => {
      if (pageCount === 0) return
      const clamped = Math.max(1, Math.min(pageCount, target))
      setCurrentPage(clamped)
      setDraftPosition(null)
      const el = pageRefs.current.get(clamped - 1)
      const scroller = canvasScrollRef.current
      if (el && scroller) {
        // Scroll so the target page sits near the top of the viewport.
        scroller.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" })
      }
    },
    [pageCount]
  )

  // Hand tool: mousedown anywhere on the canvas starts a pan; we listen to
  // mousemove/mouseup on the document so the drag survives leaving the canvas.
  const handlePanStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool !== "hand") return
      const scroller = canvasScrollRef.current
      if (!scroller) return
      // Don't start a pan when the click is on an interactive control
      // (annotations' remove button, draft text input, thumbnails, etc.).
      const target = event.target as HTMLElement | null
      if (target?.closest("button, input, textarea, select, a, [role='button']")) {
        return
      }
      event.preventDefault()
      panStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scroller.scrollLeft,
        startScrollTop: scroller.scrollTop,
      }
      setIsPanning(true)
    },
    [activeTool]
  )

  useEffect(() => {
    if (!isPanning) return
    const onMove = (e: MouseEvent) => {
      const scroller = canvasScrollRef.current
      const start = panStateRef.current
      if (!scroller || !start) return
      scroller.scrollLeft = start.startScrollLeft - (e.clientX - start.startX)
      scroller.scrollTop = start.startScrollTop - (e.clientY - start.startY)
    }
    const onUp = () => {
      panStateRef.current = null
      setIsPanning(false)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [isPanning])

  // Document-level tracking for dragging a text annotation. We update React
  // state on every move (only the dragged box's coordinates change) so the
  // move persists after the user releases the mouse.
  useEffect(() => {
    if (!draggingAnnotationId) return
    const onMove = (e: MouseEvent) => {
      const start = dragStateRef.current
      if (!start) return
      // Convert screen-space delta back into RENDER_SCALE canvas space.
      const dx = (e.clientX - start.startMouseX) / displayScale
      const dy = (e.clientY - start.startMouseY) / displayScale
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === start.annotationId
            ? { ...a, x: start.startAnnotationX + dx, y: start.startAnnotationY + dy }
            : a
        )
      )
    }
    const onUp = () => {
      dragStateRef.current = null
      setDraggingAnnotationId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingAnnotationId, displayScale])

  // Document-level tracking for resizing a text annotation.
  useEffect(() => {
    if (!resizingAnnotationId) return
    const onMove = (e: MouseEvent) => {
      const s = resizeStateRef.current
      if (!s) return
      const dx = (e.clientX - s.startMouseX) / displayScale
      const dy = (e.clientY - s.startMouseY) / displayScale
      const dir = s.direction
      const resizesRight = dir === "right" || dir === "top-right" || dir === "bottom-right"
      const resizesLeft = dir === "left" || dir === "top-left" || dir === "bottom-left"
      const resizesBottom = dir === "bottom" || dir === "bottom-left" || dir === "bottom-right"
      const resizesTop = dir === "top" || dir === "top-left" || dir === "top-right"

      let newWidth = s.startWidth
      let newHeight = s.startHeight
      let newX = s.startX
      let newY = s.startY

      if (resizesRight) newWidth = Math.max(40, s.startWidth + dx)
      if (resizesLeft) {
        newWidth = Math.max(40, s.startWidth - dx)
        newX = s.startX + (s.startWidth - newWidth)
      }
      if (resizesBottom) newHeight = Math.max(20, s.startHeight + dy)
      if (resizesTop) {
        newHeight = Math.max(20, s.startHeight - dy)
        newY = s.startY + (s.startHeight - newHeight)
      }

      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === s.annotationId
            ? { ...a, width: newWidth, height: newHeight, x: newX, y: newY }
            : a
        )
      )
    }
    const onUp = () => {
      resizeStateRef.current = null
      setResizingAnnotationId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizingAnnotationId, displayScale])

  // One-time auto-fit for each new annotation. Sets the default size so a
  // freshly-placed box doesn't stay at the 200×28 placeholder dimensions.
  // After this runs the user can freely resize the textbox to any width
  // and height — there is no further auto-fit on mouseleave or resize.
  useLayoutEffect(() => {
    annotations.forEach((annotation) => {
      if (autoFitDoneRef.current.has(annotation.id)) return
      if (resizingAnnotationId === annotation.id) return
      autoFitDoneRef.current.add(annotation.id)
      const el = measureRefs.current.get(annotation.id)
      if (!el) return
      const textWidth = el.offsetWidth
      const textHeight = el.offsetHeight
      // Inner content box: px-1.5 (6px each side) + border (1px each side)
      // → 14px horizontal, 6px vertical, all in displayed space.
      const totalWidth = (textWidth + 14) / displayScale
      const totalHeight = (textHeight + 6) / displayScale
      if (
        Math.abs(totalWidth - annotation.width) > 0.5 ||
        Math.abs(totalHeight - annotation.height) > 0.5
      ) {
        setAnnotations((prev) =>
          prev.map((a) =>
            a.id === annotation.id
              ? { ...a, width: totalWidth, height: totalHeight }
              : a
          )
        )
      }
    })
  }, [annotations, resizingAnnotationId, displayScale])

  const handleSave = useCallback(async () => {
    if (!fileBuffer) return
    const sourceBuffer = fileBuffer
    setIsSaving(true)
    try {
      // pdf-lib can re-parse a buffer it's been handed, but a couple
      // of pdfjs-dist versions share the underlying ArrayBuffer with
      // the worker, so we copy first to be safe.
      const source = sourceBuffer.slice(0)
      const pdfDoc = await PDFDocument.load(source)
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

      for (const annotation of annotations) {
        const pages = pdfDoc.getPages()
        const page = pages[annotation.pageIndex]
        if (!page) continue
        const { height: pageHeight } = page.getSize()
        // Annotations were captured in the RENDER_SCALE coordinate
        // space, so divide by the scale to get PDF points.
        page.drawText(annotation.text, {
          x: annotation.x / RENDER_SCALE,
          y: pageHeight - annotation.y / RENDER_SCALE,
          size: annotation.fontSize,
          font,
          color: rgb(0, 0, 0),
          maxWidth: annotation.width / RENDER_SCALE,
          lineHeight: annotation.fontSize * 1.2,
        })
      }

      const bytes = await pdfDoc.save()
      // `pdf-lib`'s `save()` returns a `Uint8Array<ArrayBufferLike>`,
      // which TS doesn't accept as a `BlobPart` directly. Copy into a
      // fresh `ArrayBuffer` to satisfy the DOM lib types.
      const ab = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(ab).set(bytes)
      const blob = new Blob([ab], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename && filename.length > 0 ? `edited-${filename}` : "edited.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Edited PDF downloaded.")
    } catch (err) {
      console.error("Failed to save edited PDF:", err)
      toast.error(err instanceof Error ? err.message : "Failed to save the edited PDF.")
    } finally {
      setIsSaving(false)
    }
  }, [annotations, fileBuffer, filename])

  // ---- Empty / loading states -------------------------------------------

  if (!fileUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="mb-4 text-base text-muted-foreground">
            No PDF was provided. Head back to the Edit PDF tool to upload a file.
          </p>
          <Button onClick={() => router.push("/tools/edit-pdf")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to upload
          </Button>
        </div>
      </div>
    )
  }

  if (isDownloading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Loading your PDF…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* ── Top toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => router.push("/tools/edit-pdf")}
          aria-label="Back to upload"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="mx-auto flex items-center gap-2 sm:gap-3">
          {/* Annotate / Edit mode toggle */}
          <div className="inline-flex items-center rounded-full border border-border bg-muted/60 p-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm">
              <SquarePen className="h-4 w-4" />
              Annotate
            </span>
            <button
              type="button"
              onClick={() => toast.info("Full editing is a premium feature — coming soon.")}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ListFilter className="h-4 w-4" />
              Edit
              <Crown className="h-3.5 w-3.5 text-amber-500" />
            </button>
          </div>

          <div className="h-7 w-px bg-border" />

          {/* Tool icons */}
          <div className="flex items-center gap-1">
            {TOOLBAR_TOOLS.map((tool) => {
              const ToolIcon = tool.icon
              const isActive = tool.ready && activeTool === tool.id
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => selectTool(tool)}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    !tool.ready && "opacity-70"
                  )}
                >
                  <ToolIcon className="h-5 w-5" />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Body: thumbnails | canvas | panel ───────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left: page thumbnails */}
        <aside className="hidden w-40 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3 sm:flex">
          {renderedPages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : "No pages"}
            </div>
          ) : (
            <div className="space-y-3">
              {renderedPages.map((page) => {
                const isActive = page.pageIndex === currentPage - 1
                return (
                  <button
                    key={page.pageIndex}
                    type="button"
                    onClick={() => goToPage(page.pageIndex + 1)}
                    className="group flex w-full flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        "block w-full overflow-hidden rounded-md border bg-white transition-all",
                        isActive
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border group-hover:border-primary/50"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.dataUrl}
                        alt={`Page ${page.pageIndex + 1}`}
                        className="block h-auto w-full select-none"
                        draggable={false}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {page.pageIndex + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* Center: canvas */}
        <div
          ref={canvasScrollRef}
          onMouseDown={handlePanStart}
          className={cn(
            "relative flex min-w-0 flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900",
            activeTool === "hand" && !isPanning && "cursor-grab",
            activeTool === "hand" && isPanning && "cursor-grabbing",
            activeTool === "text" && "cursor-crosshair"
          )}
        >
          <div className="flex min-h-full w-full flex-col items-center gap-6 p-8 pb-24">
            {isRendering && renderedPages.length === 0 ? (
              <div className="flex min-h-[400px] items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Rendering preview…</p>
              </div>
            ) : renderedPages.length > 0 ? (
              renderedPages.map((page) => {
                const pageAnnotations = annotations.filter((a) => a.pageIndex === page.pageIndex)
                const isDrafting = draftPosition?.pageIndex === page.pageIndex
                return (
                  <div key={page.pageIndex} className="flex flex-col items-center gap-2">
                    <div
                      ref={setPageRef(page.pageIndex)}
                      data-page-index={page.pageIndex}
                      onClick={(e) => handlePageClick(e, page.pageIndex)}
                      className={cn(
                        "relative shrink-0 bg-white shadow-lg ring-1 ring-black/5",
                        activeTool === "text" && "cursor-crosshair",
                        activeTool === "hand" && !isPanning && "cursor-grab",
                        activeTool === "hand" && isPanning && "cursor-grabbing select-none"
                      )}
                      style={{
                        width: page.width * displayScale,
                        height: page.height * displayScale,
                      }}
                    >
                      <Image
                        src={page.dataUrl}
                        alt={`Page ${page.pageIndex + 1}`}
                        width={page.width}
                        height={page.height}
                        className="block h-full w-full select-none"
                        draggable={false}
                        unoptimized
                      />

                      {/* Saved annotations for this page */}
                      {pageAnnotations.map((annotation) => {
                        const isDragging = draggingAnnotationId === annotation.id
                        const hs = 8
                        const hh = hs / 2
                        const handle = (dir: ResizeDirection, cursor: string, pos: React.CSSProperties) => (
                          <span
                            key={dir}
                            className="absolute bg-[#2563eb] border border-white"
                            style={{ width: hs, height: hs, cursor, ...pos }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleResizeMouseDown(e, annotation, dir)
                            }}
                          />
                        )
                        return (
                          <div
                            key={annotation.id}
                            style={{
                              position: "absolute",
                              left: annotation.x * displayScale,
                              top: annotation.y * displayScale,
                              width: annotation.width * displayScale,
                              height: annotation.height * displayScale,
                              cursor: isDragging ? "grabbing" : "move",
                            }}
                            className="group"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleAnnotationMouseDown(e, annotation)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEditingAnnotation(annotation.id)
                            }}
                          >
                            {/* Hidden measurement span — mirrors the visible
                                text's font and wrap rules so offsetWidth /
                                offsetHeight reflect the text's natural
                                rendered size. The auto-fit useLayoutEffect
                                reads these to size the wrapper. */}
                            <span
                              ref={(el) => {
                                if (el) measureRefs.current.set(annotation.id, el)
                                else measureRefs.current.delete(annotation.id)
                              }}
                              style={{
                                position: "absolute",
                                visibility: "hidden",
                                pointerEvents: "none",
                                fontSize: annotation.fontSize * displayScale,
                                fontWeight: 500,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {annotation.text || " "}
                            </span>

                            <div className="relative h-full w-full overflow-hidden border border-[#2563eb] px-1.5 py-0.5">
                              <span
                                className="whitespace-pre-wrap break-words text-left font-medium text-black"
                                style={{ fontSize: annotation.fontSize * displayScale }}
                              >
                                {annotation.text}
                              </span>
                            </div>

                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeAnnotation(annotation.id)
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute -right-2 -top-2 z-10 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label="Remove annotation"
                            >
                              <X className="h-3 w-3" />
                            </button>

                            {/* 8 resize handles */}
                            {handle("top-left", "nwse-resize", { left: -hh, top: -hh })}
                            {handle("top", "ns-resize", { left: "50%", top: -hh, transform: "translateX(-50%)" })}
                            {handle("top-right", "nesw-resize", { right: -hh, top: -hh })}
                            {handle("left", "ew-resize", { left: -hh, top: "50%", transform: "translateY(-50%)" })}
                            {handle("right", "ew-resize", { right: -hh, top: "50%", transform: "translateY(-50%)" })}
                            {handle("bottom-left", "nesw-resize", { left: -hh, bottom: -hh })}
                            {handle("bottom", "ns-resize", { left: "50%", bottom: -hh, transform: "translateX(-50%)" })}
                            {handle("bottom-right", "nwse-resize", { right: -hh, bottom: -hh })}
                          </div>
                        )
                      })}

                      {/* Draft annotation (in-progress text box) */}
                      {isDrafting && draftPosition && (
                        <div
                          style={{
                            position: "absolute",
                            left: draftPosition.x * displayScale,
                            top: draftPosition.y * displayScale,
                          }}
                          className="z-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start gap-1">
                            <textarea
                              ref={draftInputRef}
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault()
                                  commitDraft()
                                }
                              }}
                              onBlur={commitDraft}
                              placeholder="Type here… Esc to confirm"
                              rows={3}
                              className="resize-none rounded border-2 border-primary bg-white/95 px-2 py-1 text-sm text-black shadow outline-none"
                              style={{ minWidth: 180 }}
                            />
                            <Button size="icon" variant="default" onClick={commitDraft} aria-label="Confirm text">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {page.pageIndex + 1} / {pageCount}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
                <p>No preview available.</p>
              </div>
            )}
          </div>

          {/* Text-tool hint */}
          {activeTool === "text" && renderedPages.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-md">
                Drag the text box to move · Double-click to edit · Esc to confirm
              </span>
            </div>
          )}
        </div>

        {/* Right: Edit PDF panel */}
        <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-card">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <h2 className="font-serif text-2xl font-bold text-foreground">Edit PDF</h2>

            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Reorder items to move them to the back or front.</p>
            </div>
          </div>

          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!fileBuffer || isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save changes
                  <ArrowRightCircle className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* Bottom page selector panel — fixed to the viewport so it stays
          visible for every page (and is reachable while scrolling).
          Horizontally centered on the canvas column by offsetting the
          fixed element by the thumbnails' width (left) and the right
          panel's width (right). On small screens the thumbnails hide
          and the toolbar spans the full viewport width. */}
      <div className="pointer-events-none fixed bottom-5 left-0 right-0 z-50 flex justify-center px-4 sm:left-40 sm:right-96">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-zinc-800/95 px-2 py-1.5 text-zinc-100 shadow-xl ring-1 ring-white/10 backdrop-blur">
          <ToolbarIconButton
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            label="Previous page"
          >
            <ChevronUp className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            label="Next page"
          >
            <ChevronDown className="h-4 w-4" />
          </ToolbarIconButton>

          <input
            type="number"
            min={1}
            max={pageCount || 1}
            value={currentPage}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) goToPage(v)
            }}
            className="mx-1 h-7 w-12 rounded-md border border-white/15 bg-white/10 text-center text-sm tabular-nums text-white outline-none focus:border-white/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Page number"
          />
          <span className="pr-1 text-sm text-zinc-400 tabular-nums">/ {pageCount || "—"}</span>

          <span className="mx-1 h-6 w-px bg-white/15" />

          <ToolbarIconButton onClick={() => changeZoom(-10)} disabled={zoom <= 25} label="Zoom out">
            <Minus className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton onClick={() => changeZoom(10)} disabled={zoom >= 300} label="Zoom in">
            <Plus className="h-4 w-4" />
          </ToolbarIconButton>
          <input
            type="number"
            min={25}
            max={300}
            value={zoom}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) setZoom(v)
            }}
            onBlur={(e) => {
              const v = Number(e.target.value)
              setZoom(Number.isNaN(v) ? zoom : Math.max(25, Math.min(300, v)))
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
            className="w-14 rounded-md border border-white/15 bg-white/10 text-center text-sm tabular-nums text-white outline-none focus:border-white/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Zoom percentage"
          />
          <span className="text-sm text-zinc-100">%</span>

          <span className="mx-1 h-6 w-px bg-white/15" />

          <ToolbarIconButton onClick={fitToWidth} label="Fit to width">
            <Maximize2 className="h-4 w-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            onClick={() => toast.info("Viewer settings are coming soon.")}
            label="Settings"
          >
            <Settings className="h-4 w-4" />
          </ToolbarIconButton>
        </div>
      </div>
    </div>
  )
}

// Small dark-toolbar icon button used by the floating zoom/nav control.
function ToolbarIconButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-200 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
