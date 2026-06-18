import { describe, expect, it } from "vitest";
import {
  AMBIENT_MODEL_RUNTIME_PROFILES,
  createAmbientModelRuntimeSnapshotFromProfile,
} from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentRunStatus } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION,
} from "./subagentBatchJobs";
import {
  childRunAttributionRequired,
  createSubagentObservabilityEvent,
  summarizeSubagentObservability,
  validateSubagentObservabilityEventAttribution,
} from "./subagentObservability";

describe("subagentObservability", () => {
  it("requires child attribution for child-scoped observability events", () => {
    expect(childRunAttributionRequired({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.status_changed",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toBe(true);
    expect(childRunAttributionRequired({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.spawn_attempt",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toBe(false);
    expect(validateSubagentObservabilityEventAttribution({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.tool_denied",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toEqual([
      {
        id: "child-run-attribution",
        eventType: "subagent.tool_denied",
        message: "Sub-agent observability event subagent.tool_denied must identify the originating child run.",
      },
    ]);
    expect(() => createSubagentObservabilityEvent({
      type: "subagent.status_changed",
      status: "running",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toThrow("must identify the originating child run");
    expect(createSubagentObservabilityEvent({
      type: "subagent.spawn_attempt",
      parentRunId: "parent-run",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-observability-v1",
      type: "subagent.spawn_attempt",
      parentRunId: "parent-run",
      createdAt: "2026-06-06T00:00:00.000Z",
    });
  });

  it("summarizes spawn, wait, usage, memory, idle, batch, and restart observability", () => {
    const summary = summarizeSubagentObservability({
      createdAt: "2026-06-06T00:00:05.000Z",
      runs: [
        run({ id: "child-running", status: "running", updatedAt: "2026-06-06T00:00:00.000Z" }),
        run({ id: "child-failed", status: "failed", updatedAt: "2026-06-06T00:00:01.000Z" }),
        run({ id: "child-attention", status: "needs_attention", updatedAt: "2026-06-06T00:00:02.000Z" }),
      ],
      runEvents: [
        runEvent("child-running", 1, "subagent.reserved"),
        runEvent("child-failed", 2, "subagent.spawn_failed"),
        runEvent("child-running", 3, "subagent.runtime_event", {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          runId: "child-running",
          parentRunId: "parent-run",
          childThreadId: "thread-child-running",
          tokenCount: 120,
          costMicros: 3400,
          localMemoryBytes: 4096,
        }),
        runEvent("child-running", 4, "subagent.child_runtime_aborted"),
        runEvent("child-attention", 5, "subagent.needs_attention"),
        runEvent("child-running", 6, "subagent.restart_reconciled"),
      ],
      waitBarriers: [
        waitBarrier({ resolvedAt: "2026-06-06T00:00:02.000Z" }),
      ],
      parentMailboxEvents: [
        parentMailboxEvent("grouped", "subagent.grouped_completion", { childRunIds: ["child-running"] }),
        parentMailboxEvent("cancel", "subagent.cancellation_cascade", { cancelledRunIds: ["child-failed"] }),
        parentMailboxEvent("restart", "subagent.parent_control_reconciled", { childRunId: "child-running" }),
        batchProgressEvent("batch-old", "2026-06-06T00:00:01.000Z", { acceptedReportCount: 1, pendingCount: 1 }),
        batchProgressEvent("batch-new", "2026-06-06T00:00:03.000Z", { acceptedReportCount: 2, pendingCount: 0 }),
      ],
      toolScopeSnapshots: [toolScopeSnapshot()],
    });

    expect(summary).toMatchObject({
      schemaVersion: "ambient-subagent-observability-summary-v1",
      spawnAttempts: 3,
      failedSpawns: 2,
      waitDurations: {
        count: 1,
        totalMs: 2000,
        maxMs: 2000,
      },
      cancellationCascades: 1,
      childRuntimeAborts: 1,
      toolDenials: {
        count: 2,
        byCategory: {
          "connector.read": 1,
          "workspace.write": 1,
        },
      },
      usage: {
        tokenCount: 120,
        costMicros: 3400,
      },
      localMemory: {
        eventCount: 1,
        peakBytes: 4096,
      },
      childIdle: {
        openRunCount: 2,
        totalMs: 8000,
        maxMs: 5000,
      },
      groupedCompletions: 1,
      batchProgress: {
        notificationCount: 2,
        jobCount: 1,
        itemCount: 2,
        acceptedReportCount: 2,
        pendingItemCount: 0,
        completedJobCount: 1,
      },
      needsAttentionRequests: 1,
      restartReconciliations: 2,
      statusCounts: {
        running: 1,
        failed: 1,
        needs_attention: 1,
      },
    });
  });
});

function run(input: {
  id: string;
  status: SubagentRunStatus;
  updatedAt: string;
}): SubagentRunSummary {
  const model = AMBIENT_MODEL_RUNTIME_PROFILES[0];
  return {
    id: input.id,
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: `thread-${input.id}`,
    canonicalTaskPath: `parent/${input.id}`,
    roleId: "explorer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: input.status,
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-06T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(model.modelId, model, "2026-06-06T00:00:00.000Z"),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: `parent/${input.id}`,
      roleId: "explorer",
      model,
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: input.updatedAt,
  };
}

function runEvent(runId: string, sequence: number, type: string, preview?: unknown): SubagentRunEventSummary {
  return {
    runId,
    sequence,
    type,
    createdAt: "2026-06-06T00:00:00.000Z",
    ...(preview !== undefined ? { preview } : {}),
  };
}

function waitBarrier(input: { resolvedAt?: string }): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-running"],
    dependencyMode: "required_all",
    status: "satisfied",
    failurePolicy: "fail_parent",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:02.000Z",
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
  };
}

function parentMailboxEvent(id: string, type: string, payload: unknown): SubagentParentMailboxEventSummary {
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    type,
    payload,
    deliveryState: "delivered",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function batchProgressEvent(
  id: string,
  updatedAt: string,
  input: { acceptedReportCount: number; pendingCount: number },
): SubagentParentMailboxEventSummary {
  return {
    ...parentMailboxEvent(id, SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE, {
      schemaVersion: SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_SCHEMA_VERSION,
      summary: {
        schemaVersion: SUBAGENT_BATCH_PROGRESS_SCHEMA_VERSION,
        jobId: "batch-job",
        itemCount: 2,
        acceptedReportCount: input.acceptedReportCount,
        pendingCount: input.pendingCount,
      },
    }),
    updatedAt,
  };
}

function toolScopeSnapshot(): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-running",
    sequence: 1,
    createdAt: "2026-06-06T00:00:00.000Z",
    resolverInputs: {},
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [
        { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
        { id: "workspace.write", reason: "Mutating child requires an approved isolated worktree." },
      ],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "non_interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}
