"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type SearchResult = {
  id: number;
  name: string;
  premiered: string | null;
  year: number | null;
  genres: string[];
  status: string | null;
  image: string | null;
  summary: string | null;
  tracked?: boolean;
};

type Props = {
  limit: number | null;
  count: number;
};

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AddSeries({ limit, count }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const searchSeq = useRef(0);

  const remaining = limit === null ? null : Math.max(0, limit - count);
  const canAdd = remaining === null || remaining > 0;

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setError(null);
    setSearched(false);
    try {
      const res = await fetch(`/api/series/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (seq !== searchSeq.current) return;
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setError(err instanceof Error ? err.message : "Search failed.");
      setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [query]);

  const addSeries = useCallback(
    async (tvmazeId: number) => {
      setAddingId(tvmazeId);
      setError(null);
      try {
        const res = await fetch("/api/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tvmazeId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not add series.");

        const added = data.series as { id: string };
        setQuery("");
        setResults([]);
        setSearched(false);
        router.refresh();
        void fetch(`/api/series/${added.id}/refresh`, { method: "POST" }).catch(() => {
          // The queued card state remains visible and the scheduled check can retry later.
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add series.");
      } finally {
        setAddingId(null);
      }
    },
    [router],
  );

  return (
    <section className="add-panel" aria-busy={searching || addingId !== null}>
      <div className="add-row">
        <input
          className="input"
          aria-label="Search for a series"
          maxLength={100}
          placeholder="Search a series… e.g. Severance"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button className="btn btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
          {searching && <span className="spinner" />}
          Search
        </button>
      </div>

      <div className="search-status" aria-live="polite">
        {limit !== null
          ? `${count} / ${limit} series tracked`
          : `${count} series tracked · unlimited (BYOK)`}
        {!canAdd && limit !== null && (
          <span className="limit-reached">
            Free limit reached. <Link href="/settings">Add your own API key</Link> to track more.
          </span>
        )}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      {searching && <div className="search-status">Searching…</div>}
      {!searching && searched && results.length === 0 && (
        <div className="search-status">No series found for that query.</div>
      )}

      {results.length > 0 && (
        <div className="results">
          {results.map((r) => (
            <div className="result-row" key={r.id}>
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="result-thumb" src={r.image} alt="" loading="lazy" />
              ) : (
                <div className="result-thumb placeholder">{r.name.charAt(0)}</div>
              )}
              <div className="result-info">
                <div className="name">
                  {r.name} {r.year ? `(${r.year})` : ""}
                </div>
                <div className="meta">
                  {r.genres.join(" · ") || "TV"} · TVMaze status: {r.status ?? "unknown"}
                </div>
                {r.summary && <div className="summary">{stripHtml(r.summary)}</div>}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                 disabled={!canAdd || r.tracked || addingId === r.id}
                 onClick={() => addSeries(r.id)}
               >
                 {addingId === r.id && <span className="spinner" />}
                 {r.tracked ? "Tracking" : "Track"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
