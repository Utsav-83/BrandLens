# BrandLens Stack Notes & Version Verification

Generated as part of **Prompt 0.5: Version Check**.

---

## 1. Environment & Node.js Verification
- **Host OS**: Windows 11 x64
- **Node.js**: `v24.21.0` (Active LTS/Current, satisfies **Node 20.9+** requirement)
- **npm**: `11.19.0` (execution using `npm.cmd` / `npx.cmd` in PowerShell)

---

## 2. Package Matrix & Setup Specifications

### 2.1 Next.js (`16.4.3`) & React (`19.3.1`)
- **Version Chosen**: Next.js `^16.4.3`, React `^19.3.1`, React DOM `^19.3.1`
- **Install Command**:
  ```bash
  npm install next@16.4.3 react@19.3.1 react-dom@19.3.1
  ```
- **Breaking Changes & Modern Conventions**:
  1. **`proxy.ts` replaces `middleware.ts`**:
     Next.js 16 renames `middleware.ts` to `proxy.ts` (exporting a function named `proxy(request)`). It runs at the network layer before route resolution. Placed at the project root or inside `src/`.
  2. **Asynchronous Request APIs**:
     `params` and `searchParams` in Route Handlers and Server Component pages are Promises. Always await them:
     ```typescript
     export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
       const { id } = await params;
       // ...
     }
     ```
     `cookies()` and `headers()` from `next/headers` must also be awaited:
     ```typescript
     const cookieStore = await cookies();
     const token = cookieStore.get("token")?.value;
     ```
  3. **No `next lint`**:
     The legacy `next lint` command has been removed in favor of direct ESLint execution with flat config (`eslint.config.mjs`):
     ```json
     "scripts": {
       "lint": "eslint ."
     }
     ```
  4. **Serverless Limits**:
     `export const runtime = "nodejs"` on server routes requiring Node APIs.
     `export const maxDuration = 60` for LLM analysis routes.

---

### 2.2 Prisma ORM (`7.10.1`) + Driver Adapter (`@prisma/adapter-pg`)
- **Version Chosen**: Prisma CLI `7.10.1`, `@prisma/client` `7.10.1`, `@prisma/adapter-pg` `7.10.1`, `pg` `8.23.1`
- **Install Command**:
  ```bash
  npm install @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg@8.23.1
  npm install -D prisma@7.10.1 @types/pg@8.23.1 tsx
  ```
- **Breaking Changes & Modern Conventions**:
  1. **Root `prisma.config.ts`**:
     In Prisma 7, connection URLs and migrations configurations are moved out of `schema.prisma` into `prisma.config.ts`:
     ```typescript
     import "dotenv/config";
     import { defineConfig, env } from "prisma/config";

     export default defineConfig({
       schema: "prisma/schema.prisma",
       migrations: {
         path: "prisma/migrations",
       },
       datasource: {
         url: env("DIRECT_URL") || env("DATABASE_URL"),
       },
     });
     ```
  2. **`schema.prisma` Generator & Datasource**:
     `datasource db` specifies ONLY `provider = "postgresql"` (no `url` attribute).
     The generator specifies `provider = "prisma-client"` with a designated source path:
     ```prisma
     datasource db {
       provider = "postgresql"
     }

     generator client {
       provider = "prisma-client"
       output   = "../src/generated/prisma"
     }
     ```
  3. **Importing PrismaClient**:
     Import `PrismaClient` **only** from the generated output path (`@/generated/prisma` or relative `../generated/prisma`), **never** from `@prisma/client`.
  4. **Driver Adapter for Neon / Postgres**:
     Instantiate with `@prisma/adapter-pg`:
     ```typescript
     import { PrismaPg } from "@prisma/adapter-pg";
     import { PrismaClient } from "@/generated/prisma";

     const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
     export const prisma = new PrismaClient({ adapter });
     ```
     In development, cache the instance on `globalThis` to avoid connection pool exhaustion across hot-reloads.

---

### 2.3 Tailwind CSS (`4.3.3`) & shadcn/ui (`4.22.1`)
- **Version Chosen**: Tailwind CSS `4.3.3`, `@tailwindcss/postcss`, `shadcn` CLI `4.22.1`
- **Install Command**:
  ```bash
  npm install tailwindcss@4.3.3 @tailwindcss/postcss
  npx shadcn@latest init
  ```
