import { db } from "./db";
import { hashPassword } from "./auth";
import { chunkSourceContent } from "./retrieval/chunk";
import { Role, SourceType, SourceStatus } from "@/generated/prisma";

export const DEMO_PASSWORD = "AuroraDemo2026!";

export const DEMO_USERS = [
  {
    email: "creator@aurora.test",
    name: "Cora Creator",
    role: "creator" as Role,
  },
  {
    email: "manager@aurora.test",
    name: "Marcus Manager",
    role: "manager" as Role,
  },
  {
    email: "reviewer@aurora.test",
    name: "Rachel Brand Reviewer",
    role: "reviewer" as Role,
  },
  {
    email: "legal_reviewer@aurora.test",
    name: "Leah Legal Reviewer",
    role: "legal_reviewer" as Role,
  },
  {
    email: "admin@aurora.test",
    name: "Alex Admin",
    role: "admin" as Role,
  },
];

export const BRAND_VOICE_GUIDE = `1.1 Tone and Voice Philosophy
Aurora Pay communicates with a friendly, professional, and reassuring tone. Our audience includes business owners, finance heads, and everyday consumers. We speak clearly and transparently without condescension or excessive informality.

1.2 Prohibited Slang and Conversational Fillers
Avoid overly casual colloquialisms and informal address. Words like "guys", "hey guys", "gonna", "wanna", "super easy", and "awesome" are strictly prohibited in official customer communications, marketing copy, and product releases. Address our customers as "merchants", "partners", "customers", or by name.

2.1 Exclamation Marks and Emotional Restraint
Maintain emotional restraint in written copy. Do not use more than one exclamation mark per 100 words. Never use consecutive exclamation marks (such as "!!" or "!!!"). Allow our clarity and product reliability to convey enthusiasm rather than forced punctuation.

3.1 Absolute Claims and Guarantee Restrictions
Fintech regulations and brand ethics strictly forbid unverified absolute statements. Never use terms such as "100% secure", "guaranteed", "never fails", "zero risk", "best payment app", "#1 payment solution", or "number one". All security assertions must describe the exact protocols utilized rather than promising invulnerability.

4.1 Sourcing and Verification of Numbers
Every number, percentage, fee, turnaround timeframe, or statistical assertion published in external communications must cite an approved, currently valid source from our Approved Facts register. Unapproved figures or estimates are strictly banned.

5.1 Inclusive Language and Global Standards
Use gender-neutral, globally inclusive language. Avoid idioms, regional jargon, or sports metaphors that fail to translate cleanly across our multilingual merchant base. Ensure communications welcome enterprises of all scales equally.

6.1 Visual and Digital Accessibility Standards
Digital accessibility is non-negotiable across all channels. All user interface elements and text overlays must adhere to WCAG AA guidelines with a minimum color contrast ratio of 4.5:1 against their background. All published images must include descriptive alt text. Avoid non-descriptive hyperlink text such as "click here" or "read more".`;

export const GLOSSARY_TERMS = `AVOID: Smart-Pay | Smart Pay | smartpay -> USE: SmartPay
AVOID: cash out | withdraw funds -> USE: transfer to bank
AVOID: e-wallet | cyber wallet -> USE: digital wallet
AVOID: fast money | quick cash -> USE: instant settlement
AVOID: chargeback free | zero chargebacks -> USE: dispute resolution assistance
AVOID: swipe card | card swipe -> USE: tap to pay or card payment
AVOID: customer rep | helpdesk guy -> USE: customer support specialist
AVOID: signup fee | joining charge -> USE: onboarding fee
AVOID: merchant portal | vendor console -> USE: Aurora Dashboard
AVOID: crypto payout | bitcoin rail -> USE: fiat settlement
AVOID: recurring charge | auto debit -> USE: recurring subscription billing
AVOID: app crash | glitch -> USE: temporary system disruption`;

export const APPROVED_FACTS = `SmartPay payments settle within 2 business days.
Data is encrypted in transit with TLS 1.2+ and at rest with AES-256.
Support is available 9am-6pm IST, Monday to Saturday.
Transaction fee is 1.8% per successful card payment.
Aurora Pay is licensed as a Payment Aggregator by the Reserve Bank of India.
Over 50,000 retail merchants use Aurora Pay across 140 cities.
International card transactions incur a processing fee of 2.9% plus currency conversion.
Automated merchant payout batches execute three times daily at 10:00 AM, 2:00 PM, and 6:00 PM IST.`;

export const EXPIRED_FACTS = `Promotional introductory transaction fee of 0.5% applies to all new merchants onboarding in Q1 2025.
Legacy SMS-only payment notification system is supported for accounts opened before June 2024.`;

export const CLAIMS_REGISTER = `1. Superlative Claims Status:
'Fastest' is NOT approved: no independent benchmark exists.
'100% secure' is NOT approved: absolute security guarantees violate regulatory compliance standards.
'#1' or 'Number one' is NOT approved: unverified superlative without accredited third-party market ranking.
'Best payment gateway' is NOT approved: subjective claim banned by advertising standards.
'Guaranteed zero failure rate' is NOT approved: banking rail dependencies prevent zero failure claims.
'Lowest fees in the market' is NOT approved: comparative pricing requires dated verified competitor audits.
'Zero risk' is NOT approved: financial processing inherently involves liquidity and chargeback considerations.

2. Approved Comparative and Quantitative Statements:
'Instant settlement' is approved ONLY when referencing the opt-in Aurora Instant Payout add-on feature.
'99.9% platform availability' is approved based on audited 2025 cloud infrastructure uptime metrics.
'Multi-bank redundancy' is approved referencing our active connections to 5 scheduled commercial partner banks.`;

