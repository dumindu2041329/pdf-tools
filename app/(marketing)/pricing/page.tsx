import type { Metadata } from "next"
import Link from "next/link"
import {
  Check,
  Sparkles,
  Crown,
  ArrowRight,
  ArrowUp,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { BackToTop } from "@/components/shared/BackToTop"
import {
  toolsConfig,
  toolCategories,
  type ToolConfig,
} from "@/lib/tools-config"
import { getLimitsForPlan } from "@/lib/usageLimits"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare Free and Premium PDF Tools plans. See per-tool file limits, daily and monthly quotas, and unlock up to 4 GB uploads with Premium (100 MB cap on Adobe-backed tools).",
}

const FREE = getLimitsForPlan("free")
const PREMIUM = getLimitsForPlan("premium")

function formatFileSize(mb: number) {
  if (mb >= 1024) return `${mb / 1024} GB`
  return `${mb} MB`
}

// Adobe PDF Services has a hard 100 MB input cap (see adobePreflightCheck in
// the API route). All other tools are iLoveAPI-backed and accept up to 4 GB.
const ADOBE_MAX_FILE_SIZE_MB = 100
const ADOBE_TOOL_SLUGS = new Set<string>([
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-powerpoint",
  "ocr-pdf",
])

function isAdobeTool(slug: string) {
  return ADOBE_TOOL_SLUGS.has(slug)
}

function premiumMaxSize(tool: ToolConfig) {
  return isAdobeTool(tool.slug)
    ? ADOBE_MAX_FILE_SIZE_MB
    : PREMIUM.maxFileSizeMB
}

interface ToolRow {
  tool: ToolConfig
  freeLimit: number
  premiumLimit: number
  diff: boolean
}

const toolRows: ToolRow[] = toolsConfig.map((tool) => {
  const freeLimit = tool.maxFilesFree ?? tool.maxFiles
  const premiumLimit = tool.maxFilesPremium ?? tool.maxFiles
  return {
    tool,
    freeLimit,
    premiumLimit,
    diff: freeLimit !== premiumLimit,
  }
})

const groupedRows = toolCategories
  .filter((c) => c.id !== "all")
  .map((cat) => ({
    category: cat,
    rows: toolRows.filter((r) => r.tool.category === cat.id),
  }))
  .filter((g) => g.rows.length > 0)

const features = [
  "Access to all 28+ PDF tools",
  "Standard processing speed",
  "Files up to 20 MB per upload",
  "Up to 5 tool uses per day",
  "Up to 30 tool uses per month",
]

const premiumFeatures = [
  "Everything in Free",
  "Files up to 4 GB per upload",
  "Unlimited daily uses",
  "Unlimited monthly uses",
  "Priority processing queue",
  "Premium support",
]

