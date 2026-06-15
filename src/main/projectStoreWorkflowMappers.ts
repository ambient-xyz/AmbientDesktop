import type {
  AutomationRunSummary,
  CallableWorkflowLaunchCardSummary,
  AutomationScheduleTargetKind,
  CallableWorkflowTaskProgressSnapshot,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  CallableWorkflowTaskUsageSnapshot,
  SubagentPatternGraphSnapshot,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadPhase,
  WorkflowAgentThreadSummary,
  WorkflowArtifactStatus,
  WorkflowArtifactSummary,
  WorkflowDiscoveryQuestion,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphSnapshot,
  WorkflowGraphSnapshotSource,
  WorkflowExplorationRunStatus,
  WorkflowExplorationTraceSummary,
  WorkflowManifest,
  WorkflowModelCallRecord,
  WorkflowRecoveryContext,
  WorkflowRunEvent,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
  WorkflowRunScheduleSummary,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowRevisionStatus,
  WorkflowRevisionSummary,
  WorkflowSpec,
  WorkflowVersionCreatedBy,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
  WorkflowTraceMode,
} from "../shared/types";
import { workflowRunLiveness } from "../shared/workflowRunLiveness";

export interface WorkflowAgentFolderRow {
  id: string;
  name: string;
  folder_kind: WorkflowAgentFolderSummary["kind"];
  created_at: string;
  updated_at: string;
}

export interface WorkflowAgentThreadRow {
  id: string;
  folder_id: string;
  chat_thread_id: string | null;
  project_path: string;
  title: string;
  phase: WorkflowAgentThreadPhase;
  initial_request: string;
  active_artifact_id: string | null;
  active_graph_snapshot_id: string | null;
  trace_mode: WorkflowTraceMode;
  created_at: string;
  updated_at: string;
}

