# Product Requirements Document
# Online PDF Tools Platform — Next.js + Clerk + iLoveAPI

---

**Version:** 2.0  
**Date:** March 30, 2026  
**Status:** Ready for Engineering  
**Changelog from v1.0:** All PDF processing replaced by **iLoveAPI** REST integration. Local libraries (pdf-lib, pdfjs-dist, Tesseract.js) removed entirely. New dedicated sections: iLoveAPI Integration Layer, Tool-to-Slug Mapping, iLoveAPI Auth, Connected Tasks, Webhooks, Credit Management.

---

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Clerk (Auth) · iLoveAPI (PDF Engine) · shadcn/ui · next-themes

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Project Structure](#3-project-structure)
4. [Authentication — Clerk Integration](#4-authentication--clerk-integration)
5. [Theme System — Dark / Light](#5-theme-system--dark--light)
6. [Design System & UI Guidelines](#6-design-system--ui-guidelines)
7. [iLoveAPI Integration Layer](#7-iloveapi-integration-layer)
   - 7.1 [Authentication & JWT](#71-authentication--jwt)
   - 7.2 [Core 4-Step Processing Workflow](#72-core-4-step-processing-workflow)
   - 7.3 [Base API Client](#73-base-api-client)
   - 7.4 [Tool-to-Slug Mapping](#74-tool-to-slug-mapping)
   - 7.5 [Connected Tasks (Chained Tools)](#75-connected-tasks-chained-tools)
   - 7.6 [Webhooks](#76-webhooks)
   - 7.7 [File Encryption](#77-file-encryption)
   - 7.8 [Error Handling & Retry Logic](#78-error-handling--retry-logic)
   - 7.9 [Credit Management](#79-credit-management)
8. [Pages & Routes](#8-pages--routes)
9. [Core Feature Modules](#9-core-feature-modules)
   - 9.1 [Organize PDF](#91-organize-pdf)
   - 9.2 [Optimize PDF](#92-optimize-pdf)
   - 9.3 [Convert to PDF](#93-convert-to-pdf)
   - 9.4 [Convert from PDF](#94-convert-from-pdf)
   - 9.5 [Edit PDF](#95-edit-pdf)
   - 9.6 [PDF Security](#96-pdf-security)
   - 9.7 [PDF Intelligence (AI)](#97-pdf-intelligence-ai)
   - 9.8 [Workflow Automation](#98-workflow-automation)
10. [Shared UI Components](#10-shared-ui-components)
11. [API Routes & Server Actions](#11-api-routes--server-actions)
12. [State Management](#12-state-management)
13. [Subscription & Billing Tiers](#13-subscription--billing-tiers)
14. [Dashboard & User Account](#14-dashboard--user-account)
15. [Security & Compliance](#15-security--compliance)
16. [Performance Requirements](#16-performance-requirements)
17. [SEO & Metadata](#17-seo--metadata)
18. [Environment Variables](#18-environment-variables)
19. [Implementation Phases](#19-implementation-phases)
20. [Testing Strategy](#20-testing-strategy)
21. [Deployment](#21-deployment)

---

## 1. Executive Summary

This document specifies the complete requirements for building a modern, web-based PDF productivity platform using **Next.js 15** (App Router). All PDF and image processing is powered exclusively by the **iLoveAPI REST API** — no local processing libraries are used. The platform provides 28+ PDF tools via iLoveAPI's processing engine, wrapped in a premium UI with Clerk authentication, dark/light theming, and a freemium business model.

### Why iLoveAPI for Processing
- Zero server-side compute overhead — iLoveAPI handles all file processing on its dedicated infrastructure
- 18+ PDF tools and 8+ image tools available via a single unified 4-step workflow
- Built-in file encryption, multi-region support (EU, US, FR, DE, PL), and ISO-grade security
- Signature workflow with full signer management, audit trails, and webhook callbacks
- Node.js SDK available; battle-tested at production scale

---

## 2. Tech Stack & Architecture

### Frontend
| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Next.js (App Router) | 15.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | v4 |
| Component Library | shadcn/ui | Latest |
| Theme Management | next-themes | Latest |
| Icons | Lucide React | Latest |
| Animations | Framer Motion | 11.x |
| Fonts | Geist Sans + Geist Mono | Built-in |

### Authentication
| Layer | Choice |
|-------|--------|
| Auth Provider | Clerk |
| SDK | `@clerk/nextjs` (latest) |
| Middleware | `clerkMiddleware()` |
| Server Auth | `auth()` helper |
| Client Auth | `useUser()`, `useAuth()` hooks |

### PDF Processing Engine
| Layer | Choice |
|-------|--------|
| **Processing** | **iLoveAPI REST API** (api.ilovepdf.com) |
| **Node.js SDK** | `@ilovepdf/ilovepdf-nodejs` |
| Auth Method | JWT — self-signed (server-side) |
| Regions | EU, US, FR, DE, PL (configurable) |
| Webhooks | iLoveAPI task webhooks → `/api/webhooks/iloveapi` |
| Signature | iLoveAPI Signature REST API |

### Backend Infrastructure
| Layer | Choice |
|-------|--------|
| API Routes | Next.js Route Handlers (`app/api/`) |
| Server Actions | Next.js Server Actions |
| Background Jobs | Inngest (webhook processing, async tasks) |
| Rate Limiting | Upstash Redis |
| Database | Neon (Postgres) via Prisma — usage tracking, task history |
| File Proxy | iLoveAPI handles storage; we proxy download through Next.js API |

### Infrastructure
| Layer | Choice |
|-------|--------|
| Deployment | Vercel |
| Analytics | Vercel Analytics + PostHog |
| Error Monitoring | Sentry |
| Payments | Stripe |

---

## 3. Project Structure

```
pdf-tools-platform/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── (marketing)/
│   │   ├── page.tsx                       # Landing / Home
│   │   ├── pricing/page.tsx
│   │   ├── features/page.tsx
│   │   └── about/page.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                     # Auth-protected layout
│   │   ├── dashboard/page.tsx
│   │   ├── history/page.tsx
│   │   ├── workflows/page.tsx
│   │   └── account/[[...account]]/page.tsx
│   │
│   ├── tools/
│   │   ├── layout.tsx
│   │   ├── merge-pdf/page.tsx
│   │   ├── split-pdf/page.tsx
│   │   ├── compress-pdf/page.tsx
│   │   ├── pdf-to-word/page.tsx
│   │   ├── word-to-pdf/page.tsx           # officepdf tool
│   │   ├── pdf-to-jpg/page.tsx
│   │   ├── jpg-to-pdf/page.tsx            # imagepdf tool
│   │   ├── pdf-to-excel/page.tsx
│   │   ├── excel-to-pdf/page.tsx          # officepdf tool
│   │   ├── pdf-to-powerpoint/page.tsx
│   │   ├── powerpoint-to-pdf/page.tsx     # officepdf tool
│   │   ├── html-to-pdf/page.tsx           # htmlpdf tool
│   │   ├── pdf-to-pdfa/page.tsx           # pdfa tool
│   │   ├── validate-pdfa/page.tsx         # validatepdfa tool
│   │   ├── rotate-pdf/page.tsx
│   │   ├── watermark-pdf/page.tsx
│   │   ├── add-page-numbers/page.tsx      # pagenumber tool
│   │   ├── edit-pdf/page.tsx              # editpdf tool
│   │   ├── remove-pages/page.tsx          # split + remove_pages mode
│   │   ├── extract-pages/page.tsx         # extract tool
│   │   ├── organize-pdf/page.tsx
│   │   ├── scan-to-pdf/page.tsx
│   │   ├── repair-pdf/page.tsx
│   │   ├── ocr-pdf/page.tsx               # pdfocr tool
│   │   ├── unlock-pdf/page.tsx
│   │   ├── protect-pdf/page.tsx
│   │   ├── sign-pdf/page.tsx              # iLoveAPI Signature
│   │   ├── ai-summarizer/page.tsx
│   │   └── translate-pdf/page.tsx
│   │
│   ├── api/
│   │   ├── tools/
│   │   │   └── [tool]/route.ts            # Unified tool handler → iLoveAPI
│   │   ├── tools/sign/route.ts            # Signature-specific handler
│   │   ├── tools/download/[taskId]/route.ts
│   │   ├── tools/status/[taskId]/route.ts
│   │   ├── webhooks/
│   │   │   ├── clerk/route.ts
│   │   │   └── iloveapi/route.ts          # iLoveAPI task + signature webhooks
│   │   └── usage/route.ts
│   │
│   ├── layout.tsx                         # Root: ClerkProvider + ThemeProvider
│   ├── globals.css
│   └── not-found.tsx
│
├── components/
│   ├── ui/                                # shadcn/ui primitives
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── Sidebar.tsx
│   │   └── MobileMenu.tsx
│   ├── tools/
│   │   ├── FileUploader.tsx
│   │   ├── ToolCard.tsx
│   │   ├── ToolGrid.tsx
│   │   ├── ProcessingModal.tsx
│   │   ├── DownloadCard.tsx
│   │   └── ToolHero.tsx
│   ├── theme/
│   │   └── ThemeToggle.tsx
│   └── shared/
│       ├── PricingCard.tsx
│       ├── UsageMeter.tsx
│       └── UpgradePrompt.tsx
│
├── lib/
│   ├── iloveapi/
│   │   ├── client.ts                      # iLoveAPI base client + JWT auth
│   │   ├── tools.ts                       # Typed wrappers for every tool
│   │   ├── signature.ts                   # Signature workflow helpers
│   │   ├── types.ts                       # All iLoveAPI request/response types
│   │   └── errors.ts                      # iLoveAPI error mapping
│   ├── tools-config.ts                    # Master tool registry
│   ├── auth.ts                            # Clerk helpers
│   ├── usage.ts                           # Credit & usage tracking
│   └── utils.ts
│
├── middleware.ts                          # Clerk middleware
├── next.config.ts
├── tailwind.config.ts
├── .env.local
└── package.json
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
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
```

### 4.2 Root Layout

```tsx
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

### 4.3 Middleware — Route Protection

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/history(.*)',
  '/workflows(.*)',
  '/account(.*)',
])

const isPremiumToolRoute = createRouteMatcher([
  '/tools/edit-pdf(.*)',
  '/tools/ocr-pdf(.*)',
  '/tools/sign-pdf(.*)',
  '/tools/ai-summarizer(.*)',
  '/tools/translate-pdf(.*)',
  '/tools/validate-pdfa(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
  if (isPremiumToolRoute(req)) {
    const { userId, sessionClaims } = await auth()
    if (!userId) return auth.redirectToSignIn()
    const isPremium = (sessionClaims?.metadata as any)?.plan === 'premium'
    if (!isPremium) {
      const url = req.nextUrl.clone()
      url.pathname = '/pricing'
      url.searchParams.set('from', req.nextUrl.pathname)
      return Response.redirect(url)
    }
  }
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
```

### 4.4 Sign-In & Sign-Up Pages

```tsx
// app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br
      from-background via-muted/30 to-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to access your PDF tools</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              card: 'shadow-2xl border border-border bg-card rounded-2xl',
              formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
            },
          }}
        />
      </div>
    </main>
  )
}
```

### 4.5 UserButton & Auth State in Navbar

```tsx
import { UserButton, SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'

<SignedIn>
  <UserButton afterSignOutUrl="/"
    appearance={{ elements: { avatarBox: 'w-9 h-9 ring-2 ring-primary/20' } }}
  />
</SignedIn>
<SignedOut>
  <SignInButton mode="modal">
    <Button variant="outline" size="sm">Sign in</Button>
  </SignInButton>
  <Button size="sm" asChild>
    <Link href="/sign-up">Get Started Free</Link>
  </Button>
</SignedOut>
```

### 4.6 Server-Side Auth in API Routes

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ... call iLoveAPI
}
```

### 4.7 Clerk Webhook — Sync Users to DB

```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!
  const headerPayload = await headers()
  const body = await req.text()
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent
  try {
    evt = wh.verify(body, {
      'svix-id': headerPayload.get('svix-id')!,
      'svix-timestamp': headerPayload.get('svix-timestamp')!,
      'svix-signature': headerPayload.get('svix-signature')!,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (evt.type === 'user.created') await createUserInDatabase(evt.data)
  if (evt.type === 'user.updated') await updateUserInDatabase(evt.data)
  if (evt.type === 'user.deleted') await deleteUserFromDatabase(evt.data.id!)

  return new Response('OK', { status: 200 })
}
```

### 4.8 Premium Access via Clerk Metadata

```typescript
// lib/auth.ts
import { clerkClient } from '@clerk/nextjs/server'

export async function grantPremiumAccess(userId: string) {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan: 'premium', planUpdatedAt: new Date().toISOString() },
  })
}

export async function revokePremiumAccess(userId: string) {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan: 'free' },
  })
}
```

---

## 5. Theme System — Dark / Light

### 5.1 ThemeProvider

```bash
npm install next-themes
```

```tsx
// components/theme/ThemeProvider.tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### 5.2 ThemeToggle

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Sun className="h-4 w-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0 transition-all" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100 transition-all" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="mr-2 h-4 w-4" />Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="mr-2 h-4 w-4" />Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="mr-2 h-4 w-4" />System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 5.3 CSS Design Tokens

```css
/* app/globals.css */
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 224 71.4% 4.1%;
    --card: 0 0% 100%;
    --card-foreground: 224 71.4% 4.1%;
    --primary: 262.1 83.3% 57.8%;     /* Vibrant violet */
    --primary-foreground: 210 20% 98%;
    --secondary: 220 14.3% 95.9%;
    --secondary-foreground: 220.9 39.3% 11%;
    --muted: 220 14.3% 95.9%;
    --muted-foreground: 220 8.9% 46.1%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 262.1 83.3% 57.8%;
    --radius: 0.75rem;
  }
  .dark {
    --background: 224 71.4% 4.1%;
    --foreground: 210 20% 98%;
    --card: 224 71.4% 6%;
    --card-foreground: 210 20% 98%;
    --primary: 263.4 70% 65%;
    --primary-foreground: 210 20% 98%;
    --secondary: 215 27.9% 16.9%;
    --secondary-foreground: 210 20% 98%;
    --muted: 215 27.9% 16.9%;
    --muted-foreground: 217.9 10.6% 64.9%;
    --border: 215 27.9% 16.9%;
    --input: 215 27.9% 16.9%;
    --ring: 263.4 70% 65%;
  }
}
```

---

## 6. Design System & UI Guidelines

### 6.1 Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / Hero | Geist Sans | 800 | 4xl–7xl |
| Headings | Geist Sans | 700 | 2xl–3xl |
| Body | Geist Sans | 400 | base |
| Labels | Geist Sans | 500 | sm |
| Code | Geist Mono | 400 | sm |

### 6.2 Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Primary | Violet `hsl(262,83%,58%)` | `hsl(263,70%,65%)` | CTAs, active states |
| Brand Gradient | Violet → Cyan | Violet → Cyan | Hero, icons |
| Background | White | `#050A14` | Page background |
| Card | White | `#0C1221` | Cards, modals |
| Muted | `#F4F5F7` | `#1A2236` | Subtle sections |

### 6.3 Animation Principles

- Page transitions: Framer Motion `AnimatePresence` fade+slide
- Tool cards: staggered entrance (50ms delay per card)
- File upload drag-over: border pulse + zone scale(1.01)
- Processing: three-stage animated stepper (Uploading → Processing → Ready)
- Success: green checkmark draw + confetti burst + download reveal

### 6.4 Responsive Breakpoints

| Breakpoint | Width | Tool Grid |
|------------|-------|-----------|
| Mobile | < 640px | 1 column |
| Tablet | 640–1024px | 2 columns |
| Desktop | > 1024px | 3–4 columns |
| Wide | > 1280px | 4–5 columns |

---

## 7. iLoveAPI Integration Layer

> **All PDF processing in this platform is exclusively handled by the iLoveAPI REST API.**  
> Base URL: `https://api.ilovepdf.com/v1`  
> Auth: JWT Bearer token (self-signed on server side)

### 7.1 Authentication & JWT

iLoveAPI uses JWT Bearer tokens. All API calls must include `Authorization: Bearer {signed_token}`. Tokens expire after **2 hours** and must be refreshed.

#### Self-Signed Token (Recommended — Server Side)

```typescript
// lib/iloveapi/client.ts
import jwt from 'jsonwebtoken'

const ILOVEAPI_PUBLIC_KEY = process.env.ILOVEAPI_PUBLIC_KEY!
const ILOVEAPI_SECRET_KEY = process.env.ILOVEAPI_SECRET_KEY!

function generateToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      iss: ILOVEAPI_PUBLIC_KEY,
      iat: now,
      nbf: now,
      exp: now + 7200,  // 2 hours in UTC
    },
    ILOVEAPI_SECRET_KEY
  )
}
```

#### Request Token from Auth Server (Alternative)

```typescript
async function requestToken(): Promise<string> {
  const res = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: ILOVEAPI_PUBLIC_KEY }),
  })
  const data = await res.json()
  return data.token
}
```

#### Token Cache (avoid regenerating on every request)

```typescript
// lib/iloveapi/client.ts
let cachedToken: { token: string; expiresAt: number } | null = null

export function getToken(): string {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.token  // reuse if > 1 min remaining
  }
  const token = generateToken()
  cachedToken = { token, expiresAt: now + 7200 * 1000 }
  return token
}

export function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
}
```

---

### 7.2 Core 4-Step Processing Workflow

Every PDF/image tool follows this exact sequence:

```
┌──────────────────────────────────────────────────────────┐
│  Step 1 — START                                          │
│  POST https://api.ilovepdf.com/v1/start/{tool}/{region}  │
│  ← { server, task, remaining_credits }                   │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│  Step 2 — UPLOAD                                         │
│  POST https://{server}/v1/upload                         │
│  Body: form-data { task, file }                          │
│  ← { server_filename }                                   │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│  Step 3 — PROCESS                                        │
│  POST https://{server}/v1/process                        │
│  Body: { task, tool, files[], ...tool_options }          │
│  ← { status: "TaskSuccess", download_filename, timer }   │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│  Step 4 — DOWNLOAD                                       │
│  GET https://{server}/v1/download/{task}                 │
│  ← ArrayBuffer (single file or ZIP)                      │
└──────────────────────────────────────────────────────────┘
```

#### Base Processing Function

```typescript
// lib/iloveapi/client.ts
import FormData from 'form-data'

export interface StartResponse {
  server: string
  task: string
  remaining_credits: number
}

export interface ProcessResponse {
  download_filename: string
  filesize: number
  output_filesize: number
  output_filenumber: number
  output_extensions: string[]
  timer: string
  status: 'TaskSuccess' | 'TaskSuccessWithWarnings' | 'TaskError'
}

const REGION = process.env.ILOVEAPI_REGION ?? 'eu'

// Step 1: Start a task
export async function startTask(tool: string): Promise<StartResponse> {
  const res = await fetch(`https://api.ilovepdf.com/v1/start/${tool}/${REGION}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}

// Step 2: Upload a file (from a Buffer or File)
export async function uploadFile(
  server: string,
  task: string,
  fileBuffer: Buffer,
  filename: string
): Promise<{ server_filename: string }> {
  const form = new FormData()
  form.append('task', task)
  form.append('file', fileBuffer, { filename })

  const res = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, ...form.getHeaders() },
    body: form,
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}

// Step 2b: Upload from cloud URL
export async function uploadFromUrl(
  server: string,
  task: string,
  cloudUrl: string
): Promise<{ server_filename: string }> {
  const res = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: JSON.stringify({ task, cloud_file: cloudUrl }),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}

// Step 3: Process files
export async function processTask(
  server: string,
  task: string,
  tool: string,
  files: Array<{ server_filename: string; filename: string; rotate?: number; password?: string }>,
  options: Record<string, unknown> = {},
  webhookUrl?: string
): Promise<ProcessResponse> {
  const body = {
    task,
    tool,
    files,
    ...options,
    ...(webhookUrl ? { webhook: webhookUrl } : {}),
  }
  const res = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}

// Step 4: Download output
export async function downloadOutput(server: string, task: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new ILoveAPIError({ type: 'DownloadError', message: 'Download failed' })
  return res.arrayBuffer()
}

// Delete task immediately after download
export async function deleteTask(server: string, task: string): Promise<void> {
  await fetch(`https://${server}/v1/task/${task}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}
```

#### High-Level Tool Runner

```typescript
// lib/iloveapi/tools.ts
import { startTask, uploadFile, processTask, downloadOutput, deleteTask } from './client'

export interface ToolRunInput {
  tool: string
  files: Array<{ buffer: Buffer; filename: string; password?: string; rotate?: 0 | 90 | 180 | 270 }>
  options?: Record<string, unknown>
  outputFilename?: string
  useWebhook?: boolean
}

export interface ToolRunResult {
  buffer: ArrayBuffer
  downloadFilename: string
  outputFilesize: number
  timer: string
  taskId: string
  server: string
}

export async function runTool(input: ToolRunInput): Promise<ToolRunResult> {
  // Step 1: Start
  const { server, task, remaining_credits } = await startTask(input.tool)

  if (remaining_credits <= 0) {
    throw new Error('ILOVEAPI_OUT_OF_CREDITS')
  }

  // Step 2: Upload all files
  const uploadedFiles = await Promise.all(
    input.files.map(async (f) => {
      const { server_filename } = await uploadFile(server, task, f.buffer, f.filename)
      return {
        server_filename,
        filename: f.filename,
        ...(f.rotate !== undefined ? { rotate: f.rotate } : {}),
        ...(f.password ? { password: f.password } : {}),
      }
    })
  )

  // Step 3: Process
  const processResult = await processTask(server, task, input.tool, uploadedFiles, {
    ...(input.options ?? {}),
    ...(input.outputFilename ? { output_filename: input.outputFilename } : {}),
  })

  if (processResult.status === 'TaskError') {
    throw new Error('ILOVEAPI_TASK_ERROR')
  }

  // Step 4: Download
  const buffer = await downloadOutput(server, task)

  // Cleanup
  await deleteTask(server, task)

  return {
    buffer,
    downloadFilename: processResult.download_filename,
    outputFilesize: processResult.output_filesize,
    timer: processResult.timer,
    taskId: task,
    server,
  }
}
```

---

### 7.3 Base API Client

```typescript
// lib/iloveapi/errors.ts
export class ILoveAPIError extends Error {
  type: string
  code?: number
  param?: string

  constructor(data: { type?: string; message?: string; code?: number; param?: string }) {
    super(data.message ?? 'iLoveAPI Error')
    this.type = data.type ?? 'UnknownError'
    this.code = data.code
    this.param = data.param
  }
}

// lib/iloveapi/types.ts
export type ILoveAPITool =
  | 'compress' | 'extract' | 'htmlpdf' | 'imagepdf' | 'merge'
  | 'officepdf' | 'pagenumber' | 'pdfa' | 'pdfjpg' | 'pdfocr'
  | 'protect' | 'repair' | 'rotate' | 'split' | 'unlock'
  | 'validatepdfa' | 'watermark' | 'editpdf' | 'sign'

export type ILoveAPIRegion = 'eu' | 'us' | 'fr' | 'de' | 'pl'

export type TaskStatus =
  | 'TaskWaiting' | 'TaskProcessing' | 'TaskSuccess'
  | 'TaskSuccessWithWarnings' | 'TaskError' | 'TaskDeleted' | 'TaskNotFound'

export type FileStatus =
  | 'FileSuccess' | 'FileWaiting' | 'WrongPassword' | 'TimeOut'
  | 'ServerFileNotFound' | 'DamagedFile' | 'NoImages' | 'OutOfRange'
  | 'NonConformant' | 'UnknownError'
```

---

### 7.4 Tool-to-Slug Mapping

The following table maps every platform tool to its iLoveAPI tool slug and key parameters:

| Platform Tool | iLoveAPI Slug | Key Parameters |
|---------------|--------------|----------------|
| Merge PDF | `merge` | — (no extra params; file order = merge order) |
| Split PDF | `split` | `split_mode`: `ranges`/`fixed_range`/`remove_pages`/`filesize`; `ranges`; `fixed_range`; `remove_pages`; `merge_after` |
| Remove Pages | `split` | `split_mode: "remove_pages"`, `remove_pages: "1,4,8-12"` |
| Extract Pages | `extract` | `detailed: false` (set `ranges` in split or use extract for text) |
| Compress PDF | `compress` | `compression_level`: `extreme`/`recommended`/`low` |
| Repair PDF | `repair` | — |
| OCR PDF | `pdfocr` | `ocr_languages: ["eng", "fra", ...]` (80+ languages supported) |
| JPG / Image to PDF | `imagepdf` | `orientation`, `margin`, `pagesize`, `merge_after` |
| Word/Excel/PPT to PDF | `officepdf` | — |
| HTML to PDF | `htmlpdf` | — |
| PDF to JPG | `pdfjpg` | `pdfjpg_mode`: `pages`/`extract` |
| PDF to Word/Excel/PPT | `officepdf` (inverse) | *(via iLoveAPI conversion)* |
| PDF to PDF/A | `pdfa` | `conformance`: `pdfa-1b`/`pdfa-2b`/`pdfa-3b` etc.; `allow_downgrade` |
| Validate PDF/A | `validatepdfa` | `conformance`, `allow_downgrade` |
| Rotate PDF | `rotate` | Set `rotate` per file object (0/90/180/270) |
| Watermark PDF | `watermark` | `mode` (text/image), `text`, `image` (server_filename), `pages`, `vertical_position`, `horizontal_position`, `rotation`, `font_*`, `transparency`, `layer`, `mosaic` |
| Add Page Numbers | `pagenumber` | `facing_pages`, `first_cover`, `pages`, `starting_number`, `vertical_position`, `horizontal_position`, `font_family`, `font_size`, `font_color`, `text` |
| Edit PDF | `editpdf` | `elements[]` (type: text/image/svg, coordinates, dimensions, rotation, opacity, font_*, etc.) |
| Unlock PDF | `unlock` | — (pass file password in file object) |
| Protect PDF | `protect` | `password` |
| Sign PDF | `sign` *(Signature API)* | Full signature workflow — see Section 9.6 |

> **Note on PDF to Word/Excel/PPT:** iLoveAPI's `officepdf` converts Office → PDF. For PDF → Office, use the `pdfjpg` + `imagepdf` chain, or check iLoveAPI's latest tool additions. If not available, proxy through a supplementary conversion service for those specific output formats.

---

### 7.5 Connected Tasks (Chained Tools)

iLoveAPI supports **connected tasks** — running a second tool on the output of a previous task without re-uploading files. This powers the Workflow Automation feature.

```typescript
// lib/iloveapi/client.ts
export async function connectTask(
  server: string,
  parentTask: string,
  nextTool: string
): Promise<{ task: string; files: Array<{ server_filename: string; filename: string }> }> {
  const res = await fetch(`https://${server}/v1/task/next`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ task: parentTask, tool: nextTool }),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}
```

**Workflow Example (Compress → Watermark → Protect):**

```typescript
// lib/iloveapi/tools.ts
export async function runWorkflow(
  steps: Array<{ tool: string; options: Record<string, unknown> }>,
  initialFiles: Array<{ buffer: Buffer; filename: string }>
): Promise<ToolRunResult> {
  // Step 1: Start first tool + upload files
  const { server, task } = await startTask(steps[0].tool)
  const uploadedFiles = await Promise.all(
    initialFiles.map(async (f) => {
      const { server_filename } = await uploadFile(server, task, f.buffer, f.filename)
      return { server_filename, filename: f.filename }
    })
  )

  // Process first step
  await processTask(server, task, steps[0].tool, uploadedFiles, steps[0].options)

  // Chain remaining steps using connected tasks
  let currentTask = task
  for (let i = 1; i < steps.length; i++) {
    const { task: nextTask, files } = await connectTask(server, currentTask, steps[i].tool)
    await processTask(server, nextTask, steps[i].tool, files, steps[i].options)
    currentTask = nextTask
  }

  // Download final output
  const buffer = await downloadOutput(server, currentTask)
  await deleteTask(server, currentTask)

  return { buffer, downloadFilename: 'workflow_output.pdf', outputFilesize: buffer.byteLength, timer: '0', taskId: currentTask, server }
}
```

---

### 7.6 Webhooks

iLoveAPI supports async processing via webhooks. Register your endpoint in the iLoveAPI dashboard.

**Register webhook URL:** `https://pdftools.app/api/webhooks/iloveapi`

**Supported events:**
- `task.completed` — PDF/image task finished successfully
- `task.failed` — task failed
- `signature.created`, `signature.signer.completed`, `signature.completed`, `signature.declined`, `signature.expired`, `signature.void`

```typescript
// app/api/webhooks/iloveapi/route.ts
import { inngest } from '@/lib/inngest'

export async function POST(req: Request) {
  const body = await req.json()
  const { event, data } = body

  switch (event) {
    case 'task.completed':
      // Update task record in DB to "completed"
      await db.task.update({
        where: { iloveapiTaskId: data.task.task },
        data: { status: 'completed', downloadFilename: data.task.download_filename },
      })
      break

    case 'task.failed':
      await db.task.update({
        where: { iloveapiTaskId: data.task.task },
        data: { status: 'failed' },
      })
      break

    case 'signature.completed':
      await db.signatureRequest.update({
        where: { uuid: data.signature.uuid },
        data: { status: 'completed', completedOn: new Date(data.signature.completed_on) },
      })
      break

    case 'signature.declined':
      await db.signatureRequest.update({
        where: { uuid: data.signature.uuid },
        data: { status: 'declined', notes: data.signature.notes },
      })
      break
  }

  return new Response('OK', { status: 200 })
}
```

**Using webhooks for async processing (large files):**

```typescript
// In processTask, pass webhook URL for long-running jobs
const result = await processTask(server, task, tool, files, options,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/iloveapi`
)
// Result status will be "TaskProcessing" — actual completion comes via webhook
```

---

### 7.7 File Encryption

iLoveAPI supports an additional encryption layer on top of SSL for files stored on their servers.

```typescript
// Add file_encryption_key to JWT payload for encrypted tasks
function generateEncryptedToken(encryptionKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      iss: ILOVEAPI_PUBLIC_KEY,
      iat: now,
      nbf: now,
      exp: now + 7200,
      file_encryption_key: encryptionKey,  // 16, 24, or 32 chars
    },
    ILOVEAPI_SECRET_KEY
  )
}

// Or pass as process parameter
const options = {
  file_encryption_key: process.env.ILOVEAPI_FILE_ENCRYPTION_KEY,
  // ... other options
}
```

**Key requirements:**
- Must be exactly 16, 24, or 32 characters
- Same key must be used for the entire task
- Files are encrypted at rest on iLoveAPI servers; decrypted only during processing

---

### 7.8 Error Handling & Retry Logic

```typescript
// lib/iloveapi/errors.ts

export function mapILoveAPIError(error: ILoveAPIError): { userMessage: string; retryable: boolean } {
  const map: Record<string, { userMessage: string; retryable: boolean }> = {
    WrongPassword: {
      userMessage: 'This PDF is password-protected. Please provide the correct password.',
      retryable: false,
    },
    DamagedFile: {
      userMessage: 'This file appears to be corrupted. Try the Repair PDF tool first.',
      retryable: false,
    },
    OutOfRange: {
      userMessage: 'The page range you specified exceeds the document\'s page count.',
      retryable: false,
    },
    TimeOut: {
      userMessage: 'Processing timed out. Please try with a smaller file.',
      retryable: true,
    },
    NonConformant: {
      userMessage: 'This PDF does not meet the required PDF/A standard.',
      retryable: false,
    },
    ILOVEAPI_OUT_OF_CREDITS: {
      userMessage: 'Processing credits exhausted. Please upgrade your plan.',
      retryable: false,
    },
  }
  return map[error.type] ?? { userMessage: 'An unexpected error occurred. Please try again.', retryable: true }
}

// Retry wrapper for transient errors
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      const mapped = mapILoveAPIError(err as ILoveAPIError)
      if (!mapped.retryable) throw err
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error('Max retries exceeded')
}
```

---

### 7.9 Credit Management

iLoveAPI operates on a credit system. Credits are consumed per file processed.

```typescript
// lib/iloveapi/client.ts

// Check remaining credits before processing (from start response)
export async function getRemainingCredits(): Promise<number> {
  // Credits returned in /start response — cache and track
  const { remaining_credits } = await startTask('merge')  // dummy start to check
  return remaining_credits
}

// lib/usage.ts — Track iLoveAPI credit usage in DB
export async function recordCreditUsage(
  userId: string,
  tool: string,
  filesProcessed: number,
  creditsUsed: number
) {
  await db.creditUsage.create({
    data: { userId, tool, filesProcessed, creditsUsed, timestamp: new Date() },
  })
}
```

**Credit alert webhook:** Configure in iLoveAPI dashboard to notify when credits fall below threshold.

---

## 8. Pages & Routes

### 8.1 Landing Page (`/`)

**Sections:**
1. Hero — Headline, subheadline, animated CTA, floating PDF illustration
2. Tool Grid — All 28 tools with category filter tabs (All / Organize / Optimize / Convert / Edit / Security / AI)
3. Feature Highlights — "100% Free", "Powered by iLoveAPI", "Secure & Private"
4. How It Works — Upload → Process via iLoveAPI → Download
5. AI Features Spotlight
6. Pricing Preview
7. Footer

### 8.2 Tool Pages (`/tools/[tool-slug]`)

Standard layout for every tool:

```
┌───────────────────────────────────────────┐
│  Breadcrumb: Home > Tools > Merge PDF     │
│                                           │
│  ToolHero (icon + title + badges)         │
│                                           │
│  FileUploader (drag-and-drop)             │
│                                           │
│  ToolOptions (iLoveAPI-specific options)  │
│                                           │
│  [Process Button] → calls /api/tools/...  │
│                                           │
│  ProcessingModal (4-step progress)        │
│  Step 1: Uploading to iLoveAPI            │
│  Step 2: Processing on iLoveAPI servers   │
│  Step 3: Preparing download               │
│  Step 4: ✓ Ready                          │
│                                           │
│  DownloadCard                             │
│  Related Tools                            │
└───────────────────────────────────────────┘
```

**ProcessingModal steps for iLoveAPI:**

```typescript
type ILoveAPIStep =
  | { id: 'start';    label: 'Connecting to processing server...' }
  | { id: 'upload';   label: 'Uploading your file securely...' }
  | { id: 'process';  label: 'Processing with iLoveAPI...' }
  | { id: 'download'; label: 'Preparing your download...' }
  | { id: 'done';     label: 'Done!' }
```

### 8.3 Dashboard, Pricing, Account

Same as v1.0 — see Section 7 of original PRD.

---

## 9. Core Feature Modules

All tools call the unified API route `/api/tools/[tool]` on the Next.js side, which internally runs the iLoveAPI 4-step workflow server-side. **No PDF processing ever happens client-side.**

---

### 9.1 Organize PDF

#### Merge PDF
- **iLoveAPI tool:** `merge`
- **Access:** Free
- **File upload:** Multiple PDFs; order = merge order (drag-and-drop reorder in UI)
- **iLoveAPI params:** None extra — file order in the `files[]` array determines merge order
- **Free limits:** 5 files / 20 MB total per task

```typescript
// lib/iloveapi/tools.ts
export async function mergePDFs(files: Array<{ buffer: Buffer; filename: string }>) {
  return runTool({ tool: 'merge', files, options: {} })
}
```

#### Split PDF
- **iLoveAPI tool:** `split`
- **Access:** Free
- **Modes:**

```typescript
export type SplitMode = 'ranges' | 'fixed_range' | 'remove_pages' | 'filesize'

export interface SplitOptions {
  split_mode: SplitMode
  ranges?: string         // e.g. "1,5,10-14"
  fixed_range?: number    // e.g. 3 (every 3 pages)
  remove_pages?: string   // e.g. "1,4,8-12"
  merge_after?: boolean
}
```

- **Output:** ZIP of individual PDFs when multiple ranges produce multiple files

#### Remove Pages
- **iLoveAPI tool:** `split` with `split_mode: "remove_pages"`
- **Options:** `remove_pages: "1,4,8-12"` (comma/range format)
- **UI:** Visual thumbnail grid; click pages to tag for removal → converts to range string

#### Extract Pages / Text
- **iLoveAPI tool:** `extract`
- **Options:** `detailed: boolean` — when true, returns position data (PageNo, XPos, YPos, Width, FontName, FontSize, Length, Text)
- **Access:** Free (basic) / Premium (detailed extraction)

#### Organize PDF
- **iLoveAPI tool:** `merge` (re-upload in new order) + `split` for page-level reorder
- **UI:** Full drag-and-drop page thumbnail grid — changes tracked client-side, then submitted as reorder operation
- **Implementation:** Extract pages individually via `split`, reorder in memory, then `merge`

#### Scan to PDF
- **iLoveAPI tool:** `imagepdf`
- **Flow:** Mobile camera → captures image(s) → sent to browser → uploaded as images → `imagepdf` converts to PDF
- **Options:** `orientation`, `margin`, `pagesize: "A4"`, `merge_after: true`

---

### 9.2 Optimize PDF

#### Compress PDF
- **iLoveAPI tool:** `compress`
- **Options:**

```typescript
export interface CompressOptions {
  compression_level: 'extreme' | 'recommended' | 'low'
}
```

- **UI:** Three radio buttons with estimated size reduction preview
- **Note:** Actual size reduction shown post-processing from `output_filesize` in response

#### Repair PDF
- **iLoveAPI tool:** `repair`
- **Options:** None — `try_pdf_repair: true` is the default in process params
- **Access:** Free

#### OCR PDF
- **iLoveAPI tool:** `pdfocr`
- **Access:** Free (English only) / Premium (80+ languages)
- **Options:**

```typescript
export interface OCROptions {
  ocr_languages: string[]  // e.g. ["eng"], ["eng","fra","deu"]
}
```

**Supported language codes (selection):** `eng`, `fra`, `deu`, `spa`, `ita`, `por`, `chi_sim`, `chi_tra`, `jpn`, `kor`, `ara`, `hin`, `rus`, `tur`, `pol`, `nld`, `swe`, `dan`, `nor`, `fin` + 60 more

**Free tier:** `["eng"]` only  
**Premium tier:** Any combination from the full 80+ language list

---

### 9.3 Convert to PDF

All conversions to PDF use `officepdf` (for Office files) or `imagepdf` (for images) or `htmlpdf` (for URLs).

```typescript
// Office documents → PDF
export async function officeToPDF(file: { buffer: Buffer; filename: string }) {
  return runTool({ tool: 'officepdf', files: [file], options: {} })
}

// JPG/PNG/WebP/GIF → PDF
export async function imageToPDF(
  files: Array<{ buffer: Buffer; filename: string }>,
  options: {
    orientation?: 'portrait' | 'landscape'
    margin?: number         // pixels
    pagesize?: 'fit' | 'A4' | 'letter'
    merge_after?: boolean   // true = one PDF; false = one PDF per image
  }
) {
  return runTool({ tool: 'imagepdf', files, options })
}

// HTML URL → PDF
export async function htmlToPDF(url: string) {
  // HTML tool accepts a URL as cloud_file
  // Start task → upload URL as cloud_file → process
  const { server, task } = await startTask('htmlpdf')
  const { server_filename } = await uploadFromUrl(server, task, url)
  const result = await processTask(server, task, 'htmlpdf', [
    { server_filename, filename: 'webpage.pdf' }
  ])
  const buffer = await downloadOutput(server, task)
  await deleteTask(server, task)
  return { buffer, ...result }
}
```

| Platform Tool | iLoveAPI Tool | Notes |
|---------------|--------------|-------|
| Word → PDF | `officepdf` | Accepts .doc, .docx |
| Excel → PDF | `officepdf` | Accepts .xls, .xlsx |
| PowerPoint → PDF | `officepdf` | Accepts .ppt, .pptx |
| JPG/Image → PDF | `imagepdf` | orientation, margin, pagesize, merge_after |
| HTML → PDF | `htmlpdf` | URL as cloud_file input |

---

### 9.4 Convert from PDF

```typescript
// PDF → JPG (all pages or extract embedded images)
export async function pdfToJPG(
  file: { buffer: Buffer; filename: string },
  mode: 'pages' | 'extract' = 'pages'
) {
  return runTool({ tool: 'pdfjpg', files: [file], options: { pdfjpg_mode: mode } })
}

// PDF → PDF/A (archival format)
export async function pdfToPDFA(
  file: { buffer: Buffer; filename: string },
  conformance: 'pdfa-1b' | 'pdfa-1a' | 'pdfa-2b' | 'pdfa-2u' | 'pdfa-2a' | 'pdfa-3b' | 'pdfa-3u' | 'pdfa-3a' = 'pdfa-2b',
  allowDowngrade = true
) {
  return runTool({ tool: 'pdfa', files: [file], options: { conformance, allow_downgrade: allowDowngrade } })
}

// Validate PDF/A compliance
export async function validatePDFA(
  file: { buffer: Buffer; filename: string },
  conformance = 'pdfa-2b'
) {
  return runTool({ tool: 'validatepdfa', files: [file], options: { conformance } })
}
```

| Platform Tool | iLoveAPI Tool | Key Options |
|---------------|--------------|-------------|
| PDF → JPG | `pdfjpg` | `pdfjpg_mode: "pages"` or `"extract"` |
| PDF → Word | `officepdf` (reverse) | *(check iLoveAPI latest tools)* |
| PDF → PDF/A | `pdfa` | `conformance`, `allow_downgrade` |
| Validate PDF/A | `validatepdfa` | `conformance`, `allow_downgrade` |

---

### 9.5 Edit PDF

#### Rotate PDF
- **iLoveAPI tool:** `rotate`
- **Implementation:** Set `rotate` property per file in the `files[]` array (0/90/180/270)
- **Note:** No extra process parameters needed — rotation is a file-level property

```typescript
export async function rotatePDF(
  file: { buffer: Buffer; filename: string },
  rotation: 0 | 90 | 180 | 270
) {
  return runTool({
    tool: 'rotate',
    files: [{ ...file, rotate: rotation }],
    options: {}
  })
}
```

#### Add Watermark
- **iLoveAPI tool:** `watermark`
- **Options:**

```typescript
export interface WatermarkOptions {
  mode: 'text' | 'image'
  text?: string
  image?: string              // server_filename of uploaded image (for mode: "image")
  pages?: string              // "all", "1,3,5-9", "3-end"
  vertical_position?: 'top' | 'middle' | 'bottom'
  horizontal_position?: 'left' | 'center' | 'right'
  vertical_position_adjustment?: number
  horizontal_position_adjustment?: number
  mosaic?: boolean            // stamps 9 times per page
  rotation?: number           // 0–360
  font_family?: 'Arial' | 'Arial Unicode MS' | 'Verdana' | 'Courier' | 'Times New Roman' | 'Comic Sans MS' | 'WenQuanYi Zen Hei' | 'Lohit Marathi'
  font_style?: null | 'Bold' | 'Italic'
  font_size?: number
  font_color?: string         // hex e.g. "#FF0000"
  transparency?: number       // 1–100
  layer?: 'above' | 'below'
}
```

**Note for image watermark:** The image must be uploaded separately as an additional file in the same task (Step 2 Upload), and its `server_filename` passed as `image` parameter.

#### Add Page Numbers
- **iLoveAPI tool:** `pagenumber`
- **Options:**

```typescript
export interface PageNumberOptions {
  facing_pages?: boolean
  first_cover?: boolean
  pages?: string              // "all", "3-end", "1,3,4-9"
  starting_number?: number
  vertical_position?: 'top' | 'bottom'
  horizontal_position?: 'left' | 'center' | 'right'
  vertical_position_adjustment?: number
  horizontal_position_adjustment?: number
  font_family?: string
  font_size?: number
  font_color?: string         // hex
  text?: string               // use {n} for page number, {p} for total. e.g. "Page {n} of {p}"
}
```

#### Edit PDF (Full Editor)
- **iLoveAPI tool:** `editpdf`
- **Access:** Premium
- **Options:**

```typescript
export interface EditPDFElement {
  type: 'text' | 'image' | 'svg'
  pages: string               // "1", "3-12", "1,3,5"
  zindex?: number
  dimensions?: { w: number; h: number }
  coordinates: { x: number; y: number }
  rotation?: number
  opacity?: number            // 1–100

  // For type: "text"
  text?: string
  text_align?: 'left' | 'center' | 'right'
  font_family?: string
  font_size?: number
  font_style?: 'Regular' | 'Bold' | 'Italic' | 'Bold italic'
  font_color?: string
  letter_spacing?: number
  underline_text?: boolean

  // For type: "image" or "svg"
  server_filename?: string    // Must be uploaded in Step 2
}

export interface EditPDFOptions {
  elements: EditPDFElement[]
}
```

**UI Behavior:**
- Canvas-based editor renders PDF page as image (via `pdfjpg` preview call)
- User drags/drops text boxes, images, annotations
- On submit, UI translates canvas positions to iLoveAPI coordinates and calls `editpdf`

---

### 9.6 PDF Security

#### Unlock PDF
- **iLoveAPI tool:** `unlock`
- **No extra parameters** — provide the file password in the `files[]` `password` field
- **Note:** Requires user to know the current password (ethical constraint)

```typescript
export async function unlockPDF(file: { buffer: Buffer; filename: string }, password: string) {
  return runTool({
    tool: 'unlock',
    files: [{ ...file, password }],
    options: {}
  })
}
```

#### Protect PDF
- **iLoveAPI tool:** `protect`
- **Options:** `password: string`

```typescript
export async function protectPDF(file: { buffer: Buffer; filename: string }, password: string) {
  return runTool({ tool: 'protect', files: [file], options: { password } })
}
```

#### Sign PDF — iLoveAPI Signature API
- **iLoveAPI workflow:** Separate from PDF tools — uses Signature REST API

**Sign PDF flow:**

```typescript
// lib/iloveapi/signature.ts

export interface SignerDefinition {
  name: string
  email: string
  phone?: string              // enables SMS validation
  type: 'signer' | 'validator' | 'viewer'
  language?: string           // e.g. "en-US", "es", "fr"
  force_signature_type?: 'all' | 'text' | 'sign' | 'image'
  access_code?: string
  files: Array<{
    server_filename: string
    elements: Array<{
      type: 'signature' | 'initials' | 'name' | 'date' | 'text' | 'input'
      position: string        // "top middle" or "0 -300"
      pages: string
      size?: number
      content?: string        // required for date/text types
      horizontal_position_adjustment?: number
      vertical_position_adjustment?: number
    }>
  }>
}

export interface CreateSignatureOptions {
  task: string
  files: Array<{ server_filename: string; filename: string; brand_name?: string; brand_logo?: string }>
  signers: SignerDefinition[]
  lock_order?: boolean
  expiration_days?: number    // 1–130, default 120
  message_signer?: string
  subject_signer?: string
  uuid_visible?: boolean
  signer_reminders?: boolean
  signer_reminder_days_cycle?: number
  verify_enabled?: boolean
}

export async function createSignatureRequest(options: CreateSignatureOptions) {
  const token = getToken()
  const { server } = await startTask('sign')

  const res = await fetch(`https://${server}/v1/signature`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()  // Returns token_requester, uuid, signers[], status
}

// Get signature status
export async function getSignatureStatus(tokenRequester: string) {
  const res = await fetch(
    `https://api.ilovepdf.com/v1/signature/requesterview/${tokenRequester}`,
    { headers: authHeaders() }
  )
  return res.json()
}

// Download signed file
export async function downloadSignedFile(server: string, tokenRequester: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://${server}/v1/signature/${tokenRequester}/download-signed`,
    { headers: { Authorization: `Bearer ${getToken()}` } }
  )
  return res.arrayBuffer()
}

// Download audit trail PDF
export async function downloadAuditTrail(server: string, tokenRequester: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://${server}/v1/signature/${tokenRequester}/download-audit`,
    { headers: { Authorization: `Bearer ${getToken()}` } }
  )
  return res.arrayBuffer()
}

// Void a signature request
export async function voidSignatureRequest(tokenRequester: string) {
  const res = await fetch(
    `https://api.ilovepdf.com/v1/signature/void/${tokenRequester}`,
    { method: 'PUT', headers: authHeaders() }
  )
  return res.json()
}

// Send reminder emails
export async function sendSignatureReminder(tokenRequester: string) {
  const res = await fetch(
    `https://api.ilovepdf.com/v1/signature/sendReminder/${tokenRequester}`,
    { method: 'POST', headers: authHeaders() }
  )
  return res.json()
}
```

**Self-Sign Flow (free users):**
1. Upload PDF → iLoveAPI `/start/sign` + `/upload`
2. Create signature request with signer = current user's email
3. Set `lock_order: false`, `expiration_days: 1`
4. User receives email link to sign
5. On completion webhook → download signed PDF and serve to user

**Request Signature Flow (premium users):**
1. Upload PDF → iLoveAPI
2. User defines signer fields visually on PDF preview
3. Enter signer email addresses (up to 50 signers, max 5 files)
4. Create signature request → system sends emails
5. Track status via `getSignatureStatus` polling or webhook
6. On completion → `downloadSignedFile` + `downloadAuditTrail`

#### Unlock / Protect (see above in 9.5)

---

### 9.7 PDF Intelligence (AI)

AI features use **OpenAI GPT-4o / Claude** for summarization and translation. iLoveAPI's `extract` tool is used as the **first step** to extract text from the PDF before passing to the AI API.

#### AI Summarizer
**Pipeline:** PDF upload → iLoveAPI `extract` (get text) → OpenAI/Claude (summarize) → stream to UI

```typescript
// app/api/ai/summarize/route.ts
import { auth } from '@clerk/nextjs/server'
import { runTool } from '@/lib/iloveapi/tools'
import OpenAI from 'openai'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const length = formData.get('length') as 'brief' | 'standard' | 'detailed'

  // Step 1: Extract text via iLoveAPI
  const buffer = Buffer.from(await file.arrayBuffer())
  const extractResult = await runTool({
    tool: 'extract',
    files: [{ buffer, filename: file.name }],
    options: { detailed: false },
  })

  // extractResult.buffer is a text file with the extracted content
  const extractedText = Buffer.from(extractResult.buffer).toString('utf-8')

  // Step 2: Summarize with AI (streaming)
  const openai = new OpenAI()
  const lengthPrompts = {
    brief: 'Provide 3-5 bullet points of key points only.',
    standard: 'Provide a 2-3 paragraph summary.',
    detailed: 'Provide a structured summary with: Overview, Key Points, Conclusions.',
  }

  const stream = openai.beta.chat.completions.stream({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `You are an expert summarizer. ${lengthPrompts[length]}` },
      { role: 'user', content: `Summarize:\n\n${extractedText.slice(0, 50000)}` },
    ],
    stream: true,
  })

  return new Response(stream.toReadableStream(), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
```

#### Translate PDF
**Pipeline:** PDF → iLoveAPI `extract` (text + positions) → AI translation → iLoveAPI `editpdf` (rebuild)

```typescript
// Simplified translate pipeline
export async function translatePDF(
  file: { buffer: Buffer; filename: string },
  targetLanguage: string
): Promise<ArrayBuffer> {
  // 1. Extract text with positions
  const extractResult = await runTool({
    tool: 'extract',
    files: [file],
    options: { detailed: true },  // returns position data
  })

  // 2. Parse position data
  const textElements = parseDetailedExtract(Buffer.from(extractResult.buffer).toString())

  // 3. Translate text segments via AI
  const translatedElements = await translateTextSegments(textElements, targetLanguage)

  // 4. Rebuild PDF with editpdf using translated text at original positions
  const editElements = translatedElements.map((el) => ({
    type: 'text' as const,
    pages: String(el.pageNo),
    coordinates: { x: el.xPos, y: el.yPos },
    text: el.translatedText,
    font_size: el.fontSize,
  }))

  const result = await runTool({
    tool: 'editpdf',
    files: [file],
    options: { elements: editElements },
  })

  return result.buffer
}
```

---

### 9.8 Workflow Automation

Uses iLoveAPI's **connected tasks** feature (`/task/next`) to chain tools without re-uploading.

**Access:** Free (1 workflow) / Premium (unlimited)

```typescript
// lib/iloveapi/tools.ts — full workflow runner
export interface WorkflowStep {
  tool: ILoveAPITool
  options: Record<string, unknown>
  label: string
}

export async function runWorkflow(
  initialFiles: Array<{ buffer: Buffer; filename: string }>,
  steps: WorkflowStep[],
  onStepComplete?: (step: number, total: number) => void
): Promise<{ buffer: ArrayBuffer; downloadFilename: string }> {
  if (steps.length === 0) throw new Error('No steps defined')

  // Start first task
  const { server, task: firstTask } = await startTask(steps[0].tool)

  // Upload files
  const uploadedFiles = await Promise.all(
    initialFiles.map(async (f) => {
      const { server_filename } = await uploadFile(server, firstTask, f.buffer, f.filename)
      return { server_filename, filename: f.filename }
    })
  )

  // Process step 0
  await processTask(server, firstTask, steps[0].tool, uploadedFiles, steps[0].options)
  onStepComplete?.(1, steps.length)

  // Chain remaining steps via connected tasks
  let currentTask = firstTask
  for (let i = 1; i < steps.length; i++) {
    const { task: nextTask, files } = await connectTask(server, currentTask, steps[i].tool)
    await processTask(server, nextTask, steps[i].tool, files, steps[i].options)
    onStepComplete?.(i + 1, steps.length)
    currentTask = nextTask
  }

  // Download final result
  const buffer = await downloadOutput(server, currentTask)
  await deleteTask(server, currentTask)

  return { buffer, downloadFilename: 'workflow_output.pdf' }
}
```

---

## 10. Shared UI Components

### 10.1 FileUploader

```typescript
interface FileUploaderProps {
  accept: string[]
  multiple?: boolean
  maxFiles?: number
  maxSizeBytes?: number
  onFilesSelected: (files: File[]) => void
  isUploading?: boolean
  uploadProgress?: number
}
```

Features: drag-and-drop, file validation, progress bar, file list with names/sizes.

### 10.2 ProcessingModal — iLoveAPI Steps

```tsx
const ILOVEAPI_STEPS = [
  { id: 'start',    label: 'Connecting to processing server...',  icon: Server },
  { id: 'upload',   label: 'Uploading your file securely...',     icon: Upload },
  { id: 'process',  label: 'Processing on iLoveAPI servers...',   icon: Zap },
  { id: 'download', label: 'Preparing your download...',          icon: Download },
  { id: 'done',     label: 'Ready!',                              icon: Check },
]
```

### 10.3 DownloadCard

Shows: filename, output file size, processing time (from `timer` field in iLoveAPI response), download button, "Process another file" button.

### 10.4 UsageMeter

Displays: daily file usage, iLoveAPI credit balance (from `/api/usage`), remaining AI uses.

### 10.5 UpgradePrompt

Shown when free user hits limits or accesses premium features:
```tsx
<UpgradePrompt feature="OCR in 80+ languages" plan="Premium" />
```

---

## 11. API Routes & Server Actions

### 11.1 Unified Tool Handler

```typescript
// app/api/tools/[tool]/route.ts
import { auth } from '@clerk/nextjs/server'
import { runTool } from '@/lib/iloveapi/tools'
import { mapILoveAPIError, ILoveAPIError } from '@/lib/iloveapi/errors'
import { canProcessFile, recordCreditUsage } from '@/lib/usage'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { tool: string } }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const files: Array<{ buffer: Buffer; filename: string }> = []

  for (const [, value] of formData.entries()) {
    if (value instanceof File) {
      const { allowed, reason } = await canProcessFile(value.size)
      if (!allowed) return NextResponse.json({ error: reason }, { status: 403 })
      files.push({ buffer: Buffer.from(await value.arrayBuffer()), filename: value.name })
    }
  }

  // Parse tool-specific options from formData
  const optionsRaw = formData.get('options')
  const options = optionsRaw ? JSON.parse(optionsRaw as string) : {}

  try {
    const result = await runTool({ tool: params.tool, files, options })

    // Record usage
    await recordCreditUsage(userId, params.tool, files.length, files.length)

    // Stream file back to client
    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${result.downloadFilename}"`,
        'X-Processing-Time': result.timer,
        'X-Output-Size': String(result.outputFilesize),
      },
    })
  } catch (err) {
    if (err instanceof ILoveAPIError) {
      const { userMessage } = mapILoveAPIError(err)
      return NextResponse.json({ error: userMessage, type: err.type }, { status: 400 })
    }
    if ((err as Error).message === 'ILOVEAPI_OUT_OF_CREDITS') {
      return NextResponse.json({ error: 'Processing credits exhausted', upgradeRequired: true }, { status: 402 })
    }
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

### 11.2 Signature Route

```typescript
// app/api/tools/sign/route.ts
import { auth, currentUser } from '@clerk/nextjs/server'
import { startTask, uploadFile } from '@/lib/iloveapi/client'
import { createSignatureRequest } from '@/lib/iloveapi/signature'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const body = await req.json()
  const { fileBuffer, filename, signers, options } = body

  // Start sign task + upload
  const { server, task } = await startTask('sign')
  const { server_filename } = await uploadFile(server, task, Buffer.from(fileBuffer), filename)

  // Create signature request
  const signatureData = await createSignatureRequest({
    task,
    files: [{ server_filename, filename }],
    signers: signers.map((s: any) => ({ ...s })),
    ...options,
    uuid_visible: true,
    verify_enabled: true,
  })

  // Save to DB
  await db.signatureRequest.create({
    data: {
      userId,
      tokenRequester: signatureData.token_requester,
      uuid: signatureData.uuid,
      status: signatureData.status,
      filename,
      server,
    },
  })

  return NextResponse.json({ tokenRequester: signatureData.token_requester, uuid: signatureData.uuid })
}
```

### 11.3 Task Status Polling

```typescript
// app/api/tools/status/[taskId]/route.ts
export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await db.task.findFirst({
    where: { iloveapiTaskId: params.taskId, userId },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ status: task.status, downloadUrl: task.downloadUrl })
}
```

### 11.4 iLoveAPI Webhook Handler

```typescript
// app/api/webhooks/iloveapi/route.ts
// (See Section 7.6 for full implementation)
```

### 11.5 Usage API

```typescript
// app/api/usage/route.ts
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const [dailyCount, monthlyCount, user] = await Promise.all([
    db.creditUsage.count({ where: { userId, timestamp: { gte: today } } }),
    db.creditUsage.count({ where: { userId, timestamp: { gte: monthStart } } }),
    db.user.findUnique({ where: { clerkId: userId } }),
  ])

  const plan = user?.plan ?? 'free'
  const limits = { free: { daily: 5, monthly: 30 }, premium: { daily: 999, monthly: 9999 }, business: { daily: 9999, monthly: 99999 } }

  return NextResponse.json({ filesProcessedToday: dailyCount, filesProcessedThisMonth: monthlyCount, plan, limits: limits[plan as keyof typeof limits] })
}
```

---

## 12. State Management

### Tool Page State Machine

```typescript
type ToolState =
  | { status: 'idle' }
  | { status: 'files-selected'; files: File[] }
  | { status: 'iloveapi-start' }
  | { status: 'iloveapi-upload'; progress: number }
  | { status: 'iloveapi-process' }
  | { status: 'iloveapi-download' }
  | { status: 'success'; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: 'error'; message: string; retryable: boolean; upgradeRequired?: boolean }
```

### Client-Side Tool Submission

```typescript
// hooks/useTool.ts
'use client'
export function useTool(toolSlug: string) {
  const [state, setState] = useState<ToolState>({ status: 'idle' })

  const process = useCallback(async (files: File[], options: Record<string, unknown>) => {
    setState({ status: 'iloveapi-start' })

    const form = new FormData()
    for (const file of files) form.append('file', file)
    form.append('options', JSON.stringify(options))

    setState({ status: 'iloveapi-upload', progress: 0 })

    // Use XMLHttpRequest for upload progress tracking
    const response = await uploadWithProgress(`/api/tools/${toolSlug}`, form, (progress) => {
      setState({ status: 'iloveapi-upload', progress })
    })

    setState({ status: 'iloveapi-process' })

    if (!response.ok) {
      const err = await response.json()
      setState({ status: 'error', message: err.error, retryable: true, upgradeRequired: err.upgradeRequired })
      return
    }

    setState({ status: 'iloveapi-download' })

    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const processingTime = response.headers.get('X-Processing-Time') ?? '0'
    const outputSize = Number(response.headers.get('X-Output-Size') ?? 0)

    setState({
      status: 'success',
      downloadUrl,
      filename: getFilenameFromResponse(response),
      processingTime,
      outputSize,
    })
  }, [toolSlug])

  return { state, process, reset: () => setState({ status: 'idle' }) }
}
```

---

## 13. Subscription & Billing Tiers

### Tier Comparison

| Feature | Free | Premium | Business |
|---------|------|---------|----------|
| All core PDF tools | ✅ | ✅ | ✅ |
| iLoveAPI credits/month | 30 files | 500 files | Unlimited |
| Max file size | 20 MB | 200 MB | 500 MB |
| Batch processing | ❌ | ✅ | ✅ |
| Custom workflows (chained tools) | 1 | Unlimited | Unlimited |
| Cloud import (Drive/Dropbox) | ❌ | ✅ | ✅ |
| OCR languages | English only | 80+ | 80+ |
| Edit PDF | ❌ | ✅ | ✅ |
| Sign PDF (request from others) | ❌ | ✅ (5/mo) | ✅ (Unlimited) |
| SMS signer validation | ❌ | ✅ | ✅ |
| Signature audit trail download | ❌ | ✅ | ✅ |
| PDF/A conformance levels | pdfa-2b only | All levels | All levels |
| AI Summarizer | 3 uses/mo | ✅ | ✅ |
| Translate PDF | ❌ | ✅ | ✅ |
| File encryption (iLoveAPI) | ❌ | ✅ | ✅ |
| Data processing region choice | EU only | EU/US/FR/DE/PL | EU/US/FR/DE/PL |
| Team members | 1 | 1 | Up to 50 |
| Priority support | ❌ | ✅ | ✅ |
| API access (your own iLoveAPI key) | ❌ | ❌ | ✅ |

### Pricing (Monthly, USD)

| Plan | Monthly | Annual (20% off) |
|------|---------|-----------------|
| Free | $0 | $0 |
| Premium | $9/mo | $7.20/mo ($86.40/yr) |
| Business | $29/mo | $23.20/mo ($278.40/yr) |

---

## 14. Dashboard & User Account

### Dashboard Widgets
1. **Stats Row:** Files processed today/month, iLoveAPI credits remaining, plan status
2. **Credit Meter:** Visual bar showing iLoveAPI credits used vs plan limit
3. **Recent Activity:** Last 10 processed files with tool, timestamp, re-download link (within retention window)
4. **Quick Tools:** Top 6 most-used tools by user
5. **Saved Workflows:** With tool chain preview, run count
6. **Active Signatures:** Status badges for pending signature requests
7. **Upgrade CTA:** For free users

### History Page (`/history`)

| Column | Source |
|--------|--------|
| File name | Original filename |
| Tool | iLoveAPI tool slug (mapped to display name) |
| Date | Timestamp from DB |
| Processing time | `timer` from iLoveAPI process response |
| Output size | `output_filesize` from iLoveAPI |
| Status | From iLoveAPI task status or webhook update |
| Download | Available for 24h (free) / 7 days (premium) |

### Signature Management (`/dashboard/signatures`)

- List all signature requests with status (draft/sent/completed/declined/expired/void)
- Status polling via iLoveAPI `GET /signature/requesterview/{token}`
- Actions: Send reminder, void request, download signed file, download audit trail
- Fix signer email / fix signer phone if delivery failed

---

## 15. Security & Compliance

| Requirement | Implementation |
|-------------|----------------|
| User authentication | Clerk — JWTs, session management, MFA |
| Transport security | HTTPS/TLS on all Next.js routes + iLoveAPI SSL |
| iLoveAPI communication | Server-side only — public key never exposed to client |
| File transmission to iLoveAPI | SSL encrypted; optional `file_encryption_key` for at-rest encryption |
| iLoveAPI file retention | Files auto-deleted after 1 hour on iLoveAPI servers; we call `DELETE /task` immediately after download |
| iLoveAPI region compliance | EU region default; premium users can select region for data residency |
| API key protection | `ILOVEAPI_SECRET_KEY` in server-only env vars — never in client bundle |
| iLoveAPI IP/domain filtering | Configure in iLoveAPI dashboard to whitelist Vercel deployment IP |
| Rate limiting | Upstash Redis on Next.js API routes (before hitting iLoveAPI) |
| File validation | MIME type + magic byte check before sending to iLoveAPI |
| CSRF protection | Next.js built-in + SameSite cookies |
| GDPR compliance | Clerk user deletion cascade; iLoveAPI 1-hour retention; cookie consent |
| Signature compliance | iLoveAPI Signature API — Digital Signatures, audit trail, QR code verification, eIDAS/ESIGN compliant |
| Webhook verification | Validate iLoveAPI webhooks using registered endpoint + payload inspection |
| Content Security Policy | Strict CSP headers; whitelist `api.ilovepdf.com` for fetch |

---

## 16. Performance Requirements

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥ 90 |
| First Contentful Paint | < 1.2s |
| Largest Contentful Paint | < 2.5s |
| iLoveAPI start + upload (< 5MB file) | < 5s |
| iLoveAPI processing (< 10MB file) | < 20s |
| iLoveAPI processing (< 50MB file) | < 60s |
| API route response (job initiated) | < 500ms |
| Core Web Vitals (INP) | < 200ms |

**Optimization Notes:**
- Use iLoveAPI `webhook` parameter for large files (> 10MB) — don't hold HTTP connection open
- Use chunked upload for files > 5MB via iLoveAPI chunk upload feature
- iLoveAPI's `remaining_credits` from `/start` should be cached per session to avoid repeated calls
- Use Server Components + ISR for tool pages (revalidate: 3600)

---

## 17. SEO & Metadata

```typescript
// app/tools/[slug]/page.tsx
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const tool = toolsConfig.find((t) => t.slug === params.slug)
  if (!tool) return {}
  return {
    title: `${tool.title} — Free Online Tool | PDFTools`,
    description: tool.seoDescription,
    openGraph: { title: tool.title, description: tool.seoDescription, type: 'website' },
    alternates: { canonical: `https://pdftools.app/tools/${params.slug}` },
  }
}
```

---

## 18. Environment Variables

```env
# ── Clerk Authentication ──────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# ── iLoveAPI PDF Processing Engine ───────────────────────────
ILOVEAPI_PUBLIC_KEY=project_public_...      # From iLoveAPI dashboard
ILOVEAPI_SECRET_KEY=secret_...             # From iLoveAPI dashboard — NEVER expose to client
ILOVEAPI_REGION=eu                         # eu | us | fr | de | pl
ILOVEAPI_FILE_ENCRYPTION_KEY=              # Optional: 16/24/32 char string for at-rest encryption
# Note: Do NOT prefix iLoveAPI keys with NEXT_PUBLIC_ — server-side only

# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://...
DATABASE_URL_UNPOOLED=postgresql://...

# ── AI Features ───────────────────────────────────────────────
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

# ── Background Jobs ───────────────────────────────────────────
INNGEST_SIGNING_KEY=...
INNGEST_EVENT_KEY=...

# ── Rate Limiting ─────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ── Payments ──────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...

# ── App ───────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://pdftools.app
```

---

## 19. Implementation Phases

### Phase 1 — Foundation (Weeks 1–3)
- [ ] Initialize Next.js 15 + TypeScript + Tailwind v4
- [ ] Integrate Clerk (sign-in, sign-up, middleware, UserButton, webhooks)
- [ ] Implement dark/light theme with next-themes
- [ ] Build `lib/iloveapi/client.ts` — JWT auth, start, upload, process, download, delete
- [ ] Build `lib/iloveapi/tools.ts` — `runTool` orchestrator
- [ ] Build `lib/iloveapi/errors.ts` — error mapping
- [ ] Write iLoveAPI integration tests with real API calls
- [ ] Design system: tokens, shadcn/ui setup, Navbar, Footer, ThemeToggle
- [ ] Landing page (Hero, ToolGrid, How It Works)

### Phase 2 — Core Free Tools (Weeks 4–6)
- [ ] `FileUploader` component (drag-and-drop, validation, progress)
- [ ] `ProcessingModal` with 4-step iLoveAPI flow visualization
- [ ] `DownloadCard` with processing time + file size from iLoveAPI response
- [ ] Tool page template with `useTool` hook
- [ ] **Merge** (`merge`), **Split** (`split`), **Compress** (`compress`)
- [ ] **Office → PDF** (`officepdf`): Word, Excel, PowerPoint
- [ ] **Image → PDF** (`imagepdf`), **PDF → JPG** (`pdfjpg`)
- [ ] **Rotate** (`rotate`), **Watermark** (`watermark`), **Page Numbers** (`pagenumber`)
- [ ] **Protect** (`protect`), **Unlock** (`unlock`), **Repair** (`repair`)
- [ ] **HTML to PDF** (`htmlpdf`), **PDF to PDF/A** (`pdfa`)

### Phase 3 — Auth-Gated & Premium Tools (Weeks 7–9)
- [ ] Usage tracking DB schema + `canProcessFile` + `recordCreditUsage`
- [ ] `UsageMeter` + `UpgradePrompt` components
- [ ] **OCR PDF** (`pdfocr`) — free (eng) / premium (80+ languages)
- [ ] **Edit PDF** (`editpdf`) — canvas UI + iLoveAPI elements mapping
- [ ] **Extract** (`extract`) — text extraction + detailed mode
- [ ] **Validate PDF/A** (`validatepdfa`)
- [ ] iLoveAPI Webhook handler (`/api/webhooks/iloveapi`)
- [ ] Dashboard page (stats, history, quick tools)

### Phase 4 — Signatures & Workflows (Weeks 10–12)
- [ ] `lib/iloveapi/signature.ts` — full signature API wrapper
- [ ] **Sign PDF** — self-sign + request-from-others UI
- [ ] Signature status dashboard + polling
- [ ] Download signed file + audit trail
- [ ] Void, remind, fix email/phone flows
- [ ] Workflow Builder UI (step chaining via connected tasks)
- [ ] `runWorkflow` implementation
- [ ] History page with iLoveAPI metadata (timer, output size)

### Phase 5 — AI Features (Weeks 13–14)
- [ ] AI Summarizer: `extract` → OpenAI/Claude streaming
- [ ] Translate PDF: `extract` (detailed) → AI → `editpdf`
- [ ] AI usage tracking and limits
- [ ] Pricing page + Stripe integration
- [ ] Plan gating via Clerk metadata after payment

### Phase 6 — Polish & Launch (Weeks 15–16)
- [ ] SEO: metadata, sitemap, structured data
- [ ] Performance: Core Web Vitals audit, chunked upload for large files
- [ ] Accessibility: WCAG 2.1 AA
- [ ] E2E tests (Playwright) covering iLoveAPI happy path
- [ ] Error monitoring (Sentry) with iLoveAPI error context
- [ ] Vercel + custom domain + iLoveAPI production project setup
- [ ] iLoveAPI dashboard: domain/IP filtering, webhook endpoint registration

---

## 20. Testing Strategy

### iLoveAPI Integration Tests

```typescript
// tests/integration/iloveapi.test.ts
import { describe, it, expect } from 'vitest'
import { runTool } from '@/lib/iloveapi/tools'
import { readFileSync } from 'fs'

describe('iLoveAPI Integration', () => {
  it('compresses a PDF', async () => {
    const buffer = readFileSync('tests/fixtures/sample.pdf')
    const result = await runTool({
      tool: 'compress',
      files: [{ buffer, filename: 'sample.pdf' }],
      options: { compression_level: 'recommended' },
    })
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    expect(result.outputFilesize).toBeLessThan(buffer.byteLength)
  })

  it('merges two PDFs', async () => {
    const buf1 = readFileSync('tests/fixtures/doc1.pdf')
    const buf2 = readFileSync('tests/fixtures/doc2.pdf')
    const result = await runTool({
      tool: 'merge',
      files: [
        { buffer: buf1, filename: 'doc1.pdf' },
        { buffer: buf2, filename: 'doc2.pdf' },
      ],
    })
    expect(result.buffer.byteLength).toBeGreaterThan(0)
  })

  it('handles wrong password error', async () => {
    const buf = readFileSync('tests/fixtures/protected.pdf')
    await expect(
      runTool({ tool: 'unlock', files: [{ buffer: buf, filename: 'protected.pdf', password: 'wrongpass' }] })
    ).rejects.toThrow()
  })
})
```

### Unit Tests (Vitest)
- JWT token generation and caching
- Error mapping (`mapILoveAPIError`)
- Usage limit calculations
- Workflow step chaining logic
- File validation before upload

### E2E Tests (Playwright)
```
✓ Compress PDF: upload file → process → download smaller PDF
✓ Merge PDF: upload 2 files → reorder → merge → download
✓ OCR PDF: free user sees language limit; premium sees full list
✓ Sign PDF: create request → status shows "sent" → webhook updates to "completed"
✓ Workflow: Compress → Watermark → download final output
✓ Error: damaged PDF shows "Repair PDF" suggestion
✓ Error: wrong password shows inline error with retry
✓ Rate limit: free user hitting daily limit sees upgrade prompt
✓ Theme toggle persists across routes
✓ Auth: protected routes redirect to sign-in
```

---

## 21. Deployment

### Vercel Configuration

```json
// vercel.json
{
  "functions": {
    "app/api/tools/[tool]/route.ts": {
      "maxDuration": 120
    },
    "app/api/tools/sign/route.ts": {
      "maxDuration": 30
    },
    "app/api/ai/summarize/route.ts": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; connect-src 'self' https://api.ilovepdf.com https://*.ilovepdf.com https://clerk.*.com; img-src 'self' data: blob:"
        }
      ]
    }
  ]
}
```

### iLoveAPI Dashboard — Production Setup

1. Create/select production project at [iloveapi.com/user/projects](https://www.iloveapi.com/user/projects)
2. Copy **Public Key** → `ILOVEAPI_PUBLIC_KEY`
3. Copy **Secret Key** → `ILOVEAPI_SECRET_KEY` (server-only, never expose)
4. **IP/Domain filtering:** Add Vercel production domain + IPs to allowlist
5. **Webhook endpoints:** Register `https://pdftools.app/api/webhooks/iloveapi`
6. **Subscribe to events:** `task.completed`, `task.failed`, `signature.*`
7. **Credit monitoring:** Set low-credit alert threshold in dashboard
8. **Region selection:** Default to `eu`; premium users can override

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test:unit          # Vitest unit tests (no API calls)
      - run: npm run build
    env:
      # Only public keys needed for build
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}

  integration-test:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:integration   # iLoveAPI integration tests
    env:
      ILOVEAPI_PUBLIC_KEY: ${{ secrets.ILOVEAPI_PUBLIC_KEY }}
      ILOVEAPI_SECRET_KEY: ${{ secrets.ILOVEAPI_SECRET_KEY }}
      ILOVEAPI_REGION: eu

  deploy:
    needs: [test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## Appendix A — Complete Package Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.0.0",

    "@clerk/nextjs": "^6.0.0",
    "next-themes": "^0.4.0",
    "tailwindcss": "^4.0.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.400.0",

    "jsonwebtoken": "^9.0.0",
    "form-data": "^4.0.0",

    "react-hook-form": "^7.0.0",
    "zod": "^3.0.0",
    "@hookform/resolvers": "^3.0.0",

    "openai": "^4.0.0",

    "@prisma/client": "^5.0.0",
    "inngest": "^3.0.0",
    "@upstash/ratelimit": "^2.0.0",
    "@upstash/redis": "^1.0.0",
    "stripe": "^16.0.0",
    "svix": "^1.0.0",

    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "sonner": "^1.0.0",

    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-tabs": "latest",
    "@radix-ui/react-progress": "latest",
    "@radix-ui/react-tooltip": "latest",
    "@radix-ui/react-accordion": "latest"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@playwright/test": "^1.45.0",
    "@types/jsonwebtoken": "^9.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.0.0",
    "prisma": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0"
  }
}
```

> **Removed from v1.0:** `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `uploadthing`, `@uploadthing/react`
> These are no longer needed — iLoveAPI handles all PDF processing and file handling on its own servers.

---

## Appendix B — iLoveAPI Tool Quick Reference

| Tool Slug | What It Does | Key Extra Params |
|-----------|-------------|-----------------|
| `merge` | Combine PDFs | — |
| `split` | Split / remove pages | `split_mode`, `ranges`, `fixed_range`, `remove_pages` |
| `compress` | Reduce file size | `compression_level` |
| `pdfocr` | Make PDF searchable | `ocr_languages[]` |
| `pdfjpg` | PDF → JPG images | `pdfjpg_mode` (pages/extract) |
| `imagepdf` | Images → PDF | `orientation`, `margin`, `pagesize`, `merge_after` |
| `officepdf` | Office → PDF (Word/Excel/PPT) | — |
| `htmlpdf` | URL → PDF | — |
| `pdfa` | Convert to PDF/A | `conformance`, `allow_downgrade` |
| `validatepdfa` | Validate PDF/A | `conformance` |
| `extract` | Extract text | `detailed` |
| `editpdf` | Add text/images/SVG | `elements[]` |
| `watermark` | Add watermark | `mode`, `text`/`image`, position, font, `transparency` |
| `pagenumber` | Add page numbers | `pages`, `starting_number`, position, font, `text` template |
| `rotate` | Rotate pages | Set `rotate` in file object |
| `repair` | Fix corrupt PDF | — |
| `protect` | Add password | `password` |
| `unlock` | Remove password | Pass `password` in file object |
| `sign` *(Sig API)* | E-signature workflow | Full signature API — see Section 9.6 |

---

## Appendix C — iLoveAPI HTTP Error Reference

| Status | Type | Meaning | Action |
|--------|------|---------|--------|
| 401 | Unauthorized | Invalid/expired JWT | Regenerate token |
| 400 UploadError | UploadError | Missing file or param | Check form data |
| 400 ProcessingError (WrongPassword) | WrongPassword | File needs password | Prompt user for password |
| 400 ProcessingError (DamagedFile) | DamagedFile | Corrupt PDF | Suggest Repair PDF tool |
| 400 ProcessingError (OutOfRange) | OutOfRange | Page range invalid | Fix page range |
| 400 ProcessingError (NonConformant) | NonConformant | PDF/A validation failed | Inform user |
| 400 DownloadError | DownloadError | Task expired (>1hr) | Re-process |
| 429 | Too Many Requests | Rate limit hit | Exponential backoff |
| 5xx | Server Error | iLoveAPI server issue | Retry with backoff; show status page |

---

*This PRD (v2.0) supersedes v1.0. The key architectural change is the full replacement of local PDF processing libraries with iLoveAPI as the exclusive processing engine. All PDF tool implementations must route through `lib/iloveapi/client.ts` server-side — no client-side PDF manipulation.*

*Last updated: March 30, 2026 — v2.0*