- **Breaking Changes & Modern Conventions**:
  1. **CSS-First Configuration**:
     Tailwind v4 replaces `tailwind.config.js` with direct CSS directives inside `globals.css`:
     `@import "tailwindcss";` and `@theme { ... }` token variables.
  2. **Color Palette & Dark Mode**:
     Tailwind v4 standardizes on OKLCH color spaces for theme palettes.
  3. **Accessibility**:
     Ensure minimum 4.5:1 contrast ratios (WCAG AA), accessible labels on inputs, and icon + color indicators (never color alone).

---

### 2.4 Zod (`3.24.2`)
- **Version Chosen**: Zod `^3.24.2`
- **Install Command**:
  ```bash
  npm install zod@3.24.2
  ```
- **Usage & Conventions**:
  - Enforce strict schema validation on all Route Handler request bodies and query parameters.
  - Parse LLM JSON responses with safe parsing (`safeParse`), dropping individual malformed findings rather than aborting the entire result.

---

### 2.5 Vitest (`5.0.5`)
- **Version Chosen**: Vitest `^5.0.5`
- **Install Command**:
  ```bash
  npm install -D vitest@5.0.5
  ```
- **Usage & Conventions**:
  - `vitest.config.ts` with `environment: "node"`.
  - Tests for pure logic (rules, TF-IDF retrieval, citation validation, workflow state transitions) run without a database connection.
  - DB integration tests (such as concurrent advisory-locked audit hashing) gate on `TEST_DATABASE_URL` and skip gracefully if not configured.

---

### 2.6 jose (`6.2.13`) & bcryptjs (`3.0.3`)
- **Version Chosen**: `jose@^6.2.13`, `bcryptjs@^3.0.3`
- **Install Command**:
  ```bash
  npm install jose@6.2.13 bcryptjs@3.0.3
  npm install -D @types/bcryptjs@3.0.3
  ```
- **Conventions**:
  - HS256 signed JWTs with 8-hour expiry.
  - Stored in `httpOnly`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"` cookie.
  - Runtime verification with `jwtVerify(token, secret)` using `new TextEncoder().encode(process.env.JWT_SECRET)`.

---

### 2.7 unpdf (`1.9.1`) & mammoth (`1.13.0`)
- **Version Chosen**: `unpdf@^1.9.1`, `mammoth@^1.13.0`
- **Install Command**:
  ```bash
  npm install unpdf@1.9.1 mammoth@1.13.0
  ```
- **Usage & Magic Byte Validation**:
  - PDF: verify magic bytes `%PDF-` (`0x25, 0x50, 0x44, 0x46`), parse using `getDocumentProxy` + `extractText(pdf, { mergePages: true })`. If empty, return friendly message: *"This looks like a scanned document; image/OCR support is planned for Round 3"*.
  - DOCX: verify zip magic bytes `PK` (`0x50, 0x4B`), parse using `mammoth.extractRawText({ buffer })`.
  - File upload ceiling: 5 MB limit.

---

### 2.8 diff (`9.0.0`)
- **Version Chosen**: `diff@^9.0.0`, `@types/diff@^8.0.0`
- **Install Command**:
  ```bash
  npm install diff@9.0.0
  npm install -D @types/diff
  ```
- **Usage**:
  - Generate word-level and line-level visual diffs between `originalText` and `currentText` for creator and reviewer inspection.

---

## 3. Conflict Analysis with AGENTS.md

| Topic | AGENTS.md Rule | Official Docs Status | Conflict? | Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| **Proxy File** | `proxy.ts` exporting `proxy` | Next.js 16 standard | No conflict | Followed |
| **Async Params** | `params` and `cookies()` awaited | Next.js 16 standard | No conflict | Followed |
| **Lint Script** | `eslint .` (no `next lint`) | Next.js 16 standard | No conflict | Followed |
| **Prisma Generator** | `provider = "prisma-client"` & custom output | Prisma 7 standard | No conflict | Followed |
| **Prisma Config** | Root `prisma.config.ts` | Prisma 7 standard | No conflict | Followed |
| **Driver Adapter** | `@prisma/adapter-pg` | Prisma 7 standard | No conflict | Followed |
| **Node Version** | Node 20.9+ | Environment has `v24.21.0` | No conflict | Verified |

**Conclusion**: All architectural rules and specifications in [AGENTS.md](file:///C:/Users/Asus/.gemini/antigravity/scratch/brandlens/AGENTS.md) are strictly aligned with current official documentation. No updates to [AGENTS.md](file:///C:/Users/Asus/.gemini/antigravity/scratch/brandlens/AGENTS.md) required.
