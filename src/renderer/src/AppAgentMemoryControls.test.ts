import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentMemoryEmbeddingLifecycleActionResult,
  AgentMemoryStorageDiagnostics,
} from "../../shared/agentMemoryDiagnostics";
import type { DesktopState } from "../../shared/desktopTypes";
import {
  agentMemoryDiagnosticsRefreshKeyForState,
  createAppAgentMemoryControls,
} from "./AppAgentMemoryControls";

describe("AppAgentMemoryControls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a diagnostics refresh key from workspace, thread, memory, and embedding settings", () => {
    const state = desktopState();

    expect(agentMemoryDiagnosticsRefreshKeyForState({
      activeThreadMemoryEnabled: true,
      state,
    })).toBe([
      "/repo",
      "thread-1",
      true,
      "enabled",
      "per_thread",
      true,
      false,
      true,
      "workspace",
      true,
      "managed",
      "embedding-provider",
      true,
      false,
      4096,
      15_000,
    ].join("\u001f"));

    expect(agentMemoryDiagnosticsRefreshKeyForState({
      activeThreadMemoryEnabled: true,
      state: undefined,
    })).toBe("");
  });

  it("ignores stale diagnostics refresh results after a newer request starts", async () => {
    const first = deferred<AgentMemoryStorageDiagnostics>();
    const second = deferred<AgentMemoryStorageDiagnostics>();
    const getAgentMemoryDiagnostics = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("window", {
      ambientDesktop: {
        getAgentMemoryDiagnostics,
      },
    });
    const setAgentMemoryDiagnostics = vi.fn();
    const setAgentMemoryDiagnosticsLoading = vi.fn();
    const setAgentMemoryDiagnosticsError = vi.fn();
    const controls = createAppAgentMemoryControls({
      agentMemoryDiagnosticsRequestSeqRef: { current: 0 },
      setAgentMemoryDiagnostics,
      setAgentMemoryDiagnosticsError,
      setAgentMemoryDiagnosticsLoading,
      setAgentMemoryEmbeddingActionError: vi.fn(),
      setAgentMemoryEmbeddingActionLoading: vi.fn(),
      setAgentMemoryEmbeddingActionResult: vi.fn(),
    });

    const firstRefresh = controls.refreshAgentMemoryDiagnostics();
    const secondRefresh = controls.refreshAgentMemoryDiagnostics();
    second.resolve(agentMemoryDiagnostics({ checkedAt: "2026-06-21T00:00:02.000Z" }));
    await secondRefresh;
    first.resolve(agentMemoryDiagnostics({ checkedAt: "2026-06-21T00:00:01.000Z" }));
    await firstRefresh;

    expect(getAgentMemoryDiagnostics).toHaveBeenCalledTimes(2);
    expect(setAgentMemoryDiagnostics).toHaveBeenCalledTimes(1);
    expect(setAgentMemoryDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      checkedAt: "2026-06-21T00:00:02.000Z",
    }));
    expect(setAgentMemoryDiagnosticsError).toHaveBeenNthCalledWith(1, undefined);
    expect(setAgentMemoryDiagnosticsError).toHaveBeenNthCalledWith(2, undefined);
    expect(setAgentMemoryDiagnosticsLoading.mock.calls).toEqual([
      [true],
      [true],
      [false],
    ]);
  });

  it("records embedding lifecycle results and refreshes diagnostics state", async () => {
    const result = lifecycleResult({ action: "restart", status: "restarted" });
    const runAgentMemoryEmbeddingLifecycleAction = vi.fn(async () => result);
    vi.stubGlobal("window", {
      ambientDesktop: {
        runAgentMemoryEmbeddingLifecycleAction,
      },
    });
    const requestSeqRef = { current: 3 };
    const setAgentMemoryDiagnostics = vi.fn();
    const setAgentMemoryDiagnosticsLoading = vi.fn();
    const setAgentMemoryEmbeddingActionError = vi.fn();
    const setAgentMemoryEmbeddingActionLoading = vi.fn();
    const setAgentMemoryEmbeddingActionResult = vi.fn();
    const controls = createAppAgentMemoryControls({
      agentMemoryDiagnosticsRequestSeqRef: requestSeqRef,
      setAgentMemoryDiagnostics,
      setAgentMemoryDiagnosticsError: vi.fn(),
      setAgentMemoryDiagnosticsLoading,
      setAgentMemoryEmbeddingActionError,
      setAgentMemoryEmbeddingActionLoading,
      setAgentMemoryEmbeddingActionResult,
    });

    await expect(controls.runAgentMemoryEmbeddingLifecycleAction("restart")).resolves.toBe(result);

    expect(runAgentMemoryEmbeddingLifecycleAction).toHaveBeenCalledWith({ action: "restart" });
    expect(setAgentMemoryEmbeddingActionError).toHaveBeenCalledWith(undefined);
    expect(setAgentMemoryEmbeddingActionLoading.mock.calls).toEqual([
      ["restart"],
      [undefined],
    ]);
    expect(setAgentMemoryEmbeddingActionResult).toHaveBeenCalledWith(result);
    expect(setAgentMemoryDiagnosticsLoading).toHaveBeenCalledWith(false);
    expect(setAgentMemoryDiagnostics).toHaveBeenCalledWith(result.diagnostics);
    expect(requestSeqRef.current).toBe(4);
  });

  it("surfaces embedding lifecycle errors and clears loading", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        runAgentMemoryEmbeddingLifecycleAction: vi.fn(async () => {
          throw new Error("provider is offline");
        }),
      },
    });
    const setAgentMemoryEmbeddingActionError = vi.fn();
    const setAgentMemoryEmbeddingActionLoading = vi.fn();
    const controls = createAppAgentMemoryControls({
      agentMemoryDiagnosticsRequestSeqRef: { current: 0 },
      setAgentMemoryDiagnostics: vi.fn(),
      setAgentMemoryDiagnosticsError: vi.fn(),
      setAgentMemoryDiagnosticsLoading: vi.fn(),
      setAgentMemoryEmbeddingActionError,
      setAgentMemoryEmbeddingActionLoading,
      setAgentMemoryEmbeddingActionResult: vi.fn(),
    });

    await expect(controls.runAgentMemoryEmbeddingLifecycleAction("start")).resolves.toBeUndefined();

    expect(setAgentMemoryEmbeddingActionError.mock.calls).toEqual([
      [undefined],
      ["provider is offline"],
    ]);
    expect(setAgentMemoryEmbeddingActionLoading.mock.calls).toEqual([
      ["start"],
      [undefined],
    ]);
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function desktopState(): DesktopState {
  return {
    workspace: { path: "/repo" },
    activeThreadId: "thread-1",
    settings: {
      featureFlags: { tencentDbMemory: "enabled" },
      memory: {
        mode: "per_thread",
        enabled: true,
        defaultThreadEnabled: false,
        shortTermOffloadEnabled: true,
        storageScope: "workspace",
        embeddings: {
          enabled: true,
          providerMode: "managed",
          providerCapabilityId: "embedding-provider",
          autoStartProvider: true,
          sendDimensions: false,
          maxInputChars: 4096,
          timeoutMs: 15_000,
        },
      },
    },
  } as unknown as DesktopState;
}

