import { decryptSecret } from "./crypto";

export type KeyHolder = {
  byokKeyEnc: string | null;
  byokBaseUrl: string | null;
  byokModel: string | null;
  byokVerifiedAt?: Date | null;
};

export type ResolvedKey = {
  key: string;
  baseUrl: string | null;
  model: string | null;
  source: "byok" | "fallback";
};

export function hasByok(user: Pick<KeyHolder, "byokKeyEnc" | "byokVerifiedAt">): boolean {
  if (!user.byokKeyEnc || !user.byokVerifiedAt) return false;
  try {
    decryptSecret(user.byokKeyEnc);
    return true;
  } catch {
    return false;
  }
}

export const FREE_TIER_MAX_SERIES = 20;

export function seriesLimitFor(
  user: Pick<KeyHolder, "byokKeyEnc" | "byokVerifiedAt">,
): number | null {
  return hasByok(user) ? null : FREE_TIER_MAX_SERIES;
}

export function resolveKey(user: KeyHolder): ResolvedKey | null {
  if (user.byokKeyEnc && user.byokVerifiedAt) {
    try {
      return {
        key: decryptSecret(user.byokKeyEnc),
        baseUrl: user.byokBaseUrl || null,
        model: user.byokModel || null,
        source: "byok",
      };
    } catch {
      // Treat an unreadable saved key as unavailable and use the server fallback.
    }
  }

  const fallbackKey = process.env.FALLBACK_LLM_API_KEY;
  if (fallbackKey) {
    return {
      key: fallbackKey,
      baseUrl: process.env.FALLBACK_LLM_BASE_URL || null,
      model: process.env.FALLBACK_LLM_MODEL || null,
      source: "fallback",
    };
  }

  return null;
}
