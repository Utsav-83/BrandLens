import { describe, it, expect } from "vitest";
import {
  assertSameOrigin,
  assertCanViewSubmission,
  assertCanEditSubmission,
  assertCanReview,
  canViewSubmission,
  canEditSubmission,
} from "@/lib/guards";
import { Role, SubmissionStatus } from "@/generated/prisma";
import { AuthenticatedUser } from "@/lib/auth";

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

  describe("New Submission Page Role Guard (/new)", () => {
    const newPageAllowedRoles: Role[] = ["creator", "admin"];

    it("allows creator to access /new", () => {
      const user = { role: "creator" as Role };
      const result = evaluateRoleAccess(user, newPageAllowedRoles);
      expect(result.status).toBe(200);
      expect(result.user).toEqual(user);
    });

    it("allows admin to access /new", () => {
      const user = { role: "admin" as Role };
      const result = evaluateRoleAccess(user, newPageAllowedRoles);
      expect(result.status).toBe(200);
      expect(result.user).toEqual(user);
    });

    it("rejects manager from accessing /new (403 Forbidden)", () => {
      const user = { role: "manager" as Role };
      const result = evaluateRoleAccess(user, newPageAllowedRoles);
      expect(result.status).toBe(403);
      expect(result.error).toContain("Forbidden");
    });

    it("rejects reviewer from accessing /new (403 Forbidden)", () => {
      const user = { role: "reviewer" as Role };
      const result = evaluateRoleAccess(user, newPageAllowedRoles);
      expect(result.status).toBe(403);
      expect(result.error).toContain("Forbidden");
    });

    it("rejects unauthenticated visitor from /new (401 Authentication required)", () => {
      const result = evaluateRoleAccess(null, newPageAllowedRoles);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Authentication required");
    });
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

  describe("Object-Level Authorization & Separation of Duties", () => {
    const creatorA: AuthenticatedUser = {
      id: "usr_creator_a",
      email: "creator_a@example.com",
      name: "Creator A",
      role: "creator",
      workspaceId: "ws_1",
    };

    const creatorB: AuthenticatedUser = {
      id: "usr_creator_b",
      email: "creator_b@example.com",
      name: "Creator B",
      role: "creator",
      workspaceId: "ws_1",
    };

    const reviewer: AuthenticatedUser = {
      id: "usr_reviewer_1",
      email: "reviewer@example.com",
      name: "Reviewer 1",
      role: "reviewer",
      workspaceId: "ws_1",
    };

    const manager: AuthenticatedUser = {
      id: "usr_manager_1",
      email: "manager@example.com",
      name: "Manager 1",
      role: "manager",
      workspaceId: "ws_1",
    };

    const admin: AuthenticatedUser = {
      id: "usr_admin_1",
      email: "admin@example.com",
      name: "Admin 1",
      role: "admin",
      workspaceId: "ws_1",
    };

    const draftSubB = {
      creatorId: "usr_creator_b",
      workspaceId: "ws_1",
      status: "draft" as SubmissionStatus,
    };

    const inReviewSubB = {
      creatorId: "usr_creator_b",
      workspaceId: "ws_1",
      status: "in_review" as SubmissionStatus,
    };

    const reviewerOwnSub = {
      creatorId: "usr_reviewer_1",
      workspaceId: "ws_1",
      status: "in_review" as SubmissionStatus,
    };

    const adminOwnSub = {
      creatorId: "usr_admin_1",
      workspaceId: "ws_1",
      status: "in_review" as SubmissionStatus,
    };

    it("creator A cannot read creator B's submission (404)", () => {
      expect(canViewSubmission(creatorA, draftSubB)).toBe(false);
      const res = assertCanViewSubmission(creatorA, draftSubB);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(404);

      // Creator B can view their own submission
      expect(canViewSubmission(creatorB, draftSubB)).toBe(true);
      expect(assertCanViewSubmission(creatorB, draftSubB)).toBeNull();
    });

    it("creator A cannot modify creator B's submission (404)", () => {
      expect(canEditSubmission(creatorA, draftSubB)).toBe(false);
      const res = assertCanEditSubmission(creatorA, draftSubB);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(404);
    });

    it("creator cannot approve (403)", () => {
      const res = assertCanReview(creatorA, inReviewSubB);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    });

    it("reviewer cannot approve own submission (403 separation of duties)", async () => {
      const res = assertCanReview(reviewer, reviewerOwnSub);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
      const json = await res!.json();
      expect(json.error).toContain("Separation of duties violation");
    });

    it("manager cannot view a draft (404)", () => {
      expect(canViewSubmission(manager, draftSubB)).toBe(false);
      const res = assertCanViewSubmission(manager, draftSubB);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(404);
    });

    it("manager can view a submission in review status", () => {
      expect(canViewSubmission(manager, inReviewSubB)).toBe(true);
      expect(assertCanViewSubmission(manager, inReviewSubB)).toBeNull();
    });

    it("admin can view draft and modify submissions", () => {
      expect(canViewSubmission(admin, draftSubB)).toBe(true);
      expect(assertCanViewSubmission(admin, draftSubB)).toBeNull();

      expect(canEditSubmission(admin, draftSubB)).toBe(true);
      expect(assertCanEditSubmission(admin, draftSubB)).toBeNull();
    });

    it("admin cannot approve own submission (403 separation of duties)", async () => {
      const res = assertCanReview(admin, adminOwnSub);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
      const json = await res!.json();
      expect(json.error).toContain("Separation of duties violation");
    });
  });
});
