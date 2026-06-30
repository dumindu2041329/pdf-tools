import type { Metadata } from "next"
import { ScanEditorClient } from "@/components/tools/scan-to-pdf/ScanEditorClient"

export const metadata: Metadata = {
  title: "Scan Editor — Review & Save as PDF",
  description:
    "Review, rotate and reorder pages captured from your phone, then save them as a PDF.",
  robots: { index: false, follow: false },
}

interface ScanEditorPageProps {
  searchParams: Promise<{ session?: string }>
}

export default async function ScanEditorPage({ searchParams }: ScanEditorPageProps) {
  const { session: sessionId } = await searchParams

  return <ScanEditorClient sessionId={sessionId ?? ""} />
}