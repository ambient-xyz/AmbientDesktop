import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";
import { allowedUserChoicesForSubagentWaitBarrier, type SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES, type SubagentWaitBarrierEvaluation } from "./subagentWaitBarrierEvaluation";
import {
  buildSubagentChildDecisionRequest,
  shouldBuildSubagentChildDecisionRequest,
  subagentChildDecisionOptionLabel,
} from "../../shared/subagentChildDecisionRequests";

export const SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE = "subagent.wait_completed" as const;
export const SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION = "ambient-subagent-wait-completion-v1" as const;
export const SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE = "subagent.wait_barrier_attention" as const;
export const SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION = "ambient-subagent-wait-barrier-attention-v1" as const;

export interface SubagentWaitResultValidationForMailbox {
  valid: boolean;
  synthesisAllowed: boolean;
  partial: boolean;
  status?: SubagentRunStatus;
  reason?: string;
  structuredOutputValidation?: Record<string, unknown>;
  completionGuardValidation?: Record<string, unknown>;
}

export interface SubagentWaitCompletionMailboxDraft<
  ResultValidation extends SubagentWaitResultValidationForMailbox = SubagentWaitResultValidationForMailbox,
> {
  idempotencyKey: string;
  mailboxInput: {
    direction: "child_to_parent";
    type: typeof SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE;
    deliveryState: "delivered";
    createdAt: string;
    deliveredAt: string;
    payload: {
      schemaVersion: typeof SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION;
      idempotencyKey: string;
      runId: string;
      parentRunId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      status: SubagentRunStatus;
      waitTimedOut: boolean;
      synthesisAllowed: boolean;
      resultValidation: ResultValidation;
      summary?: string;
      waitBarrier?: Record<string, unknown>;
      waitBarrierEvaluation?: SubagentWaitBarrierEvaluation<ResultValidation>;
      parentResolution?: SubagentParentPolicyResolution;
    };
  };
  runEventInput: {
    type: typeof SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE;
    preview: Record<string, unknown>;
    createdAt: string;
  };
}

export interface SubagentWaitBarrierAttentionParentMailboxDraft {
  idempotencyKey: string;
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE;
    deliveryState: "queued";
    idempotencyKey: string;
    payload: Record<string, unknown>;
  };
}

export function shouldRecordSubagentWaitCompletion(input: {
  runStatus: SubagentRunStatus;
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "status">;
  waitTimedOut: boolean;
}): boolean {
  return input.waitTimedOut ||
    input.runStatus === "needs_attention" ||
    SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.runStatus) ||
    Boolean(input.waitBarrier && input.waitBarrier.status !== "waiting_on_children");
}

export function buildSubagentWaitCompletionMailboxDraft<
  ResultValidation extends SubagentWaitResultValidationForMailbox,
>(input: {
  run: SubagentRunSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  resultValidation: ResultValidation;
  waitBarrierEvaluation?: SubagentWaitBarrierEvaluation<ResultValidation>;
  parentResolution?: SubagentParentPolicyResolution;
  createdAt: string;
  explicitIdempotencyKey?: string;
}): SubagentWaitCompletionMailboxDraft<ResultValidation> {
  const idempotencyKey = input.explicitIdempotencyKey ?? createSubagentWaitCompletionIdempotencyKey(input);
  const artifact = recordValue(input.run.resultArtifact);
  const summary = stringValue(artifact?.summary);
  const payload: SubagentWaitCompletionMailboxDraft<ResultValidation>["mailboxInput"]["payload"] = {
    schemaVersion: SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION,
    idempotencyKey,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    status: input.run.status,
    waitTimedOut: input.waitTimedOut,
    synthesisAllowed: input.resultValidation.synthesisAllowed,
    resultValidation: input.resultValidation,
    ...(summary ? { summary } : {}),
    ...(input.waitBarrier ? { waitBarrier: compactSubagentWaitBarrier(input.waitBarrier) } : {}),
    ...(input.waitBarrierEvaluation ? { waitBarrierEvaluation: input.waitBarrierEvaluation } : {}),
    ...(input.parentResolution ? { parentResolution: input.parentResolution } : {}),
  };
  const preview: Record<string, unknown> = {
    idempotencyKey,
    status: input.run.status,
    waitTimedOut: input.waitTimedOut,
    synthesisAllowed: input.waitBarrierEvaluation?.synthesisAllowed ?? input.resultValidation.synthesisAllowed,
    ...(input.waitBarrier ? { waitBarrierStatus: input.waitBarrier.status } : {}),
    ...(input.waitBarrierEvaluation ? {
      requiredSynthesisCount: input.waitBarrierEvaluation.requiredSynthesisCount,
      validSynthesisCount: input.waitBarrierEvaluation.validSynthesisCount,
    } : {}),
  };
  return {
    idempotencyKey,
    mailboxInput: {
      direction: "child_to_parent",
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: input.createdAt,
      deliveredAt: input.createdAt,
      payload,
    },
    runEventInput: {
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      preview,
      createdAt: input.createdAt,
    },
  };
}

