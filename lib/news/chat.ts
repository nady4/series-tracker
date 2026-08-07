export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export class UnsupportedNativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedNativeError";
  }
}

class RetryableError extends Error {}
class RequestTimeoutError extends Error {}

const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 25000;
const MAX_OUTPUT_TOKENS = 2400;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const item = part as { text?: unknown; content?: unknown };
          return contentToText(item.text ?? item.content);
        }
        return "";
      })
      .join("");
  }
  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown };
    if (item.text !== undefined || item.content !== undefined) {
      return contentToText(item.text ?? item.content);
    }
    return JSON.stringify(value);
  }
  return "";
}

function extractJson(text: string): string | null {
  let candidate = text;
  const decoded = text.trim().startsWith('"') ? (() => {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  })() : null;
  if (decoded) candidate = decoded;

  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  candidate = fenced ? fenced[1] : candidate;
  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index++) {
    const character = candidate[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth++;
    } else if (character === "}" && --depth === 0) {
      return candidate.slice(start, index + 1);
    }
  }
  return null;
}

function nextNonWhitespace(text: string, start: number): number {
  let index = start;
  while (/\s/.test(text[index] ?? "")) index++;
  return index;
}

function startsJsonValue(character: string | undefined): boolean {
  return Boolean(character && (character === '"' || character === "{" || character === "[" || /[-0-9tfn]/.test(character)));
}

function repairJson(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        output += character;
      } else if (character === "\\") {
        escaped = true;
        output += character;
      } else if (character === '"') {
        inString = false;
        output += character;
        const next = nextNonWhitespace(text, index + 1);
        if (startsJsonValue(text[next]) && text[next] !== ":") output += ",";
      } else if (character === "\n") {
        output += "\\n";
      } else if (character === "\r") {
        output += "\\r";
      } else if (character === "\t") {
        output += "\\t";
      } else {
        output += character;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === "/" && text[index + 1] === "/") {
      index += 2;
      while (index < text.length && text[index] !== "\n") index++;
      index--;
      continue;
    }

    if (character === ",") {
      const next = nextNonWhitespace(text, index + 1);
      if (text[next] === "}" || text[next] === "]") continue;
    }

    output += character;
    if (character === "}" || character === "]") {
      const next = nextNonWhitespace(text, index + 1);
      if (startsJsonValue(text[next])) output += ",";
      continue;
    }

    if (character === "-" || /\d/.test(character)) {
      let end = index + 1;
      while (/[\d.eE+-]/.test(text[end] ?? "")) end++;
      const next = nextNonWhitespace(text, end);
      if (startsJsonValue(text[next])) output += ",";
      output += text.slice(index + 1, end);
      index = end - 1;
    } else if (text.startsWith("true", index) || text.startsWith("false", index) || text.startsWith("null", index)) {
      const word = text.startsWith("false", index) ? "false" : text.startsWith("true", index) ? "true" : "null";
      const end = index + word.length;
      const next = nextNonWhitespace(text, end);
      if (startsJsonValue(text[next])) output += ",";
      output += word.slice(1);
      index = end - 1;
    }
  }

  return output;
}

export function parseJsonResponse(value: unknown): unknown {
  const text = contentToText(value);
  const json = extractJson(text);
  if (!json) throw new Error("LLM did not return a JSON object.");

  try {
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(repairJson(json));
    } catch {
      throw new Error("LLM returned malformed JSON.");
    }
  }
}

export async function chatCompletionsJson(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}): Promise<{ text: string; model: string }> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await attemptChat(args);
      try {
        parseJsonResponse(response.text);
        return response;
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) throw err;
        await sleep(500 * attempt);
      }
    } catch (err) {
      if (err instanceof RequestTimeoutError) throw err;
      if (!(err instanceof RetryableError)) throw err;
      if (attempt === MAX_ATTEMPTS) throw err;
      await sleep(500 * attempt);
    }
  }
  throw new Error("Unreachable");
}

async function attemptChat(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}): Promise<{ text: string; model: string }> {
  const { assertSafeProviderBaseUrl } = await import("@/lib/security/provider-url");
  const baseUrl = await assertSafeProviderBaseUrl(args.baseUrl);
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: args.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    ...(args.baseUrl.includes("opencode.ai/zen/go") ? { reasoning_effort: "none" } : {}),
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  };

  const post = async (payload: unknown, signal: AbortSignal): Promise<Response> => {
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal,
      });
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "TimeoutError")
      ) {
        throw new RequestTimeoutError(
          `LLM chat request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
        );
      }
      throw new RetryableError(
        `LLM chat request failed (network: ${err instanceof Error ? err.message : "unknown"}).`,
      );
    }
  };

  const res = await post(
    { ...body, response_format: { type: "json_object" } },
    args.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  );

  if (res.status === 401 || res.status === 403) {
    throw new ApiKeyError("API key rejected by the provider (401/403).");
  }

  if (res.status === 400 || res.status === 404) {
    // Provider/model without JSON mode support: retry without it.
    const retry = await post(body, args.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    if (isRetryableStatus(retry.status)) throw new RetryableError(`LLM chat request failed (${retry.status}).`);
    if (!retry.ok) {
      throw new Error(`LLM chat request failed (${retry.status}).`);
    }
    const data = (await retry.json()) as {
      choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
      model?: string;
    };
    const message = data.choices?.[0]?.message;
    const text = contentToText(message?.content) || contentToText(message?.reasoning_content);
    if (!text) throw new Error("LLM returned an empty response.");
    return { text, model: data.model ?? args.model };
  }

  if (isRetryableStatus(res.status)) throw new RetryableError(`LLM chat request failed (${res.status}).`);
  if (!res.ok) {
    throw new Error(`LLM chat request failed (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
    model?: string;
  };
  const message = data.choices?.[0]?.message;
  const text = contentToText(message?.content) || contentToText(message?.reasoning_content);
  if (!text) throw new Error("LLM returned an empty response.");
  return { text, model: data.model ?? args.model };
}

export { extractJson, repairJson };
