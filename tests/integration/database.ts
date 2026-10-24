import { PrismaClient, Role, SourceType, FindingSeverity } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, signToken, AUTH_COOKIE_NAME } from "@/lib/auth";
import { chunkSourceContent } from "@/lib/retrieval/chunk";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required for integration tests.");

export const integrationDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
export const ORIGIN = "http://localhost:3000";

export async function truncateAllTables() {
  await integrationDb.$executeRawUnsafe(`TRUNCATE TABLE
    "rate_limits", "audit_logs", "comments", "findings", "submissions",
    "chunks", "source_versions", "sources", "users", "workspaces"
    RESTART IDENTITY CASCADE`);
}

export async function createWorkspace(name = "Integration Workspace") {
  return integrationDb.workspace.create({ data: { name } });
}

export async function createUser(workspaceId: string, role: Role, overrides: { email?: string; password?: string } = {}) {
  const email = overrides.email ?? `${role}-${crypto.randomUUID()}@integration.test`;
  const password = overrides.password ?? "IntegrationPassword2026!";
  const user = await integrationDb.user.create({ data: {
    workspaceId, email, name: `${role} user`, role, passwordHash: await hashPassword(password),
  } });
  return { ...user, password };
}

export async function createSource(workspaceId: string, creatorId: string, overrides: {
  type?: SourceType; title?: string; content?: string; expiresAt?: Date | null;
} = {}) {
  const type = overrides.type ?? "fact";
  const content = overrides.content ?? "Aurora Pay supports trusted merchants.";
  const source = await integrationDb.source.create({ data: {
    workspaceId, type, title: overrides.title ?? `Source ${crypto.randomUUID()}`,
    owner: "Integration team", content, expiresAt: overrides.expiresAt ?? null,
    versions: { create: { version: 1, content, createdById: creatorId } },
  } });
  const chunks = chunkSourceContent(type, content);
  if (chunks.length) await integrationDb.chunk.createMany({ data: chunks.map((chunk) => ({ sourceId: source.id, sourceVersion: 1, ...chunk })) });
  return source;
}

export async function createSubmission(workspaceId: string, creatorId: string, text = "Hello merchants.") {
  return integrationDb.submission.create({ data: {
    workspaceId, creatorId, title: "Integration submission", channel: "web", originalText: text, currentText: text,
  } });
}

export async function createFinding(submissionId: string, overrides: {
  snippet: string; start: number; end: number; suggestedFix?: string | null; stale?: boolean;
  severity?: FindingSeverity; decision?: "pending" | "accepted" | "edited" | "rejected";
}) {
  return integrationDb.finding.create({ data: {
    submissionId, origin: "rule", category: "tone", severity: overrides.severity ?? "medium",
    confidence: 1, start: overrides.start, end: overrides.end, snippet: overrides.snippet,
    message: "Integration finding", suggestedFix: overrides.suggestedFix ?? "Hello", stale: overrides.stale ?? false,
    decision: overrides.decision ?? "pending",
  } });
}

export async function authCookie(user: { id: string; email: string; name: string; role: Role; workspaceId: string }) {
  const token = await signToken({ userId: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId });
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

export async function requestFor(user: Parameters<typeof authCookie>[0], path: string, init: RequestInit = {}, opts: { origin?: string | null; cookie?: boolean } = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", "localhost:3000");
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.cookie !== false) headers.set("cookie", await authCookie(user));
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  return new Request(new URL(path, ORIGIN), { ...init, headers });
}

export function routeParams(id: string) { return { params: Promise.resolve({ id }) }; }
export function roleParams(role: string) { return { params: Promise.resolve({ role }) }; }
export function jsonBody(value: unknown) { return JSON.stringify(value); }
