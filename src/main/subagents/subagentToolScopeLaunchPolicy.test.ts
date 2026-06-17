import { describe, expect, it } from "vitest";

import type { SubagentToolScopeResolution } from "../../shared/subagentToolScope";
import type { ThreadWorktreeSummary } from "../../shared/types";
import {
  resolveSubagentChildAuthorityProfile,
  resolveSubagentLaunchWorkspaceToolPolicy,
  resolveSubagentToolScopeLaunchDenial,
  SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES,
  SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
  subagentToolScopeRequestIsExplicit,
} from "./subagentToolScopeLaunchPolicy";

describe("subagentToolScopeLaunchPolicy", () => {
  it("builds the launch workspace policy snapshot from parent mode and child worktree state", () => {
    const inactiveWorktree = worktree("missing");
    const activeWorktree = worktree("active");

    expect(SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION).toBe("ambient-subagent-tool-scope-launch-policy-v1");
    expect(SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES).toEqual(["secrets.read", "workflow.call", "subagent.spawn"]);
    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      childWorktree: inactiveWorktree,
      expectedChildThreadId: "child-thread",
    })).toEqual({
      schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
      hardDeniedCategories: ["secrets.read", "workflow.call", "subagent.spawn"],
      approvalMode: "interactive",
      worktreeIsolated: false,
      allowNestedFanout: false,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: false,
        nestedFanoutLimit: 0,
        remainingFanout: 0,
        allowedToolNames: [],
        reason: "Callable workflow child bridge is disabled by child role policy.",
      },
      parentPermissionMode: "workspace",
      worktreeIsolationStatus: "inactive",
      worktreeIsolationReason: "Child worktree status is missing.",
      expectedChildThreadId: "child-thread",
      worktreeThreadId: "child-thread",
    });
    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "full-access", workspacePath: "/repo" },
      requestedApprovalMode: "non_interactive",
      childWorktree: activeWorktree,
      expectedChildThreadId: "child-thread",
    })).toMatchObject({
      approvalMode: "non_interactive",
      worktreeIsolated: true,
      parentPermissionMode: "full-access",
      worktreeIsolationStatus: "isolated",
      worktreeIsolationReason: "Active child worktree belongs to the expected child thread and is separate from the parent workspace.",
    });
  });

  it("enables callable workflow bridge only with isolated worktree and remaining fanout budget", () => {
    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      childWorktree: worktree("active"),
      expectedChildThreadId: "child-thread",
      childWorkflowPolicy: {
        allowCallableWorkflowTools: true,
        allowedToolNames: [
          "ambient_workflow_symphony_map_reduce",
          "not a valid workflow name",
          "ambient_workflow_symphony_map_reduce",
        ],
        nestedFanoutLimit: 3,
        usedFanoutCount: 1,
      },
    })).toMatchObject({
      hardDeniedCategories: ["secrets.read", "subagent.spawn"],
      allowNestedFanout: true,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: true,
        nestedFanoutLimit: 3,
        remainingFanout: 2,
        allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
        reason: "Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
      },
    });

    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      childWorktree: worktree("missing"),
      expectedChildThreadId: "child-thread",
      childWorkflowPolicy: {
        allowCallableWorkflowTools: true,
        allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
        nestedFanoutLimit: 3,
        usedFanoutCount: 1,
      },
    })).toMatchObject({
      hardDeniedCategories: ["secrets.read", "workflow.call", "subagent.spawn"],
      allowNestedFanout: false,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: false,
        remainingFanout: 2,
        reason: "Callable workflow child bridge requires an active isolated child worktree.",
      },
    });

    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      childWorktree: worktree("active"),
      expectedChildThreadId: "child-thread",
      childWorkflowPolicy: {
        allowCallableWorkflowTools: true,
        allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
        nestedFanoutLimit: 1,
        usedFanoutCount: 1,
      },
    })).toMatchObject({
      hardDeniedCategories: ["secrets.read", "workflow.call", "subagent.spawn"],
      allowNestedFanout: false,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: false,
        nestedFanoutLimit: 1,
        remainingFanout: 0,
        reason: "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.",
      },
    });
  });

  it("does not treat active worktrees as isolated when they target the wrong thread or parent workspace", () => {
    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      childWorktree: worktree("active", { threadId: "other-child" }),
      expectedChildThreadId: "child-thread",
    })).toMatchObject({
      worktreeIsolated: false,
      worktreeIsolationStatus: "mismatched_child_thread",
      worktreeIsolationReason: "Active worktree belongs to thread other-child, not expected child thread child-thread.",
      expectedChildThreadId: "child-thread",
      worktreeThreadId: "other-child",
    });

    expect(resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo/" },
      childWorktree: worktree("active", { worktreePath: "/repo" }),
      expectedChildThreadId: "child-thread",
    })).toMatchObject({
      worktreeIsolated: false,
      worktreeIsolationStatus: "parent_workspace",
      worktreeIsolationReason: "Active child worktree path matches the parent workspace path.",
    });
  });

  it("blocks Phase 4 mutation and nested fanout hard-denials before child launch", () => {
    const mutationDenial = resolveSubagentToolScopeLaunchDenial({
      scope: scope({
        deniedCategories: [
          { id: "workspace.write", reason: "Mutating child requires an approved isolated worktree." },
        ],
      }),
      requestedToolScope: {},
    });
    expect(mutationDenial).toEqual({
      schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
      kind: "phase4_isolation_required",
      reason: "Sub-agent role/tool scope is not launchable in Phase 4 without additional isolation: workspace.write (Mutating child requires an approved isolated worktree.)",
      explicitToolRequest: false,
      deniedCategoryIds: ["workspace.write"],
      deniedToolIds: [],
    });

    const fanoutDenial = resolveSubagentToolScopeLaunchDenial({
      scope: scope({
        deniedCategories: [
          { id: "subagent.spawn", reason: "Nested sub-agent fanout is disabled for this role or workspace." },
        ],
        deniedTools: [
          {
            source: "fanout",
            id: "subagent.spawn",
            categoryId: "subagent.spawn",
            reason: "Nested sub-agent fanout is disabled for this role or workspace.",
          },
        ],
      }),
      requestedToolScope: { requestedFanout: true },
    });
    expect(fanoutDenial).toMatchObject({
      kind: "phase4_isolation_required",
      explicitToolRequest: true,
      deniedCategoryIds: ["subagent.spawn"],
      deniedToolIds: ["fanout:subagent.spawn"],
    });

    const workflowDenial = resolveSubagentToolScopeLaunchDenial({
      scope: scope({
        deniedCategories: [
          { id: "workflow.call", reason: "Callable workflow child bridge is unavailable." },
        ],
        deniedTools: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            reason: "Callable workflow child bridge is unavailable.",
          },
        ],
      }),
      requestedToolScope: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
    });
    expect(workflowDenial).toMatchObject({
      kind: "phase4_isolation_required",
      explicitToolRequest: true,
      deniedCategoryIds: ["workflow.call"],
      deniedToolIds: ["callable_workflow:ambient_workflow_symphony_map_reduce"],
    });
  });

  it("only turns non-hard denials into launch failures when the task explicitly requested tool scope", () => {
    const deniedConnectorScope = scope({
      deniedCategories: [
        { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
      ],
      deniedTools: [
        {
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
        },
      ],
    });

    expect(resolveSubagentToolScopeLaunchDenial({
      scope: deniedConnectorScope,
      requestedToolScope: {},
    })).toBeUndefined();

    expect(resolveSubagentToolScopeLaunchDenial({
      scope: deniedConnectorScope,
      requestedToolScope: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: true },
        ],
      },
    })).toMatchObject({
      kind: "requested_scope_denied",
      explicitToolRequest: true,
      deniedCategoryIds: ["connector.read"],
      deniedToolIds: ["connector_app:gmail.search"],
      reason: "Requested sub-agent tool scope was denied: connector.read: Capability requires interactive approval, but this launch is non-interactive.; connector_app:gmail.search: Capability requires interactive approval, but this launch is non-interactive.",
    });
  });

  it("materializes child authority profile from parent envelope, task intent, and resolved scope", () => {
    const workspacePolicy = resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "full-access", workspacePath: "/repo" },
      childWorktree: worktree("missing"),
      expectedChildThreadId: "child-thread",
    });
    const profile = resolveSubagentChildAuthorityProfile({
      parentThread: { id: "parent-thread", permissionMode: "full-access", workspacePath: "/repo" },
      childRun: { id: "child-run", childThreadId: "child-thread", canonicalTaskPath: "root/0:explorer" },
      roleId: "explorer",
      requestedToolScope: {
        childAuthority: {
          taskIntent: "file_read",
          rationale: "Read exact files only.",
          readRoots: ["/repo/a.pdf"],
          writeRoots: ["/repo/Downloads"],
          mutation: "deny",
          network: "deny",
          nestedFanout: "deny",
        },
      },
      scope: scope({
        loadedCategories: ["workspace.read", "artifact.read", "long-context.read"],
        piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read"],
        deniedCategories: [{ id: "browser.read", reason: "Denied by child task intent file_read." }],
      }),
      workspacePolicy,
    });

    expect(profile).toMatchObject({
      schemaVersion: "ambient-subagent-child-authority-profile-v1",
      childRunId: "child-run",
      childThreadId: "child-thread",
      taskIntent: "file_read",
      rationale: "Read exact files only.",
      outerEnvelope: {
        parentThreadId: "parent-thread",
        parentPermissionMode: "full-access",
        parentWorkspacePath: "/repo",
      },
      resourceScopes: {
        filesystem: {
          readRoots: ["/repo/a.pdf"],
          writeRoots: [],
          deniedWriteRoots: ["/repo/Downloads"],
          writeDecision: "deny",
        },
        browser: {
          networkDecision: "deny",
        },
        nestedFanout: {
          decision: "deny",
        },
      },
      approvalRouting: {
        route: "parent",
        childThreadId: "child-thread",
      },
      hardDenies: ["secrets.read", "workflow.call", "subagent.spawn"],
    });
  });

  it("anchors relative child authority roots to the parent workspace or isolated worktree", () => {
    const workspacePolicy = resolveSubagentLaunchWorkspaceToolPolicy({
      parentThread: { permissionMode: "workspace", workspacePath: "/repo" },
      requestedApprovalMode: "non_interactive",
      childWorktree: worktree("active"),
      expectedChildThreadId: "child-thread",
    });
    const profile = resolveSubagentChildAuthorityProfile({
      parentThread: { id: "parent-thread", permissionMode: "workspace", workspacePath: "/repo" },
      childRun: { id: "child-run", childThreadId: "child-thread", canonicalTaskPath: "root/0:worker" },
      roleId: "worker",
      requestedToolScope: {
        childAuthority: {
          taskIntent: "mutation",
          rationale: "Read the generated file and write only inside the child worktree.",
          readRoots: ["habit-tracker.html"],
          writeRoots: ["."],
          mutation: "allow_isolated_worktree",
          network: "deny",
          nestedFanout: "deny",
        },
      },
      scope: scope({
        loadedCategories: ["workspace.read", "workspace.write"],
        piVisibleCategories: ["workspace.read", "workspace.write"],
        worktreeIsolated: true,
        approvalMode: "non_interactive",
      }),
      workspacePolicy,
    });

    expect(profile.resourceScopes.filesystem).toMatchObject({
      readRoots: ["/repo/habit-tracker.html"],
      writeRoots: ["/repo/.ambient-codex/worktrees/child-thread"],
      deniedWriteRoots: [],
      readDecision: "allow",
      writeDecision: "allow_isolated_worktree",
    });
  });

  it("treats category, source, and fanout requests as explicit tool-scope requests", () => {
    expect(subagentToolScopeRequestIsExplicit({})).toBe(false);
    expect(subagentToolScopeRequestIsExplicit({ requestedCategories: ["workspace.read"] })).toBe(true);
    expect(subagentToolScopeRequestIsExplicit({
      requestedSources: [{ source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" }],
    })).toBe(true);
    expect(subagentToolScopeRequestIsExplicit({ requestedFanout: true })).toBe(true);
  });
});

function worktree(
  status: ThreadWorktreeSummary["status"],
  overrides: Partial<ThreadWorktreeSummary> = {},
): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
    branchName: "ambient/child",
    baseRef: "abc123",
    status,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function scope(overrides: Partial<SubagentToolScopeResolution> = {}): SubagentToolScopeResolution {
  return {
    schemaVersion: "ambient-subagent-tool-scope-v1",
    loadedCategories: ["workspace.read"],
    piVisibleCategories: ["workspace.read"],
    deniedCategories: [],
    loadedTools: [],
    piVisibleTools: [],
    deniedTools: [],
    approvalMode: "interactive",
    worktreeIsolated: false,
    fanoutAvailable: false,
    ...overrides,
  };
}
