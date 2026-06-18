import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type {
  SubagentChildRuntimeAdapter,
  SubagentRuntimeEventEmitter,
} from "../pi/piChildSessionAdapter";
import {
  buildSubagentBarrierRetryMailboxPayload,
  buildSubagentBarrierCancelledMailboxPayload,
  buildSubagentBarrierControlPlan,
  buildSubagentBarrierControlResultArtifact,
  SUBAGENT_BARRIER_RETRY_MAILBOX_TYPE,
  shouldMarkSubagentBarrierControlRunStatus,
} from "./subagentBarrierControl";
import type { SubagentBarrierControlState } from "./subagentBarrierDecision";
import { cancelPendingParentToChildMailboxEvents, type SubagentMailboxDeliveryStore } from "./subagentMailbox";
import type { SubagentBarrierDecision } from "./subagentParentPolicyResolution";

export const SUBAGENT_BARRIER_CONTROL_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-barrier-control-executor-v1" as const;

export interface SubagentBarrierControlExecutorStore extends SubagentMailboxDeliveryStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  markSubagentRunStatus(
    runId: string,
    status: SubagentRunStatus,
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary;
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
}

export interface SubagentBarrierControlExecutionResult extends SubagentBarrierControlState {
  childRuns: SubagentRunSummary[];
}

export async function executeSubagentBarrierControlDecision(input: {
  store: SubagentBarrierControlExecutorStore;
  runtime?: Pick<SubagentChildRuntimeAdapter, "cancelChildRun" | "retryChildRun">;
  childRuns: SubagentRunSummary[];
  decision: SubagentBarrierDecision;
  userDecision?: string;
  idempotencyKey: string;
  now: string;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  createRuntimeRetryEventEmitter?: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<SubagentBarrierControlExecutionResult> {
  const controlPlan = buildSubagentBarrierControlPlan({
    childRuns: input.childRuns,
    decision: input.decision,
    userDecision: input.userDecision,
    idempotencyKey: input.idempotencyKey,
  });
  if (!controlPlan.applies) {
    return {
      childRuns: input.childRuns,
      retryRequestedRunIds: [],
      retryAcceptedRunIds: [],
      retryMailboxEventIds: [],
      detachedRunIds: [],
      cancelledRunIds: [],
      unchangedRunIds: [],
      cancelledMailboxEventIds: [],
    };
  }

  const retryRequestedRunIds: string[] = [];
  const retryAcceptedRunIds: string[] = [];
  const retryMailboxEventIds: string[] = [];
  const detachedRunIds: string[] = [];
  const cancelledRunIds: string[] = [];
  const unchangedRunIds: string[] = [];
  const cancelledMailboxEventIds: string[] = [];
  const childRuns: SubagentRunSummary[] = [];
  const runsById = new Map(input.childRuns.map((run) => [run.id, run]));

  for (const runPlan of controlPlan.runPlans) {
    const run = runsById.get(runPlan.runId);
    if (!run) continue;
    const status = runPlan.targetStatus;
    const summary = runPlan.resultSummary ?? "";
    if (runPlan.action === "unchanged" || !status) {
      if (runPlan.action === "retry") {
        const mailbox = input.store.appendSubagentMailboxEvent(run.id, {
          direction: "parent_to_child",
          type: SUBAGENT_BARRIER_RETRY_MAILBOX_TYPE,
          deliveryState: "queued",
          createdAt: input.now,
          payload: buildSubagentBarrierRetryMailboxPayload({ plan: runPlan, now: input.now }),
        });
        retryRequestedRunIds.push(run.id);
        retryMailboxEventIds.push(mailbox.id);
        const runtimeRetry = input.runtime?.retryChildRun && input.createRuntimeRetryEventEmitter
          ? await input.runtime.retryChildRun({
            run,
            message: runPlan.resultSummary ?? "",
            mailboxEvent: mailbox,
            idempotencyKey: runPlan.runtimeRetryIdempotencyKey ?? input.idempotencyKey,
            emitEvent: input.createRuntimeRetryEventEmitter(run),
            markMailboxDelivered: (now?: string) =>
              input.store.updateSubagentMailboxEventDeliveryState(mailbox.id, "delivered", { now }),
            markMailboxConsumed: (now?: string) =>
              input.store.updateSubagentMailboxEventDeliveryState(mailbox.id, "consumed", { now }),
          })
          : undefined;
        const updated = runtimeRetry?.run ?? input.store.getSubagentRun(run.id);
        if (runtimeRetry?.accepted) retryAcceptedRunIds.push(updated.id);
        childRuns.push(updated);
        continue;
      }
      unchangedRunIds.push(run.id);
      childRuns.push(run);
      continue;
    }

    const runtimeCancel = runPlan.action === "cancel" && input.runtime?.cancelChildRun
      ? await input.runtime.cancelChildRun({
        run,
        reason: summary,
        idempotencyKey: runPlan.runtimeCancelIdempotencyKey ?? input.idempotencyKey,
        emitEvent: input.createRuntimeCancelEventEmitter(run),
      })
      : undefined;
    const current = runtimeCancel?.run ?? input.store.getSubagentRun(run.id);
    const updated = shouldMarkSubagentBarrierControlRunStatus({ plan: runPlan, currentStatus: current.status })
      ? input.store.markSubagentRunStatus(run.id, status, {
        now: input.now,
        resultArtifact: buildSubagentBarrierControlResultArtifact({ plan: runPlan, status }),
      })
      : current;

    if (updated.status === "detached") {
      detachedRunIds.push(updated.id);
    } else if (updated.status === "cancelled") {
      const cancelledMailbox = cancelPendingParentToChildMailboxEvents(input.store, {
        runId: updated.id,
        now: input.now,
      });
      cancelledMailboxEventIds.push(...cancelledMailbox.events.map((event) => event.id));
      input.store.appendSubagentMailboxEvent(updated.id, {
        direction: "child_to_parent",
        type: "subagent.cancelled",
        deliveryState: "delivered",
        createdAt: input.now,
        deliveredAt: input.now,
        payload: buildSubagentBarrierCancelledMailboxPayload({ plan: runPlan, childThreadId: updated.childThreadId }),
      });
      cancelledRunIds.push(updated.id);
    } else {
      unchangedRunIds.push(updated.id);
    }
    childRuns.push(updated);
  }

  return {
    childRuns,
    retryRequestedRunIds,
    retryAcceptedRunIds,
    retryMailboxEventIds,
    detachedRunIds,
    cancelledRunIds,
    unchangedRunIds,
    cancelledMailboxEventIds,
  };
}
