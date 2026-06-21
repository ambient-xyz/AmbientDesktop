import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type {
  SubagentChildRuntimeApprovalRequest,
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
  SubagentRuntimeEventEmitter,
} from "./agentRuntimePiFacade";
import type {
  AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleTypes";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import {
  subagentTranscriptPath,
} from "./agentRuntimeSubagentsFacade";
import {
  isSubagentTerminalStatus,
  permissionPromptResponseModeForSubagentApproval,
  subagentApprovalRequestFromPermissionRequest,
} from "./subagents/agentRuntimeSubagentRuntimeHelpers";

const SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS = 15_000;
const SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS = 10 * 60_000;
const SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS = 10 * 60_000;

interface SubagentChildActivitySnapshot {
  atMs: number;
  at: string;
  source: string;
  detail?: string;
}

export function resolveSubagentChildLifecycleApprovalResponse(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeApprovalResponseInput,
): SubagentChildRuntimeApprovalResponseResult {
  const current = options.store.getSubagentRun(input.run.id);
  if (current.closedAt || isSubagentTerminalStatus(current.status)) {
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message: `Child runtime did not accept the approval response because the sub-agent is ${current.closedAt ? "closed" : current.status}.`,
    };
  }
  if (!options.permissions.respond || !options.permissions.listPending) {
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message: "Ambient permission prompt responses are not available in this runtime; the child approval response remains queued.",
    };
  }
  const pending = options.permissions.listPending().find((request) =>
    request.id === input.approvalId && request.threadId === current.childThreadId
  );
  if (!pending) {
    return {
      run: current,
      accepted: false,
      mailboxEvent: input.mailboxEvent,
      message: `Child approval ${input.approvalId} is not pending for child thread ${current.childThreadId}; the approval response remains queued.`,
    };
  }

  const deliveredMailbox = input.markMailboxDelivered();
  const responseMode = permissionPromptResponseModeForSubagentApproval(input.decision, input.effectiveScope);
  options.permissions.respond(input.approvalId, responseMode);
  const consumedMailbox = input.markMailboxConsumed();
  const resumed = current.status === "needs_attention"
    ? options.store.markSubagentRunStatus(current.id, "running")
    : options.store.getSubagentRun(current.id);
  input.emitEvent({
    type: "status",
    source: "approval_response",
    status: resumed.status,
    message: `Child approval response ${input.decision} was delivered to ${pending.toolName}.`,
    details: {
      approvalId: input.approvalId,
      mailboxEventId: consumedMailbox.id,
      deliveredAt: deliveredMailbox.deliveredAt,
      permissionResponseMode: responseMode,
      effectiveScope: input.effectiveScope,
    },
  });
  options.store.appendSubagentRunEvent(resumed.id, {
    type: "subagent.approval_response.consumed",
    preview: {
      approvalId: input.approvalId,
      mailboxEventId: consumedMailbox.id,
      deliveryState: consumedMailbox.deliveryState,
      deliveredAt: consumedMailbox.deliveredAt,
      decision: input.decision,
      effectiveScope: input.effectiveScope,
      permissionResponseMode: responseMode,
    },
  });
  return {
    run: options.store.getSubagentRun(resumed.id),
    accepted: true,
    mailboxEvent: consumedMailbox,
    message: "Child approval response was delivered and the parent remains blocked until the child completes or needs more attention.",
  };
}

