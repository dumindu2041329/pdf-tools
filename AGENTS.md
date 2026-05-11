# AGENTS.md

> Guidance for AI coding agents working in this repository.

## Project Overview

| Field | Value |
|---|---|
| **Name** | `pdf-tools` |
| **Framework** | Next.js ^16.2.3 (App Router) |
| **Language** | TypeScript (strict) |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **Auth** | Clerk (`@clerk/nextjs` ^7.0.7) |
| **PDF Engine** | iLoveAPI (`@ilovepdf/ilovepdf-nodejs`) + Adobe Node SDK (`@adobe/pdfservices-node-sdk` ^4.1.0) + `pdf-lib` / `pdfjs-dist` |
| **AI Services** | OpenAI (`openai` ^6.33.0) |
| **UI/UX** | framer-motion ^12.38.0, three.js ^0.183.2, @dnd-kit (drag & drop), sonner ^2.0.7 |
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
  (marketing)/          # Public marketing pages
  api/                  # Route handlers
    tools/[tool]/       # PDF processing endpoints
    download/[id]/      # File download endpoint
    ai/summarize/       # AI summarize endpoint
    ai/translate/       # AI translate endpoint
    usage/              # Usage tracking endpoint
    webhooks/iloveapi/  # iLoveAPI webhooks
    tools/sign/         # PDF signing endpoint
  tools/[slug]/         # Dynamic tool pages
components/
  layout/               # Navbar, Footer, ToolsDropdown
  shared/               # UsageMeter
  theme/                # ThemeProvider, ThemeToggle, Toaster
  tools/options/        # Per-tool option forms (WatermarkOptions, etc.)
  tools/                # FileUploader, ProcessingModal, ToolCard, etc.
  ui/                   # shadcn/ui primitives + glsl-hills (Three.js)
hooks/                  # Custom hooks (useTool)
lib/
  iloveapi/             # Client, types, tools runner, errors, signature, watermark-mapper
  pdf/                  # Client-side PDF helpers, Adobe export converter, office converter, rotate-client, split-client
  tools-config.ts       # Tool registry (29 tools)
  toolValidation.ts     # Per-tool input validation
  usage.ts              # Plan limits & usage tracking
  fileStore.ts          # File handling utilities
  extractFormatConverter.ts # Format conversion utilities
  auth.ts               # Clerk plan helpers
  utils.ts              # cn() utility
```

### Tool Pipeline
1. `FileUploader` component accepts user files
2. `useTool` hook manages state and calls `POST /api/tools/[tool]`
3. API handler routes to appropriate processor:
   - **iLoveAPI tools**: `runTool()` handles the API call and returns processed file
   - **Adobe tools** (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`): Adobe PDF Services SDK
   - **Local tools** (`local-split`, `local-rotate`): pdf-lib processed client-side or server-side
4. Result file is stored and `downloadId` returned to client

### PDF Processing Strategies

| Tool Slug | Processing | Engine |
|---|---|---|
| `merge-pdf` | Server | iLoveAPI |
| `split-pdf`, `remove-pages`, `organize-pdf` | Client-side | pdf-lib (`split-client.ts`) |
| `rotate-pdf` | Server | pdf-lib (`rotate-client.ts`) |
| `compress-pdf`, `repair-pdf`, `watermark-pdf`, `add-page-numbers`, `edit-pdf` | Server | iLoveAPI |
| `pdf-to-word` | Server | Adobe PDF Services (`ExportPDFJob`) |
| `pdf-to-excel` | Server | Adobe PDF Services (`ExportPDFJob`) |
| `pdf-to-powerpoint` | Server | Adobe PDF Services (`ExportPDFJob`) |
| `ocr-pdf` | Server | Adobe PDF Services (`OCRJob`) |
| `pdf-to-jpg`, `pdf-to-pdfa`, `validate-pdfa` | Server | iLoveAPI |
| `ai-summarizer`, `translate-pdf` | Server | OpenAI (via `/api/ai/*`) |

### API Routes
- `POST /api/tools/[tool]` — Main PDF processing endpoint (60s max duration)
- `GET /api/download/[id]` — File download endpoint
- `POST /api/tools/sign` — PDF signing endpoint (iLoveAPI sign tool)
- `POST /api/ai/summarize` — AI PDF summarization
- `POST /api/ai/translate` — AI PDF translation
- `GET /api/usage` — Usage tracking
- `POST /api/webhooks/iloveapi` — iLoveAPI webhook handler

### Local Tools Processing
- **local-split** (`split-pdf`, `remove-pages`, `organize-pdf`): Uses `pdf-lib` to process PDFs entirely client-side. Handled in `useTool` hook via dynamic import of `processSplitLocal()`.
- **local-rotate** (`rotate-pdf`): Uses `pdf-lib` server-side via `processRotateLocal()` in `rotate-client.ts`.

### Adobe PDF Services Pipeline
Tools configured with `local-excel`/`local-powerpoint`/`adobe-ocr` in `tools-config.ts` route to Adobe services:
- `pdf-to-word` → `convertPdfToWordAdobe()` from `adobe-export-converter.ts`
- `pdf-to-excel` → `convertPdfToExcel()` from `office-converter.ts`
- `pdf-to-powerpoint` → `convertPdfToPowerpointAdobe()` from `adobe-export-converter.ts`
- `ocr-pdf` → `ocrPdfAdobe()` from `adobe-export-converter.ts`

Requires `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET` environment variables.

### Global Singletons
Use `global as unknown as { ... }` pattern for dev-mode singletons (see `lib/iloveapi/client.ts`).

### Watermark-pdf Tool
This tool requires `mode` to be preserved in the API call to distinguish between text and image watermark modes. The `watermarkImage` file is uploaded separately via `runToolInput.watermarkImage` and the resulting `serverFilename` is obtained from `task.addFile()` return value. The `mapWatermarkOptions()` function in `lib/iloveapi/watermark-mapper.ts` handles parameter mapping and removes text-related fields when in image mode.

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

## Security Rules

1. Never read, log, or hard-code `.env*` values. Use `process.env.VARIABLE_NAME`.
2. Only `NEXT_PUBLIC_*` variables reach the browser.
3. Always check auth in Server Actions and Route Handlers.
4. Validate all client input on the server (see `toolValidation.ts`).
5. Never use `dangerouslySetInnerHTML` without sanitization.
6. Never commit `.env`, `.env.local`, or secrets files.

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
