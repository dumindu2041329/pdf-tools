"use client"

import { motion } from "framer-motion"
import { Crown, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface UpgradePromptProps {
  feature: string
  plan?: string
}

export function UpgradePrompt({ feature, plan = "Premium" }: UpgradePromptProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-8 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
        <Crown className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold mb-2">Upgrade to {plan}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        <span className="font-medium text-foreground">{feature}</span> is available
        on the {plan} plan. Upgrade to unlock this and many more features.
      </p>
      <Button asChild>
        <Link href="/pricing">
          View Plans
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.div>
  )
}
