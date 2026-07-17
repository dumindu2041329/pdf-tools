"use client"

import type { TextItem } from "pdfjs-dist/types/src/display/api"

let pdfjsLib: typeof import("pdfjs-dist") | null = null

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

/**
 * Extract plain text from a PDF File entirely in the browser using
 * pdfjs-dist. Returns a single string with one paragraph per page,
 * separated by blank lines. Pages with no text contribute nothing.
 *
 * This replaces the iLoveAPI `extract` tool for the AI summarizer
 * pipeline so the server never has to touch the raw PDF.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfJs()
  const objUrl = URL.createObjectURL(file)

  try {
    const pdf = await pdfjs.getDocument({ url: objUrl }).promise
    const pages: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = content.items as TextItem[]
      // `hasEOL` marks explicit line breaks inside a text content stream;
      // otherwise join the items with single spaces. We don't try to
      // reconstruct columns or tables — the LLM does that from the text.
      let pageText = ""
      for (const item of items) {
        if (typeof item.str !== "string") continue
        if (item.hasEOL) {
          pageText += item.str.trim() + "\n"
        } else {
          pageText += item.str
        }
      }
      const cleaned = pageText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      if (cleaned) pages.push(cleaned)
    }

    return pages.join("\n\n")
  } finally {
    URL.revokeObjectURL(objUrl)
  }
}
