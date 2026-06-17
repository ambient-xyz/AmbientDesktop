import type {
  AutomationFolderSummary,
  AutomationRunSummary,
  AutomationScheduleConcurrencyPolicy,
  AutomationScheduleExceptionKind,
  AutomationScheduleExceptionStatus,
  AutomationScheduleExceptionSummary,
  AutomationSchedulePresetKind,
  AutomationScheduleSummary,
  AutomationScheduleTargetKind,
  AutomationThreadKind,
  AutomationThreadSummary,
  OrchestrationRun,
  OrchestrationTask,
  WorkflowArtifactSummary,
  WorkflowRunEvent,
  WorkflowRunLimitOverrides,
  WorkflowRunSummary,
} from "../../shared/types";
import {
  formatMutationPolicy,
  workflowRunAutomationStatus,
  workflowRunAutomationSummary,
} from "./projectStoreWorkflowMappers";

export interface AutomationFolderRow {
  id: string;
  name: string;
  folder_kind: AutomationFolderSummary["kind"];
  created_at: string;
  updated_at: string;
}

export interface AutomationScheduleRow {
  id: string;
  target_kind: AutomationScheduleTargetKind;
  target_id: string;
  target_version: number | null;
  created_target_version_id: string | null;
  dedicated_thread_id: string | null;
  preset: AutomationSchedulePresetKind;
  cron_expression: string | null;
  timezone: string;
  enabled: number;
  skip_if_active: number;
  concurrency_policy: AutomationScheduleConcurrencyPolicy;
  next_run_at: string | null;
  last_run_at: string | null;
  run_limits_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationScheduleExceptionRow {
  id: string;
  schedule_id: string;
  occurrence_at: string;
  exception_kind: AutomationScheduleExceptionKind;
  status: AutomationScheduleExceptionStatus;
  replacement_run_at: string | null;
  run_limits_json: string | null;
  reason: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationThreadFolderRow {
  source_kind: AutomationThreadKind;
  source_id: string;
  folder_id: string;
  created_at: string;
  updated_at: string;
}

interface AutomationWorkflowArtifactThreadContext {
  folderId: string;
  latestRun?: WorkflowRunSummary;
  latestRunEvents?: WorkflowRunEvent[];
  projectName: string;
  projectPath: string;
}

interface AutomationOrchestrationTaskThreadContext {
  folderId: string;
  latestRun?: OrchestrationRun;
  projectName: string;
  projectPath: string;
}

export function automationThreadId(kind: AutomationThreadKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function parseAutomationThreadId(threadId: string): { kind: AutomationThreadKind; id: string } {
  const separator = threadId.indexOf(":");
  const kind = threadId.slice(0, separator) as AutomationThreadKind;
  const id = threadId.slice(separator + 1);
  if ((kind !== "orchestration_task" && kind !== "workflow_artifact") || !id) {
    throw new Error(`Invalid automation thread id: ${threadId}`);
  }
  return { kind, id };
}

export function compareAutomationThreads(left: AutomationThreadSummary, right: AutomationThreadSummary): number {
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title);
}

export function compareAutomationFolders(left: AutomationFolderSummary, right: AutomationFolderSummary): number {
  if (left.kind === "home" && right.kind !== "home") return -1;
  if (right.kind === "home" && left.kind !== "home") return 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
}

export function latestOrchestrationRunForTask(runs: OrchestrationRun[], taskId: string): OrchestrationRun | undefined {
  return runs.find((run) => run.taskId === taskId);
}

export function latestWorkflowRunForArtifact(runs: WorkflowRunSummary[], artifactId: string): WorkflowRunSummary | undefined {
  return runs.find((run) => run.artifactId === artifactId);
}

export function mapAutomationFolderRow(row: AutomationFolderRow): AutomationFolderSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.folder_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threads: [],
  };
}

