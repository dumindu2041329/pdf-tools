# AGENTS.md

> Guidance for AI coding agents working in this repository.

## Project Overview

| Field | Value |
|---|---|
| **Name** | `pdf-tools` |
| **Framework** | Next.js ^16.2.3 (App Router, Turbopack) |
| **Language** | TypeScript (strict) |
| **Styling** | Tailwind CSS v4 + shadcn/ui (Radix primitives + CVA) |
| **Auth** | Clerk (`@clerk/nextjs` ^7.0.7) |
| **PDF Engine** | iLoveAPI (`@ilovepdf/ilovepdf-nodejs` ^0.3.1) + Adobe PDF Services (`@adobe/pdfservices-node-sdk` ^4.1.0) + `pdf-lib` ^1.17.1 / `jszip` ^3.10.1 / `jsonwebtoken` ^9.0.3 |
| **Object Storage** | Vercel Blob (`@vercel/blob` ^2.4.0) — client uploads for source PDFs > 4 MB |
| **AI Services** | OpenAI (`openai` ^6.33.0) |
| **Payments** | Stripe (`stripe` ^16.12.0) for Premium subscription |
| **UI/UX** | framer-motion ^12.38.0, three.js ^0.183.2, @dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0 + @dnd-kit/utilities ^3.2.2, sonner ^2.0.7, lucide-react ^1.7.0, next-themes ^0.4.6 |
| **Database** | Neon PostgreSQL (`@neondatabase/serverless` ^1.1.0) |
| **Package Manager** | npm |
| **Deployment** | Vercel |

## Build & Lint Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build (also runs TypeScript type checking) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint (core-web-vitals + typescript configs) |

No test framework is configured. There is no separate `typecheck` script — `npm run build` catches type errors.

## Code Style

### Imports
- Use the `@/` path alias (configured in `tsconfig.json`) for all project-internal imports.
- Import order: React/external → internal (`@/`) → types → styles.
- Use `import type` for type-only imports.

### Formatting
- **No semicolons** at line endings (project convention).
- Use double quotes for strings (consistent with existing code).
- Use template literals for string interpolation.

### Styling Conventions
- Text selection (`::selection`) uses `bg-primary` and `text-primary-foreground`.
- Scrollbars are customized globally:
  - Firefox: `scrollbar-width: thin` with muted-foreground color.
  - WebKit (Chrome/Safari/Edge): 8px width/height, transparent track, rounded semi-transparent muted-foreground thumb with hover state.
- Theme is driven by CSS custom properties in `app/globals.css` (`--primary`, `--background`, etc.) wired into Tailwind v4 via `@theme` so utility classes resolve to HSL values. Light/dark variants are switched by `next-themes` adding/removing the `.dark` class on `<html>`.

### Exports
- **Named exports** for components, hooks, utilities, and lib functions.
- **Default exports** only for Next.js page/layout files (`page.tsx`, `layout.tsx`).

### Types
- TypeScript `strict` mode is enabled. Respect it.
- Prefer `interface` for object shapes; `type` for unions, intersections, and mapped types.
- Use discriminated unions for state machines (see `ToolState` in `hooks/useTool.ts`).
- Never use `any` — use `unknown` and narrow. If truly unavoidable, use `@ts-expect-error` with a comment.

### Naming Conventions
| Item | Convention | Example |
|---|---|---|
| Components | PascalCase | `FileUploader.tsx` |
| Hooks | camelCase, `use` prefix | `useTool.ts` |
| Utilities / lib | camelCase | `utils.ts`, `toolValidation.ts` |
| Route directories | lowercase-hyphen | `app/tools/[slug]/` |
| Type / interface names | PascalCase | `ToolConfig`, `ILoveAPITool` |
| Constants | camelCase or UPPER_SNAKE | `toolsConfig`, `ILOVEAPI_PUBLIC_KEY` |
| CSS custom properties | kebab-case | `--font-geist-sans` |

### Component Structure
```tsx
"use client"  // only when needed: browser APIs, events, state

import { useState } from "react"              // 1. React / external
import { Button } from "@/components/ui/button" // 2. Internal
import type { ToolConfig } from "@/lib/types"    // 3. Types

interface Props {
  title: string
}

export function ToolCard({ title }: Props) {  // named export
  const [active, setActive] = useState(false) // hooks first

  return <div>...</div>
}
```

