import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
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
  const draft = buildSubagentWaitBarrierAttentionParentMailboxDraft(input);
  return input.store.appendSubagentParentMailboxEvent(draft.parentMailboxInput);
}
