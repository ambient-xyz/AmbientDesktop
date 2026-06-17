import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import type {
  SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";
import { findSubagentRunEventByIdempotencyKey } from "./subagentIdempotency";
import {
  buildSubagentWaitCompletionMailboxDraft,
  createSubagentWaitCompletionIdempotencyKey,
  shouldRecordSubagentWaitCompletion,
  SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
} from "./subagentWaitMailbox";
import type {
  SubagentResultValidation,
} from "./subagentResultValidation";
import type {
  SubagentWaitBarrierStoreEvaluation,
} from "./subagentWaitBarrierResolution";

export const SUBAGENT_WAIT_COMPLETION_RECORDER_SCHEMA_VERSION =
  "ambient-subagent-wait-completion-recorder-v1" as const;

export interface SubagentWaitCompletionRecorderStore {
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

export function recordSubagentWaitCompletionMailboxIfNeeded(input: {
  store: SubagentWaitCompletionRecorderStore;
  run: SubagentRunSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
  waitTimedOut: boolean;
  resultValidation: SubagentResultValidation;
  waitBarrierEvaluation?: SubagentWaitBarrierStoreEvaluation;
  parentResolution?: SubagentParentPolicyResolution;
  explicitIdempotencyKey?: string;
  createdAt?: string;
}): SubagentMailboxEventSummary | undefined {
  if (!shouldRecordSubagentWaitCompletion({
    runStatus: input.run.status,
    waitBarrier: input.waitBarrier,
    waitTimedOut: input.waitTimedOut,
  })) return undefined;
  const idempotencyKey = input.explicitIdempotencyKey ?? createSubagentWaitCompletionIdempotencyKey(input);
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
    idempotencyKey,
  );
  if (existing) {
    const existingMailboxId = optionalString(objectInput(existing.preview).mailboxEventId);
    return existingMailboxId
      ? input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === existingMailboxId)
      : undefined;
  }
  const now = nextSubagentWaitCompletionMailboxCreatedAt(
    input.store.listSubagentMailboxEvents(input.run.id).at(-1)?.createdAt,
    input.createdAt ?? new Date().toISOString(),
  );
  const draft = buildSubagentWaitCompletionMailboxDraft({
    run: input.run,
    ...(input.waitBarrier ? { waitBarrier: input.waitBarrier } : {}),
    waitTimedOut: input.waitTimedOut,
    resultValidation: input.resultValidation,
    ...(input.waitBarrierEvaluation ? { waitBarrierEvaluation: input.waitBarrierEvaluation } : {}),
    ...(input.parentResolution ? { parentResolution: input.parentResolution } : {}),
    createdAt: now,
    explicitIdempotencyKey: idempotencyKey,
  });
  const mailbox = input.store.appendSubagentMailboxEvent(input.run.id, draft.mailboxInput);
  input.store.appendSubagentRunEvent(input.run.id, {
    ...draft.runEventInput,
    preview: {
      ...draft.runEventInput.preview,
      mailboxEventId: mailbox.id,
    },
  });
  return mailbox;
}

export function nextSubagentWaitCompletionMailboxCreatedAt(
  previousCreatedAt: string | undefined,
  candidateCreatedAt: string,
): string {
  if (!previousCreatedAt) return candidateCreatedAt;
  const previousMs = Date.parse(previousCreatedAt);
  const candidateMs = Date.parse(candidateCreatedAt);
  if (!Number.isFinite(previousMs) || !Number.isFinite(candidateMs) || candidateMs > previousMs) {
    return candidateCreatedAt;
  }
  return new Date(previousMs + 1).toISOString();
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
