import type { SubagentDependencyMode } from "../shared/subagentProtocol";
import type { SubagentRoleId, SubagentRoleProfile } from "../shared/subagentRoles";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../shared/types";
import type { SubagentModelScopeResolution } from "./modelScopeResolver";
import { compactSubagentCapacityLeaseForPi } from "./subagentAgentStatus";
import {
  buildSubagentChildLaunchBlockedMessage,
  buildSubagentSpawnBlockedResultArtifact,
  compactSubagentThreadWorktreeForPi,
} from "./subagentSpawnFailure";
import { recordSubagentPostReservationSpawnFailure } from "./subagentPostReservationSpawnFailureRecorder";
import type {
  SubagentSpawnBlockedDecision,
} from "./subagentSpawnBlockDecision";
import { compactSubagentToolScopeSnapshot } from "./subagentToolScopeSnapshot";

export const SUBAGENT_LAUNCH_REJECTION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-launch-rejection-recorder-v1" as const;

export interface SubagentLaunchRejectionRecorderStore {
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
  markSubagentRunStatus(
    runId: string,
    status: "failed",
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary;
  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary;
}

export interface SubagentLaunchRejectionRecord {
  failedRun: SubagentRunSummary;
  spawnRejectedRunEvent: SubagentRunEventSummary;
  spawnFailureParentMailbox: SubagentParentMailboxEventSummary;
}

export function recordSubagentLaunchRejection(input: {
  store: SubagentLaunchRejectionRecorderStore;
  runtime: string;
  phase: string;
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: { id: string; assistantMessageId?: string };
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "capacityLeaseSnapshot">;
  role: Pick<SubagentRoleProfile, "label" | "schedulingPolicy">;
  dependencyMode: SubagentDependencyMode;
  task: string;
  toolCallId: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  modelScope: SubagentModelScopeResolution;
  idempotencyKey: string;
  spawnBlockDecision: SubagentSpawnBlockedDecision;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  childWorktree?: ThreadWorktreeSummary;
}): SubagentLaunchRejectionRecord {
  input.store.addMessage({
    threadId: input.run.childThreadId,
    role: "system",
    content: buildSubagentChildLaunchBlockedMessage({
      run: input.run,
      role: input.role,
      task: input.task,
      dependencyMode: input.dependencyMode,
      reason: input.spawnBlockDecision.reason,
    }),
    metadata: {
      runtime: input.runtime,
      phase: input.phase,
      status: "failed",
      subagentRunId: input.run.id,
      canonicalTaskPath: input.run.canonicalTaskPath,
    },
  });

  const spawnRejectedRunEvent = input.store.appendSubagentRunEvent(input.run.id, {
    type: "subagent.spawn_rejected",
    preview: {
      failureStage: input.spawnBlockDecision.failureStage,
      reason: input.spawnBlockDecision.reason,
      approvalUnavailable: input.spawnBlockDecision.approvalUnavailable,
      capacityLease: compactSubagentCapacityLeaseForPi(input.run.capacityLeaseSnapshot),
      childWorktree: input.childWorktree ? compactSubagentThreadWorktreeForPi(input.childWorktree) : null,
      toolScope: compactSubagentToolScopeSnapshot(input.toolScopeSnapshot),
      phase: input.phase,
    },
  });

  const failedRun = input.store.markSubagentRunStatus(input.run.id, "failed", {
    resultArtifact: buildSubagentSpawnBlockedResultArtifact(input.run, input.spawnBlockDecision.reason),
  });
  const spawnFailureParentMailbox = recordSubagentPostReservationSpawnFailure({
    store: input.store,
    parentThread: input.parentThread,
    parentRun: input.parentRun,
    phase: input.phase,
    run: failedRun,
    toolCallId: input.toolCallId,
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    modelScope: input.modelScope,
    idempotencyKey: input.idempotencyKey,
    failureStage: input.spawnBlockDecision.failureStage,
    reason: input.spawnBlockDecision.reason,
    capacityLease: failedRun.capacityLeaseSnapshot,
    toolScopeSnapshot: input.toolScopeSnapshot,
    ...(input.childWorktree ? { childWorktree: input.childWorktree } : {}),
    approvalUnavailable: input.spawnBlockDecision.approvalUnavailable,
  });

  return {
    failedRun,
    spawnRejectedRunEvent,
    spawnFailureParentMailbox,
  };
}
