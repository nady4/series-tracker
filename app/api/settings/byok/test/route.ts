import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { assertSafeProviderBaseUrl } from "@/lib/security/provider-url";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const testSchema = z.object({
  apiKey: z.string().max(500).optional().default(""),
  baseUrl: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().max(200).optional().default(""),
});

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`byok-test:${user.id}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = testSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { apiKey, baseUrl, model } = parsed.data;

  const row = await db.select().from(users).where(eq(users.id, user.id)).get();
  const savedBaseUrl = row?.byokBaseUrl ?? "";
  const savedModel = row?.byokModel ?? "";
  const fallbackBaseUrl = process.env.FALLBACK_LLM_BASE_URL || "https://api.openai.com/v1";
  const fallbackModel = process.env.FALLBACK_LLM_MODEL || "gpt-4o-mini";

  let key = apiKey;
  let source: "byok" | "fallback";
  let effectiveBaseUrl: string;
  let effectiveModel: string;

  if (key) {
    source = "byok";
    effectiveBaseUrl = baseUrl || savedBaseUrl || "https://api.openai.com/v1";
    effectiveModel = model || savedModel || "gpt-4o-mini";
  } else if (row?.byokKeyEnc) {
    try {
      key = decryptSecret(row.byokKeyEnc);
    } catch {
      return NextResponse.json({ error: "Saved key could not be decrypted." }, { status: 400 });
    }
    if (baseUrl && baseUrl !== savedBaseUrl) {
      return NextResponse.json(
        { error: "Enter a new API key before testing a different provider URL." },
        { status: 400 },
      );
    }
    source = "byok";
    effectiveBaseUrl = savedBaseUrl || "https://api.openai.com/v1";
    effectiveModel = model || savedModel || "gpt-4o-mini";
  } else {
    key = process.env.FALLBACK_LLM_API_KEY ?? "";
    if (!key) {
      return NextResponse.json(
        { error: "No key to test. Save a key or configure FALLBACK_LLM_API_KEY." },
        { status: 400 },
      );
    }
    if (baseUrl && baseUrl !== fallbackBaseUrl) {
      return NextResponse.json(
        { error: "A custom provider URL requires your own API key." },
        { status: 400 },
      );
    }
    source = "fallback";
    effectiveBaseUrl = fallbackBaseUrl;
    effectiveModel = fallbackModel;
  }

  try {
    effectiveBaseUrl = await assertSafeProviderBaseUrl(effectiveBaseUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid provider base URL." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
        `${effectiveBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { error: "Key rejected by provider (401/403)." },
        { status: 402 },
      );
    }
    if (res.status === 404) {
      return NextResponse.json({ error: `Model "${effectiveModel}" not found.` }, { status: 402 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Provider error (${res.status}).` },
        { status: 402 },
      );
    }
    const data = (await res.json()) as { model?: string };
    if (source === "byok" && row?.byokKeyEnc && !apiKey) {
      await db
        .update(users)
        .set({ byokVerifiedAt: new Date() })
        .where(eq(users.id, user.id));
    }
    return NextResponse.json({ ok: true, model: data.model ?? effectiveModel, baseUrl: effectiveBaseUrl, source });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the provider." },
      { status: 402 },
    );
  }
}
