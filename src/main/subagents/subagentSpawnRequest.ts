import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
} from "../../shared/subagentProtocol";
import type {
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/types";
import type { SubagentTurnBudgetPolicy } from "../../shared/subagentTurnBudget";
import { compactSubagentTurnBudgetPolicyForPi } from "../../shared/subagentTurnBudget";
import type { SubagentChildRuntimeLaunchPreflightResult } from "../piChildSessionAdapter";
import type { SubagentModelScopeResolution } from "../model-provider/modelScopeResolver";
import { compactSubagentCapacityLeaseForPi } from "./subagentAgentStatus";
import {
  compactSubagentModelScopeForPi,
  compactSubagentRuntimeLaunchPreflightForPi,
  compactSubagentThreadWorktreeForPi,
  previewSubagentSpawnText,
} from "./subagentSpawnFailure";
import { compactSubagentToolScopeSnapshot } from "./subagentToolScopeSnapshot";
import { compactSubagentWaitBarrier } from "./subagentWaitMailbox";

export const SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION = "ambient-subagent-spawn-request-v1" as const;
export const SUBAGENT_TASK_MAILBOX_TYPE = "subagent.task" as const;

export interface SubagentSpawnRequestContractInput {
  phase: string;
  parentThread: Pick<ThreadSummary, "id">;
  parentRun: {
    id: string;
    assistantMessageId?: string;
  };
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "canonicalTaskPath" | "capacityLeaseSnapshot">;
  task: string;
  idempotencyKey: string;
  roleId: string;
  modelId: string;
  modelScope: SubagentModelScopeResolution;
  runtimeLaunchPreflight?: SubagentChildRuntimeLaunchPreflightResult;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  retentionPolicy: string;
  schedulingPolicy: string;
  turnBudgetPolicy: SubagentTurnBudgetPolicy;
  toolScope: unknown;
  toolScopeSnapshot: SubagentToolScopeSnapshotSummary;
  childWorktree?: ThreadWorktreeSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
}

export function buildSubagentSpawnRequestedRunEventInput(input: SubagentSpawnRequestContractInput): {
  type: "subagent.spawn_requested";
  preview: Record<string, unknown>;
} {
  return {
    type: "subagent.spawn_requested",
    preview: {
      ...spawnRequestCommonPayload(input),
      taskPreview: previewSubagentSpawnText(input.task),
      modelId: input.modelId,
      capacityLease: compactSubagentCapacityLeaseForPi(input.run.capacityLeaseSnapshot),
      toolScope: input.toolScope,
      ...(input.waitBarrier ? { waitBarrier: compactSubagentWaitBarrier(input.waitBarrier) } : {}),
      orchestrationStarted: false,
    },
  };
}

export function buildSubagentTaskMailboxEventInput(input: SubagentSpawnRequestContractInput): {
  direction: "parent_to_child";
  type: typeof SUBAGENT_TASK_MAILBOX_TYPE;
  payload: Record<string, unknown>;
} {
  return {
    direction: "parent_to_child",
    type: SUBAGENT_TASK_MAILBOX_TYPE,
    payload: {
      ...spawnRequestCommonPayload(input),
      task: input.task,
      capacityLease: compactSubagentCapacityLeaseForPi(input.run.capacityLeaseSnapshot),
      toolScope: input.toolScope,
      ...(input.waitBarrier ? { waitBarrier: compactSubagentWaitBarrier(input.waitBarrier) } : {}),
    },
  };
}

function spawnRequestCommonPayload(input: SubagentSpawnRequestContractInput): Record<string, unknown> {
  return {
    schemaVersion: SUBAGENT_SPAWN_REQUEST_SCHEMA_VERSION,
    phase: input.phase,
    idempotencyKey: input.idempotencyKey,
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    ...(input.parentRun.assistantMessageId ? { parentMessageId: input.parentRun.assistantMessageId } : {}),
    childRunId: input.run.id,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    roleId: input.roleId,
    modelScope: compactSubagentModelScopeForPi(input.modelScope),
    ...(input.runtimeLaunchPreflight ? { runtimeLaunchPreflight: compactSubagentRuntimeLaunchPreflightForPi(input.runtimeLaunchPreflight) } : {}),
    dependencyMode: input.dependencyMode,
    forkMode: input.forkMode,
    promptMode: input.promptMode,
    retentionPolicy: input.retentionPolicy,
    schedulingPolicy: input.schedulingPolicy,
    turnBudgetPolicy: compactSubagentTurnBudgetPolicyForPi(input.turnBudgetPolicy),
    toolScopeSnapshot: compactSubagentToolScopeSnapshot(input.toolScopeSnapshot),
    ...(input.childWorktree ? { childWorktree: compactSubagentThreadWorktreeForPi(input.childWorktree) } : {}),
  };
}
