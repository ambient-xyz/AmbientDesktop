import type {
  CallableWorkflowTaskSummary,
  RuntimeActivity,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
  callableWorkflowParentBlockingAllowedUserChoices,
  callableWorkflowParentBlockingIdempotencyKey,
  resolveCallableWorkflowParentBlocking,
  type CallableWorkflowParentBlockingBlock,
} from "../callable-workflow/callableWorkflowParentBlocking";
import {
  subagentResultRepairStateForRun,
  type SubagentResultRepairState,
} from "../subagents/subagentResultRepairState";

type RuntimeStreamActivity = Extract<RuntimeActivity, { kind: "stream" }>;

export interface SubagentFinalizationBarrierChildBlocker {
  childRunId: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  roleId?: string;
  status: SubagentRunSummary["status"] | "missing";
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  barrierIds: string[];
  lastActivityAt: string;
  lastActivitySource: string;
  lastActivityDetail?: string;
  resultRepairState?: SubagentResultRepairState;
}

export interface SubagentFinalizationBarrierBlock {
  message: string;
  barrierIds: string[];
  childRunIds: string[];
  childBlockers: SubagentFinalizationBarrierChildBlocker[];
  barriers: Array<{
    id: string;
    dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
    status: SubagentWaitBarrierSummary["status"];
    failurePolicy: SubagentWaitBarrierSummary["failurePolicy"];
    childRunIds: string[];
    childBlockers: SubagentFinalizationBarrierChildBlocker[];
  }>;
}

export interface FinalizationBlockedActivityInput<TBlock> {
  threadId: string;
  outputChars: number;
  block: TBlock;
}

interface AppendSubagentParentMailboxEventInput {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  deliveryState: "queued";
  idempotencyKey?: string;
  payload: unknown;
}

export function recordSubagentFinalizationBlockedParentMailbox(input: {
  parentThreadId: string;
  parentRunId: string;
  block: SubagentFinalizationBarrierBlock;
  getSubagentWaitBarrier: (barrierId: string) => SubagentWaitBarrierSummary;
  getSubagentRun: (runId: string) => SubagentRunSummary;
  appendSubagentParentMailboxEvent: (event: AppendSubagentParentMailboxEventInput) => SubagentParentMailboxEventSummary;
  emitSubagentParentMailboxEventUpdated: (event: SubagentParentMailboxEventSummary) => void;
}): SubagentParentMailboxEventSummary[] {
  const events: SubagentParentMailboxEventSummary[] = [];
  for (const compactBarrier of input.block.barriers) {
    let barrier: SubagentWaitBarrierSummary;
    try {
      barrier = input.getSubagentWaitBarrier(compactBarrier.id);
    } catch {
      continue;
    }
    const childRuns = barrier.childRunIds.flatMap((childRunId) => {
      try {
        return [input.getSubagentRun(childRunId)];
      } catch {
        return [];
      }
    });
    const primaryRun = childRuns[0];
    const childRunId = primaryRun?.id ?? barrier.childRunIds[0];
    if (!childRunId) continue;
    const childBlockers = childBlockersForBarrier({
      childBlockers: input.block.childBlockers,
      barrier,
      childRuns,
    });
    const parentResolution = subagentFinalizationBlockParentResolution(barrier, primaryRun, input.block.message);
    const event = input.appendSubagentParentMailboxEvent({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      parentMessageId: primaryRun?.parentMessageId,
      type: "subagent.wait_barrier_attention",
      deliveryState: "queued",
      idempotencyKey: `subagent:finalization_blocked:${input.parentRunId}:${barrier.id}:${barrier.updatedAt}`,
      payload: {
        schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId: primaryRun?.parentMessageId ?? null,
        childRunId,
        ...(primaryRun ? {
          childThreadId: primaryRun.childThreadId,
          canonicalTaskPath: primaryRun.canonicalTaskPath,
          roleId: primaryRun.roleId,
        } : {}),
        waitBarrierId: barrier.id,
        dependencyMode: barrier.dependencyMode,
        barrierStatus: barrier.status,
        failurePolicy: barrier.failurePolicy,
        childRunIds: barrier.childRunIds,
        childStatuses: childRuns.map((run) => ({ childRunId: run.id, status: run.status })),
        childBlockers,
        waitTimedOut: barrier.status === "timed_out",
        parentFinalizationBlocked: true,
        parentResolution,
        allowedUserChoices: subagentFinalizationBlockUserChoices(parentResolution.action, barrier.failurePolicy),
        reason: parentResolution.reason,
        instruction: parentResolution.instruction,
        waitBarrier: {
          id: barrier.id,
          status: barrier.status,
          dependencyMode: barrier.dependencyMode,
          failurePolicy: barrier.failurePolicy,
          childRunIds: barrier.childRunIds,
          childBlockers,
          ...(barrier.quorumThreshold ? { quorumThreshold: barrier.quorumThreshold } : {}),
          ...(barrier.timeoutMs ? { timeoutMs: barrier.timeoutMs } : {}),
        },
      },
    });
    input.emitSubagentParentMailboxEventUpdated(event);
    events.push(event);
  }
  return events;
}

