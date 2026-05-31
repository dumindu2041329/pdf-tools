# AGENTS.md

> Guidance for AI coding agents working in this repository.

## Project Overview

| Field | Value |
|---|---|
| **Name** | `pdf-tools` |
| **Framework** | Next.js ^16.2.3 (App Router, Turbopack) |
| **Language** | TypeScript (strict) |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **Auth** | Clerk (`@clerk/nextjs` ^7.0.7) |
| **PDF Engine** | iLoveAPI (`@ilovepdf/ilovepdf-nodejs` ^0.3.1) + Adobe Node SDK (`@adobe/pdfservices-node-sdk` ^4.1.0) + `pdf-lib` ^1.17.1 / `pdfjs-dist` ^4.10.38 |
| **AI Services** | OpenAI (`openai` ^6.33.0) |
| **UI/UX** | framer-motion ^12.38.0, three.js ^0.183.2, @dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0, sonner ^2.0.7, lucide-react ^1.7.0 |
| **Database** | Neon PostgreSQL (`@neondatabase/serverless` ^1.1.0) |
| **Package Manager** | npm |
| **Deployment** | Vercel |

## Build & Lint Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build (also runs TypeScript type checking) |
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
- API routes: catch `ILoveAPIError` specifically, then fall back to generic 500.
- Client-side: use the `ToolState` discriminated union (`status: "error"` with `retryable` flag).
- Map iLoveAPI error types to user-friendly messages via `mapILoveAPIError()`.
- Use `withRetry()` for transient iLoveAPI failures (exponential backoff).
- Never expose raw error messages or stack traces to the client.

## Architecture

### Directory Layout
```
app/                    # Next.js App Router
  (auth)/               # Auth pages (Clerk)
    sign-in/[[...sign-in]]/
    sign-up/[[...sign-up]]/
  (dashboard)/          # Protected dashboard
    account/            # Account management
      _components/      # AccountSidebar
      billing/          # Billing page
      profile/          # Profile settings
      security/         # Security settings
    workflows/          # Workflow management
      [id]/run/         # Run workflow
      new/              # Create workflow
  (marketing)/          # Public marketing pages
  api/                  # Route handlers
    activity/           # Activity logging endpoint
    ai/summarize/       # AI summarize endpoint (60s max)
    ai/translate/       # AI translate endpoint (60s max)
    download/[id]/      # File download endpoint
    tools/[tool]/       # PDF processing endpoints (120s max)
    tools/sign/         # PDF signing endpoint (30s max)
    usage/              # Usage tracking endpoint (stub)
    webhooks/iloveapi/  # iLoveAPI webhooks
    workflows/          # Workflow CRUD (GET/POST)
    workflows/[id]/     # Workflow by ID (GET/PATCH/DELETE)
    workflows/[id]/run/ # Increment workflow run count
  tools/[slug]/         # Dynamic tool pages
    page.tsx            # Server component (metadata)
    ToolPageClient.tsx  # Client component (tool UI)
  globals.css
  layout.tsx
  sitemap.ts
  not-found.tsx
components/
  layout/               # Navbar, Footer, ToolsDropdown, UserMenu
  shared/               # UsageMeter
  theme/                # ThemeProvider, ThemeToggle, Toaster
  tools/
    options/            # Per-tool option forms + previews
      CompressOptions, ExtractOptions, HtmlToPdfOptions,
      ImageToPdfOptions, OcrOptions, OrganizeOptions,
      PageNumberOptions, PageNumberPreview, PdfaOptions,
      PdfToJpgOptions, ProtectOptions, RotateOptions,
      RotatePreview, SplitOptions, ToolOptions,
      UnlockOptions, WatermarkOptions, WatermarkPreview
    FileUploader.tsx    # File input + drag-and-drop
    ProcessingModal.tsx # Processing state overlay
    ToolCard.tsx        # Tool grid card
    ToolGrid.tsx        # Tool category grid
    ToolHero.tsx        # Tool page hero section
    DownloadCard.tsx    # Download result card
  ui/                   # shadcn/ui primitives
    button, dropdown-menu, confirm-dialog, glsl-hills (Three.js)
hooks/
  useTool.ts            # Central tool state machine
lib/
  iloveapi/             # client.ts, types.ts, tools.ts, errors.ts,
                        # signature.ts, watermark-mapper.ts, page-number-mapper.ts
  pdf/                  # adobe-export-converter.ts, office-converter.ts,
                        # rotate-client.ts, split-client.ts, merge-client.ts
  adobe/                # (directory, Adobe SDK helpers)
  tools-config.ts       # Tool registry (29 tools)
  toolValidation.ts     # Per-tool input validation
  usage.ts              # Plan limits & usage tracking (canProcessFile, recordProcessingEvent stub)
  usageLimits.ts        # Plan limit constants (client-safe)
  fileStore.ts          # In-memory file storage (Map-based, not Neon)
  extractFormatConverter.ts # Format conversion utilities
  auth.ts               # Clerk plan helpers (getUserPlan, grantPremiumAccess, revokePremiumAccess)
  utils.ts              # cn() utility
  activityStore.ts      # Activity tracking (localStorage, mirrored to DB)
  workflowStore.ts      # Legacy localStorage store (read-only, workflows migrated to DB)
  workflowSession.ts    # Workflow session management during multi-step runs
  db.ts                 # Neon PostgreSQL connection + schema init + helpers
proxy.ts                # Clerk middleware (Next.js 16 middleware filename)
next.config.ts          # Next.js config (Turbopack, proxyClientMaxBodySize: 4gb, Clerk image domain)
vercel.json             # Vercel deployment config
```

