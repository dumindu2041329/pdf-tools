import { ilovepdf } from "./client"
import type { ILoveAPITool } from "./types"
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile"
export type { ILoveAPITool } from "./types"

// ── Single Tool Runner ───────────────────────────────────────

export interface ToolRunInput {
  tool: string
  files: Array<{
    buffer: Buffer
    filename: string
    password?: string
    rotate?: 0 | 90 | 180 | 270
  }>
  options?: Record<string, unknown>
  outputFilename?: string
  useWebhook?: boolean
}

export interface ToolRunResult {
  buffer: ArrayBuffer | Uint8Array
  downloadFilename: string
  outputFilesize: number
  timer: string
  taskId: string
  server: string
}

export async function runTool(input: ToolRunInput): Promise<ToolRunResult> {
  // Step 1: Start
  const task = ilovepdf.newTask(input.tool as ILoveAPITool)
  await task.start()

  // Step 2: Upload all files
  if (input.tool === "htmlpdf" && input.options?.url) {
    await task.addFile(input.options.url as string)
  } else {
    for (const f of input.files) {
      const file = ILovePDFFile.fromArray(Buffer.from(f.buffer), f.filename)
        
        // SDK specific assignments
        if (f.password) {
          (file as unknown as { params?: { password?: string } }).params = (file as unknown as { params?: { password?: string } }).params || {};
          (file as unknown as { params?: { password?: string } }).params!.password = f.password;
        }
        if (f.rotate !== undefined) {
          (file as unknown as { params?: { rotate?: number } }).params = (file as unknown as { params?: { rotate?: number } }).params || {};
          (file as unknown as { params?: { rotate?: number } }).params!.rotate = f.rotate;
        }
        
        await task.addFile(file)
    }
  }

  // Step 3: Process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processOptions: Record<string, any> = { ...input.options }
  // Ensure we don't pass 'url' property as a standard option which may cause API errors
  if (input.tool === "htmlpdf") {
      delete processOptions.url;
  }

  if (input.outputFilename) {
    processOptions.output_filename = input.outputFilename
  }
  
  await task.process(processOptions)

  // Step 4: Download
  let buffer = await task.download();

  // If pdfjpg and the buffer is a single JPG (not a ZIP), wrap it in a zip
  if (input.tool === "pdfjpg" && buffer.byteLength >= 2) {
    const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    const isZip = view[0] === 0x50 && view[1] === 0x4B && view[2] === 0x03 && view[3] === 0x04;
    
    if (!isZip) {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        // Determine the image name
        const imgName = input.outputFilename ? input.outputFilename.replace(/\.zip$/i, "") + ".jpg" : "image.jpg";
        zip.file(imgName, buffer);
        buffer = await zip.generateAsync({ type: "uint8array" });
      } catch (err) {
        console.error("Failed to wrap single JPG in ZIP:", err);
      }
    }
  }

  let downloadFilename = (task as unknown as { downloadFileName?: string }).downloadFileName || (task as unknown as { download_filename?: string }).download_filename || input.outputFilename || (input.tool === "pdfjpg" ? "output.zip" : "output.pdf");
  if (input.tool === "pdfjpg" && !downloadFilename.toLowerCase().endsWith(".zip")) {
    downloadFilename = downloadFilename.replace(/\.jpg$/i, "") + ".zip";
  }
  const outputFilesize = (task as unknown as { outputFileSize?: number }).outputFileSize || (task as unknown as { output_filesize?: number }).output_filesize || buffer.byteLength || (buffer as unknown as { length?: number }).length || 0;
  const timer = (task as unknown as { timer?: string }).timer || "0";
  const taskId = task.id;

  // Cleanup
  await task.delete();

  return {
    buffer: buffer,
    downloadFilename,
    outputFilesize,
    timer,
    taskId,
    server: "api.ilovepdf.com",
  };
}

// ── OCR Helper (for PDF→Office pipeline) ──────────────────────

export async function runPdfOcrForOffice(
  pdfBuffer: Buffer,
  filename: string,
  ocrLanguages: string[] = ["eng"]
): Promise<Uint8Array> {
  const task = ilovepdf.newTask("pdfocr" as ILoveAPITool)
  await task.start()

  const file = ILovePDFFile.fromArray(pdfBuffer, filename)
  await task.addFile(file)

  await task.process({ ocr_languages: ocrLanguages })

  const buffer = await task.download()
  await task.delete()

  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
}

// ── Workflow Runner (Chained Tools) ──────────────────────────

export interface WorkflowStep {
  tool: ILoveAPITool
  options: Record<string, unknown>
  label: string
}

export async function runWorkflow(
  initialFiles: Array<{ buffer: Buffer; filename: string }>,
  steps: WorkflowStep[],
  outputFilename?: string,
  onStepComplete?: (step: number, total: number) => void
): Promise<ToolRunResult> {
  if (steps.length === 0) throw new Error("No steps defined")

  // Start first task
  let currentTask = ilovepdf.newTask(steps[0].tool as ILoveAPITool)
  await currentTask.start()

  // Upload files
  for (const f of initialFiles) {
    const file = ILovePDFFile.fromArray(Buffer.from(f.buffer), f.filename)
    await currentTask.addFile(file)
  }

  // Process step 0
  await currentTask.process(steps[0].options)
  onStepComplete?.(1, steps.length)

  // Chain remaining steps
  for (let i = 1; i < steps.length; i++) {
    const stepOptions: Record<string, unknown> = { ...steps[i].options }
    if (i === steps.length - 1 && outputFilename) {
      stepOptions.output_filename = outputFilename
    }
    // @ts-expect-error SDK connect expects ILovePDFTool, we use ILoveAPITool which is a superset
    currentTask = await currentTask.connect(steps[i].tool as ILoveAPITool as unknown as string)
    await currentTask.process(stepOptions)
    onStepComplete?.(i + 1, steps.length)
  }

  // Download final result
  const buffer = await currentTask.download()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadFilename = (currentTask as any).downloadFileName || (currentTask as any).download_filename || outputFilename || "workflow_output.pdf";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputFilesize = (currentTask as any).outputFileSize || (currentTask as any).output_filesize || buffer.byteLength || (buffer as any).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timer = (currentTask as any).timer || "0";
  const taskId = currentTask.id;

  await currentTask.delete()

  return {
    buffer: buffer,
    downloadFilename,
    outputFilesize,
    timer,
    taskId,
    server: "api.ilovepdf.com",
  }
}

