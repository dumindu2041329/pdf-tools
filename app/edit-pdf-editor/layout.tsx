import { Navbar } from "@/components/layout/Navbar"

export default function EditPdfEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
