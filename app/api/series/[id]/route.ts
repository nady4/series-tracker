import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { series as seriesTable, seriesNews } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const originError = sameOriginResponse(_request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`remove-series:${user.id}`, 30, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  const { id } = await ctx.params;

  const row = await db
    .select({ id: seriesTable.id })
    .from(seriesTable)
    .where(and(eq(seriesTable.id, id), eq(seriesTable.userId, user.id)))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Series not found." }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(seriesNews).where(eq(seriesNews.seriesId, id));
    await tx.delete(seriesTable).where(eq(seriesTable.id, id));
  });

  return NextResponse.json({ ok: true });
}
