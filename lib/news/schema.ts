import { z } from "zod";

export const sourceSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "Source URLs must use HTTP or HTTPS.",
    }),
});

export const nextSeasonSchema = z.object({
  seasonNumber: z.number().int().positive().nullish(),
  episodeNumber: z.number().int().positive().nullish(),
  releaseWindow: z.string().trim().max(200).nullish(),
  premiereDate: z.string().trim().max(20).nullish(),
  approximate: z.boolean().default(true),
  confirmed: z.boolean().default(false),
  details: z.string().trim().max(1000).nullish(),
  sources: z.array(sourceSchema).max(20).default([]),
});

export const newsResultSchema = z.object({
  showStatus: z
    .enum(["in_air", "returning", "upcoming", "ended", "cancelled", "unknown"])
    .default("unknown"),
  lastEpisodeReleaseDate: z.string().nullish(),
  lastEpisodeSeasonNumber: z.number().int().positive().nullish(),
  lastEpisodeNumber: z.number().int().positive().nullish(),
  hasNextSeasonNews: z.boolean().default(false),
  nextSeason: nextSeasonSchema.nullish(),
  summary: z.string().trim().max(1000).nullish(),
  sources: z.array(sourceSchema).max(20).default([]),
});

export type NewsResult = z.infer<typeof newsResultSchema>;
export type NextSeasonInfo = z.infer<typeof nextSeasonSchema>;
export type StoredShowStatus =
  | "in_air"
  | "returning"
  | "upcoming"
  | "ended"
  | "cancelled"
  | "unknown";

export function normalizeShowStatus(
  status: NewsResult["showStatus"],
  tvmazeStatus?: string | null,
): StoredShowStatus {
  if (status === "ended" || status === "cancelled" || status === "returning" || status === "upcoming") {
    return status;
  }
  const sourceStatus = tvmazeStatus?.toLowerCase();
  if (sourceStatus?.includes("cancel")) return "cancelled";
  if (sourceStatus === "ended") return "ended";
  return status === "in_air" ? "in_air" : "unknown";
}

export const SYSTEM_PROMPT = `You track the latest known status and episode updates for TV shows.
You are given a show and, in some cases, the latest available news articles about it.

Rules:
- Respond ONLY with valid JSON, no markdown fences, no extra text.
- "showStatus": return "cancelled" when the evidence says the show was cancelled, will end after its current/final season, or will not return. Return "ended" only when it has conclusively finished without a cancellation signal. Return "returning" for a confirmed future return and "upcoming" for a show that has not premiered yet. Use "in_air" only when the show is currently active and the evidence does not establish a more specific state. Use "unknown" when the provided articles do not establish a status.
- "lastEpisodeReleaseDate": the exact ISO date (YYYY-MM-DD) of the most recently released episode, not a season premiere or future episode. Return null when the articles do not establish it.
- "lastEpisodeSeasonNumber" and "lastEpisodeNumber": the season and episode number for that last released episode when the articles establish them.
- "hasNextSeasonNews": true only if there is concrete news about a new season (announcement, renewal, premiere date, filming, trailer).
- "nextSeason": fill with any season details found. Leave null if nothing concrete.
- "nextSeason.seasonNumber": the season that will air NEXT (e.g. if season 3 is airing, that is season 4).
- "nextSeason.episodeNumber": the next episode/chapter number when the article is about a specific episode; otherwise null.
- "nextSeason.premiereDate": exact ISO date (YYYY-MM-DD) ONLY when explicitly stated; otherwise null and put the window ("September 2026", "early 2027") in "releaseWindow".
- When next-season or next-episode news includes an estimated date or range, put that estimate in "releaseWindow". Never invent a date or range.
- "nextSeason.approximate": true whenever the date/window is an estimate, inference, or "expected/expected date not confirmed" phrasing. Only false with an official date.
- "nextSeason.confirmed": true ONLY when an official source (network, studio, streaming service, official accounts) confirms the season or date. False for rumors and unconfirmed reports.
- "details": 1-3 sentences describing what is known, including who announced it.
- "sources": only include articles actually provided (title + url). Do not invent URLs. Include no more than 3 sources in each sources array.
- "summary": one concise line about the current situation, or "No news found for this series."`;

export function buildShowContext(name: string, year: number | null): string {
  return `Show: "${name}"${year ? ` (first aired ${year})` : ""}`;
}
