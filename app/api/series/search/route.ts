import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { series as seriesTable, seriesInfo } from "@/db/schema";
import { requireUser } from "@/lib/api-helpers";
import { searchShows } from "@/lib/tvmaze";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`search:${user.id}`, 30, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 1 || q.length > 100) {
    return NextResponse.json({ error: "Enter a search term." }, { status: 400 });
  }

  const cached = await db
    .select()
    .from(seriesInfo)
    .where(sql`instr(lower(${seriesInfo.name}), lower(${q})) > 0`)
    .limit(8);

  let results = cached.map((show) => ({
    id: show.tvmazeId,
    name: show.name,
    premiered: null as string | null,
    year: show.premieredYear,
    genres: show.genres ?? [],
    status: show.tvmazeStatus,
    image: show.imageUrl,
    summary: show.summary,
  }));

  if (results.length === 0) {
    try {
      results = await searchShows(q);
    } catch {
      return NextResponse.json({ error: "Search provider unavailable." }, { status: 502 });
    }
  }

  const trackedIds =
    results.length > 0
      ? new Set(
          (
            await db
              .select({ tvmazeId: seriesInfo.tvmazeId })
              .from(seriesTable)
              .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
              .where(
                and(
                  eq(seriesTable.userId, user.id),
                  inArray(seriesInfo.tvmazeId, results.map((result) => result.id)),
                ),
              )
          ).map((row) => row.tvmazeId),
        )
      : new Set<number>();

  return NextResponse.json({
    results: results.map((result) => ({ ...result, tracked: trackedIds.has(result.id) })),
  });
}
