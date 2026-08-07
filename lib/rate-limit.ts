import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowCutoff = now - windowMs;

  await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} <= ${windowCutoff} THEN ${now} ELSE ${rateLimits.windowStart} END`,
        count: sql`CASE WHEN ${rateLimits.windowStart} <= ${windowCutoff} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      },
    })
    .run();

  const current = await db
    .select({ windowStart: rateLimits.windowStart, count: rateLimits.count })
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .get();

  if (!current) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((current.windowStart + windowMs - now) / 1000),
  );
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds,
  };
}

export function requestAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}
