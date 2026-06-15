import { describe, expect, it } from "vitest";
import type {
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeLeaseRecord,
} from "../shared/types";
import { buildLocalRuntimeInventory } from "./localRuntimeInventory";
import {
  localModelRuntimeStopText,
  localModelRuntimeStopToolResult,
  planLocalModelRuntimeStop,
} from "./localModelRuntimeStop";

const gib = 1024 ** 3;

describe("local model runtime stop", () => {
  it("plans ordinary Stop for a managed local-text runtime without active leases", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [],
    });
    const plan = planLocalModelRuntimeStop({
      inventory,
      request: { runtimeId: "local-text-runtime" },
    });

    expect(plan).toMatchObject({
      schemaVersion: "ambient-local-model-runtime-stop-plan-v1",
      status: "ready",
      runtimeId: "local-text-runtime",
      forceRequested: false,
      dryRun: false,
      reason: "Local runtime local-text-runtime can be stopped by ordinary Stop.",
      entry: expect.objectContaining({
        modelRuntimeId: "local-text-runtime",
        stopDecision: expect.objectContaining({ ordinaryStopAllowed: true }),
      }),
    });

    const result = localModelRuntimeStopToolResult({
      plan,
      stopResult: {
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        pid: 5001,
        stoppedAt: "2026-06-06T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({
      status: "stopped",
      runtimeId: "local-text-runtime",
      reason: "Managed local runtime process was stopped and its runtime state was marked stopped.",
    });
    const text = localModelRuntimeStopText(result);
    expect(text).toContain("Local model runtime stopped: local-text-runtime.");
    expect(text).toContain("Runtime memory: estimate 6.00 GiB.");
    expect(text).toContain("projected utilization 75% / ceiling 80%");
    expect(text).toContain("projected free 4.00 GiB (25%) / floor 20%");
  });

  it("returns ready without manager side effects for dryRun", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [],
    });
    const plan = planLocalModelRuntimeStop({
      inventory,
      request: { runtimeId: "local-text-runtime", dryRun: true },
    });
    const result = localModelRuntimeStopToolResult({ plan });

    expect(result).toMatchObject({
      status: "ready",
      runtimeId: "local-text-runtime",
      dryRun: true,
      reason: "Local runtime local-text-runtime can be stopped; dryRun requested no process changes.",
    });
  });

  it("blocks active sub-agent leases and explains force requirements", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [runtimeLease()],
    });
    const plan = planLocalModelRuntimeStop({
      inventory,
      request: { runtimeId: "local-text-runtime", force: true },
    });
    const result = localModelRuntimeStopToolResult({ plan });

    expect(result).toMatchObject({
      status: "blocked",
      runtimeId: "local-text-runtime",
      forceRequested: true,
      reason: "In use by sub-agent Review worker. Forced termination requires explicit cancellation or failure marking for the owning sub-agent before Ambient stops its model.",
      entry: expect.objectContaining({
        owners: [
          expect.objectContaining({ displayName: "sub-agent Review worker" }),
        ],
      }),
    });
    expect(localModelRuntimeStopText(result)).toContain("Owners: sub-agent Review worker.");
  });

  it("blocks malformed active owner leases without offering forced Stop", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [runtimeLease({
        leaseId: "lease-missing-child-thread",
        subagentThreadId: undefined,
        subagentRunId: undefined,
      })],
    });
    const plan = planLocalModelRuntimeStop({
      inventory,
      request: { runtimeId: "local-text-runtime", force: true },
    });
    const result = localModelRuntimeStopToolResult({ plan });

    expect(result).toMatchObject({
      status: "blocked",
      runtimeId: "local-text-runtime",
      forceRequested: true,
      reason: "In use by Review worker. Lease lease-missing-child-thread is missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.",
      entry: expect.objectContaining({
        stopDecision: expect.objectContaining({
          blockerLeaseIds: ["lease-missing-child-thread"],
          affectedSubagents: [],
          forceTerminationAllowed: false,
          forceRequiresSubagentCancellation: false,
        }),
      }),
    });
    expect(localModelRuntimeStopText(result)).toContain("Owners: Review worker.");
  });

  it("does not block ordinary Stop on stale sub-agent leases when inventory applies freshness", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry()]),
      leases: [runtimeLease({
        lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
      })],
      capturedAt: "2026-06-06T00:10:00.000Z",
      leaseStaleMs: 5 * 60_000,
    });
    const plan = planLocalModelRuntimeStop({
      inventory,
      request: { runtimeId: "local-text-runtime" },
    });

    expect(plan).toMatchObject({
      status: "ready",
      reason: "Local runtime local-text-runtime can be stopped by ordinary Stop.",
      entry: expect.objectContaining({
        owners: [],
        stopDecision: expect.objectContaining({
          ordinaryStopAllowed: true,
          blockerLeaseIds: [],
        }),
      }),
    });
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
    const result = localModelRuntimeStopToolResult({
      plan: planLocalModelRuntimeStop({
        inventory,
        request: { runtimeId: "untracked-llama:4401" },
      }),
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
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
    lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
    status: "running",
    ...overrides,
  };
}
