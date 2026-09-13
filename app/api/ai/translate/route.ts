import { NextResponse } from "next/server"
import { canProcessFile, recordProcessingEvent } from "@/lib/usage"
import { getUserPlan } from "@/lib/auth"
import { checkGuestLimits, incrementGuestUsage } from "@/lib/guest-usage"
import { aiLimiter, getClientIp, rateLimitKey } from "@/lib/ratelimit"

const OPENROUTER_MODEL = "openrouter/free"
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

type ChatStream = {
  controller: AsyncIterable<{ type?: string; choices?: Array<{ delta?: { content?: string | null } }> }>
}

type TranslateRequestBody = {
  mode: "translate"
  targetLanguageLabel: string
  documentText: string
  filename?: string
  fileSize?: number
}

type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; documentText?: string }
  | { type: "error"; message: string }

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

function sseEncode(event: StreamEvent | "[DONE]"): Uint8Array {
  const payload = event === "[DONE]" ? "[DONE]" : JSON.stringify(event)
  return new TextEncoder().encode(`data: ${payload}\n\n`)
}

function makeSseStream(generator: AsyncGenerator<StreamEvent, void, undefined>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of generator) {
          controller.enqueue(sseEncode(event))
        }
        controller.enqueue(sseEncode("[DONE]"))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const { auth } = await import("@clerk/nextjs/server")
    const authResult = await auth()
    return authResult.userId ?? null
  } catch {
    return null
  }
}

// The free-model tier allows 20 requests/minute and, for accounts that
// have not purchased at least 10 credits, only 50 requests/day.
const FREE_TIER_DAILY_REQUESTS = 50

// The server's `Retry-After` hint, in ms. The OpenAI SDK exposes the
// response headers, but OpenRouter also nests the rate-limit headers
// inside the error body, so both shapes are checked. Returns null when
// the server didn't send one.
function readRetryAfterMs(err: unknown): number | null {
  const e = err as {
    headers?: { get?: (name: string) => string | null }
    error?: { metadata?: { headers?: Record<string, string | undefined> } }
  }

  const raw =
    e.error?.metadata?.headers?.["Retry-After"] ??
    e.error?.metadata?.headers?.["retry-after"] ??
    (typeof e.headers?.get === "function" ? e.headers.get("retry-after") : null)
  if (!raw) return null

  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(raw)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

// Classify a 429. A per-minute throttle clears on its own, so it is
// worth waiting out. The daily free-model allowance does not — retrying
// it only wastes the remaining attempts (and the little quota left), so
// the caller fails fast with an accurate message instead.
function describeRateLimit(err: unknown): { isDaily: boolean; retryAfterMs: number } | null {
  if (!err || typeof err !== "object") return null
  const e = err as {
    status?: unknown
    code?: unknown
    message?: unknown
    error?: { code?: unknown; message?: unknown }
  }
  const status = e.status ?? e.code ?? e.error?.code
  const upstream = `${e.error?.message ?? ""} ${e.message ?? ""}`
  if (status !== 429 && !/rate limit|too many requests/i.test(upstream)) return null

  return {
    // OpenRouter tags the exhausted allowance in the message, e.g.
    // "Rate limit exceeded: free-models-per-day".
    isDaily: /per[-\s]?day|daily/i.test(upstream),
    retryAfterMs: readRetryAfterMs(err) ?? 0,
  }
}

// Retry a promise-returning function on a *transient* rate limit.
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 4
): Promise<T> {
  const backoffMs = [2000, 5000, 10000]
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const limit = describeRateLimit(err)
      if (!limit || limit.isDaily || attempt === maxAttempts - 1) throw err
      // Cap the wait: the route streams inside a bounded serverless
      // execution budget, so a long throttle has to surface as an
      // error rather than a hung request.
      const wait = Math.min(Math.max(limit.retryAfterMs, backoffMs[attempt] ?? 10000), 30000)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

async function buildStreamingClient(): Promise<{
  model: string
  configured: boolean
  stream: (systemPrompt: string, userPrompt: string) => Promise<AsyncIterable<string>>
}> {
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const model = OPENROUTER_MODEL

  if (!openRouterKey) {
    return {
      model,
      configured: false,
      stream: async (_system, user) => {
        return (async function* () {
          for (let i = 0; i < user.length; i += 4) yield user.slice(i, i + 4)
        })()
      },
    }
  }

  const { default: OpenAI } = await import("openai")
  const client = new OpenAI({
    apiKey: openRouterKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://pdftools.app",
      "X-Title": "PDF Tools AI Translate",
    },
  })

  return {
    model,
    configured: true,
    stream: async (systemPrompt, userPrompt) => {
      const stream = await withRateLimitRetry(() =>
        client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: true,
        })
      ) as unknown as ChatStream["controller"]

      return (async function* () {
        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content || ""
          if (text) yield text
        }
      })()
    },
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Each segment costs one upstream request, and the free-model tier only
// allows 20 requests/minute and 50 requests/day. Tiny segments burn that
// budget far too quickly — a 3000-char split turned a modest PDF into
// 20+ back-to-back requests, which trips the per-minute cap and drains
// the daily allowance. Segments are therefore deliberately large: big
// enough that a normal document needs only a handful of requests, small
// enough that the model still finishes one translation in a single
// generation without stalling partway through.
const MAX_CHUNK_CHARS = 12000

