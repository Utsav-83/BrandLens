import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { Role } from "@/generated/prisma";

export const AUTH_COOKIE_NAME = "brandlens_token";
const JWT_EXPIRY = "8h";

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  workspaceId: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  workspaceId: string;
}

/**
 * Validates that JWT_SECRET is configured with at least 32 characters in production.
 * Throws a clear error without leaking the secret.
 */
export function validateJwtSecret(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  secret: string | undefined = process.env.JWT_SECRET
): void {
  if (nodeEnv === "production") {
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET environment variable is missing or shorter than 32 characters in production.");
    }
  }
}

// Startup safety check in production
if (process.env.NODE_ENV === "production") {
  validateJwtSecret();
}

function getJwtSecretKey(): Uint8Array {
  validateJwtSecret();
  const secret = process.env.JWT_SECRET || "brandlens-fallback-jwt-secret-minimum-32-chars";
  return new TextEncoder().encode(secret);
}

/**
 * Hash password with bcryptjs
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verify password with bcryptjs
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign JWT token using jose
 */
export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecretKey());
}

/**
 * Verify JWT token using jose
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecretKey());
    return verified.payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Get cookie options for response
 */
export function getAuthCookieOptions(maxAgeSeconds = 8 * 60 * 60) {
  return {
    name: AUTH_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Fetch currently authenticated user on the server.
 * Awaits cookies() per Next.js 16 requirements.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      return null;
    }

    const payload = await verifyToken(token);
    if (!payload?.userId) {
      return null;
    }

    // Retrieve user from DB to ensure they still exist and role is current
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workspaceId: true,
      },
    });

    if (!user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}
