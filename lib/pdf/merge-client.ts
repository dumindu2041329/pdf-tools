import { PDFDocument } from "pdf-lib"

export async function processMergeLocal(
  files: Array<{ buffer: Uint8Array | ArrayBuffer; filename: string }>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: Record<string, unknown>
) {
  if (!files || files.length === 0) {
    throw new Error("No PDF files provided")
  }

  const mergedPdf = await PDFDocument.create()

  for (const { buffer, filename } of files) {
    try {
      const pdfDoc = await PDFDocument.load(buffer)
      const pageIndices = pdfDoc.getPageIndices()
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices)
      for (const page of copiedPages) {
        mergedPdf.addPage(page)
      }
    } catch (err) {
      throw new Error(`Failed to process PDF file "${filename}": ${(err as Error).message}`)
    }
  }

  if (mergedPdf.getPageCount() === 0) {
    throw new Error("No valid pages to merge")
  }

  const mergedBytes = await mergedPdf.save()
  const firstName = files[0]?.filename.replace(/\.[^/.]+$/, "") || "merged"
  const outputFilename = `${firstName}_merged.pdf`

  return {
    buffer: mergedBytes,
    downloadFilename: outputFilename,
  }
}