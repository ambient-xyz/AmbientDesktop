import type {
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  evaluateSubagentWaitBarrierForSynthesis as evaluateSubagentWaitBarrierForSynthesisFromResults,
  SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES,
  waitBarrierStatusFromEvaluation,
  type SubagentWaitBarrierChildResult,
  type SubagentWaitBarrierEvaluation,
} from "./subagentWaitBarrierEvaluation";
import { explicitSubagentBarrierUserDecision } from "./subagentParentPolicyResolution";
import {
  validateSubagentResultForRun,
  type SubagentResultValidation,
} from "./subagentResultValidation";

export const SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION =
  "ambient-subagent-wait-barrier-resolution-v1" as const;

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
  timedOut?: boolean;
}): SubagentWaitBarrierStoreEvaluation {
  return evaluateSubagentWaitBarrierForSynthesisFromResults({
    barrier: input.waitBarrier,
    childResults: subagentWaitBarrierChildResultsForStore(input.store, input.waitBarrier),
    ...(input.timedOut !== undefined ? { timedOut: input.timedOut } : {}),
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
  waitBarrierEvaluation: SubagentWaitBarrierStoreEvaluation;
  resultValidation: SubagentResultValidation;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: input.waitBarrier.childRunIds,
    childStatuses: input.waitBarrierEvaluation.childStatuses,
    timedOut: input.timedOut,
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
  timedOut: boolean;
}): SubagentWaitBarrierSummary {
  if (input.waitBarrier.status !== "waiting_on_children") return input.waitBarrier;
  const waitBarrierEvaluation = evaluateSubagentWaitBarrierForStore({
    store: input.store,
    waitBarrier: input.waitBarrier,
    timedOut: input.timedOut,
  });
  const resultValidation = waitBarrierEvaluation.childResults.find((child) => child.childRunId === input.run.id)?.resultValidation ??
    validateSubagentResultForRun(input.run, input.store.listSubagentRunEvents(input.run.id));
  const nextStatus = waitBarrierStatusFromEvaluation(waitBarrierEvaluation);
  if (nextStatus === "waiting_on_children" && input.waitBarrier.status === "waiting_on_children") return input.waitBarrier;
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, nextStatus, {
    resolutionArtifact: buildSubagentWaitBarrierResolutionArtifact({
      waitBarrier: input.waitBarrier,
      run: input.run,
      timedOut: input.timedOut,
      waitBarrierEvaluation,
      resultValidation,
    }),
  });
}

export function resolveActiveSubagentWaitBarriersForRun(input: {
  store: SubagentWaitBarrierResolutionStore;
  run: SubagentRunSummary;
  timedOut: boolean;
}): SubagentWaitBarrierSummary[] {
  return input.store
    .listSubagentWaitBarriersForParentRun(input.run.parentRunId)
    .filter((waitBarrier) => waitBarrier.status === "waiting_on_children" && waitBarrier.childRunIds.includes(input.run.id))
    .map((waitBarrier) => resolveSubagentWaitBarrierForRun({
      store: input.store,
      waitBarrier,
      run: input.run,
      timedOut: input.timedOut,
    }));
}

export function satisfySubagentWaitBarrierIfCurrentResultsAllowSynthesis(input: {
  store: SubagentWaitBarrierResolutionStore;
  waitBarrier: SubagentWaitBarrierSummary;
}): SubagentWaitBarrierSummary {
  if (input.waitBarrier.status !== "waiting_on_children" && input.waitBarrier.status !== "timed_out") {
    return input.waitBarrier;
  }
  const waitBarrierEvaluation = evaluateSubagentWaitBarrierForStore({
    store: input.store,
    waitBarrier: input.waitBarrier,
    timedOut: input.waitBarrier.status === "timed_out",
  });
  if (!waitBarrierEvaluation.synthesisAllowed) {
    const partialBridge = explicitPartialBridgeForStaleBarrier({
      store: input.store,
      waitBarrier: input.waitBarrier,
      waitBarrierEvaluation,
    });
    if (!partialBridge) return input.waitBarrier;
    return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, "satisfied", {
      resolutionArtifact: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
        childRunIds: input.waitBarrier.childRunIds,
        childStatuses: waitBarrierEvaluation.childStatuses,
        timedOut: input.waitBarrier.status === "timed_out",
        synthesisAllowed: true,
        explicitPartial: true,
        resultArtifact: null,
        waitBarrierEvaluation,
        partialInheritedFromWaitBarrierIds: partialBridge.sourceBarrierIds,
        partialInheritedUnsafeChildRunIds: partialBridge.unsafeChildRunIds,
        userDecision: partialBridge.userDecision ?? null,
      },
    });
  }
  const resultChild = waitBarrierEvaluation.childResults.find((child) => child.synthesisAllowed) ??
    waitBarrierEvaluation.childResults[0];
  if (!resultChild) return input.waitBarrier;
  const run = input.store.getSubagentRun(resultChild.childRunId);
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, "satisfied", {
    resolutionArtifact: buildSubagentWaitBarrierResolutionArtifact({
      waitBarrier: input.waitBarrier,
      run,
      timedOut: input.waitBarrier.status === "timed_out",
      waitBarrierEvaluation,
      resultValidation: resultChild.resultValidation,
    }),
  });
}

function explicitPartialBridgeForStaleBarrier(input: {
  store: Pick<SubagentWaitBarrierResolutionStore, "listSubagentWaitBarriersForParentRun">;
  waitBarrier: SubagentWaitBarrierSummary;
  waitBarrierEvaluation: SubagentWaitBarrierStoreEvaluation;
}): { sourceBarrierIds: string[]; unsafeChildRunIds: string[]; userDecision?: unknown } | undefined {
  const unsafeChildren = input.waitBarrierEvaluation.childResults.filter((child) => !child.synthesisAllowed);
  if (!unsafeChildren.length) return undefined;
  if (unsafeChildren.some((child) => !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(child.status))) return undefined;
  const siblingBarriers = input.store
    .listSubagentWaitBarriersForParentRun(input.waitBarrier.parentRunId)
    .filter((barrier) => barrier.id !== input.waitBarrier.id && barrier.parentThreadId === input.waitBarrier.parentThreadId);
  const sourceBarriers: SubagentWaitBarrierSummary[] = [];
  for (const child of unsafeChildren) {
    const source = siblingBarriers.find((barrier) =>
      barrier.childRunIds.includes(child.childRunId) &&
      isExplicitPartialContinuationBarrier(barrier)
    );
    if (!source) return undefined;
    sourceBarriers.push(source);
  }
  return {
    sourceBarrierIds: [...new Set(sourceBarriers.map((barrier) => barrier.id))],
    unsafeChildRunIds: unsafeChildren.map((child) => child.childRunId),
    userDecision: userDecisionFromBarrier(sourceBarriers[0]),
  };
}

function isExplicitPartialContinuationBarrier(barrier: SubagentWaitBarrierSummary): boolean {
  if (barrier.status !== "satisfied") return false;
  const decision = explicitSubagentBarrierUserDecision(barrier);
  return decision?.decision === "continue_with_partial" &&
    decision.synthesisAllowed &&
    decision.explicitPartial;
}

function userDecisionFromBarrier(barrier: SubagentWaitBarrierSummary | undefined): unknown {
  const artifact = recordValue(barrier?.resolutionArtifact);
  return recordValue(artifact?.userDecision);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
