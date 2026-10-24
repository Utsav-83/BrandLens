import { describe, it, expect } from "vitest";
import { appendAudit, verifyChain } from "@/lib/audit";
import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

describe("Audit Advisory Lock Concurrency", () => {
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!testDbUrl) {
    it.skip("Skipping DB concurrency test: TEST_DATABASE_URL is not set", () => {
      // Test skipped gracefully when TEST_DATABASE_URL is absent
    });
    return;
  }

  it("safely serializes 10 concurrent appendAudit calls without hash bifurcation", async () => {
    const adapter = new PrismaPg({ connectionString: testDbUrl });
    const client = new PrismaClient({ adapter });

    const testWorkspaceId = `test-ws-concurrent-${Date.now()}`;

    // Create temporary workspace
    await client.workspace.create({
      data: {
        id: testWorkspaceId,
        name: "Concurrency Test Workspace",
      },
    });

    try {
      // Dispatch 10 parallel transactions
      const tasks = Array.from({ length: 10 }).map((_, i) => {
        return client.$transaction(async (tx) => {
          return appendAudit(tx, {
            workspaceId: testWorkspaceId,
            actorId: `concurrent-actor-${i}`,
            action: `action_${i}`,
            entity: "test_entity",
            entityId: `entity_${i}`,
            payload: { iteration: i, timestamp: Date.now() },
          });
        });
      });

      const results = await Promise.all(tasks);
      expect(results.length).toBe(10);

      // Verify full chain integrity in DB
      const verification = await verifyChain(client, testWorkspaceId);
      expect(verification.intact).toBe(true);
      expect(verification.brokenId).toBeUndefined();
    } finally {
      // Clean up test workspace
      await client.auditLog.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await client.workspace.delete({ where: { id: testWorkspaceId } });
    }
  });
});
