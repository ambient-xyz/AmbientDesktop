import type {
  SubagentEffectiveRoleSnapshot,
  SubagentPatternGraphSnapshot,
  SubagentPatternRoleId,
} from "../../shared/subagentPatternGraph";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskRestartIssue, CallableWorkflowTaskRestartReconciliationSummary, CallableWorkflowTaskStatus, CallableWorkflowTaskSummary, WorkflowArtifactSummary, WorkflowRunStatus, WorkflowRunSummary } from "../../shared/workflowTypes";
import { SYMPHONY_WORKFLOW_PATTERN_IDS, type SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import {
  buildPatternGraphSnapshot,
  buildDefaultSymphonyPatternRoleGraph,
  effectiveSubagentRoleSnapshot,
  type SubagentPatternGraphApprovalState,
  type SubagentPatternGraphChildBinding,
} from "../../shared/subagentPatternGraph";
import {
  getDefaultSubagentRoleProfile,
  type SubagentRoleId,
} from "../../shared/subagentRoles";
import type {
  SubagentDependencyMode,
  SubagentForkMode,
  SubagentPromptMode,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
} from "../../shared/subagentProtocol";
import {
  cloneCallableWorkflowCallerProvenance,
  defaultCallableWorkflowCallerProvenance,
  type CallableWorkflowCallerProvenance,
  type CallableWorkflowExecutionPlan,
} from "./callableWorkflowExecutionPlan";

export const CALLABLE_WORKFLOW_TASK_QUEUE_SCHEMA_VERSION = "ambient-callable-workflow-task-queue-v1" as const;
export const CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION =
  "ambient-callable-workflow-compiler-handoff-v1" as const;
export const CALLABLE_WORKFLOW_TASK_QUEUED_STATUS = "queued" as const;
export const CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE = "callable_workflow.task_started" as const;
export const CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE = "callable_workflow.task_finished" as const;
export const CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE = "callable_workflow.task_control" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION =
  "ambient-callable-workflow-symphony-launch-bridge-v1" as const;
export const CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_WAIT_TIMEOUT_MS = 10 * 60_000;

export type CallableWorkflowTaskControlAction =
  | "pause_requested"
  | "resume_requested"
  | "cancel_requested";

export interface CallableWorkflowTaskParentRunSnapshot {
  id: string;
  threadId: string;
}

export type CallableWorkflowQueuedTaskDraft = Omit<
  CallableWorkflowTaskSummary,
  "createdAt" | "updatedAt" | "startedAt" | "completedAt" | "workflowArtifactId" | "workflowRunId" | "errorMessage"
>;

export interface CallableWorkflowCompilerHandoffPlan {
  schemaVersion: typeof CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION;
  taskId: string;
  launchId: string;
  createdAt: string;
  parent: {
    threadId: string;
    runId: string;
    messageId?: string;
  };
  callerProvenance: CallableWorkflowCallerProvenance;
  compiler: {
    target: "workflowCompilerService";
    userRequest: string;
    workflowThreadTitle: string;
    workflowThreadInitialRequest: string;
    sourceKind: string;
    toolName: string;
    toolId: string;
    input: Record<string, unknown>;
    blocking: boolean;
    launchCard: NonNullable<CallableWorkflowTaskSummary["launchCard"]>;
    requiredBeforeStart: readonly string[];
    launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract;
  };
  runStart: {
    mode: "compile_then_start_workflow_run";
    desktopEventType: "workflow-run-started";
    requiresArtifactBeforeRun: true;
    allowUnapprovedOneOff: true;
  };
}

export interface CallableWorkflowSymphonyLaunchBridgeContract {
  schemaVersion: typeof CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION;
  workflowTaskId: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  expectedWorkflowToolName: string;
  expectedWorkflowToolId: string;
  sourceKind: "symphony_recipe";
  pattern: {
    id: SymphonyWorkflowPatternId;
    label: string;
    blocking: boolean;
  };
  childLaunches: CallableWorkflowSymphonyChildLaunchContract[];
  wait: {
    mode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    timeoutMs: number;
    blocking: boolean;
    childRoleNodeIds: string[];
  };
  expectedEvidence: string[];
}

export interface CallableWorkflowSymphonyChildLaunchContract {
  roleNodeId: string;
  label: string;
  title: string;
  task: string;
  roleId: SubagentRoleId;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  effectiveRole: SubagentEffectiveRoleSnapshot;
  patternRole: SubagentPatternRoleId;
  patternGraphBinding: {
    workflowTaskId: string;
    roleNodeId: string;
    label: string;
    approvalState: SubagentPatternGraphApprovalState;
    blockingParent: boolean;
  };
  toolScope: {
    mode: "role_defaults";
    rationale: string;
  };
  idempotencyKey: string;
}

export function callableWorkflowQueuedTaskDraftFromExecutionPlan(
  executionPlan: CallableWorkflowExecutionPlan,
): CallableWorkflowQueuedTaskDraft {
  return {
    id: executionPlan.launchId,
    launchId: executionPlan.launchId,
    parentThreadId: executionPlan.parent.threadId,
    parentRunId: executionPlan.parent.runId,
    parentMessageId: executionPlan.parent.assistantMessageId,
    toolCallId: executionPlan.toolCallId,
    toolId: executionPlan.workflowRunPlan.toolId,
    toolName: executionPlan.workflowRunPlan.toolName,
    sourceKind: executionPlan.workflowRunPlan.source.kind,
    title: executionPlan.visibleTask.title,
    status: CALLABLE_WORKFLOW_TASK_QUEUED_STATUS,
    statusLabel: executionPlan.visibleTask.statusLabel,
    blocking: executionPlan.visibleTask.blocking,
    defaultCollapsed: executionPlan.visibleTask.defaultCollapsed,
    progressVisible: executionPlan.visibleTask.progressVisible,
    tokenCostTracking: executionPlan.visibleTask.tokenCostTracking,
    pauseResumeCancel: executionPlan.visibleTask.pauseResumeCancel,
    cancelHandle: executionPlan.visibleTask.cancelHandle,
    runnerTarget: executionPlan.runnerHandoff.target,
    runnerDeferredReason: executionPlan.runnerHandoff.deferredReason,
    launchCard: executionPlan.visibleTask.launchCard,
    executionPlan,
    ...callableWorkflowPatternGraphSnapshotFromExecutionPlan(executionPlan),
  };
}

export function callableWorkflowPatternGraphSnapshotFromExecutionPlan(
  executionPlan: CallableWorkflowExecutionPlan,
): { patternGraphSnapshot?: SubagentPatternGraphSnapshot } {
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
    label: input.label ?? input.childThread?.title ?? input.run.effectiveRoleSnapshot?.displayLabel ?? `${input.run.roleProfileSnapshot.label} sub-agent`,
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
  return snapshot.nodes.some((node) =>
    node.id === roleNodeId ||
    node.id.startsWith(`${roleNodeId}:`)
  );
}

function existingPatternGraphChildBindings(
  snapshot: SubagentPatternGraphSnapshot,
  excludingChildRunId: string,
): SubagentPatternGraphChildBinding[] {
  return snapshot.nodes.flatMap((node): SubagentPatternGraphChildBinding[] => {
    if (!node.childRunId || !node.childThreadId || node.childRunId === excludingChildRunId) return [];
    const roleNodeId = node.id.includes(":") ? node.id.slice(0, node.id.indexOf(":")) : node.id;
    return [{
      roleNodeId,
      childRunId: node.childRunId,
      childThreadId: node.childThreadId,
      label: node.label,
      status: node.status,
      approvalState: node.approvalState,
      blockingParent: node.blockingParent,
      ...(node.summary ? { summary: node.summary } : {}),
    }];
  });
}

export function analyzeCallableWorkflowTaskRestartState(input: {
  tasks: readonly CallableWorkflowTaskSummary[];
  threads: readonly Pick<ThreadSummary, "id">[];
  parentRuns: readonly CallableWorkflowTaskParentRunSnapshot[];
  workflowArtifacts: readonly Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">[];
  workflowRuns: readonly Pick<WorkflowRunSummary, "id" | "artifactId" | "status">[];
  createdAt?: string;
}): CallableWorkflowTaskRestartReconciliationSummary {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const issues: CallableWorkflowTaskRestartIssue[] = [];
  const threadIds = new Set(input.threads.map((thread) => thread.id));
  const parentRunsById = new Map(input.parentRuns.map((run) => [run.id, run]));
  const artifactsById = new Map(input.workflowArtifacts.map((artifact) => [artifact.id, artifact]));
  const workflowRunsById = new Map(input.workflowRuns.map((run) => [run.id, run]));

  for (const task of input.tasks) {
    if (!threadIds.has(task.parentThreadId)) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_parent_thread",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} references missing parent thread ${task.parentThreadId}.`,
      }));
    }

    const parentRun = parentRunsById.get(task.parentRunId);
    if (!parentRun) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_parent_run",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} references missing parent run ${task.parentRunId}.`,
      }));
    } else if (parentRun.threadId !== task.parentThreadId) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "parent_run_thread_mismatch",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} parent run ${task.parentRunId} belongs to thread ${parentRun.threadId}, not ${task.parentThreadId}.`,
      }));
    }

    const artifact = task.workflowArtifactId ? artifactsById.get(task.workflowArtifactId) : undefined;
    if (task.workflowArtifactId && !artifact) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_workflow_artifact",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} is linked to missing workflow artifact ${task.workflowArtifactId}.`,
      }));
    } else if (artifact && !artifact.workflowThreadId) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_workflow_thread",
        severity: "warning",
        task,
        message: `Callable workflow task ${task.id} artifact ${artifact.id} has no workflow thread link for restart rehydration.`,
      }));
    }

    const workflowRun = task.workflowRunId ? workflowRunsById.get(task.workflowRunId) : undefined;
    if (task.workflowRunId && !workflowRun) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_workflow_run",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} is linked to missing workflow run ${task.workflowRunId}.`,
      }));
    }

    if (workflowRun && task.workflowArtifactId && workflowRun.artifactId !== task.workflowArtifactId) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "workflow_run_artifact_mismatch",
        severity: "error",
        task,
        message: `Callable workflow task ${task.id} run ${workflowRun.id} points to artifact ${workflowRun.artifactId}, not task artifact ${task.workflowArtifactId}.`,
      }));
    }

    if (workflowRun && !task.workflowArtifactId) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "missing_task_artifact_link",
        severity: "warning",
        task,
        workflowArtifactId: workflowRun.artifactId,
        message: `Callable workflow task ${task.id} has workflow run ${workflowRun.id} but no task artifact link.`,
      }));
    }

    if (
      workflowRun &&
      CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_RUN_STATUSES.has(workflowRun.status) &&
      !CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_TASK_STATUSES.has(task.status) &&
      (!task.workflowArtifactId || workflowRun.artifactId === task.workflowArtifactId)
    ) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "workflow_run_terminal_task_unfinished",
        severity: "warning",
        task,
        message: `Callable workflow task ${task.id} is ${task.status} but linked workflow run ${workflowRun.id} already finished as ${workflowRun.status}.`,
      }));
    } else if (
      CALLABLE_WORKFLOW_TASK_RESTART_ACTIVE_TASK_STATUSES.has(task.status) &&
      !workflowRun
    ) {
      issues.push(callableWorkflowTaskRestartIssue({
        kind: "active_task_interrupted",
        severity: "warning",
        task,
        message: `Callable workflow task ${task.id} was ${task.status} during restart and needs workflow task reconciliation.`,
      }));
    }
  }

  const repairedTaskIds = uniqueCallableWorkflowTaskRestartIds(issues
    .filter((issue) => issue.kind === "workflow_run_terminal_task_unfinished")
    .map((issue) => issue.taskId));
  const diagnosticTaskIds = uniqueCallableWorkflowTaskRestartIds(issues.map((issue) => issue.taskId));
  const staleWorkflowArtifactTaskIds = uniqueCallableWorkflowTaskRestartIds(issues
    .filter((issue) => issue.kind === "missing_workflow_artifact" || issue.kind === "missing_workflow_thread")
    .map((issue) => issue.taskId));
  const staleWorkflowRunTaskIds = uniqueCallableWorkflowTaskRestartIds(issues
    .filter((issue) => issue.kind === "missing_workflow_run" || issue.kind === "workflow_run_artifact_mismatch")
    .map((issue) => issue.taskId));

  return {
    schemaVersion: "ambient-callable-workflow-task-restart-v1",
    createdAt,
    issueCount: issues.length,
    repairedTaskIds,
    diagnosticTaskIds,
    staleWorkflowArtifactTaskIds,
    staleWorkflowRunTaskIds,
    issues,
  };
}

