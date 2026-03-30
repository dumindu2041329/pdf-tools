"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Crown } from "lucide-react"
import type { ToolConfig } from "@/lib/tools-config"
import { cn } from "@/lib/utils"

interface ToolCardProps {
  tool: ToolConfig
  index?: number
}

export function ToolCard({ tool, index = 0 }: ToolCardProps) {
  const Icon = tool.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        href={`/tools/${tool.slug}`}
        className={cn(
          "group relative flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card p-6",
          "transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {/* Premium badge */}
        {tool.access === "premium" && (
          <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Crown className="h-3 w-3" />
            PRO
          </div>
        )}

        {/* Icon */}
        <div
          className="flex h-14 w-14 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{
            backgroundColor: `${tool.color}15`,
            color: tool.color,
          }}
        >
          <Icon className="h-7 w-7" />
        </div>

        {/* Text */}
        <div className="text-center">
          <h3 className="text-sm font-semibold leading-tight">
            {tool.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {tool.description}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
