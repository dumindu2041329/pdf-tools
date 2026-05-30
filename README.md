# 📄 PDF Tools

A powerful, full-stack PDF processing web app built with **Next.js 16** — supporting **29 tools** across organize, convert, edit, security, and AI categories.

## ✨ Features

### 🗂️ Organize (6 tools)
- **Merge PDF** — Combine up to 80 PDFs into one document
- **Split PDF** — Separate a PDF into multiple files
- **Remove Pages** — Delete specific pages with a visual selector
- **Extract Pages** — Extract text and data from PDFs
- **Organize PDF** — Drag-and-drop page reordering and rotation
- **Scan to PDF** — Convert scanned images (JPG, PNG, WebP) into a PDF

### ⚡ Optimize (3 tools)
- **Compress PDF** — Reduce file size with extreme, recommended, or low compression
- **Repair PDF** — Fix corrupted or damaged PDF files
- **OCR PDF** — Make scanned PDFs searchable (80+ languages)

### 🔄 Convert to PDF (5 tools)
- **Word to PDF** — DOC / DOCX → PDF
- **Excel to PDF** — XLS / XLSX → PDF
- **PowerPoint to PDF** — PPT / PPTX → PDF
- **JPG to PDF** — Images → PDF
- **HTML to PDF** — Web pages → PDF

### 📤 Convert from PDF (6 tools)
- **PDF to Word** — PDF → DOCX (Adobe PDF Services)
- **PDF to Excel** — PDF → XLSX (Adobe PDF Services)
- **PDF to PowerPoint** — PDF → PPTX (Adobe PDF Services)
- **PDF to JPG** — PDF pages → images
- **PDF to PDF/A** — Convert to archival format
- **Validate PDF/A** — Check PDF/A compliance

### ✏️ Edit (4 tools)
- **Rotate PDF** — Rotate pages to any angle
- **Watermark PDF** — Add text or image watermarks
- **Add Page Numbers** — Customizable position, format, and style
- **Edit PDF** — General PDF editing

### 🔒 Security (3 tools)
- **Unlock PDF** — Remove password protection
- **Protect PDF** — Add password encryption
- **Sign PDF** — Digital signatures via iLoveAPI

### 🤖 AI (2 tools)
- **AI Summarizer** — Summarize PDF content with OpenAI
- **Translate PDF** — Translate PDFs to other languages with OpenAI

### 🔁 Workflows
Chain multiple tools into reusable multi-step pipelines, stored in Neon PostgreSQL.

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| 🖼️ Framework | Next.js (App Router) | ^16.2.3 |
| 🔷 Language | TypeScript (strict) | ^5 |
| 🎨 Styling | Tailwind CSS v4 + shadcn/ui | ^4 |
| 🔐 Auth | Clerk | ^7.0.7 |
| 📑 PDF Engine | iLoveAPI + Adobe PDF Services + pdf-lib | — |
| 🤖 AI | OpenAI | ^6.33.0 |
| 🗄️ Database | Neon PostgreSQL | ^1.1.0 |
| 🎞️ Animation | Framer Motion | ^12.38.0 |
| 🌐 3D | Three.js | ^0.183.2 |
| 🖱️ Drag & Drop | @dnd-kit | ^6.3.1 |
| 🔔 Toasts | Sonner | ^2.0.7 |
| 🚀 Deployment | Vercel | — |

---

## 📐 Architecture

```
app/
  (auth)/           # Clerk sign-in / sign-up pages
  (dashboard)/      # Protected: account, billing, workflows
  (marketing)/      # Public landing page
  api/              # Route handlers (tools, AI, download, webhooks)
  tools/[slug]/     # Dynamic tool pages (29 tools)
components/
  layout/           # Navbar, Footer, UserMenu
  tools/            # FileUploader, ProcessingModal, ToolCard
  ui/               # shadcn/ui primitives + Three.js hills
hooks/              # useTool — central state machine
lib/
  iloveapi/         # Client, runner, error mapping, watermark/page-number mappers
  pdf/              # pdf-lib helpers (merge, split, rotate) + Adobe converters
  tools-config.ts   # Tool registry (29 tools)
  db.ts             # Neon PostgreSQL connection + schema
  usage.ts          # Plan limits & usage tracking
```

### 🗃️ Database (6 tables)
`app_user` · `workflow` · `workflow_step`

### 📊 Usage Plans

| Plan | Daily | Monthly | Max File Size |
|---|---|---|---|
| 🆓 Free | 5 | 30 | 20 MB |
| ⭐ Premium | Unlimited | Unlimited | 200 MB |

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

The app uses **Neon PostgreSQL**. Create a free database at [neon.tech](https://neon.tech), then add the connection string to `DATABASE_URL`. The schema is **auto-created on first request** — no migrations needed.

### 4. 🔐 Set Up Clerk Auth

Create a free app at [clerk.com](https://clerk.com) and add your publishable and secret keys.

### 5. 🔑 Set Up PDF & AI Services

- **iLoveAPI** — Get keys at [developer.ilovepdf.com](https://developer.ilovepdf.com)
- **OpenAI** — Get an API key at [platform.openai.com](https://platform.openai.com)
- **Adobe PDF Services** *(optional, for Word/Excel/PowerPoint export and OCR)* — Get credentials at [developer.adobe.com](https://developer.adobe.com/document-services)

### 6. 🔧 Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### ⚙️ Environment Variables

```env
DATABASE_URL=                        # Neon PostgreSQL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk public key
CLERK_SECRET_KEY=                    # Clerk secret key
ILOVEAPI_PUBLIC_KEY=                 # iLoveAPI public key
ILOVEAPI_SECRET_KEY=                 # iLoveAPI secret key
OPENAI_API_KEY=                      # OpenAI API key

# Adobe PDF Services
PDF_SERVICES_CLIENT_ID=              # Adobe PDF Services client ID
PDF_SERVICES_CLIENT_SECRET=          # Adobe PDF Services client secret
```

---

## 🧰 Commands

| Command | Purpose |
|---|---|
| `npm run dev` | 🔧 Start dev server |
| `npm run build` | 🏗️ Production build + type check |
| `npm run lint` | 🔍 Run ESLint |

---

## 🌍 Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)

Check out the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
