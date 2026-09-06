"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { toolsConfig, toolCategories, type ToolCategory } from "@/lib/tools-config"

interface ToolsDropdownProps {
  isOpen: boolean
  onClose: () => void
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

export function ToolsDropdown({ isOpen, onClose, onMouseEnter, onMouseLeave }: ToolsDropdownProps) {
  const categories = toolCategories.filter((c) => c.id !== "all")
  const panelRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when tapping/clicking or pressing Escape outside the
  // panel. A document listener is used instead of a fixed backdrop because the
  // header's backdrop-filter makes it the containing block for fixed
  // descendants, so `fixed inset-0` would not actually cover the page.
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  const getToolsByCategory = (category: ToolCategory) => {
    return toolsConfig.filter((t) => t.category === category)
  }

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      // `fixed` re-anchors the panel to the sticky full-width header (whose
      // backdrop-filter creates a containing block), so it centers on the
      // *viewport* instead of on the "Tools" button near the left edge.
      // Without this, an 1100px panel overflowed the screen on narrower
      // desktop widths and clipped its left columns.
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pt-2 w-[min(1100px,92vw)]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="max-h-[min(70vh,600px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white dark:bg-card border border-border/50 rounded-xl shadow-xl shadow-black/5 p-4 sm:p-6 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-6">
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
                      onClick={onClose}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-md text-sm text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-colors"
                    >
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded"
                        style={{ backgroundColor: `${tool.color}15`, color: tool.color }}
                      >
                        <tool.icon className="h-3 w-3" />
                      </div>
                      <span className="flex-1 truncate">{tool.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
