import type { PromptCacheTelemetry, PromptCacheUsageTokens } from "./threadTypes";

const USAGE_KEYS = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const;

type UsageKey = (typeof USAGE_KEYS)[number];

export function promptCachePendingTelemetry(): PromptCacheTelemetry {
  return { status: "pending" };
}

export function promptCacheTelemetryFromUsage(usage: unknown): PromptCacheTelemetry {
  const tokens = promptCacheUsageTokens(usage);
  if (!tokens) return { status: "unknown" };
  if (tokens.cacheRead === undefined) return withUsage("unknown", tokens);
  if (tokens.cacheRead > 0) return withUsage("hit", tokens);
  return withUsage("miss", tokens);
}

export function promptCacheUsageTokens(usage: unknown): PromptCacheUsageTokens | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const record = usage as Record<string, unknown>;
  const tokens: PromptCacheUsageTokens = {};
  for (const key of USAGE_KEYS) {
    const value = nonNegativeFiniteNumber(record[key]);
    if (value !== undefined) tokens[key] = value;
  }
  return Object.keys(tokens).length > 0 ? tokens : undefined;
}

function withUsage(status: PromptCacheTelemetry["status"], usage: PromptCacheUsageTokens): PromptCacheTelemetry {
  return { status, usage };
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
