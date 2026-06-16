import type {
  AmbientPermissionGrant,
  PermissionAuditDecision,
  PermissionAuditDecisionSource,
  PermissionAuditEntry,
  PermissionGrantActionKind,
  PermissionGrantCreatedBy,
  PermissionGrantScopeKind,
  PermissionGrantSource,
  PermissionGrantTargetKind,
  PermissionMode,
  PermissionRisk,
} from "../../shared/types";

export interface PermissionAuditRow {
  id: string;
  run_id: string | null;
  thread_id: string;
  created_at: string;
  permission_mode: PermissionMode;
  tool_name: string;
  risk: PermissionRisk;
  decision: PermissionAuditDecision;
  detail: string | null;
  reason: string;
  decision_source?: string | null;
  grant_id?: string | null;
}

export interface AmbientPermissionGrantRow {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: PermissionGrantCreatedBy;
  permission_mode_at_creation: PermissionMode;
  scope_kind: PermissionGrantScopeKind;
  thread_id: string | null;
  workflow_thread_id: string | null;
  project_path: string | null;
  workspace_path: string | null;
  action_kind: PermissionGrantActionKind;
  target_kind: PermissionGrantTargetKind;
  target_hash: string;
  target_label: string;
  conditions_json: string | null;
  source: PermissionGrantSource;
  reason: string;
}

export function mapPermissionAuditRow(row: PermissionAuditRow): PermissionAuditEntry {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    threadId: row.thread_id,
    createdAt: row.created_at,
    permissionMode: row.permission_mode,
    toolName: row.tool_name,
    risk: row.risk,
    decision: row.decision,
    detail: row.detail ?? undefined,
    reason: row.reason,
    decisionSource: (row.decision_source as PermissionAuditDecisionSource | null) ?? undefined,
    grantId: row.grant_id ?? undefined,
  };
}

export function mapPermissionGrantRow(row: AmbientPermissionGrantRow): AmbientPermissionGrant {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    createdBy: row.created_by,
    permissionModeAtCreation: row.permission_mode_at_creation,
    scopeKind: row.scope_kind,
    threadId: row.thread_id ?? undefined,
    workflowThreadId: row.workflow_thread_id ?? undefined,
    projectPath: row.project_path ?? undefined,
    workspacePath: row.workspace_path ?? undefined,
    actionKind: row.action_kind,
    targetKind: row.target_kind,
    targetHash: row.target_hash,
    targetLabel: row.target_label,
    conditions: row.conditions_json ? parseJsonObject<Record<string, unknown>>(row.conditions_json, {}) : undefined,
    source: row.source,
    reason: row.reason,
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
