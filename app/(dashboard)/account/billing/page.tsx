"use client"

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useEffect, useState } from "react"
import {
  Crown,
  Zap,
  Building2,
  Check,
  Loader2,
  HardDrive,
  Files,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { UsageMeter } from "@/components/shared/UsageMeter"
import { getStats } from "@/lib/activityStore"
import { getLimitsForPlan } from "@/lib/usage"

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    icon: Zap,
    color: "text-muted-foreground",
    borderColor: "border-border",
    features: [
      "5 files per day",
      "30 files per month",
      "20 MB max file size",
      "Basic PDF tools",
      "Community support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$9",
    period: "/month",
    icon: Crown,
    color: "text-yellow-500",
    borderColor: "border-primary",
    features: [
      "Unlimited daily processing",
      "9,999 files per month",
      "200 MB max file size",
      "All PDF tools",
      "AI Summarizer & Translate",
      "Priority support",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$24",
    period: "/month",
    icon: Building2,
    color: "text-purple-500",
    borderColor: "border-purple-500",
    features: [
      "Unlimited everything",
      "500 MB max file size",
      "All premium features",
      "API access",
      "Team management",
      "Dedicated support",
    ],
  },
]

export default function BillingPage() {
  const { user, isLoaded } = useUser()
  const [stats, setStats] = useState(() => getStats())

  useEffect(() => {
    function refresh() {
      setStats(getStats())
    }
    window.addEventListener("activity-update", refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener("activity-update", refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const plan = ((user.publicMetadata as Record<string, unknown>)?.plan as string) ?? "free"
  const limits = getLimitsForPlan(plan)
  const planInfo = plans.find((p) => p.id === plan) ?? plans[0]
  const PlanIcon = planInfo.icon

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Current Plan</h2>
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ${planInfo.color}`}
          >
            <PlanIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{planInfo.name}</h3>
            <p className="text-muted-foreground">
              {planInfo.price}
              <span className="text-sm">{planInfo.period}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Usage This Period</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Files className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{stats.filesToday}</p>
              <p className="text-xs text-muted-foreground">Files today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{stats.filesThisMonth}</p>
              <p className="text-xs text-muted-foreground">Files this month</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{limits.maxFileSizeMB} MB</p>
              <p className="text-xs text-muted-foreground">Max file size</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <UsageMeter
            label="Daily Files"
            used={stats.filesToday}
            limit={limits.daily}
          />
          <UsageMeter
            label="Monthly Files"
            used={stats.filesThisMonth}
            limit={limits.monthly}
          />
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => {
            const Icon = p.icon
            const isCurrent = p.id === plan
            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 p-5 transition-colors ${
                  isCurrent ? p.borderColor : "border-border"
                } ${isCurrent ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`h-5 w-5 ${p.color}`} />
                  <h3 className="font-semibold">{p.name}</h3>
                  {isCurrent && (
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold mb-4">
                  {p.price}
                  <span className="text-sm font-normal text-muted-foreground">
                    {p.period}
                  </span>
                </p>
                <ul className="space-y-2">
                  {p.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <Button
                    className="mt-4 w-full"
                    variant={p.id === "premium" ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/#pricing">
                      {plans.indexOf(p) > plans.findIndex((x) => x.id === plan)
                        ? "Upgrade"
                        : "Downgrade"}{" "}
                      to {p.name}
                    </Link>
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
