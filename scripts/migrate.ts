import { migrate } from "drizzle-orm/libsql/migrator";
import { client, db } from "../db";

const LEGACY_BASELINE_MILLIS = 1785785397384;

async function baselineExistingPushDatabase() {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)",
  );
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('series', 'series_info', 'users')",
  );
  if (tables.rows.length < 3) return;

  const migrations = await client.execute("SELECT COUNT(*) AS count FROM __drizzle_migrations");
  const migrationCount = Number((migrations.rows[0] as { count?: number }).count ?? 0);
  const columns = await client.execute("PRAGMA table_info('series')");
  const hasNormalizedSchema = columns.rows.some(
    (row) => (row as { name?: string }).name === "series_info_id",
  );
  if (!hasNormalizedSchema) {
    if (migrationCount === 0) {
      throw new Error(
        "Existing database has no migration history and is not on the normalized schema. Back it up and migrate it manually.",
      );
    }
    throw new Error(
      "Migration history does not match the database schema. Restore a backup or manually complete the series normalization before migrating.",
    );
  }
  if (migrationCount !== 0) return;

  await client.execute({
    sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: ["legacy-push-baseline", LEGACY_BASELINE_MILLIS],
  });
  console.log("Baselined an existing Drizzle-push database.");
}

async function main() {
  await baselineExistingPushDatabase();
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
