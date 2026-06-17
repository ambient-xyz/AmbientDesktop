import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectLocalLlamaResidentProcesses } from "./localLlamaResidencyPolicy";
import {
  AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  ambientMemoryEmbeddingModelProfile,
} from "../memory/tencentdb/managedEmbeddingRuntimeMetadata";

describe("local llama residency policy", () => {
  it("detects active Local Deep Research and MiniCPM managed llama-server state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-residency-"));
    try {
      const ldrStateDir = join(workspace, ".ambient/local-deep-research/server/literesearcher-4b-q4-k-m");
      const miniCpmStatePath = join(workspace, ".ambient/vision/minicpm-v/state/server-state.json");
      const localTextStateDir = join(workspace, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(ldrStateDir, { recursive: true });
      await mkdir(dirname(miniCpmStatePath), { recursive: true });
      await mkdir(localTextStateDir, { recursive: true });
      await writeFile(join(ldrStateDir, "server-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-llama-server-state-v1",
        profileId: "literesearcher-4b-q4-k-m",
        pid: 4101,
        endpointUrl: "http://127.0.0.1:43123",
        host: "127.0.0.1",
        port: 43123,
        runtimeBinaryPath: "/runtime/llama-server",
        modelPath: "/models/LiteResearcher-4B.Q4_K_M.gguf",
        contextTokens: 16384,
        ownerThreadId: "thread-ldr",
        gpuLayers: 99,
        idleTimeoutMs: 0,
        startedAt: "2026-05-28T12:00:00.000Z",
        lastUsedAt: "2026-05-28T12:01:00.000Z",
        stateDir: ldrStateDir,
        logPath: join(ldrStateDir, "llama-server.log"),
        stdoutPath: join(ldrStateDir, "llama-server.stdout.log"),
        stderrPath: join(ldrStateDir, "llama-server.stderr.log"),
        command: ["/runtime/llama-server", "--model", "/models/LiteResearcher-4B.Q4_K_M.gguf"],
      }, null, 2)}\n`);
      await writeFile(miniCpmStatePath, `${JSON.stringify({
        pid: 4202,
        endpoint: "http://127.0.0.1:43124",
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        startedAt: "2026-05-28T12:02:00.000Z",
        logPath: join(workspace, ".ambient/vision/minicpm-v/state/llama-server.log"),
        stderrPath: join(workspace, ".ambient/vision/minicpm-v/state/llama-server.stderr.log"),
        command: ["/runtime/llama-server", "-c", "4096"],
      }, null, 2)}\n`);
      await writeFile(join(localTextStateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 4303,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: workspace,
        stateDir: localTextStateDir,
        stdoutPath: join(localTextStateDir, "runtime.stdout.log"),
        stderrPath: join(localTextStateDir, "runtime.stderr.log"),
        startedAt: "2026-05-28T12:02:30.000Z",
        lastUsedAt: "2026-05-28T12:02:45.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43125/health",
        ownerThreadId: "thread-local-text",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2)}\n`);

      const residents = await detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4101 || pid === 4202 || pid === 4303,
        listProcesses: async () => [],
        processMemorySampler: async (pid) => ({
          residentMemoryBytes: pid === 4101 ? 5 * 1024 ** 3 : pid === 4202 ? 3 * 1024 ** 3 : 4 * 1024 ** 3,
          sampledAt: "2026-05-28T12:03:00.000Z",
        }),
      });

      expect(residents).toEqual([
        expect.objectContaining({
          capability: "local-deep-research",
          pid: 4101,
          running: true,
          ownerThreadId: "thread-ldr",
          port: 43123,
          profileId: "literesearcher-4b-q4-k-m",
          contextTokens: 16384,
          estimatedResidentMemoryBytes: 7 * 1024 ** 3,
          actualResidentMemoryBytes: 5 * 1024 ** 3,
          memorySampledAt: "2026-05-28T12:03:00.000Z",
        }),
        expect.objectContaining({
          capability: "minicpm-v",
          pid: 4202,
          running: true,
          port: 43124,
          modelId: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          contextTokens: 4096,
          estimatedResidentMemoryBytes: 7 * 1024 ** 3,
          actualResidentMemoryBytes: 3 * 1024 ** 3,
          memorySampledAt: "2026-05-28T12:03:00.000Z",
        }),
        expect.objectContaining({
          capability: "local-text",
          id: "local-text:local-text-runtime:4303",
          pid: 4303,
          running: true,
          ownerThreadId: "thread-local-text",
          endpointUrl: "http://127.0.0.1:43125/health",
          port: 43125,
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          estimatedResidentMemoryBytes: 6 * 1024 ** 3,
          actualResidentMemoryBytes: 4 * 1024 ** 3,
          memorySampledAt: "2026-05-28T12:03:00.000Z",
          lastUsedAt: "2026-05-28T12:02:45.000Z",
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("ignores stale resident state unless stopped processes are requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-residency-stale-"));
    try {
      const miniCpmStatePath = join(workspace, ".ambient/vision/minicpm-v/state/server-state.json");
      await mkdir(dirname(miniCpmStatePath), { recursive: true });
      await writeFile(miniCpmStatePath, `${JSON.stringify({ pid: 4202, endpoint: "http://127.0.0.1:43124" })}\n`);

      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: () => false,
        listProcesses: async () => [],
      })).resolves.toEqual([]);
      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: () => false,
        includeStopped: true,
        listProcesses: async () => [],
      })).resolves.toEqual([
        expect.objectContaining({ capability: "minicpm-v", pid: 4202, running: false }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces stopped managed local-text state without trusting a reused pid", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-residency-stopped-text-"));
    try {
      const stateDir = join(workspace, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 4303,
        status: "stopped",
        command: ["/runtime/local-text", "serve"],
        cwd: workspace,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-05-28T12:02:30.000Z",
        lastUsedAt: "2026-05-28T12:05:00.000Z",
        stoppedAt: "2026-05-28T12:05:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43125/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
        actualResidentMemoryBytes: 4 * 1024 ** 3,
        memorySampledAt: "2026-05-28T12:04:00.000Z",
      }, null, 2)}\n`);

      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4303,
        listProcesses: async () => [],
      })).resolves.toEqual([]);

      const residents = await detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4303,
        includeStopped: true,
        listProcesses: async () => [],
        processMemorySampler: async () => ({
          residentMemoryBytes: 4 * 1024 ** 3,
          sampledAt: "2026-05-28T12:06:00.000Z",
        }),
      });

      expect(residents).toEqual([
        expect.objectContaining({
          capability: "local-text",
          id: "local-text:local-text-runtime:4303",
          pid: 4303,
          running: false,
          trackingStatus: "managed",
          endpointUrl: "http://127.0.0.1:43125/health",
          estimatedResidentMemoryBytes: 6 * 1024 ** 3,
          lastUsedAt: "2026-05-28T12:05:00.000Z",
        }),
      ]);
      expect(residents[0]).not.toHaveProperty("actualResidentMemoryBytes");
      expect(residents[0]).not.toHaveProperty("memorySampledAt");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces stopped MiniCPM state without trusting a reused pid", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-residency-stopped-minicpm-"));
    try {
      const miniCpmStatePath = join(workspace, ".ambient/vision/minicpm-v/state/server-state.json");
      await mkdir(dirname(miniCpmStatePath), { recursive: true });
      await writeFile(miniCpmStatePath, `${JSON.stringify({
        pid: 4202,
        status: "stopped",
        previousPid: 4202,
        endpoint: "http://127.0.0.1:43124",
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        command: ["/runtime/llama-server", "-c", "4096"],
        stoppedAt: "2026-05-28T12:05:00.000Z",
      }, null, 2)}\n`);

      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4202,
        listProcesses: async () => [],
      })).resolves.toEqual([]);

      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4202,
        includeStopped: true,
        listProcesses: async () => [],
      })).resolves.toEqual([
        expect.objectContaining({
          capability: "minicpm-v",
          pid: 4202,
          running: false,
          endpointUrl: "http://127.0.0.1:43124",
          lastUsedAt: "2026-05-28T12:05:00.000Z",
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("discovers untracked llama.cpp processes without duplicating managed residents", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-untracked-"));
    try {
      const miniCpmStatePath = join(workspace, ".ambient/vision/minicpm-v/state/server-state.json");
      await mkdir(dirname(miniCpmStatePath), { recursive: true });
      await writeFile(miniCpmStatePath, `${JSON.stringify({
        pid: 4202,
        endpoint: "http://127.0.0.1:43124",
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        command: ["/runtime/llama-server", "--model", "/models/minicpm.gguf", "--port", "43124"],
      }, null, 2)}\n`);

      const residents = await detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4202 || pid === 4404 || pid === 4505,
        listProcesses: async () => [
          {
            pid: 4202,
            command: "/runtime/llama-server",
            args: "/runtime/llama-server --model /models/minicpm.gguf --port 43124",
          },
          {
            pid: 4404,
            command: "/opt/llama.cpp/build/bin/llama-server",
            args: "/opt/llama.cpp/build/bin/llama-server --model /models/other.gguf --host 127.0.0.1 --port 44222 -c 8192",
          },
          {
            pid: 4505,
            command: "/usr/bin/python",
            args: "/usr/bin/python script.py --model /tmp/not-llama.gguf",
          },
        ],
        processMemorySampler: async (pid) => ({
          residentMemoryBytes: pid === 4404 ? 2 * 1024 ** 3 : 3 * 1024 ** 3,
          sampledAt: "2026-05-28T12:04:00.000Z",
        }),
      });

      expect(residents).toEqual([
        expect.objectContaining({
          capability: "minicpm-v",
          pid: 4202,
          running: true,
        }),
        expect.objectContaining({
          capability: "local-text",
          id: "untracked-llama:4404",
          pid: 4404,
          running: true,
          statePath: "process:4404",
          trackingStatus: "untracked",
          endpointUrl: "http://127.0.0.1:44222",
          port: 44222,
          modelId: "/models/other.gguf",
          contextTokens: 8192,
          actualResidentMemoryBytes: 2 * 1024 ** 3,
          memorySampledAt: "2026-05-28T12:04:00.000Z",
        }),
      ]);

      await expect(detectLocalLlamaResidentProcesses(workspace, {
        processAlive: (pid) => pid === 4202 || pid === 4404,
        includeUntracked: false,
        listProcesses: async () => [
          {
            pid: 4404,
            command: "/opt/llama.cpp/build/bin/llama-server",
            args: "/opt/llama.cpp/build/bin/llama-server --model /models/other.gguf --port 44222",
          },
        ],
      })).resolves.toEqual([
        expect.objectContaining({
          capability: "minicpm-v",
          pid: 4202,
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("detects Ambient-managed memory embeddings before the untracked llama.cpp fallback", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-llama-memory-embedding-"));
    try {
      const stateRoot = join(workspace, ".ambient/memory/tencentdb/embeddings/llama-server");
      const stateDir = join(stateRoot, AMBIENT_MEMORY_EMBEDDING_PROFILE_ID);
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "server-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-llama-server-state-v1",
        profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
        pid: 1774,
        endpointUrl: "http://127.0.0.1:57110",
        host: "127.0.0.1",
        port: 57110,
        runtimeBinaryPath: "/runtime/llama-server",
        modelPath: "/models/embeddinggemma-300m-qat-Q8_0.gguf",
        contextTokens: 2048,
        gpuLayers: 99,
        idleTimeoutMs: 0,
        startedAt: "2026-06-15T23:00:00.000Z",
        lastUsedAt: "2026-06-15T23:01:00.000Z",
        stateDir,
        logPath: join(stateDir, "llama-server.log"),
        stdoutPath: join(stateDir, "llama-server.stdout.log"),
        stderrPath: join(stateDir, "llama-server.stderr.log"),
        command: [
          "/runtime/llama-server",
          "--embedding",
          "--alias",
          AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
          "--model",
          "/models/embeddinggemma-300m-qat-Q8_0.gguf",
          "--port",
          "57110",
        ],
      }, null, 2)}\n`);

      const residents = await detectLocalLlamaResidentProcesses(workspace, {
        memoryEmbeddingStateRootPath: stateRoot,
        processAlive: (pid) => pid === 1774,
        listProcesses: async () => [
          {
            pid: 1774,
            command: "/runtime/llama-server",
            args: "/runtime/llama-server --embedding --alias embeddinggemma-300m-q8_0 --model /models/embeddinggemma-300m-qat-Q8_0.gguf --host 127.0.0.1 --port 57110",
          },
        ],
        processMemorySampler: async () => ({
          residentMemoryBytes: 9 * 1024 ** 2,
          sampledAt: "2026-06-15T23:02:00.000Z",
        }),
      });

      expect(residents).toEqual([
        expect.objectContaining({
          capability: "embeddings",
          id: `embeddings:${AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID}`,
          pid: 1774,
          running: true,
          providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
          runtimeId: AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
          trackingStatus: "managed",
          endpointUrl: "http://127.0.0.1:57110",
          port: 57110,
          modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
          profileId: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
          estimatedResidentMemoryBytes: ambientMemoryEmbeddingModelProfile.estimatedResidentMemoryBytes,
          actualResidentMemoryBytes: 9 * 1024 ** 2,
          memorySampledAt: "2026-06-15T23:02:00.000Z",
        }),
      ]);
      expect(residents.map((resident) => resident.id)).not.toContain("untracked-llama:1774");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
