"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Smartphone } from "lucide-react"

function QrCodeSvg({ value }: { value: string }) {
  const [svg, setSvg] = useState<string>("")

  useEffect(() => {
    let cancelled = false

    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      width: 180,
      color: {
        dark: "#000000ff",
        light: "#00000000",
      },
    })
      .then((result) => {
        if (cancelled) return
        // Re-map QR module fills to the project's theme tokens so the code
        // matches both light and dark themes without relying on inheritance.
        const themed = result
          .replace(/fill="#000000ff"/g, 'fill="hsl(var(--foreground))"')
          .replace(/fill="#00000000"/g, 'fill="hsl(var(--card))"')
        setSvg(themed)
      })
      .catch((err) => {
        console.error("QR code generation failed", err)
      })

    return () => {
      cancelled = true
    }
  }, [value])

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
  const [sessionId, setSessionId] = useState<string>("")
  const [images, setImages] = useState<ScannedImage[]>([])
  const [connected, setConnected] = useState(false)

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
          if (!cancelled) setConnected(false)
          return
        }
        const data = (await res.json()) as { images: ScannedImage[] }
        if (cancelled) return
        setImages(data.images)
        setConnected(true)
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
  }, [])

  // Build the mobile-scan URL only when we have a session id so the QR
  // code updates as soon as the id is ready.
  const mobileScanUrl = sessionId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/mobile-scan?session=${sessionId}`
    : ""

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* ── Left Panel - Step 1 (Active) ── */}
        <div className="bg-card rounded-2xl shadow-md p-8 flex flex-col items-center">
          <h3 className="text-xl font-bold text-card-foreground">Step 1</h3>
          <p className="text-sm text-muted-foreground text-center mt-1 mb-6 max-w-xs">
            Use your smartphone&apos;s camera to scan this QR code
          </p>
          <div className="flex items-center justify-center p-4 bg-card rounded-xl border border-border">
            {mobileScanUrl ? (
              <QrCodeSvg value={mobileScanUrl} />
            ) : (
              <div className="h-[180px] w-[180px] rounded-lg bg-muted/40 animate-pulse" />
            )}
          </div>
        </div>

        {/* ── Right Panel - Step 2 (Live captures) ── */}
        <div className="bg-card rounded-2xl shadow-md p-8 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-card-foreground">Step 2</h3>
            <ConnectionBadge connected={connected} count={images.length} />
          </div>

          <p className="text-sm leading-relaxed text-foreground/80 mt-3 mb-4">
            Captured pages from your phone will appear here in real time.
            When you&apos;re done scanning, tap{" "}
            <span className="font-semibold text-foreground">Save</span> on
            your phone.
          </p>

          <ScannedGallery images={images} />

          <p className="text-sm font-bold text-foreground mt-4">
            Do not close this tab.
          </p>
        </div>
    </div>
  )
}

function ConnectionBadge({
  connected,
  count,
}: {
  connected: boolean
  count: number
}) {
  if (connected) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {count > 0 ? `${count} captured` : "Connected"}
      </span>
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
      <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-xl py-10 px-4">
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
    <div className="flex-1 space-y-3">
      <ul className="grid grid-cols-3 gap-2">
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