# 📄 PDF Tools

<p>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://clerk.com"><img src="https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk&logoColor=white" alt="Clerk" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-Postgres_%2B_Storage-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://stripe.com"><img src="https://img.shields.io/badge/Payments-Stripe-635BFF?logo=stripe&logoColor=white" alt="Stripe" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://inngest.com"><img src="https://img.shields.io/badge/Jobs-Inngest-4B4BFF?logo=inngest&logoColor=white" alt="Inngest" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://upstash.com"><img src="https://img.shields.io/badge/Rate_Limit-Upstash-00E9A3?logo=upstash&logoColor=black" alt="Upstash" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel&logoColor=white" alt="Vercel" style="display:inline-block;height:28px;margin:0 4px 4px 0" /></a>
  <img src="https://img.shields.io/badge/PDF_tools-29-blueviolet" alt="29 PDF tools" style="display:inline-block;height:28px;margin:0 4px 4px 0" />
</p>

A powerful, full-stack PDF processing web app built with **Next.js 16** — supporting **29 tools** across organize, optimize, convert, edit, security, and AI categories.

## ✨ Features

### 🗂️ Organize (6 tools)
- **Merge PDF** — Combine up to 80 PDFs into one document (client-side via pdf-lib)
- **Split PDF** — Separate a PDF into multiple files (client-side)
- **Remove Pages** — Delete specific pages with a visual selector
- **Extract Data** — Extract text from PDFs (CSV / JSON / Markdown / TXT)
- **Organize PDF** — Drag-and-drop page reordering and rotation
- **Scan to PDF** — Convert scanned images (JPG, PNG, WebP, GIF) into a PDF, with an optional phone-camera capture flow via QR handoff

### ⚡ Optimize (3 tools)
- **Compress PDF** — Reduce file size with extreme, recommended, or low compression
- **Repair PDF** — Fix corrupted or damaged PDF files
- **OCR PDF** — Make scanned PDFs searchable (80+ languages, **Adobe PDF Services**)

### 🔄 Convert to PDF (5 tools)
- **Word to PDF** — DOC / DOCX → PDF
- **Excel to PDF** — XLS / XLSX → PDF
- **PowerPoint to PDF** — PPT / PPTX → PDF
- **JPG to PDF** — Images → PDF
- **HTML to PDF** — Web pages → PDF

### 📤 Convert from PDF (6 tools)
- **PDF to Word** — PDF → DOCX (**Adobe PDF Services**)
- **PDF to Excel** — PDF → XLSX (**Adobe PDF Services**)
- **PDF to PowerPoint** — PDF → PPTX (**Adobe PDF Services**)
- **PDF to JPG** — PDF pages → images (iLoveAPI)
- **PDF to PDF/A** — Convert to archival format
- **Validate PDF/A** — Check PDF/A compliance

### ✏️ Edit (4 tools)
- **Rotate PDF** — Rotate pages to any angle (server-side pdf-lib)
- **Watermark PDF** — Add text or image watermarks
- **Add Page Numbers** — Customizable position, format, and style
- **Edit PDF** — Drag-and-drop editor for text, images, shapes, emoji stamps, and annotations

### 🔒 Security (3 tools)
- **Unlock PDF** — Remove password protection
- **Protect PDF** — Add password encryption
- **Sign PDF** — Digital signatures via iLoveAPI Signature API

### 🤖 AI (2 tools)
- **AI Summarizer** — Chat-style summaries with Mermaid diagrams via OpenRouter
- **Translate PDF** — Translate PDFs to 29 languages via OpenRouter (streamed segment-by-segment)

### 🔁 Workflows
Chain multiple tools into reusable multi-step pipelines, stored in Supabase PostgreSQL.

### ⚙️ Background Processing
Large or multi-file jobs (over 10 MB, or multi-file) are dispatched to **Inngest** background functions so no single serverless request outruns the timeout. Job status and results are stored in Supabase Storage and polled by the client.

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| 🖼️ Framework | Next.js (App Router, Turbopack) | ^16.2.10 |
| 🔷 Language | TypeScript (strict) | ^6 |
| 🎨 Styling | Tailwind CSS v4 + shadcn/ui (Radix + CVA) | ^4 |
| 🔐 Auth | Clerk | ^7.5.20 |
| 📑 PDF Engine | iLoveAPI + Adobe PDF Services + pdf-lib | — |
| 🤖 AI | OpenRouter (via the `openai` SDK, model `openrouter/free`) | ^6.48.0 |
| 💳 Payments | Stripe (Premium subscription) | ^22.3.2 |
| 💾 Object Storage | Supabase Storage (client-upload for files > 4 MB) | ^2.110.7 |
| 🗄️ Database | Supabase PostgreSQL (PostgREST, same project as Storage) | ^2.110.7 |
| ⚙️ Background Jobs | Inngest (async heavy jobs, Stripe events, workflow runs) | ^4.16.0 |
| 🚦 Rate Limiting | Upstash Redis + Ratelimit (burst protection) | ^1.38.2 / ^2.0.8 |
| 📄 PDF Parsing (client) | pdfjs-dist | ^6.1.200 |
| 🧩 Utilities | jszip + jsonwebtoken + qrcode | ^3.10.1 / ^9.0.3 / ^1.5.4 |
| 🎞️ Animation | Framer Motion | ^12.42.2 |
| 🌐 3D | Three.js | ^0.185.1 |
| 🖱️ Drag & Drop | @dnd-kit/core + sortable + utilities | ^6.3.1 |
| 🎨 Icons | lucide-react | ^1.25.0 |
| 🌗 Theming | next-themes | ^0.4.6 |
| 📊 Diagrams | mermaid (dynamic-imported by AI Summarizer) | ^11.16.0 |
| 🔔 Toasts | Sonner | ^2.0.7 |
| 📈 Telemetry | @vercel/analytics + @vercel/speed-insights | ^2.0.1 / ^2.0.0 |
| 🚀 Deployment | Vercel | — |

