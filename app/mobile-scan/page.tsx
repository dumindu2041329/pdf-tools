import type { Metadata } from "next"
import { MobileScanView } from "@/components/tools/scan-to-pdf/MobileScanView"

export const metadata: Metadata = {
  title: "Mobile Scanner",
  description:
    "Capture document pages from your phone and send them straight to your desktop scan session.",
  robots: { index: false, follow: false },
}

interface MobileScanPageProps {
  searchParams: Promise<{ session?: string }>
}

export default async function MobileScanPage({ searchParams }: MobileScanPageProps) {
  const { session: sessionId } = await searchParams

  return <MobileScanView sessionId={sessionId ?? ""} />
}