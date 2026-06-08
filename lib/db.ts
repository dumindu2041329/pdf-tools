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
        CREATE TABLE IF NOT EXISTS usage_event (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id text NOT NULL REFERENCES app_user(clerk_user_id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'success',
          tool_slug text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at)
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

      // Partition management: ensure monthly partitions exist for [-1, monthsAhead]
      // Safe to call repeatedly — uses CREATE TABLE IF NOT EXISTS under the hood.
      await sql`
        CREATE OR REPLACE FUNCTION ensure_usage_event_partitions(months_ahead int DEFAULT 3)
        RETURNS text[] AS $func$
        DECLARE
          start_date date;
          end_date date;
          partition_name text;
          created_names text[] := '{}';
          i int;
        BEGIN
          -- Use explicit UTC for the reference "today" so partition creation
          -- is consistent regardless of the session timezone.
          FOR i IN -1..months_ahead LOOP
            start_date := date_trunc('month', ((now() AT TIME ZONE 'UTC')::date + (i || ' months')::interval))::date;
            end_date := (start_date + interval '1 month')::date;
            partition_name := 'usage_event_' || to_char(start_date, 'YYYY_MM');
            EXECUTE format(
              'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_event FOR VALUES FROM (%L) TO (%L)',
              partition_name, start_date, end_date
            );
            created_names := array_append(created_names, partition_name);
          END LOOP;
          EXECUTE 'CREATE TABLE IF NOT EXISTS usage_event_default PARTITION OF usage_event DEFAULT';
          RETURN created_names;
        END;
        $func$ LANGUAGE plpgsql
      `

      // Retention: drop entire monthly partitions whose end-of-month <= cutoff
      // (much faster than DELETE for old data)
      await sql`
        CREATE OR REPLACE FUNCTION drop_old_usage_event_partitions(retention_days int DEFAULT 90)
        RETURNS text[] AS $func$
        DECLARE
          cutoff_date date := (now() - (retention_days || ' days')::interval)::date;
          part_rec record;
          part_start date;
          part_end date;
          dropped text[] := '{}';
        BEGIN
          FOR part_rec IN
            SELECT c.relname AS part_name
            FROM pg_inherits i
            JOIN pg_class c ON c.oid = i.inhrelid
            WHERE i.inhparent = 'usage_event'::regclass
              AND c.relname ~ '^usage_event_[0-9]{4}_[0-9]{2}$'
          LOOP
            part_start := to_date(substring(part_rec.part_name from 13 for 7), 'YYYY_MM');
            part_end := (part_start + interval '1 month')::date;
            IF part_end <= cutoff_date THEN
              EXECUTE format('DROP TABLE IF EXISTS %I', part_rec.part_name);
              dropped := array_append(dropped, part_rec.part_name);
            END IF;
          END LOOP;
          RETURN dropped;
        END;
        $func$ LANGUAGE plpgsql
      `

      // Retention: delete old rows from the default partition (catches data with
      // unexpected timestamps that landed there)
      await sql`
        CREATE OR REPLACE FUNCTION cleanup_usage_event_default(retention_days int DEFAULT 90)
        RETURNS int AS $func$
        DECLARE
          deleted int;
        BEGIN
          EXECUTE 'DELETE FROM usage_event_default WHERE created_at < $1'
            USING (now() - (retention_days || ' days')::interval);
          GET DIAGNOSTICS deleted = ROW_COUNT;
          RETURN deleted;
        END;
        $func$ LANGUAGE plpgsql
      `

      // Composite: ensures partitions, drops expired ones, cleans default
      await sql`
        CREATE OR REPLACE FUNCTION run_usage_event_retention(retention_days int DEFAULT 90, months_ahead int DEFAULT 3)
        RETURNS TABLE(action text, target text, detail text) AS $func$
        DECLARE
          dropped_parts text[];
          deleted_rows int;
          ensured_parts text[];
          p text;
        BEGIN
          ensured_parts := ensure_usage_event_partitions(months_ahead);
          FOREACH p IN ARRAY ensured_parts LOOP
            action := 'ensure_partition'; target := p; detail := 'ensured'; RETURN NEXT;
          END LOOP;
          dropped_parts := drop_old_usage_event_partitions(retention_days);
          FOREACH p IN ARRAY dropped_parts LOOP
            action := 'drop_partition'; target := p; detail := 'older than ' || retention_days || ' days'; RETURN NEXT;
          END LOOP;
          deleted_rows := cleanup_usage_event_default(retention_days);
          action := 'delete_from_default'; target := 'usage_event_default';
          detail := deleted_rows || ' rows older than ' || retention_days || ' days deleted';
          RETURN NEXT;
        END;
        $func$ LANGUAGE plpgsql
      `

      // Initial partition creation (no-op if they already exist)
      await sql`SELECT ensure_usage_event_partitions(3)`

      await sql`CREATE INDEX IF NOT EXISTS workflow_user_created_at_idx ON workflow (user_id, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS workflow_step_workflow_step_index_idx ON workflow_step (workflow_id, step_index)`
      // Indexes on partitioned parent are propagated to all partitions automatically
      await sql`CREATE INDEX IF NOT EXISTS usage_event_user_created_at_idx ON usage_event (user_id, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS usage_event_user_tool_created_at_idx ON usage_event (user_id, tool_slug, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS usage_counter_daily_date_idx ON usage_counter (daily_date)`
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
  const rows = (await sql`
    SELECT plan FROM app_user WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `) as Array<{ plan: "free" | "premium" }>
  return rows[0]?.plan ?? null
}

export interface RetentionLogEntry {
  action: string
  target: string
  detail: string
}

/**
 * Runs the composite retention routine: ensures monthly partitions exist
 * (for [previous month, current + monthsAhead]), drops partitions whose
 * entire range is older than retentionDays, and deletes old rows from the
 * default partition. Returns a log of actions taken.
 */
export async function runUsageEventRetention(
  retentionDays = 90,
  monthsAhead = 3
): Promise<RetentionLogEntry[]> {
  await ensureDbSchema()
  const rows = (await sql`
    SELECT action, target, detail
    FROM run_usage_event_retention(${retentionDays}, ${monthsAhead})
  `) as RetentionLogEntry[]
  return rows
}
