export interface WorkflowStep {
  tool: string
  label: string
}

export interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  lastRun: string | null
  runCount: number
  createdAt: number
}

const STORAGE_KEY = "pdf-tools-workflows"
const MAX_WORKFLOWS = 100

function readWorkflows(): Workflow[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Workflow[]) : []
  } catch {
    return []
  }
}

function writeWorkflows(workflows: Workflow[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows))
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function createWorkflow(
  name: string,
  steps: WorkflowStep[]
): Workflow {
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    name,
    steps,
    lastRun: null,
    runCount: 0,
    createdAt: Date.now(),
  }

  const workflows = readWorkflows()
  workflows.unshift(workflow)
  if (workflows.length > MAX_WORKFLOWS) {
    workflows.length = MAX_WORKFLOWS
  }
  writeWorkflows(workflows)

  notifyWorkflowsUpdate()
  return workflow
}

export function updateWorkflow(
  id: string,
  updates: Partial<Omit<Workflow, "id" | "createdAt">>
): Workflow | null {
  const workflows = readWorkflows()
  const index = workflows.findIndex((w) => w.id === id)
  if (index === -1) return null

  workflows[index] = { ...workflows[index], ...updates }
  writeWorkflows(workflows)
  notifyWorkflowsUpdate()
  return workflows[index]
}

export function deleteWorkflow(id: string): boolean {
  const workflows = readWorkflows()
  const initialLength = workflows.length
  const filtered = workflows.filter((w) => w.id !== id)
  if (filtered.length === initialLength) return false

  writeWorkflows(filtered)
  notifyWorkflowsUpdate()
  return true
}

export function getWorkflows(): Workflow[] {
  return readWorkflows()
}

export function getWorkflowById(id: string): Workflow | null {
  return readWorkflows().find((w) => w.id === id) ?? null
}

export function runWorkflow(id: string): Workflow | null {
  const workflow = updateWorkflow(id, {
    lastRun: new Date().toISOString(),
    runCount: (getWorkflowById(id)?.runCount ?? 0) + 1,
  })
  return workflow
}

function notifyWorkflowsUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("workflows-update"))
  }
}
