import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentRoleId } from "../../shared/subagentRoles";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import type { SubagentModelScopeResolution } from "../model-provider/modelScopeResolver";
import {
  buildSubagentPostReservationSpawnFailureParentMailboxInput,
  type SubagentSpawnFailureParentRunRef,
  type SubagentSpawnFailureStage,
} from "./subagentSpawnFailure";

export const SUBAGENT_POST_RESERVATION_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-post-reservation-spawn-failure-recorder-v1" as const;

export interface SubagentPostReservationSpawnFailureRecorderStore {
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

export function recordSubagentPostReservationSpawnFailure(input: {
  store: SubagentPostReservationSpawnFailureRecorderStore;
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "status">;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  modelScope: SubagentModelScopeResolution;
  idempotencyKey: string;
  failureStage: Extract<SubagentSpawnFailureStage, "capacity" | "tool_scope">;
  reason: string;
  capacityLease: SubagentCapacityLeaseSnapshot;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  childWorktree?: ThreadWorktreeSummary;
  approvalUnavailable: boolean;
}): SubagentParentMailboxEventSummary {
  return input.store.appendSubagentParentMailboxEvent(buildSubagentPostReservationSpawnFailureParentMailboxInput({
    parentThread: input.parentThread,
    parentRun: input.parentRun,
    phase: input.phase,
    run: input.run,
    toolCallId: input.toolCallId,
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    modelScope: input.modelScope,
    idempotencyKey: input.idempotencyKey,
    failureStage: input.failureStage,
    reason: input.reason,
    capacityLease: input.capacityLease,
    toolScopeSnapshot: input.toolScopeSnapshot,
    ...(input.childWorktree ? { childWorktree: input.childWorktree } : {}),
    approvalUnavailable: input.approvalUnavailable,
  }));
}
