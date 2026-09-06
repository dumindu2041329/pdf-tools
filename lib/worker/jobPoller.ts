// Runs inside a dedicated Web Worker.
//
// Browsers throttle main-thread timers in hidden tabs (Chrome's
// "Intensive Wake Up Throttling" clamps background pages down to roughly
// one timer wake-up per minute), which made client-side polling loops stall
// whenever the user switched to another tab. Timer work inside a Web Worker
// is NOT subject to page-visibility throttling, so moving the poll loop here
// keeps long-running jobs and scan sessions alive while the tab is hidden.
//
// No imports on purpose: this file is bundled as a standalone worker script.

type WorkerMessage = StartMessage | StopMessage

interface StartMessage {
  type: "start"
  id: string
  url: string
  intervalMs: number
}

interface StopMessage {
  type: "stop"
  id: string
}

const ctx = self as unknown as {
  postMessage(message: unknown): void
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void
}

let activeId: string | null = null
let timer: ReturnType<typeof setInterval> | null = null
let inFlight = false

async function tick(id: string, url: string) {
  if (inFlight || id !== activeId) return
  inFlight = true
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (id !== activeId) return
    if (res.ok) {
      const data: unknown = await res.json()
      ctx.postMessage({ type: "status", id, ok: true, data })
    } else {
      ctx.postMessage({ type: "status", id, ok: false, status: res.status })
    }
  } catch (err) {
    if (id !== activeId) return
    ctx.postMessage({
      type: "status",
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    inFlight = false
  }
}

ctx.addEventListener("message", (event) => {
  const msg = event.data as WorkerMessage

  if (msg.type === "stop") {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    activeId = null
    return
  }

  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  activeId = msg.id
  timer = setInterval(() => {
    void tick(msg.id, msg.url)
  }, msg.intervalMs)
  // Fire immediately so a slow interval never delays the first check.
  void tick(msg.id, msg.url)
})