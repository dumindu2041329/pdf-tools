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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

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
      AND w.id = (${id})::uuid
    GROUP BY w.id
    LIMIT 1
  `) as unknown

  const row = asRowArray(rawRows)[0]
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const createdAt = toNumber(row.created_at_ms, Date.now())
  const steps = Array.isArray(row.steps)
    ? row.steps
        .map((s) => {
          if (!isRecord(s)) return null
          const tool = typeof s.tool === "string" ? s.tool : ""
          const label = typeof s.label === "string" ? s.label : ""
          if (!tool || !label) return null
          return { tool, label }
        })
        .filter((s): s is { tool: string; label: string } => s !== null)
    : []

  return NextResponse.json({
    workflow: {
      id: typeof row.id === "string" ? row.id : "",
      name: typeof row.name === "string" ? row.name : "",
      steps,
      lastRun: row.last_run === null ? null : typeof row.last_run === "string" ? row.last_run : null,
      runCount: typeof row.run_count === "number" ? row.run_count : toNumber(row.run_count, 0),
      createdAt,
    },
  })
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

  await ensureDbSchema()
  await upsertUser(userId)

  if (steps) {
    const stepsJson = JSON.stringify(
      steps.map((s, index) => ({ index, tool: s.tool, label: s.label }))
    )
    await sql`
      WITH updated AS (
        UPDATE workflow
        SET name = COALESCE(${name ?? null}, name),
            updated_at = now()
        WHERE user_id = ${userId}
          AND id = (${id})::uuid
        RETURNING id
      ), deleted AS (
        DELETE FROM workflow_step
        WHERE workflow_id = (SELECT id FROM updated)
        RETURNING 1
      ), inserted AS (
        INSERT INTO workflow_step (workflow_id, step_index, tool_slug, label)
        SELECT
          updated.id,
          (step->>'index')::int,
          step->>'tool',
          step->>'label'
        FROM updated, jsonb_array_elements(${stepsJson}::jsonb) AS step
        RETURNING 1
      )
      SELECT 1
    `
  } else if (name) {
    await sql`
      UPDATE workflow
      SET name = ${name},
          updated_at = now()
      WHERE user_id = ${userId}
        AND id = (${id})::uuid
    `
  }

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

  await ensureDbSchema()
  await upsertUser(userId)

  await sql`
    DELETE FROM workflow
    WHERE user_id = ${userId}
      AND id = (${id})::uuid
  `

  return NextResponse.json({ ok: true })
}
