# BrandLens: Pre-Publication Brand Governance Platform
## FutureStack Hackathon — Round 2 Project Presentation
**Team**: `SRUJANMMATTUR` | **Product**: BrandLens | **Track**: Enterprise Governance & Reliable AI

---

# SLIDE 1: Product Overview & Judge Quick-Start

### The Problem
Marketing and copy teams publish collateral at high velocity. Today's review workflows suffer from two extremes: slow manual legal/brand reviews or hallucination-prone AI tools that invent claims and violate corporate terminology.

### The Solution: BrandLens
BrandLens is a pre-publication brand-governance platform. Creators submit drafts (text, `.docx`, `.pdf`). The system verifies copy against the organisation's approved brand voice guide, terminology glossary, approved facts, and claims register.

```
       [Rules First]                  [AI Second]               [Humans in Control]
Deterministic Checks (1.0 conf)  +  Tone & Semantic Claims  +  Accept / Edit / Reject
(Glossary, Absolutes, Numbers)      (Validated Citations)       (Advisory-Locked Audit)
```

### Links & Access
- **Working Project Link**: Pending a verified deployment. Do not submit the earlier Railway URL as live.
- **GitHub Repository**: `https://github.com/Utsav-83/BrandLens`
- **Demo Workspace**: "Aurora Pay" (Fictional Fintech Brand)

### Pre-Seeded 1-Click Demo Accounts (Password: `AuroraDemo2026!`)
- **Creator**: `creator@aurora.test` — Submit copy, upload docs, accept/edit/reject fixes
- **Reviewer**: `reviewer@aurora.test` — Review queue, inspect word diffs, sign-off / request revisions
- **Manager**: `manager@aurora.test` — Multi-role governance, review queue, inspect audit logs
- **Admin**: `admin@aurora.test` — Knowledge base authoring, document ingestion, verify cryptographic chain

### 5-Step Judge Walkthrough (2 Minutes)
1. **1-Click Login**: Go to `/login` and click **"Continue as Creator"**.
2. **Load Flawed Sample**: Click **"New Draft"**, then click **"Load Sample Flawed Content"** (loads copy with glossary, absolute, numeric, tone, and slang violations).
3. **Analyse**: Click **"Save & Run Analysis"** to see inline severity highlights and cited quotes.
4. **Decide & Submit**: Click **"Accept Fix"** on the glossary item (offsets shift cleanly); reject another with a reason; click **"Submit for Review"**.
5. **Approve & Audit**: Log in as **Reviewer**, open the **Review Queue**, click **"Approve Publication"**, then navigate to `/audit` and click **"Verify Integrity"** (Green verified badge).

---

# SLIDE 2: Completed Features Checklist (Mapped to Round 1 Plan)

| Capability | Round 1 Proposal | Round 2 Implementation Status | Details / Real Code Location |
| :--- | :--- | :--- | :--- |
| **Deterministic Rule Engine** | Planned | ✅ **DONE** | 6 rules: Glossary `AVOID -> USE`, Absolute claims, Numeric fact check, Slang/Tone/Exclamations, Flesch Reading Ease, Alt-text (`src/lib/review/rules.ts`) |
| **Knowledge Base & Versioning** | Planned | ✅ **DONE** | Active/archived sources, version history immutability, chunking, expired fact tracking (`src/lib/retrieval/chunk.ts`, `src/app/sources/`) |
| **Document Ingestion** | Planned | ✅ **DONE** | Magic-byte validated `.docx` (mammoth), `.pdf` (unpdf), `.txt`, `.md` with 5 MB limit & scanned PDF 422 detection (`src/lib/parse/index.ts`) |
| **Knowledge Retrieval** | Vector DB | ✅ **DONE** *(Pivot)* | Pure TypeScript Robertson BM25 scoring with phrase boosting over active chunks; zero external embedding latency (`src/lib/retrieval/index.ts`) |
| **AI Judge & Citation Validator** | Generative AI | ✅ **DONE** | Provider-neutral LLM client with strict citation matching: dropped if quote does not appear verbatim in passages; numbers verified (`src/lib/review/validate.ts`) |
| **Workflow State Machine** | Planned | ✅ **DONE** | Server-enforced: `draft -> analysed -> in_review -> approved / changes_requested`; high-severity gate (`src/lib/workflow.ts`) |
| **Cryptographic Audit Trail** | Basic logs | ✅ **DONE** *(Enhanced)* | Continuous SHA-256 hash chain sealed with Postgres transaction-level advisory locks (`SELECT pg_advisory_xact_lock()`) (`src/lib/audit.ts`) |
| **Zero-Failure Fallback** | Optional | ✅ **DONE** | 20s timeout; runs in rules-only mode if LLM is unavailable or key is absent; visible user banner (`src/components/RulesOnlyBanner.tsx`) |
| **Visual & Vision OCR Engine** | Image check | ⏳ **DEFERRED** | Deferred to Round 3 to prioritize rock-solid copy governance, citation defense, and cryptographic audit security. |

