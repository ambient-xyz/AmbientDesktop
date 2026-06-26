import type { SubagentParentMailboxEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterChildBlockerDraft,
  SubagentParentClusterMailboxActivityModel,
} from "./subagentParentClusterMailboxTypes";
import type { SubagentParentClusterTone } from "./subagentParentClusterWorkflowTaskUiModel";
import {
  arrayValue,
  childSourceLabel,
  numberValue,
  recordValue,
  statusLabelFromString,
  stringArrayValue,
  stringValue,
  titleCase,
  truncate,
  uniqueStrings,
} from "./subagentParentClusterSharedUiModel";
import {
  cancelledMailboxEventCountSummary,
  cancelledWaitBarrierCountSummary,
  lifecycleEffectRows,
  lifecycleEffectSummary,
  waitBarrierAttentionActivity,
  waitBarrierDecisionActivity,
} from "./subagentParentClusterMailboxWaitBarrierUiModel";

export type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterChildBlockerDraft,
  SubagentParentClusterLifecycleEffectModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterMailboxActivityModel,
} from "./subagentParentClusterMailboxTypes";

export const PARENT_CLUSTER_MAILBOX_ACTIVITY_PREVIEW_LIMIT = 6;

export function parentMailboxEventsForParentMessage(
  parentMessageId: string,
  runs: SubagentRunSummary[],
  workflowTasks: CallableWorkflowTaskSummary[],
  events: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary[] {
  const parentRunIds = new Set([...runs.map((run) => run.parentRunId), ...workflowTasks.map((task) => task.parentRunId)]);
  return events
    .filter((event) => event.parentMessageId === parentMessageId || parentRunIds.has(event.parentRunId))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function latestQueuedApprovalRequestForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.child_approval_requested" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    return payload?.schemaVersion === "ambient-subagent-approval-bridge-v1" && stringValue(payload.childRunId) === run.id;
  });
}

export function latestQueuedSupervisorRequestForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.child_supervisor_request" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    return (
      payload?.schemaVersion === "ambient-subagent-supervisor-request-v1" &&
      payload.parentRequiresAttention === true &&
      stringValue(payload.childRunId) === run.id
    );
  });
}

export function approvalParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload);
  const title = stringValue(payload?.title) ?? "Child approval needed";
  const toolCategory = stringValue(payload?.requestedToolCategory);
  const requestedAction = stringValue(payload?.requestedAction);
  const effectiveScope = stringValue(payload?.effectiveScope);
  const prompt = stringValue(payload?.prompt);
  return {
    kind: "approval",
    label: "Blocking: approval",
    statusTone: "warning",
    detail: truncate(
      [title, toolCategory ?? requestedAction, effectiveScope ? approvalScopeLabel(effectiveScope) : undefined, prompt]
        .filter(Boolean)
        .join(" / "),
      240,
    ),
  };
}

export function supervisorRequestParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload);
  const kind = stringValue(payload?.kind);
  const title = stringValue(payload?.title) ?? "Child supervisor request";
  const message = stringValue(payload?.messagePreview);
  return {
    kind: "attention",
    label: kind === "blocked" ? "Blocking: child blocked" : "Blocking: needs decision",
    statusTone: "warning",
    detail: truncate([supervisorRequestKindLabel(kind), title, message].filter(Boolean).join(" / "), 240),
  };
}

