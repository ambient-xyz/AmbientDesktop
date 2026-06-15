import { describe, expect, it } from "vitest";
import { normalizeAgentMemorySettings } from "../../../shared/agentMemorySettings";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  discoverAmbientMemoryEmbeddingProviders,
  startAmbientMemoryEmbeddingRuntime,
} from "./managedEmbeddingProvider";
import { resolveAmbientTencentMemoryEmbeddingProvider } from "./ambientEmbeddingProvider";

const runLive = process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_LIVE === "1" ? describe : describe.skip;

runLive("managed Tencent memory embedding provider live", () => {
  it("starts Ambient-managed llama.cpp EmbeddingGemma and resolves an OpenAI-compatible embeddings config", async () => {
    const workspacePath = process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_WORKSPACE || process.cwd();

    const start = await startAmbientMemoryEmbeddingRuntime({
      workspacePath,
      ownerThreadId: "live-memory-embedding-test",
      startupTimeoutMs: 240_000,
      idleTimeoutMs: 0,
    });
    expect(start.status, start.reason).toMatch(/^(started|ready)$/);

    try {
      const providers = await discoverAmbientMemoryEmbeddingProviders(workspacePath);
      const provider = providers.find((candidate) => candidate.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID);
      expect(provider?.available).toBe(true);
      expect(provider?.diagnostics?.runtimeState).toMatchObject({
        running: true,
        status: "running",
        modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      });
      const endpoint = provider?.diagnostics?.runtimeState?.endpoint;
      expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const directResponse = await fetch(`${endpoint}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
          input: "Ambient memory semantic recall live probe.",
        }),
      });
      if (!directResponse.ok) {
        throw new Error(`Embedding endpoint returned HTTP ${directResponse.status}: ${await directResponse.text()}`);
      }
      const directJson = await directResponse.json() as { data?: Array<{ embedding?: number[] }> };
      expect(directJson.data?.[0]?.embedding).toHaveLength(768);

      const resolution = await resolveAmbientTencentMemoryEmbeddingProvider({
        workspacePath,
        memorySettings: normalizeAgentMemorySettings({
          enabled: true,
          defaultThreadEnabled: true,
          embeddings: {
            enabled: true,
            providerCapabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
            autoStartProvider: false,
            preflightEnabled: true,
          },
        }),
        listEmbeddingProviders: () => discoverAmbientMemoryEmbeddingProviders(workspacePath),
      });

      expect(resolution.diagnostics).toMatchObject({
        status: "ready",
        providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        dimensions: 768,
      });
      expect(resolution.config).toMatchObject({
        enabled: true,
        model: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
        dimensions: 768,
        sendDimensions: false,
      });
    } finally {
      await start.release?.();
    }
  }, 300_000);
});