export async function waitForSubagentChildLifecycleRun(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeWaitInput,
): Promise<SubagentChildRuntimeWaitResult> {
  const execution = options.executions.get(input.run.id);
  if (!execution) {
    return {
      run: options.store.getSubagentRun(input.run.id),
      timedOut: false,
      outcome: { kind: "runtime_detached", reason: "no_child_execution_attached" },
    };
  }
  const initialApprovalWait = resolvePendingApprovalWait(options, {
    run: input.run,
    emitEvent: input.emitEvent,
  });
  if (initialApprovalWait) return initialApprovalWait;
  const waitStartedAtMs = Date.now();
  const waitTimeoutMs = Math.max(0, Math.floor(input.timeoutMs));
  const waitDeadlineMs = waitStartedAtMs + waitTimeoutMs;
  const executionStartedMs = timestampMs(execution.startedAt) ?? waitStartedAtMs;
  const hardTimeoutMs = normalizedSubagentChildRuntimeHardTimeoutMs(input.run);
  let nextHeartbeatAtMs = waitStartedAtMs + Math.min(
    SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS,
    Math.max(1_000, Math.max(1, waitTimeoutMs)),
  );
  const childCompleted = Symbol("subagent-child-completed");
  const waitTick = Symbol("subagent-wait-tick");
  const childCompletion = execution.promise.then(() => childCompleted);
  while (true) {
    const latest = options.store.getSubagentRun(input.run.id);
    const approvalWait = resolvePendingApprovalWait(options, {
      run: latest,
      emitEvent: input.emitEvent,
    });
    if (approvalWait) return approvalWait;
    const nowMs = Date.now();
    const activity = latestChildActivity(options, latest, execution, executionStartedMs);
    const childIdleElapsedMs = Math.max(0, nowMs - activity.atMs);
    const childHardElapsedMs = Math.max(0, nowMs - executionStartedMs);
    const waitOutcomeDetails = {
      childRunId: latest.id,
      childThreadId: latest.childThreadId,
      waitElapsedMs: nowMs - waitStartedAtMs,
      waitTimeoutMs,
      lastChildActivityAt: activity.at,
      lastChildActivitySource: activity.source,
      ...(activity.detail ? { lastChildActivityDetail: activity.detail } : {}),
      childIdleElapsedMs,
      childIdleTimeoutMs: SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS,
      childHardElapsedMs,
      childHardTimeoutMs: hardTimeoutMs,
    };
    if (childHardElapsedMs >= hardTimeoutMs) {
      return {
        run: await settleBudgetExceeded(options, {
          run: latest,
          execution,
          emitEvent: input.emitEvent,
          reason: "runtime_hard_cap_exceeded",
          limitMs: hardTimeoutMs,
          lastActivity: activity,
          idleElapsedMs: childIdleElapsedMs,
          elapsedMs: childHardElapsedMs,
        }),
        timedOut: true,
        outcome: {
          kind: "child_runtime_timeout",
          reason: "runtime_hard_cap_exceeded",
          details: waitOutcomeDetails,
        },
      };
    }
    if (childIdleElapsedMs >= SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS) {
      return {
        run: await settleBudgetExceeded(options, {
          run: latest,
          execution,
          emitEvent: input.emitEvent,
          reason: "runtime_idle_timeout",
          limitMs: SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS,
          lastActivity: activity,
          idleElapsedMs: childIdleElapsedMs,
          elapsedMs: childHardElapsedMs,
        }),
        timedOut: true,
        outcome: {
          kind: "child_runtime_timeout",
          reason: "runtime_idle_timeout",
          details: waitOutcomeDetails,
        },
      };
    }
    const waitRemainingMs = waitDeadlineMs - nowMs;
    if (waitRemainingMs <= 0) {
      input.emitEvent({
        type: "status",
        source: "wait_agent",
        status: latest.status,
        message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
        details: waitOutcomeDetails,
      });
      return {
        run: latest,
        timedOut: false,
        outcome: {
          kind: "progress_return",
          reason: "parent_wait_window_elapsed",
          details: waitOutcomeDetails,
        },
      };
    }
    if (nowMs >= nextHeartbeatAtMs) {
      input.emitEvent({
        type: "status",
        source: "wait_agent",
        status: latest.status,
        message: "wait_agent is still waiting on the live child runtime.",
        details: waitOutcomeDetails,
      });
      nextHeartbeatAtMs = nowMs + SUBAGENT_WAIT_HEARTBEAT_INTERVAL_MS;
    }
    const sleepMs = Math.max(
      1,
      Math.min(
        waitDeadlineMs - nowMs,
        nextHeartbeatAtMs - nowMs,
        SUBAGENT_CHILD_ACTIVITY_IDLE_TIMEOUT_MS - childIdleElapsedMs,
        hardTimeoutMs - childHardElapsedMs,
      ),
    );
    const completion = await Promise.race([
      childCompletion,
      delaySubagentChildWaitTick(sleepMs).then(() => waitTick),
    ]);
    if (completion === childCompleted) {
      return {
        run: options.store.getSubagentRun(input.run.id),
        timedOut: false,
        outcome: { kind: "child_terminal" },
      };
    }
  }
}

