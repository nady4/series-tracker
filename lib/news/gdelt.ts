import { Source } from "@/db/schema";
import { buildShowContext } from "./schema";

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RESPONSE_BYTES = 1_000_000;

export async function fetchGdeltArticles(name: string): Promise<Source[]> {
  const query = `"${name.replace(/"/g, "")}"`;
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=15&sort=datedesc`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("GDELT could not be reached.");
  }
  if (!res.ok) {
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const retry = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!retry.ok) throw new Error(`GDELT returned ${retry.status}.`);
        const retryText = await retry.text();
        if (retryText.length > MAX_RESPONSE_BYTES) throw new Error("GDELT response was too large.");
        return parseArticles(retryText);
      } catch (err) {
        throw err instanceof Error ? err : new Error("GDELT could not be reached.");
      }
    }
    throw new Error(`GDELT returned ${res.status}.`);
  }

  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("GDELT response was too large.");
  return parseArticles(text);
}

function parseArticles(text: string): Source[] {
  try {
    const data = JSON.parse(text) as { articles?: { title?: string; url?: string }[] };
    const articles = data.articles ?? [];
    return articles
      .map((a) => ({ title: a.title?.slice(0, 300) ?? "Untitled article", url: a.url ?? "" }))
      .filter((a) => {
        try {
          const url = new URL(a.url);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function buildArticlePayload(name: string, year: number | null, articles: Source[]): string {
  return [
    buildShowContext(name, year),
    "",
    "Latest available news articles:",
    JSON.stringify(articles, null, 2),
    "",
    "Analyze only these articles. Return the JSON object. Do not assume an article is recent just because it is listed first.",
  ].join("\n");
}
