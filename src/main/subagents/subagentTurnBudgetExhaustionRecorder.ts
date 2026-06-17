import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  compactSubagentTurnBudgetStateForPi,
  type SubagentTurnBudgetState,
} from "../../shared/subagentTurnBudget";
import {
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
} from "./subagentLifecycleParentMailbox";
import { subagentTranscriptPath } from "./subagentLifecycleHooks";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  findSubagentRunEventByIdempotencyKey,
} from "./subagentIdempotency";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";

export const SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-turn-budget-exhaustion-recorder-v1" as const;

export const SUBAGENT_TURN_BUDGET_EXHAUSTED_EVENT_TYPE = "subagent.turn_budget_exhausted" as const;
export const SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON = "max_turns_exceeded" as const;

export interface SubagentTurnBudgetExhaustionRecorderStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  markSubagentRunStatus(
    runId: string,
    status: SubagentRunSummary["status"],
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
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
}

export interface SubagentTurnBudgetExhaustionSettlementRecord {
  schemaVersion: typeof SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION;
  replay: boolean;
  idempotencyKey: string;
  run: SubagentRunSummary;
  status: Extract<SubagentRunSummary["status"], "aborted_partial" | "failed">;
  partial: boolean;
  summary: string;
  artifactPath: string;
  resultArtifact: Record<string, unknown>;
  waitBarrierIds: string[];
  runEvent?: SubagentRunEventSummary;
  mailboxEvent?: SubagentMailboxEventSummary;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
}

export function settleSubagentTurnBudgetExhaustionIfNeeded(input: {
  store: SubagentTurnBudgetExhaustionRecorderStore;
  run: SubagentRunSummary;
  turnBudgetState: SubagentTurnBudgetState;
  createdAt?: string;
}): SubagentTurnBudgetExhaustionSettlementRecord | undefined {
  if (!input.turnBudgetState.exhausted) return undefined;

  const current = input.store.getSubagentRun(input.run.id);
  const idempotencyKey = createSubagentTurnBudgetExhaustionIdempotencyKey({
    run: current,
    turnBudgetState: input.turnBudgetState,
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(current.id),
    SUBAGENT_TURN_BUDGET_EXHAUSTED_EVENT_TYPE,
    idempotencyKey,
  );
  const artifactPath = subagentTranscriptPath(current.childThreadId);
  const status = input.turnBudgetState.policy.terminalStatusOnExhaustion;
  const partial = status === "aborted_partial";
  const summary = buildSubagentTurnBudgetExhaustionSummary({
    maxTurns: input.turnBudgetState.policy.maxTurns,
    partial,
    artifactPath,
  });
  const resultArtifact = buildSubagentTurnBudgetExhaustionResultArtifact({
    run: current,
    status,
    partial,
    summary,
    artifactPath,
  });
  const waitBarrierIds = activeWaitBarrierIdsForRun(input.store, current);

  if (existing) {
    return {
      schemaVersion: SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION,
      replay: true,
      idempotencyKey,
      run: current,
      status,
      partial,
      summary,
      artifactPath,
      resultArtifact,
      waitBarrierIds,
      runEvent: existing,
    };
  }
  if (current.closedAt || SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(current.status)) return undefined;

  const settled = input.store.markSubagentRunStatus(current.id, status, {
    ...(input.createdAt ? { now: input.createdAt } : {}),
    resultArtifact,
  });
  const mailboxEvent = input.store.appendSubagentMailboxEvent(settled.id, {
    direction: "child_to_parent",
    type: partial ? "subagent.result" : "subagent.failed",
    deliveryState: "delivered",
    ...(input.createdAt ? { createdAt: input.createdAt, deliveredAt: input.createdAt } : {}),
    payload: {
      status,
      partial,
      summary,
      childThreadId: settled.childThreadId,
      artifactPath,
      reason: SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON,
      maxTurns: input.turnBudgetState.policy.maxTurns,
      completedTurnCount: input.turnBudgetState.completedTurnCount,
      turnBudgetState: compactSubagentTurnBudgetStateForPi(input.turnBudgetState),
    },
  });
  const parentMailboxEvent = input.store.appendSubagentParentMailboxEvent({
    parentThreadId: settled.parentThreadId,
    parentRunId: settled.parentRunId,
    ...(settled.parentMessageId ? { parentMessageId: settled.parentMessageId } : {}),
    type: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
    deliveryState: "queued",
    idempotencyKey: subagentLifecycleInterruptionIdempotencyKey({
      runId: settled.id,
      source: SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON,
      idempotencyKey,
    }),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    payload: subagentLifecycleInterruptionParentMailboxPayload({
      run: settled,
      previousStatus: current.status,
      source: SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON,
      reason: summary,
      resultArtifact,
      waitBarrierIds,
    }),
  });
  const runEvent = input.store.appendSubagentRunEvent(settled.id, {
    type: SUBAGENT_TURN_BUDGET_EXHAUSTED_EVENT_TYPE,
    artifactPath,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    preview: {
      idempotencyKey,
      status,
      partial,
      reason: SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON,
      maxTurns: input.turnBudgetState.policy.maxTurns,
      completedTurnCount: input.turnBudgetState.completedTurnCount,
      observedTurnCount: input.turnBudgetState.observedTurnCount,
      artifactPath,
      mailboxEventId: mailboxEvent.id,
      parentMailboxEventId: parentMailboxEvent.id,
      waitBarrierIds,
      turnBudgetState: compactSubagentTurnBudgetStateForPi(input.turnBudgetState),
    },
  });

  return {
    schemaVersion: SUBAGENT_TURN_BUDGET_EXHAUSTION_RECORDER_SCHEMA_VERSION,
    replay: false,
    idempotencyKey,
    run: settled,
    status,
    partial,
    summary,
    artifactPath,
    resultArtifact,
    waitBarrierIds,
    runEvent,
    mailboxEvent,
    parentMailboxEvent,
  };
}

export function compactSubagentTurnBudgetExhaustionSettlementRecord(
  record: SubagentTurnBudgetExhaustionSettlementRecord,
): Record<string, unknown> {
  return {
    schemaVersion: record.schemaVersion,
    replay: record.replay,
    idempotencyKey: record.idempotencyKey,
    status: record.status,
    partial: record.partial,
    summary: record.summary,
    artifactPath: record.artifactPath,
    run: {
      id: record.run.id,
      status: record.run.status,
      childThreadId: record.run.childThreadId,
      canonicalTaskPath: record.run.canonicalTaskPath,
    },
    waitBarrierIds: record.waitBarrierIds,
    ...(record.mailboxEvent ? { mailboxEvent: compactMailboxEvent(record.mailboxEvent) } : {}),
    ...(record.parentMailboxEvent ? { parentMailboxEvent: compactParentMailboxEvent(record.parentMailboxEvent) } : {}),
    ...(record.runEvent ? {
      runEvent: {
        runId: record.runEvent.runId,
        sequence: record.runEvent.sequence,
        type: record.runEvent.type,
        createdAt: record.runEvent.createdAt,
        ...(record.runEvent.artifactPath ? { artifactPath: record.runEvent.artifactPath } : {}),
      },
    } : {}),
  };
}

export function createSubagentTurnBudgetExhaustionIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  turnBudgetState: Pick<SubagentTurnBudgetState, "policy">;
}): string {
  return createSubagentIdempotencyKey({
    operation: "turn-budget-exhaustion",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({
      reason: SUBAGENT_TURN_BUDGET_EXHAUSTION_REASON,
      roleId: input.turnBudgetState.policy.roleId,
      maxTurns: input.turnBudgetState.policy.maxTurns,
      terminalStatusOnExhaustion: input.turnBudgetState.policy.terminalStatusOnExhaustion,
      partialAllowed: input.turnBudgetState.policy.partialAllowed,
    }),
  });
}

