"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { toolsConfig, toolCategories, type ToolCategory } from "@/lib/tools-config"

interface ToolsDropdownProps {
  isOpen: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const categoryLabels: Record<ToolCategory, string> = {
  all: "All Tools",
  organize: "Organize",
  optimize: "Optimize",
  "convert-to": "Convert to PDF",
  "convert-from": "Convert from PDF",
  edit: "Edit",
  security: "Security",
  ai: "AI",
}

export function ToolsDropdown({ isOpen, onMouseEnter, onMouseLeave }: ToolsDropdownProps) {
  const categories = toolCategories.filter((c) => c.id !== "all")

  const getToolsByCategory = (category: ToolCategory) => {
    return toolsConfig.filter((t) => t.category === category)
  }

  if (!isOpen) return null

  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-background border border-border/50 rounded-xl shadow-xl shadow-black/5 p-6 w-[1100px] max-w-[90vw]">
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-6">
          {categories.map((category) => {
            const tools = getToolsByCategory(category.id)
            if (tools.length === 0) return null
            return (
              <div key={category.id} className="min-w-[140px]">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {categoryLabels[category.id]}
                </h3>
                <ul className="space-y-0.5">
                  {tools.map((tool) => (
                    <li key={tool.slug}>
                      <Link
                        href={`/tools/${tool.slug}`}
                        className="flex items-center gap-2 px-1.5 py-1 rounded-md text-sm text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded"
                          style={{ backgroundColor: `${tool.color}15`, color: tool.color }}
                        >
                          <tool.icon className="h-3 w-3" />
                        </div>
                        <span className="flex-1 truncate">{tool.title}</span>
                        {tool.access === "premium" && (
                          <span className="text-[9px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">
                            PRO
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border/50">
          <Link
            href="/#tools"
            className="flex items-center justify-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View All Tools
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
