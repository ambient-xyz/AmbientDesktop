import { describe, expect, it } from "vitest";
import type {
  EmbeddingProviderCandidate,
  SttProviderCandidate,
  SttProviderValidationMetadata,
  VoiceProviderCandidate,
} from "../shared/types";
import {
  agentRuntimeProviderDiscoveryOptions,
  agentRuntimeProviderDiscoveryWorkspacePaths,
  listEmbeddingProvidersForTools,
  listSttProvidersForTools,
  listVoiceProvidersWithCachedVoices,
  voiceProviderWorkspacePathForCapabilityId,
  type AgentRuntimeProviderDiscoveryOptions,
} from "./agentRuntimeProviderDiscovery";
import { AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID } from "./memory/tencentdb/managedEmbeddingProvider";
import type { VoiceDiscoveryCache } from "./voiceDiscoveryCache";

describe("agent runtime provider discovery", () => {
  it("builds runtime discovery options from store workspace paths and feature listers", async () => {
    const options = agentRuntimeProviderDiscoveryOptions({
      store: {
        getWorkspace: () => ({ path: "/workspace/root" }),
        listThreads: () => [
          { workspacePath: "/workspace/a" },
          { workspacePath: "/workspace/root" },
        ],
      },
      features: {
        voice: {
          listProviders: async (workspacePath) => [voiceProvider(`voice:${workspacePath}`)],
        },
        embeddings: {
          listProviders: async (workspacePath) => [embeddingProvider(`embedding:${workspacePath}`)],
        },
        stt: {
          listProviders: async (workspacePath) => [sttProvider(`stt:${workspacePath}`)],
        },
      },
    });

    expect(agentRuntimeProviderDiscoveryWorkspacePaths(options)).toEqual(["/workspace/root", "/workspace/a"]);
    await expect(options.listVoiceProviders?.("/workspace/a")).resolves.toEqual([expect.objectContaining({ capabilityId: "voice:/workspace/a" })]);
    await expect(options.listEmbeddingProviders?.("/workspace/a")).resolves.toEqual([expect.objectContaining({ capabilityId: "embedding:/workspace/a" })]);
    await expect(options.listSttProviders?.("/workspace/a")).resolves.toEqual([expect.objectContaining({ capabilityId: "stt:/workspace/a" })]);
  });

  it("dedupes provider workspaces while preserving root-first order", () => {
    expect(agentRuntimeProviderDiscoveryWorkspacePaths(options({
      rootWorkspacePath: "/workspace/root",
      threadWorkspacePaths: ["/workspace/a", "/workspace/root", "/workspace/b", "/workspace/a"],
    }))).toEqual(["/workspace/root", "/workspace/a", "/workspace/b"]);
  });

  it("resolves voice provider workspace paths by capability id", async () => {
    const calls: string[] = [];
    const result = await voiceProviderWorkspacePathForCapabilityId(options({
      rootWorkspacePath: "/workspace/root",
      threadWorkspacePaths: ["/workspace/a", "/workspace/b"],
      listVoiceProviders: async (workspacePath) => {
        calls.push(workspacePath);
        return workspacePath === "/workspace/b" ? [voiceProvider("voice:b")] : [voiceProvider(`voice:${workspacePath}`)];
      },
    }), "voice:b");

    expect(result).toBe("/workspace/b");
    expect(calls).toEqual(["/workspace/root", "/workspace/a", "/workspace/b"]);
    await expect(voiceProviderWorkspacePathForCapabilityId(options({ rootWorkspacePath: "/workspace/root" }), undefined)).resolves.toBe("/workspace/root");
  });

  it("merges cached voice providers from each workspace and keeps the first capability match", async () => {
    const cachesRead: string[] = [];
    const result = await listVoiceProvidersWithCachedVoices(options({
      rootWorkspacePath: "/workspace/root",
      threadWorkspacePaths: ["/workspace/a"],
      listVoiceProviders: async (workspacePath) => workspacePath === "/workspace/root"
        ? [voiceProvider("voice:shared"), voiceProvider("voice:root")]
        : [voiceProvider("voice:shared"), voiceProvider("voice:a")],
      readVoiceDiscoveryCache: async (workspacePath) => {
        cachesRead.push(workspacePath);
        return emptyVoiceCache();
      },
      mergeVoiceProvidersWithCachedVoices: (providers) => providers.map((provider) => ({
        ...provider,
        label: `${provider.label} cached`,
      })),
    }), "/workspace/root");

    expect(cachesRead).toEqual(["/workspace/root", "/workspace/a"]);
    expect(result.map((provider) => [provider.capabilityId, provider.label])).toEqual([
      ["voice:shared", "voice:shared cached"],
      ["voice:root", "voice:root cached"],
      ["voice:a", "voice:a cached"],
    ]);
  });

  it("dedupes embedding providers across runtime workspaces while preserving the managed memory provider", async () => {
    const result = await listEmbeddingProvidersForTools(options({
      rootWorkspacePath: "/workspace/root",
      threadWorkspacePaths: ["/workspace/a"],
      listEmbeddingProviders: async (workspacePath) => workspacePath === "/workspace/root"
        ? [embeddingProvider("embedding:shared"), embeddingProvider("embedding:root")]
        : [embeddingProvider("embedding:shared"), embeddingProvider("embedding:a")],
    }), "/workspace/root");

    expect(result.map((provider) => provider.capabilityId)).toEqual([
      AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      "embedding:shared",
      "embedding:root",
      "embedding:a",
    ]);
  });

  it("adds the first-party managed memory embedding provider when using default embedding discovery", async () => {
    const result = await listEmbeddingProvidersForTools(options({
      rootWorkspacePath: "/tmp/ambient-provider-discovery-empty",
    }), "/tmp/ambient-provider-discovery-empty");

    expect(result[0]).toMatchObject({
      capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelId: "embeddinggemma-300m-q8_0",
      dimensions: 768,
      local: true,
    });
  });

  it("merges STT validation metadata after listing providers", async () => {
    const validation = sttValidation();
    const result = await listSttProvidersForTools(options({
      rootWorkspacePath: "/workspace/root",
      listSttProviders: async (workspacePath) => {
        expect(workspacePath).toBe("/workspace/root");
        return [sttProvider("stt:qwen")];
      },
      readSttValidationMetadata: async (workspacePath) => {
        expect(workspacePath).toBe("/workspace/root");
        return validation;
      },
      mergeSttProvidersWithValidation: (providers, receivedValidation) => {
        expect(receivedValidation).toBe(validation);
        return providers.map((provider) => ({ ...provider, validation: receivedValidation }));
      },
    }), "/workspace/root");

    expect(result).toEqual([expect.objectContaining({ capabilityId: "stt:qwen", validation })]);
  });
});

