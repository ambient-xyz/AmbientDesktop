import { createHash } from "node:crypto";
import type {
  CallableWorkflowRunPlan,
  CallableWorkflowSourceContext,
  CallableWorkflowToolDescriptor,
} from "./callableWorkflowRegistry";

export const CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION =
  "ambient-callable-workflow-execution-plan-v1" as const;

export interface CallableWorkflowExecutionPlanParent {
  threadId: string;
  runId: string;
  assistantMessageId?: string;
}

export interface CallableWorkflowCallerProvenance {
  kind: "parent_thread" | "subagent_child_thread";
  threadId: string;
  runId: string;
  messageId?: string;
  subagentRunId?: string;
  canonicalTaskPath?: string;
  parentThreadId?: string;
  parentRunId?: string;
  approval: {
    required: boolean;
    source: "launch_card" | "child_bridge_policy" | "ambient_policy";
    failureHandling: string;
    scopeHint?: "parent_thread" | "this_child_thread" | "parent_thread_tree";
  };
  worktree: {
    required: boolean;
    isolated: boolean;
    status?: "active" | "shared" | "failed" | "missing" | "unavailable";
    workspacePath?: string;
    worktreePath?: string;
    branchName?: string;
  };
  nestedFanout: {
    required: boolean;
    source: "parent_policy" | "child_bridge_policy";
  };
}

export interface CallableWorkflowExecutionPlan {
  schemaVersion: typeof CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION;
  launchId: string;
  status: "queued_not_started";
  createdAt: string;
  parent: CallableWorkflowExecutionPlanParent;
  callerProvenance: CallableWorkflowCallerProvenance;
  toolCallId: string;
  workflowRunPlan: CallableWorkflowRunPlan;
  visibleTask: {
    kind: "callable_workflow_background_task";
    title: string;
    statusLabel: "Queued";
    defaultCollapsed: boolean;
    blocking: boolean;
    progressVisible: true;
    tokenCostTracking: true;
    pauseResumeCancel: true;
    cancelHandle: string;
    launchCard: CallableWorkflowRunPlan["launchCard"];
  };
  runnerHandoff: {
    target: "workflowCompilerService";
    deferredReason: "callable_workflow_runner_not_connected";
    requiredBeforeStart: [
      "compile_callable_workflow_to_artifact",
      "persist_workflow_run",
      "emit_workflow_run_started",
    ];
  };
}

export function buildCallableWorkflowExecutionPlan(input: {
  descriptor: CallableWorkflowToolDescriptor;
  runPlan: CallableWorkflowRunPlan;
  parent: CallableWorkflowExecutionPlanParent;
  toolCallId: string;
  callerProvenance?: CallableWorkflowCallerProvenance;
  createdAt?: string;
}): CallableWorkflowExecutionPlan {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const launchId = callableWorkflowLaunchId({
    parentRunId: input.parent.runId,
    toolCallId: input.toolCallId,
    toolId: input.runPlan.toolId,
    input: input.runPlan.input,
  });
  return {
    schemaVersion: CALLABLE_WORKFLOW_EXECUTION_PLAN_SCHEMA_VERSION,
    launchId,
    status: "queued_not_started",
    createdAt,
    parent: { ...input.parent },
    callerProvenance: cloneCallableWorkflowCallerProvenance(
      input.callerProvenance ?? defaultCallableWorkflowCallerProvenance(input.parent, input.runPlan),
    ),
    toolCallId: input.toolCallId,
    workflowRunPlan: {
      ...input.runPlan,
      source: { ...input.runPlan.source },
      sourceContext: cloneSourceContext(input.runPlan.sourceContext),
      input: { ...input.runPlan.input },
      execution: { ...input.runPlan.execution },
      policySnapshot: {
        ...input.runPlan.policySnapshot,
        launchCardRequirementIds: [...input.runPlan.policySnapshot.launchCardRequirementIds],
        metricTemplateIds: [...input.runPlan.policySnapshot.metricTemplateIds],
      },
      launchCard: cloneCallableWorkflowLaunchCard(input.runPlan.launchCard),
    },
    visibleTask: {
      kind: "callable_workflow_background_task",
      title: input.descriptor.label,
      statusLabel: "Queued",
      defaultCollapsed: input.runPlan.policySnapshot.defaultCollapsedChildThreads,
      blocking: input.runPlan.blocking,
      progressVisible: input.runPlan.execution.progressVisible,
      tokenCostTracking: input.runPlan.execution.tokenCostTracking,
      pauseResumeCancel: input.runPlan.execution.pauseResumeCancel,
      cancelHandle: `callable-workflow-cancel:${launchId}`,
      launchCard: cloneCallableWorkflowLaunchCard(input.runPlan.launchCard),
    },
    runnerHandoff: {
      target: "workflowCompilerService",
      deferredReason: "callable_workflow_runner_not_connected",
      requiredBeforeStart: [
        "compile_callable_workflow_to_artifact",
        "persist_workflow_run",
        "emit_workflow_run_started",
      ],
    },
  };
}

