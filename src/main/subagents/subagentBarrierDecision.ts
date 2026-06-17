import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/types";
import type { SubagentBarrierDecision, SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";
import { compactSubagentWaitBarrier } from "./subagentWaitMailbox";
import {
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
  type SubagentWaitBarrierTransitionEvidenceKind,
} from "./subagentWaitBarrierResolution";

export const SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE = "subagent.wait_barrier_decision" as const;
export const SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION = "ambient-subagent-wait-barrier-decision-v1" as const;
export const SUBAGENT_USER_DECISION_SCHEMA_VERSION = "ambient-subagent-user-decision-v1" as const;
export const SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION = "ambient-subagent-wait-barrier-resolution-v1" as const;

export interface SubagentBarrierControlState {
  retryRequestedRunIds?: string[];
  retryAcceptedRunIds?: string[];
  retryMailboxEventIds?: string[];
  detachedRunIds: string[];
  cancelledRunIds: string[];
  unchangedRunIds: string[];
  cancelledMailboxEventIds: string[];
}

export interface SubagentBarrierDecisionParentMailboxDraft {
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE;
    deliveryState: "delivered";
    idempotencyKey: string;
    createdAt: string;
    deliveredAt: string;
    payload: Record<string, unknown>;
  };
}

export interface SubagentBarrierDecisionWaitBarrierStore {
  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierSummary["status"],
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
}

export interface SubagentBarrierDecisionWaitBarrierResolution {
  barrier: SubagentWaitBarrierSummary;
  resolutionArtifact: Record<string, unknown>;
}

export function subagentBarrierDecisionNextStatus(decision: SubagentBarrierDecision): SubagentWaitBarrierSummary["status"] {
  return decision === "continue_with_partial"
    ? "satisfied"
    : decision === "fail_parent"
    ? "failed"
    : decision === "detach_child"
    ? "failed"
    : decision === "cancel_parent"
    ? "cancelled"
    : "waiting_on_children";
}

