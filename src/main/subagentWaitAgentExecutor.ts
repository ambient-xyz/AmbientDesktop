import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import type {
  SubagentRuntimeEventEmitter,
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeApprovalRequest,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeSupervisorRequest,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
} from "./piChildSessionAdapter";
import {
  SUBAGENT_APPROVAL_DECISIONS,
  SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
  SUBAGENT_APPROVAL_SCOPES,
  recordSubagentApprovalRequestBridgeIfNeeded,
  type SubagentApprovalDecision,
  type SubagentApprovalBridgeRecorderStore,
  type SubagentApprovalRequestBridgeRecord,
  type SubagentApprovalScope,
} from "./subagentApprovalBridge";
import { recordSubagentGroupedCompletionNotificationIfNeeded } from "./subagentGroupedCompletionRecorder";
import {
  recordSubagentSupervisorRequestIfNeeded,
  type SubagentSupervisorRequestRecord,
  type SubagentSupervisorRequestRecorderStore,
} from "./subagentSupervisorRequest";
import {
  recordSubagentTurnBudgetWrapUpSteeringIfNeeded,
  type SubagentTurnBudgetWrapUpRecorderStore,
  type SubagentTurnBudgetWrapUpSteeringRecord,
} from "./subagentTurnBudgetWrapUpRecorder";
import {
  settleSubagentTurnBudgetExhaustionIfNeeded,
  type SubagentTurnBudgetExhaustionRecorderStore,
  type SubagentTurnBudgetExhaustionSettlementRecord,
} from "./subagentTurnBudgetExhaustionRecorder";
import {
  resolveSubagentParentPolicyForWait,
  type SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";
import {
  evaluateSubagentTurnBudgetForEvents,
  type SubagentTurnBudgetState,
} from "../shared/subagentTurnBudget";
import { validateSubagentResultForRun, type SubagentResultValidation } from "./subagentResultValidation";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";
import {
  evaluateSubagentWaitBarrierForStore,
  resolveSubagentWaitBarrierForRun,
  type SubagentWaitBarrierResolutionStore,
  type SubagentWaitBarrierStoreEvaluation,
} from "./subagentWaitBarrierResolution";
import {
  recordSubagentWaitBarrierAttentionParentMailboxIfNeeded,
  type SubagentWaitBarrierAttentionRecorderStore,
} from "./subagentWaitBarrierAttentionRecorder";
import {
  recordSubagentWaitCompletionMailboxIfNeeded,
  type SubagentWaitCompletionRecorderStore,
} from "./subagentWaitCompletionRecorder";
import { listSubagentMailboxEventsForDelivery } from "./subagentMailbox";

export const SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-wait-agent-executor-v1" as const;

export type SubagentWaitAgentExecutorAction = "status_agent" | "wait_agent";

export interface SubagentWaitAgentExecutorStore
  extends SubagentWaitBarrierResolutionStore,
    SubagentWaitCompletionRecorderStore,
    SubagentWaitBarrierAttentionRecorderStore,
    SubagentSupervisorRequestRecorderStore,
    SubagentTurnBudgetWrapUpRecorderStore,
    SubagentTurnBudgetExhaustionRecorderStore,
    SubagentApprovalBridgeRecorderStore {
  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary;
  upsertSubagentGroupedCompletionNotification(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunSummary["status"];
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary;
}

export interface ExecuteSubagentWaitAgentInput {
  store: SubagentWaitAgentExecutorStore;
  action: SubagentWaitAgentExecutorAction;
  run: SubagentRunSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  waitChildRuns?: SubagentRunSummary[];
  timeoutMs: number;
  explicitIdempotencyKey?: string;
  waitForChildRun?: (input: SubagentChildRuntimeWaitInput) => Promise<SubagentChildRuntimeWaitResult> | SubagentChildRuntimeWaitResult;
  resolveChildApprovalResponse?: (input: SubagentChildRuntimeApprovalResponseInput) => Promise<SubagentChildRuntimeApprovalResponseResult> | SubagentChildRuntimeApprovalResponseResult;
  followupChildRun?: (input: SubagentChildRuntimeFollowupInput) => Promise<SubagentChildRuntimeFollowupResult> | SubagentChildRuntimeFollowupResult;
  createRuntimeWaitEventEmitter?: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}

export interface SubagentApprovalResponseDeliveryRecord {
  run: SubagentRunSummary;
  mailboxEvent: SubagentMailboxEventSummary;
  accepted: boolean;
  message?: string;
}

export interface SubagentTurnBudgetWrapUpDeliveryRecord {
  run: SubagentRunSummary;
  mailboxEvent: SubagentMailboxEventSummary;
  accepted: boolean;
  message?: string;
}

export interface SubagentWaitAgentExecutionResult {
  schemaVersion: typeof SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION;
  action: SubagentWaitAgentExecutorAction;
  run: SubagentRunSummary;
  events: SubagentRunEventSummary[];
  mailboxEvents: SubagentMailboxEventSummary[];
  waitBarrier?: SubagentWaitBarrierSummary;
  waitChildRuns: SubagentRunSummary[];
  waitTimedOut: boolean;
  waitSatisfied: boolean;
  waitNotice?: string;
  parentSynthesisAllowed: boolean;
  resultValidation: SubagentResultValidation;
  waitBarrierEvaluation?: SubagentWaitBarrierStoreEvaluation;
  groupedCompletionNotification?: SubagentParentMailboxEventSummary;
  parentResolution?: SubagentParentPolicyResolution;
  approvalRequestRecords: SubagentApprovalRequestBridgeRecord[];
  supervisorRequestRecords: SubagentSupervisorRequestRecord[];
  waitBarrierAttentionParentMailbox?: SubagentParentMailboxEventSummary;
  waitCompletionMailbox?: SubagentMailboxEventSummary;
  approvalResponseDeliveries: SubagentApprovalResponseDeliveryRecord[];
  approvalResponsePendingEvents: SubagentMailboxEventSummary[];
  turnBudgetState: SubagentTurnBudgetState;
  turnBudgetExhaustionSettlement?: SubagentTurnBudgetExhaustionSettlementRecord;
  turnBudgetWrapUpSteering?: SubagentTurnBudgetWrapUpSteeringRecord;
  turnBudgetWrapUpDelivery?: SubagentTurnBudgetWrapUpDeliveryRecord;
}

export async function executeSubagentWaitAgent(
  input: ExecuteSubagentWaitAgentInput,
): Promise<SubagentWaitAgentExecutionResult> {
  let run = input.run;
  let waitTimedOut = false;
  let waitBarrier = input.waitBarrier;
  let approvalRequests: readonly SubagentChildRuntimeApprovalRequest[] = [];
  let supervisorRequests: readonly SubagentChildRuntimeSupervisorRequest[] = [];
  let approvalResponseDeliveries: SubagentApprovalResponseDeliveryRecord[] = [];
  let approvalResponsePendingEvents: SubagentMailboxEventSummary[] = [];
  let turnBudgetWrapUpDelivery: SubagentTurnBudgetWrapUpDeliveryRecord | undefined;
  let turnBudgetExhaustionSettlement: SubagentTurnBudgetExhaustionSettlementRecord | undefined;

  if (input.action === "wait_agent" && !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status) && input.waitForChildRun) {
    if (!input.createRuntimeWaitEventEmitter) {
      throw new Error("wait_agent runtime waits require a runtime event emitter.");
    }
    const approvalResponseDelivery = await deliverQueuedApprovalResponses({
      store: input.store,
      run,
      resolveChildApprovalResponse: input.resolveChildApprovalResponse,
      createRuntimeWaitEventEmitter: input.createRuntimeWaitEventEmitter,
    });
    run = approvalResponseDelivery.run;
    approvalResponseDeliveries = approvalResponseDelivery.deliveries;
    approvalResponsePendingEvents = approvalResponseDelivery.pendingEvents;
    const result = await input.waitForChildRun({
      run,
      timeoutMs: input.timeoutMs,
      emitEvent: input.createRuntimeWaitEventEmitter(run),
    });
    run = result.run;
    waitTimedOut = result.timedOut;
    approvalRequests = result.approvalRequests ?? [];
    supervisorRequests = result.supervisorRequests ?? [];
    approvalResponsePendingEvents = pendingApprovalResponseMailboxEvents(input.store, run.id);
  } else if (input.action === "wait_agent") {
    approvalResponsePendingEvents = pendingApprovalResponseMailboxEvents(input.store, run.id);
  }

  const approvalRequestRecords = input.action === "wait_agent"
    ? approvalRequests.map((approval) => recordSubagentApprovalRequestBridgeIfNeeded({
      store: input.store,
      run,
      approval,
      ...(waitBarrier ? { waitBarrier } : {}),
      ...(approval.createdAt ? { createdAt: approval.createdAt } : {}),
      ...(approval.idempotencyKey ? { explicitIdempotencyKey: approval.idempotencyKey } : {}),
    }))
    : [];
  const supervisorRequestRecords = input.action === "wait_agent"
    ? supervisorRequests.map((request) => recordSubagentSupervisorRequestIfNeeded({
      store: input.store,
      run,
      request,
      ...(waitBarrier ? { waitBarrier } : {}),
      ...(request.createdAt ? { createdAt: request.createdAt } : {}),
      ...(request.idempotencyKey ? { explicitIdempotencyKey: request.idempotencyKey } : {}),
    }))
    : [];
  const deliveredApprovalResponseThisWait = approvalResponseDeliveries.some((record) => record.accepted);
  const waitTimedOutResolvesBarrier = waitTimedOut && !deliveredApprovalResponseThisWait;

  let events = input.store.listSubagentRunEvents(run.id);
  let mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
  let turnBudgetState = evaluateSubagentTurnBudgetForEvents({ role: run.roleProfileSnapshot, events });
  turnBudgetExhaustionSettlement = input.action === "wait_agent"
    ? settleSubagentTurnBudgetExhaustionIfNeeded({
      store: input.store,
      run,
      turnBudgetState,
    })
    : undefined;
  if (turnBudgetExhaustionSettlement) {
    run = turnBudgetExhaustionSettlement.run;
    events = input.store.listSubagentRunEvents(run.id);
    mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
    turnBudgetState = evaluateSubagentTurnBudgetForEvents({ role: run.roleProfileSnapshot, events });
  }

  if (waitBarrier) {
    waitBarrier = resolveSubagentWaitBarrierForRun({
      store: input.store,
      waitBarrier,
      run,
      timedOut: waitTimedOutResolvesBarrier,
    });
  }

  let turnBudgetWrapUpSteering = input.action === "wait_agent" && !turnBudgetExhaustionSettlement
    ? recordSubagentTurnBudgetWrapUpSteeringIfNeeded({
      store: input.store,
      run,
      turnBudgetState,
    })
    : undefined;
  if (turnBudgetWrapUpSteering) {
    turnBudgetWrapUpDelivery = await deliverTurnBudgetWrapUpSteering({
      store: input.store,
      run,
      steering: turnBudgetWrapUpSteering,
      followupChildRun: input.followupChildRun,
      createRuntimeWaitEventEmitter: input.createRuntimeWaitEventEmitter,
    });
    if (turnBudgetWrapUpDelivery) {
      run = turnBudgetWrapUpDelivery.run;
      turnBudgetWrapUpSteering = {
        ...turnBudgetWrapUpSteering,
        mailboxEvent: turnBudgetWrapUpDelivery.mailboxEvent,
      };
    }
    events = input.store.listSubagentRunEvents(run.id);
    mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
    turnBudgetState = evaluateSubagentTurnBudgetForEvents({ role: run.roleProfileSnapshot, events });
  }
  const resultValidation = validateSubagentResultForRun(run, events);
  const waitBarrierEvaluation = input.action === "wait_agent" && waitBarrier
    ? evaluateSubagentWaitBarrierForStore({
      store: input.store,
      waitBarrier,
      timedOut: waitTimedOutResolvesBarrier,
    })
    : undefined;
  const groupedCompletionNotification = input.action === "wait_agent"
    ? recordSubagentGroupedCompletionNotificationIfNeeded({
      store: input.store,
      run,
      synthesisAllowed: resultValidation.synthesisAllowed,
    })
    : undefined;
  const parentResolution = input.action === "wait_agent" && waitBarrier
    ? resolveSubagentParentPolicyForWait({
      run,
      waitBarrier,
      waitTimedOut: waitTimedOutResolvesBarrier,
      synthesisAllowed: waitBarrierEvaluation?.synthesisAllowed ?? resultValidation.synthesisAllowed,
      partial: waitBarrierEvaluation?.partial ?? resultValidation.partial,
      validationReason: waitBarrierEvaluation?.reason ?? resultValidation.reason,
    })
    : undefined;
  const waitBarrierAttentionParentMailbox = input.action === "wait_agent" && waitBarrier && parentResolution
    ? recordSubagentWaitBarrierAttentionParentMailboxIfNeeded({
      store: input.store,
      run,
      waitBarrier,
      waitTimedOut: waitTimedOutResolvesBarrier,
      waitBarrierEvaluation,
      resultValidation,
      parentResolution,
    })
    : undefined;
  const parentSynthesisAllowed = parentResolution?.canSynthesize ?? resultValidation.synthesisAllowed;
  const waitSatisfied = input.action === "wait_agent" && waitBarrier
    ? waitBarrier.status !== "waiting_on_children"
    : SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status);
  const waitNotice = input.action === "wait_agent" && approvalRequestRecords.length > 0
    ? "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child."
    : input.action === "wait_agent" && supervisorRequestRecords.some((record) => record.parentRequiresAttention)
    ? "Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe."
    : input.action === "wait_agent" && supervisorRequestRecords.length > 0
    ? "Child sent a supervisor progress update; parent mailbox records the update while the parent keeps monitoring the child."
    : input.action === "wait_agent" && approvalResponseDeliveries.some((record) => record.accepted)
    ? "Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result."
    : input.action === "wait_agent" && turnBudgetExhaustionSettlement
    ? `Child turn budget is exhausted; child was settled as ${turnBudgetExhaustionSettlement.status} with the transcript retained at ${turnBudgetExhaustionSettlement.artifactPath}.`
    : input.action === "wait_agent" && turnBudgetState.exhausted && !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status)
    ? "Child turn budget is exhausted; parent must resolve partial or failure policy before synthesis."
    : input.action === "wait_agent" && turnBudgetWrapUpDelivery?.accepted
    ? "Child is at its turn-budget wrap-up threshold; the wrap-up follow-up was delivered to the child runtime and the parent remains blocked until a synthesis-safe result or partial policy resolves."
    : input.action === "wait_agent" && turnBudgetWrapUpDelivery && !turnBudgetWrapUpDelivery.accepted
    ? `Child is at its turn-budget wrap-up threshold; the wrap-up follow-up remains queued. ${turnBudgetWrapUpDelivery.message ?? "Parent remains blocked until a synthesis-safe result or partial policy resolves."}`
    : input.action === "wait_agent" && turnBudgetState.shouldSteerWrapUp
    ? "Child is at its turn-budget wrap-up threshold; a wrap-up follow-up is queued for the child and the parent remains blocked until a synthesis-safe result or partial policy resolves."
    : input.action === "wait_agent" && waitTimedOut
    ? "wait_agent timed out before the child reached a terminal status."
    : input.action === "wait_agent" && approvalResponsePendingEvents.length > 0 && !input.resolveChildApprovalResponse
    ? "Child approval response is queued, but no live child approval-response runtime is attached; parent remains blocked on this child."
    : input.action === "wait_agent" && run.status !== "needs_attention" &&
      !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status) && !input.waitForChildRun
    ? "No live child executor is attached; wait_agent returns the latest reservation/mailbox state without fabricating a result."
    : undefined;
  const waitCompletionMailbox = input.action === "wait_agent"
    ? recordSubagentWaitCompletionMailboxIfNeeded({
      store: input.store,
      run,
      waitBarrier,
      waitTimedOut,
      resultValidation,
      waitBarrierEvaluation,
      parentResolution,
      explicitIdempotencyKey: input.explicitIdempotencyKey,
    })
    : undefined;
  if (waitCompletionMailbox) {
    events = input.store.listSubagentRunEvents(run.id);
    mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
    turnBudgetState = evaluateSubagentTurnBudgetForEvents({ role: run.roleProfileSnapshot, events });
  }

  return {
    schemaVersion: SUBAGENT_WAIT_AGENT_EXECUTOR_SCHEMA_VERSION,
    action: input.action,
    run,
    events,
    mailboxEvents,
    ...(waitBarrier ? { waitBarrier } : {}),
    waitChildRuns: input.waitChildRuns ?? [run],
    waitTimedOut,
    waitSatisfied,
    ...(waitNotice ? { waitNotice } : {}),
    parentSynthesisAllowed,
    resultValidation,
    ...(waitBarrierEvaluation ? { waitBarrierEvaluation } : {}),
    ...(groupedCompletionNotification ? { groupedCompletionNotification } : {}),
    ...(parentResolution ? { parentResolution } : {}),
    approvalRequestRecords,
    supervisorRequestRecords,
    approvalResponseDeliveries,
    approvalResponsePendingEvents,
    turnBudgetState,
    ...(turnBudgetExhaustionSettlement ? { turnBudgetExhaustionSettlement } : {}),
    ...(turnBudgetWrapUpSteering ? { turnBudgetWrapUpSteering } : {}),
    ...(turnBudgetWrapUpDelivery ? { turnBudgetWrapUpDelivery } : {}),
    ...(waitBarrierAttentionParentMailbox ? { waitBarrierAttentionParentMailbox } : {}),
    ...(waitCompletionMailbox ? { waitCompletionMailbox } : {}),
  };
}

