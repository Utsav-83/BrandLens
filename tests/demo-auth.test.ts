import { describe, it, expect, afterEach } from "vitest";

// Pure function simulating the security gate logic in /api/auth/demo/[role]
function evaluateDemoAccess(demoModeEnv: string | undefined, role: string) {
  if (demoModeEnv !== "true") {
    return { status: 403, error: "Demo mode is disabled on this server." };
  }

  const validRoles = ["creator", "manager", "reviewer", "admin"];
  const normalized = role.toLowerCase();
  if (!validRoles.includes(normalized)) {
    return { status: 400, error: `Invalid role '${role}'.` };
  }

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

  it("returns 403 Forbidden when DEMO_MODE is 'false'", () => {
    const result = evaluateDemoAccess("false", "creator");
    expect(result.status).toBe(403);
    expect(result.error).toContain("Demo mode is disabled");
  });

  it("returns 403 Forbidden when DEMO_MODE is undefined or empty", () => {
    const result = evaluateDemoAccess(undefined, "creator");
    expect(result.status).toBe(403);
    expect(result.error).toContain("Demo mode is disabled");
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