export function mailboxActivityModel(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel {
  const batch = batchProgressActivity(event);
  if (batch) return batch;
  const grouped = groupedCompletionActivity(event);
  if (grouped) return grouped;
  const spawnFailure = spawnFailureActivity(event);
  if (spawnFailure) return spawnFailure;
  const approvalRequest = childApprovalRequestActivity(event);
  if (approvalRequest) return approvalRequest;
  const approvalForwarded = childApprovalForwardedActivity(event);
  if (approvalForwarded) return approvalForwarded;
  const supervisorRequest = supervisorRequestActivity(event);
  if (supervisorRequest) return supervisorRequest;
  const waitBarrierAttention = waitBarrierAttentionActivity(event);
  if (waitBarrierAttention) return waitBarrierAttention;
  const waitBarrierDecision = waitBarrierDecisionActivity(event);
  if (waitBarrierDecision) return waitBarrierDecision;
  const callableWorkflowBlock = callableWorkflowParentBlockingActivity(event);
  if (callableWorkflowBlock) return callableWorkflowBlock;
  const lifecycleInterruption = lifecycleInterruptionActivity(event);
  if (lifecycleInterruption) return lifecycleInterruption;
  const cancellationCascade = cancellationCascadeActivity(event);
  if (cancellationCascade) return cancellationCascade;
  return {
    id: event.id,
    label: mailboxTypeLabel(event.type),
    ...(childSourceLabel(recordValue(event.payload)) ? { sourceLabel: childSourceLabel(recordValue(event.payload)) } : {}),
    statusTone: event.deliveryState === "failed" ? "danger" : "neutral",
    summary: event.deliveryState.split("_").map(titleCase).join(" "),
    updatedAt: event.updatedAt,
  };
}

function callableWorkflowParentBlockingActivity(
  event: SubagentParentMailboxEventSummary,
): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "callable_workflow.parent_finalization_blocked") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-callable-workflow-parent-blocking-v1") return undefined;
  const taskIds = stringArrayValue(payload.taskIds);
  const waitingTaskIds = stringArrayValue(payload.waitingTaskIds);
  const attentionTaskIds = stringArrayValue(payload.attentionTaskIds);
  const tasks = arrayValue(payload.tasks)
    .map(recordValue)
    .filter((task): task is Record<string, unknown> => Boolean(task));
  const taskCount = taskIds.length || tasks.length;
  const message = stringValue(payload.message);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  return {
    id: event.id,
    label: "Workflow blocked",
    ...(workflowSourceLabel(payload) ? { sourceLabel: workflowSourceLabel(payload) } : {}),
    statusTone: callableWorkflowParentBlockingTone(tasks, attentionTaskIds),
    summary: truncate(
      [
        `${taskCount} blocking ${taskCount === 1 ? "workflow" : "workflows"}`,
        waitingTaskIds.length ? `${waitingTaskIds.length} waiting` : undefined,
        attentionTaskIds.length ? `${attentionTaskIds.length} attention` : undefined,
        workflowTaskPreview(tasks),
      ]
        .filter(Boolean)
        .join(" / "),
      180,
    ),
    detail: truncate([message, choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined].filter(Boolean).join(" | "), 260),
    updatedAt: event.updatedAt,
  };
}

function callableWorkflowParentBlockingTone(tasks: Record<string, unknown>[], attentionTaskIds: string[]): SubagentParentClusterTone {
  const statuses = tasks.map((task) => stringValue(task.status)).filter((status): status is string => Boolean(status));
  if (statuses.some((status) => status === "failed" || status === "canceled")) return "danger";
  if (attentionTaskIds.length > 0 || statuses.some((status) => status === "paused")) return "warning";
  return "active";
}

function workflowTaskPreview(tasks: Record<string, unknown>[]): string | undefined {
  const previews = tasks
    .slice(0, 2)
    .map((task) => {
      const title = stringValue(task.title) ?? stringValue(task.toolName) ?? stringValue(task.id);
      if (!title) return undefined;
      const statusValue = stringValue(task.status);
      const status = stringValue(task.statusLabel) ?? (statusValue ? statusLabelFromString(statusValue) : undefined);
      return status ? `${title} (${status})` : title;
    })
    .filter((preview): preview is string => Boolean(preview));
  if (!previews.length) return undefined;
  return `${previews.join(", ")}${tasks.length > previews.length ? ` +${tasks.length - previews.length}` : ""}`;
}

function workflowSourceLabel(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const taskIds = stringArrayValue(payload.taskIds);
  const workflowRunIds = stringArrayValue(payload.workflowRunIds);
  const workflowArtifactIds = stringArrayValue(payload.workflowArtifactIds);
  const pieces = [
    compactIdListLabel("task", taskIds),
    compactIdListLabel("run", workflowRunIds),
    compactIdListLabel("artifact", workflowArtifactIds),
  ].filter(Boolean);
  return pieces.length ? `Workflow source: ${pieces.join(" / ")}` : undefined;
}

function compactIdListLabel(label: string, ids: string[]): string | undefined {
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return `${label} ${ids[0]}`;
  return `${label}s ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` +${ids.length - 3}` : ""}`;
}

function lifecycleInterruptionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.lifecycle_interrupted") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-lifecycle-interruption-v1") return undefined;
  const status = stringValue(payload.status);
  const roleId = stringValue(payload.roleId);
  const path = stringValue(payload.canonicalTaskPath);
  const reason = stringValue(payload.reason);
  const source = lifecycleSourceLabel(stringValue(payload.source));
  const controlSummary = lifecycleEffectSummary(payload);
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Child interrupted",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: lifecycleStatusTone(status),
    summary: truncate(
      [status ? statusLabelFromString(status) : "Interrupted", roleId ? titleCase(roleId) : undefined, path].filter(Boolean).join(" / "),
      160,
    ),
    detail: truncate([source, reason, controlSummary].filter(Boolean).join(" · "), 240),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function cancellationCascadeActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.cancellation_cascade") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-cancellation-cascade-v1") return undefined;
  const cancelledRunIds = stringArrayValue(payload.cancelledRunIds);
  const detachedRunIds = stringArrayValue(payload.detachedRunIds);
  const stoppedChildRunIds = stringArrayValue(payload.stoppedChildRunIds);
  const unchangedRunIds = stringArrayValue(payload.unchangedRunIds);
  const cancelledWaitBarrierIds = stringArrayValue(payload.cancelledWaitBarrierIds);
  const cancelledMailboxEventIds = stringArrayValue(payload.cancelledMailboxEventIds);
  const reason = stringValue(payload.reason);
  const detail = [reason, cancelledMailboxEventCountSummary(cancelledMailboxEventIds.length)].filter(Boolean).join(" · ");
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Parent stopped",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: cancelledRunIds.length || cancelledWaitBarrierIds.length ? "danger" : "warning",
    summary: [
      `${cancelledRunIds.length} cancelled`,
      `${detachedRunIds.length} detached`,
      stoppedChildRunIds.length ? `${stoppedChildRunIds.length} stopped` : undefined,
      unchangedRunIds.length ? `${unchangedRunIds.length} unchanged` : undefined,
      cancelledWaitBarrierCountSummary(cancelledWaitBarrierIds.length),
    ]
      .filter(Boolean)
      .join(" · "),
    ...(detail ? { detail: truncate(detail, 240) } : {}),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function childApprovalRequestActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_approval_requested") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-approval-bridge-v1") return undefined;
  const title = stringValue(payload.title);
  const prompt = stringValue(payload.prompt);
  const toolCategory = stringValue(payload.requestedToolCategory);
  const requestedAction = stringValue(payload.requestedAction);
  const effectiveScope = stringValue(payload.effectiveScope);
  const approvalActions = childApprovalRequestActions(event, payload);
  return {
    id: event.id,
    label: "Approval requested",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: event.deliveryState === "queued" ? "active" : "neutral",
    summary: truncate(
      [title ?? "Child approval needed", toolCategory ?? requestedAction, effectiveScope ? approvalScopeLabel(effectiveScope) : undefined]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    ...(prompt ? { detail: truncate(prompt, 240) } : {}),
    ...(approvalActions.length ? { approvalActions } : {}),
    updatedAt: event.updatedAt,
  };
}

