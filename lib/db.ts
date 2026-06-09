import { neon } from "@neondatabase/serverless"

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}

export const sql = neon(DATABASE_URL)

const globalForSchema = globalThis as unknown as {
  __pdfToolsSchemaInitPromise?: Promise<void>
}

export async function ensureDbSchema(): Promise<void> {
  if (!globalForSchema.__pdfToolsSchemaInitPromise) {
    globalForSchema.__pdfToolsSchemaInitPromise = (async () => {
      await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`

      await sql`
        CREATE TABLE IF NOT EXISTS app_user (
          clerk_user_id text PRIMARY KEY,
          plan text NOT NULL DEFAULT 'free',
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `

      await sql`
        CREATE TABLE IF NOT EXISTS workflow (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id text NOT NULL REFERENCES app_user(clerk_user_id) ON DELETE CASCADE,
          name text NOT NULL,
          last_run timestamptz,
          run_count int NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `

      await sql`
        CREATE TABLE IF NOT EXISTS workflow_step (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id uuid NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
          step_index int NOT NULL,
          tool_slug text NOT NULL,
          label text NOT NULL,
          options jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (workflow_id, step_index)
        )
      `

      await sql`
        CREATE TABLE IF NOT EXISTS usage_counter (
          user_id text PRIMARY KEY REFERENCES app_user(clerk_user_id) ON DELETE CASCADE,
          daily_count int NOT NULL DEFAULT 0,
          daily_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
          monthly_count int NOT NULL DEFAULT 0,
          monthly_year_month text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM'),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `

      await sql`CREATE INDEX IF NOT EXISTS workflow_user_created_at_idx ON workflow (user_id, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS workflow_step_workflow_step_index_idx ON workflow_step (workflow_id, step_index)`
      await sql`CREATE INDEX IF NOT EXISTS usage_counter_daily_date_idx ON usage_counter (daily_date)`
    })()
  }

  await globalForSchema.__pdfToolsSchemaInitPromise
}

/**
 * Clears the cached schema-init promise. Call this when an operation fails
 * with a missing-relation error so the next caller re-runs the DDL and
 * recreates tables that were dropped externally (e.g. via the Neon console).
 */
export function resetSchemaInit(): void {
  globalForSchema.__pdfToolsSchemaInitPromise = undefined
}

/**
 * Returns true if the error indicates a missing Postgres relation
 * (e.g. `relation "usage_counter" does not exist`). The driver's error has
 * a `.code` property of `42P01` for `undefined_table`.
 */
export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: unknown }).code
  if (code === "42P01") return true
  // Some drivers surface the SQLSTATE on a nested field
  const sqlState = (err as { sqlState?: unknown }).sqlState
  return sqlState === "42P01"
}

export async function upsertUser(clerkUserId: string): Promise<void> {
  await ensureDbSchema()
  await sql`
    INSERT INTO app_user (clerk_user_id)
    VALUES (${clerkUserId})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `
}

export async function setUserPlan(
  clerkUserId: string,
  plan: "free" | "premium"
): Promise<void> {
  await ensureDbSchema()
  // UPSERT: create the app_user row if it doesn't exist, otherwise update
  // the plan. This ensures the DB always reflects the latest plan even when
  // the user has never triggered an INSERT (e.g. they upgraded before ever
  // processing a file or creating a workflow).
  await sql`
    INSERT INTO app_user (clerk_user_id, plan)
    VALUES (${clerkUserId}, ${plan})
    ON CONFLICT (clerk_user_id) DO UPDATE
    SET plan = EXCLUDED.plan
  `
}

export async function getUserPlanFromDb(
  clerkUserId: string
): Promise<"free" | "premium" | null> {
  await ensureDbSchema()
  const rows = (await sql`
    SELECT plan FROM app_user WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `) as Array<{ plan: "free" | "premium" }>
  return rows[0]?.plan ?? null
}
