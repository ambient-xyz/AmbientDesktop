import type {
  CollaborationMode,
  ThinkingLevel,
  ThreadKind,
  ThreadSummary,
  ThreadWorktreeSummary
} from "../../shared/threadTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import type { WorkflowRecordingState } from "../../shared/workflowTypes";
import { normalizeAmbientModelId } from "../../shared/ambientModels";

export interface ThreadRow {
  id: string;
  title: string;
  workspace_path: string;
  kind: ThreadKind;
  parent_thread_id: string | null;
  parent_message_id: string | null;
  parent_run_id: string | null;
  subagent_run_id: string | null;
  canonical_task_path: string | null;
  child_order: number | null;
  collapsed_by_default: number | null;
  child_status: SubagentRunStatus | null;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
  last_message_preview: string;
  permission_mode: PermissionMode;
  collaboration_mode: CollaborationMode;
  model: string;
  thinking_level: ThinkingLevel;
  memory_enabled?: number | null;
  pi_session_file: string | null;
  archived_at: string | null;
  pinned: number | null;
  workflow_recording_json: string | null;
}

export interface SearchThreadRow {
  id: string;
  title: string;
  last_message_preview: string;
  updated_at: string;
}

export interface ThreadWorktreeRow {
  thread_id: string;
  project_root: string;
  worktree_path: string;
  branch_name: string;
  base_ref: string | null;
  upstream: string | null;
  worktree_status: ThreadWorktreeSummary["status"];
  created_at: string;
  updated_at: string;
  last_checkpoint_id: string | null;
  error: string | null;
}

export function mapThreadRow(row: ThreadRow, options: { gitWorktree?: ThreadWorktreeSummary } = {}): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    workspacePath: row.workspace_path,
    kind: row.kind === "subagent_child" ? "subagent_child" : "chat",
    parentThreadId: row.parent_thread_id ?? undefined,
    parentMessageId: row.parent_message_id ?? undefined,
    parentRunId: row.parent_run_id ?? undefined,
    subagentRunId: row.subagent_run_id ?? undefined,
    canonicalTaskPath: row.canonical_task_path ?? undefined,
    childOrder: row.child_order ?? undefined,
    collapsedByDefault: Boolean(row.collapsed_by_default),
    childStatus: row.child_status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    lastReadAt: row.last_read_at ?? undefined,
    lastMessagePreview: row.last_message_preview,
    permissionMode: row.permission_mode,
    collaborationMode: row.collaboration_mode === "planner" ? "planner" : "agent",
    model: normalizeAmbientModelId(row.model),
    thinkingLevel: row.thinking_level,
    memoryEnabled: Boolean(row.memory_enabled),
    piSessionFile: row.pi_session_file ?? undefined,
    gitWorktree: options.gitWorktree,
    pinned: Boolean(row.pinned),
    workflowRecording: row.workflow_recording_json
      ? parseJsonObject<WorkflowRecordingState | undefined>(row.workflow_recording_json, undefined)
      : undefined,
  };
}

export function mapWorkspaceSearchThreadRow(
  row: SearchThreadRow,
  input: { workspacePath: string; projectName: string; scope: Exclude<WorkspaceSearchScope, "all-projects"> },
): WorkspaceSearchResult {
  return {
    id: `thread:${row.id}`,
    kind: "thread",
    threadId: row.id,
    workspacePath: input.workspacePath,
    projectName: input.projectName,
    title: row.title,
    excerpt: row.last_message_preview,
    createdAt: row.updated_at,
    scope: input.scope,
  };
}

export function mapThreadWorktreeRow(row: ThreadWorktreeRow): ThreadWorktreeSummary {
  return {
    threadId: row.thread_id,
    projectRoot: row.project_root,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    baseRef: row.base_ref ?? undefined,
    upstream: row.upstream ?? undefined,
    status: row.worktree_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckpointId: row.last_checkpoint_id ?? undefined,
    error: row.error ?? undefined,
  };
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
