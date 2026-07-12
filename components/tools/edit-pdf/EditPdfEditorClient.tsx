"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ALargeSmall,
  ArrowLeft,
  ArrowRightCircle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Droplet,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Info,
  ListFilter,
  Loader2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Shapes,
  SquarePen,
  Trash2,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PDFDocument, StandardFonts, popGraphicsState, pushGraphicsState, rgb, rotateDegrees, translate } from "pdf-lib"
import { deleteFromStorageBrowser } from "@/lib/supabase-upload"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

// The scale the preview canvas is rasterised at. Annotation coordinates are
// captured in this scaled space, so `handleSave` divides by it to recover PDF
// points (origin = bottom-left).
const RENDER_SCALE = 1.4

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Arial Unicode MS", value: "Arial Unicode MS", css: "'Arial Unicode MS', Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { label: "Courier", value: "Courier", css: "Courier, 'Courier New', monospace" },
  { label: "Comic Sans MS", value: "Comic Sans MS", css: "'Comic Sans MS', 'Comic Sans', cursive" },
  { label: "Times New Roman", value: "Times New Roman", css: "'Times New Roman', Times, serif" },
]

const FONT_SIZES = [4, 6, 8, 10, 12, 14, 18, 24, 36, 48, 64, 72, 96, 144, 192, 200]

const COLOR_PALETTE = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7",
  "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00",
  "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
]

interface TextStyle {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  highlightColor: string
  textAlign: "left" | "center" | "right"
  opacity: number
}

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Arial",
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
  highlightColor: "transparent",
  textAlign: "left",
  opacity: 1,
}

function hexToRgbValues(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ]
}

