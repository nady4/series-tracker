import { Source } from "@/db/schema";

const RSS = "https://news.google.com/rss/search";
const MAX_FEED_BYTES = 1_000_000;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tagValue(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function fetchGoogleNewsArticles(name: string): Promise<Source[]> {
  const url = `${RSS}?q=${encodeURIComponent(name)}&hl=en-US&gl=US&ceid=US%3Aen`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("Google News could not be reached.");
  }
  if (!res.ok) throw new Error(`Google News returned ${res.status}.`);
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FEED_BYTES) throw new Error("Google News response was too large.");

  const xml = await res.text();
  if (xml.length > MAX_FEED_BYTES) throw new Error("Google News response was too large.");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({ title: tagValue(item, "title"), url: tagValue(item, "link") }))
    .filter((article) => article.title.length > 0 && isWebUrl(article.url))
    .slice(0, 8);
}
