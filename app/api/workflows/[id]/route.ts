import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  deleteWorkflow,
  getWorkflow,
  updateWorkflow,
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
    lastRun: item.last_run === null ? null : typeof item.last_run === "string" ? item.last_run : null,
    runCount:
      typeof item.run_count === "number"
        ? item.run_count
        : toNumber(item.run_count, 0),
    createdAt: toNumber(item.created_at_ms, Date.now()),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await upsertUser(userId)

  const row = await getWorkflow(userId, id)
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ workflow: normalizeWorkflow(row) })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined
  const steps = body.steps === undefined ? undefined : parseSteps(body.steps)

  if (steps === null) {
    return NextResponse.json({ error: "Invalid steps" }, { status: 400 })
  }

  if (!name && !steps) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  await upsertUser(userId)

  await updateWorkflow(
    userId,
    id,
    name,
    steps ? serializeSteps(steps) : undefined
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await upsertUser(userId)
  await deleteWorkflow(userId, id)

  return NextResponse.json({ ok: true })
}