export function buildSubagentBarrierDecisionResolutionArtifact(input: {
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  now: string;
  toolCallId: string;
  idempotencyKey: string;
  controlState?: SubagentBarrierControlState;
}): Record<string, unknown> {
  const controlState = input.controlState ?? emptySubagentBarrierControlState();
  const controlRetryRequestedRunIds = controlState.retryRequestedRunIds ?? [];
  const retryRequestedRunIds = input.decision === "retry_child"
    ? (controlRetryRequestedRunIds.length ? controlRetryRequestedRunIds : input.barrier.childRunIds)
    : controlRetryRequestedRunIds;
  const childStatuses = input.childRuns.map((run) => ({ childRunId: run.id, status: run.status }));
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
    childRunIds: input.barrier.childRunIds,
    childStatuses,
    synthesisAllowed: input.decision === "continue_with_partial",
    explicitPartial: input.decision === "continue_with_partial",
    resultArtifact: null,
    transitionEvidence: buildSubagentBarrierDecisionTransitionEvidence({
      barrier: input.barrier,
      childStatuses,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
      now: input.now,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      controlState,
      retryRequestedRunIds,
    }),
    ...(retryRequestedRunIds.length ? { retryRequestedRunIds } : {}),
    ...(controlState.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: controlState.retryAcceptedRunIds } : {}),
    ...(controlState.retryMailboxEventIds?.length ? { retryMailboxEventIds: controlState.retryMailboxEventIds } : {}),
    ...(controlState.detachedRunIds.length ? { detachedRunIds: controlState.detachedRunIds } : {}),
    ...(controlState.cancelledRunIds.length ? { cancelledRunIds: controlState.cancelledRunIds } : {}),
    ...(controlState.unchangedRunIds.length ? { unchangedRunIds: controlState.unchangedRunIds } : {}),
    ...(controlState.cancelledMailboxEventIds.length ? { cancelledMailboxEventIds: controlState.cancelledMailboxEventIds } : {}),
    ...(input.decision === "cancel_parent" ? { parentCancellationRequested: true } : {}),
    userDecision: {
      schemaVersion: SUBAGENT_USER_DECISION_SCHEMA_VERSION,
      decision: input.decision,
      userDecision: input.userDecision ?? null,
      partialSummary: input.partialSummary ?? null,
      decidedAt: input.now,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

export function resolveSubagentBarrierDecisionWaitBarrier(input: {
  store: SubagentBarrierDecisionWaitBarrierStore;
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  now: string;
  toolCallId: string;
  idempotencyKey: string;
  controlState?: SubagentBarrierControlState;
}): SubagentBarrierDecisionWaitBarrierResolution {
  const resolutionArtifact = buildSubagentBarrierDecisionResolutionArtifact({
    barrier: input.barrier,
    childRuns: input.childRuns,
    decision: input.decision,
    userDecision: input.userDecision,
    partialSummary: input.partialSummary,
    now: input.now,
    toolCallId: input.toolCallId,
    idempotencyKey: input.idempotencyKey,
    controlState: input.controlState,
  });
  const barrier = input.store.updateSubagentWaitBarrierStatus(
    input.barrier.id,
    subagentBarrierDecisionNextStatus(input.decision),
    {
      now: input.now,
      resolutionArtifact,
    },
  );
  return { barrier, resolutionArtifact };
}

export function buildSubagentBarrierDecisionTransitionEvidence(input: {
  barrier: SubagentWaitBarrierSummary;
  childStatuses: Array<{ childRunId: string; status: SubagentRunSummary["status"] }>;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  now: string;
  toolCallId: string;
  idempotencyKey: string;
  controlState: SubagentBarrierControlState;
  retryRequestedRunIds: string[];
}): SubagentWaitBarrierTransitionEvidence {
  const details: Record<string, unknown> = {
    waitBarrierId: input.barrier.id,
    parentThreadId: input.barrier.parentThreadId,
    parentRunId: input.barrier.parentRunId,
    dependencyMode: input.barrier.dependencyMode,
    failurePolicy: input.barrier.failurePolicy,
    decision: input.decision,
    decidedAt: input.now,
    toolCallId: input.toolCallId,
    childStatuses: input.childStatuses,
  };
  if (input.userDecision) details.userDecision = input.userDecision;
  if (input.partialSummary) details.partialSummary = input.partialSummary;
  if (input.retryRequestedRunIds.length) details.retryRequestedRunIds = input.retryRequestedRunIds;
  if (input.controlState.retryAcceptedRunIds?.length) details.retryAcceptedRunIds = input.controlState.retryAcceptedRunIds;
  if (input.controlState.retryMailboxEventIds?.length) details.retryMailboxEventIds = input.controlState.retryMailboxEventIds;
  if (input.controlState.detachedRunIds.length) details.detachedRunIds = input.controlState.detachedRunIds;
  if (input.controlState.cancelledRunIds.length) details.cancelledRunIds = input.controlState.cancelledRunIds;
  if (input.controlState.unchangedRunIds.length) details.unchangedRunIds = input.controlState.unchangedRunIds;
  if (input.controlState.cancelledMailboxEventIds.length) details.cancelledMailboxEventIds = input.controlState.cancelledMailboxEventIds;
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: subagentBarrierDecisionTransitionKind(input.decision),
    source: "barrier_controller",
    childRunIds: input.barrier.childRunIds,
    reason: input.userDecision ?? subagentBarrierDecisionTransitionReason(input.decision),
    idempotencyKey: input.idempotencyKey,
    details,
  };
}

function subagentBarrierDecisionTransitionKind(
  decision: SubagentBarrierDecision,
): SubagentWaitBarrierTransitionEvidenceKind {
  if (decision === "continue_with_partial") return "explicit_partial";
  if (decision === "retry_child") return "retry_child";
  if (decision === "detach_child") return "child_detached";
  if (decision === "cancel_parent") return "child_cancelled";
  return "explicit_failure";
}

