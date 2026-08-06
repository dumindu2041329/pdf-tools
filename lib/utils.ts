import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Maps an output filename's extension to its MIME type. Used when
 * building download blobs: mobile browsers (notably iOS Safari) ignore
 * the `download` attribute on blob: URLs and derive the file extension
 * from the blob's MIME type — so a zip blob typed as `application/pdf`
 * downloads as `converted-pdfs.zip.pdf`. Defaults to `application/pdf`
 * (the dominant output type) for unknown extensions.
 */
export function mimeTypeForFilename(filename?: string | null): string {
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? ""
  switch (ext) {
    case "zip":
      return "application/zip"
    case "txt":
      return "text/plain"
    case "csv":
      return "text/csv"
    case "json":
      return "application/json"
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    default:
      return "application/pdf"
  }
}