export async function cancelSubagentChildLifecycleRun(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: SubagentChildRuntimeCancelInput,
): Promise<SubagentChildRuntimeCancelResult> {
  const current = options.store.getSubagentRun(input.run.id);
  if (current.closedAt) return { run: current, cancelled: false };
  const execution = options.executions.get(current.id);
  if (execution) {
    await options.abortChildThread(execution.childThreadId, { skipSubagentChildCancellation: true }).catch(() => undefined);
  }
  const latest = options.store.getSubagentRun(current.id);
  if (latest.status === "cancelled") return { run: latest, cancelled: true };
  if (isSubagentTerminalStatus(latest.status)) return { run: latest, cancelled: false };
  const cancelled = options.store.markSubagentRunStatus(latest.id, "cancelled", {
    resultArtifact: {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: latest.id,
      status: "cancelled",
      partial: false,
      summary: input.reason,
      childThreadId: latest.childThreadId,
    },
  });
  input.emitEvent({
    type: "cancelled",
    status: "cancelled",
    message: input.reason,
  });
  options.store.appendSubagentMailboxEvent(cancelled.id, {
    direction: "child_to_parent",
    type: "subagent.cancelled",
    payload: {
      status: "cancelled",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return { run: cancelled, cancelled: true };
}

function latestChildActivity(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  run: SubagentRunSummary,
  execution: SubagentChildExecutionRecord,
  fallbackMs: number,
): SubagentChildActivitySnapshot {
  let latest = activitySnapshotFromIso(execution.startedAt, "child_runtime", "execution started", fallbackMs);
  for (const value of [run.startedAt, run.updatedAt, run.createdAt]) {
    const candidate = activitySnapshotFromIso(value, "subagent_run", "run status changed", fallbackMs);
    if (candidate.atMs > latest.atMs) latest = candidate;
  }
  for (const message of options.store.listMessages(run.childThreadId)) {
    if (!message.content.trim() && message.role !== "tool") continue;
    const candidate = activitySnapshotFromIso(message.createdAt, `message:${message.role}`, `message ${message.id}`, fallbackMs);
    if (candidate.atMs > latest.atMs) latest = candidate;
  }
  for (const event of options.store.listSubagentRunEvents(run.id)) {
    const preview = event.preview;
    if (isRecord(preview) && preview.schemaVersion === "ambient-subagent-runtime-event-v1") {
      const source = typeof preview.source === "string" ? preview.source : undefined;
      if (source === "wait_agent" || source === "cancel_agent") continue;
      const eventType = typeof preview.type === "string" ? preview.type : undefined;
      const candidate = activitySnapshotFromIso(
        event.createdAt,
        source ? `runtime_event:${source}` : "runtime_event",
        eventType ? `${eventType} event ${event.sequence}` : `runtime event ${event.sequence}`,
        fallbackMs,
      );
      if (candidate.atMs > latest.atMs) latest = candidate;
      continue;
    }
    if (event.type === "subagent.runtime_event") continue;
    if (event.type.includes("wait_barrier") || event.type.includes("wait_agent")) continue;
    const candidate = activitySnapshotFromIso(event.createdAt, `run_event:${event.type}`, `run event ${event.sequence}`, fallbackMs);
    if (candidate.atMs > latest.atMs) latest = candidate;
  }
  return latest;
}

function resolvePendingApprovalWait(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: {
    run: SubagentRunSummary;
    emitEvent: SubagentRuntimeEventEmitter;
  },
): SubagentChildRuntimeWaitResult | undefined {
  const current = options.store.getSubagentRun(input.run.id);
  if (current.closedAt || isSubagentTerminalStatus(current.status)) return undefined;
  const approvalRequests = pendingPermissionApprovalRequests(options, current);
  if (!approvalRequests.length) return undefined;
  const needsAttention = current.status === "needs_attention"
    ? current
    : options.store.markSubagentRunStatus(current.id, "needs_attention");
  input.emitEvent({
    type: "status",
    status: "needs_attention",
    message: "Child runtime is waiting for parent approval.",
    details: {
      approvalIds: approvalRequests.map((approval) => approval.approvalId),
      pendingApprovalCount: approvalRequests.length,
    },
  });
  return {
    run: needsAttention,
    timedOut: false,
    outcome: { kind: "approval_wait" },
    approvalRequests,
  };
}

function pendingPermissionApprovalRequests(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  run: SubagentRunSummary,
): SubagentChildRuntimeApprovalRequest[] {
  if (!options.permissions.listPending) return [];
  return options.permissions
    .listPending()
    .filter((request) => request.threadId === run.childThreadId)
    .map((request) => subagentApprovalRequestFromPermissionRequest(run, request));
}

async function settleBudgetExceeded(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: {
    run: SubagentRunSummary;
    execution: SubagentChildExecutionRecord;
    emitEvent: SubagentRuntimeEventEmitter;
    reason?: "runtime_budget_exceeded" | "runtime_hard_cap_exceeded" | "runtime_idle_timeout";
    limitMs?: number;
    elapsedMs?: number;
    idleElapsedMs?: number;
    lastActivity?: SubagentChildActivitySnapshot;
  },
): Promise<SubagentRunSummary> {
  const current = options.store.getSubagentRun(input.run.id);
  if (["completed", "failed", "stopped", "cancelled", "timed_out", "aborted_partial"].includes(current.status)) {
    return current;
  }
  const reason = input.reason ?? "runtime_budget_exceeded";
  const runtimeTimeout = reason === "runtime_idle_timeout" || reason === "runtime_hard_cap_exceeded";
  const role = current.roleProfileSnapshot;
  const partial = runtimeTimeout ? false : role.guardPolicy.allowPartialResult;
  const status = runtimeTimeout ? "timed_out" : partial ? "aborted_partial" : "failed";
  const maxRuntimeMs = input.limitMs ?? role.guardPolicy.maxRuntimeMs;
  const startedMs = Date.parse(input.execution.startedAt);
  const elapsedMs = input.elapsedMs ?? (Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : undefined);
  const transcriptPath = subagentTranscriptPath(current.childThreadId);
  const limitLabel =
    reason === "runtime_idle_timeout"
      ? `${maxRuntimeMs}ms child idle timeout`
      : reason === "runtime_hard_cap_exceeded"
        ? `${maxRuntimeMs}ms child runtime hard cap`
        : `${maxRuntimeMs}ms role runtime budget`;
  const summary = partial
    ? `Child exceeded its ${limitLabel} before completing. Partial transcript is retained at ${transcriptPath}.`
    : `Child exceeded its ${limitLabel} and this role does not allow partial success. Transcript is retained at ${transcriptPath}.`;
  const resultArtifact = {
    schemaVersion: "ambient-subagent-result-artifact-v1" as const,
    runId: current.id,
    status,
    partial,
    summary,
    childThreadId: current.childThreadId,
    artifactPath: transcriptPath,
  };
  const settled = options.store.markSubagentRunStatus(current.id, status, {
    resultArtifact,
  });
  input.emitEvent({
    type: partial ? "status" : "error",
    status,
    source: "child_runtime",
    message: summary,
    artifactPath: transcriptPath,
    details: budgetDetails(input, reason, maxRuntimeMs, elapsedMs),
  });
  options.store.appendSubagentMailboxEvent(settled.id, {
    direction: "child_to_parent",
    type: partial ? "subagent.result" : "subagent.failed",
    payload: {
      status,
      partial,
      summary,
      childThreadId: settled.childThreadId,
      artifactPath: transcriptPath,
      ...budgetDetails(input, reason, maxRuntimeMs, elapsedMs),
    },
  });
  options.store.appendSubagentRunEvent(settled.id, {
    type: `subagent.${reason}`,
    preview: {
      childRunId: settled.id,
      childThreadId: settled.childThreadId,
      status,
      partial,
      ...budgetDetails(input, reason, maxRuntimeMs, elapsedMs),
      artifactPath: transcriptPath,
    },
  });
  options.resolveTerminalChildWaitBarriers(settled, reason);
  const parentMailboxEvent = options.store.appendSubagentLifecycleInterruptionParentMailboxEvent({
    run: settled,
    previousStatus: current.status,
    source: reason,
    reason: summary,
    resultArtifact,
    waitBarrierIds: options.store
      .listSubagentWaitBarriersForParentRun(settled.parentRunId)
      .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.includes(settled.id))
      .map((barrier) => barrier.id),
    idempotencyKey: reason,
  });
  options.emitSubagentParentMailboxEventUpdated(parentMailboxEvent);
  await options.abortChildThread(input.execution.childThreadId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    emitLifecycleError(options, {
      message: `Sub-agent child runtime budget abort failed: ${message}`,
      threadId: input.execution.childThreadId,
    });
  });
  return options.store.getSubagentRun(settled.id);
}

function budgetDetails(
  input: {
    execution: SubagentChildExecutionRecord;
    idleElapsedMs?: number;
    lastActivity?: SubagentChildActivitySnapshot;
  },
  reason: string,
  maxRuntimeMs: number,
  elapsedMs: number | undefined,
): Record<string, unknown> {
  return {
    reason,
    maxRuntimeMs,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(input.idleElapsedMs !== undefined ? { idleElapsedMs: input.idleElapsedMs } : {}),
    ...(input.lastActivity ? {
      lastChildActivityAt: input.lastActivity.at,
      lastChildActivitySource: input.lastActivity.source,
      ...(input.lastActivity.detail ? { lastChildActivityDetail: input.lastActivity.detail } : {}),
    } : {}),
    startedAt: input.execution.startedAt,
  };
}

function emitLifecycleError(
  options: AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  input: { message: string; threadId: string },
): void {
  options.emit({
    type: "error",
    message: input.message,
    threadId: input.threadId,
    workspacePath: threadWorkspacePath(options.store, input.threadId),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function activitySnapshotFromIso(
  value: string | undefined,
  source: string,
  detail: string,
  fallbackMs: number,
): SubagentChildActivitySnapshot {
  const atMs = timestampMs(value) ?? fallbackMs;
  return {
    atMs,
    at: new Date(atMs).toISOString(),
    source,
    detail,
  };
}

function normalizedSubagentChildRuntimeHardTimeoutMs(run: SubagentRunSummary): number {
  const roleLimitMs = run.roleProfileSnapshot.guardPolicy.maxRuntimeMs;
  if (!Number.isFinite(roleLimitMs) || roleLimitMs < 0) return SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS;
  return Math.max(SUBAGENT_CHILD_MIN_HARD_TIMEOUT_MS, Math.floor(roleLimitMs));
}

function delaySubagentChildWaitTick(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, Math.max(0, Math.floor(ms)));
    if (typeof timeout === "object" && "unref" in timeout && typeof timeout.unref === "function") timeout.unref();
  });
}

function threadWorkspacePath(
  store: Pick<ProjectStore, "getThread" | "getWorkspace">,
  threadId: string,
): string | undefined {
  try {
    return store.getThread(threadId).workspacePath;
  } catch {
    try {
      return store.getWorkspace().path;
    } catch {
      return undefined;
    }
  }
}
