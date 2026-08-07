type Episode = { season?: number | null; number?: number | null; airdate?: string | null };
const MAX_RESPONSE_BYTES = 2_000_000;

export type LastEpisodeRelease = {
  date: string;
  seasonNumber: number;
  episodeNumber: number;
};

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Returns the latest released regular episode and its air date. */
export async function fetchTvmazeLastEpisodeRelease(
  tvmazeId: number,
): Promise<LastEpisodeRelease | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) return null;

  let episodes: Episode[];
  try {
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    episodes = data as Episode[];
  } catch {
    return null;
  }

  const dated = episodes
    .filter(
      (e) =>
        typeof e.season === "number" &&
        e.season > 0 &&
        typeof e.number === "number" &&
        e.number > 0 &&
        isValidDate(e.airdate ?? ""),
    )
    .map((e) => ({
      date: e.airdate as string,
      seasonNumber: e.season as number,
      episodeNumber: e.number as number,
    }));

  const today = new Date().toISOString().slice(0, 10);
  return dated.filter((episode) => episode.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}
