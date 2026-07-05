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
| **Object Storage** | Supabase Storage (`@supabase/supabase-js` ^2.108.2) — client uploads for source PDFs > 4 MB and mobile-scan captures |
| **AI Services** | OpenRouter (via the `openai` ^6.33.0 SDK pointed at `https://openrouter.ai/api/v1`). The `openai` SDK is used purely as a generic OpenAI-compatible client; the actual provider is OpenRouter (model `openai/gpt-oss-120b:free`) |
| **Payments** | Stripe (`stripe` ^16.12.0) for Premium subscription |
| **Telemetry** | `@vercel/analytics` ^2.0.1 + `@vercel/speed-insights` ^2.0.0 (mounted in root layout) |
| **PDF Parsing (client)** | `pdfjs-dist` ^4.10.38 — used by the AI Summarizer + Translate-PDF for in-browser text extraction, by the Edit-PDF editor for page rasterisation, and by the AI Summarizer for the PDF preview |
| **QR codes** | `qrcode` ^1.5.4 (mobile-scan pairing) |
| **UI/UX** | framer-motion ^12.38.0, three.js ^0.183.2, @dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0 + @dnd-kit/utilities ^3.2.2, sonner ^2.0.7, lucide-react ^1.7.0, next-themes ^0.4.6, mermaid ^11.15.0 (dynamic-imported by AI Summarizer chat to render diagrams) |
| **Database** | Supabase PostgreSQL (`@supabase/supabase-js` ^2.108.2 — same project as Storage) |
| **Package Manager** | npm |
| **Deployment** | **Vercel** (primary; reads `vercel.json` for security headers + per-route `maxDuration`) **and** **Fly.io** (Docker, `fly.toml` + `Dockerfile` + `docker-entrypoint.js` at `pdf-tools-chi.fly.dev`) — both targets are supported. The 2 GB Fly VM is what lets us bypass Vercel's 4.5 MB body cap and the 10 s / 60 s function timeouts. |

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
- Use `withRetry()` for transient iLoveAPI failures (exponential backoff). The AI routes use `withRateLimitRetry()` for 429 backoff.
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
    pricing/page.tsx        # Per-tool Free vs Premium comparison + Stripe CTA
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
    scan-session/
      [sessionId]/
        route.ts            # GET (list), POST (join/save), DELETE (one)
        destroy/route.ts    # POST (wipe prefix — used by sendBeacon)
    tools/
      [tool]/route.ts       # Main PDF processing endpoint
      sign/route.ts         # PDF signing via iLoveAPI Signature API
    upload/route.ts         # Supabase Storage signed-upload-token endpoint
    usage/route.ts
    webhooks/
      iloveapi/route.ts
      stripe/route.ts
    workflows/
      [id]/
        run/route.ts
        route.ts
      route.ts
  edit-pdf-editor/          # Dedicated browser-based PDF editor page
    layout.tsx
    page.tsx
  mobile-scan/              # Mobile camera capture page (paired via QR)
    page.tsx
  scan-editor/              # Desktop review + save-as-PDF page
    layout.tsx
    page.tsx
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
    Navbar.tsx              # Sticky, with ToolsDropdown + Clerk auth menu; includes /pricing
    ToolsDropdown.tsx       # 5-col mega-menu grouped by category
    UserMenu.tsx            # Avatar dropdown (workflows, account, sign out)
  shared/
    BackToTop.tsx           # Floating scroll-to-top button (framer-motion)
    UsageMeter.tsx          # Progress bar with warning/danger thresholds
  theme/
    ThemeProvider.tsx       # next-themes wrapper
    ThemeToggle.tsx
    Toaster.tsx             # Sonner toaster, mobile-aware position
  tools/
    ai-summarizer/            # AI Summarizer custom view (chat-style, mermaid diagrams)
      AiSummarizerView.tsx    # Top-level summarizer UI; orchestrates upload + chat
      ChatPanel.tsx           # Document-bubble chat UI; SSE consumer; markdown + mermaid renderer
      PdfPreview.tsx          # In-browser page-by-page PDF preview (pdfjs-dist)
      extract-pdf-text.ts     # pdfjs-dist helper: File → plain text
    edit-pdf/                 # Dedicated browser-based PDF editor (no iLoveAPI)
      EditPdfEditorClient.tsx # pdfjs-dist rendering + pdf-lib export; text + hand tools
    options/                  # Per-tool option forms + previews
      CompressOptions, ExtractOptions, HtmlToPdfOptions,
      ImageToPdfOptions, OcrOptions, OrganizeOptions,
      PageNumberOptions, PageNumberPreview, PdfToJpgOptions,
      PdfaOptions, ProtectOptions, RotateOptions, RotatePreview,
      SplitOptions, ToolOptions, TranslateOptions, UnlockOptions,
      WatermarkOptions, WatermarkPreview
    scan-to-pdf/              # Mobile-scan QR-pairing flow
      ScanToPdfView.tsx       # Desktop side: shows QR + live image grid + device label
      ScanEditorClient.tsx    # Review captured images, rotate, reorder, send to /api/tools
      MobileScanView.tsx      # Mobile side: camera capture → Supabase upload
    shared/                   # Cross-tool view helpers
      CodeBlock.tsx           # Fenced code + copy-to-clipboard (used by ChatPanel)
      formatContent.tsx       # Markdown/table/mermaid block parser + clipboard helper
    translate-pdf/            # Translate PDF custom view
      TranslatePdfView.tsx    # Document-bubble streaming translation UI
    DownloadCard.tsx          # Result card with download + "process another"
    FileUploader.tsx          # Drop zone + dnd-kit sortable file list
    ProcessingModal.tsx       # 5-step animated processing overlay
    ToolCard.tsx              # Tool grid card
    ToolGrid.tsx              # Category tabs + tool grid
    ToolHero.tsx              # Tool page hero (breadcrumb + icon)
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
    office-converter.ts        # convertPdfToExcel() → Adobe; getSafeBaseName, execFile, resolvePythonCommand helpers
    rotate-client.ts           # processRotateLocal() — server, returns base64
    split-client.ts            # processSplitLocal() — pdf-lib, client-side
  activityStore.ts          # localStorage activity feed (≤50 entries)
  auth.ts                   # Clerk plan helpers (getUserPlan, grant/revoke)
  db.ts                     # Neon client + ensureDbSchema + self-heal + helpers
  device-info.ts            # parseDeviceInfo(ua) — coarse { type, os, browser, label } triple
  extractFormatConverter.ts # extract-data → csv/json/md/txt
  fileStore.ts              # In-memory Map<id, file> for /api/download/[id]
  guest-usage.ts            # Cookie-backed counter for unauthenticated users
  stripe.ts                 # Stripe SDK singleton + price/webhook secret exports
  supabase.ts               # Server + browser Supabase client singletons
  supabase-storage.ts     # Server: uploadToStorage, downloadFromStorage, deleteFromStorage, listStorageObjects, deleteStoragePrefix, createSignedUploadUrl, parsePublicUrl, PDF_UPLOADS_BUCKET, SCAN_SESSIONS_BUCKET
  supabase-upload.ts      # Client: shouldUseDirectUpload, uploadFileDirect (per-file bucket/pathname override)
  toolValidation.ts         # Per-tool UI validation (pre-server)
  tools-config.ts           # Tool registry (28 tools) + categories
  usage.ts                  # canProcessFile, recordProcessingEvent, getUsageStats
  usageLimits.ts            # Plan limit constants (client-safe)
  utils.ts                  # cn() — clsx + tailwind-merge
  workflowSession.ts        # IndexedDB-backed multi-step workflow session
  workflowStore.ts          # Legacy localStorage store (read-only, mirrors DB)