---

## 📐 Architecture

```
app/
  (auth)/                # Clerk sign-in / sign-up pages
  (dashboard)/           # Protected: account, billing, workflows
  (marketing)/           # Public landing + pricing pages
  api/                   # Route handlers (tools, AI, jobs, scan-session, download, webhooks, billing, upload, inngest)
  edit-pdf-editor/       # Full-page Edit PDF editor
  mobile-scan/           # Phone-camera capture target (reached via QR)
  scan-editor/           # Desktop scan review + PDF assembly
  tools/[slug]/          # Dynamic tool pages (29 tools)
components/
  layout/                # Navbar, Footer, UserMenu, ToolsDropdown
  shared/                # BackToTop, UsageMeter
  theme/                 # ThemeProvider, ThemeToggle, Toaster
  tools/
    ai-summarizer/       # Chat-style summarizer view + pdfjs preview
    edit-pdf/            # Drag-and-drop annotation / shape / stamp editor
    scan-to-pdf/         # Desktop + mobile scan flows
    translate-pdf/       # Streaming translation view
    options/             # Per-tool option forms + previews
    shared/              # CodeBlock, markdown/Mermaid renderer
    FileUploader.tsx     # Drop zone + dnd-kit sortable file list
    ProcessingModal.tsx  # 5-step animated processing overlay
    ToolCard.tsx, ToolGrid.tsx, ToolHero.tsx, DownloadCard.tsx
  ui/                    # shadcn/ui primitives + Three.js hills
hooks/
  useTool.ts             # Central state machine + upload pipeline
lib/
  iloveapi/              # Client, runner, error mapping, watermark/page-number mappers
  pdf/                   # pdf-lib helpers (merge, split, rotate) + Adobe converters
  inngest/               # Client + background functions (tool-processing, workflow-run, stripe-events)
  worker/jobPoller.ts    # Client-side poller for async job status
  activityStore.ts       # localStorage activity feed
  auth.ts                # Clerk plan helpers (getUserPlan, grant/revoke)
  backgroundPoller.ts    # Keeps job/scan polling alive in background tabs
  db.ts                  # Supabase RPC helpers (users, usage, workflows)
  device-info.ts         # Parses UA into a friendly device label (scan flow)
  editResultStore.ts     # In-memory store for Edit PDF results
  extractFormatConverter.ts  # extract-data → csv/json/md/txt
  guest-usage.ts         # Cookie-backed counter for unauthenticated users
  jobs.ts                # Async job records stored in Supabase Storage
  ratelimit.ts           # Upstash-backed burst limiters
  stripe.ts              # Stripe SDK singleton + price/webhook secret exports
  supabase.ts            # Server + browser Supabase clients
  supabase-storage.ts    # Server: uploadToStorage, downloadFromStorage, delete, list, createSignedUploadUrl
  supabase-upload.ts     # Client: shouldUseDirectUpload, uploadFileDirect
  toolValidation.ts      # Per-tool UI validation (pre-server)
  tools-config.ts        # Tool registry (29 tools) + categories
  usage.ts               # Plan limits & usage tracking
  usageLimits.ts         # Plan limit constants (client-safe)
  utils.ts               # cn() — clsx + tailwind-merge
  workflowSession.ts     # IndexedDB-backed multi-step workflow session
  workflowStore.ts       # Legacy localStorage store (read-only mirror)
proxy.ts                 # Clerk middleware (Next.js 16 middleware filename)
next.config.ts           # Turbopack, proxyClientMaxBodySize, Clerk image domain
vercel.json              # Vercel deployment config (timeouts + security headers)
eslint.config.mjs        # ESLint flat config
postcss.config.mjs       # Tailwind v4 PostCSS plugin
tsconfig.json            # "@/*" path alias → "./*"
```

### 🗃️ Database (4 tables)
`app_user` · `workflow` · `workflow_step` · `usage_counter`