function buildSubagentTurnBudgetExhaustionResultArtifact(input: {
  run: Pick<SubagentRunSummary, "id" | "childThreadId">;
  status: Extract<SubagentRunSummary["status"], "aborted_partial" | "failed">;
  partial: boolean;
  summary: string;
  artifactPath: string;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.run.id,
    status: input.status,
    partial: input.partial,
    summary: input.summary,
    childThreadId: input.run.childThreadId,
    artifactPath: input.artifactPath,
  };
}

function buildSubagentTurnBudgetExhaustionSummary(input: {
  maxTurns: number;
  partial: boolean;
  artifactPath: string;
}): string {
  return input.partial
    ? `Child exhausted its ${input.maxTurns}-turn role budget before completing. Partial transcript is retained at ${input.artifactPath}.`
    : `Child exhausted its ${input.maxTurns}-turn role budget and this role does not allow partial success. Transcript is retained at ${input.artifactPath}.`;
}

function activeWaitBarrierIdsForRun(
  store: Pick<SubagentTurnBudgetExhaustionRecorderStore, "listSubagentWaitBarriersForParentRun">,
  run: Pick<SubagentRunSummary, "id" | "parentRunId">,
): string[] {
  return store
    .listSubagentWaitBarriersForParentRun(run.parentRunId)
    .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.includes(run.id))
    .map((barrier) => barrier.id);
}

function compactMailboxEvent(event: SubagentMailboxEventSummary): Record<string, unknown> {
  return {
    id: event.id,
    runId: event.runId,
    direction: event.direction,
    type: event.type,
    deliveryState: event.deliveryState,
    createdAt: event.createdAt,
    ...(event.deliveredAt ? { deliveredAt: event.deliveredAt } : {}),
  };
}

function compactParentMailboxEvent(event: SubagentParentMailboxEventSummary): Record<string, unknown> {
  return {
    id: event.id,
    parentRunId: event.parentRunId,
    ...(event.parentMessageId ? { parentMessageId: event.parentMessageId } : {}),
    type: event.type,
    deliveryState: event.deliveryState,
    createdAt: event.createdAt,
  };
}
