"use client"

import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"
import { useEffect } from "react"

interface Props {
  toolSlug?: string
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const modes = [
  { value: "ranges", label: "By Ranges", desc: "e.g. 1-3, 5, 8-10" },
  { value: "fixed_range", label: "Every N Pages", desc: "Split into chunks" },
  { value: "remove_pages", label: "Remove Pages", desc: "Delete specific pages" },
]

export function SplitOptions({ toolSlug, options, onChange }: Props) {
  const isRemovePagesTool = toolSlug === "remove-pages"

  // Ensure split_mode is set correctly for the tool on mount
  useEffect(() => {
    if (isRemovePagesTool && options.split_mode !== "remove_pages") {
      onChange({ ...options, split_mode: "remove_pages" })
    }
  }, [isRemovePagesTool, options.split_mode, options, onChange])

  const mode = isRemovePagesTool ? "remove_pages" : ((options.split_mode as string) || "ranges")
  const availableModes = modes.filter(m => m.value !== "remove_pages")

  // Parse current comma-separated strings into arrays for iteration
  const rangesList = typeof options.ranges === "string" && options.ranges ? options.ranges.split(",") : [""]
  const removeList = typeof options.remove_pages === "string" && options.remove_pages ? options.remove_pages.split(",") : [""]

  // Array manipulation helpers
  const updateList = (listKey: string, currentList: string[], index: number, val: string) => {
    const safeVal = val.replace(/,/g, "") // Prevent nested comma splitting
    const newList = [...currentList]
    newList[index] = safeVal
    onChange({ ...options, [listKey]: newList.join(",") })
  }

  const addToList = (listKey: string, currentList: string[]) => {
    onChange({ ...options, [listKey]: [...currentList, ""].join(",") })
  }

  const removeFromList = (listKey: string, currentList: string[], index: number) => {
    const newList = currentList.filter((_, i) => i !== index)
    onChange({ ...options, [listKey]: newList.join(",") })
  }

  // Builder for the dynamic list UI
  const renderSectionList = (listKey: string, currentList: string[], label: string, placeholder: string) => (
    <div className="space-y-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="space-y-2">
        {currentList.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              placeholder={placeholder}
              value={val}
              onChange={(e) => updateList(listKey, currentList, i, e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
            />
            {currentList.length > 1 && (
              <button
                type="button"
                onClick={() => removeFromList(listKey, currentList, i)}
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                title="Remove Section"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => addToList(listKey, currentList)}
        className="flex items-center gap-1 text-base font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Section
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      {!isRemovePagesTool && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Split Mode</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableModes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ ...options, split_mode: m.value })}
                className={cn(
                  "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all cursor-pointer",
                  mode === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                )}
              >
                <span className="text-base font-medium">{m.label}</span>
                <span className="text-sm text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "ranges" && renderSectionList("ranges", rangesList, "Page Ranges", "e.g. 1-3 or 5")}

      {mode === "fixed_range" && (
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Pages per split</label>
          <input
            type="number"
            min={1}
            placeholder="e.g. 3"
            value={(options.fixed_range as number) || ""}
            onChange={(e) => onChange({ ...options, fixed_range: Number(e.target.value) })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          />
        </div>
      )}

      {mode === "remove_pages" && renderSectionList("remove_pages", removeList, "Pages to Remove", "e.g. 1, 4-6")}
    </div>
  )
}
