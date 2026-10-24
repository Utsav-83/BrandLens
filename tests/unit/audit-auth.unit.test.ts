import { afterEach, describe, expect, it } from "vitest";
import { computeAuditHash, verifyChainEntries } from "@/lib/audit";
import { SignJWT } from "jose";
import { hashPassword, signToken, verifyPassword, verifyToken } from "@/lib/auth";

const makeChain = () => {
  let prevHash: string | null = null;
  return [1, 2, 3].map((n) => {
    const entry = { id: `e${n}`, workspaceId: "w", actorId: "u", action: "update", entity: "draft", entityId: `${n}`, payload: { n }, prevHash, hash: "" };
    entry.hash = computeAuditHash(prevHash, { workspaceId: entry.workspaceId, actorId: entry.actorId, action: entry.action, entity: entry.entity, entityId: entry.entityId, payload: entry.payload });
    prevHash = entry.hash;
    return entry;
  });
};

describe("audit chain integrity in memory", () => {
  it("accepts a complete valid chain", () => expect(verifyChainEntries(makeChain()).intact).toBe(true));
  it("detects an edited entry", () => {
    const chain = makeChain(); chain[1].payload = { n: 999 };
    expect(verifyChainEntries(chain).brokenId).toBe("e2");
  });
  it("detects a deleted entry", () => expect(verifyChainEntries(makeChain().filter((entry) => entry.id !== "e2")).intact).toBe(false));
  it("detects reordered entries", () => {
    const chain = makeChain(); [chain[0], chain[1]] = [chain[1], chain[0]];
    expect(verifyChainEntries(chain).intact).toBe(false);
  });
});

describe("authentication primitives", () => {
  afterEach(() => { delete process.env.JWT_SECRET; });
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });
  it("rejects a password that does not match the hash", async () => expect(verifyPassword("wrong", await hashPassword("right"))).resolves.toBe(false));
  it("verifies a JWT signed by the configured secret", async () => {
    process.env.JWT_SECRET = "test-signing-secret-that-is-long-enough";
    const token = await signToken({ userId: "u", email: "u@test", name: "User", role: "creator", workspaceId: "w" });
    expect((await verifyToken(token))?.userId).toBe("u");
  });
  it("rejects a JWT signed by a different secret", async () => {
    process.env.JWT_SECRET = "first-test-signing-secret-that-is-long-enough";
    const token = await signToken({ userId: "u", email: "u@test", name: "User", role: "creator", workspaceId: "w" });
    process.env.JWT_SECRET = "second-test-signing-secret-that-is-long-enough";
    expect(await verifyToken(token)).toBeNull();
  });
  it("rejects an expired JWT", async () => {
    process.env.JWT_SECRET = "test-signing-secret-that-is-long-enough";
    const token = await new SignJWT({ userId: "u" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("0s").sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await verifyToken(token)).toBeNull();
  });
});
