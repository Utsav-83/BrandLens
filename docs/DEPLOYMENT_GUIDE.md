# BrandLens: Production Deployment Guide (Vercel + Neon)

This guide provides step-by-step instructions for deploying BrandLens to **Vercel** with a serverless **Neon PostgreSQL** database.

---

## 1. Database Provisioning on Neon

BrandLens requires two PostgreSQL connection strings due to Prisma ORM 7's serverless architecture and migration engine:
1. **`DATABASE_URL` (Pooled Connection)**: Used by Next.js serverless functions to connect via PgBouncer / Neon connection pooler. Prevents connection exhaustion during traffic spikes.
2. **`DIRECT_URL` (Direct Connection)**: Non-pooled connection string used exclusively by Prisma Migrate (which relies on advisory locks and prepared transactions that poolers disallow).

### Step-by-Step Neon Setup:
1. Log in to [Neon](https://console.neon.tech/) and click **"Create Project"**.
2. Name the project `brandlens-prod` and select your target region (e.g. `US East (Ohio)` or `Frankfurt`).
3. Under **Connection Details** on the Neon Dashboard:
   - Toggle **"Connection pooling"** to **ON**.
   - Copy the connection string. This is your `DATABASE_URL`:
     ```ini
     DATABASE_URL="postgresql://user:password@ep-brandlens-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
     ```
   - Toggle **"Connection pooling"** to **OFF**.
   - Copy the direct connection string. This is your `DIRECT_URL`:
     ```ini
     DIRECT_URL="postgresql://user:password@ep-brandlens.us-east-2.aws.neon.tech/neondb?sslmode=require"
     ```
4. **Create a Test Branch**:
   - In Neon, navigate to **Branches** $\rightarrow$ **New Branch**. Name it `test-suite`.
   - Copy its direct connection string and save it for `TEST_DATABASE_URL`.

---

## 2. Execute Migrations & Database Seeding (From Local Machine)

> [!IMPORTANT]
> Never run `prisma migrate deploy` or `prisma migrate dev` inside the Vercel build script. Migrations must be run once from your local deployment terminal against the **`DIRECT_URL`** before deploying the application code.

### Run Migrations Against Neon Direct Connection:
```bash
# Set your Neon direct URL for the migration run
export DIRECT_URL="postgresql://user:password@ep-brandlens.us-east-2.aws.neon.tech/neondb?sslmode=require"
export DATABASE_URL="$DIRECT_URL"

# Deploy existing Prisma migrations to Neon
npx prisma migrate deploy
```

### Seed Default Brand Workspace & Demo Users:
```bash
# Run the idempotent seed script
npx tsx prisma/seed.ts
```
This populates:
- Workspace: **Aurora Pay**
- Demo Accounts: `creator@aurora.test`, `manager@aurora.test`, `reviewer@aurora.test`, `admin@aurora.test` (Password: `AuroraDemo2026!`)
- Knowledge Base Sources: Brand Voice Guide, 10+ Glossary lines, Approved Facts (with one deliberate expired fact), Claims Register.
- Chunks for BM25 retrieval.

---

## 3. Configure Project Settings on Vercel

1. Log in to [Vercel](https://vercel.com/) and click **"Add New" $\rightarrow$ "Project"**.
2. Import the `Brandlens` GitHub repository.
3. In **Build and Output Settings**:
   - Framework Preset: **Next.js**
   - Build Command: `prisma generate && next build`
   - Output Directory: `.next`
   - Install Command: `npm install`
4. In **Project Settings $\rightarrow$ General**:
   - Node.js Version: Select **20.x or 22.x** (BrandLens requires Node 20.9+).

---

## 4. Environment Variables on Vercel

Under **Project Settings $\rightarrow$ Environment Variables**, configure the following variables for **Production** and **Preview**:

| Variable Name | Value Description | Example / Note |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon **Pooled** connection string | `postgresql://user:pwd@ep-xxx-pooler.aws.neon.tech/neondb?sslmode=require` |
| `DIRECT_URL` | Neon **Direct** connection string | `postgresql://user:pwd@ep-xxx.aws.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | 32+ character random secret | `generate-with: openssl rand -base64 32` |
| `DEMO_MODE` | `"true"` | Enables 1-click login buttons on `/login` |
| `LLM_PROVIDER` | `"gemini"` (or `"openai"`, `"anthropic"`, `"none"`) | `"gemini"` recommended for hackathon judging |
| `LLM_MODEL` | `"gemini-2.5-flash"` | Or `"gpt-4o-mini"`, `"claude-3-5-haiku-20241022"` |
| `LLM_API_KEY` | Your private LLM API key | Kept strictly in Vercel, never committed to git |

---

## 5. Function Duration & Limits Verification

BrandLens sets `export const maxDuration = 60;` on the analysis route ([`src/app/api/submissions/[id]/analyse/route.ts`](file:///C:/Users/Asus/.gemini/antigravity/scratch/brandlens/src/app/api/submissions/[id]/analyse/route.ts)):
- **Vercel Hobby Plan**: Maximum function duration limit is **300 seconds** (Fluid Compute defaults to 300s). `60` seconds is well within the 300s ceiling.
- **Vercel Pro Plan**: Maximum function duration limit is **300 seconds** (configurable up to 900s).
- **Internal Safety**: The review engine uses an internal `AbortController` timeout of **20 seconds** for the LLM call, ensuring that even if external APIs hang, the function returns in rules-only mode long before the 60-second limit.

---

## 6. How to Redeploy, Migrate & Roll Back

### How to Redeploy:
Pushing to the `main` branch triggers an automatic production build and deployment. Alternatively, in the Vercel dashboard:
- Navigate to **Deployments** $\rightarrow$ Click **"..."** on the latest deployment $\rightarrow$ Select **"Redeploy"**.

### How to Safely Run a Schema Migration:
1. Create and test the migration locally:
   ```bash
   npx prisma migrate dev --name add_new_field
   ```
2. Commit the new migration folder inside `prisma/migrations/`.
3. Apply the migration to production database from your terminal:
   ```bash
   DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
   ```
4. Push your code to GitHub. Vercel will build the application with the updated schema.

### How to Roll Back:
1. **Frontend / Application Code Rollback**:
   - Go to the Vercel Project Dashboard $\rightarrow$ **Deployments**.
   - Find the previous working deployment.
   - Click the three dots **(...)** $\rightarrow$ **"Instant Rollback"**. Vercel will instantly route 100% of traffic to that deployment within seconds.
2. **Database Rollback (Neon Point-in-Time Restore)**:
   - In the Neon Console, go to **Branches** $\rightarrow$ Select your production branch.
   - Under **Time Travel / Restore**, choose a point-in-time timestamp prior to the failed migration.
   - Click **"Restore Branch"** to restore database state.

---

## 7. Running the Automated Smoke Test Against Production

Once the deployment completes on Vercel, execute the automated end-to-end smoke test against the live URL:

```bash
npx tsx scripts/smoke-test.ts https://your-brandlens-app.vercel.app
```

The script will automatically execute:
1. Homepage routing health check
2. Demo login as Creator
3. Ingest marketing copy
4. Execute analysis
5. Accept a proposed correction
6. Submit draft for review
7. Demo login as Reviewer
8. Approve publication
9. Demo login as Admin
10. Verify cryptographic SHA-256 audit chain integrity

All 10 steps will output `PASS` with execution latency in milliseconds.