function childApprovalRequestActions(
  event: SubagentParentMailboxEventSummary,
  payload: Record<string, unknown>,
): SubagentParentClusterApprovalActionModel[] {
  if (event.deliveryState !== "queued") return [];
  const childRunId = stringValue(payload.childRunId);
  const approvalId = stringValue(payload.approvalId);
  if (!childRunId || !approvalId) return [];
  const title = stringValue(payload.title);
  const prompt = stringValue(payload.prompt);
  const requestedScope = stringValue(payload.requestedScope);
  const effectiveScope = stringValue(payload.effectiveScope);
  const toolLabel =
    stringValue(payload.requestedToolCategory) ?? stringValue(payload.requestedAction) ?? stringValue(payload.requestedToolId);
  const childThreadId = stringValue(payload.childThreadId);
  const sourceLabel = childSourceLabel(payload);
  const base = {
    childRunId,
    approvalId,
    approvalRequestParentMailboxEventId: event.id,
    ...(childThreadId ? { childThreadId } : {}),
    ...(requestedScope ? { requestedScope } : {}),
    ...(effectiveScope ? { effectiveScope } : {}),
    ...(prompt ? { prompt } : {}),
    ...(toolLabel ? { toolLabel } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
  };
  return [
    {
      ...base,
      label: "Approve child",
      title: approvalActionTitle("Approve", title, approvalId, sourceLabel),
      decision: "approved",
    },
    {
      ...base,
      label: "Deny child",
      title: approvalActionTitle("Deny", title, approvalId, sourceLabel),
      decision: "denied",
    },
  ];
}

function approvalActionTitle(verb: string, title: string | undefined, approvalId: string, sourceLabel: string | undefined): string {
  return [`${verb} child approval ${approvalId}${title ? `: ${title}` : ""}`, sourceLabel].filter(Boolean).join(" / ");
}

function childApprovalForwardedActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_approval_forwarded") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-approval-bridge-v1") return undefined;
  const decision = stringValue(payload.decision);
  const effectiveScope = stringValue(payload.effectiveScope);
  const userDecision = stringValue(payload.userDecisionPreview);
  const approvalId = stringValue(payload.approvalId);
  const scope = recordValue(payload.scope);
  const scopeReason = stringValue(scope?.reason);
  const parentBlockingState = recordValue(payload.parentBlockingState);
  const parentResumeLabel =
    payload.resumeParentBlocking === true || parentBlockingState?.resumeParentBlocking === true
      ? "Parent returned to waiting on this child."
      : undefined;
  const childAlwaysDefaultedLabel = payload.childAlwaysDefaulted === true ? "Always defaulted to this child thread." : undefined;
  const detail = truncate([userDecision, childAlwaysDefaultedLabel ?? scopeReason, parentResumeLabel].filter(Boolean).join(" | "), 260);
  return {
    id: event.id,
    label: "Approval forwarded",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: decision === "denied" ? "danger" : decision === "approved" ? "success" : "neutral",
    summary: truncate(
      [
        decision ? approvalDecisionLabel(decision) : "Decision sent",
        effectiveScope ? approvalScopeLabel(effectiveScope) : undefined,
        approvalId,
      ]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    ...(detail ? { detail } : {}),
    updatedAt: event.updatedAt,
  };
}

function supervisorRequestActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_supervisor_request") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-supervisor-request-v1") return undefined;
  const kind = stringValue(payload.kind);
  const title = stringValue(payload.title);
  const message = stringValue(payload.messagePreview);
  const progressLabel = stringValue(payload.progressLabel);
  const blockedReason = stringValue(payload.blockedReason);
  const choices = arrayValue(payload.requestedChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  return {
    id: event.id,
    label: kind === "progress_update" ? "Child progress" : "Supervisor request",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: supervisorRequestTone(event, payload),
    summary: truncate(
      [
        title ?? supervisorRequestKindLabel(kind),
        progressLabel,
        choices.length ? `${choices.length} ${choices.length === 1 ? "choice" : "choices"}` : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    detail: truncate(
      [blockedReason, message, choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined].filter(Boolean).join(" | "),
      260,
    ),
    ...(choices.length ? { actionLabels: choices.slice(0, 4) } : {}),
    updatedAt: event.updatedAt,
  };
}

function supervisorRequestTone(event: SubagentParentMailboxEventSummary, payload: Record<string, unknown>): SubagentParentClusterTone {
  if (event.deliveryState === "failed") return "danger";
  const severity = stringValue(payload.severity);
  if (severity === "danger") return "danger";
  if (payload.parentRequiresAttention === true && event.deliveryState === "queued") return "warning";
  if (stringValue(payload.kind) === "progress_update") return event.deliveryState === "queued" ? "active" : "neutral";
  return "neutral";
}

function supervisorRequestKindLabel(kind: string | undefined): string {
  if (kind === "need_decision") return "Needs decision";
  if (kind === "blocked") return "Child blocked";
  if (kind === "progress_update") return "Progress update";
  return "Supervisor request";
}

function approvalDecisionLabel(decision: string): string {
  if (decision === "approved") return "Approved";
  if (decision === "denied") return "Denied";
  return decision
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

function approvalScopeLabel(scope: string): string {
  if (scope === "this_action") return "This action";
  if (scope === "this_child_thread") return "This child thread";
  if (scope === "parent_thread_tree") return "Parent thread tree";
  if (scope === "project") return "Project";
  if (scope === "global") return "Global";
  return scope
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

function spawnFailureActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.spawn_failed") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-spawn-failure-v1") return undefined;
  const modelScope = recordValue(payload.modelScope);
  const stage = stringValue(payload.failureStage);
  const requestedRole = stringValue(payload.requestedRoleId) ?? stringValue(payload.roleId);
  const model = modelScopeSummary(modelScope);
  const reason = stringValue(payload.reason);
  const modelDetail = modelScopeFailureDetail(modelScope);
  const toolScopeDetail = toolScopeFailureDetail(recordValue(payload.toolScopeSnapshot), payload.approvalUnavailable === true);
  const detailParts = stage === "tool_scope" ? [toolScopeDetail, reason, modelDetail] : [reason, modelDetail, toolScopeDetail];
  return {
    id: event.id,
    label: "Spawn failed",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: "danger",
    summary: truncate(
      [stage ? failureStageLabel(stage, payload) : "Launch blocked", requestedRole ? titleCase(requestedRole) : undefined, model]
        .filter(Boolean)
        .join(" / "),
      160,
    ),
    detail: truncate(detailParts.filter(Boolean).join(" | "), 240),
    updatedAt: event.updatedAt,
  };
}

function modelScopeSummary(modelScope: Record<string, unknown> | undefined): string | undefined {
  if (!modelScope) return undefined;
  const profile = recordValue(modelScope.profile);
  const label = stringValue(profile?.label);
  const selectedModelId = stringValue(modelScope.selectedModelId) ?? stringValue(profile?.modelId);
  if (!label && !selectedModelId) return undefined;
  return label && selectedModelId && label !== selectedModelId ? `${label} (${selectedModelId})` : (label ?? selectedModelId);
}

function modelScopeFailureDetail(modelScope: Record<string, unknown> | undefined): string | undefined {
  if (!modelScope) return undefined;
  const blockers = stringArrayValue(modelScope.blockingReasons);
  if (blockers.length > 0) return `Model blockers: ${blockers.join("; ")}`;
  const candidateReason = arrayValue(modelScope.candidateDiagnostics)
    .map(recordValue)
    .find((candidate) => candidate?.selected === true && candidate.eligible !== true);
  if (!candidateReason) return undefined;
  const reasons = stringArrayValue(candidateReason.blockingReasons);
  if (reasons.length > 0) return `Selected candidate blocked: ${reasons.join("; ")}`;
  return undefined;
}

function failureStageLabel(stage: string, payload?: Record<string, unknown>): string {
  if (stage === "model_scope") return "Model scope blocked";
  if (stage === "runtime_launch_preflight") return "Runtime preflight blocked";
  if (stage === "capacity") return "Capacity blocked";
  if (stage === "tool_scope") return payload?.approvalUnavailable === true ? "Approval unavailable" : "Tool scope blocked";
  return stage
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

function toolScopeFailureDetail(toolScopeSnapshot: Record<string, unknown> | undefined, approvalUnavailable: boolean): string | undefined {
  const deniedCategories = arrayValue(toolScopeSnapshot?.deniedCategories)
    .map(recordValue)
    .map(deniedCategoryFailureLabel)
    .filter((item): item is string => Boolean(item));
  const deniedTools = arrayValue(toolScopeSnapshot?.deniedTools)
    .map(recordValue)
    .map(deniedToolFailureLabel)
    .filter((item): item is string => Boolean(item));
  const denyReasons = uniqueStrings(
    [
      ...arrayValue(toolScopeSnapshot?.deniedCategories).map(recordValue).map(deniedCategoryReasonLabel),
      ...arrayValue(toolScopeSnapshot?.deniedTools).map(recordValue).map(deniedToolReasonLabel),
    ].filter((item): item is string => Boolean(item)),
  );
  const detail = [
    approvalUnavailable ? "Approval unavailable: non-interactive launch cannot surface required approval" : undefined,
    deniedCategories.length ? `Denied categories: ${deniedCategories.slice(0, 3).join("; ")}` : undefined,
    deniedTools.length ? `Denied tools: ${deniedTools.slice(0, 3).join("; ")}` : undefined,
    denyReasons.length ? `Deny reasons: ${denyReasons.slice(0, 3).join("; ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
  return detail || undefined;
}

function deniedCategoryFailureLabel(category: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(category?.id);
  if (!id) return undefined;
  const label = toolScopeCategoryLabel(id);
  return `${label} (${id})`;
}

function deniedToolFailureLabel(tool: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(tool?.source);
  const id = stringValue(tool?.id);
  if (!source || !id) return undefined;
  const categoryId = stringValue(tool?.categoryId);
  const category = categoryId ? ` / ${toolScopeCategoryLabel(categoryId)} (${categoryId})` : "";
  return `${toolScopeSourceLabel(source)} ${id}${category}`;
}

function deniedCategoryReasonLabel(category: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(category?.id);
  const reason = stringValue(category?.reason);
  if (!id || !reason) return undefined;
  return `${toolScopeCategoryLabel(id)} (${id}): ${reason}`;
}

function deniedToolReasonLabel(tool: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(tool?.source);
  const id = stringValue(tool?.id);
  const reason = stringValue(tool?.reason);
  if (!source || !id || !reason) return undefined;
  return `${toolScopeSourceLabel(source)} ${id}: ${reason}`;
}

function toolScopeSourceLabel(source: string): string {
  return source.split("_").map(titleCase).join(" ");
}

function toolScopeCategoryLabel(category: string): string {
  return category.split(".").map(titleCase).join(" ");
}

function batchProgressActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.batch_progress") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-batch-progress-mailbox-v1") return undefined;
  const summary = recordValue(payload.summary);
  if (summary?.schemaVersion !== "ambient-subagent-batch-progress-v1") return undefined;
  const itemCount = numberValue(summary.itemCount);
  const acceptedReportCount = numberValue(summary.acceptedReportCount);
  const pendingCount = numberValue(summary.pendingCount);
  if (itemCount === undefined || acceptedReportCount === undefined || pendingCount === undefined) return undefined;
  const jobId = typeof summary.jobId === "string" ? summary.jobId : undefined;
  return {
    id: event.id,
    label: "Batch progress",
    statusTone: pendingCount > 0 ? "active" : "success",
    summary: `${acceptedReportCount}/${itemCount} ${itemCount === 1 ? "item" : "items"} reported`,
    detail:
      pendingCount > 0
        ? `${pendingCount} pending${jobId ? ` · ${truncate(jobId, 72)}` : ""}`
        : `All items reported${jobId ? ` · ${truncate(jobId, 72)}` : ""}`,
    updatedAt: event.updatedAt,
  };
}

function groupedCompletionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.grouped_completion") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-grouped-completion-v1") return undefined;
  const notificationCount = numberValue(payload.notificationCount) ?? arrayValue(payload.childRuns).length;
  return {
    id: event.id,
    label: "Background completions",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: "success",
    summary: `${notificationCount} ${notificationCount === 1 ? "child" : "children"} completed`,
    detail: childRunActivityDetail(arrayValue(payload.childRuns)),
    updatedAt: event.updatedAt,
  };
}

function childRunActivityDetail(childRuns: unknown[]): string | undefined {
  const labels = childRuns
    .map(recordValue)
    .map((child) => {
      const role = typeof child?.roleId === "string" ? titleCase(child.roleId) : undefined;
      const status = typeof child?.status === "string" ? child.status.split("_").map(titleCase).join(" ") : undefined;
      return [role, status].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return labels.length ? truncate(labels.join(", "), 140) : undefined;
}

function mailboxTypeLabel(type: string): string {
  return type
    .replace(/^subagent\./, "")
    .split(/[._-]+/g)
    .map(titleCase)
    .join(" ");
}

function lifecycleSourceLabel(source: string | undefined): string | undefined {
  if (source === "parent_cancel_request") return "Cancelled by parent";
  if (source === "direct_child_stop") return "Stopped in child thread";
  if (source === "desktop_restart") return "Needs restart reconciliation";
  if (source === "runtime_budget_exceeded") return "Runtime budget exceeded";
  return undefined;
}

function lifecycleStatusTone(status: string | undefined): SubagentParentClusterTone {
  if (status === "detached" || status === "aborted_partial") return "warning";
  if (status === "completed") return "success";
  if (status === "running" || status === "starting" || status === "waiting") return "active";
  if (status === "failed" || status === "stopped" || status === "cancelled" || status === "timed_out") return "danger";
  return "neutral";
}
