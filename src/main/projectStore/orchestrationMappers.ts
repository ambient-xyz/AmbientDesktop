import type {
  CreateOrchestrationTaskInput,
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
} from "../../shared/types";

export type {
  CreateOrchestrationTaskInput,
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
} from "../../shared/types";

export interface OrchestrationTaskRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  priority: number | null;
  labels_json: string;
  blocked_by_json: string;
  project_path: string | null;
  branch_name: string | null;
  workspace_path: string | null;
  source_kind: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrchestrationRunRow {
  id: string;
  task_id: string;
  attempt_number: number;
  status: string;
  workspace_path: string;
  thread_id: string | null;
  pi_session_file: string | null;
  started_at: string;
  finished_at: string | null;
  last_event_at: string | null;
  error: string | null;
  proof_of_work_json: string | null;
}

export function mapOrchestrationTaskRow(row: OrchestrationTaskRow): OrchestrationTask {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description ?? undefined,
    state: row.state,
    priority: row.priority ?? undefined,
    labels: parseStringList(row.labels_json),
    blockedBy: parseStringList(row.blocked_by_json),
    projectPath: row.project_path ?? undefined,
    branchName: row.branch_name ?? undefined,
    workspacePath: row.workspace_path ?? undefined,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOrchestrationRunRow(row: OrchestrationRunRow): OrchestrationRun {
  return {
    id: row.id,
    taskId: row.task_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    workspacePath: row.workspace_path,
    threadId: row.thread_id ?? undefined,
    piSessionFile: row.pi_session_file ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
    error: row.error ?? undefined,
    proofOfWork: row.proof_of_work_json ? parseMetadata(row.proof_of_work_json) : undefined,
  };
}

function parseMetadata(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson) return {};
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
