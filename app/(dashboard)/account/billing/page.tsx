"use client"

import { useUser } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Crown,
  Zap,
  Check,
  Loader2,
  HardDrive,
  Files,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { UsageMeter } from "@/components/shared/UsageMeter"
import { getLimitsForPlan } from "@/lib/usageLimits"

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
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
    price: "$20",
    period: "/month",
    icon: Crown,
    color: "text-yellow-500",
    borderColor: "border-primary",
    features: [
      "Unlimited daily processing",
      "Unlimited files per month",
      "4 GB max file size",
      "All PDF tools",
      "AI Summarizer & Translate",
      "Priority support",
    ],
  }
]

export default function BillingPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<{ filesToday: number; filesThisMonth: number }>({
    filesToday: 0,
    filesThisMonth: 0,
  })
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!isLoaded || !user) return

    let cancelled = false
    const refresh = async () => {
      try {
        const r = await fetch("/api/usage", { cache: "no-store" })
        if (!r.ok || cancelled) return
        const data = (await r.json()) as {
          filesProcessedToday?: number
          filesProcessedThisMonth?: number
        }
        setStats({
          filesToday: typeof data.filesProcessedToday === "number" ? data.filesProcessedToday : 0,
          filesThisMonth:
            typeof data.filesProcessedThisMonth === "number"
              ? data.filesProcessedThisMonth
              : 0,
        })
      } catch {
        // network error — leave existing values
      }
    }
    void refresh()

    // Refresh when the activity store changes (a tool just finished) and when
    // the tab regains focus, so the meter stays in sync with the server.
    const onActivity = () => void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("activity-update", onActivity)
    window.addEventListener("focus", onFocus)

    return () => {
      cancelled = true
      window.removeEventListener("activity-update", onActivity)
      window.removeEventListener("focus", onFocus)
    }
  }, [isLoaded, user])

  // After a successful Stripe checkout, verify the session and refresh the user.
  // We use a ref to ensure the request fires at most once per session, and we
  // unconditionally clear `verifying` in `.finally` so router.replace() (which
  // changes searchParams and re-runs this effect) can never leave the page
  // stuck on the "Confirming your payment…" loading screen.
  const verifyingRef = useRef(false)
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

  useEffect(() => {
    if (!isLoaded || !user) return
    if (verifyingRef.current) return

    const success = searchParamsRef.current.get("success") === "true"
    const sessionId = searchParamsRef.current.get("session_id")
    if (!success || !sessionId) return

    verifyingRef.current = true
    setVerifying(true)

    void (async () => {
      try {
        const r = await fetch("/api/billing/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string }
          toast.error(data.error ?? "Could not verify your payment.")
          return
        }
        await user.reload()
        toast.success("Welcome to Premium! Your plan has been upgraded.")
        router.replace("/account/billing")
      } catch {
        toast.error("Could not verify your payment.")
      } finally {
        setVerifying(false)
      }
    })()
  }, [isLoaded, user, router])

  // Show a toast if the user cancelled checkout.
  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      toast.message("Checkout cancelled. You can upgrade anytime.")
      router.replace("/account/billing")
    }
  }, [searchParams, router])

  async function startCheckout() {
    if (checkoutLoading) return
    setCheckoutLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("Could not start checkout.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (!isLoaded || !user || verifying) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{verifying ? "Confirming your payment…" : "Loading…"}</span>
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
        <div className="grid gap-4 lg:grid-cols-2">
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
                {!isCurrent && p.id === "premium" && (
                  <Button
                    className="mt-4 w-full"
                    variant="default"
                    onClick={startCheckout}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Upgrade to {p.name}
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
