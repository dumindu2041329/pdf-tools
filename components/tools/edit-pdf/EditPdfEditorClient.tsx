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
  List,
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
import { PDFDocument, StandardFonts, LineCapStyle, LineJoinStyle, popGraphicsState, pushGraphicsState, rgb, rotateDegrees, setLineCap, setLineJoin, translate } from "pdf-lib"
import { deleteFromStorageBrowser } from "@/lib/supabase-upload"
import { ProcessingModal } from "@/components/tools/ProcessingModal"
import { useTool } from "@/hooks/useTool"
import { storeEditResult } from "@/lib/editResultStore"
import type { ProcessingStep } from "@/components/tools/ProcessingModal"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

// The scale the preview canvas is rasterised at. Annotation coordinates are
// captured in this scaled space, so `handleSave` divides by it to recover PDF
// points (origin = bottom-left).
const RENDER_SCALE = 1.4

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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

interface DrawAnnotation {
  id: string
  pageIndex: number
  // Sequence of canvas-space (RENDER_SCALE-scaled) points forming the freehand path
  points: { x: number; y: number }[]
  color: string
  // Stroke thickness in PDF points (matches what the user picks in the sub-toolbar)
  thickness: number
  opacity: number
  // Clockwise rotation applied visually via SVG transform and on save via pdf-lib
  // graphics state. The bounding box is anchored to the unrotated path so the
  // user keeps the same selection area at any angle.
  rotation: number
}

// Build an SVG path "d" attribute from a list of points. Skips points that
// are too close to the previous one to avoid bloating the path string.
function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ""
  const MIN_DIST = 0.5
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const p = points[i]
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_DIST) continue
    path += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }
  return path
}

// Convert canvas-space points to PDF-coordinate path data (origin bottom-left)
// for use with pdf-lib's drawSvgPath.
function pointsToPdfPath(points: { x: number; y: number }[], pageHeight: number): string {
  if (points.length === 0) return ""
  const MIN_DIST = 0.5
  let path = ""
  let started = false
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (i > 0) {
      const prev = points[i - 1]
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_DIST) continue
    }
    const pdfX = p.x / RENDER_SCALE
    const pdfY = pageHeight - p.y / RENDER_SCALE
    path += started ? ` L ${pdfX.toFixed(2)} ${pdfY.toFixed(2)}` : `M ${pdfX.toFixed(2)} ${pdfY.toFixed(2)}`
    started = true
  }
  return path
}

