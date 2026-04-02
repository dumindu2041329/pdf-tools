export function convertExtractFormat(buffer: ArrayBuffer, format: string, outputFilename: string): { buffer: ArrayBuffer, filename: string } {
  try {
    const rawBuffer = Buffer.from(buffer)
    // Detect if iLovePDF output is UTF-16LE (BOM: FF FE) or UTF-8
    const isUTF16LE = rawBuffer.length >= 2 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xfe
    const text = rawBuffer.toString(isUTF16LE ? 'utf16le' : 'utf-8')

    // It's natively a CSV with columns: PageNo,XPos,YPos,XWidth,YWidth,FontName,FontSize,FontFamily,Text
    if (format === "csv") {
      // It's already literally a CSV! Just return the original buffer with forced extension
      return { 
        buffer, 
        filename: outputFilename.replace(/\.pdf$/, ".csv").replace(/\.json$/, ".csv") 
      }
    }

    // Split CSV into data objects
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
    // Basic CSV parser to handle quotes
    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let curr = ''
      let insideQuote = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"' && line[i + 1] === '"') {
          curr += '"' // escaped quote
          i++
        } else if (char === '"') {
          insideQuote = !insideQuote
        } else if (char === ',' && !insideQuote) {
          result.push(curr)
          curr = ''
        } else {
          curr += char
        }
      }
      result.push(curr)
      return result
    }

    const headers = parseLine(lines[0] || "").map(h => h.trim())
    const extractData = lines.slice(1).map(line => {
      const values = parseLine(line)
      const obj: Record<string, string | number> = {}
      headers.forEach((h, i) => {
        const v = values[i] !== undefined ? values[i].trim() : ""
        obj[h] = isNaN(Number(v)) || v === "" ? v : Number(v)
      })
      return obj
    })

    if (format === "json") {
      const jsonStr = JSON.stringify(extractData, null, 2)
      const newBuffer = Buffer.from(jsonStr, "utf-8")
      return { 
        buffer: newBuffer.buffer.slice(newBuffer.byteOffset, newBuffer.byteOffset + newBuffer.byteLength) as ArrayBuffer, 
        filename: outputFilename.replace(/\.pdf$/, ".json").replace(/\.csv$/, ".json") 
      }
    }

    if (format === "md") {
      let mdStr = "# Extracted Document Text\n\n"
      let lastPage = -1
      for (const row of extractData) {
        const page = Number(row.PageNo || row.pageno || 0)
        if (page > 0 && page !== lastPage) {
          if (lastPage !== -1) mdStr += "\n\n---\n\n"
          mdStr += `## Page ${page}\n\n`
          lastPage = page
        }
        const textVal = String(row.Text || row.text || "")
        if (textVal) {
          mdStr += `${textVal} `
        }
      }
      const newBuffer = Buffer.from(mdStr.trim(), "utf-8")
      return { 
        buffer: newBuffer.buffer.slice(newBuffer.byteOffset, newBuffer.byteOffset + newBuffer.byteLength) as ArrayBuffer, 
        filename: outputFilename.replace(/\.pdf$/, ".md").replace(/\.json$/, ".md").replace(/\.csv$/, ".md") 
      }
    }
    
    return { buffer, filename: outputFilename }
  } catch (err) {
    console.warn("Failed to convert native CSV extract format", format, err)
    return { buffer, filename: outputFilename }
  }
}
