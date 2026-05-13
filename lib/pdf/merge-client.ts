import { PDFDocument } from "pdf-lib"

export async function processMergeLocal(
  files: Array<{ buffer: Uint8Array | ArrayBuffer; filename: string }>,
  _options: Record<string, unknown>
) {
  const mergedPdf = await PDFDocument.create()

  for (const { buffer } of files) {
    const pdfDoc = await PDFDocument.load(buffer)
    const pageIndices = pdfDoc.getPageIndices()
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices)
    for (const page of copiedPages) {
      mergedPdf.addPage(page)
    }
  }

  const mergedBytes = await mergedPdf.save()
  const firstName = files[0]?.filename.replace(/\.[^/.]+$/, "") || "merged"
  const outputFilename = `${firstName}_merged.pdf`

  return {
    buffer: mergedBytes,
    downloadFilename: outputFilename,
  }
}