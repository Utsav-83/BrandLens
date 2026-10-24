import crypto from "crypto";
import { Prisma, PrismaClient } from "@/generated/prisma";

export interface AuditEntryInput {
  workspaceId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export interface AuditEntryRecord {
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
}

/**
 * Deterministically serialize any JavaScript object or primitive
 * so that key order differences do not affect the SHA-256 hash.
 */
export function canonicalStringify(data: unknown): string {
  if (data === null || data === undefined) {
    return "null";
  }
  if (typeof data !== "object") {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return `[${data.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(data as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    const value = (data as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalStringify(value)}`;
  });
  return `{${entries.join(",")}}`;
}

/**
 * Calculates SHA-256(prevHash + canonicalJson)
 */
export function computeAuditHash(prevHash: string | null, canonicalPayload: unknown): string {
  const normalizedPrev = prevHash ?? "";
  const canonicalJson = canonicalStringify(canonicalPayload);
  return crypto.createHash("sha256").update(normalizedPrev + canonicalJson).digest("hex");
}

/**
 * Pure function to verify the cryptographic chain of audit entries in memory.
 */
export function verifyChainEntries(entries: Array<{
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  prevHash: string | null;
  hash: string;
}>): { intact: boolean; brokenId?: string; reason?: string } {
  let expectedPrevHash: string | null = null;

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrevHash) {
      return {
        intact: false,
        brokenId: entry.id,
        reason: `Previous hash mismatch on entry ${entry.id}. Expected '${expectedPrevHash}', found '${entry.prevHash}'.`,
      };
    }

    const canonicalPayload = {
      workspaceId: entry.workspaceId,
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload,
    };

    const calculatedHash = computeAuditHash(entry.prevHash, canonicalPayload);
    if (calculatedHash !== entry.hash) {
      return {
        intact: false,
        brokenId: entry.id,
        reason: `Tampered hash on entry ${entry.id}. Expected '${calculatedHash}', recorded '${entry.hash}'.`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { intact: true };
}

/**
 * Appends an audit log inside an active Prisma interactive transaction,
 * using a Postgres advisory transaction lock to guarantee race safety.
 */
export async function appendAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntryInput
): Promise<AuditEntryRecord> {
  // Acquire a transaction-level advisory lock scoped to this workspace
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entry.workspaceId}))`;

  // Find the latest audit entry for this workspace
  const lastEntry = await tx.auditLog.findFirst({
    where: { workspaceId: entry.workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const prevHash = lastEntry ? lastEntry.hash : null;

  const canonicalPayload = {
    workspaceId: entry.workspaceId,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    payload: entry.payload,
  };

  const hash = computeAuditHash(prevHash, canonicalPayload);
  const now = new Date();
  const createdAt = lastEntry && lastEntry.createdAt >= now
    ? new Date(lastEntry.createdAt.getTime() + 1)
    : now;

  return tx.auditLog.create({
    data: {
      workspaceId: entry.workspaceId,
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload as Prisma.InputJsonValue,
      prevHash,
      hash,
      createdAt,
    },
  });
}

/**
 * Verifies the full audit log chain for a workspace in the database.
 */
export async function verifyChain(
  client: PrismaClient | Prisma.TransactionClient,
  workspaceId: string
): Promise<{ intact: boolean; brokenId?: string; reason?: string }> {
  const entries = await client.auditLog.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return verifyChainEntries(entries);
}
