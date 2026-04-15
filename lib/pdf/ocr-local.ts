import fs from "fs"
import os from "os"
import path from "path"
import { resolvePythonCommand, execFile, cleanupPath, getSafeBaseName } from "./office-converter"

export async function processOcrLocal(
  pdfBuffer: Buffer,
  sourceFilename: string,
  ocrLanguages: string[] = ["eng"]
): Promise<{ buffer: Uint8Array; filename: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-ocr-"))
  const inputPath = path.join(tempDir, "input.pdf")
  const outputFilename = `${getSafeBaseName(sourceFilename)}_ocr.pdf`
  const outputPath = path.join(tempDir, outputFilename)
  const pythonScriptPath = path.join(process.cwd(), "lib", "pdf", "pdf_ocr.py")

  try {
    fs.writeFileSync(inputPath, pdfBuffer)

    const pythonCommand = await resolvePythonCommand()
    
    // Pass config as CLI arguments
    const langArg = ocrLanguages.join(",")
    
    // Run the python OCR script
    await execFile(
      pythonCommand.command,
      [...pythonCommand.args, pythonScriptPath, inputPath, outputPath, langArg],
      300_000, // 5 minute timeout since OCR is intensive
      process.cwd()
    )

    if (!fs.existsSync(outputPath)) {
      throw new Error("Python OCR script did not produce an output file")
    }

    return {
      buffer: new Uint8Array(fs.readFileSync(outputPath)),
      filename: outputFilename,
    }
  } finally {
    cleanupPath(tempDir)
  }
}