function subagentBarrierDecisionTransitionReason(decision: SubagentBarrierDecision): string {
  if (decision === "continue_with_partial") return "User explicitly allowed partial parent synthesis.";
  if (decision === "retry_child") return "User or policy requested child retry before parent synthesis.";
  if (decision === "detach_child") return "User detached required child work from this parent barrier.";
  if (decision === "cancel_parent") return "User cancelled the parent path while resolving this wait barrier.";
  return "User or policy chose to fail the parent path for this barrier.";
}

export function buildSubagentBarrierDecisionRunEventPreview(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey: string;
  toolCallId: string;
  controlState?: SubagentBarrierControlState;
}): Record<string, unknown> {
  const controlState = input.controlState ?? emptySubagentBarrierControlState();
  const controlRetryRequestedRunIds = controlState.retryRequestedRunIds ?? [];
  const retryRequestedRunIds = input.decision === "retry_child"
    ? (controlRetryRequestedRunIds.length ? controlRetryRequestedRunIds : input.waitBarrier.childRunIds)
    : controlRetryRequestedRunIds;
  return {
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    waitBarrierId: input.waitBarrier.id,
    decision: input.decision,
    userDecisionPreview: input.userDecision ? previewText(input.userDecision, 240) : undefined,
    partialSummaryPreview: input.partialSummary ? previewText(input.partialSummary, 480) : undefined,
    barrier: compactSubagentWaitBarrier(input.waitBarrier),
    ...(retryRequestedRunIds.length ? { retryRequestedRunIds } : {}),
    ...(controlState.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: controlState.retryAcceptedRunIds } : {}),
    ...(controlState.retryMailboxEventIds?.length ? { retryMailboxEventIds: controlState.retryMailboxEventIds } : {}),
    ...(controlState.detachedRunIds.length ? { detachedRunIds: controlState.detachedRunIds } : {}),
    ...(controlState.cancelledRunIds.length ? { cancelledRunIds: controlState.cancelledRunIds } : {}),
    ...(controlState.cancelledMailboxEventIds.length ? { cancelledMailboxEventIds: controlState.cancelledMailboxEventIds } : {}),
  };
}

export function buildSubagentBarrierDecisionChildThreadMessage(input: {
  waitBarrierId: string;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
}): string {
  return [
    `Parent recorded a wait-barrier decision: ${input.decision}.`,
    `Barrier: ${input.waitBarrierId}`,
    input.userDecision ? `User decision: ${input.userDecision}` : undefined,
    input.partialSummary ? `Partial summary: ${input.partialSummary}` : undefined,
  ].filter(Boolean).join("\n");
}

export function buildSubagentBarrierDecisionText(input: {
  barrier: SubagentWaitBarrierSummary;
  decision: SubagentBarrierDecision;
  replay: boolean;
}): string {
  const prefix = input.replay ? "Reused existing wait-barrier decision" : "Recorded wait-barrier decision";
  const instruction = input.decision === "continue_with_partial"
    ? "Parent may proceed only with an explicit partial answer and provenance for the unavailable child work."
    : input.decision === "retry_child"
    ? "Parent remains blocked until retry work produces a synthesis-safe result."
    : input.decision === "detach_child"
    ? "Parent remains blocked; detached child work stays inspectable as separate work."
    : input.decision === "cancel_parent"
    ? "Parent must stop or cancel; active required child work for this barrier was cancelled."
    : "Parent remains blocked and should surface the required child failure.";
  return [
    `${prefix}: ${input.decision}.`,
    `waitBarrierId: ${input.barrier.id}`,
    `status: ${input.barrier.status}`,
    instruction,
  ].join("\n");
}

