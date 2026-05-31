import { PDFDocument, degrees } from "pdf-lib"
import JSZip from "jszip"

export async function processRotateLocal(
  files: Array<{ buffer: Uint8Array | ArrayBuffer; filename: string }>,
  options: Record<string, unknown>
) {
  if (!files || files.length === 0) {
    throw new Error("No PDF files provided")
  }

  const rotationDeg = ((options.rotate as number) || 0) % 360
  const resultFiles: { name: string; uint8Array: Uint8Array }[] = []

  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i]
    try {
      const pdfDoc = await PDFDocument.load(buffer)
      const pages = pdfDoc.getPages()

      for (const page of pages) {
        const currentAngle = page.getRotation().angle
        page.setRotation(degrees(currentAngle + rotationDeg))
      }

      const uint8Array = await pdfDoc.save()
      const baseName = filename.replace(/\.[^/.]+$/, "")
      const suffix = rotationDeg > 0 ? `_rotated_${rotationDeg}` : ""
      const uniqueSuffix = files.length > 1 ? `_${i + 1}` : ""
      resultFiles.push({ name: `${baseName}${suffix}${uniqueSuffix}.pdf`, uint8Array })
    } catch (err) {
      throw new Error(`Failed to process PDF file "${filename}": ${(err as Error).message}`)
    }
  }

  if (resultFiles.length === 1) {
    return {
      buffer: resultFiles[0].uint8Array,
      downloadFilename: resultFiles[0].name,
    }
  }

  const zip = new JSZip()
  for (const f of resultFiles) {
    zip.file(f.name, f.uint8Array)
  }
  const zipContent = await zip.generateAsync({ type: "uint8array" })
  return {
    buffer: zipContent,
    downloadFilename: "rotated_pdfs.zip",
  }
}
