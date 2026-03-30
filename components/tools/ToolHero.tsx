import Link from "next/link"
import { ChevronRight, Crown } from "lucide-react"
import type { ToolConfig } from "@/lib/tools-config"

interface ToolHeroProps {
  tool: ToolConfig
}

export function ToolHero({ tool }: ToolHeroProps) {
  const Icon = tool.icon

  return (
    <div className="text-center py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/#tools" className="hover:text-foreground transition-colors">Tools</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{tool.title}</span>
      </nav>

      {/* Icon */}
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl mb-5"
        style={{ backgroundColor: `${tool.color}15`, color: tool.color }}
      >
        <Icon className="h-10 w-10" />
      </div>

      {/* Title */}
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{tool.title}</h1>

      {/* Description + badge */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <p className="text-lg text-muted-foreground">{tool.description}</p>
        {tool.access === "premium" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Crown className="h-3 w-3" />
            Premium
          </span>
        )}
      </div>
    </div>
  )
}
