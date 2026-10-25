# BrandLens (Round 2 Hackathon Release)

> **Pre-publication brand-governance & compliance platform**  
> *Rules first. AI second. Humans in control. Sealed with cryptographic integrity.*

---

## 🚀 Live Demo & Links

- **Live Deployed App**: `<ADD DEPLOYED URL HERE>`
- **GitHub Repository**: `https://github.com/Utsav-83/BrandLens`
- **Team**: **SRUJANMMATTUR** (FutureStack Hackathon Round 2 of 3)

---

## 📖 What is BrandLens?

BrandLens is a pre-publication brand-governance platform for marketing, copy, and legal teams. Creators submit drafts (raw text, `.docx`, `.pdf`). The system verifies the content against the organisation’s own approved sources (brand voice guide, terminology glossary, approved facts, and claims register).

### Non-Negotiable Core Principles
1. **No source, no verdict**: An AI finding is surfaced **only** if its cited source quote appears verbatim (normalised) inside retrieved source passages. Otherwise, it is dropped. Unsubstantiated claims are reported strictly as `unsupported_claim` (capped at medium severity), never fabricated.
2. **Rules first, AI second**: Deterministic checks (glossary, banned absolutes, numerical fact comparisons, tone/slang, accessibility, reading ease) execute without an LLM. The AI judge evaluates nuanced tone and claim context only.
3. **The AI never publishes or overwrites**: Human creators accept, edit, or reject each proposed rewrite. Managers and reviewers approve or request revisions.
4. **Resilient zero-failure mode**: If no LLM key is configured or the LLM times out (20s timeout), BrandLens degrades gracefully to **rules-only mode** with a visible banner (`AI review unavailable, rules-only results`).
5. **Zero-guidance judging**: 1-click demo logins (`creator`, `manager`, `reviewer`, `admin`), pre-seeded "Aurora Pay" fintech workspace, and a **"Load sample flawed content"** button.
6. **Cryptographic tamper-evident audit ledger**: Every review event, human decision, edit, comment, and state change is sealed in a SHA-256 hash chain protected by transaction-level Postgres advisory locks.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph INGESTION["1. Content Ingestion"]
        A["Creator Input: Text / DOCX / PDF"] --> B["Magic-Byte & Parser\n(mammoth / unpdf)"]
    end

    subgraph ENGINE["2. Hybrid Review Engine"]
        B --> C["Deterministic Rules Engine\n(Glossary, Absolutes, Numbers, Tone, Readability, A11y)"]
        B --> D["Knowledge Base Retrieval\n(BM25 Okapi / TF-IDF Scoring)"]
        D --> E["Active Sources\n(Voice Guide, Facts, Claims, Glossary)"]
        D --> F["Expired Facts Pool\n(Outdated Claim Detector)"]
        
        C --> G["Rule Findings (Conf: 1.0)"]
        D --> H["AI Judge (LLM)\n(Gemini / OpenAI / Anthropic / Groq)"]
        H --> I["Citation & Math Validator\n(Normalised Quote & Number Matching)"]
        I --> J["Validated AI Findings"]
    end

    subgraph WORKFLOW["3. Human Decision & State Machine"]
        G & J --> K["Deduplication & Union"]
        K --> L["Submission Workspace\n(Inline Severity Highlights)"]
        L --> M["Creator: Accept / Edit / Reject"]
        M --> N["Submit for Review\n(Blocked if High Severity Pending)"]
        N --> O["Review Queue\n(Manager / Reviewer Signoff)"]
        O --> P["Approved & Sealed Copy"]
    end

    subgraph AUDIT["4. Cryptographic Security"]
        M & N & O & P --> Q["Transaction-Level Advisory Lock\n(pg_advisory_xact_lock)"]
        Q --> R["SHA-256 Hash Chain\n(Hash_n = SHA256(Hash_n-1 + Payload))"]
        R --> S["Audit Verification Badge\n(Green / Red Integrity Indicator)"]
    end
