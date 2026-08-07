"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Source = { title: string; url: string };
type NextSeasonInfo = {
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  releaseWindow?: string | null;
  premiereDate?: string | null;
  approximate: boolean;
  confirmed: boolean;
  details?: string | null;
  sources?: Source[];
};

type LatestNews = {
  id: string;
  checkedAt: string;
  showStatus: "in_air" | "returning" | "upcoming" | "ended" | "cancelled" | "unknown";
  hasNextSeasonNews: boolean;
  hasChanges: boolean;
  nextSeason: NextSeasonInfo | null | undefined;
  summary: string | null;
  sources: Source[] | null;
  provider: string | null;
  modelUsed: string | null;
};

type NewsHistory = {
  checkedAt: string;
  showStatus: string;
  summary: string | null;
  hasChanges: boolean;
};

export type SeriesCardData = {
  id: string;
  name: string;
  imageUrl: string | null;
  premieredYear: number | null;
  tvmazeStatus: string | null;
  lastCheckedAt: string | null;
  lastCheckAttemptAt: string | null;
  checkStatus: "queued" | "checking" | "checked" | "failed" | "no_key";
  lastCheckError: string | null;
  lastEpisodeReleaseDate: string | null;
  lastEpisodeSeasonNumber: number | null;
  lastEpisodeNumber: number | null;
  latestNews: LatestNews | null;
  history: NewsHistory[];
};

