// lib/db.ts
// Supabase-backed database layer.
//
// The schema (tables + stored procedures) is managed via the
// `create_pdf_tools_schema` and `create_pdf_tools_rpcs` Supabase
// migrations. The DDL is no longer run from the app — Supabase is the
// source of truth. This file only contains the runtime helpers that
// wrap Supabase calls and the (mostly vestigial) self-heal chain.

import { getSupabaseServer } from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Self-heal chain (kept for compatibility with existing callers).
// `ensureDbSchema()` is a no-op now that schema is managed externally.
// `ensureDbSchemaIfStale()` still calls the `pdf_tools_health_check()` RPC
// once per hour per server instance and logs a warning if any table is
// missing — but it can no longer recreate the schema on its own. The
// reactive `isMissingRelationError` / `resetSchemaInit` pair continues to
// work for callers that want to retry on transient schema errors.
// ---------------------------------------------------------------------------

const globalForSchema = globalThis as unknown as {
  __pdfToolsSchemaInitPromise?: Promise<void>
}

export async function ensureDbSchema(): Promise<void> {
  if (!globalForSchema.__pdfToolsSchemaInitPromise) {
    globalForSchema.__pdfToolsSchemaInitPromise = (async () => {
      // Schema is created via the `create_pdf_tools_schema` Supabase
      // migration. No DDL is run from the app.
    })()
  }
  await globalForSchema.__pdfToolsSchemaInitPromise
}

export function resetSchemaInit(): void {
  globalForSchema.__pdfToolsSchemaInitPromise = undefined
}

/**
 * Returns true if the error indicates a missing Postgres relation
 * (e.g. `relation "usage_counter" does not exist`). The Supabase /
 * PostgREST driver surfaces the SQLSTATE on `code` / `sqlState` as
 * `42P01` for `undefined_table`.
 */
export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: unknown }).code
  if (code === "42P01") return true
  const sqlState = (err as { sqlState?: unknown }).sqlState
  if (sqlState === "42P01") return true
  return false
}

const globalForHealthCheck = globalThis as unknown as {
  __pdfToolsHealthLastCheckAt?: number
  __pdfToolsHealthCheckPromise?: Promise<void>
}

const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Proactive self-heal. Once per hour per server instance, calls the
 * `pdf_tools_health_check()` RPC and logs a warning if any expected
 * table is missing. The schema is owned by Supabase migrations now, so
 * this function only logs — it cannot recreate the tables on its own.
 */
export function ensureDbSchemaIfStale(): void {
  const now = Date.now()
  if (
    globalForHealthCheck.__pdfToolsHealthLastCheckAt !== undefined &&
    now - globalForHealthCheck.__pdfToolsHealthLastCheckAt < HEALTH_CHECK_INTERVAL_MS
  ) {
    return
  }
  if (globalForHealthCheck.__pdfToolsHealthCheckPromise) return
  globalForHealthCheck.__pdfToolsHealthCheckPromise = (async () => {
    try {
      const allExist = await runHealthCheck()
      globalForHealthCheck.__pdfToolsHealthLastCheckAt = now
      if (!allExist) {
        console.warn(
          "[db] self-heal: missing tables detected; re-run the create_pdf_tools_schema migration in Supabase"
        )
        resetSchemaInit()
      }
    } catch (err) {
      console.error("[db] self-heal health check failed:", err)
    } finally {
      globalForHealthCheck.__pdfToolsHealthCheckPromise = undefined
    }
  })()
}

async function runHealthCheck(): Promise<boolean> {
  try {
    await ensureDbSchema()
    const supabase = getSupabaseServer()
    const { data, error } = await supabase.rpc("pdf_tools_health_check")
    if (error) {
      console.error("[db] runHealthCheck failed:", error)
      return true
    }
    const rows = (data ?? []) as Array<{ table_exists: boolean }>
    if (rows.length === 0) return true
    return rows.every((r) => r.table_exists === true)
  } catch (err) {
    console.error("[db] runHealthCheck failed:", err)
    return true
  }
}

// ---------------------------------------------------------------------------
// User / plan helpers
// ---------------------------------------------------------------------------

export async function upsertUser(clerkUserId: string): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase
    .from("app_user")
    .upsert(
      { clerk_user_id: clerkUserId },
      { onConflict: "clerk_user_id", ignoreDuplicates: true }
    )
  if (error) throw error
}

export async function setUserPlan(
  clerkUserId: string,
  plan: "free" | "premium"
): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase
    .from("app_user")
    .upsert(
      { clerk_user_id: clerkUserId, plan },
      { onConflict: "clerk_user_id" }
    )
  if (error) throw error
}

