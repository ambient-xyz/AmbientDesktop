import { describe, expect, it, vi } from "vitest";
import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import type { EmbeddingProviderCandidate } from "../../../shared/localRuntimeTypes";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
} from "./managedEmbeddingProvider";
import {
  AMBIENT_TENCENT_MEMORY_EMBEDDING_PROVIDER,
  AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY,
  normalizeOpenAiEmbeddingBaseUrl,
  resolveAmbientTencentMemoryEmbeddingProvider,
} from "./ambientEmbeddingProvider";

describe("Ambient Tencent memory embedding provider resolver", () => {
  it("keeps embeddings disabled without discovering providers", async () => {
    const listEmbeddingProviders = vi.fn(async () => [embeddingProvider()]);

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: false }),
      workspacePath: "/workspace",
      listEmbeddingProviders,
    });

    expect(result.config).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      enabled: false,
      status: "disabled",
    });
    expect(listEmbeddingProviders).not.toHaveBeenCalled();
  });

  it("falls back to keyword mode when no provider endpoint is available", async () => {
    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true }),
      workspacePath: "/workspace",
      listEmbeddingProviders: async () => [embeddingProvider({
        available: true,
        diagnostics: {
          healthStatus: "passed",
          missingHints: [],
          runtimeState: {
            schemaVersion: "ambient-embedding-provider-runtime-state-v1",
            status: "stopped",
            running: false,
            modelRuntimeId: "bge-runtime",
          },
        },
      })],
    });

    expect(result.config).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      enabled: true,
      status: "keyword_fallback",
      runtimeId: "embeddings:bge-runtime",
      runtimeStatus: "stopped",
      running: false,
    });
  });

  it("builds Tencent OpenAI-compatible embedding config from a running Ambient provider", async () => {
    const fetchImpl = embeddingFetch(384);

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, preflightEnabled: true }),
      workspacePath: "/workspace",
      listEmbeddingProviders: async () => [embeddingProvider()],
      fetchImpl,
    });

    expect(result.config).toEqual({
      enabled: true,
      provider: AMBIENT_TENCENT_MEMORY_EMBEDDING_PROVIDER,
      baseUrl: "http://127.0.0.1:59301/v1",
      apiKey: AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY,
      model: "BAAI/bge-small-en-v1.5",
      dimensions: 384,
      sendDimensions: false,
      maxInputChars: 512,
      timeoutMs: 10_000,
    });
    expect(result.diagnostics).toMatchObject({
      status: "ready",
      providerId: "ambient-cli:embeddings:tool:bge_embeddings",
      endpoint: "http://127.0.0.1:59301/v1",
      modelId: "BAAI/bge-small-en-v1.5",
      dimensions: 384,
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:59301/v1/embeddings", expect.objectContaining({
      method: "POST",
    }));
  });

  it("retries preflight without dimensions when the provider rejects dimensions", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ index: 0, embedding: Array.from({ length: 384 }, () => 0.1) }] }),
      }) as unknown as typeof fetch;

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, sendDimensions: true }),
      workspacePath: "/workspace",
      listEmbeddingProviders: async () => [embeddingProvider()],
      fetchImpl,
    });

    expect(result.config?.sendDimensions).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String((fetchImpl as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0]?.[1].body));
    const secondBody = JSON.parse(String((fetchImpl as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1]?.[1].body));
    expect(firstBody.dimensions).toBe(384);
    expect(secondBody.dimensions).toBeUndefined();
  });

  it("auto-starts stopped providers only when explicitly enabled", async () => {
    const stopped = embeddingProvider({
      diagnostics: {
        healthStatus: "passed",
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "stopped",
          running: false,
          modelRuntimeId: "bge-runtime",
          modelId: "BAAI/bge-small-en-v1.5",
          providerLifecycle: providerLifecycle(),
        },
      },
      providerLifecycle: providerLifecycle(),
    });
    const running = embeddingProvider();
    const listEmbeddingProviders = vi.fn()
      .mockResolvedValueOnce([stopped])
      .mockResolvedValueOnce([running]);
    const startEmbeddingProviderRuntime = vi.fn(async () => ({ status: "started", reason: "started" }));

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, autoStartProvider: true, preflightEnabled: false }),
      workspacePath: "/workspace",
      listEmbeddingProviders,
      startEmbeddingProviderRuntime,
    });

    expect(startEmbeddingProviderRuntime).toHaveBeenCalledWith({
      runtimeId: "embeddings:bge-runtime",
      provider: stopped,
    });
    expect(result.config).toMatchObject({
      baseUrl: "http://127.0.0.1:59301/v1",
      dimensions: 384,
    });
  });

  it("auto-starts the first-party managed EmbeddingGemma provider without Ambient CLI lifecycle metadata", async () => {
    const stopped = embeddingProvider({
      packageId: "ambient:first-party:memory-embeddings",
      packageName: "Ambient Managed Memory Embeddings",
      command: "embeddinggemma_300m_q8_0",
      capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      dimensions: 768,
      diagnostics: {
        healthStatus: "passed",
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "stopped",
          running: false,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        },
      },
    });
    const running = embeddingProvider({
      ...stopped,
      diagnostics: {
        healthStatus: "passed",
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "running",
          running: true,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
          endpoint: "http://127.0.0.1:61234",
        },
      },
    });
    const release = vi.fn(async () => undefined);
    const listEmbeddingProviders = vi.fn()
      .mockResolvedValueOnce([stopped])
      .mockResolvedValueOnce([running]);
    const startEmbeddingProviderRuntime = vi.fn(async () => ({ status: "started", reason: "started", release }));

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, autoStartProvider: true, preflightEnabled: false }),
      workspacePath: "/workspace",
      listEmbeddingProviders,
      startEmbeddingProviderRuntime,
    });

    expect(startEmbeddingProviderRuntime).toHaveBeenCalledWith({
      runtimeId: `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`,
      provider: stopped,
    });
    expect(result.releaseEmbeddingRuntime).toBe(release);
    expect(result.config).toMatchObject({
      baseUrl: "http://127.0.0.1:61234/v1",
      model: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      dimensions: 768,
    });
    expect(result.diagnostics).toMatchObject({
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      status: "ready",
    });
  });

  it("prepares missing first-party managed EmbeddingGemma assets before auto-starting", async () => {
    const missing = managedEmbeddingProvider({
      available: false,
      installed: false,
      availabilityReason: "EmbeddingGemma model and shared runtime are missing.",
      diagnostics: {
        healthStatus: "unknown",
        missingHints: ["Install managed memory embedding assets."],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "unavailable",
          running: false,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        },
      },
    });
    const stopped = managedEmbeddingProvider({
      diagnostics: {
        healthStatus: "passed",
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "stopped",
          running: false,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        },
      },
    });
    const running = managedEmbeddingProvider({
      diagnostics: {
        healthStatus: "passed",
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "running",
          running: true,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
          endpoint: "http://127.0.0.1:61234",
        },
      },
    });
    const listEmbeddingProviders = vi.fn()
      .mockResolvedValueOnce([missing])
      .mockResolvedValueOnce([stopped])
      .mockResolvedValueOnce([running]);
    const prepareEmbeddingProviderRuntime = vi.fn(async () => ({ status: "ready" as const, reason: "assets installed" }));
    const startEmbeddingProviderRuntime = vi.fn(async () => ({ status: "started", reason: "started" }));

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, autoStartProvider: true, preflightEnabled: false }),
      workspacePath: "/workspace",
      listEmbeddingProviders,
      prepareEmbeddingProviderRuntime,
      startEmbeddingProviderRuntime,
    });

    expect(prepareEmbeddingProviderRuntime).toHaveBeenCalledWith({
      runtimeId: `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`,
      provider: missing,
    });
    expect(startEmbeddingProviderRuntime).toHaveBeenCalledWith({
      runtimeId: `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`,
      provider: stopped,
    });
    expect(result.config).toMatchObject({
      baseUrl: "http://127.0.0.1:61234/v1",
      model: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      dimensions: 768,
    });
    expect(result.diagnostics).toMatchObject({
      status: "ready",
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    });
  });

  it("keeps keyword fallback when first-party managed asset preparation is blocked", async () => {
    const missing = managedEmbeddingProvider({
      available: false,
      installed: false,
      availabilityReason: "EmbeddingGemma model and shared runtime are missing.",
      diagnostics: {
        healthStatus: "unknown",
        missingHints: ["Install managed memory embedding assets."],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1",
          status: "unavailable",
          running: false,
          modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        },
      },
    });
    const startEmbeddingProviderRuntime = vi.fn();

    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true, autoStartProvider: true, preflightEnabled: false }),
      workspacePath: "/workspace",
      listEmbeddingProviders: async () => [missing],
      prepareEmbeddingProviderRuntime: async () => ({ status: "partial", reason: "runtime download failed" }),
      startEmbeddingProviderRuntime,
    });

    expect(result.config).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      status: "keyword_fallback",
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      message: "Selected embedding provider could not be prepared: runtime download failed.",
    });
    expect(startEmbeddingProviderRuntime).not.toHaveBeenCalled();
  });

  it("does not enable vector config when preflight fails", async () => {
    const result = await resolveAmbientTencentMemoryEmbeddingProvider({
      memorySettings: memorySettings({ enabled: true }),
      workspacePath: "/workspace",
      listEmbeddingProviders: async () => [embeddingProvider()],
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2] }] }),
      })) as unknown as typeof fetch,
    });

    expect(result.config).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      status: "keyword_fallback",
      lastError: "Embedding endpoint returned 2 dimensions; expected 384.",
    });
  });

  it("normalizes endpoint roots to OpenAI-compatible v1 base URLs", () => {
    expect(normalizeOpenAiEmbeddingBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizeOpenAiEmbeddingBaseUrl("http://127.0.0.1:8080/v1/")).toBe("http://127.0.0.1:8080/v1");
  });
});

