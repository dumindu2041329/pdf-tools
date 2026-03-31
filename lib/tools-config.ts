import {
  Merge,
  Scissors,
  FileDown,
  RotateCw,
  Droplets,
  Hash,
  FileEdit,
  Trash2,
  FileOutput,
  Layers,
  ScanLine,
  Wrench,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe,
  Lock,
  Unlock,
  PenTool,
  Brain,
  Languages,
  Archive,
  CheckCircle,
  Presentation,
  type LucideIcon,
} from "lucide-react"
import type { ILoveAPITool } from "./iloveapi/types"

export type ToolCategory =
  | "all"
  | "organize"
  | "optimize"
  | "convert-to"
  | "convert-from"
  | "edit"
  | "security"
  | "ai"

export interface ToolConfig {
  slug: string
  title: string
  description: string
  seoDescription: string
  category: ToolCategory
  iloveapiTool: ILoveAPITool
  icon: LucideIcon
  color: string
  access: "free" | "premium"
  acceptedFileTypes: string[]
  maxFiles: number
  maxSizeMB: number
}

export const toolsConfig: ToolConfig[] = [
  // ── Organize ──────────────────────────────────────────────
  {
    slug: "merge-pdf",
    title: "Merge PDF",
    description: "Combine multiple PDFs into one document",
    seoDescription:
      "Merge multiple PDF files into a single document. Free online tool — fast and secure.",
    category: "organize",
    iloveapiTool: "merge",
    icon: Merge,
    color: "hsl(262, 83%, 58%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 20,
    maxSizeMB: 20,
  },
  {
    slug: "split-pdf",
    title: "Split PDF",
    description: "Separate a PDF into multiple files",
    seoDescription:
      "Split PDF files by pages, ranges, or file size. Free online PDF splitter.",
    category: "organize",
    iloveapiTool: "split",
    icon: Scissors,
    color: "hsl(200, 80%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "remove-pages",
    title: "Remove Pages",
    description: "Delete specific pages from your PDF",
    seoDescription:
      "Remove specific pages from your PDF document. Visual page selector.",
    category: "organize",
    iloveapiTool: "split",
    icon: Trash2,
    color: "hsl(0, 70%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "extract-pages",
    title: "Extract Pages",
    description: "Extract text and data from PDFs",
    seoDescription:
      "Extract text content from PDF documents. Plain text and position data extraction.",
    category: "organize",
    iloveapiTool: "extract",
    icon: FileOutput,
    color: "hsl(160, 60%, 45%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "organize-pdf",
    title: "Organize PDF",
    description: "Reorder, rotate and manage PDF pages",
    seoDescription:
      "Drag and drop PDF pages to reorder, rotate, or delete them. Free online organizer.",
    category: "organize",
    iloveapiTool: "merge",
    icon: Layers,
    color: "hsl(280, 65%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "scan-to-pdf",
    title: "Scan to PDF",
    description: "Convert scanned images into a PDF",
    seoDescription:
      "Convert images from your camera or scanner into a searchable PDF.",
    category: "organize",
    iloveapiTool: "imagepdf",
    icon: ScanLine,
    color: "hsl(190, 70%, 50%)",
    access: "free",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    maxFiles: 20,
    maxSizeMB: 20,
  },

  // ── Optimize ──────────────────────────────────────────────
  {
    slug: "compress-pdf",
    title: "Compress PDF",
    description: "Reduce PDF file size while keeping quality",
    seoDescription:
      "Compress PDF files to reduce size. Choose from extreme, recommended, or low compression.",
    category: "optimize",
    iloveapiTool: "compress",
    icon: FileDown,
    color: "hsl(140, 65%, 45%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "repair-pdf",
    title: "Repair PDF",
    description: "Fix corrupted or damaged PDF files",
    seoDescription:
      "Repair corrupted PDF files online. Recover data from damaged documents.",
    category: "optimize",
    iloveapiTool: "repair",
    icon: Wrench,
    color: "hsl(35, 80%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "ocr-pdf",
    title: "OCR PDF",
    description: "Make scanned PDFs searchable with OCR",
    seoDescription:
      "Convert scanned PDFs into searchable text using OCR. 80+ languages supported.",
    category: "optimize",
    iloveapiTool: "pdfocr",
    icon: Eye,
    color: "hsl(220, 70%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },

  // ── Convert to PDF ────────────────────────────────────────
  {
    slug: "word-to-pdf",
    title: "Word to PDF",
    description: "Convert Word documents to PDF format",
    seoDescription:
      "Convert DOC and DOCX files to PDF online. Free Word to PDF converter.",
    category: "convert-to",
    iloveapiTool: "officepdf",
    icon: FileText,
    color: "hsl(217, 90%, 50%)",
    access: "free",
    acceptedFileTypes: [".doc", ".docx"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "excel-to-pdf",
    title: "Excel to PDF",
    description: "Convert Excel spreadsheets to PDF",
    seoDescription:
      "Convert XLS and XLSX files to PDF online. Free Excel to PDF converter.",
    category: "convert-to",
    iloveapiTool: "officepdf",
    icon: FileSpreadsheet,
    color: "hsl(140, 75%, 40%)",
    access: "free",
    acceptedFileTypes: [".xls", ".xlsx"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "powerpoint-to-pdf",
    title: "PowerPoint to PDF",
    description: "Convert PowerPoint presentations to PDF",
    seoDescription:
      "Convert PPT and PPTX files to PDF online. Free PowerPoint to PDF converter.",
    category: "convert-to",
    iloveapiTool: "officepdf",
    icon: Presentation,
    color: "hsl(15, 85%, 55%)",
    access: "free",
    acceptedFileTypes: [".ppt", ".pptx"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "jpg-to-pdf",
    title: "JPG to PDF",
    description: "Convert images to a PDF document",
    seoDescription:
      "Convert JPG, PNG, and other images to PDF. Merge multiple images into one PDF.",
    category: "convert-to",
    iloveapiTool: "imagepdf",
    icon: FileImage,
    color: "hsl(45, 80%, 50%)",
    access: "free",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    maxFiles: 20,
    maxSizeMB: 20,
  },
  {
    slug: "html-to-pdf",
    title: "HTML to PDF",
    description: "Convert web pages to PDF format",
    seoDescription:
      "Convert any web page URL to a PDF document. Free HTML to PDF converter.",
    category: "convert-to",
    iloveapiTool: "htmlpdf",
    icon: Globe,
    color: "hsl(200, 70%, 50%)",
    access: "free",
    acceptedFileTypes: [],
    maxFiles: 0,
    maxSizeMB: 0,
  },

  // ── Convert from PDF ──────────────────────────────────────
  {
    slug: "pdf-to-word",
    title: "PDF to Word",
    description: "Convert PDF files to editable Word documents",
    seoDescription:
      "Convert PDF files to Word documents (DOCX). Preserve formatting and layout.",
    category: "convert-from",
    iloveapiTool: "officepdf",
    icon: FileText,
    color: "hsl(217, 90%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "pdf-to-jpg",
    title: "PDF to JPG",
    description: "Convert PDF pages to JPG images",
    seoDescription:
      "Convert each PDF page into a JPG image. Extract embedded images from PDFs.",
    category: "convert-from",
    iloveapiTool: "pdfjpg",
    icon: FileImage,
    color: "hsl(45, 80%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "pdf-to-excel",
    title: "PDF to Excel",
    description: "Convert PDF tables to Excel spreadsheets",
    seoDescription:
      "Convert PDF files to Excel spreadsheets. Extract tabular data from PDFs.",
    category: "convert-from",
    iloveapiTool: "officepdf",
    icon: FileSpreadsheet,
    color: "hsl(140, 75%, 40%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "pdf-to-powerpoint",
    title: "PDF to PowerPoint",
    description: "Convert PDF to PowerPoint slides",
    seoDescription:
      "Convert PDF files to editable PowerPoint presentations.",
    category: "convert-from",
    iloveapiTool: "officepdf",
    icon: Presentation,
    color: "hsl(15, 85%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "pdf-to-pdfa",
    title: "PDF to PDF/A",
    description: "Convert PDF to archival format",
    seoDescription:
      "Convert PDF to PDF/A for long-term preservation. ISO-compliant archival format.",
    category: "convert-from",
    iloveapiTool: "pdfa",
    icon: Archive,
    color: "hsl(250, 55%, 55%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "validate-pdfa",
    title: "Validate PDF/A",
    description: "Check PDF/A compliance",
    seoDescription:
      "Validate PDF/A compliance of your documents. Check conformance levels.",
    category: "convert-from",
    iloveapiTool: "validatepdfa",
    icon: CheckCircle,
    color: "hsl(160, 60%, 45%)",
    access: "premium",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },

  // ── Edit ──────────────────────────────────────────────────
  {
    slug: "rotate-pdf",
    title: "Rotate PDF",
    description: "Rotate PDF pages to any orientation",
    seoDescription:
      "Rotate PDF pages 90°, 180°, or 270°. Free online PDF rotator.",
    category: "edit",
    iloveapiTool: "rotate",
    icon: RotateCw,
    color: "hsl(180, 60%, 45%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "watermark-pdf",
    title: "Watermark PDF",
    description: "Add text or image watermarks to PDFs",
    seoDescription:
      "Add custom text or image watermarks to your PDF files. Control position and transparency.",
    category: "edit",
    iloveapiTool: "watermark",
    icon: Droplets,
    color: "hsl(200, 60%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "add-page-numbers",
    title: "Add Page Numbers",
    description: "Insert page numbers into your PDF",
    seoDescription:
      "Add page numbers to PDF files. Customize position, font, and format.",
    category: "edit",
    iloveapiTool: "pagenumber",
    icon: Hash,
    color: "hsl(30, 70%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "edit-pdf",
    title: "Edit PDF",
    description: "Add text, images, and annotations to PDFs",
    seoDescription:
      "Edit PDF files online. Add text, images, and annotations with our PDF editor.",
    category: "edit",
    iloveapiTool: "editpdf",
    icon: FileEdit,
    color: "hsl(262, 75%, 55%)",
    access: "premium",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },

  // ── Security ──────────────────────────────────────────────
  {
    slug: "unlock-pdf",
    title: "Unlock PDF",
    description: "Remove password protection from PDFs",
    seoDescription:
      "Remove password from PDF files. Unlock your protected PDF documents.",
    category: "security",
    iloveapiTool: "unlock",
    icon: Unlock,
    color: "hsl(120, 55%, 45%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "protect-pdf",
    title: "Protect PDF",
    description: "Add password protection to your PDFs",
    seoDescription:
      "Password protect your PDF files. Secure documents with encryption.",
    category: "security",
    iloveapiTool: "protect",
    icon: Lock,
    color: "hsl(0, 65%, 50%)",
    access: "free",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "sign-pdf",
    title: "Sign PDF",
    description: "Digitally sign PDF documents",
    seoDescription:
      "Sign PDF documents electronically. Request signatures from others.",
    category: "security",
    iloveapiTool: "sign",
    icon: PenTool,
    color: "hsl(262, 80%, 60%)",
    access: "premium",
    acceptedFileTypes: [".pdf"],
    maxFiles: 5,
    maxSizeMB: 20,
  },

  // ── AI ────────────────────────────────────────────────────
  {
    slug: "ai-summarizer",
    title: "AI Summarizer",
    description: "Get AI-powered summaries of your PDFs",
    seoDescription:
      "Summarize PDF documents with AI. Get key points, structured summaries, and more.",
    category: "ai",
    iloveapiTool: "extract",
    icon: Brain,
    color: "hsl(280, 80%, 60%)",
    access: "premium",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
  {
    slug: "translate-pdf",
    title: "Translate PDF",
    description: "Translate PDF documents to other languages",
    seoDescription:
      "Translate PDF documents to 100+ languages using AI. Preserve formatting and layout.",
    category: "ai",
    iloveapiTool: "extract",
    icon: Languages,
    color: "hsl(300, 65%, 55%)",
    access: "premium",
    acceptedFileTypes: [".pdf"],
    maxFiles: 1,
    maxSizeMB: 20,
  },
]

export const toolCategories: { id: ToolCategory; label: string }[] = [
  { id: "all", label: "All Tools" },
  { id: "organize", label: "Organize" },
  { id: "optimize", label: "Optimize" },
  { id: "convert-to", label: "Convert to PDF" },
  { id: "convert-from", label: "Convert from PDF" },
  { id: "edit", label: "Edit" },
  { id: "security", label: "Security" },
  { id: "ai", label: "AI" },
]

export function getToolBySlug(slug: string): ToolConfig | undefined {
  return toolsConfig.find((t) => t.slug === slug)
}

export function getToolsByCategory(category: ToolCategory): ToolConfig[] {
  if (category === "all") return toolsConfig
  return toolsConfig.filter((t) => t.category === category)
}
