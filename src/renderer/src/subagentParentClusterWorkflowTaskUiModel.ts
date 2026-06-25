import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import { isCallableWorkflowSymphonyChildWaitPreCompilePause } from "../../shared/callableWorkflowTaskGuards";

export interface SubagentParentClusterWorkflowTaskModel {
  id: string;
  title: string;
  status: string;
  statusTone: SubagentParentClusterTone;
  modeLabel: string;
  sourceLabel: string;
  workflowThreadId?: string;
  workflowThreadLabel?: string;
  canOpenWorkflowThread: boolean;
  openWorkflowThreadTitle: string;
  progressLabel: string;
  capabilityLabels: string[];
  telemetryLabels: string[];
  idLabels?: string[];
  launchCardLabels?: string[];
  provenanceLabels?: string[];
  mutationEvidenceLabels?: string[];
  canPause: boolean;
  pauseTitle: string;
  canCancel: boolean;
  cancelTitle: string;
  canResume: boolean;
  resumeTitle: string;
  parentBlocker?: SubagentParentClusterWorkflowTaskBlockerModel;
  childWait?: SubagentParentClusterWorkflowTaskChildWaitModel;
  detail?: string;
}

export interface SubagentParentClusterWorkflowTaskBlockerModel {
  kind: "waiting" | "attention";
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
}

export interface SubagentParentClusterWorkflowTaskChildWaitModel {
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
  childLabels: string[];
}

export type SubagentParentClusterTone = "neutral" | "active" | "success" | "warning" | "danger";

export function callableWorkflowTaskModel(
  task: CallableWorkflowTaskSummary,
  parentBlocker?: SubagentParentClusterWorkflowTaskBlockerModel,
  childWait?: SubagentParentClusterWorkflowTaskChildWaitModel,
): SubagentParentClusterWorkflowTaskModel {
  const detail = callableWorkflowTaskDetail(task);
  const launchCardLabels = callableWorkflowTaskLaunchCardLabels(task);
  const provenanceLabels = callableWorkflowTaskProvenanceLabels(task);
  const mutationEvidenceLabels = callableWorkflowTaskMutationEvidenceLabels(task);
  const idLabels = callableWorkflowTaskIdLabels(task);
  return {
    id: task.id,
    title: task.title || task.toolName || task.id,
    status: task.statusLabel || statusLabelFromString(task.status),
    statusTone: callableWorkflowTaskTone(task.status),
    modeLabel: task.blocking ? "Blocking" : "Background",
    sourceLabel: callableWorkflowTaskSourceLabel(task),
    ...(task.workflowThreadId
      ? { workflowThreadId: task.workflowThreadId, workflowThreadLabel: `Workflow thread: ${task.workflowThreadId}` }
      : {}),
    canOpenWorkflowThread: Boolean(task.workflowThreadId),
    openWorkflowThreadTitle: task.workflowThreadId ? `Open workflow thread ${task.workflowThreadId}` : "Workflow thread is not linked yet",
    progressLabel: callableWorkflowTaskProgressLabel(task),
    capabilityLabels: callableWorkflowTaskCapabilityLabels(task),
    telemetryLabels: callableWorkflowTaskTelemetryLabels(task),
    ...(idLabels.length ? { idLabels } : {}),
    ...(launchCardLabels.length ? { launchCardLabels } : {}),
    ...(provenanceLabels.length ? { provenanceLabels } : {}),
    ...(mutationEvidenceLabels.length ? { mutationEvidenceLabels } : {}),
    canPause: task.pauseResumeCancel && callableWorkflowTaskCanPause(task),
    pauseTitle: `Pause ${task.blocking ? "blocking" : "background"} workflow task`,
    canCancel: task.pauseResumeCancel && callableWorkflowTaskCanCancel(task.status),
    cancelTitle: `Cancel ${task.blocking ? "blocking" : "background"} workflow task`,
    canResume: task.pauseResumeCancel && callableWorkflowTaskCanResume(task),
    resumeTitle: `Resume ${task.blocking ? "blocking" : "background"} workflow task`,
    ...(parentBlocker ? { parentBlocker } : {}),
    ...(childWait ? { childWait } : {}),
    ...(detail ? { detail } : {}),
  };
}

