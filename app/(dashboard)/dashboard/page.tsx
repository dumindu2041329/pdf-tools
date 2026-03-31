"use client"

import Link from "next/link"
import {
  BarChart3,
  Clock,
  Zap,
  Crown,
} from "lucide-react"
import { UsageMeter } from "@/components/shared/UsageMeter"
import { toolsConfig } from "@/lib/tools-config"

const quickTools = toolsConfig.filter((t) => t.access === "free").slice(0, 6)

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here&apos;s your PDF tools overview.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Files Today", value: "0", icon: BarChart3, color: "text-blue-500" },
          { label: "This Month", value: "0", icon: Clock, color: "text-green-500" },
          { label: "Credits Left", value: "30", icon: Zap, color: "text-yellow-500" },
          { label: "Plan", value: "Free", icon: Crown, color: "text-primary" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Usage meters */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Usage</h2>
        <UsageMeter label="Daily Files" used={0} limit={5} />
        <UsageMeter label="Monthly Files" used={0} limit={30} />
      </div>

      {/* Quick Tools */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((tool) => {
            const Icon = tool.icon
            return (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-accent/50 transition-all"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${tool.color}15`, color: tool.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{tool.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Upgrade CTA */}
    </div>
  )
}
