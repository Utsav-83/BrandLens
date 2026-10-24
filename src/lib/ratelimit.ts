import { db } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetTime: Date;
}

/**
 * Database-backed sliding window rate limiter suitable for serverless deployments.
 * Uses atomic upsert with increment on the RateLimit table.
 */
export async function checkRateLimit(
  key: string,
  limit: number = 10,
  windowSeconds: number = 600
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowDurationMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowDurationMs) * windowDurationMs);
  const resetTime = new Date(windowStart.getTime() + windowDurationMs);

  try {
    const entry = await db.rateLimit.upsert({
      where: {
        key_windowStart: {
          key,
          windowStart,
        },
      },
      update: {
        count: {
          increment: 1,
        },
      },
      create: {
        key,
        windowStart,
        count: 1,
      },
    });

    const count = entry.count;
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return {
      allowed,
      remaining,
      limit,
      resetTime,
    };
  } catch (error) {
    // If DB is temporarily unavailable for rate limiting, log warning and fail open for availability
    console.warn("Rate limit DB check error:", error);
    return {
      allowed: true,
      remaining: 1,
      limit,
      resetTime,
    };
  }
}