export function recordCallableWorkflowFinalizationBlockedParentMailbox(input: {
  parentThreadId: string;
  parentRunId: string;
  block: CallableWorkflowParentBlockingBlock;
  appendSubagentParentMailboxEvent: (event: AppendSubagentParentMailboxEventInput) => SubagentParentMailboxEventSummary;
  emitSubagentParentMailboxEventUpdated: (event: SubagentParentMailboxEventSummary) => void;
}): SubagentParentMailboxEventSummary {
  const parentMessageId = input.block.parentMessageId ?? input.block.tasks[0]?.parentMessageId;
  const event = input.appendSubagentParentMailboxEvent({
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    parentMessageId,
    type: CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
    deliveryState: "queued",
    idempotencyKey: callableWorkflowParentBlockingIdempotencyKey({
      parentRunId: input.parentRunId,
      block: input.block,
    }),
    payload: {
      ...input.block,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      parentMessageId: parentMessageId ?? null,
      allowedUserChoices: callableWorkflowParentBlockingAllowedUserChoices(input.block),
    },
  });
  input.emitSubagentParentMailboxEventUpdated(event);
  return event;
}

export function subagentFinalizationBlockedActivity(
  input: FinalizationBlockedActivityInput<SubagentFinalizationBarrierBlock>,
): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "timeout",
    outputChars: input.outputChars,
    message: "Parent final answer blocked by required sub-agent work that is not safe for synthesis.",
    diagnostic: {
      reason: "required_wait_barrier_not_satisfied",
      barrierIds: input.block.barrierIds,
      childRunIds: input.block.childRunIds,
      childBlockers: input.block.childBlockers.map((blocker) => ({
        childRunId: blocker.childRunId,
        status: blocker.status,
        dependencyMode: blocker.dependencyMode,
        barrierIds: blocker.barrierIds,
        lastActivityAt: blocker.lastActivityAt,
        lastActivitySource: blocker.lastActivitySource,
        ...(blocker.childThreadId ? { childThreadId: blocker.childThreadId } : {}),
        ...(blocker.canonicalTaskPath ? { canonicalTaskPath: blocker.canonicalTaskPath } : {}),
        ...(blocker.roleId ? { roleId: blocker.roleId } : {}),
        ...(blocker.lastActivityDetail ? { lastActivityDetail: blocker.lastActivityDetail } : {}),
        ...(blocker.resultRepairState ? { resultRepairState: blocker.resultRepairState } : {}),
      })),
    },
  };
}

export function callableWorkflowFinalizationBlockedActivity(
  input: FinalizationBlockedActivityInput<CallableWorkflowParentBlockingBlock>,
): RuntimeStreamActivity {
  return {
    threadId: input.threadId,
    kind: "stream",
    status: "timeout",
    outputChars: input.outputChars,
    message: "Parent final answer blocked by blocking callable workflow work that is not safe for synthesis.",
    diagnostic: {
      reason: input.block.reason,
      taskIds: input.block.taskIds,
      workflowRunIds: input.block.workflowRunIds,
    },
  };
}

