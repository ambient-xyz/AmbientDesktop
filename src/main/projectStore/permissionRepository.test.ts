import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorePermissionRepository } from "./permissionRepository";

describe("ProjectStorePermissionRepository", () => {
  let db: Database.Database;
  let repository: ProjectStorePermissionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE permission_audit (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        permission_mode TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        risk TEXT NOT NULL,
        decision TEXT NOT NULL,
        detail TEXT,
        reason TEXT NOT NULL,
        decision_source TEXT,
        grant_id TEXT
      );
      CREATE TABLE permission_grants (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        created_by TEXT NOT NULL,
        permission_mode_at_creation TEXT NOT NULL,
        scope_kind TEXT NOT NULL,
        thread_id TEXT,
        workflow_thread_id TEXT,
        project_path TEXT,
        workspace_path TEXT,
        action_kind TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_hash TEXT NOT NULL,
        target_label TEXT NOT NULL,
        conditions_json TEXT,
        source TEXT NOT NULL,
        reason TEXT NOT NULL
      );
    `);
    repository = new ProjectStorePermissionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists permission grants, revocation, and audit grant references", () => {
    const grant = repository.createPermissionGrant({
      permissionModeAtCreation: "workspace",
      scopeKind: "project",
      projectPath: "/workspace/project",
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "hash-pnpm-test",
      targetLabel: "pnpm test",
      conditions: { cwd: "/workspace/project" },
      source: "permission_prompt",
      reason: "Allowed from permission prompt: Allow command?",
    });

    expect(repository.listPermissionGrants()).toEqual([
      expect.objectContaining({
        id: grant.id,
        scopeKind: "project",
        projectPath: "/workspace/project",
        conditions: { cwd: "/workspace/project" },
      }),
    ]);

    const audit = repository.addPermissionAudit({
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "bash",
      risk: "workspace-command",
      decision: "allowed",
      detail: "pnpm test",
      reason: "Approved by Ambient permission grant policy.",
      decisionSource: "persistent_grant",
      grantId: grant.id,
    });

    expect(repository.listPermissionAudit()).toEqual([
      expect.objectContaining({
        id: audit.id,
        decisionSource: "persistent_grant",
        grantId: grant.id,
      }),
    ]);

    const revoked = repository.revokePermissionGrant(grant.id);
    expect(revoked.revokedAt).toBeTruthy();
    expect(repository.listPermissionGrants()).toEqual([]);
    expect(repository.listPermissionGrants({ includeRevoked: true })[0]).toMatchObject({
      id: grant.id,
      revokedAt: revoked.revokedAt,
    });
  });

  it("reports missing grants", () => {
    expect(() => repository.getPermissionGrant("missing-grant")).toThrow("Permission grant not found: missing-grant");
  });
});
