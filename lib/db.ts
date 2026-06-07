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

      await sql`CREATE INDEX IF NOT EXISTS workflow_user_created_at_idx ON workflow (user_id, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS workflow_step_workflow_step_index_idx ON workflow_step (workflow_id, step_index)`
    })()
  }

  await globalForSchema.__pdfToolsSchemaInitPromise
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
  await sql`
    UPDATE app_user
    SET plan = ${plan}
    WHERE clerk_user_id = ${clerkUserId}
  `
}

export async function getUserPlanFromDb(
  clerkUserId: string
): Promise<"free" | "premium" | null> {
  await ensureDbSchema()
  const rows = await sql<{ plan: "free" | "premium" }[]>`
    SELECT plan FROM app_user WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `
  return rows[0]?.plan ?? null
}
