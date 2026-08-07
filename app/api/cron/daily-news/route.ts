import { and, asc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { series as seriesTable, seriesInfo, users } from "@/db/schema";
import { checkAndPersist } from "@/lib/news/persist";
import { logEvent } from "@/lib/observability";

export const maxDuration = 60;

const BATCH_SIZE = 8;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  }
  const authorized = authHeader === `Bearer ${secret}`;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - CHECK_INTERVAL_MS);
  const retryCutoff = new Date(Date.now() - 60 * 60 * 1000);
  const staleClaim = new Date(Date.now() - CLAIM_TIMEOUT_MS);

  const due = await db
    .select({
      id: seriesTable.id,
      userId: seriesTable.userId,
      name: seriesInfo.name,
      premieredYear: seriesInfo.premieredYear,
      tvmazeId: seriesInfo.tvmazeId,
      tvmazeStatus: seriesInfo.tvmazeStatus,
    })
    .from(seriesTable)
    .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
    .where(
      and(
        or(
          and(
            or(eq(seriesTable.checkStatus, "queued"), eq(seriesTable.checkStatus, "failed")),
            or(isNull(seriesTable.lastCheckAttemptAt), lt(seriesTable.lastCheckAttemptAt, retryCutoff)),
          ),
          and(
            or(eq(seriesTable.checkStatus, "checked"), eq(seriesTable.checkStatus, "no_key")),
            or(isNull(seriesTable.lastCheckAttemptAt), lt(seriesTable.lastCheckAttemptAt, cutoff)),
          ),
          isNull(seriesTable.lastCheckAttemptAt),
        ),
        or(
          ne(seriesTable.checkStatus, "checking"),
          isNull(seriesTable.checkClaimedAt),
          lt(seriesTable.checkClaimedAt, staleClaim),
        ),
      ),
    )
    .orderBy(asc(seriesTable.lastCheckAttemptAt))
    .limit(BATCH_SIZE);

  const processed: { id: string; name: string; ok: boolean; error?: string }[] = [];

  await Promise.all(
    due.map(async (show) => {
      const user = await db.select().from(users).where(eq(users.id, show.userId)).get();
      if (!user) return;

      const outcome = await checkAndPersist(
        { id: show.id, name: show.name, year: show.premieredYear, tvmazeId: show.tvmazeId, tvmazeStatus: show.tvmazeStatus },
        {
          byokKeyEnc: user.byokKeyEnc,
          byokBaseUrl: user.byokBaseUrl,
          byokModel: user.byokModel,
          byokVerifiedAt: user.byokVerifiedAt,
        },
      );

      processed.push(
        outcome.ok
          ? { id: show.id, name: show.name, ok: true }
          : { id: show.id, name: show.name, ok: false, error: outcome.error },
      );
    }),
  );

  const skipped = due.length - processed.length;
  logEvent("daily_news_batch_completed", {
    due: due.length,
    processed: processed.length,
    successful: processed.filter((item) => item.ok).length,
    skipped,
  });
  return NextResponse.json({ processed, skipped });
}
