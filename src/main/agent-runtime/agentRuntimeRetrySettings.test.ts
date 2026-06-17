import { describe, expect, it } from "vitest";
import {
  assistantFinalizationRetryMaxRetriesFromSettings,
  piRetryOverridesFromModelRuntimeSettings,
  runtimeSettingsActivity,
  runtimeSettingsActivityMessage,
} from "./agentRuntimeRetrySettings";

const baseSettings = {
  providerPreStreamTimeoutMs: 45_000,
  providerStreamIdleTimeoutMs: 30_000,
  installedProviders: [],
};

describe("agentRuntimeRetrySettings", () => {
  it("leaves Pi retry overrides unset when aggressive retries are disabled", () => {
    expect(piRetryOverridesFromModelRuntimeSettings({
      ...baseSettings,
      aggressiveRetries: false,
    })).toBeUndefined();
  });

  it("maps aggressive retries into the Pi-supported retry override shape", () => {
    expect(piRetryOverridesFromModelRuntimeSettings({
      ...baseSettings,
      aggressiveRetries: true,
    })).toEqual({
      enabled: true,
      maxRetries: 10,
      baseDelayMs: 1_000,
      provider: {
        maxRetries: 10,
        maxRetryDelayMs: 5_000,
      },
    });
  });

  it("uses the post-tool continuation attempt count as the finalization retry floor", () => {
    expect(assistantFinalizationRetryMaxRetriesFromSettings({
      ...baseSettings,
      aggressiveRetries: false,
    })).toBe(1);
    expect(assistantFinalizationRetryMaxRetriesFromSettings({
      ...baseSettings,
      aggressiveRetries: true,
    })).toBe(10);
  });

  it("formats runtime settings activity messages", () => {
    expect(runtimeSettingsActivityMessage(true, "deferred")).toBe(
      "Aggressive retries enabled; Ambient will recreate this Pi session after the active run finishes.",
    );
    expect(runtimeSettingsActivityMessage(false, "applied")).toBe(
      "Aggressive retries disabled; Ambient reset this idle Pi session so the next turn uses the new retry settings.",
    );
  });

  it("builds runtime settings activity payloads", () => {
    expect(runtimeSettingsActivity("thread-1", true, "deferred")).toEqual({
      threadId: "thread-1",
      kind: "runtime-settings",
      status: "deferred",
      aggressiveRetries: true,
      disposedSession: false,
      deferredSession: true,
      message: "Aggressive retries enabled; Ambient will recreate this Pi session after the active run finishes.",
    });
    expect(runtimeSettingsActivity("thread-2", false, "applied")).toEqual({
      threadId: "thread-2",
      kind: "runtime-settings",
      status: "applied",
      aggressiveRetries: false,
      disposedSession: true,
      deferredSession: false,
      message: "Aggressive retries disabled; Ambient reset this idle Pi session so the next turn uses the new retry settings.",
    });
  });
});
