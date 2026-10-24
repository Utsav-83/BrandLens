import { describe, it, expect } from "vitest";
import { assertSameOrigin } from "@/lib/guards";
import { Role } from "@/generated/prisma";

// Pure helper function reflecting requireRole decision logic for unit testing without cookie store
function evaluateRoleAccess(user: { role: Role } | null, allowedRoles: Role[]) {
  if (!user) {
    return { status: 401, error: "Authentication required" };
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return { status: 403, error: "Forbidden: insufficient permissions" };
  }
  return { status: 200, user };
}

describe("Guards & Authorization", () => {
  it("authorizes user with allowed role", () => {
    const user = { role: "creator" as Role };
    const result = evaluateRoleAccess(user, ["creator", "manager"]);
    expect(result.status).toBe(200);
    expect(result.user).toEqual(user);
  });

  it("forbids user with disallowed role (403)", () => {
    const user = { role: "creator" as Role };
    const result = evaluateRoleAccess(user, ["manager", "admin"]);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Forbidden");
  });

  it("returns 401 for unauthenticated user", () => {
    const result = evaluateRoleAccess(null, ["creator"]);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Authentication required");
  });

  describe("assertSameOrigin", () => {
    it("allows GET and HEAD requests without Origin", () => {
      const getReq = new Request("http://localhost:3000/api/sources", { method: "GET" });
      expect(assertSameOrigin(getReq)).toBeNull();

      const headReq = new Request("http://localhost:3000/api/sources", { method: "HEAD" });
      expect(assertSameOrigin(headReq)).toBeNull();
    });

    it("allows POST request when Origin matches Host", () => {
      const req = new Request("http://localhost:3000/api/sources", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://localhost:3000",
        },
      });
      expect(assertSameOrigin(req)).toBeNull();
    });

    it("rejects POST request when Origin does not match Host (CSRF)", () => {
      const req = new Request("http://localhost:3000/api/sources", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://malicious-attacker.com",
        },
      });
      const error = assertSameOrigin(req);
      expect(error).not.toBeNull();
      expect(error?.status).toBe(403);
    });

    it("rejects mutating requests without an Origin header", () => {
      const req = new Request("http://localhost:3000/api/sources", { method: "POST" });
      expect(assertSameOrigin(req)?.status).toBe(403);
    });
  });
});
