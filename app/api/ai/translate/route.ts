import { NextResponse } from "next/server"
import { canProcessFile, recordProcessingEvent } from "@/lib/usage"
import { getUserPlan } from "@/lib/auth"

const OPENROUTER_MODEL = "openai/gpt-oss-120b:free"
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

// Detect OpenRouter rate-limit responses from the OpenAI SDK error.
// The free model is shared across all OpenRouter users and is
// frequently rate-limited upstream.
function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { status?: unknown; code?: unknown; error?: { code?: unknown } }
  return (
    e.status === 429 ||
    e.code === 429 ||
    e.error?.code === 429
  )
}

// Retry a promise-returning function on 429 with exponential backoff.
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  const delays = [1000, 2000, 4000]
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err
      await new Promise((r) => setTimeout(r, delays[attempt] ?? 4000))
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

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId()
  const start = Date.now()
  const engine = "openrouter"

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

  if (userId && fileSize > 0) {
    const plan = await getUserPlan(userId)
    const gate = await canProcessFile(userId, fileSize, plan)
    if (!gate.allowed) return errorResponse(gate.reason ?? "Processing limit reached", 402)
  }

  const systemPrompt =
    "You are an expert translator. Translate the provided text to the requested language. " +
    "Preserve paragraph structure, line breaks where they exist, and any headings or bullet markers. " +
    "Do not add commentary. Output ONLY the translated text."

  const translateStream = makeSseStream(
    (async function* (): AsyncGenerator<StreamEvent, void, undefined> {
      try {
        const { stream } = await buildStreamingClient()
        const translateText = await stream(
          systemPrompt,
          `Translate this document to ${targetLanguage}.\n\n--- DOCUMENT (${filename}) START ---\n${documentText.slice(
            0,
            50000
          )}\n--- DOCUMENT END ---`
        )

        for await (const text of translateText) {
          yield { type: "chunk", text }
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
        throw err
      }
    })()
  )

  return new Response(translateStream, { headers: SSE_HEADERS })
}