proxy.ts                    # Clerk middleware (Next.js 16 middleware filename)
next.config.ts              # Turbopack, proxyClientMaxBodySize, Clerk image domain
vercel.json                 # Per-route maxDuration + global security headers (kept for Fly too)
Dockerfile                  # Fly.io build: node:22-slim, compile + generate, slim prod image
docker-entrypoint.js        # Node CJS entrypoint — normalises CRLF, runs `next start`
fly.toml                    # Fly.io app config: 2 GB RAM, internal port 8080, bom region
eslint.config.mjs           # ESLint flat config
postcss.config.mjs          # Tailwind v4 PostCSS plugin
tsconfig.json               # "@/*" path alias → "./*"
```

### Database (Supabase PostgreSQL)

The app uses the **same Supabase project** for both Storage and the database. The connection goes through the PostgREST API on top of the existing Supabase client (`getSupabaseServer()` in `lib/supabase.ts`); no separate `DATABASE_URL` or postgres driver is required. **Schema is managed via Supabase migrations applied through the Supabase MCP** (see `create_pdf_tools_schema` and `create_pdf_tools_rpcs`) — no DDL is run from the app, so there is no `CREATE TABLE IF NOT EXISTS` race on first request anymore. All date math uses explicit UTC.

#### Schema (4 tables + 9 stored procedures)

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
All date math uses explicit UTC. The CASE expression inside `pdf_tools_read_counter()` returns 0 for stale buckets, so the counter is implicitly reset when the date/month rolls over.

Indexes: `workflow_user_created_at_idx`, `workflow_step_workflow_step_index_idx`, `usage_counter_daily_date_idx`.

RLS is **disabled** on all four tables — server-side writes use the service role key (or anon key fallback) and the application is the only writer. The `anon` and `authenticated` roles therefore have unrestricted table access; this matches the previous Neon behaviour. To tighten later, add RLS policies and require the service role key on the server.

#### Stored procedures (`public` schema)

The complex workflow queries (list with join, create with steps, update with steps) and the usage counter upsert live in Postgres functions so the Supabase JS client can call them via `.rpc()`. They live next to the tables and are recreated by the `create_pdf_tools_rpcs` migration.

| Function | Returns | Purpose |
|---|---|---|
| `pdf_tools_health_check()` | `TABLE(table_name text, table_exists boolean)` | Proactive self-heal: one row per expected table with a boolean existence flag. |
| `pdf_tools_read_counter(p_user_id text)` | `TABLE(daily int, monthly int)` | O(1) read of the denormalized counter; returns 0s for stale date/month buckets. |
| `pdf_tools_record_usage_event(p_user_id text, p_status text)` | `void` | Ensures the `app_user` row exists and upserts the counter atomically (only `success` events bump it). |
| `pdf_tools_list_workflows(p_user_id text)` | `jsonb` | Newest-first list of the user's workflows with their ordered steps aggregated. |
| `pdf_tools_get_workflow(p_user_id text, p_id uuid)` | `jsonb` | Single workflow with steps; `null` when not found. |
| `pdf_tools_create_workflow(p_user_id text, p_name text, p_steps jsonb)` | `jsonb` | Inserts a workflow + its ordered steps in a single call. |
| `pdf_tools_update_workflow(p_user_id text, p_id uuid, p_name text, p_steps jsonb)` | `void` | Updates name and/or replaces steps. Pass `null` to leave a field untouched. |
| `pdf_tools_delete_workflow(p_user_id text, p_id uuid)` | `void` | Deletes the workflow (CASCADE removes its steps). |
| `pdf_tools_run_workflow(p_user_id text, p_id uuid)` | `void` | Increments `run_count` and stamps `last_run`. |

#### Schema self-healing

`ensureDbSchema()` is now a no-op — the DDL is owned by Supabase migrations. The self-heal chain is still wired up so callers that hit a missing-relation error get a single retry:

- `ensureDbSchemaIfStale()` — fire-and-forget; at most once per hour per server instance, calls `pdf_tools_health_check()` and logs a warning if any expected table is missing (the operator must re-apply the `create_pdf_tools_schema` migration; the app can no longer recreate the schema on its own).
- `isMissingRelationError(err)` — detects SQLSTATE `42P01` (`undefined_table`) on Supabase errors.
- `resetSchemaInit()` — clears the cached init promise so the next caller re-runs the (now no-op) init.

`recordProcessingEvent()` catches `42P01`, calls `resetSchemaInit()`, and retries once. The hourly sweep + reactive catch pair is still the safety net for any transient schema-drift.

#### DB Helper Functions (lib/db.ts)

- `ensureDbSchema()` — no-op (DDL is owned by Supabase migrations)
- `ensureDbSchemaIfStale()` — hourly proactive health check (see above)
- `resetSchemaInit()` / `isMissingRelationError()` — self-heal utilities
- `upsertUser(userId)` — `INSERT ... ON CONFLICT DO NOTHING` into `app_user` via `.upsert()`
- `setUserPlan(userId, plan)` — **UPSERT** into `app_user` via `.upsert()`; no longer requires a separate `upsertUser()` call
- `getUserPlanFromDb(userId)` — reads `plan` column for fallback auth checks
- `readUsageCounter(userId)` — calls `pdf_tools_read_counter` RPC
- `recordUsageEvent(userId, status)` — calls `pdf_tools_record_usage_event` RPC
- `listWorkflows(userId)` / `getWorkflow(userId, id)` / `createWorkflow(userId, name, steps)` / `updateWorkflow(userId, id, name, steps)` / `deleteWorkflow(userId, id)` / `runWorkflow(userId, id)` — each calls the matching `pdf_tools_*` RPC

### Supabase Storage

Supabase Storage is the project's CDN-backed object store for source PDFs, image-to-PDF inputs, and mobile-scan captures. Three constants back the app:

- `PDF_UPLOADS_BUCKET` = `pdf-uploads` — source PDFs / images uploaded via the tool page (4 GB per-file cap for signed-in users, 20 MB for guests; public).
- `SCAN_SESSIONS_BUCKET` = `scan-sessions` — mobile-scan captures grouped by `scan-sessions/<sessionId>/` (separate, smaller lifecycle; public).

The project URL lives in `NEXT_PUBLIC_SUPABASE_URL` (auto-detected from the Supabase dashboard) and credentials are split across `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe, ships to the client) and `SUPABASE_SERVICE_ROLE_KEY` (server-only, optional — the anon key is sufficient when RLS policies allow the required operations).

