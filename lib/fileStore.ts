import { randomUUID } from "crypto"
import { ensureDbSchema, sql, upsertUser } from "@/lib/db"

interface StoredFile {
  buffer: Uint8Array
  filename: string
  contentType: string
}

function firstRow(rows: unknown): Record<string, unknown> | null {
  if (!Array.isArray(rows)) return null
  const row = rows[0]
  if (typeof row !== "object" || row === null) return null
  return row as Record<string, unknown>
}

export function storeFile(
  buffer: Uint8Array | ArrayBuffer,
  filename: string,
  contentType = "application/pdf",
  options?: { userId?: string | null; eventId?: string | null; expiresAt?: Date | null }
): Promise<string> {
  return (async () => {
    await ensureDbSchema()
    if (options?.userId) {
      await upsertUser(options.userId)
    }

    const id = randomUUID()
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const bytes = Buffer.from(data)
    const expiresAt = options?.expiresAt ? options.expiresAt.toISOString() : null

    const rows = (await sql`
      INSERT INTO download_file (
        id,
        user_id,
        event_id,
        filename,
        content_type,
        size_bytes,
        bytes,
        expires_at
      )
      VALUES (
        (${id})::uuid,
        ${options?.userId ?? null},
        (${options?.eventId ?? null})::uuid,
        ${filename},
        ${contentType},
        ${bytes.byteLength},
        ${bytes},
        ${expiresAt}
      )
      RETURNING id::text AS id
    `) as unknown

    const insertedId = firstRow(rows)?.id
    return typeof insertedId === "string" ? insertedId : id
  })()
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  await ensureDbSchema()

  const rows = (await sql`
    SELECT bytes, filename, content_type
    FROM download_file
    WHERE id = ${id}::uuid
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  `) as unknown

  const row = firstRow(rows)
  if (!row) return undefined

  const bytes = row.bytes
  const filename = row.filename
  const contentType = row.content_type
  if (!(bytes instanceof Uint8Array)) return undefined
  if (typeof filename !== "string") return undefined
  if (typeof contentType !== "string") return undefined

  return {
    buffer: bytes,
    filename,
    contentType,
  }
}

export async function deleteFile(id: string): Promise<void> {
  await ensureDbSchema()
  await sql`DELETE FROM download_file WHERE id = ${id}::uuid`
}
