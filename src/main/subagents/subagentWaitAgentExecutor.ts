import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type {
  SubagentRuntimeEventEmitter,
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeApprovalRequest,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeSupervisorRequest,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitOutcome,
  SubagentChildRuntimeWaitResult,
} from "./subagentPiRuntimeFacade";
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
} from "../../shared/subagentTurnBudget";
import { validateSubagentResultForRun, type SubagentResultValidation } from "./subagentResultValidation";
import {
  subagentResultRepairStateForRun,
  type SubagentResultRepairState,
} from "./subagentResultRepairState";
import {
  subagentRuntimeTimeoutKindFromReason,
  SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES,
} from "./subagentWaitBarrierEvaluation";
import {
  evaluateSubagentWaitBarrierForStore,
  resolveSubagentWaitBarrierForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
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

export interface SubagentWaitBarrierBlocker {
  childRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  roleId: string;
  status: SubagentRunSummary["status"];
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  blockingState: "active" | "terminal_unsafe" | "not_synthesis_safe";
  synthesisAllowed: boolean;
  partial: boolean;
  lastActivityAt: string;
  lastActivitySource: string;
  lastActivityDetail?: string;
  reason?: string;
  approvalRequest?: SubagentWaitBarrierBlockerApprovalRequest;
  resultRepairState?: SubagentResultRepairState;
}

export interface SubagentWaitBarrierBlockerApprovalRequest {
  approvalId: string;
  title?: string;
  requestedAction?: string;
  requestedToolId?: string;
  requestedToolCategory?: string;
  requestedScope?: string;
  effectiveScope?: string;
  promptPreview?: string;
  allowedNextActions: string[];
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
  waitSessionExpired: boolean;
  waitBarrierTerminalInspection: boolean;
  waitOutcome?: SubagentChildRuntimeWaitOutcome;
  waitSatisfied: boolean;
  waitNotice?: string;
  parentSynthesisAllowed: boolean;
  resultValidation: SubagentResultValidation;
  waitBarrierEvaluation?: SubagentWaitBarrierStoreEvaluation;
  waitBarrierBlockers: SubagentWaitBarrierBlocker[];
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
  let waitChildRuns = input.waitChildRuns ?? [run];
  let waitTimedOut = false;
  let waitSessionExpired = false;
  let waitTimedOutResolvesBarrier = false;
  let waitOutcome: SubagentChildRuntimeWaitOutcome | undefined;
  let waitBarrier = input.waitBarrier;
  let approvalRequests: readonly SubagentChildRuntimeApprovalRequest[] = [];
  let supervisorRequests: readonly SubagentChildRuntimeSupervisorRequest[] = [];
  let approvalResponseDeliveries: SubagentApprovalResponseDeliveryRecord[] = [];
  let approvalResponsePendingEvents: SubagentMailboxEventSummary[] = [];
  let turnBudgetWrapUpDelivery: SubagentTurnBudgetWrapUpDeliveryRecord | undefined;
  let turnBudgetExhaustionSettlement: SubagentTurnBudgetExhaustionSettlementRecord | undefined;
  const liveWaitAllowed =
    input.action === "wait_agent" &&
    (!waitBarrier || waitBarrier.status === "waiting_on_children");
  const waitBarrierTerminalInspection =
    input.action === "wait_agent" &&
    Boolean(waitBarrier && waitBarrier.status !== "waiting_on_children");

  const runtimeWaitRun = liveWaitAllowed
    ? resolveSubagentRuntimeWaitRun({ requestedRun: run, waitBarrier, waitChildRuns })
    : run;

  if (liveWaitAllowed && !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(runtimeWaitRun.status) && input.waitForChildRun) {
    if (!input.createRuntimeWaitEventEmitter) {
      throw new Error("wait_agent runtime waits require a runtime event emitter.");
    }
    const parentWaitDeadline = Date.now() + Math.max(0, input.timeoutMs);
    let nextRuntimeWaitRun = runtimeWaitRun;
    let waitIteration = 0;
    while (!SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(nextRuntimeWaitRun.status)) {
      const remainingWaitMs = Math.max(0, parentWaitDeadline - Date.now());
      if (waitIteration > 0 && remainingWaitMs <= 0) {
        run = nextRuntimeWaitRun;
        waitOutcome = { kind: "progress_return", reason: "parent_wait_window_elapsed" };
        waitSessionExpired = true;
        waitTimedOut = false;
        waitTimedOutResolvesBarrier = false;
        break;
      }

      const approvalResponseDelivery = await deliverQueuedApprovalResponses({
        store: input.store,
        run: nextRuntimeWaitRun,
        resolveChildApprovalResponse: input.resolveChildApprovalResponse,
        createRuntimeWaitEventEmitter: input.createRuntimeWaitEventEmitter,
      });
      run = approvalResponseDelivery.run;
      waitChildRuns = replaceSubagentWaitChildRun(waitChildRuns, run);
      approvalResponseDeliveries = approvalResponseDeliveries.concat(approvalResponseDelivery.deliveries);
      approvalResponsePendingEvents = approvalResponseDelivery.pendingEvents;

      const result = await input.waitForChildRun({
        run,
        timeoutMs: waitIteration === 0 ? input.timeoutMs : remainingWaitMs,
        emitEvent: input.createRuntimeWaitEventEmitter(run),
      });
      waitIteration += 1;
      run = result.run;
      waitChildRuns = replaceSubagentWaitChildRun(waitChildRuns, run);
      waitOutcome = normalizeSubagentChildRuntimeWaitOutcome(result);
      waitSessionExpired = waitOutcome.kind === "progress_return";
      waitTimedOut = waitOutcome.kind === "child_runtime_timeout" || (result.timedOut && !result.outcome);
      approvalRequests = result.approvalRequests ?? [];
      supervisorRequests = result.supervisorRequests ?? [];
      approvalResponsePendingEvents = pendingApprovalResponseMailboxEvents(input.store, run.id);
      const deliveredApprovalResponseForRun = approvalResponseDelivery.deliveries.some((record) => record.accepted);
      waitTimedOutResolvesBarrier = waitTimedOut && !deliveredApprovalResponseForRun;

      const waitBarrierTransitionEvidence = buildWaitBarrierTransitionEvidenceForWaitAgent({
        run,
        waitOutcome,
        runtimeTimeoutResolvesBarrier: waitTimedOutResolvesBarrier,
        explicitIdempotencyKey: input.explicitIdempotencyKey,
      });
      if (waitBarrier) {
        waitBarrier = resolveSubagentWaitBarrierForRun({
          store: input.store,
          waitBarrier,
          run,
          evidence: waitBarrierTransitionEvidence,
        });
      }

      if (
        waitSessionExpired ||
        waitTimedOut ||
        approvalRequests.length > 0 ||
        supervisorRequests.length > 0 ||
        !waitBarrier ||
        waitBarrier.status !== "waiting_on_children"
      ) {
        break;
      }

      nextRuntimeWaitRun = resolveSubagentRuntimeWaitRun({
        requestedRun: run,
        waitBarrier,
        waitChildRuns,
      });
    }
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
  let events = input.store.listSubagentRunEvents(run.id);
  let mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
  let turnBudgetState = evaluateSubagentTurnBudgetForEvents({ role: run.roleProfileSnapshot, events });
  turnBudgetExhaustionSettlement = liveWaitAllowed
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

  const waitBarrierTransitionEvidence = buildWaitBarrierTransitionEvidenceForWaitAgent({
    run,
    waitOutcome,
    runtimeTimeoutResolvesBarrier: waitTimedOutResolvesBarrier,
    explicitIdempotencyKey: input.explicitIdempotencyKey,
  });
  if (waitBarrier) {
    waitBarrier = resolveSubagentWaitBarrierForRun({
      store: input.store,
      waitBarrier,
      run,
      evidence: waitBarrierTransitionEvidence,
    });
  }
  const waitBarrierTimedOutForPolicy = waitTimedOutResolvesBarrier || waitBarrier?.status === "timed_out";
  const waitBarrierTerminalEvidence = waitTimedOutResolvesBarrier
    ? {
      kind: "child_runtime_timeout" as const,
      childRunId: run.id,
      ...(waitOutcome?.reason ? { reason: waitOutcome.reason } : {}),
    }
    : waitBarrier?.status === "timed_out"
      ? {
        kind: "child_runtime_timeout" as const,
        reason: "barrier_already_timed_out",
      }
      : undefined;

  let turnBudgetWrapUpSteering = liveWaitAllowed && !turnBudgetExhaustionSettlement
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
  const waitBarrierEvaluation = waitBarrier
    ? evaluateSubagentWaitBarrierForStore({
      store: input.store,
      waitBarrier,
      ...(waitBarrierTerminalEvidence ? { terminalEvidence: waitBarrierTerminalEvidence } : {}),
    })
    : undefined;
  const waitBarrierBlockers = waitBarrierEvaluation
    ? buildSubagentWaitBarrierBlockers({
      store: input.store,
      waitBarrierEvaluation,
    })
    : [];
  const groupedCompletionNotification = input.action === "wait_agent"
    ? recordSubagentGroupedCompletionNotificationIfNeeded({
      store: input.store,
      run,
      synthesisAllowed: resultValidation.synthesisAllowed,
    })
    : undefined;
  const parentResolution = waitBarrier
    ? resolveSubagentParentPolicyForWait({
      run,
      waitBarrier,
      waitTimedOut: waitBarrierTimedOutForPolicy,
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
      waitTimedOut: waitBarrierTimedOutForPolicy,
      waitChildRuns,
      waitBarrierEvaluation,
      resultValidation,
      parentResolution,
    })
    : undefined;
  const parentSynthesisAllowed = parentResolution?.canSynthesize ?? resultValidation.synthesisAllowed;
  const waitSatisfied = waitBarrier
    ? waitBarrier.status !== "waiting_on_children"
    : SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status);
  const waitNotice = input.action === "wait_agent" && approvalRequestRecords.length > 0
    ? "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child."
    : waitBarrierTerminalInspection
    ? "wait_agent inspected an already-terminal wait barrier; it did not attach to, restart, or reopen the child runtime. Use parentResolution and resolve_barrier to retry, fail, detach, cancel, or continue with an explicit partial result."
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
    : input.action === "wait_agent" && waitSessionExpired
    ? "wait_agent returned a progress update while the child runtime remains active; the parent remains blocked on this child."
    : input.action === "wait_agent" && run.status !== "needs_attention" &&
      !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status) && !input.waitForChildRun
    ? "No live child executor is attached; wait_agent returns the latest reservation/mailbox state without fabricating a result."
    : undefined;
  const waitCompletionMailbox = input.action === "wait_agent"
    ? recordSubagentWaitCompletionMailboxIfNeeded({
      store: input.store,
      run,
      waitBarrier,
      waitTimedOut: waitBarrierTimedOutForPolicy,
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
    waitChildRuns,
    waitTimedOut,
    waitSessionExpired,
    waitBarrierTerminalInspection,
    ...(waitOutcome ? { waitOutcome } : {}),
    waitSatisfied,
    ...(waitNotice ? { waitNotice } : {}),
    parentSynthesisAllowed,
    resultValidation,
    ...(waitBarrierEvaluation ? { waitBarrierEvaluation } : {}),
    waitBarrierBlockers,
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

function resolveSubagentRuntimeWaitRun(input: {
  requestedRun: SubagentRunSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  waitChildRuns: SubagentRunSummary[];
}): SubagentRunSummary {
  if (!input.waitBarrier || input.waitBarrier.status !== "waiting_on_children") return input.requestedRun;
  if (!SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.requestedRun.status)) return input.requestedRun;
  for (const childRunId of input.waitBarrier.childRunIds) {
    const candidate = input.waitChildRuns.find((run) => run.id === childRunId);
    if (candidate && !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(candidate.status)) return candidate;
  }
  return input.requestedRun;
}

function replaceSubagentWaitChildRun(
  waitChildRuns: SubagentRunSummary[],
  run: SubagentRunSummary,
): SubagentRunSummary[] {
  const index = waitChildRuns.findIndex((childRun) => childRun.id === run.id);
  if (index === -1) return waitChildRuns.concat(run);
  return [
    ...waitChildRuns.slice(0, index),
    run,
    ...waitChildRuns.slice(index + 1),
  ];
}

function buildSubagentWaitBarrierBlockers(input: {
  store: SubagentWaitAgentExecutorStore;
  waitBarrierEvaluation: SubagentWaitBarrierStoreEvaluation;
}): SubagentWaitBarrierBlocker[] {
  if (input.waitBarrierEvaluation.synthesisAllowed) return [];
  return input.waitBarrierEvaluation.childResults
    .filter((child) => !child.synthesisAllowed)
    .map((child) => {
      const run = input.store.getSubagentRun(child.childRunId);
      const runEvents = input.store.listSubagentRunEvents(run.id);
      const mailboxEvents = input.store.listSubagentMailboxEvents(run.id);
      const activity = latestSubagentWaitBarrierBlockerActivity({
        run,
        runEvents,
        mailboxEvents,
      });
      const active = input.waitBarrierEvaluation.activeChildRunIds.includes(child.childRunId);
      const terminalUnsafe = input.waitBarrierEvaluation.terminalUnsafeChildRunIds.includes(child.childRunId);
      const resultRepairState = subagentResultRepairStateForRun({ run, events: runEvents });
      const approvalRequest = latestSubagentApprovalRequestBlocker({
        run,
        mailboxEvents,
      });
      return {
        childRunId: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        roleId: run.roleId,
        status: run.status,
        dependencyMode: input.waitBarrierEvaluation.dependencyMode,
        blockingState: active ? "active" : terminalUnsafe ? "terminal_unsafe" : "not_synthesis_safe",
        synthesisAllowed: child.synthesisAllowed,
        partial: child.partial,
        lastActivityAt: activity.at,
        lastActivitySource: activity.source,
        ...(activity.detail ? { lastActivityDetail: activity.detail } : {}),
        ...(child.reason ? { reason: child.reason } : {}),
        ...(approvalRequest ? { approvalRequest } : {}),
        ...(resultRepairState ? { resultRepairState } : {}),
      };
    });
}

function latestSubagentApprovalRequestBlocker(input: {
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "status">;
  mailboxEvents: SubagentMailboxEventSummary[];
}): SubagentWaitBarrierBlockerApprovalRequest | undefined {
  if (input.run.status !== "needs_attention") return undefined;
  const latest = input.mailboxEvents
    .filter((event) => event.direction === "child_to_parent" && event.type === "subagent.approval_requested")
    .map((event) => ({ event, payload: objectRecord(event.payload) }))
    .filter(({ payload }) =>
      payload?.schemaVersion === "ambient-subagent-approval-bridge-v1" &&
      optionalString(payload.childRunId) === input.run.id &&
      optionalString(payload.childThreadId) === input.run.childThreadId &&
      optionalString(payload.approvalId)
    )
    .filter(({ event, payload }) => {
      const approvalId = optionalString(payload?.approvalId);
      return Boolean(approvalId && !hasLaterApprovalResponse(input.mailboxEvents, approvalId, input.run, event));
    })
    .sort((a, b) => {
      const aAt = a.event.deliveredAt ?? a.event.createdAt;
      const bAt = b.event.deliveredAt ?? b.event.createdAt;
      return bAt.localeCompare(aAt) || b.event.id.localeCompare(a.event.id);
    })[0];
  if (!latest?.payload) return undefined;
  const approvalId = optionalString(latest.payload.approvalId);
  if (!approvalId) return undefined;
  const title = optionalString(latest.payload.title);
  const requestedAction = optionalString(latest.payload.requestedAction);
  const requestedToolId = optionalString(latest.payload.requestedToolId);
  const requestedToolCategory = optionalString(latest.payload.requestedToolCategory);
  const requestedScope = optionalString(latest.payload.requestedScope);
  const effectiveScope = optionalString(latest.payload.effectiveScope);
  const prompt = optionalString(latest.payload.prompt);
  return {
    approvalId,
    ...(title ? { title } : {}),
    ...(requestedAction ? { requestedAction } : {}),
    ...(requestedToolId ? { requestedToolId } : {}),
    ...(requestedToolCategory ? { requestedToolCategory } : {}),
    ...(requestedScope ? { requestedScope } : {}),
    ...(effectiveScope ? { effectiveScope } : {}),
    ...(prompt ? { promptPreview: previewText(prompt, 240) } : {}),
    allowedNextActions: [
      `Resolve approval ${approvalId} for childRunId ${input.run.id}.`,
      `Then call wait_agent for childRunId ${input.run.id}.`,
      "Do not spawn a replacement child or call retry_child while this approval is pending.",
    ],
  };
}

function hasLaterApprovalResponse(
  mailboxEvents: SubagentMailboxEventSummary[],
  approvalId: string,
  run: Pick<SubagentRunSummary, "id" | "childThreadId">,
  requestEvent: SubagentMailboxEventSummary,
): boolean {
  const requestAt = mailboxEventSortTime(requestEvent);
  return mailboxEvents.some((event) => {
    if (event.direction !== "parent_to_child" || event.type !== SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE) return false;
    if (event.deliveryState === "failed" || event.deliveryState === "cancelled") return false;
    const payload = objectRecord(event.payload);
    if (optionalString(payload?.approvalId) !== approvalId) return false;
    if (optionalString(payload?.childRunId) !== run.id) return false;
    if (optionalString(payload?.childThreadId) !== run.childThreadId) return false;
    return mailboxEventSortTime(event).localeCompare(requestAt) > 0;
  });
}

function mailboxEventSortTime(event: SubagentMailboxEventSummary): string {
  return event.deliveredAt ?? event.createdAt;
}

function latestSubagentWaitBarrierBlockerActivity(input: {
  run: SubagentRunSummary;
  runEvents: SubagentRunEventSummary[];
  mailboxEvents: SubagentMailboxEventSummary[];
}): { at: string; source: string; detail?: string } {
  let latest: { at: string; source: string; detail?: string } = {
    at: input.run.updatedAt ?? input.run.createdAt,
    source: "subagent_run",
    detail: "run updated",
  };
  for (const value of [input.run.completedAt, input.run.closedAt, input.run.startedAt, input.run.createdAt]) {
    latest = newerActivity(latest, value, "subagent_run", value === input.run.completedAt ? "run completed" : "run timestamp");
  }
  for (const event of input.runEvents) {
    latest = newerActivity(latest, event.createdAt, `run_event:${event.type}`, `run event ${event.sequence}`);
  }
  for (const mailbox of input.mailboxEvents) {
    latest = newerActivity(latest, mailbox.deliveredAt ?? mailbox.createdAt, `mailbox:${mailbox.type}`, mailbox.deliveryState);
  }
  return latest;
}

function newerActivity(
  current: { at: string; source: string; detail?: string },
  at: string | undefined,
  source: string,
  detail?: string,
): { at: string; source: string; detail?: string } {
  if (!at) return current;
  const currentMs = Date.parse(current.at);
  const nextMs = Date.parse(at);
  if (!Number.isFinite(nextMs)) return current;
  if (!Number.isFinite(currentMs) || nextMs >= currentMs) {
    return { at, source, ...(detail ? { detail } : {}) };
  }
  return current;
}

function buildWaitBarrierTransitionEvidenceForWaitAgent(input: {
  run: SubagentRunSummary;
  waitOutcome?: SubagentChildRuntimeWaitOutcome;
  runtimeTimeoutResolvesBarrier: boolean;
  explicitIdempotencyKey?: string;
}): SubagentWaitBarrierTransitionEvidence {
  if (input.waitOutcome?.kind === "child_runtime_timeout" && input.runtimeTimeoutResolvesBarrier) {
    return {
      schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
      kind: "child_runtime_timeout",
      source: "child_runtime",
      childRunId: input.run.id,
      ...(input.waitOutcome.reason ? { reason: input.waitOutcome.reason } : {}),
      timeoutKind: subagentRuntimeTimeoutKindFromReason(input.waitOutcome.reason),
      ...(input.waitOutcome.details ? { details: input.waitOutcome.details } : {}),
      ...(input.explicitIdempotencyKey ? { idempotencyKey: input.explicitIdempotencyKey } : {}),
    };
  }
  if (SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.run.status)) {
    return {
      schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
      kind: "child_terminal",
      source: "wait_agent",
      childRunId: input.run.id,
      reason: input.run.status,
      ...(input.explicitIdempotencyKey ? { idempotencyKey: input.explicitIdempotencyKey } : {}),
    };
  }
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "progress_return",
    source: "parent_wait_session",
    childRunId: input.run.id,
    reason: input.waitOutcome?.reason ?? input.waitOutcome?.kind ?? "parent_wait_progress",
    ...(input.waitOutcome?.details ? { details: input.waitOutcome.details } : {}),
    ...(input.explicitIdempotencyKey ? { idempotencyKey: input.explicitIdempotencyKey } : {}),
  };
}

function normalizeSubagentChildRuntimeWaitOutcome(
  result: SubagentChildRuntimeWaitResult,
): SubagentChildRuntimeWaitOutcome {
  if (result.outcome) return result.outcome;
  if (result.timedOut) return { kind: "child_runtime_timeout", reason: "legacy_timed_out_result" };
  return SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(result.run.status)
    ? { kind: "child_terminal" }
    : { kind: "progress_return", reason: "legacy_active_result" };
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

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function previewText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