### Error Handling
- API routes: catch `ILoveAPIError` specifically, then fall back to generic 500. Adobe errors are normalized through `adobeErrorResponse()` which maps `ServiceApiError.errorCode === "INPUT_TOO_LARGE"` to a 413.
- Client-side: use the `ToolState` discriminated union (`status: "error"` with `retryable` flag, plus `upgradeRequired` / `redirectToSignUp`).
- Map iLoveAPI error types to user-friendly messages via `mapILoveAPIError()`.
- Use `withRetry()` for transient iLoveAPI failures (exponential backoff).
- Never expose raw error messages or stack traces to the client.

## Architecture

### Directory Layout
```
app/                        # Next.js App Router
  (auth)/                   # Auth pages (Clerk) — gradient backdrop, no nav
    sign-in/[[...sign-in]]/
    sign-up/[[...sign-up]]/
    layout.tsx
  (dashboard)/              # Authenticated routes (Clerk redirect-on-mount)
    account/
      _components/AccountSidebar.tsx
      billing/page.tsx
      profile/page.tsx
      security/page.tsx
      layout.tsx
      page.tsx              # Redirects → /account/profile
    workflows/
      [id]/run/page.tsx
      new/page.tsx
      page.tsx
    layout.tsx
  (marketing)/              # Public landing routes (Navbar + Footer)
    layout.tsx
    page.tsx
  api/
    activity/route.ts
    ai/
      summarize/route.ts
      translate/route.ts
    billing/
      checkout/route.ts
      verify-session/route.ts
    download/[id]/route.ts
    tools/
      [tool]/route.ts       # Main PDF processing endpoint
      sign/route.ts         # PDF signing via iLoveAPI Signature API
    upload/route.ts         # Vercel Blob client-upload token endpoint
    usage/route.ts
    webhooks/
      iloveapi/route.ts
      stripe/route.ts
    workflows/
      [id]/
        run/route.ts
        route.ts
      route.ts
  tools/
    [slug]/
      ToolPageClient.tsx    # Client component (tool UI, workflow mode)
      page.tsx              # Server component (metadata + generateStaticParams)
    layout.tsx              # Navbar wrapper for tool pages
  favicon.ico
  globals.css               # Tailwind v4 + theme tokens
  layout.tsx                # Root: ClerkProvider, ThemeProvider, Toaster, fonts
  not-found.tsx
  sitemap.ts                # Generated from toolsConfig
components/
  layout/
    Footer.tsx
    Navbar.tsx              # Sticky, with ToolsDropdown + Clerk auth menu
    ToolsDropdown.tsx       # 5-col mega-menu grouped by category
    UserMenu.tsx            # Avatar dropdown (workflows, account, sign out)
  shared/
    UsageMeter.tsx          # Progress bar with warning/danger thresholds
  theme/
    ThemeProvider.tsx       # next-themes wrapper
    ThemeToggle.tsx
    Toaster.tsx             # Sonner toaster, mobile-aware position
  tools/
    options/                # Per-tool option forms + previews
      CompressOptions, ExtractOptions, HtmlToPdfOptions,
      ImageToPdfOptions, OcrOptions, OrganizeOptions,
      PageNumberOptions, PageNumberPreview, PdfToJpgOptions,
      PdfaOptions, ProtectOptions, RotateOptions,
      RotatePreview, SplitOptions, ToolOptions,
      UnlockOptions, WatermarkOptions, WatermarkPreview
    DownloadCard.tsx        # Result card with download + "process another"
    FileUploader.tsx        # Drop zone + dnd-kit sortable file list
    ProcessingModal.tsx     # 5-step animated processing overlay
    ToolCard.tsx            # Tool grid card
    ToolGrid.tsx            # Category tabs + tool grid
    ToolHero.tsx            # Tool page hero (breadcrumb + icon)
  ui/                       # shadcn/ui primitives
    button.tsx              # CVA-based button variants
    confirm-dialog.tsx      # Modal confirmation
    dropdown-menu.tsx       # Radix dropdown wrapper
    glsl-hills.tsx          # Three.js animated background

hooks/
  useTool.ts                # Central tool state machine + upload pipeline

lib/
  iloveapi/
    client.ts               # SDK singleton + JWT (getRawToken) for Signature API
    errors.ts               # ILoveAPIError, mapILoveAPIError, withRetry
    page-number-mapper.ts   # UI → iLoveAPI `pagenumber` options
    signature.ts            # Signature API wrapper (createSignatureRequest, etc.)
    tools.ts                # runTool() — 4-step Start/Upload/Process/Download
    types.ts                # ILoveAPITool, TaskStatus, FileStatus, response shapes
    watermark-mapper.ts     # UI → iLoveAPI `watermark` options (text vs image)
  pdf/
    adobe-export-converter.ts  # ExportPDFJob (Word/Excel/PPT) + OCRJob
    merge-client.ts           # processMergeLocal() — pdf-lib, client-side
    office-converter.ts        # convertPdfToExcel() delegates to Adobe; helpers
    rotate-client.ts           # processRotateLocal() — server, returns base64
    split-client.ts            # processSplitLocal() — pdf-lib, client-side
  activityStore.ts          # localStorage activity feed (≤50 entries)
  auth.ts                   # Clerk plan helpers (getUserPlan, grant/revoke)
  blob-storage.ts           # Server: uploadToBlob, downloadFromBlob, delete, list
  blob-upload.ts            # Client: shouldUseDirectUpload, uploadFileDirect
  db.ts                     # Neon client + ensureDbSchema + self-heal + helpers
  extractFormatConverter.ts # extract-data → csv/json/md/txt
  fileStore.ts              # In-memory Map<id, file> for /api/download/[id]
  guest-usage.ts            # Cookie-backed counter for unauthenticated users
  stripe.ts                 # Stripe SDK singleton + price/webhook secret exports
  toolValidation.ts         # Per-tool UI validation (pre-server)
  tools-config.ts           # Tool registry (29 tools) + categories
  usage.ts                  # canProcessFile, recordProcessingEvent, getUsageStats
  usageLimits.ts            # Plan limit constants (client-safe)
  utils.ts                  # cn() — clsx + tailwind-merge
  workflowSession.ts        # IndexedDB-backed multi-step workflow session
  workflowStore.ts          # Legacy localStorage store (read-only, mirrors DB)

proxy.ts                    # Clerk middleware (Next.js 16 middleware filename)
next.config.ts              # Turbopack, proxyClientMaxBodySize, Clerk image domain
vercel.json                 # Vercel deployment config (timeouts + security headers)
eslint.config.mjs           # ESLint flat config
postcss.config.mjs          # Tailwind v4 PostCSS plugin
tsconfig.json               # "@/*" path alias → "./*"
```

