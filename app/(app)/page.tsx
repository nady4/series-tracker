import { asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { series as seriesTable, seriesInfo, seriesNews, users } from "@/db/schema";
import { AddSeries } from "@/components/add-series";
import { BrandMark } from "@/components/brand-mark";
import { SeriesCard, type SeriesCardData } from "@/components/series-card";
import { seriesLimitFor } from "@/lib/keys";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userRow = await db
    .select({ byokKeyEnc: users.byokKeyEnc, byokVerifiedAt: users.byokVerifiedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();
  const limit = seriesLimitFor({
    byokKeyEnc: userRow?.byokKeyEnc ?? null,
    byokVerifiedAt: userRow?.byokVerifiedAt ?? null,
  });

  const rows = await db
    .select({
      id: seriesTable.id,
      name: seriesInfo.name,
      imageUrl: seriesInfo.imageUrl,
      premieredYear: seriesInfo.premieredYear,
      tvmazeStatus: seriesInfo.tvmazeStatus,
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
    .where(eq(seriesTable.userId, session.user.id))
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
  const historyBySeries = new Map<string, (typeof newsRows)>();
  for (const n of newsRows) {
    if (!latestBySeries.has(n.seriesId)) latestBySeries.set(n.seriesId, n);
    const history = historyBySeries.get(n.seriesId) ?? [];
    if (history.length < 5) history.push(n);
    historyBySeries.set(n.seriesId, history);
  }

  const cards: SeriesCardData[] = rows.map((r) => {
    const n = latestBySeries.get(r.id);
    return {
      id: r.id,
      name: r.name,
      imageUrl: r.imageUrl,
      premieredYear: r.premieredYear,
      tvmazeStatus: r.tvmazeStatus,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      lastCheckAttemptAt: r.lastCheckAttemptAt?.toISOString() ?? null,
      checkStatus: r.checkStatus,
      lastCheckError: r.lastCheckError,
      lastEpisodeReleaseDate: r.lastEpisodeReleaseDate ?? null,
      lastEpisodeSeasonNumber: r.lastEpisodeSeasonNumber ?? null,
      lastEpisodeNumber: r.lastEpisodeNumber ?? null,
      latestNews: n
        ? {
            id: n.id,
            checkedAt: n.checkedAt.toISOString(),
            showStatus: n.showStatus ?? "unknown",
            hasNextSeasonNews: n.hasNextSeasonNews,
            hasChanges: n.hasChanges,
            nextSeason: n.nextSeason,
            summary: n.summary,
            sources: n.sources,
            provider: n.provider,
            modelUsed: n.modelUsed,
          }
        : null,
      history: (historyBySeries.get(r.id) ?? []).map((entry) => ({
        checkedAt: entry.checkedAt.toISOString(),
        showStatus: entry.showStatus ?? "unknown",
        summary: entry.summary,
        hasChanges: entry.hasChanges,
      })),
    };
  }).sort((a, b) => {
    const priority = (card: SeriesCardData) => {
      if (card.checkStatus === "failed") return 0;
      if (card.checkStatus === "checking" || card.checkStatus === "queued") return 1;
      if (card.latestNews?.hasChanges) return 2;
      if (card.checkStatus === "no_key") return 3;
      return 4;
    };
    return priority(a) - priority(b);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your series</h1>
          <p className="sub">Latest status and episode updates for every show you track.</p>
        </div>
        <span className="limit-chip">
          {limit === null ? (
            <>
              <b>Unlimited</b> series · BYOK
            </>
          ) : (
            <>
              <b>
                {rows.length} / {limit}
              </b>{" "}
              series · free tier
            </>
          )}
        </span>
      </div>

      <AddSeries limit={limit} count={rows.length} />

      {cards.length === 0 ? (
        <div className="empty-state">
          <div className="empty-mark">
            <BrandMark />
          </div>
          <h3>Nothing tracked yet</h3>
          <p>
            Search for a series above to start tracking it. News checks run daily — or{" "}
            <Link href="/settings">bring your own LLM key</Link> to unlock unlimited series.
          </p>
        </div>
      ) : (
        <div className="series-grid">
          {cards.map((c) => (
            <SeriesCard key={c.id} series={c} />
          ))}
        </div>
      )}
    </>
  );
}
