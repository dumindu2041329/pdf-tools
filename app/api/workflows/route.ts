import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  createWorkflow,
  listWorkflows,
  upsertUser,
  type WorkflowListItem,
  type WorkflowStepInput,
} from "@/lib/db"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function parseSteps(value: unknown): Array<{ tool: string; label: string }> | null {
  if (!Array.isArray(value)) return null
  const steps: Array<{ tool: string; label: string }> = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const tool = typeof item.tool === "string" ? item.tool : ""
    const label = typeof item.label === "string" ? item.label : ""
    if (!tool || !label) return null
    steps.push({ tool, label })
  }
  return steps
}

function serializeSteps(
  steps: Array<{ tool: string; label: string }>
): WorkflowStepInput[] {
  return steps.map((s, index) => ({ index, tool: s.tool, label: s.label }))
}

function normalizeLastRun(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  return null
}

function normalizeWorkflow(item: WorkflowListItem) {
  return {
    id: typeof item.id === "string" ? item.id : "",
    name: typeof item.name === "string" ? item.name : "",
    steps: Array.isArray(item.steps)
      ? item.steps
          .map((s) => {
            if (!isRecord(s)) return null
            const tool = typeof s.tool === "string" ? s.tool : ""
            const label = typeof s.label === "string" ? s.label : ""
            if (!tool || !label) return null
            return { tool, label }
          })
          .filter((s): s is { tool: string; label: string } => s !== null)
      : [],
    lastRun: normalizeLastRun(item.last_run),
    runCount:
      typeof item.run_count === "number"
        ? item.run_count
        : toNumber(item.run_count, 0),
    createdAt: toNumber(item.created_at_ms, Date.now()),
  }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await upsertUser(userId)

  const rows = await listWorkflows(userId)
  const workflows = rows.map(normalizeWorkflow)

  return NextResponse.json({ workflows })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const steps = parseSteps(body.steps)

  if (!name || !steps || steps.length === 0) {
    return NextResponse.json({ error: "name and steps are required" }, { status: 400 })
  }

  await upsertUser(userId)

  const created = await createWorkflow(userId, name, serializeSteps(steps))

  return NextResponse.json({
    workflow: {
      id: created && typeof created.id === "string" ? created.id : "",
      name: created && typeof created.name === "string" ? created.name : name,
      steps,
      lastRun: created ? normalizeLastRun(created.last_run) : null,
      runCount: created
        ? typeof created.run_count === "number"
          ? created.run_count
          : toNumber(created.run_count, 0)
        : 0,
      createdAt: created
        ? toNumber(created.created_at_ms, Date.now())
        : Date.now(),
    },
  })
}