```

---

## ⚡ 2-Minute Judge Walkthrough

1. **Launch App**: Open the deployed link or `http://localhost:3000/login`.
2. **1-Click Login**: Click the large teal button **"Continue as Creator"** (`creator@aurora.test`).
3. **Load Sample Copy**: Click **"New Draft"** in the top navigation, then click the **"Load Sample Flawed Content"** button. This pre-fills:
   > *"Hey guys, our Smart-Pay app is the #1 fastest and 100% secure! Fees are just 0.5% and we settle in 5 minutes!!!"*
4. **Run Analysis**: Click **"Save & Run Analysis"**. Notice how the hybrid engine flags:
   - Glossary violation: `Smart-Pay` $\rightarrow$ `SmartPay`
   - Banned slang: `guys`
   - Forbidden absolutes: `#1`, `fastest`, `100% secure`
   - Numeric mismatch: `0.5%` (unsupported; approved fact is `1.8%`) and `5 minutes` (unsupported; approved fact is `2 business days`)
   - Excess exclamation marks (`!!!`)
5. **Human Governance**:
   - Click **"Accept Fix"** on the glossary finding. Notice how the draft text updates in real time and offsets shift cleanly!
   - Click **"Reject"** on a finding and enter a justification (e.g. *"Approved by legal council"*).
6. **Submit for Review**: Resolve remaining High findings, then click **"Submit for Review"**.
7. **Switch to Reviewer**: Click **Logout**, then click **"Continue as Reviewer"** (`reviewer@aurora.test`).
8. **Approve Publication**: Open **"Review Queue"**, click the draft, inspect the Full Diff tab, and click **"Approve Publication"**.
9. **Verify Audit Trail**: Go to **"Audit Trail"** (`/audit`) and click **"Verify Integrity"**. See the green cryptographic verification badge confirming that all SHA-256 records match without tampering!

---

## 👥 Demo Accounts (Pre-Seeded)

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Creator** | `creator@aurora.test` | `AuroraDemo2026!` | Create submissions, upload docs, accept/edit/reject fixes, submit for review |
| **Reviewer** | `reviewer@aurora.test` | `AuroraDemo2026!` | Access review queue, inspect diffs, comment, approve or request revisions |
| **Manager** | `manager@aurora.test` | `AuroraDemo2026!` | Review queue, approve/request changes, view audit trail, verify integrity |
| **Admin** | `admin@aurora.test` | `AuroraDemo2026!` | Full knowledge base write access, upload sources, audit trail verification |

*When `DEMO_MODE=true` is enabled, one-click demo login buttons are active on the `/login` screen.*

---

## 🛠️ Tech Stack & Real Versions

- **Framework**: Next.js 16.4.3 (App Router, Turbopack for development, webpack for production builds, dynamic routing)
- **Runtime**: Node 22 LTS or newer (unpdf requires Node >= 22; Prisma 7 requires ^20.19 || ^22.12 || >=24)
- **Language**: TypeScript 5.8.2
- **Database & ORM**: PostgreSQL with Prisma ORM 7.10.1 (`@prisma/adapter-pg` driver adapter, custom generated client)
- **UI & Styling**: Tailwind CSS v4, Lucide React icons, WCAG AA compliant contrast
- **Security & Auth**: `jose` 6.2.13 (HS256 JWT in HttpOnly cookies), `bcryptjs` 3.0.3, Same-Origin enforcement, Postgres Advisory Locks
- **Document Parsing**: `mammoth` 1.13.0 (DOCX), `unpdf` 1.9.1 (PDF with magic-byte `%PDF-` validation)
- **Diffing**: `diff` 9.0.0
- **Testing**: Vitest 3.2.7 (292 passed, 1 skipped across 20 test files, 21 suites; the skipped test is a live PostgreSQL concurrency check requiring a separate test DB)

---

## 📦 Local Setup Instructions

### 1. Clone & Install
```bash
git clone https://github.com/SRUJANMMATTUR/Brandlens.git
cd Brandlens
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains:
```ini
DATABASE_URL="postgresql://user:password@localhost:5432/brandlens?sslmode=disable"
DIRECT_URL="postgresql://user:password@localhost:5432/brandlens?sslmode=disable"
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/brandlens_test?sslmode=disable"
JWT_SECRET="super-secret-at-least-32-chars-long-brandlens-hackathon-2026"
DEMO_MODE="true"

