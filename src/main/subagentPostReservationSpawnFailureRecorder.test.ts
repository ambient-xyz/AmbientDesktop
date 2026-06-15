import { describe, expect, it, vi } from "vitest";

import { AMBIENT_DEFAULT_MODEL, resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";
import type { SubagentCapacityLeaseSnapshot } from "../shared/subagentCapacity";
import { resolveSubagentCapacityLease } from "../shared/subagentCapacity";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  ThreadWorktreeSummary,
} from "../shared/types";
import { resolveSubagentModelScope } from "./modelScopeResolver";
import {
  recordSubagentPostReservationSpawnFailure,
  SUBAGENT_POST_RESERVATION_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION,
  type SubagentPostReservationSpawnFailureRecorderStore,
} from "./subagentPostReservationSpawnFailureRecorder";

describe("subagentPostReservationSpawnFailureRecorder", () => {
  it("appends visible failed-child evidence for tool-scope launch blocks", () => {
    const store = fakeStore();
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL });
    const event = recordSubagentPostReservationSpawnFailure({
      store,
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      phase: "phase-2-pi-tool-surface",
      run: failedRun(),
      toolCallId: "spawn-tool-scope",
      task: "Use a connector without a child bridge.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      idempotencyKey: "spawn:tool-scope",
      failureStage: "tool_scope",
      reason: "Pi-visible connector source requires a child-safe bridge.",
      capacityLease: capacityLease("reserved"),
      toolScopeSnapshot: toolScopeSnapshot({
        approvalMode: "non_interactive",
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Capability requires interactive approval, but this launch is non-interactive.",
          },
        ],
      }),
      childWorktree: childWorktree(),
      approvalUnavailable: true,
    });

    expect(SUBAGENT_POST_RESERVATION_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-post-reservation-spawn-failure-recorder-v1");
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.spawn_failed",
      deliveryState: "queued",
      idempotencyKey: "spawn:tool-scope",
      payload: {
        schemaVersion: "ambient-subagent-spawn-failure-v1",
        phase: "phase-2-pi-tool-surface",
        failureStage: "tool_scope",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        toolCallId: "spawn-tool-scope",
        idempotencyKey: "spawn:tool-scope",
        requestedRoleId: "explorer",
        roleId: "explorer",
        status: "failed",
        approvalMode: "non_interactive",
        approvalUnavailable: true,
        childWorktree: {
          threadId: "child-thread",
          status: "active",
          worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
        },
        toolScopeSnapshot: expect.objectContaining({
          approvalMode: "non_interactive",
          deniedTools: [
            expect.objectContaining({
              source: "connector_app",
              id: "gmail.search",
              categoryId: "connector.read",
            }),
          ],
        }),
        resultArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: "child-run",
          status: "failed",
          partial: false,
          childThreadId: "child-thread",
          summary: expect.stringContaining("Sub-agent launch failed before model execution"),
        }),
      },
    });
  });

  it("appends capacity failures without deleting reserved child evidence", () => {
    const store = fakeStore();
    const role = getDefaultSubagentRoleProfile("explorer");
    const modelScope = resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL });
    const event = recordSubagentPostReservationSpawnFailure({
      store,
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run" },
      phase: "phase-2-pi-tool-surface",
      run: failedRun(),
      toolCallId: "spawn-capacity",
      task: "Launch another child.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope,
      idempotencyKey: "spawn:capacity",
      failureStage: "capacity",
      reason: "Provider ambient would exceed its sub-agent concurrency limit.",
      capacityLease: capacityLease("blocked"),
      toolScopeSnapshot: toolScopeSnapshot(),
      approvalUnavailable: false,
    });

    expect(event.payload).toMatchObject({
      failureStage: "capacity",
      childRunId: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      capacityLease: {
        schemaVersion: "ambient-subagent-capacity-lease-v1",
        status: "blocked",
        blockingReasons: [
          "Provider ambient would exceed its sub-agent concurrency limit (2/1).",
        ],
      },
      approvalMode: "interactive",
      approvalUnavailable: false,
      resultArtifact: expect.objectContaining({
        runId: "child-run",
        status: "failed",
        childThreadId: "child-thread",
      }),
    });
  });
});

function fakeStore(): SubagentPostReservationSpawnFailureRecorderStore & {
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
} {
  const appendSubagentParentMailboxEvent = vi.fn((input): SubagentParentMailboxEventSummary => ({
    id: `parent-mailbox-${appendSubagentParentMailboxEvent.mock.calls.length}`,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  }));
  return { appendSubagentParentMailboxEvent };
}

function failedRun(): Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status"> {
  return {
    id: "child-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    status: "failed",
  };
}

function capacityLease(status: SubagentCapacityLeaseSnapshot["status"]): SubagentCapacityLeaseSnapshot {
  const model = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
  return resolveSubagentCapacityLease({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    model,
    ...(status === "blocked" ? {
      providerConcurrencyLimit: 1,
      existingRuns: [
        {
          id: "open-run",
          status: "running",
          modelRuntimeSnapshot: {
            profile: {
              providerId: model.providerId,
              modelId: model.modelId,
            },
          },
        },
      ],
    } : {}),
    now: "2026-06-06T00:00:00.000Z",
  });
}

function childWorktree(): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
    branchName: "ambient/child-thread",
    baseRef: "abc123",
    status: "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function toolScopeSnapshot(
  scopeOverrides: Partial<SubagentToolScopeSnapshotSummary["scope"]> = {},
): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-06T00:00:00.000Z",
    resolverInputs: {
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
    },
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
      ...scopeOverrides,
    },
  };
}
