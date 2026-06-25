import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import {
  buildPatternGraphSnapshot,
  type SubagentPatternGraphApprovalState,
  type SubagentPatternGraphChildBinding,
} from "../../shared/subagentPatternGraph";
import type { CallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import { callableWorkflowExecutionPlanWithDurableLaunchBridge } from "./callableWorkflowCompilerHandoff";
export {
  CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION,
  CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION,
  CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_WAIT_TIMEOUT_MS,
  buildCallableWorkflowCompilerHandoffPlan,
  callableWorkflowExecutionPlanFromTask,
  callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan,
  type CallableWorkflowCompilerHandoffPlan,
  type CallableWorkflowSymphonyChildLaunchContract,
  type CallableWorkflowSymphonyLaunchBridgeContract,
} from "./callableWorkflowCompilerHandoff";
export { analyzeCallableWorkflowTaskRestartState, type CallableWorkflowTaskParentRunSnapshot } from "./callableWorkflowTaskRestartAnalysis";

export const CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION = "ambient-callable-workflow-task-queue-v1" as const;
export const CALLABLE_WORKFLOW_TASK_QUEUED_STATUS = "queued" as const;
export const CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE = "callable_workflow.task_started" as const;
export const CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE = "callable_workflow.task_finished" as const;
export const CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE = "callable_workflow.task_control" as const;

export type CallableWorkflowTaskControlAction = "pause_requested" | "resume_requested" | "cancel_requested";

export type CallableWorkflowQueuedTaskDraft = Omit<
  CallableWorkflowTaskSummary,
  "createdAt" | "updatedAt" | "startedAt" | "completedAt" | "workflowArtifactId" | "workflowRunId" | "errorMessage"
>;

export function callableWorkflowQueuedTaskDraftFromExecutionPlan(
  executionPlan: CallableWorkflowExecutionPlan,
  options: { parentMessageId?: string | undefined } = {},
): CallableWorkflowQueuedTaskDraft {
  const parentMessageId = options.parentMessageId ?? executionPlan.parent.assistantMessageId;
  const resolvedExecutionPlan =
    parentMessageId === executionPlan.parent.assistantMessageId
      ? executionPlan
      : {
          ...executionPlan,
          parent: {
            ...executionPlan.parent,
            assistantMessageId: parentMessageId,
          },
        };
  const draft: CallableWorkflowQueuedTaskDraft = {
    id: resolvedExecutionPlan.launchId,
    launchId: resolvedExecutionPlan.launchId,
    parentThreadId: resolvedExecutionPlan.parent.threadId,
    parentRunId: resolvedExecutionPlan.parent.runId,
    parentMessageId,
    toolCallId: resolvedExecutionPlan.toolCallId,
    toolId: resolvedExecutionPlan.workflowRunPlan.toolId,
    toolName: resolvedExecutionPlan.workflowRunPlan.toolName,
    sourceKind: resolvedExecutionPlan.workflowRunPlan.source.kind,
    title: resolvedExecutionPlan.visibleTask.title,
    status: CALLABLE_WORKFLOW_TASK_QUEUED_STATUS,
    statusLabel: resolvedExecutionPlan.visibleTask.statusLabel,
    blocking: resolvedExecutionPlan.visibleTask.blocking,
    defaultCollapsed: resolvedExecutionPlan.visibleTask.defaultCollapsed,
    progressVisible: resolvedExecutionPlan.visibleTask.progressVisible,
    tokenCostTracking: resolvedExecutionPlan.visibleTask.tokenCostTracking,
    pauseResumeCancel: resolvedExecutionPlan.visibleTask.pauseResumeCancel,
    cancelHandle: resolvedExecutionPlan.visibleTask.cancelHandle,
    runnerTarget: resolvedExecutionPlan.runnerHandoff.target,
    runnerDeferredReason: resolvedExecutionPlan.runnerHandoff.deferredReason,
    launchCard: resolvedExecutionPlan.visibleTask.launchCard,
    executionPlan: resolvedExecutionPlan,
    ...callableWorkflowPatternGraphSnapshotFromExecutionPlan(resolvedExecutionPlan),
  };
  return {
    ...draft,
    executionPlan: callableWorkflowExecutionPlanWithDurableLaunchBridge(draft, resolvedExecutionPlan),
  };
}

export function callableWorkflowPatternGraphSnapshotFromExecutionPlan(executionPlan: CallableWorkflowExecutionPlan): {
  patternGraphSnapshot?: SubagentPatternGraphSnapshot;
} {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  if (sourceContext.kind !== "symphony_recipe") return {};
  return {
    patternGraphSnapshot: buildPatternGraphSnapshot({
      patternId: sourceContext.recipeId,
      parentThreadId: executionPlan.parent.threadId,
      ...(executionPlan.parent.assistantMessageId ? { parentMessageId: executionPlan.parent.assistantMessageId } : {}),
      workflowTaskId: executionPlan.launchId,
      updatedAt: executionPlan.createdAt,
    }),
  };
}

export interface CallableWorkflowPatternGraphChildBindingRequest {
  workflowTaskId: string;
  roleNodeId: string;
  childRunId: string;
  label?: string;
  approvalState?: SubagentPatternGraphApprovalState;
  blockingParent?: boolean;
  updatedAt?: string;
}

export function assertCallableWorkflowPatternGraphCanBind(input: {
  task: CallableWorkflowTaskSummary;
  parentThreadId: string;
  parentRunId: string;
  roleNodeId: string;
}): void {
  if (input.task.parentThreadId !== input.parentThreadId || input.task.parentRunId !== input.parentRunId) {
    throw new Error(`Callable workflow task ${input.task.id} does not belong to this parent thread/run.`);
  }
  if (!input.task.patternGraphSnapshot) {
    throw new Error(`Callable workflow task ${input.task.id} has no pattern graph snapshot to bind.`);
  }
  if (!patternGraphSnapshotHasRoleNode(input.task.patternGraphSnapshot, input.roleNodeId)) {
    throw new Error(`Pattern graph role node ${input.roleNodeId} does not exist on callable workflow task ${input.task.id}.`);
  }
}

export function callableWorkflowPatternGraphSnapshotWithChildBinding(input: {
  task: CallableWorkflowTaskSummary;
  run: SubagentRunSummary;
  childThread?: Pick<ThreadSummary, "title" | "lastMessagePreview">;
  roleNodeId: string;
  label?: string;
  approvalState?: SubagentPatternGraphApprovalState;
  blockingParent?: boolean;
  updatedAt: string;
}): SubagentPatternGraphSnapshot {
  const snapshot = input.task.patternGraphSnapshot;
  if (!snapshot) {
    throw new Error(`Callable workflow task ${input.task.id} has no pattern graph snapshot to bind.`);
  }
  assertCallableWorkflowPatternGraphCanBind({
    task: input.task,
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    roleNodeId: input.roleNodeId,
  });
  const childBindings = existingPatternGraphChildBindings(snapshot, input.run.id);
  childBindings.push({
    roleNodeId: input.roleNodeId,
    childRunId: input.run.id,
    childThreadId: input.run.childThreadId,
    label:
      input.label ??
      input.childThread?.title ??
      input.run.effectiveRoleSnapshot?.displayLabel ??
      `${input.run.roleProfileSnapshot.label} sub-agent`,
    status: input.run.status,
    approvalState: input.approvalState ?? "none",
    blockingParent: input.blockingParent ?? input.run.dependencyMode === "required",
    summary: input.childThread?.lastMessagePreview || input.run.canonicalTaskPath,
  });
  return buildPatternGraphSnapshot({
    patternId: snapshot.patternId,
    parentThreadId: snapshot.parentThreadId,
    ...(snapshot.parentMessageId ? { parentMessageId: snapshot.parentMessageId } : {}),
    ...(snapshot.workflowTaskId ? { workflowTaskId: snapshot.workflowTaskId } : { workflowTaskId: input.task.id }),
    ...(snapshot.workflowRunId ? { workflowRunId: snapshot.workflowRunId } : {}),
    updatedAt: input.updatedAt,
    childBindings,
  });
}

function patternGraphSnapshotHasRoleNode(snapshot: SubagentPatternGraphSnapshot, roleNodeId: string): boolean {
  return snapshot.nodes.some((node) => node.id === roleNodeId || node.id.startsWith(`${roleNodeId}:`));
}

function existingPatternGraphChildBindings(
  snapshot: SubagentPatternGraphSnapshot,
  excludingChildRunId: string,
): SubagentPatternGraphChildBinding[] {
  return snapshot.nodes.flatMap((node): SubagentPatternGraphChildBinding[] => {
    if (!node.childRunId || !node.childThreadId || node.childRunId === excludingChildRunId) return [];
    const roleNodeId = node.id.includes(":") ? node.id.slice(0, node.id.indexOf(":")) : node.id;
    return [
      {
        roleNodeId,
        childRunId: node.childRunId,
        childThreadId: node.childThreadId,
        label: node.label,
        status: node.status,
        approvalState: node.approvalState,
        blockingParent: node.blockingParent,
        ...(node.summary ? { summary: node.summary } : {}),
      },
    ];
  });
}
