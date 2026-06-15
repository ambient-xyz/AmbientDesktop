import type {
  CallableWorkflowTaskSummary,
  RuntimeActivity,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
  callableWorkflowParentBlockingAllowedUserChoices,
  callableWorkflowParentBlockingIdempotencyKey,
  resolveCallableWorkflowParentBlocking,
  type CallableWorkflowParentBlockingBlock,
} from "./callableWorkflowParentBlocking";

type RuntimeStreamActivity = Extract<RuntimeActivity, { kind: "stream" }>;

export interface SubagentFinalizationBarrierBlock {
  message: string;
  barrierIds: string[];
  childRunIds: string[];
  barriers: Array<{
    id: string;
    dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
    status: SubagentWaitBarrierSummary["status"];
    failurePolicy: SubagentWaitBarrierSummary["failurePolicy"];
    childRunIds: string[];
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
}): SubagentFinalizationBarrierBlock | undefined {
  const barriers = input.listSubagentWaitBarriersForParentRun(input.parentRunId)
    .filter((barrier) =>
      barrier.parentThreadId === input.parentThreadId &&
      barrier.status !== "satisfied" &&
      barrier.dependencyMode !== "optional_background");
  if (barriers.length === 0) return undefined;
  const childRunIds = [...new Set(barriers.flatMap((barrier) => barrier.childRunIds))];
  const childFacts = childRunIds.map((childRunId) => {
    try {
      const run = input.getSubagentRun(childRunId);
      return `${run.id} (${run.status})`;
    } catch {
      return `${childRunId} (missing)`;
    }
  });
  const compactBarriers = barriers.map((barrier) => ({
    id: barrier.id,
    dependencyMode: barrier.dependencyMode,
    status: barrier.status,
    failurePolicy: barrier.failurePolicy,
    childRunIds: barrier.childRunIds,
  }));
  const message = [
    "Parent final answer blocked because required sub-agent work is not safe for synthesis.",
    `Blocking barriers: ${compactBarriers.map((barrier) => `${barrier.id} (${barrier.dependencyMode}, ${barrier.status}, ${barrier.failurePolicy})`).join(", ")}.`,
    `Child runs: ${childFacts.join(", ")}.`,
    "Use the barrier failure policy: wait for a valid child result, retry the child, ask the user, fail the parent, or continue only with an explicit partial result artifact.",
  ].join("\n");
  return {
    message,
    barrierIds: barriers.map((barrier) => barrier.id),
    childRunIds,
    barriers: compactBarriers,
  };
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
