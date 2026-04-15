import { spawn } from "child_process"
import { randomUUID } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"

interface CommandSpec {
  command: string
  args: string[]
}

function getPythonCandidates(): CommandSpec[] {
  const configuredPython = process.env.PDF_TO_WORD_PYTHON_BIN || process.env.PYTHON_BIN
  const configuredCandidates = configuredPython ? [{ command: configuredPython, args: [] }] : []

  if (process.platform === "win32") {
    return [
      ...configuredCandidates,
      { command: "py", args: ["-3"] },
      { command: "python", args: [] },
    ]
  }

  return [
    ...configuredCandidates,
    { command: "python3", args: [] },
    { command: "python", args: [] },
  ]
}

export function getSafeBaseName(sourceFilename: string) {
  const rawName = path.parse(sourceFilename || "converted.pdf").name || "converted"
  return rawName.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-").trim() || "converted"
}

export function execFile(file: string, args: string[], timeout = 120_000, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, { timeout, windowsHide: true, env: process.env, cwd })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => { stdout += d.toString() })
    proc.stderr.on("data", (d) => { stderr += d.toString() })
    proc.on("close", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || stdout || `Process exited with code ${code} and signal ${signal}`))
    })
    proc.on("error", reject)
  })
}

let resolvedPythonCommandPromise: Promise<CommandSpec> | undefined

export async function resolvePythonCommand() {
  if (!resolvedPythonCommandPromise) {
    resolvedPythonCommandPromise = (async () => {
      for (const candidate of getPythonCandidates()) {
        try {
          await execFile(candidate.command, [...candidate.args, "--version"], 10_000)
          return candidate
        } catch {}
      }

      throw new Error("Python 3 executable not found for PDF to Word conversion")
    })()
  }

  return resolvedPythonCommandPromise
}

export function cleanupPath(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

export async function convertPdfToOffice(
  pdfBuffer: Buffer,
  sourceFilename: string,
  toolSlug: string,
  ocrMode: boolean = false,
  ocrLanguages: string[] = ["eng"],
  runOcr: (buffer: Buffer, filename: string, langs: string[]) => Promise<Uint8Array> = async () => {
    throw new Error("OCR handler not provided")
  }
): Promise<{ buffer: Uint8Array; filename: string }> {
  if (toolSlug !== "pdf-to-word") {
    throw new Error(`Unsupported tool slug for office conversion: ${toolSlug}`)
  }

  const inputId = randomUUID()
  let workingBuffer = pdfBuffer

  if (ocrMode) {
    const ocrResult = await runOcr(pdfBuffer, `${inputId}.pdf`, ocrLanguages)
    workingBuffer = Buffer.from(ocrResult)
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-to-word-"))
  const inputPath = path.join(tempDir, "input.pdf")
  const outputFilename = `${getSafeBaseName(sourceFilename)}.docx`
  const outputPath = path.join(tempDir, outputFilename)
  const pythonScriptPath = path.join(process.cwd(), "lib", "pdf", "pdf_to_docx.py")

  try {
    fs.writeFileSync(inputPath, workingBuffer)

    const pythonCommand = await resolvePythonCommand()
    await execFile(
      pythonCommand.command,
      [...pythonCommand.args, pythonScriptPath, inputPath, outputPath],
      300_000,
      process.cwd()
    )

    if (!fs.existsSync(outputPath)) {
      throw new Error("Python converter did not produce a DOCX file")
    }

    return {
      buffer: new Uint8Array(fs.readFileSync(outputPath)),
      filename: outputFilename,
    }
  } finally {
    cleanupPath(tempDir)
  }
}
