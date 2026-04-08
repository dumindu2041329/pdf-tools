<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md 
  
> This file provides guidance to AI coding agents (Claude, Codex, Copilot, etc.) when working 
> in this repository. Keep it up to date as the project evolves. 
  
--- 
  
## 📁 Project Overview 
  
| Field | Value | 
|---|---| 
| **Project Name** | `pdf-tools` | 
| **Framework** | Next.js 16.2.1 (App Router) | 
| **Language** | TypeScript | 
| **Package Manager** | `npm` | 
| **Node Version** | `>=20.x` | 
| **Deployment Target** | Vercel | 
  
### Purpose 
This application provides an online PDF productivity platform for users by processing, editing, converting, and managing PDF files using the iLoveAPI integration.
  
--- 
  
## 🗂️ Repository Structure 
  
``` 
. 
├── app/                    # Next.js App Router pages & layouts 
│   ├── (auth)/             # Route group – authentication pages (Clerk)
│   ├── (marketing)/        # Route group – public pages
│   ├── api/                # Route handlers (REST / AI endpoints)
│   ├── tools/              # Dynamic tool pages
│   ├── layout.tsx          # Root layout 
│   └── sitemap.ts          # Sitemap generator
│ 
├── components/             # Shared React components 
│   ├── layout/             # Layout components (Navbar, Footer, etc.)
│   ├── shared/             # Shared UI elements
│   ├── theme/              # Theme management
│   ├── tools/              # Feature-scoped components for PDF tools
│   └── ui/                 # Primitive UI components (shadcn/ui, etc.)
│ 
├── hooks/                  # Custom React hooks (e.g., useTool.ts)
├── lib/                    # Utility functions, helpers, constants 
│   ├── iloveapi/           # iLoveAPI SDK client & helpers
│   ├── pdf/                # PDF specific helpers
│   ├── auth.ts             # Auth configuration / helpers
│   └── utils.ts            # General utilities 
│ 
├── public/                 # Static assets 
├── .gitignore              # Git ignore list
├── eslint.config.mjs       # ESLint configuration
├── next.config.ts          # Next.js configuration 
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration 
└── AGENTS.md               # ← You are here 
``` 
  
--- 
  
## ⚙️ Environment Setup 
  
```bash 
# 1. Install dependencies 
npm install 
  
# 2. Start the development server 
npm run dev            # http://localhost:3000 
``` 
  
### Key Environment Variables 
  
| Variable | Description | Required | 
|---|---|---| 
| `NEXT_PUBLIC_APP_URL` | Public base URL (exposed to browser) | ✅ | 
| `ILOVEAPI_PUBLIC_KEY` | iLoveAPI public key for PDF processing | ✅ | 
| `ILOVEAPI_SECRET_KEY` | iLoveAPI secret key for PDF processing | ✅ | 
| `CLERK_WEBHOOK_SECRET` | Secret for verifying Clerk webhooks | ⬜ | 
| `OPENAI_API_KEY` | OpenAI API key for AI features | ⬜ | 
| `ILOVEAPI_REGION` | iLoveAPI processing region | ⬜ | 
| `ILOVEAPI_FILE_ENCRYPTION_KEY` | Encryption key for iLoveAPI files | ⬜ | 
  
> **Agent rule:** Never read, log, or hard-code values from `.env*` files. 
> Always reference variables through `process.env.VARIABLE_NAME`. 
  
--- 
  
## 🛠️ Development Commands 
  
| Command | Description | 
|---|---| 
| `npm run dev` | Start dev server with hot reload | 
| `npm run build` | Production build | 
| `npm run start` | Serve the production build | 
| `npm run lint` | Run ESLint | 
  
--- 
  
## 🧱 Tech Stack 
  
### Core 
- **Next.js 16.2.1** — App Router, Server Components, Server Actions 
- **TypeScript** — strict mode enabled 
- **Tailwind CSS v4** — utility-first styling 
- **shadcn/ui** — accessible component primitives 
- **next-themes** — dark/light mode
  
### Data & Auth 
- **Clerk** — authentication and user management (`@clerk/nextjs`)
- **iLoveAPI** — PDF processing engine (`@ilovepdf/ilovepdf-nodejs`)
  
### State & Data Fetching 
- **React Hooks** — Local state (`useState`, custom hooks like `useTool`)
  