export function mapAutomationWorkflowArtifactThread(
  artifact: WorkflowArtifactSummary,
  context: AutomationWorkflowArtifactThreadContext,
): AutomationThreadSummary {
  const latestRun = context.latestRun;
  const latestRunEvents = context.latestRunEvents ?? [];
  const latestRunStatus = latestRun ? workflowRunAutomationStatus(latestRun, latestRunEvents) : undefined;
  return {
    id: automationThreadId("workflow_artifact", artifact.id),
    folderId: context.folderId,
    kind: "workflow_artifact",
    sourceId: artifact.id,
    title: artifact.title,
    preview: artifact.spec.summary || artifact.spec.goal || "Workflow automation",
    status: latestRunStatus ?? artifact.status,
    projectName: context.projectName,
    projectPath: context.projectPath,
    createdAt: artifact.createdAt,
    updatedAt: latestRun?.updatedAt ?? artifact.updatedAt,
    latestRun: latestRun ? workflowRunAutomationSummary(latestRun, latestRunEvents) : undefined,
    badges: [
      latestRunStatus === "stale" ? "Run stale" : undefined,
      formatMutationPolicy(artifact.manifest.mutationPolicy),
      artifact.manifest.connectors?.length ? `${artifact.manifest.connectors.length} connector${artifact.manifest.connectors.length === 1 ? "" : "s"}` : undefined,
      artifact.manifest.pluginCapabilities?.length
        ? `${artifact.manifest.pluginCapabilities.length} plugin requirement${artifact.manifest.pluginCapabilities.length === 1 ? "" : "s"}`
        : undefined,
      ...artifact.manifest.tools.slice(0, 3),
    ].filter((item): item is string => Boolean(item)),
  };
}

export function mapAutomationOrchestrationTaskThread(
  task: OrchestrationTask,
  context: AutomationOrchestrationTaskThreadContext,
): AutomationThreadSummary {
  const latestRun = context.latestRun;
  const latestRunSummary = latestRun ? orchestrationRunSummary(latestRun) : undefined;
  const badges = [
    task.identifier,
    task.priority !== undefined ? `Priority ${task.priority}` : undefined,
    task.workspacePath ? "Workspace ready" : undefined,
    ...task.labels,
  ].filter((item): item is string => Boolean(item));
  return {
    id: automationThreadId("orchestration_task", task.id),
    folderId: context.folderId,
    kind: "orchestration_task",
    sourceId: task.id,
    title: task.title,
    preview: task.description || latestRun?.error || "Local orchestration task",
    status: latestRun?.status ?? task.state,
    projectName: context.projectName,
    projectPath: context.projectPath,
    createdAt: task.createdAt,
    updatedAt: latestRunSummary?.updatedAt ?? task.updatedAt,
    latestRun: latestRunSummary,
    underlyingThreadId: latestRun?.threadId,
    badges,
  };
}

export function mapAutomationScheduleRow(row: AutomationScheduleRow, targetLabel: string): AutomationScheduleSummary {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    targetVersion: row.target_version ?? undefined,
    targetLabel,
    preset: row.preset,
    cronExpression: row.cron_expression ?? undefined,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    skipIfActive: row.skip_if_active === 1,
    concurrencyPolicy: row.concurrency_policy,
    nextRunAt: row.next_run_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    runLimits: parseWorkflowRunLimitOverrides(row.run_limits_json),
    createdTargetVersionId: row.created_target_version_id ?? undefined,
    dedicatedThreadId: row.dedicated_thread_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAutomationScheduleExceptionRow(row: AutomationScheduleExceptionRow): AutomationScheduleExceptionSummary {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    occurrenceAt: row.occurrence_at,
    exceptionKind: row.exception_kind,
    status: row.status,
    replacementRunAt: row.replacement_run_at ?? undefined,
    runLimits: parseWorkflowRunLimitOverrides(row.run_limits_json),
    reason: row.reason ?? undefined,
    consumedAt: row.consumed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orchestrationRunSummary(run: OrchestrationRun): AutomationRunSummary {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.lastEventAt ?? run.finishedAt ?? run.startedAt,
    completedAt: run.finishedAt,
    workspacePath: run.workspacePath,
    threadId: run.threadId,
    attemptNumber: run.attemptNumber,
  };
}

function parseWorkflowRunLimitOverrides(json: string | null | undefined): WorkflowRunLimitOverrides | undefined {
  if (!json) return undefined;
  const parsed = parseJsonObject<WorkflowRunLimitOverrides | undefined>(json, undefined);
  if (!parsed) return undefined;
  const normalized: WorkflowRunLimitOverrides = {};
  if (typeof parsed.idleTimeoutMs === "number" && Number.isFinite(parsed.idleTimeoutMs) && parsed.idleTimeoutMs > 0) {
    normalized.idleTimeoutMs = Math.floor(parsed.idleTimeoutMs);
  }
  if (parsed.maxRunMs === null) {
    normalized.maxRunMs = null;
  } else if (typeof parsed.maxRunMs === "number" && Number.isFinite(parsed.maxRunMs) && parsed.maxRunMs > 0) {
    normalized.maxRunMs = Math.floor(parsed.maxRunMs);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