// Compute the axis-aligned bounding box of a draw's points. Returns
// a zero-sized box for empty strokes; callers should special-case
// that if they need real geometry for the resize handles.
function getDrawBbox(draw: DrawAnnotation): { x: number; y: number; width: number; height: number } {
  if (draw.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = draw.points[0].x
  let minY = draw.points[0].y
  let maxX = draw.points[0].x
  let maxY = draw.points[0].y
  for (const p of draw.points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// Render a ShapeAnnotation as a fragment of SVG elements. Used by the
// editor overlay (which uses the canvas / RENDER_SCALE-scaled coordinate
// system) and the smiley uses the bbox centre/radius derived from the
// shape's geometry so it scales naturally with resizing.
function renderShapeGeometry(shape: ShapeAnnotation) {
  const { x, y, width, height, type, color, thickness, opacity, fill } = shape
  // Bbox-centre ellipse dimensions — used for circle / smiley so the
  // shape is always proportional to its bbox.
  const cx = x + width / 2
  const cy = y + height / 2
  const rx = width / 2
  const ry = height / 2
  // Display stroke width is in canvas units (already at RENDER_SCALE)
  const sw = thickness * RENDER_SCALE
  const baseStroke = {
    stroke: color,
    strokeWidth: sw,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity,
    vectorEffect: "non-scaling-stroke" as const,
  }
  if (type === "line") {
    // Use explicit endpoints when available (preserves line orientation);
    // fall back to the bbox diagonal for legacy shapes.
    const x1 = shape.lineStartX ?? x
    const y1 = shape.lineStartY ?? y
    const x2 = shape.lineEndX ?? x + width
    const y2 = shape.lineEndY ?? y + height
    return (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        {...baseStroke}
      />
    )
  }
  if (type === "rect") {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill === "transparent" ? "none" : fill}
        fillOpacity={fill === "transparent" ? undefined : opacity}
        stroke={color}
        strokeWidth={sw}
        strokeOpacity={opacity}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  if (type === "circle") {
    return (
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={fill === "transparent" ? "none" : fill}
        fillOpacity={fill === "transparent" ? undefined : opacity}
        stroke={color}
        strokeWidth={sw}
        strokeOpacity={opacity}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  // smiley: circle + two eye dots + an arc mouth, all sized from the
  // bbox so the face stays roughly proportional to its container.
  const eyeR = Math.max(1.5, Math.min(width, height) * 0.05)
  const eyeOffsetX = Math.max(8, width * 0.18)
  const eyeOffsetY = Math.max(8, height * 0.18)
  const mouthRy = Math.max(8, height * 0.12)
  const mouthRx = Math.max(12, width * 0.22)
  return (
    <g opacity={opacity}>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={cx - eyeOffsetX} cy={cy - eyeOffsetY} r={eyeR * RENDER_SCALE} fill={color} />
      <circle cx={cx + eyeOffsetX} cy={cy - eyeOffsetY} r={eyeR * RENDER_SCALE} fill={color} />
      <path
        d={`M ${cx - mouthRx} ${cy + mouthRy} Q ${cx} ${cy + mouthRy * 2.4} ${cx + mouthRx} ${cy + mouthRy}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

interface ShapeAnnotation {
  id: string
  pageIndex: number
  // Bounding box in canvas (RENDER_SCALE) coordinates, origin top-left.
  x: number
  y: number
  width: number
  height: number
  // "line" = straight line drawn from lineStartX/Y to lineEndX/Y
  //   (the bbox x/y/width/height is kept in sync to encompass both
  //   endpoints, but the explicit fields preserve orientation).
  // "rect" = rectangle outline (or filled when fill !== "transparent")
  // "circle" = ellipse fitted to the bbox
  // "smiley" = circle outline + two eye dots + an arc mouth
  type: "line" | "rect" | "circle" | "smiley"
  // Explicit endpoints for the line type. When set, the line is drawn
  // from (lineStartX, lineStartY) to (lineEndX, lineEndY) instead of
  // the default bbox diagonal. Both fields exist together for lines.
  lineStartX?: number
  lineStartY?: number
  lineEndX?: number
  lineEndY?: number
  color: string
  thickness: number
  opacity: number
  fill: string // "transparent" for outlined-only shapes
  // Clockwise rotation applied visually + on save via pdf-lib graphics state
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
  { id: "draw", label: "Draw", icon: Pencil, ready: true },
  { id: "shape", label: "Shapes", icon: Shapes, ready: true },
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
const [drawAnnotations, setDrawAnnotations] = useState<DrawAnnotation[]>([])
const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [draftText, setDraftText] = useState("")
  const [draftPosition, setDraftPosition] = useState<{ pageIndex: number; x: number; y: number } | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "processing">("idle")
  const [saveStep, setSaveStep] = useState<ProcessingStep>("start")
  const saveStartTimeRef = useRef(0)
  const [zoom, setZoom] = useState(100)
  const [zoomInitialized, setZoomInitialized] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  // In-progress freehand drawing. Lives only on the current page until mouseup.
  const [draftDraw, setDraftDraw] = useState<{ pageIndex: number; points: { x: number; y: number }[] } | null>(null)
  // Default stroke settings for the next draw (used when no existing draw is selected)
  const [drawColor, setDrawColor] = useState("#000000")
  const [drawThickness, setDrawThickness] = useState(4)
  // Currently selected draw annotation (drives the sub-toolbar + delete button)
  const [selectedDrawId, setSelectedDrawId] = useState<string | null>(null)
  const [hoveredDrawId, setHoveredDrawId] = useState<string | null>(null)
  // Hex input mirror for the draw color picker (consistent with text/image)
  const [hexDrawColor, setHexDrawColor] = useState("000000")
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
  // Drives the 8 resize handles for freehand drawings + the
  // document-level mouse-move handler that scales the points.
  const [resizingDrawId, setResizingDrawId] = useState<string | null>(null)
  const drawResizeStateRef = useRef<{
    annotationId: string
    direction: ResizeDirection
    startMouseX: number
    startMouseY: number
    // Original (pre-resize) bounding box. Used together with
    // `startPoints` so every mousemove maps from the original
    // geometry rather than the already-scaled points, which would
    // compound the scale on each frame and decouple the draw from
    // the bounding box.
    startBboxX: number
    startBboxY: number
    startBboxWidth: number
    startBboxHeight: number
    // Snapshot of the original points so the draw always scales
    // from its mousedown state — not from the partially-resized
    // state on each mousemove.
    startPoints: Array<{ x: number; y: number }>
  } | null>(null)
  // Tracks freehand drawing drag: shifts every point by the mouse delta
  const [draggingDrawId, setDraggingDrawId] = useState<string | null>(null)
  const drawDragStateRef = useRef<{
    annotationId: string
    startMouseX: number
    startMouseY: number
    startPoints: Array<{ x: number; y: number }>
  } | null>(null)
  // Shape annotations (line, rect, circle, smiley) — drawn from the shape
  // sub-toolbar; each has a fixed bbox that the 8-handle resizer scales.
  const [shapeAnnotations, setShapeAnnotations] = useState<ShapeAnnotation[]>([])
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null)
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null)
  const [resizingShapeId, setResizingShapeId] = useState<string | null>(null)
  // Multi-selection set: ids of annotations/images/draws/shapes that have
  // been Shift+clicked. Each type keeps its own "primary" single-selection
  // state (for drag/resize/sub-toolbar targeting); this set adds extra
  // items that show selection visuals and are included in batch delete.
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set())
  // In-progress shape being drawn by dragging (only for the "line" type,
  // which is dragged from a start point to an end point instead of dropped
  // as a fixed box). Lives on the current page until mouseup.
  const [draftShape, setDraftShape] = useState<{
    pageIndex: number
    startX: number
    startY: number
    x: number
    y: number
    width: number
    height: number
    color: string
    thickness: number
    opacity: number
  } | null>(null)
  // Next-shape defaults shown in the sub-toolbar when nothing is selected.
  const [shapeType, setShapeType] = useState<ShapeAnnotation["type"]>("line")
  const [shapeColor, setShapeColor] = useState("#000000")
  const [shapeFill, setShapeFill] = useState("transparent")
  const [shapeThickness, setShapeThickness] = useState(3)
  const [hexShapeColor, setHexShapeColor] = useState("000000")
  const [hexShapeFill, setHexShapeFill] = useState("")
  const shapeDragStateRef = useRef<{
    annotationId: string
    startMouseX: number
    startMouseY: number
    startX: number
    startY: number
    startLineStartX?: number
    startLineStartY?: number
    startLineEndX?: number
    startLineEndY?: number
  } | null>(null)
  const shapeResizeStateRef = useRef<{
    annotationId: string
    direction: ResizeDirection
    startMouseX: number
    startMouseY: number
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    // For line pivot resize: the two endpoints at mousedown time.
    startLineStartX?: number
    startLineStartY?: number
    startLineEndX?: number
    startLineEndY?: number
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

  // Mirror of `activeImageStyle` for the draw sub-toolbar. When a
  // drawing is selected the sub-toolbar shows that draw's stroke
  // settings; otherwise it shows the defaults that the next draw
  // will use.
  const activeDrawStyle = useMemo(() => {
    if (selectedDrawId) {
      const draw = drawAnnotations.find((d) => d.id === selectedDrawId)
      if (draw) return { color: draw.color, thickness: draw.thickness, opacity: draw.opacity }
    }
    return { color: drawColor, thickness: drawThickness, opacity: 1 }
  }, [selectedDrawId, drawAnnotations, drawColor, drawThickness])

  // Apply a partial style update to the currently selected draw, or
  // to the next-draw defaults when nothing is selected. Opacity isn't
  // exposed in the sub-toolbar but is kept here for future use.
  const updateDrawStyle = useCallback(
    (updates: Partial<{ color: string; thickness: number; opacity: number }>) => {
      if (selectedDrawId) {
        setDrawAnnotations((prev) =>
          prev.map((d) => (d.id === selectedDrawId ? { ...d, ...updates } : d))
        )
      } else {
        if (updates.color !== undefined) setDrawColor(updates.color)
        if (updates.thickness !== undefined) setDrawThickness(updates.thickness)
      }
    },
    [selectedDrawId]
  )

  // Rotate the currently selected draw by ±45°. The bounding box is
  // anchored to the unrotated path so the selection ring stays in
  // place; the path itself is rotated via SVG transform at render
  // time and via pdf-lib operators on save.
  const rotateSelectedDraw = useCallback(
    (delta: number) => {
      if (!selectedDrawId) return
      setDrawAnnotations((prev) =>
        prev.map((d) => {
          if (d.id !== selectedDrawId) return d
          const next = ((d.rotation + delta) % 360 + 360) % 360
          return { ...d, rotation: next }
        })
      )
    },
    [selectedDrawId]
  )

  // Mirror of `activeDrawStyle` for the shape sub-toolbar. Mirrors the
  // currently-selected shape (so the toolbar shows its current color,
  // thickness, etc.) or falls back to the next-shape defaults when no
  // shape is selected yet.
  const activeShapeStyle = useMemo(() => {
    if (selectedShapeId) {
      const shape = shapeAnnotations.find((s) => s.id === selectedShapeId)
      if (shape) {
        return {
          type: shape.type,
          color: shape.color,
          thickness: shape.thickness,
          opacity: shape.opacity,
          fill: shape.fill,
        }
      }
    }
    return {
      type: shapeType,
      color: shapeColor,
      thickness: shapeThickness,
      opacity: 1,
      fill: shapeFill,
    }
  }, [selectedShapeId, shapeAnnotations, shapeType, shapeColor, shapeThickness, shapeFill])

  // Apply a partial style update to the currently selected shape, or
  // to the next-shape defaults when nothing is selected.
  const updateShapeStyle = useCallback(
    (updates: Partial<{ type: ShapeAnnotation["type"]; color: string; thickness: number; opacity: number; fill: string }>) => {
      if (selectedShapeId) {
        setShapeAnnotations((prev) =>
          prev.map((s) => (s.id === selectedShapeId ? { ...s, ...updates } : s))
        )
      } else {
        if (updates.type !== undefined) setShapeType(updates.type)
        if (updates.color !== undefined) setShapeColor(updates.color)
        if (updates.thickness !== undefined) setShapeThickness(updates.thickness)
        if (updates.fill !== undefined) setShapeFill(updates.fill)
      }
    },
    [selectedShapeId]
  )

  // Rotate the currently selected shape by ±45°. The bbox is anchored
  // to the unrotated geometry so the selection ring stays in place;
  // the shape content is rotated via SVG transform at render time
  // and via pdf-lib operators on save.
  const rotateSelectedShape = useCallback(
    (delta: number) => {
      if (!selectedShapeId) return
      setShapeAnnotations((prev) =>
        prev.map((s) => {
          if (s.id !== selectedShapeId) return s
          const next = ((s.rotation + delta) % 360 + 360) % 360
          return { ...s, rotation: next }
        })
      )
    },
    [selectedShapeId]
  )

  // Delete the shape with the given id and clear the selection if it
  // was selected. Deactivates the shape tool so the toolbar returns
  // to its idle state.
  // Apply the current value of the hex shape-stroke input. Accepts
  // 3- or 6-character hex (shorthand is expanded to 6 chars).
  const applyShapeColor = useCallback(() => {
    if (hexShapeColor.length === 3 || hexShapeColor.length === 6) {
      const normalized = expandHexShorthand(hexShapeColor)
      if (hexShapeColor.length === 3) setHexShapeColor(normalized)
      updateShapeStyle({ color: `#${normalized}` })
    }
  }, [hexShapeColor, updateShapeStyle])

  // Apply the current value of the hex shape-fill input. Empty input
  // means "no fill" (transparent), so the active style is set to
  // "transparent" only when the input is exactly empty.
  const applyShapeFill = useCallback(() => {
    if (hexShapeFill.length === 0) {
      updateShapeStyle({ fill: "transparent" })
      return
    }
    if (hexShapeFill.length === 3 || hexShapeFill.length === 6) {
      const normalized = expandHexShorthand(hexShapeFill)
      if (hexShapeFill.length === 3) setHexShapeFill(normalized)
      updateShapeStyle({ fill: `#${normalized}` })
    }
  }, [hexShapeFill, updateShapeStyle])

  // Commit a freehand draw to the annotation list. Called from both
  // the document-level mouseup handler and the safety-net useEffect
  // that runs when the tool is deactivated mid-draw.
  const commitDraftDraw = useCallback(() => {
    const prev = draftDraw
    if (!prev || prev.points.length < 2) {
      setDraftDraw(null)
      return
    }
    const newAnnotation: DrawAnnotation = {
      id: crypto.randomUUID(),
      pageIndex: prev.pageIndex,
      points: prev.points,
      color: drawColor,
      thickness: drawThickness,
      opacity: 1,
      rotation: 0,
    }
    setDraftDraw(null)
    setDrawAnnotations((anns) => [...anns, newAnnotation])
    setSelectedDrawId(newAnnotation.id)
  }, [draftDraw, drawColor, drawThickness])

  // Commit the in-progress line shape to the annotation list. Called
  // from the document-level mouseup handler. A zero-length drag is
  // discarded (treated as a stray click) — the line needs real extent.
  const commitDraftShape = useCallback(() => {
    const prev = draftShape
    if (!prev) {
      setDraftShape(null)
      return
    }
    setDraftShape(null)
    if (prev.width === 0 && prev.height === 0) return
    // Derive the actual endpoint from the bbox + start point. The line
    // goes from (startX, startY) to the opposite corner of the drag bbox.
    const endX = prev.startX === prev.x ? prev.x + prev.width : prev.x
    const endY = prev.startY === prev.y ? prev.y + prev.height : prev.y
    const newId = crypto.randomUUID()
    setShapeAnnotations((anns) => [
      ...anns,
      {
        id: newId,
        pageIndex: prev.pageIndex,
        x: prev.x,
        y: prev.y,
        width: prev.width,
        height: prev.height,
        type: "line",
        lineStartX: prev.startX,
        lineStartY: prev.startY,
        lineEndX: endX,
        lineEndY: endY,
        color: prev.color,
        thickness: prev.thickness,
        opacity: prev.opacity,
        fill: "transparent",
        rotation: 0,
      },
    ])
    setSelectedShapeId(newId)
  }, [draftShape])

  // Apply the current value of the hex draw-color input. Accepts
  // 3- or 6-character hex (shorthand is expanded to 6 chars).
  const applyDrawColor = useCallback(() => {
    if (hexDrawColor.length === 3 || hexDrawColor.length === 6) {
      const normalized = expandHexShorthand(hexDrawColor)
      if (hexDrawColor.length === 3) setHexDrawColor(normalized)
      updateDrawStyle({ color: `#${normalized}` })
    }
  }, [hexDrawColor, updateDrawStyle])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync hex input when color picker changes active style
    setHexTextColor(activeStyle.color.replace("#", ""))
  }, [activeStyle.color])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync hex input when highlight picker changes
    setHexHighlightColor(activeStyle.highlightColor === "transparent" ? "" : activeStyle.highlightColor.replace("#", ""))
  }, [activeStyle.highlightColor])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync hex input when draw color picker changes
    setHexDrawColor(activeDrawStyle.color.replace("#", ""))
  }, [activeDrawStyle.color])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync hex input when shape stroke color picker changes
    setHexShapeColor(activeShapeStyle.color.replace("#", ""))
  }, [activeShapeStyle.color])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync hex input when shape fill picker changes
    setHexShapeFill(activeShapeStyle.fill === "transparent" ? "" : activeShapeStyle.fill.replace("#", ""))
  }, [activeShapeStyle.fill])

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

  // Deselects the active annotation. Text/image selections clear and
  // deactivate their tool, but draw/shape are persistent tools — clicking
  // the canvas keeps their sub-toolbar visible so the user can keep
  // drawing without re-activating the tool. Shapes stopPropagation on
  // their own click, so this only fires for empty-canvas clicks.
  const handleCanvasDeselect = useCallback(() => {
    setSelectedAnnotationId(null)
    setSelectedImageId(null)
    setEditingAnnotationId(null)
    if (activeTool !== "draw") {
      setSelectedDrawId(null)
    }
    if (activeTool !== "shape") {
      setSelectedShapeId(null)
    }
    // Only deactivate for non-persistent tools. Draw/shape stay active
    // so their sub-toolbars don't disappear right after drawing a shape.
    if (activeTool !== "draw" && activeTool !== "shape") {
      if (selectedAnnotationId || selectedImageId) {
        setActiveTool(null)
      }
    }
    setMultiSelectedIds(new Set())
    window.getSelection()?.removeAllRanges()
  }, [selectedAnnotationId, selectedImageId, activeTool])

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

  // ── Multi-selection helpers ─────────────────────────────────────

  // Clear all individual + multi selections across every annotation type.
  const clearAllSelections = useCallback(() => {
    setSelectedAnnotationId(null)
    setSelectedImageId(null)
    setSelectedDrawId(null)
    setSelectedShapeId(null)
    setMultiSelectedIds(new Set())
  }, [])

  // Remove all individually- + multi-selected items in one batch.
  const deleteSelected = useCallback(() => {
    const idsToRemove = new Set(multiSelectedIds)
    if (selectedAnnotationId) idsToRemove.add(selectedAnnotationId)
    if (selectedImageId) idsToRemove.add(selectedImageId)
    if (selectedDrawId) idsToRemove.add(selectedDrawId)
    if (selectedShapeId) idsToRemove.add(selectedShapeId)
    if (idsToRemove.size === 0) return
    setAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
    setImageAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
    setDrawAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
    setShapeAnnotations((prev) => prev.filter((a) => !idsToRemove.has(a.id)))
    setSelectedAnnotationId(null)
    setSelectedImageId(null)
    setSelectedDrawId(null)
    setSelectedShapeId(null)
    setMultiSelectedIds(new Set())
    setActiveTool(null)
  }, [multiSelectedIds, selectedAnnotationId, selectedImageId, selectedDrawId, selectedShapeId])

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

  // Draw resize — free resize (no aspect lock). The original
  // bounding box AND the original points are captured at mousedown
  // so every mousemove scales from the original geometry. The
  // bounding box and the draw path are kept as a single unit: the
  // bbox tells you how big the draw should be, and the points are
  // derived directly from that — there is no separate "resize the
  // draw" step that can drift out of sync with the bbox.
  const handleDrawResizeMouseDown = useCallback(
    (event: React.MouseEvent, annotation: DrawAnnotation, direction: ResizeDirection) => {
      event.preventDefault()
      event.stopPropagation()
      const bbox = getDrawBbox(annotation)
      drawResizeStateRef.current = {
        annotationId: annotation.id,
        direction,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startBboxX: bbox.x,
        startBboxY: bbox.y,
        startBboxWidth: bbox.width,
        startBboxHeight: bbox.height,
        // Snapshot the points as they are right now. Every later
        // mousemove maps from THIS snapshot — not from the
        // already-scaled state — so the draw tracks the bbox
        // exactly.
        startPoints: annotation.points.map((p) => ({ x: p.x, y: p.y })),
      }
      setResizingDrawId(annotation.id)
    },
    []
  )

  // Start a freehand drawing drag — every point is offset by the
  // mouse delta until mouseup.
  const handleDrawMouseDown = useCallback(
    (event: React.MouseEvent, annotation: DrawAnnotation) => {
      event.preventDefault()
      event.stopPropagation()
      drawDragStateRef.current = {
        annotationId: annotation.id,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startPoints: annotation.points.map((p) => ({ x: p.x, y: p.y })),
      }
      setDraggingDrawId(annotation.id)
    },
    []
  )

  // Page-level mousedown: when the draw tool is active, start a new
  // freehand path at the click point. Existing drawings handle their
  // own mousedown (they stopPropagation) so the user can select them
  // without accidentally starting a new stroke.
  const handlePageDrawMouseDown = useCallback(
    (event: React.MouseEvent, pageIndex: number) => {
      if (activeTool !== "draw") return
      const target = event.target as Element | null
      if (target?.closest("[data-drawing-id]")) return
      event.stopPropagation()
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left) / displayScale
      const y = (event.clientY - rect.top) / displayScale
      setDraftDraw({ pageIndex, points: [{ x, y }] })
      // Starting a new draw implicitly deselects any existing one
      clearAllSelections()
    },
    [activeTool, displayScale, clearAllSelections]
  )

  // Select an existing draw and activate the draw tool so the
  // sub-toolbar shows the selected draw's stroke settings.
  const handleSelectDraw = useCallback(
    (id: string) => {
      setSelectedDrawId(id)
      setActiveTool("draw")
    },
    []
  )

  // Drop a new shape at the click point when the shape tool is active.
  // For the "line" type the click starts a drag: we record the start
  // point and let the document-level mousemove handler extend it so the
  // user draws the line by dragging. All other types are dropped as a
  // fixed 160×120 box the user can grab and resize. The newly created
  // shape is selected so the sub-toolbar shows its style.
  const handlePageShapeMouseDown = useCallback(
    (event: React.MouseEvent, pageIndex: number) => {
      if (activeTool !== "shape") return
      const target = event.target as Element | null
      if (target?.closest("[data-shape-id]")) return
      event.stopPropagation()
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left) / displayScale
      const y = (event.clientY - rect.top) / displayScale
      if (shapeType === "line") {
        // Begin a drag-to-draw line from this point.
        setDraftShape({
          pageIndex,
          startX: x,
          startY: y,
          x,
          y,
          width: 0,
          height: 0,
          color: shapeColor,
          thickness: shapeThickness,
          opacity: 1,
        })
        return
      }
      // Default size in canvas units (already in RENDER_SCALE-scaled space).
      const DEFAULT_W = 160
      const DEFAULT_H = 120
      const newId = crypto.randomUUID()
      setShapeAnnotations((prev) => [
        ...prev,
        {
          id: newId,
          pageIndex,
          x: x - DEFAULT_W / 2,
          y: y - DEFAULT_H / 2,
          width: DEFAULT_W,
          height: DEFAULT_H,
          type: shapeType,
          color: shapeColor,
          thickness: shapeThickness,
          opacity: 1,
          fill: shapeFill,
          rotation: 0,
        },
      ])
      setSelectedShapeId(newId)
    },
    [activeTool, displayScale, shapeType, shapeColor, shapeThickness, shapeFill]
  )

  // Start shape drag (offset the bbox by the mouse delta)
  const handleShapeMouseDown = useCallback(
    (event: React.MouseEvent, annotation: ShapeAnnotation) => {
      event.preventDefault()
      event.stopPropagation()
      shapeDragStateRef.current = {
        annotationId: annotation.id,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startX: annotation.x,
        startY: annotation.y,
        startLineStartX: annotation.lineStartX,
        startLineStartY: annotation.lineStartY,
        startLineEndX: annotation.lineEndX,
        startLineEndY: annotation.lineEndY,
      }
      setDraggingShapeId(annotation.id)
    },
    []
  )

  // Shape resize — free resize (no aspect lock) like the draw tool. The
  // original (mousedown) bbox is captured so every mousemove maps from
  // the original geometry; left/top handles shift the origin so the
  // opposite edge stays put while the user drags outward.
  const handleShapeResizeMouseDown = useCallback(
    (event: React.MouseEvent, annotation: ShapeAnnotation, direction: ResizeDirection) => {
      event.preventDefault()
      event.stopPropagation()
      shapeResizeStateRef.current = {
        annotationId: annotation.id,
        direction,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startX: annotation.x,
        startY: annotation.y,
        startWidth: annotation.width,
        startHeight: annotation.height,
        startLineStartX: annotation.lineStartX,
        startLineStartY: annotation.lineStartY,
        startLineEndX: annotation.lineEndX,
        startLineEndY: annotation.lineEndY,
      }
      setResizingShapeId(annotation.id)
    },
    []
  )

  // Select an existing shape and activate the shape tool so the
  // sub-toolbar shows the selected shape's style.
  const handleSelectShape = useCallback(
    (id: string) => {
      setSelectedShapeId(id)
      setActiveTool("shape")
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
      setSelectedShapeId(null)
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

  // Document-level draw resize — free resize (no aspect lock). The
  // bounding box and the draw are one unit: the user drags a
  // handle, that tells us the new bbox dimensions, and the points
  // are remapped from the original (mousedown) snapshot so the
  // draw's new bbox exactly matches the handle-driven new bbox.
  // No separate "scale the draw" step that can drift out of sync.
  useEffect(() => {
    if (!resizingDrawId) return
    const onMove = (e: MouseEvent) => {
      const s = drawResizeStateRef.current
      if (!s) return
      const dx = (e.clientX - s.startMouseX) / displayScale
      const dy = (e.clientY - s.startMouseY) / displayScale
      const dir = s.direction
      const resizesRight = dir === "right" || dir === "top-right" || dir === "bottom-right"
      const resizesLeft = dir === "left" || dir === "top-left" || dir === "bottom-left"
      const resizesBottom = dir === "bottom" || dir === "bottom-left" || dir === "bottom-right"
      const resizesTop = dir === "top" || dir === "top-left" || dir === "top-right"

      // Step 1: figure out where the new bbox should be, based
      // on the handle the user is dragging. The "left"/"top"
      // handles shift the bbox origin so the opposite edge stays
      // put while the user drags outward.
      let newWidth = s.startBboxWidth
      let newHeight = s.startBboxHeight
      let newBboxX = s.startBboxX
      let newBboxY = s.startBboxY

      if (resizesRight) newWidth = Math.max(20, s.startBboxWidth + dx)
      if (resizesLeft) {
        newWidth = Math.max(20, s.startBboxWidth - dx)
        newBboxX = s.startBboxX + (s.startBboxWidth - newWidth)
      }
      if (resizesBottom) newHeight = Math.max(20, s.startBboxHeight + dy)
      if (resizesTop) {
        newHeight = Math.max(20, s.startBboxHeight - dy)
        newBboxY = s.startBboxY + (s.startBboxHeight - newHeight)
      }

      // Step 2: derive the per-axis scale that maps the original
      // bbox into the new bbox, and remap the ORIGINAL points
      // (captured at mousedown) through that scale. Mapping from
      // the original snapshot — instead of `d.points`, which is
      // the already-resized state — means the math is idempotent
      // and the draw's new bbox always matches the bbox the user
      // is dragging to.
      const scaleX = s.startBboxWidth === 0 ? 1 : newWidth / s.startBboxWidth
      const scaleY = s.startBboxHeight === 0 ? 1 : newHeight / s.startBboxHeight
      const remappedPoints = s.startPoints.map((p) => ({
        x: newBboxX + (p.x - s.startBboxX) * scaleX,
        y: newBboxY + (p.y - s.startBboxY) * scaleY,
      }))
      setDrawAnnotations((prev) =>
        prev.map((d) => {
          if (d.id !== s.annotationId) return d
          // Stroke thickness is left untouched: resizing the
          // bounding box must not change the draw's stroke
          // weight. Only the path scales with the bbox.
          return { ...d, points: remappedPoints }
        })
      )
    }
    const onUp = () => {
      drawResizeStateRef.current = null
      setResizingDrawId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizingDrawId, displayScale])

  // Document-level draw drag — offsets every point by the mouse
  // delta. Stroke thickness and shape are preserved.
  useEffect(() => {
    if (!draggingDrawId) return
    const onMove = (e: MouseEvent) => {
      const start = drawDragStateRef.current
      if (!start) return
      const dx = (e.clientX - start.startMouseX) / displayScale
      const dy = (e.clientY - start.startMouseY) / displayScale
      setDrawAnnotations((prev) =>
        prev.map((d) => {
          if (d.id !== start.annotationId) return d
          const newPoints = start.startPoints.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }))
          return { ...d, points: newPoints }
        })
      )
    }
    const onUp = () => {
      drawDragStateRef.current = null
      setDraggingDrawId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingDrawId, displayScale])

  // Document-level shape drag — offsets the bbox by the mouse delta.
  // Stroke thickness and rotation are preserved. For lines the explicit
  // endpoints are shifted by the same delta so orientation is preserved.
  useEffect(() => {
    if (!draggingShapeId) return
    const onMove = (e: MouseEvent) => {
      const start = shapeDragStateRef.current
      if (!start) return
      const dx = (e.clientX - start.startMouseX) / displayScale
      const dy = (e.clientY - start.startMouseY) / displayScale
      setShapeAnnotations((prev) =>
        prev.map((s) =>
          s.id === start.annotationId
            ? {
                ...s,
                x: start.startX + dx,
                y: start.startY + dy,
                lineStartX: start.startLineStartX != null ? start.startLineStartX + dx : undefined,
                lineStartY: start.startLineStartY != null ? start.startLineStartY + dy : undefined,
                lineEndX: start.startLineEndX != null ? start.startLineEndX + dx : undefined,
                lineEndY: start.startLineEndY != null ? start.startLineEndY + dy : undefined,
              }
            : s
        )
      )
    }
    const onUp = () => {
      shapeDragStateRef.current = null
      setDraggingShapeId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draggingShapeId, displayScale])

  // Document-level shape resize — free resize (no aspect lock). The
  // original (mousedown) bbox is captured so every mousemove maps from
  // the original geometry; left/top handles shift the origin so the
  // opposite edge stays put while the user drags outward. Stroke
  // thickness and rotation are preserved — only the bbox scales.
  //
  // For lines the two handles ("top-left" / "bottom-right") act as
  // endpoint pivots: dragging one endpoint keeps the other fixed so the
  // line rotates around the stationary end. The mousedown state
  // captures the initial endpoints so we can compute the new bbox from
  // the moved endpoint + the fixed pivot.
  useEffect(() => {
    if (!resizingShapeId) return
    const onMove = (e: MouseEvent) => {
      const s = shapeResizeStateRef.current
      if (!s) return
      const dx = (e.clientX - s.startMouseX) / displayScale
      const dy = (e.clientY - s.startMouseY) / displayScale
      const dir = s.direction

      // Line pivot resize — explicit endpoints are available.
      if (s.startLineStartX != null) {
        const pivotX = dir === "top-left" ? s.startLineEndX! : s.startLineStartX!
        const pivotY = dir === "top-left" ? s.startLineEndY! : s.startLineStartY!
        // The moved endpoint = the handle being dragged.
        const movedX = dir === "top-left" ? s.startLineStartX! + dx : s.startLineEndX! + dx
        const movedY = dir === "top-left" ? s.startLineStartY! + dy : s.startLineEndY! + dy
        const newX = Math.min(pivotX, movedX)
        const newY = Math.min(pivotY, movedY)
        const newWidth = Math.abs(movedX - pivotX)
        const newHeight = Math.abs(movedY - pivotY)
        const newStartX = dir === "top-left" ? movedX : pivotX
        const newStartY = dir === "top-left" ? movedY : pivotY
        const newEndX = dir === "top-left" ? pivotX : movedX
        const newEndY = dir === "top-left" ? pivotY : movedY
        setShapeAnnotations((prev) =>
          prev.map((sh) =>
            sh.id === s.annotationId
              ? {
                  ...sh,
                  x: newX,
                  y: newY,
                  width: newWidth,
                  height: newHeight,
                  lineStartX: newStartX,
                  lineStartY: newStartY,
                  lineEndX: newEndX,
                  lineEndY: newEndY,
                }
              : sh
          )
        )
        return
      }

      // Standard bbox resize for non-line shapes.
      const resizesRight = dir === "right" || dir === "top-right" || dir === "bottom-right"
      const resizesLeft = dir === "left" || dir === "top-left" || dir === "bottom-left"
      const resizesBottom = dir === "bottom" || dir === "bottom-left" || dir === "bottom-right"
      const resizesTop = dir === "top" || dir === "top-left" || dir === "top-right"

      let newWidth = s.startWidth
      let newHeight = s.startHeight
      let newX = s.startX
      let newY = s.startY

      if (resizesRight) newWidth = Math.max(20, s.startWidth + dx)
      if (resizesLeft) {
        newWidth = Math.max(20, s.startWidth - dx)
        newX = s.startX + (s.startWidth - newWidth)
      }
      if (resizesBottom) newHeight = Math.max(20, s.startHeight + dy)
      if (resizesTop) {
        newHeight = Math.max(20, s.startHeight - dy)
        newY = s.startY + (s.startHeight - newHeight)
      }

      setShapeAnnotations((prev) =>
        prev.map((sh) =>
          sh.id === s.annotationId
            ? { ...sh, x: newX, y: newY, width: newWidth, height: newHeight }
            : sh
        )
      )
    }
    const onUp = () => {
      shapeResizeStateRef.current = null
      setResizingShapeId(null)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [resizingShapeId, displayScale])

  // Document-level mouse move/up for freehand drawing. Active only
  // while a draft draw is in progress (mousedown on the page set it).
  // Coordinates are taken from the bounding rect of the page the
  // stroke started on so the path stays attached even when the user
  // scrolls mid-stroke.
  useEffect(() => {
    if (!draftDraw) return
    const onMove = (e: MouseEvent) => {
      const pageEl = pageRefs.current.get(draftDraw.pageIndex)
      if (!pageEl) return
      const rect = pageEl.getBoundingClientRect()
      const x = (e.clientX - rect.left) / displayScale
      const y = (e.clientY - rect.top) / displayScale
      setDraftDraw((prev) => {
        if (!prev) return prev
        const last = prev.points[prev.points.length - 1]
        // Skip points that haven't moved enough to be worth storing
        if (last && Math.hypot(x - last.x, y - last.y) < 0.5) return prev
        return { ...prev, points: [...prev.points, { x, y }] }
      })
    }
    const onUp = () => {
      commitDraftDraw()
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draftDraw, displayScale, commitDraftDraw])

  // Safety net: if the tool is deactivated while a draft is in
  // progress (e.g. user clicks another tool mid-stroke) commit the
  // partial path so the user's work isn't lost.
  useEffect(() => {
    if (activeTool !== "draw" && draftDraw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Commit pending draw when tool switches away
      commitDraftDraw()
    }
  }, [activeTool, draftDraw, commitDraftDraw])

  // Document-level mouse move/up for drag-to-draw lines. Active only
  // while a draft line is in progress (mousedown on a page set it). The
  // bbox is recomputed from the start point to the current cursor so the
  // line follows the drag exactly.
  useEffect(() => {
    if (!draftShape) return
    const onMove = (e: MouseEvent) => {
      const pageEl = pageRefs.current.get(draftShape.pageIndex)
      if (!pageEl) return
      const rect = pageEl.getBoundingClientRect()
      const x = (e.clientX - rect.left) / displayScale
      const y = (e.clientY - rect.top) / displayScale
      const startX = draftShape.startX
      const startY = draftShape.startY
      setDraftShape((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          x: Math.min(startX, x),
          y: Math.min(startY, y),
          width: Math.abs(x - startX),
          height: Math.abs(y - startY),
        }
      })
    }
    const onUp = () => {
      commitDraftShape()
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [draftShape, displayScale, commitDraftShape])

  // Safety net: if the tool is deactivated while a draft line is being
  // drawn, commit the partial line so the user's work isn't lost.
  useEffect(() => {
    if (activeTool !== "shape" && draftShape) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Commit pending line when tool switches away
      commitDraftShape()
    }
  }, [activeTool, draftShape, commitDraftShape])

  // Delete key removes all selected annotations (individual + multi);
  // skipped in inputs/textareas so the user can type freely.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return
      const textId = selectedAnnotationId
      const imageId = selectedImageId
      const drawId = selectedDrawId
      const shapeId = selectedShapeId
      if (!textId && !imageId && !drawId && !shapeId && multiSelectedIds.size === 0) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return
      }
      e.preventDefault()
      deleteSelected()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedAnnotationId, selectedImageId, selectedDrawId, selectedShapeId, multiSelectedIds, deleteSelected])

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

  const handleSaveCancel = useCallback(() => {
    setSaveStatus("idle")
    setSaveStep("start")
  }, [])

  const handleSave = useCallback(async () => {
    if (!fileBuffer || saveStatus !== "idle") return
    const sourceBuffer = fileBuffer
    saveStartTimeRef.current = performance.now()
    setSaveStatus("processing")
    setSaveStep("start")

    try {
      await delay(300)

      setSaveStep("process")

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

      // Freehand drawings: each stroke is a freeform SVG path, drawn
      // with `page.drawSvgPath`. Coordinates are converted from the
      // canvas (RENDER_SCALE) system to PDF points (origin
      // bottom-left) inside `pointsToPdfPath`. `borderColor` carries
      // the stroke colour and `borderWidth` carries the line
      // thickness in points so the saved stroke matches the editor
      // preview. `setLineJoin`/`setLineCap` are pushed explicitly
      // because `drawSvgPath` only exposes `borderLineCap` (no
      // join) — we want rounded corners for a freehand feel.
      for (const draw of drawAnnotations) {
        const page = pages[draw.pageIndex]
        if (!page) continue
        const { height: pageHeight } = page.getSize()
        const path = pointsToPdfPath(draw.points, pageHeight)
        if (!path) continue
        const [dr, dg, db] = hexToRgbValues(draw.color)
        const drawOptions = {
          borderColor: rgb(dr, dg, db),
          borderWidth: draw.thickness,
          opacity: draw.opacity,
          borderLineCap: LineCapStyle.Round,
        }
        // Rotate around the centre of the draw's bounding box so the
        // stroke stays anchored the same way the SVG preview does.
        // pdf-lib's rotation is CCW, so negate the editor's CW value.
        if (draw.rotation !== 0) {
          const bbox = getDrawBbox(draw)
          const cx = (bbox.x + bbox.width / 2) / RENDER_SCALE
          const cy = pageHeight - (bbox.y + bbox.height / 2) / RENDER_SCALE
          page.pushOperators(
            pushGraphicsState(),
            setLineCap(LineCapStyle.Round),
            setLineJoin(LineJoinStyle.Round),
            translate(cx, cy),
            rotateDegrees(-draw.rotation),
            translate(-cx, -cy)
          )
          page.drawSvgPath(path, drawOptions)
          page.pushOperators(popGraphicsState())
        } else {
          page.pushOperators(
            pushGraphicsState(),
            setLineCap(LineCapStyle.Round),
            setLineJoin(LineJoinStyle.Round)
          )
          page.drawSvgPath(path, drawOptions)
          page.pushOperators(popGraphicsState())
        }
      }

      // Shapes (line, rect, circle, smiley) — each is drawn in PDF
      // coordinates (origin bottom-left) derived from the canvas-space
      // bbox. Rotation is applied around the bbox centre to match the
      // editor's visual transform; the bbox itself is anchored to the
      // unrotated geometry so the saved shape is identical to the
      // preview after rotation.
      for (const shape of shapeAnnotations) {
        const page = pages[shape.pageIndex]
        if (!page) continue
        const { height: pageHeight } = page.getSize()
        const pdfX = shape.x / RENDER_SCALE
        const pdfY = pageHeight - shape.y / RENDER_SCALE
        const pdfW = shape.width / RENDER_SCALE
        const pdfH = shape.height / RENDER_SCALE
        const [sr, sg, sb] = hexToRgbValues(shape.color)
        const strokeColor = rgb(sr, sg, sb)
        const [fr, fg, fb] = hexToRgbValues(shape.fill)
        const fillColor = rgb(fr, fg, fb)
        const hasFill = shape.fill !== "transparent" && (shape.type === "rect" || shape.type === "circle")

        // Bbox centre in PDF coordinates — used for rotation and for
        // circle / smiley geometry.
        const pdfCx = pdfX + pdfW / 2
        const pdfCy = pdfY - pdfH / 2

        // Push the graphics state + rotation operators (pdf-lib's
        // rotation is CCW; the editor stores CW, so negate).
        const push = () => {
          page.pushOperators(
            pushGraphicsState(),
            setLineCap(LineCapStyle.Round),
            setLineJoin(LineJoinStyle.Round)
          )
          if (shape.rotation !== 0) {
            page.pushOperators(
              translate(pdfCx, pdfCy),
              rotateDegrees(-shape.rotation),
              translate(-pdfCx, -pdfCy)
            )
          }
        }
        const pop = () => page.pushOperators(popGraphicsState())

        if (shape.type === "line") {
          // Draw line from its explicit endpoints (lineStart→lineEnd)
          // when available, falling back to the bbox diagonal. The pdfY
          // axis is flipped (origin bottom-left), so y-values are
          // inverted relative to the canvas coordinate system.
          const lx1 = shape.lineStartX != null ? shape.lineStartX / RENDER_SCALE : pdfX
          const ly1 = shape.lineStartY != null ? pageHeight - shape.lineStartY / RENDER_SCALE : pdfY
          const lx2 = shape.lineEndX != null ? shape.lineEndX / RENDER_SCALE : pdfX + pdfW
          const ly2 = shape.lineEndY != null ? pageHeight - shape.lineEndY / RENDER_SCALE : pdfY - pdfH
          push()
          page.drawLine({
            start: { x: lx1, y: ly1 },
            end: { x: lx2, y: ly2 },
            thickness: shape.thickness,
            color: strokeColor,
            opacity: shape.opacity,
            lineCap: LineCapStyle.Round,
          })
          pop()
          continue
        }

        if (shape.type === "rect") {
          // pdf-lib's drawRectangle uses bottom-left origin, so the
          // rectangle occupies (pdfX, pdfY - pdfH) → (pdfX + pdfW, pdfY).
          push()
          page.drawRectangle({
            x: pdfX,
            y: pdfY - pdfH,
            width: pdfW,
            height: pdfH,
            borderColor: strokeColor,
            borderWidth: shape.thickness,
            borderOpacity: shape.opacity,
            color: hasFill ? fillColor : undefined,
            opacity: hasFill ? shape.opacity : undefined,
            borderLineCap: LineCapStyle.Round,
          })
          pop()
          continue
        }

        if (shape.type === "circle") {
          // Ellipse fitted to the bbox; sized by the smaller of the two
          // axes when the bbox is non-square so a tiny width/height
          // doesn't produce a degenerate shape.
          push()
          page.drawEllipse({
            x: pdfCx,
            y: pdfCy,
            xScale: pdfW / 2,
            yScale: pdfH / 2,
            borderColor: strokeColor,
            borderWidth: shape.thickness,
            borderOpacity: shape.opacity,
            color: hasFill ? fillColor : undefined,
            opacity: hasFill ? shape.opacity : undefined,
          })
          pop()
          continue
        }

        // smiley: outline ellipse + two filled eye dots + an SVG
        // arc mouth. All sized from the bbox so the face stays
        // roughly proportional to the user's drag area.
        const eyeR = Math.max(0.6, Math.min(pdfW, pdfH) * 0.05)
        const eyeOffsetX = Math.max(3, pdfW * 0.18)
        const eyeOffsetY = Math.max(3, pdfH * 0.18)
        const mouthRy = Math.max(3, pdfH * 0.12)
        const mouthRx = Math.max(4, pdfW * 0.22)
        // pdf-lib draws filled dots via drawCircle with `color`.
        push()
        page.drawEllipse({
          x: pdfCx,
          y: pdfCy,
          xScale: pdfW / 2,
          yScale: pdfH / 2,
          borderColor: strokeColor,
          borderWidth: shape.thickness,
          borderOpacity: shape.opacity,
        })
        // Build the mouth as an SVG path so we can use a single
        // drawSvgPath call with a quadratic curve — the same path
        // is converted to PDF y-up coordinates.
        const mouthPath = `M ${pdfCx - mouthRx} ${pdfCy + mouthRy} Q ${pdfCx} ${pdfCy - mouthRy * 1.4} ${pdfCx + mouthRx} ${pdfCy + mouthRy}`
        page.drawSvgPath(mouthPath, {
          borderColor: strokeColor,
          borderWidth: shape.thickness,
          borderOpacity: shape.opacity,
          borderLineCap: LineCapStyle.Round,
        })
        page.drawCircle({ x: pdfCx - eyeOffsetX, y: pdfCy + eyeOffsetY, size: eyeR * 2, color: strokeColor, opacity: shape.opacity })
        page.drawCircle({ x: pdfCx + eyeOffsetX, y: pdfCy + eyeOffsetY, size: eyeR * 2, color: strokeColor, opacity: shape.opacity })
        pop()
      }

      const bytes = await pdfDoc.save()
      // pdf-lib's save() returns Uint8Array<ArrayBufferLike>; copy to satisfy BlobPart types
      const ab = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(ab).set(bytes)
      const resultName = `edited-${filename || "document.pdf"}`
      const processingTimeMs = performance.now() - saveStartTimeRef.current

      // Store result in IndexedDB so the tool page can read it instantly
      const resultKey = crypto.randomUUID()
      await storeEditResult(resultKey, ab)

      // Navigate back to the tool page with the result key
      const params = new URLSearchParams({
        editResult: "1",
        resultKey,
        resultFilename: resultName,
        resultSize: String(ab.byteLength),
        resultTime: (processingTimeMs / 1000).toFixed(1),
      })
      router.push(`/tools/edit-pdf?${params.toString()}`)
    } catch (err) {
      console.error("Failed to save edited PDF:", err)
      toast.error(err instanceof Error ? err.message : "Failed to save the edited PDF.")
      setSaveStatus("idle")
    }
  }, [annotations, imageAnnotations, drawAnnotations, shapeAnnotations, fileBuffer, saveStatus, filename, router])

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

  // Build a ProcessingModal-compatible state from the save status
  const modalState = saveStatus === "processing"
    ? { status: "processing" as const, step: saveStep as ProcessingStep }
    : { status: "idle" as const }

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
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                    "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border transition-colors",
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
              className="flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background px-2 text-sm text-foreground hover:bg-accent"
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
              className="flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
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
              "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-sm font-bold transition-colors",
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
              "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-sm italic transition-colors",
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
              "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-sm underline transition-colors",
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
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                className="flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
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
            onClick={() => deleteSelected()}
            disabled={!selectedAnnotationId && !selectedImageId && multiSelectedIds.size === 0}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
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
              className="flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background px-2 text-sm tabular-nums text-foreground hover:bg-accent"
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
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate left 45°"
            aria-label="Rotate left 45°"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rotateSelectedImage(45)}
            disabled={!selectedImageId}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate right 45°"
            aria-label="Rotate right 45°"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => deleteSelected()}
            disabled={!selectedImageId && multiSelectedIds.size === 0}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            title="Delete image"
            aria-label="Delete image"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Draw sub-toolbar ───────────────────────────────────────── */}
      {activeTool === "draw" && (
        <div
          ref={subToolbarRef}
          className="relative z-30 flex items-center justify-center gap-1.5 border-b border-border bg-card px-3 py-1.5 sm:pl-40 sm:pr-96"
        >
          {/* Color picker: black swatch + caret matching the screenshot */}
          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="drawColor"
              onClick={() => setOpenDropdown(openDropdown === "drawColor" ? null : "drawColor")}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background pl-2 pr-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Stroke color"
              aria-label="Stroke color"
            >
              <span
                className="block h-5 w-5 rounded-sm border border-border"
                style={{ backgroundColor: activeDrawStyle.color }}
              />
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {openDropdown === "drawColor" && (
              <div data-dropdown="drawColor" className="absolute left-0 top-full z-50 mt-1 w-[178px] rounded-md border border-border bg-popover p-2 shadow-lg">
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateDrawStyle({ color: c }); setOpenDropdown(null) }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                        activeDrawStyle.color.toLowerCase() === c.toLowerCase()
                          ? "border-primary ring-2 ring-primary/30"
                          : c === "#ffffff" ? "border-border" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {activeDrawStyle.color.toLowerCase() === c.toLowerCase() && (
                        <Check className={cn("h-3.5 w-3.5", c === "#ffffff" || c === "#f3f3f3" || c === "#efefef" || c === "#ffff00" || c === "#00ff00" || c === "#00ffff" ? "text-gray-800" : "text-white")} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={hexDrawColor}
                    placeholder="000000"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      setHexDrawColor(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyDrawColor()
                      }
                    }}
                    onBlur={() => {
                      if (hexDrawColor.length !== 3 && hexDrawColor.length !== 6) {
                        setHexDrawColor(activeDrawStyle.color.replace("#", ""))
                      }
                    }}
                    className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    maxLength={6}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={applyDrawColor}
                    disabled={hexDrawColor.length !== 3 && hexDrawColor.length !== 6}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Apply color"
                    aria-label="Apply color"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: hexDrawColor.length === 3 || hexDrawColor.length === 6 ? `#${expandHexShorthand(hexDrawColor)}` : activeDrawStyle.color }} />
                </div>
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          {/* Thickness: icon + numeric input with up/down arrows + "pt" suffix */}
          <List className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex h-8 items-stretch overflow-hidden rounded border border-border bg-background">
            <input
              type="number"
              min={1}
              max={72}
              value={activeDrawStyle.thickness}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) {
                  updateDrawStyle({ thickness: Math.max(1, Math.min(72, v)) })
                }
              }}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (Number.isNaN(v) || v < 1) {
                  updateDrawStyle({ thickness: 1 })
                } else if (v > 72) {
                  updateDrawStyle({ thickness: 72 })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="w-10 bg-transparent px-1 text-center text-sm tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              title="Stroke thickness"
              aria-label="Stroke thickness in points"
            />
            <span className="self-center pr-1 text-xs text-muted-foreground">pt</span>
            <div className="flex w-5 flex-col border-l border-border">
              <button
                type="button"
                onClick={() => updateDrawStyle({ thickness: Math.min(72, activeDrawStyle.thickness + 1) })}
                className="flex h-1/2 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Increase thickness"
                aria-label="Increase thickness"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => updateDrawStyle({ thickness: Math.max(1, activeDrawStyle.thickness - 1) })}
                className="flex h-1/2 cursor-pointer items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Decrease thickness"
                aria-label="Decrease thickness"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => rotateSelectedDraw(-45)}
            disabled={!selectedDrawId}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate left 45°"
            aria-label="Rotate left 45°"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rotateSelectedDraw(45)}
            disabled={!selectedDrawId}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate right 45°"
            aria-label="Rotate right 45°"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => {
              deleteSelected()
              setActiveTool(null)
            }}
            disabled={!selectedDrawId && multiSelectedIds.size === 0}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            title="Delete drawing"
            aria-label="Delete drawing"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Shape sub-toolbar ──────────────────────────────────────── */}
      {activeTool === "shape" && (
        <div
          ref={subToolbarRef}
          className="relative z-30 flex items-center justify-center gap-1.5 border-b border-border bg-card px-3 py-1.5 sm:pl-40 sm:pr-96"
        >
          {/* Shape type buttons (line, rect, circle, smiley) — matching the
              screenshot layout. Each is an inline SVG icon so we don't depend
              on lucide-react having a matching glyph. */}
          {([
            {
              value: "line" as const,
              label: "Line",
              render: () => (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="19" x2="19" y2="5" />
                </svg>
              ),
            },
            {
              value: "rect" as const,
              label: "Rectangle",
              render: () => (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="5" y="7" width="14" height="10" rx="1" />
                </svg>
              ),
            },
            {
              value: "circle" as const,
              label: "Circle",
              render: () => (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="7" />
                </svg>
              ),
            },
            {
              value: "smiley" as const,
              label: "Smiley",
              render: () => (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="9.5" cy="10" r="0.6" fill="currentColor" />
                  <circle cx="14.5" cy="10" r="0.6" fill="currentColor" />
                  <path d="M8.5 14.5 Q12 17 15.5 14.5" />
                </svg>
              ),
            },
          ]).map((opt) => {
            const isActive = activeShapeStyle.type === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateShapeStyle({ type: opt.value })}
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border text-muted-foreground transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-transparent hover:bg-accent hover:text-foreground"
                )}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={isActive}
              >
                {opt.render()}
              </button>
            )
          })}

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          {/* Stroke color: same swatch + caret pattern as the draw sub-toolbar */}
          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="shapeColor"
              onClick={() => setOpenDropdown(openDropdown === "shapeColor" ? null : "shapeColor")}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background pl-2 pr-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Stroke color"
              aria-label="Stroke color"
            >
              <span
                className="block h-5 w-5 rounded-sm border border-border"
                style={{ backgroundColor: activeShapeStyle.color }}
              />
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {openDropdown === "shapeColor" && (
              <div data-dropdown="shapeColor" className="absolute left-0 top-full z-50 mt-1 w-[178px] rounded-md border border-border bg-popover p-2 shadow-lg">
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateShapeStyle({ color: c }); setOpenDropdown(null) }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                        activeShapeStyle.color.toLowerCase() === c.toLowerCase()
                          ? "border-primary ring-2 ring-primary/30"
                          : c === "#ffffff" ? "border-border" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {activeShapeStyle.color.toLowerCase() === c.toLowerCase() && (
                        <Check className={cn("h-3.5 w-3.5", c === "#ffffff" || c === "#f3f3f3" || c === "#efefef" || c === "#ffff00" || c === "#00ff00" || c === "#00ffff" ? "text-gray-800" : "text-white")} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={hexShapeColor}
                    placeholder="000000"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      setHexShapeColor(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyShapeColor()
                      }
                    }}
                    onBlur={() => {
                      if (hexShapeColor.length !== 3 && hexShapeColor.length !== 6) {
                        setHexShapeColor(activeShapeStyle.color.replace("#", ""))
                      }
                    }}
                    className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    maxLength={6}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={applyShapeColor}
                    disabled={hexShapeColor.length !== 3 && hexShapeColor.length !== 6}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Apply color"
                    aria-label="Apply color"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: hexShapeColor.length === 3 || hexShapeColor.length === 6 ? `#${expandHexShorthand(hexShapeColor)}` : activeShapeStyle.color }} />
                </div>
              </div>
            )}
          </div>

          {/* Fill color — outlined-only shapes (line, smiley) ignore fill */}
          <div className="relative">
            <button
              type="button"
              data-dropdown-toggle="shapeFill"
              onClick={() => setOpenDropdown(openDropdown === "shapeFill" ? null : "shapeFill")}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-border bg-background pl-2 pr-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Fill color (rect / circle)"
              aria-label="Fill color"
            >
              <span
                className="block h-5 w-5 rounded-sm border border-border"
                style={{
                  backgroundColor:
                    activeShapeStyle.fill === "transparent" ? "transparent" : activeShapeStyle.fill,
                  backgroundImage:
                    activeShapeStyle.fill === "transparent"
                      ? "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)"
                      : undefined,
                  backgroundSize: activeShapeStyle.fill === "transparent" ? "8px 8px" : undefined,
                  backgroundPosition: activeShapeStyle.fill === "transparent" ? "0 0, 4px 4px" : undefined,
                }}
              />
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {openDropdown === "shapeFill" && (
              <div data-dropdown="shapeFill" className="absolute left-0 top-full z-50 mt-1 w-[178px] rounded-md border border-border bg-popover p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => { updateShapeStyle({ fill: "transparent" }); setOpenDropdown(null) }}
                  className={cn(
                    "mb-1.5 flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-accent",
                    activeShapeStyle.fill === "transparent" && "bg-accent font-medium"
                  )}
                >
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                  No fill
                </button>
                <div className="grid grid-cols-5 gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateShapeStyle({ fill: c }); setOpenDropdown(null) }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                        activeShapeStyle.fill.toLowerCase() === c.toLowerCase()
                          ? "border-primary ring-2 ring-primary/30"
                          : c === "#ffffff" ? "border-border" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {activeShapeStyle.fill.toLowerCase() === c.toLowerCase() && (
                        <Check className={cn("h-3.5 w-3.5", c === "#ffffff" || c === "#f3f3f3" || c === "#efefef" || c === "#ffff00" || c === "#00ff00" || c === "#00ffff" ? "text-gray-800" : "text-white")} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">#</span>
                  <input
                    type="text"
                    value={hexShapeFill}
                    placeholder="transparent"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      setHexShapeFill(v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyShapeFill()
                      }
                    }}
                    onBlur={() => {
                      if (hexShapeFill.length !== 0 && hexShapeFill.length !== 3 && hexShapeFill.length !== 6) {
                        setHexShapeFill(activeShapeStyle.fill === "transparent" ? "" : activeShapeStyle.fill.replace("#", ""))
                      }
                    }}
                    className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    maxLength={6}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={applyShapeFill}
                    disabled={hexShapeFill.length !== 0 && hexShapeFill.length !== 3 && hexShapeFill.length !== 6}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-accent text-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Apply fill"
                    aria-label="Apply fill"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className="h-6 w-6 shrink-0 rounded border border-border"
                    style={{ backgroundColor: hexShapeFill.length === 3 || hexShapeFill.length === 6 ? `#${expandHexShorthand(hexShapeFill)}` : activeShapeStyle.fill === "transparent" ? "transparent" : activeShapeStyle.fill }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          {/* Thickness: icon + numeric input with up/down arrows + "pt" suffix
              (matches the draw sub-toolbar layout) */}
          <List className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex h-8 items-stretch overflow-hidden rounded border border-border bg-background">
            <input
              type="number"
              min={1}
              max={72}
              value={activeShapeStyle.thickness}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) {
                  updateShapeStyle({ thickness: Math.max(1, Math.min(72, v)) })
                }
              }}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (Number.isNaN(v) || v < 1) {
                  updateShapeStyle({ thickness: 1 })
                } else if (v > 72) {
                  updateShapeStyle({ thickness: 72 })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="w-10 bg-transparent px-1 text-center text-sm tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              title="Stroke thickness"
              aria-label="Stroke thickness in points"
            />
            <span className="self-center pr-1 text-xs text-muted-foreground">pt</span>
            <div className="flex w-5 flex-col border-l border-border">
              <button
                type="button"
                onClick={() => updateShapeStyle({ thickness: Math.min(72, activeShapeStyle.thickness + 1) })}
                className="flex h-1/2 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Increase thickness"
                aria-label="Increase thickness"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => updateShapeStyle({ thickness: Math.max(1, activeShapeStyle.thickness - 1) })}
                className="flex h-1/2 cursor-pointer items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Decrease thickness"
                aria-label="Decrease thickness"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => rotateSelectedShape(-45)}
            disabled={!selectedShapeId}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate left 45°"
            aria-label="Rotate left 45°"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rotateSelectedShape(45)}
            disabled={!selectedShapeId}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            title="Rotate right 45°"
            aria-label="Rotate right 45°"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-6 w-px shrink-0 bg-border" />

          <button
            type="button"
            onClick={() => {
              deleteSelected()
              setActiveTool(null)
            }}
            disabled={!selectedShapeId && multiSelectedIds.size === 0}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            title="Delete shape"
            aria-label="Delete shape"
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
                const pageDrawAnnotations = drawAnnotations.filter((d) => d.pageIndex === page.pageIndex)
                const pageShapeAnnotations = shapeAnnotations.filter((s) => s.pageIndex === page.pageIndex)
                const isDrafting = draftPosition?.pageIndex === page.pageIndex
                const isDraftDrawHere = draftDraw?.pageIndex === page.pageIndex
                return (
                  <div key={page.pageIndex} className="flex flex-col items-center gap-2">
                    <div
                      ref={setPageRef(page.pageIndex)}
                      data-page-index={page.pageIndex}
                      onClick={handleCanvasDeselect}
                      onMouseDown={(e) => {
                        handlePageDrawMouseDown(e, page.pageIndex)
                        handlePageShapeMouseDown(e, page.pageIndex)
                      }}
                      className={cn(
                        "relative shrink-0 bg-white shadow-lg ring-1 ring-black/5",
                        activeTool === "text" && "cursor-crosshair",
                        activeTool === "hand" && !isPanning && "cursor-grab",
                        activeTool === "hand" && isPanning && "cursor-grabbing select-none",
                        activeTool === "draw" && "cursor-crosshair",
                        activeTool === "shape" && "cursor-crosshair"
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
                        const isSelected = selectedAnnotationId === annotation.id || multiSelectedIds.has(annotation.id)
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
                              if (e.shiftKey) {
                                setMultiSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  // Keep the previously-primary item in the set
                                  if (selectedAnnotationId != null && selectedAnnotationId !== annotation.id) {
                                    next.add(selectedAnnotationId)
                                  }
                                  // Toggle the clicked item
                                  if (next.has(annotation.id)) next.delete(annotation.id)
                                  else next.add(annotation.id)
                                  return next
                                })
                                setSelectedAnnotationId(annotation.id)
                                setActiveTool("text")
                              } else {
                                clearAllSelections()
                                setSelectedAnnotationId(annotation.id)
                                setActiveTool("text")
                              }
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
                        const isSelected = selectedImageId === annotation.id || multiSelectedIds.has(annotation.id)
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
                              if (e.shiftKey) {
                                setMultiSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  if (selectedImageId != null && selectedImageId !== annotation.id) {
                                    next.add(selectedImageId)
                                  }
                                  if (next.has(annotation.id)) next.delete(annotation.id)
                                  else next.add(annotation.id)
                                  return next
                                })
                                setSelectedImageId(annotation.id)
                                setActiveTool("image")
                              } else {
                                clearAllSelections()
                                setSelectedImageId(annotation.id)
                                setActiveTool("image")
                              }
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


                      {/* Freehand drawing overlay. The SVG fills the page and
                          uses the canvas (RENDER_SCALE) coordinate system via
                          viewBox so the same path data works for both the
                          editor and the PDF save. Existing strokes are
                          individually clickable (pointer-events-auto on the
                          <g>) so the user can select them; the in-progress
                          draft passes events through to the page div so the
                          cursor stays a crosshair and panning stays disabled. */}
                      {(pageDrawAnnotations.length > 0 || isDraftDrawHere) && (
                        <svg
                          className="pointer-events-none absolute inset-0"
                          width={page.width * displayScale}
                          height={page.height * displayScale}
                          viewBox={`0 0 ${page.width} ${page.height}`}
                          aria-hidden
                        >
                          {pageDrawAnnotations.map((ann) => {
                            const isSelected = selectedDrawId === ann.id || multiSelectedIds.has(ann.id)
                            const isHovered = hoveredDrawId === ann.id
                            const bbox = getDrawBbox(ann)
                            const strokeHalf = (ann.thickness * RENDER_SCALE) / 2
                            const pad = strokeHalf + 6
                            const hasBbox = bbox.width > 0 || bbox.height > 0
                            // Rotate the entire group around the bbox centre
                            // so the selection ring rotates with the stroke.
                            const groupTransform = ann.rotation
                              ? `rotate(${ann.rotation} ${bbox.x + bbox.width / 2} ${bbox.y + bbox.height / 2})`
                              : undefined
                            return (
                              <g
                                key={ann.id}
                                data-drawing-id={ann.id}
                                className="pointer-events-auto"
                                style={{ cursor: "move" }}
                                transform={groupTransform}
                                onMouseDown={(e) => {
                                  handleDrawMouseDown(e, ann)
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey) {
                                    setMultiSelectedIds((prev) => {
                                      const next = new Set(prev)
                                      if (selectedDrawId != null && selectedDrawId !== ann.id) {
                                        next.add(selectedDrawId)
                                      }
                                      if (next.has(ann.id)) next.delete(ann.id)
                                      else next.add(ann.id)
                                      return next
                                    })
                                    handleSelectDraw(ann.id)
                                  } else {
                                    clearAllSelections()
                                    handleSelectDraw(ann.id)
                                  }
                                }}
                                onMouseEnter={() => setHoveredDrawId(ann.id)}
                                onMouseLeave={() => setHoveredDrawId(null)}
                              >
                                {hasBbox && (
                                  <rect
                                    x={bbox.x - pad}
                                    y={bbox.y - pad}
                                    width={bbox.width + pad * 2}
                                    height={bbox.height + pad * 2}
                                    fill="transparent"
                                    stroke={isHovered && !isSelected ? "#2563eb" : "none"}
                                    strokeWidth={2}
                                    vectorEffect="non-scaling-stroke"
                                    rx={3}
                                  />
                                )}
                                <path
                                  d={pointsToPath(ann.points)}
                                  stroke={ann.color}
                                  strokeWidth={ann.thickness * RENDER_SCALE}
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  opacity={ann.opacity}
                                />
                              </g>
                            )
                          })}
                          {isDraftDrawHere && draftDraw && (
                            <path
                              d={pointsToPath(draftDraw.points)}
                              stroke={drawColor}
                              strokeWidth={drawThickness * RENDER_SCALE}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      )}

                      {/* 8 resize handles around the currently selected draw,
                          matched to the text/image tool style. The wrapping
                          div is pointer-events-none so the user can still
                          click the empty canvas to deselect; only the handle
                          spans re-enable pointer events. */}
                      {pageDrawAnnotations
                        .filter((d) => selectedDrawId === d.id || multiSelectedIds.has(d.id))
                        .map((draw) => {
                          const bbox = getDrawBbox(draw)
                          if (bbox.width === 0 && bbox.height === 0) return null
                          const hs = 8
                          const hh = hs / 2
                          const handle = (
                            dir: ResizeDirection,
                            cursor: string,
                            pos: React.CSSProperties
                          ) => (
                            <span
                              key={dir}
                              className="absolute bg-[#2563eb] border border-white"
                              style={{
                                width: hs,
                                height: hs,
                                cursor,
                                pointerEvents: "auto",
                                ...pos,
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                handleDrawResizeMouseDown(e, draw, dir)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )
                          // Rotate the wrapper so the 8 handles follow the
                          // rotated bbox. The bbox itself stays anchored
                          // to the unrotated stroke; only the visual frame
                          // spins around the centre.
                          const wrapperStyle: React.CSSProperties = {
                            position: "absolute",
                            left: bbox.x * displayScale,
                            top: bbox.y * displayScale,
                            width: bbox.width * displayScale,
                            height: bbox.height * displayScale,
                            pointerEvents: "none",
                          }
                          if (draw.rotation) {
                            wrapperStyle.transform = `rotate(${draw.rotation}deg)`
                            wrapperStyle.transformOrigin = "center"
                          }
                          return (
                            <div
                              key={draw.id}
                              data-draw-resize-id={draw.id}
                              className="ring-2 ring-primary"
                              style={wrapperStyle}
                            >
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


                      {/* Shape overlay. Each shape's bbox is rendered as a
                          clickable group (so the user can select and drag it),
                          with the shape itself drawn as SVG inside. Rotation
                          is applied around the bbox centre via the group
                          transform so the selection ring spins with it. */}
                      {pageShapeAnnotations.length > 0 && (
                        <svg
                          className="pointer-events-none absolute inset-0"
                          width={page.width * displayScale}
                          height={page.height * displayScale}
                          viewBox={`0 0 ${page.width} ${page.height}`}
                          aria-hidden
                        >
                          {pageShapeAnnotations.map((shape) => {
                            const isSelected = selectedShapeId === shape.id || multiSelectedIds.has(shape.id)
                            const isHovered = hoveredShapeId === shape.id
                            const cx = shape.x + shape.width / 2
                            const cy = shape.y + shape.height / 2
                            const groupTransform = shape.rotation
                              ? `rotate(${shape.rotation} ${cx} ${cy})`
                              : undefined
                            const strokeHalf = (shape.thickness * RENDER_SCALE) / 2
                            const pad = strokeHalf + 6
                            return (
                              <g
                                key={shape.id}
                                data-shape-id={shape.id}
                                className="pointer-events-auto"
                                style={{ cursor: "move" }}
                                transform={groupTransform}
                                onMouseDown={(e) => handleShapeMouseDown(e, shape)}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey) {
                                    setMultiSelectedIds((prev) => {
                                      const next = new Set(prev)
                                      if (selectedShapeId != null && selectedShapeId !== shape.id) {
                                        next.add(selectedShapeId)
                                      }
                                      if (next.has(shape.id)) next.delete(shape.id)
                                      else next.add(shape.id)
                                      return next
                                    })
                                    handleSelectShape(shape.id)
                                  } else {
                                    clearAllSelections()
                                    handleSelectShape(shape.id)
                                  }
                                }}
                                onMouseEnter={() => setHoveredShapeId(shape.id)}
                                onMouseLeave={() => setHoveredShapeId(null)}
                              >
                                {/* Hover ring (visible on hover when not selected) */}
                                <rect
                                  x={shape.x - pad}
                                  y={shape.y - pad}
                                  width={shape.width + pad * 2}
                                  height={shape.height + pad * 2}
                                  fill="transparent"
                                  stroke={isHovered && !isSelected ? "#2563eb" : "none"}
                                  strokeWidth={2}
                                  vectorEffect="non-scaling-stroke"
                                  rx={3}
                                />
                                {renderShapeGeometry(shape)}
                              </g>
                            )
                          })}
                        </svg>
                      )}

                      {/* In-progress line being drawn by dragging. Drawn as a
                          live SVG line so the user sees the segment extend as
                          they drag; committed on mouseup. */}
                      {draftShape?.pageIndex === page.pageIndex && (
                        <svg
                          className="pointer-events-none absolute inset-0"
                          width={page.width * displayScale}
                          height={page.height * displayScale}
                          viewBox={`0 0 ${page.width} ${page.height}`}
                          aria-hidden
                        >
                          <line
                            x1={draftShape.startX}
                            y1={draftShape.startY}
                            x2={draftShape.startX + draftShape.width}
                            y2={draftShape.startY + draftShape.height}
                            stroke={draftShape.color}
                            strokeWidth={draftShape.thickness * RENDER_SCALE}
                            strokeLinecap="round"
                            opacity={draftShape.opacity}
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      )}

                      {/* Resize handles around the currently selected shape.
                          Matches the text/image/draw tool style. Lines are a
                          special case: only the two endpoints get a handle
                          (top-left = start, bottom-right = end) so the user
                          can drag each tip of the line. The bbox-anchored
                          resize logic still works because a line's bbox
                          starts at the line's start point and ends at the
                          line's end point. */}
                      {pageShapeAnnotations
                        .filter((s) => selectedShapeId === s.id || multiSelectedIds.has(s.id))
                        .map((shape) => {
                          const hs = 8
                          const hh = hs / 2
                          const handle = (
                            dir: ResizeDirection,
                            cursor: string,
                            pos: React.CSSProperties
                          ) => (
                            <span
                              key={dir}
                              className="absolute bg-[#2563eb] border border-white"
                              style={{
                                width: hs,
                                height: hs,
                                cursor,
                                pointerEvents: "auto",
                                ...pos,
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                handleShapeResizeMouseDown(e, shape, dir)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )
                          const wrapperStyle: React.CSSProperties = {
                            position: "absolute",
                            left: shape.x * displayScale,
                            top: shape.y * displayScale,
                            width: shape.width * displayScale,
                            height: shape.height * displayScale,
                            pointerEvents: "none",
                          }
                          if (shape.rotation) {
                            wrapperStyle.transform = `rotate(${shape.rotation}deg)`
                            wrapperStyle.transformOrigin = "center"
                          }
                          const isLine = shape.type === "line"
                          const hasExplicitEndpoints =
                            isLine &&
                            shape.lineStartX != null
                          return (
                            <div
                              key={shape.id}
                              data-shape-resize-id={shape.id}
                              className={cn(!isLine && "ring-2 ring-primary")}
                              style={wrapperStyle}
                            >
                              {isLine && hasExplicitEndpoints ? (
                                <>
                                  {handle("top-left", "nwse-resize", {
                                    left: (shape.lineStartX! - shape.x) * displayScale - hh,
                                    top: (shape.lineStartY! - shape.y) * displayScale - hh,
                                  })}
                                  {handle("bottom-right", "nwse-resize", {
                                    left: (shape.lineEndX! - shape.x) * displayScale - hh,
                                    top: (shape.lineEndY! - shape.y) * displayScale - hh,
                                  })}
                                </>
                              ) : isLine ? (
                                <>
                                  {handle("top-left", "nwse-resize", { left: -hh, top: -hh })}
                                  {handle("bottom-right", "nwse-resize", { right: -hh, bottom: -hh })}
                                </>
                              ) : (
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
              disabled={!fileBuffer || saveStatus !== "idle"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus !== "idle" ? (
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

      <ProcessingModal
        open={saveStatus === "processing"}
        onClose={() => {}}
        toolSlug="edit-pdf"
        toolName="Edit PDF"
        state={modalState as ReturnType<typeof useTool>["state"]}
        cancel={handleSaveCancel}
      />
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
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-200 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
