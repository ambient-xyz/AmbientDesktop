import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalRuntimeLeaseRecord } from "../shared/types";
import {
  buildLocalModelRuntimeStatusSnapshot,
  localModelRuntimeStatusText,
} from "./localModelRuntimeStatus";
import { readLocalModelRuntimeLeaseJournal } from "./localModelRuntimeManager";

const gib = 1024 ** 3;

describe("local model runtime status", () => {
  it("joins active sub-agent leases into read-only runtime inventory stop blockers", async () => {
    const lease = runtimeLease({
      leaseId: "lease-review",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      ownerDisplayName: "Review worker",
    });
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [
        {
          capability: "local-text",
          id: "local-text:local-text-runtime:5001",
          pid: 5001,
          running: true,
          statePath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime-state.json",
          providerId: "local",
          runtimeId: "local-text-runtime",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          endpointUrl: "http://127.0.0.1:43123/health",
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 4 * gib,
          memorySampledAt: "2026-06-05T00:00:00.000Z",
        },
      ],
      leases: [lease],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      untrackedCount: 0,
      activeEstimatedResidentMemoryBytes: 6 * gib,
      activeActualResidentMemoryBytes: 4 * gib,
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "local-text:local-text-runtime:5001",
      owners: [
        expect.objectContaining({
          leaseId: "lease-review",
          displayName: "sub-agent Review worker",
        }),
      ],
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Review worker.",
        blockerLeaseIds: ["lease-review"],
        forceTerminationAllowed: true,
        forceRequiresSubagentCancellation: true,
        untracked: false,
      },
    });
    expect(snapshot.policyHandoff).toMatchObject({
      schemaVersion: "ambient-local-runtime-policy-handoff-v1",
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 1,
      memoryEvidence: {
        activeEstimatedResidentMemoryBytes: 6 * gib,
        activeActualResidentMemoryBytes: 4 * gib,
        entryCountWithActualRss: 1,
      },
      activeOwners: [
        expect.objectContaining({
          runtimeEntryId: "local-text:local-text-runtime:5001",
          leaseId: "lease-review",
          displayName: "sub-agent Review worker",
          subagentThreadId: "child-thread",
        }),
      ],
      stopBlockers: [
        expect.objectContaining({
          runtimeEntryId: "local-text:local-text-runtime:5001",
          action: "stop",
          blockerLeaseIds: ["lease-review"],
          forceRequiresSubagentCancellation: true,
        }),
      ],
      nextSafeActions: expect.arrayContaining([
        expect.objectContaining({
          action: "wait-for-owner",
          safety: "blocked",
          runtimeEntryId: "local-text:local-text-runtime:5001",
          blockerLeaseIds: ["lease-review"],
        }),
        expect.objectContaining({
          action: "force-stop-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:5001",
          toolName: "ambient_local_model_runtime_stop",
          toolParams: { runtimeId: "local-text:local-text-runtime:5001", dryRun: true, force: true },
          blockerLeaseIds: ["lease-review"],
          ownershipResolution: expect.objectContaining({
            required: true,
            lifecycleAction: "stop",
            resolution: "cancel-or-mark-affected-subagents",
            requiresInventoryRefresh: true,
          }),
        }),
        expect.objectContaining({
          action: "force-restart-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:5001",
          toolName: "ambient_local_model_runtime_restart",
          toolParams: { runtimeId: "local-text:local-text-runtime:5001", dryRun: true, force: true },
          blockerLeaseIds: ["lease-review"],
          ownershipResolution: expect.objectContaining({
            required: true,
            lifecycleAction: "restart",
            resolution: "cancel-or-mark-affected-subagents",
            requiresInventoryRefresh: true,
          }),
        }),
      ]),
    });

    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("Local model runtime status: 1 runtime; 1 running; 1 active lease.");
    expect(text).toContain("Next safe actions:");
    expect(text).toContain("blocked wait-for-owner for local-text:local-text-runtime:5001");
    expect(text).toContain("requires-approval force-stop-runtime for local-text:local-text-runtime:5001");
    expect(text).toContain('Tool: ambient_local_model_runtime_stop {"runtimeId":"local-text:local-text-runtime:5001","dryRun":true,"force":true}.');
    expect(text).toContain("Ownership resolution: cancel-or-mark-affected-subagents; refresh inventory before forcing stop.");
    expect(text).toContain("actions Stop disabled, Restart disabled, Start disabled, Unload disabled");
    expect(text).toContain("Stop disabled: In use by sub-agent Review worker.");
    expect(text).toContain("forced Stop/Restart requires sub-agent cancellation");
  });

  it("counts acquiring lease estimates in status memory evidence before runtime startup completes", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      leases: [runtimeLease({
        leaseId: "lease-acquiring",
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Planner worker",
        status: "acquiring",
        pid: undefined,
        endpoint: undefined,
      })],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 0,
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      activeEstimatedResidentMemoryBytes: 6 * gib,
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "local-text:local-text-runtime:lease",
      running: false,
      estimatedResidentMemoryBytes: 6 * gib,
      owners: [
        expect.objectContaining({
          leaseId: "lease-acquiring",
          displayName: "sub-agent Planner worker",
          status: "acquiring",
        }),
      ],
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Planner worker.",
        blockerLeaseIds: ["lease-acquiring"],
        forceTerminationAllowed: true,
        forceRequiresSubagentCancellation: true,
        untracked: false,
      },
    });
    expect(snapshot.policyHandoff).toMatchObject({
      activeLeaseCount: 1,
      memoryEvidence: {
        activeEstimatedResidentMemoryBytes: 6 * gib,
        entryCountWithActualRss: 0,
        entryCountWithOnlyEstimate: 1,
      },
      activeOwners: [
        expect.objectContaining({
          leaseId: "lease-acquiring",
          displayName: "sub-agent Planner worker",
          status: "acquiring",
          estimatedResidentMemoryBytes: 6 * gib,
        }),
      ],
    });

    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("Local model runtime status: 1 runtime; 0 running; 1 active lease.");
    expect(text).toContain("Resident memory: estimated 6.00 GiB.");
    expect(text).toContain("owner sub-agent Planner worker; leases active lease-acquiring");
    expect(text).toContain("Stop disabled: In use by sub-agent Planner worker.");
  });

  it("joins persisted local-text lease journals into runtime inventory after manager recreation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-model-runtime-status-lease-journal-"));
    try {
      const stateDir = join(workspace, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        status: "running",
        command: ["/runtime/local-text", "serve", "--port", "43123"],
        cwd: workspace,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:01:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * gib,
      }, null, 2)}\n`, "utf8");
      await writeFile(join(stateDir, "runtime-leases.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-runtime-lease-journal-v1",
        runtimeId: "local-text-runtime",
        updatedAt: "2026-06-05T00:01:00.000Z",
        leases: [runtimeLease({
          leaseId: "lease-persisted",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          lastHeartbeatAt: "2026-06-05T00:01:00.000Z",
        })],
      }, null, 2)}\n`, "utf8");

      const snapshot = await buildLocalModelRuntimeStatusSnapshot({
        workspacePath: workspace,
        residentDetection: {
          processAlive: (pid) => pid === 5001,
          listProcesses: async () => [],
          sampleProcessMemory: false,
        },
        leaseStaleMs: 5 * 60_000,
        now: () => new Date("2026-06-05T00:02:00.000Z"),
      });

      expect(snapshot.summary).toMatchObject({
        runtimeCount: 1,
        runningCount: 1,
        activeLeaseCount: 1,
        stopBlockedCount: 1,
        staleLeaseCount: 0,
      });
      expect(snapshot.inventory.entries[0]).toMatchObject({
        id: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        owners: [
          {
            leaseId: "lease-persisted",
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            displayName: "sub-agent Review worker",
            status: "running",
          },
        ],
        leaseState: {
          activeLeaseIds: ["lease-persisted"],
          staleLeaseIds: [],
          releasedLeaseIds: [],
          crashedLeaseIds: [],
          inactiveLeaseIds: [],
        },
        stopDecision: {
          ordinaryStopAllowed: false,
          reason: "In use by sub-agent Review worker.",
          blockerLeaseIds: ["lease-persisted"],
          forceTerminationAllowed: true,
          forceRequiresSubagentCancellation: true,
          untracked: false,
        },
      });
      expect(snapshot.policyHandoff.activeOwners).toEqual([
        expect.objectContaining({
          leaseId: "lease-persisted",
          runtimeEntryId: "local-text:local-text-runtime:5001",
          subagentThreadId: "child-thread",
          displayName: "sub-agent Review worker",
        }),
      ]);
      expect(localModelRuntimeStatusText(snapshot)).toContain("owner sub-agent Review worker; leases active lease-persisted");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces stale lease evidence without blocking ordinary Stop", async () => {
    const lease = runtimeLease({
      leaseId: "lease-stale",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      ownerDisplayName: "Old worker",
      lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    });
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [
        {
          capability: "local-text",
          id: "local-text:local-text-runtime:5001",
          pid: 5001,
          running: true,
          statePath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime-state.json",
          providerId: "local",
          runtimeId: "local-text-runtime",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          endpointUrl: "http://127.0.0.1:43123/health",
          estimatedResidentMemoryBytes: 6 * gib,
        },
      ],
      leases: [lease],
      leaseStaleMs: 5 * 60_000,
      now: () => new Date("2026-06-05T00:10:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 0,
      leaseRecoveryIssueCount: 1,
      repairedLeaseCount: 0,
      staleLeaseCount: 1,
      stopBlockedCount: 0,
    });
    expect(snapshot.leaseRecovery).toMatchObject({
      schemaVersion: "ambient-local-runtime-lease-recovery-v1",
      issueCount: 1,
      repairedLeaseIds: [],
      staleLeaseIds: ["lease-stale"],
      crashedLeaseIds: [],
      issues: [
        expect.objectContaining({
          source: "runtime_status",
          kind: "stale_active_lease",
          leaseId: "lease-stale",
          repaired: false,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Old worker",
        }),
      ],
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      owners: [],
      leaseState: {
        activeLeaseIds: [],
        staleLeaseIds: ["lease-stale"],
        releasedLeaseIds: [],
        crashedLeaseIds: [],
        inactiveLeaseIds: ["lease-stale"],
      },
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: true,
          blockerLeaseIds: [],
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("Local model runtime status: 1 runtime; 1 running; 0 active leases; 1 stale lease.");
    expect(text).toContain("Lease recovery: 1 stale lease no longer blocking.");
    expect(text).toContain("owner none; leases stale lease-stale");
    expect(text).toContain("ordinary Stop allowed");
  });

  it("repairs dead persisted runtime owner leases as crashed status evidence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-model-runtime-status-crashed-lease-"));
    try {
      const stateDir = join(workspace, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        status: "running",
        command: ["/runtime/local-text", "serve", "--port", "43123"],
        cwd: workspace,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:00:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * gib,
      }, null, 2)}\n`, "utf8");
      await writeFile(join(stateDir, "runtime-leases.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-runtime-lease-journal-v1",
        runtimeId: "local-text-runtime",
        updatedAt: "2026-06-05T00:00:00.000Z",
        leases: [runtimeLease({
          leaseId: "lease-crashed-owner",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
        })],
      }, null, 2)}\n`, "utf8");

      const snapshot = await buildLocalModelRuntimeStatusSnapshot({
        workspacePath: workspace,
        includeStopped: true,
        residentDetection: {
          localTextStateRootPath: join(workspace, ".ambient/local-model-runtime"),
          processAlive: () => false,
          listProcesses: async () => [],
          sampleProcessMemory: false,
        },
        leaseStaleMs: 5 * 60_000,
        now: () => new Date("2026-06-05T00:01:00.000Z"),
      });

      expect(snapshot.summary).toMatchObject({
        runtimeCount: 1,
        runningCount: 0,
        activeLeaseCount: 0,
        leaseRecoveryIssueCount: 1,
        repairedLeaseCount: 1,
        crashedLeaseCount: 1,
        restartBlockedCount: 0,
      });
      expect(snapshot.leaseRecovery).toMatchObject({
        schemaVersion: "ambient-local-runtime-lease-recovery-v1",
        issueCount: 1,
        repairedLeaseIds: ["lease-crashed-owner"],
        staleLeaseIds: [],
        crashedLeaseIds: ["lease-crashed-owner"],
        issues: [
          expect.objectContaining({
            source: "lease_journal",
            kind: "dead_runtime_crashed",
            leaseId: "lease-crashed-owner",
            repaired: true,
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
          }),
        ],
      });
      expect(snapshot.inventory.entries[0]).toMatchObject({
        id: "local-text:local-text-runtime:5001",
        running: false,
        owners: [],
        leaseState: {
          activeLeaseIds: [],
          staleLeaseIds: [],
          releasedLeaseIds: [],
          crashedLeaseIds: ["lease-crashed-owner"],
          inactiveLeaseIds: ["lease-crashed-owner"],
        },
        lifecycleDecision: {
          restart: expect.objectContaining({
            allowed: true,
            blockerLeaseIds: [],
          }),
          load: expect.objectContaining({
            allowed: true,
            blockerLeaseIds: [],
          }),
        },
      });
      await expect(readLocalModelRuntimeLeaseJournal(
        join(workspace, ".ambient/local-model-runtime"),
        "local-text-runtime",
      )).resolves.toEqual([
        expect.objectContaining({
          leaseId: "lease-crashed-owner",
          lastHeartbeatAt: "2026-06-05T00:01:00.000Z",
          status: "crashed",
        }),
      ]);
      const text = localModelRuntimeStatusText(snapshot);
      expect(text).toContain("Local model runtime status: 1 runtime; 0 running; 0 active leases; 1 crashed lease.");
      expect(text).toContain("Lease recovery: 1 repaired lease; 1 crashed lease.");
      expect(text).toContain("owner none; leases crashed lease-crashed-owner");
      expect(text).toContain("ordinary Restart allowed");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces untracked local runtimes without allowing ordinary Stop", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [
        {
          capability: "local-text",
          id: "untracked-llama:4401",
          pid: 4401,
          running: true,
          statePath: "/tmp/untracked-llama.json",
          trackingStatus: "untracked",
          modelId: "unknown-local-model",
          estimatedResidentMemoryBytes: 4 * gib,
        },
      ],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 0,
      stopBlockedCount: 1,
      untrackedCount: 1,
    });
    expect(snapshot.inventory.entries[0]?.stopDecision).toMatchObject({
      ordinaryStopAllowed: false,
      forceTerminationAllowed: false,
      untracked: true,
    });
    expect(snapshot.policyHandoff.nextSafeActions).toEqual([
      expect.objectContaining({
        action: "ask-user-to-stop-untracked",
        safety: "external",
        runtimeEntryId: "untracked-llama:4401",
        untracked: true,
      }),
    ]);
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("external ask-user-to-stop-untracked for untracked-llama:4401");
    expect(text).toContain("actions Stop disabled, Restart disabled, Start disabled, Unload disabled");
    expect(text).toContain("This local model process is untracked, so Ambient cannot assume it is safe to stop.");
  });

  it("discovers untracked llama.cpp processes for read-only Pi status", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentDetection: {
        processAlive: (pid) => pid === 4404,
        listProcesses: async () => [
          {
            pid: 4404,
            command: "/opt/llama.cpp/build/bin/llama-server",
            args: "/opt/llama.cpp/build/bin/llama-server --model /models/manual.gguf --port 44222 --ctx-size 4096",
          },
        ],
        processMemorySampler: async () => ({
          residentMemoryBytes: 2 * gib,
          sampledAt: "2026-06-05T00:00:00.000Z",
        }),
      },
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      stopBlockedCount: 1,
      untrackedCount: 1,
      activeActualResidentMemoryBytes: 2 * gib,
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "untracked-llama:4404",
      trackingStatus: "untracked",
      running: true,
      endpoint: "http://127.0.0.1:44222",
      modelId: "/models/manual.gguf",
      actualResidentMemoryBytes: 2 * gib,
      stopDecision: {
        ordinaryStopAllowed: false,
        forceTerminationAllowed: false,
        untracked: true,
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("untracked processes: 1");
    expect(text).toContain("untracked-llama:4404; running untracked; local text; model /models/manual.gguf");
    expect(text).toContain("actions Stop disabled, Restart disabled, Start disabled, Unload disabled");
    expect(text).toContain("Stop disabled: This local model process is untracked");
  });

  it("keeps requested launch memory in the registry policy snapshot", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        maxProjectedMemoryUtilization: 0.8,
        minFreeMemoryRatioAfterLaunch: 0.2,
        memoryLimitBehavior: "refuse",
      },
      residentProcesses: [
        {
          capability: "local-text",
          id: "local-text:local-text-runtime:5001",
          pid: 5001,
          running: true,
          statePath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime-state.json",
          providerId: "local",
          runtimeId: "local-text-runtime",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          estimatedResidentMemoryBytes: 5 * gib,
        },
      ],
      requestedLaunch: {
        capability: "local-deep-research",
        id: "local-deep-research:literesearcher-4b-q4:requested",
        modelId: "LiteResearcher-4B-Q4_K_M.gguf",
        profileId: "literesearcher-4b-q4",
        contextTokens: 8192,
        estimatedResidentMemoryBytes: 4 * gib,
      },
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-05T00:00:00.000Z",
        totalMemoryBytes: 16 * gib,
        freeMemoryBytes: 5 * gib,
        availableMemoryBytes: 5 * gib,
      },
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.registry.requestedLaunch).toMatchObject({
      capability: "local-deep-research",
      id: "local-deep-research:literesearcher-4b-q4:requested",
      estimatedResidentMemoryBytes: 4 * gib,
    });
    expect(snapshot.summary).toMatchObject({
      activeEstimatedResidentMemoryBytes: 5 * gib,
      memoryPolicyOutcome: "refuse",
    });
    expect(snapshot.registry.policyDecision).toMatchObject({
      requestedEstimatedResidentMemoryBytes: 4 * gib,
      activeEstimatedResidentMemoryBytes: 5 * gib,
      projectedEstimatedResidentMemoryBytes: 9 * gib,
      maxResidentMemoryBytes: 8 * gib,
      exceededByBytes: 1 * gib,
      projectedFreeMemoryBytes: 1 * gib,
      projectedFreeMemoryRatio: 0.0625,
      projectedSystemMemoryUtilization: 0.9375,
    });
    expect(snapshot.registry.hostMemory).toMatchObject({
      schemaVersion: "ambient-local-model-host-memory-v1",
      availableMemoryBytes: 5 * gib,
    });
  });

  it("surfaces local voice provider runtime state in shared inventory status", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      voiceProviders: [
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
          available: true,
          availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
          diagnostics: {
            healthStatus: "passed",
            missingHints: [],
            runtimeState: {
              schemaVersion: "ambient-voice-provider-runtime-state-v1",
              status: "running",
              running: true,
              modelRuntimeId: "piper-runtime",
              modelId: "rhasspy/piper/en_US-lessac-medium",
              pid: 5901,
              endpoint: "http://127.0.0.1:59201",
              estimatedResidentMemoryBytes: 2 * gib,
              actualResidentMemoryBytes: 1536 * 1024 * 1024,
              memorySampledAt: "2026-06-05T00:00:00.000Z",
            },
          },
        },
      ],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeEstimatedResidentMemoryBytes: 2 * gib,
      activeActualResidentMemoryBytes: 1536 * 1024 * 1024,
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "voice:piper-runtime",
      capability: "voice",
      providerId: "ambient-cli:piper:tool:piper_tts",
      modelRuntimeId: "piper-runtime",
      modelId: "rhasspy/piper/en_US-lessac-medium",
      running: true,
      pid: 5901,
      endpoint: "http://127.0.0.1:59201",
      estimatedResidentMemoryBytes: 2 * gib,
      actualResidentMemoryBytes: 1536 * 1024 * 1024,
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: false,
          reason: "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
        }),
        restart: expect.objectContaining({
          allowed: false,
          reason: "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Restart path for this row.",
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("voice:piper-runtime; running managed; voice");
    expect(text).toContain("model rhasspy/piper/en_US-lessac-medium");
    expect(text).toContain("actions Stop disabled, Restart disabled, Start disabled, Unload disabled");
    expect(text).toContain("Stop disabled: Voice runtimes require a provider-declared lifecycle command");
  });

  it("surfaces declared embedding runtime rows in shared inventory status", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      additionalEntries: [
        {
          capability: "embeddings",
          id: "embeddings:bge-runtime",
          providerId: "local-embeddings",
          runtimeId: "bge-runtime",
          modelId: "BAAI/bge-small-en-v1.5",
          running: true,
          pid: 7001,
          endpointUrl: "http://127.0.0.1:59301",
          estimatedResidentMemoryBytes: 1536 * 1024 * 1024,
          actualResidentMemoryBytes: 1280 * 1024 * 1024,
          memorySampledAt: "2026-06-05T00:00:00.000Z",
        },
      ],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeEstimatedResidentMemoryBytes: 1536 * 1024 * 1024,
      activeActualResidentMemoryBytes: 1280 * 1024 * 1024,
    });
    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "embeddings:bge-runtime",
      capability: "embeddings",
      providerId: "local-embeddings",
      modelRuntimeId: "bge-runtime",
      modelId: "BAAI/bge-small-en-v1.5",
      running: true,
      pid: 7001,
      endpoint: "http://127.0.0.1:59301",
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: false,
          reason: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("embeddings:bge-runtime; running managed; embeddings");
    expect(text).toContain("model BAAI/bge-small-en-v1.5");
    expect(text).toContain("memory actual 1.25 GiB / estimate 1.50 GiB");
    expect(text).toContain("Stop disabled: Embedding runtimes require a provider-declared lifecycle command");
  });

  it("surfaces discovered embedding provider runtime rows in shared inventory status", async () => {
    const providerLifecycle = {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-v1" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:embeddings",
      packageName: "ambient-bge-embeddings",
      start: {
        schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
        kind: "start" as const,
        providerKind: "ambient-cli" as const,
        packageId: "ambient-cli:embeddings",
        packageName: "ambient-bge-embeddings",
        command: "bge_start",
      },
      stop: {
        schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
        kind: "stop" as const,
        providerKind: "ambient-cli" as const,
        packageId: "ambient-cli:embeddings",
        packageName: "ambient-bge-embeddings",
        command: "bge_stop",
      },
      restart: {
        schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
        kind: "restart" as const,
        providerKind: "ambient-cli" as const,
        packageId: "ambient-cli:embeddings",
        packageName: "ambient-bge-embeddings",
        command: "bge_restart",
      },
    };
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      embeddingProviders: [
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
          providerLifecycle,
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
              providerLifecycle,
            },
          },
        },
      ],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "embeddings:bge-runtime",
      capability: "embeddings",
      providerId: "ambient-cli:embeddings:tool:bge_embeddings",
      modelRuntimeId: "bge-runtime",
      modelId: "BAAI/bge-small-en-v1.5",
      running: true,
      pid: 7001,
      endpoint: "http://127.0.0.1:59301",
      providerLifecycle,
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: true,
          reason: 'Embedding runtime has provider-declared Stop command "bge_stop".',
        }),
        restart: expect.objectContaining({
          allowed: true,
          reason: 'Embedding runtime has provider-declared Restart command "bge_restart".',
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("embeddings:bge-runtime; running managed; embeddings");
    expect(text).toContain("actions Stop allowed, Restart allowed, Start disabled, Unload disabled");
    expect(text).toContain('requires-approval stop-runtime for embeddings:bge-runtime');
    expect(text).toContain('Tool: ambient_local_model_runtime_stop {"runtimeId":"embeddings:bge-runtime","dryRun":true}.');
    expect(text).toContain("ordinary Stop allowed");
  });

  it("surfaces provider-declared voice lifecycle actions in shared inventory status", async () => {
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      voiceProviders: [
        {
          packageId: "ambient-cli:piper",
          packageName: "ambient-piper-runtime",
          command: "piper_tts",
          capabilityId: "ambient-cli:piper:tool:piper_tts",
          providerId: "ambient-cli:piper:tool:piper_tts",
          label: "Piper Runtime",
          format: "wav",
          formats: ["wav"],
          voices: [{ id: "default" }],
          local: true,
          installed: true,
          available: true,
          availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
          providerLifecycle: providerLifecycle(),
          diagnostics: {
            healthStatus: "passed",
            missingHints: [],
            runtimeState: {
              schemaVersion: "ambient-voice-provider-runtime-state-v1",
              status: "running",
              running: true,
              modelRuntimeId: "piper-runtime",
              modelId: "rhasspy/piper/en_US-lessac-medium",
              endpoint: "http://127.0.0.1:59201",
            },
          },
        },
      ],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.inventory.entries[0]).toMatchObject({
      id: "voice:piper-runtime",
      providerLifecycle: providerLifecycle(),
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: true,
          reason: 'Voice runtime has provider-declared Stop command "piper_stop".',
        }),
        restart: expect.objectContaining({
          allowed: true,
          reason: 'Voice runtime has provider-declared Restart command "piper_restart".',
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("voice:piper-runtime; running managed; voice");
    expect(text).toContain("actions Stop allowed, Restart allowed, Start disabled, Unload disabled");
    expect(text).toContain("ordinary Stop allowed");
    expect(text).toContain("ordinary Restart allowed");
  });

  it("names forced provider lifecycle ownership resolution by supported action", async () => {
    const lifecycle = providerLifecycle();
    const restartOnlyLifecycle = {
      schemaVersion: lifecycle.schemaVersion,
      providerKind: lifecycle.providerKind,
      packageId: lifecycle.packageId,
      packageName: lifecycle.packageName,
      restart: lifecycle.restart,
    };
    const snapshot = await buildLocalModelRuntimeStatusSnapshot({
      workspacePath: "/workspace",
      residentProcesses: [],
      voiceProviders: [
        {
          packageId: "ambient-cli:piper",
          packageName: "ambient-piper-runtime",
          command: "piper_tts",
          capabilityId: "ambient-cli:piper:tool:piper_tts",
          providerId: "ambient-cli:piper:tool:piper_tts",
          label: "Piper Runtime",
          format: "wav",
          formats: ["wav"],
          voices: [{ id: "default" }],
          local: true,
          installed: true,
          available: true,
          availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
          providerLifecycle: restartOnlyLifecycle,
          diagnostics: {
            healthStatus: "passed",
            missingHints: [],
            runtimeState: {
              schemaVersion: "ambient-voice-provider-runtime-state-v1",
              status: "running",
              running: true,
              modelRuntimeId: "piper-runtime",
              modelId: "rhasspy/piper/en_US-lessac-medium",
              endpoint: "http://127.0.0.1:59201",
            },
          },
        },
      ],
      leases: [voiceRuntimeLease()],
      now: () => new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(snapshot.inventory.entries[0]).toMatchObject({
      lifecycleDecision: {
        stop: expect.objectContaining({
          allowed: false,
          forceAllowed: false,
          forceRequiresSubagentCancellation: false,
          blockerLeaseIds: ["voice-lease"],
        }),
        restart: expect.objectContaining({
          allowed: false,
          forceAllowed: true,
          forceRequiresSubagentCancellation: true,
          blockerLeaseIds: ["voice-lease"],
        }),
      },
    });
    const text = localModelRuntimeStatusText(snapshot);
    expect(text).toContain("owner sub-agent Voice worker");
    expect(text).toContain("Stop disabled: In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command");
    expect(text).toContain("Restart disabled: In use by sub-agent Voice worker. Provider-declared Restart is blocked");
    expect(text).toContain("forced Restart requires sub-agent cancellation");
    expect(text).not.toContain("forced Stop/Restart requires sub-agent cancellation");
  });

  it("reports stopped managed local-text state as restartable inventory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-local-model-runtime-status-stopped-"));
    try {
      const stateDir = join(workspace, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        status: "stopped",
        command: ["/runtime/local-text", "serve", "--port", "43123"],
        cwd: workspace,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:10:00.000Z",
        stoppedAt: "2026-06-05T00:10:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * gib,
      }, null, 2)}\n`, "utf8");

      const snapshot = await buildLocalModelRuntimeStatusSnapshot({
        workspacePath: workspace,
        includeStopped: true,
        residentDetection: {
          processAlive: (pid) => pid === 5001,
          listProcesses: async () => [],
          sampleProcessMemory: false,
        },
        now: () => new Date("2026-06-05T00:11:00.000Z"),
      });

      expect(snapshot.summary).toMatchObject({
        runtimeCount: 1,
        runningCount: 0,
        activeLeaseCount: 0,
        activeEstimatedResidentMemoryBytes: 0,
      });
      expect(snapshot.inventory.entries[0]).toMatchObject({
        id: "local-text:local-text-runtime:5001",
        capability: "local-text",
        modelRuntimeId: "local-text-runtime",
        modelId: "local/text-4b",
        running: false,
        trackingStatus: "managed",
        lifecycleDecision: {
          stop: {
            allowed: false,
            reason: "Runtime is already stopped.",
          },
          restart: {
            allowed: true,
            reason: "No active sub-agent local runtime lease blocks ordinary Restart.",
          },
          load: {
            allowed: true,
            reason: "No active sub-agent local runtime lease blocks ordinary Load.",
          },
        },
      });
      const text = localModelRuntimeStatusText(snapshot);
      expect(text).toContain("Local model runtime status: 1 runtime; 0 running; 0 active leases.");
      expect(text).toContain("stopped managed; local text; model local/text-4b");
      expect(text).toContain("actions Stop disabled, Restart allowed, Start allowed, Unload disabled");
      expect(text).toContain("requires-approval start-runtime for local-text:local-text-runtime:5001");
      expect(text).toContain('Tool: ambient_local_model_runtime_start {"runtimeId":"local-text:local-text-runtime:5001","dryRun":true}.');
      expect(text).toContain("Stop disabled: Runtime is already stopped.");
      expect(text).toContain("ordinary Restart allowed");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-1",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    pid: 5001,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-05T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

function voiceRuntimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "voice-lease",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Voice worker",
    modelRuntimeId: "piper-runtime",
    modelId: "rhasspy/piper/en_US-lessac-medium",
    providerId: "ambient-cli:piper:tool:piper_tts",
    capabilityKind: "voice",
    estimatedResidentMemoryBytes: 512 * 1024 ** 2,
    endpoint: "http://127.0.0.1:59201",
    acquiredAt: "2026-06-05T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

function providerLifecycle() {
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1" as const,
    providerKind: "ambient-cli" as const,
    packageId: "ambient-cli:piper",
    packageName: "ambient-piper-runtime",
    start: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "start" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_start",
    },
    stop: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "stop" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_stop",
    },
    restart: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "restart" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_restart",
    },
  };
}