function memorySettings(embeddings: Partial<AgentMemorySettings["embeddings"]>): AgentMemorySettings {
  return {
    enabled: true,
    defaultThreadEnabled: true,
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
      ...embeddings,
    },
    storageScope: "workspace",
  };
}

function embeddingProvider(overrides: Partial<EmbeddingProviderCandidate> = {}): EmbeddingProviderCandidate {
  return {
    packageId: "ambient-cli:embeddings",
    packageName: "ambient-bge-embeddings",
    command: "bge_embeddings",
    capabilityId: "ambient-cli:embeddings:tool:bge_embeddings",
    providerId: "ambient-cli:embeddings:tool:bge_embeddings",
    label: "BGE Embeddings",
    modelId: "BAAI/bge-small-en-v1.5",
    dimensions: 384,
    local: true,
    installed: true,
    available: true,
    availabilityReason: "available",
    diagnostics: {
      healthStatus: "passed",
      missingHints: [],
      runtimeState: {
        schemaVersion: "ambient-embedding-provider-runtime-state-v1",
        status: "running",
        running: true,
        modelRuntimeId: "bge-runtime",
        modelId: "BAAI/bge-small-en-v1.5",
        endpoint: "http://127.0.0.1:59301",
      },
    },
    ...overrides,
  };
}

function managedEmbeddingProvider(overrides: Partial<EmbeddingProviderCandidate> = {}): EmbeddingProviderCandidate {
  return embeddingProvider({
    packageId: "ambient:first-party:memory-embeddings",
    packageName: "Ambient Managed Memory Embeddings",
    command: "embeddinggemma_300m_q8_0",
    capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    label: "EmbeddingGemma 300M Q8_0",
    modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
    dimensions: 768,
    local: true,
    installed: true,
    available: true,
    availabilityReason: "EmbeddingGemma model and shared llama.cpp runtime are present in Ambient-managed state.",
    diagnostics: {
      healthStatus: "passed",
      missingHints: [],
      runtimeState: {
        schemaVersion: "ambient-embedding-provider-runtime-state-v1",
        status: "stopped",
        running: false,
        modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
        modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
        modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      },
    },
    ...overrides,
  });
}

function embeddingFetch(dimensions: number): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ index: 0, embedding: Array.from({ length: dimensions }, () => 0.1) }] }),
  })) as unknown as typeof fetch;
}

function providerLifecycle() {
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1" as const,
    providerKind: "ambient-cli" as const,
    start: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "start" as const,
      providerKind: "ambient-cli" as const,
      command: "bge_start",
    },
  };
}
