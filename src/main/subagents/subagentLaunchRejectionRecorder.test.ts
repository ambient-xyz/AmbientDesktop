import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_DEFAULT_MODEL,
  createAmbientModelRuntimeSnapshotFromProfile,
  resolveAmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import { resolveSubagentModelScope } from "../model-provider/modelScopeResolver";
import {
  recordSubagentLaunchRejection,
  SUBAGENT_LAUNCH_REJECTION_RECORDER_SCHEMA_VERSION,
  type SubagentLaunchRejectionRecorderStore,
} from "./subagentLaunchRejectionRecorder";
import {
  resolveSubagentSpawnBlockDecision,
  type SubagentSpawnBlockedDecision,
} from "./subagentSpawnBlockDecision";
import type { SubagentToolScopeLaunchDenial } from "./subagentToolScopeLaunchPolicy";

describe("subagentLaunchRejectionRecorder", () => {
  it("records a visible failed child for tool-scope launch rejections", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const run = subagentRun({ capacityLease: capacityLease("reserved") });
    const toolScope = toolScopeSnapshot({
      approvalMode: "non_interactive",
      deniedTools: [
        {
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
        },
      ],
    });
    const decision = blockedDecision({
      capacityLease: run.capacityLeaseSnapshot,
      toolScopeSnapshot: toolScope,
      launchDenial: {
        schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
        kind: "requested_scope_denied",
        reason: "Pi-visible connector source requires a child-safe bridge.",
        explicitToolRequest: true,
        deniedCategoryIds: [],
        deniedToolIds: ["connector_app:gmail.search"],
      },
    });
    const store = fakeStore(run);

    const record = recordSubagentLaunchRejection({
      store,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      run,
      role,
      dependencyMode: "required",
      task: "Search Gmail from a child without a child-safe bridge.",
      toolCallId: "spawn-tool-scope",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope: resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL }),
      idempotencyKey: "spawn:tool-scope",
      spawnBlockDecision: decision,
      toolScopeSnapshot: toolScope,
      childWorktree: childWorktree(),
    });

    expect(SUBAGENT_LAUNCH_REJECTION_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-launch-rejection-recorder-v1");
    expect(store.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "child-thread",
      role: "system",
      content: expect.stringContaining("No child model session was started."),
      metadata: expect.objectContaining({
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "failed",
        subagentRunId: "child-run",
        canonicalTaskPath: "root/0:explorer",
      }),
    }));
    expect(record.spawnRejectedRunEvent).toMatchObject({
      runId: "child-run",
      type: "subagent.spawn_rejected",
      preview: {
        failureStage: "tool_scope",
        reason: "Pi-visible connector source requires a child-safe bridge.",
        approvalUnavailable: true,
        capacityLease: expect.objectContaining({ status: "reserved" }),
        childWorktree: expect.objectContaining({
          threadId: "child-thread",
          status: "active",
        }),
        toolScope: expect.objectContaining({
          approvalMode: "non_interactive",
          deniedTools: [
            expect.objectContaining({
              source: "connector_app",
              id: "gmail.search",
            }),
          ],
        }),
        phase: "phase-2-pi-tool-surface",
      },
    });
    expect(record.failedRun).toMatchObject({
      id: "child-run",
      childThreadId: "child-thread",
      status: "failed",
      resultArtifact: expect.objectContaining({
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-run",
        status: "failed",
        partial: false,
        childThreadId: "child-thread",
      }),
    });
    expect(record.spawnFailureParentMailbox).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.spawn_failed",
      idempotencyKey: "spawn:tool-scope",
      payload: expect.objectContaining({
        failureStage: "tool_scope",
        childRunId: "child-run",
        childThreadId: "child-thread",
        approvalUnavailable: true,
        resultArtifact: expect.objectContaining({
          runId: "child-run",
          status: "failed",
        }),
      }),
    });
  });

  it("preserves capacity blocking evidence when marking a reserved child failed", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const run = subagentRun({ capacityLease: capacityLease("blocked") });
    const toolScope = toolScopeSnapshot();
    const decision = blockedDecision({
      capacityLease: run.capacityLeaseSnapshot,
      toolScopeSnapshot: toolScope,
    });
    const store = fakeStore(run);

    const record = recordSubagentLaunchRejection({
      store,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      parentThread: { id: "parent-thread" },
      parentRun: { id: "parent-run" },
      run,
      role,
      dependencyMode: "required",
      task: "Launch another child.",
      toolCallId: "spawn-capacity",
      requestedRoleId: "explorer",
      roleId: "explorer",
      modelScope: resolveSubagentModelScope({ role, parentModelId: AMBIENT_DEFAULT_MODEL }),
      idempotencyKey: "spawn:capacity",
      spawnBlockDecision: decision,
      toolScopeSnapshot: toolScope,
    });

    expect(record.spawnRejectedRunEvent.preview).toMatchObject({
      failureStage: "capacity",
      approvalUnavailable: false,
      capacityLease: {
        status: "blocked",
        blockingReasons: [
          "Provider ambient would exceed its sub-agent concurrency limit (2/1).",
        ],
      },
      childWorktree: null,
    });
    expect(record.spawnFailureParentMailbox.payload).toMatchObject({
      failureStage: "capacity",
      capacityLease: expect.objectContaining({
        status: "blocked",
        blockingReasons: [
          "Provider ambient would exceed its sub-agent concurrency limit (2/1).",
        ],
      }),
      approvalUnavailable: false,
    });
  });
});

function fakeStore(run: SubagentRunSummary): SubagentLaunchRejectionRecorderStore & {
  addMessage: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
  markSubagentRunStatus: ReturnType<typeof vi.fn>;
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
} {
  const addMessage = vi.fn();
  const appendSubagentRunEvent = vi.fn((runId: string, input): SubagentRunEventSummary => ({
    runId,
    sequence: appendSubagentRunEvent.mock.calls.length,
    type: input.type,
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    ...(input.preview !== undefined ? { preview: input.preview } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
  }));
  const markSubagentRunStatus = vi.fn((runId, status, options): SubagentRunSummary => ({
    ...run,
    id: runId,
    status,
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(options?.resultArtifact ? { resultArtifact: options.resultArtifact } : {}),
  }));
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

  return {
    addMessage,
    appendSubagentRunEvent,
    markSubagentRunStatus,
    appendSubagentParentMailboxEvent,
  };
}

function subagentRun(input: { capacityLease: SubagentCapacityLeaseSnapshot }): SubagentRunSummary {
  const model = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
  const role = getDefaultSubagentRoleProfile("explorer");
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "reserved",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(
      AMBIENT_DEFAULT_MODEL,
      model,
      "2026-06-06T00:00:00.000Z",
    ),
    capacityLeaseSnapshot: input.capacityLease,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
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

function blockedDecision(input: {
  capacityLease: SubagentCapacityLeaseSnapshot;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  launchDenial?: SubagentToolScopeLaunchDenial;
}): SubagentSpawnBlockedDecision {
  const decision = resolveSubagentSpawnBlockDecision(input);
  if (!decision.blocked) throw new Error("Expected blocked decision.");
  return decision;
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