---

# SLIDE 3: Architecture & Review Pipeline

```
[Draft Copy / DOCX / PDF]
           │
           ▼
[Magic-Byte Header Validation] ──(Invalid)──► [HTTP 400/422 Friendly Error]
           │
           ▼
[Sentence Splitter & Normaliser]
     │                           │
     ▼                           ▼
[Rules Engine]          [BM25 Knowledge Retrieval]
• Glossary              • Query per sentence against active chunks
• Banned Absolutes      • Robertson BM25 + phrase boost
• Numeric Extractor     • Deduplicated top 12 passages [P1...P12]
• Slang & Tone          • Outdated claims match against expired facts
• Readability / A11y             │
     │                           ▼
     │                  [AI Judge (Gemini / OpenAI / Anthropic)]
     │                  Prompt Delimiters: <draft> & <passages>
     │                  Temperature: 0, Output: JSON only
     │                           │
     │                           ▼
     │                  [Citation & Hallucination Validator]
     │                  • snippet ∈ draft (normalised)?
     │                  • sourceQuote ∈ cited passage? (else drop)
     │                  • new numbers in rewrite ∈ passages? (else drop fix)
     │                  • confidence < 0.5 ──► "Needs human review"
     │                           │
     └───────────┬───────────────┘
                 │
                 ▼
     [Merge & Deduplication] (Rules override AI on overlaps)
                 │
                 ▼
     [Interactive Workspace] ──► [Creator Accept/Edit/Reject]
                 │
                 ▼
     [Advisory Lock & SHA-256 Hash Chain] (Tamper-evident audit ledger)
```

### Real Implementation Stack
- **Framework**: Next.js 16.4.3 (App Router, Turbopack, Dynamic Server Components)
- **Runtime**: Node.js v24.21.0 (verified 20.9+ requirement)
- **Database & ORM**: PostgreSQL with Prisma ORM 7.10.1 (`@prisma/adapter-pg` driver adapter, custom generated client)
- **Authentication**: `jose` 6.2.13 (HS256 JWT in HttpOnly cookies), `bcryptjs` 3.0.3, Same-Origin CSRF validation
- **Parsing & Diffing**: `mammoth` 1.13.0 (DOCX), `unpdf` 1.9.1 (PDF magic-bytes), `diff` 9.0.0 (word-level diff)
- **UI & Styling**: Tailwind CSS 4.0.9, Lucide React icons, WCAG AA 4.5:1 contrast
- **Test Suite**: Vitest 3.2.7 — **290 tests passed, 1 skipped** in the latest local run; production build and hosted smoke test still need verification.

### 6 Core Reliability & Enterprise Safety Measures
1. **Zero-Crash Fallback Mode**: If `LLM_API_KEY` is missing, invalid, or times out (20s `AbortController`), BrandLens never throws 500. It degrades smoothly to rules-only mode with a visible amber banner (`AI review unavailable, rules-only results`).
2. **Strict Citation Validation ("No source, no verdict")**: AI findings are dropped if `sourceQuote` is not found verbatim in retrieved passages. Fabricated numbers in suggested fixes are stripped. Unsubstantiated claims are categorized as `unsupported_claim` capped at medium severity.
3. **Race-Safe Cryptographic Audit Chain**: Every review event, human decision, and status change is sealed with SHA-256 ($\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \dots)$) under a transaction-level PostgreSQL advisory lock (`SELECT pg_advisory_xact_lock(hashtext($workspaceId))`).
4. **Idempotent Human Decisions**: Finding acceptance runs in a database transaction (`db.$transaction`). Duplicate clicks return 200 without double-editing copy, and downstream offsets shift automatically by `delta`.
5. **Database-Backed Rate Limiting**: Sliding window limits stored in the `RateLimit` table protect analysis (10 per user per 10 mins), standard login (10 per IP and email per 10 mins), demo login (30 per IP per 10 mins for shared event networks), and uploads (20 per user per 10 mins).
6. **Separation of Duties Enforcement**: Creators are strictly forbidden from approving their own drafts on the server (`validateApproval`), and change requests require mandatory non-empty explanatory feedback (`validateRequestChanges`).

---

# SLIDE 4: Architectural Decisions & Why We Pivoted

### 1. Split FastAPI/React $\rightarrow$ Unified Next.js 16 App Router
- **Why**: Eliminates CORS latency and cross-origin cookie complications. Unifies data access, API endpoints, and server components into a single type-safe repository with shared Zod validation schemas.

