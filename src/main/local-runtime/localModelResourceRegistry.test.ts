import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildLocalModelResourceRegistry,
  embeddingProviderRuntimeRegistryEntries,
  enforceLocalModelResourceLaunchPolicy,
  localModelResourcePolicyDecision,
  localModelResourcePolicySnapshotValidationReason,
  localTextRequestedLaunch,
  sampleLocalModelHostMemorySnapshot,
  validateLocalModelResourcePolicySnapshot,
  voiceProviderRuntimeRegistryEntries,
} from "./localModelResourceRegistry";
import type { LocalLlamaResidentProcess } from "./localRuntimeLocalLlamaFacade";
import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";

const gib = 1024 ** 3;

describe("local model resource registry", () => {
  it("samples host memory snapshots for utilization-based policy callers", () => {
    expect(sampleLocalModelHostMemorySnapshot({
      now: () => new Date("2026-06-04T12:05:00.000Z"),
      totalMemoryBytes: 32 * gib,
      freeMemoryBytes: 18 * gib,
      availableMemoryBytes: 17 * gib,
    })).toEqual({
      schemaVersion: "ambient-local-model-host-memory-v1",
      sampledAt: "2026-06-04T12:05:00.000Z",
      totalMemoryBytes: 32 * gib,
      freeMemoryBytes: 18 * gib,
      availableMemoryBytes: 17 * gib,
    });
  });

  it("builds a registry snapshot with process identity, idle time, estimated memory, actual memory, and policy evidence", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      residentProcesses: [
        resident({
          id: "local-deep-research:literesearcher-4b-q4-k-m:4101",
          pid: 4101,
          ownerThreadId: "thread-1",
          port: 43123,
          actualResidentMemoryBytes: 5 * gib,
          lastUsedAt: "2026-06-04T12:00:00.000Z",
        }),
        resident({
          capability: "minicpm-v",
          id: "minicpm-v:4202",
          pid: 4202,
          profileId: "",
          port: 43124,
          estimatedResidentMemoryBytes: 7 * gib,
          actualResidentMemoryBytes: 3 * gib,
          lastUsedAt: "2026-06-04T12:01:00.000Z",
        }),
      ],
      requestedLaunch: {
        capability: "local-deep-research",
        id: "local-deep-research:literesearcher-4b-q8-0:requested",
        profileId: "literesearcher-4b-q8-0",
        contextTokens: 16384,
        estimatedResidentMemoryBytes: 9 * gib,
      },
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 20 * gib,
        memoryLimitBehavior: "warn",
      },
      now: () => new Date("2026-06-04T12:05:00.000Z"),
    });

    expect(snapshot).toMatchObject({
      schemaVersion: "ambient-local-model-resource-registry-v1",
      capturedAt: "2026-06-04T12:05:00.000Z",
      activeCount: 2,
      activeEstimatedResidentMemoryBytes: 14 * gib,
      activeActualResidentMemoryBytes: 8 * gib,
      requestedLaunch: {
        capability: "local-deep-research",
        id: "local-deep-research:literesearcher-4b-q8-0:requested",
        profileId: "literesearcher-4b-q8-0",
        contextTokens: 16384,
        estimatedResidentMemoryBytes: 9 * gib,
      },
      entries: [
        expect.objectContaining({
          capability: "local-deep-research",
          pid: 4101,
          ownerThreadId: "thread-1",
          port: 43123,
          quantization: "Q4_K_M",
          contextTokens: 16384,
          actualResidentMemoryBytes: 5 * gib,
          idleTimeMs: 5 * 60_000,
        }),
        expect.objectContaining({
          capability: "minicpm-v",
          pid: 4202,
          port: 43124,
          actualResidentMemoryBytes: 3 * gib,
        }),
      ],
      policyDecision: {
        outcome: "warn",
        requestedEstimatedResidentMemoryBytes: 9 * gib,
        activeEstimatedResidentMemoryBytes: 14 * gib,
        activeActualResidentMemoryBytes: 8 * gib,
        projectedEstimatedResidentMemoryBytes: 23 * gib,
        maxResidentMemoryBytes: 20 * gib,
        exceededByBytes: 3 * gib,
        unloadCandidateIds: [
          "local-deep-research:literesearcher-4b-q4-k-m:4101",
          "minicpm-v:4202",
        ],
      },
    });
  });

  it("folds local voice provider runtime state into registry memory accounting", async () => {
    const voiceEntries = voiceProviderRuntimeRegistryEntries([
      {
        packageId: "ambient-cli:piper",
        packageName: "ambient-piper-tts",
        command: "piper_tts",
        capabilityId: "ambient-cli:piper:tool:piper_tts",
        providerId: "ambient-cli:piper:tool:piper_tts",
        label: "Piper TTS",
        format: "wav",
        formats: ["wav"],
        voices: [{ id: "default" }],
        local: true,
        installed: true,
        available: false,
        availabilityReason: "Voice provider validation pending: runtime stopped",
        diagnostics: {
          healthStatus: "passed",
          missingHints: ["Start Piper before synthesis."],
          runtimeState: {
            schemaVersion: "ambient-voice-provider-runtime-state-v1",
            status: "stopped",
            running: false,
            modelRuntimeId: "piper-runtime",
            modelProfileId: "piper-en-us-lessac",
            modelId: "rhasspy/piper/en_US-lessac-medium",
            endpoint: "http://127.0.0.1:59201",
            estimatedResidentMemoryBytes: 2 * gib,
            statePath: ".ambient/voice/piper/runtime-state.json",
            reason: "runtime stopped",
          },
        },
      },
    ]);

    expect(voiceEntries).toEqual([
      expect.objectContaining({
        capability: "voice",
        id: "voice:piper-runtime",
        running: false,
        providerId: "ambient-cli:piper:tool:piper_tts",
        runtimeId: "piper-runtime",
        profileId: "piper-en-us-lessac",
        modelId: "rhasspy/piper/en_US-lessac-medium",
        endpointUrl: "http://127.0.0.1:59201",
        port: 59201,
        estimatedResidentMemoryBytes: 2 * gib,
        statePath: ".ambient/voice/piper/runtime-state.json",
      }),
    ]);

    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      residentProcesses: [],
      additionalEntries: voiceEntries,
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:requested",
        modelId: "local/text-4b",
        estimatedResidentMemoryBytes: 6 * gib,
      },
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(snapshot.entries).toEqual(voiceEntries);
    expect(snapshot.activeCount).toBe(0);
    expect(snapshot.activeEstimatedResidentMemoryBytes).toBe(0);
    expect(snapshot.policyDecision.projectedEstimatedResidentMemoryBytes).toBe(6 * gib);
  });

  it("folds local embedding provider runtime state into registry memory accounting", async () => {
    const embeddingEntries = embeddingProviderRuntimeRegistryEntries([
      {
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
        availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
        diagnostics: {
          healthStatus: "passed",
          missingHints: [],
          runtimeState: {
            schemaVersion: "ambient-embedding-provider-runtime-state-v1",
            status: "running",
            running: true,
            modelRuntimeId: "bge-runtime",
            modelId: "BAAI/bge-small-en-v1.5",
            pid: 7001,
            endpoint: "http://127.0.0.1:59301",
            estimatedResidentMemoryBytes: 1536 * 1024 * 1024,
            actualResidentMemoryBytes: 1280 * 1024 * 1024,
            memorySampledAt: "2026-06-05T00:00:00.000Z",
            statePath: ".ambient/embeddings/bge/runtime-state.json",
          },
        },
      },
    ]);

    expect(embeddingEntries).toEqual([
      expect.objectContaining({
        capability: "embeddings",
        id: "embeddings:bge-runtime",
        running: true,
        providerId: "ambient-cli:embeddings:tool:bge_embeddings",
        runtimeId: "bge-runtime",
        modelId: "BAAI/bge-small-en-v1.5",
        pid: 7001,
        endpointUrl: "http://127.0.0.1:59301",
        port: 59301,
        estimatedResidentMemoryBytes: 1536 * 1024 * 1024,
        actualResidentMemoryBytes: 1280 * 1024 * 1024,
        memorySampledAt: "2026-06-05T00:00:00.000Z",
        statePath: ".ambient/embeddings/bge/runtime-state.json",
      }),
    ]);

    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      residentProcesses: [],
      additionalEntries: embeddingEntries,
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(snapshot.entries).toEqual(embeddingEntries);
    expect(snapshot.activeCount).toBe(1);
    expect(snapshot.activeEstimatedResidentMemoryBytes).toBe(1536 * 1024 * 1024);
    expect(snapshot.activeActualResidentMemoryBytes).toBe(1280 * 1024 * 1024);
  });

  it("dedupes untracked llama process rows when a managed embedding provider reports the same runtime", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      residentProcesses: [
        {
          capability: "local-text",
          id: "untracked-llama:1774",
          pid: 1774,
          running: true,
          statePath: "process:1774",
          trackingStatus: "untracked",
          endpointUrl: "http://127.0.0.1:57110",
          port: 57110,
          modelId: "embeddinggemma-300m-qat-Q8_0.gguf",
          actualResidentMemoryBytes: 9 * 1024 ** 2,
          memorySampledAt: "2026-06-15T23:02:00.000Z",
        },
      ],
      additionalEntries: [
        {
          capability: "embeddings",
          id: "embeddings:ambient-memory-embeddinggemma-300m-q8_0",
          providerId: "ambient:memory:embeddings:embeddinggemma-300m-q8_0",
          runtimeId: "ambient-memory-embeddinggemma-300m-q8_0",
          modelId: "embeddinggemma-300m-q8_0",
          profileId: "embeddinggemma-300m-q8_0",
          pid: 1774,
          running: true,
          statePath: ".ambient/memory/tencentdb/embeddings/llama-server/embeddinggemma-300m-q8_0/server-state.json",
          trackingStatus: "managed",
          endpointUrl: "http://127.0.0.1:57110",
          estimatedResidentMemoryBytes: 768 * 1024 * 1024,
        },
      ],
      now: () => new Date("2026-06-15T23:03:00.000Z"),
    });

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      capability: "embeddings",
      id: "embeddings:ambient-memory-embeddinggemma-300m-q8_0",
      trackingStatus: "managed",
      providerId: "ambient:memory:embeddings:embeddinggemma-300m-q8_0",
      runtimeId: "ambient-memory-embeddinggemma-300m-q8_0",
      modelId: "embeddinggemma-300m-q8_0",
      pid: 1774,
      endpointUrl: "http://127.0.0.1:57110",
      estimatedResidentMemoryBytes: 768 * 1024 * 1024,
      actualResidentMemoryBytes: 9 * 1024 ** 2,
      memorySampledAt: "2026-06-15T23:02:00.000Z",
    });
    expect(snapshot.activeCount).toBe(1);
    expect(snapshot.activeEstimatedResidentMemoryBytes).toBe(768 * 1024 * 1024);
    expect(snapshot.activeActualResidentMemoryBytes).toBe(9 * 1024 ** 2);
  });

  it("discovers Ambient-managed local text runtime state through detector options", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-local-text-registry-"));
    try {
      const stateRootPath = join(root, "custom-local-text-state");
      const runtimeStateDir = join(stateRootPath, "local-text-runtime");
      await mkdir(runtimeStateDir, { recursive: true });
      await writeFile(join(runtimeStateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 4301,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: "/workspace",
        stateDir: runtimeStateDir,
        stdoutPath: join(runtimeStateDir, "runtime.stdout.log"),
        stderrPath: join(runtimeStateDir, "runtime.stderr.log"),
        startedAt: "2026-06-04T12:00:00.000Z",
        lastUsedAt: "2026-06-04T12:01:00.000Z",
        idleTimeoutMs: 300_000,
        healthUrl: "http://127.0.0.1:43123/health",
        ownerThreadId: "child-thread-1",
        parentThreadId: "parent-thread-1",
        subagentThreadId: "child-thread-1",
        ownerDisplayName: "Review worker",
        estimatedResidentMemoryBytes: 6 * gib,
        actualResidentMemoryBytes: 5 * gib,
        memorySampledAt: "2026-06-04T12:01:30.000Z",
      }, null, 2)}\n`, "utf8");

      const snapshot = await buildLocalModelResourceRegistry({
        workspacePath: "/workspace",
        residentDetection: {
          localTextStateRootPath: stateRootPath,
          processAlive: (pid) => pid === 4301,
          sampleProcessMemory: false,
          listProcesses: async () => [],
        },
        requestedLaunch: localTextRequestedLaunch({
          ownerThreadId: "child-thread-2",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          estimatedResidentMemoryBytes: 6 * gib,
        }),
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          maxResidentMemoryBytes: 10 * gib,
          memoryLimitBehavior: "refuse",
        },
        now: () => new Date("2026-06-04T12:05:00.000Z"),
      });

      expect(snapshot).toMatchObject({
        activeCount: 1,
        activeEstimatedResidentMemoryBytes: 6 * gib,
        activeActualResidentMemoryBytes: 5 * gib,
        entries: [
          expect.objectContaining({
            capability: "local-text",
            id: "local-text:local-text-runtime:4301",
            pid: 4301,
            runtimeId: "local-text-runtime",
            providerId: "local",
            trackingStatus: "managed",
            running: true,
            ownerThreadId: "child-thread-1",
            parentThreadId: "parent-thread-1",
            subagentThreadId: "child-thread-1",
            ownerDisplayName: "Review worker",
            endpointUrl: "http://127.0.0.1:43123/health",
            port: 43123,
            modelId: "local/text-4b",
            profileId: "local-text-4b-q4",
            estimatedResidentMemoryBytes: 6 * gib,
            actualResidentMemoryBytes: 5 * gib,
            idleTimeMs: 4 * 60_000,
          }),
        ],
        policyDecision: {
          outcome: "refuse",
          activeEstimatedResidentMemoryBytes: 6 * gib,
          activeActualResidentMemoryBytes: 5 * gib,
          requestedEstimatedResidentMemoryBytes: 6 * gib,
          projectedEstimatedResidentMemoryBytes: 12 * gib,
          maxResidentMemoryBytes: 10 * gib,
          exceededByBytes: 2 * gib,
          unloadCandidateIds: ["local-text:local-text-runtime:4301"],
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses projected utilization and remaining-memory floor when host memory is supplied", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-04T12:05:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 9 * gib,
      },
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "refuse",
      },
      residentProcesses: [resident({
        id: "resident-1",
        pid: 4101,
        estimatedResidentMemoryBytes: 7 * gib,
        actualResidentMemoryBytes: 5 * gib,
      })],
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:large:requested",
        modelId: "local/text-large",
        estimatedResidentMemoryBytes: 4 * gib,
      },
    });

    expect(snapshot).toMatchObject({
      hostMemory: {
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 9 * gib,
      },
      policyDecision: {
        outcome: "refuse",
        activeResidentMemoryBasis: "actual-rss",
        activeEstimatedResidentMemoryBytes: 7 * gib,
        activeActualResidentMemoryBytes: 5 * gib,
        requestedEstimatedResidentMemoryBytes: 4 * gib,
        projectedEstimatedResidentMemoryBytes: 11 * gib,
        projectedResidentMemoryBytes: 9 * gib,
        projectedFreeMemoryBytes: 5 * gib,
        projectedFreeMemoryRatio: 0.15625,
        projectedSystemMemoryUtilization: 0.84375,
        maxProjectedMemoryUtilization: 0.8,
        minFreeMemoryRatioAfterLaunch: 0.2,
        comfortableFreeMemoryRatio: 0.4,
        unloadCandidateIds: ["resident-1"],
      },
    });
    expect(snapshot.policyDecision.reason).toContain("below the 20% floor");
    expect(validateLocalModelResourcePolicySnapshot(snapshot)).toMatchObject({ valid: true });
  });

  it("uses mixed actual-and-estimated active memory when only some runtimes report RSS", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-04T12:05:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 20 * gib,
      },
      residentProcesses: [
        resident({
          id: "resident-with-rss",
          pid: 4101,
          estimatedResidentMemoryBytes: 10 * gib,
          actualResidentMemoryBytes: 7 * gib,
        }),
        resident({
          id: "resident-estimate-only",
          pid: 4102,
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: undefined,
        }),
      ],
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:large:requested",
        modelId: "local/text-large",
        estimatedResidentMemoryBytes: 5 * gib,
      },
    });

    expect(snapshot).toMatchObject({
      activeCount: 2,
      activeEstimatedResidentMemoryBytes: 16 * gib,
      activeActualResidentMemoryBytes: 7 * gib,
      policyDecision: {
        outcome: "within-limit",
        activeResidentMemoryBasis: "mixed",
        activeEstimatedResidentMemoryBytes: 16 * gib,
        activeActualResidentMemoryBytes: 7 * gib,
        requestedEstimatedResidentMemoryBytes: 5 * gib,
        projectedEstimatedResidentMemoryBytes: 21 * gib,
        projectedResidentMemoryBytes: 18 * gib,
        uncertaintyReasons: [
          "Active resident model memory mixes actual RSS for sampled runtimes with estimates for runtimes that have not reported RSS.",
        ],
      },
    });
    expect(validateLocalModelResourcePolicySnapshot(snapshot)).toMatchObject({ valid: true });
  });

  it("rejects policy decisions that understate projected host-memory pressure", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-04T12:05:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 9 * gib,
      },
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "refuse",
      },
      residentProcesses: [resident({ id: "resident-1", pid: 4101 })],
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:large:requested",
        modelId: "local/text-large",
        estimatedResidentMemoryBytes: 4 * gib,
      },
    });
    const corrupted = {
      ...snapshot,
      policyDecision: {
        ...snapshot.policyDecision,
        outcome: "within-limit" as const,
        projectedFreeMemoryRatio: 0.25,
        projectedSystemMemoryUtilization: 0.75,
        unloadCandidateIds: [],
      },
    };

    expect(validateLocalModelResourcePolicySnapshot(corrupted).errors).toEqual(expect.arrayContaining([
      "policyDecision.outcome expected refuse but found within-limit",
      "policyDecision.projectedSystemMemoryUtilization expected 0.84375 but found 0.75",
      "policyDecision.projectedFreeMemoryRatio expected 0.15625 but found 0.25",
      "policyDecision.unloadCandidateIds expected [resident-1] but found []",
    ]));
  });

  it("returns the configured limit behavior when projected estimated memory exceeds the ceiling", () => {
    for (const memoryLimitBehavior of ["warn", "refuse", "ask-to-exceed", "unload-idle"] as const) {
      expect(localModelResourcePolicyDecision({
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          maxResidentMemoryBytes: 8 * gib,
          memoryLimitBehavior,
        },
        entries: [entry("resident-1", 4101)],
        activeEstimatedResidentMemoryBytes: 7 * gib,
        requestedLaunch: {
          capability: "local-deep-research",
          id: "requested",
          estimatedResidentMemoryBytes: 4 * gib,
        },
      })).toMatchObject({
        outcome: memoryLimitBehavior,
        exceededByBytes: 3 * gib,
      });
    }
  });

  it("builds requested-launch records for local text delegation", () => {
    expect(localTextRequestedLaunch({
      ownerThreadId: "thread",
      modelId: "local/text-4b",
      profileId: "local-text-4b-q4",
      contextTokens: 8192,
      estimatedResidentMemoryBytes: 6 * gib,
    })).toEqual({
      capability: "local-text",
      id: "local-text:local-text-4b-q4:requested",
      ownerThreadId: "thread",
      modelId: "local/text-4b",
      profileId: "local-text-4b-q4",
      contextTokens: 8192,
      estimatedResidentMemoryBytes: 6 * gib,
    });
  });

  it("unloads idle candidates before launch when unload-idle behavior is configured", async () => {
    const killProcess = vi.fn();
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        memoryLimitBehavior: "unload-idle",
      },
      residentProcesses: [resident({ id: "resident-1", pid: 4101, lastUsedAt: "2026-06-04T12:00:00.000Z" })],
      requestedLaunch: {
        capability: "local-deep-research",
        id: "requested",
        estimatedResidentMemoryBytes: 4 * gib,
      },
      now: () => new Date("2026-06-04T12:05:00.000Z"),
    });

    await expect(enforceLocalModelResourceLaunchPolicy({ registry: snapshot, killProcess })).resolves.toMatchObject({
      allowed: true,
      outcome: "unloaded-idle",
      unload: {
        attemptedIds: ["resident-1"],
        stoppedIds: ["resident-1"],
        failed: [],
      },
    });
    expect(killProcess).toHaveBeenCalledWith(4101, "SIGTERM");
  });

  it("excludes active sub-agent leases from unload-idle candidates", async () => {
    const killProcess = vi.fn();
    const activeLease = runtimeLease({
      leaseId: "lease-owned-idle",
      modelRuntimeId: "owned-runtime",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      pid: 4101,
      endpoint: "http://127.0.0.1:43123/health",
    });
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        memoryLimitBehavior: "unload-idle",
      },
      residentProcesses: [
        resident({
          capability: "local-text",
          id: "local-text:owned-runtime:4101",
          runtimeId: "owned-runtime",
          pid: 4101,
          profileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          estimatedResidentMemoryBytes: 7 * gib,
          endpointUrl: "http://127.0.0.1:43123/health",
          lastUsedAt: "2026-06-04T12:00:00.000Z",
        }),
        resident({
          id: "local-deep-research:idle-free:4102",
          pid: 4102,
          estimatedResidentMemoryBytes: 7 * gib,
          lastUsedAt: "2026-06-04T11:55:00.000Z",
        }),
      ],
      leases: [activeLease],
      requestedLaunch: {
        capability: "local-text",
        id: "requested",
        estimatedResidentMemoryBytes: 4 * gib,
      },
      now: () => new Date("2026-06-04T12:05:00.000Z"),
    });

    expect(snapshot.policyDecision).toMatchObject({
      outcome: "unload-idle",
      unloadCandidateIds: ["local-deep-research:idle-free:4102"],
    });
    await expect(enforceLocalModelResourceLaunchPolicy({ registry: snapshot, killProcess })).resolves.toMatchObject({
      allowed: true,
      outcome: "unloaded-idle",
      unload: {
        attemptedIds: ["local-deep-research:idle-free:4102"],
        stoppedIds: ["local-deep-research:idle-free:4102"],
        failed: [],
      },
    });
    expect(killProcess).toHaveBeenCalledTimes(1);
    expect(killProcess).toHaveBeenCalledWith(4102, "SIGTERM");
  });

  it("validates local-memory policy snapshots before launch enforcement", async () => {
    const killProcess = vi.fn();
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        memoryLimitBehavior: "unload-idle",
      },
      residentProcesses: [resident({ id: "resident-1", pid: 4101, lastUsedAt: "2026-06-04T12:00:00.000Z" })],
      requestedLaunch: {
        capability: "local-deep-research",
        id: "requested",
        estimatedResidentMemoryBytes: 4 * gib,
      },
      now: () => new Date("2026-06-04T12:05:00.000Z"),
    });
    const corrupted = {
      ...snapshot,
      policyDecision: {
        ...snapshot.policyDecision,
        outcome: "within-limit" as const,
        reason: "Projected local-model resident memory is within the configured ceiling.",
        unloadCandidateIds: [],
      },
    };

    const validation = validateLocalModelResourcePolicySnapshot(corrupted);

    expect(validation).toMatchObject({
      schemaVersion: "ambient-local-model-resource-policy-validation-v1",
      valid: false,
    });
    expect(localModelResourcePolicySnapshotValidationReason(validation)).toContain("policyDecision.outcome expected unload-idle");
    await expect(enforceLocalModelResourceLaunchPolicy({ registry: corrupted, killProcess })).resolves.toMatchObject({
      allowed: false,
      outcome: "refuse",
      reason: expect.stringContaining("Local-model resource policy snapshot is invalid"),
    });
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("rejects policy decisions that understate snapshotted requested launch memory", async () => {
    const snapshot = await buildLocalModelResourceRegistry({
      workspacePath: "/workspace",
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 16 * gib,
        memoryLimitBehavior: "refuse",
      },
      residentProcesses: [],
      requestedLaunch: {
        capability: "local-text",
        id: "local-text:large:requested",
        modelId: "local/text-large",
        estimatedResidentMemoryBytes: 20 * gib,
      },
    });
    const corrupted = {
      ...snapshot,
      policyDecision: {
        ...snapshot.policyDecision,
        requestedEstimatedResidentMemoryBytes: 4 * gib,
        projectedEstimatedResidentMemoryBytes: 4 * gib,
        outcome: "within-limit" as const,
        reason: "Projected local-model resident memory is within the configured ceiling.",
        maxResidentMemoryBytes: 16 * gib,
        exceededByBytes: undefined,
        unloadCandidateIds: [],
      },
    };

    const validation = validateLocalModelResourcePolicySnapshot(corrupted);

    expect(validation.errors).toEqual(expect.arrayContaining([
      "policyDecision.outcome expected refuse but found within-limit",
      `policyDecision.requestedEstimatedResidentMemoryBytes expected ${20 * gib} but found ${4 * gib}`,
      `policyDecision.projectedEstimatedResidentMemoryBytes expected ${20 * gib} but found ${4 * gib}`,
      "policyDecision.exceededByBytes must be a finite non-negative number",
    ]));
    await expect(enforceLocalModelResourceLaunchPolicy({ registry: corrupted })).resolves.toMatchObject({
      allowed: false,
      outcome: "refuse",
      reason: expect.stringContaining("Local-model resource policy snapshot is invalid"),
    });
  });
});

function resident(overrides: Partial<LocalLlamaResidentProcess> = {}): LocalLlamaResidentProcess {
  return {
    capability: "local-deep-research",
    id: "local-deep-research:literesearcher-4b-q4-k-m:4101",
    pid: 4101,
    running: true,
    statePath: "/workspace/.ambient/local-deep-research/server/literesearcher-4b-q4-k-m/server-state.json",
    endpointUrl: "http://127.0.0.1:43123",
    port: 43123,
    modelId: "/models/LiteResearcher-4B.Q4_K_M.gguf",
    profileId: "literesearcher-4b-q4-k-m",
    contextTokens: 16384,
    estimatedResidentMemoryBytes: 7 * gib,
    startedAt: "2026-06-04T11:55:00.000Z",
    lastUsedAt: "2026-06-04T12:00:00.000Z",
    ...overrides,
  };
}

function entry(id: string, pid: number) {
  return {
    capability: "local-deep-research" as const,
    id,
    pid,
    running: true,
    statePath: "/state",
    idleTimeMs: 1,
  };
}

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    subagentRunId: "run-review",
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 7 * gib,
    actualResidentMemoryBytes: 6 * gib,
    pid: 4101,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-04T12:00:00.000Z",
    lastHeartbeatAt: "2026-06-04T12:04:30.000Z",
    status: "running",
    ...overrides,
  };
}
