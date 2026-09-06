// Client-side wrapper around the polling Web Worker (./worker/jobPoller.ts).
//
// Polling from a Web Worker keeps long-running status checks alive while the
// browser tab is hidden, because worker timers are exempt from the
// background-tab throttling the browser applies to main-thread
// setTimeout/setInterval (Chrome's intensive wake-up throttling clamps hidden
// pages down to ~1 timer wake-up per minute).

export type BackgroundPollerStatus =
  | { type: "ok"; data: unknown }
  | { type: "http-error"; status: number }
  | { type: "error"; message: string }

export interface BackgroundPoller {
  /**
   * Start polling `url` every `intervalMs`. Only one active poll is
   * supported per instance; calling `start` again restarts it. Statuses
   * are delivered to `onStatus` until `stop()` is called.
   */
  start(url: string, intervalMs: number, onStatus: (status: BackgroundPollerStatus) => void): void
  /** Stop polling and release the worker. Safe to call when idle. */
  stop(): void
}

export function createBackgroundPoller(): BackgroundPoller | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null

  try {
    const worker = new Worker(new URL("./worker/jobPoller.ts", import.meta.url), {
      type: "module",
    })

    let currentId: string | null = null
    let onStatus: ((status: BackgroundPollerStatus) => void) | null = null

    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const msg = event.data as
        | { type?: unknown; id?: unknown; ok?: unknown; data?: unknown; status?: unknown; error?: unknown }
        | null
      if (!msg || msg.type !== "status" || msg.id !== currentId) return
      if (msg.ok === true) {
        onStatus?.({ type: "ok", data: msg.data })
      } else if (typeof msg.status === "number") {
        onStatus?.({ type: "http-error", status: msg.status })
      } else {
        onStatus?.({
          type: "error",
          message: typeof msg.error === "string" ? msg.error : "Unknown poll error",
        })
      }
    })

    return {
      start(url, intervalMs, handler) {
        currentId = Math.random().toString(36).slice(2)
        onStatus = handler
        worker.postMessage({ type: "start", id: currentId, url, intervalMs })
      },
      stop() {
        if (currentId) {
          worker.postMessage({ type: "stop", id: currentId })
          currentId = null
          onStatus = null
        }
        worker.terminate()
      },
    }
  } catch {
    return null
  }
}