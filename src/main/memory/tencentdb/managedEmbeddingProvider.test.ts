import { mkdir, truncate, writeFile } from "node:fs/promises";
import { arch as hostArch, platform as hostPlatform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  ambientMemoryEmbeddingModelCachePath,
  ambientMemoryEmbeddingModelProfile,
  ambientMemoryEmbeddingServerStateRoot,
  detectAmbientMemoryEmbeddingAssets,
  discoverAmbientMemoryEmbeddingProviders,
  repairAmbientMemoryResidentConflicts,
  runAmbientMemoryEmbeddingLifecycleAction,
  startAmbientMemoryEmbeddingRuntime,
} from "./managedEmbeddingProvider";
import { managedInstallWorkspacePath } from "./memorySetupFacade";
import { miniCpmRuntimeReleaseManifestPrototype } from "./memoryMiniCpmFacade";
import {
  selectLocalLlamaRuntimeArtifact,
  type LocalLlamaServerAcquireInput,
  type LocalLlamaServerLease,
  type LocalLlamaServerState,
  type LocalLlamaResidentProcess,
} from "./memoryLocalLlamaFacade";

describe("managed Tencent memory embedding provider", () => {
  it("reports missing managed EmbeddingGemma assets without starting anything", async () => {
    const workspace = await tempWorkspace("missing");

    const providers = await discoverAmbientMemoryEmbeddingProviders(workspace);

    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      capabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
      modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      dimensions: 768,
      local: true,
      installed: false,
      available: false,
    });
    expect(providers[0].diagnostics?.runtimeState).toMatchObject({
      modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
      modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      running: false,
      status: "unavailable",
    });
    expect(providers[0].diagnostics?.missingHints.join("\n")).toContain(ambientMemoryEmbeddingModelProfile.sha256);
  });

  it("surfaces a stopped ready provider when the model and shared runtime are present", async () => {
    const workspace = await tempWorkspace("ready");
    await installSparseModel(workspace);
    await installRuntime(workspace);

    const [provider] = await discoverAmbientMemoryEmbeddingProviders(workspace);

    expect(provider).toMatchObject({
      available: true,
      installed: true,
      availabilityReason: "EmbeddingGemma model and shared llama.cpp runtime are present in Ambient-managed state.",
    });
    expect(provider.diagnostics?.runtimeState).toMatchObject({
      status: "stopped",
      running: false,
      modelRuntimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
      modelProfileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
      estimatedResidentMemoryBytes: 768 * 1024 * 1024,
    });
  });

  it("starts llama-server in embedding mode and returns a releasable memory lease", async () => {
    const workspace = await tempWorkspace("start");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding",
      state: llamaState(workspace, input),
      release,
    }));

    const result = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
      ownerThreadId: "thread-memory",
    });

    expect(result.status).toBe("started");
    expect(result.leaseId).toBe("lease-memory-embedding");
    expect(acquire).toHaveBeenCalledWith(expect.objectContaining({
      profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      contextTokens: 2048,
      ownerThreadId: "thread-memory",
      extraArgs: ["--embedding", "--alias", AMBIENT_MEMORY_EMBEDDING_MODEL_ID],
    }));
    expect(result.provider?.diagnostics?.runtimeState).toMatchObject({
      status: "running",
      running: true,
      endpoint: "http://127.0.0.1:51234",
    });

    await result.release?.();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("propagates the releasable memory lease through lifecycle start", async () => {
    const workspace = await tempWorkspace("lifecycle-start-release");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding-lifecycle",
      state: llamaState(workspace, input),
      release,
    }));
    const stopProfile = vi.fn();

    const result = await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: workspace,
      action: "start",
      supervisor: { acquire, stopProfile },
      detectResidents: () => [],
    });

    expect(result.status).toBe("started");
    expect(result.leaseId).toBe("lease-memory-embedding-lifecycle");
    await result.release?.();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("exposes independent release handles when reusing an existing workspace lease", async () => {
    const workspace = await tempWorkspace("existing-lease-release");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const releases = [
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    ];
    const states: LocalLlamaServerState[] = [];
    let leaseIndex = 0;
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => {
      const index = leaseIndex;
      leaseIndex += 1;
      const state = llamaState(workspace, input);
      states.push(state);
      return {
        leaseId: `lease-memory-embedding-existing-${index + 1}`,
        state,
        release: releases[index],
      };
    });

    const first = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
    });
    await writeManagedEmbeddingState(states[0]);
    const second = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [{
        capability: "local-text",
        id: "untracked-llama:45678",
        pid: 45678,
        running: true,
        statePath: "process:45678",
        trackingStatus: "untracked",
      }],
    });

    expect(first.status).toBe("started");
    expect(second.status).toBe("ready");
    expect(second.leaseId).toBe("lease-memory-embedding-existing-2");
    expect(second.release).toEqual(expect.any(Function));
    await second.release?.();
    expect(releases[0]).not.toHaveBeenCalled();
    expect(releases[1]).toHaveBeenCalledTimes(1);
    await first.release?.();
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("runs resident conflict checks when an existing lease has no live managed state", async () => {
    const workspace = await tempWorkspace("existing-stale-lease-resident-block");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding-stale",
      state: { ...llamaState(workspace, input), pid: 987_654_321 },
      release,
    }));

    const first = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
    });
    const second = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [{
        capability: "local-text",
        id: "untracked-llama:56789",
        pid: 56789,
        running: true,
        statePath: "process:56789",
        trackingStatus: "untracked",
      }],
    });

    expect(first.status).toBe("started");
    expect(second.status).toBe("blocked");
    expect(second.reason).toContain("Another llama.cpp runtime is already resident");
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    await first.release?.();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not share the first release handle with concurrent start joiners", async () => {
    const workspace = await tempWorkspace("concurrent-start-no-shared-release");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const barrier = deferred<void>();
    const releases = [
      vi.fn(async () => undefined),
      vi.fn(async () => undefined),
    ];
    let leaseIndex = 0;
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => {
      const index = leaseIndex;
      leaseIndex += 1;
      if (index === 0) await barrier.promise;
      return {
        leaseId: `lease-memory-embedding-concurrent-${index + 1}`,
        state: llamaState(workspace, input),
        release: releases[index],
      };
    });

    const firstPromise = startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
    });
    const secondPromise = startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
    });

    barrier.resolve(undefined);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(first.status).toBe("started");
    expect(first.leaseId).toBe("lease-memory-embedding-concurrent-1");
    expect(first.release).toEqual(expect.any(Function));
    expect(second.status).toBe("ready");
    expect(second.leaseId).toBe("lease-memory-embedding-concurrent-2");
    expect(second.release).toEqual(expect.any(Function));
    await second.release?.();
    expect(releases[0]).not.toHaveBeenCalled();
    expect(releases[1]).toHaveBeenCalledTimes(1);
    await first.release?.();
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("single-flights cold starts across workspaces that share the managed embedding root", async () => {
    const previousManagedRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    const managedRoot = await tempWorkspace("global-managed-root");
    const workspaceA = await tempWorkspace("global-workspace-a");
    const workspaceB = await tempWorkspace("global-workspace-b");
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      await installSparseModel(workspaceA);
      await installRuntime(workspaceA);
      const barrier = deferred<void>();
      const releases = [
        vi.fn(async () => undefined),
        vi.fn(async () => undefined),
      ];
      let activeAcquires = 0;
      let maxActiveAcquires = 0;
      let leaseIndex = 0;
      const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => {
        activeAcquires += 1;
        maxActiveAcquires = Math.max(maxActiveAcquires, activeAcquires);
        const index = leaseIndex;
        leaseIndex += 1;
        try {
          if (index === 0) await barrier.promise;
          return {
            leaseId: `lease-memory-embedding-global-${index + 1}`,
            state: llamaState(workspaceA, input),
            release: releases[index],
          };
        } finally {
          activeAcquires -= 1;
        }
      });

      const firstPromise = startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceA,
        supervisor: { acquire },
        detectResidents: () => [],
      });
      const secondPromise = startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceB,
        supervisor: { acquire },
        detectResidents: () => [],
      });

      await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(acquire).toHaveBeenCalledTimes(1);

      barrier.resolve(undefined);
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(maxActiveAcquires).toBe(1);
      expect(first.status).toBe("started");
      expect(second.status).toBe("ready");
      expect(acquire).toHaveBeenCalledTimes(2);
      await first.release?.();
      await second.release?.();
      expect(releases[0]).toHaveBeenCalledTimes(1);
      expect(releases[1]).toHaveBeenCalledTimes(1);
    } finally {
      if (previousManagedRoot === undefined) {
        delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      } else {
        process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousManagedRoot;
      }
    }
  });

  it("stops only the requesting workspace leases for a shared managed embedding root", async () => {
    const previousManagedRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    const managedRoot = await tempWorkspace("global-stop-managed-root");
    const workspaceA = await tempWorkspace("global-stop-workspace-a");
    const workspaceB = await tempWorkspace("global-stop-workspace-b");
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      await installSparseModel(workspaceA);
      await installRuntime(workspaceA);
      const releases = [
        vi.fn(async () => undefined),
        vi.fn(async () => undefined),
      ];
      let leaseIndex = 0;
      const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => {
        const index = leaseIndex;
        leaseIndex += 1;
        return {
          leaseId: `lease-memory-embedding-stop-global-${index + 1}`,
          state: llamaState(workspaceA, input),
          release: releases[index],
        };
      });
      const stopProfile = vi.fn();

      const first = await startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceA,
        supervisor: { acquire },
        detectResidents: () => [],
      });
      const second = await startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceB,
        supervisor: { acquire },
        detectResidents: () => [],
      });
      const stopped = await runAmbientMemoryEmbeddingLifecycleAction({
        workspacePath: workspaceA,
        action: "stop",
        supervisor: { acquire, stopProfile },
      });

      expect(stopped.status).toBe("stopped");
      expect(stopped.reason).toContain("runtime remains leased by 1 other owner");
      expect(releases[0]).toHaveBeenCalledTimes(1);
      expect(releases[1]).not.toHaveBeenCalled();
      expect(stopProfile).not.toHaveBeenCalled();

      await first.release?.();
      await second.release?.();
      expect(releases[0]).toHaveBeenCalledTimes(1);
      expect(releases[1]).toHaveBeenCalledTimes(1);
    } finally {
      if (previousManagedRoot === undefined) {
        delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      } else {
        process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousManagedRoot;
      }
    }
  });

  it("blocks restart while another workspace still leases the shared managed embedding root", async () => {
    const previousManagedRoot = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    const managedRoot = await tempWorkspace("global-restart-managed-root");
    const workspaceA = await tempWorkspace("global-restart-workspace-a");
    const workspaceB = await tempWorkspace("global-restart-workspace-b");
    process.env.AMBIENT_MANAGED_INSTALL_ROOT = managedRoot;
    try {
      await installSparseModel(workspaceA);
      await installRuntime(workspaceA);
      const releases = [
        vi.fn(async () => undefined),
        vi.fn(async () => undefined),
      ];
      let leaseIndex = 0;
      const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => {
        const index = leaseIndex;
        leaseIndex += 1;
        return {
          leaseId: `lease-memory-embedding-restart-global-${index + 1}`,
          state: llamaState(workspaceA, input),
          release: releases[index],
        };
      });
      const stopProfile = vi.fn();

      const first = await startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceA,
        supervisor: { acquire },
        detectResidents: () => [],
      });
      const second = await startAmbientMemoryEmbeddingRuntime({
        workspacePath: workspaceB,
        supervisor: { acquire },
        detectResidents: () => [],
      });
      const restarted = await runAmbientMemoryEmbeddingLifecycleAction({
        workspacePath: workspaceA,
        action: "restart",
        supervisor: { acquire, stopProfile },
      });

      expect(restarted.status).toBe("blocked");
      expect(restarted.reason).toContain("restart would interrupt another workspace");
      expect(acquire).toHaveBeenCalledTimes(2);
      expect(stopProfile).not.toHaveBeenCalled();
      expect(releases[0]).not.toHaveBeenCalled();
      expect(releases[1]).not.toHaveBeenCalled();

      await first.release?.();
      await second.release?.();
    } finally {
      if (previousManagedRoot === undefined) {
        delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
      } else {
        process.env.AMBIENT_MANAGED_INSTALL_ROOT = previousManagedRoot;
      }
    }
  });

  it("blocks auto-start when another llama.cpp runtime is already resident", async () => {
    const workspace = await tempWorkspace("resident-block");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const acquire = vi.fn();

    const result = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [{
        capability: "local-text",
        id: "untracked-llama:12345",
        pid: 12345,
        running: true,
        statePath: "process:12345",
        trackingStatus: "untracked",
      }],
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("Another llama.cpp runtime is already resident");
    expect(result.reason).toContain("Ambient will not stop external or active llama.cpp runtimes automatically");
    expect(acquire).not.toHaveBeenCalled();
  });

  it("tells users Repair can clean an orphaned Ambient memory embedding resident", async () => {
    const workspace = await tempWorkspace("resident-repair-copy");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const acquire = vi.fn();

    const result = await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [ambientMemoryOrphanResident(80235)],
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("Repair can stop the orphaned Ambient memory embedding runtime");
    expect(acquire).not.toHaveBeenCalled();
  });

  it("repairs orphaned Ambient-managed memory embedding residents before retrying start", async () => {
    const workspace = await tempWorkspace("repair-orphan");
    const resident = ambientMemoryOrphanResident(80233);
    const alive = new Set([resident.pid]);
    const killCalls: Array<{ pid: number; signal?: NodeJS.Signals }> = [];

    const result = await repairAmbientMemoryResidentConflicts({
      workspacePath: workspace,
      detectResidents: () => [resident],
      processAlive: (pid) => alive.has(pid),
      killProcess: (pid, signal) => {
        killCalls.push({ pid, signal });
        alive.delete(pid);
      },
      sleep: async () => undefined,
    });

    expect(result.status).toBe("clean");
    expect(result.reason).toBe("Stopped 1 orphaned Ambient memory embedding runtime.");
    expect(result.stopped).toEqual([
      expect.objectContaining({
        kind: "safe_ambient_memory_orphan",
        id: "untracked-llama:80233",
        pid: 80233,
        ppid: 1,
      }),
    ]);
    expect(result.blockers).toEqual([]);
    expect(killCalls).toEqual([{ pid: 80233, signal: "SIGTERM" }]);
  });

  it("does not repair external llama.cpp residents even when they are orphaned", async () => {
    const workspace = await tempWorkspace("repair-external");
    const resident: LocalLlamaResidentProcess = {
      capability: "local-text",
      id: "untracked-llama:4404",
      pid: 4404,
      ppid: 1,
      running: true,
      statePath: "process:4404",
      trackingStatus: "untracked",
      modelId: "/models/embeddinggemma-300m-qat-Q8_0.gguf",
      commandLine: "/opt/llama.cpp/build/bin/llama-server --embedding --alias embeddinggemma-300m-q8_0 --model /models/embeddinggemma-300m-qat-Q8_0.gguf --host 127.0.0.1 --port 44222",
    };
    const killProcess = vi.fn();

    const result = await repairAmbientMemoryResidentConflicts({
      workspacePath: workspace,
      detectResidents: () => [resident],
      processAlive: (pid) => pid === resident.pid,
      killProcess,
      sleep: async () => undefined,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual([
      expect.objectContaining({
        kind: "external_or_active_runtime",
        id: "untracked-llama:4404",
        pid: 4404,
      }),
    ]);
    expect(result.reason).toContain("Ambient will not stop it automatically");
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("does not repair Ambient-looking memory residents that still have a parent process", async () => {
    const workspace = await tempWorkspace("repair-active-parent");
    const resident = {
      ...ambientMemoryOrphanResident(80234),
      ppid: 777,
    };
    const killProcess = vi.fn();

    const result = await repairAmbientMemoryResidentConflicts({
      workspacePath: workspace,
      detectResidents: () => [resident],
      processAlive: (pid) => pid === resident.pid,
      killProcess,
      sleep: async () => undefined,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers[0]).toMatchObject({
      kind: "external_or_active_runtime",
      id: "untracked-llama:80234",
      pid: 80234,
      ppid: 777,
    });
    expect(result.reason).toContain("parent PID 777");
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("checks a running managed embedding endpoint with the embeddings preflight", async () => {
    const workspace = await tempWorkspace("check");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const stateRootPath = ambientMemoryEmbeddingServerStateRoot(managedInstallWorkspacePath(workspace));
    const state = llamaState(workspace, {
      profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
      runtimeBinaryPath: "/runtime/llama-server",
      modelPath: "/models/embeddinggemma.gguf",
      stateRootPath,
      contextTokens: 2048,
      idleTimeoutMs: 0,
    });
    await mkdir(state.stateDir, { recursive: true });
    await writeFile(join(state.stateDir, "server-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [{ embedding: Array.from({ length: ambientMemoryEmbeddingModelProfile.dimensions }, () => 0.1) }],
    }), { status: 200 }));

    const result = await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: workspace,
      action: "check",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toMatchObject({
      action: "check",
      status: "ready",
      reason: "Embedding endpoint preflight passed.",
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:51234/v1/embeddings", expect.objectContaining({
      method: "POST",
    }));
  });

  it("stops an active managed embedding lease through the lifecycle action", async () => {
    const workspace = await tempWorkspace("stop");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding-stop",
      state: llamaState(workspace, input),
      release,
    }));
    const stopProfile = vi.fn();

    await startAmbientMemoryEmbeddingRuntime({
      workspacePath: workspace,
      supervisor: { acquire },
      detectResidents: () => [],
    });
    const result = await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: workspace,
      action: "stop",
      supervisor: { acquire, stopProfile },
    });

    expect(result.status).toBe("stopped");
    expect(release).toHaveBeenCalledTimes(1);
    expect(stopProfile).not.toHaveBeenCalled();
  });

  it("restarts stopped managed embeddings by composing stop and guarded start", async () => {
    const workspace = await tempWorkspace("restart");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding-restart",
      state: llamaState(workspace, input),
      release: vi.fn(async () => undefined),
    }));
    const stopProfile = vi.fn(async () => ({
      status: "not-found" as const,
      profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
    }));

    const result = await runAmbientMemoryEmbeddingLifecycleAction({
      workspacePath: workspace,
      action: "restart",
      supervisor: { acquire, stopProfile },
      detectResidents: () => [],
    });

    expect(result.status).toBe("restarted");
    expect(stopProfile).toHaveBeenCalledOnce();
    expect(acquire).toHaveBeenCalledOnce();
  });

  it("detects model cache size mismatches", async () => {
    const workspace = await tempWorkspace("mismatch");
    const managedRoot = managedInstallWorkspacePath(workspace);
    const cachePath = ambientMemoryEmbeddingModelCachePath(managedRoot);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, "not the model", "utf8");

    const detection = await detectAmbientMemoryEmbeddingAssets(workspace);

    expect(detection.model).toMatchObject({
      status: "mismatch",
      expectedBytes: ambientMemoryEmbeddingModelProfile.sizeBytes,
      expectedSha256: ambientMemoryEmbeddingModelProfile.sha256,
    });
  });
});

