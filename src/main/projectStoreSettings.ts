import type { AmbientCompactionSettings } from "../shared/types";

export const DEFAULT_COMPACTION_SETTINGS: AmbientCompactionSettings = {
  autoCompactionEnabled: true,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
  softWarningPercent: 80,
  hardPreflightPercent: 92,
};

export function normalizeCompactionSettings(value: unknown): AmbientCompactionSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<AmbientCompactionSettings>) : {};
  return {
    autoCompactionEnabled:
      typeof input.autoCompactionEnabled === "boolean" ? input.autoCompactionEnabled : DEFAULT_COMPACTION_SETTINGS.autoCompactionEnabled,
    reserveTokens: boundedInteger(input.reserveTokens, 1_024, 128_000, DEFAULT_COMPACTION_SETTINGS.reserveTokens),
    keepRecentTokens: boundedInteger(input.keepRecentTokens, 1_024, 128_000, DEFAULT_COMPACTION_SETTINGS.keepRecentTokens),
    softWarningPercent: boundedInteger(input.softWarningPercent, 1, 99, DEFAULT_COMPACTION_SETTINGS.softWarningPercent),
    hardPreflightPercent: boundedInteger(input.hardPreflightPercent, 1, 100, DEFAULT_COMPACTION_SETTINGS.hardPreflightPercent),
  };
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
