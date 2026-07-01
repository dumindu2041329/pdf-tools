"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, Check, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { uploadFileDirect } from "@/lib/supabase-upload"
import { parseDeviceInfo } from "@/lib/device-info"

interface MobileScanViewProps {
  sessionId: string
}

interface CapturedItem {
  id: string
  url: string
  uploadedAt: string
}

const SAFE_SESSION = /^[a-zA-Z0-9-]{1,100}$/

export function MobileScanView({ sessionId }: MobileScanViewProps) {
  const router = useRouter()
  const [captures, setCaptures] = useState<CapturedItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [showDoneAnimation, setShowDoneAnimation] = useState(false)
  // We only know if the visitor is on a real mobile/tablet once
  // we're on the client — `navigator` doesn't exist on the server.
  // `null` means "not yet determined" so the Save handler can wait
  // for the real value before deciding whether to navigate or show
  // the confirmation overlay.
  const [isMobileDevice, setIsMobileDevice] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validSession = SAFE_SESSION.test(sessionId)

  useEffect(() => {
    const info = parseDeviceInfo(navigator.userAgent)
    setIsMobileDevice(info?.type === "mobile" || info?.type === "tablet")
  }, [])

  // Tell the desktop session that this phone just joined. Sent once
  // on mount; the desktop uses the response to blur Step 1 and display
  // the device label in Step 2. Fire-and-forget — UI doesn't depend
  // on it succeeding.
  useEffect(() => {
    if (!validSession) return
    const device = parseDeviceInfo(navigator.userAgent) ?? {
      type: "mobile" as const,
      os: "Unknown",
      browser: "Unknown",
      label: "Mobile · Unknown",
    }
    fetch(`/api/scan-session/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    }).catch((err) => {
      console.warn("[mobile-scan] join ping failed:", err)
    })
  }, [validSession, sessionId])

  // Hydrate existing captures on mount and whenever the session changes.
  // Without this, reloading the mobile page wipes local state and the
  // user can't see what they already uploaded in this session.
  useEffect(() => {
    if (!validSession) return
    let cancelled = false

    async function loadExisting() {
      try {
        const res = await fetch(`/api/scan-session/${sessionId}`, {
          cache: "no-store",
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { images?: CapturedItem[] }
        if (cancelled || !Array.isArray(data.images)) return
        setCaptures(
          data.images.map((img) => ({
            id: img.id ?? img.url,
            url: img.url,
            uploadedAt: img.uploadedAt,
          }))
        )
      } catch (err) {
        // Best-effort — a failed hydration shouldn't block the user
        // from capturing new pages.
        console.warn("[mobile-scan] hydrate failed:", err)
      }
    }

    loadExisting()
    return () => {
      cancelled = true
    }
  }, [validSession, sessionId])

  // If the user navigates away from the mobile page (tab close,
  // back button, app switch) destroy the session so unfinished
  // captures don't linger in Supabase Storage. `sendBeacon` is
  // the only reliable transport for page-leave requests.
  useEffect(() => {
    if (!validSession) return
    const url = `/api/scan-session/${sessionId}/destroy`
    const beacon = () => {
      try {
        const blob = new Blob([JSON.stringify({ destroy: true })], {
          type: "application/json",
        })
        navigator.sendBeacon(url, blob)
      } catch (err) {
        console.warn("[mobile-scan] destroy beacon failed:", err)
      }
    }
    window.addEventListener("pagehide", beacon)
    window.addEventListener("beforeunload", beacon)
    return () => {
      window.removeEventListener("pagehide", beacon)
      window.removeEventListener("beforeunload", beacon)
    }
  }, [validSession, sessionId])

  // Save button handler — branches on the form factor we detected
  // in the mount effect. On a real phone/tablet we want to keep the
  // user on the device and surface a confirmation overlay that points
  // them at the desktop for the next step. On desktop (e.g. when this
  // view is opened from DevTools) we keep the previous behaviour of
  // jumping straight into the editor.
  function handleSave() {
    if (isMobileDevice === true) {
      setShowDoneAnimation(true)
      return
    }
    router.push(`/scan-editor?session=${sessionId}`)
  }

  async function handleCapture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    // Reset the input so picking the same file again still fires `change`.
    event.target.value = ""

    if (!validSession) {
      toast.error("Invalid scan session. Please scan the QR code again.")
      return
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please capture an image.")
      return
    }

    setUploading(true)
    try {
      const result = await uploadFileDirect(file, {
        // Pathname must be `scan-sessions/<sessionId>/…` so the
        // server-side `/api/upload` route can validate that the
        // upload belongs to the requested session and group it
        // under the right prefix when listing. Scan captures go in
        // the dedicated `scan-sessions` bucket so we can keep their
        // lifecycle (smaller size cap, simpler policies) separate
        // from the main `pdf-uploads` bucket.
        bucket: "scan-sessions",
        pathname: `scan-sessions/${sessionId}/${file.name}`,
        contentType: file.type,
        onProgress: undefined,
      })
      // The storage URL is public so we can display it inline immediately.
      setCaptures((prev) => [
        ...prev,
        {
          id: result.pathname,
          url: result.url,
          uploadedAt: new Date().toISOString(),
        },
      ])
      toast.success("Page captured")
    } catch (err) {
      console.error("Capture upload failed:", err)
      toast.error(
        err instanceof Error ? err.message : "Failed to upload capture"
      )
    } finally {
      setUploading(false)
    }
  }

  if (!validSession) {
    return (
      <main className="min-h-svh flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-md p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-card-foreground">
            No active scan session
          </h1>
          <p className="text-sm text-muted-foreground">
            Open this page by scanning the QR code shown on the Scan-to-PDF
            tool on your computer.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-svh bg-background p-4 sm:p-6 overflow-hidden flex flex-col">
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Mobile Scanner</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connected to desktop session
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Connected
          </span>
        </header>

        {/* Hidden camera input — clicking the big button forwards to it. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
          aria-hidden
        />

        <Button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          size="lg"
          className="w-full h-20 text-lg gap-3 mt-6"
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Camera className="size-6" />
              Capture page
            </>
          )}
        </Button>

        {/* On real mobile devices we show a "Pages saved" overlay
            instead of navigating away — the next step happens on the
            desktop. The button stays the same on desktop so anyone
            previewing this page in DevTools still gets the editor. */}
        <div className="mt-4">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={!validSession || isMobileDevice === null}
            onClick={handleSave}
          >
            <Save className="size-4" />
            Save
          </Button>
        </div>

        {/* Captures region — takes remaining viewport height so the
            scrollbar lives here, not on the whole page. min-h-0 lets
            overflow-y-auto actually constrain the child. */}
        <section className="mt-6 flex-1 min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Captured pages ({captures.length})
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            {captures.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                No pages captured yet.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {captures.map((cap, idx) => (
                  <li
                    key={cap.id}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cap.url}
                      alt={`Captured page ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1 left-1 bg-background/80 text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-4">
          Switch back to your computer to see the pages appear in real time.
        </footer>
      </div>

      {/* Mobile-only confirmation overlay. Shown after the user taps
          Save on a phone/tablet — tells them the pages are safely
          uploaded and points them at the desktop for the rest of the
          flow. The "Done" button just dismisses the overlay so they
          can capture more pages if they want; the page-leave beacon
          still fires when they actually close the tab/navigate away. */}
      <AnimatePresence>
        {showDoneAnimation && (
          <motion.div
            key="done-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-done-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="bg-card text-card-foreground rounded-2xl shadow-2xl p-7 max-w-sm w-full text-center space-y-5 border border-border"
            >
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  delay: 0.1,
                  type: "spring",
                  stiffness: 220,
                  damping: 14,
                }}
                className="mx-auto w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center"
              >
                <Check
                  className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                  strokeWidth={3}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.3 }}
                className="space-y-2"
              >
                <h2
                  id="scan-done-title"
                  className="text-2xl font-bold text-foreground"
                >
                  Pages saved!
                </h2>
                <p className="text-sm text-muted-foreground">
                  {captures.length === 0
                    ? "No pages were captured this session."
                    : captures.length === 1
                      ? "1 page is ready on your computer."
                      : `${captures.length} pages are ready on your computer.`}
                </p>
                <p className="text-xs text-muted-foreground pt-1">
                  Switch to your computer to review and create the PDF.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
              >
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setShowDoneAnimation(false)}
                >
                  Done
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}