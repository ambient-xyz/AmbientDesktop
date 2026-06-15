import { describe, expect, it } from "vitest";
import type {
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeLeaseRecord,
} from "../shared/types";
import { buildLocalRuntimeInventory } from "./localRuntimeInventory";
import {
  localModelRuntimeRestartText,
  localModelRuntimeRestartToolResult,
  planLocalModelRuntimeRestart,
} from "./localModelRuntimeRestart";

const gib = 1024 ** 3;

describe("local model runtime restart", () => {
  it("plans ordinary Restart for a managed local-text runtime without active leases", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [],
    });
    const plan = planLocalModelRuntimeRestart({
      inventory,
      request: { runtimeId: "local-text-runtime" },
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-local-model-runtime-restart-plan-v1",
      status: "ready",
      runtimeId: "local-text-runtime",
      forceRequested: false,
      dryRun: false,
      reason: "Local runtime local-text-runtime can be restarted by ordinary Restart.",
      entry: expect.objectContaining({
        modelRuntimeId: "local-text-runtime",
        stopDecision: expect.objectContaining({ ordinaryStopAllowed: true }),
      }),
    });

    const result = localModelRuntimeRestartToolResult({
      plan,
      restartResult: {
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "restarted",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        previousPid: 5001,
        pid: 5002,
        restartedAt: "2026-06-06T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({
      status: "restarted",
      runtimeId: "local-text-runtime",
      reason: "Managed local runtime process was stopped, relaunched, and its runtime state was refreshed.",
    });
    const text = localModelRuntimeRestartText(result);
    expect(text).toContain("Local model runtime restarted: local-text-runtime.");
    expect(text).toContain("Runtime memory: estimate 6.00 GiB.");
    expect(text).toContain("projected utilization 75% / ceiling 80%");
    expect(text).toContain("projected free 4.00 GiB (25%) / floor 20%");
  });

  it("returns ready without manager side effects for dryRun", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [],
    });
    const plan = planLocalModelRuntimeRestart({
      inventory,
      request: { runtimeId: "local-text-runtime", dryRun: true },
    });
    const result = localModelRuntimeRestartToolResult({ plan });

    expect(result).toMatchObject({
      status: "ready",
      runtimeId: "local-text-runtime",
      dryRun: true,
      reason: "Local runtime local-text-runtime can be restarted; dryRun requested no process changes.",
    });
  });

  it("blocks Restart when reloading a stopped runtime violates local memory policy", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: {
        ...registry([entry({ running: false })]),
        requestedLaunch: {
          capability: "local-text",
          id: "local-runtime-lifecycle:restart:local-text:local-text-runtime:5001",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          estimatedResidentMemoryBytes: 6 * gib,
        },
        policyDecision: {
          outcome: "ask-to-exceed",
          reason: "Projected local-model launch is over policy: projected system memory utilization would reach 90%, above the 80% ceiling. User approval is required to exceed it.",
          requestedEstimatedResidentMemoryBytes: 6 * gib,
          activeEstimatedResidentMemoryBytes: 0,
          projectedEstimatedResidentMemoryBytes: 6 * gib,
          projectedResidentMemoryBytes: 6 * gib,
          projectedSystemMemoryUtilization: 0.9,
          maxProjectedMemoryUtilization: 0.8,
          projectedFreeMemoryBytes: 2 * gib,
          projectedFreeMemoryRatio: 0.1,
          minFreeMemoryRatioAfterLaunch: 0.2,
          unloadCandidateIds: [],
        },
      },
      leases: [],
    });
    const result = localModelRuntimeRestartToolResult({
      plan: planLocalModelRuntimeRestart({
        inventory,
        request: { runtimeId: "local-text-runtime" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "Local runtime Restart is blocked by local model memory policy: Projected local-model launch is over policy: projected system memory utilization would reach 90%, above the 80% ceiling. User approval is required to exceed it.",
      memoryPolicy: expect.objectContaining({
        outcome: "ask-to-exceed",
        requestedEstimatedResidentMemoryBytes: 6 * gib,
      }),
    });
    expect(localModelRuntimeRestartText(result)).toContain("Memory policy: ask-to-exceed");
  });

  it("blocks active sub-agent leases and explains force requirements", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [runtimeLease()],
    });
    const plan = planLocalModelRuntimeRestart({
      inventory,
      request: { runtimeId: "local-text-runtime", force: true },
    });
    const result = localModelRuntimeRestartToolResult({ plan });

    expect(result).toMatchObject({
      status: "blocked",
      runtimeId: "local-text-runtime",
      forceRequested: true,
      reason: "In use by sub-agent Review worker. Forced restart requires explicit cancellation or failure marking for the owning sub-agent before Ambient restarts its model.",
      entry: expect.objectContaining({
        owners: [
          expect.objectContaining({ displayName: "sub-agent Review worker" }),
        ],
      }),
    });
    expect(localModelRuntimeRestartText(result)).toContain("Owners: sub-agent Review worker.");
  });

  it("blocks malformed active owner leases without offering forced Restart", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [runtimeLease({
        leaseId: "lease-missing-child-thread",
        subagentThreadId: undefined,
        subagentRunId: undefined,
      })],
    });
    const plan = planLocalModelRuntimeRestart({
      inventory,
      request: { runtimeId: "local-text-runtime", force: true },
    });
    const result = localModelRuntimeRestartToolResult({ plan });

    expect(result).toMatchObject({
      status: "blocked",
      runtimeId: "local-text-runtime",
      forceRequested: true,
      reason: "In use by Review worker. Lease lease-missing-child-thread is missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.",
      entry: expect.objectContaining({
        lifecycleDecision: expect.objectContaining({
          restart: expect.objectContaining({
            blockerLeaseIds: ["lease-missing-child-thread"],
            affectedSubagents: [],
            forceAllowed: false,
            forceRequiresSubagentCancellation: false,
          }),
        }),
      }),
    });
    expect(localModelRuntimeRestartText(result)).toContain("Owners: Review worker.");
  });

  it("blocks untracked local model processes", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "untracked-llama:4401",
        trackingStatus: "untracked",
        modelId: "unknown-local-model",
      })]),
      leases: [],
    });
    const result = localModelRuntimeRestartToolResult({
      plan: planLocalModelRuntimeRestart({
        inventory,
        request: { runtimeId: "untracked-llama:4401" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "This local model process is untracked, so Ambient cannot assume it is safe to restart.",
    });
  });
});

