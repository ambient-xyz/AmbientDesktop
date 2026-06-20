import { describe, expect, it } from "vitest";
import type {
  AgentMemoryEmbeddingDiagnostics,
  AgentMemoryNativeDependencyPreflight,
  AgentMemoryStorageDiagnostics,
} from "../../../shared/agentMemoryDiagnostics";
import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import type { AgentMemoryStarterAssetSnapshot } from "./starter";
import {
  agentMemoryStarterAssetSnapshotFromDetection,
  agentMemoryStarterAssetSnapshotFromError,
  agentMemoryStarterDisableMemoryPatch,
  agentMemoryStarterEnableMemoryPatch,
  agentMemoryStarterStatusFromDiagnostics,
} from "./starter";

describe("TencentDB agent memory starter", () => {
  it("reports off when the user-facing starter has not enabled memory yet", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: false },
        memory: memorySettings({ enabled: false }),
      },
      diagnostics: diagnostics({ featureEnabled: false, settingsEnabled: false }),
      assets: missingAssets(),
      activeThread: { id: "thread-1", memoryEnabled: false },
      now: now(),
    });

    expect(status).toMatchObject({
      state: "off",
      blockers: [],
      nextActions: ["enable"],
    });
  });

  it("stays off when disabled memory encounters asset inspection errors", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: false },
        memory: memorySettings({ enabled: false }),
      },
      diagnostics: diagnostics({ featureEnabled: false, settingsEnabled: false }),
      assets: agentMemoryStarterAssetSnapshotFromError(new Error("llama runtime receipt unreadable")),
      activeThread: { id: "thread-1", memoryEnabled: false },
      now: now(),
    });

    expect(status).toMatchObject({
      state: "off",
      blockers: [],
      nextActions: ["enable"],
    });
  });

  it("maps missing managed assets to an installable setup state", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        embedding: {
          enabled: true,
          status: "keyword_fallback",
          message: "No active runtime has resolved an embedding provider yet.",
        },
      }),
      assets: missingAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("setup_required");
    expect(status.blockers.map((blocker) => blocker.code)).toEqual(["model_missing", "runtime_missing"]);
    expect(status.nextActions).toEqual(["install", "disable"]);
  });

  it("does not report subagent child threads as memory-enabled even under global mode", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        activeThreadCount: 1,
        threadEnabledCount: 1,
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-child", kind: "subagent_child", memoryEnabled: true },
      now: now(),
    });

    expect(status.threadScope).toMatchObject({
      activeThreadId: "thread-child",
      activeThreadMemoryEnabled: false,
      activeThreadCount: 1,
      enabledThreadCount: 1,
    });
  });

  it("uses the effective feature flag from diagnostics when startup overrides differ from persisted settings", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: false },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        embedding: {
          enabled: true,
          status: "keyword_fallback",
          message: "No active runtime has resolved an embedding provider yet.",
        },
      }),
      assets: missingAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("setup_required");
    expect(status.blockers.map((blocker) => blocker.code)).toEqual(["model_missing", "runtime_missing"]);
  });

  it("surfaces feature-disabled blockers when memory is requested but the effective flag is off", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: false,
        settingsEnabled: true,
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("setup_required");
    expect(status.blockers).toContainEqual(expect.objectContaining({
      code: "feature_disabled",
      retryable: false,
    }));
    expect(status.nextActions).toEqual(["enable", "open_logs", "disable"]);
  });

  it("reports ready when settings, assets, native preflight, thread scope, and endpoint are healthy", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        activeThreadCount: 1,
        threadEnabledCount: 1,
        embedding: {
          enabled: true,
          status: "ready",
          message: "Embedding endpoint preflight passed.",
          runtimeStatus: "running",
          running: true,
          endpoint: "http://127.0.0.1:51234",
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status).toMatchObject({
      state: "ready",
      runtime: {
        state: "running",
        endpoint: "http://127.0.0.1:51234",
      },
      blockers: [],
      nextActions: ["disable", "clear_memory"],
    });
  });

  it("does not report ready when storage diagnostics are failing", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        status: "error",
        message: "TencentDB Agent Memory storage schema is unsupported.",
        storageSchemaStatus: "unsupported",
        storageSchemaMessage: "Stored schema version is incompatible.",
        embedding: {
          enabled: true,
          status: "ready",
          message: "Embedding endpoint preflight passed.",
          runtimeStatus: "running",
          running: true,
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toEqual([expect.objectContaining({
      code: "storage_unhealthy",
      message: "Stored schema version is incompatible.",
      retryable: false,
    })]);
    expect(status.nextActions).toEqual(["repair", "open_logs", "disable"]);
  });

  it("does not report ready when storage diagnostics need attention", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        status: "needs_attention",
        message: "TencentDB Agent Memory core is unavailable.",
        storageSchemaStatus: "current",
        storageSchemaMessage: "Storage schema is current.",
        embedding: {
          enabled: true,
          status: "ready",
          message: "Embedding endpoint preflight passed.",
          runtimeStatus: "running",
          running: true,
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toEqual([expect.objectContaining({
      code: "storage_unhealthy",
      message: "TencentDB Agent Memory core is unavailable.",
      retryable: true,
    })]);
    expect(status.nextActions).toEqual(["repair", "open_logs", "disable"]);
  });

  it("does not turn embedding-only diagnostics errors into storage blockers", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        status: "error",
        message: "Embedding endpoint preflight failed.",
        storageSchemaStatus: "current",
        storageSchemaMessage: "Storage schema is current.",
        embedding: {
          enabled: true,
          status: "error",
          message: "Embedding endpoint preflight failed.",
          runtimeStatus: "running",
          running: false,
          lastError: "Embedding endpoint returned 500.",
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toEqual([expect.objectContaining({
      code: "embedding_preflight_failed",
      message: "Embedding endpoint returned 500.",
      retryable: true,
    })]);
    expect(status.nextActions).toEqual(["retry_preflight", "repair", "disable"]);
  });

  it("surfaces failed embedding starts as start failures", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        status: "error",
        message: "Ambient-managed memory embeddings failed to start.",
        storageSchemaStatus: "current",
        storageSchemaMessage: "Storage schema is current.",
        embedding: {
          enabled: true,
          status: "error",
          message: "Ambient-managed memory embeddings failed to start.",
          runtimeStatus: "failed",
          running: false,
          lastError: "llama-server exited before opening an endpoint.",
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers[0]).toEqual(expect.objectContaining({
      code: "start_failed",
      message: "llama-server exited before opening an endpoint.",
      retryable: true,
    }));
    expect(status.blockers).toContainEqual(expect.objectContaining({
      code: "embedding_preflight_failed",
      message: "llama-server exited before opening an endpoint.",
      retryable: true,
    }));
    expect(status.nextActions).toEqual(["retry_preflight", "repair", "open_logs", "disable"]);
  });

  it("does not treat stale embedding runtime state files as running endpoints", () => {
    const snapshot = agentMemoryStarterAssetSnapshotFromDetection({
      managedRoot: "/tmp/ambient-managed",
      model: {
        status: "present",
        cachePath: "/tmp/ambient-managed/model.gguf",
        expectedBytes: 10,
        expectedSha256: "abc",
        sizeBytes: 10,
      },
      runtime: {
        status: "present",
        binaryPath: "/tmp/ambient-managed/llama-server",
        artifactId: "runtime",
      },
      stateRootPath: "/tmp/ambient-managed/state",
      state: {
        schemaVersion: "ambient-local-llama-server-state-v1",
        profileId: "embeddinggemma",
        pid: 99_999_999,
        endpointUrl: "http://127.0.0.1:61234",
        host: "127.0.0.1",
        port: 61234,
        runtimeBinaryPath: "/tmp/ambient-managed/llama-server",
        modelPath: "/tmp/ambient-managed/model.gguf",
        contextTokens: 2048,
        gpuLayers: 99,
        idleTimeoutMs: 0,
        startedAt: now().toISOString(),
        lastUsedAt: now().toISOString(),
        stateDir: "/tmp/ambient-managed/state/embeddinggemma",
        logPath: "/tmp/ambient-managed/state/embeddinggemma/server.log",
        stdoutPath: "/tmp/ambient-managed/state/embeddinggemma/stdout.log",
        stderrPath: "/tmp/ambient-managed/state/embeddinggemma/stderr.log",
        command: [],
      },
    });

    expect(snapshot.runtimeStatus).toMatchObject({
      state: "stopped",
      runtimeId: "embeddinggemma",
    });
  });

  it("does not let stale embedding diagnostics override live stopped runtime detection", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        activeThreadCount: 1,
        threadEnabledCount: 1,
        embedding: {
          enabled: true,
          status: "ready",
          message: "Embedding endpoint preflight passed.",
          runtimeStatus: "running",
          running: true,
          endpoint: "http://127.0.0.1:51234",
        },
      }),
      assets: {
        ...readyAssets(),
        runtimeStatus: {
          state: "stopped",
          runtimeId: "ambient-memory-embeddings",
          message: "Ambient-managed memory embedding assets are installed, but the endpoint is not running.",
        },
      },
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("setup_required");
    expect(status.runtime).toMatchObject({
      state: "stopped",
      runtimeId: "ambient-memory-embeddings",
    });
    expect(status.nextActions).toEqual(["start", "disable"]);
  });

  it("keeps native preflight failures in needs-repair instead of pretending setup is ready", () => {
    const nativePreflight = native({ status: "needs_attention", message: "sqlite-vec package metadata is not resolvable." });
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        nativePreflight,
        embedding: {
          enabled: true,
          status: "ready",
          message: "Embedding endpoint preflight passed.",
          runtimeStatus: "running",
          running: true,
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toContainEqual(expect.objectContaining({
      code: "native_preflight_failed",
      message: "sqlite-vec package metadata is not resolvable.",
      retryable: true,
    }));
    expect(status.nextActions).toEqual(["retry_preflight", "repair", "disable"]);
  });

  it("surfaces blocked embedding starts as resident runtime conflicts", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: true, embeddingsEnabled: true }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: true,
        embedding: {
          enabled: true,
          status: "keyword_fallback",
          message: "Another llama.cpp runtime is already resident.",
          runtimeStatus: "blocked",
        },
      }),
      assets: readyAssets(),
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toContainEqual(expect.objectContaining({
      code: "resident_runtime_conflict",
      message: "Another llama.cpp runtime is already resident.",
      retryable: true,
    }));
    expect(status.nextActions).toEqual(["repair", "open_logs", "disable"]);
  });

  it("keeps disable stop failures visible instead of reporting off", () => {
    const status = agentMemoryStarterStatusFromDiagnostics({
      settings: {
        featureFlags: { tencentDbMemory: true },
        memory: memorySettings({ enabled: false, embeddingsEnabled: false }),
      },
      diagnostics: diagnostics({
        featureEnabled: true,
        settingsEnabled: false,
      }),
      assets: readyAssets(),
      runtimeOverride: {
        state: "blocked",
        message: "Ambient-managed memory embeddings are still leased by 1 active owner.",
      },
      activeThread: { id: "thread-1", memoryEnabled: true },
      now: now(),
    });

    expect(status.state).toBe("needs_repair");
    expect(status.blockers).toEqual([expect.objectContaining({
      code: "stop_failed",
      message: "Ambient-managed memory embeddings are still leased by 1 active owner.",
      retryable: true,
    })]);
    expect(status.nextActions).toEqual(["open_logs", "disable"]);
  });

  it("builds idempotent enable and disable memory settings patches", () => {
    expect(agentMemoryStarterEnableMemoryPatch({ enableNewThreads: false })).toEqual({
      mode: "per_thread",
      enabled: true,
      defaultThreadEnabled: false,
      adapter: "tencentdb",
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        providerCapabilityId: undefined,
        autoStartProvider: true,
        modelId: undefined,
        dimensions: undefined,
        sendDimensions: false,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
    expect(agentMemoryStarterEnableMemoryPatch()).toMatchObject({
      mode: "enabled_all",
      enabled: true,
      defaultThreadEnabled: true,
      embeddings: {
        enabled: true,
        autoStartProvider: true,
      },
    });
    expect(agentMemoryStarterEnableMemoryPatch({}, { enableNewThreadsDefault: undefined })).toEqual({
      mode: "enabled_all",
      enabled: true,
      adapter: "tencentdb",
      embeddings: {
        enabled: true,
        providerMode: "ambient-managed",
        providerCapabilityId: undefined,
        autoStartProvider: true,
        modelId: undefined,
        dimensions: undefined,
        sendDimensions: false,
        preflightEnabled: true,
      },
      storageScope: "workspace",
    });
    expect(agentMemoryStarterDisableMemoryPatch()).toEqual({
      mode: "disabled",
      enabled: false,
      embeddings: {
        enabled: false,
        autoStartProvider: false,
      },
    });
  });
});