const STATUS_LABEL: Record<string, string> = {
  in_air: "In air",
  returning: "Returning",
  upcoming: "Upcoming",
  ended: "Ended",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

function formatDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatEpisodeCode(seasonNumber?: number | null, episodeNumber?: number | null): string | null {
  if (seasonNumber == null && episodeNumber == null) return null;
  const season = seasonNumber == null ? "S??" : `S${String(seasonNumber).padStart(2, "0")}`;
  const episode = episodeNumber == null ? "" : ` E${String(episodeNumber).padStart(2, "0")}`;
  return `${season}${episode}`;
}

function displayStatus(
  status: string | null | undefined,
  tvmazeStatus: string | null,
): "in_air" | "returning" | "upcoming" | "ended" | "cancelled" | "unknown" {
  if (status === "unknown") return "unknown";
  if (status === "returning" || status === "upcoming") return status;
  if (status === "cancelled") return "cancelled";
  if (tvmazeStatus?.toLowerCase().includes("cancel")) return "cancelled";
  if (status === "ended" || tvmazeStatus?.toLowerCase() === "ended") return "ended";
  if (!status && tvmazeStatus?.toLowerCase() !== "running") return "unknown";
  return "in_air";
}

export function SeriesCard({ series }: { series: SeriesCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refresh" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const news = series.latestNews;
  const status =
    series.checkStatus === "checked"
      ? displayStatus(news?.showStatus, series.tvmazeStatus)
      : "unknown";
  const ns = news?.nextSeason;
  const lastEpisodeReleaseDate = series.lastEpisodeReleaseDate;
  const lastEpisodeCode = formatEpisodeCode(
    series.lastEpisodeSeasonNumber,
    series.lastEpisodeNumber,
  );
  const lastChecked = series.lastCheckedAt ?? news?.checkedAt ?? null;

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      const res = await fetch(`/api/series/${series.id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed.");
      setBusy(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${series.name}" from your list?`)) return;
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch(`/api/series/${series.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove series.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove series.");
      setBusy(null);
    }
  }

  return (
    <article className="series-card">
      <div className="poster-wrap">
        {series.imageUrl ? (
          <Image
            className="poster"
            src={series.imageUrl}
            alt={series.name}
            fill
            sizes="(min-width: 640px) 300px, 100vw"
            unoptimized
          />
        ) : (
          <div className="poster-placeholder">{series.name.charAt(0)}</div>
        )}
      </div>

      <div className="card-body">
        <div>
          <h3 className="card-title">{series.name}</h3>
          <div className="card-meta">
            {series.premieredYear && <span>{series.premieredYear}</span>}
          </div>
        </div>

        <div>
          <span className={`badge badge-${status.replace("_", "-")}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        {lastEpisodeReleaseDate && (
          <div className="last-episode">
            <div className="last-episode-heading">Last released episode</div>
            <div className="last-episode-main">
              {lastEpisodeCode && <strong className="last-episode-code">{lastEpisodeCode}</strong>}
              <strong className="last-episode-date">{formatDate(lastEpisodeReleaseDate)}</strong>
            </div>
          </div>
        )}

        {series.checkStatus === "failed" ? (
          <p className="news-summary news-summary-error">
            Last check failed{series.lastCheckError ? `: ${series.lastCheckError}` : "."}
          </p>
        ) : series.checkStatus === "no_key" ? (
          <p className="news-summary">Add an LLM key in Settings to enable news checks.</p>
        ) : series.checkStatus === "checking" || series.checkStatus === "queued" ? (
          <p className="news-summary">News check queued. Updates will appear here shortly.</p>
        ) : ns ? (
          <div className={`next-season ${ns.confirmed && !ns.approximate ? "headline" : ""}`}>
            <h4>{ns.episodeNumber ? "Next episode" : "Next season"}</h4>
            <div className="ns-line">
              {formatEpisodeCode(ns.seasonNumber, ns.episodeNumber) ? (
                <span className="season-num">{formatEpisodeCode(ns.seasonNumber, ns.episodeNumber)}</span>
              ) : (
                <span>New season</span>
              )}
              {ns.premiereDate && (
                <span>· {ns.approximate ? "estimated " : ""}{formatDate(ns.premiereDate)}</span>
              )}
              {!ns.premiereDate && ns.releaseWindow && <span>· estimated {ns.releaseWindow}</span>}
              {!ns.premiereDate && !ns.releaseWindow && <span>· date not announced</span>}
              {ns.approximate && <span className="tag tag-approx">approx</span>}
              {ns.confirmed && <span className="tag tag-confirmed">confirmed</span>}
              {!ns.confirmed && <span className="tag tag-unconfirmed">unconfirmed</span>}
            </div>
            {ns.details && <p className="ns-details">{ns.details}</p>}
            {ns.sources && ns.sources.length > 0 && (
              <div className="ns-sources">
                {ns.sources.slice(0, 3).map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title.length > 45 ? s.title.slice(0, 45) + "…" : s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : news?.summary && news.showStatus !== "unknown" ? (
          <p className="news-summary">{news.summary}</p>
        ) : news?.showStatus === "unknown" ? (
          <p className="empty-note">No relevant evidence found in the latest check.</p>
        ) : !news ? (
          <p className="empty-note">No news yet — press refresh to check.</p>
        ) : null}

        {news && !ns && news.sources && news.sources.length > 0 && (
          <div className="news-sources">
            {news.sources.slice(0, 3).map((source, index) => (
              <a key={index} href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title.length > 45 ? `${source.title.slice(0, 45)}…` : source.title}
              </a>
            ))}
          </div>
        )}

        {lastChecked && (
          <div className="checked-line">
            Checked {formatDate(lastChecked)}
            {news?.provider ? ` · ${news.provider}` : ""}
            {news?.hasChanges && <span className="updated-mark"> · Updated</span>}
          </div>
        )}

        {series.history.length > 1 && (
          <details className="news-history">
            <summary>Recent checks ({series.history.length})</summary>
            <div className="news-history-list">
              {series.history.slice(1).map((entry) => (
                <div className="news-history-item" key={entry.checkedAt}>
                  <strong>{formatDate(entry.checkedAt)}</strong>
                  <span>{entry.summary || entry.showStatus.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {error && <div className="form-error card-error" role="alert">{error}</div>}

        <div className="card-actions">
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={busy !== null}>
            {busy === "refresh" && <span className="spinner" />}
            {busy === "refresh" ? "Checking…" : "Refresh"}
          </button>
          <button
            className="btn btn-ghost btn-sm btn-danger"
            onClick={remove}
            disabled={busy !== null}
          >
            {busy === "remove" && <span className="spinner" />}
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