export function workflowTaskChildWaitsForBackgroundSymphonyTasks(
  tasks: CallableWorkflowTaskSummary[],
  barriers: SubagentWaitBarrierSummary[],
  runsById: Map<string, SubagentRunSummary>,
  childThreads: Map<string, ThreadSummary>,
): Map<string, SubagentParentClusterWorkflowTaskChildWaitModel> {
  const backgroundTasks = new Map(tasks.filter((task) => !task.blocking).map((task) => [task.id, task] as const));
  const waits = new Map<string, { barrier: SubagentWaitBarrierSummary; model: SubagentParentClusterWorkflowTaskChildWaitModel }>();
  for (const barrier of barriers) {
    if (barrier.ownerKind !== "callable_workflow_symphony_launch_bridge" || !barrier.ownerId) continue;
    if (barrier.status === "satisfied") continue;
    const task = backgroundTasks.get(barrier.ownerId);
    if (!task) continue;
    const existing = waits.get(task.id);
    if (existing && existing.barrier.updatedAt >= barrier.updatedAt) continue;
    waits.set(task.id, {
      barrier,
      model: workflowTaskChildWaitModel(task, barrier, runsById, childThreads),
    });
  }
  return new Map([...waits].map(([taskId, entry]) => [taskId, entry.model]));
}

function workflowTaskChildWaitModel(
  task: CallableWorkflowTaskSummary,
  barrier: SubagentWaitBarrierSummary,
  runsById: Map<string, SubagentRunSummary>,
  childThreads: Map<string, ThreadSummary>,
): SubagentParentClusterWorkflowTaskChildWaitModel {
  const childLabels = barrier.childRunIds
    .map((runId) => {
      const run = runsById.get(runId);
      if (!run) return `Child ${runId.slice(0, 8)}`;
      return `${childTitle(run, childThreads.get(run.childThreadId))}: ${statusLabel(run.status)}`;
    })
    .slice(0, 4);
  const hiddenChildCount = Math.max(0, barrier.childRunIds.length - childLabels.length);
  const childSummary = [...childLabels, hiddenChildCount ? `${hiddenChildCount} more` : undefined]
    .filter((label): label is string => Boolean(label))
    .join(" / ");
  return {
    label: "Waiting on Symphony children",
    statusTone: barrierTone(barrier.status),
    detail: truncate(
      [
        task.title || task.toolName,
        barrierStatusLabel(barrier.status),
        barrierDependencyLabel(barrier.dependencyMode),
        failurePolicyLabel(barrier.failurePolicy),
        barrier.timeoutMs !== undefined ? timeoutLabel(barrier.timeoutMs) : undefined,
        childSummary,
      ]
        .filter(Boolean)
        .join(" / "),
      280,
    ),
    childLabels,
  };
}

