import { describe, expect, it } from "vitest";

import {
  shouldDisarmComposerModesForCollaborationMode,
  shouldDisarmLocalDeepResearchMode,
  shouldLoadWelcomePluginRegistry,
} from "./AppShellLifecycleEffects";

describe("AppShellLifecycleEffects", () => {
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
