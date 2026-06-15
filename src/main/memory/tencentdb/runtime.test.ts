import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAmbientFeatureFlags } from "../../../shared/featureFlags";
import type { AgentMemorySettings } from "../../../shared/agentMemorySettings";
import type { ThreadSummary, WorkspaceState } from "../../../shared/types";
import {
  createTencentDbMemoryRuntimeForThread,
  isTencentDbMemoryActiveForThread,
  tencentMemorySessionKeyForThread,
  ambientTencentMemoryDataDir,
  AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_FILENAME,
  AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
  type TencentMemoryCoreOptions,
  type TencentMemoryReindexProgress,
  type TencentMemoryReindexResult,
  type TencentMemoryRecallResult,
  type TencentMemoryStoreInitStatus,
} from ".";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  FakeTencentCore.reset();
});

describe("TencentDB memory runtime", () => {
  it("respects feature flag, global setting, thread toggle, and storage health", () => {
    const enabledFlags = resolveAmbientFeatureFlags({
      generatedAt: "2026-06-13T00:00:00.000Z",
      settings: { tencentDbMemory: true },
    });
    const disabledFlags = resolveAmbientFeatureFlags({
      generatedAt: "2026-06-13T00:00:00.000Z",
      settings: { tencentDbMemory: false },
    });
    const memorySettings = enabledMemorySettings();

    expect(isTencentDbMemoryActiveForThread({
      thread: { memoryEnabled: true },
      featureFlagSnapshot: enabledFlags,
      memorySettings,
    })).toBe(true);
    expect(isTencentDbMemoryActiveForThread({
      thread: { memoryEnabled: true },
      featureFlagSnapshot: disabledFlags,
      memorySettings,
    })).toBe(false);
    expect(isTencentDbMemoryActiveForThread({
      thread: { memoryEnabled: false },
      featureFlagSnapshot: enabledFlags,
      memorySettings,
    })).toBe(false);
    expect(isTencentDbMemoryActiveForThread({
      thread: { memoryEnabled: true },
      featureFlagSnapshot: enabledFlags,
      memorySettings,
      storageHealthy: false,
    })).toBe(false);
  });

  it("constructs an upstream-compatible core lazily through Ambient HostAdapter", async () => {
    const root = await tempDir();
    const thread = fakeThread({ memoryEnabled: true });
    const workspace = fakeWorkspace(root);
    const admin = {
      inspect: vi.fn(async () => ({ rows: [], total: 0, truncated: false })),
      update: vi.fn(async (input) => ({
        id: input.id,
        layer: input.layer,
        content: input.content,
        preview: input.content,
        source: "tencentdb" as const,
      })),
      delete: vi.fn(async () => ({ deleted: ["mem_1"], failed: [] })),
    };
    const createMemoryAdminService = vi.fn(() => admin);
    const loadCoreConstructor = vi.fn(() => ({
      Core: FakeTencentCore,
      createMemoryAdminService,
      moduleSpecifier: "fake:tencent-core",
    }));
    const listEmbeddingProviders = vi.fn(async () => []);
    const snapshots: unknown[] = [];

    const runtime = createTencentDbMemoryRuntimeForThread({
      thread,
      workspace,
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: enabledMemorySettings(),
      loadCoreConstructor,
      runWithAmbientPi: async (request) => `ambient:${request.taskId}`,
      listEmbeddingProviders,
      now: () => new Date("2026-06-13T00:00:00.000Z"),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(runtime).toBeDefined();
    expect(loadCoreConstructor).not.toHaveBeenCalled();

    const recall = await runtime!.recall("remember teal");
    expect(recall?.text).toContain("Source: TencentDB Agent Memory");
    expect(recall?.text).toContain("ambient-thread:thread-memory");
    expect(loadCoreConstructor).toHaveBeenCalledTimes(1);
    expect(FakeTencentCore.lastOptions?.config).toMatchObject({
      extraction: { enabled: true },
      embedding: { enabled: false, provider: "none" },
    });
    expect(listEmbeddingProviders).not.toHaveBeenCalled();
    const storageSchema = JSON.parse(await readFile(
      join(runtime!.snapshot().dataDir, AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_FILENAME),
      "utf8",
    )) as Record<string, unknown>;
    expect(storageSchema).toMatchObject({
      schemaVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
      adapter: "tencentdb",
      storageScope: "workspace",
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
    });

    const capture = await runtime!.capture({
      userText: "remember teal",
      assistantText: "I will remember that.",
      messages: [{ role: "user", content: "remember teal" }],
      startedAt: 1_765_584_000_000,
      originalUserMessageCount: 0,
    });
    expect(capture?.l0RecordedCount).toBe(1);
    expect(runtime!.snapshot()).toMatchObject({
      threadId: "thread-memory",
      active: true,
      sessionKey: tencentMemorySessionKeyForThread(thread.id),
      lastInitialize: { status: "ok", moduleSpecifier: "fake:tencent-core" },
      lastCapture: { status: "ok", total: 1 },
    });
    expect(snapshots).toContainEqual(expect.objectContaining({
      threadId: "thread-memory",
      lastRecall: expect.objectContaining({ status: "ok", strategy: "fake" }),
    }));

    runtime!.recordContextInjection({
      messageCount: 2,
      originalUserChars: 13,
      recallContextChars: 120,
      offloadContextChars: 80,
      totalInjectedChars: 202,
      projectedUserMessageChars: 217,
      truncated: false,
    });
    expect(runtime!.snapshot().lastContextInjection).toMatchObject({
      at: "2026-06-13T00:00:00.000Z",
      totalInjectedChars: 202,
      projectedUserMessageChars: 217,
    });
    expect(createMemoryAdminService).toHaveBeenCalledWith(expect.objectContaining({
      dataDir: expect.stringContaining("state"),
    }));

    await expect(runtime!.inspectMemories({ layer: "l1" })).resolves.toEqual({
      rows: [],
      total: 0,
      truncated: false,
    });
    expect(admin.inspect).toHaveBeenCalledWith(expect.objectContaining({
      layer: "l1",
      sessionKey: "ambient-thread:thread-memory",
    }));

    await expect(runtime!.inspectMemories({ layer: "l1", scope: "workspace", query: "teal" })).resolves.toEqual({
      rows: [],
      total: 0,
      truncated: false,
    });
    const inspectCalls = (admin.inspect as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls;
    const workspaceInspectInput = inspectCalls.at(-1)?.[0] ?? {};
    expect(workspaceInspectInput).toMatchObject({
      layer: "l1",
      scope: "workspace",
      query: "teal",
    });
    expect(workspaceInspectInput.sessionKey).toBeUndefined();

    await expect(runtime!.updateMemory({
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is cyan.",
    })).resolves.toMatchObject({
      id: "mem_1",
      content: "The workspace color is cyan.",
    });
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "mem_1",
    }));
    const defaultUpdateInput = (admin.update as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls.at(-1)?.[0] ?? {};
    expect(defaultUpdateInput.sessionKey).toBeUndefined();
    expect(defaultUpdateInput.sessionId).toBeUndefined();

    await expect(runtime!.updateMemory({
      layer: "l1",
      id: "mem_1",
      content: "The workspace color is indigo.",
      sessionKey: "ambient-thread:thread-memory",
      sessionId: "thread-memory",
    })).resolves.toMatchObject({
      id: "mem_1",
      content: "The workspace color is indigo.",
    });

    await expect(runtime!.deleteMemory({ layer: "l1", ids: ["mem_1"] })).resolves.toEqual({
      deleted: ["mem_1"],
      failed: [],
    });

    await runtime!.dispose();
    expect(FakeTencentCore.destroyed).toBe(true);
  });

  it("runs the reviewed vendored Tencent core and admin service without OpenClaw", async () => {
    const root = await tempDir();
    const thread = fakeThread({ memoryEnabled: true });
    const runtime = createTencentDbMemoryRuntimeForThread({
      thread,
      workspace: fakeWorkspace(root),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: enabledMemorySettings(),
      runWithAmbientPi: async (request) => `ambient:${request.taskId}`,
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(runtime).toBeDefined();

    await expect(runtime!.recall("Do we know the workspace color?")).resolves.toBeUndefined();
    expect(runtime!.snapshot().lastInitialize).toMatchObject({
      status: "ok",
      moduleSpecifier: "../../../../vendor/tencentdb-agent-memory/src/ambient-entry",
    });

    await expect(runtime!.capture({
      userText: "Please remember that the workspace color is teal.",
      assistantText: "I will remember that.",
      messages: [
        { role: "user", content: "Please remember that the workspace color is teal.", timestamp: 1_765_584_000_000 },
        { role: "assistant", content: "I will remember that.", timestamp: 1_765_584_001_000 },
      ],
      startedAt: 1_765_583_999_000,
      originalUserMessageCount: 0,
    })).resolves.toMatchObject({
      l0RecordedCount: expect.any(Number),
    });

    const inspected = await runtime!.inspectMemories({ layer: "l0", query: "teal", limit: 10 });
    expect(inspected?.rows.some((row) => row.preview.includes("teal"))).toBe(true);
    const firstId = inspected?.rows[0]?.id;
    expect(firstId).toBeTruthy();

    await expect(runtime!.updateMemory({
      layer: "l1",
      id: "missing-memory-id",
      content: "Do not create this from an edit request.",
    })).resolves.toBeUndefined();

    const dataDir = runtime!.snapshot().dataDir;
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "persona.md"), "Workspace persona prefers orange dashboards.\n", "utf-8");
    const allAssociated = await runtime!.inspectMemories({ query: "orange", limit: 10 });
    expect(allAssociated?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ layer: "l3", preview: expect.stringContaining("orange dashboards") }),
    ]));

    await expect(runtime!.deleteMemory({ layer: "l0", ids: [firstId!] })).resolves.toMatchObject({
      deleted: [firstId],
      failed: [],
    });

    await runtime!.dispose();
  });

  it("fails closed when memory is enabled but no reviewed Tencent core module is available", async () => {
    const root = await tempDir();
    const loadCoreConstructor = vi.fn(() => ({ unavailableReason: "missing reviewed package" }));
    const runtime = createTencentDbMemoryRuntimeForThread({
      thread: fakeThread({ memoryEnabled: true }),
      workspace: fakeWorkspace(root),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: enabledMemorySettings(),
      loadCoreConstructor,
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(runtime!.recall("anything")).resolves.toBeUndefined();
    expect(runtime!.snapshot().lastInitialize).toEqual({
      status: "unavailable",
      at: "2026-06-13T00:00:00.000Z",
      message: "missing reviewed package",
    });
  });

  it("fails closed before core load when the storage schema marker is unsupported", async () => {
    const root = await tempDir();
    const workspace = fakeWorkspace(root);
    const dataDir = ambientTencentMemoryDataDir(workspace.statePath);
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_FILENAME),
      JSON.stringify({ schemaVersion: "ambient-tencent-memory-storage-v0" }),
      "utf8",
    );
    const loadCoreConstructor = vi.fn(() => ({
      Core: FakeTencentCore,
      moduleSpecifier: "fake:tencent-core",
    }));
    const runtime = createTencentDbMemoryRuntimeForThread({
      thread: fakeThread({ memoryEnabled: true }),
      workspace,
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: enabledMemorySettings(),
      loadCoreConstructor,
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(runtime!.recall("anything")).resolves.toBeUndefined();
    expect(loadCoreConstructor).not.toHaveBeenCalled();
    expect(runtime!.snapshot().lastInitialize).toMatchObject({
      status: "error",
      at: "2026-06-13T00:00:00.000Z",
      message: expect.stringContaining("unsupported"),
    });
  });

  it("keeps Tencent extraction disabled until Ambient provides a memory LLM delegate", async () => {
    const root = await tempDir();
    const runtime = createTencentDbMemoryRuntimeForThread({
      thread: fakeThread({ memoryEnabled: true }),
      workspace: fakeWorkspace(root),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: enabledMemorySettings(),
      loadCoreConstructor: () => ({ Core: FakeTencentCore, moduleSpecifier: "fake:tencent-core" }),
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(runtime!.searchMemories({ query: "anything" })).resolves.toEqual({
      text: "memory",
      total: 1,
      strategy: "fake",
    });
    expect(FakeTencentCore.lastOptions?.config).toMatchObject({
      extraction: { enabled: false },
    });
    await runtime!.dispose();
  });

  it("passes Ambient-managed embedding config into Tencent only when embeddings are enabled", async () => {
    const root = await tempDir();
    const fetchEmbedding = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ index: 0, embedding: Array.from({ length: 384 }, () => 0.1) }] }),
    })) as unknown as typeof fetch;
    const listEmbeddingProviders = vi.fn(async () => [{
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
        healthStatus: "passed" as const,
        missingHints: [],
        runtimeState: {
          schemaVersion: "ambient-embedding-provider-runtime-state-v1" as const,
          status: "running" as const,
          running: true,
          modelRuntimeId: "bge-runtime",
          modelId: "BAAI/bge-small-en-v1.5",
          endpoint: "http://127.0.0.1:59301",
        },
      },
    }]);
    const runtime = createTencentDbMemoryRuntimeForThread({
      thread: fakeThread({ memoryEnabled: true }),
      workspace: fakeWorkspace(root),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: {
        ...enabledMemorySettings(),
        embeddings: {
          ...enabledMemorySettings().embeddings,
          enabled: true,
        },
      },
      loadCoreConstructor: () => ({ Core: FakeTencentCore, moduleSpecifier: "fake:tencent-core" }),
      listEmbeddingProviders,
      fetchEmbedding,
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(runtime!.searchMemories({ query: "semantic teal" })).resolves.toEqual({
      text: "memory",
      total: 1,
      strategy: "fake",
    });
    expect(listEmbeddingProviders).toHaveBeenCalledTimes(1);
    expect(FakeTencentCore.lastOptions?.config).toMatchObject({
      embedding: {
        enabled: true,
        provider: "ambient-managed-llamacpp",
        baseUrl: "http://127.0.0.1:59301/v1",
        apiKey: "ambient-local-embedding",
        model: "BAAI/bge-small-en-v1.5",
        dimensions: 384,
        sendDimensions: false,
        maxInputChars: 512,
        timeoutMs: 10_000,
      },
    });
    expect(runtime!.snapshot().embedding).toMatchObject({
      status: "ready",
      providerId: "ambient-cli:embeddings:tool:bge_embeddings",
      modelId: "BAAI/bge-small-en-v1.5",
      dimensions: 384,
    });
    expect(runtime!.snapshot().lastEmbedding).toMatchObject({
      status: "ok",
      providerId: "ambient-cli:embeddings:tool:bge_embeddings",
      modelId: "BAAI/bge-small-en-v1.5",
      dimensions: 384,
    });
    await runtime!.dispose();
  });

  it("runs Tencent reindex when the store reports incompatible embedding metadata", async () => {
    const root = await tempDir();
    FakeTencentCore.storeInitStatus = {
      completed: true,
      needsReindex: true,
      vectorStoreAvailable: true,
      embeddingServiceAvailable: true,
      reindexReason: "dimensions: 384 -> 768",
    };
    FakeTencentCore.reindexProgress = [
      { layer: "L1", done: 1, total: 2 },
      { layer: "L0", done: 2, total: 2 },
    ];
    FakeTencentCore.reindexResult = {
      status: "complete",
      l1Count: 2,
      l0Count: 3,
    };

    const runtime = createTencentDbMemoryRuntimeForThread({
      thread: fakeThread({ memoryEnabled: true }),
      workspace: fakeWorkspace(root),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: {
        ...enabledMemorySettings(),
        embeddings: {
          ...enabledMemorySettings().embeddings,
          enabled: true,
          modelId: "embeddinggemma-300m",
          dimensions: 768,
          preflightEnabled: false,
        },
      },
      loadCoreConstructor: () => ({ Core: FakeTencentCore, moduleSpecifier: "fake:tencent-core" }),
      listEmbeddingProviders: async () => [{
        packageId: "ambient-cli:embeddings",
        packageName: "ambient-embeddinggemma",
        command: "embeddinggemma_embeddings",
        capabilityId: "ambient-cli:embeddings:tool:embeddinggemma_embeddings",
        providerId: "ambient-cli:embeddings:tool:embeddinggemma_embeddings",
        label: "EmbeddingGemma 300M",
        modelId: "embeddinggemma-300m",
        dimensions: 768,
        local: true,
        installed: true,
        available: true,
        availabilityReason: "available",
        diagnostics: {
          healthStatus: "passed" as const,
          missingHints: [],
          runtimeState: {
            schemaVersion: "ambient-embedding-provider-runtime-state-v1" as const,
            status: "running" as const,
            running: true,
            modelRuntimeId: "embeddinggemma-runtime",
            modelProfileId: "embeddinggemma-300m-q8",
            modelId: "embeddinggemma-300m",
            endpoint: "http://127.0.0.1:59302",
          },
        },
      }],
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    await expect(runtime!.searchMemories({ query: "semantic teal" })).resolves.toEqual({
      text: "memory",
      total: 1,
      strategy: "fake",
    });
    expect(FakeTencentCore.reindexCalls).toBe(1);
    expect(runtime!.snapshot().embedding).toMatchObject({
      status: "ready",
      modelId: "embeddinggemma-300m",
      dimensions: 768,
      reindexStatus: "complete",
      message: "TencentDB vector reindex complete: L1=2, L0=3.",
    });
    expect(runtime!.snapshot().lastEmbedding).toMatchObject({
      status: "ok",
      modelId: "embeddinggemma-300m",
      dimensions: 768,
    });
    await runtime!.dispose();
  });
});