export function buildCallableWorkflowCompilerHandoffPlan(input: {
  task: CallableWorkflowTaskSummary;
  createdAt?: string;
}): CallableWorkflowCompilerHandoffPlan {
  const executionPlan = callableWorkflowExecutionPlanFromTask(input.task);
  const launchBridgeContract = callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan(
    input.task,
    executionPlan,
  );
  const userRequest = callableWorkflowCompilerUserRequest(input.task, executionPlan, launchBridgeContract);
  return {
    schemaVersion: CALLABLE_WORKFLOW_COMPILER_HANDOFF_SCHEMA_VERSION,
    taskId: input.task.id,
    launchId: input.task.launchId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    parent: {
      threadId: input.task.parentThreadId,
      runId: input.task.parentRunId,
      messageId: input.task.parentMessageId,
    },
    callerProvenance: cloneCallableWorkflowCallerProvenance(executionPlan.callerProvenance),
    compiler: {
      target: executionPlan.runnerHandoff.target,
      userRequest,
      workflowThreadTitle: input.task.title,
      workflowThreadInitialRequest: userRequest,
      sourceKind: input.task.sourceKind,
      toolName: input.task.toolName,
      toolId: input.task.toolId,
      input: { ...executionPlan.workflowRunPlan.input },
      blocking: executionPlan.workflowRunPlan.blocking,
      launchCard: executionPlan.workflowRunPlan.launchCard,
      requiredBeforeStart: [...executionPlan.runnerHandoff.requiredBeforeStart],
      ...(launchBridgeContract ? { launchBridgeContract } : {}),
    },
    runStart: {
      mode: "compile_then_start_workflow_run",
      desktopEventType: "workflow-run-started",
      requiresArtifactBeforeRun: true,
      allowUnapprovedOneOff: true,
    },
  };
}

