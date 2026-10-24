import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, signToken, getAuthCookieOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/guards";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  // Rate limit: 20 login attempts per IP/key per 5 minutes
  const ip = request.headers.get("x-forwarded-for") || "client_ip";
  const rateLimit = await checkRateLimit(`login:${ip}`, 20, 300);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": "300" } }
    );
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
