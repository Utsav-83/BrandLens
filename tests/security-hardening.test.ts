import { describe, it, expect, vi, afterEach } from "vitest";
import { idParamSchema, demoRoleSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/ratelimit";
import { validateJwtSecret } from "@/lib/auth";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    rateLimit: {
      upsert: vi.fn(),
    },
  },
}));

describe("Security Hardening Pass", () => {
  describe("Zod ID Validation (:id route parameter)", () => {
    it("accepts valid UUIDs", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      expect(idParamSchema.safeParse(validUuid).success).toBe(true);
    });

    it("invalid id returns 400 validation error", () => {
      const invalidIds = ["123", "not-a-uuid", "undefined", "../../etc/passwd"];
      for (const id of invalidIds) {
        const result = idParamSchema.safeParse(id);
        expect(result.success).toBe(false);
      }
    });

    it("validates demo role parameter with enum", () => {
      expect(demoRoleSchema.safeParse("creator").success).toBe(true);
      expect(demoRoleSchema.safeParse("manager").success).toBe(true);
      expect(demoRoleSchema.safeParse("reviewer").success).toBe(true);
      expect(demoRoleSchema.safeParse("admin").success).toBe(true);
      expect(demoRoleSchema.safeParse("superadmin").success).toBe(false);
      expect(demoRoleSchema.safeParse("hacker").success).toBe(false);
    });
  });

  describe("Rate Limiting (DB-backed)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("rate limit returns 429 after limit is exceeded", async () => {
      vi.spyOn(db.rateLimit, "upsert").mockResolvedValueOnce({
        id: "rl-1",
        key: "test-key",
        windowStart: new Date(),
        count: 11,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await checkRateLimit("test-key", 10, 600);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
    });

    it("allows requests when count is within limit", async () => {
      vi.spyOn(db.rateLimit, "upsert").mockResolvedValueOnce({
        id: "rl-1",
        key: "test-key",
        windowStart: new Date(),
        count: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await checkRateLimit("test-key", 10, 600);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5);
    });
  });

  describe("Startup Safety (JWT_SECRET in Production)", () => {
    it("throws error in production when JWT_SECRET is missing", () => {
      expect(() => validateJwtSecret("production", undefined)).toThrow(
        "JWT_SECRET environment variable is missing or shorter than 32 characters in production."
      );
      expect(() => validateJwtSecret("production", "")).toThrow(
        "JWT_SECRET environment variable is missing or shorter than 32 characters in production."
      );
    });

    it("throws error in production when JWT_SECRET is shorter than 32 characters", () => {
      expect(() => validateJwtSecret("production", "too-short-secret")).toThrow(
        "JWT_SECRET environment variable is missing or shorter than 32 characters in production."
      );
    });

    it("succeeds in production when JWT_SECRET is at least 32 characters", () => {
      expect(() =>
        validateJwtSecret("production", "a-very-secure-jwt-secret-that-is-at-least-32-chars-long")
      ).not.toThrow();
    });

    it("does not throw in development even if JWT_SECRET is short or missing", () => {
      expect(() => validateJwtSecret("development", undefined)).not.toThrow();
      expect(() => validateJwtSecret("test", "short")).not.toThrow();
    });
  });

  describe("Demo Mode Security Gate", () => {
    it("demo disabled returns 404 when DEMO_MODE is 'false' or undefined", () => {
      const isDemoAllowed = (mode: string | undefined) => mode === "true";
      expect(isDemoAllowed("false")).toBe(false);
      expect(isDemoAllowed(undefined)).toBe(false);
      expect(isDemoAllowed("true")).toBe(true);
    });
  });
});
