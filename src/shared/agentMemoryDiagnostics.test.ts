import { describe, expect, it } from "vitest";

import {
  agentMemoryStorageDiagnosticsWithEmbedding,
  mergeAgentMemoryEmbeddingLifecycleDiagnostics,
  mergeAgentMemoryEmbeddingLiveDiagnostics,
  type AgentMemoryEmbeddingDiagnostics,
  type AgentMemoryStorageDiagnostics,
} from "./agentMemoryDiagnostics";

function embedding(input: Partial<AgentMemoryEmbeddingDiagnostics>): AgentMemoryEmbeddingDiagnostics {
  return {
    enabled: true,
    status: "keyword_fallback",
    message: "snapshot",
    ...input,
  };
}

describe("Agent Memory diagnostics", () => {
  it("preserves runtime-snapshot reindex failures when live endpoint checks pass", () => {
    const merged = mergeAgentMemoryEmbeddingLiveDiagnostics(
      embedding({
        status: "ready",
        message: "Runtime snapshot captured a reindex failure.",
        endpoint: "http://127.0.0.1:5001",
        reindexStatus: "error",
        lastError: "Vector reindex failed.",
      }),
      embedding({
        status: "ready",
        message: "Embedding endpoint preflight passed.",
        endpoint: "http://127.0.0.1:6001",
        reindexStatus: "unknown",
      }),
    );

    expect(merged).toMatchObject({
      status: "ready",
      message: "Embedding endpoint preflight passed.",
      endpoint: "http://127.0.0.1:6001",
      reindexStatus: "error",
      lastError: "Vector reindex failed.",
    });
  });

  it("drops stale snapshot errors when no reindex error remains", () => {
    const merged = mergeAgentMemoryEmbeddingLiveDiagnostics(
      embedding({
        status: "error",
        message: "Old endpoint failure.",
        reindexStatus: "unknown",
        lastError: "Old endpoint failed.",
      }),
      embedding({
        status: "ready",
        message: "Embedding endpoint preflight passed.",
        reindexStatus: "unknown",
      }),
    );

    expect(merged.status).toBe("ready");
    expect(merged.lastError).toBeUndefined();
  });

  it("preserves pending reindex details when live endpoint checks pass", () => {
    const merged = mergeAgentMemoryEmbeddingLiveDiagnostics(
      embedding({
        reindexStatus: "pending",
        lastError: "Core package does not expose reindexAllEmbeddings().",
      }),
      embedding({
        status: "ready",
        message: "Embedding endpoint preflight passed.",
        reindexStatus: "unknown",
      }),
    );

    expect(merged).toMatchObject({
      status: "ready",
      reindexStatus: "pending",
      lastError: "Core package does not expose reindexAllEmbeddings().",
    });
  });

  it("clears stale runtime endpoint fields when live checks do not report a running endpoint", () => {
    const merged = mergeAgentMemoryEmbeddingLiveDiagnostics(
      embedding({
        status: "ready",
        message: "Old endpoint ready.",
        endpoint: "http://127.0.0.1:5001",
        runtimeId: "embeddings:old",
        runtimeStatus: "running",
        running: true,
      }),
      embedding({
        status: "keyword_fallback",
        message: "Ambient-managed memory embeddings are stopped.",
      }),
    );

    expect(merged.status).toBe("keyword_fallback");
    expect(merged.endpoint).toBeUndefined();
    expect(merged.runtimeId).toBeUndefined();
    expect(merged.runtimeStatus).toBeUndefined();
    expect(merged.running).toBeUndefined();
  });

  it("escalates top-level diagnostics when live embedding checks fail", () => {
    const diagnostics = storageDiagnostics({
      status: "healthy",
      message: "TencentDB Agent Memory diagnostics are available.",
      errors: [],
    });
    const updated = agentMemoryStorageDiagnosticsWithEmbedding(
      diagnostics,
      embedding({
        status: "error",
        message: "Embedding endpoint preflight failed.",
        lastError: "Embedding endpoint returned 500.",
      }),
    );

    expect(updated.status).toBe("error");
    expect(updated.message).toBe("Embedding endpoint preflight failed.");
    expect(updated.errors).toContain("Embedding endpoint returned 500.");
  });

  it("does not hide existing top-level diagnostics when embedding checks fail", () => {
    const diagnostics = storageDiagnostics({
      status: "needs_attention",
      message: "TencentDB Agent Memory core is unavailable.",
      errors: ["Core module unavailable."],
    });
    const updated = agentMemoryStorageDiagnosticsWithEmbedding(
      diagnostics,
      embedding({
        status: "error",
        message: "Embedding endpoint preflight failed.",
        lastError: "Embedding endpoint returned 500.",
      }),
    );

    expect(updated.status).toBe("needs_attention");
    expect(updated.message).toBe("TencentDB Agent Memory core is unavailable.");
    expect(updated.errors).toEqual(["Core module unavailable.", "Embedding endpoint returned 500."]);
  });

  it("keeps unavailable embedding assets separate from storage health", () => {
    const diagnostics = storageDiagnostics({
      status: "healthy",
      message: "TencentDB Agent Memory diagnostics are available.",
      errors: [],
    });
    const updated = agentMemoryStorageDiagnosticsWithEmbedding(
      diagnostics,
      embedding({
        status: "unavailable",
        message: "Ambient-managed memory embedding assets are not installed.",
      }),
    );

    expect(updated.status).toBe("healthy");
    expect(updated.message).toBe("TencentDB Agent Memory diagnostics are available.");
    expect(updated.errors).toEqual([]);
    expect(updated.embedding).toMatchObject({
      status: "unavailable",
      message: "Ambient-managed memory embedding assets are not installed.",
    });
  });

  it("keeps checked endpoint failures over optimistic lifecycle statuses", () => {
    const merged = mergeAgentMemoryEmbeddingLifecycleDiagnostics(
      embedding({
        status: "error",
        message: "Embedding endpoint preflight failed.",
        runtimeStatus: "running",
        running: true,
        lastError: "Embedding endpoint returned 2 dimensions; expected 384.",
      }),
      embedding({
        status: "ready",
        message: "Ambient-managed memory embeddings started.",
        runtimeStatus: "running",
        running: true,
      }),
    );

    expect(merged).toMatchObject({
      status: "error",
      message: "Embedding endpoint preflight failed.",
      runtimeStatus: "running",
      running: true,
      lastError: "Embedding endpoint returned 2 dimensions; expected 384.",
    });
  });
});

function storageDiagnostics(input: Partial<AgentMemoryStorageDiagnostics>): AgentMemoryStorageDiagnostics {
  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: "workspace",
    checkedAt: "2026-06-18T00:00:00.000Z",
    status: "healthy",
    message: "ok",
    featureEnabled: true,
    settingsEnabled: true,
    defaultThreadEnabled: true,
    embedding: embedding({}),
    activeThreadCount: 1,
    threadEnabledCount: 1,
    dataDir: "/tmp/memory",
    dataDirExists: true,
    storageSchemaStatus: "current",
    storageSchemaPath: "/tmp/memory/schema.json",
    storageSchemaExpectedVersion: "1",
    storageSchemaMessage: "Storage schema is current.",
    fileCount: 0,
    totalBytes: 0,
    topLevelEntryCount: 0,
    rawContentIncluded: false,
    runtimeSnapshots: [],
    errors: [],
    ...input,
  };
}
