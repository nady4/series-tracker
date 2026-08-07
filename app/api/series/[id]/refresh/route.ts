import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { series as seriesTable, seriesInfo, users } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { checkAndPersist } from "@/lib/news/persist";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const originError = sameOriginResponse(_request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`refresh:${user.id}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  const { id } = await ctx.params;

  const row = await db
    .select({
      id: seriesTable.id,
      name: seriesInfo.name,
      premieredYear: seriesInfo.premieredYear,
      tvmazeId: seriesInfo.tvmazeId,
      tvmazeStatus: seriesInfo.tvmazeStatus,
    })
    .from(seriesTable)
    .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
    .where(and(eq(seriesTable.id, id), eq(seriesTable.userId, user.id)))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Series not found." }, { status: 404 });
  }

  const userRow = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!userRow) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const outcome = await checkAndPersist(
    { id: row.id, name: row.name, year: row.premieredYear, tvmazeId: row.tvmazeId, tvmazeStatus: row.tvmazeStatus },
    {
      byokKeyEnc: userRow.byokKeyEnc,
      byokBaseUrl: userRow.byokBaseUrl,
      byokModel: userRow.byokModel,
      byokVerifiedAt: userRow.byokVerifiedAt,
    },
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.busy ? 409 : 502 });
  }

  return NextResponse.json({ ok: true, ...outcome.check });
}