async function tempWorkspace(label: string): Promise<string> {
  const root = join(tmpdir(), `ambient-memory-embedding-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function installSparseModel(workspace: string): Promise<void> {
  const cachePath = ambientMemoryEmbeddingModelCachePath(managedInstallWorkspacePath(workspace));
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, "", "utf8");
  await truncate(cachePath, ambientMemoryEmbeddingModelProfile.sizeBytes);
}

async function installRuntime(workspace: string): Promise<void> {
  const artifact = selectLocalLlamaRuntimeArtifact(miniCpmRuntimeReleaseManifestPrototype.artifacts, {
    platform: hostPlatform(),
    arch: hostArch(),
  });
  if (!artifact) throw new Error("No test llama.cpp runtime artifact for this host.");
  const runtimePath = join(
    managedInstallWorkspacePath(workspace),
    ".ambient/vision/minicpm-v/runtime",
    artifact.cacheSubdir,
    artifact.binaryRelativePath,
  );
  await mkdir(dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, "#!/bin/sh\n", "utf8");
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function writeManagedEmbeddingState(state: LocalLlamaServerState): Promise<void> {
  await mkdir(state.stateDir, { recursive: true });
  await writeFile(join(state.stateDir, "server-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function ambientMemoryOrphanResident(pid: number): LocalLlamaResidentProcess {
  const managedRoot = join(tmpdir(), `ambient memory orphan ${pid}`, "Application Support", "Ambient Desktop", "managed-installs");
  const runtimePath = join(
    managedRoot,
    ".ambient/vision/minicpm-v/runtime/b9122/macos-arm64-metal/llama-b9122/llama-server",
  );
  const modelPath = join(
    managedRoot,
    ".ambient/memory/tencentdb/embeddings/models/ggml-org--embeddinggemma-300m-qat-q8_0-GGUF/66f974f8cd48cc3b9c41c516b95508e75b4bee64/embeddinggemma-300m-qat-Q8_0.gguf",
  );
  return {
    capability: "local-text",
    id: `untracked-llama:${pid}`,
    pid,
    ppid: 1,
    running: true,
    statePath: `process:${pid}`,
    trackingStatus: "untracked",
    modelId: modelPath,
    endpointUrl: "http://127.0.0.1:49768",
    port: 49768,
    commandLine: `${runtimePath} --model ${modelPath} --host 127.0.0.1 --port 49768 -c 2048 -ngl 99 --embedding --alias ${AMBIENT_MEMORY_EMBEDDING_MODEL_ID}`,
  };
}

function llamaState(workspace: string, input: LocalLlamaServerAcquireInput): LocalLlamaServerState {
  return {
    schemaVersion: "ambient-local-llama-server-state-v1",
    profileId: input.profileId,
    pid: process.pid,
    endpointUrl: "http://127.0.0.1:51234",
    host: "127.0.0.1",
    port: 51234,
    runtimeBinaryPath: input.runtimeBinaryPath,
    modelPath: input.modelPath,
    contextTokens: input.contextTokens,
    ownerThreadId: input.ownerThreadId,
    gpuLayers: input.gpuLayers ?? 99,
    idleTimeoutMs: input.idleTimeoutMs ?? 0,
    startedAt: "2026-06-14T00:00:00.000Z",
    lastUsedAt: "2026-06-14T00:00:00.000Z",
    stateDir: join(input.stateRootPath, input.profileId),
    logPath: "llama-server.log",
    stdoutPath: "llama-server.stdout.log",
    stderrPath: "llama-server.stderr.log",
    command: ["llama-server", "--embedding"],
  };
}
