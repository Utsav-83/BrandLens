import { NextResponse } from "next/server";
import { getCurrentUser, AuthenticatedUser } from "./auth";
import { Role, SubmissionStatus } from "@/generated/prisma";

export interface GuardSuccess {
  error: null;
  user: AuthenticatedUser;
}

export interface GuardFailure {
  error: NextResponse;
  user: null;
}

export type GuardResult = GuardSuccess | GuardFailure;

export const AUDIT_READ_ROLES: readonly Role[] = ["manager", "reviewer", "admin"];

/**
 * Enforces role-based access control on Route Handlers.
 * Returns either { user, error: null } or { user: null, error: NextResponse }
 */
export async function requireRole(
  ...allowedRoles: (Role | Role[])[]
): Promise<GuardResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
      user: null,
    };
  }

  const flattenedRoles = allowedRoles.flat() as Role[];
  if (flattenedRoles.length > 0 && !flattenedRoles.includes(user.role)) {
    return {
      error: NextResponse.json(
        {
          error: `Forbidden: role '${user.role}' lacks permission for this action. Allowed: ${flattenedRoles.join(", ")}`,
        },
        { status: 403 }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

/**
 * CSRF mitigation: checks that the Origin header matches Host on mutating requests (POST, PUT, PATCH, DELETE).
 * Throws or returns an error response if invalid.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return NextResponse.json(
      { error: "Forbidden: Origin header is required for mutating requests" },
      { status: 403 }
    );
  }

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

    if (host && originUrl.host !== host) {
      return NextResponse.json(
        { error: `Forbidden: Origin '${originUrl.host}' does not match Host '${host}'` },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Forbidden: Invalid Origin header" },
      { status: 403 }
    );
  }

  return null;
}

export const REVIEWABLE_STATUSES: readonly SubmissionStatus[] = [
  "in_review",
  "approved",
  "changes_requested",
] as const;

export interface SubmissionAuthTarget {
  creatorId: string;
  workspaceId: string;
  status: SubmissionStatus;
}

/**
 * Checks whether an authenticated user is permitted to view a submission:
 * - Admin: can view any submission in their workspace.
 * - Creator: can only view submissions where creatorId === user.id.
 * - Manager / Reviewer: can only view submissions with review-related status
 *   ("in_review", "approved", "changes_requested").
 * Returns false if workspaceId does not match.
 */
export function canViewSubmission(
  user: AuthenticatedUser,
  submission: SubmissionAuthTarget
): boolean {
  if (submission.workspaceId !== user.workspaceId) return false;
  if (user.role === "admin") return true;
  if (user.role === "creator") return submission.creatorId === user.id;
  if (user.role === "manager" || user.role === "reviewer" || user.role === "legal_reviewer") {
    return (REVIEWABLE_STATUSES as readonly string[]).includes(submission.status);
  }
  return false;
}

/**
 * Asserts user can view submission. Returns 404 (not 403) to prevent existence leakage.
 */
export function assertCanViewSubmission(
  user: AuthenticatedUser,
  submission: SubmissionAuthTarget
): NextResponse | null {
  if (!canViewSubmission(user, submission)) {
    return NextResponse.json(
      { error: "Submission not found or access denied." },
      { status: 404 }
    );
  }
  return null;
}

/**
 * Checks whether an authenticated user is permitted to edit a submission
 * (edit text, analyse, accept/edit/reject findings, submit for review):
 * - Admin: can edit any submission in their workspace.
 * - Creator: can only edit submissions where creatorId === user.id.
 * - Manager / Reviewer / Others: false.
 */
export function canEditSubmission(
  user: AuthenticatedUser,
  submission: Pick<SubmissionAuthTarget, "creatorId" | "workspaceId">
): boolean {
  if (submission.workspaceId !== user.workspaceId) return false;
  if (user.role === "admin") return true;
  if (user.role === "creator") return submission.creatorId === user.id;
  return false;
}

/**
 * Asserts user can edit submission. Returns 404 (not 403) to prevent existence leakage.
 */
export function assertCanEditSubmission(
  user: AuthenticatedUser,
  submission: Pick<SubmissionAuthTarget, "creatorId" | "workspaceId">
): NextResponse | null {
  if (!canEditSubmission(user, submission)) {
    return NextResponse.json(
      { error: "Submission not found or access denied." },
      { status: 404 }
    );
  }
  return null;
}

/**
 * Asserts user can review a submission (approve or request changes):
 * - Must belong to user's workspace (404).
 * - Role must be manager, reviewer, or admin (403).
 * - Separation of duties: a user must not approve or request changes on a submission
 *   they created, even if they are admin (403 with clear message).
 * - Status must be 'in_review' (403 with clear message).
 */
export function assertCanReview(
  user: AuthenticatedUser,
  submission: SubmissionAuthTarget
): NextResponse | null {
  if (submission.workspaceId !== user.workspaceId) {
    return NextResponse.json(
      { error: "Submission not found or access denied." },
      { status: 404 }
    );
  }

  const allowedRoles: Role[] = ["manager", "reviewer", "legal_reviewer", "admin"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: `Forbidden: role '${user.role}' lacks permission to review submissions.` },
      { status: 403 }
    );
  }

  // Separation of duties: creators cannot review their own submissions, even if admin
  if (submission.creatorId === user.id) {
    return NextResponse.json(
      { error: "Separation of duties violation: Users cannot approve or request changes on their own submissions." },
      { status: 403 }
    );
  }

  if (submission.status !== "in_review") {
    return NextResponse.json(
      { error: `Cannot review submission in '${submission.status}' status. Submission must be 'in_review'.` },
      { status: 403 }
    );
  }

  return null;
}
