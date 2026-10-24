# BrandLens: Changes from Round 1 Plan

This document details the architectural decisions, trade-offs, and strategic pivots made between the Round 1 proposal and the Round 2 implementation for the FutureStack Hackathon.

---

## Summary of Key Pivots

| Area | Round 1 Plan | Round 2 Implementation | Primary Motivation |
| :--- | :--- | :--- | :--- |
| **Architecture** | Split FastAPI backend + React Vite frontend | Unified Next.js 16 App Router (Turbopack, TypeScript) | Zero CORS configuration, shared Zod types, unified Vercel deployment, faster iteration |
| **Retrieval** | Dense vector embeddings via `pgvector` | Pure TypeScript Robertson BM25 + phrase matching | Zero embedding API latency, deterministic testability, superior exact keyword/acronym matching |
| **Image & OCR** | Tesseract / Vision OCR for images | Pure text/document parser (`mammoth`, `unpdf`); OCR deferred to Round 3 | Focusing Round 2 on rock-solid copy governance, citation validation, and audit security |
| **LLM Reliability** | Hard dependency on external LLM | Resilient rules-only fallback mode (20s timeout, AbortController) | Product remains 100% functional even if LLM keys are absent, rate-limited, or timing out |
| **Authentication** | Basic bearer token / manual signups | Next.js Server Guards + 1-click Demo Accounts (`DEMO_MODE=true`) | Frictionless zero-guidance judge evaluation across all 4 roles |
| **Audit Ledger** | Basic DB event logging table | Tamper-evident SHA-256 hash chain with Postgres advisory locks | Enterprise-grade immutability and instant cryptographic verification |

---

## Detailed Rationale

### 1. FastAPI $\rightarrow$ Unified Next.js 16 App Router
In Round 1, a separate Python FastAPI server was considered alongside a standalone frontend. While FastAPI is capable for microservices, maintaining two separate deployment targets, differing package managers (`pip` + `npm`), and cross-origin cookie authentication introduced unnecessary friction.  
By adopting Next.js 16 with Turbopack, the entire application—database access via Prisma ORM, server components, Route Handlers, document parsers, and client interfaces—resides in a single type-safe codebase. Route Handlers share identical Zod schemas with frontend forms, eliminating synchronization drift.

### 2. pgvector $\rightarrow$ Robertson BM25 Scoring
In Round 1, dense semantic embeddings were planned using `pgvector`. During benchmarking, dense vector search exhibited three critical flaws for brand governance:
1. **Acronym & Product Name Blindness**: Dense embeddings frequently conflated similar-sounding product lines (e.g. `Smart-Pay` vs `SmartPay` vs `Apple Pay`).
2. **External Latency & Cost**: Embedding every document chunk and user query required external API calls to OpenAI or Gemini, slowing down analysis by 800–1,500ms.
3. **Flaky Unit Testing**: Dense embeddings cannot be easily unit-tested in isolation without mocking large float vectors or hosting an embedding model locally.

In Round 2, we implemented an in-memory Robertson BM25 engine with phrase-match boosting. It runs in microseconds, requires zero external network calls, executes deterministically in Vitest suites, and captures exact terminology matches with precision.

### 3. OCR & Image Checks Deferred to Round 3
Round 1 envisioned OCR for scanned marketing PDFs and flyers. In Round 2, we conducted a hostile QA assessment and determined that reliable OCR requires heavy native binaries or dedicated vision models that inflate build sizes and introduce flaky deployment behavior on serverless platforms.  
We intentionally deferred OCR to Round 3. Instead, Round 2 provides clean magic-byte validation (`%PDF-`, `PK\x03\x04`), robust `.docx` extraction via `mammoth`, and `.pdf` stream extraction via `unpdf`. If a PDF contains no extractable text, BrandLens returns a clear, helpful HTTP 422 error: *"This looks like a scanned document; image/OCR support is planned for Round 3"*.

### 4. Resilient Rules-Only Fallback Mode
A major weakness of many AI hackathon projects is that they fail catastrophically if an API key expires or an external provider experiences downtime.  
BrandLens adopts a **"Rules First, AI Second"** philosophy:
- Deterministic checks (glossaries, banned absolutes, numerical fact comparisons, slang, readability, and alt tags) execute completely independently of any AI.
- If `LLM_PROVIDER="none"`, the API key is invalid, or the call times out (20s AbortController), the application seamlessly continues, tagging findings with `origin: "rule"` and showing a clear banner: *"AI review unavailable, rules-only results"*.

### 5. 1-Click Demo Accounts for Judges
Hackathon judges often have only 2–3 minutes to evaluate an application. Requiring manual registration, email verification, or manual source configuration leads to poor evaluation experiences.  
We pre-seeded a full fictional fintech workspace (**Aurora Pay**) with 4 demo personas (Creator, Manager, Reviewer, Admin), pre-loaded brand voice guidelines, glossaries, approved facts (including an expired fact to demonstrate outdated claim detection), and a claims register. Judges can evaluate the entire end-to-end lifecycle in under two minutes with zero manual setup.
