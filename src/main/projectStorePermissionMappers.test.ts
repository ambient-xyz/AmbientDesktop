import { describe, expect, it } from "vitest";
import {
  mapPermissionGrantRow,
  mapPermissionAuditRow,
  type AmbientPermissionGrantRow,
  type PermissionAuditRow,
} from "./projectStorePermissionMappers";

describe("project store permission mappers", () => {
  it("maps permission audit rows without store state", () => {
    const row: PermissionAuditRow = {
      id: "audit-1",
      run_id: null,
      thread_id: "thread-1",
      created_at: "2026-06-06T19:00:00.000Z",
      permission_mode: "workspace",
      tool_name: "shell",
      risk: "workspace-command",
      decision: "allowed",
      detail: null,
      reason: "Allowed by workspace policy.",
      decision_source: "grant",
      grant_id: "grant-1",
    };

    expect(mapPermissionAuditRow(row)).toEqual({
      id: "audit-1",
      runId: undefined,
      threadId: "thread-1",
      createdAt: "2026-06-06T19:00:00.000Z",
      permissionMode: "workspace",
      toolName: "shell",
      risk: "workspace-command",
      decision: "allowed",
      detail: undefined,
      reason: "Allowed by workspace policy.",
      decisionSource: "grant",
      grantId: "grant-1",
    });
  });

  it("maps permission grant rows without store state", () => {
    const row: AmbientPermissionGrantRow = {
      id: "grant-1",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      expires_at: null,
      revoked_at: null,
      created_by: "user",
      permission_mode_at_creation: "workspace",
      scope_kind: "thread",
      thread_id: "thread-1",
      workflow_thread_id: null,
      project_path: "/workspace/project",
      workspace_path: "/workspace",
      action_kind: "shell_command",
      target_kind: "shell_command_prefix",
      target_hash: "sha256:abc",
      target_label: "pnpm",
      conditions_json: "{\"prefix\":\"pnpm\"}",
      source: "permission_prompt",
      reason: "Approved for this thread.",
    };

    expect(mapPermissionGrantRow(row)).toEqual({
      id: "grant-1",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      expiresAt: undefined,
      revokedAt: undefined,
      createdBy: "user",
      permissionModeAtCreation: "workspace",
      scopeKind: "thread",
      threadId: "thread-1",
      workflowThreadId: undefined,
      projectPath: "/workspace/project",
      workspacePath: "/workspace",
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetHash: "sha256:abc",
      targetLabel: "pnpm",
      conditions: { prefix: "pnpm" },
      source: "permission_prompt",
      reason: "Approved for this thread.",
    });
  });

  it("keeps invalid permission grant conditions as an empty object", () => {
    expect(mapPermissionGrantRow({ ...basePermissionGrantRow(), conditions_json: "not json" }).conditions).toEqual({});
    expect(mapPermissionGrantRow({ ...basePermissionGrantRow(), conditions_json: "[]" }).conditions).toEqual({});
    expect(mapPermissionGrantRow({ ...basePermissionGrantRow(), conditions_json: null }).conditions).toBeUndefined();
  });
});

function basePermissionGrantRow(): AmbientPermissionGrantRow {
  return {
    id: "grant-1",
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
    expires_at: null,
    revoked_at: null,
    created_by: "user",
    permission_mode_at_creation: "workspace",
    scope_kind: "thread",
    thread_id: "thread-1",
    workflow_thread_id: null,
    project_path: null,
    workspace_path: null,
    action_kind: "shell_command",
    target_kind: "shell_command_prefix",
    target_hash: "sha256:abc",
    target_label: "pnpm",
    conditions_json: "{\"prefix\":\"pnpm\"}",
    source: "permission_prompt",
    reason: "Approved for this thread.",
  };
}
