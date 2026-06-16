import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeCancelResult,
  SubagentRuntimeEventEmitter,
} from "./piChildSessionAdapter";
import { findSubagentRunEventByIdempotencyKey } from "./subagentIdempotency";
import {
  buildSubagentCancelAgentChildThreadMessage,
  buildSubagentCancelAgentParentMailboxDraft,
  buildSubagentCancelAgentResultArtifact,
  buildSubagentCancelRequestedRunEventPreview,
  resolveSubagentCancelAgentRequest,
  shouldMarkSubagentCancelAgentRunCancelled,
  shouldPreserveInitialTerminalSubagentCancelRun,
  SUBAGENT_CANCEL_REQUEST_EVENT_TYPE,
} from "./subagentCancelAgent";
import {
  cancelPendingParentToChildMailboxEvents,
  type SubagentMailboxDeliveryBatchResult,
  type SubagentMailboxDeliveryStore,
} from "./subagentMailbox";
import {
  resolveActiveSubagentWaitBarriersForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierResolutionStore,
} from "./subagentWaitBarrierResolution";

export const SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-cancel-agent-executor-v1" as const;

export interface SubagentCancelAgentExecutorStore
  extends SubagentWaitBarrierResolutionStore, SubagentMailboxDeliveryStore {
  markSubagentRunStatus(
    runId: string,
    status: Extract<SubagentRunStatus, "cancelled">,
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary;
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

export interface SubagentCancelAgentExecutionResult {
  schemaVersion: typeof SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION;
  replay: boolean;
  run: SubagentRunSummary;
  reason: string;
  idempotencyKey: string;
  waitBarriers: SubagentWaitBarrierSummary[];
  runtimeCancel?: SubagentChildRuntimeCancelResult;
  cancelledMailbox?: SubagentMailboxDeliveryBatchResult;
  runEvent?: SubagentRunEventSummary;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
}

export async function executeSubagentCancelAgent(input: {
  store: SubagentCancelAgentExecutorStore;
  runtime?: Pick<SubagentChildRuntimeAdapter, "cancelChildRun">;
  run: SubagentRunSummary;
  reason?: string;
  idempotencyKey?: string;
  toolCallId: string;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<SubagentCancelAgentExecutionResult> {
  const request = resolveSubagentCancelAgentRequest({
    run: input.run,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const { reason, idempotencyKey } = request;
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_CANCEL_REQUEST_EVENT_TYPE,
    idempotencyKey,
  );
  if (existing || input.run.status === "cancelled") {
    return {
      schemaVersion: SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION,
      replay: true,
      run: input.store.getSubagentRun(input.run.id),
      reason,
      idempotencyKey,
      waitBarriers: [],
    };
  }

  const runtimeCancel = input.runtime?.cancelChildRun
    ? await input.runtime.cancelChildRun({
      run: input.run,
      reason,
      idempotencyKey,
      emitEvent: input.createRuntimeCancelEventEmitter(input.run),
    })
    : undefined;
  const currentAfterRuntimeCancel = runtimeCancel?.run ?? input.store.getSubagentRun(input.run.id);
  let cancelled: SubagentRunSummary;
  if (shouldMarkSubagentCancelAgentRunCancelled({
    initialStatus: input.run.status,
    currentStatus: currentAfterRuntimeCancel.status,
  })) {
    cancelled = input.store.markSubagentRunStatus(input.run.id, "cancelled", {
      resultArtifact: buildSubagentCancelAgentResultArtifact({ run: input.run, reason }),
    });
  } else if (shouldPreserveInitialTerminalSubagentCancelRun({
    initialStatus: input.run.status,
    currentStatus: currentAfterRuntimeCancel.status,
  })) {
    cancelled = input.run;
  } else {
    cancelled = currentAfterRuntimeCancel;
  }

  const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
    store: input.store,
    run: cancelled,
    evidence: {
      schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
      kind: "child_cancelled",
      source: "cancel_agent",
      childRunId: cancelled.id,
      reason,
      idempotencyKey,
    },
  });
  const cancelledMailbox = cancelled.status === "cancelled"
    ? cancelPendingParentToChildMailboxEvents(input.store, {
      runId: cancelled.id,
    })
    : undefined;
  const runEvent = input.store.appendSubagentRunEvent(cancelled.id, {
    type: SUBAGENT_CANCEL_REQUEST_EVENT_TYPE,
    preview: buildSubagentCancelRequestedRunEventPreview({
      run: cancelled,
      idempotencyKey,
      reason,
      toolCallId: input.toolCallId,
      waitBarriers,
      ...(cancelledMailbox ? { cancelledMailboxEvents: cancelledMailbox.events } : {}),
    }),
  });
  const parentMailboxEvent = cancelled.status === "cancelled" && cancelledMailbox
    ? input.store.appendSubagentParentMailboxEvent(buildSubagentCancelAgentParentMailboxDraft({
      run: cancelled,
      previousStatus: input.run.status,
      reason,
      resultArtifact: cancelled.resultArtifact,
      toolCallId: input.toolCallId,
      waitBarriers,
      cancelledMailboxEvents: cancelledMailbox.events,
      idempotencyKey,
    }).parentMailboxInput)
    : undefined;

  input.store.addMessage({
    threadId: cancelled.childThreadId,
    role: "system",
    content: buildSubagentCancelAgentChildThreadMessage({ reason }),
    metadata: {
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      status: "cancelled",
      subagentRunId: cancelled.id,
    },
  });

  return {
    schemaVersion: SUBAGENT_CANCEL_AGENT_EXECUTOR_SCHEMA_VERSION,
    replay: false,
    run: cancelled,
    reason,
    idempotencyKey,
    waitBarriers,
    ...(runtimeCancel ? { runtimeCancel } : {}),
    ...(cancelledMailbox ? { cancelledMailbox } : {}),
    runEvent,
    ...(parentMailboxEvent ? { parentMailboxEvent } : {}),
  };
}
