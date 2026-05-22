"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  MoreHorizontal,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Workflow } from "@/lib/workflowStore"
import { getWorkflows, deleteWorkflow, runWorkflow } from "@/lib/workflowStore"
import { getToolBySlug } from "@/lib/tools-config"

export default function WorkflowsPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    function refresh() {
      setWorkflows(getWorkflows())
    }

    refresh()
    window.addEventListener("workflows-update", refresh)
    window.addEventListener("storage", refresh)

    return () => {
      window.removeEventListener("workflows-update", refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  function handleRunWorkflow(id: string) {
    runWorkflow(id)
    router.push(`/workflows/${id}/run`)
  }

  function handleDeleteWorkflow(id: string) {
    const workflow = workflows.find(w => w.id === id)
    if (workflow) {
      setDeleteTarget({ id, name: workflow.name })
    }
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteWorkflow(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="mt-1 text-muted-foreground">
            Chain multiple PDF tools together into automated workflows.
          </p>
        </div>
        <Button asChild>
          <Link href="/workflows/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Workflow
          </Link>
        </Button>
      </div>

      {/* Workflow List */}
      {workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <GitBranch className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No workflows yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your first workflow to automate repetitive PDF tasks. Chain
            tools like merge, compress, and convert into a single pipeline.
          </p>
          <Button asChild>
            <Link href="/workflows/new" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create your first workflow
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{workflow.name}</h3>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="flex items-center gap-2" onClick={() => handleRunWorkflow(workflow.id)}>
                      <Play className="h-4 w-4" />
                      Run workflow
                    </DropdownMenuItem>
                    <DropdownMenuItem className="flex items-center gap-2 text-destructive focus:text-destructive" onClick={() => handleDeleteWorkflow(workflow.id)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Steps */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {workflow.steps.map((step, i) => {
                  const tool = getToolBySlug(step.tool)
                  const Icon = tool?.icon
                  if (!Icon) return null
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                        <Icon className="h-3 w-3" />
                        {step.label}
                      </div>
                      {i < workflow.steps.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" className="flex items-center gap-1.5" onClick={() => handleRunWorkflow(workflow.id)}>
                  <Play className="h-3.5 w-3.5" />
                  Run
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4">How Workflows Work</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
              <span className="text-sm font-bold">1</span>
            </div>
            <h3 className="font-medium mb-1">Add your PDF</h3>
            <p className="text-sm text-muted-foreground">
              Upload one or more PDF files to process through the workflow.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
              <span className="text-sm font-bold">2</span>
            </div>
            <h3 className="font-medium mb-1">Tools run in sequence</h3>
            <p className="text-sm text-muted-foreground">
              Each tool processes the output of the previous step automatically.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
              <span className="text-sm font-bold">3</span>
            </div>
            <h3 className="font-medium mb-1">Download the result</h3>
            <p className="text-sm text-muted-foreground">
              Get your final processed file ready to download.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Workflow"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