export function callableWorkflowSymphonyLaunchBridgeContractFromExecutionPlan(
  task: CallableWorkflowTaskSummary,
  executionPlan: CallableWorkflowExecutionPlan,
): CallableWorkflowSymphonyLaunchBridgeContract | undefined {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  if (sourceContext.kind !== "symphony_recipe") return undefined;
  if (executionPlan.callerProvenance.kind === "subagent_child_thread") return undefined;
  const roleGraph = buildDefaultSymphonyPatternRoleGraph(sourceContext.recipeId);
  const requiredNodes = roleGraph.nodes.filter((node) => node.required);
  const blocking = executionPlan.workflowRunPlan.blocking;
  const childLaunches: CallableWorkflowSymphonyChildLaunchContract[] = requiredNodes.map((node) => {
    const role = getDefaultSubagentRoleProfile(node.baseRole);
    const effectiveRole = effectiveSubagentRoleSnapshot({
      baseRole: node.baseRole,
      patternRole: node.patternRole,
      overlayLabels: node.overlayLabels,
      outputContract: callableWorkflowSymphonyChildOutputContract(task, executionPlan, node.id),
    });
    return {
      roleNodeId: node.id,
      label: node.label,
      title: `${node.label} sub-agent`,
      task: callableWorkflowSymphonyChildTaskText(task, executionPlan, node.id),
      roleId: node.baseRole,
      dependencyMode: blocking ? "required" : "optional_background",
      forkMode: role.defaultForkMode,
      promptMode: role.promptMode,
      effectiveRole,
      patternRole: node.patternRole,
      patternGraphBinding: {
        workflowTaskId: task.id,
        roleNodeId: node.id,
        label: node.label,
        approvalState: "none",
        blockingParent: blocking,
      },
      toolScope: {
        mode: "role_defaults",
        rationale: "Use the selected role's least-privilege defaults; Ambient policy may narrow further at launch.",
      },
      idempotencyKey: `callable-workflow:${task.id}:symphony-child:${node.id}`,
    };
  });
  return {
    schemaVersion: CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_SCHEMA_VERSION,
    workflowTaskId: task.id,
    launchId: task.launchId,
    parentThreadId: task.parentThreadId,
    parentRunId: task.parentRunId,
    ...(task.parentMessageId ? { parentMessageId: task.parentMessageId } : {}),
    expectedWorkflowToolName: task.toolName,
    expectedWorkflowToolId: task.toolId,
    sourceKind: "symphony_recipe",
    pattern: {
      id: sourceContext.recipeId,
      label: roleGraph.label,
      blocking,
    },
    childLaunches,
    wait: {
      mode: "required_all",
      failurePolicy: "ask_user",
      timeoutMs: CALLABLE_WORKFLOW_SYMPHONY_LAUNCH_BRIDGE_WAIT_TIMEOUT_MS,
      blocking: true,
      childRoleNodeIds: childLaunches.map((child) => child.roleNodeId),
    },
    expectedEvidence: [
      "Every required child launch has a childRunId bound to this workflow task's pattern graph.",
      "The workflow launch bridge wait names all required child runs before compiler synthesis.",
      "Parent synthesis uses only synthesis-safe child results or an explicit partial-result decision.",
    ],
  };
}

