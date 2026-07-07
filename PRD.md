# Product Requirements Document
# Online PDF Tools Platform — Next.js + Clerk + Multi-Engine Processing

---

**Version:** 3.0  
**Date:** July 7, 2026  
**Status:** Production  
**Changelog from v2.0:** Next.js upgraded to 16.x. Database migrated from Neon to Supabase PostgreSQL. Object storage added via Supabase Storage (client-upload pattern for files > 4 MB). PDF processing expanded to a multi-engine architecture: iLoveAPI (cloud), Adobe PDF Services (Office/OCR conversions), pdf-lib (client-side merge/split/rotate), and pdfjs-dist (browser rendering/text extraction). AI features powered by OpenRouter (not direct OpenAI). Stripe billing integrated. Dual deployment targets: Vercel + Fly.io. Mobile Scan-to-PDF flow added. Browser-based Edit PDF editor added. Guest usage tracking via cookies. 29 tools registered.

---

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript (strict) · Tailwind CSS v4 · Clerk (Auth) · iLoveAPI + Adobe PDF Services + pdf-lib (PDF Engines) · Supabase (DB + Storage) · OpenRouter (AI) · Stripe (Payments) · shadcn/ui · next-themes

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Project Structure](#3-project-structure)
4. [Authentication — Clerk Integration](#4-authentication--clerk-integration)
5. [Theme System — Dark / Light](#5-theme-system--dark--light)
6. [Design System & UI Guidelines](#6-design-system--ui-guidelines)
7. [PDF Processing Engines](#7-pdf-processing-engines)
   - 7.1 [iLoveAPI Integration](#71-iloveapi-integration)
   - 7.2 [Adobe PDF Services Integration](#72-adobe-pdf-services-integration)
   - 7.3 [Local Processing (pdf-lib)](#73-local-processing-pdf-lib)
   - 7.4 [Browser-Based Editor (pdfjs-dist + pdf-lib)](#74-browser-based-editor-pdfjs-dist--pdf-lib)
   - 7.5 [Tool-to-Engine Mapping](#75-tool-to-engine-mapping)
8. [Object Storage — Supabase Storage](#8-object-storage--supabase-storage)
9. [Database — Supabase PostgreSQL](#9-database--supabase-postgresql)
10. [Pages & Routes](#10-pages--routes)
11. [Core Feature Modules](#11-core-feature-modules)
    - 11.1 [Organize PDF](#111-organize-pdf)
    - 11.2 [Optimize PDF](#112-optimize-pdf)
    - 11.3 [Convert to PDF](#113-convert-to-pdf)
    - 11.4 [Convert from PDF](#114-convert-from-pdf)
    - 11.5 [Edit PDF](#115-edit-pdf)
    - 11.6 [PDF Security](#116-pdf-security)
    - 11.7 [PDF Intelligence (AI)](#117-pdf-intelligence-ai)
    - 11.8 [Workflow Automation](#118-workflow-automation)
12. [Shared UI Components](#12-shared-ui-components)
13. [API Routes](#13-api-routes)
14. [State Management](#14-state-management)
15. [Subscription & Billing](#15-subscription--billing)
16. [Usage Limits & Guest Access](#16-usage-limits--guest-access)
17. [Mobile Scan-to-PDF](#17-mobile-scan-to-pdf)
18. [Security & Compliance](#18-security--compliance)
19. [Performance Requirements](#19-performance-requirements)
20. [SEO & Metadata](#20-seo--metadata)
21. [Environment Variables](#21-environment-variables)
22. [Deployment](#22-deployment)
23. [Testing Strategy](#23-testing-strategy)

---

## 1. Executive Summary

This document specifies the complete requirements for a modern, web-based PDF productivity platform. The platform provides **29 PDF tools** across 7 categories, powered by a **multi-engine architecture**: iLoveAPI for cloud PDF processing, Adobe PDF Services for Office conversions and OCR, pdf-lib for client-side operations (merge, split, rotate), and pdfjs-dist for browser-based rendering and text extraction.

The platform supports both authenticated users (via Clerk) and guest users (cookie-tracked), with a freemium model: free tier (5 files/day, 30/month, 20 MB max) and premium tier ($20/month via Stripe, unlimited files, 4 GB max). AI features (summarization, translation) are powered by OpenRouter using the `openai/gpt-oss-120b:free` model.

Dual deployment targets are supported: **Vercel** (primary, serverless) and **Fly.io** (Docker, 2 GB RAM, bypasses Vercel's body-size and timeout limits).

---

## 2. Tech Stack & Architecture

### Frontend

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js (App Router, Turbopack) | ^16.2.3 |
| Language | TypeScript (strict) | ^5.x |
| Styling | Tailwind CSS | v4 |
| Component Library | shadcn/ui (Radix + CVA) | Latest |
| Theme Management | next-themes | ^0.4.6 |
| Icons | Lucide React | ^1.7.0 |
| Animations | Framer Motion | ^12.38.0 |
| 3D Background | Three.js | ^0.183.2 |
| Drag & Drop | @dnd-kit (core + sortable + utilities) | ^6.3.1 / ^10.0.0 |
| Toasts | Sonner | ^2.0.7 |
| Fonts | Geist Sans, Geist Mono, Noto Serif Display | next/font/google |
| Diagrams | Mermaid (dynamic import) | ^11.15.0 |
| QR Codes | qrcode | ^1.5.4 |

### Authentication

| Layer | Choice |
|-------|--------|
| Auth Provider | Clerk |
| SDK | `@clerk/nextjs` ^7.0.7 |
| Middleware | `clerkMiddleware()` in `proxy.ts` |
| Server Auth | `auth()` helper |
| Client Auth | `useAuth()`, `useClerk()` hooks |

### PDF Processing Engines

| Engine | Package | Used For |
|--------|---------|----------|
| iLoveAPI (Cloud) | `@ilovepdf/ilovepdf-nodejs` ^0.3.1 | Compress, repair, watermark, page numbers, extract, image→PDF, office→PDF, HTML→PDF, PDF→JPG, PDF/A, protect, unlock, sign |
| Adobe PDF Services | `@adobe/pdfservices-node-sdk` ^4.1.0 | PDF→Word, PDF→Excel, PDF→PowerPoint, OCR |
| pdf-lib (Local) | `pdf-lib` ^1.17.1 | Client-side merge, split, rotate; browser editor save |
| pdfjs-dist (Browser) | `pdfjs-dist` ^4.10.38 | PDF page rendering (editor), text extraction (AI tools), PDF preview |
| JSZip | `jszip` ^3.10.1 | Multi-file output bundling |
| JWT | `jsonwebtoken` ^9.0.3 | iLoveAPI auth token generation |

### AI Services

| Layer | Choice |
|-------|--------|
| Provider | OpenRouter (via `openai` ^6.33.0 SDK) |
| Model | `openai/gpt-oss-120b:free` |
| Base URL | `https://openrouter.ai/api/v1` |

### Database & Storage

| Layer | Choice |
|-------|--------|
| Database | Supabase PostgreSQL (via `@supabase/supabase-js` ^2.108.2) |
| Object Storage | Supabase Storage (same project) |
| Schema Management | Supabase migrations (no runtime DDL) |

### Payments

| Layer | Choice |
|-------|--------|
| Provider | Stripe (`stripe` ^16.12.0) |
| Plan | Premium $20/month subscription |

### Infrastructure

| Layer | Choice |
|-------|--------|
| Primary Deployment | Vercel |
| Docker Deployment | Fly.io (`pdf-tools-chi.fly.dev`) |
| Analytics | Vercel Analytics + Vercel Speed Insights |

---

## 3. Project Structure

```
pdf-tools/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                         # Gradient backdrop, no nav
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                         # Auth-protected (client redirect)
│   │   ├── account/
│   │   │   ├── _components/AccountSidebar.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                       # Redirects → /account/profile
│   │   │   ├── billing/page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   └── security/page.tsx
│   │   └── workflows/
│   │       ├── page.tsx
│   │       ├── new/page.tsx
│   │       └── [id]/run/page.tsx
│   │
│   ├── (marketing)/
│   │   ├── layout.tsx                         # Navbar + Footer
│   │   ├── page.tsx                           # Landing / Home
│   │   └── pricing/page.tsx                   # Free vs Premium + per-tool table
│   │
│   ├── api/
│   │   ├── activity/route.ts                  # Client-side tool completion recording
│   │   ├── ai/
│   │   │   ├── summarize/route.ts             # AI summarize + chat (SSE)
│   │   │   └── translate/route.ts             # AI translate (SSE)
│   │   ├── billing/
│   │   │   ├── checkout/route.ts              # Stripe Checkout Session
│   │   │   └── verify-session/route.ts        # Post-checkout verification
│   │   ├── download/[id]/route.ts             # In-memory file download
│   │   ├── scan-session/[sessionId]/
│   │   │   ├── route.ts                       # GET (list), POST (join/save), DELETE
│   │   │   └── destroy/route.ts               # POST (sendBeacon cleanup)
│   │   ├── tools/
│   │   │   ├── [tool]/route.ts                # Unified tool handler (all engines)
│   │   │   └── sign/route.ts                  # PDF signing (iLoveAPI Signature API)
│   │   ├── upload/route.ts                    # Supabase Storage signed-upload URLs
│   │   ├── usage/route.ts                     # Usage counts (auth + guest)
│   │   └── webhooks/
│   │       ├── iloveapi/route.ts              # iLoveAPI webhooks (logging only)
│   │       └── stripe/route.ts                # Stripe subscription lifecycle
│   │
│   ├── edit-pdf-editor/
│   │   ├── layout.tsx
│   │   └── page.tsx                           # Browser-based PDF editor
│   │
│   ├── mobile-scan/page.tsx                   # Mobile camera capture
│   │
│   ├── scan-editor/
│   │   ├── layout.tsx
│   │   └── page.tsx                           # Review + save scanned images
│   │
│   ├── tools/
│   │   ├── layout.tsx                         # Navbar wrapper
│   │   └── [slug]/
│   │       ├── page.tsx                       # Server component (metadata + static params)
│   │       └── ToolPageClient.tsx             # Client component (tool UI + workflow mode)
│   │
│   ├── favicon.ico
│   ├── globals.css                            # Tailwind v4 + theme tokens
│   ├── layout.tsx                             # Root: ClerkProvider, ThemeProvider, Toaster, fonts
│   ├── not-found.tsx
│   └── sitemap.ts                             # Generated from toolsConfig
│
├── components/
│   ├── layout/
│   │   ├── Footer.tsx                         # 4-column link grid
│   │   ├── Navbar.tsx                         # Sticky nav + auth menu
│   │   ├── ToolsDropdown.tsx                  # 5-col mega-menu by category
│   │   └── UserMenu.tsx                       # Avatar dropdown (workflows, account, sign out)
│   ├── shared/
│   │   ├── BackToTop.tsx                      # Floating scroll-to-top (framer-motion)
│   │   └── UsageMeter.tsx                     # Progress bar with warning/danger thresholds
│   ├── theme/
│   │   ├── ThemeProvider.tsx                  # next-themes wrapper
│   │   ├── ThemeToggle.tsx                    # Light/Dark/System dropdown
│   │   └── Toaster.tsx                        # Sonner toaster, mobile-aware
│   ├── tools/
│   │   ├── ai-summarizer/
│   │   │   ├── AiSummarizerView.tsx           # Two-pane summarizer UI
│   │   │   ├── ChatPanel.tsx                  # Chat UI, SSE consumer, markdown + mermaid
│   │   │   ├── PdfPreview.tsx                 # Page-by-page PDF preview (pdfjs-dist)
│   │   │   └── extract-pdf-text.ts            # pdfjs-dist: File → plain text
│   │   ├── edit-pdf/
│   │   │   └── EditPdfEditorClient.tsx        # Full PDF editor (text + hand tools)
│   │   ├── options/                           # Per-tool option forms + previews
│   │   │   ├── CompressOptions.tsx
│   │   │   ├── ExtractOptions.tsx
│   │   │   ├── HtmlToPdfOptions.tsx
│   │   │   ├── ImageToPdfOptions.tsx
│   │   │   ├── OcrOptions.tsx
│   │   │   ├── OrganizeOptions.tsx
│   │   │   ├── PageNumberOptions.tsx
│   │   │   ├── PageNumberPreview.tsx
│   │   │   ├── PdfaOptions.tsx
│   │   │   ├── PdfToJpgOptions.tsx
│   │   │   ├── ProtectOptions.tsx
│   │   │   ├── RotateOptions.tsx
│   │   │   ├── RotatePreview.tsx
│   │   │   ├── SplitOptions.tsx
│   │   │   ├── ToolOptions.tsx                # Dispatcher: renders the right option panel
│   │   │   ├── TranslateOptions.tsx
│   │   │   ├── UnlockOptions.tsx
│   │   │   ├── WatermarkOptions.tsx
│   │   │   └── WatermarkPreview.tsx
│   │   ├── scan-to-pdf/
│   │   │   ├── MobileScanView.tsx             # Phone-side camera capture
│   │   │   ├── ScanEditorClient.tsx           # Review, rotate, reorder captures
│   │   │   └── ScanToPdfView.tsx              # Desktop: QR + live image grid
│   │   ├── shared/
│   │   │   ├── CodeBlock.tsx                  # Fenced code + clipboard
│   │   │   └── formatContent.tsx              # Markdown/table/mermaid block parser
│   │   ├── translate-pdf/
│   │   │   └── TranslatePdfView.tsx           # Streaming translation UI
│   │   ├── DownloadCard.tsx                   # Result card + download button
│   │   ├── FileUploader.tsx                   # Drop zone + dnd-kit sortable list
│   │   ├── ProcessingModal.tsx                # 5-step animated processing overlay
│   │   ├── ToolCard.tsx                       # Tool grid card
│   │   ├── ToolGrid.tsx                       # Category tabs + responsive grid
│   │   └── ToolHero.tsx                       # Breadcrumb + icon hero
│   └── ui/                                    # shadcn/ui primitives
│       ├── button.tsx
│       ├── confirm-dialog.tsx
│       ├── dropdown-menu.tsx
│       └── glsl-hills.tsx                     # Three.js animated background
│
├── hooks/
│   └── useTool.ts                             # Central tool state machine + upload pipeline
│
├── lib/
│   ├── iloveapi/
│   │   ├── client.ts                          # SDK singleton + JWT (getRawToken)
│   │   ├── errors.ts                          # ILoveAPIError, mapILoveAPIError, withRetry
│   │   ├── page-number-mapper.ts              # UI → iLoveAPI pagenumber options
│   │   ├── signature.ts                       # Signature API wrapper
│   │   ├── tools.ts                           # runTool() — 4-step workflow
│   │   ├── types.ts                           # ILoveAPITool, TaskStatus, response shapes
│   │   └── watermark-mapper.ts                # UI → iLoveAPI watermark options
│   ├── pdf/
│   │   ├── adobe-export-converter.ts          # ExportPDFJob + OCRJob
│   │   ├── merge-client.ts                    # processMergeLocal() — pdf-lib
│   │   ├── office-converter.ts                # getSafeBaseName, execFile, Python helpers
│   │   ├── rotate-client.ts                   # processRotateLocal() — pdf-lib
│   │   └── split-client.ts                    # processSplitLocal() — pdf-lib + jszip
│   ├── activityStore.ts                       # localStorage activity feed (≤50 entries)
│   ├── auth.ts                                # Clerk plan helpers (getUserPlan, grant/revoke)
│   ├── db.ts                                  # Supabase RPC wrappers + self-heal
│   ├── device-info.ts                         # parseDeviceInfo(ua) — mobile scan pairing
│   ├── extractFormatConverter.ts              # extract-data → csv/json/md/txt
│   ├── fileStore.ts                           # In-memory Map for /api/download/[id]
│   ├── guest-usage.ts                         # Cookie-backed counter for guests
│   ├── stripe.ts                              # Stripe SDK singleton + config
│   ├── supabase.ts                            # Server + browser Supabase clients
│   ├── supabase-storage.ts                    # Server: upload, download, delete, signed URLs
│   ├── supabase-upload.ts                     # Client: shouldUseDirectUpload, uploadFileDirect
│   ├── toolValidation.ts                      # Per-tool UI validation
│   ├── tools-config.ts                        # Tool registry (29 tools) + categories
│   ├── usage.ts                               # canProcessFile, recordProcessingEvent, getUsageStats
│   ├── usageLimits.ts                         # Plan limit constants
│   ├── utils.ts                               # cn() — clsx + tailwind-merge
│   ├── workflowSession.ts                     # IndexedDB-backed workflow session
│   └── workflowStore.ts                       # localStorage workflow store (read-only mirror)
│
├── proxy.ts                                   # Clerk middleware (Next.js 16 convention)
├── next.config.ts                             # Turbopack, proxyClientMaxBodySize: "4gb"
├── vercel.json                                # Per-route maxDuration + security headers
├── Dockerfile                                 # Fly.io: node:22-slim, multi-stage
├── docker-entrypoint.js                       # Node CJS entrypoint for Fly
├── fly.toml                                   # Fly.io: 2 GB RAM, bom region
├── eslint.config.mjs                          # Flat ESLint config
├── postcss.config.mjs                         # Tailwind v4 PostCSS plugin
├── tsconfig.json                              # "@/*" path alias
├── package.json
└── package-lock.json
```

---

## 4. Authentication — Clerk Integration

### 4.1 Setup

```bash
npm install @clerk/nextjs
```

**Environment Variables:**
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

### 4.2 Root Layout

```tsx
// app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs"
import { ThemeProvider } from "@/components/theme/ThemeProvider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

### 4.3 Middleware — `proxy.ts`

Next.js 16 uses `proxy.ts` (not `middleware.ts`) for the Clerk middleware file.

```typescript
// proxy.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher([])  // No routes enforced at middleware level

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
}, { clockSkewInMs: 60000 })

export const config = {
  matcher: [
    "/((?!_next|.*\\..*|api/tools/|api/activity|api/usage|api/download/|api/ai/|api/billing/|api/webhooks/.*|api/upload|api/scan-session/).*)"
  ],
}
```

**Note:** Route protection is handled at the page level — the `(dashboard)` layout redirects unauthenticated users to `/sign-in` on the client.

### 4.4 Premium Access via Clerk Metadata

Plan is stored in Clerk `publicMetadata.plan` (source of truth) and mirrored to the `app_user.plan` column in Supabase.

```typescript
// lib/auth.ts
export type UserPlan = "free" | "premium"

export async function getUserPlan(userId: string): Promise<UserPlan> {
  // Tries Clerk metadata first, falls back to Supabase DB
}

export async function grantPremiumAccess(userId: string): Promise<void> {
  // Sets Clerk metadata + syncs to DB
}

export async function revokePremiumAccess(userId: string): Promise<void> {
  // Sets Clerk metadata + syncs to DB (best-effort)
}
```

---

## 5. Theme System — Dark / Light

### 5.1 CSS Design Tokens

```css
/* app/globals.css */
@import "tailwindcss";

@layer base {
  :root {
    --background: 35 74% 96%;            /* Warm cream */
    --foreground: 224 71.4% 4.1%;
    --primary: 262.1 83.3% 57.8%;        /* Vivid violet */
    --primary-foreground: 210 20% 98%;
    --card: 0 0% 100%;
    --muted: 220 14.3% 95.9%;
    --destructive: 0 84.2% 60.2%;
    --border: 220 13% 91%;
    --ring: 262.1 83.3% 57.8%;
    --radius: 0.75rem;
  }
  .dark {
    --background: 224 71.4% 4.1%;        /* Near-black blue */
    --foreground: 210 20% 98%;
    --primary: 263.4 70% 65%;            /* Lighter violet */
    --card: 224 71.4% 6%;
    --muted: 215 27.9% 16.9%;
    --destructive: 0 62.8% 30.6%;
    --border: 215 27.9% 16.9%;
    --ring: 263.4 70% 65%;
  }
}
```

### 5.2 Theme Components

- `ThemeProvider.tsx` — next-themes wrapper (`attribute="class"`, `defaultTheme="system"`)
- `ThemeToggle.tsx` — Light/Dark/System dropdown with Sun/Moon/Monitor icons

---

## 6. Design System & UI Guidelines

### 6.1 Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / Hero | Noto Serif Display | 800 | 4xl–7xl |
| Headings | Geist Sans | 700 | 2xl–3xl |
| Body | Geist Sans | 400 | base |
| Labels | Geist Sans | 500 | sm |
| Code | Geist Mono | 400 | sm |

### 6.2 Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Primary | Violet `hsl(262,83%,58%)` | `hsl(263,70%,65%)` | CTAs, active states |
| Background | Warm cream `hsl(35,74%,96%)` | Near-black `hsl(224,71%,4%)` | Page background |
| Card | White | `hsl(224,71%,6%)` | Cards, modals |
| Muted | `hsl(220,14%,96%)` | `hsl(215,28%,17%)` | Subtle sections |
| Destructive | `hsl(0,84%,60%)` | `hsl(0,63%,31%)` | Error states |

### 6.3 Animation Principles

- Landing page: Three.js GLSL hills background (lazy-loaded via `requestIdleCallback`)
- Tool cards: staggered entrance (40ms delay per card, framer-motion)
- File upload: drag-and-drop with dnd-kit, 20-color file palette
- Processing: 5-step animated modal (start → upload → process → download → done)
- Success: download card fade-in with framer-motion

### 6.4 Responsive Breakpoints

| Breakpoint | Width | Tool Grid |
|------------|-------|-----------|
| Mobile | < 640px | 2 columns |
| Tablet | 640–1024px | 3 columns |
| Desktop | > 1024px | 4 columns |
| Wide | > 1280px | 5 columns |

---

## 7. PDF Processing Engines

The platform uses a **multi-engine architecture** where each tool is routed to the most appropriate processing engine.

### 7.1 iLoveAPI Integration

iLoveAPI handles cloud-based PDF processing via a 4-step workflow.

#### Authentication

```typescript
// lib/iloveapi/client.ts
import jwt from "jsonwebtoken"

function getRawToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: ILOVEAPI_PUBLIC_KEY, iat: now, nbf: now, exp: now + 7200 },
    ILOVEAPI_SECRET_KEY
  )
}

// SDK singleton (cached on global in dev)
export const ilovepdf = new ILovePDFApi(ILOVEAPI_PUBLIC_KEY, ILOVEAPI_SECRET_KEY)
```

#### 4-Step Workflow

```
Step 1 — START:    ilovepdf.newTask(tool) → task.start()
Step 2 — UPLOAD:   task.addFile(buffer, filename) for each file
Step 3 — PROCESS:  task.process(options)
Step 4 — DOWNLOAD: task.download() → ArrayBuffer
Cleanup:           task.delete()
```

#### runTool Orchestrator

```typescript
// lib/iloveapi/tools.ts
export async function runTool(input: ToolRunInput): Promise<ToolRunResult> {
  // Handles file upload, options merging, watermark image upload,
  // pdfjpg ZIP wrapping, and task cleanup
}

export async function runWorkflow(
  initialFiles, steps, outputFilename?, onStepComplete?
): Promise<ToolRunResult> {
  // Chains multiple tools via task.connect()
}
```

#### Error Handling

```typescript
// lib/iloveapi/errors.ts
export class ILoveAPIError extends Error {
  type: string; code?: number; param?: string
}

export function mapILoveAPIError(error): { userMessage: string; retryable: boolean }
// Maps: WrongPassword, DamagedFile, OutOfRange, TimeOut, NonConformant, OUT_OF_CREDITS

export async function withRetry<T>(fn, maxRetries = 3, delayMs = 1000): Promise<T>
// Exponential backoff, only retries retryable errors
```

#### iLoveAPI Tools Used

| iLoveAPI Slug | Platform Tools |
|---------------|---------------|
| `compress` | Compress PDF |
| `repair` | Repair PDF |
| `watermark` | Watermark PDF |
| `pagenumber` | Add Page Numbers |
| `extract` | Extract Data |
| `imagepdf` | JPG to PDF, Scan to PDF |
| `officepdf` | Word/Excel/PowerPoint to PDF |
| `htmlpdf` | HTML to PDF |
| `pdfjpg` | PDF to JPG |
| `pdfa` | PDF to PDF/A |
| `validatepdfa` | Validate PDF/A |
| `protect` | Protect PDF |
| `unlock` | Unlock PDF |
| `sign` | Sign PDF (Signature API) |

### 7.2 Adobe PDF Services Integration

Adobe handles conversions from PDF to Office formats and OCR.

```typescript
// lib/pdf/adobe-export-converter.ts
export async function convertPdfToWordAdobe(pdfBuffer, sourceFilename)
export async function convertPdfToExcelAdobe(pdfBuffer, sourceFilename)
export async function convertPdfToPowerpointAdobe(pdfBuffer, sourceFilename)
export async function ocrPdfAdobe(pdfBuffer, sourceFilename, locale?)
export function resolveOcrLocale(code): OCRSupportedLocale
```

- Uses `@adobe/pdfservices-node-sdk` with credentials from `PDF_SERVICES_CLIENT_ID` / `PDF_SERVICES_CLIENT_SECRET`
- 10-minute request timeout (`ADOBE_REQUEST_TIMEOUT_MS = 600000`)
- 37 OCR locale mappings
- **Hard 100 MB input limit** — `adobePreflightCheck()` short-circuits before upload

### 7.3 Local Processing (pdf-lib)

Client-side or server-side processing without cloud API calls.

```typescript
// lib/pdf/merge-client.ts — Client-side
export async function processMergeLocal(files, options): Promise<{ buffer, downloadFilename }>

// lib/pdf/split-client.ts — Client-side
export async function processSplitLocal(fileBuffer, options, originalFilename?): Promise<{ buffer, downloadFilename }>
// Modes: ranges, fixed_range, remove_pages. Supports merge_after + per-page rotation.

// lib/pdf/rotate-client.ts — Server-side (returns base64)
export async function processRotateLocal(files, options): Promise<{ buffer, downloadFilename }>
```

### 7.4 Browser-Based Editor (pdfjs-dist + pdf-lib)

The Edit PDF tool bypasses the API entirely, running in the browser at `/edit-pdf-editor`.

- **Rendering:** pdfjs-dist rasterizes pages at `RENDER_SCALE = 1.4`
- **Editing:** Text annotations with drag, resize, font/color/alignment controls
- **Saving:** pdf-lib applies annotations to the original PDF, triggers Blob download
- **Toolbar:** Hand (pan), Text (the active writer), Image/Draw/Shape (placeholders)

### 7.5 Tool-to-Engine Mapping

| Tool Slug | Engine | Processing Location | Notes |
|-----------|--------|-------------------|-------|
| `merge-pdf` | pdf-lib | Client-side | `processMergeLocal()` |
| `split-pdf` | pdf-lib | Client-side | `processSplitLocal()` — 3 modes |
| `remove-pages` | pdf-lib | Client-side | `processSplitLocal()` — remove_pages mode |
| `organize-pdf` | pdf-lib | Client-side | Merge then split with reorder |
| `rotate-pdf` | pdf-lib | Server-side | `processRotateLocal()`, base64 response |
| `compress-pdf` | iLoveAPI | Server | Multi-file → ZIP |
| `repair-pdf` | iLoveAPI | Server | Multi-file → ZIP |
| `ocr-pdf` | Adobe | Server | `ocrPdfAdobe()`, multi-file → ZIP |
| `watermark-pdf` | iLoveAPI | Server | Text or image mode |
| `add-page-numbers` | iLoveAPI | Server | Multi-file → ZIP |
| `extract-data` | iLoveAPI | Server | Returns CSV/JSON/MD/TXT |
| `scan-to-pdf` | iLoveAPI | Server | `imagepdf`, multi-file → ZIP |
| `jpg-to-pdf` | iLoveAPI | Server | `imagepdf`, multi-file → ZIP |
| `word-to-pdf` | iLoveAPI | Server | `officepdf`, multi-file → ZIP |
| `excel-to-pdf` | iLoveAPI | Server | `officepdf`, multi-file → ZIP |
| `powerpoint-to-pdf` | iLoveAPI | Server | `officepdf`, multi-file → ZIP |
| `html-to-pdf` | iLoveAPI | Server | URL-only, `htmlpdf` |
| `pdf-to-word` | Adobe | Server | `ExportPDFJob` → DOCX |
| `pdf-to-excel` | Adobe | Server | `ExportPDFJob` → XLSX, multi-file → ZIP |
| `pdf-to-powerpoint` | Adobe | Server | `ExportPDFJob` → PPTX, multi-file → ZIP |
| `pdf-to-jpg` | iLoveAPI | Server | `pdfjpg`, multi-file → ZIP |
| `pdf-to-pdfa` | iLoveAPI | Server | Multi-file → ZIP |
| `validate-pdfa` | iLoveAPI | Server | Returns `{ validationSuccess, message, result }` |
| `edit-pdf` | pdfjs-dist + pdf-lib | Browser | Dedicated `/edit-pdf-editor` page |
| `unlock-pdf` | iLoveAPI | Server | Password in file object |
| `protect-pdf` | iLoveAPI | Server | Multi-file → ZIP |
| `sign-pdf` | iLoveAPI Signature API | Server | Dedicated `/api/tools/sign` route |
| `ai-summarizer` | OpenRouter | Client + Server | Client text extraction + SSE streaming |
| `translate-pdf` | OpenRouter | Client + Server | Client text extraction + SSE streaming |

---

## 8. Object Storage — Supabase Storage

### Why

Vercel truncates request bodies at ~4.5 MB. The free plan allows 20 MB files and premium allows 4 GB, so the **client-upload pattern** is used: the browser gets a signed upload URL from the server, uploads directly to Supabase Storage, and passes the public URL back for processing.

### Buckets

| Bucket | Constant | Purpose |
|--------|----------|---------|
| `pdf-uploads` | `PDF_UPLOADS_BUCKET` | Source PDFs, images, edit-pdf uploads |
| `scan-sessions` | `SCAN_SESSIONS_BUCKET` | Mobile-scan captures (`scan-sessions/<sessionId>/`) |

Both are **public** buckets with permissive RLS policies. Object paths include random suffixes for unguessability.

### Upload Flow

1. `useTool` calls `shouldUseDirectUpload(file)` — true for files > 4 MB
2. Browser POSTs to `/api/upload` → receives `{ signedUrl, token, path }`
3. Browser PUTs file directly to Supabase Storage (XHR for progress events)
4. Resulting public URL sent to `/api/tools/[tool]` as `blobUrls` JSON field
5. Server calls `downloadFromStorage(url)` to re-hydrate as Buffer
6. Small files (≤ 4 MB) still use the original multipart/form-data path

### Server Helpers (`lib/supabase-storage.ts`)

```typescript
export function uploadToStorage(input): Promise<StorageObject>
export function downloadFromStorage(url): Promise<Buffer>
export function deleteFromStorage(url): Promise<void>
export function listStorageObjects(options): Promise<...>
export function deleteStoragePrefix(options): Promise<number>
export function createSignedUploadUrl(bucket, pathname): Promise<{ signedUrl, token, path }>
export function parsePublicUrl(url): { bucket, pathname } | null
```

### Client Helpers (`lib/supabase-upload.ts`)

```typescript
export function shouldUseDirectUpload(file: File): boolean  // > 4 MB
export function uploadFileDirect(file, options?): Promise<DirectUploadResult>
export function deleteFromStorageBrowser(url): Promise<void>
```

---

## 9. Database — Supabase PostgreSQL

The same Supabase project serves both Storage and the database. Connections go through PostgREST via the Supabase JS client.

### Schema (4 tables)

| Table | Primary Key | Purpose |
|-------|-------------|---------|
| `app_user` | `clerk_user_id text` | Clerk userId mapping, stores `plan` |
| `workflow` | `id UUID` | Workflow records (name, last_run, run_count) |
| `workflow_step` | `id UUID` | Ordered steps per workflow (FK → workflow) |
| `usage_counter` | `user_id text` | Denormalized daily/monthly counters |

### Stored Procedures (9 RPCs)

| Function | Purpose |
|----------|---------|
| `pdf_tools_health_check()` | Table existence check |
| `pdf_tools_read_counter(p_user_id)` | O(1) counter read (stale buckets → 0) |
| `pdf_tools_record_usage_event(p_user_id, p_status)` | Atomic upsert (only `success` bumps) |
| `pdf_tools_list_workflows(p_user_id)` | Newest-first with aggregated steps |
| `pdf_tools_get_workflow(p_user_id, p_id)` | Single workflow with steps |
| `pdf_tools_create_workflow(p_user_id, p_name, p_steps)` | Insert workflow + steps |
| `pdf_tools_update_workflow(...)` | Update name and/or replace steps |
| `pdf_tools_delete_workflow(...)` | CASCADE delete |
| `pdf_tools_run_workflow(...)` | Increment run_count, stamp last_run |

### Self-Healing

- `ensureDbSchema()` — no-op (DDL owned by Supabase migrations)
- `ensureDbSchemaIfStale()` — hourly health check via `pdf_tools_health_check()`
- `isMissingRelationError(err)` — detects SQLSTATE `42P01`
- `recordProcessingEvent()` catches missing-relation, resets init, retries once

---

## 10. Pages & Routes

### Public Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `app/(marketing)/page.tsx` | Landing: GLSL hills hero, tool grid, feature highlights |
| `/pricing` | `app/(marketing)/pricing/page.tsx` | Free vs Premium cards + per-tool comparison table |
| `/sign-in` | `app/(auth)/sign-in/` | Clerk sign-in (gradient backdrop) |
| `/sign-up` | `app/(auth)/sign-up/` | Clerk sign-up |
| `/tools/[slug]` | `app/tools/[slug]/` | All 29 tools (static params from `toolsConfig`) |
| `/edit-pdf-editor` | `app/edit-pdf-editor/` | Browser PDF editor (`?file=<url>&filename=<name>`) |
| `/mobile-scan` | `app/mobile-scan/` | Mobile camera capture (`?session=<id>`) |
| `/scan-editor` | `app/scan-editor/` | Review + save scanned images (`?session=<id>`) |

### Auth-Protected Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/account/profile` | `app/(dashboard)/account/profile/` | User profile |
| `/account/billing` | `app/(dashboard)/account/billing/` | Billing + Stripe upgrade |
| `/account/security` | `app/(dashboard)/account/security/` | Security settings |
| `/workflows` | `app/(dashboard)/workflows/` | Workflow list |
| `/workflows/new` | `app/(dashboard)/workflows/new/` | Create workflow |
| `/workflows/[id]/run` | `app/(dashboard)/workflows/[id]/run/` | Run workflow |

### Tool Page Layout

```
┌──────────────────────────────────────────────┐
│  Breadcrumb: Home > Tools > [Tool Name]      │
│  ToolHero (icon + title + description)       │
│                                              │
│  FileUploader (drag-and-drop, sortable list) │
│  ToolOptions (per-tool option panel)         │
│  [Process Button]                            │
│                                              │
│  ProcessingModal (5-step animated overlay)   │
│  Step 1: Connecting to server                │
│  Step 2: Uploading your file                 │
│  Step 3: Processing on server                │
│  Step 4: Preparing download                  │
│  Step 5: Ready!                              │
│                                              │
│  DownloadCard (filename, size, time, button) │
└──────────────────────────────────────────────┘
```

**Special views** (bypass the standard layout):
- `ai-summarizer` → `AiSummarizerView` (two-pane: PDF preview + chat)
- `translate-pdf` → `TranslatePdfView` (two-pane: upload + translation bubble)
- `scan-to-pdf` → `ScanToPdfView` (QR code + live image grid)

---

## 11. Core Feature Modules

### 11.1 Organize PDF

| Tool | Engine | Key Details |
|------|--------|-------------|
| **Merge PDF** | pdf-lib (client) | Drag-and-drop reorder; `processMergeLocal()` |
| **Split PDF** | pdf-lib (client) | Modes: ranges, fixed_range, remove_pages; ZIP output for multi |
| **Remove Pages** | pdf-lib (client) | Visual thumbnail grid → range string → `processSplitLocal()` |
| **Extract Data** | iLoveAPI (`extract`) | Output formats: CSV, JSON, Markdown, plain text |
| **Organize PDF** | pdf-lib (client) | Multi-file merge + split with reorder/rotation |
| **Scan to PDF** | iLoveAPI (`imagepdf`) | Mobile-scan QR pairing flow (see Section 17) |

### 11.2 Optimize PDF

| Tool | Engine | Key Details |
|------|--------|-------------|
| **Compress PDF** | iLoveAPI (`compress`) | Levels: extreme / recommended / low |
| **Repair PDF** | iLoveAPI (`repair`) | No extra params |
| **OCR PDF** | Adobe (`OCRJob`) | 37 locales; `eng` → `EN_US` default |

### 11.3 Convert to PDF

| Tool | Engine | Key Details |
|------|--------|-------------|
| **Word to PDF** | iLoveAPI (`officepdf`) | .doc, .docx |
| **Excel to PDF** | iLoveAPI (`officepdf`) | .xls, .xlsx |
| **PowerPoint to PDF** | iLoveAPI (`officepdf`) | .ppt, .pptx |
| **JPG to PDF** | iLoveAPI (`imagepdf`) | orientation, margin, pagesize, merge_after |
| **HTML to PDF** | iLoveAPI (`htmlpdf`) | URL-only input |

### 11.4 Convert from PDF

| Tool | Engine | Key Details |
|------|--------|-------------|
| **PDF to Word** | Adobe (`ExportPDFJob`) | → DOCX |
| **PDF to Excel** | Adobe (`ExportPDFJob`) | → XLSX |
| **PDF to PowerPoint** | Adobe (`ExportPDFJob`) | → PPTX |
| **PDF to JPG** | iLoveAPI (`pdfjpg`) | Modes: pages / extract |
| **PDF to PDF/A** | iLoveAPI (`pdfa`) | Conformance: pdfa-1b through pdfa-3a |
| **Validate PDF/A** | iLoveAPI (`validatepdfa`) | Returns validation result (not a file) |

### 11.5 Edit PDF

| Tool | Engine | Key Details |
|------|--------|-------------|
| **Rotate PDF** | pdf-lib (server) | Per-page rotation (0/90/180/270) |
| **Watermark PDF** | iLoveAPI (`watermark`) | Text or image mode; `mapWatermarkOptions()` |
| **Add Page Numbers** | iLoveAPI (`pagenumber`) | Template text `{n}` / `{p}`; `mapPageNumberOptions()` |
| **Edit PDF** | pdfjs-dist + pdf-lib (browser) | Dedicated editor at `/edit-pdf-editor` |

### 11.6 PDF Security

| Tool | Engine | Key Details |
|------|--------|-------------|
| **Unlock PDF** | iLoveAPI (`unlock`) | Password on file object, not options |
| **Protect PDF** | iLoveAPI (`protect`) | `password` option |
| **Sign PDF** | iLoveAPI Signature API | Dedicated `/api/tools/sign` route; signer management, audit trails |

### 11.7 PDF Intelligence (AI)

| Tool | Engine | Key Details |
|------|--------|-------------|
| **AI Summarizer** | OpenRouter (SSE) | Client: pdfjs-dist text extraction → Server: streaming summary + multi-turn chat with Mermaid diagram support |
| **Translate PDF** | OpenRouter (SSE) | Client: pdfjs-dist text extraction → Server: streaming translation. 30 target languages. 50K char cap |

**AI Architecture:**
- Text extraction happens **client-side** via `pdfjs-dist` (`extractPdfText()`)
- Server receives plain text, streams responses via SSE (`data: {json}\n\n`)
- Event types: `{ type: "chunk", text }`, `{ type: "done" }`, `{ type: "error", message }`
- Chat mode (summarizer): last 10 turns + document text in system prompt; refuses off-topic
- Rate limit retry: `withRateLimitRetry()` — 1s/2s/4s backoff, max 3 attempts
- Dev fallback: without `OPENROUTER_API_KEY`, echoes input in 4-char chunks

### 11.8 Workflow Automation

Multi-step tool chains using iLoveAPI's connected tasks (`task.connect()`).

- **Storage:** `workflow` + `workflow_step` tables in Supabase PostgreSQL
- **API:** `/api/workflows` (CRUD), `/api/workflows/[id]/run` (increment run count)
- **UI:** `app/(dashboard)/workflows/` pages
- **Session:** `workflowSession.ts` — IndexedDB-backed session for in-flight multi-step runs
- **Client mirror:** `workflowStore.ts` — localStorage read-only mirror (max 100 workflows)
- **Mode entry:** `?workflowId=…&stepIndex=…` query params on tool page

---

## 12. Shared UI Components

### FileUploader

```typescript
interface FileUploaderProps {
  accept: string[]
  multiple?: boolean
  maxFiles?: number
  maxSizeMB?: number
  onFilesSelected: (files: File[]) => void
  isDisabled?: boolean
  files?: File[]
  colorCodeBySourceFile?: boolean    // 20-color palette
  reorderable?: boolean             // dnd-kit drag-and-drop
  layout?: "grid" | "list"
}
```

### ProcessingModal

5-step animated overlay with cancel support:
1. `start` — Connecting to server (Sparkles)
2. `upload` — Uploading your file (Upload)
3. `process` — Processing on server (Cpu)
4. `download` — Preparing download (Download)
5. `done` — Ready! (Check)

Auto-closes 600ms after done. Cancel button triggers `AbortController.abort()`.

### DownloadCard

```typescript
interface DownloadCardProps {
  downloadUrl: string
  filename: string
  processingTime: string
  outputSize: number
  onReset: () => void
}
```

### ToolCard / ToolGrid / ToolHero

- `ToolCard` — Link card with staggered fade-in animation, tool icon + description
- `ToolGrid` — Category tabs (7 categories + "All") + responsive grid of ToolCards
- `ToolHero` — Breadcrumb + large colored icon + title/description

### UsageMeter

Progress bar with warning/danger thresholds for daily/monthly usage display.

---

## 13. API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/tools/[tool]` | POST | Soft (guests allowed) | Unified tool handler. Dispatches to iLoveAPI / Adobe / pdf-lib. `maxDuration: 60`. |
| `/api/tools/sign` | POST | Required | PDF signing via iLoveAPI Signature API. `maxDuration: 30`. |
| `/api/upload` | POST | Soft | Issues Supabase Storage signed upload URLs. `maxDuration: 60`. |
| `/api/ai/summarize` | POST | Soft | AI summarization + chat via SSE. `maxDuration: 60`. |
| `/api/ai/translate` | POST | Soft | AI translation via SSE. `maxDuration: 60`. |
| `/api/usage` | GET | Soft | Returns usage counts (auth from DB, guest from cookie). |
| `/api/activity` | POST | Soft | Records client-side tool completions. |
| `/api/download/[id]` | GET | None | Stream from in-memory fileStore (RFC 5987 filename). |
| `/api/billing/checkout` | POST | Required | Creates Stripe Checkout Session. |
| `/api/billing/verify-session` | POST | Required | Post-checkout verification + grant premium. |
| `/api/scan-session/[sessionId]` | GET/POST/DELETE | None (public) | Scan session: list images, join, save, delete. |
| `/api/scan-session/[sessionId]/destroy` | POST | None | Wipe session (sendBeacon-compatible). |
| `/api/workflows` | GET/POST | Required | List/create workflows. |
| `/api/workflows/[id]` | GET/PATCH/DELETE | Required | Workflow CRUD. |
| `/api/workflows/[id]/run` | POST | Required | Increment run_count + stamp last_run. |
| `/api/webhooks/iloveapi` | POST | None | iLoveAPI event logging (no DB writes). |
| `/api/webhooks/stripe` | POST | Signature | Stripe subscription lifecycle (grant/revoke premium). |

### Unified Tool Handler (`/api/tools/[tool]`)

```typescript
// Key processing branches:
// - html-to-pdf: URL mode, no file upload
// - rotate-pdf: pdf-lib server-side (processRotateLocal)
// - ocr-pdf, pdf-to-word, pdf-to-excel, pdf-to-powerpoint: Adobe SDK
// - validate-pdfa: returns JSON, not a file
// - All others: iLoveAPI runTool()
// - Multi-file tools: server-side JSZip packing

// Response shapes:
// { fileData: base64, filename, processingTime, outputSize }         — standard
// { downloadId, filename, processingTime, outputSize }               — legacy (fileStore)
// { validationSuccess, message, result, processingTime }             — validate-pdfa
```

---

## 14. State Management

### ToolState Discriminated Union

```typescript
type ToolState =
  | { status: "idle" }
  | { status: "files-selected"; files: File[] }
  | {
      status: "processing"
      step: ProcessingStep
      uploadProgress?: number
      uploadBytes?: { loaded: number; total: number }
    }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "validation-success"; message: string; result?: string; processingTime: string }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean; redirectToSignUp?: boolean }
```

### useTool Hook

```typescript
export function useTool(toolSlug: string) {
  // Returns: { state, process, reset, forceSuccess, cancel }
  //
  // process(files, options):
  //   - Local tools (merge/split/remove-pages/organize): client-side pdf-lib
  //   - Server tools: XHR upload to /api/tools/${toolSlug}
  //   - Large files (> 4 MB): direct-upload to Supabase Storage first
  //
  // forceSuccess(file): bypass processing, show file as result
  // cancel(): AbortController.abort() for in-flight uploads
}
```

---

## 15. Subscription & Billing

### Stripe Integration

```typescript
// lib/stripe.ts
export const stripe: Stripe        // apiVersion: "2024-06-20"
export const STRIPE_PREMIUM_PRICE_ID: string
export const STRIPE_WEBHOOK_SECRET: string
```

### Billing Flow

1. User clicks "Upgrade" → `POST /api/billing/checkout` creates Stripe Checkout Session
2. Stripe redirects to `/account/billing?success=true&session_id={id}`
3. Client calls `POST /api/billing/verify-session` → `grantPremiumAccess(userId)`
4. Stripe webhook (`POST /api/webhooks/stripe`) handles lifecycle events:
   - `checkout.session.completed` → `grantPremiumAccess`
   - `customer.subscription.created/updated` (active/trialing/past_due) → `grantPremiumAccess`
   - `customer.subscription.deleted` or inactive → `revokePremiumAccess`

### Pricing

| Plan | Price | Daily Limit | Monthly Limit | Max File Size |
|------|-------|-------------|---------------|---------------|
| Free | $0 | 5 files | 30 files | 20 MB |
| Premium | $20/month | Unlimited | Unlimited | 4 GB (4096 MB) |

**Note:** Adobe-backed tools (pdf-to-word, pdf-to-excel, pdf-to-powerpoint, ocr-pdf) have a hard **100 MB** input cap regardless of plan.

---

## 16. Usage Limits & Guest Access

### Authenticated Users

Usage is tracked in the `usage_counter` table via `pdf_tools_record_usage_event` RPC. Only `"success"` events bump the counter. Date math uses explicit UTC with automatic bucket reset.

```typescript
// lib/usage.ts
export async function canProcessFile(userId, fileSizeBytes, plan?): Promise<{ allowed, reason? }>
export async function recordProcessingEvent(input: ProcessingEventInput): Promise<string>
export async function getUsageStats(userId): Promise<UsageStats>
```

### Guest Users

Guests have no database row. Cookie-backed counters in `pdf_tools_guest_usage` (HTTP-only, 35-day max-age) track daily/monthly usage matching free-plan limits. This is a **soft gate** — clearing cookies resets the counter.

```typescript
// lib/guest-usage.ts
export async function getGuestUsage(): Promise<GuestUsage>
export async function incrementGuestUsage(delta?): Promise<GuestUsage>
export async function checkGuestLimits(delta?): Promise<GuestLimitResult>
```

When a guest exceeds limits, the server returns HTTP 402 with `redirectToSignUp: true`; the client redirects to `/sign-up`.

### Client Pre-Flight Check

`handleProcess` in `ToolPageClient.tsx` fetches `/api/usage` before uploading. If daily limit is met, a dialog is shown (guests get redirected to `/sign-up`). The server re-enforces limits as a safety net.

---

## 17. Mobile Scan-to-PDF

A multi-device scanning workflow using QR-code pairing.

### Flow

1. **Desktop** (`ScanToPdfView`) mints a `sessionId` via `crypto.randomUUID()`, displays a QR code (theme-aware SVG), polls `GET /api/scan-session/<id>` every 2s
2. **Phone** (`MobileScanView`) opens `?session=<id>`, POSTs `{ device }` to join, captures images via camera, uploads each directly to Supabase Storage (`scan-sessions/<id>/<filename>`)
3. **Phone Save** → POSTs `{ saved: true }` sentinel → desktop auto-navigates to `/scan-editor?session=<id>`
4. **Editor** (`ScanEditorClient`) lets user rotate/delete/reorder images, submits to `useTool("jpg-to-pdf")` which goes through `/api/tools/jpg-to-pdf`
5. **Cleanup:** `pagehide` / `beforeunload` sendBeacon calls `POST /api/scan-session/<id>/destroy` to wipe the prefix

### API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scan-session/[id]` | GET | List images, device, saved flag |
| `/api/scan-session/[id]` | POST | `{ device }` join or `{ saved: true }` signal |
| `/api/scan-session/[id]` | DELETE | Single image delete or full destroy |
| `/api/scan-session/[id]/destroy` | POST | sendBeacon-compatible full wipe |

All scan-session routes are intentionally public. Session IDs serve as unguessable tokens. The `SAFE_SESSION` regex validates IDs.

---

## 18. Security & Compliance

| Requirement | Implementation |
|-------------|----------------|
| User authentication | Clerk — JWTs, session management |
| Transport security | HTTPS/TLS on all routes + iLoveAPI SSL |
| API key protection | `ILOVEAPI_SECRET_KEY`, `CLERK_SECRET_KEY` server-only — never in client bundle |
| File size validation | Plan-based limits enforced server-side via `canProcessFile()` |
| Guest rate limiting | Cookie-backed counter + server enforcement |
| File upload security | Signed upload URLs via Supabase Storage; MIME type + size validation |
| CSRF protection | Next.js built-in + SameSite cookies |
| Security headers | Via `vercel.json`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `HSTS: max-age=63072000` |
| iLoveAPI file retention | Files auto-deleted after 1 hour; `task.delete()` called immediately after download |
| Scan session security | Session IDs are random UUIDs; pathname regex validation; `..`-traversal blocked |
| Input validation | Client: `toolValidation.ts`; Server: file type/size/plan checks |
| Webhook verification | Stripe: signature validation via `STRIPE_WEBHOOK_SECRET`; iLoveAPI: logging only (TODO: HMAC) |
| Supabase RLS | Disabled — server uses service role key; app is the only writer |

---

## 19. Performance Requirements

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥ 90 |
| First Contentful Paint | < 1.2s |
| Largest Contentful Paint | < 2.5s |
| Core Web Vitals (INP) | < 200ms |
| iLoveAPI start + upload (< 5 MB) | < 5s |
| iLoveAPI processing (< 10 MB) | < 20s |
| Adobe processing (< 100 MB) | < 600s (10-minute timeout) |
| API route response (job initiated) | < 500ms |

**Optimizations in place:**
- Client-side processing for merge/split/rotate (no server round-trip)
- Direct-to-storage upload for files > 4 MB (bypasses Vercel body cap)
- XHR-based upload for real progress events
- Lazy-loaded Three.js background via `requestIdleCallback`
- Dynamic import of mermaid library (keeps initial bundle small)
- Static generation of all 29 tool pages via `generateStaticParams`
- Minimum step display delays for visual smoothness (500ms start, 300ms upload, etc.)

---

## 20. SEO & Metadata

```typescript
// app/tools/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const tool = getToolBySlug(params.slug)
  return {
    title: `${tool.title} — Free Online Tool | PDFTools`,
    description: tool.seoDescription,
    openGraph: { title: tool.title, description: tool.seoDescription, type: "website" },
  }
}

export async function generateStaticParams() {
  return toolsConfig.map((tool) => ({ slug: tool.slug }))
}
```

- Root title template: `%s | PDFTools`
- Sitemap generated from `toolsConfig` in `app/sitemap.ts`
- `robots: noindex` on `/edit-pdf-editor`, `/scan-editor`, `/mobile-scan`

---

## 21. Environment Variables

```env
# ── Clerk Authentication ──────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...      # Required
CLERK_SECRET_KEY=sk_...                       # Required

# ── iLoveAPI PDF Processing ──────────────────────────────────
ILOVEAPI_PUBLIC_KEY=project_public_...        # Required
ILOVEAPI_SECRET_KEY=secret_...               # Required (server-only)

# ── AI Features (OpenRouter) ─────────────────────────────────
OPENROUTER_API_KEY=sk-or-...                 # Required (dev fallback: echo mode)

# ── Supabase (DB + Storage) ──────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://...         # Required (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...         # Required (public)
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # Optional (bypasses RLS)

# ── Adobe PDF Services ───────────────────────────────────────
PDF_SERVICES_CLIENT_ID=...                   # Optional (for pdf-to-word/excel/ppt, ocr)
PDF_SERVICES_CLIENT_SECRET=...               # Optional

# ── Stripe Payments ──────────────────────────────────────────
STRIPE_SECRET_KEY=sk_...                     # Optional
STRIPE_PREMIUM_PRICE_ID=price_...            # Optional
STRIPE_WEBHOOK_SECRET=whsec_...              # Optional
NEXT_PUBLIC_APP_URL=https://pdftools.app     # Optional (defaults to localhost)
```

---

## 22. Deployment

### Vercel (Primary)

- `vercel.json` carries per-route `maxDuration` overrides and security headers
- `next.config.ts` sets `experimental.proxyClientMaxBodySize: "4gb"`
- Limited by ~4.5 MB request body cap (mitigated by client-upload pattern) and function timeouts (mitigated by Fly.io)

### Fly.io (Docker)

The production instance at `pdf-tools-chi.fly.dev` runs on Fly with a 2 GB RAM budget, bypassing Vercel's body cap and timeout limits.

- `Dockerfile` — multi-stage `node:22.21.1-slim`: install deps → `next build --experimental-build-mode compile` → prune → slim runtime
- `docker-entrypoint.js` — CJS shim: runs `next build --experimental-build-mode generate` at container start, then execs `next start`
- `fly.toml` — `app = "pdf-tools-chi"`, `primary_region = "bom"`, `internal_port = 8080`, `memory = "2gb"`, `auto_stop_machines = "stop"`, `min_machines_running = 0`

### Vercel Config (`vercel.json`)

```json
{
  "functions": {
    "app/api/tools/[tool]/route.ts": { "maxDuration": 120 },
    "app/api/tools/sign/route.ts": { "maxDuration": 30 },
    "app/api/ai/summarize/route.ts": { "maxDuration": 60 },
    "app/api/ai/translate/route.ts": { "maxDuration": 60 }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

## 23. Testing Strategy

### Unit Tests (Vitest — not yet configured)

- JWT token generation and caching
- Error mapping (`mapILoveAPIError`)
- Usage limit calculations (`getLimitsForPlan`, `canProcessFile`)
- Workflow step chaining logic
- File validation (`validateToolOptions`)
- Extract format conversion (`convertExtractFormat`)
- Watermark/page-number option mapping

### Integration Tests

- iLoveAPI 4-step workflow (compress, merge, split)
- Adobe PDF Services (export, OCR)
- Supabase Storage upload/download/delete
- Stripe checkout + webhook flow

### E2E Tests (Playwright — not yet configured)

```
✓ Compress PDF: upload → process → download smaller PDF
✓ Merge PDF: upload 2 files → reorder → merge → download (client-side)
✓ Split PDF: upload → set ranges → split → download ZIP (client-side)
✓ OCR PDF: free user sees locale limit
✓ AI Summarizer: upload PDF → stream summary → follow-up chat
✓ Scan to PDF: desktop QR → mobile capture → editor → download
✓ Edit PDF: upload → navigate to editor → add text → save
✓ Sign PDF: create signature request
✓ Workflow: create → run → verify step chain
✓ Error: damaged PDF shows user-friendly error
✓ Error: wrong password shows retry prompt
✓ Rate limit: free user hitting daily limit sees dialog
✓ Guest limit: exceeded → redirect to /sign-up
✓ Large file: > 4 MB uses direct upload to Supabase Storage
✓ Theme toggle persists across routes
✓ Auth: dashboard routes redirect to sign-in
✓ Billing: Stripe checkout → verify → premium access granted
```

---

## Appendix A — Complete Package Dependencies

### Dependencies (27)

```json
{
  "@adobe/pdfservices-node-sdk": "^4.1.0",
  "@clerk/nextjs": "^7.0.7",
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^10.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "@ilovepdf/ilovepdf-nodejs": "^0.3.1",
  "@supabase/supabase-js": "^2.108.2",
  "@vercel/analytics": "^2.0.1",
  "@vercel/speed-insights": "^2.0.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "framer-motion": "^12.38.0",
  "jsonwebtoken": "^9.0.3",
  "jszip": "^3.10.1",
  "lucide-react": "^1.7.0",
  "mermaid": "^11.15.0",
  "next": "^16.2.3",
  "next-themes": "^0.4.6",
  "openai": "^6.33.0",
  "pdf-lib": "^1.17.1",
  "pdfjs-dist": "^4.10.38",
  "qrcode": "^1.5.4",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "sonner": "^2.0.7",
  "stripe": "^16.12.0",
  "tailwind-merge": "^3.5.0",
  "three": "^0.183.2"
}
```

### Dev Dependencies (12)

```json
{
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-slot": "^1.2.4",
  "@tailwindcss/postcss": "^4",
  "@types/jsonwebtoken": "^9.0.10",
  "@types/node": "^20",
  "@types/qrcode": "^1.5.6",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "@types/three": "^0.183.1",
  "eslint": "^9",
  "eslint-config-next": "16.2.1",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

---

## Appendix B — Tool Registry Quick Reference (29 Tools)

| # | Slug | Title | Category | Engine | Access |
|---|------|-------|----------|--------|--------|
| 1 | `merge-pdf` | Merge PDF | Organize | pdf-lib (client) | Free |
| 2 | `split-pdf` | Split PDF | Organize | pdf-lib (client) | Free |
| 3 | `remove-pages` | Remove Pages | Organize | pdf-lib (client) | Free |
| 4 | `extract-data` | Extract Data | Organize | iLoveAPI | Free |
| 5 | `organize-pdf` | Organize PDF | Organize | pdf-lib (client) | Free |
| 6 | `scan-to-pdf` | Scan to PDF | Organize | iLoveAPI | Free |
| 7 | `compress-pdf` | Compress PDF | Optimize | iLoveAPI | Free |
| 8 | `repair-pdf` | Repair PDF | Optimize | iLoveAPI | Free |
| 9 | `ocr-pdf` | OCR PDF | Optimize | Adobe | Free |
| 10 | `word-to-pdf` | Word to PDF | Convert To | iLoveAPI | Free |
| 11 | `excel-to-pdf` | Excel to PDF | Convert To | iLoveAPI | Free |
| 12 | `powerpoint-to-pdf` | PPT to PDF | Convert To | iLoveAPI | Free |
| 13 | `jpg-to-pdf` | JPG to PDF | Convert To | iLoveAPI | Free |
| 14 | `html-to-pdf` | HTML to PDF | Convert To | iLoveAPI | Free |
| 15 | `pdf-to-word` | PDF to Word | Convert From | Adobe | Free |
| 16 | `pdf-to-jpg` | PDF to JPG | Convert From | iLoveAPI | Free |
| 17 | `pdf-to-excel` | PDF to Excel | Convert From | Adobe | Free |
| 18 | `pdf-to-powerpoint` | PDF to PPT | Convert From | Adobe | Free |
| 19 | `pdf-to-pdfa` | PDF to PDF/A | Convert From | iLoveAPI | Free |
| 20 | `validate-pdfa` | Validate PDF/A | Convert From | iLoveAPI | Free |
| 21 | `rotate-pdf` | Rotate PDF | Edit | pdf-lib (server) | Free |
| 22 | `watermark-pdf` | Watermark PDF | Edit | iLoveAPI | Free |
| 23 | `add-page-numbers` | Page Numbers | Edit | iLoveAPI | Free |
| 24 | `edit-pdf` | Edit PDF | Edit | pdfjs-dist + pdf-lib (browser) | Free |
| 25 | `unlock-pdf` | Unlock PDF | Security | iLoveAPI | Free |
| 26 | `protect-pdf` | Protect PDF | Security | iLoveAPI | Free |
| 27 | `sign-pdf` | Sign PDF | Security | iLoveAPI Signature | Free |
| 28 | `ai-summarizer` | AI Summarizer | AI | OpenRouter (SSE) | Free |
| 29 | `translate-pdf` | Translate PDF | AI | OpenRouter (SSE) | Free |

---

## Appendix C — iLoveAPI Error Reference

| Error Type | User Message | Retryable |
|------------|-------------|-----------|
| `WrongPassword` | This PDF is password-protected. Please provide the correct password. | No |
| `DamagedFile` | This file appears to be corrupted. Try the Repair PDF tool first. | No |
| `OutOfRange` | The page range you specified exceeds the document's page count. | No |
| `TimeOut` | Processing timed out. Please try with a smaller file. | Yes |
| `NonConformant` | This PDF does not meet the required PDF/A standard. | No |
| `ILOVEAPI_OUT_OF_CREDITS` | Processing credits exhausted. Please upgrade your plan. | No |
| *(unknown)* | An unexpected error occurred. Please try again. | Yes |

---

*This PRD (v3.0) supersedes v2.0. Key changes: multi-engine architecture (iLoveAPI + Adobe + pdf-lib + pdfjs-dist), Supabase for database and storage, OpenRouter for AI, Stripe billing, dual deployment (Vercel + Fly.io), mobile scan flow, browser-based PDF editor, guest usage tracking, 29 tools.*

*Last updated: July 7, 2026 — v3.0*
