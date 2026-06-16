import type {
  AutomationRunSummary,
  CallableWorkflowTaskProgressSnapshot,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskUsageSnapshot,
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
  WorkflowModelCallRecord,
  WorkflowRunEvent,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowRevisionStatus,
  WorkflowRevisionSummary,
  WorkflowVersionCreatedBy,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
  WorkflowTraceMode,
} from "../shared/types";
import { workflowRunLiveness } from "../shared/workflowRunLiveness";
import {
  mapWorkflowArtifactRow,
  type WorkflowArtifactRow,
} from "./projectStore/workflowArtifactMappers";
import {
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
  type WorkflowRunEventRow,
  type WorkflowRunRow,
  type WorkflowRunScheduleEventRow,
} from "./projectStore/workflowRunMappers";

export { mapWorkflowArtifactRow };
export type { WorkflowArtifactRow };
export {
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
};
export type {
  WorkflowRunEventRow,
  WorkflowRunRow,
  WorkflowRunScheduleEventRow,
};
export { mapCallableWorkflowTaskRow } from "./projectStore/callableWorkflowTaskMappers";
export type { CallableWorkflowTaskRow } from "./projectStore/callableWorkflowTaskMappers";

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

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonNegativeIntegerFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