### 2. Dense Vector Embeddings (`pgvector`) $\rightarrow$ Robertson BM25 Scoring
- **Why**: Dense embeddings regularly blurred distinctions between similar product acronyms (e.g. `Smart-Pay` vs `SmartPay`). Dense vector search also added 800–1,500ms of external embedding API overhead. Pure TypeScript BM25 runs in microseconds, executes deterministically in Vitest without external mocks, and excels at exact terminology matching.

### 3. Hard LLM Dependency $\rightarrow$ Resilient Rules-Only Fallback Mode
- **Why**: In enterprise environments, external AI providers face rate limits, network timeouts, or configuration lapses. BrandLens guarantees that copy governance never halts: deterministic brand rules always run, and the UI displays a clear banner (`AI review unavailable, rules-only results`).

### 4. Basic Event Log Table $\rightarrow$ Advisory-Locked Cryptographic Hash Chain
- **Why**: Regulatory compliance requires proving that records were not altered post-hoc. By hashing each entry with the previous entry's hash ($\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \dots)$) under a transaction-level Postgres advisory lock (`pg_advisory_xact_lock`), BrandLens prevents race conditions and makes tampering immediately detectable.

---

# SLIDE 5: Round 3 Roadmap & Improvements

### Improvement 1: Visual & Accessibility Review Engine
- **Problem**: Marketing copy is frequently delivered as rendered image ads, social banners, or Figma exports where text contrast, font size, and logo usage escape text-only review.
- **Design & Approach**: Introduce vision pipelines with WebAssembly Tesseract OCR and canvas-based color palette extractors. Automatically calculate WCAG AA contrast ratios (4.5:1 text, 3:1 graphical elements) on uploaded banner images.
- **Success Metric**: 100% automated detection of contrast violations and unapproved logo color variations on PNG/JPG/SVG creative assets.

### Improvement 2: Governance Insights & Conflict Detection Dashboard
- **Problem**: Over time, enterprise brand guidelines accumulate contradictions (e.g. an updated brand guide conflicting with an older, unarchived fact sheet).
- **Design & Approach**: Implement an automated source analysis worker that runs cross-source contradiction checks. Provide brand managers with an aggregated insights dashboard highlighting recurring team errors and stale fact expiration warnings.
- **Success Metric**: Proactive alert generation for 100% of mutually contradictory statements across active knowledge base sources.

### Improvement 3: Evaluation Suite & Local Open-Model Inference
- **Problem**: Enterprises in regulated sectors (healthcare, finance) often restrict transmitting confidential copy to external cloud APIs.
- **Design & Approach**: Expand golden test fixtures to 50+ labelled edge cases with automated in-app precision/recall benchmarks. Add native support for local open-weights inference (Llama 3 / Mistral via local Ollama or vLLM container) alongside cloud providers.
- **Success Metric**: $\ge 95\%$ precision on hallucination detection, with zero outbound cloud network calls when operating in private local mode.

---

# SLIDE 6: Progress Summary & Honest Limitations

### Before vs After: Round 1 Plan vs Round 2 Implementation

| Dimension | Round 1 Plan | Round 2 Actual Delivered State |
| :--- | :--- | :--- |
| **Architecture** | FastAPI + Vite frontend | Next.js 16 App Router (Turbopack, TypeScript, Server Components) |
| **Deterministic Rules** | Conceptual idea | 6 production-grade pure rules with 100% offset accuracy |
| **Hallucination Defense** | Prompt engineering only | Multi-step citation validator: drops unverified quotes & fabricated numbers |
| **Audit Ledger** | Standard timestamped DB rows | SHA-256 hash chain with advisory lock and instant UI verification badge |
| **Test Coverage** | 0 tests | **290 passing, 1 skipped in latest local suite; live Postgres concurrency test requires a test database** |
| **Judge Usability** | Manual registration & setup | 1-click demo logins for 4 personas, pre-seeded Aurora Pay workspace |
| **Deployment** | Not deployed | Vercel + Neon deployment path documented with an automated smoke test script; production deployment not yet verified |

### Honest Limitations & Current Scope
1. **Scanned PDF Documents**: PDF parsing handles digital text streams via `unpdf`. Image-only scanned PDFs trigger a clear HTTP 422 warning; OCR extraction is planned for Round 3.
2. **In-Memory BM25 Indexing**: Current BM25 index is generated in-memory over active chunks at request time. This is instantaneous for typical corporate guides (up to 10,000 chunks), but will move to persistent inverted indices in Round 3.
3. **Single Active Workspace**: The demo is pre-seeded with the "Aurora Pay" fintech brand. Multi-tenant workspace switching will be exposed in Round 3.