#### Client singletons (`lib/supabase.ts`)

- `getSupabaseServer()` — uses the service role key when set, anon key otherwise. Used for server-side upload / list / delete / signed-URL operations.
- `getSupabaseBrowser()` — uses the anon key, safe to import from `"use client"` modules; throws if called on the server.
- `hasServiceRole()` — boolean predicate for routes that need to escalate.

#### Why

Vercel's serverless functions (and many similar hosts) truncate request bodies at ~4.5 MB. The free plan allows files up to 20 MB and the premium plan up to 4 GB, so neither is reachable via the original "POST the PDF in a FormData body" path. The official workaround is the **client upload** pattern from <https://supabase.com/docs/guides/storage/uploads/standard-uploads>: the browser asks the server for a signed upload URL, uploads the file straight to Supabase Storage, and hands the resulting public URL back to the server for downstream processing. (Fly.io has no such cap, but the same client-upload path is used for consistency and to keep the per-route `maxDuration` budget low.)

#### Files

- `app/api/upload/route.ts` — issues signed upload URLs via `createSignedUploadUrl()` from `@supabase/supabase-js`. Requires Clerk auth (guests are allowed but capped at 20 MB), restricts content type to PDFs / images, validates the `scan-sessions/<sessionId>/` prefix for scan flows, and caps each upload at 4 GB for signed-in users. `maxDuration: 60` because the largest files can take that long. Fails fast with a useful message if Supabase env vars are not set.
- `lib/supabase-storage.ts` — server-side helpers: `uploadToStorage`, `downloadFromStorage`, `deleteFromStorage`, `listStorageObjects`, `deleteStoragePrefix` (recursive prefix wipe), `createSignedUploadUrl`, `parsePublicUrl`. Exposes `PDF_UPLOADS_BUCKET` and `SCAN_SESSIONS_BUCKET` constants.
- `lib/supabase-upload.ts` — browser-side helpers: `shouldUseDirectUpload(file)` (true for files > 4 MB) and `uploadFileDirect(file, { onProgress, bucket, pathname, contentType })`. Optional `bucket` and `pathname` overrides let the mobile-scan flow upload into `scan-sessions` with a `scan-sessions/<sessionId>/<filename>` prefix without changing the helper's default `pdf-uploads` behaviour.

