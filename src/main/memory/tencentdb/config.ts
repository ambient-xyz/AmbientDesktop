import type { TencentMemoryConfig } from "./upstreamContracts";
import type { AmbientTencentMemoryResolvedEmbeddingConfig } from "./ambientEmbeddingProvider";
import { applyAmbientTencentMemoryEmbeddingConfig } from "./ambientEmbeddingProvider";

/**
 * Ambient's conservative TencentDB Agent Memory config.
 *
 * This mirrors TencentCloud/TencentDB-Agent-Memory's MemoryTdaiConfig shape at
 * commit a21ef3f66aebd549dcccc63084c572231b62d245 without importing the
 * OpenClaw plugin package directly. The real TdaiCore remains upstream-owned;
 * Ambient only provides host configuration and keeps extraction/offload
 * disabled until those phases are explicitly wired.
 */
export interface AmbientTencentMemoryDefaultConfigOptions {
  extractionEnabled?: boolean;
  embedding?: AmbientTencentMemoryResolvedEmbeddingConfig;
}

export function ambientTencentMemoryDefaultConfig(
  options: AmbientTencentMemoryDefaultConfigOptions = {},
): TencentMemoryConfig {
  return applyAmbientTencentMemoryEmbeddingConfig({
    capture: {
      enabled: true,
      excludeAgents: [],
      l0l1RetentionDays: 0,
      allowAggressiveCleanup: false,
    },
    recall: {
      enabled: true,
      maxResults: 5,
      maxCharsPerMemory: 1_200,
      maxTotalRecallChars: 4_000,
      scoreThreshold: 0.3,
      strategy: "hybrid",
      timeoutMs: 5_000,
    },
    extraction: {
      enabled: options.extractionEnabled === true,
      enableDedup: true,
      maxMemoriesPerSession: 20,
    },
    pipeline: {
      everyNConversations: 5,
      enableWarmup: true,
      l1IdleTimeoutSeconds: 600,
      l2DelayAfterL1Seconds: 10,
      l2MinIntervalSeconds: 900,
      l2MaxIntervalSeconds: 3_600,
      sessionActiveWindowHours: 24,
    },
    persona: {
      triggerEveryN: 50,
      maxScenes: 15,
      backupCount: 3,
      sceneBackupCount: 10,
    },
    embedding: {
      enabled: false,
      provider: "none",
      baseUrl: "",
      apiKey: "",
      model: "",
      dimensions: 0,
      sendDimensions: true,
      conflictRecallTopK: 5,
      maxInputChars: 5_000,
      timeoutMs: 10_000,
    },
    memoryCleanup: {
      enabled: false,
      cleanTime: "03:00",
    },
    bm25: {
      enabled: false,
      language: "en",
    },
    tcvdb: {
      url: "",
      username: "root",
      apiKey: "",
      database: "",
      alias: "",
      embeddingModel: "bge-large-zh",
      timeout: 10_000,
    },
    storeBackend: "sqlite",
    report: {
      enabled: false,
      type: "local",
    },
    llm: {
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      maxTokens: 4_096,
      timeoutMs: 120_000,
    },
    offload: {
      enabled: false,
      mode: "local",
      temperature: 0.2,
      forceTriggerThreshold: 4,
      defaultContextWindow: 200_000,
      maxPairsPerBatch: 20,
      l2NullThreshold: 4,
      l2TimeoutSeconds: 300,
      mildOffloadRatio: 0.5,
      aggressiveCompressRatio: 0.85,
      mmdMaxTokenRatio: 0.2,
      backendTimeoutMs: 10_000,
      offloadRetentionDays: 0,
      logMaxSizeMb: 50,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }, options.embedding);
}
