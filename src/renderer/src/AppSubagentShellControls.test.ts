import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import {
  activeSubagentChildHiddenByFeatureFlag,
  disabledSubagentShellCleanupState,
  subagentUiEnabledForState,
} from "./AppSubagentShellControls";

describe("AppSubagentShellControls", () => {
  it("reads subagent UI availability from the desktop feature snapshot", () => {
    expect(subagentUiEnabledForState(undefined)).toBe(false);
    expect(subagentUiEnabledForState({
      featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    })).toBe(true);
  });

  it("hides active child threads only when the subagent UI is disabled", () => {
    expect(activeSubagentChildHiddenByFeatureFlag({
      activeThread: { kind: "subagent_child" },
      subagentUiEnabled: false,
    })).toBe(true);
    expect(activeSubagentChildHiddenByFeatureFlag({
      activeThread: { kind: "subagent_child" },
      subagentUiEnabled: true,
    })).toBe(false);
    expect(activeSubagentChildHiddenByFeatureFlag({
      activeThread: { kind: "chat" },
      subagentUiEnabled: false,
    })).toBe(false);
  });

  it("clears subagent shell state when the feature is disabled", () => {
    expect(disabledSubagentShellCleanupState({
      subagentUiEnabled: false,
      symphonyBuilderOpen: true,
    })).toEqual({
      clearSubagentDialogs: true,
      closeSymphonyBuilder: true,
    });
    expect(disabledSubagentShellCleanupState({
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
    })).toEqual({
      clearSubagentDialogs: false,
      closeSymphonyBuilder: false,
    });
  });
});
