import type { ChatMessage, PromptCacheTelemetry } from "../../shared/threadTypes";

export type PromptCacheBadgeTone = "pending" | "hit" | "miss" | "unknown";

export interface PromptCacheStatusBadgeModel {
  label: string;
  title: string;
  tone: PromptCacheBadgeTone;
}

export function promptCacheStatusBadgeModel(
  message: Pick<ChatMessage, "role" | "metadata">,
  enabled: boolean,
): PromptCacheStatusBadgeModel | undefined {
  if (!enabled || message.role !== "assistant") return undefined;
  const telemetry = promptCacheTelemetryFromMetadata(message.metadata?.promptCache);
  if (!telemetry) return undefined;
  const cacheRead = finiteNonNegativeNumber(telemetry.usage?.cacheRead);
  const input = finiteNonNegativeNumber(telemetry.usage?.input);
  const cacheWrite = finiteNonNegativeNumber(telemetry.usage?.cacheWrite);
  const tokenDetails = [
    cacheRead !== undefined ? `${formatTokenCount(cacheRead)} cached input` : undefined,
    input !== undefined ? `${formatTokenCount(input)} input` : undefined,
    cacheWrite !== undefined ? `${formatTokenCount(cacheWrite)} cache write` : undefined,
  ].filter((item): item is string => Boolean(item));

  if (telemetry.status === "pending") {
    return {
      label: "Prompt cache pending",
      title: "Provider prompt-cache usage has not arrived for this model request yet.",
      tone: "pending",
    };
  }
  if (telemetry.status === "hit") {
    return {
      label: cacheRead !== undefined
        ? `Prompt cache hit · ${formatTokenCount(cacheRead)} cached tokens`
        : "Prompt cache hit",
      title: [
        "Provider reported cached prompt input for this model request.",
        tokenDetails.join(", "),
      ].filter(Boolean).join(" "),
      tone: "hit",
    };
  }
  if (telemetry.status === "miss") {
    return {
      label: "Prompt cache miss",
      title: [
        "Provider reported zero cached prompt input tokens for this model request.",
        tokenDetails.join(", "),
      ].filter(Boolean).join(" "),
      tone: "miss",
    };
  }
  return {
    label: "Prompt cache unknown",
    title: "Provider prompt-cache usage was not reported for this model request.",
    tone: "unknown",
  };
}

function promptCacheTelemetryFromMetadata(value: unknown): PromptCacheTelemetry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<PromptCacheTelemetry>;
  if (
    record.status !== "pending" &&
    record.status !== "hit" &&
    record.status !== "miss" &&
    record.status !== "unknown"
  ) return undefined;
  return {
    status: record.status,
    ...(record.usage && typeof record.usage === "object" && !Array.isArray(record.usage) ? { usage: record.usage } : {}),
  };
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function formatTokenCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
