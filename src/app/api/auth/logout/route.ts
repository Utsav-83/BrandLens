import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getAuthCookieOptions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/guards";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const cookieOpts = getAuthCookieOptions(0);
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...cookieOpts,
    maxAge: 0,
  });

  return response;
}
