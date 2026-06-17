import type {
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  evaluateSubagentWaitBarrierForSynthesis as evaluateSubagentWaitBarrierForSynthesisFromResults,
  subagentRuntimeTimeoutKindFromReason,
  waitBarrierStatusFromEvaluation,
  type SubagentWaitBarrierTerminalEvidence,
  type SubagentWaitBarrierChildResult,
  type SubagentWaitBarrierEvaluation,
} from "./subagentWaitBarrierEvaluation";
import {
  validateSubagentResultForRun,
  type SubagentResultValidation,
} from "./subagentResultValidation";

export const SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION =
  "ambient-subagent-wait-barrier-resolution-v1" as const;
export const SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION =
  "ambient-subagent-wait-barrier-transition-evidence-v1" as const;

export type SubagentWaitBarrierTransitionEvidenceKind =
  | "progress_return"
  | "child_terminal"
  | "child_runtime_timeout"
  | "child_cancelled"
  | "child_detached"
  | "parent_stopped"
  | "explicit_partial"
  | "explicit_failure"
  | "failed_spawn"
  | "retry_child";

export interface SubagentWaitBarrierTransitionEvidence {
  schemaVersion: typeof SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION;
  kind: SubagentWaitBarrierTransitionEvidenceKind;
  source: "parent_wait_session" | "wait_agent" | "child_runtime" | "cancel_agent" | "barrier_controller";
  childRunId?: string;
  childRunIds?: string[];
  reason?: string;
  timeoutKind?: SubagentWaitBarrierTerminalEvidence["timeoutKind"];
  idempotencyKey?: string;
  details?: Record<string, unknown>;
}

export interface SubagentWaitBarrierResolutionStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierSummary["status"],
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
}

export type SubagentWaitBarrierStoreEvaluation =
  SubagentWaitBarrierEvaluation<SubagentResultValidation>;

export function evaluateSubagentWaitBarrierForStore(input: {
  store: Pick<SubagentWaitBarrierResolutionStore, "getSubagentRun" | "listSubagentRunEvents">;
  waitBarrier: SubagentWaitBarrierSummary;
  terminalEvidence?: SubagentWaitBarrierTerminalEvidence;
}): SubagentWaitBarrierStoreEvaluation {
  return evaluateSubagentWaitBarrierForSynthesisFromResults({
    barrier: input.waitBarrier,
    childResults: subagentWaitBarrierChildResultsForStore(input.store, input.waitBarrier),
    ...(input.terminalEvidence ? { terminalEvidence: input.terminalEvidence } : {}),
  });
}

export function subagentWaitBarrierChildResultsForStore(
  store: Pick<SubagentWaitBarrierResolutionStore, "getSubagentRun" | "listSubagentRunEvents">,
  waitBarrier: SubagentWaitBarrierSummary,
): Array<SubagentWaitBarrierChildResult<SubagentResultValidation>> {
  return waitBarrier.childRunIds.map((childRunId) => {
    const childRun = store.getSubagentRun(childRunId);
    const resultValidation = validateSubagentResultForRun(childRun, store.listSubagentRunEvents(childRun.id));
    const childResult: SubagentWaitBarrierChildResult<SubagentResultValidation> = {
      childRunId: childRun.id,
      childThreadId: childRun.childThreadId,
      status: childRun.status,
      synthesisAllowed: resultValidation.synthesisAllowed,
      partial: resultValidation.partial,
      resultValidation,
    };
    return resultValidation.reason ? { ...childResult, reason: resultValidation.reason } : childResult;
  });
}

