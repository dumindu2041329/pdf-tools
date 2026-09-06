import { Navbar } from "@/components/layout/Navbar"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* flex-1 (instead of min-h-screen) keeps the card vertically centred
          in the space below the sticky navbar without overflowing the
          viewport; py-12 gives breathing room on short screens. */}
      <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
        {children}
      </main>
    </div>
  )
}