function now(): Date {
  return new Date("2026-06-16T21:43:00.000Z");
}

function memorySettings(input: { enabled: boolean; embeddingsEnabled?: boolean }): AgentMemorySettings {
  return {
    mode: input.enabled ? "enabled_all" : "disabled",
    enabled: input.enabled,
    defaultThreadEnabled: input.enabled,
    adapter: "tencentdb",
    shortTermOffloadEnabled: false,
    storageScope: "workspace",
    embeddings: {
      enabled: Boolean(input.embeddingsEnabled),
      providerMode: "ambient-managed",
      autoStartProvider: Boolean(input.embeddingsEnabled),
      sendDimensions: false,
      maxInputChars: 512,
      timeoutMs: 10_000,
      preflightEnabled: true,
    },
  };
}

function diagnostics(input: {
  featureEnabled: boolean;
  settingsEnabled: boolean;
  embedding?: AgentMemoryEmbeddingDiagnostics;
  nativePreflight?: AgentMemoryNativeDependencyPreflight;
  activeThreadCount?: number;
  threadEnabledCount?: number;
  status?: AgentMemoryStorageDiagnostics["status"];
  message?: string;
  storageSchemaStatus?: AgentMemoryStorageDiagnostics["storageSchemaStatus"];
  storageSchemaMessage?: string;
}): AgentMemoryStorageDiagnostics {
  const status = input.status ?? (input.featureEnabled && input.settingsEnabled ? "healthy" : "unavailable");
  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: "workspace",
    checkedAt: now().toISOString(),
    status,
    message: input.message ?? (input.featureEnabled && input.settingsEnabled ? "Diagnostics are available." : "TencentDB Agent Memory is disabled."),
    featureEnabled: input.featureEnabled,
    settingsEnabled: input.settingsEnabled,
    defaultThreadEnabled: false,
    embedding: input.embedding ?? {
      enabled: false,
      status: "disabled",
      message: "TencentDB memory embeddings are disabled.",
    },
    activeThreadCount: input.activeThreadCount ?? 0,
    threadEnabledCount: input.threadEnabledCount ?? 0,
    dataDir: "/tmp/ambient-memory/tencentdb",
    dataDirExists: false,
    storageSchemaStatus: input.storageSchemaStatus ?? "missing",
    storageSchemaPath: "/tmp/ambient-memory/tencentdb/ambient-memory-schema.json",
    storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
    storageSchemaMessage: input.storageSchemaMessage ?? "Storage has not been created.",
    fileCount: 0,
    totalBytes: 0,
    topLevelEntryCount: 0,
    rawContentIncluded: false,
    nativePreflight: input.nativePreflight ?? native(),
    runtimeSnapshots: [],
    errors: [],
  };
}

