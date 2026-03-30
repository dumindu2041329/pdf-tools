"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toolsConfig, toolCategories, type ToolCategory } from "@/lib/tools-config"
import { ToolCard } from "./ToolCard"
import { cn } from "@/lib/utils"

export function ToolGrid() {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all")

  const filteredTools =
    activeCategory === "all"
      ? toolsConfig
      : toolsConfig.filter((t) => t.category === activeCategory)

  return (
    <div>
      {/* Category tabs */}
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {toolCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
              activeCategory === cat.id
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tool cards grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          {filteredTools.map((tool, index) => (
            <ToolCard key={tool.slug} tool={tool} index={index} />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
