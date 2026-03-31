"use client"

import { GitBranch, Plus, ArrowRight, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toolsConfig } from "@/lib/tools-config"

const exampleWorkflows = [
  {
    name: "Compress & Protect",
    steps: ["compress", "protect"],
    description: "Compress your PDF for smaller size, then add password protection.",
  },
  {
    name: "Watermark & Compress",
    steps: ["watermark", "compress"],
    description: "Add a watermark to your document, then compress it.",
  },
  {
    name: "Merge & Add Page Numbers",
    steps: ["merge", "pagenumber"],
    description: "Merge multiple PDFs together, then add page numbers.",
  },
]

function getToolTitle(slug: string) {
  return toolsConfig.find((t) => t.iloveapiTool === slug)?.title ?? slug
}

export default function WorkflowsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground mt-1">
            Chain multiple tools together to automate your PDF processing.
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      {/* Example workflows */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Example Workflows</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exampleWorkflows.map((wf) => (
            <div
              key={wf.name}
              className="rounded-xl border border-border bg-card p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GitBranch className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{wf.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{wf.description}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {wf.steps.map((step, i) => (
                  <span key={step} className="flex items-center gap-1">
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {getToolTitle(step)}
                    </span>
                    {i < wf.steps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coming soon */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
        <Zap className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Custom Workflows Coming Soon</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Build your own multi-step workflows with drag-and-drop.
        </p>
      </div>
    </div>
  )
}
