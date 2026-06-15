import { describe, expect, it } from "vitest";

import {
  shouldDisarmComposerModesForCollaborationMode,
  shouldDisarmLocalDeepResearchMode,
  shouldLoadWelcomePluginRegistry,
  shouldRefreshVoiceProviderAfterRun,
} from "./AppShellLifecycleEffects";

describe("AppShellLifecycleEffects", () => {
  it("refreshes voice providers only when an active run has just completed", () => {
    expect(shouldRefreshVoiceProviderAfterRun({
      previousRunning: true,
      running: false,
      stateAvailable: true,
    })).toBe(true);
    expect(shouldRefreshVoiceProviderAfterRun({
      previousRunning: false,
      running: false,
      stateAvailable: true,
    })).toBe(false);
    expect(shouldRefreshVoiceProviderAfterRun({
      previousRunning: true,
      running: true,
      stateAvailable: true,
    })).toBe(false);
    expect(shouldRefreshVoiceProviderAfterRun({
      previousRunning: true,
      running: false,
      stateAvailable: false,
    })).toBe(false);
  });

  it("disarms composer modes for planner collaboration mode", () => {
    expect(shouldDisarmComposerModesForCollaborationMode("planner")).toBe(true);
    expect(shouldDisarmComposerModesForCollaborationMode("agent")).toBe(false);
    expect(shouldDisarmComposerModesForCollaborationMode(undefined)).toBe(false);
  });

  it("disarms Local Deep Research mode when setup is not ready", () => {
    expect(shouldDisarmLocalDeepResearchMode(false)).toBe(true);
    expect(shouldDisarmLocalDeepResearchMode(true)).toBe(false);
  });

  it("loads the welcome plugin registry only for plugin setup pages", () => {
    expect(shouldLoadWelcomePluginRegistry("plugin_setup")).toBe(true);
    expect(shouldLoadWelcomePluginRegistry("core_setup")).toBe(false);
    expect(shouldLoadWelcomePluginRegistry("instructions")).toBe(false);
    expect(shouldLoadWelcomePluginRegistry(undefined)).toBe(false);
  });
});
