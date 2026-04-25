# AGENTS.md

> Guidance for AI coding agents working in this repository.

## Project Overview

| Field | Value |
|---|---|
| **Name** | `pdf-tools` |
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript (strict) |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **Auth** | Clerk (`@clerk/nextjs`) |
| **PDF Engine** | iLoveAPI (`@ilovepdf/ilovepdf-nodejs`) + Adobe Node SDK (`@adobe/pdfservices-node-sdk`) + `pdf-lib` / `pdfjs-dist` |
| **AI Services** | OpenAI (`openai`) |
| **UI/UX** | framer-motion, three.js (`three`), @dnd-kit (drag & drop), sonner (toasts) |
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
    download/           # File download endpoint
    ai/                 # AI summarize/translate
    webhooks/           # iLoveAPI webhooks
  tools/[slug]/         # Dynamic tool pages
components/
  layout/               # Navbar, Footer
  tools/                # Feature-scoped (FileUploader, ProcessingModal, etc.)
  tools/options/        # Per-tool option forms
  shared/               # Cross-feature UI
  ui/                   # shadcn/ui primitives + glsl-hills (Three.js)
  theme/                # Dark/light theme + Toaster (sonner)
hooks/                  # Custom hooks (useTool)
lib/
  iloveapi/             # Client, types, tools runner, errors, signature
  pdf/                  # Client-side PDF helpers, Adobe export converter, office converter
  tools-config.ts       # Tool registry (28+ tools)
  toolValidation.ts     # Per-tool input validation
  usage.ts              # Plan limits & usage tracking
  fileStore.ts          # File handling utilities
  extractFormatConverter.ts # Format conversion utilities
  auth.ts               # Clerk plan helpers
  utils.ts              # cn() utility
```

### Key Patterns
- **Server Components by default.** Add `"use client"` only when necessary.
- **Route Handlers** at `app/api/[route]/route.ts`. Always validate auth and input server-side.
- **Tool pipeline**: `FileUploader` → `useTool` hook → `POST /api/tools/[tool]` → `runTool()` → iLoveAPI → store file → return `downloadId`.
- **Local tools**: `local-split` and `local-rotate` bypass iLoveAPI; processed client-side in `lib/pdf/split-client.ts` and `lib/pdf/rotate-client.ts` respectively using `pdf-lib`.
- **Adobe PDF Services pipeline** (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`): Uses `@adobe/pdfservices-node-sdk` to process PDFs via Adobe PDF Services API. Runs `ExportPDFJob` for Office conversions (DOCX, XLSX, PPTX) and `OCRJob` for OCR (Searchable PDF), streaming the result back to the client. Requires `PDF_SERVICES_CLIENT_ID` and `PDF_SERVICES_CLIENT_SECRET` environment variables.
- **Global singletons** in dev: use `global as unknown as { ... }` pattern (see `lib/iloveapi/client.ts`).

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

### Never
- Install new dependencies without justification.
- Disable ESLint rules inline without an explanatory comment.
- Use `any` in TypeScript.
- Use `@ts-ignore` — use `@ts-expect-error` with a comment if truly necessary.
- Commit unless explicitly asked.
