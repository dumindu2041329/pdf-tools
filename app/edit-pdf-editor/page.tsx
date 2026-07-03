import type { Metadata } from "next"
import { EditPdfEditorClient } from "@/components/tools/edit-pdf/EditPdfEditorClient"

export const metadata: Metadata = {
  title: "Edit PDF — Online PDF Editor",
  description:
    "Edit your PDF online. Add text, images, and annotations with our browser-based PDF editor.",
  robots: { index: false, follow: false },
}

interface EditPdfEditorPageProps {
  searchParams: Promise<{ file?: string; filename?: string }>
}

export default async function EditPdfEditorPage({ searchParams }: EditPdfEditorPageProps) {
  const { file: fileUrl, filename } = await searchParams

  return <EditPdfEditorClient fileUrl={fileUrl ?? ""} filename={filename ?? ""} />
}