interface OptionsInput {
  rootWorkspacePath: string;
  threadWorkspacePaths?: string[];
  listVoiceProviders?: AgentRuntimeProviderDiscoveryOptions["listVoiceProviders"];
  listEmbeddingProviders?: AgentRuntimeProviderDiscoveryOptions["listEmbeddingProviders"];
  listSttProviders?: AgentRuntimeProviderDiscoveryOptions["listSttProviders"];
  readVoiceDiscoveryCache?: AgentRuntimeProviderDiscoveryOptions["readVoiceDiscoveryCache"];
  mergeVoiceProvidersWithCachedVoices?: AgentRuntimeProviderDiscoveryOptions["mergeVoiceProvidersWithCachedVoices"];
  readSttValidationMetadata?: AgentRuntimeProviderDiscoveryOptions["readSttValidationMetadata"];
  mergeSttProvidersWithValidation?: AgentRuntimeProviderDiscoveryOptions["mergeSttProvidersWithValidation"];
}

function options(input: OptionsInput): AgentRuntimeProviderDiscoveryOptions {
  const result: AgentRuntimeProviderDiscoveryOptions = {
    getRootWorkspacePath: () => input.rootWorkspacePath,
    getThreadWorkspacePaths: () => input.threadWorkspacePaths ?? [],
  };
  if (input.listVoiceProviders) result.listVoiceProviders = input.listVoiceProviders;
  if (input.listEmbeddingProviders) result.listEmbeddingProviders = input.listEmbeddingProviders;
  if (input.listSttProviders) result.listSttProviders = input.listSttProviders;
  if (input.readVoiceDiscoveryCache) result.readVoiceDiscoveryCache = input.readVoiceDiscoveryCache;
  if (input.mergeVoiceProvidersWithCachedVoices) result.mergeVoiceProvidersWithCachedVoices = input.mergeVoiceProvidersWithCachedVoices;
  if (input.readSttValidationMetadata) result.readSttValidationMetadata = input.readSttValidationMetadata;
  if (input.mergeSttProvidersWithValidation) result.mergeSttProvidersWithValidation = input.mergeSttProvidersWithValidation;
  return result;
}

function voiceProvider(capabilityId: string): VoiceProviderCandidate {
  return {
    packageId: "ambient-voice",
    packageName: "ambient-voice",
    command: "voice",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    format: "wav",
    formats: ["wav"],
    voices: [],
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function embeddingProvider(capabilityId: string): EmbeddingProviderCandidate {
  return {
    packageId: "ambient-embedding",
    packageName: "ambient-embedding",
    command: "embed",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function sttProvider(capabilityId: string): SttProviderCandidate {
  return {
    packageId: "ambient-stt",
    packageName: "ambient-stt",
    command: "stt",
    capabilityId,
    providerId: capabilityId,
    label: capabilityId,
    languages: ["English"],
    installed: true,
    available: true,
    availabilityReason: "available",
  };
}

function sttValidation(): SttProviderValidationMetadata {
  return {
    schemaVersion: "ambient-stt-provider-validation-v1",
    provider: "qwen3-asr",
    packageName: "ambient-qwen3-asr",
    providerCapabilityId: "stt:qwen",
    status: "passed",
    updatedAt: "2026-06-11T00:00:00.000Z",
    platform: "darwin",
    arch: "arm64",
    lane: "native",
    missingHints: [],
  };
}

function emptyVoiceCache(): VoiceDiscoveryCache {
  return {
    schemaVersion: "ambient-voice-discovery-cache-v1",
    providers: {},
  };
}
