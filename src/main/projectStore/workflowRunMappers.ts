import type {
  AutomationScheduleTargetKind,
  WorkflowRecoveryContext,
  WorkflowRunEvent,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
  WorkflowRunScheduleSummary,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "../../shared/types";
import { parseJsonValue, parseMetadata, stringFromRecord } from "./projectStoreJson";

export type {
  WorkflowRecoveryContext,
  WorkflowRunEvent,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
  WorkflowRunStatus,
  WorkflowRunSummary,
} from "../../shared/types";

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

export interface WorkflowRunRowContext {
  scheduledBy?: WorkflowRunScheduleSummary;
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

function isAutomationScheduleTargetKind(value: string | undefined): value is AutomationScheduleTargetKind {
  return value === "local_task" || value === "workflow_playbook" || value === "workflow_thread" || value === "workflow_version" || value === "workflow_artifact" || value === "folder";
}
