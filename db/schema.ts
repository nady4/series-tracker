import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type Source = { title: string; url: string };

export type NextSeasonInfo = {
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  releaseWindow?: string | null;
  premiereDate?: string | null;
  approximate: boolean;
  confirmed: boolean;
  details?: string | null;
  sources?: Source[];
};

export type StoredShowStatus =
  | "in_air"
  | "returning"
  | "upcoming"
  | "ended"
  | "cancelled"
  | "unknown";

export type NewsPayload = {
  showStatus: StoredShowStatus;
  hasNextSeasonNews: boolean;
  nextSeason?: NextSeasonInfo | null;
  summary?: string;
  sources?: Source[];
};

export type CheckStatus = "queued" | "checking" | "checked" | "failed" | "no_key";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    sessionVersion: integer("session_version").notNull().default(1),
    byokKeyEnc: text("byok_key_enc"),
    byokBaseUrl: text("byok_base_url"),
    byokModel: text("byok_model"),
    byokVerifiedAt: integer("byok_verified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const seriesInfo = sqliteTable(
  "series_info",
  {
    id: text("id").primaryKey(),
    tvmazeId: integer("tvmaze_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    premieredYear: integer("premiered_year"),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    tvmazeStatus: text("tvmaze_status"),
    summary: text("summary"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("series_info_tvmaze_idx").on(t.tvmazeId)],
);

export const series = sqliteTable(
  "series",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seriesInfoId: text("series_info_id")
      .notNull()
      .references(() => seriesInfo.id),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
    lastCheckAttemptAt: integer("last_check_attempt_at", { mode: "timestamp" }),
    checkClaimedAt: integer("check_claimed_at", { mode: "timestamp" }),
    checkStatus: text("check_status").$type<CheckStatus>().notNull().default("queued"),
    lastCheckError: text("last_check_error"),
    lastEpisodeReleaseDate: text("last_episode_release_date"),
    lastEpisodeSeasonNumber: integer("last_episode_season_number"),
    lastEpisodeNumber: integer("last_episode_number"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("series_user_show_idx").on(t.userId, t.seriesInfoId),
    index("series_user_idx").on(t.userId),
    index("series_check_due_idx").on(t.checkStatus, t.lastCheckAttemptAt),
  ],
);

export const seriesNews = sqliteTable(
  "series_news",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
    showStatus: text("show_status").$type<NewsPayload["showStatus"]>(),
    hasNextSeasonNews: integer("has_next_season_news", { mode: "boolean" })
      .notNull()
      .default(false),
    hasChanges: integer("has_changes", { mode: "boolean" }).notNull().default(false),
    nextSeason: text("next_season", { mode: "json" }).$type<NewsPayload["nextSeason"]>(),
    summary: text("summary"),
    sources: text("sources", { mode: "json" }).$type<Source[]>(),
    provider: text("provider"),
    modelUsed: text("model_used"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("series_news_series_idx").on(t.seriesId),
    index("series_news_series_checked_idx").on(t.seriesId, t.checkedAt),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
);
