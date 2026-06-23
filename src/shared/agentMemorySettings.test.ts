import { describe, expect, it } from "vitest";
import {
  applyAgentMemorySettingsPatch,
  DEFAULT_AGENT_MEMORY_SETTINGS,
  isAgentMemoryActiveForThread,
  normalizeAgentMemorySettings,
  shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate,
} from "./agentMemorySettings";

describe("agent memory settings", () => {
  it("defaults Tencent memory to enabled globally with managed embeddings automatic", () => {
    expect(normalizeAgentMemorySettings()).toEqual(DEFAULT_AGENT_MEMORY_SETTINGS);
    expect(DEFAULT_AGENT_MEMORY_SETTINGS).toMatchObject({
      mode: "enabled_all",
      enabled: true,
      defaultThreadEnabled: true,
      adapter: "tencentdb",
      shortTermOffloadEnabled: false,
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        autoStartProvider: true,
        sendDimensions: false,
        maxInputChars: 512,
        timeoutMs: 10_000,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
  });

  it("derives missing mode from legacy enabled and default-thread fields", () => {
    expect(normalizeAgentMemorySettings({ enabled: false })).toMatchObject({
      mode: "disabled",
      enabled: false,
      defaultThreadEnabled: false,
      embeddings: {
        enabled: false,
        autoStartProvider: false,
      },
    });
    expect(normalizeAgentMemorySettings({ enabled: true, defaultThreadEnabled: false })).toMatchObject({
      mode: "per_thread",
      enabled: true,
      defaultThreadEnabled: false,
      embeddings: {
        enabled: true,
        autoStartProvider: true,
      },
    });
    expect(normalizeAgentMemorySettings({ defaultThreadEnabled: true })).toMatchObject({
      mode: "enabled_all",
      enabled: true,
      defaultThreadEnabled: true,
    });
  });

  it("does not fail open when a persisted mode value is malformed", () => {
    expect(normalizeAgentMemorySettings({
      mode: "future-mode" as never,
      enabled: false,
      defaultThreadEnabled: false,
    })).toMatchObject({
      mode: "disabled",
      enabled: false,
      defaultThreadEnabled: false,
      embeddings: {
        enabled: false,
        autoStartProvider: false,
      },
    });
    expect(normalizeAgentMemorySettings({
      mode: "future-mode" as never,
      enabled: true,
      defaultThreadEnabled: false,
    })).toMatchObject({
      mode: "per_thread",
      enabled: true,
      defaultThreadEnabled: false,
    });
    expect(normalizeAgentMemorySettings({
      mode: "future-mode" as never,
    })).toMatchObject({
      mode: "disabled",
      enabled: false,
      defaultThreadEnabled: false,
    });
  });

  it("preserves explicit embedding disablement for enabled memory modes", () => {
    expect(normalizeAgentMemorySettings({
      mode: "enabled_all",
      embeddings: { enabled: false, autoStartProvider: false },
    })).toMatchObject({
      mode: "enabled_all",
      enabled: true,
      embeddings: {
        enabled: false,
        autoStartProvider: false,
      },
    });
    expect(normalizeAgentMemorySettings({
      mode: "disabled",
      embeddings: { enabled: true, autoStartProvider: true },
    })).toMatchObject({
      mode: "disabled",
      enabled: false,
      embeddings: {
        enabled: false,
        autoStartProvider: false,
      },
    });
  });

  it("patches known fields and ignores malformed values", () => {
    expect(applyAgentMemorySettingsPatch(DEFAULT_AGENT_MEMORY_SETTINGS, {
      mode: "per_thread",
      enabled: true,
      defaultThreadEnabled: true,
      adapter: "tencentdb",
      shortTermOffloadEnabled: true,
      embeddings: {
        enabled: true,
        providerCapabilityId: "ambient-cli:embeddings:tool:bge_embeddings",
        autoStartProvider: true,
        modelId: "BAAI/bge-small-en-v1.5",
        dimensions: 384,
        sendDimensions: true,
        maxInputChars: 1_024,
        timeoutMs: 15_000,
        preflightEnabled: false,
      },
      storageScope: "workspace",
    })).toEqual({
      mode: "per_thread",
      enabled: true,
      defaultThreadEnabled: false,
      adapter: "tencentdb",
      shortTermOffloadEnabled: true,
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        providerCapabilityId: "ambient-cli:embeddings:tool:bge_embeddings",
        autoStartProvider: true,
        modelId: "BAAI/bge-small-en-v1.5",
        dimensions: 384,
        sendDimensions: true,
        maxInputChars: 1_024,
        timeoutMs: 15_000,
        preflightEnabled: false,
      },
      storageScope: "workspace",
    });

    expect(normalizeAgentMemorySettings({
      adapter: "unsupported" as never,
      embeddings: {
        enabled: true,
        providerMode: "other" as never,
        providerCapabilityId: "  ",
        dimensions: -1,
        maxInputChars: 10,
        timeoutMs: 5,
      },
      storageScope: "global" as never,
    })).toMatchObject({
      mode: "enabled_all",
      enabled: true,
      adapter: "tencentdb",
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        autoStartProvider: true,
        sendDimensions: false,
        maxInputChars: 128,
        timeoutMs: 1_000,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
  });

  it("applies mode policy before Tencent memory can activate", () => {
    const enabledAll = normalizeAgentMemorySettings({ mode: "enabled_all" });
    const perThread = normalizeAgentMemorySettings({ mode: "per_thread" });
    const disabled = normalizeAgentMemorySettings({ mode: "disabled" });

    expect(isAgentMemoryActiveForThread({
      featureEnabled: false,
      settings: enabledAll,
      threadMemoryEnabled: true,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: disabled,
      threadMemoryEnabled: true,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: enabledAll,
      threadMemoryEnabled: false,
    })).toBe(true);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: enabledAll,
      threadMemoryEnabled: true,
      threadKind: "subagent_child",
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: perThread,
      threadMemoryEnabled: false,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: enabledAll,
      threadMemoryEnabled: true,
      storageHealthy: false,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: perThread,
      threadMemoryEnabled: true,
    })).toBe(true);
  });

  it("starts managed embeddings when settings newly enter the auto-start state", () => {
    const active = normalizeAgentMemorySettings({
      mode: "enabled_all",
      embeddings: { enabled: true, autoStartProvider: true },
    });
    expect(shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(
      normalizeAgentMemorySettings({
        mode: "disabled",
        embeddings: { enabled: true, autoStartProvider: true },
      }),
      active,
    )).toBe(true);
    expect(shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(
      normalizeAgentMemorySettings({
        mode: "enabled_all",
        embeddings: { enabled: false, autoStartProvider: true },
      }),
      active,
    )).toBe(true);
    expect(shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(active, active)).toBe(false);
    expect(shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate({
      ...active,
      embeddings: { ...active.embeddings, providerCapabilityId: "ambient:custom:embedding" },
    }, active)).toBe(true);
    expect(shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(active, {
      ...active,
      mode: "disabled",
      enabled: false,
      defaultThreadEnabled: false,
      embeddings: { ...active.embeddings, enabled: false, autoStartProvider: false },
    })).toBe(false);
  });
});
