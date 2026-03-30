"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Crown, Zap, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from "next/link"

type BillingPeriod = "monthly" | "annual"

const plans = [
  {
    name: "Free",
    icon: Zap,
    monthly: 0,
    annual: 0,
    description: "For occasional PDF needs",
    features: [
      "All core PDF tools",
      "30 files/month",
      "20 MB max file size",
      "English OCR only",
      "3 AI summaries/month",
    ],
    cta: "Get Started",
    href: "/sign-up",
    popular: false,
  },
  {
    name: "Premium",
    icon: Crown,
    monthly: 9,
    annual: 7.2,
    description: "For power users and professionals",
    features: [
      "Everything in Free",
      "500 files/month",
      "200 MB max file size",
      "80+ OCR languages",
      "Edit PDF with elements",
      "Unlimited AI tools",
      "Custom workflows",
      "Sign PDF (5/month)",
      "File encryption",
      "Region selection",
      "Priority support",
    ],
    cta: "Start Premium",
    href: "/sign-up",
    popular: true,
  },
  {
    name: "Business",
    icon: Building2,
    monthly: 29,
    annual: 23.2,
    description: "For teams and organizations",
    features: [
      "Everything in Premium",
      "Unlimited files",
      "500 MB max file size",
      "Unlimited signatures",
      "Up to 50 team members",
      "API access",
      "Admin dashboard",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    href: "/sign-up",
    popular: false,
  },
]

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly")

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Simple, Transparent Pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your needs. Upgrade or downgrade anytime.
        </p>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center rounded-full border border-border bg-muted/50 p-1">
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              onClick={() => setBilling(period)}
              className={cn(
                "rounded-full px-6 py-2 text-sm font-medium transition-all",
                billing === period
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {period === "monthly" ? "Monthly" : "Annual"}
              {period === "annual" && (
                <span className="ml-1.5 text-xs text-green-500 font-semibold">-20%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {plans.map((plan, i) => {
          const price = billing === "monthly" ? plan.monthly : plan.annual
          const Icon = plan.icon
          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "relative rounded-2xl border p-8 flex flex-col",
                plan.popular
                  ? "border-primary shadow-xl shadow-primary/10 bg-card"
                  : "border-border bg-card"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  plan.popular ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold">
                  ${price}
                </span>
                {price > 0 && (
                  <span className="text-muted-foreground">/mo</span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={plan.popular ? "default" : "outline"}
                className="w-full"
                asChild
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