function registry(entries: LocalModelResourceRegistryEntry[]): LocalModelResourceRegistrySnapshot {
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: "2026-06-06T00:00:00.000Z",
    settings: {
      schemaVersion: "ambient-local-model-resource-settings-v1",
      memoryLimitBehavior: "warn",
    },
    entries,
    activeCount: entries.filter((candidate) => candidate.running).length,
    activeEstimatedResidentMemoryBytes: entries.reduce((sum, candidate) => sum + (candidate.estimatedResidentMemoryBytes ?? 0), 0),
    policyDecision: {
      outcome: "within-limit",
      reason: "Projected local-model lifecycle action stays within the 80% utilization ceiling and 20% free-memory floor.",
      activeEstimatedResidentMemoryBytes: entries.reduce((sum, candidate) => sum + (candidate.estimatedResidentMemoryBytes ?? 0), 0),
      projectedEstimatedResidentMemoryBytes: entries.reduce((sum, candidate) => sum + (candidate.estimatedResidentMemoryBytes ?? 0), 0),
      projectedSystemMemoryUtilization: 0.75,
      maxProjectedMemoryUtilization: 0.8,
      projectedFreeMemoryBytes: 4 * gib,
      projectedFreeMemoryRatio: 0.25,
      minFreeMemoryRatioAfterLaunch: 0.2,
      comfortableFreeMemoryRatio: 0.4,
      unloadCandidateIds: [],
    },
  };
}

function entry(overrides: Partial<LocalModelResourceRegistryEntry> = {}): LocalModelResourceRegistryEntry {
  return {
    capability: "local-text",
    id: "local-text:local-text-runtime:5001",
    pid: 5001,
    running: true,
    statePath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime-state.json",
    providerId: "local",
    runtimeId: "local-text-runtime",
    trackingStatus: "managed",
    endpointUrl: "http://127.0.0.1:43123/health",
    modelId: "local/text-4b",
    profileId: "local-text-4b-q4",
    estimatedResidentMemoryBytes: 6 * gib,
    ...overrides,
  };
}

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    pid: 5001,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-06T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-06T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}
