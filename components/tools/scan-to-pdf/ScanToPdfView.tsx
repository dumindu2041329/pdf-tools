"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import QRCode from "qrcode"
import { Check, Smartphone } from "lucide-react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import type { DeviceInfo } from "@/lib/device-info"

function QrCodeSvg({ value }: { value: string }) {
  const [svg, setSvg] = useState<string>("")
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false

    const dark = resolvedTheme === "dark" ? "#ffffffff" : "#000000ff"

    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      width: 180,
      color: {
        dark,
        light: "#00000000",
      },
    })
      .then((result) => {
        if (cancelled) return
        setSvg(result)
      })
      .catch((err) => {
        console.error("QR code generation failed", err)
      })

    return () => {
      cancelled = true
    }
  }, [value, resolvedTheme])

  return (
    <div
      className="shrink-0 [&_svg]:!h-[180px] [&_svg]:!w-[180px]"
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label={`QR code for ${value}`}
    />
  )
}

interface ScannedImage {
  url: string
  pathname: string
  uploadedAt: string
}

const POLL_INTERVAL_MS = 2000

export function ScanToPdfView() {
  // Session id is generated once per mount and embedded in the QR code
  // so the mobile scanner knows which prefix to upload under. We start
  // with an empty string on both server and client so the first render
  // matches (avoids hydration mismatch); the real id is generated on
  // mount inside the polling effect below — that keeps generation and
  // consumption in a single effect to avoid a cascading re-render.
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string>("")
  const [images, setImages] = useState<ScannedImage[]>([])
  const [connected, setConnected] = useState(false)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  // Latches `true` the first time the desktop sees the mobile's
  // "Save" signal so we only auto-navigate once per session. The
  // mobile might keep the page open (showing the success overlay)
  // and re-fire the signal — without this latch we'd loop back into
  // the editor every poll cycle.
  const autoNavTriggeredRef = useRef(false)
  const columnsPerRow = useColumnsPerRow()
  const hasScanned = device !== null || images.length > 0

  useEffect(() => {
    const id = crypto.randomUUID()
    // randomUUID() is non-deterministic across renders, so it can't be used
    // as a useState lazy initializer (would cause an SSR/CSR hydration
    // mismatch). The id is captured in the closure below so the polling
    // logic doesn't need to wait for the re-render — there's no cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(id)

    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/scan-session/${id}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          // Transient failure — don't clear `device`/`images` we already
          // have. Just flip `connected` off so the badge reflects that
          // we lost touch with the server. The next successful poll
          // will restore it.
          if (!cancelled) setConnected(false)
          return
        }
        const data = (await res.json()) as {
          images: ScannedImage[]
          device: DeviceInfo | null
          saved?: boolean
        }
        if (cancelled) return
        setImages(data.images)
        // `device` is sticky — once a phone has joined, treat the
        // session as locked for its lifetime. A transient response that
        // happens to omit the device blob shouldn't "un-lock" Step 1.
        setDevice((prev) => data.device ?? prev)
        setConnected(true)

        // Mobile user tapped "Save" → jump into the Scan Editor. We
        // do this from inside the poll (rather than wiring a separate
        // channel) so the trigger rides on the same transport the
        // rest of the session state already uses. The ref latch
        // guarantees we only navigate once even if the mobile keeps
        // re-firing the signal while its success overlay is up.
        if (data.saved === true && !autoNavTriggeredRef.current) {
          autoNavTriggeredRef.current = true
          router.push(`/scan-editor?session=${id}`)
        }
      } catch {
        if (!cancelled) setConnected(false)
      }
    }

    poll()
    const pollId = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(pollId)
    }
    // `router` is stable across renders (Next.js returns the same
    // singleton) but the exhaustive-deps lint rule can't prove that,
    // so we list it explicitly. `id` is captured in the closure from
    // `crypto.randomUUID()` on mount; intentionally NOT pulled from
    // `sessionId` state to avoid restarting the poll on the re-render
    // that sets the state.
  }, [router])

  // If the user navigates away (tab close, refresh, route change),
  // destroy the session so the next visit to this page starts clean.
  // `sendBeacon` is the only reliable way to fire a request on
  // `pagehide`/`beforeunload` — `fetch` with `keepalive` is the
  // alternative but it doesn't survive a tab close in every browser.
  //
  // In-app Next.js navigation (Link clicks, router.push) does NOT
  // fire `pagehide`, so we additionally watch the current pathname
  // and trigger a regular `fetch` when it leaves this tool page.
  useEffect(() => {
    if (!sessionId) return
    const url = `/api/scan-session/${sessionId}/destroy`

    // Fired by the pagehide/beforeunload listeners below. Send a
    // beacon because the page is about to be torn down — a regular
    // fetch would be cancelled.
    const beacon = () => {
      try {
        const blob = new Blob([JSON.stringify({ destroy: true })], {
          type: "application/json",
        })
        navigator.sendBeacon(url, blob)
      } catch (err) {
        // Best-effort — if beacon fails the worst case is a stale
        // session sitting in storage until the next destroy.
        console.warn("[scan-to-pdf] destroy beacon failed:", err)
      }
    }
    window.addEventListener("pagehide", beacon)
    // `beforeunload` covers Safari where `pagehide` is inconsistent.
    window.addEventListener("beforeunload", beacon)
    return () => {
      window.removeEventListener("pagehide", beacon)
      window.removeEventListener("beforeunload", beacon)
    }
  }, [sessionId])

  // In-app route changes (Next.js client-side navigation). When the
  // pathname leaves the scan-to-PDF tool, fire a normal fetch — the
  // page is still alive so we don't need a beacon.
  const pathname = usePathname()
  const lastPathnameRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionId) return
    if (lastPathnameRef.current === null) {
      lastPathnameRef.current = pathname
      return
    }
    if (pathname === lastPathnameRef.current) return
    lastPathnameRef.current = pathname
    // Only react when the user is actually leaving the tool page.
    if (pathname.startsWith("/tools/scan-to-pdf")) return

    const url = `/api/scan-session/${sessionId}/destroy`
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destroy: true }),
      keepalive: true,
    }).catch((err) => {
      console.warn("[scan-to-pdf] destroy fetch failed:", err)
    })
  }, [pathname, sessionId])

  // Build the mobile-scan URL only when we have a session id so the QR
  // code updates as soon as the id is ready.
  const mobileScanUrl = sessionId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/mobile-scan?session=${sessionId}`
    : ""

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {/* ── Left Panel - Step 1 (Active) ── */}
        <div className={`md:col-span-1 bg-card rounded-2xl shadow-md p-8 flex flex-col items-center transition-opacity duration-300 ${hasScanned ? "opacity-60 pointer-events-none select-none" : "opacity-100"}`}>
          <h3 className="text-xl font-bold text-card-foreground">Step 1</h3>
          <p className="text-sm text-muted-foreground text-center mt-1 mb-6 max-w-xs">
            Use your smartphone&apos;s camera to scan this QR code
          </p>
          <div className="flex items-center justify-center p-4 bg-card rounded-xl border border-border min-h-[208px] min-w-[208px] relative overflow-hidden">
            {/*
              Render BOTH the QR and the success overlay together so we
              don't have to wrestle with AnimatePresence + mode="wait"
              exit timing. The success overlay uses absolute positioning
              and is shown/hidden via the `device` state — fade in when
              a phone joins, fade out if the session is somehow reset.
              Pointer events stay disabled on the panel as a whole once
              scanned (parent has pointer-events-none) so the overlay
              can't be tapped through.
            */}
            <motion.div
              animate={{
                opacity: mobileScanUrl && !hasScanned ? 1 : 0,
                scale: mobileScanUrl && !hasScanned ? 1 : 0.92,
              }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              {mobileScanUrl ? <QrCodeSvg value={mobileScanUrl} /> : null}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: hasScanned ? 1 : 0,
                scale: hasScanned ? 1 : 0.85,
              }}
              transition={{
                opacity: { duration: 0.25, ease: "easeOut" },
                scale: {
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1],
                },
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            >
              <div className="relative flex items-center justify-center">
                <motion.span
                  className="absolute inline-flex h-24 w-24 rounded-full bg-emerald-400/40"
                  animate={
                    hasScanned
                      ? {
                          scale: [0.5, 1.4, 1.6],
                          opacity: [0.8, 0.2, 0],
                        }
                      : { scale: 0.5, opacity: 0 }
                  }
                  transition={{
                    duration: 1.6,
                    ease: "easeOut",
                    repeat: hasScanned ? Infinity : 0,
                    repeatDelay: 0.6,
                  }}
                />
                <motion.div
                  animate={{
                    rotate: hasScanned ? 0 : -20,
                  }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                >
                  <motion.div
                    animate={{
                      scale: hasScanned ? 1 : 0,
                      opacity: hasScanned ? 1 : 0,
                    }}
                    transition={{
                      delay: hasScanned ? 0.15 : 0,
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                  >
                    <Check className="h-10 w-10" strokeWidth={3} />
                  </motion.div>
                </motion.div>
              </div>
              <motion.p
                animate={{
                  opacity: hasScanned ? 1 : 0,
                  y: hasScanned ? 0 : 4,
                }}
                transition={{ delay: hasScanned ? 0.25 : 0, duration: 0.3 }}
                className="text-sm font-semibold text-emerald-700 dark:text-emerald-300"
              >
                {device ? device.label : "Detecting device…"}
              </motion.p>
            </motion.div>
          </div>
          {hasScanned && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mt-4">
              ✓ QR code scanned — locked
            </p>
          )}
        </div>

        {/* ── Right Panel - Step 2 (Live captures) ── */}
        <div className="md:col-span-2 bg-card rounded-2xl shadow-md p-8 flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-card-foreground">Step 2</h3>
            <ConnectionBadge
              connected={connected}
              count={images.length}
              device={device}
            />
          </div>

          <p className="text-sm leading-relaxed text-foreground/80 mt-3 mb-4">
            Captured pages from your phone will appear here in real time.
            <span className="block text-xs text-muted-foreground mt-1">
              Up to {columnsPerRow} images per row at this screen size.
            </span>
          </p>

          <ScannedGallery images={images} />

          <p className="text-sm font-bold text-foreground mt-4">
            Do not close this tab.
          </p>
        </div>
    </div>
  )
}

function useColumnsPerRow(): number {
  // The grid uses `grid-cols-3 sm:grid-cols-4 md:grid-cols-5`, so the
  // active column count depends on the viewport:
  //   <sm  → 3
  //   sm   → 4
  //   md+  → 5
  // We mirror Tailwind's breakpoints (640px / 768px) with a matchMedia
  // listener so the displayed count stays in sync if the user resizes.
  const [columns, setColumns] = useState(3)

  useEffect(() => {
    function compute() {
      const w = window.innerWidth
      if (w >= 768) setColumns(5)
      else if (w >= 640) setColumns(4)
      else setColumns(3)
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [])

  return columns
}

function ConnectionBadge({
  connected,
  count,
  device,
}: {
  connected: boolean
  count: number
  device: DeviceInfo | null
}) {
  if (connected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {count > 0 ? `${count} captured` : "Connected"}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {device ? device.label : count > 0 ? "Detecting device…" : null}
        </span>
      </div>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      Waiting
    </span>
  )
}

function ScannedGallery({ images }: { images: ScannedImage[] }) {
  if (images.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-xl py-10 px-4">
        <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
          <Smartphone className="size-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          No pages captured yet
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Scan the QR code with your phone to start capturing pages. They
          will appear here automatically.
        </p>
      </div>
    )
  }

  return (
    // `min-h-0` is required on a flex child for `overflow-y-auto` to
    // actually constrain its height — otherwise the child grows to fit
    // its content and the scrollbar never appears.
    <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-3">
      <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-w-xl">
        {images.map((img, idx) => (
          <li
            key={img.pathname}
            className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={`Scanned page ${idx + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <span className="absolute top-1 left-1 bg-background/85 text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
              {idx + 1}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