> The schema (4 tables + 9 stored procedures) is owned by the Supabase `create_pdf_tools_schema` and `create_pdf_tools_rpcs` migrations — no DDL runs from the app. A `pdf_tools_health_check()` RPC is called at most once per hour per server instance to detect missing tables and log a warning. All reads/writes go through the RPC wrappers in `lib/db.ts`, which retry once on a `42P01` (`undefined_table`) error as a safety net.

### 📊 Usage Plans

| Plan | Daily | Monthly | Max File Size | Price |
|---|---|---|---|---|
| 🆓 Free | 5 | 30 | 20 MB | $0 |
| ⭐ Premium | Unlimited | Unlimited | 4 GB (iLoveAPI) · 100 MB (Adobe) | $20 / month |

> Adobe-backed tools (`pdf-to-word`, `pdf-to-excel`, `pdf-to-powerpoint`, `ocr-pdf`) have a hard 100 MB input cap. All other tools accept up to 4 GB on Premium. See `/pricing` for the per-tool breakdown.

---

## 🚀 Getting Started

### 1. 📦 Clone & Install

```bash
git clone https://github.com/your-username/pdf-tools.git
cd pdf-tools
npm install
```

### 2. ⚙️ Configure Environment Variables

Create a `.env.local` file in the root directory (see [Environment Variables](#️-environment-variables) below).

### 3. 🗄️ Set Up the Database

The app uses the **same Supabase project** as Storage for the database (PostgREST via `@supabase/supabase-js`). The schema (4 tables + 9 stored procedures) is created via the `create_pdf_tools_schema` and `create_pdf_tools_rpcs` Supabase migrations — no DDL runs from the app. Re-apply them from the Supabase MCP (`apply_migration`) or dashboard if the tables go missing.

### 4. 🔐 Set Up Clerk Auth

Create a free app at [clerk.com](https://clerk.com) and add your publishable and secret keys.

### 5. 🔑 Set Up PDF, AI & Payment Services

- **iLoveAPI** — Get keys at [iloveapi.com](https://iloveapi.com)
- **OpenRouter** — Get an API key at [openrouter.ai](https://openrouter.ai) (the AI summarizer and translate-pdf routes use the `openai` SDK pointed at OpenRouter, model `openrouter/free`)
- **Adobe PDF Services** *(optional, for Word/Excel/PowerPoint export and OCR)* — Get credentials at [developer.adobe.com](https://developer.adobe.com/document-services)
- **Stripe** *(optional, for Premium subscription)* — Get keys at [dashboard.stripe.com](https://dashboard.stripe.com)
- **Upstash Redis** *(optional, for burst rate limiting)* — Get the REST URL + token at [upstash.com](https://upstash.com); without them the limiters degrade to no-ops
- **Inngest** *(optional, for async background jobs)* — Get keys at [inngest.com](https://inngest.com); in dev the Inngest dev server needs none, and without keys in production heavy jobs fall back to synchronous processing
- **Supabase Storage** *(auto-configured on Supabase; locally add NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to `.env.local`)* — Used for files > 4 MB via the [client-upload pattern](https://supabase.com/docs/guides/storage/uploads/standard-uploads)

### 6. 🔧 Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### ⚙️ Environment Variables

```env
# ── Required ───────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk public key
CLERK_SECRET_KEY=                    # Clerk secret key
ILOVEAPI_PUBLIC_KEY=                 # iLoveAPI public key
ILOVEAPI_SECRET_KEY=                 # iLoveAPI secret key
OPENROUTER_API_KEY=                  # OpenRouter key (AI summarizer + translate-pdf)

# ── Optional ──────────────────────────────────────────────────────────
# Adobe PDF Services (pdf-to-word / excel / powerpoint / ocr-pdf)
PDF_SERVICES_CLIENT_ID=
PDF_SERVICES_CLIENT_SECRET=

# Stripe (Premium subscription checkout + webhooks)
STRIPE_SECRET_KEY=
STRIPE_PREMIUM_PRICE_ID=             # Stripe price ID for the $20 / month Premium plan
STRIPE_WEBHOOK_SECRET=

# Supabase (database + storage; required for source-PDF uploads > 4 MB)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Optional — service role key bypasses RLS for server-side list/delete
SUPABASE_SERVICE_ROLE_KEY=

# iLoveAPI webhook signature verification
ILOVEAPI_WEBHOOK_SECRET=

# Upstash Redis — burst rate limiting (no-ops when unset)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Inngest — async background jobs (falls back to synchronous paths when unset)
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=

# Misc
NEXT_PUBLIC_APP_URL=                 # Public app URL (defaults to http://localhost:3000)
```

---

## 🧰 Commands

| Command | Purpose |
|---|---|
| `npm run dev` | 🔧 Start dev server |
| `npm run build` | 🏗️ Production build + type check |
| `npm run start` | 🚀 Serve the production build |
| `npm run lint` | 🔍 Run ESLint |

---

## 🌍 Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)

Check out the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
