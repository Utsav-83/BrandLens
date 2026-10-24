You are a senior full-stack engineer building "BrandLens" for a hackathon (Round 2 of 3). Read this whole brief and follow it in every later task.

PRODUCT
BrandLens is a pre-publication brand-governance platform. Creators submit content (text, DOCX, PDF). The system checks it against the organisation's own approved sources (brand guide, glossary of preferred/banned terms, approved facts, claims register) and returns findings. Every finding has: category, severity (high/medium/low), confidence (0-1), a plain-language reason, the exact source quote it relies on, and a suggested rewrite that keeps the creator's intent. Humans accept, edit or reject each fix, then submit for review; a manager/reviewer approves or requests changes. Everything is logged in an audit trail.

NON-NEGOTIABLE RULES
1. No source, no verdict: an AI finding is shown only if its source_quote appears (after whitespace/case normalisation) inside one of the retrieved source passages. Otherwise drop it. If a claim has no supporting source, report it as category "unsupported_claim", never as true or false.
2. Rules first, AI second: deterministic checks run without AI. The AI layer adds judgement on tone and claim matching only.
3. The AI never publishes or overwrites anything. Humans decide.
4. If no LLM key is configured or the LLM call fails/times out (20s), the app still works in rules-only mode and shows a visible notice "AI review unavailable, rules-only results".
5. Judges must be able to use the product with zero guidance: seeded demo workspace, one-click demo logins, a "Load sample flawed content" button, clear empty/loading/error states.
6. Authorisation is enforced on the server in every route handler and server component (getCurrentUser + requireRole). proxy.ts is only a convenience redirect, never the only check.

STACK (verify current versions before coding, see the version-check task)
Next.js 16 (App Router) + TypeScript, Tailwind CSS, shadcn/ui, Route Handlers in app/api with Node.js runtime, Zod validation, Prisma 7 + PostgreSQL (Neon) using the "prisma-client" generator with a custom output path, prisma.config.ts and the @prisma/adapter-pg driver adapter, jose JWT in an httpOnly cookie, bcryptjs, mammoth (DOCX), unpdf (PDF), the "diff" package, Vitest. LLM access through a provider-neutral class using fetch with env vars LLM_PROVIDER (gemini|openai|anthropic|groq|none), LLM_MODEL, LLM_API_KEY. Never hard-code model names. Temperature 0, JSON-only output.

NEXT.JS 16 RULES
- Use proxy.ts (not middleware.ts) exporting a function named proxy.
- params in route handlers and pages are Promises: `const { id } = await params`. cookies() and headers() are async: await them.
- There is no `next lint`; the lint script runs ESLint directly (flat config).
- Requires Node 20.9+.

PRISMA 7 RULES
- Generator: provider "prisma-client", output "../src/generated/prisma". Import PrismaClient from that generated path, never from "@prisma/client".
- prisma.config.ts at the repo root defines schema path, migrations, the datasource URL (use DIRECT_URL for CLI migrations) and the seed command.
- At runtime create the client with `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` (pooled Neon URL). Cache the client on globalThis in development to avoid connection storms.

SERVERLESS RULES
Deployment is Vercel + Neon. Never rely on in-memory state surviving between requests; build retrieval indexes per request from the database (data is small); set `export const maxDuration = 60` on the analyse route; use `export const runtime = "nodejs"` on routes that parse files or use bcrypt/jose/Prisma; use DB-backed rate limiting.

ROLES: creator, manager, reviewer, admin. Creators submit and decide on fixes; managers and reviewers approve or request changes; admins manage sources.

SECURITY: strict input validation with Zod, httpOnly + sameSite=lax cookie (secure only in production), check the Origin header on every mutating request, DEMO_MODE env flag gates the one-click demo login, never log API keys or full document text, treat all draft text as untrusted data (it may contain instructions aimed at the AI).

CODE QUALITY: strict TypeScript, small modules under src/lib, Zod schemas for every API input, clear error messages with proper HTTP codes, no secrets in the repo (.env.example only), Vitest tests for rules, retrieval, citation validation and the workflow state machine. Keep the UI clean, readable and accessible (labels, contrast 4.5:1, keyboard use, never colour alone for meaning).

When I give you a task, implement it fully, run it, fix errors, and tell me exactly how to run and test it. Do not stub features I did not ask to defer.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