export interface WorkflowArtifactRow {
  id: string;
  workflow_thread_id: string | null;
  title: string;
  status: WorkflowArtifactStatus;
  manifest_json: string;
  spec_json: string;
  source_path: string;
  state_path: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunEventRow {
  id: string;
  run_id: string;
  artifact_id: string;
  seq: number;
  event_type: string;
  created_at: string;
  message: string | null;
  graph_node_id: string | null;
  graph_edge_id: string | null;
  item_key: string | null;
  data_json: string | null;
}

export interface WorkflowRunRow {
  id: string;
  artifact_id: string;
  status: WorkflowRunStatus;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
  report_path: string | null;
  graph_snapshot_id?: string | null;
  provider_health_json?: string | null;
  retry_metadata_json?: string | null;
  recovery_context_json?: string | null;
}

export interface WorkflowRunScheduleEventRow {
  event_type: string;
  data_json: string | null;
}

interface WorkflowRunRowContext {
  scheduledBy?: WorkflowRunScheduleSummary;
}

interface WorkflowAgentThreadRowContext {
  artifact?: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  latestRunEvents?: WorkflowRunEvent[];
  latestVersion?: WorkflowVersionSummary;
  graph?: WorkflowGraphSnapshot;
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  projectName: string;
  fallbackProjectPath: string;
}

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

export interface WorkflowModelCallRow {
  id: string;
  run_id: string | null;
  artifact_id: string | null;
  task: string;
  status: WorkflowModelCallRecord["status"];
  input_json: string;
  output_json: string | null;
  cache_key: string | null;
  cache_checkpoint_json: string | null;
  model: string | null;
  graph_node_id: string | null;
  graph_edge_id: string | null;
  item_key: string | null;
  validation_error: string | null;
  started_at: string;
  completed_at: string;
  latency_ms: number;
}

export interface WorkflowDiscoveryQuestionRow {
  id: string;
  workflow_thread_id: string;
  revision_id: string | null;
  question_order: number;
  category: WorkflowDiscoveryQuestion["category"];
  context: string;
  question: string;
  choices_json: string;
  allow_freeform: number;
  answer_json: string | null;
  graph_impact: string | null;
  provider: WorkflowDiscoveryQuestion["provider"] | null;
  provider_model: string | null;
  policy_context_summary: string | null;
  capability_search_json: string | null;
  capability_descriptions_json: string | null;
  blocked_reasons_json: string | null;
  access_requests_json: string | null;
  activity_events_json: string | null;
  cache_checkpoint_json: string | null;
  graph_patch_json: string | null;
  created_at: string;
  answered_at: string | null;
}

export interface WorkflowGraphSnapshotRow {
  id: string;
  workflow_thread_id: string;
  snapshot_version: number;
  snapshot_source: WorkflowGraphSnapshotSource;
  summary: string;
  graph_json: string;
  artifact_path: string | null;
  created_at: string;
}

export interface WorkflowExplorationTraceRow {
  id: string;
  workflow_thread_id: string;
  exploration_id: string;
  exploration_node_id: string;
  request_text: string;
  model: string | null;
  capability_manifest_json: string;
  observations_json: string;
  events_json?: string;
  distillation_json: string;
  run_status?: string | null;
  graph_snapshot_id?: string | null;
  latest_progress_json?: string | null;
  provider_health_json?: string | null;
  retry_metadata_json?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface WorkflowVersionRow {
  id: string;
  workflow_thread_id: string;
  artifact_id: string;
  version_number: number;
  graph_snapshot_id: string | null;
  source_path: string;
  repo_path: string;
  git_commit_hash: string | null;
  version_status: WorkflowVersionStatus;
  created_by: WorkflowVersionCreatedBy;
  created_at: string;
}

export interface WorkflowRevisionRow {
  id: string;
  workflow_thread_id: string;
  base_version_id: string | null;
  base_artifact_id: string | null;
  requested_change: string;
  proposed_graph_snapshot_id: string | null;
  graph_diff_json: string | null;
  source_diff: string | null;
  revision_status: WorkflowRevisionStatus;
  created_at: string;
  updated_at: string;
}

interface WorkflowRevisionRowContext {
  proposedVersion?: Pick<WorkflowVersionSummary, "id" | "artifactId">;
}

export function mapWorkflowArtifactRow(row: WorkflowArtifactRow): WorkflowArtifactSummary {
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id ?? undefined,
    title: row.title,
    status: row.status,
    manifest: parseJsonObject<WorkflowManifest>(row.manifest_json, { tools: [], mutationPolicy: "read_only" }),
    spec: parseJsonObject<WorkflowSpec>(row.spec_json, { goal: "" }),
    sourcePath: row.source_path,
    statePath: row.state_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWorkflowAgentFolderRow(row: WorkflowAgentFolderRow): WorkflowAgentFolderSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.folder_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threads: [],
  };
}

export function compareWorkflowAgentThreads(left: WorkflowAgentThreadSummary, right: WorkflowAgentThreadSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

export function compareWorkflowAgentFolders(left: WorkflowAgentFolderSummary, right: WorkflowAgentFolderSummary): number {
  if (left.kind === "home" && right.kind !== "home") return -1;
  if (right.kind === "home" && left.kind !== "home") return 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
}

export function callableWorkflowTaskFinishState(runStatus: WorkflowRunStatus): {
  status: CallableWorkflowTaskStatus;
  statusLabel: string;
  runnerDeferredReason: string;
  completed: boolean;
} {
  if (runStatus === "succeeded") {
    return {
      status: "succeeded",
      statusLabel: "Succeeded",
      runnerDeferredReason: "workflow_run_succeeded",
      completed: true,
    };
  }
  if (runStatus === "failed") {
    return {
      status: "failed",
      statusLabel: "Failed",
      runnerDeferredReason: "workflow_run_failed",
      completed: true,
    };
  }
  if (runStatus === "canceled" || runStatus === "skipped") {
    return {
      status: "canceled",
      statusLabel: runStatus === "skipped" ? "Skipped" : "Canceled",
      runnerDeferredReason: runStatus === "skipped" ? "workflow_run_skipped" : "workflow_run_canceled",
      completed: true,
    };
  }
  if (runStatus === "paused" || runStatus === "needs_input") {
    return {
      status: "paused",
      statusLabel: runStatus === "needs_input" ? "Needs input" : "Paused",
      runnerDeferredReason: runStatus === "needs_input" ? "workflow_run_needs_input" : "workflow_run_paused",
      completed: false,
    };
  }
  return {
    status: "running",
    statusLabel: "Running",
    runnerDeferredReason: "workflow_run_started",
    completed: false,
  };
}

export function callableWorkflowTaskProgressSnapshot(
  run: WorkflowRunSummary,
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
): CallableWorkflowTaskProgressSnapshot {
  const completedStepKeys = new Set<string>();
  const startedStepKeys = new Set<string>();
  let anonymousStepStarts = 0;
  let anonymousStepEnds = 0;

  for (const event of events) {
    const key = event.graphNodeId ?? event.itemKey;
    if (event.type === "step.start") {
      if (key) startedStepKeys.add(key);
      else anonymousStepStarts += 1;
    }
    if (event.type === "step.end" || event.type === "step.error" || event.type === "step.paused") {
      if (key) completedStepKeys.add(key);
      else anonymousStepEnds += 1;
    }
  }

  const activeNamedSteps = [...startedStepKeys].filter((key) => !completedStepKeys.has(key)).length;
  const lastEvent = events.at(-1);
  return {
    workflowRunStatus: run.status,
    eventCount: events.length,
    modelCallCount: modelCalls.length,
    completedStepCount: completedStepKeys.size + anonymousStepEnds,
    activeStepCount: activeNamedSteps + Math.max(0, anonymousStepStarts - anonymousStepEnds),
    ...(lastEvent?.type ? { lastEventType: lastEvent.type } : {}),
    ...(lastEvent?.message ? { lastEventMessage: lastEvent.message } : {}),
    ...(lastEvent?.createdAt ? { lastEventAt: lastEvent.createdAt } : {}),
  };
}

export function callableWorkflowTaskUsageSnapshot(
  events: WorkflowRunEvent[],
  modelCalls: WorkflowModelCallRecord[],
): CallableWorkflowTaskUsageSnapshot {
  let eventTokenCount: number | undefined;
  let eventCostMicros: number | undefined;

  for (const event of events) {
    const data = recordFromUnknown(event.data);
    const usage = recordFromUnknown(data?.usage);
    const tokenCount =
      nonNegativeIntegerFromRecord(data, "tokenCount") ??
      nonNegativeIntegerFromRecord(data, "tokens") ??
      nonNegativeIntegerFromRecord(usage, "tokenCount") ??
      nonNegativeIntegerFromRecord(usage, "tokens");
    const costMicros =
      nonNegativeIntegerFromRecord(data, "costMicros") ??
      nonNegativeIntegerFromRecord(usage, "costMicros");
    if (tokenCount !== undefined) eventTokenCount = (eventTokenCount ?? 0) + tokenCount;
    if (costMicros !== undefined) eventCostMicros = (eventCostMicros ?? 0) + costMicros;
  }

  const estimatedModelCallTokens = modelCalls.reduce((sum, call) => {
    const estimate = call.cacheCheckpoint?.requestEstimatedTokens;
    return typeof estimate === "number" && Number.isFinite(estimate) && estimate > 0 ? sum + Math.floor(estimate) : sum;
  }, 0);
  const tokenCount = eventTokenCount ?? (estimatedModelCallTokens > 0 ? estimatedModelCallTokens : undefined);
  return {
    modelCallCount: modelCalls.length,
    ...(tokenCount !== undefined ? { tokenCount } : {}),
    tokenCountEstimated: eventTokenCount === undefined && tokenCount !== undefined,
    ...(eventCostMicros !== undefined ? { costMicros: eventCostMicros } : {}),
    costEstimated: false,
  };
}

export function mapWorkflowAgentThreadRow(
  row: WorkflowAgentThreadRow,
  context: WorkflowAgentThreadRowContext,
): WorkflowAgentThreadSummary {
  const artifact = context.artifact;
  const latestRun = context.latestRun;
  const latestRunEvents = context.latestRunEvents ?? [];
  const latestRunStatus = latestRun ? workflowRunAutomationStatus(latestRun, latestRunEvents) : undefined;
  const latestRunPhaseStatus: WorkflowRunStatus | undefined = latestRunStatus === "stale" ? "failed" : latestRun?.status;
  const phase =
    row.phase === "revision"
      ? row.phase
      : latestRun?.status === "previewed" && artifact?.status === "approved"
        ? workflowAgentPhaseForArtifactStatus(artifact.status)
        : latestRunPhaseStatus
          ? workflowAgentPhaseForRunStatus(latestRunPhaseStatus)
          : artifact
            ? workflowAgentPhaseForArtifactStatus(artifact.status)
            : row.phase;
  return {
    id: row.id,
    folderId: row.folder_id,
    chatThreadId: row.chat_thread_id ?? undefined,
    projectName: context.projectName,
    projectPath: row.project_path || context.fallbackProjectPath,
    title: row.title,
    phase,
    initialRequest: row.initial_request,
    preview: artifact?.spec.summary || artifact?.spec.goal || row.initial_request || "Workflow Agent thread",
    status: latestRunStatus ?? artifact?.status ?? phase,
    traceMode: row.trace_mode,
    activeArtifactId: row.active_artifact_id ?? undefined,
    activeGraphSnapshotId: context.graph?.id ?? row.active_graph_snapshot_id ?? undefined,
    latestVersion: context.latestVersion,
    latestRun: latestRun ? workflowRunAutomationSummary(latestRun, latestRunEvents) : undefined,
    graph: context.graph,
    discoveryQuestions: context.discoveryQuestions ?? [],
    badges: [
      workflowAgentPhaseLabel(phase),
      latestRunStatus === "stale" ? "Run stale" : undefined,
      row.trace_mode === "debug" ? "Debug traces" : "Production traces",
      artifact ? formatMutationPolicy(artifact.manifest.mutationPolicy) : undefined,
      artifact?.manifest.connectors?.length ? `${artifact.manifest.connectors.length} connector${artifact.manifest.connectors.length === 1 ? "" : "s"}` : undefined,
      ...(artifact?.manifest.tools.slice(0, 3) ?? []),
    ].filter((item): item is string => Boolean(item)),
    createdAt: row.created_at,
    updatedAt: latestRun?.updatedAt ?? artifact?.updatedAt ?? row.updated_at,
  };
}

export function mapWorkflowRunEventRow(row: WorkflowRunEventRow): WorkflowRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    artifactId: row.artifact_id,
    seq: row.seq,
    type: row.event_type,
    createdAt: row.created_at,
    message: row.message ?? undefined,
    graphNodeId: row.graph_node_id ?? undefined,
    graphEdgeId: row.graph_edge_id ?? undefined,
    itemKey: row.item_key ?? undefined,
    data: row.data_json ? parseMetadata(row.data_json) : undefined,
  };
}