export function buildSubagentBarrierDecisionParentMailboxDraft(input: {
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  parentResolution: SubagentParentPolicyResolution;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey: string;
  toolCallId: string;
  createdAt: string;
  controlState?: SubagentBarrierControlState;
}): SubagentBarrierDecisionParentMailboxDraft {
  const primaryRun = input.childRuns[0];
  const controlState = input.controlState ?? barrierControlStateFromResolutionArtifact(input.barrier);
  const controlRetryRequestedRunIds = controlState.retryRequestedRunIds ?? [];
  const retryRequestedRunIds = input.decision === "retry_child"
    ? (controlRetryRequestedRunIds.length ? controlRetryRequestedRunIds : input.barrier.childRunIds)
    : controlRetryRequestedRunIds;
  const parentMailboxInput: SubagentBarrierDecisionParentMailboxDraft["parentMailboxInput"] = {
    parentThreadId: input.barrier.parentThreadId,
    parentRunId: input.barrier.parentRunId,
    ...(primaryRun?.parentMessageId ? { parentMessageId: primaryRun.parentMessageId } : {}),
    type: SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE,
    deliveryState: "delivered",
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    deliveredAt: input.createdAt,
    payload: {
      schemaVersion: SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION,
      idempotencyKey: input.idempotencyKey,
      toolCallId: input.toolCallId,
      parentThreadId: input.barrier.parentThreadId,
      parentRunId: input.barrier.parentRunId,
      parentMessageId: primaryRun?.parentMessageId ?? null,
      waitBarrierId: input.barrier.id,
      dependencyMode: input.barrier.dependencyMode,
      barrierStatus: input.barrier.status,
      failurePolicy: input.barrier.failurePolicy,
      childRunIds: input.barrier.childRunIds,
      childStatuses: input.childRuns.map((run) => ({ childRunId: run.id, status: run.status })),
      ...(retryRequestedRunIds.length ? { retryRequestedRunIds } : {}),
      ...(controlState.retryAcceptedRunIds?.length ? { retryAcceptedRunIds: controlState.retryAcceptedRunIds } : {}),
      ...(controlState.retryMailboxEventIds?.length ? { retryMailboxEventIds: controlState.retryMailboxEventIds } : {}),
      ...(controlState.detachedRunIds.length ? { detachedRunIds: controlState.detachedRunIds } : {}),
      ...(controlState.cancelledRunIds.length ? { cancelledRunIds: controlState.cancelledRunIds } : {}),
      ...(controlState.unchangedRunIds.length ? { unchangedRunIds: controlState.unchangedRunIds } : {}),
      ...(controlState.cancelledMailboxEventIds.length ? { cancelledMailboxEventIds: controlState.cancelledMailboxEventIds } : {}),
      ...(input.decision === "cancel_parent" ? { parentCancellationRequested: true } : {}),
      decision: input.decision,
      userDecisionPreview: input.userDecision ? previewText(input.userDecision, 600) : null,
      partialSummaryPreview: input.partialSummary ? previewText(input.partialSummary, 600) : null,
      parentResolution: input.parentResolution,
      waitBarrier: compactSubagentWaitBarrier(input.barrier),
    },
  };
  return { parentMailboxInput };
}

export function barrierControlStateFromResolutionArtifact(barrier: Pick<SubagentWaitBarrierSummary, "resolutionArtifact">): SubagentBarrierControlState {
  const artifact = recordValue(barrier.resolutionArtifact);
  return {
    retryRequestedRunIds: stringArrayValue(artifact?.retryRequestedRunIds),
    retryAcceptedRunIds: stringArrayValue(artifact?.retryAcceptedRunIds),
    retryMailboxEventIds: stringArrayValue(artifact?.retryMailboxEventIds),
    detachedRunIds: stringArrayValue(artifact?.detachedRunIds),
    cancelledRunIds: stringArrayValue(artifact?.cancelledRunIds),
    unchangedRunIds: stringArrayValue(artifact?.unchangedRunIds),
    cancelledMailboxEventIds: stringArrayValue(artifact?.cancelledMailboxEventIds),
  };
}

export function emptySubagentBarrierControlState(): SubagentBarrierControlState {
  return {
    retryRequestedRunIds: [],
    retryAcceptedRunIds: [],
    retryMailboxEventIds: [],
    detachedRunIds: [],
    cancelledRunIds: [],
    unchangedRunIds: [],
    cancelledMailboxEventIds: [],
  };
}

function previewText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
