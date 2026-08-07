import { z } from "zod";

const MAX_RESPONSE_BYTES = 2_000_000;

export type TvmazeSearchResult = {
  id: number;
  name: string;
  premiered: string | null;
  year: number | null;
  genres: string[];
  status: string | null;
  image: string | null;
  summary: string | null;
};

type RawShow = {
  id: number;
  name: string;
  premiered?: string | null;
  genres?: string[];
  status?: string | null;
  image?: { medium?: string | null; original?: string | null } | null;
  summary?: string | null;
};

const rawShowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(300),
  premiered: z.string().nullable().optional(),
  genres: z.array(z.string().max(100)).max(20).optional(),
  status: z.string().max(100).nullable().optional(),
  image: z
    .object({ medium: z.string().url().nullable().optional(), original: z.string().url().nullable().optional() })
    .nullable()
    .optional(),
  summary: z.string().max(10000).nullable().optional(),
});

function mapShow(show: RawShow): TvmazeSearchResult {
  return {
    id: show.id,
    name: show.name,
    premiered: show.premiered ?? null,
    year: show.premiered ? new Date(show.premiered).getFullYear() : null,
    genres: show.genres ?? [],
    status: show.status ?? null,
    image: show.image?.original ?? show.image?.medium ?? null,
    summary: show.summary ?? null,
  };
}

export async function searchShows(query: string): Promise<TvmazeSearchResult[]> {
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`TVMaze search failed (${res.status})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    throw new Error("TVMaze response was too large.");
  }
  const raw: unknown = await res.json();
  const data = z.array(z.object({ show: rawShowSchema, score: z.number() })).safeParse(raw);
  if (!data.success) throw new Error("TVMaze returned an invalid search response.");
  return data.data.slice(0, 8).map((d) => mapShow(d.show));
}

export async function getShow(id: number): Promise<TvmazeSearchResult> {
  const url = `https://api.tvmaze.com/shows/${id}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`TVMaze fetch failed (${res.status})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    throw new Error("TVMaze response was too large.");
  }
  const data = rawShowSchema.safeParse(await res.json());
  if (!data.success) throw new Error("TVMaze returned an invalid show response.");
  return mapShow(data.data);
}