### Database (Neon PostgreSQL)

The app connects to Neon via `@neondatabase/serverless`. The connection is configured in `lib/db.ts` using the `DATABASE_URL` environment variable. **Schema is auto-created on first server request** via `ensureDbSchema()` — no manual migrations needed. Uses `pgcrypto` extension for UUID generation.

#### Schema (4 tables)

| Table | Primary Key | Purpose |
|---|---|---|
| `app_user` | `clerk_user_id text` | Clerk userId mapping (stores `plan`) |
| `workflow` | `id UUID` | Workflow records (name, last_run, run_count, user_id FK) |
| `workflow_step` | `id UUID` | Ordered steps per workflow (FK → workflow, options jsonb) |
| `usage_counter` | `user_id text` | **Denormalized** daily/monthly counters per user (FK → app_user) |

The `usage_counter` table is the fast O(1) read path for the daily/monthly limits:
```sql
user_id          text PRIMARY KEY
daily_count      int  NOT NULL DEFAULT 0
daily_date       date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
monthly_count    int  NOT NULL DEFAULT 0
monthly_year_month text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM')
updated_at       timestamptz NOT NULL DEFAULT now()
```
All date math uses explicit UTC. The CASE expression in `readCounterCounts()` returns 0 for stale buckets, so the counter is implicitly reset when the date/month rolls over.

Indexes: `workflow_user_created_at_idx`, `workflow_step_workflow_step_index_idx`, `usage_counter_daily_date_idx`.

#### Schema self-healing

`ensureDbSchema()` is a global-singleton promise — the DDL runs at most once per server instance. Three additional helpers guard against tables being dropped externally (e.g. via the Neon console):

- `ensureDbSchemaIfStale()` — fire-and-forget; at most once per hour per server instance, calls the `pdf_tools_health_check()` stored function and re-runs the DDL if any expected table is missing.
- `isMissingRelationError(err)` — detects SQLSTATE `42P01` (`undefined_table`).
- `resetSchemaInit()` — clears the cached init promise so the next caller re-runs the DDL.

`recordProcessingEvent()` catches `42P01`, calls `resetSchemaInit()`, and retries once. The health check + reactive catch together give full coverage (proactive hourly sweep + reactive per-write healing).

#### DB Helper Functions (lib/db.ts)

- `sql` — tagged template literal for type-safe Neon queries
- `ensureDbSchema()` — runs all `CREATE TABLE IF NOT EXISTS` statements; uses a global singleton promise to avoid duplicate runs in dev
- `ensureDbSchemaIfStale()` — hourly proactive health check (see above)
- `resetSchemaInit()` / `isMissingRelationError()` — self-heal utilities
- `upsertUser(userId)` — inserts or ignores the `app_user` row for a Clerk user
- `setUserPlan(userId, plan)` — **UPSERT** into `app_user`; no longer requires a separate `upsertUser()` call
- `getUserPlanFromDb(userId)` — reads `plan` column for fallback auth checks

