import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import {
  compactSubagentTurnBudgetStateForPi,
  type SubagentTurnBudgetState,
} from "../../shared/subagentTurnBudget";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  findSubagentRunEventByIdempotencyKey,
} from "./subagentIdempotency";
import {
  buildSubagentChildMailboxEventInput,
  buildSubagentChildMailboxRunEventInput,
  previewSubagentChildMailboxText,
  resolveSubagentChildMailboxRequest,
} from "./subagentMailboxRequest";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";

export const SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-turn-budget-wrap-up-recorder-v1" as const;

export const SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON =
  "turn_budget_wrap_up" as const;

export const SUBAGENT_TURN_BUDGET_WRAP_UP_TOOL_CALL_ID =
  "ambient.turn_budget.wrap_up" as const;

export interface SubagentTurnBudgetWrapUpRecorderStore {
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[];
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
}

export interface SubagentTurnBudgetWrapUpSteeringRecord {
  schemaVersion: typeof SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION;
  replay: boolean;
  idempotencyKey: string;
  message: string;
  mailboxEvent?: SubagentMailboxEventSummary;
  runEvent?: SubagentRunEventSummary;
}

export function recordSubagentTurnBudgetWrapUpSteeringIfNeeded(input: {
  store: SubagentTurnBudgetWrapUpRecorderStore;
  run: SubagentRunSummary;
  turnBudgetState: SubagentTurnBudgetState;
  explicitIdempotencyKey?: string;
  createdAt?: string;
}): SubagentTurnBudgetWrapUpSteeringRecord | undefined {
  if (!shouldRecordSubagentTurnBudgetWrapUpSteering(input.run, input.turnBudgetState)) {
    return undefined;
  }

  const message = buildSubagentTurnBudgetWrapUpSteeringMessage({
    run: input.run,
    turnBudgetState: input.turnBudgetState,
  });
  const idempotencyKey = input.explicitIdempotencyKey ??
    createSubagentTurnBudgetWrapUpSteeringIdempotencyKey({
      run: input.run,
      turnBudgetState: input.turnBudgetState,
    });
  const request = resolveSubagentChildMailboxRequest({
    run: input.run,
    action: "followup_agent",
    message,
    explicitIdempotencyKey: idempotencyKey,
    toolCallId: SUBAGENT_TURN_BUDGET_WRAP_UP_TOOL_CALL_ID,
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    request.eventType,
    idempotencyKey,
  );
  if (existing) {
    return {
      schemaVersion: SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
      replay: true,
      idempotencyKey,
      message,
      runEvent: existing,
      mailboxEvent: findSubagentTurnBudgetWrapUpMailboxForRunEvent(input.store, input.run.id, existing),
    };
  }

  const compactTurnBudgetState = compactSubagentTurnBudgetStateForPi(input.turnBudgetState);
  const mailboxInput = buildSubagentChildMailboxEventInput(request);
  const mailboxEvent = input.store.appendSubagentMailboxEvent(input.run.id, {
    ...mailboxInput,
    payload: {
      ...mailboxInput.payload,
      steeringReason: SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
      turnBudgetState: compactTurnBudgetState,
    },
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const runEventInput = buildSubagentChildMailboxRunEventInput(request, mailboxEvent, input.run);
  const runEvent = input.store.appendSubagentRunEvent(input.run.id, {
    type: runEventInput.type,
    preview: {
      ...runEventInput.preview,
      steeringSchemaVersion: SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
      steeringReason: SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
      turnBudgetState: compactTurnBudgetState,
    },
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });

  return {
    schemaVersion: SUBAGENT_TURN_BUDGET_WRAP_UP_RECORDER_SCHEMA_VERSION,
    replay: false,
    idempotencyKey,
    message,
    mailboxEvent,
    runEvent,
  };
}

export function shouldRecordSubagentTurnBudgetWrapUpSteering(
  run: Pick<SubagentRunSummary, "closedAt" | "status">,
  turnBudgetState: Pick<SubagentTurnBudgetState, "shouldSteerWrapUp" | "exhausted">,
): boolean {
  return turnBudgetState.shouldSteerWrapUp &&
    !turnBudgetState.exhausted &&
    !run.closedAt &&
    !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(run.status);
}

export function createSubagentTurnBudgetWrapUpSteeringIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  turnBudgetState: Pick<SubagentTurnBudgetState, "policy">;
}): string {
  const payloadFingerprint = createSubagentPayloadFingerprint({
    reason: SUBAGENT_TURN_BUDGET_WRAP_UP_STEERING_REASON,
    roleId: input.turnBudgetState.policy.roleId,
    maxTurns: input.turnBudgetState.policy.maxTurns,
    wrapUpAtTurn: input.turnBudgetState.policy.wrapUpAtTurn,
    graceTurns: input.turnBudgetState.policy.graceTurns,
    terminalStatusOnExhaustion: input.turnBudgetState.policy.terminalStatusOnExhaustion,
  });
  return createSubagentIdempotencyKey({
    operation: "turn-budget-wrap-up",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint,
  });
}

export function buildSubagentTurnBudgetWrapUpSteeringMessage(input: {
  run: Pick<SubagentRunSummary, "canonicalTaskPath" | "roleId">;
  turnBudgetState: SubagentTurnBudgetState;
}): string {
  return [
    `Turn-budget wrap-up for ${input.run.canonicalTaskPath}.`,
    `Observed turns: ${input.turnBudgetState.observedTurnCount}/${input.turnBudgetState.policy.maxTurns}. Wrap-up threshold: ${input.turnBudgetState.policy.wrapUpAtTurn}. Grace turns: ${input.turnBudgetState.policy.graceTurns}.`,
    "Finish the current task with the required schema-valid child result. Do not start new exploratory work.",
    input.turnBudgetState.policy.partialAllowed
      ? "If complete work is not possible within the grace window, return an honest partial result with evidence and open questions."
      : "If complete work is not possible within the grace window, report the blocker clearly so the parent can fail or retry this child.",
  ].join("\n");
}

export function compactSubagentTurnBudgetWrapUpSteeringRecord(
  record: SubagentTurnBudgetWrapUpSteeringRecord,
): Record<string, unknown> {
  return {
    schemaVersion: record.schemaVersion,
    replay: record.replay,
    idempotencyKey: record.idempotencyKey,
    messagePreview: previewSubagentChildMailboxText(record.message, 600),
    ...(record.mailboxEvent ? {
      mailboxEvent: {
        id: record.mailboxEvent.id,
        runId: record.mailboxEvent.runId,
        direction: record.mailboxEvent.direction,
        type: record.mailboxEvent.type,
        deliveryState: record.mailboxEvent.deliveryState,
        createdAt: record.mailboxEvent.createdAt,
        ...(record.mailboxEvent.deliveredAt ? { deliveredAt: record.mailboxEvent.deliveredAt } : {}),
      },
    } : {}),
    ...(record.runEvent ? {
      runEvent: {
        runId: record.runEvent.runId,
        sequence: record.runEvent.sequence,
        type: record.runEvent.type,
        createdAt: record.runEvent.createdAt,
      },
    } : {}),
  };
}

function findSubagentTurnBudgetWrapUpMailboxForRunEvent(
  store: Pick<SubagentTurnBudgetWrapUpRecorderStore, "listSubagentMailboxEvents">,
  runId: string,
  event: SubagentRunEventSummary,
): SubagentMailboxEventSummary | undefined {
  const mailboxEventId = optionalString(objectInput(event.preview).mailboxEventId);
  if (!mailboxEventId) return undefined;
  return store.listSubagentMailboxEvents(runId).find((mailboxEvent) => mailboxEvent.id === mailboxEventId);
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