function native(input: { status?: AgentMemoryNativeDependencyPreflight["status"]; message?: string } = {}): AgentMemoryNativeDependencyPreflight {
  return {
    schemaVersion: "ambient-agent-memory-native-preflight-v1",
    checkedAt: now().toISOString(),
    platform: "darwin",
    arch: "arm64",
    coreModuleConfigured: true,
    coreModuleSpecifier: "@ambient/tencentedb-memory",
    status: input.status ?? "healthy",
    message: input.message ?? "TencentDB Agent Memory native dependency package metadata resolved.",
    dependencies: [],
    errors: [],
  };
}

function missingAssets(): AgentMemoryStarterAssetSnapshot {
  return {
    model: {
      state: "missing",
      path: "/managed/embeddinggemma.gguf",
      message: "EmbeddingGemma GGUF is not present in Ambient-managed state.",
    },
    runtime: {
      state: "missing",
      path: "/managed/llama-server",
      message: "Shared llama.cpp runtime binary is not present in Ambient-managed state.",
    },
    runtimeStatus: {
      state: "unknown",
      message: "Ambient-managed memory embedding runtime is not ready.",
    },
  };
}

function readyAssets(): AgentMemoryStarterAssetSnapshot {
  return {
    model: {
      state: "present",
      path: "/managed/embeddinggemma.gguf",
    },
    runtime: {
      state: "present",
      path: "/managed/llama-server",
      artifactId: "llama-server-darwin-arm64",
    },
    runtimeStatus: {
      state: "running",
      runtimeId: "ambient-memory-embeddings",
      endpoint: "http://127.0.0.1:51234",
    },
  };
}