# LLM Configuration (Set to "none" for resilient rules-only mode)
# When a provider is set, LLM_MODEL is required; falls back to rules-only mode if empty
LLM_PROVIDER="none"   # "gemini" | "openai" | "anthropic" | "groq" | "none"
LLM_MODEL=""          # Set to a model id from your chosen provider
LLM_API_KEY=""
```

### 3. Generate Prisma Client & Run Migrations
```bash
npx prisma generate && npx prisma migrate deploy
```

### 4. Seed Database
```bash
npm run db:seed
```
*Seeds the "Aurora Pay" workspace with brand voice guide, 10+ glossary terms, approved facts (with an expired fact), claims register, and demo accounts.*

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running Tests & Quality Checks

```bash
# Run complete test suite (292 passed, 1 skipped across 20 test files, 21 suites)
npm test

# Run integration tests against a live database (requires DIRECT_URL/TEST_DATABASE_URL)
npm run test:integration

# Run ESLint (Flat Config 9, zero warnings)
npm run lint

# Production build check
npm run build

# End-to-end smoke test against local or deployed server
npx tsx scripts/smoke-test.ts http://localhost:3000
```

---

## ☁️ Deployment Guide (Vercel + Neon)

### 1. Database Provisioning (Neon)
1. Create a project on [Neon](https://neon.tech).
2. Copy the **Pooled connection string** (contains `-pooler` in host) and assign to `DATABASE_URL`.
3. Copy the **Direct connection string** (non-pooled) and assign to `DIRECT_URL`.
4. Create a separate branch in Neon for testing and assign to `TEST_DATABASE_URL`.

### 2. Apply Migrations & Seed
The repository includes the baseline migration in `prisma/migrations/0_init`. Run from your local environment against `DIRECT_URL` (or using `npx prisma migrate deploy` which reads `DIRECT_URL` directly from `.env`):
```bash
npx prisma migrate deploy
npm run db:seed
```

### 3. Deploy on Vercel
1. Import the repository into Vercel.
2. In **Project Settings $\rightarrow$ Build & Development Settings**:
   - Framework Preset: **Next.js**
   - Build Command: `prisma generate && next build`
   - Node.js Version: **22.x only**
3. In **Environment Variables**, add:
   - `DATABASE_URL`: *(Neon pooled connection string)*
   - `DIRECT_URL`: *(Neon direct connection string)*
   - `JWT_SECRET`: *(32+ character random secret)*
   - `DEMO_MODE`: `true`
   - `LLM_PROVIDER`: `gemini` (or `openai`, `anthropic`, `groq`, `none`)
   - `LLM_MODEL`: *(Set to a model id from your provider; required if LLM_PROVIDER != none, falls back to rules-only if empty)*
   - `LLM_API_KEY`: *(Your private API key; never committed to Git)*
4. Click **Deploy**. Vercel will build and deploy the application.

### 4. Safe Migrations, Redeployment & Rollback
- **Redeploy**: Push to `main` branch or trigger a redeploy from Vercel dashboard.
- **Database Migrations**: The baseline migration is located at `prisma/migrations/0_init`. Always deploy migrations with `npx prisma migrate deploy` (or `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy`) against the direct connection before triggering application code deployment.
- **Instant Rollback**: Use Vercel's **Instant Rollback** button to restore previous deployment. Use Neon point-in-time restore or branch restore if a database rollback is required.

---

## 📋 Feature Checklist: Done vs Round 3 Plan

| Feature Area | Round 2 (Current Status) | Planned for Round 3 |
| :--- | :--- | :--- |
| **Deterministic Rules** | ✅ 6 comprehensive rules (Glossary, Absolutes, Numbers, Tone, Flesch, Alt text) | 🚀 Custom workspace rule builder with regex test sandbox |
| **Knowledge Retrieval** | ✅ In-memory Robertson BM25 scoring over active chunks + expired fact detection | 🚀 Hybrid dense semantic vectors (`pgvector`) + BM25 reciprocal rank fusion |
| **AI Judge & Validation** | ✅ Multi-query retrieval, injection defense `<draft>`, verbatim quote validation | 🚀 Fine-tuned domain judge model + multi-turn conversational rewrite mode |
| **Document Ingestion** | ✅ `.docx`, `.pdf`, `.txt`, `.md` with magic-byte validation (5 MB limit) | 🚀 Vision OCR for scanned PDFs, banner ads, and Figma image layers |
| **Workflow & Decisions** | ✅ Idempotent accept/edit/reject, downstream offset shifting, approval lock | 🚀 Multi-stage approval matrix (Legal, Brand, Compliance) |
| **Tamper-Evident Audit** | ✅ Advisory locked SHA-256 hash chain with instant integrity verification | 🚀 Merkle tree anchoring to public blockchain or RFC 3161 timestamping |
| **Accessibility (a11y)** | ✅ WCAG AA contrast (4.5:1), keyboard accessible, icons paired with color | 🚀 Automated contrast and font legibility audit on uploaded imagery |

---

## ⚠️ Known Limitations & Future Work

1. **Scanned / Image-Only PDFs**: PDF text extraction relies on embedded text streams via `unpdf`. Scanned document OCR is scheduled for Round 3.
2. **In-Memory BM25 Indexing**: Currently constructs the BM25 index over active chunks at request time. This is blazingly fast for workspaces up to 10,000 chunks, but will transition to database-persisted inverted indices in Round 3.
3. **Single Active Workspace**: Demo environment is pre-configured for "Aurora Pay". Multi-tenant workspace switching will be exposed in Round 3.

---

## 🔒 Security Summary

### Security Model
- **Server-Side Authorization**: `requireRole` is enforced on every protected Route Handler and Server Component (creators submit/edit, reviewers/managers sign off and read audit records, admins manage knowledge sources).
- **Audit Privacy**: Audit pages and APIs are limited to managers, reviewers, and admins; event payloads are omitted from the audit views so draft excerpts and comment text are not exposed there.
- **Ownership Enforcement**: Creators can view and edit their own submissions; admins can view and edit any submission in their workspace. Managers and reviewers can view submissions in review-related states. `assertCanViewSubmission` and `assertCanEditSubmission` enforce workspace and role boundaries, returning HTTP 404 for inaccessible submissions.
- **Separation of Duties**: `assertCanReview` in `src/lib/guards.ts` strictly forbids users (including admins) from approving or requesting changes on submissions they created (returning HTTP 403), and requires the submission to be in `in_review` status.
- **CSRF & Origin Verification**: `assertSameOrigin` validates request origins against the host on all mutating requests (`POST`, `PUT`, `PATCH`).
- **Content Security Policy & HSTS**: Strict CSP headers (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, with `'unsafe-eval'` excluded in production builds). Strict-Transport-Security (`max-age=63072000; includeSubDomains`) is enforced in production.
- **Database-Backed Rate Limiting**: Sliding window rate limits stored in PostgreSQL (`RateLimit` table) protect critical endpoints:
  - Analyses (`POST /api/submissions/:id/analyse`): 10 per 10 minutes per user
  - Standard Login (`POST /api/auth/login`): 10 attempts per 10 minutes per IP and email
  - Demo Login (`POST /api/auth/demo/:role`): 30 attempts per 10 minutes per IP to accommodate shared event networks
  - Document Uploads (`/api/submissions/upload` & `/api/sources/upload`): 20 uploads per 10 minutes per user
- **Secure Cookie Sessions**: Session tokens are signed via `jose` HS256 JWT in `httpOnly`, `sameSite=lax` cookies (`secure: true` in production).
- **Content Privacy & Sanitisation**: Input validated via Zod (including UUID route params via `idParamSchema`); document drafts are evaluated at Temperature 0; draft text, request bodies, and API keys are never written to logs.
