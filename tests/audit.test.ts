import { describe, it, expect } from "vitest";
import {
  canonicalStringify,
  computeAuditHash,
  verifyChainEntries,
} from "@/lib/audit";

describe("Audit Hash Chain Integrity", () => {
  it("produces deterministic canonical JSON regardless of key insertion order", () => {
    const objA = { b: 2, a: 1, c: { z: "last", y: "first" } };
    const objB = { a: 1, c: { y: "first", z: "last" }, b: 2 };

    const jsonA = canonicalStringify(objA);
    const jsonB = canonicalStringify(objB);

    expect(jsonA).toBe(jsonB);
    expect(jsonA).toBe('{"a":1,"b":2,"c":{"y":"first","z":"last"}}');
  });

  it("verifies a valid hash chain with sequential entries", () => {
    const workspaceId = "ws-aurora-01";
    const entries: Array<{
      id: string;
      workspaceId: string;
      actorId: string;
      action: string;
      entity: string;
      entityId: string;
      payload: unknown;
      prevHash: string | null;
      hash: string;
    }> = [];
    let prevHash: string | null = null;

    for (let i = 1; i <= 5; i++) {
      const payload = { event: "submission_created", step: i };
      const canonical = {
        workspaceId,
        actorId: `user-${i}`,
        action: "create",
        entity: "submission",
        entityId: `sub-${i}`,
        payload,
      };

      const hash = computeAuditHash(prevHash, canonical);
      entries.push({
        id: `entry-${i}`,
        workspaceId,
        actorId: `user-${i}`,
        action: "create",
        entity: "submission",
        entityId: `sub-${i}`,
        payload,
        prevHash,
        hash,
      });

      prevHash = hash;
    }

    const verification = verifyChainEntries(entries);
    expect(verification.intact).toBe(true);
    expect(verification.brokenId).toBeUndefined();
  });

  it("detects tampered payload in a chain entry", () => {
    const workspaceId = "ws-aurora-01";
    const entries: Array<{
      id: string;
      workspaceId: string;
      actorId: string;
      action: string;
      entity: string;
      entityId: string;
      payload: unknown;
      prevHash: string | null;
      hash: string;
    }> = [];
    let prevHash: string | null = null;

    for (let i = 1; i <= 4; i++) {
      const payload = { amount: i * 100 };
      const canonical = {
        workspaceId,
        actorId: `user-${i}`,
        action: "update",
        entity: "submission",
        entityId: `sub-${i}`,
        payload,
      };

      const hash = computeAuditHash(prevHash, canonical);
      entries.push({
        id: `entry-${i}`,
        workspaceId,
        actorId: `user-${i}`,
        action: "update",
        entity: "submission",
        entityId: `sub-${i}`,
        payload,
        prevHash,
        hash,
      });

      prevHash = hash;
    }

    // Tamper with entry #2 payload
    entries[1].payload = { amount: 999999 };

    const verification = verifyChainEntries(entries);
    expect(verification.intact).toBe(false);
    expect(verification.brokenId).toBe("entry-2");
    expect(verification.reason).toContain("Tampered hash");
  });

  it("detects altered prevHash link in the chain", () => {
    const workspaceId = "ws-aurora-01";
    const entries: Array<{
      id: string;
      workspaceId: string;
      actorId: string;
      action: string;
      entity: string;
      entityId: string;
      payload: unknown;
      prevHash: string | null;
      hash: string;
    }> = [];
    let prevHash: string | null = null;

    for (let i = 1; i <= 3; i++) {
      const payload = { index: i };
      const canonical = {
        workspaceId,
        actorId: "actor-1",
        action: "action",
        entity: "entity",
        entityId: "id",
        payload,
      };

      const hash = computeAuditHash(prevHash, canonical);
      entries.push({
        id: `entry-${i}`,
        workspaceId,
        actorId: "actor-1",
        action: "action",
        entity: "entity",
        entityId: "id",
        payload,
        prevHash,
        hash,
      });

      prevHash = hash;
    }

    // Tamper with entry #3 prevHash
    entries[2].prevHash = "fake-forged-previous-hash";

    const verification = verifyChainEntries(entries);
    expect(verification.intact).toBe(false);
    expect(verification.brokenId).toBe("entry-3");
    expect(verification.reason).toContain("Previous hash mismatch");
  });
});
