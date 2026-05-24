"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Save,
  ArrowRight,
  X,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toolCategories, getToolsByCategory, getToolBySlug } from "@/lib/tools-config"
import type { ToolConfig, ToolCategory } from "@/lib/tools-config"
import type { WorkflowStep } from "@/lib/workflowStore"
import { toast } from "sonner"

interface SortableStepItemProps {
  step: WorkflowStep
  index: number
  stepsLength: number
  onRemove: (index: number) => void
}

function SortableStepItem({ step, index, stepsLength, onRemove }: SortableStepItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: index.toString(),
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.9 : 1,
  }

  const tool = getToolBySlug(step.tool)
  const Icon = tool?.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 ${
        isDragging ? "shadow-lg ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
        <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
      </div>
      <div className="flex items-center gap-3 flex-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          <span className="font-medium">{step.label}</span>
        </div>
        {index < stepsLength - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function NewWorkflowPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>("all")
  const [showToolSelector, setShowToolSelector] = useState(false)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const filteredTools = getToolsByCategory(selectedCategory).filter((tool) =>
    tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function addStep(tool: ToolConfig) {
    if (steps.some(step => step.tool === tool.slug)) {
      toast.error(`${tool.title} is already in the workflow`)
      return
    }
    setSteps([
      ...steps,
      {
        tool: tool.slug,
        label: tool.title,
      },
    ])
    setShowToolSelector(false)
    setSearchQuery("")
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = parseInt(active.id as string, 10)
    const newIndex = parseInt(over.id as string, 10)

    const newSteps = [...steps]
    const [moved] = newSteps.splice(oldIndex, 1)
    newSteps.splice(newIndex, 0, moved)
    setSteps(newSteps)
  }

  async function saveWorkflow() {
    if (!name.trim() || steps.length === 0) return
    setSaving(true)
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), steps }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as unknown
        const msg =
          typeof data === "object" && data !== null && typeof (data as Record<string, unknown>).error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Failed to create workflow"
        toast.error(msg)
        return
      }
      router.push("/workflows")
    } catch {
      toast.error("Failed to create workflow")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/workflows">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Create Workflow</h1>
          <p className="mt-1 text-muted-foreground">
            Chain multiple PDF tools together into an automated pipeline.
          </p>
        </div>
      </div>

      {/* Workflow Name */}
      <div className="mb-8">
        <label className="block text-sm font-medium mb-2">Workflow Name</label>
        <input
          type="text"
          placeholder="e.g., Compress & Protect PDF"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-lg rounded-lg border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium">Steps</label>
          <Button
            onClick={() => setShowToolSelector(!showToolSelector)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {showToolSelector ? "Hide Tools" : "Add Step"}
          </Button>
        </div>

        {/* Tool Selector */}
        {showToolSelector && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button variant="ghost" size="icon" onClick={() => { setShowToolSelector(false); setSearchQuery("") }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Categories */}
            <div className="flex flex-wrap gap-2 mb-4">
              {toolCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedCategory === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Tool Grid */}
            <div className="grid gap-3 sm:grid-cols-2 max-h-96 overflow-y-auto">
              {filteredTools.map((tool) => {
                const Icon = tool.icon
                return (
                  <div
                    key={tool.slug}
                    className="cursor-pointer hover:border-primary border border-border rounded-xl p-4 flex items-start gap-3 transition-colors"
                    onClick={() => addStep(tool)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">{tool.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {steps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <GripVertical className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No steps added</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Add tools to your workflow to create an automated pipeline. Tools will run in sequence.
            </p>
            <div className="flex justify-center">
              <Button onClick={() => setShowToolSelector(true)} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add your first step
              </Button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((_, i) => i.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <SortableStepItem
                    key={index}
                    step={step}
                    index={index}
                    stepsLength={steps.length}
                    onRemove={removeStep}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/workflows">
          <Button variant="ghost">Cancel</Button>
        </Link>
        <Button
          onClick={saveWorkflow}
          disabled={!name.trim() || steps.length === 0 || saving}
          className="flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Workflow
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