export function mapWorkflowRunRow(row: WorkflowRunRow, context: WorkflowRunRowContext = {}): WorkflowRunSummary {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    reportPath: row.report_path ?? undefined,
    scheduledBy: context.scheduledBy,
    graphSnapshotId: row.graph_snapshot_id ?? undefined,
    providerHealth: row.provider_health_json ? (parseJsonValue(row.provider_health_json) as WorkflowRunProviderHealth) : undefined,
    retryMetadata: row.retry_metadata_json ? (parseJsonValue(row.retry_metadata_json) as WorkflowRunRetryMetadata) : undefined,
    recoveryContext: row.recovery_context_json ? (parseJsonValue(row.recovery_context_json) as WorkflowRecoveryContext) : undefined,
  };
}

export function mapWorkflowRunScheduleSummaryRow(
  row: WorkflowRunScheduleEventRow | undefined,
): WorkflowRunScheduleSummary | undefined {
  const data = row?.data_json ? parseMetadata(row.data_json) : undefined;
  const scheduleId = stringFromRecord(data, "scheduleId");
  if (!scheduleId) return undefined;
  const targetKind = stringFromRecord(data, "targetKind");
  return {
    scheduleId,
    outcome: row?.event_type === "workflow.schedule.skipped" ? "skipped" : "started",
    targetKind: isAutomationScheduleTargetKind(targetKind) ? targetKind : undefined,
    targetId: stringFromRecord(data, "targetId"),
    targetLabel: stringFromRecord(data, "targetLabel"),
    targetVersionId: stringFromRecord(data, "targetVersionId") ?? stringFromRecord(data, "versionId"),
    createdTargetVersionId: stringFromRecord(data, "createdTargetVersionId"),
    grantDecisionSource: stringFromRecord(data, "grantDecisionSource"),
  };
}

