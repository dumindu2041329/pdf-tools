"use client"

import { useState } from "react"
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  MoreHorizontal,
  Merge,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface WorkflowStep {
  tool: string
  label: string
  icon: typeof Merge
}

interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  lastRun: string | null
  runCount: number
}

const sampleWorkflows: Workflow[] = []

export default function WorkflowsPage() {
  const [workflows] = useState<Workflow[]>(sampleWorkflows)

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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
                    {workflow.lastRun
                      ? ` · Last run ${workflow.lastRun}`
                      : " · Never run"}
                  </p>
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
                    <DropdownMenuItem className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Run workflow
                    </DropdownMenuItem>
                    <DropdownMenuItem className="flex items-center gap-2 text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Steps */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {workflow.steps.map((step, i) => {
                  const Icon = step.icon
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
                <Button size="sm" className="flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  Run
                </Button>
                <span className="text-xs text-muted-foreground">
                  {workflow.runCount} run{workflow.runCount !== 1 ? "s" : ""}
                </span>
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
    </div>
  )
}
