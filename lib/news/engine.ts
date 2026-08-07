import { ResolvedKey } from "@/lib/keys";
import {
  SYSTEM_PROMPT,
  newsResultSchema,
  type NewsResult,
  type NextSeasonInfo,
} from "./schema";
import { fetchGdeltArticles, buildArticlePayload } from "./gdelt";
import { chatCompletionsJson, parseJsonResponse } from "./chat";
import { fetchGoogleNewsArticles } from "./google";

export type NewsCheck = {
  result: NewsResult;
  provider: string;
  modelUsed: string;
};

const USER_JSON_SPEC = `Return a JSON object with exactly these fields:
{
  "showStatus": "in_air" | "returning" | "upcoming" | "ended" | "cancelled" | "unknown",
  "lastEpisodeReleaseDate": string | null,
  "lastEpisodeSeasonNumber": number | null,
  "lastEpisodeNumber": number | null,
  "hasNextSeasonNews": boolean,
  "nextSeason": null | {
    "seasonNumber": number | null,
    "episodeNumber": number | null,
    "releaseWindow": string | null,
    "premiereDate": string | null,
    "approximate": boolean,
    "confirmed": boolean,
    "details": string,
    "sources": [{"title": string, "url": string}]
  },
  "summary": string,
  "sources": [{"title": string, "url": string}]
}
Include no more than 3 sources in each sources array.`;

function parseResult(text: string): NewsResult {
  return newsResultSchema.parse(parseJsonResponse(text));
}

function noNews(summary: string): NewsResult {
  return {
    showStatus: "unknown",
    lastEpisodeReleaseDate: null,
    lastEpisodeSeasonNumber: null,
    lastEpisodeNumber: null,
    hasNextSeasonNews: false,
    nextSeason: null,
    summary,
    sources: [],
  };
}

export async function runNewsSearch(
  show: { name: string; year: number | null },
  key: ResolvedKey,
): Promise<NewsCheck> {
  let googleArticles: Awaited<ReturnType<typeof fetchGoogleNewsArticles>> = [];
  let googleError: unknown = null;
  try {
    googleArticles = await fetchGoogleNewsArticles(show.name);
  } catch (err) {
    googleError = err;
  }

  let gdeltArticles: Awaited<ReturnType<typeof fetchGdeltArticles>> = [];
  let gdeltError: unknown = null;
  if (googleArticles.length === 0) {
    try {
      gdeltArticles = await fetchGdeltArticles(show.name);
    } catch (err) {
      gdeltError = err;
    }
  }

  const articles = googleArticles.length > 0 ? googleArticles : gdeltArticles;
  const articleProvider = googleArticles.length > 0 ? "google-news" : "gdelt";
  if (articles.length === 0) {
    if (googleError || gdeltError) {
      throw new Error("News providers are temporarily unavailable.");
    }
    return {
      result: noNews("No news found for this series."),
      provider: "news",
      modelUsed: "none",
    };
  }

  const baseUrl = key.baseUrl ?? "https://api.openai.com/v1";
  const model = key.model ?? "gpt-4o-mini";
  const promptArticles = articles.slice(0, 4);
  const chat = await chatCompletionsJson({
    baseUrl,
    apiKey: key.key,
    model,
    system: SYSTEM_PROMPT,
    user: [USER_JSON_SPEC, "", buildArticlePayload(show.name, show.year, promptArticles)].join("\n"),
  });

  const parsed = parseResult(chat.text);
  const withSources: NewsResult = {
    ...parsed,
    nextSeason: attachSources(parsed.nextSeason, promptArticles),
    sources: parsed.sources?.length ? parsed.sources : promptArticles,
  };
  return { result: withSources, provider: `${articleProvider}+chat`, modelUsed: chat.model };
}

function attachSources(
  nextSeason: NextSeasonInfo | null | undefined,
  sources: { title: string; url: string }[],
): NextSeasonInfo | null | undefined {
  if (!nextSeason || !sources.length) return nextSeason;
  return { ...nextSeason, sources: nextSeason.sources?.length ? nextSeason.sources : sources };
}