class FakeTencentCore {
  static destroyed = false;
  static lastOptions: TencentMemoryCoreOptions | undefined;
  static storeInitStatus: TencentMemoryStoreInitStatus | undefined;
  static reindexProgress: TencentMemoryReindexProgress[] = [];
  static reindexResult: TencentMemoryReindexResult | undefined;
  static reindexCalls = 0;
  private readonly options: TencentMemoryCoreOptions;

  static reset(): void {
    FakeTencentCore.destroyed = false;
    FakeTencentCore.lastOptions = undefined;
    FakeTencentCore.storeInitStatus = undefined;
    FakeTencentCore.reindexProgress = [];
    FakeTencentCore.reindexResult = undefined;
    FakeTencentCore.reindexCalls = 0;
  }

  constructor(options: TencentMemoryCoreOptions) {
    this.options = options;
    FakeTencentCore.destroyed = false;
    FakeTencentCore.lastOptions = options;
  }

  async initialize(): Promise<void> {
    this.options.hostAdapter.getLogger().info("fake Tencent core initialized");
  }

  async destroy(): Promise<void> {
    FakeTencentCore.destroyed = true;
  }

  async waitForStoreReady(): Promise<void> {}

  getStoreInitStatus(): TencentMemoryStoreInitStatus {
    return FakeTencentCore.storeInitStatus ?? {
      completed: true,
      needsReindex: false,
      vectorStoreAvailable: true,
      embeddingServiceAvailable: Boolean((this.options.config.embedding as { enabled?: unknown } | undefined)?.enabled),
    };
  }