### Database (Neon PostgreSQL)

The app connects to Neon via `@neondatabase/serverless`. The connection is configured in `lib/db.ts` using the `DATABASE_URL` environment variable. **Schema is auto-created on first server request** via `ensureDbSchema()` — no manual migrations needed. Uses `pgcrypto` extension for UUID generation.

#### Schema (3 tables)

| Table | Primary Key | Purpose |
|---|---|---|
| `app_user` | `clerk_user_id text` | Clerk userId mapping |
| `workflow` | `id UUID` | Workflow records (name, last_run, run_count, user_id FK) |
| `workflow_step` | `id UUID` | Ordered steps per workflow (FK → workflow, options jsonb) |

Indexes: `workflow_user_created_at_idx`, `workflow_step_workflow_step_index_idx`.

#### DB Helper Functions (lib/db.ts)

- `sql` — tagged template literal for type-safe Neon queries
- `ensureDbSchema()` — runs all CREATE TABLE IF NOT EXISTS statements; uses a global singleton promise to avoid duplicate runs in dev
- `upsertUser(userId)` — inserts or ignores the `app_user` row for a Clerk user

### Tool Pipeline
1. `FileUploader` component accepts user files
2. `useTool` hook manages state and calls `POST /api/tools/[tool]`
3. API handler routes to appropriate processor:
   - **iLoveAPI tools**: `runTool()` handles the API call and returns processed file
   - **Adobe tools** (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`): Adobe PDF Services SDK
   - **Local tools** (`local-split`, `local-merge`, `local-rotate`): pdf-lib processed client-side or server-side
4. Result is returned as base64 to client (files stored in-memory via fileStore)

### PDF Processing Strategies

| Tool Slug | Processing | Engine |
|---|---|---|
| `merge-pdf` | Client-side | pdf-lib (`merge-client.ts`) |
| `split-pdf`, `remove-pages`, `organize-pdf` | Client-side | pdf-lib (`split-client.ts`) |
| `rotate-pdf` | Server | pdf-lib (`rotate-client.ts`) |
| `compress-pdf`, `repair-pdf`, `watermark-pdf`, `add-page-numbers`, `edit-pdf` | Server | iLoveAPI |
| `extract-pages` | Server | iLoveAPI (`extract`) |
| `scan-to-pdf`, `jpg-to-pdf` | Server | iLoveAPI (`imagepdf`) |
| `word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf` | Server | iLoveAPI (`officepdf`) |
| `html-to-pdf` | Server | iLoveAPI (`htmlpdf`) |
| `unlock-pdf`, `protect-pdf` | Server | iLoveAPI |
| `pdf-to-word` | Server | iLoveAPI (`officepdf`) — note: config shows `officepdf`, not Adobe |
| `pdf-to-excel` | Server | Adobe PDF Services (`ExportPDFJob`) via `local-excel` |
| `pdf-to-powerpoint` | Server | Adobe PDF Services (`ExportPDFJob`) via `local-powerpoint` |
| `ocr-pdf` | Server | Adobe PDF Services (`OCRJob`) via `adobe-ocr` |
| `pdf-to-jpg`, `pdf-to-pdfa`, `validate-pdfa` | Server | iLoveAPI |
| `sign-pdf` | Server | iLoveAPI (dedicated `/api/tools/sign` route) |
| `ai-summarizer`, `translate-pdf` | Server | OpenAI (via `/api/ai/*`) |

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/tools/[tool]` | POST | Main PDF processing endpoint |
| `/api/tools/sign` | POST | PDF signing via iLoveAPI |
| `/api/download/[id]` | GET | Stream file from in-memory fileStore |
| `/api/ai/summarize` | POST | AI summarization |
| `/api/ai/translate` | POST | AI translation |
| `/api/usage` | GET | Returns usage counts (stub, returns zeros) |
| `/api/activity` | GET/POST | Activity log (localStorage + mirrors to in-memory store) |
| `/api/workflows` | GET/POST | List workflows, create workflow |
| `/api/workflows/[id]` | GET/PATCH/DELETE | Get/update/delete single workflow |
| `/api/workflows/[id]/run` | POST | Increment workflow `run_count`, update `last_run` |
| `/api/webhooks/iloveapi` | POST | iLoveAPI webhooks (logs events only) |

Note: `/api/user/plan` and `/api/preview` directories exist in the filesystem but contain no route files.

### ToolState Discriminated Union (hooks/useTool.ts)

```ts
type ToolState =
  | { status: "idle" }
  | { status: "files-selected"; files: File[] }
  | { status: "processing"; step: ProcessingStep; uploadProgress?: number }
  | { status: "success"; downloadUrl: string; filename: string; processingTime: string; outputSize: number }
  | { status: "validation-success"; message: string; result?: string; processingTime: string }
  | { status: "error"; message: string; retryable: boolean; upgradeRequired?: boolean }
```

`useTool` also exposes `forceSuccess(file)` for tools that produce a result without server processing.

### Local Tools Processing
- **local-merge** (`merge-pdf`): Uses `pdf-lib` to merge PDFs entirely client-side. Handled in `useTool` hook via dynamic import of `processMergeLocal()`.
- **local-split** (`split-pdf`, `remove-pages`, `organize-pdf`): Uses `pdf-lib` to process PDFs entirely client-side. Handled in `useTool` hook via dynamic import of `processSplitLocal()`.
- **local-rotate** (`rotate-pdf`): Uses `pdf-lib` server-side via `processRotateLocal()` in `rotate-client.ts`.

### Adobe PDF Services Pipeline
Tools configured with `local-excel`/`local-powerpoint`/`adobe-ocr` in `tools-config.ts` route to Adobe services:
- `pdf-to-excel` → `convertPdfToExcel()` from `office-converter.ts`
- `pdf-to-powerpoint` → `convertPdfToPowerpointAdobe()` from `adobe-export-converter.ts`
- `ocr-pdf` → `ocrPdfAdobe()` from `adobe-export-converter.ts`

Requires `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET` environment variables.

### Global Singletons
Use `global as unknown as { ... }` pattern for dev-mode singletons (see `lib/iloveapi/client.ts` and `lib/pdf/adobe-export-converter.ts`). `ensureDbSchema()` also uses a global promise singleton.

### Watermark-pdf Tool
This tool requires `mode` to be preserved in the API call to distinguish between text and image watermark modes. The `watermarkImage` file is uploaded separately via `form.append("watermark_image", watermarkImage)` in `useTool`. The `mapWatermarkOptions()` function in `lib/iloveapi/watermark-mapper.ts` handles parameter mapping and removes text-related fields when in image mode.

### Page Number Tool
The `add-page-numbers` tool uses `mapPageNumberOptions()` from `lib/iloveapi/page-number-mapper.ts` to map UI options to iLoveAPI parameters. Supports vertical position (bottom/top), horizontal position (center/left/right), and various numbering formats.

### Tool Categories (29 tools total)
| Category | Tools |
|---|---|
| organize (6) | merge-pdf, split-pdf, remove-pages, extract-pages, organize-pdf, scan-to-pdf |
| optimize (3) | compress-pdf, repair-pdf, ocr-pdf |
| convert-to (5) | word-to-pdf, excel-to-pdf, powerpoint-to-pdf, jpg-to-pdf, html-to-pdf |
| convert-from (6) | pdf-to-word, pdf-to-jpg, pdf-to-excel, pdf-to-powerpoint, pdf-to-pdfa, validate-pdfa |
| edit (4) | rotate-pdf, watermark-pdf, add-page-numbers, edit-pdf |
| security (3) | unlock-pdf, protect-pdf, sign-pdf |
| ai (2) | ai-summarizer, translate-pdf |

### ToolConfig Shape (lib/tools-config.ts)
```ts
interface ToolConfig {
  slug: string
  title: string
  description: string
  seoDescription: string
  category: ToolCategory
  iloveapiTool: ILoveAPITool | "local-split" | "local-excel" | "local-powerpoint" | "adobe-ocr" | "local-rotate" | "local-merge"
  icon: LucideIcon
  color: string          // hsl(…) string
  access: "free" | "premium"
  acceptedFileTypes: string[]
  maxFiles: number
  maxFilesFree?: number
  maxFilesPremium?: number
  outputsZip?: boolean
}
```

### Workflows
Multi-step tool chains stored in Neon (migrated from localStorage):
- **Storage**: `workflow` + `workflow_step` tables in Neon
- **API**: `/api/workflows` (CRUD), `/api/workflows/[id]/run` (increments run count)
- **UI pages**: `app/(dashboard)/workflows/` — reads and writes via the REST API
- **Client-side persistence**: `workflowStore.ts` retained for offline-first reads; UI always calls DB via API
- **Session Management**: `workflowSession.ts` manages active workflow state during multi-step runs

### Activity Tracking
- **Server-side tools** (`/api/tools/[tool]`, `/api/ai/*`): `recordProcessingEvent` is a stub that returns `""` and does nothing
- **Local tools** (merge, split, rotate client-side): calls `recordActivity()` (localStorage) + POSTs to `/api/activity`
- **Client display**: `activityStore.ts` reads from localStorage for real-time UI updates
- Limited to 50 most recent local entries

### Clerk Middleware (proxy.ts)
Auth is handled via `proxy.ts` (Clerk middleware). No routes are currently in `isProtectedRoute` — the matcher excludes `_next`, API tool routes, activity, usage, download, AI, and webhook routes. `clockSkewInMs: 60000` is set.

### Usage Limits & Plans
| Plan | Daily | Monthly | Max File Size |
|---|---|---|---|
| free | 5 | 30 | 20 MB |
| premium | unlimited (-1) | unlimited (-1) | 4096 MB (4 GB) |

Plan is stored in Clerk user metadata (`publicMetadata.plan`). `getLimitsForPlan()` in `usageLimits.ts` is the source of truth. The `canProcessFile()` function in `usage.ts` enforces file size limits only (daily/monthly counts are not currently tracked — `recordProcessingEvent` is a stub).

### Next.js Config (next.config.ts)
- **Turbopack** enabled with `root: path.resolve(".")`
- `proxyClientMaxBodySize: "4gb"` — allows large PDF uploads
- Remote image pattern: `img.clerk.com` (for Clerk user avatars)

## Security Rules

1. Never read, log, or hard-code `.env*` values. Use `process.env.VARIABLE_NAME`.
2. Only `NEXT_PUBLIC_*` variables reach the browser.
3. Always check auth in Server Actions and Route Handlers.
4. Validate all client input on the server (see `toolValidation.ts`).
5. Never use `dangerouslySetInnerHTML` without sanitization.
6. Never commit `.env`, `.env.local`, or secrets files.

## Environment Variables

### Required
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key
- `CLERK_SECRET_KEY` — Clerk secret key
- `ILOVEAPI_PUBLIC_KEY` — iLoveAPI public key
- `ILOVEAPI_SECRET_KEY` — iLoveAPI secret key
- `OPENAI_API_KEY` — OpenAI API key

### Optional
- `PDF_SERVICES_CLIENT_ID` — Adobe PDF Services client ID (for pdf-to-excel, pdf-to-powerpoint, ocr-pdf)
- `PDF_SERVICES_CLIENT_SECRET` — Adobe PDF Services client secret

## Agent Rules

### Always
- Prefer editing existing files over creating new ones.
- Keep components focused (< 200 lines guideline).
- Use `cn()` from `@/lib/utils` for conditional class merging.
- Run `npm run lint` and `npm run build` after changes to verify correctness.
- Commit `package-lock.json` alongside `package.json` when adding deps.
- Use `;` as the command separator instead of `&&` (Windows-compatible batch style).

### Never
- Install new dependencies without justification.
- Disable ESLint rules inline without an explanatory comment.
- Use `any` in TypeScript.
- Use `@ts-ignore` — use `@ts-expect-error` with a comment if truly necessary.
- Commit unless explicitly asked.

## Key Implementation Details

### File Processing Flow
1. User selects file(s) in `FileUploader`
2. Options are configured via tool-specific option components in `components/tools/options/`
3. `useTool` hook manages processing state via `ToolState` discriminated union
4. For local tools (merge/split/rotate): processed in-browser, blob URL returned directly
5. For server tools: files sent to `/api/tools/[tool]` with FormData (`file` + `options` JSON + optional `watermark_image`)
6. API route processes via appropriate engine and returns either:
   - `{ fileData: base64, filename, processingTime, outputSize }` — decoded to blob URL client-side
   - `{ downloadId, filename, processingTime, outputSize }` — downloaded via `/api/download/[id]`
   - `{ validationSuccess, message, result }` — for validate-pdfa

### iLoveAPI Integration
- Client singleton pattern in `lib/iloveapi/client.ts`
- JWT token generation with 2-hour expiry (`lib/iloveapi/signature.ts`)
- 4-step workflow: Start → Upload → Process → Download
- Webhook support for async operations
- File encryption support for sensitive documents

### Validation
- Client-side validation in `toolValidation.ts`
- Server-side validation in API routes
- File type and size checks against tool config

### Error Handling Patterns
- iLoveAPI errors mapped to user-friendly messages via `mapILoveAPIError()`
- Adobe errors caught and returned as 500 with generic message
- Local processing errors bubble up with original message
- `upgradeRequired: true` flag returned when plan limits are exceeded
- All errors logged to console for debugging
