import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { assertSafeProviderBaseUrl } from "@/lib/security/provider-url";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { hasByok } from "@/lib/keys";

const putSchema = z.object({
  apiKey: z.string().max(500).optional().default(""),
  baseUrl: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().max(200).optional().default(""),
});

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    hasKey: Boolean(row.byokKeyEnc),
    verified: hasByok(row),
    maskedKey: row.byokKeyEnc ? "saved" : null,
    baseUrl: row.byokBaseUrl ?? "",
    model: row.byokModel ?? "",
  });
}

export async function PUT(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`byok-save:${user.id}`, 20, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { apiKey, baseUrl, model } = parsed.data;

  if (baseUrl) {
    try {
      await assertSafeProviderBaseUrl(baseUrl);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid provider base URL." },
        { status: 400 },
      );
    }
  }

  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasStoredKey = Boolean(row.byokKeyEnc);
  if (!apiKey && !hasStoredKey && (baseUrl || model)) {
    return NextResponse.json(
      { error: "Save your own API key before configuring a custom provider or model." },
      { status: 400 },
    );
  }

  const updates: Partial<typeof users.$inferInsert> = {
    byokBaseUrl: apiKey || hasStoredKey ? baseUrl || null : null,
    byokModel: apiKey || hasStoredKey ? model || null : null,
  };
  if (apiKey) {
    if (apiKey.length < 8) {
      return NextResponse.json({ error: "API key looks too short." }, { status: 400 });
    }
    updates.byokKeyEnc = encryptSecret(apiKey);
    updates.byokVerifiedAt = null;
  } else if (!row.byokKeyEnc) {
    // no new key and no saved one -> keep current unless clearing via DELETE
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  return NextResponse.json({
    hasKey: Boolean(updates.byokKeyEnc ?? row.byokKeyEnc),
    verified: apiKey ? false : hasByok(row),
    maskedKey: updates.byokKeyEnc ? "saved" : row.byokKeyEnc ? "saved" : null,
    baseUrl: updates.byokBaseUrl ?? row.byokBaseUrl ?? "",
    model: updates.byokModel ?? row.byokModel ?? "",
  });
}

export async function DELETE(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`byok-delete:${user.id}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  await db
    .update(users)
    .set({ byokKeyEnc: null, byokBaseUrl: null, byokModel: null, byokVerifiedAt: null })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
