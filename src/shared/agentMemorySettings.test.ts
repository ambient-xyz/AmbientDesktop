import { describe, expect, it } from "vitest";
import {
  applyAgentMemorySettingsPatch,
  DEFAULT_AGENT_MEMORY_SETTINGS,
  isAgentMemoryActiveForThread,
  normalizeAgentMemorySettings,
} from "./agentMemorySettings";

describe("agent memory settings", () => {
  it("defaults Tencent memory and short-term offload off", () => {
    expect(normalizeAgentMemorySettings()).toEqual(DEFAULT_AGENT_MEMORY_SETTINGS);
    expect(DEFAULT_AGENT_MEMORY_SETTINGS).toMatchObject({
      enabled: false,
      defaultThreadEnabled: false,
      adapter: "tencentdb",
      shortTermOffloadEnabled: false,
      embeddings: {
        enabled: false,
        providerMode: "ambient-managed",
        autoStartProvider: false,
        sendDimensions: false,
        maxInputChars: 512,
        timeoutMs: 10_000,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
  });

  it("patches known fields and ignores malformed values", () => {
    expect(applyAgentMemorySettingsPatch(DEFAULT_AGENT_MEMORY_SETTINGS, {
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
      enabled: true,
      defaultThreadEnabled: true,
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
      enabled: true,
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
      enabled: true,
      adapter: "tencentdb",
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        autoStartProvider: false,
        sendDimensions: false,
        maxInputChars: 128,
        timeoutMs: 1_000,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
  });

  it("requires every gate before Tencent memory can activate", () => {
    const settings = { ...DEFAULT_AGENT_MEMORY_SETTINGS, enabled: true };

    expect(isAgentMemoryActiveForThread({
      featureEnabled: false,
      settings,
      threadMemoryEnabled: true,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings: DEFAULT_AGENT_MEMORY_SETTINGS,
      threadMemoryEnabled: true,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings,
      threadMemoryEnabled: false,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings,
      threadMemoryEnabled: true,
      storageHealthy: false,
    })).toBe(false);
    expect(isAgentMemoryActiveForThread({
      featureEnabled: true,
      settings,
      threadMemoryEnabled: true,
    })).toBe(true);
  });
});