export function subagentFinalizationBlockParentResolution(
  barrier: SubagentWaitBarrierSummary,
  primaryRun: SubagentRunSummary | undefined,
  reason: string,
): Record<string, unknown> {
  const action = subagentFinalizationBlockAction(barrier);
  const requiresExplicitPartial = action === "ask_user" && barrier.failurePolicy === "degrade_partial";
  return {
    schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
    childRunId: primaryRun?.id ?? barrier.childRunIds[0] ?? "",
    childStatus: primaryRun?.status ?? "unknown",
    waitBarrierId: barrier.id,
    barrierStatus: barrier.status,
    failurePolicy: barrier.failurePolicy,
    status: "blocked",
    action,
    canSynthesize: false,
    requiresUserInput: action === "ask_user",
    requiresExplicitPartial,
    reason,
    instruction: requiresExplicitPartial
      ? "Do not synthesize child work. Ask the user whether to retry, cancel, or continue only after an explicit partial result is available."
      : action === "wait_for_child"
        ? "Do not synthesize child work. Wait again, send follow-up guidance, or cancel the parent run explicitly."
        : action === "retry_child"
          ? "Do not synthesize child work. Retry the child or send targeted follow-up before attempting a parent answer."
          : action === "fail_parent"
            ? "Do not synthesize child work. Fail or block the parent run and surface the required child failure."
            : "Do not synthesize child work. Ask the user whether to retry, detach, cancel, or stop the parent run.",
  };
}

export function subagentFinalizationBlockAction(barrier: SubagentWaitBarrierSummary): string {
  if (barrier.status === "waiting_on_children") return "wait_for_child";
  if (barrier.failurePolicy === "fail_parent") return "fail_parent";
  if (barrier.failurePolicy === "retry_child") return "retry_child";
  return "ask_user";
}

