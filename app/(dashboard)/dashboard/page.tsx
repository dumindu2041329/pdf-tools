import { currentUser } from "@clerk/nextjs/server"
import {
  FileText,
  Merge,
  Scissors,
  FileDown,
  FileUp,
  Shield,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
}

const quickTools = [
  { slug: "merge-pdf", label: "Merge PDF", icon: Merge },
  { slug: "split-pdf", label: "Split PDF", icon: Scissors },
  { slug: "compress-pdf", label: "Compress PDF", icon: FileDown },
  { slug: "pdf-to-word", label: "PDF to Word", icon: FileUp },
  { slug: "protect-pdf", label: "Protect PDF", icon: Shield },
  { slug: "ai-summarizer", label: "AI Summarizer", icon: Sparkles },
]

export default async function DashboardPage() {
  const user = await currentUser()
  const firstName = user?.firstName ?? "User"
  const plan = ((user?.publicMetadata as Record<string, unknown>)?.plan as string) ?? "free"

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your PDF tools and workflows from here.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="mt-1 text-2xl font-bold capitalize">{plan}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Files Today</p>
          <p className="mt-1 text-2xl font-bold">0</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Files This Month</p>
          <p className="mt-1 text-2xl font-bold">0</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Workflows</p>
          <p className="mt-1 text-2xl font-bold">0</p>
        </div>
      </div>

      {/* Quick Tools */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Quick Tools</h2>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            All tools
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <tool.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{tool.label}</p>
                <p className="text-xs text-muted-foreground">
                  Process your PDFs
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            No recent activity yet. Start by using one of the tools above.
          </p>
        </div>
      </div>
    </div>
  )
}
