import fs from "node:fs";
import path from "node:path";

function loadEnv(file: string): void {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));

  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { users, series: seriesTable, seriesInfo } = await import("../db/schema");
  const { checkAndPersist } = await import("../lib/news/persist");

  const email = process.argv[2] ?? "dev@nady4.com";
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const rows = await db
    .select({
      id: seriesTable.id,
      name: seriesInfo.name,
      premieredYear: seriesInfo.premieredYear,
      tvmazeId: seriesInfo.tvmazeId,
      tvmazeStatus: seriesInfo.tvmazeStatus,
    })
    .from(seriesTable)
    .innerJoin(seriesInfo, eq(seriesTable.seriesInfoId, seriesInfo.id))
    .where(eq(seriesTable.userId, user.id));

  console.log(`Refreshing ${rows.length} series for ${email}...\n`);

  for (const s of rows) {
    const outcome = await checkAndPersist(
      { id: s.id, name: s.name, year: s.premieredYear, tvmazeId: s.tvmazeId, tvmazeStatus: s.tvmazeStatus },
      {
        byokKeyEnc: user.byokKeyEnc,
        byokBaseUrl: user.byokBaseUrl,
        byokModel: user.byokModel,
        byokVerifiedAt: user.byokVerifiedAt,
      },
    );
    if (outcome.ok) {
      const row = await db
        .select({
          lastEpisodeReleaseDate: seriesTable.lastEpisodeReleaseDate,
          lastEpisodeSeasonNumber: seriesTable.lastEpisodeSeasonNumber,
          lastEpisodeNumber: seriesTable.lastEpisodeNumber,
        })
        .from(seriesTable)
        .where(eq(seriesTable.id, s.id))
        .get();
      console.log(
        `OK  ${s.name} [${outcome.check.provider}/${outcome.check.modelUsed}] status=${outcome.check.result.showStatus} episode=${row?.lastEpisodeSeasonNumber && row.lastEpisodeNumber ? `S${String(row.lastEpisodeSeasonNumber).padStart(2, "0")} E${String(row.lastEpisodeNumber).padStart(2, "0")}` : "none"} date=${row?.lastEpisodeReleaseDate ?? "none"}`,
      );
    } else {
      console.error(`ERR ${s.name}: ${outcome.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
