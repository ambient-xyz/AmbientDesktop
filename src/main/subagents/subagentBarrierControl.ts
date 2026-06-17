import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary } from "../../shared/types";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";
import type { SubagentBarrierDecision } from "./subagentParentPolicyResolution";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";

export const SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE = "barrier_cancel_parent" as const;
export const SUBAGENT_BARRIER_RETRY_CHILD_SOURCE = "barrier_retry_child" as const;
export const SUBAGENT_BARRIER_RETRY_MAILBOX_TYPE = "subagent.retry" as const;
export const SUBAGENT_BARRIER_RETRY_REQUEST_SCHEMA_VERSION =
  "ambient-subagent-barrier-retry-request-v1" as const;

export type SubagentBarrierControlRunAction = "unchanged" | "detach" | "cancel" | "retry";

export interface SubagentBarrierControlRunPlan {
  runId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  currentStatus: SubagentRunStatus;
  action: SubagentBarrierControlRunAction;
  targetStatus?: Extract<SubagentRunStatus, "detached" | "cancelled">;
  resultSummary?: string;
  runtimeCancelIdempotencyKey?: string;
  runtimeCancelSource?: typeof SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE;
  runtimeRetryIdempotencyKey?: string;
  runtimeRetrySource?: typeof SUBAGENT_BARRIER_RETRY_CHILD_SOURCE;
}

export interface SubagentBarrierControlPlan {
  applies: boolean;
  decision: SubagentBarrierDecision;
  runPlans: SubagentBarrierControlRunPlan[];
  unchangedRunIds: string[];
  retryCandidateRunIds: string[];
  detachCandidateRunIds: string[];
  cancelCandidateRunIds: string[];
}

export function buildSubagentBarrierControlPlan(input: {
  childRuns: SubagentRunSummary[];
  decision: SubagentBarrierDecision;
  userDecision?: string;
  idempotencyKey: string;
}): SubagentBarrierControlPlan {
  const applies = input.decision === "retry_child" || input.decision === "detach_child" || input.decision === "cancel_parent";
  const runPlans = input.childRuns.map((run) => buildSubagentBarrierControlRunPlan({
    run,
    decision: input.decision,
    userDecision: input.userDecision,
    idempotencyKey: input.idempotencyKey,
  }));
  return {
    applies,
    decision: input.decision,
    runPlans,
    unchangedRunIds: applies ? runPlans.filter((plan) => plan.action === "unchanged").map((plan) => plan.runId) : [],
    retryCandidateRunIds: applies ? runPlans.filter((plan) => plan.action === "retry").map((plan) => plan.runId) : [],
    detachCandidateRunIds: applies ? runPlans.filter((plan) => plan.action === "detach").map((plan) => plan.runId) : [],
    cancelCandidateRunIds: applies ? runPlans.filter((plan) => plan.action === "cancel").map((plan) => plan.runId) : [],
  };
}

export function buildSubagentBarrierControlRunPlan(input: {
  run: SubagentRunSummary;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  idempotencyKey: string;
}): SubagentBarrierControlRunPlan {
  const base = {
    runId: input.run.id,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    currentStatus: input.run.status,
  };
  if (input.decision === "retry_child") {
    if (!isRetryableSubagentBarrierChildStatus(input.run.status)) {
      return { ...base, action: "unchanged" };
    }
    const resultSummary = subagentBarrierRetryMessage({
      run: input.run,
      userDecision: input.userDecision,
    });
    return {
      ...base,
      action: "retry",
      resultSummary,
      runtimeRetryIdempotencyKey: createSubagentIdempotencyKey({
        operation: "retry",
        childRunId: input.run.id,
        canonicalPath: input.run.canonicalTaskPath,
        payloadFingerprint: createSubagentPayloadFingerprint({
          source: SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
          barrierDecisionIdempotencyKey: input.idempotencyKey,
          userDecision: input.userDecision,
          previousStatus: input.run.status,
        }),
      }),
      runtimeRetrySource: SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
    };
  }
  if (input.decision !== "detach_child" && input.decision !== "cancel_parent") {
    return { ...base, action: "unchanged" };
  }
  if (SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.run.status)) {
    return { ...base, action: "unchanged" };
  }
  const resultSummary = subagentBarrierControlResultSummary({
    decision: input.decision,
    userDecision: input.userDecision,
  });
  if (input.decision === "detach_child") {
    return {
      ...base,
      action: "detach",
      targetStatus: "detached",
      resultSummary,
    };
  }
  return {
    ...base,
    action: "cancel",
    targetStatus: "cancelled",
    resultSummary,
    runtimeCancelIdempotencyKey: createSubagentIdempotencyKey({
      operation: "cancel",
      childRunId: input.run.id,
      canonicalPath: input.run.canonicalTaskPath,
      payloadFingerprint: createSubagentPayloadFingerprint({
        source: SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
        barrierDecisionIdempotencyKey: input.idempotencyKey,
        userDecision: input.userDecision,
      }),
    }),
    runtimeCancelSource: SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
  };
}

