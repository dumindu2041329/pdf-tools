import { PDFDocument, degrees } from "pdf-lib"
import JSZip from "jszip"

export async function processRotateLocal(
  files: Array<{ buffer: Uint8Array | ArrayBuffer; filename: string }>,
  options: Record<string, unknown>
) {
  const rotationDeg = ((options.rotate as number) || 0) % 360
  const resultFiles: { name: string; uint8Array: Uint8Array }[] = []

  for (const { buffer, filename } of files) {
    const pdfDoc = await PDFDocument.load(buffer)
    const pages = pdfDoc.getPages()

    for (const page of pages) {
      const currentAngle = page.getRotation().angle
      page.setRotation(degrees(currentAngle + rotationDeg))
    }

    const uint8Array = await pdfDoc.save()
    const baseName = filename.replace(/\.[^/.]+$/, "")
    const suffix = rotationDeg > 0 ? `_rotated_${rotationDeg}` : ""
    resultFiles.push({ name: `${baseName}${suffix}.pdf`, uint8Array })
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