function lifecycleResult(
  overrides: Partial<AgentMemoryEmbeddingLifecycleActionResult> = {},
): AgentMemoryEmbeddingLifecycleActionResult {
  return {
    schemaVersion: "ambient-agent-memory-embedding-lifecycle-action-v1",
    action: "check",
    status: "checked",
    message: "Checked.",
    checkedAt: "2026-06-21T00:00:00.000Z",
    diagnostics: agentMemoryDiagnostics(),
    ...overrides,
  };
}

function agentMemoryDiagnostics(
  overrides: Partial<AgentMemoryStorageDiagnostics> = {},
): AgentMemoryStorageDiagnostics {
  return {
    schemaVersion: "ambient-agent-memory-diagnostics-v1",
    adapter: "tencentdb",
    storageScope: "workspace",
    checkedAt: "2026-06-21T00:00:00.000Z",
    status: "healthy",
    message: "Agent Memory diagnostics are healthy.",
    featureEnabled: true,
    settingsEnabled: true,
    defaultThreadEnabled: false,
    embedding: {
      enabled: true,
      status: "ready",
      message: "Ready.",
    },
    activeThreadCount: 1,
    threadEnabledCount: 1,
    dataDir: "/repo/.ambient-memory",
    dataDirExists: true,
    storageSchemaStatus: "current",
    storageSchemaPath: "/repo/.ambient-memory/schema.json",
    storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
    storageSchemaVersion: "ambient-tencent-memory-storage-v1",
    storageSchemaMessage: "Current.",
    fileCount: 1,
    totalBytes: 128,
    topLevelEntryCount: 1,
    rawContentIncluded: false,
    runtimeSnapshots: [],
    errors: [],
    ...overrides,
  };
}
