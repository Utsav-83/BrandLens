import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireRole } from "@/lib/guards";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

describe("New Submission Page Server Guard (/new)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows creator with 200/no error", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValueOnce({
      userId: "u-creator",
      email: "creator@aurora.test",
      name: "Creator User",
      role: "creator",
      workspaceId: "ws-1",
    });

    const guard = await requireRole(["creator", "admin"]);
    expect(guard.error).toBeNull();
    expect(guard.user).not.toBeNull();
    expect(guard.user?.role).toBe("creator");
  });

  it("allows admin with 200/no error", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValueOnce({
      userId: "u-admin",
      email: "admin@aurora.test",
      name: "Admin User",
      role: "admin",
      workspaceId: "ws-1",
    });

    const guard = await requireRole(["creator", "admin"]);
    expect(guard.error).toBeNull();
    expect(guard.user).not.toBeNull();
    expect(guard.user?.role).toBe("admin");
  });

  it("rejects manager with 403 Forbidden", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValueOnce({
      userId: "u-manager",
      email: "manager@aurora.test",
      name: "Manager User",
      role: "manager",
      workspaceId: "ws-1",
    });

    const guard = await requireRole(["creator", "admin"]);
    expect(guard.error).not.toBeNull();
    expect(guard.error?.status).toBe(403);
    const body = await guard.error?.json();
    expect(body.error).toContain("Forbidden");
  });

  it("rejects reviewer with 403 Forbidden", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValueOnce({
      userId: "u-reviewer",
      email: "reviewer@aurora.test",
      name: "Reviewer User",
      role: "reviewer",
      workspaceId: "ws-1",
    });

    const guard = await requireRole(["creator", "admin"]);
    expect(guard.error).not.toBeNull();
    expect(guard.error?.status).toBe(403);
    const body = await guard.error?.json();
    expect(body.error).toContain("Forbidden");
  });

  it("rejects unauthenticated user with 401 Unauthorized", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValueOnce(null);

    const guard = await requireRole(["creator", "admin"]);
    expect(guard.error).not.toBeNull();
    expect(guard.error?.status).toBe(401);
    const body = await guard.error?.json();
    expect(body.error).toContain("Authentication required");
  });
});
