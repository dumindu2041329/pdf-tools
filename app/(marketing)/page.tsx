"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Upload,
  Zap,
  Download,
  Shield,
  Clock,
  Lock,
  Star,
  Check,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToolGrid } from "@/components/tools/ToolGrid"

// ── Animation variants ───────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
}

// ── Hero Section ─────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8"
          >
            <Star className="h-3.5 w-3.5" />
            28+ Free PDF Tools — Powered by iLoveAPI
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]"
          >
            Every PDF Tool You Need,{" "}
            <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent">
              All in One Place
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Merge, split, compress, convert, and edit your PDF files.
            Fast, secure, and completely free. No registration needed for basic tools.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" asChild className="shadow-lg shadow-primary/25 text-base px-8">
              <Link href="#tools">
                Explore All Tools
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base px-8">
              <Link href="/sign-up">Get Started Free</Link>
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-green-500" />
              SSL Encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-500" />
              Files auto-deleted in 1 hour
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-violet-500" />
              GDPR Compliant
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ── Tools Section ────────────────────────────────────────────
function ToolsSection() {
  return (
    <section id="tools" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="text-center mb-12"
        >
          <motion.h2
            custom={0}
            variants={fadeUp}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            All the PDF Tools You Need
          </motion.h2>
          <motion.p
            custom={1}
            variants={fadeUp}
            className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto"
          >
            From simple merging to AI-powered summaries — we&apos;ve got every
            PDF workflow covered.
          </motion.p>
        </motion.div>

        <ToolGrid />
      </div>
    </section>
  )
}

// ── How It Works ─────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      icon: Upload,
      title: "Upload Your File",
      description:
        "Drag and drop your PDF or choose from your device. We support files up to 20MB on the free plan.",
      color: "hsl(262, 83%, 58%)",
    },
    {
      icon: Zap,
      title: "Process Instantly",
      description:
        "Our iLoveAPI-powered engine processes your file on dedicated servers. Fast, reliable, and secure.",
      color: "hsl(173, 58%, 39%)",
    },
    {
      icon: Download,
      title: "Download Result",
      description:
        "Get your processed file instantly. Files are auto-deleted from our servers after 1 hour.",
      color: "hsl(200, 80%, 50%)",
    },
  ]

  return (
    <section className="py-20 sm:py-28 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="text-center mb-16"
        >
          <motion.h2
            custom={0}
            variants={fadeUp}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            How It Works
          </motion.h2>
          <motion.p
            custom={1}
            variants={fadeUp}
            className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto"
          >
            Three simple steps to transform your PDFs
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center p-8 rounded-2xl bg-card border border-border/50"
            >
              {/* Step number */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-lg">
                {i + 1}
              </div>

              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5"
                style={{
                  backgroundColor: `${step.color}15`,
                  color: step.color,
                }}
              >
                <step.icon className="h-8 w-8" />
              </div>

              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features Section ─────────────────────────────────────────
function FeaturesSection() {
  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description:
        "Files are processed on dedicated iLoveAPI servers. Most operations complete in under 10 seconds.",
    },
    {
      icon: Shield,
      title: "Bank-Grade Security",
      description:
        "All transfers are SSL encrypted. Optional file encryption at rest. Files auto-deleted after 1 hour.",
    },
    {
      icon: Star,
      title: "100% Free Core Tools",
      description:
        "Merge, split, compress, convert, and more — completely free. No account needed for basic tools.",
    },
  ]

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="text-center mb-16"
        >
          <motion.h2
            custom={0}
            variants={fadeUp}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            Why Choose PDFTools?
          </motion.h2>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="flex flex-col items-center text-center p-8 rounded-2xl border border-border/50 bg-card hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5">
                <feature.icon className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing Preview Section ──────────────────────────────────
function PricingSection() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for occasional use",
      features: [
        "All core PDF tools",
        "30 files/month",
        "20 MB max file size",
        "English OCR",
        "3 AI summaries/month",
      ],
      cta: "Get Started",
      href: "/sign-up",
      highlighted: false,
    },
    {
      name: "Premium",
      price: "$9",
      period: "/month",
      description: "For power users and professionals",
      features: [
        "Everything in Free",
        "500 files/month",
        "200 MB max file size",
        "80+ OCR languages",
        "Edit PDF & Sign PDF",
        "Unlimited AI features",
        "Custom workflows",
        "Priority support",
      ],
      cta: "Upgrade to Premium",
      href: "/pricing",
      highlighted: true,
    },
    {
      name: "Business",
      price: "$29",
      period: "/month",
      description: "For teams and organizations",
      features: [
        "Everything in Premium",
        "Unlimited files",
        "500 MB max file size",
        "Up to 50 team members",
        "Unlimited signatures",
        "API access",
        "Data region selection",
      ],
      cta: "Contact Sales",
      href: "/pricing",
      highlighted: false,
    },
  ]

  return (
    <section className="py-20 sm:py-28 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="text-center mb-16"
        >
          <motion.h2
            custom={0}
            variants={fadeUp}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p
            custom={1}
            variants={fadeUp}
            className="mt-4 text-lg text-muted-foreground"
          >
            Start free. Upgrade when you need more.
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-2xl shadow-primary/10 scale-[1.02]"
                  : "border-border/50 bg-card"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                asChild
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Final CTA Section ────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-cyan-500 p-12 sm:p-16 text-center"
        >
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Ready to Transform Your PDFs?
            </h2>
            <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
              Join thousands of users who trust PDFTools for their document
              workflows. Get started in seconds — no credit card required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 shadow-lg text-base px-8"
                asChild
              >
                <Link href="/sign-up">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 text-base px-8"
                asChild
              >
                <Link href="#tools">View All Tools</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Page Component ───────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ToolsSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
    </>
  )
}