function callableWorkflowTaskIdLabels(task: CallableWorkflowTaskSummary): string[] {
  return [
    `Task: ${task.id}`,
    task.workflowArtifactId ? `Artifact: ${task.workflowArtifactId}` : undefined,
    task.workflowRunId ? `Run: ${task.workflowRunId}` : undefined,
    task.workflowThreadId ? `Thread: ${task.workflowThreadId}` : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskMutationEvidenceLabels(task: CallableWorkflowTaskSummary): string[] {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (stringValue(provenance?.kind) !== "subagent_child_thread") return [];
  const approval = recordValue(provenance?.approval);
  const worktree = recordValue(provenance?.worktree);
  const nestedFanout = recordValue(provenance?.nestedFanout);
  const lastEvent = task.progressSnapshot?.lastEventMessage ?? "";
  const stagedPath = stagedMutationPathFromMessage(lastEvent);
  const isMutatingEvidence =
    stagedPath ||
    /mutat/i.test(task.launchCard?.toolMutationScope ?? "") ||
    booleanValue(approval?.required) === true ||
    booleanValue(worktree?.required) === true;
  if (!isMutatingEvidence) return [];
  return uniqueStrings(
    [
      "Mutating child worker",
      booleanValue(approval?.required) === true && stringValue(approval?.source) === "child_bridge_policy"
        ? "Approval: child bridge policy"
        : undefined,
      booleanValue(worktree?.isolated) === true && stringValue(worktree?.status) === "active" ? "Isolated worktree active" : undefined,
      booleanValue(nestedFanout?.required) === true && stringValue(nestedFanout?.source) === "child_bridge_policy"
        ? "Nested fanout granted"
        : undefined,
      stagedPath ? `Staged mutation: ${stagedPath}` : undefined,
      /parent workspace unchanged/i.test(lastEvent) ? "Parent workspace unchanged" : undefined,
      /preview retained|bounded preview/i.test(lastEvent) ? "Output preview retained" : undefined,
    ].filter((label): label is string => Boolean(label)),
  );
}

function stagedMutationPathFromMessage(message: string): string | undefined {
  const match = message.match(/\bStaged mutation:\s*([^;\n]+)/i);
  return match?.[1]?.trim() || undefined;
}

export function workflowTaskParentBlockers(
  events: SubagentParentMailboxEventSummary[],
): Map<string, SubagentParentClusterWorkflowTaskBlockerModel> {
  const blockers = new Map<string, SubagentParentClusterWorkflowTaskBlockerModel>();
  for (const event of events) {
    if (event.type !== "callable_workflow.parent_finalization_blocked") continue;
    const payload = recordValue(event.payload);
    if (payload?.schemaVersion !== "ambient-callable-workflow-parent-blocking-v1") continue;
    const waitingTaskIds = new Set(stringArrayValue(payload.waitingTaskIds));
    const attentionTaskIds = new Set(stringArrayValue(payload.attentionTaskIds));
    const taskRecords = arrayValue(payload.tasks)
      .map(recordValue)
      .filter((task): task is Record<string, unknown> => Boolean(task));
    const taskRecordsById = new Map(
      taskRecords
        .map((task) => [stringValue(task.id), task] as const)
        .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0])),
    );
    const taskIds = uniqueStrings([
      ...stringArrayValue(payload.taskIds),
      ...waitingTaskIds,
      ...attentionTaskIds,
      ...taskRecords.map((task) => stringValue(task.id) ?? ""),
    ]);
    for (const taskId of taskIds) {
      if (blockers.has(taskId)) continue;
      const task = taskRecordsById.get(taskId);
      const kind = workflowTaskParentBlockerKind(taskId, task, waitingTaskIds, attentionTaskIds);
      if (!kind) continue;
      blockers.set(taskId, workflowTaskParentBlockerModel(payload, task, kind));
    }
  }
  return blockers;
}

function workflowTaskParentBlockerKind(
  taskId: string,
  task: Record<string, unknown> | undefined,
  waitingTaskIds: Set<string>,
  attentionTaskIds: Set<string>,
): SubagentParentClusterWorkflowTaskBlockerModel["kind"] | undefined {
  if (attentionTaskIds.has(taskId)) return "attention";
  if (waitingTaskIds.has(taskId)) return "waiting";
  const statusGroup = stringValue(task?.statusGroup);
  if (statusGroup === "needs_attention") return "attention";
  if (statusGroup === "waiting_on_workflow") return "waiting";
  const status = stringValue(task?.status);
  if (status === "paused" || status === "failed" || status === "canceled") return "attention";
  if (status === "queued" || status === "compiling" || status === "running") return "waiting";
  return undefined;
}