const CALLABLE_WORKFLOW_TASK_RESTART_ACTIVE_TASK_STATUSES = new Set<CallableWorkflowTaskStatus>([
  "compiling",
  "running",
  "paused",
]);
const CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_TASK_STATUSES = new Set<CallableWorkflowTaskStatus>([
  "succeeded",
  "failed",
  "canceled",
]);
const CALLABLE_WORKFLOW_TASK_RESTART_TERMINAL_RUN_STATUSES = new Set<WorkflowRunStatus>([
  "succeeded",
  "failed",
  "canceled",
  "skipped",
]);

function callableWorkflowTaskRestartIssue(input: {
  kind: CallableWorkflowTaskRestartIssue["kind"];
  severity: CallableWorkflowTaskRestartIssue["severity"];
  task: CallableWorkflowTaskSummary;
  workflowArtifactId?: string;
  message: string;
}): CallableWorkflowTaskRestartIssue {
  const workflowArtifactId = input.workflowArtifactId ?? input.task.workflowArtifactId;
  const runtimeContext = callableWorkflowTaskRestartIssueRuntimeContext(input.task);
  const stable = [
    input.kind,
    input.task.id,
    input.task.parentRunId,
    workflowArtifactId ?? "",
    input.task.workflowRunId ?? "",
  ].join(":");
  return {
    id: stable,
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    taskId: input.task.id,
    taskStatus: input.task.status,
    taskStatusLabel: input.task.statusLabel,
    blocking: input.task.blocking,
    runnerDeferredReason: input.task.runnerDeferredReason,
    parentThreadId: input.task.parentThreadId,
    parentRunId: input.task.parentRunId,
    workflowArtifactId,
    workflowRunId: input.task.workflowRunId,
    ...runtimeContext,
  };
}

