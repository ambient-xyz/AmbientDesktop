import type {
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type {
  SubagentChildRuntimeAdapter,
  SubagentRuntimeEventEmitter,
} from "./subagentPiRuntimeFacade";
import {
  buildSubagentBarrierDecisionChildThreadMessage,
  buildSubagentBarrierDecisionRunEventPreview,
  resolveSubagentBarrierDecisionWaitBarrier,
  type SubagentBarrierDecisionWaitBarrierStore,
} from "./subagentBarrierDecision";
import { recordSubagentBarrierDecisionParentMailbox } from "./subagentBarrierDecisionRecorder";
import {
  executeSubagentBarrierControlDecision,
  type SubagentBarrierControlExecutorStore,
} from "./subagentBarrierControlExecutor";
import { findSubagentRunEventByIdempotencyKey } from "./subagentIdempotency";
import {
  resolveSubagentParentPolicyForBarrierDecision,
  type SubagentBarrierDecision,
  type SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";

export const SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-barrier-decision-executor-v1" as const;

export interface SubagentBarrierDecisionExecutorStore extends SubagentBarrierControlExecutorStore, SubagentBarrierDecisionWaitBarrierStore {
  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
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
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface SubagentBarrierDecisionExecutionResult {
  schemaVersion: typeof SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION;
  replay: boolean;
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  parentResolution: SubagentParentPolicyResolution;
  parentMailboxEvent: SubagentParentMailboxEventSummary;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey: string;
  resolutionArtifact?: Record<string, unknown>;
  runEvents?: SubagentRunEventSummary[];
}

export async function executeSubagentBarrierDecision(input: {
  store: SubagentBarrierDecisionExecutorStore;
  runtime?: Pick<SubagentChildRuntimeAdapter, "cancelChildRun" | "retryChildRun">;
  barrier: SubagentWaitBarrierSummary;
  decision: SubagentBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey: string;
  toolCallId: string;
  now?: string;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  createRuntimeRetryEventEmitter?: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<SubagentBarrierDecisionExecutionResult> {
  const initialChildRuns = childRunsForBarrier(input.store, input.barrier);
  const existing = initialChildRuns.find((run) =>
    findSubagentRunEventByIdempotencyKey(
      input.store.listSubagentRunEvents(run.id),
      "subagent.barrier_decision",
      input.idempotencyKey,
    )
  );
  if (existing) {
    const currentBarrier = input.store.getSubagentWaitBarrier(input.barrier.id);
    const currentChildRuns = childRunsForBarrier(input.store, currentBarrier);
    const parentResolution = resolveSubagentParentPolicyForBarrierDecision(
      currentBarrier,
      currentChildRuns,
      input.decision,
    );
    const parentMailboxEvent = recordSubagentBarrierDecisionParentMailbox({
      store: input.store,
      barrier: currentBarrier,
      childRuns: currentChildRuns,
      parentResolution,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
      idempotencyKey: input.idempotencyKey,
      toolCallId: input.toolCallId,
    });
    return {
      schemaVersion: SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION,
      replay: true,
      barrier: currentBarrier,
      childRuns: currentChildRuns,
      parentResolution,
      parentMailboxEvent,
      decision: input.decision,
      ...(input.userDecision ? { userDecision: input.userDecision } : {}),
      ...(input.partialSummary ? { partialSummary: input.partialSummary } : {}),
      idempotencyKey: input.idempotencyKey,
    };
  }

  const now = input.now ?? new Date().toISOString();
  const controlResult = await executeSubagentBarrierControlDecision({
    store: input.store,
    runtime: input.runtime,
    childRuns: initialChildRuns,
    decision: input.decision,
    userDecision: input.userDecision,
    idempotencyKey: input.idempotencyKey,
    now,
    createRuntimeCancelEventEmitter: input.createRuntimeCancelEventEmitter,
    createRuntimeRetryEventEmitter: input.createRuntimeRetryEventEmitter,
  });
  assertRetryDecisionAffectedAtLeastOneChild({
    decision: input.decision,
    childRuns: initialChildRuns,
    retryRequestedRunIds: controlResult.retryRequestedRunIds ?? [],
  });
  const childRunsAfterDecision = controlResult.childRuns;
  const { barrier: resolvedBarrier, resolutionArtifact } = resolveSubagentBarrierDecisionWaitBarrier({
    store: input.store,
    barrier: input.barrier,
    childRuns: childRunsAfterDecision,
    decision: input.decision,
    userDecision: input.userDecision,
    partialSummary: input.partialSummary,
    now,
    toolCallId: input.toolCallId,
    idempotencyKey: input.idempotencyKey,
    controlState: controlResult,
  });
  const affectedChildRuns = childRunsForDecisionChildThreadSideEffects({
    decision: input.decision,
    childRuns: childRunsAfterDecision,
    retryRequestedRunIds: controlResult.retryRequestedRunIds ?? [],
    retryAcceptedRunIds: controlResult.retryAcceptedRunIds ?? [],
    detachedRunIds: controlResult.detachedRunIds,
    cancelledRunIds: controlResult.cancelledRunIds,
  });
  const runEvents = affectedChildRuns.map((run) => {
    const runEvent = input.store.appendSubagentRunEvent(run.id, {
      type: "subagent.barrier_decision",
      preview: buildSubagentBarrierDecisionRunEventPreview({
        waitBarrier: resolvedBarrier,
        decision: input.decision,
        userDecision: input.userDecision,
        partialSummary: input.partialSummary,
        idempotencyKey: input.idempotencyKey,
        toolCallId: input.toolCallId,
        controlState: controlResult,
      }),
      createdAt: now,
    });
    input.store.addMessage({
      threadId: run.childThreadId,
      role: "system",
      content: buildSubagentBarrierDecisionChildThreadMessage({
        waitBarrierId: input.barrier.id,
        decision: input.decision,
        userDecision: input.userDecision,
        partialSummary: input.partialSummary,
      }),
      metadata: {
        runtime: "ambient-subagents",
        phase: "phase-2-pi-tool-surface",
        status: "done",
        subagentRunId: run.id,
        waitBarrierId: input.barrier.id,
        decision: input.decision,
      },
    });
    return runEvent;
  });
  const parentResolution = resolveSubagentParentPolicyForBarrierDecision(
    resolvedBarrier,
    childRunsAfterDecision,
    input.decision,
  );
  const parentMailboxEvent = recordSubagentBarrierDecisionParentMailbox({
    store: input.store,
    barrier: resolvedBarrier,
    childRuns: childRunsAfterDecision,
    parentResolution,
    decision: input.decision,
    userDecision: input.userDecision,
    partialSummary: input.partialSummary,
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    createdAt: now,
    controlResult,
  });
  return {
    schemaVersion: SUBAGENT_BARRIER_DECISION_EXECUTOR_SCHEMA_VERSION,
    replay: false,
    barrier: resolvedBarrier,
    childRuns: childRunsAfterDecision,
    parentResolution,
    parentMailboxEvent,
    decision: input.decision,
    ...(input.userDecision ? { userDecision: input.userDecision } : {}),
    ...(input.partialSummary ? { partialSummary: input.partialSummary } : {}),
    idempotencyKey: input.idempotencyKey,
    resolutionArtifact,
    runEvents,
  };
}

function childRunsForBarrier(
  store: Pick<SubagentBarrierDecisionExecutorStore, "getSubagentRun">,
  barrier: SubagentWaitBarrierSummary,
): SubagentRunSummary[] {
  return barrier.childRunIds.map((childRunId) => store.getSubagentRun(childRunId));
}

function assertRetryDecisionAffectedAtLeastOneChild(input: {
  decision: SubagentBarrierDecision;
  childRuns: SubagentRunSummary[];
  retryRequestedRunIds: string[];
}): void {
  if (input.decision !== "retry_child" || input.retryRequestedRunIds.length > 0) return;
  const childStatuses = input.childRuns
    .map((run) => `${run.canonicalTaskPath}=${run.status}`)
    .join(", ") || "none";
  throw new Error([
    "Cannot record retry_child for this wait barrier because no child run is retryable.",
    "retry_child is only for failed, stopped, cancelled, timed_out, or aborted_partial child runs.",
    "If a child is needs_attention for approval or steering, answer that child request and wait on the same child instead of retrying or spawning a replacement.",
    `Child statuses: ${childStatuses}.`,
  ].join(" "));
}

function childRunsForDecisionChildThreadSideEffects(input: {
  decision: SubagentBarrierDecision;
  childRuns: SubagentRunSummary[];
  retryRequestedRunIds: string[];
  retryAcceptedRunIds: string[];
  detachedRunIds: string[];
  cancelledRunIds: string[];
}): SubagentRunSummary[] {
  const affectedIds = new Set([
    ...input.retryRequestedRunIds,
    ...input.retryAcceptedRunIds,
    ...input.detachedRunIds,
    ...input.cancelledRunIds,
  ]);
  if (affectedIds.size === 0 && recordsWholeBarrierWhenNoChildStateChanges(input.decision)) {
    for (const run of input.childRuns) affectedIds.add(run.id);
  }
  if (affectedIds.size === 0 && input.childRuns.length === 1) {
    affectedIds.add(input.childRuns[0].id);
  }
  return input.childRuns.filter((run) => affectedIds.has(run.id));
}

function recordsWholeBarrierWhenNoChildStateChanges(decision: SubagentBarrierDecision): boolean {
  return decision !== "retry_child";
}