### Testing 
- No testing framework currently configured.
  
### Tooling 
- **ESLint** + `eslint-config-next` — linting 
- **TypeScript** — type checking
  
--- 
  
## 🏛️ Architecture & Conventions 
  
### Next.js App Router Patterns 
- **Server Components** are the default. Add `"use client"` only when you need 
  browser APIs, event handlers, or React state. 
- **Route Handlers** live in `app/api/[route]/route.ts`. 
- Prefer **streaming** (`loading.tsx`, `Suspense`) over blocking data fetches. 
  
### File & Folder Naming 
| Item | Convention | Example | 
|---|---|---| 
| Components | PascalCase | `FileUploader.tsx` | 
| Hooks | camelCase, `use` prefix | `useTool.ts` | 
| Utilities | camelCase | `utils.ts` | 
| Route files | lowercase with hyphens | `app/tools/[slug]/page.tsx` | 
  
### Component Structure 
```tsx 
// 1. Imports (external → internal → types → styles) 
import { useState } from "react"; 
import { Button } from "@/components/ui/button"; 
  
// 2. Types / interfaces 
interface Props { 
  title: string; 
} 
  
// 3. Component (named export preferred over default for non-page files) 
export function ToolCard({ title }: Props) { 
  // hooks first 
  const [active, setActive] = useState(false); 
  
  // render 
  return <div>...</div>; 
} 
``` 
  
--- 
  
## 🔒 Security Guidelines 
  
> Agents **must** follow these rules without exception. 
  
1. **Never trust client input.** Validate all incoming data on the server. 
2. **No secrets on the client.** Only `NEXT_PUBLIC_*` variables reach the browser. 
3. **Always check auth in Server Actions and Route Handlers.** Do not rely solely 
   on middleware for authorization. 
4. **Rate-limit** all public API routes and auth endpoints. 
5. **Sanitize** user-generated HTML before rendering. 
  
--- 
  
## 🚫 Agent Rules & Restrictions 
  
### Always Do 
- Prefer editing existing files over creating new ones for small changes. 
- Keep components small and single-purpose (< 200 lines as a guideline). 
- Add JSDoc comments to exported functions in `lib/`. 
- Use absolute imports via the `@/` alias (configured in `tsconfig.json`). 
  
### Never Do 
- Do **not** use `any` in TypeScript — use `unknown` and narrow properly. 
- Do **not** install new dependencies without noting them in the PR description. 
- Do **not** commit changes to `.env`, `.env.local`, or any secrets file. 
- Do **not** disable ESLint rules inline (`// eslint-disable`) without a comment explaining why. 
- Do **not** use `dangerouslySetInnerHTML` without sanitizing the content first. 
- Do **not** bypass TypeScript with `@ts-ignore` — use `@ts-expect-error` with a comment if truly necessary. 
  
### Proceed with Caution 
- **Auth flow changes** — test all authentication flows edge cases. 
- **API route changes** — check for downstream consumers. 
  
--- 
  
## 📦 Adding Dependencies 
  
Before adding a new package, ask: 
1. Is this functionality already achievable with what's installed? 
2. Is the package actively maintained and well-typed? 
3. Does it significantly increase bundle size? (check bundlephobia.com) 
  
```bash 
# Runtime dependency 
npm install package-name 
  
# Dev-only dependency 
npm install -D package-name 
``` 
  
Always commit `package-lock.json` alongside `package.json`. 
  
--- 
  
## 🚀 Deployment 
  
### Vercel (Primary) 
- Pushes to `main` auto-deploy to production. 
- Environment variables are managed in the Vercel dashboard — never in code. 
  
--- 
  
## 📚 Key References 
  
| Resource | URL | 
|---|---| 
| Next.js Docs | `https://nextjs.org/docs`  | 
| TypeScript Handbook | `https://www.typescriptlang.org/docs`  | 
| Tailwind CSS Docs | `https://tailwindcss.com/docs`  | 
| shadcn/ui Docs | `https://ui.shadcn.com`  | 
| Clerk Docs | `https://clerk.com/docs`  | 
| iLoveAPI Docs | `https://developer.ilovepdf.com/docs`  | 
  
--- 
  
*Last updated: 2026-04-08 | Maintained by: pdf-tools team*