export function defaultCallableWorkflowCallerProvenance(
  parent: CallableWorkflowExecutionPlanParent,
  runPlan: CallableWorkflowRunPlan,
): CallableWorkflowCallerProvenance {
  return {
    kind: "parent_thread",
    threadId: parent.threadId,
    runId: parent.runId,
    ...(parent.assistantMessageId ? { messageId: parent.assistantMessageId } : {}),
    approval: {
      required: runPlan.launchCard.requireConfirmation,
      source: "launch_card",
      failureHandling: runPlan.launchCard.approvalFailureHandling,
      scopeHint: "parent_thread",
    },
    worktree: {
      required: false,
      isolated: false,
      status: "unavailable",
    },
    nestedFanout: {
      required: false,
      source: "parent_policy",
    },
  };
}

export function cloneCallableWorkflowCallerProvenance(
  provenance: CallableWorkflowCallerProvenance,
): CallableWorkflowCallerProvenance {
  return {
    kind: provenance.kind,
    threadId: provenance.threadId,
    runId: provenance.runId,
    ...(provenance.messageId ? { messageId: provenance.messageId } : {}),
    ...(provenance.subagentRunId ? { subagentRunId: provenance.subagentRunId } : {}),
    ...(provenance.canonicalTaskPath ? { canonicalTaskPath: provenance.canonicalTaskPath } : {}),
    ...(provenance.parentThreadId ? { parentThreadId: provenance.parentThreadId } : {}),
    ...(provenance.parentRunId ? { parentRunId: provenance.parentRunId } : {}),
    approval: { ...provenance.approval },
    worktree: { ...provenance.worktree },
    nestedFanout: { ...provenance.nestedFanout },
  };
}

function cloneCallableWorkflowLaunchCard(
  launchCard: CallableWorkflowRunPlan["launchCard"],
): CallableWorkflowRunPlan["launchCard"] {
  return {
    ...launchCard,
    requirementIds: [...launchCard.requirementIds],
    metricTemplateIds: [...launchCard.metricTemplateIds],
    policyWarnings: [...launchCard.policyWarnings],
  };
}

function cloneSourceContext(context: CallableWorkflowSourceContext): CallableWorkflowSourceContext {
  return JSON.parse(JSON.stringify(context)) as CallableWorkflowSourceContext;
}

function callableWorkflowLaunchId(input: {
  parentRunId: string;
  toolCallId: string;
  toolId: string;
  input: Record<string, unknown>;
}): string {
  const digest = createHash("sha256")
    .update(input.parentRunId)
    .update("\0")
    .update(input.toolCallId)
    .update("\0")
    .update(input.toolId)
    .update("\0")
    .update(stableStringify(input.input))
    .digest("hex")
    .slice(0, 20);
  return `callable-workflow:${digest}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
