import { ilovepdf } from "./client"
import type { ILoveAPITool } from "./types"
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile"

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
  buffer: ArrayBuffer
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

  // Step 2: Upload all files or use URL for HTML to PDF
  if (input.tool === "htmlpdf" && input.options?.url && input.files.length === 0) {
    const url = input.options.url as string;
    await task.addFile(url);
  } else {
    for (const f of input.files) {
      const file = ILovePDFFile.fromArray(Buffer.from(f.buffer), f.filename)
      
      // SDK specific assignments
      if (f.password) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (file as any).params = (file as any).params || {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (file as any).params.password = f.password;
      }
      if (f.rotate !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (file as any).params = (file as any).params || {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (file as any).params.rotate = f.rotate;
      }
      
      await task.addFile(file)
    }
  }

  // Step 3: Process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processOptions: Record<string, any> = { ...input.options }
  if (input.outputFilename) {
    processOptions.output_filename = input.outputFilename
  }
  
  const processResult = await task.process(processOptions)

  // Step 4: Download
  const buffer = await task.download()

  // Cleanup
  await task.delete()

  return {
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, // Convert Uint8Array to ArrayBuffer cleanly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    downloadFilename: (processResult as any).download_filename ?? input.outputFilename ?? "output.pdf",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outputFilesize: (processResult as any).output_filesize ?? buffer.byteLength,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timer: (processResult as any).timer ?? "0",
    taskId: task.id,
    server: "api.ilovepdf.com", // Abstracted away in SDK
  }
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
  onStepComplete?: (step: number, total: number) => void
): Promise<{ buffer: ArrayBuffer; downloadFilename: string }> {
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
    currentTask = await currentTask.connect(steps[i].tool as ILoveAPITool)
    await currentTask.process(steps[i].options)
    onStepComplete?.(i + 1, steps.length)
  }

  // Download final result
  const buffer = await currentTask.download()
  await currentTask.delete()

  return {
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    downloadFilename: "workflow_output.pdf",
  }
}

