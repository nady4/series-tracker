import crypto from "node:crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { series as seriesTable, seriesInfo, seriesNews, users } from "@/db/schema";
import { requireUser, sameOriginResponse } from "@/lib/api-helpers";
import { getShow } from "@/lib/tvmaze";
import { seriesLimitFor } from "@/lib/keys";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const addSchema = z.object({ tvmazeId: z.number().int().positive() });
const HARD_SERIES_LIMIT = 500;

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const rows = await db
    .select({
      id: seriesTable.id,
      userId: seriesTable.userId,
      seriesInfoId: seriesTable.seriesInfoId,
      tvmazeId: seriesInfo.tvmazeId,
      name: seriesInfo.name,
      imageUrl: seriesInfo.imageUrl,
      premieredYear: seriesInfo.premieredYear,
      genres: seriesInfo.genres,
      tvmazeStatus: seriesInfo.tvmazeStatus,
      summary: seriesInfo.summary,
      lastCheckedAt: seriesTable.lastCheckedAt,
      lastCheckAttemptAt: seriesTable.lastCheckAttemptAt,
      checkStatus: seriesTable.checkStatus,
      lastCheckError: seriesTable.lastCheckError,
      lastEpisodeReleaseDate: seriesTable.lastEpisodeReleaseDate,
      lastEpisodeSeasonNumber: seriesTable.lastEpisodeSeasonNumber,
      lastEpisodeNumber: seriesTable.lastEpisodeNumber,
      createdAt: seriesTable.createdAt,
    })
    .from(seriesTable)
    .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
    .where(eq(seriesTable.userId, user.id))
    .orderBy(asc(seriesTable.createdAt));

  const ids = rows.map((r) => r.id);
  const newsRows =
    ids.length > 0
      ? await db
          .select()
          .from(seriesNews)
          .where(inArray(seriesNews.seriesId, ids))
          .orderBy(desc(seriesNews.checkedAt))
      : [];

  const latestBySeries = new Map<string, (typeof newsRows)[number]>();
  for (const n of newsRows) {
    if (!latestBySeries.has(n.seriesId)) latestBySeries.set(n.seriesId, n);
  }

  const userRow = await db
    .select({ byokKeyEnc: users.byokKeyEnc })
    .from(users)
    .where(eq(users.id, user.id))
    .get();

  return NextResponse.json({
    series: rows.map((r) => ({ ...r, latestNews: latestBySeries.get(r.id) ?? null })),
    limit: seriesLimitFor({ byokKeyEnc: userRow?.byokKeyEnc ?? null }),
    count: rows.length,
  });
}

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;

  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = await consumeRateLimit(`add-series:${user.id}`, 30, 10 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid series id." }, { status: 400 });
  }

  const userRow = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!userRow) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db
    .select({ id: seriesTable.id })
    .from(seriesTable)
    .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
    .where(and(eq(seriesTable.userId, user.id), eq(seriesInfo.tvmazeId, parsed.data.tvmazeId)))
    .get();
  if (existing) {
    return NextResponse.json({ error: "This series is already on your list." }, { status: 409 });
  }

  const limit = seriesLimitFor(userRow);
  const effectiveLimit = limit ?? HARD_SERIES_LIMIT;

  let info = await db
    .select()
    .from(seriesInfo)
    .where(eq(seriesInfo.tvmazeId, parsed.data.tvmazeId))
    .get();

  if (!info) {
    let show;
    try {
      show = await getShow(parsed.data.tvmazeId);
    } catch {
      return NextResponse.json({ error: "Could not fetch that series from TVMaze." }, { status: 502 });
    }

    await db
      .insert(seriesInfo)
      .values({
        id: crypto.randomUUID(),
        tvmazeId: show.id,
        name: show.name,
        imageUrl: show.image,
        premieredYear: show.year,
        genres: show.genres,
        tvmazeStatus: show.status,
        summary: show.summary,
      })
      .onConflictDoNothing({ target: seriesInfo.tvmazeId });

    info = await db.select().from(seriesInfo).where(eq(seriesInfo.tvmazeId, show.id)).get();
  }

  if (!info) {
    return NextResponse.json({ error: "Could not cache that series." }, { status: 502 });
  }

  const insertion = await db.transaction(async (tx) => {
    const seriesCount = await tx
      .select({ n: count() })
      .from(seriesTable)
      .where(eq(seriesTable.userId, user.id))
      .get();
    if ((seriesCount?.n ?? 0) >= effectiveLimit) {
      return { row: null, limitReached: true };
    }

    const row = await tx
      .insert(seriesTable)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        seriesInfoId: info.id,
        checkStatus: "queued",
      })
      .onConflictDoNothing({ target: [seriesTable.userId, seriesTable.seriesInfoId] })
      .returning();
    return { row: row[0] ?? null, limitReached: false };
  });

  if (insertion.limitReached) {
    return NextResponse.json(
      {
        error:
          limit === null
            ? `This account has reached the ${HARD_SERIES_LIMIT}-series operational limit.`
            : `Free tier allows up to ${limit} series. Add your own LLM API key in Settings to track more.`,
      },
      { status: 403 },
    );
  }

  const row = insertion.row ? [insertion.row] : [];

  if (row.length === 0) {
    return NextResponse.json({ error: "This series is already on your list." }, { status: 409 });
  }

  return NextResponse.json({
    series: {
      ...row[0],
      tvmazeId: info.tvmazeId,
      name: info.name,
      imageUrl: info.imageUrl,
      premieredYear: info.premieredYear,
      genres: info.genres,
      tvmazeStatus: info.tvmazeStatus,
      summary: info.summary,
    },
  });
}
