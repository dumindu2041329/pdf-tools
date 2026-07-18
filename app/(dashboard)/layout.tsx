import { auth } from "@clerk/nextjs/server"
import { Navbar } from "@/components/layout/Navbar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Resource-based auth check: this layout protects every route in the
  // (dashboard) group (e.g. /account/*, /workflows/*). Unauthenticated
  // users are redirected to /sign-in by Clerk.
  await auth.protect()

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  )
}
