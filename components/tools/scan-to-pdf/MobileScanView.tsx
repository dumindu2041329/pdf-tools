"use client"

import { useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { uploadFileDirect } from "@/lib/blob-upload"

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
  const [captures, setCaptures] = useState<CapturedItem[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validSession = SAFE_SESSION.test(sessionId)

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
        // Pathname must be `scan-sessions/<sessionId>/<filename>` so the
        // server's onBeforeGenerateToken hook can validate that the
        // upload belongs to the requested session and group it under
        // the right prefix when listing.
        pathname: `scan-sessions/${sessionId}/${file.name}`,
        clientPayload: JSON.stringify({
          contentType: file.type,
          sessionId,
        }),
      })
      // The blob URL is public so we can display it inline immediately.
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
    <main className="min-h-svh bg-background p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
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
          className="w-full h-20 text-lg gap-3"
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

        {captures.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Captured pages ({captures.length})
            </h2>
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
          </section>
        )}

        <footer className="text-center text-xs text-muted-foreground pt-4">
          Switch back to your computer to see the pages appear in real time.
        </footer>
      </div>
    </main>
  )
}