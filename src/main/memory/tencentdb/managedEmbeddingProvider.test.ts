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
  runAmbientMemoryEmbeddingLifecycleAction,
  startAmbientMemoryEmbeddingRuntime,
} from "./managedEmbeddingProvider";
import { managedInstallWorkspacePath } from "../../managedInstallPaths";
import { miniCpmRuntimeReleaseManifestPrototype } from "../../mini-cpm/miniCpmRuntimeManifest";
import { selectLocalLlamaRuntimeArtifact } from "../../local-llama/localLlamaRuntimeManifest";
import type { LocalLlamaServerAcquireInput, LocalLlamaServerLease, LocalLlamaServerState } from "../../local-llama/localLlamaServerSupervisor";

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

  it("does not expose a release handle when reusing an existing workspace lease", async () => {
    const workspace = await tempWorkspace("existing-lease-no-release");
    await installSparseModel(workspace);
    await installRuntime(workspace);
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async (input: LocalLlamaServerAcquireInput): Promise<LocalLlamaServerLease> => ({
      leaseId: "lease-memory-embedding-existing",
      state: llamaState(workspace, input),
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
      detectResidents: () => [],
    });

    expect(first.status).toBe("started");
    expect(second.status).toBe("ready");
    expect(second.leaseId).toBe("lease-memory-embedding-existing");
    expect(second.release).toBeUndefined();
    await first.release?.();
    expect(release).toHaveBeenCalledTimes(1);
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
    expect(acquire).not.toHaveBeenCalled();
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
