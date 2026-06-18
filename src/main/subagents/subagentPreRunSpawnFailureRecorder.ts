import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentRoleId, SubagentRoleProfile } from "../../shared/subagentRoles";
import type { SubagentParentMailboxEventSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentModelScopeResolution } from "../model-provider/modelScopeResolver";
import type { SubagentChildRuntimeLaunchPreflightResult } from "../pi/piChildSessionAdapter";
import {
  buildScheduledSubagentSpawnFailureParentMailboxInput,
  buildSubagentPreRunSpawnFailureParentMailboxInput,
  type SubagentSpawnFailureParentRunRef,
  type SubagentSpawnFailureStage,
  type SubagentUnavailableExtensionTool,
} from "./subagentSpawnFailure";

export const SUBAGENT_PRE_RUN_SPAWN_FAILURE_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-pre-run-spawn-failure-recorder-v1" as const;

export interface SubagentPreRunSpawnFailureRecorderStore {
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

export function recordSubagentPreRunSpawnFailure(input: {
  store: SubagentPreRunSpawnFailureRecorderStore;
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  modelScope: SubagentModelScopeResolution;
  idempotencyKey?: string;
  failureStage?: Exclude<SubagentSpawnFailureStage, "scheduling_policy">;
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult;
  capacityLease?: SubagentCapacityLeaseSnapshot;
  unavailableExtensionTools?: readonly SubagentUnavailableExtensionTool[];
  reason: string;
}): SubagentParentMailboxEventSummary {
  return input.store.appendSubagentParentMailboxEvent(buildSubagentPreRunSpawnFailureParentMailboxInput({
    parentThread: input.parentThread,
    parentRun: input.parentRun,
    phase: input.phase,
    toolCallId: input.toolCallId,
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    modelScope: input.modelScope,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.failureStage ? { failureStage: input.failureStage } : {}),
    ...(input.runtimeLaunchPreflight ? { runtimeLaunchPreflight: input.runtimeLaunchPreflight } : {}),
    ...(input.capacityLease ? { capacityLease: input.capacityLease } : {}),
    ...(input.unavailableExtensionTools ? { unavailableExtensionTools: input.unavailableExtensionTools } : {}),
    reason: input.reason,
  }));
}

export function recordScheduledSubagentSpawnPolicyFailure(input: {
  store: SubagentPreRunSpawnFailureRecorderStore;
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: SubagentSpawnFailureParentRunRef;
  phase: string;
  toolCallId: string;
  task: string;
  requestedRoleId: string;
  roleId: SubagentRoleId;
  role: Pick<SubagentRoleProfile, "schedulingPolicy">;
  scheduledSpawnFields: readonly string[];
  idempotencyKey?: string;
}): SubagentParentMailboxEventSummary {
  return input.store.appendSubagentParentMailboxEvent(buildScheduledSubagentSpawnFailureParentMailboxInput({
    parentThread: input.parentThread,
    parentRun: input.parentRun,
    phase: input.phase,
    toolCallId: input.toolCallId,
    task: input.task,
    requestedRoleId: input.requestedRoleId,
    roleId: input.roleId,
    role: input.role,
    scheduledSpawnFields: input.scheduledSpawnFields,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  }));
}
