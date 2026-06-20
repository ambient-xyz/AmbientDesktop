import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type {
  SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";
import type {
  SubagentResultValidation,
} from "./subagentResultValidation";
import {
  buildSubagentWaitBarrierAttentionParentMailboxDraft,
  shouldRecordSubagentWaitBarrierAttention,
} from "./subagentWaitMailbox";
import type {
  SubagentWaitBarrierStoreEvaluation,
} from "./subagentWaitBarrierResolution";

export const SUBAGENT_WAIT_BARRIER_ATTENTION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-wait-barrier-attention-recorder-v1" as const;

export interface SubagentWaitBarrierAttentionRecorderStore {
  listCallableWorkflowTasksForParentRun?(parentRunId: string): CallableWorkflowTaskSummary[];
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

export function recordSubagentWaitBarrierAttentionParentMailboxIfNeeded(input: {
  store: SubagentWaitBarrierAttentionRecorderStore;
  run: SubagentRunSummary;
  waitBarrier: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  resultValidation: SubagentResultValidation;
  waitChildRuns?: readonly SubagentRunSummary[];
  waitBarrierEvaluation?: SubagentWaitBarrierStoreEvaluation;
  parentResolution: SubagentParentPolicyResolution;
}): SubagentParentMailboxEventSummary | undefined {
  if (!shouldRecordSubagentWaitBarrierAttention(input)) return undefined;
  const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft({
    ...input,
    backgroundCallableWorkflowTask: waitBarrierBelongsToBackgroundCallableWorkflowTask(input.store, input.waitBarrier),
  });
  return input.store.appendSubagentParentMailboxEvent(draft.parentMailboxInput);
}

function waitBarrierBelongsToBackgroundCallableWorkflowTask(
  store: SubagentWaitBarrierAttentionRecorderStore,
  waitBarrier: SubagentWaitBarrierSummary,
): boolean {
  if (waitBarrier.ownerKind !== "callable_workflow_symphony_launch_bridge" || !waitBarrier.ownerId) return false;
  return (store.listCallableWorkflowTasksForParentRun?.(waitBarrier.parentRunId) ?? [])
    .some((task) => task.id === waitBarrier.ownerId && task.blocking === false);
}
