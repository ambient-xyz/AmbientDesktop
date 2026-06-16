import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
} from "../../shared/types";
import type { PermissionAuditInput } from "../projectStoreFacadeHelpers";
import {
  mapPermissionAuditRow,
  mapPermissionGrantRow,
  type AmbientPermissionGrantRow,
  type PermissionAuditRow,
} from "./permissionMappers";

export class ProjectStorePermissionRepository {
  constructor(private readonly db: Database.Database) {}

  addPermissionAudit(input: PermissionAuditInput): PermissionAuditEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO permission_audit
        (id, run_id, thread_id, created_at, permission_mode, tool_name, risk, decision, detail, reason, decision_source, grant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId ?? null,
        input.threadId,
        now,
        input.permissionMode,
        input.toolName,
        input.risk,
        input.decision,
        input.detail ?? null,
        input.reason,
        input.decisionSource ?? null,
        input.grantId ?? null,
      );
    return this.getPermissionAudit(id);
  }

  listPermissionAudit(limit = 50): PermissionAuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM permission_audit ORDER BY created_at DESC LIMIT ?")
      .all(limit) as PermissionAuditRow[];
    return rows.map(mapPermissionAuditRow);
  }

  createPermissionGrant(input: CreateAmbientPermissionGrantInput): AmbientPermissionGrant {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO permission_grants
        (id, created_at, updated_at, expires_at, revoked_at, created_by, permission_mode_at_creation, scope_kind, thread_id, workflow_thread_id, project_path, workspace_path, action_kind, target_kind, target_hash, target_label, conditions_json, source, reason)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        now,
        now,
        input.expiresAt ?? null,
        input.createdBy ?? "user",
        input.permissionModeAtCreation,
        input.scopeKind,
        input.threadId ?? null,
        input.workflowThreadId ?? null,
        input.projectPath ?? null,
        input.workspacePath ?? null,
        input.actionKind,
        input.targetKind,
        input.targetHash,
        input.targetLabel,
        input.conditions ? JSON.stringify(input.conditions) : null,
        input.source ?? "permission_prompt",
        input.reason,
      );
    return this.getPermissionGrant(id);
  }

  getPermissionGrant(id: string): AmbientPermissionGrant {
    const row = this.db.prepare("SELECT * FROM permission_grants WHERE id = ?").get(id) as
      | AmbientPermissionGrantRow
      | undefined;
    if (!row) throw new Error(`Permission grant not found: ${id}`);
    return mapPermissionGrantRow(row);
  }

  listPermissionGrants(input: { includeRevoked?: boolean } = {}): AmbientPermissionGrant[] {
    const rows = this.db
      .prepare(
        input.includeRevoked
          ? "SELECT * FROM permission_grants ORDER BY updated_at DESC, created_at DESC"
          : "SELECT * FROM permission_grants WHERE revoked_at IS NULL ORDER BY updated_at DESC, created_at DESC",
      )
      .all() as AmbientPermissionGrantRow[];
    return rows.map(mapPermissionGrantRow);
  }

  revokePermissionGrant(id: string): AmbientPermissionGrant {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE permission_grants SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE id = ?")
      .run(now, now, id);
    return this.getPermissionGrant(id);
  }

  private getPermissionAudit(id: string): PermissionAuditEntry {
    const row = this.db.prepare("SELECT * FROM permission_audit WHERE id = ?").get(id) as
      | PermissionAuditRow
      | undefined;
    if (!row) throw new Error(`Permission audit not found: ${id}`);
    return mapPermissionAuditRow(row);
  }
}
