import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  barrierControlStateFromResolutionArtifact,
  buildSubagentBarrierDecisionParentMailboxDraft,
  type SubagentBarrierControlState,
} from "./subagentBarrierDecision";
import type {
  SubagentBarrierDecision,
  SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";

export const SUBAGENT_BARRIER_DECISION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-barrier-decision-recorder-v1" as const;

export interface SubagentBarrierDecisionRecorderStore {
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

export function recordSubagentBarrierDecisionParentMailbox(input: {
  store: SubagentBarrierDecisionRecorderStore;
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  parentResolution: SubagentParentPolicyResolution;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey: string;
  toolCallId: string;
  createdAt?: string;
  controlResult?: SubagentBarrierControlState;
}): SubagentParentMailboxEventSummary {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const controlState = input.controlResult ?? barrierControlStateFromResolutionArtifact(input.barrier);
  const draft = buildSubagentBarrierDecisionParentMailboxDraft({
    barrier: input.barrier,
    childRuns: input.childRuns,
    parentResolution: input.parentResolution,
    decision: input.decision,
    userDecision: input.userDecision,
    partialSummary: input.partialSummary,
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    createdAt,
    controlState,
  });
  return input.store.appendSubagentParentMailboxEvent(draft.parentMailboxInput);
}
