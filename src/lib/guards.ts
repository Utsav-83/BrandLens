import { NextResponse } from "next/server";
import { getCurrentUser, AuthenticatedUser } from "./auth";
import { Role } from "@/generated/prisma";

export interface GuardSuccess {
  error: null;
  user: AuthenticatedUser;
}

export interface GuardFailure {
  error: NextResponse;
  user: null;
}

export type GuardResult = GuardSuccess | GuardFailure;

/**
 * Enforces role-based access control on Route Handlers.
 * Returns either { user, error: null } or { user: null, error: NextResponse }
 */
export async function requireRole(...allowedRoles: Role[]): Promise<GuardResult> {
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

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      error: NextResponse.json(
        {
          error: `Forbidden: role '${user.role}' lacks permission for this action. Allowed: ${allowedRoles.join(", ")}`,
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
