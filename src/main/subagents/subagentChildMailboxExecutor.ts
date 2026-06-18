import type {
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeFollowupResult,
  SubagentRuntimeEventEmitter,
} from "../pi/piChildSessionAdapter";
import { findSubagentRunEventByIdempotencyKey } from "./subagentIdempotency";
import {
  buildSubagentChildMailboxEventInput,
  buildSubagentChildMailboxRunEventInput,
  buildSubagentChildMailboxThreadMessage,
  resolveSubagentChildMailboxRequest,
  type SubagentChildMailboxAction,
  type SubagentChildMailboxRequest,
} from "./subagentMailboxRequest";

export const SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-child-mailbox-executor-v1" as const;

export interface SubagentChildMailboxExecutorStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[];
  appendSubagentMailboxEvent(
    runId: string,
    input: {
      direction: "parent_to_child" | "child_to_parent";
      type: string;
      payload?: unknown;
      deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
      createdAt?: string;
    },
  ): SubagentMailboxEventSummary;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: "queued" | "delivered" | "consumed" | "failed" | "cancelled",
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary;
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface SubagentChildMailboxExecutionResult {
  schemaVersion: typeof SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION;
  replay: boolean;
  request: SubagentChildMailboxRequest;
  run: SubagentRunSummary;
  idempotencyKey: string;
  mailboxEvent?: SubagentMailboxEventSummary;
  runEvent?: SubagentRunEventSummary;
  runtimeFollowup?: SubagentChildRuntimeFollowupResult;
}

export async function executeSubagentChildMailbox(input: {
  store: SubagentChildMailboxExecutorStore;
  runtime?: Pick<SubagentChildRuntimeAdapter, "followupChildRun">;
  run: SubagentRunSummary;
  action: SubagentChildMailboxAction;
  message: string;
  idempotencyKey?: string;
  toolCallId: string;
  supervisorRequestParentMailboxEventId?: string;
  supervisorChoiceId?: string;
  createRuntimeFollowupEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
}): Promise<SubagentChildMailboxExecutionResult> {
  const request = resolveSubagentChildMailboxRequest({
    run: input.run,
    action: input.action,
    message: input.message,
    explicitIdempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    ...(input.supervisorRequestParentMailboxEventId ? {
      supervisorRequestParentMailboxEventId: input.supervisorRequestParentMailboxEventId,
    } : {}),
    ...(input.supervisorChoiceId ? { supervisorChoiceId: input.supervisorChoiceId } : {}),
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    request.eventType,
    request.idempotencyKey,
  );
  if (existing) {
    return {
      schemaVersion: SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION,
      replay: true,
      request,
      run: input.store.getSubagentRun(input.run.id),
      idempotencyKey: request.idempotencyKey,
      runEvent: existing,
      mailboxEvent: findMailboxEventForRunEvent(input.store, input.run.id, existing),
    };
  }

  const mailbox = input.store.appendSubagentMailboxEvent(
    input.run.id,
    buildSubagentChildMailboxEventInput(request),
  );
  const runEvent = input.store.appendSubagentRunEvent(
    input.run.id,
    buildSubagentChildMailboxRunEventInput(request, mailbox, input.run),
  );
  input.store.addMessage(buildSubagentChildMailboxThreadMessage({
    request,
    run: input.run,
    mailboxEvent: mailbox,
    runtime: "ambient-subagents",
    phase: "phase-2-pi-tool-surface",
  }));

  const runtimeFollowup = request.action === "followup_agent" && input.runtime?.followupChildRun
    ? await input.runtime.followupChildRun({
      run: input.run,
      message: request.message,
      mailboxEvent: mailbox,
      idempotencyKey: request.idempotencyKey,
      emitEvent: input.createRuntimeFollowupEventEmitter(input.run),
      markMailboxDelivered: (now?: string) =>
        input.store.updateSubagentMailboxEventDeliveryState(mailbox.id, "delivered", { now }),
      markMailboxConsumed: (now?: string) =>
        input.store.updateSubagentMailboxEventDeliveryState(mailbox.id, "consumed", { now }),
    })
    : undefined;
  const latestRun = runtimeFollowup?.run ?? input.store.getSubagentRun(input.run.id);
  const latestMailbox = runtimeFollowup?.mailboxEvent ??
    input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === mailbox.id) ??
    mailbox;
  return {
    schemaVersion: SUBAGENT_CHILD_MAILBOX_EXECUTOR_SCHEMA_VERSION,
    replay: false,
    request,
    run: latestRun,
    idempotencyKey: request.idempotencyKey,
    mailboxEvent: latestMailbox,
    runEvent,
    ...(runtimeFollowup ? { runtimeFollowup } : {}),
  };
}

function findMailboxEventForRunEvent(
  store: Pick<SubagentChildMailboxExecutorStore, "listSubagentMailboxEvents">,
  runId: string,
  event: SubagentRunEventSummary,
): SubagentMailboxEventSummary | undefined {
  const mailboxEventId = optionalString(objectInput(event.preview).mailboxEventId);
  if (!mailboxEventId) return undefined;
  return store.listSubagentMailboxEvents(runId).find((candidate) => candidate.id === mailboxEventId);
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
