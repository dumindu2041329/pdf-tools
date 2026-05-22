"use client"

import { useUser } from "@clerk/nextjs"
import {
  FileText,
  Merge,
  Scissors,
  FileDown,
  FileUp,
  Shield,
  Sparkles,
  Clock,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { getRecentActivities, getStats } from "@/lib/activityStore"
import type { Activity } from "@/lib/activityStore"
import { getToolBySlug } from "@/lib/tools-config"
import { getWorkflows } from "@/lib/workflowStore"

const quickTools = [
  { slug: "merge-pdf", label: "Merge PDF", icon: Merge },
  { slug: "split-pdf", label: "Split PDF", icon: Scissors },
  { slug: "compress-pdf", label: "Compress PDF", icon: FileDown },
  { slug: "pdf-to-word", label: "PDF to Word", icon: FileUp },
  { slug: "protect-pdf", label: "Protect PDF", icon: Shield },
  { slug: "ai-summarizer", label: "AI Summarizer", icon: Sparkles },
]

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function DashboardPage() {
  const { user } = useUser()
  const [activities, setActivities] = useState<Activity[]>([])
  const [stats, setStats] = useState({ filesToday: 0, filesThisMonth: 0 })
  const [totalWorkflows, setTotalWorkflows] = useState(0)

  useEffect(() => {
    function refresh() {
      setActivities(getRecentActivities(5))
      setStats(getStats())
      setTotalWorkflows(getWorkflows().length)
    }

    refresh()

    // Same-tab updates (custom events)
    window.addEventListener("activity-update", refresh)
    window.addEventListener("workflows-update", refresh)
    // Cross-tab updates (native storage event)
    window.addEventListener("storage", refresh)

    return () => {
      window.removeEventListener("activity-update", refresh)
      window.removeEventListener("workflows-update", refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const firstName = user?.firstName ?? "User"
  const plan = (user?.publicMetadata?.plan as string) ?? "free"

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
          <p className="mt-1 text-2xl font-bold">{stats.filesToday}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Files This Month</p>
          <p className="mt-1 text-2xl font-bold">{stats.filesThisMonth}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total Workflows</p>
          <p className="mt-1 text-2xl font-bold">{totalWorkflows}</p>
        </div>
      </div>

      {/* Quick Tools */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quick Tools</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickTools.map(({ slug, label, icon: Icon }) => (
            <Link
              key={slug}
              href={`/tools/${slug}`}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <Icon className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium text-center">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        {activities.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No activity yet. Start by using one of the tools above!
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {activities.map((activity) => {
              const tool = getToolBySlug(activity.toolSlug)
              const Icon = tool?.icon ?? FileText
              return (
                <Link
                  key={activity.id}
                  href={`/tools/${activity.toolSlug}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tool?.title ?? activity.toolSlug}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {activity.fileName} &middot; {formatSize(activity.outputSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(activity.timestamp)}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
