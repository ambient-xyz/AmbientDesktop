import { describe, expect, it } from "vitest";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import { permissionGrantRegistryModel, permissionGrantRevocationImpact, workflowPermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";

describe("permissionGrantRegistryUiModel", () => {
  it("groups active grants by persistent scope and summarizes risk, expiry, and audit reuse", () => {
    const grants = [
      grant({
        id: "workflow-gmail",
        scopeKind: "workflow_thread",
        workflowThreadId: "workflow-1",
        actionKind: "connector_content_read",
        targetKind: "connector",
        targetLabel: "Google Workspace gmail.users.messages.get (neo@example.test)",
        conditions: { provider: "google.workspace.cli", accountHint: "neo@example.test", methodId: "gmail.users.messages.get" },
        expiresAt: "2026-05-10T00:00:00.000Z",
      }),
      grant({
        id: "thread-shell",
        scopeKind: "thread",
        threadId: "thread-1",
        actionKind: "shell_command",
        targetKind: "shell_command_prefix",
        targetLabel: "git status",
      }),
      grant({
        id: "project-files",
        scopeKind: "project",
        projectPath: "/tmp/project",
        actionKind: "file_metadata_read",
        targetKind: "path_glob",
        targetLabel: "/tmp/project/**/*.md",
      }),
      grant({
        id: "workspace-browser",
        scopeKind: "workspace",
        workspacePath: "/tmp/workspace",
        actionKind: "browser_profile",
        targetKind: "browser_origin",
        targetLabel: "https://example.test",
        revokedAt: "2026-05-04T00:00:00.000Z",
      }),
    ];
    const audit = [
      auditEntry({ id: "audit-1", grantId: "workflow-gmail", createdAt: "2026-05-05T09:00:00.000Z" }),
      auditEntry({ id: "audit-2", grantId: "thread-shell", createdAt: "2026-05-05T10:00:00.000Z" }),
      auditEntry({ id: "audit-3", grantId: "thread-shell", createdAt: "2026-05-05T10:05:00.000Z" }),
    ];

    const model = permissionGrantRegistryModel({ grants, auditEntries: audit, now: "2026-05-05T00:00:00.000Z" });

    expect(model).toMatchObject({
      activeCount: 3,
      revokedCount: 1,
      expiringCount: 1,
      highRiskCount: 1,
      totalAuditCount: 3,
      fullAccessReceiptCount: 0,
      summary: "3 active grants across 4 scopes. 3 visible reuse events.",
    });
    expect(model.groups.map((group) => group.id)).toEqual(["workflow_thread", "thread", "project", "workspace"]);
    expect(model.groups.find((group) => group.id === "workflow_thread")).toMatchObject({
      scopeLabel: "Workflow",
      activeCount: 1,
      auditCount: 1,
      highestRisk: "medium",
      revokeIds: ["workflow-gmail"],
    });
    expect(model.groups.find((group) => group.id === "thread")).toMatchObject({
      scopeLabel: "Thread",
      highestRisk: "high",
      tone: "review",
      revokeIds: ["thread-shell"],
    });
    expect(model.rows.find((row) => row.id === "workflow-gmail")).toMatchObject({
      actionLabel: "Connector Content Read",
      targetKindLabel: "Connector",
      riskLabel: "Review",
      expiryLabel: "Expires 2026-05-10",
      auditCount: 1,
      recentUseLabel: "Last used 2026-05-05",
      provenanceLabel: "Workflow workflow-1",
      active: true,
    });
    expect(model.rows.find((row) => row.id === "workspace-browser")).toMatchObject({
      statusLabel: "Revoked",
      tone: "blocked",
      active: false,
    });
  });

  it("keeps Google Workspace dynamic grants visible in the generic registry", () => {
    const model = permissionGrantRegistryModel({
      grants: [
        grant({
          id: "google-drive",
          scopeKind: "project",
          projectPath: "/tmp/project",
          actionKind: "connector_content_read",
          targetKind: "tool",
          targetLabel: "Google Workspace drive.files.export (neo@example.test)",
          conditions: { provider: "google.workspace.cli", accountHint: "neo@example.test", methodId: "drive.files.export" },
          source: "permission_prompt",
        }),
      ],
      auditEntries: [],
      now: "2026-05-05T00:00:00.000Z",
    });

    expect(model.rows[0]).toMatchObject({
      id: "google-drive",
      scopeLabel: "Project",
      targetLabel: "Google Workspace drive.files.export (neo@example.test)",
      risk: "medium",
      sourceLabel: "Permission Prompt",
      impactLabel: expect.stringContaining("connector content read access"),
    });
  });

  it("filters workflow review grants to workflow, project, workspace, and plugin scopes", () => {
    const model = workflowPermissionGrantRegistryModel({
      grants: [
        grant({ id: "workflow-match", scopeKind: "workflow_thread", workflowThreadId: "workflow-1" }),
        grant({ id: "workflow-other", scopeKind: "workflow_thread", workflowThreadId: "workflow-2" }),
        grant({ id: "project-match", scopeKind: "project", projectPath: "/tmp/project" }),
        grant({ id: "project-other", scopeKind: "project", projectPath: "/tmp/other" }),
        grant({ id: "workspace-match", scopeKind: "workspace", workspacePath: "/tmp/workspace" }),
        grant({ id: "thread-skip", scopeKind: "thread", threadId: "chat-thread" }),
        grant({ id: "plugin-match", scopeKind: "global_plugin", targetLabel: "trusted plugin" }),
      ],
      auditEntries: [auditEntry({ id: "audit-workflow", grantId: "workflow-match" })],
      workflowThreadId: "workflow-1",
      projectPath: "/tmp/project",
      workspacePath: "/tmp/workspace",
      now: "2026-05-05T00:00:00.000Z",
    });

    expect(model.rows.map((row) => row.id).sort()).toEqual(["plugin-match", "project-match", "workflow-match", "workspace-match"]);
    expect(model.rows.find((row) => row.id === "workflow-match")).toMatchObject({ auditCount: 1, provenanceLabel: "Workflow workflow-1" });
  });

  it("shows Full Access receipts without requiring a persistent grant", () => {
    const model = permissionGrantRegistryModel({
      grants: [],
      auditEntries: [
        auditEntry({
          id: "full-access-older",
          createdAt: "2026-05-05T08:00:00.000Z",
          permissionMode: "full-access",
          decisionSource: "allowed_by_full_access",
          toolName: "google_workspace_call",
          risk: "plugin-tool",
          reason: "Allowed automatically by Full Access mode.",
          detail: "Method: gmail.users.messages.get\nAccount: neo@example.test",
        }),
        auditEntry({
          id: "full-access-newer",
          createdAt: "2026-05-05T09:00:00.000Z",
          permissionMode: "full-access",
          decisionSource: "allowed_by_full_access",
          toolName: "bash",
          risk: "workspace-command",
          reason: "Allowed automatically by Full Access mode.",
        }),
      ],
      now: "2026-05-05T00:00:00.000Z",
    });

    expect(model).toMatchObject({
      activeCount: 0,
      fullAccessReceiptCount: 2,
      summary: "2 Full Access audit receipts and no persistent permission grants.",
    });
    expect(model.fullAccessReceipts.map((receipt) => receipt.id)).toEqual(["full-access-newer", "full-access-older"]);
    expect(model.fullAccessReceipts[1]).toMatchObject({
      toolLabel: "google_workspace_call",
      riskLabel: "Plugin Tool",
      detailLabel: "Method: gmail.users.messages.get · Account: neo@example.test",
    });
  });

  it("filters workflow Full Access receipts to the workflow audit thread", () => {
    const model = workflowPermissionGrantRegistryModel({
      grants: [grant({ id: "workflow-match", scopeKind: "workflow_thread", workflowThreadId: "workflow-1" })],
      auditEntries: [
        auditEntry({ id: "audit-grant", grantId: "workflow-match", threadId: "chat-thread" }),
        auditEntry({
          id: "audit-full-access-match",
          threadId: "chat-thread",
          permissionMode: "full-access",
          decisionSource: "allowed_by_full_access",
          reason: "Allowed automatically by Full Access mode.",
        }),
        auditEntry({
          id: "audit-full-access-other",
          threadId: "other-thread",
          permissionMode: "full-access",
          decisionSource: "allowed_by_full_access",
          reason: "Allowed automatically by Full Access mode.",
        }),
      ],
      workflowThreadId: "workflow-1",
      auditThreadId: "chat-thread",
      now: "2026-05-05T00:00:00.000Z",
    });

    expect(model.rows[0]).toMatchObject({ id: "workflow-match", auditCount: 1 });
    expect(model.fullAccessReceipts.map((receipt) => receipt.id)).toEqual(["audit-full-access-match"]);
  });

  it("explains impact before revoking grant groups", () => {
    const impact = permissionGrantRevocationImpact({
      grants: [
        grant({ id: "project-read", scopeKind: "project", projectPath: "/tmp/project", actionKind: "connector_content_read", targetLabel: "Gmail read" }),
        grant({ id: "workspace-shell", scopeKind: "workspace", workspacePath: "/tmp/workspace", actionKind: "shell_command", targetLabel: "git push" }),
        grant({ id: "revoked", revokedAt: "2026-05-05T08:00:00.000Z", targetLabel: "old grant" }),
      ],
      auditEntries: [auditEntry({ id: "audit-1", grantId: "project-read" })],
      grantIds: ["project-read", "workspace-shell", "revoked"],
    });

    expect(impact).toEqual({
      title: "Revoke 2 active grants across Project, Workspace?",
      detail: expect.stringContaining("1 visible reuse event will remain in the audit log."),
    });
    expect(impact?.detail).toContain("1 high-risk grant included.");
    expect(impact?.detail).toContain("Targets: Gmail read; git push.");
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