export function isRetryableSubagentBarrierChildStatus(status: SubagentRunStatus): boolean {
  return status === "failed" ||
    status === "stopped" ||
    status === "cancelled" ||
    status === "timed_out" ||
    status === "aborted_partial";
}

export function subagentBarrierRetryMessage(input: {
  run: Pick<SubagentRunSummary, "canonicalTaskPath" | "status">;
  userDecision?: string;
}): string {
  return [
    `Parent requested a retry for required child ${input.run.canonicalTaskPath} after status ${input.run.status}.`,
    input.userDecision ? `User decision: ${input.userDecision}` : undefined,
    "Retry the original delegated task in this same visible child thread. Preserve the failed attempt above for inspection and produce a synthesis-safe result before the parent continues.",
    "If the original task text or required artifact inputs are not visible in this child thread, return needs_attention with the missing input instead of guessing filenames, reading broad directories, or inventing sibling context.",
  ].filter(Boolean).join("\n");
}

export function subagentBarrierControlResultSummary(input: {
  decision: Extract<SubagentBarrierDecision, "detach_child" | "cancel_parent">;
  userDecision?: string;
}): string {
  const prefix = input.decision === "detach_child"
    ? "User detached this required child from the parent wait barrier."
    : "User cancelled the parent path while resolving this wait barrier.";
  return `${prefix} ${input.userDecision ?? ""}`.trim();
}

export function shouldMarkSubagentBarrierControlRunStatus(input: {
  plan: SubagentBarrierControlRunPlan;
  currentStatus: SubagentRunStatus;
}): boolean {
  if (!input.plan.targetStatus) return false;
  if (input.currentStatus === input.plan.targetStatus) return false;
  if (input.plan.action === "cancel" && SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.currentStatus)) return false;
  return true;
}

export function buildSubagentBarrierControlResultArtifact(input: {
  plan: SubagentBarrierControlRunPlan;
  status: Extract<SubagentRunStatus, "detached" | "cancelled">;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.plan.runId,
    status: input.status,
    partial: false,
    summary: input.plan.resultSummary ?? "",
    childThreadId: input.plan.childThreadId,
  };
}

export function buildSubagentBarrierRetryMailboxPayload(input: {
  plan: SubagentBarrierControlRunPlan;
  now: string;
}): Record<string, unknown> {
  return {
    schemaVersion: SUBAGENT_BARRIER_RETRY_REQUEST_SCHEMA_VERSION,
    status: "retry_requested",
    source: SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
    childThreadId: input.plan.childThreadId,
    childRunId: input.plan.runId,
    canonicalTaskPath: input.plan.canonicalTaskPath,
    previousStatus: input.plan.currentStatus,
    idempotencyKey: input.plan.runtimeRetryIdempotencyKey,
    message: input.plan.resultSummary ?? "",
    requestedAt: input.now,
  };
}

export function buildSubagentBarrierCancelledMailboxPayload(input: {
  plan: SubagentBarrierControlRunPlan;
  childThreadId: string;
}): Record<string, unknown> {
  return {
    status: "cancelled",
    reason: input.plan.resultSummary ?? "",
    source: SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
    childThreadId: input.childThreadId,
  };
}
