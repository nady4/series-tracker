import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sameOriginResponse } from "@/lib/api-helpers";
import { consumeRateLimit, rateLimitResponse, requestAddress } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72),
});

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const rate = await consumeRateLimit(`register:${requestAddress(request)}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    passwordHash,
  });

  return NextResponse.json({ ok: true });
}
