import { describe, expect, it } from "vitest";
import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
  applyAmbientFeatureFlagSettingsPatch,
  isAmbientSubagentsEnabled,
  isAmbientTencentDbMemoryEnabled,
  normalizeAmbientFeatureFlagSettings,
  parseAmbientFeatureFlagLaunchArgs,
  resolveAmbientFeatureFlags,
} from "./featureFlags";

describe("ambient feature flags", () => {
  it("defaults experimental flags off", () => {
    const snapshot = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" });

    expect(isAmbientSubagentsEnabled(snapshot)).toBe(false);
    expect(isAmbientTencentDbMemoryEnabled(snapshot)).toBe(false);
    expect(snapshot.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG]).toMatchObject({
      enabled: false,
      source: "default",
      defaultEnabled: false,
    });
    expect(snapshot.flags[AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]).toMatchObject({
      enabled: false,
      source: "default",
      defaultEnabled: false,
    });
  });

  it("resolves settings, harness, and startup overrides with startup disable as emergency brake", () => {
    const snapshot = resolveAmbientFeatureFlags({
      settings: { subagents: true },
      harness: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      startup: { enabled: [], disabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(snapshot.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG]).toMatchObject({
      enabled: false,
      source: "startup_arg_disable",
      settingsEnabled: true,
    });
  });

  it("parses comma-separated and split terminal launch arguments", () => {
    expect(parseAmbientFeatureFlagLaunchArgs([
      "--enable-feature=ambient.subagents,unknown.flag",
      "--disable-feature",
      "ambient.subagents,ambient.memory.tencentdb",
    ])).toEqual({
      enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG],
      disabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG, AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG],
      ignored: ["unknown.flag"],
    });
  });

  it("normalizes and patches persistent settings", () => {
    expect(normalizeAmbientFeatureFlagSettings()).toEqual({ subagents: false, tencentDbMemory: false });
    expect(applyAmbientFeatureFlagSettingsPatch(
      { subagents: false, tencentDbMemory: false },
      { subagents: true, tencentDbMemory: true },
    )).toEqual({ subagents: true, tencentDbMemory: true });
    expect(applyAmbientFeatureFlagSettingsPatch({ subagents: true, tencentDbMemory: false }, {})).toEqual({
      subagents: true,
      tencentDbMemory: false,
    });
  });
});
