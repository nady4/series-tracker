import { lookup } from "node:dns/promises";

const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    LOCAL_HOSTS.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal" ||
    normalized === "metadata.google.com" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    isPrivateIpv4(normalized)
  );
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isPrivateHostname(hostname)) return true;
  if (/^[0-9a-f:]+$/i.test(hostname)) return false;

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.some((address) => isPrivateHostname(address.address));
}

/** Validate an OpenAI-compatible endpoint before sending a credential to it. */
export async function assertSafeProviderBaseUrl(value: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provider base URL must be a valid URL.");
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalDevelopment = process.env.NODE_ENV !== "production" && isPrivateHostname(hostname);

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Provider base URL cannot contain credentials, query parameters, or fragments.");
  }
  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("Provider base URL must use HTTPS.");
  }
  if (!hostname || (!isLocalDevelopment && (await resolvesToPrivateAddress(hostname)))) {
    throw new Error("Provider base URL cannot point to a private or local address.");
  }

  return url.toString().replace(/\/$/, "");
}
