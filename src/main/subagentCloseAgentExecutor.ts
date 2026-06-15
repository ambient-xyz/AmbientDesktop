import type {
  SubagentRunEventSummary,
  SubagentRunSummary,
} from "../shared/types";
import {
  buildSubagentCloseAgentChildThreadMessage,
  buildSubagentCloseRequestedRunEventPreview,
  resolveSubagentCloseAgentRequest,
  SUBAGENT_CLOSE_REQUEST_EVENT_TYPE,
} from "./subagentCloseAgent";
import { findSubagentRunEventByIdempotencyKey } from "./subagentIdempotency";
import { assertCapacityClosePreservesHistory } from "./subagentInvariants";

export const SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION =
  "ambient-subagent-close-agent-executor-v1" as const;

export interface SubagentCloseAgentExecutorStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
  closeSubagentRun(runId: string, now?: string): SubagentRunSummary;
  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}

export interface SubagentCloseAgentExecutionResult {
  schemaVersion: typeof SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION;
  replay: boolean;
  run: SubagentRunSummary;
  reason: string;
  idempotencyKey: string;
  runEvent?: SubagentRunEventSummary;
}

export function executeSubagentCloseAgent(input: {
  store: SubagentCloseAgentExecutorStore;
  run: SubagentRunSummary;
  reason?: string;
  idempotencyKey?: string;
  toolCallId: string;
}): SubagentCloseAgentExecutionResult {
  const request = resolveSubagentCloseAgentRequest({
    run: input.run,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const { reason, idempotencyKey } = request;
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_CLOSE_REQUEST_EVENT_TYPE,
    idempotencyKey,
  );
  if (input.run.closedAt || existing) {
    return {
      schemaVersion: SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION,
      replay: true,
      run: input.store.getSubagentRun(input.run.id),
      reason,
      idempotencyKey,
    };
  }

  const runEvent = input.store.appendSubagentRunEvent(input.run.id, {
    type: SUBAGENT_CLOSE_REQUEST_EVENT_TYPE,
    preview: buildSubagentCloseRequestedRunEventPreview({
      run: input.run,
      idempotencyKey,
      reason,
      toolCallId: input.toolCallId,
    }),
  });
  const closed = input.store.closeSubagentRun(input.run.id);
  assertCapacityClosePreservesHistory({ before: input.run, after: closed });
  input.store.addMessage({
    threadId: closed.childThreadId,
    role: "system",
    content: buildSubagentCloseAgentChildThreadMessage({ reason }),
    metadata: {
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      status: "closed",
      subagentRunId: closed.id,
    },
  });
  return {
    schemaVersion: SUBAGENT_CLOSE_AGENT_EXECUTOR_SCHEMA_VERSION,
    replay: false,
    run: closed,
    reason,
    idempotencyKey,
    runEvent,
  };
}
