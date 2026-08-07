import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export async function PUT(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`password:${user.id}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "New password must be 8 to 72 characters." }, { status: 400 });
  }

  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json({ error: "New password must be different." }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      sessionVersion: row.sessionVersion + 1,
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