function callableWorkflowTaskRestartIssueRuntimeContext(
  task: CallableWorkflowTaskSummary,
): Partial<CallableWorkflowTaskRestartIssue> {
  const executionPlan = recordValue(task.executionPlan);
  const caller = recordValue(executionPlan.callerProvenance);
  const approval = recordValue(caller.approval);
  const worktree = recordValue(caller.worktree);
  const nestedFanout = recordValue(caller.nestedFanout);
  const callerKind = stringValue(caller.kind);
  const callerThreadId = stringValue(caller.threadId);
  const callerRunId = stringValue(caller.runId);
  const subagentRunId = stringValue(caller.subagentRunId);
  const canonicalTaskPath = stringValue(caller.canonicalTaskPath);
  const childParentThreadId = stringValue(caller.parentThreadId);
  const childParentRunId = stringValue(caller.parentRunId);
  const approvalSource = stringValue(approval.source);
  const approvalScope = stringValue(approval.scopeHint);
  const worktreeRequired = booleanValue(worktree.required);
  const worktreeIsolated = booleanValue(worktree.isolated);
  const worktreeStatus = stringValue(worktree.status);
  const nestedFanoutRequired = booleanValue(nestedFanout.required);
  const nestedFanoutSource = stringValue(nestedFanout.source);
  return {
    ...(callerKind ? { callerKind } : {}),
    ...(callerThreadId ? { callerThreadId } : {}),
    ...(callerRunId ? { callerRunId } : {}),
    ...(callerKind === "subagent_child_thread" && callerThreadId ? { childThreadId: callerThreadId } : {}),
    ...(callerKind === "subagent_child_thread" && callerRunId ? { childRunId: callerRunId } : {}),
    ...(subagentRunId ? { subagentRunId } : {}),
    ...(canonicalTaskPath ? { canonicalTaskPath } : {}),
    ...(childParentThreadId ? { childParentThreadId } : {}),
    ...(childParentRunId ? { childParentRunId } : {}),
    ...(approvalSource ? { approvalSource } : {}),
    ...(approvalScope ? { approvalScope } : {}),
    ...(worktreeRequired !== undefined ? { worktreeRequired } : {}),
    ...(worktreeIsolated !== undefined ? { worktreeIsolated } : {}),
    ...(worktreeStatus ? { worktreeStatus } : {}),
    ...(nestedFanoutRequired !== undefined ? { nestedFanoutRequired } : {}),
    ...(nestedFanoutSource ? { nestedFanoutSource } : {}),
  };
}

function uniqueCallableWorkflowTaskRestartIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function callableWorkflowExecutionPlanFromTask(task: CallableWorkflowTaskSummary): CallableWorkflowExecutionPlan {
  const plan = recordValue(task.executionPlan);
  if (plan.schemaVersion !== "ambient-callable-workflow-execution-plan-v1") {
    throw new Error(`Callable workflow task ${task.id} has an invalid execution plan.`);
  }
  const workflowRunPlan = recordValue(plan.workflowRunPlan);
  const source = recordValue(workflowRunPlan.source);
  const input = recordValue(workflowRunPlan.input);
  const runnerHandoff = recordValue(plan.runnerHandoff);
  const sourceContext = callableWorkflowSourceContextFromTask(task, source, workflowRunPlan.sourceContext);
  if (
    typeof plan.launchId !== "string" ||
    plan.launchId !== task.launchId ||
    typeof workflowRunPlan.toolName !== "string" ||
    workflowRunPlan.toolName !== task.toolName ||
    typeof workflowRunPlan.toolId !== "string" ||
    workflowRunPlan.toolId !== task.toolId ||
    typeof source.kind !== "string" ||
    source.kind !== task.sourceKind ||
    typeof runnerHandoff.target !== "string"
  ) {
    throw new Error(`Callable workflow task ${task.id} execution plan does not match the queued task.`);
  }
  if (typeof workflowRunPlan.blocking !== "boolean") {
    throw new Error(`Callable workflow task ${task.id} execution plan is missing blocking metadata.`);
  }
  return {
    ...(plan as unknown as CallableWorkflowExecutionPlan),
    callerProvenance: callerProvenanceFromTask(task, plan.callerProvenance, workflowRunPlan as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"]),
    workflowRunPlan: {
      ...(workflowRunPlan as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"]),
      source: source as unknown as CallableWorkflowExecutionPlan["workflowRunPlan"]["source"],
      sourceContext,
      input,
    },
  };
}

function callerProvenanceFromTask(
  task: CallableWorkflowTaskSummary,
  rawProvenance: unknown,
  runPlan: CallableWorkflowExecutionPlan["workflowRunPlan"],
): CallableWorkflowCallerProvenance {
  const provenance = recordValue(rawProvenance);
  if (
    (provenance.kind === "parent_thread" || provenance.kind === "subagent_child_thread") &&
    typeof provenance.threadId === "string" &&
    typeof provenance.runId === "string"
  ) {
    return cloneCallableWorkflowCallerProvenance(provenance as unknown as CallableWorkflowCallerProvenance);
  }
  return defaultCallableWorkflowCallerProvenance({
    threadId: task.parentThreadId,
    runId: task.parentRunId,
    assistantMessageId: task.parentMessageId,
  }, runPlan);
}

function callableWorkflowSourceContextFromTask(
  task: CallableWorkflowTaskSummary,
  source: Record<string, unknown>,
  rawContext: unknown,
): CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"] {
  const context = recordValue(rawContext);
  if (context.kind === "symphony_recipe" || context.kind === "recorded_workflow") {
    return context as CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"];
  }
  if (source.kind === "recorded_workflow") {
    return {
      kind: "recorded_workflow",
      title: task.title,
      summary: task.title,
      playbookId: typeof source.playbookId === "string" ? source.playbookId : task.toolId,
      playbookVersion: typeof source.playbookVersion === "number" ? source.playbookVersion : 1,
      playbookSource: "user_edit",
      intent: task.title,
      inputs: [],
      successfulExamples: [],
      doNot: [],
      validation: [],
      outputShape: [],
      markdownPreview: "",
      recorderCompactInvocationByDefault: true,
      fullTraceArtifact: true,
    };
  }
  return {
    kind: "symphony_recipe",
    title: task.title,
    summary: task.title,
    recipeId: symphonyRecipeIdOrFallback(source.recipeId),
    recipeSchemaVersion: typeof source.recipeSchemaVersion === "string" ? source.recipeSchemaVersion : "unknown",
    defaultRoles: [],
    builderSteps: [],
    metricTemplates: [],
    hardLimits: {
      maxFanout: 1,
      maxDepth: 1,
      maxTokenBudget: 60_000,
      maxLocalMemoryBytes: 0,
      allowSmallSliceRun: true,
    },
    recorderPolicy: {
      compactInvocationByDefault: true,
      fullTraceArtifact: true,
    },
  };
}

function symphonyRecipeIdOrFallback(value: unknown): SymphonyWorkflowPatternId {
  return typeof value === "string" && (SYMPHONY_WORKFLOW_PATTERN_IDS as readonly string[]).includes(value)
    ? value as SymphonyWorkflowPatternId
    : "map_reduce";
}

function callableWorkflowCompilerUserRequest(
  task: CallableWorkflowTaskSummary,
  executionPlan: CallableWorkflowExecutionPlan,
  launchBridgeContract?: CallableWorkflowSymphonyLaunchBridgeContract,
): string {
  return [
    `Callable workflow: ${task.title}`,
    `Tool: ${task.toolName}`,
    `Source: ${task.sourceKind}`,
    `Blocking: ${executionPlan.workflowRunPlan.blocking ? "parent waits for this workflow result" : "background workflow result may arrive later"}.`,
    "Launch card:",
    ...callableWorkflowLaunchCardLines(executionPlan.workflowRunPlan.launchCard),
    "Source recipe context:",
    ...callableWorkflowSourceContextLines(executionPlan.workflowRunPlan.sourceContext),
    ...callableWorkflowSymphonyLaunchBridgeLines(launchBridgeContract),
    "Compile this callable workflow invocation into a reviewable Ambient workflow artifact, then start a visible workflow run only after the artifact is persisted.",
    "Input:",
    JSON.stringify(executionPlan.workflowRunPlan.input, null, 2),
  ].join("\n");
}

function callableWorkflowSymphonyLaunchBridgeLines(
  contract: CallableWorkflowSymphonyLaunchBridgeContract | undefined,
): string[] {
  if (!contract) return [];
  return [
    "Symphony launch bridge contract:",
    `- Schema: ${contract.schemaVersion}`,
    `- Pattern: ${contract.pattern.label} (${contract.pattern.id})`,
    `- Required child roles: ${contract.childLaunches.map((child) => `${child.roleNodeId}:${child.roleId}`).join(", ") || "none"}`,
    `- Wait: ${contract.wait.mode}, failure ${contract.wait.failurePolicy}, timeout ${contract.wait.timeoutMs}ms`,
    "- Ambient runtime, not the workflow compiler, must create visible child threads from this contract exactly once before workflow synthesis.",
    "- The compiler must not emit or repair WorkflowProgramIR with ambient_subagent_spawn_agent, ambient_subagent_wait_agent, or other internal bridge tools; those operations are already owned by this launch bridge.",
    "- After required child launches, Ambient runtime waits on the childRunIds using the bridge wait policy; do not synthesize from failed, timed-out, or detached children without an explicit partial-result decision.",
    "Symphony launch bridge JSON:",
    JSON.stringify(contract, null, 2),
  ];
}

function callableWorkflowSymphonyChildOutputContract(
  task: CallableWorkflowTaskSummary,
  executionPlan: CallableWorkflowExecutionPlan,
  roleNodeId: string,
): string {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  const metricCriteria = sourceContext.kind === "symphony_recipe"
    ? sourceContext.invocationCustomization?.metricCriteria ?? []
    : [];
  const metricText = metricCriteria.length
    ? metricCriteria.map((criterion) => `${criterion.templateId}: ${criterion.value}`).join(" | ")
    : "Use the launch card, user input, and role overlays as the acceptance criteria.";
  return [
    `Return a compact, structured result for role node ${roleNodeId} on callable workflow task ${task.id}.`,
    `Include: summary, evidence used, uncertainties, blockers, and synthesis-ready recommendation or handoff.`,
    `Metric/rubric: ${metricText}`,
  ].join(" ");
}

function callableWorkflowSymphonyChildTaskText(
  task: CallableWorkflowTaskSummary,
  executionPlan: CallableWorkflowExecutionPlan,
  roleNodeId: string,
): string {
  const sourceContext = executionPlan.workflowRunPlan.sourceContext;
  const roleGraph = sourceContext.kind === "symphony_recipe"
    ? buildDefaultSymphonyPatternRoleGraph(sourceContext.recipeId)
    : undefined;
  const roleNode = roleGraph?.nodes.find((node) => node.id === roleNodeId);
  const upstreamEdges = roleGraph?.edges.filter((edge) => edge.to === roleNodeId) ?? [];
  const downstreamEdges = roleGraph?.edges.filter((edge) => edge.from === roleNodeId) ?? [];
  return [
    `You are the ${roleNode?.label ?? roleNodeId} child in the ${roleGraph?.label ?? "Symphony"} pattern for parent callable workflow task ${task.id}.`,
    `Parent objective: ${task.title}.`,
    `Current invocation input: ${JSON.stringify(executionPlan.workflowRunPlan.input)}.`,
    roleNode?.overlayLabels.length ? `Role overlays: ${roleNode.overlayLabels.join("; ")}.` : undefined,
    upstreamEdges.length ? `Upstream contracts: ${upstreamEdges.map((edge) => `${edge.from} -> ${edge.to} (${edge.label})`).join("; ")}.` : "Upstream contracts: none at launch.",
    downstreamEdges.length ? `Downstream handoff: ${downstreamEdges.map((edge) => `${edge.from} -> ${edge.to} (${edge.label})`).join("; ")}.` : "Downstream handoff: parent synthesis.",
    "Stay within the role defaults and do not spawn nested sub-agents. Return a synthesis-safe, compact result with evidence and blockers.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function callableWorkflowSourceContextLines(
  context: CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"],
): string[] {
  if (context.kind === "symphony_recipe") {
    return [
      `- Source kind: Symphony recipe preset (${context.recipeId}, ${context.recipeSchemaVersion})`,
      `- Summary: ${context.summary}`,
      ...callableWorkflowSourcePreviewLines(context.sourcePreview),
      `- Default roles: ${context.defaultRoles.join(", ") || "none"}`,
      `- Hard limits: max fanout ${context.hardLimits.maxFanout}, max depth ${context.hardLimits.maxDepth}, max token budget ${context.hardLimits.maxTokenBudget}, max local memory ${formatBytes(context.hardLimits.maxLocalMemoryBytes)}`,
      `- Recorder policy: compact invocation ${context.recorderPolicy.compactInvocationByDefault ? "yes" : "no"}, full trace artifact ${context.recorderPolicy.fullTraceArtifact ? "yes" : "no"}`,
      ...context.builderSteps.map((step) =>
        `- Builder step ${step.id}: ${step.question} Impact: ${step.impact} Choices: ${step.choices.join(" | ")}`
      ),
      ...context.metricTemplates.map((metric) =>
        `- Metric ${metric.id}: ${metric.kind} ${metric.label}. ${metric.prompt}`
      ),
      ...callableWorkflowSymphonyInvocationLines(context.invocationCustomization),
    ];
  }
  return [
    `- Source kind: recorded workflow playbook (${context.playbookId} v${context.playbookVersion}, source ${context.playbookSource})`,
    `- Summary: ${context.summary}`,
    ...callableWorkflowSourcePreviewLines(context.sourcePreview),
    `- Intent: ${context.intent}`,
    `- Recorder policy: compact invocation ${context.recorderCompactInvocationByDefault ? "yes" : "no"}, full trace artifact ${context.fullTraceArtifact ? "yes" : "no"}`,
    ...callableWorkflowRecordedInvocationLines(context.callableInvocation),
    ...context.inputs.map((item, index) => `- Input ${index + 1}: ${item}`),
    ...context.successfulExamples.map((example) => {
      const detail = [example.inputPreview, example.resultPreview, example.artifactPath ? `artifact ${example.artifactPath}` : undefined]
        .filter(Boolean)
        .join(" | ");
      return `- Successful example ${example.toolName}: ${detail || "No preview."}`;
    }),
    ...context.doNot.map((pattern) =>
      `- Avoid ${pattern.toolName ? `${pattern.toolName} ` : ""}${pattern.status}: ${pattern.reason}`
    ),
    ...context.validation.map((item, index) => `- Validation ${index + 1}: ${item}`),
    ...context.outputShape.map((item, index) => `- Output ${index + 1}: ${item}`),
    context.markdownPreview ? `- Markdown preview: ${context.markdownPreview}` : "- Markdown preview: none",
    "- Compile the current invocation from this confirmed playbook. Do not replay stale recorded traces as if they were fresh results.",
  ];
}

function callableWorkflowSourcePreviewLines(
  preview: CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"]["sourcePreview"],
): string[] {
  if (!preview) return ["- Source preview: unavailable"];
  return [
    `- Source preview: ${preview.label} (${preview.format}, ${preview.dslStatus}, executable no)`,
    ...preview.text.split(/\r?\n/g).filter(Boolean).slice(0, 16).map((line) => `  ${line}`),
  ];
}

function callableWorkflowSymphonyInvocationLines(
  invocation: Extract<
    CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"],
    { kind: "symphony_recipe" }
  >["invocationCustomization"],
): string[] {
  if (!invocation) return ["- Symphony invocation customization: none"];
  return [
    `- Symphony invocation customization: ${invocation.schemaVersion}`,
    ...invocation.stepSelections.map((selection) =>
      `- Selected builder step ${selection.stepId}: ${selection.resolvedText}`
    ),
    ...invocation.metricCriteria.map((criterion) =>
      `- Required ${criterion.kind} ${criterion.templateId}: ${criterion.value}`
    ),
  ];
}

function callableWorkflowRecordedInvocationLines(
  invocation: Extract<
    CallableWorkflowExecutionPlan["workflowRunPlan"]["sourceContext"],
    { kind: "recorded_workflow" }
  >["callableInvocation"],
): string[] {
  if (!invocation) {
    return ["- Compact invocation artifact: unavailable; compile from the confirmed playbook and current live input."];
  }
  return [
    `- Compact invocation artifact: ${invocation.invocationArtifact} (${invocation.schemaVersion}, ${invocation.mode}; default ${invocation.defaultInvocation})`,
    `- Diagnostics trace artifact: ${invocation.diagnosticsTraceArtifact} (diagnostics only; do not replay by default)`,
    `- Invocation input keys: ${invocation.inputKeys.join(", ") || "none"}`,
    `- Invocation schema hint keys: ${invocation.inputSchemaHintKeys.join(", ") || "none"}`,
  ];
}

function callableWorkflowLaunchCardLines(
  launchCard: NonNullable<CallableWorkflowTaskSummary["launchCard"]>,
): string[] {
  return [
    `- Risk: ${launchCard.riskLevel}`,
    `- Agents: up to ${launchCard.estimatedAgents} estimated, max fanout ${launchCard.maxFanout}, max depth ${launchCard.maxDepth}`,
    `- Token budget: up to ${launchCard.estimatedTokenBudget.toLocaleString("en-US")} tokens`,
    `- Local memory: up to ${formatBytes(launchCard.estimatedLocalMemoryBytes)} estimated`,
    `- Cost: ${launchCard.costEstimateLabel}`,
    `- Tool/mutation scope: ${launchCard.toolMutationScope}`,
    `- Checkpoint/resume: ${launchCard.checkpointResume}`,
    `- Approval failures: ${launchCard.approvalFailureHandling}`,
    `- Requires confirmation: ${launchCard.requireConfirmation ? "yes" : "no"}`,
    launchCard.metricTemplateIds.length
      ? `- Metric/rubric templates: ${launchCard.metricTemplateIds.join(", ")}`
      : "- Metric/rubric templates: none",
    launchCard.policyWarnings.length
      ? `- Policy warnings: ${launchCard.policyWarnings.join(" | ")}`
      : "- Policy warnings: none",
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const gib = value / (1024 * 1024 * 1024);
  if (gib >= 1) return `${formatDecimal(gib)} GiB`;
  const mib = value / (1024 * 1024);
  if (mib >= 1) return `${formatDecimal(mib)} MiB`;
  return `${Math.floor(value).toLocaleString("en-US")} bytes`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