#### Flow

1. `useTool` calls `shouldUseDirectUpload(file)` for every file. Anything over 4 MB is sent to `/api/upload` first, which returns a `{ signedUrl, token, path }` triple.
2. The browser PUTs the file directly to Supabase Storage via the signed URL (this never touches the Next.js server, so the body cap doesn't apply).
3. The resulting public `url` is forwarded to `/api/tools/[tool]` as a JSON-encoded `blobUrls` form field; the server route calls `downloadFromStorage(url)` to re-hydrate the file as a `Buffer` and continues into the existing processing pipeline.
4. Small files still ride the original `multipart/form-data` path so the common case stays cheap.
5. The same flow applies to the optional `watermarkImage` for the `watermark-pdf` tool (uses `watermarkImageUrl` + `watermarkImageFilename` form fields).
6. Mobile-scan captures bypass `useTool` and call `uploadFileDirect(file, { bucket: "scan-sessions", pathname: "scan-sessions/<sessionId>/<filename>", ... })` directly from `MobileScanView`.

#### Buckets & RLS

Both public buckets are created on first setup with permissive RLS policies for the `anon` and `authenticated` roles (SELECT / INSERT / UPDATE / DELETE on `storage.objects`). Object paths are unguessable (random suffixes appended to every leaf) so the broad policies are safe in practice. To tighten later, swap the policies for narrower ones (e.g. allow only INSERT under a specific prefix) and require a server-issued signed download URL for reads.

### Tool Pipeline
1. `FileUploader` component accepts user files (drag-and-drop, sortable list, per-tool color coding)
2. `useTool` hook manages state. Files over 4 MB are first uploaded directly to **Supabase Storage** via the client SDK (see "Supabase Storage" section) and replaced in the request with their public URLs; smaller files ride the cheap multipart path
3. `useTool` POSTs to `/api/tools/[tool]` via `XMLHttpRequest` (so the browser exposes real upload progress) with the FormData
4. API handler re-hydrates `blobUrls`, runs any tool-specific preprocessing, then dispatches to the right engine:
   - **iLoveAPI tools** (`compress`, `repair`, `watermark`, `pagenumber`, `extract`, `imagepdf`, `officepdf`, `htmlpdf`, `pdfjpg`, `pdfa`, `validatepdfa`, `protect`, `unlock`): `runTool()` runs the 4-step Start/Upload/Process/Download flow
   - **Adobe tools** (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`): `ExportPDFJob` / `OCRJob` via `lib/pdf/adobe-export-converter.ts` (10-minute request timeout to accommodate large uploads)
   - **Local tools** (`local-split`, `local-merge`, `local-rotate`): `pdf-lib` processed client-side (split, merge) or server-side (rotate)
   - **Dedicated editor** (`edit-pdf`): bypasses `/api/tools/[tool]` entirely; `ToolPageClient.handleEditPdfNext()` uploads the source PDF to Supabase Storage (`pdf-uploads/edit-pdf/...`) and navigates to `/edit-pdf-editor?file=<url>&filename=<name>` for in-browser editing
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
| `edit-pdf` | **Browser** | pdfjs-dist + pdf-lib | Dedicated `/edit-pdf-editor` page; text + hand tools; raster previews at `RENDER_SCALE = 1.4` |
| `extract-data` | Server | iLoveAPI (`extract`) | Returns CSV/JSON/MD/TXT (see `extractFormatConverter`) |
| `scan-to-pdf`, `jpg-to-pdf` | Server | iLoveAPI (`imagepdf`) | Multi-file → server-side JSZip pack. `scan-to-pdf` is the public entry point that pairs with `/mobile-scan` + `/scan-editor` |
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
| `ai-summarizer` | Client + Server | OpenRouter (via `/api/ai/summarize`) | Step 1: client-side `pdfjs-dist` extracts PDF text (`extractPdfText()`); Step 2: server streams `openai/gpt-oss-120b:free` over SSE. No iLoveAPI. The same endpoint also handles multi-turn follow-up chat (`mode: "chat"`) that re-sends the document text + transcript tail; the client renders answers as document bubbles with markdown + Mermaid diagrams. |
| `translate-pdf` | Client + Server | OpenRouter (via `/api/ai/translate`) | Step 1: client-side `pdfjs-dist` extracts the document text (the iLoveAPI `extract` engine is wired up in the tool config but the view bypasses the API route); Step 2: server streams `openai/gpt-oss-120b:free` over SSE. Custom `TranslatePdfView` renders the streamed translation as a document bubble. |

### Edit-PDF editor (browser-based)

`edit-pdf` does **not** go through `/api/tools/[tool]`. Instead, `ToolPageClient.handleEditPdfNext()` does a direct `uploadFileDirect(file, { bucket: "pdf-uploads", pathname: "edit-pdf/<name>" })`, then `router.push("/edit-pdf-editor?file=<publicUrl>&filename=<name>")`. The editor page renders the file URL into `EditPdfEditorClient` (`components/tools/edit-pdf/EditPdfEditorClient.tsx`):

- **Renders**: `pdfjs-dist` rasterises every page at `RENDER_SCALE = 1.4` to a `<canvas>`-like data URL. Annotation coordinates are stored in this scaled space and divided by the scale at save time to recover PDF points (origin = bottom-left).
- **Toolbar** (`TOOLBAR_TOOLS`): `hand` (pan via `panStateRef`), `text` (the only writer so far), `image` / `draw` / `shape` (visual placeholders, `ready: false`).
- **Text annotation model** (`TextAnnotation`): `{ id, pageIndex, x, y, text, fontSize, width, height, fontFamily, bold, italic, underline, color, highlightColor, textAlign }`. Top-left aligned; size uses one of three `StandardFonts` (Helvetica / TimesRoman / Courier) with the four bold/italic combinations.
- **Text tool UX**: clicking the tool arms a `wantPlaceholderRef`; the next canvas click inserts a draft `<textarea>` with autofocus at the click point. Esc cancels, Enter (or blur) commits via `commitDraftAnnotation()`.
- **Selection / drag / resize**: click an annotation → primary ring, sets `selectedAnnotationId`. Drag (mousemove on the body) and 8-direction resize handles (`ResizeDirection`) update position / size; pan and drag bookkeeping live in `panStateRef` / `dragStateRef` / `resizeStateRef` so the canvas doesn't re-render every frame. Auto-fit on the `mouseup` of a resize (`fitAnnotationToContent`) re-measures the visible text span and snaps `height` to the wrapped text; the `onMouseLeave` of an annotation triggers a one-shot auto-fit for newly committed text.
- **Delete key**: a document-level `keydown` listener removes the selected annotation, but only when the event target is **not** an `INPUT`, `TEXTAREA`, or `contentEditable` element (so typing in the draft textarea never deletes the surrounding annotation).
- **Save**: `handleSave` walks every annotation, re-hydrates the original PDF buffer with `pdf-lib`, draws each annotation (font + colour + alignment) onto the matching page, and triggers a Blob download.

### Mobile Scan flow (`scan-to-pdf`)

`scan-to-pdf` is the public landing for the multi-device scan flow. The desktop page shows a live QR code and a gallery; the phone page captures images and uploads them directly to Supabase Storage; the editor page lets the user rotate / reorder / delete and then submits the file set to iLoveAPI's `imagepdf` engine.

1. **Desktop** (`components/tools/scan-to-pdf/ScanToPdfView.tsx`) mounts with an empty `sessionId`; inside the polling effect, `crypto.randomUUID()` mints a fresh session id, then the view POSTs nothing and just GETs `/api/scan-session/<id>` every 2 s. The server returns `{ images, device, saved }`. While `device === null && images.length === 0`, the QR code is shown so the phone can join.
2. **QR** is rendered as inline SVG via `qrcode.toString(...)` (theme-aware: `dark` colour flips on `resolvedTheme`).
3. **Phone** (`app/mobile-scan/page.tsx` → `MobileScanView.tsx`) opens `?session=<id>`, parses its own device via `parseDeviceInfo(navigator.userAgent)`, POSTs `{ device }` to `/api/scan-session/<id>` (so the desktop badge shows the right label), then on each camera capture calls `uploadFileDirect(file, { bucket: "scan-sessions", pathname: "scan-sessions/<id>/<name>", contentType: file.type })`. On Save, if the visitor is a real mobile/tablet, it shows a confirmation overlay and POSTs `{ saved: true }` to trigger the desktop's auto-navigation; on desktop the Save button jumps straight into the editor.
4. **Desktop auto-nav**: when the poll response includes `saved: true`, `ScanToPdfView` latches a `useRef` so the auto-navigation only fires once per session, then `router.push("/scan-editor?session=<id>")`.
5. **Editor** (`app/scan-editor/page.tsx` → `ScanEditorClient.tsx`) GETs the session, lets the user rotate / delete / reorder images, and submits the resulting file list to the standard tool pipeline via `useTool("jpg-to-pdf")` (which goes through `/api/tools/jpg-to-pdf`). Rotation re-encodes the image through a `<canvas>` to JPEG q=0.92 and re-wraps it as a `File`.
6. **Cleanup**: every page (desktop / mobile / editor) installs `pagehide` + `beforeunload` `sendBeacon` listeners that POST `/api/scan-session/<id>/destroy` to wipe the prefix; the editor additionally fires a normal `fetch` destroy on first success. The desktop also watches `usePathname()` and destroys on in-app route changes.

API surface for the flow:
- `GET /api/scan-session/[sessionId]` — lists images, device, saved flag. Public on purpose (sessionIds are unguessable UUIDs).
- `POST /api/scan-session/[sessionId]` — accepts `{ device }` (records `_device.json` via `uploadToStorage`) **or** `{ saved: true }` (records `_saved.json` sentinel).
- `DELETE /api/scan-session/[sessionId]` with `{ pathname }` — deletes a single image (path-traversal + filename regex guarded). With `{ destroy: true }` — wipes the whole session prefix.
- `POST /api/scan-session/[sessionId]/destroy` — same wipe, but POST so `sendBeacon` can call it on `pagehide`.

### AI Tool Views (custom client components)
Three tools bypass `useTool`/`ProcessingModal` and render dedicated chat-style or two-pane views directly in `app/tools/[slug]/ToolPageClient.tsx`:

- **`ai-summarizer`** → `components/tools/ai-summarizer/AiSummarizerView.tsx`
  - Layout: two-pane — left side shows `PdfPreview` (page-by-page rendering via `pdfjs-dist`); right side is the `ChatPanel`.
  - Initial summary: `streamSummary(file)` extracts text in the browser via `extractPdfText()` and POSTs JSON `{ mode: "summary", length, filename, fileSize, documentText }` to `/api/ai/summarize`. The response is an SSE stream of `chunk` / `done` events.
  - Follow-up chat: `streamFollowUp(messages, documentText)` re-POSTs with `{ mode: "chat", messages, documentText }`. The server pins the last 10 turns and re-sends the document text in the system prompt.
  - Markdown rendering: `components/tools/shared/formatContent.tsx` parses blocks (paragraphs, bullets, ordered lists, pipe tables, headings, fenced code, Mermaid) and renders them inline. No `dangerouslySetInnerHTML` — inline bold/italic/code spans are rebuilt from the parsed text.
  - Mermaid diagrams: when the model emits a ```mermaid block, `MermaidDiagram` inside `ChatPanel.tsx` dynamic-imports the `mermaid` library on first use (keeps the initial bundle small) and renders the SVG. Supports fullscreen + zoom (0.5x – 3x) + space-drag pan.
  - Server prompt rule: chat mode refuses to answer anything that isn't grounded in the document — see the `systemPrompt` in `/api/ai/summarize`. Rate limits (HTTP 429 from OpenRouter) are retried with `withRateLimitRetry()` (1s / 2s / 4s backoff, max 3 attempts).

- **`translate-pdf`** → `components/tools/translate-pdf/TranslatePdfView.tsx`
  - Layout: two-pane — left side is `FileUploader` + `TranslateOptions`; right side renders a `DocumentBubble` with the streamed translation.
  - Reuses `extractPdfText()` to read the PDF client-side; POSTs `{ mode: "translate", targetLanguageLabel, documentText, filename, fileSize }` to `/api/ai/translate` and consumes the same SSE protocol (`chunk` / `done`).
  - Supported target languages live in `components/tools/options/TranslateOptions.tsx` (30 languages from "auto"/English through Hungarian).
  - Server is capped at 50 000 chars of source text to keep prompts within model limits.

- **`scan-to-pdf`** → `components/tools/scan-to-pdf/ScanToPdfView.tsx` (see "Mobile Scan flow" above for the full multi-page walkthrough).

All three are mounted by `ToolPageClient.tsx` instead of the default `FileUploader` + `useTool` flow — the `tool.slug === "ai-summarizer" | "translate-pdf" | "scan-to-pdf"` branches select them. `useTool`-driven usage tracking is intentionally skipped for these views; the API routes call `recordProcessingEvent()` themselves.

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
Auth is handled via `proxy.ts` (Clerk middleware). No routes are currently in `isProtectedRoute` — the matcher excludes `_next`, API tool routes, activity, usage, download, AI, billing, webhooks, upload, and scan-session routes. `clockSkewInMs: 60000` is set. The `(dashboard)` route group enforces auth in the client layout (redirects to `/sign-in` on `!isSignedIn`).

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

#### Adobe 100 MB hard cap
Adobe PDF Services rejects inputs > 100 MB regardless of plan. `adobePreflightCheck()` in `app/api/tools/[tool]/route.ts` short-circuits with a 413 before any upload, and `adobeErrorResponse()` maps `ServiceApiError.errorCode === "INPUT_TOO_LARGE"` to a 413. The pricing page shows this cap as `ADOBE_MAX_FILE_SIZE_MB = 100` for `pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, and `ocr-pdf`.

### Pricing page (`app/(marketing)/pricing/page.tsx`)
- Public marketing route under `(marketing)` so it gets the Navbar + Footer. Added a "Pricing" link in the Navbar.
- Two-card layout: Free ($0/forever) and Premium ($20/month, "Most popular" badge).
- A per-tool comparison table is generated from `toolsConfig`: rows show accepted file types, free files/request, premium files/request, and premium max file size. Categories are pulled from `toolCategories` (excluding `all`).
- For Adobe-backed tools the premium max size is capped at 100 MB (see `ADOBE_TOOL_SLUGS`); everything else uses `PREMIUM.maxFileSizeMB` (4 GB).
- `<BackToTop />` is mounted at the bottom of the page (also used elsewhere in the marketing tree as needed).

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

### Deployment

Both **Vercel** and **Fly.io** are supported production targets. The codebase is structured so the same `next start` process works on either — `vercel.json` carries the per-route `maxDuration` overrides and global security headers, and the Fly Dockerfile layers on top of the same Next.js build.

#### Vercel (primary)

- `vercel.json` carries the per-route `maxDuration` overrides and global security headers. These same values are also respected when running on Fly.
- Vercel serverless functions truncate request bodies at ~4.5 MB. The free plan allows files up to 20 MB and the premium plan up to 4 GB, so neither is reachable via the original "POST the PDF in a FormData body" path. The official workaround is the **client upload** pattern from <https://supabase.com/docs/guides/storage/uploads/standard-uploads>: the browser asks the server for a signed upload URL, uploads the file straight to Supabase Storage, and hands the resulting public URL back to the server for downstream processing.
- `next.config.ts` sets `experimental.proxyClientMaxBodySize: "4gb"` to lift the request-body cap at the proxy layer (works in both targets).

#### Fly.io (Docker)

The production instance at `pdf-tools-chi.fly.dev` runs on Fly. The 2 GB memory budget bypasses Vercel's 4.5 MB body cap and the 10 s / 60 s function timeouts.

- `Dockerfile` — multi-stage `node:22.21.1-slim` build: install dev deps, `next build --experimental-build-mode compile`, prune dev deps, copy into a slim runtime. Normalises CRLF on `docker-entrypoint.js` so a Windows-checked-in entrypoint doesn't crash with `env: 'node\r': No such file or directory`.
- `docker-entrypoint.js` — Node CJS shim. If the container is being launched as `npm run start`, it first runs `npx next build --experimental-build-mode generate` to prerender the static pages, then execs the rest of the command line.
- `fly.toml` — `app = "pdf-tools-chi"`, `primary_region = "bom"`, `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "stop"`, `min_machines_running = 0`, VM = `memory = "2gb"`, `cpu_kind = "shared"`, `cpus = 1`.

### Vercel Config (vercel.json)
- `maxDuration` overrides per route: `/api/tools/[tool]` 120s, `/api/tools/sign` 30s, `/api/ai/*` 60s. Also respected when running on Fly.
- Global security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/tools/[tool]` | POST | Main PDF processing endpoint (rate-limited, all engines). Reads inline `file` + `blobUrls` (Supabase Storage URLs) + `watermark_image` / `watermarkImageUrl`. Re-hydrates blobs and dispatches to iLoveAPI / Adobe / pdf-lib. `maxDuration: 120`. |
| `/api/tools/sign` | POST | PDF signing via iLoveAPI Signature API |
| `/api/upload` | POST | Issues Supabase Storage signed upload URLs. Accepts `{ bucket, pathname, contentType, size }`. Validates that `scan-sessions` uploads start with `scan-sessions/<sessionId>/…` and that the per-file cap matches the plan. `maxDuration: 60`. |
| `/api/scan-session/[sessionId]` | GET | Lists images + device + saved flag for a scan session |
| `/api/scan-session/[sessionId]` | POST | Records `{ device }` (join ping) **or** `{ saved: true }` (Save signal) |
| `/api/scan-session/[sessionId]` | DELETE | Deletes a single image by `pathname` (guarded against path traversal) or wipes the whole session with `{ destroy: true }` |
| `/api/scan-session/[sessionId]/destroy` | POST | Same wipe as DELETE with `destroy: true`, but POST so `sendBeacon` can call it on `pagehide` |
| `/api/download/[id]` | GET | Stream file from in-memory `fileStore` (RFC 5987 filename) |
| `/api/ai/summarize` | POST | AI summarization (SSE) |
| `/api/ai/translate` | POST | AI translation (SSE) |
| `/api/usage` | GET | Returns usage counts — authenticated users from `usage_counter`, guests from the `pdf_tools_guest_usage` cookie (`isGuest: true`) |
| `/api/activity` | POST | Records client-side tool completions (merge/split/rotate); enforces guest daily/monthly cap before insert |
| `/api/workflows` | GET/POST | List workflows, create workflow |
| `/api/workflows/[id]` | GET/PATCH/DELETE | Get/update/delete single workflow |
| `/api/workflows/[id]/run` | POST | Increment workflow `run_count`, update `last_run` |
| `/api/billing/checkout` | POST | Create Stripe Checkout Session for Premium |
| `/api/billing/verify-session` | POST | Verify a completed Stripe session, grant premium access |
| `/api/webhooks/iloveapi` | POST | iLoveAPI webhooks (logs events only) |
| `/api/webhooks/stripe` | POST | Stripe subscription lifecycle webhook (grants/revokes premium based on `status`) |

## Pages

| Route | File | Auth | Notes |
|---|---|---|---|
| `/` | `app/(marketing)/page.tsx` | Public | Tool grid hero, categories, footer |
| `/pricing` | `app/(marketing)/pricing/page.tsx` | Public | Free vs Premium cards + per-tool comparison table |
| `/sign-in`, `/sign-up` | `app/(auth)/*` | Public | Clerk hosted-style pages (gradient backdrop, no nav) |
| `/tools/[slug]` | `app/tools/[slug]/page.tsx` + `ToolPageClient.tsx` | Public | Most tools. `generateStaticParams` from `toolsConfig`. |
| `/edit-pdf-editor` | `app/edit-pdf-editor/page.tsx` | Public | Dedicated editor, expects `?file=<publicUrl>&filename=<name>`. `robots: noindex`. |
| `/scan-editor` | `app/scan-editor/page.tsx` | Public | Review + save mobile-scan captures. `robots: noindex`. |
| `/mobile-scan` | `app/mobile-scan/page.tsx` | Public | Phone-side camera capture. `robots: noindex`. |
| `/account` + sub-pages | `app/(dashboard)/account/*` | Clerk | Profile / billing / security |
| `/workflows` + sub-pages | `app/(dashboard)/workflows/*` | Clerk | List / new / run |

## ToolState Discriminated Union (hooks/useTool.ts)

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

## Security Rules

1. Never read, log, or hard-code `.env*` values. Use `process.env.VARIABLE_NAME`.
2. Only `NEXT_PUBLIC_*` variables reach the browser.
3. Always check auth in Server Actions and Route Handlers.
4. Validate all client input on the server (see `toolValidation.ts`).
5. Never use `dangerouslySetInnerHTML` without sanitization.
6. Never commit `.env`, `.env.local`, or secrets files.
7. Treat the guest cookie counter as a soft gate only — do not rely on it for security boundaries.
8. The `/api/upload` route should always validate `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and return a useful error if missing.
9. The scan-session API routes are intentionally public, but every handler must re-validate the `sessionId` against `^[a-zA-Z0-9-]{1,100}$` and the `pathname` against the session prefix + `..`-block regex.

## Environment Variables

### Required
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key
- `CLERK_SECRET_KEY` — Clerk secret key
- `ILOVEAPI_PUBLIC_KEY` — iLoveAPI public key
- `ILOVEAPI_SECRET_KEY` — iLoveAPI secret key
- `OPENROUTER_API_KEY` — OpenRouter API key. Required for the AI summarizer AND translate-pdf — routes completions to `openai/gpt-oss-120b:free` via `https://openrouter.ai/api/v1` (both routes use the `openai` SDK pointed at OpenRouter). When unset, both endpoints fall back to streaming the prompt back in tiny chunks so the UI still has *something* to render during development.
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL. Public — safe to ship to the browser. Used for both the database (via PostgREST) and Storage.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon (publishable) key. Public — safe to ship to the browser. Required for Storage; used as the database fallback when `SUPABASE_SERVICE_ROLE_KEY` is unset.

### Optional
- `PDF_SERVICES_CLIENT_ID` — Adobe PDF Services client ID (for pdf-to-word, pdf-to-excel, pdf-to-powerpoint, ocr-pdf)
- `PDF_SERVICES_CLIENT_SECRET` — Adobe PDF Services client secret
- `STRIPE_SECRET_KEY` — Stripe secret key (for Premium upgrade checkout)
- `STRIPE_PREMIUM_PRICE_ID` — Stripe price ID for the Premium plan ($20/month)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (for subscription lifecycle events)
- `NEXT_PUBLIC_APP_URL` — Public app URL used to build Stripe `success_url` / `cancel_url` and the sitemap base (defaults to `http://localhost:3000` in dev, `https://pdftools.app` for the sitemap)
- `SUPABASE_SERVICE_ROLE_KEY` — Optional Supabase service role key. When unset, `lib/supabase.ts` falls back to the anon key for server-side operations (relying on RLS policies on the public buckets). Locally populate `.env.local` from the Supabase dashboard if you need to bypass RLS (e.g. to list objects across all sessions).
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
- The Edit-PDF editor's `keydown` listener must bail out when the event target is an `INPUT`, `TEXTAREA`, or `contentEditable` element — typing in a draft annotation must not delete the surrounding annotation.
- When adding a new mobile-scan / QR-pairing route, reuse the `SAFE_SESSION` regex and the destroy-on-leave beacon pattern from `app/api/scan-session/[sessionId]/destroy/route.ts`.

### Never
- Install new dependencies without justification.
- Disable ESLint rules inline without an explanatory comment.
- Use `any` in TypeScript.
- Use `@ts-ignore` — use `@ts-expect-error` with a comment if truly necessary.
- Commit unless explicitly asked.
- Bypass `canProcessFile()` or `checkGuestLimits()` in a new server route — these are the source-of-truth gates.
- Send files > 4 MB as raw FormData to `/api/tools/[tool]` — route them through `useTool`'s direct-upload path (`shouldUseDirectUpload` → `/api/upload` → `blobUrls`).

## Key Implementation Details

### File Processing Flow
1. User selects file(s) in `FileUploader`
2. Options are configured via tool-specific option components in `components/tools/options/`
3. `useTool` hook manages processing state via `ToolState` discriminated union
4. For local tools (merge/split/rotate): processed in-browser (or in the server route for rotate), blob URL returned directly
5. For server tools: files are first checked against `shouldUseDirectUpload` (4 MB). Files over the cap go through `uploadFileDirect` (Supabase Storage) and the resulting URL is sent to the server in a `blobUrls` JSON field; files under the cap ride the original `multipart/form-data` path.
6. For the `edit-pdf` tool: `handleEditPdfNext()` uploads the source to `pdf-uploads/edit-pdf/…` and navigates to `/edit-pdf-editor?file=<url>&filename=<name>`. The editor page never calls `/api/tools/[tool]`.
7. API route (`/api/tools/[tool]`) re-hydrates `blobUrls` via `downloadFromStorage`, then processes via the appropriate engine and returns either:
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
- Server-side validation in API routes (file type, size, plan/guest limits, sessionId/pathname for scan-session routes)
- File type and size checks against tool config in `tools-config.ts`

### Error Handling Patterns
- iLoveAPI errors mapped to user-friendly messages via `mapILoveAPIError()`
- Adobe errors caught by `adobeErrorResponse()`; `ServiceApiError.errorCode === "INPUT_TOO_LARGE"` → 413 with a clear message
- Local processing errors bubble up with the original message
- `upgradeRequired: true` flag returned when plan limits are exceeded (premium upsell)
- `redirectToSignUp: true` flag returned when guests hit limits (forces a hard redirect to `/sign-up`)
- All errors logged to console for debugging, never exposed to the client verbatim

## Codex / Claude compatibility

`CLAUDE.md` is a one-liner that just `@AGENTS.md` so any Claude Code session that opens the repo picks up the same context. When editing rules, edit `AGENTS.md` and confirm `CLAUDE.md` still points to it.