export function shouldRecordSubagentWaitBarrierAttention(input: {
  waitBarrier: Pick<SubagentWaitBarrierSummary, "dependencyMode">;
  waitTimedOut: boolean;
  parentResolution: Pick<SubagentParentPolicyResolution, "status" | "action">;
}): boolean {
  if (input.waitBarrier.dependencyMode === "optional_background") return false;
  if (input.parentResolution.status !== "blocked") return false;
  if (input.parentResolution.action === "wait_for_child" && !input.waitTimedOut) return false;
  return true;
}

export function buildSubagentWaitBarrierAttentionParentMailboxDraft<
  ResultValidation extends SubagentWaitResultValidationForMailbox,
>(input: {
  run: SubagentRunSummary;
  waitBarrier: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  resultValidation: ResultValidation;
  waitChildRuns?: readonly SubagentRunSummary[];
  waitBarrierEvaluation?: SubagentWaitBarrierEvaluation<ResultValidation>;
  parentResolution: SubagentParentPolicyResolution;
  backgroundCallableWorkflowTask?: boolean;
}): SubagentWaitBarrierAttentionParentMailboxDraft {
  const payloadFingerprint = createSubagentPayloadFingerprint({
    waitBarrierId: input.waitBarrier.id,
    waitBarrierStatus: input.waitBarrier.status,
    waitBarrierUpdatedAt: input.waitBarrier.updatedAt,
    childRunId: input.run.id,
    childStatus: input.run.status,
    waitTimedOut: input.waitTimedOut,
    parentAction: input.parentResolution.action,
    requiresUserInput: input.parentResolution.requiresUserInput,
  });
  const idempotencyKey = createSubagentIdempotencyKey({
    operation: "wait-barrier-attention",
    parentRunId: input.run.parentRunId,
    payloadFingerprint,
  });
  const waitChildRuns = input.waitChildRuns?.length ? input.waitChildRuns : [input.run];
  const childDecisionRequest = !input.backgroundCallableWorkflowTask &&
    shouldBuildSubagentChildDecisionRequest(input.parentResolution, { childRuns: waitChildRuns })
    ? buildSubagentChildDecisionRequest({
      barrier: input.waitBarrier,
      childRuns: input.waitBarrierEvaluation?.childStatuses?.length
        ? input.waitBarrierEvaluation.childStatuses.map((child) => ({ id: child.childRunId, status: child.status }))
        : [{ id: input.run.id, status: input.run.status }],
      parentResolution: input.parentResolution,
    })
    : undefined;
  const parentMailboxInput: SubagentWaitBarrierAttentionParentMailboxDraft["parentMailboxInput"] = {
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
    type: SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
    deliveryState: "queued",
    idempotencyKey,
    payload: {
      schemaVersion: SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION,
      idempotencyKey,
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      parentMessageId: input.run.parentMessageId ?? null,
      childRunId: input.run.id,
      childThreadId: input.run.childThreadId,
      canonicalTaskPath: input.run.canonicalTaskPath,
      roleId: input.run.roleId,
      waitBarrierId: input.waitBarrier.id,
      dependencyMode: input.waitBarrier.dependencyMode,
      barrierStatus: input.waitBarrier.status,
      failurePolicy: input.waitBarrier.failurePolicy,
      childRunIds: input.waitBarrier.childRunIds,
      childStatuses: input.waitBarrierEvaluation?.childStatuses ?? [{ childRunId: input.run.id, status: input.run.status }],
      waitTimedOut: input.waitTimedOut,
      resultValidation: compactSubagentResultValidationForParentMailbox(input.resultValidation),
      ...(input.waitBarrierEvaluation ? { waitBarrierEvaluation: compactSubagentWaitBarrierEvaluationForParentMailbox(input.waitBarrierEvaluation) } : {}),
      parentResolution: input.parentResolution,
      ...(childDecisionRequest ? { childDecisionRequest } : {}),
      ...(childDecisionRequest ? { symphonyDecisionOptions: childDecisionRequest.options.map((option) => ({
        id: option,
        label: subagentChildDecisionOptionLabel(option),
        recommended: option === childDecisionRequest.recommendedOption,
      })) } : {}),
      allowedUserChoices: input.backgroundCallableWorkflowTask
        ? backgroundCallableWorkflowAllowedUserChoices(input.parentResolution)
        : allowedUserChoicesForSubagentWaitBarrier(input.parentResolution),
      ...(input.backgroundCallableWorkflowTask ? { workflowTaskScopedAttention: true } : {}),
      reason: previewText(input.parentResolution.reason, 600),
      instruction: previewText(input.parentResolution.instruction, 600),
      waitBarrier: compactSubagentWaitBarrier(input.waitBarrier),
    },
  };
  return { idempotencyKey, parentMailboxInput };
}