function workflowTaskParentBlockerModel(
  payload: Record<string, unknown>,
  task: Record<string, unknown> | undefined,
  kind: SubagentParentClusterWorkflowTaskBlockerModel["kind"],
): SubagentParentClusterWorkflowTaskBlockerModel {
  const status = stringValue(task?.status);
  const statusLabel = stringValue(task?.statusLabel) ?? (status ? statusLabelFromString(status) : undefined);
  const title = stringValue(task?.title) ?? stringValue(task?.toolName) ?? stringValue(task?.id);
  const message = stringValue(payload.message);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  const detail = truncate(
    [
      title,
      statusLabel,
      callableWorkflowTaskLifecycleLabel(stringValue(task?.runnerDeferredReason), status),
      stringValue(task?.workflowRunId) ? `run ${stringValue(task?.workflowRunId)}` : undefined,
      stringValue(task?.workflowArtifactId) ? `artifact ${stringValue(task?.workflowArtifactId)}` : undefined,
      stringValue(task?.errorMessage) ? `Error: ${stringValue(task?.errorMessage)}` : undefined,
      message,
      choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join(" / "),
    260,
  );
  if (kind === "attention") {
    return {
      kind,
      label: "Blocking: workflow attention",
      statusTone: workflowTaskParentBlockerAttentionTone(status),
      detail,
    };
  }
  return {
    kind,
    label: "Blocking: workflow work",
    statusTone: "active",
    detail,
  };
}

function workflowTaskParentBlockerAttentionTone(status: string | undefined): SubagentParentClusterTone {
  return status === "failed" || status === "canceled" ? "danger" : "warning";
}

function callableWorkflowTaskCanCancel(status: CallableWorkflowTaskSummary["status"]): boolean {
  return status === "queued" || status === "compiling" || status === "running" || status === "paused";
}

function callableWorkflowTaskCanPause(task: CallableWorkflowTaskSummary): boolean {
  if (task.status !== "running" || !task.workflowRunId) return false;
  const runStatus = task.progressSnapshot?.workflowRunStatus;
  return !runStatus || runStatus === "running";
}

function callableWorkflowTaskCanResume(task: CallableWorkflowTaskSummary): boolean {
  if (isCallableWorkflowSymphonyChildWaitPreCompilePause(task)) return true;
  if (task.status !== "paused" || !task.workflowArtifactId || !task.workflowRunId) return false;
  const runStatus = task.progressSnapshot?.workflowRunStatus;
  if (runStatus) return runStatus === "paused";
  return task.runnerDeferredReason === "workflow_run_paused";
}

function callableWorkflowTaskTone(status: CallableWorkflowTaskSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "queued":
    case "compiling":
    case "running":
      return "active";
    case "succeeded":
      return "success";
    case "paused":
      return "warning";
    case "failed":
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
}

function callableWorkflowTaskProgressLabel(task: CallableWorkflowTaskSummary): string {
  if (task.status === "queued") return "Queued";
  if (task.status === "compiling") return "Compiling artifact";
  if (task.status === "running") {
    if (task.progressSnapshot?.lastEventMessage) return truncate(task.progressSnapshot.lastEventMessage, 64);
    if (task.progressSnapshot?.activeStepCount)
      return `${task.progressSnapshot.activeStepCount} active / ${task.progressSnapshot.completedStepCount} done`;
    if (task.progressSnapshot?.completedStepCount) return `${task.progressSnapshot.completedStepCount} steps done`;
    return task.workflowRunId ? `Run ${task.workflowRunId}` : "Workflow run active";
  }
  if (task.status === "paused") return callableWorkflowPausedProgressLabel(task);
  if (task.status === "succeeded") return "Complete";
  if (task.status === "failed") return "Failed";
  if (task.status === "canceled") return "Canceled";
  return statusLabelFromString(task.status);
}

function callableWorkflowPausedProgressLabel(task: CallableWorkflowTaskSummary): string {
  if (
    task.runnerDeferredReason === "workflow_run_needs_input" ||
    task.progressSnapshot?.workflowRunStatus === "needs_input" ||
    /^needs input$/i.test(task.statusLabel)
  ) {
    return "Needs input";
  }
  return task.statusLabel || "Paused";
}

function callableWorkflowTaskSourceLabel(task: CallableWorkflowTaskSummary): string {
  if (task.sourceKind === "symphony_recipe") return "Symphony recipe";
  if (task.sourceKind === "recorded_workflow") return "Recorded workflow";
  if (task.sourceKind === "workflow_recipe") return "Workflow recipe";
  return (
    task.sourceKind
      .split(/[._-]+/g)
      .map(titleCase)
      .join(" ") || "Callable workflow"
  );
}

function callableWorkflowTaskCapabilityLabels(task: CallableWorkflowTaskSummary): string[] {
  return [
    task.progressVisible ? "Progress visible" : undefined,
    task.tokenCostTracking ? "Token/cost" : undefined,
    task.pauseResumeCancel ? "Pause/resume/cancel" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskTelemetryLabels(task: CallableWorkflowTaskSummary): string[] {
  const progress = task.progressSnapshot;
  const usage = task.usageSnapshot;
  return [
    progress && progress.eventCount > 0
      ? `${progress.eventCount.toLocaleString()} ${plural(progress.eventCount, "event", "events")}`
      : undefined,
    progress && progress.completedStepCount > 0
      ? `${progress.completedStepCount.toLocaleString()} ${plural(progress.completedStepCount, "step", "steps")} done`
      : undefined,
    usage && usage.modelCallCount > 0
      ? `${usage.modelCallCount.toLocaleString()} ${plural(usage.modelCallCount, "model call", "model calls")}`
      : undefined,
    usage?.tokenCount !== undefined ? `${usage.tokenCountEstimated ? "~" : ""}${usage.tokenCount.toLocaleString()} tokens` : undefined,
    usage?.costMicros !== undefined ? formatCostMicros(usage.costMicros, usage.costEstimated) : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskLaunchCardLabels(task: CallableWorkflowTaskSummary): string[] {
  const launchCard = task.launchCard;
  if (!launchCard) return [];
  return [
    `Risk: ${titleCase(launchCard.riskLevel)}`,
    `Up to ${launchCard.estimatedAgents.toLocaleString()} ${plural(launchCard.estimatedAgents, "agent", "agents")}`,
    `Budget: ${launchCard.estimatedTokenBudget.toLocaleString()} tokens`,
    launchCard.requireConfirmation ? "Confirmation required" : undefined,
    launchCard.smallSliceRecommended ? "Small slice recommended" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskProvenanceLabels(task: CallableWorkflowTaskSummary): string[] {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (!provenance) return [];
  const approval = recordValue(provenance.approval);
  const worktree = recordValue(provenance.worktree);
  const nestedFanout = recordValue(provenance.nestedFanout);
  const approvalSource = stringValue(approval?.source);
  const nestedFanoutSource = stringValue(nestedFanout?.source);
  return uniqueStrings(
    [
      callableWorkflowCallerKindLabel(stringValue(provenance.kind)),
      stringValue(provenance.subagentRunId) ? `Child run: ${stringValue(provenance.subagentRunId)}` : undefined,
      approvalSource ? `Approval: ${callableWorkflowProvenanceSourceLabel(approvalSource)}` : undefined,
      callableWorkflowWorktreeLabel(worktree),
      booleanValue(nestedFanout?.required) === true && nestedFanoutSource
        ? `Nested fanout: ${callableWorkflowProvenanceSourceLabel(nestedFanoutSource)}`
        : undefined,
    ].filter((label): label is string => Boolean(label)),
  );
}

function callableWorkflowTaskDetail(task: CallableWorkflowTaskSummary): string | undefined {
  const launchCard = task.launchCard;
  const provenanceDetail = callableWorkflowTaskProvenanceDetail(task);
  return (
    truncate(
      [
        launchCard ? `Launch: ${launchCard.riskLevel} risk, up to ${launchCard.estimatedAgents} agents` : undefined,
        launchCard ? `Local memory: ${formatBytes(launchCard.estimatedLocalMemoryBytes)}` : undefined,
        task.runnerTarget ? `Runner: ${task.runnerTarget}` : undefined,
        task.runnerDeferredReason ? `State: ${callableWorkflowTaskLifecycleLabel(task.runnerDeferredReason, task.status)}` : undefined,
        task.workflowThreadId ? `Thread: ${task.workflowThreadId}` : undefined,
        task.workflowArtifactId ? `Artifact: ${task.workflowArtifactId}` : undefined,
        task.workflowRunId ? `Run: ${task.workflowRunId}` : undefined,
        provenanceDetail ? `Provenance: ${provenanceDetail}` : undefined,
        task.errorMessage ? `Error: ${task.errorMessage}` : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      260,
    ) || undefined
  );
}

function callableWorkflowTaskProvenanceDetail(task: CallableWorkflowTaskSummary): string | undefined {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (!provenance) return undefined;
  const approval = recordValue(provenance.approval);
  const worktree = recordValue(provenance.worktree);
  const nestedFanout = recordValue(provenance.nestedFanout);
  const runId = stringValue(provenance.runId);
  const subagentRunId = stringValue(provenance.subagentRunId);
  const parts = [
    callableWorkflowCallerKindDetail(stringValue(provenance.kind)),
    stringValue(provenance.threadId) ? `thread ${stringValue(provenance.threadId)}` : undefined,
    runId ? `run ${runId}` : undefined,
    subagentRunId && subagentRunId !== runId ? `sub-agent ${subagentRunId}` : undefined,
    stringValue(provenance.canonicalTaskPath) ? `path ${stringValue(provenance.canonicalTaskPath)}` : undefined,
    callableWorkflowApprovalDetail(approval),
    callableWorkflowWorktreeDetail(worktree),
    callableWorkflowNestedFanoutDetail(nestedFanout),
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function callableWorkflowTaskCallerProvenance(task: CallableWorkflowTaskSummary): Record<string, unknown> | undefined {
  const executionPlan = recordValue(task.executionPlan);
  return recordValue(executionPlan?.callerProvenance);
}

function callableWorkflowCallerKindLabel(kind: string | undefined): string | undefined {
  if (kind === "subagent_child_thread") return "Caller: sub-agent child";
  if (kind === "parent_thread") return "Caller: parent thread";
  return kind ? `Caller: ${statusLabelFromString(kind)}` : undefined;
}

function callableWorkflowCallerKindDetail(kind: string | undefined): string | undefined {
  if (kind === "subagent_child_thread") return "sub-agent child";
  if (kind === "parent_thread") return "parent thread";
  return kind ? statusLabelFromString(kind).toLowerCase() : undefined;
}

function callableWorkflowApprovalDetail(approval: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(approval?.source);
  const scopeHint = stringValue(approval?.scopeHint);
  const required = booleanValue(approval?.required);
  const parts = [
    source ? `approval ${callableWorkflowProvenanceSourceLabel(source).toLowerCase()}` : undefined,
    required === true ? "required" : required === false ? "not required" : undefined,
    scopeHint ? `scope ${callableWorkflowProvenanceSourceLabel(scopeHint).toLowerCase()}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function callableWorkflowWorktreeLabel(worktree: Record<string, unknown> | undefined): string | undefined {
  const isolated = booleanValue(worktree?.isolated);
  const required = booleanValue(worktree?.required);
  if (isolated === true) return "Worktree: isolated";
  if (required === true) return "Worktree: not isolated";
  return undefined;
}

function callableWorkflowWorktreeDetail(worktree: Record<string, unknown> | undefined): string | undefined {
  const isolated = booleanValue(worktree?.isolated);
  const required = booleanValue(worktree?.required);
  const status = stringValue(worktree?.status);
  const branchName = stringValue(worktree?.branchName);
  const parts = [
    isolated === true ? "worktree isolated" : required === true ? "worktree not isolated" : undefined,
    status ? statusLabelFromString(status).toLowerCase() : undefined,
    branchName ? `branch ${branchName}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function callableWorkflowNestedFanoutDetail(nestedFanout: Record<string, unknown> | undefined): string | undefined {
  const required = booleanValue(nestedFanout?.required);
  const source = stringValue(nestedFanout?.source);
  if (required !== true && !source) return undefined;
  return [
    required === true ? "nested fanout required" : "nested fanout not required",
    source ? `via ${callableWorkflowProvenanceSourceLabel(source).toLowerCase()}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function callableWorkflowProvenanceSourceLabel(source: string): string {
  return source
    .split(/[._-]+/g)
    .filter(Boolean)
    .map(titleCase)
    .join(" ");
}

function callableWorkflowTaskLifecycleLabel(runnerDeferredReason: string | undefined, status?: string): string | undefined {
  switch (runnerDeferredReason) {
    case "callable_workflow_runner_not_connected":
      return "Waiting for workflow runner";
    case "workflow_artifact_not_compiled":
      return "Compiling workflow artifact";
    case "workflow_run_not_started":
      return "Workflow artifact ready";
    case "workflow_run_started":
      return "Workflow run started";
    case "workflow_run_paused":
      return "Workflow run paused";
    case "workflow_run_needs_input":
      return "Workflow run needs input";
    case "workflow_run_succeeded":
      return "Workflow run succeeded";
    case "workflow_run_failed":
      return "Workflow run failed";
    case "workflow_run_canceled":
      return "Workflow run canceled";
    case "workflow_run_skipped":
      return "Workflow run skipped";
    case "callable_workflow_task_canceled":
      return "Workflow task canceled";
    case "failed":
      return "Workflow task failed";
    default:
      return runnerDeferredReason
        ? runnerDeferredReason
            .split(/[._-]+/g)
            .filter(Boolean)
            .map(titleCase)
            .join(" ")
        : status
          ? statusLabelFromString(status)
          : undefined;
  }
}

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel;
}

function formatCostMicros(costMicros: number, estimated: boolean): string {
  const dollars = costMicros / 1_000_000;
  const formatted =
    dollars >= 0.01
      ? dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : `$${dollars.toFixed(6)}`;
  return `${estimated ? "~" : ""}${formatted}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const gib = value / (1024 * 1024 * 1024);
  if (gib >= 1) return `${formatDecimal(gib)} GiB`;
  const mib = value / (1024 * 1024);
  if (mib >= 1) return `${formatDecimal(mib)} MiB`;
  return `${Math.floor(value).toLocaleString()} bytes`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function childTitle(run: SubagentRunSummary, thread: ThreadSummary | undefined): string {
  return thread?.title || `${titleCase(run.roleId)} sub-agent`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function barrierStatusLabel(status: SubagentWaitBarrierSummary["status"]): string {
  if (status === "waiting_on_children") return "Waiting on child";
  return status.split("_").map(titleCase).join(" ");
}

function barrierDependencyLabel(mode: SubagentWaitBarrierSummary["dependencyMode"]): string {
  if (mode === "required_all") return "Required all";
  if (mode === "required_any") return "Required any";
  if (mode === "optional_background") return "Background";
  return "Quorum";
}

function failurePolicyLabel(policy: SubagentWaitBarrierSummary["failurePolicy"]): string {
  if (policy === "ask_user") return "Ask user on failure";
  if (policy === "degrade_partial") return "Allow partial";
  if (policy === "retry_child") return "Retry child";
  return "Fail parent";
}

function barrierTone(status: SubagentWaitBarrierSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "waiting_on_children":
      return "active";
    case "satisfied":
      return "success";
    case "timed_out":
    case "cancelled":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function timeoutLabel(timeoutMs: number): string {
  if (timeoutMs < 1000) return `${timeoutMs}ms timeout`;
  const seconds = Math.round(timeoutMs / 1000);
  if (seconds < 60) return `${seconds}s timeout`;
  return `${Math.round(seconds / 60)}m timeout`;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function statusLabel(status: SubagentRunSummary["status"]): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

function statusLabelFromString(status: string): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
