import type {
  CallableWorkflowLaunchCardSummary,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
} from "../../shared/workflowTypes";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";

export interface CallableWorkflowTaskRow {
  id: string;
  launch_id: string;
  parent_thread_id: string;
  parent_run_id: string;
  parent_message_id: string | null;
  tool_call_id: string;
  tool_id: string;
  tool_name: string;
  source_kind: string;
  title: string;
  status: CallableWorkflowTaskStatus;
  status_label: string;
  blocking: number;
  default_collapsed: number;
  progress_visible: number;
  token_cost_tracking: number;
  pause_resume_cancel: number;
  cancel_handle: string;
  runner_target: string;
  runner_deferred_reason: string;
  workflow_artifact_id: string | null;
  workflow_run_id: string | null;
  error_message: string | null;
  pattern_graph_snapshot_json: string | null;
  execution_plan_json: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface CallableWorkflowTaskRowContext {
  workflowThreadId?: string;
}

export function mapCallableWorkflowTaskRow(
  row: CallableWorkflowTaskRow,
  context: CallableWorkflowTaskRowContext = {},
): CallableWorkflowTaskSummary {
  const executionPlan = parseJsonValue(row.execution_plan_json);
  const launchCard = callableWorkflowLaunchCardFromExecutionPlan(executionPlan);
  const patternGraphSnapshot = parseJsonValue(row.pattern_graph_snapshot_json ?? "") as
    | SubagentPatternGraphSnapshot
    | undefined;
  return {
    id: row.id,
    launchId: row.launch_id,
    parentThreadId: row.parent_thread_id,
    parentRunId: row.parent_run_id,
    parentMessageId: row.parent_message_id ?? undefined,
    toolCallId: row.tool_call_id,
    toolId: row.tool_id,
    toolName: row.tool_name,
    sourceKind: row.source_kind,
    title: row.title,
    status: row.status,
    statusLabel: row.status_label,
    blocking: Boolean(row.blocking),
    defaultCollapsed: Boolean(row.default_collapsed),
    progressVisible: Boolean(row.progress_visible),
    tokenCostTracking: Boolean(row.token_cost_tracking),
    pauseResumeCancel: Boolean(row.pause_resume_cancel),
    cancelHandle: row.cancel_handle,
    runnerTarget: row.runner_target,
    runnerDeferredReason: row.runner_deferred_reason,
    workflowThreadId: context.workflowThreadId,
    workflowArtifactId: row.workflow_artifact_id ?? undefined,
    workflowRunId: row.workflow_run_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    ...(patternGraphSnapshot ? { patternGraphSnapshot } : {}),
    ...(launchCard ? { launchCard } : {}),
    executionPlan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

function callableWorkflowLaunchCardFromExecutionPlan(
  executionPlan: unknown,
): CallableWorkflowLaunchCardSummary | undefined {
  const plan = recordFromUnknown(executionPlan);
  const workflowRunPlan = recordFromUnknown(plan?.workflowRunPlan);
  const visibleTask = recordFromUnknown(plan?.visibleTask);
  const launchCard = recordFromUnknown(workflowRunPlan?.launchCard) ?? recordFromUnknown(visibleTask?.launchCard);
  if (!launchCard || launchCard.schemaVersion !== "ambient-callable-workflow-launch-card-v1") return undefined;
  const riskLevel = stringFromRecord(launchCard, "riskLevel");
  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") return undefined;
  const title = stringFromRecord(launchCard, "title");
  const sourceKind = stringFromRecord(launchCard, "sourceKind");
  const costEstimateLabel = stringFromRecord(launchCard, "costEstimateLabel");
  const toolMutationScope = stringFromRecord(launchCard, "toolMutationScope");
  const checkpointResume = stringFromRecord(launchCard, "checkpointResume");
  const approvalFailureHandling = stringFromRecord(launchCard, "approvalFailureHandling");
  const estimatedAgents = positiveNumberFromRecord(launchCard, "estimatedAgents");
  const maxFanout = positiveNumberFromRecord(launchCard, "maxFanout");
  const maxDepth = positiveNumberFromRecord(launchCard, "maxDepth");
  const estimatedTokenBudget = positiveNumberFromRecord(launchCard, "estimatedTokenBudget");
  const estimatedLocalMemoryBytes = nonNegativeNumberFromRecord(launchCard, "estimatedLocalMemoryBytes");
  if (
    !title ||
    !sourceKind ||
    !costEstimateLabel ||
    !toolMutationScope ||
    !checkpointResume ||
    !approvalFailureHandling ||
    estimatedAgents === undefined ||
    maxFanout === undefined ||
    maxDepth === undefined ||
    estimatedTokenBudget === undefined ||
    estimatedLocalMemoryBytes === undefined
  ) {
    return undefined;
  }
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title,
    sourceKind,
    riskLevel,
    estimatedAgents,
    maxFanout,
    maxDepth,
    estimatedTokenBudget,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes,
    localMemoryEstimated: true,
    costEstimateLabel,
    toolMutationScope,
    checkpointResume,
    approvalFailureHandling,
    defaultCollapsed: booleanFromRecord(launchCard, "defaultCollapsed"),
    blocking: booleanFromRecord(launchCard, "blocking"),
    smallSliceRecommended: booleanFromRecord(launchCard, "smallSliceRecommended"),
    requireConfirmation: booleanFromRecord(launchCard, "requireConfirmation"),
    requirementIds: stringArrayFromRecord(launchCard, "requirementIds"),
    metricTemplateIds: stringArrayFromRecord(launchCard, "metricTemplateIds"),
    policyWarnings: stringArrayFromRecord(launchCard, "policyWarnings"),
  };
}

function parseJsonValue(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function booleanFromRecord(record: Record<string, unknown> | undefined, key: string): boolean {
  return record?.[key] === true;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function positiveNumberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function nonNegativeNumberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}