  async reindexAllEmbeddings(
    onProgress?: (progress: TencentMemoryReindexProgress) => void,
  ): Promise<TencentMemoryReindexResult> {
    FakeTencentCore.reindexCalls += 1;
    for (const progress of FakeTencentCore.reindexProgress) onProgress?.(progress);
    const result = FakeTencentCore.reindexResult ?? {
      status: "complete" as const,
      l1Count: 0,
      l0Count: 0,
    };
    FakeTencentCore.storeInitStatus = {
      ...this.getStoreInitStatus(),
      needsReindex: result.status !== "complete" && result.status !== "not_required",
    };
    return result;
  }

  async handleBeforeRecall(userText: string, sessionKey: string): Promise<TencentMemoryRecallResult> {
    return {
      prependContext: `${userText} in ${sessionKey}`,
      recallStrategy: "fake",
    };
  }

  async handleTurnCommitted(turn: { messages: unknown[] }) {
    return {
      l0RecordedCount: turn.messages.length,
      schedulerNotified: false,
      l0VectorsWritten: 0,
      filteredMessages: [],
    };
  }

  async searchMemories() {
    return { text: "memory", total: 1, strategy: "fake" };
  }

  async searchConversations() {
    return { text: "conversation", total: 1 };
  }
}

function enabledMemorySettings(): AgentMemorySettings {
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
    },
    storageScope: "workspace",
  };
}

function fakeThread(patch: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-memory",
    workspacePath: "/tmp/workspace",
    model: "ambient/default",
    memoryEnabled: false,
    kind: "primary",
    ...patch,
  } as ThreadSummary;
}

function fakeWorkspace(root: string): WorkspaceState {
  return {
    path: join(root, "workspace"),
    name: "workspace",
    statePath: join(root, "state"),
    sessionPath: join(root, "sessions"),
  };
}

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ambient-tencent-memory-runtime-"));
  tempRoots.push(path);
  return path;
}