export default function PricingPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 sm:pt-24 sm:pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight font-serif">
            Free for everyone,{" "}
            <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent">
              Premium for power users
            </span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free with generous limits. Upgrade to Premium for up to 4 GB
            uploads and unlimited processing.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16 pb-16">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Free plan */}
          <div className="relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold">Free</h2>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold">$0</span>
              <span className="text-muted-foreground">/ forever</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              For occasional PDF tasks. No credit card required.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-border/40 bg-muted/30 p-4">
              <Stat label="Daily" value={FREE.daily === -1 ? "∞" : `${FREE.daily}`} hint={FREE.daily === -1 ? "unlimited" : "uses"} />
              <Stat label="Monthly" value={FREE.monthly === -1 ? "∞" : `${FREE.monthly}`} hint={FREE.monthly === -1 ? "unlimited" : "uses"} />
              <Stat label="Max file" value={formatFileSize(FREE.maxFileSizeMB)} hint="per upload" />
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild variant="outline" className="w-full">
                <Link href="/sign-up">Get started free</Link>
              </Button>
            </div>
          </div>

          {/* Premium plan */}
          <div className="relative rounded-2xl border-2 border-primary bg-card p-8 shadow-xl shadow-primary/10">
            <div className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-md">
              <Crown className="h-3 w-3" /> Most popular
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Crown className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold">Premium</h2>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold">$20</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              For heavy users and teams that need bigger files and unlimited runs.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <Stat label="Daily" value="∞" hint="unlimited" highlight />
              <Stat label="Monthly" value="∞" hint="unlimited" highlight />
              <Stat label="Max file" value={formatFileSize(PREMIUM.maxFileSizeMB)} hint="per upload" highlight />
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              {premiumFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild className="w-full">
                <Link href="/account/billing">
                  Upgrade to Premium <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Per-tool detailed comparison */}
      <section className="border-t border-border/40 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight font-serif">
              Per-tool limits
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every tool has its own per-request file cap. Premium raises the
              cap on most tools and unlocks bigger single uploads overall.
              Numbers below show how many files you can submit in one request.
            </p>
          </div>

          <div className="mt-10 space-y-12">
            {groupedRows.map(({ category, rows }) => (
              <div key={category.id}>
                <div className="mb-4 flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{category.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {rows.length} tool{rows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-4 py-3 font-medium text-muted-foreground">
                            Tool
                          </th>
                          <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                            File types
                          </th>
                          <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                            Free files / request
                          </th>
                          <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                            Premium files / request
                          </th>
                          <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                            Premium max size
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rows.map(({ tool, freeLimit, premiumLimit }) => {
                          const Icon = tool.icon
                          return (
                            <tr key={tool.slug} className="hover:bg-muted/30">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                    style={{
                                      backgroundColor: `${tool.color}15`,
                                      color: tool.color,
                                    }}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <Link
                                      href={`/tools/${tool.slug}`}
                                      className="font-medium leading-tight hover:text-primary transition-colors"
                                    >
                                      {tool.title}
                                    </Link>
                                    <div className="text-xs text-muted-foreground line-clamp-1">
                                      {tool.description}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {tool.acceptedFileTypes.join(", ")}
                                </code>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <LimitCell
                                  value={freeLimit}
                                  premiumValue={premiumLimit}
                                  side="free"
                                />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <LimitCell
                                  value={premiumLimit}
                                  premiumValue={premiumLimit}
                                  side="premium"
                                />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {formatFileSize(premiumMaxSize(tool))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {!rows.some((r) => r.diff) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    All {category.label.toLowerCase()} tools share the same cap
                    on Free and Premium — premium mainly raises your global
                    daily/monthly quotas and file size.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ / bottom CTA */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-cyan-500 p-10 sm:p-16 text-center">
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-serif">
                Ready to process more PDFs?
              </h2>
              <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
                Start free and upgrade only when you need bigger files or
                unlimited usage. Cancel anytime.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-primary hover:bg-white/90 shadow-lg text-base px-8"
                >
                  <Link href="/sign-up">Get started free</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="bg-transparent border-white text-white hover:bg-white/10 hover:text-white text-base px-8"
                >
                  <Link href="/account/billing">
                    Upgrade to Premium <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <p className="mt-8 text-xs text-white/70 max-w-2xl mx-auto">
                Limits shown reflect a single processing request. Premium raises
                the per-file size cap from 20 MB to up to 4 GB on iLoveAPI-backed
                tools and up to 100 MB on Adobe-backed tools (PDF → Word, PDF →
                Excel, PDF → PowerPoint, OCR).
              </p>
            </div>
          </div>
        </div>
      </section>

      <BackToTop />
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: string
  value: string
  hint: string
  highlight?: boolean
}) {
  return (
    <div className="text-center">
      <div
        className={
          "text-lg font-bold " + (highlight ? "text-primary" : "text-foreground")
        }
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</div>
    </div>
  )
}

function LimitCell({
  value,
  premiumValue,
  side,
}: {
  value: number
  premiumValue: number
  side: "free" | "premium"
}) {
  if (side === "free" && value < premiumValue) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{value}</span>
        <ArrowUp className="h-3 w-3 text-primary" aria-label="upgraded on premium" />
      </span>
    )
  }

  return <span>{value}</span>
}