export function buildSubagentWaitBarrierResolutionArtifact(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  run: Pick<SubagentRunSummary, "id" | "resultArtifact">;
  timedOut: boolean;
  evidence: SubagentWaitBarrierTransitionEvidence;
  waitBarrierEvaluation: SubagentWaitBarrierStoreEvaluation;
  resultValidation: SubagentResultValidation;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: input.waitBarrier.childRunIds,
    childStatuses: input.waitBarrierEvaluation.childStatuses,
    timedOut: input.timedOut,
    transitionEvidence: input.evidence,
    synthesisAllowed: input.waitBarrierEvaluation.synthesisAllowed,
    waitBarrierEvaluation: input.waitBarrierEvaluation,
    resultValidation: input.resultValidation,
    ...(input.resultValidation.structuredOutputValidation ? { structuredOutputValidation: input.resultValidation.structuredOutputValidation } : {}),
    ...(input.resultValidation.completionGuardValidation ? { completionGuardValidation: input.resultValidation.completionGuardValidation } : {}),
    resultArtifact: input.run.resultArtifact ?? null,
  };
}

export function resolveSubagentWaitBarrierForRun(input: {
  store: SubagentWaitBarrierResolutionStore;
  waitBarrier: SubagentWaitBarrierSummary;
  run: SubagentRunSummary;
  evidence: SubagentWaitBarrierTransitionEvidence;
}): SubagentWaitBarrierSummary {
  return resolveSubagentWaitBarrierWithEvidence(input);
}

export function resolveSubagentWaitBarrierWithEvidence(input: {
  store: SubagentWaitBarrierResolutionStore;
  waitBarrier: SubagentWaitBarrierSummary;
  run: SubagentRunSummary;
  evidence: SubagentWaitBarrierTransitionEvidence;
}): SubagentWaitBarrierSummary {
  if (input.waitBarrier.status !== "waiting_on_children") return input.waitBarrier;
  if (input.evidence.kind === "progress_return") return input.waitBarrier;
  const terminalEvidence = terminalEvidenceFromTransitionEvidence(input.evidence);
  const timedOut = terminalEvidence?.kind === "child_runtime_timeout";
  const waitBarrierEvaluation = evaluateSubagentWaitBarrierForStore({
    store: input.store,
    waitBarrier: input.waitBarrier,
    ...(terminalEvidence ? { terminalEvidence } : {}),
  });
  const resultValidation = waitBarrierEvaluation.childResults.find((child) => child.childRunId === input.run.id)?.resultValidation ??
    validateSubagentResultForRun(input.run, input.store.listSubagentRunEvents(input.run.id));
  const nextStatus = waitBarrierStatusFromEvaluation(waitBarrierEvaluation);
  if (nextStatus === "waiting_on_children" && input.waitBarrier.status === "waiting_on_children") return input.waitBarrier;
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, nextStatus, {
    resolutionArtifact: buildSubagentWaitBarrierResolutionArtifact({
      waitBarrier: input.waitBarrier,
      run: input.run,
      timedOut,
      evidence: input.evidence,
      waitBarrierEvaluation,
      resultValidation,
    }),
  });
}

export function resolveActiveSubagentWaitBarriersForRun(input: {
  store: SubagentWaitBarrierResolutionStore;
  run: SubagentRunSummary;
  evidence: SubagentWaitBarrierTransitionEvidence;
}): SubagentWaitBarrierSummary[] {
  return input.store
    .listSubagentWaitBarriersForParentRun(input.run.parentRunId)
    .filter((waitBarrier) => waitBarrier.status === "waiting_on_children" && waitBarrier.childRunIds.includes(input.run.id))
    .map((waitBarrier) => resolveSubagentWaitBarrierForRun({
      store: input.store,
      waitBarrier,
      run: input.run,
      evidence: input.evidence,
    }));
}

function terminalEvidenceFromTransitionEvidence(
  evidence: SubagentWaitBarrierTransitionEvidence,
): SubagentWaitBarrierTerminalEvidence | undefined {
  if (evidence.kind !== "child_runtime_timeout") return undefined;
  return {
    kind: "child_runtime_timeout",
    ...(evidence.childRunId ? { childRunId: evidence.childRunId } : {}),
    ...(evidence.reason ? { reason: evidence.reason } : {}),
    timeoutKind: evidence.timeoutKind ?? subagentRuntimeTimeoutKindFromReason(evidence.reason),
    ...(evidence.details ? { details: evidence.details } : {}),
  };
}
