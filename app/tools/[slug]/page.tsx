import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getToolBySlug, toolsConfig } from "@/lib/tools-config"
import { ToolPageClient } from "./ToolPageClient"

export async function generateStaticParams() {
  return toolsConfig.map((tool) => ({ slug: tool.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const tool = getToolBySlug(slug)
  if (!tool) return {}
  return {
    title: `${tool.title} — Free Online Tool`,
    description: tool.seoDescription,
    openGraph: {
      title: tool.title,
      description: tool.seoDescription,
      type: "website",
    },
  }
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tool = getToolBySlug(slug)
  if (!tool) notFound()

  return <ToolPageClient slug={slug} />
}