export function subagentFinalizationBlockUserChoices(
  action: unknown,
  failurePolicy: SubagentWaitBarrierSummary["failurePolicy"],
): Array<Record<string, unknown>> {
  if (action === "wait_for_child") {
    return [
      { id: "wait_again", label: "Wait again", toolAction: "wait_agent" },
      { id: "send_child_steering", label: "Send child steering", toolAction: "send_agent_or_followup_agent" },
      { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
    ];
  }
  const partialChoice = failurePolicy === "degrade_partial"
    ? [{
      id: "continue_with_partial",
      label: "Continue with partial",
      toolAction: "resolve_barrier",
      decision: "continue_with_partial",
      requiresUserDecision: true,
      requiresPartialSummary: true,
    }]
    : [];
  return [
    ...partialChoice,
    { id: "send_child_steering", label: "Send child steering", toolAction: "send_agent_or_followup_agent" },
    { id: "retry_child", label: "Retry child", toolAction: "resolve_barrier", decision: "retry_child" },
    { id: "detach_child", label: "Detach child", toolAction: "resolve_barrier", decision: "detach_child", parentControl: "stop_parent_only_detach_child" },
    { id: "cancel_parent", label: "Cancel parent run", toolAction: "resolve_barrier", decision: "cancel_parent", parentControl: "cancel_parent_run" },
    { id: "fail_parent", label: "Fail parent", toolAction: "resolve_barrier", decision: "fail_parent" },
  ];
}

export function subagentFinalizationBarrierBlock(input: {
  parentThreadId: string;
  parentRunId: string;
  listSubagentWaitBarriersForParentRun: (parentRunId: string) => SubagentWaitBarrierSummary[];
  getSubagentRun: (runId: string) => SubagentRunSummary;
  listSubagentRunEvents?: (runId: string) => SubagentRunEventSummary[];
  listSubagentMailboxEvents?: (runId: string) => SubagentMailboxEventSummary[];
}): SubagentFinalizationBarrierBlock | undefined {
  const barriers = input.listSubagentWaitBarriersForParentRun(input.parentRunId)
    .filter((barrier) =>
      barrier.parentThreadId === input.parentThreadId &&
      barrier.status !== "satisfied" &&
      barrier.dependencyMode !== "optional_background");
  if (barriers.length === 0) return undefined;
  const childRunIds = [...new Set(barriers.flatMap((barrier) => barrier.childRunIds))];
  const compactBarriers = barriers.map((barrier) => ({
    id: barrier.id,
    dependencyMode: barrier.dependencyMode,
    status: barrier.status,
    failurePolicy: barrier.failurePolicy,
    childRunIds: barrier.childRunIds,
    childBlockers: barrier.childRunIds.map((childRunId) =>
      subagentFinalizationBarrierChildBlocker({
        barrier,
        childRunId,
        getSubagentRun: input.getSubagentRun,
        listSubagentRunEvents: input.listSubagentRunEvents,
        listSubagentMailboxEvents: input.listSubagentMailboxEvents,
      })
    ),
  }));
  const childBlockers = dedupeFinalizationChildBlockers(compactBarriers.flatMap((barrier) => barrier.childBlockers));
  const childFacts = childBlockers.map((blocker) => childBlockerFact(blocker));
  const message = [
    "Parent final answer blocked because required sub-agent work is not safe for synthesis.",
    `Blocking barriers: ${compactBarriers.map((barrier) => `${barrier.id} (${barrier.dependencyMode}, ${barrier.status}, ${barrier.failurePolicy})`).join(", ")}.`,
    `Child statuses: ${childBlockers.map((blocker) => `${blocker.childRunId} (${blocker.status})`).join(", ")}.`,
    `Child blockers: ${childFacts.join(", ")}.`,
    "Use the barrier failure policy: wait for a valid child result, retry the child, ask the user, fail the parent, or continue only with an explicit partial result artifact.",
  ].join("\n");
  return {
    message,
    barrierIds: barriers.map((barrier) => barrier.id),
    childRunIds,
    childBlockers,
    barriers: compactBarriers,
  };
}

function childBlockersForBarrier(input: {
  childBlockers: SubagentFinalizationBarrierChildBlocker[];
  barrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
}): SubagentFinalizationBarrierChildBlocker[] {
  return input.barrier.childRunIds.map((childRunId) => {
    const existing = input.childBlockers.find((blocker) => blocker.childRunId === childRunId);
    const run = input.childRuns.find((candidate) => candidate.id === childRunId);
    if (!run) {
      return existing ?? missingFinalizationChildBlocker({ barrier: input.barrier, childRunId });
    }
    return {
      ...existing,
      childRunId: run.id,
      childThreadId: run.childThreadId,
      canonicalTaskPath: run.canonicalTaskPath,
      roleId: run.roleId,
      status: run.status,
      dependencyMode: input.barrier.dependencyMode,
      barrierIds: [...new Set([...(existing?.barrierIds ?? []), input.barrier.id])],
      lastActivityAt: existing?.lastActivityAt ?? run.updatedAt ?? run.createdAt,
      lastActivitySource: existing?.lastActivitySource ?? "subagent_run",
      lastActivityDetail: existing?.lastActivityDetail ?? "run updated",
      ...(existing?.resultRepairState ? { resultRepairState: existing.resultRepairState } : {}),
    };
  });
}

function subagentFinalizationBarrierChildBlocker(input: {
  barrier: SubagentWaitBarrierSummary;
  childRunId: string;
  getSubagentRun: (runId: string) => SubagentRunSummary;
  listSubagentRunEvents?: (runId: string) => SubagentRunEventSummary[];
  listSubagentMailboxEvents?: (runId: string) => SubagentMailboxEventSummary[];
}): SubagentFinalizationBarrierChildBlocker {
  let run: SubagentRunSummary;
  try {
    run = input.getSubagentRun(input.childRunId);
  } catch {
    return missingFinalizationChildBlocker({ barrier: input.barrier, childRunId: input.childRunId });
  }
  const runEvents = safeList(() => input.listSubagentRunEvents?.(run.id));
  const mailboxEvents = safeList(() => input.listSubagentMailboxEvents?.(run.id));
  const activity = latestSubagentFinalizationBlockerActivity({
    run,
    runEvents,
    mailboxEvents,
  });
  const resultRepairState = subagentResultRepairStateForRun({ run, events: runEvents });
  return {
    childRunId: run.id,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    status: run.status,
    dependencyMode: input.barrier.dependencyMode,
    barrierIds: [input.barrier.id],
    lastActivityAt: activity.at,
    lastActivitySource: activity.source,
    ...(activity.detail ? { lastActivityDetail: activity.detail } : {}),
    ...(resultRepairState ? { resultRepairState } : {}),
  };
}

function missingFinalizationChildBlocker(input: {
  barrier: SubagentWaitBarrierSummary;
  childRunId: string;
}): SubagentFinalizationBarrierChildBlocker {
  return {
    childRunId: input.childRunId,
    status: "missing",
    dependencyMode: input.barrier.dependencyMode,
    barrierIds: [input.barrier.id],
    lastActivityAt: input.barrier.updatedAt ?? input.barrier.createdAt,
    lastActivitySource: "wait_barrier",
    lastActivityDetail: "child run missing from store",
  };
}

function dedupeFinalizationChildBlockers(
  blockers: SubagentFinalizationBarrierChildBlocker[],
): SubagentFinalizationBarrierChildBlocker[] {
  const byRunId = new Map<string, SubagentFinalizationBarrierChildBlocker>();
  for (const blocker of blockers) {
    const existing = byRunId.get(blocker.childRunId);
    if (!existing) {
      byRunId.set(blocker.childRunId, blocker);
      continue;
    }
    byRunId.set(blocker.childRunId, {
      ...newerFinalizationBlocker(existing, blocker),
      barrierIds: [...new Set([...existing.barrierIds, ...blocker.barrierIds])],
    });
  }
  return [...byRunId.values()];
}

function latestSubagentFinalizationBlockerActivity(input: {
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

function newerFinalizationBlocker(
  a: SubagentFinalizationBarrierChildBlocker,
  b: SubagentFinalizationBarrierChildBlocker,
): SubagentFinalizationBarrierChildBlocker {
  const aMs = Date.parse(a.lastActivityAt);
  const bMs = Date.parse(b.lastActivityAt);
  if (!Number.isFinite(bMs)) return a;
  if (!Number.isFinite(aMs) || bMs >= aMs) return b;
  return a;
}

function safeList<T>(read: () => T[] | undefined): T[] {
  try {
    return read() ?? [];
  } catch {
    return [];
  }
}

function childBlockerFact(blocker: SubagentFinalizationBarrierChildBlocker): string {
  const path = blocker.canonicalTaskPath ? `, path ${blocker.canonicalTaskPath}` : "";
  const thread = blocker.childThreadId ? `, thread ${blocker.childThreadId}` : "";
  const repair = blocker.resultRepairState
    ? `, repair pending: ${blocker.resultRepairState.reason}`
    : "";
  return `${blocker.childRunId} (${blocker.status}${path}${thread}, last activity ${blocker.lastActivityAt} via ${blocker.lastActivitySource}${repair})`;
}

export function callableWorkflowFinalizationBlock(input: {
  parentThreadId: string;
  parentRunId: string;
  listCallableWorkflowTasksForParentRun: (parentRunId: string) => CallableWorkflowTaskSummary[];
}): CallableWorkflowParentBlockingBlock | undefined {
  return resolveCallableWorkflowParentBlocking({
    tasks: input.listCallableWorkflowTasksForParentRun(input.parentRunId)
      .filter((task) => task.parentThreadId === input.parentThreadId),
  });
}