function backgroundCallableWorkflowAllowedUserChoices(
  parentResolution: SubagentParentPolicyResolution,
): Array<Record<string, unknown>> {
  return allowedUserChoicesForSubagentWaitBarrier(parentResolution).filter((choice) => {
    const decision = stringValue(choice.decision ?? choice.id);
    return decision !== "cancel_parent" && decision !== "fail_parent" && decision !== "detach_child";
  });
}

export function compactSubagentResultValidationForParentMailbox(
  validation: SubagentWaitResultValidationForMailbox,
): Record<string, unknown> {
  return {
    valid: validation.valid,
    synthesisAllowed: validation.synthesisAllowed,
    partial: validation.partial,
    status: validation.status,
    ...(validation.reason ? { reason: previewText(validation.reason, 600) } : {}),
    ...(validation.structuredOutputValidation ? { structuredOutputValidation: validation.structuredOutputValidation } : {}),
    ...(validation.completionGuardValidation ? { completionGuardValidation: validation.completionGuardValidation } : {}),
  };
}

export function compactSubagentWaitBarrierEvaluationForParentMailbox(
  evaluation: SubagentWaitBarrierEvaluation,
): Record<string, unknown> {
  return {
    schemaVersion: evaluation.schemaVersion,
    waitBarrierId: evaluation.waitBarrierId,
    dependencyMode: evaluation.dependencyMode,
    childRunIds: evaluation.childRunIds,
    childStatuses: evaluation.childStatuses,
    quorumThreshold: evaluation.quorumThreshold,
    requiredSynthesisCount: evaluation.requiredSynthesisCount,
    validSynthesisCount: evaluation.validSynthesisCount,
    potentialSynthesisCount: evaluation.potentialSynthesisCount,
    synthesisAllowed: evaluation.synthesisAllowed,
    partial: evaluation.partial,
    timedOut: evaluation.timedOut,
    ...(evaluation.terminalEvidence ? { terminalEvidence: evaluation.terminalEvidence } : {}),
    impossible: evaluation.impossible,
    activeChildRunIds: evaluation.activeChildRunIds,
    terminalUnsafeChildRunIds: evaluation.terminalUnsafeChildRunIds,
    reason: previewText(evaluation.reason, 600),
  };
}

export function compactSubagentWaitBarrier(barrier: SubagentWaitBarrierSummary): Record<string, unknown> {
  return {
    id: barrier.id,
    parentThreadId: barrier.parentThreadId,
    parentRunId: barrier.parentRunId,
    childRunIds: barrier.childRunIds,
    dependencyMode: barrier.dependencyMode,
    status: barrier.status,
    failurePolicy: barrier.failurePolicy,
    ...(barrier.quorumThreshold !== undefined ? { quorumThreshold: barrier.quorumThreshold } : {}),
    ...(barrier.timeoutMs !== undefined ? { timeoutMs: barrier.timeoutMs } : {}),
    createdAt: barrier.createdAt,
    updatedAt: barrier.updatedAt,
    ...(barrier.resolvedAt ? { resolvedAt: barrier.resolvedAt } : {}),
  };
}

export function createSubagentWaitCompletionIdempotencyKey(input: {
  run: SubagentRunSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  resultValidation: SubagentWaitResultValidationForMailbox;
  waitBarrierEvaluation?: SubagentWaitBarrierEvaluation;
}): string {
  return createSubagentIdempotencyKey({
    operation: "wait",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({
      runStatus: input.run.status,
      waitBarrierId: input.waitBarrier?.id,
      waitBarrierStatus: input.waitBarrier?.status,
      waitTimedOut: input.waitTimedOut,
      resultStatus: input.resultValidation.status,
      synthesisAllowed: input.waitBarrierEvaluation?.synthesisAllowed ?? input.resultValidation.synthesisAllowed,
      waitBarrierRequiredSynthesisCount: input.waitBarrierEvaluation?.requiredSynthesisCount,
      waitBarrierValidSynthesisCount: input.waitBarrierEvaluation?.validSynthesisCount,
    }),
  });
}

function previewText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
