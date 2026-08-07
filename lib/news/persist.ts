import crypto from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { series as seriesTable, seriesNews } from "@/db/schema";
import { resolveKey } from "@/lib/keys";
import { runNewsSearch, type NewsCheck } from "./engine";
import { normalizeShowStatus } from "./schema";
import { fetchTvmazeLastEpisodeRelease } from "./tvmaze";
import { logEvent } from "@/lib/observability";

export type CheckOutcome =
  | { ok: true; check: NewsCheck }
  | { ok: false; error: string; busy?: boolean };

const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
const NEWS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

async function claimCheck(seriesId: string): Promise<boolean> {
  const now = new Date();
  const staleClaim = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const claimed = await db
    .update(seriesTable)
    .set({
      checkStatus: "checking",
      checkClaimedAt: now,
      lastCheckAttemptAt: now,
      lastCheckError: null,
    })
    .where(
      and(
        eq(seriesTable.id, seriesId),
        or(
          isNull(seriesTable.checkClaimedAt),
          lt(seriesTable.checkClaimedAt, staleClaim),
          eq(seriesTable.checkStatus, "queued"),
          eq(seriesTable.checkStatus, "checked"),
          eq(seriesTable.checkStatus, "failed"),
          eq(seriesTable.checkStatus, "no_key"),
        ),
      ),
    )
    .returning({ id: seriesTable.id });
  return claimed.length > 0;
}

async function markFailure(seriesId: string, status: "failed" | "no_key", error: string) {
  await db
    .update(seriesTable)
    .set({
      checkStatus: status,
      checkClaimedAt: null,
      lastCheckError: error.slice(0, 500),
    })
    .where(eq(seriesTable.id, seriesId));
}

export async function checkAndPersist(show: {
  id: string;
  name: string;
  year: number | null;
  tvmazeId: number;
  tvmazeStatus: string | null;
}, user: {
  byokKeyEnc: string | null;
  byokBaseUrl: string | null;
  byokModel: string | null;
  byokVerifiedAt?: Date | null;
}): Promise<CheckOutcome> {
  const startedAt = Date.now();
  if (!(await claimCheck(show.id))) {
    return {
      ok: false,
      error: "A check is already in progress for this series.",
      busy: true,
    };
  }

  try {
    logEvent("news_check_started", { seriesId: show.id });
    const key = resolveKey(user);
    if (!key) {
      const error =
        "No LLM key available. Add your own API key in Settings or configure FALLBACK_LLM_API_KEY.";
      await markFailure(show.id, "no_key", error);
      logEvent("news_check_skipped", { seriesId: show.id, reason: "no_key" });
      return { ok: false, error };
    }

    const check = await runNewsSearch({ name: show.name, year: show.year }, key);
    const status = normalizeShowStatus(check.result.showStatus, show.tvmazeStatus);
    const tvmazeEpisode = await fetchTvmazeLastEpisodeRelease(show.tvmazeId);
    const lastEpisodeReleaseDate = tvmazeEpisode?.date ?? check.result.lastEpisodeReleaseDate ?? null;
    const lastEpisodeSeasonNumber =
      tvmazeEpisode?.seasonNumber ?? check.result.lastEpisodeSeasonNumber ?? null;
    const lastEpisodeNumber = tvmazeEpisode?.episodeNumber ?? check.result.lastEpisodeNumber ?? null;
    const normalizedCheck: NewsCheck = {
      ...check,
      result: {
        ...check.result,
        showStatus: status,
        lastEpisodeReleaseDate,
        lastEpisodeSeasonNumber,
        lastEpisodeNumber,
      },
    };

    const previous = await db
      .select({
        showStatus: seriesNews.showStatus,
        hasNextSeasonNews: seriesNews.hasNextSeasonNews,
        nextSeason: seriesNews.nextSeason,
        summary: seriesNews.summary,
      })
      .from(seriesNews)
      .where(eq(seriesNews.seriesId, show.id))
      .orderBy(desc(seriesNews.checkedAt))
      .limit(1)
      .get();
    const hasChanges = Boolean(
      previous &&
        JSON.stringify({
          showStatus: previous.showStatus,
          hasNextSeasonNews: previous.hasNextSeasonNews,
          nextSeason: previous.nextSeason,
          summary: previous.summary,
        }) !==
          JSON.stringify({
            showStatus: normalizedCheck.result.showStatus,
            hasNextSeasonNews: normalizedCheck.result.hasNextSeasonNews,
            nextSeason: normalizedCheck.result.nextSeason,
            summary: normalizedCheck.result.summary,
          }),
    );

    await db.transaction(async (tx) => {
      await tx.insert(seriesNews).values({
        id: crypto.randomUUID(),
        seriesId: show.id,
        checkedAt: new Date(),
        showStatus: status,
        hasNextSeasonNews: normalizedCheck.result.hasNextSeasonNews,
        hasChanges,
        nextSeason: normalizedCheck.result.nextSeason,
        summary: normalizedCheck.result.summary,
        sources: normalizedCheck.result.sources,
        provider: normalizedCheck.provider,
        modelUsed: normalizedCheck.modelUsed,
      });

      await tx
        .update(seriesTable)
        .set({
          lastCheckedAt: new Date(),
          checkStatus: "checked",
          checkClaimedAt: null,
          lastCheckError: null,
          lastEpisodeReleaseDate,
          lastEpisodeSeasonNumber,
          lastEpisodeNumber,
        })
        .where(eq(seriesTable.id, show.id));
    });

    await db
      .delete(seriesNews)
      .where(
        and(
          eq(seriesNews.seriesId, show.id),
          lt(seriesNews.checkedAt, new Date(Date.now() - NEWS_RETENTION_MS)),
        ),
      );

    logEvent("news_check_completed", {
      seriesId: show.id,
      provider: normalizedCheck.provider,
      model: normalizedCheck.modelUsed,
      status: normalizedCheck.result.showStatus,
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, check: normalizedCheck };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markFailure(show.id, "failed", message);
    logEvent("news_check_failed", {
      seriesId: show.id,
      durationMs: Date.now() - startedAt,
      error: message.slice(0, 200),
    });
    return { ok: false, error: message };
  }
}
