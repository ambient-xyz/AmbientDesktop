import { describe, expect, it } from "vitest";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/types";
import { googleWorkspaceGrantReview, isGoogleWorkspaceGrant } from "./googleWorkspaceGrantUiModel";

describe("googleWorkspaceGrantUiModel", () => {
  it("groups Google Workspace grants by account and summarizes visible audit usage", () => {
    const grants: AmbientPermissionGrant[] = [
      grant({
        id: "grant-calendar",
        targetLabel: "Google Workspace calendar.events.list (travis@example.test)",
        conditions: {
          provider: "google.workspace.cli",
          accountHint: "travis@example.test",
          methodId: "calendar.events.list",
          sideEffect: "personal_content_read",
        },
        scopeKind: "thread",
        threadId: "thread-1",
      }),
      grant({
        id: "grant-drive",
        targetLabel: "Google Workspace drive.files.export (travis@example.test)",
        conditions: {
          provider: "google.workspace.cli",
          accountHint: "travis@example.test",
          methodId: "drive.files.export",
          sideEffect: "personal_content_read",
        },
        scopeKind: "project",
        projectPath: "/tmp/project",
      }),
      grant({
        id: "grant-gmail",
        targetLabel: "Google Workspace gmail.users.labels.list (other@example.test)",
        conditions: {
          provider: "google.workspace.cli",
          accountHint: "other@example.test",
          methodId: "gmail.users.labels.list",
          sideEffect: "metadata_read",
        },
        scopeKind: "workspace",
        workspacePath: "/tmp/workspace",
      }),
      grant({
        id: "grant-shell",
        targetLabel: "bash curl",
        conditions: undefined,
        actionKind: "shell_command",
        targetKind: "shell_command_prefix",
      }),
    ];
    const audit: PermissionAuditEntry[] = [
      auditEntry({ id: "audit-1", grantId: "grant-calendar", createdAt: "2026-05-05T10:00:00.000Z" }),
      auditEntry({ id: "audit-2", grantId: "grant-calendar", createdAt: "2026-05-05T10:05:00.000Z" }),
      auditEntry({ id: "audit-3", grantId: "grant-gmail", createdAt: "2026-05-05T09:00:00.000Z" }),
    ];

    const model = googleWorkspaceGrantReview(grants, audit);

    expect(model.grants.map((row) => row.id)).toEqual(["grant-calendar", "grant-gmail", "grant-drive"]);
    expect(model.totalAuditCount).toBe(3);
    expect(model.groups).toEqual([
      expect.objectContaining({
        accountHint: "other@example.test",
        services: ["gmail"],
        auditCount: 1,
        lastUsedAt: "2026-05-05T09:00:00.000Z",
      }),
      expect.objectContaining({
        accountHint: "travis@example.test",
        services: ["calendar", "drive"],
        auditCount: 2,
        lastUsedAt: "2026-05-05T10:05:00.000Z",
      }),
    ]);
    expect(model.groups[1]?.grants[0]).toMatchObject({
      methodId: "calendar.events.list",
      service: "calendar",
      sideEffect: "Personal Content Read",
      scopeLabel: "Thread",
      provenanceLabel: "Thread thread-1",
      auditCount: 2,
      lastUsedAt: "2026-05-05T10:05:00.000Z",
    });
  });

  it("recognizes legacy Google target labels even without conditions", () => {
    const legacyGrant = grant({
      id: "grant-legacy",
      targetLabel: "Google Workspace drive.files.list (default)",
      conditions: undefined,
    });

    expect(isGoogleWorkspaceGrant(legacyGrant)).toBe(true);
    expect(googleWorkspaceGrantReview([legacyGrant], []).groups[0]).toMatchObject({
      accountHint: "default",
      services: ["drive"],
    });
  });
});

function grant(overrides: Partial<AmbientPermissionGrant>): AmbientPermissionGrant {
  return {
    id: "grant",
    createdAt: "2026-05-05T08:00:00.000Z",
    updatedAt: "2026-05-05T08:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-default",
    actionKind: "connector_content_read",
    targetKind: "tool",
    targetHash: "hash",
    targetLabel: "Google Workspace calendar.colors.get (default)",
    source: "permission_prompt",
    reason: "Allowed from permission prompt",
    ...overrides,
  };
}

function auditEntry(overrides: Partial<PermissionAuditEntry>): PermissionAuditEntry {
  return {
    id: "audit",
    threadId: "thread-1",
    createdAt: "2026-05-05T08:00:00.000Z",
    permissionMode: "workspace",
    toolName: "google_workspace_call",
    risk: "plugin-tool",
    decision: "allowed",
    reason: "persistent grant",
    decisionSource: "persistent_grant",
    ...overrides,
  };
}