/**
 * Idempotent seed function. Uses a PostgreSQL transaction advisory lock
 * to avoid double-seeding when multiple serverless instances trigger first-visit initialization.
 */
export async function ensureSeeded(): Promise<{ seeded: boolean; workspaceId: string }> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Check if already seeded without holding lock
  const existingWorkspace = await db.workspace.findFirst({
    where: { name: "Aurora Pay" },
    include: { users: true, approvalStages: true, approvalRules: true },
  });

  if (existingWorkspace && existingWorkspace.users.some((user) => user.email === "legal_reviewer@aurora.test") && existingWorkspace.approvalStages.length === 3 && existingWorkspace.approvalRules.length >= 10) {
    return { seeded: false, workspaceId: existingWorkspace.id };
  }

  // Use interactive transaction with Postgres advisory lock
  return db.$transaction(async (tx) => {
    // Acquire session-safe advisory xact lock for seeding
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('seed_aurora_pay'))`;

    // Re-check inside locked transaction
    let workspace = await tx.workspace.findFirst({
      where: { name: "Aurora Pay" },
    });

    if (!workspace) {
      workspace = await tx.workspace.create({
        data: {
          name: "Aurora Pay",
        },
      });
    }

    const workspaceId = workspace.id;

    const stageDefinitions = [
      { name: "Brand", order: 1, requiredReviewerRole: "reviewer" as Role },
      { name: "Legal", order: 2, requiredReviewerRole: "legal_reviewer" as Role },
      { name: "Compliance", order: 3, requiredReviewerRole: "manager" as Role },
    ];
    const stageRecords = new Map<string, { id: string }>();
    for (const stage of stageDefinitions) {
      const record = await tx.approvalStage.upsert({
        where: { workspaceId_name: { workspaceId, name: stage.name } },
        update: { order: stage.order, requiredReviewerRole: stage.requiredReviewerRole },
        create: { workspaceId, ...stage },
      });
      stageRecords.set(stage.name, record);
    }
    const ruleDefinitions = [
      { category: "unsupported_claim", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "outdated_fact", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "inconsistent_fact", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "claim", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "numeric", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "absolute", minimumSeverity: "low" as const, stage: "Legal" },
      { category: "tone", minimumSeverity: "low" as const, stage: "Brand" },
      { category: "brand_voice", minimumSeverity: "low" as const, stage: "Brand" },
      { category: "terminology", minimumSeverity: "low" as const, stage: "Brand" },
      { category: "glossary", minimumSeverity: "low" as const, stage: "Brand" },
      { category: "*", minimumSeverity: "high" as const, stage: "Compliance" },
    ];
    for (const rule of ruleDefinitions) {
      const stage = stageRecords.get(rule.stage)!;
      await tx.approvalRule.upsert({
        where: { workspaceId_category_minimumSeverity_stageId: { workspaceId, category: rule.category, minimumSeverity: rule.minimumSeverity, stageId: stage.id } },
        update: {},
        create: { workspaceId, category: rule.category, minimumSeverity: rule.minimumSeverity, stageId: stage.id },
      });
    }

    // Seed Users
    const userRecords: Record<string, { id: string; email: string; name: string; role: Role }> = {};
    for (const demoUser of DEMO_USERS) {
      let user = await tx.user.findUnique({
        where: { email: demoUser.email },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            workspaceId,
            email: demoUser.email,
            name: demoUser.name,
            role: demoUser.role,
            passwordHash,
          },
        });
      }
      userRecords[demoUser.role] = user;
    }

    const adminUser = userRecords["admin"];

    // Helper to seed a source with its version and chunks
    async function seedSource(
      type: SourceType,
      title: string,
      owner: string,
      content: string,
      expiresAt: Date | null = null,
      status: SourceStatus = "active"
    ) {
      const source = await tx.source.findFirst({
        where: {
          workspaceId,
          title,
        },
      });

      if (!source) {
        const createdSource = await tx.source.create({
          data: {
            workspaceId,
            type,
            title,
            owner,
            version: 1,
            status,
            expiresAt,
            content,
          },
        });

        // Create SourceVersion
        await tx.sourceVersion.create({
          data: {
            sourceId: createdSource.id,
            version: 1,
            content,
            createdById: adminUser.id,
          },
        });

        // Create Chunks
        const chunks = chunkSourceContent(type, content);
        if (chunks.length > 0) {
          await tx.chunk.createMany({
            data: chunks.map((c) => ({
              sourceId: createdSource.id,
              sourceVersion: 1,
              text: c.text,
              position: c.position,
            })),
          });
        }
      }
    }

    // 1. Brand Voice Guide
    await seedSource(
      "guide",
      "Aurora Brand Voice & Writing Guidelines",
      "Brand & Communications Team",
      BRAND_VOICE_GUIDE
    );

    // 2. Glossary
    await seedSource(
      "glossary",
      "Aurora Terminology & Product Glossary",
      "Product Strategy",
      GLOSSARY_TERMS
    );

    // 3. Approved Facts (Current)
    await seedSource(
      "fact",
      "Approved Operational & Financial Facts (2026)",
      "Compliance & Finance",
      APPROVED_FACTS,
      new Date("2026-12-31T23:59:59Z")
    );

    // 4. Outdated / Expired Fact Source (Explicitly expired in 2025)
    await seedSource(
      "fact",
      "Legacy Promotional Pricing & Deprecated Features (Expired)",
      "Marketing",
      EXPIRED_FACTS,
      new Date("2025-06-30T23:59:59Z")
    );

    // 5. Claims Register
    await seedSource(
      "claims",
      "Claims & Superlatives Governance Register",
      "Legal & Regulatory Affairs",
      CLAIMS_REGISTER
    );

    return { seeded: true, workspaceId };
  }, { maxWait: 10_000, timeout: 60_000 });
}