async function deliverTurnBudgetWrapUpSteering(input: {
  store: SubagentWaitAgentExecutorStore;
  run: SubagentRunSummary;
  steering: SubagentTurnBudgetWrapUpSteeringRecord;
  followupChildRun?: (input: SubagentChildRuntimeFollowupInput) => Promise<SubagentChildRuntimeFollowupResult> | SubagentChildRuntimeFollowupResult;
  createRuntimeWaitEventEmitter?: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<SubagentTurnBudgetWrapUpDeliveryRecord | undefined> {
  const mailboxEvent = input.steering.mailboxEvent;
  if (!mailboxEvent || !input.followupChildRun || !isDeliverableParentToChildMailbox(mailboxEvent)) {
    return undefined;
  }
  if (!input.createRuntimeWaitEventEmitter) {
    throw new Error("turn-budget wrap-up runtime delivery requires a runtime event emitter.");
  }
  const result = await input.followupChildRun({
    run: input.run,
    message: input.steering.message,
    mailboxEvent,
    idempotencyKey: input.steering.idempotencyKey,
    emitEvent: input.createRuntimeWaitEventEmitter(input.run),
    markMailboxDelivered: (now?: string) =>
      input.store.updateSubagentMailboxEventDeliveryState(mailboxEvent.id, "delivered", { now }),
    markMailboxConsumed: (now?: string) =>
      input.store.updateSubagentMailboxEventDeliveryState(mailboxEvent.id, "consumed", { now }),
  });
  const latestMailbox = result.mailboxEvent ??
    input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === mailboxEvent.id) ??
    mailboxEvent;
  return {
    run: result.run,
    mailboxEvent: latestMailbox,
    accepted: result.accepted,
    ...(result.message ? { message: result.message } : {}),
  };
}

function isDeliverableParentToChildMailbox(mailboxEvent: SubagentMailboxEventSummary): boolean {
  return mailboxEvent.direction === "parent_to_child" &&
    mailboxEvent.type === "subagent.followup" &&
    (mailboxEvent.deliveryState === "queued" || mailboxEvent.deliveryState === "delivered");
}

async function deliverQueuedApprovalResponses(input: {
  store: SubagentWaitAgentExecutorStore;
  run: SubagentRunSummary;
  resolveChildApprovalResponse?: (input: SubagentChildRuntimeApprovalResponseInput) => Promise<SubagentChildRuntimeApprovalResponseResult> | SubagentChildRuntimeApprovalResponseResult;
  createRuntimeWaitEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<{
  run: SubagentRunSummary;
  deliveries: SubagentApprovalResponseDeliveryRecord[];
  pendingEvents: SubagentMailboxEventSummary[];
}> {
  let run = input.run;
  const deliveries: SubagentApprovalResponseDeliveryRecord[] = [];
  const pending = pendingApprovalResponseMailboxEvents(input.store, run.id);
  if (!pending.length || !input.resolveChildApprovalResponse) {
    return { run, deliveries, pendingEvents: pending };
  }

  for (const mailboxEvent of pending) {
    const payload = approvalResponsePayload(mailboxEvent.payload, run);
    if (!payload) {
      const failedMailbox = input.store.updateSubagentMailboxEventDeliveryState(mailboxEvent.id, "failed");
      input.store.appendSubagentRunEvent(run.id, {
        type: "subagent.approval_response.delivery_failed",
        preview: {
          mailboxEventId: failedMailbox.id,
          deliveryState: failedMailbox.deliveryState,
          reason: "malformed_approval_response_payload",
        },
      });
      deliveries.push({
        run,
        mailboxEvent: failedMailbox,
        accepted: false,
        message: "Child approval response payload was malformed and could not be delivered.",
      });
      continue;
    }

    const result = await input.resolveChildApprovalResponse({
      run,
      mailboxEvent,
      approvalId: payload.approvalId,
      decision: payload.decision,
      effectiveScope: payload.effectiveScope,
      idempotencyKey: payload.idempotencyKey,
      emitEvent: input.createRuntimeWaitEventEmitter(run),
      markMailboxDelivered: (now?: string) =>
        input.store.updateSubagentMailboxEventDeliveryState(mailboxEvent.id, "delivered", { now }),
      markMailboxConsumed: (now?: string) =>
        input.store.updateSubagentMailboxEventDeliveryState(mailboxEvent.id, "consumed", { now }),
    });
    const latestMailbox = result.mailboxEvent ??
      input.store.listSubagentMailboxEvents(run.id).find((event) => event.id === mailboxEvent.id) ??
      mailboxEvent;
    run = result.run;
    deliveries.push({
      run,
      mailboxEvent: latestMailbox,
      accepted: result.accepted,
      ...(result.message ? { message: result.message } : {}),
    });
  }

  return {
    run,
    deliveries,
    pendingEvents: pendingApprovalResponseMailboxEvents(input.store, run.id),
  };
}

function pendingApprovalResponseMailboxEvents(
  store: Pick<SubagentWaitAgentExecutorStore, "listSubagentMailboxEvents">,
  runId: string,
): SubagentMailboxEventSummary[] {
  return listSubagentMailboxEventsForDelivery(store, {
    runId,
    direction: "parent_to_child",
    type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
    deliveryStates: ["queued", "delivered"],
  });
}

function approvalResponsePayload(
  value: unknown,
  run: Pick<SubagentRunSummary, "id" | "childThreadId">,
): {
  approvalId: string;
  decision: SubagentApprovalDecision;
  effectiveScope: SubagentApprovalScope;
  idempotencyKey: string;
} | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const childRunId = optionalString(record?.childRunId);
  const childThreadId = optionalString(record?.childThreadId);
  const approvalId = optionalString(record?.approvalId);
  const decision = enumMember(SUBAGENT_APPROVAL_DECISIONS, record?.decision);
  const effectiveScope = enumMember(SUBAGENT_APPROVAL_SCOPES, record?.effectiveScope);
  const idempotencyKey = optionalString(record?.idempotencyKey);
  if (childRunId !== run.id || childThreadId !== run.childThreadId) return undefined;
  if (!approvalId || !decision || !effectiveScope || !idempotencyKey) return undefined;
  return { approvalId, decision, effectiveScope, idempotencyKey };
}

function enumMember<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? value as T : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
