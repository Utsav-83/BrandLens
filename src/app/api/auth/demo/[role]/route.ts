import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, getAuthCookieOptions } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { assertSameOrigin } from "@/lib/guards";
import { checkRateLimit } from "@/lib/ratelimit";
import { DEMO_LOGIN_RATE_LIMIT } from "@/lib/rate-limit-policy";
import { demoRoleSchema } from "@/lib/validation";

export const runtime = "nodejs";

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
      { status: 404 }
    );
  }

  const parsedRole = demoRoleSchema.safeParse(role.toLowerCase());
  if (!parsedRole.success) {
    return NextResponse.json(
      { error: `Invalid role '${role}'. Valid options are: creator, manager, reviewer, admin` },
      { status: 400 }
    );
  }
  const normalizedRole = parsedRole.data;

  // Rate limit: 10 attempts per 10 minutes keyed by IP from x-forwarded-for first value, fallback to "unknown"
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const rateLimit = await checkRateLimit(
    `demo-auth:${ip}`,
    DEMO_LOGIN_RATE_LIMIT.attempts,
    DEMO_LOGIN_RATE_LIMIT.windowSeconds
  );
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: "Too many demo authentication attempts. Please try again later.",
        resetTime: rateLimit.resetTime.toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      }
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
