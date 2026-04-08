import { PDFDocument, degrees } from "pdf-lib"
import JSZip from "jszip"

/**
 * Parses ranges string like "1-3, 5, 8-10" into an array of [start, end] tuples (0-indexed).
 * Converts 1-indexed string values to 0-indexed values.
 */
function parseRanges(rangesStr: string, totalPages: number): [number, number][] {
  const parts = rangesStr.split(",").map(s => s.trim()).filter(Boolean)
  const result: [number, number][] = []
  
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number)
      if (!isNaN(start) && !isNaN(end)) {
        result.push([Math.max(0, start - 1), Math.min(totalPages - 1, end - 1)])
      }
    } else {
      const num = Number(part)
      if (!isNaN(num)) {
        result.push([Math.max(0, num - 1), Math.min(totalPages - 1, num - 1)])
      }
    }
  }
  return result
}

export async function processSplitLocal(fileBuffer: ArrayBuffer, options: Record<string, unknown>, originalFilename: string = "document.pdf") {
  const pdfDoc = await PDFDocument.load(fileBuffer)
  const totalPages = pdfDoc.getPageCount()
  const splitMode = (options.split_mode as string) || "ranges"
  
  const resultFiles: { name: string; uint8Array: Uint8Array }[] = []
  const baseName = originalFilename.replace(/\.[^/.]+$/, "")

  if (splitMode === "remove_pages") {
    const removeRanges = parseRanges((options.remove_pages as string) || "", totalPages)
    const pagesToRemove = new Set<number>()
    for (const [start, end] of removeRanges) {
      for (let i = start; i <= end; i++) {
        pagesToRemove.add(i)
      }
    }

    const doc = await PDFDocument.create()
    const pagesToKeep = []
    for (let i = 0; i < totalPages; i++) {
        if (!pagesToRemove.has(i)) {
            pagesToKeep.push(i)
        }
    }

    if (pagesToKeep.length > 0) {
        const copiedPages = await doc.copyPages(pdfDoc, pagesToKeep)
        copiedPages.forEach((page) => doc.addPage(page))
    }
    
    const uint8Array = await doc.save()
    resultFiles.push({ name: `${baseName}_removed.pdf`, uint8Array })
  } else if (splitMode === "fixed_range") {
    const chunkSize = Math.max(1, Number(options.fixed_range) || 1)
    
    for (let start = 0; start < totalPages; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, totalPages - 1)
        const doc = await PDFDocument.create()
        const pagesToCopy = []
        for (let i = start; i <= end; i++) {
            pagesToCopy.push(i)
        }
        const copiedPages = await doc.copyPages(pdfDoc, pagesToCopy)
        copiedPages.forEach((page) => doc.addPage(page))
        const uint8Array = await doc.save()
        resultFiles.push({ name: `${baseName}_${start + 1}-${end + 1}.pdf`, uint8Array })
    }
  } else {
    // "ranges"
    const parsedRanges = parseRanges((options.ranges as string) || "", totalPages)
    const mergeAfter = options.merge_after === true
    
    if (mergeAfter) {
      const doc = await PDFDocument.create()
      const rotationsArray = typeof options.rotations === "string" ? options.rotations.split(",").map(Number) : []
      let outIndex = 0;
      for (const [start, end] of parsedRanges) {
        const pagesToCopy = []
        for (let i = start; i <= end; i++) {
          pagesToCopy.push(i)
        }
        if (pagesToCopy.length > 0) {
          const copiedPages = await doc.copyPages(pdfDoc, pagesToCopy)
          copiedPages.forEach((page) => {
            const addedRotation = rotationsArray[outIndex] || 0;
            if (addedRotation !== 0) {
              const currentAngle = page.getRotation().angle || 0;
              page.setRotation(degrees(currentAngle + addedRotation));
            }
            doc.addPage(page)
            outIndex++;
          })
        }
      }
      const uint8Array = await doc.save()
      resultFiles.push({ name: `${baseName}_organized.pdf`, uint8Array })
    } else {
      for (const [start, end] of parsedRanges) {
          const doc = await PDFDocument.create()
          const pagesToCopy = []
          for (let i = start; i <= end; i++) {
              pagesToCopy.push(i)
          }
          if (pagesToCopy.length > 0) {
              const copiedPages = await doc.copyPages(pdfDoc, pagesToCopy)
              copiedPages.forEach((page) => doc.addPage(page))
              const uint8Array = await doc.save()
              const rangeStr = start === end ? `${start + 1}` : `${start + 1}-${end + 1}`
              resultFiles.push({ name: `${baseName}_${rangeStr}.pdf`, uint8Array })
          }
      }
    }
  }

  // Create Zip or return single file
  if (resultFiles.length === 1) {
    return {
        buffer: resultFiles[0].uint8Array,
        downloadFilename: resultFiles[0].name
    }
  } else if (resultFiles.length > 1) {
    const zip = new JSZip()
    for (const f of resultFiles) {
        zip.file(f.name, f.uint8Array)
    }
    const zipContent = await zip.generateAsync({ type: "uint8array" })
    return {
        buffer: zipContent,
        downloadFilename: `${baseName}_split.zip`
    }
  }
  
  // Default fallback if no files generated
  return {
    buffer: await pdfDoc.save(),
    downloadFilename: originalFilename
  }
}
