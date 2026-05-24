import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ensureDbSchema, sql, upsertUser } from "@/lib/db"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asRowArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
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

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDbSchema()
  await upsertUser(userId)

  const rawRows = (await sql`
    SELECT
      w.id::text AS id,
      w.name,
      w.last_run::text AS last_run,
      w.run_count,
      (extract(epoch from w.created_at) * 1000)::bigint::text AS created_at_ms,
      COALESCE(
        json_agg(
          json_build_object('tool', s.tool_slug, 'label', s.label)
          ORDER BY s.step_index
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'::json
      ) AS steps
    FROM workflow w
    LEFT JOIN workflow_step s ON s.workflow_id = w.id
    WHERE w.user_id = ${userId}
    GROUP BY w.id
    ORDER BY w.created_at DESC
  `) as unknown

  const rows = asRowArray(rawRows)
  const workflows = rows.map((r) => {
    const steps = Array.isArray(r.steps)
      ? r.steps
          .map((s) => {
            if (!isRecord(s)) return null
            const tool = typeof s.tool === "string" ? s.tool : ""
            const label = typeof s.label === "string" ? s.label : ""
            if (!tool || !label) return null
            return { tool, label }
          })
          .filter((s): s is { tool: string; label: string } => s !== null)
      : []
    return {
      id: typeof r.id === "string" ? r.id : "",
      name: typeof r.name === "string" ? r.name : "",
      steps,
      lastRun: r.last_run === null ? null : typeof r.last_run === "string" ? r.last_run : null,
      runCount: typeof r.run_count === "number" ? r.run_count : toNumber(r.run_count, 0),
      createdAt: toNumber(r.created_at_ms, Date.now()),
    }
  })

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

  await ensureDbSchema()
  await upsertUser(userId)

  const stepsJson = JSON.stringify(
    steps.map((s, index) => ({ index, tool: s.tool, label: s.label }))
  )

  const rawRows = (await sql`
    WITH inserted AS (
      INSERT INTO workflow (user_id, name)
      VALUES (${userId}, ${name})
      RETURNING id, name, last_run, run_count, created_at
    ), inserted_steps AS (
      INSERT INTO workflow_step (workflow_id, step_index, tool_slug, label)
      SELECT
        inserted.id,
        (step->>'index')::int,
        step->>'tool',
        step->>'label'
      FROM inserted, jsonb_array_elements(${stepsJson}::jsonb) AS step
      RETURNING 1
    )
    SELECT
      inserted.id::text AS id,
      inserted.name,
      inserted.last_run::text AS last_run,
      inserted.run_count,
      (extract(epoch from inserted.created_at) * 1000)::bigint::text AS created_at_ms
    FROM inserted
  `) as unknown

  const row = asRowArray(rawRows)[0]
  const createdAt = toNumber(row?.created_at_ms, Date.now())

  return NextResponse.json({
    workflow: {
      id: typeof row?.id === "string" ? row.id : "",
      name: typeof row?.name === "string" ? row.name : name,
      steps,
      lastRun: row?.last_run === null ? null : typeof row?.last_run === "string" ? row.last_run : null,
      runCount: typeof row?.run_count === "number" ? row.run_count : toNumber(row?.run_count, 0),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    },
  })
}