export function workflowRunAutomationSummary(run: WorkflowRunSummary, events: WorkflowRunEvent[] = []): AutomationRunSummary {
  return {
    id: run.id,
    status: workflowRunAutomationStatus(run, events),
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

export function workflowRunAutomationStatus(run: WorkflowRunSummary, events: WorkflowRunEvent[] = []): string {
  return workflowRunLiveness(run, events).stale ? "stale" : run.status;
}

export function workflowAgentPhaseForArtifactStatus(status: WorkflowArtifactStatus): WorkflowAgentThreadPhase {
  if (status === "ready_for_preview") return "ready_for_review";
  if (status === "approved") return "approved";
  if (status === "rejected") return "revision";
  if (status === "archived") return "succeeded";
  return "request";
}

export function formatMutationPolicy(policy: string): string {
  return policy.replaceAll("_", " ");
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

export function mapWorkflowModelCallRow(row: WorkflowModelCallRow): WorkflowModelCallRecord {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    artifactId: row.artifact_id ?? undefined,
    task: row.task,
    status: row.status,
    input: parseJsonValue(row.input_json),
    output: row.output_json ? parseJsonValue(row.output_json) : undefined,
    cacheKey: row.cache_key ?? undefined,
    cacheCheckpoint: row.cache_checkpoint_json
      ? parseJsonObject<WorkflowModelCallRecord["cacheCheckpoint"] | undefined>(row.cache_checkpoint_json, undefined)
      : undefined,
    model: row.model ?? undefined,
    graphNodeId: row.graph_node_id ?? undefined,
    graphEdgeId: row.graph_edge_id ?? undefined,
    itemKey: row.item_key ?? undefined,
    validationError: row.validation_error ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    latencyMs: row.latency_ms,
  };
}

export function mapWorkflowRevisionRow(row: WorkflowRevisionRow, context: WorkflowRevisionRowContext = {}): WorkflowRevisionSummary {
  const proposedVersion = context.proposedVersion;
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    baseVersionId: row.base_version_id ?? undefined,
    baseArtifactId: row.base_artifact_id ?? undefined,
    proposedVersionId: proposedVersion?.id,
    proposedArtifactId: proposedVersion?.artifactId,
    requestedChange: row.requested_change,
    proposedGraphSnapshotId: row.proposed_graph_snapshot_id ?? undefined,
    graphDiff: row.graph_diff_json ? parseJsonValue(row.graph_diff_json) : undefined,
    sourceDiff: row.source_diff ?? undefined,
    status: row.revision_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWorkflowDiscoveryQuestionRow(row: WorkflowDiscoveryQuestionRow): WorkflowDiscoveryQuestion {
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    revisionId: row.revision_id ?? undefined,
    category: row.category,
    context: row.context,
    question: row.question,
    choices: parseJsonArray<WorkflowDiscoveryQuestion["choices"][number]>(row.choices_json),
    allowFreeform: row.allow_freeform === 1,
    answer: row.answer_json ? parseJsonObject<WorkflowDiscoveryQuestion["answer"] | undefined>(row.answer_json, undefined) : undefined,
    graphImpact: row.graph_impact ?? undefined,
    provider: row.provider ?? undefined,
    providerModel: row.provider_model ?? undefined,
    policyContextSummary: row.policy_context_summary ?? undefined,
    capabilitySearch: row.capability_search_json
      ? parseJsonObject<WorkflowDiscoveryQuestion["capabilitySearch"] | undefined>(row.capability_search_json, undefined)
      : undefined,
    capabilityDescriptions: row.capability_descriptions_json
      ? parseJsonArray<NonNullable<WorkflowDiscoveryQuestion["capabilityDescriptions"]>[number]>(row.capability_descriptions_json)
      : undefined,
    blockedReasons: row.blocked_reasons_json ? parseJsonArray<string>(row.blocked_reasons_json) : undefined,
    accessRequests: row.access_requests_json ? parseJsonArray<NonNullable<WorkflowDiscoveryQuestion["accessRequests"]>[number]>(row.access_requests_json) : undefined,
    activityEvents: row.activity_events_json ? parseJsonArray<NonNullable<WorkflowDiscoveryQuestion["activityEvents"]>[number]>(row.activity_events_json) : undefined,
    cacheCheckpoint: row.cache_checkpoint_json
      ? parseJsonObject<WorkflowDiscoveryQuestion["cacheCheckpoint"] | undefined>(row.cache_checkpoint_json, undefined)
      : undefined,
    graphPatch: row.graph_patch_json ? parseJsonObject<WorkflowDiscoveryQuestion["graphPatch"] | undefined>(row.graph_patch_json, undefined) : undefined,
    createdAt: row.created_at,
    answeredAt: row.answered_at ?? undefined,
  };
}

export function mapWorkflowGraphSnapshotRow(row: WorkflowGraphSnapshotRow): WorkflowGraphSnapshot {
  const graph = parseJsonObject<{ nodes?: WorkflowGraphNode[]; edges?: WorkflowGraphEdge[] }>(row.graph_json, {});
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    version: row.snapshot_version,
    source: row.snapshot_source,
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    summary: row.summary,
    artifactPath: row.artifact_path ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapWorkflowExplorationTraceRow(row: WorkflowExplorationTraceRow): WorkflowExplorationTraceSummary {
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    explorationId: row.exploration_id,
    explorationNodeId: row.exploration_node_id,
    request: row.request_text,
    model: row.model ?? undefined,
    capabilityManifest: parseJsonValue(row.capability_manifest_json),
    observations: parseJsonArray(row.observations_json),
    events: parseJsonArray(row.events_json ?? "[]"),
    distillation: parseJsonValue(row.distillation_json),
    status: workflowExplorationRunStatus(row.run_status),
    graphSnapshotId: row.graph_snapshot_id ?? undefined,
    latestProgress: row.latest_progress_json ? (parseJsonValue(row.latest_progress_json) as WorkflowExplorationTraceSummary["latestProgress"]) : undefined,
    providerHealth: row.provider_health_json ? parseJsonValue(row.provider_health_json) : undefined,
    retryMetadata: row.retry_metadata_json ? parseJsonValue(row.retry_metadata_json) : undefined,
    error: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function mapWorkflowVersionRow(row: WorkflowVersionRow): WorkflowVersionSummary {
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    artifactId: row.artifact_id,
    version: row.version_number,
    graphSnapshotId: row.graph_snapshot_id ?? undefined,
    sourcePath: row.source_path,
    repoPath: row.repo_path,
    gitCommitHash: row.git_commit_hash ?? undefined,
    status: row.version_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function workflowExplorationRunStatus(value: string | null | undefined): WorkflowExplorationRunStatus {
  return value === "running" || value === "failed" || value === "canceled" || value === "fallback" ? value : "succeeded";
}

function workflowAgentPhaseForRunStatus(status: WorkflowRunStatus): WorkflowAgentThreadPhase {
  if (status === "running") return "running";
  if (status === "paused" || status === "needs_input") return "paused";
  if (status === "failed" || status === "canceled") return "failed";
  if (status === "succeeded") return "succeeded";
  if (status === "previewed") return "ready_for_review";
  return "planned";
}

function workflowAgentPhaseLabel(phase: WorkflowAgentThreadPhase): string {
  return phase
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonValue(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function parseMetadata(metadataJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return {};
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

function nonNegativeIntegerFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function isAutomationScheduleTargetKind(value: string | undefined): value is AutomationScheduleTargetKind {
  return value === "local_task" || value === "workflow_playbook" || value === "workflow_thread" || value === "workflow_version" || value === "workflow_artifact" || value === "folder";
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
