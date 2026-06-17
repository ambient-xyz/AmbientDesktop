import { describe, expect, it } from "vitest";
import { DEFAULT_COMPACTION_SETTINGS, normalizeCompactionSettings } from "./projectStoreSettings";

describe("projectStoreSettings", () => {
  it("uses safe defaults for missing or invalid compaction settings", () => {
    expect(normalizeCompactionSettings(undefined)).toEqual(DEFAULT_COMPACTION_SETTINGS);
    expect(normalizeCompactionSettings({ reserveTokens: "many", keepRecentTokens: Number.NaN })).toEqual(
      DEFAULT_COMPACTION_SETTINGS,
    );
  });

  it("preserves valid compaction settings while bounding numeric values", () => {
    expect(
      normalizeCompactionSettings({
        autoCompactionEnabled: false,
        reserveTokens: 512,
        keepRecentTokens: 129_000,
        softWarningPercent: 100,
        hardPreflightPercent: 0,
      }),
    ).toEqual({
      autoCompactionEnabled: false,
      reserveTokens: 1_024,
      keepRecentTokens: 128_000,
      softWarningPercent: 99,
      hardPreflightPercent: 1,
    });
  });
});
