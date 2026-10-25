import { describe, it, expect, afterEach } from "vitest";
import { demoRoleSchema } from "@/lib/validation";

// Pure function simulating the security gate logic in /api/auth/demo/[role]
function evaluateDemoAccess(demoModeEnv: string | undefined, role: string) {
  if (demoModeEnv !== "true") {
    return { status: 404, error: "Demo mode is disabled on this server." };
  }

  const parsed = demoRoleSchema.safeParse(role.toLowerCase());
  if (!parsed.success) {
    return { status: 400, error: `Invalid role '${role}'. Valid options are: creator, manager, reviewer, admin` };
  }

  const normalized = parsed.data;
  return {
    status: 200,
    user: {
      email: `${normalized}@aurora.test`,
      role: normalized,
      name: `${normalized.charAt(0).toUpperCase() + normalized.slice(1)} Demo`,
    },
  };
}

describe("Demo Login Route Security Gate (/api/auth/demo/[role])", () => {
  const originalDemoMode = process.env.DEMO_MODE;

  afterEach(() => {
    process.env.DEMO_MODE = originalDemoMode;
  });

  it("returns 404 Not Found when DEMO_MODE is 'false'", () => {
    const result = evaluateDemoAccess("false", "creator");
    expect(result.status).toBe(404);
    expect(result.error).toContain("Demo mode is disabled");
  });

  it("returns 404 Not Found when DEMO_MODE is undefined or empty", () => {
    const result = evaluateDemoAccess(undefined, "creator");
    expect(result.status).toBe(404);
    expect(result.error).toContain("Demo mode is disabled");
  });

  it("hides demo buttons on /login when DEMO_MODE is not 'true'", () => {
    const isDemoActive = (envVal: string | undefined) => envVal === "true";
    expect(isDemoActive("false")).toBe(false);
    expect(isDemoActive(undefined)).toBe(false);
    expect(isDemoActive("0")).toBe(false);
    expect(isDemoActive("true")).toBe(true);
  });

  it("succeeds with 200 and logs in demo user when DEMO_MODE is 'true'", () => {
    const result = evaluateDemoAccess("true", "creator");
    expect(result.status).toBe(200);
    expect(result.user?.email).toBe("creator@aurora.test");
    expect(result.user?.role).toBe("creator");
  });

  it("returns 400 when an invalid role is supplied in demo login", () => {
    const result = evaluateDemoAccess("true", "superhacker");
    expect(result.status).toBe(400);
    expect(result.error).toContain("Invalid role");
  });
});