// Split text on paragraph boundaries and pack paragraphs into chunks of
// at most `maxLen` characters. A single oversized paragraph is hard-split
// so no chunk ever exceeds the limit.
function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let current = ""

  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ""
  }

  for (const paragraph of text.split(/\n{2,}/)) {
    const pieces: string[] = []
    if (paragraph.length <= maxLen) {
      pieces.push(paragraph)
    } else {
      for (let i = 0; i < paragraph.length; i += maxLen) {
        pieces.push(paragraph.slice(i, i + maxLen))
      }
    }

    for (const piece of pieces) {
      if (current.length === 0) {
        current = piece
      } else if (current.length + piece.length + 2 <= maxLen) {
        current += "\n\n" + piece
      } else {
        flush()
        current = piece
      }
    }
  }

  flush()
  return chunks
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId()
  const start = Date.now()
  const engine = "openrouter"

  // Burst protection (Upstash Redis) — complements the daily/monthly
  // quotas enforced via canProcessFile below.
  const rl = await aiLimiter.limit(rateLimitKey(userId, getClientIp(req)))
  if (!rl.success) {
    return errorResponse("Too many requests. Please wait a moment and try again.", 429)
  }

  const contentType = req.headers.get("content-type") || ""
  if (!contentType.startsWith("application/json")) {
    return errorResponse("This endpoint expects a JSON body.", 415)
  }

  let body: TranslateRequestBody
  try {
    body = (await req.json()) as TranslateRequestBody
  } catch {
    return errorResponse("Invalid request body", 400)
  }

  if (body.mode !== "translate") return errorResponse("Invalid request", 400)

  const documentText = (body.documentText || "").trim()
  if (!documentText) return errorResponse("Missing document text.", 400)

  const targetLanguage = (body.targetLanguageLabel || "").trim() || "Spanish"
  const filename = (body.filename || "document.pdf").trim()
  const fileSize = typeof body.fileSize === "number" && body.fileSize > 0 ? body.fileSize : 0

  if (userId) {
    if (fileSize > 0) {
      const plan = await getUserPlan(userId)
      const gate = await canProcessFile(userId, fileSize, plan)
      if (!gate.allowed) return errorResponse(gate.reason ?? "Processing limit reached", 402)
    }
  } else {
    // Unauthenticated callers get the same cookie-backed free-plan cap
    // as the other tools — otherwise this endpoint would be a free
    // OpenRouter proxy. Pre-check then record the attempt.
    const gate = await checkGuestLimits(1)
    if (!gate.allowed) return errorResponse(gate.reason ?? "Processing limit reached", 402)
    await incrementGuestUsage(1)
  }

  const systemPrompt =
    "You are an expert translator. Translate the provided text to the requested language. " +
    "Preserve paragraph structure, line breaks where they exist, and any headings or bullet markers. " +
    "Do not add commentary. Output ONLY the translated text."

  const translateStream = makeSseStream(
    (async function* (): AsyncGenerator<StreamEvent, void, undefined> {
      try {
        const { stream } = await buildStreamingClient()
        const segments = chunkText(documentText, MAX_CHUNK_CHARS)

        for (let i = 0; i < segments.length; i++) {
          const translated = await stream(
            systemPrompt,
            `Translate this document segment to ${targetLanguage}. ` +
              `This is segment ${i + 1} of ${segments.length}; translate only this segment and ` +
              `do not add commentary.\n\n--- SEGMENT (${filename}) START ---\n${segments[i]}\n--- SEGMENT END ---`
          )

          // Separate translated segments so paragraph boundaries between
          // chunks survive the round trip.
          if (i > 0) yield { type: "chunk", text: "\n\n" }

          for await (const text of translated) {
            yield { type: "chunk", text }
          }
        }

        yield { type: "done" }
        await recordProcessingEvent({
          userId,
          toolSlug: "translate-pdf",
          status: "success",
          engine,
          inputFilesCount: 1,
          processingTimeMs: Date.now() - start,
        })
      } catch (err) {
        await recordProcessingEvent({
          userId,
          toolSlug: "translate-pdf",
          status: "error",
          engine,
          inputFilesCount: 1,
          errorMessage: (err as Error).message || "Translation failed",
        })
        // Emit a real SSE error event instead of letting the stream
        // abort. An aborted stream reaches the browser as an opaque
        // "Failed to fetch", which tells the user nothing.
        const limit = describeRateLimit(err)
        const message = limit?.isDaily
          ? `The AI provider's free daily allowance is used up (${FREE_TIER_DAILY_REQUESTS} requests/day). Please try again tomorrow, or add credits to the OpenRouter account for a higher limit.`
          : limit
            ? "The AI service is temporarily rate-limited. Please try again in a moment."
            : (err as Error).message || "Translation failed"
        yield { type: "error", message }
      }
    })()
  )

  return new Response(translateStream, { headers: SSE_HEADERS })
}
