import type { MetadataRoute } from "next"
import { toolsConfig } from "@/lib/tools-config"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pdftools.app"

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/sign-in`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/sign-up`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ]

  const toolPages: MetadataRoute.Sitemap = toolsConfig.map((tool) => ({
    url: `${BASE_URL}/tools/${tool.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.9,
  }))

  return [...staticPages, ...toolPages]
}