// Decode a base64 data URL (e.g. "data:image/png;base64,iVBOR…") into a
// raw Uint8Array suitable for passing to pdf-lib's embedPng / embedJpg.
// Throws if the input isn't a recognisable base64 data URL.
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",")
  if (commaIdx === -1) throw new Error("Not a data URL")
  const base64 = dataUrl.slice(commaIdx + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Expand a 3-character hex shorthand to its 6-character form.
// e.g. "abc" -> "aabbcc", "0f0" -> "00ff00". Non-3-character input is
// returned unchanged so this is safe to call on any hex string.
function expandHexShorthand(hex: string): string {
  if (hex.length === 3) {
    return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  return hex
}

function getPdfFontName(fontFamily: string, bold: boolean, italic: boolean): string {
  if (fontFamily === "Times New Roman") {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (fontFamily === "Courier") {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

function getCssFontFamily(fontFamily: string): string {
  return FONT_FAMILIES.find((f) => f.value === fontFamily)?.css ?? "Arial, Helvetica, sans-serif"
}

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
  x: number
  y: number
  text: string
  fontSize: number
  width: number
  height: number
  fontFamily: string
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  highlightColor: string
  textAlign: "left" | "center" | "right"
  opacity: number
}

interface ImageAnnotation {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  src: string
  opacity: number
  // Clockwise rotation applied visually via CSS and on save via pdf-lib graphics state
  rotation: number
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

// Only "hand" and "text" are wired to real behaviour; the rest are placeholders
type ToolId = "hand" | "text" | "image" | "draw" | "shape"

type ResizeDirection = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right"

const TOOLBAR_TOOLS: { id: ToolId; label: string; icon: typeof Hand; ready: boolean }[] = [
  { id: "hand", label: "Pan", icon: Hand, ready: true },
  { id: "text", label: "Add text", icon: Type, ready: true },
  { id: "image", label: "Add image", icon: ImageIcon, ready: true },
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
const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([])
const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [draftText, setDraftText] = useState("")
  const [draftPosition, setDraftPosition] = useState<{ pageIndex: number; x: number; y: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [zoomInitialized, setZoomInitialized] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null)
  const justCommittedRef = useRef(false)
  const canvasScrollRef = useRef<HTMLDivElement | null>(null)
  const panStateRef = useRef<{
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
  } | null>(null)
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null)
  const dragStateRef = useRef<{
    annotationId: string
    startMouseX: number
    startMouseY: number
    startAnnotationX: number
    startAnnotationY: number
  } | null>(null)
  const [resizingAnnotationId, setResizingAnnotationId] = useState<string | null>(null)
  // Pressing Delete while an annotation is selected removes it
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  // The annotation that's currently in inline-edit mode (contentEditable).
  // When set, the visible text span becomes a contentEditable element so
  // the user can type directly inside the textbox instead of a separate
  // draft textarea.
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [hexTextColor, setHexTextColor] = useState(textStyle.color.replace("#", ""))
  const [hexHighlightColor, setHexHighlightColor] = useState(
    textStyle.highlightColor === "transparent" ? "" : textStyle.highlightColor.replace("#", "")
  )
  const subToolbarRef = useRef<HTMLDivElement | null>(null)
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
  // selectedImageId drives the ring + resize handles for image annotations
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null)
  const [resizingImageId, setResizingImageId] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const imageDragStateRef = useRef<{
    annotationId: string
    startMouseX: number
    startMouseY: number
    startAnnotationX: number
    startAnnotationY: number
  } | null>(null)
  const imageResizeStateRef = useRef<{
    annotationId: string
    direction: ResizeDirection
    startMouseX: number
    startMouseY: number
    startWidth: number
    startHeight: number
    startX: number
    startY: number
    aspectRatio: number
  } | null>(null)
  // Queued by the text tool; the placeholder is dropped once the page renders
  const wantPlaceholderRef = useRef(false)
  // Guards the file picker: only an explicit tool-button click pops it,
  // not selecting an existing image (which also sets activeTool="image")
  const wantImagePickerRef = useRef(false)
  // Set while the native file picker is open. We use it to detect
  // "user dismissed the picker without choosing a file" (no onChange
  // fires) and drop the image tool highlight back to its idle state.
  // Cleared on every file selection (onChange) so the focus-event
  // fallback below doesn't deactivate the tool after a successful pick.
  const imagePickerOpenRef = useRef(false)
  // Measurement spans used by auto-fit to read natural text size
  const measureRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  // Used by resize onUp to snap height to wrapped text content
  const visibleTextRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  // Tracks annotation IDs already auto-fit, so it only runs once per annotation
  const autoFitDoneRef = useRef<Set<string>>(new Set())
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  // Tracks how far the current page's center is from the viewport center.
  // The scroll listener uses this to add hysteresis when deciding which
  // page is "current", so the hint doesn't flicker when the viewport
  // center sits between two pages.
  const currentPageDistanceRef = useRef(Infinity)

  const displayScale = zoom / 100

  const activeStyle = useMemo((): TextStyle => {
    if (selectedAnnotationId) {
      const ann = annotations.find((a) => a.id === selectedAnnotationId)
      if (ann) return {
        fontFamily: ann.fontFamily,
        fontSize: ann.fontSize,
        bold: ann.bold,
        italic: ann.italic,
        underline: ann.underline,
        color: ann.color,
        highlightColor: ann.highlightColor,
        textAlign: ann.textAlign,
        opacity: ann.opacity,
      }
    }
    return textStyle
  }, [selectedAnnotationId, annotations, textStyle])

  const updateStyle = useCallback((updates: Partial<TextStyle>) => {
    setTextStyle((prev) => ({ ...prev, ...updates }))
    if (selectedAnnotationId) {
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === selectedAnnotationId ? { ...a, ...updates } : a
        )
      )
    }
  }, [selectedAnnotationId])

  // Mirror of `activeStyle` for the image sub-toolbar. Reads from the
  // currently-selected image (or falls back to sensible defaults while
  // the image tool is active but nothing is selected yet).
  const activeImageStyle = useMemo(() => {
    if (selectedImageId) {
      const img = imageAnnotations.find((a) => a.id === selectedImageId)
      if (img) return { opacity: img.opacity, rotation: img.rotation }
    }
    return { opacity: 1, rotation: 0 }
  }, [selectedImageId, imageAnnotations])

  // Apply a partial style update to the currently selected image.
  // Opacity and rotation are the only fields the sub-toolbar exposes;
  // the position / size / src are mutated by their own handlers.
  const updateImageStyle = useCallback(
    (updates: Partial<{ opacity: number; rotation: number }>) => {
      if (!selectedImageId) return
      setImageAnnotations((prev) =>
        prev.map((a) =>
          a.id === selectedImageId ? { ...a, ...updates } : a
        )
      )
    },
    [selectedImageId]
  )

  // Rotate the selected image by `delta` degrees around its centre.
  // The sub-toolbar calls this with ±45° per click. Because we keep
  // the bounding box anchored to the original (unrotated) image, the
  // visual position only changes for 90° / 270° rotations — other
  // angles keep the bounding box in place and rotate the content
  // within it. The aspect ratio is already captured in the locked
  // width/height so no recomputation is needed.
  const rotateSelectedImage = useCallback(
    (delta: number) => {
      if (!selectedImageId) return
      setImageAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== selectedImageId) return a
          const next = ((a.rotation + delta) % 360 + 360) % 360
          return { ...a, rotation: next }
        })
      )
    },
    [selectedImageId]
  )

  // Apply the current value in the hex text-color input to the active style.
  // Accepts both 3-character shorthand (e.g. "abc") and full 6-character
  // hex codes; shorthand is expanded to its 6-character form so the rest
  // of the pipeline always sees a canonical "#rrggbb" colour.
  const applyTextColor = useCallback(() => {
    if (hexTextColor.length === 3 || hexTextColor.length === 6) {
      const normalized = expandHexShorthand(hexTextColor)
      if (hexTextColor.length === 3) setHexTextColor(normalized)
      updateStyle({ color: `#${normalized}` })
    }
  }, [hexTextColor, updateStyle])

  // Same idea for the highlight colour input. The input may be empty
  // (representing "no highlight") — when it's empty we don't touch the
  // active style so the previous selection is preserved.
  const applyHighlightColor = useCallback(() => {
    if (hexHighlightColor.length === 3 || hexHighlightColor.length === 6) {
      const normalized = expandHexShorthand(hexHighlightColor)
      if (hexHighlightColor.length === 3) setHexHighlightColor(normalized)
      updateStyle({ highlightColor: `#${normalized}` })
    }
  }, [hexHighlightColor, updateStyle])

  const setPageRef = useCallback(
    (pageIndex: number) => (el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageIndex, el)
      else pageRefs.current.delete(pageIndex)
    },
    []
  )

  // 1. Download the source PDF from Supabase Storage, then delete the
  //    remote copy — we only need the in-memory buffer from here on.
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
        deleteFromStorageBrowser(fileUrl)
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

  useEffect(() => {
    if (!openDropdown) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      const panel = subToolbarRef.current?.querySelector(`[data-dropdown="${openDropdown}"]`)
      if (panel && panel.contains(target)) return
      const toggle = subToolbarRef.current?.querySelector(`[data-dropdown-toggle="${openDropdown}"]`)
      if (toggle && toggle.contains(target)) return
      setOpenDropdown(null)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [openDropdown])

  useEffect(() => {
    setHexTextColor(activeStyle.color.replace("#", ""))
  }, [activeStyle.color])

  useEffect(() => {
    setHexHighlightColor(activeStyle.highlightColor === "transparent" ? "" : activeStyle.highlightColor.replace("#", ""))
  }, [activeStyle.highlightColor])

  // Render every page to a JPEG dataURL for the in-browser preview
  useEffect(() => {
    if (!fileBuffer) return
    const sourceBuffer = fileBuffer
    let cancelled = false

    async function render() {
      setIsRendering(true)
      try {
        const pdfjs = await getPdfJs()
        // pdfjs transfers the buffer to a worker, so slice to keep a copy
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

  useEffect(() => {
    if (zoomInitialized) return
    if (!activeRenderedPage || !canvasScrollRef.current) return
    const available = canvasScrollRef.current.clientWidth - 96 // account for padding
    if (available <= 0) return
    const fit = Math.round((available / activeRenderedPage.width) * 100)
    setZoom(Math.max(25, Math.min(150, fit)))
    setZoomInitialized(true)
  }, [activeRenderedPage, zoomInitialized])

  useEffect(() => {
    if (draftPosition && draftInputRef.current) {
      draftInputRef.current.focus()
      draftInputRef.current.select()
    }
  }, [draftPosition])

  useEffect(() => {
    if (!editingAnnotationId) return
    // Defer to next frame so the contentEditable element is mounted
    const raf = requestAnimationFrame(() => {
      const el = visibleTextRefs.current.get(editingAnnotationId)
      if (!el) return
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [editingAnnotationId])

  // Track which page is closest to the viewport center for the page indicator
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
      // Hysteresis: only switch `currentPage` to a neighbouring page when
      // it is meaningfully closer than the current one. Without this, the
      // page whose center sits nearest to the viewport center flips back
      // and forth at the midpoint between two pages, which makes the
      // text-tool hint flicker.
      const HYSTERESIS_PX = 80
      const prevDistance = currentPageDistanceRef.current
      setCurrentPage((prev) => {
        if (prev === bestPage) {
          currentPageDistanceRef.current = bestDistance
          return prev
        }
        if (bestDistance + HYSTERESIS_PX < prevDistance) {
          currentPageDistanceRef.current = bestDistance
          return bestPage
        }
        return prev
      })
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

  // Deselects the active annotation. Deactivates the active tool only
  // when something was actually selected (so pan/text tools stay active).
  const handleCanvasDeselect = useCallback(() => {
    setSelectedAnnotationId(null)
    setSelectedImageId(null)
    setEditingAnnotationId(null)
    if (selectedAnnotationId || selectedImageId) {
      setActiveTool(null)
    }
    window.getSelection()?.removeAllRanges()
  }, [selectedAnnotationId, selectedImageId])

  const commitDraft = useCallback(() => {
    if (!draftPosition) return
    justCommittedRef.current = true
    const text = draftText.trim()
    if (text.length === 0) {
      setDraftPosition(null)
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
        fontSize: textStyle.fontSize,
        width: 200,
        height: 28,
        fontFamily: textStyle.fontFamily,
        bold: textStyle.bold,
        italic: textStyle.italic,
        underline: textStyle.underline,
        color: textStyle.color,
        highlightColor: textStyle.highlightColor,
        textAlign: textStyle.textAlign,
        opacity: textStyle.opacity,
      },
    ])
    setDraftPosition(null)
    setDraftText("")
  }, [draftPosition, draftText, textStyle])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setSelectedAnnotationId((current) => (current === id ? null : current))
    setActiveTool(null)
  }, [])

  const removeImageAnnotation = useCallback((id: string) => {
    setImageAnnotations((prev) => prev.filter((a) => a.id !== id))
    setSelectedImageId((current) => (current === id ? null : current))
    setActiveTool(null)
  }, [])

  // Drop a chosen image at the center of the current page, width clamped to half the page
  const handleImageFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Reset so picking the same file still triggers onChange
      event.target.value = ""
      // A file was actually chosen — clear the "picker is open" flag so
      // the focus-event fallback below doesn't treat this as a
      // cancellation and deactivate the image tool.
      imagePickerOpenRef.current = false
      if (!file) return
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file (PNG or JPG).")
        return
      }
      if (!activeRenderedPage) return
      const reader = new FileReader()
      reader.onload = () => {
        const src = reader.result as string
        const img = new window.Image()
        img.onload = () => {
          const pageWidth = activeRenderedPage.width
          const pageHeight = activeRenderedPage.height
          const maxWidth = pageWidth * 0.5
          const aspectRatio =
            img.naturalHeight === 0 ? 1 : img.naturalWidth / img.naturalHeight
          let width = img.naturalWidth
          let height = img.naturalHeight
          if (width > maxWidth) {
            width = maxWidth
            height = width / aspectRatio
          }
          const newId = crypto.randomUUID()
          setImageAnnotations((prev) => [
            ...prev,
            {
              id: newId,
              pageIndex: currentPage - 1,
              x: pageWidth / 2 - width / 2,
              y: pageHeight / 2 - height / 2,
              width,
              height,
              src,
              opacity: 1,
              rotation: 0,
            },
          ])
          setSelectedImageId(newId)
        }
        img.src = src
      }
      reader.readAsDataURL(file)
    },
    [activeRenderedPage, currentPage]
  )

  // Start image annotation drag
  const handleImageMouseDown = useCallback(
    (event: React.MouseEvent, annotation: ImageAnnotation) => {
      event.preventDefault()
      event.stopPropagation()
      imageDragStateRef.current = {
        annotationId: annotation.id,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startAnnotationX: annotation.x,
        startAnnotationY: annotation.y,
      }
      setDraggingImageId(annotation.id)
    },
    []
  )

  // Image resize — aspect ratio locked at mousedown
  const handleImageResizeMouseDown = useCallback(
    (
      event: React.MouseEvent,
      annotation: ImageAnnotation,
      direction: ResizeDirection
    ) => {
      event.preventDefault()
      event.stopPropagation()
      imageResizeStateRef.current = {
        annotationId: annotation.id,
        direction,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startWidth: annotation.width,
        startHeight: annotation.height,
        startX: annotation.x,
        startY: annotation.y,
        aspectRatio:
          annotation.height === 0 ? 1 : annotation.width / annotation.height,
      }
      setResizingImageId(annotation.id)
    },
    []
  )

  // Drop a text placeholder — auto-selected and in inline-edit mode
  const insertPlaceholderAtCenter = useCallback(() => {
    if (!activeRenderedPage) return
    const pageWidth = activeRenderedPage.width
    const pageHeight = activeRenderedPage.height
    const newId = crypto.randomUUID()
    setAnnotations((prev) => [
      ...prev,
      {
        id: newId,
        pageIndex: currentPage - 1,
        x: pageWidth / 2,
        y: pageHeight / 2,
        text: "Your text",
        fontSize: textStyle.fontSize,
        width: 200,
        height: 28,
        fontFamily: textStyle.fontFamily,
        bold: textStyle.bold,
        italic: textStyle.italic,
        underline: textStyle.underline,
        color: textStyle.color,
        highlightColor: textStyle.highlightColor,
        textAlign: textStyle.textAlign,
        opacity: textStyle.opacity,
      },
    ])
    setSelectedAnnotationId(newId)
    setEditingAnnotationId(newId)
  }, [activeRenderedPage, currentPage, textStyle])

  // Start text annotation drag
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

  // Double-click enters inline-edit mode
  const startEditingAnnotation = useCallback(
    (id: string) => {
      setSelectedAnnotationId(id)
      setEditingAnnotationId(id)
    },
    []
  )

  const selectTool = useCallback((tool: (typeof TOOLBAR_TOOLS)[number]) => {
    if (!tool.ready) {
      toast.info(`${tool.label} is coming soon.`)
      return
    }
    if (activeTool === tool.id) {
      setActiveTool(null)
      setDraftPosition(null)
      wantPlaceholderRef.current = false
      wantImagePickerRef.current = false
      return
    }
    setActiveTool(tool.id)
    if (tool.id === "image") {
      wantImagePickerRef.current = true
      setDraftPosition(null)
      wantPlaceholderRef.current = false
    } else if (tool.id !== "text") {
      setDraftPosition(null)
      wantPlaceholderRef.current = false
      wantImagePickerRef.current = false
    } else if (activeTool !== "text") {
      wantPlaceholderRef.current = true
      wantImagePickerRef.current = false
    }
  }, [activeTool])

  // Drop the queued placeholder once the current page is rendered
  useEffect(() => {
    if (wantPlaceholderRef.current && activeTool === "text" && activeRenderedPage) {
      insertPlaceholderAtCenter()
      wantPlaceholderRef.current = false
    }
  }, [activeTool, activeRenderedPage, insertPlaceholderAtCenter])

  // Open the file picker only on explicit tool-button click (ref guard).
  // We also flip `imagePickerOpenRef` so the cancel / focus listeners
  // (set up below) can tell "picker is currently open" from "tool is
  // just active because the user picked a file and is now tweaking it".
  useEffect(() => {
    if (!wantImagePickerRef.current || activeTool !== "image") return
    wantImagePickerRef.current = false
    imagePickerOpenRef.current = true
    const t = setTimeout(() => imageInputRef.current?.click(), 0)
    return () => clearTimeout(t)
  }, [activeTool])

  // Detect "user dismissed the file picker without picking a file" and
  // return the toolbar to its idle state. Two paths cover the cases:
  //
  //   1. The `cancel` event fires natively on the file input in modern
  //      browsers (Chrome 113+, Firefox 91+, Safari 16.4+).
  //   2. As a fallback, the window receives `focus` again whenever the
  //      picker closes — selected or not. We check `imagePickerOpenRef`
  //      to see whether the close was a cancellation (still set) or a
  //      successful pick (cleared by `handleImageFileChange`).
  useEffect(() => {
    const input = imageInputRef.current
    if (!input) return

    const handleCancel = () => {
      if (!imagePickerOpenRef.current) return
      imagePickerOpenRef.current = false
      // Only deactivate the image tool; the user may have selected
      // text or another tool we shouldn't touch.
      setActiveTool((current) => (current === "image" ? null : current))
    }
    const handleWindowFocus = () => {
      // Small delay: some browsers report focus before the change
      // event when a file is selected, so we wait a tick and let
      // handleImageFileChange clear the flag first.
      setTimeout(handleCancel, 0)
    }

    input.addEventListener("cancel", handleCancel)
    window.addEventListener("focus", handleWindowFocus)
    return () => {
      input.removeEventListener("cancel", handleCancel)
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [])

  const changeZoom = useCallback((delta: number) => {
    setZoom((z) => Math.max(25, Math.min(300, z + delta)))
    setZoomInitialized(true)
  }, [])

  // Ctrl + mouse wheel zoom on the canvas
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const scroller = canvasScrollRef.current
      if (!scroller || !scroller.contains(e.target as Node)) return
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

  // Start pan for hand tool
  const handlePanStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool !== "hand") return
      const scroller = canvasScrollRef.current
      if (!scroller) return
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

  // Document-level text annotation drag
  useEffect(() => {
    if (!draggingAnnotationId) return
    const onMove = (e: MouseEvent) => {
      const start = dragStateRef.current
      if (!start) return
      // Convert screen-space delta to canvas space
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

  // Document-level text annotation resize
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
      const s = resizeStateRef.current
      resizeStateRef.current = null
      setResizingAnnotationId(null)
      if (s) {
        const el = visibleTextRefs.current.get(s.annotationId)
        if (el) {
          const textHeight = el.offsetHeight
          // py-0.5 (2px each side) + border (1px) = 6px vertical padding
          const totalHeight = (textHeight + 6) / displayScale
          setAnnotations((prev) =>
            prev.map((a) =>
              a.id === s.annotationId ? { ...a, height: totalHeight } : a
            )
          )
        }
      }
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizingAnnotationId, displayScale])

  // Document-level image annotation drag
  useEffect(() => {
    if (!draggingImageId) return
    const onMove = (e: MouseEvent) => {
      const start = imageDragStateRef.current
      if (!start) return
      const dx = (e.clientX - start.startMouseX) / displayScale
      const dy = (e.clientY - start.startMouseY) / displayScale
      setImageAnnotations((prev) =>
        prev.map((a) =>
          a.id === start.annotationId
            ? { ...a, x: start.startAnnotationX + dx, y: start.startAnnotationY + dy }
            : a
        )
      )
    }
    const onUp = () => {
      imageDragStateRef.current = null
      setDraggingImageId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingImageId, displayScale])

  // Document-level image annotation resize — locked aspect ratio
  useEffect(() => {
    if (!resizingImageId) return
    const onMove = (e: MouseEvent) => {
      const s = imageResizeStateRef.current
      if (!s) return
      const dx = (e.clientX - s.startMouseX) / displayScale
      const dy = (e.clientY - s.startMouseY) / displayScale
      const dir = s.direction
      const resizesRight = dir === "right" || dir === "top-right" || dir === "bottom-right"
      const resizesLeft = dir === "left" || dir === "top-left" || dir === "bottom-left"
      const resizesBottom = dir === "bottom" || dir === "bottom-left" || dir === "bottom-right"
      const resizesTop = dir === "top" || dir === "top-left" || dir === "top-right"

      // Derive the other dimension from the locked aspect ratio
      let newWidth = s.startWidth
      let newHeight = s.startHeight
      let newX = s.startX
      let newY = s.startY
      const aspectRatio = s.aspectRatio

      if (resizesRight) {
        newWidth = Math.max(20, s.startWidth + dx)
        newHeight = newWidth / aspectRatio
      } else if (resizesLeft) {
        newWidth = Math.max(20, s.startWidth - dx)
        newHeight = newWidth / aspectRatio
        newX = s.startX + (s.startWidth - newWidth)
      } else if (resizesBottom) {
        newHeight = Math.max(20, s.startHeight + dy)
        newWidth = newHeight * aspectRatio
      } else if (resizesTop) {
        newHeight = Math.max(20, s.startHeight - dy)
        newWidth = newHeight * aspectRatio
        newY = s.startY + (s.startHeight - newHeight)
      }

      setImageAnnotations((prev) =>
        prev.map((a) =>
          a.id === s.annotationId
            ? { ...a, width: newWidth, height: newHeight, x: newX, y: newY }
            : a
        )
      )
    }
    const onUp = () => {
      imageResizeStateRef.current = null
      setResizingImageId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizingImageId, displayScale])

  // Delete key removes the selected annotation; skipped in inputs/textareas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return
      const textId = selectedAnnotationId
      const imageId = selectedImageId
      if (!textId && !imageId) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return
      }
      e.preventDefault()
      if (textId) removeAnnotation(textId)
      if (imageId) removeImageAnnotation(imageId)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedAnnotationId, selectedImageId, removeAnnotation, removeImageAnnotation])

  // One-time auto-fit for new annotations so they don't stay at placeholder size
  useLayoutEffect(() => {
    annotations.forEach((annotation) => {
      if (autoFitDoneRef.current.has(annotation.id)) return
      if (resizingAnnotationId === annotation.id) return
      if (annotation.text === "") return
      autoFitDoneRef.current.add(annotation.id)
      const el = measureRefs.current.get(annotation.id)
      if (!el) return
      const textWidth = el.offsetWidth
      const textHeight = el.offsetHeight
      // px-1.5 (6px each side) + border (1px) = 14px / 6px padding
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
      // Copy in case pdfjs shares the underlying ArrayBuffer with a worker
      const source = sourceBuffer.slice(0)
      const pdfDoc = await PDFDocument.load(source)

      const embeddedFonts = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>>()
      for (const annotation of annotations) {
        const fontName = getPdfFontName(annotation.fontFamily, annotation.bold, annotation.italic)
        if (!embeddedFonts.has(fontName)) {
          embeddedFonts.set(fontName, await pdfDoc.embedFont(fontName))
        }
      }

      // Cache embedded images by data URL so duplicates aren't re-decoded
      const embeddedImages = new Map<
        string,
        Awaited<ReturnType<typeof pdfDoc.embedPng>>
      >()
      for (const annotation of imageAnnotations) {
        if (embeddedImages.has(annotation.src)) continue
        try {
          const bytes = dataUrlToBytes(annotation.src)
          const image =
            annotation.src.startsWith("data:image/png")
              ? await pdfDoc.embedPng(bytes)
              : await pdfDoc.embedJpg(bytes)
          embeddedImages.set(annotation.src, image)
        } catch (err) {
          console.error("Failed to embed image:", err)
        }
      }

      const pages = pdfDoc.getPages()

      for (const annotation of annotations) {
        const page = pages[annotation.pageIndex]
        if (!page) continue
        const { height: pageHeight } = page.getSize()
        const fontName = getPdfFontName(annotation.fontFamily, annotation.bold, annotation.italic)
        const font = embeddedFonts.get(fontName)!
        const [cr, cg, cb] = hexToRgbValues(annotation.color)
        const pdfX = annotation.x / RENDER_SCALE
        const pdfY = pageHeight - annotation.y / RENDER_SCALE
        const pdfWidth = annotation.width / RENDER_SCALE
        const pdfHeight = annotation.height / RENDER_SCALE

        if (annotation.highlightColor !== "transparent") {
          const [hr, hg, hb] = hexToRgbValues(annotation.highlightColor)
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfHeight,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(hr, hg, hb),
          })
        }

        page.drawText(annotation.text, {
          x: pdfX,
          y: pdfY,
          size: annotation.fontSize,
          font,
          color: rgb(cr, cg, cb),
          maxWidth: pdfWidth,
          lineHeight: annotation.fontSize * 1.2,
          opacity: annotation.opacity,
        })

        if (annotation.underline) {
          const textWidth = font.widthOfTextAtSize(annotation.text, annotation.fontSize)
          const effectiveWidth = Math.min(textWidth, pdfWidth)
          page.drawLine({
            start: { x: pdfX, y: pdfY - 2 },
            end: { x: pdfX + effectiveWidth, y: pdfY - 2 },
            thickness: 0.5,
            color: rgb(cr, cg, cb),
            opacity: annotation.opacity,
          })
        }
      }

      for (const annotation of imageAnnotations) {
        const embedded = embeddedImages.get(annotation.src)
        if (!embedded) continue
        const page = pages[annotation.pageIndex]
        if (!page) continue
        const { height: pageHeight } = page.getSize()
        const pdfX = annotation.x / RENDER_SCALE
        const pdfY = pageHeight - (annotation.y + annotation.height) / RENDER_SCALE
        const pdfWidth = annotation.width / RENDER_SCALE
        const pdfHeight = annotation.height / RENDER_SCALE

        const drawOptions = {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
          opacity: annotation.opacity,
        }

        if (annotation.rotation !== 0) {
          // Negate for pdf-lib's CCW rotation to match the editor's CW display
          const cx = pdfX + pdfWidth / 2
          const cy = pdfY + pdfHeight / 2
          page.pushOperators(
            pushGraphicsState(),
            translate(cx, cy),
            rotateDegrees(-annotation.rotation),
            translate(-cx, -cy)
          )
          page.drawImage(embedded, drawOptions)
          page.pushOperators(popGraphicsState())
        } else {
          page.drawImage(embedded, drawOptions)
        }
      }

      const bytes = await pdfDoc.save()
      // pdf-lib's save() returns Uint8Array<ArrayBufferLike>; copy to satisfy BlobPart types
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
  }, [annotations, imageAnnotations, fileBuffer, filename])

  // Empty / loading states

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
          {/* Annotate / Edit mode */}
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

      {/* ── Text sub-toolbar ───────────────────────────────────────── */}
      {activeTool === "text" && (
        <div
          ref={subToolbarRef}
          className="relative z-30 flex items-center justify-center gap-1.5 border-b border-border bg-card px-3 py-1.5 sm:pl-40 sm:pr-96"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-base font-bold text-foreground">
            T
          </span>


          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="font"
              onClick={() => setOpenDropdown(openDropdown === "font" ? null : "font")}
              className="flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-sm text-foreground hover:bg-accent"
              style={{ minWidth: 130 }}
            >
              <span className="flex-1 text-left" style={{ fontFamily: getCssFontFamily(activeStyle.fontFamily) }}>
                {activeStyle.fontFamily}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
            {openDropdown === "font" && (
              <div data-dropdown="font" className="absolute left-0 top-full z-50 mt-1 min-w-[170px] rounded-md border border-border bg-popover p-1 shadow-lg">
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { updateStyle({ fontFamily: f.value }); setOpenDropdown(null) }}
                    className={cn(
                      "flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-accent",
                      activeStyle.fontFamily === f.value && "bg-accent font-medium"
                    )}
                    style={{ fontFamily: f.css }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>


          <ALargeSmall className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="size"
              onClick={() => setOpenDropdown(openDropdown === "size" ? null : "size")}
              className="flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
              style={{ minWidth: 56 }}
            >
              <span>{activeStyle.fontSize}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
            {openDropdown === "size" && (
              <div data-dropdown="size" className="absolute left-0 top-full z-50 mt-1 max-h-52 min-w-[68px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                {FONT_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { updateStyle({ fontSize: s }); setOpenDropdown(null) }}
                    className={cn(
                      "flex w-full items-center rounded px-2 py-1 text-sm tabular-nums hover:bg-accent",
                      activeStyle.fontSize === s && "bg-accent font-medium"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />


          <button
            type="button"
            onClick={() => updateStyle({ bold: !activeStyle.bold })}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm font-bold transition-colors",
              activeStyle.bold
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            title="Bold"
          >
            B
          </button>

          <button
            type="button"
            onClick={() => updateStyle({ italic: !activeStyle.italic })}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm italic transition-colors",
              activeStyle.italic
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            title="Italic"
          >
            I
          </button>

          <button
            type="button"
            onClick={() => updateStyle({ underline: !activeStyle.underline })}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm underline transition-colors",
              activeStyle.underline
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            title="Underline"
          >
            U
          </button>

          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="textColor"
              onClick={() => setOpenDropdown(openDropdown === "textColor" ? null : "textColor")}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Text color"
            >
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold leading-tight">A</span>
                <span className="-mt-0.5 block h-[3px] w-4 rounded-sm" style={{ backgroundColor: activeStyle.color }} />
              </div>
            </button>
            {openDropdown === "textColor" && (
              <div data-dropdown="textColor" className="absolute left-0 top-full z-50 mt-1 w-[178px] rounded-md border border-border bg-popover p-2 shadow-lg">
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateStyle({ color: c }); setOpenDropdown(null) }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                        activeStyle.color.toLowerCase() === c.toLowerCase()
                          ? "border-primary ring-2 ring-primary/30"
                          : c === "#ffffff" ? "border-border" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {activeStyle.color.toLowerCase() === c.toLowerCase() && (
                        <Check className={cn("h-3.5 w-3.5", c === "#ffffff" || c === "#f3f3f3" || c === "#efefef" || c === "#ffff00" || c === "#00ff00" || c === "#00ffff" ? "text-gray-800" : "text-white")} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={hexTextColor}
                    placeholder="000000"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      setHexTextColor(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyTextColor()
                      }
                    }}
                    onBlur={() => {
                      if (hexTextColor.length !== 3 && hexTextColor.length !== 6) {
                        setHexTextColor(activeStyle.color.replace("#", ""))
                      }
                    }}
                    className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    maxLength={6}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={applyTextColor}
                    disabled={hexTextColor.length !== 3 && hexTextColor.length !== 6}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Apply color"
                    aria-label="Apply color"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: hexTextColor.length === 3 || hexTextColor.length === 6 ? `#${expandHexShorthand(hexTextColor)}` : activeStyle.color }} />
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="highlightColor"
              onClick={() => setOpenDropdown(openDropdown === "highlightColor" ? null : "highlightColor")}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Highlight color"
            >
              <div className="flex flex-col items-center">
                <Highlighter className="h-4 w-4" />
                <span
                  className="-mt-0.5 block h-[3px] w-4 rounded-sm"
                  style={{
                    backgroundColor: activeStyle.highlightColor === "transparent" ? "currentColor" : activeStyle.highlightColor,
                  }}
                />
              </div>
            </button>
            {openDropdown === "highlightColor" && (
              <div data-dropdown="highlightColor" className="absolute left-0 top-full z-50 mt-1 w-[178px] rounded-md border border-border bg-popover p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => { updateStyle({ highlightColor: "transparent" }); setOpenDropdown(null) }}
                  className={cn(
                    "mb-1.5 flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-accent",
                    activeStyle.highlightColor === "transparent" && "bg-accent font-medium"
                  )}
                >
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                  No highlight
                </button>
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateStyle({ highlightColor: c }); setOpenDropdown(null) }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                        activeStyle.highlightColor.toLowerCase() === c.toLowerCase()
                          ? "border-primary ring-2 ring-primary/30"
                          : c === "#ffffff" ? "border-border" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {activeStyle.highlightColor.toLowerCase() === c.toLowerCase() && (
                        <Check className={cn("h-3.5 w-3.5", c === "#ffffff" || c === "#f3f3f3" || c === "#efefef" || c === "#ffff00" || c === "#00ff00" || c === "#00ffff" ? "text-gray-800" : "text-white")} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={hexHighlightColor}
                    placeholder="custom"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      setHexHighlightColor(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyHighlightColor()
                      }
                    }}
                    onBlur={() => {
                      if (hexHighlightColor.length !== 3 && hexHighlightColor.length !== 6) {
                        setHexHighlightColor(activeStyle.highlightColor === "transparent" ? "" : activeStyle.highlightColor.replace("#", ""))
                      }
                    }}
                    className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    maxLength={6}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={applyHighlightColor}
                    disabled={hexHighlightColor.length !== 3 && hexHighlightColor.length !== 6}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Apply color"
                    aria-label="Apply color"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className="h-6 w-6 shrink-0 rounded border border-border"
                    style={{ backgroundColor: hexHighlightColor.length === 3 || hexHighlightColor.length === 6 ? `#${expandHexShorthand(hexHighlightColor)}` : activeStyle.highlightColor === "transparent" ? "transparent" : activeStyle.highlightColor }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />


          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="align"
              onClick={() => setOpenDropdown(openDropdown === "align" ? null : "align")}
              className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Text alignment"
            >
              {activeStyle.textAlign === "center" ? (
                <AlignCenter className="h-4 w-4" />
              ) : activeStyle.textAlign === "right" ? (
                <AlignRight className="h-4 w-4" />
              ) : (
                <AlignLeft className="h-4 w-4" />
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {openDropdown === "align" && (
              <div data-dropdown="align" className="absolute left-0 top-full z-50 mt-1 rounded-md border border-border bg-popover p-1 shadow-lg">
                {([
                  { value: "left" as const, icon: AlignLeft, label: "Left" },
                  { value: "center" as const, icon: AlignCenter, label: "Center" },
                  { value: "right" as const, icon: AlignRight, label: "Right" },
                ]).map((a) => {
                  const AlignIcon = a.icon
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => { updateStyle({ textAlign: a.value }); setOpenDropdown(null) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                        activeStyle.textAlign === a.value && "bg-accent font-medium"
                      )}
                    >
                      <AlignIcon className="h-4 w-4" />
                      {a.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />


          <div className="flex items-center gap-1.5">
            <Droplet
              className="h-4 w-4 shrink-0 text-muted-foreground"
              style={{ opacity: activeStyle.opacity }}
              aria-hidden
            />
            <div className="relative">
              <button
                type="button"
                data-dropdown-toggle="subOpacity"
                onClick={() => setOpenDropdown(openDropdown === "subOpacity" ? null : "subOpacity")}
                className="flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
                style={{ minWidth: 60 }}
                title="Opacity"
              >
                <span>{Math.round(activeStyle.opacity * 100)}%</span>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
              {openDropdown === "subOpacity" && (
                <div data-dropdown="subOpacity" className="absolute left-0 top-full z-50 mt-1 min-w-[80px] rounded-md border border-border bg-popover p-1 shadow-lg">
                  {[1, 0.75, 0.5, 0.25, 0].map((o) => {
                    const pct = Math.round(o * 100)
                    const isActive = Math.abs(activeStyle.opacity - o) < 0.001
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => { updateStyle({ opacity: o }); setOpenDropdown(null) }}
                        className={cn(
                          "flex w-full items-center rounded px-2 py-1 text-sm tabular-nums hover:bg-accent",
                          isActive && "bg-accent font-medium"
                        )}
                      >
                        {pct}%
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />


          <button
            type="button"
            onClick={() => {
              if (selectedAnnotationId) removeAnnotation(selectedAnnotationId)
              if (selectedImageId) removeImageAnnotation(selectedImageId)
            }}
            disabled={!selectedAnnotationId && !selectedImageId}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            title="Delete selected"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Image sub-toolbar ──────────────────────────────────────── */}
      {activeTool === "image" && selectedImageId && (
        <div
          ref={subToolbarRef}
          className="relative z-30 flex items-center justify-center gap-1.5 border-b border-border bg-card px-3 py-1.5 sm:pl-40 sm:pr-96"
        >
          <div className="flex items-center gap-1.5">
            <Droplet
              className="h-4 w-4 shrink-0 text-muted-foreground"
              style={{ opacity: activeImageStyle.opacity }}
              aria-hidden
            />
          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="imgOpacity"
              onClick={() => setOpenDropdown(openDropdown === "imgOpacity" ? null : "imgOpacity")}
              className="flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
              style={{ minWidth: 64 }}
              title="Opacity"
            >
              <span>{Math.round(activeImageStyle.opacity * 100)}%</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
            {openDropdown === "imgOpacity" && (
              <div data-dropdown="imgOpacity" className="absolute left-0 top-full z-50 mt-1 min-w-[80px] rounded-md border border-border bg-popover p-1 shadow-lg">
                {[1, 0.75, 0.5, 0.25, 0].map((o) => {
                  const pct = Math.round(o * 100)
                  const isActive = Math.abs(activeImageStyle.opacity - o) < 0.001
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => { updateImageStyle({ opacity: o }); setOpenDropdown(null) }}
                      className={cn(
                        "flex w-full items-center rounded px-2 py-1 text-sm tabular-nums hover:bg-accent",
                        isActive && "bg-accent font-medium"
                      )}
                    >
                      {pct}%
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => rotateSelectedImage(-45)}
            disabled={!selectedImageId}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate left 45°"
            aria-label="Rotate left 45°"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rotateSelectedImage(45)}
            disabled={!selectedImageId}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate right 45°"
            aria-label="Rotate right 45°"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => {
              if (selectedImageId) removeImageAnnotation(selectedImageId)
            }}
            disabled={!selectedImageId}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            title="Delete image"
            aria-label="Delete image"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hidden file input — .click() is triggered by the image tool activation. The
          actual cancellation handling is wired up in a useEffect below via a
          native `cancel` event listener (React's input prop types don't expose
          `onCancel`). A focus-event fallback also runs so older browsers that
          don't fire `cancel` still deactivate the tool when the picker closes
          without a file being chosen. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
        aria-hidden
      />


      <div className="flex min-h-0 flex-1">

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


        <div
          ref={canvasScrollRef}
          onMouseDown={handlePanStart}
          onClick={handleCanvasDeselect}
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
                const pageImageAnnotations = imageAnnotations.filter((a) => a.pageIndex === page.pageIndex)
                const isDrafting = draftPosition?.pageIndex === page.pageIndex
                return (
                  <div key={page.pageIndex} className="flex flex-col items-center gap-2">
                    <div
                      ref={setPageRef(page.pageIndex)}
                      data-page-index={page.pageIndex}
                      onClick={handleCanvasDeselect}
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

  
                      {pageAnnotations.map((annotation) => {
                        const isDragging = draggingAnnotationId === annotation.id
                        const isSelected = selectedAnnotationId === annotation.id
                        const isEditing = editingAnnotationId === annotation.id
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
                            className={cn(
                              "group hover:ring-2 hover:ring-primary hover:ring-offset-1",
                              isSelected && "ring-2 ring-primary ring-offset-1"
                            )}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleAnnotationMouseDown(e, annotation)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedAnnotationId(annotation.id)
                              // Activate text tool so the sub-toolbar reflects the selection
                              setActiveTool("text")
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEditingAnnotation(annotation.id)
                            }}
                          >
                            {/* Hidden measurement span for auto-fit sizing */}
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
                                fontFamily: getCssFontFamily(annotation.fontFamily),
                                fontWeight: annotation.bold ? 700 : 400,
                                fontStyle: annotation.italic ? "italic" : "normal",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {annotation.text || " "}
                            </span>

                            <div
                              className={cn(
                                "relative h-full w-full px-1.5 py-0.5",
                                isEditing ? "overflow-visible border-2 border-primary" : "overflow-hidden"
                              )}
                              style={{ textAlign: annotation.textAlign }}
                            >
                              <span
                                ref={(el) => {
                                  if (el) visibleTextRefs.current.set(annotation.id, el)
                                  else visibleTextRefs.current.delete(annotation.id)
                                }}
                                contentEditable={isEditing}
                                suppressContentEditableWarning
                                spellCheck={false}
                                onMouseDown={(e) => {
                                  if (isEditing) e.stopPropagation()
                                }}
                                onBlur={(e) => {
                                  if (!isEditing) return
                                  const newText = e.currentTarget.textContent ?? ""
                                  if (newText.trim().length === 0 && annotation.text === "") {
                                    setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id))
                                    setSelectedAnnotationId((current) => (current === annotation.id ? null : current))
                                    setEditingAnnotationId(null)
                                    setActiveTool(null)
                                    return
                                  }
                                  autoFitDoneRef.current.delete(annotation.id)
                                  setAnnotations((prev) =>
                                    prev.map((a) =>
                                      a.id === annotation.id ? { ...a, text: newText } : a
                                    )
                                  )
                                  setEditingAnnotationId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (!isEditing) return
                                  if (e.key === "Escape") {
                                    e.preventDefault()
                                    ;(e.currentTarget as HTMLElement).blur()
                                  }
                                }}
                                className={cn(
                                  "whitespace-pre-wrap break-words outline-none",
                                  annotation.underline && "underline"
                                )}
                                style={{
                                  fontSize: annotation.fontSize * displayScale,
                                  fontFamily: getCssFontFamily(annotation.fontFamily),
                                  fontWeight: annotation.bold ? 700 : 400,
                                  fontStyle: annotation.italic ? "italic" : "normal",
                                  color: annotation.color,
                                  backgroundColor: annotation.highlightColor !== "transparent" ? annotation.highlightColor : undefined,
                                  opacity: annotation.opacity,
                                  // `inline` + `box-decoration-break: clone`
                                  // makes the highlight background wrap onto
                                  // each line of text instead of stretching
                                  // across the whole textbox width. The
                                  // outer block-level wrapper above carries
                                  // the `textAlign` style since alignment
                                  // doesn't apply to inline elements.
                                  display: "inline",
                                  WebkitBoxDecorationBreak: "clone",
                                  boxDecorationBreak: "clone",
                                }}
                              >
                                {annotation.text}
                              </span>
                            </div>


                            {isSelected && (
                              <>
                                {handle("top-left", "nwse-resize", { left: -hh, top: -hh })}
                                {handle("top", "ns-resize", { left: "50%", top: -hh, transform: "translateX(-50%)" })}
                                {handle("top-right", "nesw-resize", { right: -hh, top: -hh })}
                                {handle("left", "ew-resize", { left: -hh, top: "50%", transform: "translateY(-50%)" })}
                                {handle("right", "ew-resize", { right: -hh, top: "50%", transform: "translateY(-50%)" })}
                                {handle("bottom-left", "nesw-resize", { left: -hh, bottom: -hh })}
                                {handle("bottom", "ns-resize", { left: "50%", bottom: -hh, transform: "translateX(-50%)" })}
                                {handle("bottom-right", "nwse-resize", { right: -hh, bottom: -hh })}
                              </>
                            )}
                          </div>
                        )
                      })}


                      {pageImageAnnotations.map((annotation) => {
                        const isDragging = draggingImageId === annotation.id
                        const isSelected = selectedImageId === annotation.id
                        const hs = 8
                        const hh = hs / 2
                        const imgHandle = (dir: ResizeDirection, cursor: string, pos: React.CSSProperties) => (
                          <span
                            key={dir}
                            className="absolute bg-[#2563eb] border border-white"
                            style={{ width: hs, height: hs, cursor, ...pos }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleImageResizeMouseDown(e, annotation, dir)
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
                              // Rotate the selection around the centre of the unrotated box
                              transform: annotation.rotation
                                ? `rotate(${annotation.rotation}deg)`
                                : undefined,
                              transformOrigin: "center center",
                            }}
                            className={cn(
                              "group hover:ring-2 hover:ring-primary hover:ring-offset-1",
                              isSelected && "ring-2 ring-primary ring-offset-1"
                            )}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleImageMouseDown(e, annotation)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedImageId(annotation.id)
                              // Selecting an image activates the image tool (icon highlight only)
                              setActiveTool("image")
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={annotation.src}
                              alt="Uploaded"
                              className="block h-full w-full select-none object-contain"
                              draggable={false}
                              style={{ opacity: annotation.opacity }}
                            />

                            {isSelected && (
                              <>
                                {imgHandle("top-left", "nwse-resize", { left: -hh, top: -hh })}
                                {imgHandle("top", "ns-resize", { left: "50%", top: -hh, transform: "translateX(-50%)" })}
                                {imgHandle("top-right", "nesw-resize", { right: -hh, top: -hh })}
                                {imgHandle("left", "ew-resize", { left: -hh, top: "50%", transform: "translateY(-50%)" })}
                                {imgHandle("right", "ew-resize", { right: -hh, top: "50%", transform: "translateY(-50%)" })}
                                {imgHandle("bottom-left", "nesw-resize", { left: -hh, bottom: -hh })}
                                {imgHandle("bottom", "ns-resize", { left: "50%", bottom: -hh, transform: "translateX(-50%)" })}
                                {imgHandle("bottom-right", "nwse-resize", { right: -hh, bottom: -hh })}
                              </>
                            )}
                          </div>
                        )
                      })}


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
        </div>


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

      {/* Fixed bottom page selector */}
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