### Vercel Blob

Vercel Blob is the project's CDN-backed object store for source PDFs. The store ID lives in the Vercel dashboard (see `BLOB_READ_WRITE_TOKEN` below) and is auto-injected into all Vercel environments; locally run `vercel env pull .env.local` to populate the value.

#### Why
Vercel serverless functions truncate request bodies at ~4.5 MB. The free plan allows files up to 20 MB and the premium plan up to 4 GB, so neither is reachable via the original "POST the PDF in a FormData body" path. The official workaround is the **client upload** pattern from <https://vercel.com/docs/vercel-blob/client-upload>: the browser asks the server for a signed token, uploads the file straight to Blob, and hands the resulting URL back to the server for downstream processing.

#### Files
- `app/api/upload/route.ts` — issues client upload tokens via `handleUpload` from `@vercel/blob/client`. Requires Clerk auth (guests are allowed but capped at 20 MB), restricts content type to PDFs / images, and caps each upload at 4 GB for signed-in users. Fails fast with a useful message if `BLOB_READ_WRITE_TOKEN` is not set on the server.
- `lib/blob-upload.ts` — browser-side helpers: `shouldUseDirectUpload(file)` (true for files > 4 MB) and `uploadFileDirect(file, { onProgress })`.
- `lib/blob-storage.ts` — server-side helpers: `uploadToBlob`, `downloadFromBlob`, `deleteFromBlob`, `listBlobs`.

