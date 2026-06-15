import { describe, expect, it, vi } from "vitest";

import { resolveAgentRuntimeToolCallPermission, subagentUnsafeRequiredBarrierToolBlock } from "./agentRuntimeToolCallPermission";

describe("resolveAgentRuntimeToolCallPermission", () => {
  it("checks child browser authority before allowing full-access browser tools", async () => {
    const audits: unknown[] = [];
    const messages: unknown[] = [];
    const emits: unknown[] = [];
    const requestPermission = vi.fn();
    const store = {
      getThread: () => ({
        id: "child-thread",
        kind: "subagent_child",
        subagentRunId: "child-run",
        permissionMode: "full-access",
        workspacePath: "/workspace/child",
      }),
      listMessages: () => [],
      getProjectArtifactWorkspacePath: () => "/workspace",
      getProjectBoardDependencyWorkspacePathsForExecutionThread: () => [],
      listSubagentToolScopeSnapshots: (runId: string) => runId === "child-run"
        ? [{
          runId: "child-run",
          sequence: 1,
          createdAt: "2026-06-13T00:00:00.000Z",
          resolverInputs: {
            childAuthorityProfile: {
              childRunId: "child-run",
              childThreadId: "child-thread",
              approvalRouting: { mode: "interactive" },
              resourceScopes: {
                browser: {
                  networkDecision: "deny",
                  domains: [],
                },
              },
            },
          },
          scope: {
            schemaVersion: "ambient-subagent-tool-scope-v1",
            loadedCategories: ["browser.read"],
            piVisibleCategories: ["browser.read"],
            deniedCategories: [],
            loadedTools: [],
            piVisibleTools: [],
            deniedTools: [],
            approvalMode: "interactive",
            worktreeIsolated: false,
            fanoutAvailable: false,
          },
        }]
        : [],
      addPermissionAudit: (entry: unknown) => {
        audits.push(entry);
        return { id: "audit-1", createdAt: "2026-06-13T00:00:00.000Z", ...(entry as Record<string, unknown>) };
      },
      addMessage: (message: unknown) => {
        messages.push(message);
        return { id: "message-1", ...(message as Record<string, unknown>) };
      },
    };

    const blocked = await resolveAgentRuntimeToolCallPermission(
      "child-thread",
      { path: "/workspace/child", name: "workspace", statePath: "/state", sessionPath: "/sessions" },
      "browser_search",
      { query: "ambient" },
      {
        store: store as any,
        installRouteGateBlockForTool: () => undefined,
        mcpInstallShellBlockForTool: () => undefined,
        permissionToolInput: async (_toolName, toolInput) => toolInput,
        requestPermission,
        beginPermissionWait: () => undefined,
        activeRunId: () => "child-active-run",
        recordTransientFileAuthorityForAllowedTool: vi.fn(),
        recordTransientFileAuthorityFromPermissionRequest: vi.fn(),
        emit: (event) => {
          emits.push(event);
        },
      },
    );

    expect(blocked).toEqual({ reason: "Denied by child browser authority profile." });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(audits).toEqual([
      expect.objectContaining({
        runId: "child-active-run",
        threadId: "child-thread",
        permissionMode: "full-access",
        toolName: "browser_search",
        risk: "browser-network",
        decision: "denied",
        reason: "Denied by child browser authority profile.",
      }),
    ]);
    expect(messages).toEqual([
      expect.objectContaining({
        threadId: "child-thread",
        role: "tool",
        metadata: expect.objectContaining({
          status: "error",
          runtime: "permission-policy",
          toolName: "browser_search",
          risk: "browser-network",
        }),
      }),
    ]);
    expect(emits).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "permission-audit-created" }),
      expect.objectContaining({ type: "message-created" }),
    ]));
  });

  it("blocks ordinary parent tools after a required child barrier becomes unsafe", async () => {
    const audits: unknown[] = [];
    const messages: unknown[] = [];
    const emits: unknown[] = [];
    const permissionToolInput = vi.fn();
    const store = subagentBarrierStore({
      childStatus: "failed",
      barrierStatus: "waiting_on_children",
    });

    const blocked = await resolveAgentRuntimeToolCallPermission(
      "parent-thread",
      { path: "/workspace", name: "workspace", statePath: "/state", sessionPath: "/sessions" },
      "write_file",
      { path: "/workspace/essay-v6.md", content: "unsafe parent edit" },
      {
        store: {
          ...store,
          getThread: () => ({
            id: "parent-thread",
            kind: "chat",
            permissionMode: "workspace",
            collaborationMode: "agent",
          }),
          listMessages: () => [],
          getProjectArtifactWorkspacePath: () => "/workspace",
          getProjectBoardDependencyWorkspacePathsForExecutionThread: () => [],
          listSubagentToolScopeSnapshots: () => [],
          addPermissionAudit: (entry: unknown) => {
            audits.push(entry);
            return { id: "audit-1", createdAt: "2026-06-13T00:00:00.000Z", ...(entry as Record<string, unknown>) };
          },
          addMessage: (message: unknown) => {
            messages.push(message);
            return { id: "message-1", ...(message as Record<string, unknown>) };
          },
        } as any,
        installRouteGateBlockForTool: () => undefined,
        mcpInstallShellBlockForTool: () => undefined,
        permissionToolInput,
        requestPermission: vi.fn(),
        beginPermissionWait: () => undefined,
        activeRunId: () => "parent-run",
        recordTransientFileAuthorityForAllowedTool: vi.fn(),
        recordTransientFileAuthorityFromPermissionRequest: vi.fn(),
        emit: (event) => {
          emits.push(event);
        },
      },
    );

    expect(blocked?.reason).toContain("blocked by required sub-agent wait barrier barrier-unsafe");
    expect(permissionToolInput).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
    expect(messages).toEqual([
      expect.objectContaining({
        role: "tool",
        content: expect.stringContaining("Parent tool call blocked by required sub-agent work that is not safe for synthesis."),
        metadata: expect.objectContaining({
          runtime: "ambient-subagent-barrier-policy",
          toolName: "write_file",
          waitBarrierId: "barrier-unsafe",
          childRunIds: ["child-failed"],
        }),
      }),
    ]);
    expect(emits).toEqual([expect.objectContaining({ type: "message-created" })]);
  });

  it("allows barrier-management actions while blocking replacement spawns for unsafe required barriers", () => {
    const store = subagentBarrierStore({
      childStatus: "failed",
      barrierStatus: "waiting_on_children",
    });

    expect(subagentUnsafeRequiredBarrierToolBlock({
      store,
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "resolve_barrier", waitBarrierId: "barrier-unsafe", decision: "retry_child" },
    })).toBeUndefined();

    const blockedSpawn = subagentUnsafeRequiredBarrierToolBlock({
      store,
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blockedSpawn?.message).toContain("Blocked tool: ambient_subagent action=spawn_agent");
    expect(blockedSpawn?.message).toContain("Allowed next actions: use ambient_subagent with one of");
  });

  it("does not block ordinary tools while required children are still only running", () => {
    expect(subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "running",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "write_file",
      rawToolInput: { path: "/workspace/draft.md", content: "parallel parent note" },
    })).toBeUndefined();
  });
});

function subagentBarrierStore(input: {
  childStatus: string;
  barrierStatus: string;
  resultArtifact?: unknown;
}) {
  const childRun = {
    id: "child-failed",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/2:reviewer",
    roleId: "reviewer",
    status: input.childStatus,
    resultArtifact: input.resultArtifact === undefined && input.childStatus === "failed"
      ? {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-failed",
        status: "failed",
        partial: false,
        summary: "failed child output must not become parent evidence",
        childThreadId: "child-thread",
      }
      : input.resultArtifact,
  };
  const barrier = {
    id: "barrier-unsafe",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-failed"],
    dependencyMode: "required_all",
    status: input.barrierStatus,
    failurePolicy: "ask_user",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  return {
    listSubagentWaitBarriersForParentRun: (parentRunId: string) => parentRunId === "parent-run" ? [barrier] : [],
    getSubagentRun: (runId: string) => {
      if (runId !== "child-failed") throw new Error(`Unknown run ${runId}`);
      return childRun;
    },
    listSubagentRunEvents: () => [],
  } as any;
}