export async function getUserPlanFromDb(
  clerkUserId: string
): Promise<"free" | "premium" | null> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from("app_user")
    .select("plan")
    .eq("clerk_user_id", clerkUserId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const plan = (data as { plan: string | null }).plan
  return plan === "free" || plan === "premium" ? plan : null
}

// ---------------------------------------------------------------------------
// Usage counter helpers
// ---------------------------------------------------------------------------

export interface CounterCounts {
  daily: number
  monthly: number
}

/**
 * Fast O(1) read from the denormalized usage_counter table.
 * Returns 0s if no row exists (new user) — the counter is created on the
 * first successful processing event. All date math uses explicit UTC.
 */
export async function readUsageCounter(userId: string): Promise<CounterCounts> {
  try {
    await ensureDbSchema()
    const supabase = getSupabaseServer()
    const { data, error } = await supabase.rpc("pdf_tools_read_counter", {
      p_user_id: userId,
    })
    if (error) throw error
    const rows = (data ?? []) as Array<{ daily: number; monthly: number }>
    if (rows.length === 0) return { daily: 0, monthly: 0 }
    const row = rows[0]
    return {
      daily: Number(row.daily) || 0,
      monthly: Number(row.monthly) || 0,
    }
  } catch (err) {
    console.error("[db] readUsageCounter failed:", err)
    return { daily: 0, monthly: 0 }
  }
}

/**
 * Atomically upserts the denormalized usage_counter. Only `success`
 * events count; `error` events still ensure the `app_user` row exists
 * (so the FK on `usage_counter.user_id` doesn't fail on a later insert)
 * but do not bump the counter. The counter resets automatically when
 * `daily_date` / `monthly_year_month` change. All date math uses UTC.
 */
export async function recordUsageEvent(
  userId: string,
  status: "success" | "error"
): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase.rpc("pdf_tools_record_usage_event", {
    p_user_id: userId,
    p_status: status,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Workflow helpers
// ---------------------------------------------------------------------------

export interface WorkflowStepInput {
  index: number
  tool: string
  label: string
}

export interface WorkflowListItem {
  id: string
  name: string
  last_run: string | null
  run_count: number | string
  created_at_ms: string | number
  steps: Array<{ tool: string; label: string }>
}

/**
 * Lists all workflows for the given user (newest first) with their
 * ordered steps. Returns an empty array when the user has none.
 */
export async function listWorkflows(userId: string): Promise<WorkflowListItem[]> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase.rpc("pdf_tools_list_workflows", {
    p_user_id: userId,
  })
  if (error) throw error
  if (!data) return []
  // PostgREST unwraps a jsonb scalar return — handle both shapes.
  const value = Array.isArray(data) && data.length === 1 && Array.isArray(data[0])
    ? data[0]
    : data
  if (!Array.isArray(value)) return []
  return value as WorkflowListItem[]
}

/**
 * Returns a single workflow owned by the given user, or null when not
 * found. Steps are returned in `step_index` order.
 */
export async function getWorkflow(
  userId: string,
  id: string
): Promise<WorkflowListItem | null> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase.rpc("pdf_tools_get_workflow", {
    p_user_id: userId,
    p_id: id,
  })
  if (error) throw error
  if (!data) return null
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== "object") return null
  return value as WorkflowListItem
}

/**
 * Creates a workflow + its ordered steps in a single RPC. Returns the
 * created workflow row (without steps — the caller already has them).
 */
export async function createWorkflow(
  userId: string,
  name: string,
  steps: WorkflowStepInput[]
): Promise<WorkflowListItem | null> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase.rpc("pdf_tools_create_workflow", {
    p_user_id: userId,
    p_name: name,
    p_steps: steps as unknown as never,
  })
  if (error) throw error
  if (!data) return null
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== "object") return null
  return value as WorkflowListItem
}

/**
 * Updates a workflow's name and/or replaces its steps. Pass `undefined`
 * for either parameter to leave that field untouched.
 */
export async function updateWorkflow(
  userId: string,
  id: string,
  name: string | undefined,
  steps: WorkflowStepInput[] | undefined
): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase.rpc("pdf_tools_update_workflow", {
    p_user_id: userId,
    p_id: id,
    p_name: name ?? null,
    p_steps: (steps ?? null) as unknown as never,
  })
  if (error) throw error
}

export async function deleteWorkflow(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase.rpc("pdf_tools_delete_workflow", {
    p_user_id: userId,
    p_id: id,
  })
  if (error) throw error
}

export async function runWorkflow(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase.rpc("pdf_tools_run_workflow", {
    p_user_id: userId,
    p_id: id,
  })
  if (error) throw error
}
