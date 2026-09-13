import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { ilovepdf } from "@/lib/iloveapi/client"
import { createSignatureRequest } from "@/lib/iloveapi/signature"
import type { CreateSignatureOptions } from "@/lib/iloveapi/signature"
import { getClientIp, rateLimitKey, toolLimiter } from "@/lib/ratelimit"
import ILovePDFFile from "@ilovepdf/ilovepdf-nodejs/ILovePDFFile"

/**
 * Only these request-body `options` keys are forwarded to the iLoveAPI
 * signature request. Spreading a client-supplied object into the
 * upstream payload is a mass-assignment risk: a caller could override
 * the server-controlled `task`, `files`, or `signers` fields (e.g. point
 * the signature at someone else's task).
 */
const ALLOWED_SIGN_OPTION_KEYS: Set<string> = new Set([
  "lock_order",
  "expiration_days",
  "message_signer",
  "subject_signer",
  "uuid_visible",
  "signer_reminders",
  "signer_reminder_days_cycle",
  "verify_enabled",
])

function pickSignOptions(raw: unknown): Partial<CreateSignatureOptions> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const picked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ALLOWED_SIGN_OPTION_KEYS.has(key)) picked[key] = value
  }
  return picked as Partial<CreateSignatureOptions>
}

const MAX_SIGNERS = 50

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Burst protection — /sign burns iLoveAPI credits per request.
  const rl = await toolLimiter.limit(rateLimitKey(userId, getClientIp(req)))
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let task: any = null;

  try {
    let formData: FormData
    try {
      const bodyBuffer = await req.arrayBuffer()
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: bodyBuffer
      })
      formData = await newReq.formData()
    } catch (err) {
      console.error("FormData parse error (often due to cancelled XHR or broken upload):", err)
      return NextResponse.json({ error: "Failed to parse file upload request" }, { status: 400 })
    }

    const fileRaw = formData.get("file")
    if (!fileRaw || typeof fileRaw === "string" || !("arrayBuffer" in fileRaw)) {
      return NextResponse.json({ error: "No valid file provided" }, { status: 400 })
    }
    const file = fileRaw as File
    const signersRaw = formData.get("signers") as string
    const optionsRaw = formData.get("options") as string

    let signers: unknown
    let options: unknown
    try {
      signers = JSON.parse(signersRaw || "[]")
      options = JSON.parse(optionsRaw || "{}")
    } catch {
      return NextResponse.json({ error: "Invalid signers/options payload" }, { status: 400 })
    }

    if (!Array.isArray(signers) || signers.length === 0) {
      return NextResponse.json({ error: "At least one signer is required" }, { status: 400 })
    }
    if (signers.length > MAX_SIGNERS) {
      return NextResponse.json(
        { error: `A signature request supports at most ${MAX_SIGNERS} signers` },
        { status: 400 }
      )
    }

    // Start sign task + upload using SDK
    task = ilovepdf.newTask("sign")
    await task.start()

    const buffer = await file.arrayBuffer()
    const iloveapiFile = ILovePDFFile.fromArray(Buffer.from(buffer), file.name)
    const addedFile = await task.addFile(iloveapiFile)

    // Create signature request with raw fetch using SDK's assigned server.
    // Server-controlled fields (`task`, `files`, `signers`) are set here;
    // only the whitelisted client options are layered on top.
    const signatureData = await createSignatureRequest({
      task: task.id,
      files: [{ server_filename: (addedFile as { serverFilename: string }).serverFilename, filename: file.name }],
      signers,
      uuid_visible: true,
      verify_enabled: true,
      ...pickSignOptions(options),
    }, task.server)

    return NextResponse.json({
      tokenRequester: signatureData.token_requester,
      uuid: signatureData.uuid,
      status: signatureData.status,
    })
  } catch (err) {
    console.error("Signature error:", err)
    if (task) {
      try { await task.delete(); } catch { /* ignore */ }
    }
    return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 })
  }
}
