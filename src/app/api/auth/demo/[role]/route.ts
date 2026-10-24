import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, getAuthCookieOptions } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { assertSameOrigin } from "@/lib/guards";
import { Role } from "@/generated/prisma";

export const runtime = "nodejs";

const VALID_ROLES: Role[] = ["creator", "manager", "reviewer", "admin"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ role: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  // Next.js 16: params must be awaited
  const { role } = await params;

  // Security gate: DEMO_MODE must be explicitly true
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Demo mode is disabled on this server." },
      { status: 403 }
    );
  }

  const normalizedRole = role.toLowerCase() as Role;
  if (!VALID_ROLES.includes(normalizedRole)) {
    return NextResponse.json(
      { error: `Invalid role '${role}'. Valid options are: ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Lazily ensure seed data exists upon demo login (with advisory lock safety)
    await ensureSeeded();

    const targetEmail = `${normalizedRole}@aurora.test`;
    const user = await db.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: `Demo user for role '${role}' (${targetEmail}) could not be found.` },
        { status: 404 }
      );
    }

    const token = await signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId,
    });

    const cookieOpts = getAuthCookieOptions();
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspaceId,
      },
    });

    response.cookies.set(cookieOpts.name, token, cookieOpts);
    return response;
  } catch (error) {
    console.error("Demo login error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate demo user" },
      { status: 500 }
    );
  }
}
