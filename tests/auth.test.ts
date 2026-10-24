import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "@/lib/auth";

describe("Authentication & Cryptography", () => {
  it("hashes password and verifies successfully", async () => {
    const rawPassword = "TestSecurePassword2026!";
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith("$2")).toBe(true);

    const isMatch = await verifyPassword(rawPassword, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await verifyPassword("WrongPassword123!", hash);
    expect(isWrongMatch).toBe(false);
  });

  it("performs JWT sign and verify round-trip with jose", async () => {
    const payload = {
      userId: "user-1234-uuid",
      email: "creator@aurora.test",
      name: "Cora Creator",
      role: "creator" as const,
      workspaceId: "workspace-5678-uuid",
    };

    const token = await signToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe(payload.role);
    expect(verified?.workspaceId).toBe(payload.workspaceId);
  });

  it("rejects tampered JWT tokens", async () => {
    const payload = {
      userId: "user-tamper-test",
      email: "admin@aurora.test",
      name: "Alex Admin",
      role: "admin" as const,
      workspaceId: "ws-1",
    };

    const token = await signToken(payload);
    // Tamper with payload segment
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, role: "creator" })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const verified = await verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });
});