#### Flow
1. `useTool` calls `shouldUseDirectUpload(file)` for every file. Anything over 4 MB is sent to `/api/upload` first, which returns a signed token + URL.
2. The browser PUTs the file directly to Vercel Blob (this never touches the Next.js server, so the body cap doesn't apply).
3. The resulting `url` is forwarded to `/api/tools/[tool]` as a JSON-encoded `blobUrls` form field; the server route calls `downloadFromBlob(url)` to re-hydrate the file as a `Buffer` and continues into the existing processing pipeline.
4. Small files still ride the original `multipart/form-data` path so the common case stays cheap.
5. The same flow applies to the optional `watermarkImage` for the `watermark-pdf` tool (uses `watermarkImageUrl` + `watermarkImageFilename` form fields).

### Tool Pipeline
1. `FileUploader` component accepts user files (drag-and-drop, sortable list, per-tool color coding)
2. `useTool` hook manages state. Files over 4 MB are first uploaded directly to **Vercel Blob** via the client SDK (see "Vercel Blob" section) and replaced in the request with their public URLs; smaller files ride the cheap multipart path
3. `useTool` POSTs to `/api/tools/[tool]` via `XMLHttpRequest` (so the browser exposes real upload progress) with the FormData
4. API handler re-hydrates `blobUrls`, runs any tool-specific preprocessing, then dispatches to the right engine:
   - **iLoveAPI tools** (`compress`, `repair`, `watermark`, `pagenumber`, `extract`, `imagepdf`, `officepdf`, `htmlpdf`, `pdfjpg`, `pdfa`, `validatepdfa`, `protect`, `unlock`): `runTool()` runs the 4-step Start/Upload/Process/Download flow
   - **Adobe tools** (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`): `ExportPDFJob` / `OCRJob` via `lib/pdf/adobe-export-converter.ts` (10-minute request timeout to accommodate large uploads)
   - **Local tools** (`local-split`, `local-merge`, `local-rotate`): `pdf-lib` processed client-side (split, merge) or server-side (rotate)
5. Result is returned as base64 to client (large files still work thanks to the Blob leg; in-memory `fileStore` is kept for legacy `/api/download/[id]` responses)
6. Usage is recorded once per successful event (or per `/api/activity` POST for local tools)

### PDF Processing Strategies

| Tool Slug | Processing | Engine | Notes |
|---|---|---|---|
| `merge-pdf` | Client-side | pdf-lib (`merge-client.ts`) | Single client-side merge via `PDFDocument.create/copyPages` |
| `split-pdf`, `remove-pages`, `organize-pdf` | Client-side | pdf-lib (`split-client.ts`) | 3 split modes: ranges, fixed_range, remove_pages |
| `rotate-pdf` | Server | pdf-lib (`rotate-client.ts`) | Base64 response; multi-file → ZIP |
| `compress-pdf` | Server | iLoveAPI | Multi-file → server-side JSZip pack |
| `repair-pdf` | Server | iLoveAPI | Multi-file → server-side JSZip pack |
| `watermark-pdf` | Server | iLoveAPI | Text or image mode; image is uploaded as separate FormData field; per-file page ranges supported |
| `add-page-numbers` | Server | iLoveAPI | Multi-file → server-side JSZip pack |
| `edit-pdf` | Server | iLoveAPI | |
| `extract-data` | Server | iLoveAPI (`extract`) | Returns CSV/JSON/MD/TXT (see `extractFormatConverter`) |
| `scan-to-pdf`, `jpg-to-pdf` | Server | iLoveAPI (`imagepdf`) | Multi-file → server-side JSZip pack |
| `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf` | Server | iLoveAPI (`officepdf`) | Multi-file → server-side JSZip pack |
| `html-to-pdf` | Server | iLoveAPI (`htmlpdf`) | URL-only path; counts as 1 event against the limit |
| `unlock-pdf`, `protect-pdf` | Server | iLoveAPI | Multi-file protect → server-side JSZip pack |
| `pdf-to-word` | Server | **Adobe PDF Services** (`ExportPDFJob`) | Despite the `iloveapiTool: "officepdf"` config field, the route handler uses `convertPdfToWordAdobe()` |
| `pdf-to-excel` | Server | Adobe PDF Services (`ExportPDFJob`) via `local-excel` | Multi-file → server-side JSZip pack |
| `pdf-to-powerpoint` | Server | Adobe PDF Services (`ExportPDFJob`) via `local-powerpoint` | Multi-file → server-side JSZip pack |
| `ocr-pdf` | Server | Adobe PDF Services (`OCRJob`) via `adobe-ocr` | Locale: `eng` → `OCRSupportedLocale.EN_US`; multi-file → server-side JSZip pack |
| `pdf-to-jpg`, `pdf-to-pdfa` | Server | iLoveAPI | Multi-file → server-side JSZip pack |
| `validate-pdfa` | Server | iLoveAPI | Returns `{ validationSuccess, message, result }` |
| `sign-pdf` | Server | iLoveAPI Signature API | Dedicated `/api/tools/sign` route; `ilovepdf.sign` task + raw `/v1/signature` call |
| `ai-summarizer`, `translate-pdf` | Server | OpenAI (via `/api/ai/*`) | Step 1: iLoveAPI `extract`; Step 2: OpenAI `gpt-4o` |

### Adobe PDF Services specifics
- Requires `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET`.
- All Adobe routes are guarded by `adobePreflightCheck()` which rejects inputs > 100 MB with HTTP 413 (Adobe's hard limit). The error path also maps `ServiceApiError.errorCode === "INPUT_TOO_LARGE"` to a 413.
- `pdfServices.upload({ readStream: Readable.from(buffer), mimeType: "application/pdf" })` is the input pattern.

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/tools/[tool]` | POST | Main PDF processing endpoint (rate-limited, all engines) |
| `/api/tools/sign` | POST | PDF signing via iLoveAPI Signature API |
| `/api/upload` | POST | Issues Vercel Blob client-upload tokens (used by `useTool` for files > 4 MB) |
| `/api/download/[id]` | GET | Stream file from in-memory `fileStore` (RFC 5987 filename) |
| `/api/ai/summarize` | POST | AI summarization |
| `/api/ai/translate` | POST | AI translation |
| `/api/usage` | GET | Returns usage counts — authenticated users from `usage_counter`, guests from the `pdf_tools_guest_usage` cookie (`isGuest: true`) |
| `/api/activity` | POST | Records client-side tool completions (merge/split/rotate); enforces guest daily/monthly cap before insert |
| `/api/workflows` | GET/POST | List workflows, create workflow |
| `/api/workflows/[id]` | GET/PATCH/DELETE | Get/update/delete single workflow |
| `/api/workflows/[id]/run` | POST | Increment workflow `run_count`, update `last_run` |
| `/api/billing/checkout` | POST | Create Stripe Checkout Session for Premium |
| `/api/billing/verify-session` | POST | Verify a completed Stripe session, grant premium access |
| `/api/webhooks/iloveapi` | POST | iLoveAPI webhooks (logs events only) |
| `/api/webhooks/stripe` | POST | Stripe subscription lifecycle webhook (grants/revokes premium based on `status`) |

### ToolState Discriminated Union (hooks/useTool.ts)

```ts
type ToolState =
  | { status: "idle" }
  | { status: "files-selected"; files: File[] }
  | {
      status: "processing"
      step: ProcessingStep
      uploadProgress?: number
      uploadBytes?: UploadProgress
      serverProcessing?: boolean   // set once 100% uploaded so the UI shows an indeterminate pulse
    }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "validation-success"; message: string; result?: string; processingTime: string }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean; redirectToSignUp?: boolean }
```

`useTool` also exposes `forceSuccess(file)` for tools that produce a result without server processing.

### Local Tools Processing
- **local-merge** (`merge-pdf`): Uses `pdf-lib` to merge PDFs entirely client-side. Handled in `useTool` hook via dynamic import of `processMergeLocal()`.
- **local-split** (`split-pdf`, `remove-pages`, `organize-pdf`): Uses `pdf-lib` to process PDFs entirely client-side. Handled in `useTool` hook via dynamic import of `processSplitLocal()`. `organize-pdf` with > 1 file first calls `processMergeLocal()` then `processSplitLocal()`.
- **local-rotate** (`rotate-pdf`): Uses `pdf-lib` server-side via `processRotateLocal()` in `rotate-client.ts`.

### Workflows
Multi-step tool chains stored in Neon (migrated from localStorage):
- **Storage**: `workflow` + `workflow_step` tables in Neon
- **API**: `/api/workflows` (CRUD), `/api/workflows/[id]/run` (increments run count)
- **UI pages**: `app/(dashboard)/workflows/` — reads and writes via the REST API
- **Client-side persistence**: `workflowStore.ts` retained as a read-only mirror of the DB (50 max workflows in localStorage); UI always writes via the API
- **Session Management**: `workflowSession.ts` keeps the in-flight multi-step run alive in IndexedDB. `createWorkflowSession` snapshots the input files + an empty `stepResults` array; after each step, the tool page serializes the output buffer back into the session and routes to the next step. Workflow mode is entered by `?workflowId=…&stepIndex=…` query params on the tool page.

### Activity Tracking
- **Server-side tools** (`/api/tools/[tool]`, `/api/ai/*`): `recordProcessingEvent()` actually inserts into `usage_counter` (it's no longer a stub) — the API route handler calls it once on success, before returning.
- **Local tools** (merge, split, rotate client-side, plus `forceSuccess`): `useTool` calls `postActivity()` which POSTs to `/api/activity`; the server reads the Clerk user via `auth()` and upserts the counter. Guests are bounced to `/sign-up` (HTTP 402 with `redirectToSignUp: true`) if they've already hit the cookie-backed cap.
- **Client display**: `activityStore.ts` reads from localStorage for real-time UI updates (limited to 50 most recent entries).

### Clerk Middleware (proxy.ts)
Auth is handled via `proxy.ts` (Clerk middleware). No routes are currently in `isProtectedRoute` — the matcher excludes `_next`, API tool routes, activity, usage, download, AI, billing, webhooks, and upload. `clockSkewInMs: 60000` is set. The `(dashboard)` route group enforces auth in the client layout (redirects to `/sign-in` on `!isSignedIn`).

### Usage Limits & Plans

| Plan | Daily | Monthly | Max File Size | Price |
|---|---|---|---|---|
| free | 5 | 30 | 20 MB | $0 |
| premium | unlimited (-1) | unlimited (-1) | 4096 MB (4 GB) | $20/month (Stripe) |

Plan is stored in Clerk user metadata (`publicMetadata.plan` + `planUpdatedAt`) and mirrored to `app_user.plan`. `getUserPlan()` prefers Clerk metadata, falls back to the DB. `getLimitsForPlan()` in `usageLimits.ts` is the source of truth for the limits themselves. **Usage counts live in the `usage_counter` table** in Neon — every successful processing event upserts the counter. `canProcessFile()` in `usage.ts` checks the user's `daily` / `monthly` counts against `planLimits.daily` / `planLimits.monthly` (and also file size).

**Guest users** have no userId, so they have no row to update. The `lib/guest-usage.ts` module persists a counter in an HTTP-only cookie (`pdf_tools_guest_usage`, 35-day `maxAge`) keyed by browser. The cap matches the free plan and is intentionally a soft gate — clearing cookies resets it. `/api/usage` returns the guest counters alongside `isGuest: true` so the client can show the right pre-flight UI. When a guest hits the cap, the server returns HTTP 402 with `redirectToSignUp: true`; the client then bounces to `/sign-up` and bumps the user to a real account.

#### Where each processing path records the event
- **Server tools** (`/api/tools/[tool]`): the API route handler calls `recordProcessingEvent()` once on success, before returning.
- **AI tools** (`/api/ai/*`): same — `recordProcessingEvent()` once on success, once on error.
- **Local tools** (merge, split, rotate client-side, plus `forceSuccess`): `useTool` calls `postActivity()` which POSTs to `/api/activity`; the server reads the Clerk user via `auth()` and upserts the counter.
- **Client-side pre-flight check** (`handleProcess` in `app/tools/[slug]/ToolPageClient.tsx`): `fetch("/api/usage")` returns today's count; if it meets or exceeds the plan's `daily` limit, a "Daily limit reached" dialog is shown before any upload starts (guests get redirected to `/sign-up` instead). The server re-enforces the limit as a safety net via `canProcessFile()`.

### Stripe Billing
- `lib/stripe.ts` exposes the SDK singleton (`apiVersion: "2024-06-20"`, `typescript: true`) plus `STRIPE_PREMIUM_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` constants.
- `POST /api/billing/checkout` creates a Checkout Session in `subscription` mode with `client_reference_id: userId` and the same in `metadata` (and again on `subscription_data.metadata` so the webhook can resolve the userId from either the session or the subscription). `success_url` returns to `/account/billing?success=true&session_id={CHECKOUT_SESSION_ID}`.
- `POST /api/billing/verify-session` is the client-side safety net: it re-retrieves the session, checks `client_reference_id === userId`, verifies `paid`/`complete`, and calls `grantPremiumAccess()`. The billing page dedupes verifications via `sessionStorage` (`billing:verified-sessions`) and short-circuits if the user is already premium.
- `POST /api/webhooks/stripe` validates the signature with `STRIPE_WEBHOOK_SECRET` and handles:
  - `checkout.session.completed` (mode=subscription) → `grantPremiumAccess`
  - `customer.subscription.created` / `updated` → `grantPremiumAccess` if status is `active` / `trialing` / `past_due`
  - `customer.subscription.deleted` or non-active status → `revokePremiumAccess`
- `grantPremiumAccess` / `revokePremiumAccess` write both Clerk metadata (source of truth) and the `app_user.plan` column (best-effort, swallowed on failure).

### Next.js Config (next.config.ts)
- **Turbopack** enabled with `root: path.resolve(".")`
- `experimental.proxyClientMaxBodySize: "4gb"` — allows large PDF uploads through the proxy layer
- Remote image pattern: `img.clerk.com` (for Clerk user avatars)

### Vercel Headers (vercel.json)
- `maxDuration` overrides per route: `/api/tools/[tool]` 120s, `/api/tools/sign` 30s, `/api/ai/*` 60s
- Global security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

## Security Rules

1. Never read, log, or hard-code `.env*` values. Use `process.env.VARIABLE_NAME`.
2. Only `NEXT_PUBLIC_*` variables reach the browser.
3. Always check auth in Server Actions and Route Handlers.
4. Validate all client input on the server (see `toolValidation.ts`).
5. Never use `dangerouslySetInnerHTML` without sanitization.
6. Never commit `.env`, `.env.local`, or secrets files.
7. Treat the guest cookie counter as a soft gate only — do not rely on it for security boundaries.
8. The `/api/upload` route should always validate `BLOB_READ_WRITE_TOKEN` is set and return a useful error if missing.

## Environment Variables

### Required
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key
- `CLERK_SECRET_KEY` — Clerk secret key
- `ILOVEAPI_PUBLIC_KEY` — iLoveAPI public key
- `ILOVEAPI_SECRET_KEY` — iLoveAPI secret key
- `OPENAI_API_KEY` — OpenAI API key (used as a fallback for the AI summarizer when `OPENROUTER_API_KEY` is not set; also powers the translate-pdf flow)
- `OPENROUTER_API_KEY` — OpenRouter API key. When set, the AI summarizer routes its completions to `openai/gpt-oss-120b:free` via `https://openrouter.ai/api/v1`. Takes precedence over `OPENAI_API_KEY` for the summarizer.

### Optional
- `PDF_SERVICES_CLIENT_ID` — Adobe PDF Services client ID (for pdf-to-word, pdf-to-excel, pdf-to-powerpoint, ocr-pdf)
- `PDF_SERVICES_CLIENT_SECRET` — Adobe PDF Services client secret
- `STRIPE_SECRET_KEY` — Stripe secret key (for Premium upgrade checkout)
- `STRIPE_PREMIUM_PRICE_ID` — Stripe price ID for the Premium plan ($20/month)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (for subscription lifecycle events)
- `NEXT_PUBLIC_APP_URL` — Public app URL used to build Stripe `success_url` / `cancel_url` and the sitemap base (defaults to `http://localhost:3000` in dev, `https://pdftools.app` for the sitemap)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob read-write token. Auto-injected by Vercel when a Blob store is connected to this project; run `vercel env pull .env.local` to populate it locally. Required for source-PDF uploads > 4 MB (see "Vercel Blob" section).
- `PDF_TO_WORD_PYTHON_BIN` / `PYTHON_BIN` — Optional Python interpreter override (legacy; the active `pdf-to-word` path uses Adobe, but the variable is still honored by `getPythonCandidates()` for any future python-backed converter).

## Agent Rules

### Always
- Prefer editing existing files over creating new ones.
- Keep components focused (< 200 lines guideline).
- Use `cn()` from `@/lib/utils` for conditional class merging.
- Run `npm run lint` and `npm run build` after changes to verify correctness.
- Commit `package-lock.json` alongside `package.json` when adding deps.
- Use `;` as the command separator instead of `&&` (Windows-compatible batch style).
- Preserve the four-step `ensureDbSchemaIfStale` → `ensureDbSchema` → `isMissingRelationError` → `resetSchemaInit` self-heal chain when adding new tables or helpers.
- When adding a new field to `app_user` or `usage_counter`, update both `ensureDbSchema()` and `pdf_tools_health_check()` so the proactive sweep keeps covering it.

### Never
- Install new dependencies without justification.
- Disable ESLint rules inline without an explanatory comment.
- Use `any` in TypeScript.
- Use `@ts-ignore` — use `@ts-expect-error` with a comment if truly necessary.
- Commit unless explicitly asked.
- Bypass `canProcessFile()` or `checkGuestLimits()` in a new server route — these are the source-of-truth gates.

## Key Implementation Details

### File Processing Flow
1. User selects file(s) in `FileUploader`
2. Options are configured via tool-specific option components in `components/tools/options/`
3. `useTool` hook manages processing state via `ToolState` discriminated union
4. For local tools (merge/split/rotate): processed in-browser (or in the server route for rotate), blob URL returned directly
5. For server tools: files are first checked against `shouldUseDirectUpload` (4 MB). Files over the cap go through `uploadFileDirect` (Vercel Blob) and the resulting URL is sent to the server in a `blobUrls` JSON field; files under the cap ride the original `multipart/form-data` path.
6. API route (`/api/tools/[tool]`) re-hydrates `blobUrls` via `downloadFromBlob`, then processes via the appropriate engine and returns either:
   - `{ fileData: base64, filename, processingTime, outputSize }` — decoded to blob URL client-side
   - `{ downloadId, filename, processingTime, outputSize }` — downloaded via `/api/download/[id]` (legacy path)
   - `{ validationSuccess, message, result, processingTime }` — for `validate-pdfa`

### iLoveAPI Integration
- Client singleton pattern in `lib/iloveapi/client.ts`
- JWT token generation with 2-hour expiry (`getRawToken()` in `lib/iloveapi/client.ts`; used by the Signature API raw `fetch` calls in `lib/iloveapi/signature.ts`)
- 4-step workflow: Start → Upload → Process → Download (`runTool()` in `lib/iloveapi/tools.ts`)
- Webhook support for async operations (`/api/webhooks/iloveapi`)
- File encryption support for sensitive documents

### Tool-specific option mapping
- `watermark-pdf`: `mapWatermarkOptions()` translates UI fields to iLoveAPI's `watermark` shape, drops text-related fields in image mode, and clamps `font_style` to a single value (Bold/Italic/Regular — Bold+Italic is unsupported).
- `add-page-numbers`: `mapPageNumberOptions()` translates to `pagenumber` shape; supports `page_mode: "facing"`, `vertical_position_adjustment`, `horizontal_position_adjustment`; allows `Bold italic` (unlike the watermark tool).
- `unlock-pdf`: the user-supplied password is moved out of `options` and attached to the file object before upload (iLoveAPI expects it on the file, not the options).
- `extract-data`: `convertExtractFormat()` rewrites the iLoveAPI CSV into JSON / Markdown / plain text and picks the right filename.

### Validation
- Client-side validation in `toolValidation.ts` (runs on the "Process" button click in `ToolPageClient.handleProcess`)
- Server-side validation in API routes (file type, size, plan/guest limits)
- File type and size checks against tool config in `tools-config.ts`

### Error Handling Patterns
- iLoveAPI errors mapped to user-friendly messages via `mapILoveAPIError()`
- Adobe errors caught by `adobeErrorResponse()`; `ServiceApiError.errorCode === "INPUT_TOO_LARGE"` → 413 with a clear message
- Local processing errors bubble up with the original message
- `upgradeRequired: true` flag returned when plan limits are exceeded (premium upsell)
- `redirectToSignUp: true` flag returned when guests hit limits (forces a hard redirect to `/sign-up`)
- All errors logged to console for debugging, never exposed to the client verbatim
