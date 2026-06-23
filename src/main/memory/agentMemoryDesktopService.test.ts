import { describe, expect, it, vi } from "vitest";

import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import { normalizeAgentMemorySettings, type AgentMemorySettings } from "../../shared/agentMemorySettings";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";

const managedEmbeddingProviderMock = vi.hoisted(() => ({
  runAmbientMemoryEmbeddingLifecycleAction: vi.fn(),
}));

vi.mock("./tencentdb/managedEmbeddingProvider", async (importActual) => {
  const actual = await importActual<typeof import("./tencentdb/managedEmbeddingProvider")>();
  return {
    ...actual,
    runAmbientMemoryEmbeddingLifecycleAction: managedEmbeddingProviderMock.runAmbientMemoryEmbeddingLifecycleAction,
  };
});

import {
  configureAgentMemoryDesktopService,
  releaseAgentMemoryEmbeddingRuntimeForHost,
  runAgentMemoryEmbeddingLifecycleAction,
  runAgentMemoryStartupReconciliation,
  type AgentMemoryDesktopProjectRuntimeHost,
} from "./agentMemoryDesktopService";
import { AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID } from "./tencentdb/managedEmbeddingProvider";

describe("Agent Memory startup reconciliation", () => {
  it("does not start when memory is disabled", () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({ memory: normalizeAgentMemorySettings({ mode: "disabled", enabled: false }) });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { start });

    expect(start).not.toHaveBeenCalled();
  });

  it("does not start when the Tencent memory feature flag is disabled", () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({ memory: normalizeAgentMemorySettings({ mode: "enabled_all", enabled: true }) });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: false, start });

    expect(start).not.toHaveBeenCalled();
  });

  it("does not start when managed embedding auto-start is disabled", () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({
      memory: normalizeAgentMemorySettings({
        mode: "enabled_all",
        enabled: true,
        embeddings: { autoStartProvider: false },
      }),
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });

    expect(start).not.toHaveBeenCalled();
  });

  it("starts globally enabled memory without changing thread flags", async () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({
      memory: normalizeAgentMemorySettings({ mode: "enabled_all", enabled: true }),
      threads: [
        thread({ id: "thread-1", memoryEnabled: false }),
        thread({ id: "thread-2", memoryEnabled: false }),
      ],
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    expect(start).toHaveBeenCalledWith({ action: "start" }, host);
    expect(host.store.updateThreadSettings).not.toHaveBeenCalled();
  });

  it("starts startup memory when the built-in embedding provider id is explicit", async () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({
      memory: normalizeAgentMemorySettings({
        mode: "enabled_all",
        enabled: true,
        embeddings: { providerCapabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID },
      }),
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it("starts startup memory without mutating custom embedding settings", async () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({
      memory: normalizeAgentMemorySettings({
        mode: "enabled_all",
        enabled: true,
        embeddings: { sendDimensions: true },
      }),
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    expect(start).toHaveBeenCalledWith({ action: "start" }, host);
  });

  it("starts per-thread memory only when a non-subagent thread has memory enabled", async () => {
    const start = vi.fn(async () => readyStartResult()) as any;
    const host = createHost({
      memory: normalizeAgentMemorySettings({ mode: "per_thread", enabled: true, defaultThreadEnabled: false }),
      threads: [
        thread({ id: "thread-off", memoryEnabled: false }),
        thread({ id: "thread-child", kind: "subagent_child", memoryEnabled: true }),
      ],
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });
    expect(start).not.toHaveBeenCalled();

    host.threads.push(thread({ id: "thread-enabled", memoryEnabled: true }));
    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it("warns when startup start completes but memory is not ready", async () => {
    const start = vi.fn(async () => readyStartResult("blocked")) as any;
    const warn = vi.fn();
    const host = createHost({ memory: normalizeAgentMemorySettings({ mode: "enabled_all", enabled: true }) });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start, warn });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("startup start completed with status=blocked"));
  });

  it("stops startup memory when settings are disabled before start completes", async () => {
    let resolveStart!: (value: ReturnType<typeof readyStartResult>) => void;
    const start = vi.fn(() => new Promise((resolve) => {
      resolveStart = resolve;
    })) as any;
    const stop = vi.fn(async () => readyStartResult("stopped")) as any;
    let memory = normalizeAgentMemorySettings({ mode: "enabled_all", enabled: true });
    const host = createHost({
      memory,
      getMemory: () => memory,
    });

    runAgentMemoryStartupReconciliation("project-runtime-created", host, { featureEnabled: true, start, stop });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    memory = normalizeAgentMemorySettings({ mode: "disabled", enabled: false });
    resolveStart(readyStartResult());
    await vi.waitFor(() => expect(stop).toHaveBeenCalledWith({ action: "stop" }, host));
  });
});

describe("Agent Memory embedding lifecycle leases", () => {
  it("retains releasable ready start leases and releases the replaced lease", async () => {
    const firstRelease = vi.fn(async () => undefined);
    const secondRelease = vi.fn(async () => undefined);
    managedEmbeddingProviderMock.runAmbientMemoryEmbeddingLifecycleAction.mockReset();
    managedEmbeddingProviderMock.runAmbientMemoryEmbeddingLifecycleAction
      .mockResolvedValueOnce(embeddingLifecycleResult({
        status: "started",
        leaseId: "lease-started",
        release: firstRelease,
      }))
      .mockResolvedValueOnce(embeddingLifecycleCheckResult())
      .mockResolvedValueOnce(embeddingLifecycleResult({
        status: "ready",
        leaseId: "lease-ready",
        release: secondRelease,
      }))
      .mockResolvedValueOnce(embeddingLifecycleCheckResult());
    configureAgentMemoryDesktopService(testServices());
    const host = createHost({ memory: normalizeAgentMemorySettings({ mode: "enabled_all", enabled: true }) });

    await runAgentMemoryEmbeddingLifecycleAction({ action: "start" }, host);
    expect(host.agentMemoryEmbeddingRuntimeLeaseId).toBe("lease-started");

    await runAgentMemoryEmbeddingLifecycleAction({ action: "start" }, host);

    await vi.waitFor(() => expect(firstRelease).toHaveBeenCalledTimes(1));
    expect(host.agentMemoryEmbeddingRuntimeLeaseId).toBe("lease-ready");
    expect(host.agentMemoryEmbeddingRuntimeRelease).toBe(secondRelease);

    releaseAgentMemoryEmbeddingRuntimeForHost(host, "test cleanup");
    await vi.waitFor(() => expect(secondRelease).toHaveBeenCalledTimes(1));
  });
});

function createHost(input: {
  memory: AgentMemorySettings;
  getMemory?: () => AgentMemorySettings;
  threads?: ThreadSummary[];
}): AgentMemoryDesktopProjectRuntimeHost & { threads: ThreadSummary[] } {
  const workspace: WorkspaceState = {
    path: "/workspace/project",
    name: "project",
    statePath: "/workspace/project/.ambient",
    sessionPath: "/workspace/project/.ambient/sessions",
  };
  const threads = [...(input.threads ?? [thread({ id: "thread-1", memoryEnabled: false })])];
  const store: AgentMemoryDesktopProjectRuntimeHost["store"] = {
    getWorkspace: vi.fn(() => workspace),
    getMemorySettings: vi.fn(() => input.getMemory?.() ?? input.memory),
    listThreads: vi.fn(() => threads),
    getThread: vi.fn((threadId: string) => threads.find((candidate) => candidate.id === threadId) ?? threads[0]),
    updateThreadSettings: vi.fn(),
  };
  return {
    workspacePath: workspace.path,
    store,
    threads,
    runtime: {
      listAgentMemoryRuntimeSnapshots: vi.fn((): AgentMemoryRuntimeSnapshot[] => []),
      applyMemorySettings: vi.fn(() => ({
        disposedSessions: 0,
        deferredSessions: 0,
        disposedThreadIds: [],
        deferredThreadIds: [],
      })),
      applyThreadMemorySettings: vi.fn(),
    },
  };
}

function thread(input: { id: string; memoryEnabled: boolean; kind?: ThreadSummary["kind"] }): ThreadSummary {
  return {
    id: input.id,
    title: input.id,
    workspacePath: "/workspace/project",
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "moonshotai/kimi-k2.7-code",
    thinkingLevel: "xhigh",
    pinned: false,
    kind: input.kind ?? "chat",
    memoryEnabled: input.memoryEnabled,
  };
}

function readyStartResult(status: string = "ready") {
  return {
    status,
    message: "Ambient-managed memory embeddings are already running.",
  };
}

function embeddingLifecycleResult(input: {
  status: "ready" | "started";
  leaseId: string;
  release: () => Promise<void>;
}) {
  return {
    action: "start",
    status: input.status,
    reason: "Ambient-managed memory embeddings are running.",
    provider: {
      capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelId: "embeddinggemma-300m-q8_0",
      dimensions: 768,
      local: true,
      installed: true,
      available: true,
      diagnostics: {
        runtimeState: {
          running: true,
          status: "running",
          endpoint: "http://127.0.0.1:51234",
        },
      },
    },
    leaseId: input.leaseId,
    release: input.release,
  };
}

function embeddingLifecycleCheckResult() {
  return {
    action: "check",
    status: "ready",
    reason: "Embedding endpoint preflight passed.",
    provider: embeddingProvider(),
  };
}

function embeddingProvider() {
  return {
    capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
    modelId: "embeddinggemma-300m-q8_0",
    dimensions: 768,
    local: true,
    installed: true,
    available: true,
    diagnostics: {
      runtimeState: {
        running: true,
        status: "running",
        endpoint: "http://127.0.0.1:51234",
      },
    },
  };
}

function testServices(): Parameters<typeof configureAgentMemoryDesktopService>[0] {
  return {
    activeThreadIdForHost: () => "thread-1",
    currentFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ generatedAt: "2026-06-23T00:00:00.000Z" }),
    emitProjectStateIfActive: vi.fn(),
    normalizeWorkspacePath: (workspacePath) => workspacePath,
    requireActiveProjectRuntimeHost: () => {
      throw new Error("No active project runtime host in test.");
    },
    updateFeatureFlagSettings: vi.fn(async () => undefined),
    updateMemorySettings: vi.fn(async (_input, host) => host.store.getMemorySettings()),
  };
}
