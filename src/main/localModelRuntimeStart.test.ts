import { describe, expect, it } from "vitest";
import type {
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeLeaseRecord,
} from "../shared/types";
import { buildLocalRuntimeInventory } from "./localRuntimeInventory";
import {
  localModelRuntimeStartText,
  localModelRuntimeStartToolResult,
  planLocalModelRuntimeStart,
} from "./localModelRuntimeStart";

const gib = 1024 ** 3;

describe("local model runtime start", () => {
  it("plans ordinary Start for a stopped managed local-text runtime", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({ running: false })]),
      leases: [],
    });
    const plan = planLocalModelRuntimeStart({
      inventory,
      request: { runtimeId: "local-text-runtime" },
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-local-model-runtime-start-plan-v1",
      status: "ready",
      runtimeId: "local-text-runtime",
      dryRun: false,
      reason: "Local runtime local-text-runtime can be started by ordinary Start.",
      entry: expect.objectContaining({
        modelRuntimeId: "local-text-runtime",
        lifecycleDecision: expect.objectContaining({
          load: expect.objectContaining({ allowed: true }),
        }),
      }),
    });

    const result = localModelRuntimeStartToolResult({
      plan,
      startResult: {
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "started",
        runtimeId: "local-text-runtime",
        previousPid: 5001,
        pid: 5002,
        startedAt: "2026-06-06T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({
      status: "started",
      runtimeId: "local-text-runtime",
      reason: "Managed local runtime process was launched from persisted runtime state.",
    });
    const text = localModelRuntimeStartText(result);
    expect(text).toContain("Local model runtime started: local-text-runtime.");
    expect(text).toContain("Runtime memory: estimate 6.00 GiB.");
    expect(text).toContain("projected utilization 75% / ceiling 80%");
    expect(text).toContain("projected free 4.00 GiB (25%) / floor 20%");
    expect(text).toContain("Previous PID: 5001.");
    expect(text).toContain("PID: 5002.");
  });

  it("returns ready without manager side effects for dryRun", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({ running: false })]),
      leases: [],
    });
    const plan = planLocalModelRuntimeStart({
      inventory,
      request: { runtimeId: "local-text-runtime", dryRun: true },
    });
    const result = localModelRuntimeStartToolResult({ plan });

    expect(result).toMatchObject({
      status: "ready",
      runtimeId: "local-text-runtime",
      dryRun: true,
      reason: "Local runtime local-text-runtime can be started; dryRun requested no process changes.",
    });
  });

  it("blocks Start when the target load violates local memory policy", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: {
        ...registry([entry({ running: false })]),
        requestedLaunch: {
          capability: "local-text",
          id: "local-runtime-lifecycle:start:local-text:local-text-runtime:5001",
          modelId: "local/text-4b",
          profileId: "local-text-4b-q4",
          estimatedResidentMemoryBytes: 6 * gib,
        },
        policyDecision: {
          outcome: "refuse",
          reason: "Projected local-model launch is over policy: projected free memory would fall below the 20% floor. Refusing launch.",
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
    const result = localModelRuntimeStartToolResult({
      plan: planLocalModelRuntimeStart({
        inventory,
        request: { runtimeId: "local-text-runtime" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "Local runtime Start is blocked by local model memory policy: Projected local-model launch is over policy: projected free memory would fall below the 20% floor. Refusing launch.",
      memoryPolicy: expect.objectContaining({
        outcome: "refuse",
        requestedEstimatedResidentMemoryBytes: 6 * gib,
      }),
    });
    expect(localModelRuntimeStartText(result)).toContain("Memory policy: refuse");
  });

  it("blocks running managed runtimes because Load is already satisfied", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [],
    });
    const result = localModelRuntimeStartToolResult({
      plan: planLocalModelRuntimeStart({
        inventory,
        request: { runtimeId: "local-text-runtime" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "Runtime is already running.",
    });
  });

  it("blocks active sub-agent leases and reports the load decision reason", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({ running: false })]),
      leases: [runtimeLease()],
    });
    const result = localModelRuntimeStartToolResult({
      plan: planLocalModelRuntimeStart({
        inventory,
        request: { runtimeId: "local-text-runtime" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      runtimeId: "local-text-runtime",
      reason: "In use by sub-agent Review worker.",
      entry: expect.objectContaining({
        owners: [
          expect.objectContaining({ displayName: "sub-agent Review worker" }),
        ],
      }),
    });
    expect(localModelRuntimeStartText(result)).toContain("Owners: sub-agent Review worker.");
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
    const result = localModelRuntimeStartToolResult({
      plan: planLocalModelRuntimeStart({
        inventory,
        request: { runtimeId: "untracked-llama:4401" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "This local model process is untracked, so Ambient cannot assume it is safe to load.",
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
    activeEstimatedResidentMemoryBytes: entries
      .filter((candidate) => candidate.running)
      .reduce((sum, candidate) => sum + (candidate.estimatedResidentMemoryBytes ?? 0), 0),
    policyDecision: {
      outcome: "within-limit",
      reason: "Projected local-model lifecycle action stays within the 80% utilization ceiling and 20% free-memory floor.",
      activeEstimatedResidentMemoryBytes: 0,
      projectedEstimatedResidentMemoryBytes: 0,
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

function runtimeLease(): LocalRuntimeLeaseRecord {
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
  };
}
