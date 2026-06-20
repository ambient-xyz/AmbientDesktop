import { describe, expect, it, vi } from "vitest";

import { getDefaultSubagentRoleProfile } from "../../../shared/subagentRoles";
import type { SubagentWaitBarrierSummary } from "../../../shared/subagentTypes";
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
            loadedCategories: ["browser.interactive"],
            piVisibleCategories: ["browser.interactive"],
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
      "browser_content",
      { url: "https://docs.example.test/ambient", profileMode: "isolated" },
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
        toolName: "browser_content",
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
          toolName: "browser_content",
          risk: "browser-network",
        }),
      }),
    ]);
    expect(emits).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "permission-audit-created" }),
      expect.objectContaining({ type: "message-created" }),
    ]));
  });

  it("does not use the subagent replacement-work guard to block ordinary parent tools", () => {
    expect(subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "failed",
        barrierStatus: "waiting_on_children",
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "write_file",
      rawToolInput: { path: "/workspace/essay-v6.md", content: "ordinary parent work" },
    })).toBeUndefined();

    expect(subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "running",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "bash",
      rawToolInput: { command: "pwd" },
    })).toBeUndefined();
  });

  it("blocks replacement subagent work after a required child barrier becomes unsafe", () => {
    const store = subagentBarrierStore({
      childStatus: "failed",
      barrierStatus: "waiting_on_children",
    });

    const blocked = subagentUnsafeRequiredBarrierToolBlock({
      store,
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blocked?.reason).toContain("blocked by required sub-agent wait barrier barrier-unsafe");
    expect(blocked?.message).toContain("Replacement sub-agent work blocked by required sub-agent work that is not safe for synthesis.");
    expect(blocked?.message).toContain("Blocked tool: ambient_subagent action=spawn_agent");
  });

  it("does not block replacement work on nonblocking callable-workflow bridge barriers", () => {
    const blocked = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "failed",
        barrierStatus: "waiting_on_children",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "background-task",
        callableWorkflowTasks: [{ id: "background-task", blocking: false }],
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blocked).toBeUndefined();
  });

  it("still blocks owner-scoped bridge barriers for parent-blocking callable workflows", () => {
    const blocked = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "failed",
        barrierStatus: "waiting_on_children",
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: "blocking-task",
        callableWorkflowTasks: [{ id: "blocking-task", blocking: true }],
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blocked?.reason).toContain("blocked by required sub-agent wait barrier barrier-unsafe");
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

  it("allows additional subagent spawns while all required children are still running", () => {
    const blockedSpawn = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "running",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blockedSpawn).toBeUndefined();

    expect(subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "running",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "wait_agent", waitBarrierId: "barrier-unsafe" },
    })).toBeUndefined();
  });

  it("allows additional subagent spawns while a required barrier still has active potential", () => {
    const blockedSpawn = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "completed",
        barrierStatus: "waiting_on_children",
        resultArtifact: completedResultArtifact("child-failed", "child-thread"),
        additionalRuns: [{
          id: "child-running",
          status: "running",
          resultArtifact: undefined,
        }],
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "additional independent child" },
    });

    expect(blockedSpawn).toBeUndefined();
  });

  it("allows additional subagent spawns when required-any already has a safe child result", () => {
    const blockedSpawn = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "completed",
        barrierStatus: "waiting_on_children",
        dependencyMode: "required_any",
        resultArtifact: completedResultArtifact("child-failed", "child-thread"),
        additionalRuns: [{
          id: "child-needs-attention",
          status: "needs_attention",
          resultArtifact: undefined,
        }],
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "additional independent child" },
    });

    expect(blockedSpawn).toBeUndefined();
  });

  it("blocks replacement spawns while a required child is waiting for attention", () => {
    const blockedSpawn = subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "needs_attention",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "spawn_agent", task: "replacement child" },
    });

    expect(blockedSpawn?.message).toContain("waitBarrierId: barrier-unsafe");
    expect(blockedSpawn?.message).toContain("Child runs: child-failed (needs_attention).");
    expect(blockedSpawn?.message).toContain("resolve the pending child approval/request");
    expect(blockedSpawn?.message).toContain("wait_agent or status_agent on the same child");
    expect(blockedSpawn?.message).toContain("Do not call retry_child unless a child has failed");
    expect(blockedSpawn?.message).not.toContain("call resolve_barrier with decision retry_child before continuing");

    expect(subagentUnsafeRequiredBarrierToolBlock({
      store: subagentBarrierStore({
        childStatus: "needs_attention",
        barrierStatus: "waiting_on_children",
        resultArtifact: undefined,
      }),
      threadId: "parent-thread",
      parentRunId: "parent-run",
      toolName: "ambient_subagent",
      rawToolInput: { action: "status_agent", waitBarrierId: "barrier-unsafe" },
    })).toBeUndefined();
  });
});

function subagentBarrierStore(input: {
  childStatus: string;
  barrierStatus: string;
  resultArtifact?: unknown;
  additionalRuns?: Array<{ id: string; status: string; resultArtifact?: unknown }>;
  dependencyMode?: "required_all" | "required_any" | "optional_background" | "quorum";
  ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
  ownerId?: string;
  callableWorkflowTasks?: Array<{ id: string; blocking: boolean }>;
}) {
  const roleProfileSnapshot = getDefaultSubagentRoleProfile("reviewer");
  const childRun = {
    id: "child-failed",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/2:reviewer",
    roleId: "reviewer",
    roleProfileSnapshot,
    roleProfileSnapshotSource: "resolved",
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
  const additionalRuns = (input.additionalRuns ?? []).map((run) => ({
    id: run.id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: `${run.id}-thread`,
    canonicalTaskPath: `root/extra:${run.id}`,
    roleId: "reviewer",
    roleProfileSnapshot,
    roleProfileSnapshotSource: "resolved",
    status: run.status,
    resultArtifact: run.resultArtifact,
  }));
  const runs = new Map([childRun, ...additionalRuns].map((run) => [run.id, run]));
  const barrier = {
    id: "barrier-unsafe",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: [...runs.keys()],
    dependencyMode: input.dependencyMode ?? "required_all",
    status: input.barrierStatus,
    failurePolicy: "ask_user",
    ...(input.ownerKind ? { ownerKind: input.ownerKind } : {}),
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
  return {
    listSubagentWaitBarriersForParentRun: (parentRunId: string) => parentRunId === "parent-run" ? [barrier] : [],
    listCallableWorkflowTasksForParentRun: (parentRunId: string) => parentRunId === "parent-run" ? input.callableWorkflowTasks ?? [] : [],
    getSubagentRun: (runId: string) => {
      const run = runs.get(runId);
      if (!run) throw new Error(`Unknown run ${runId}`);
      return run;
    },
    listSubagentRunEvents: () => [],
  } as any;
}

function completedResultArtifact(runId: string, childThreadId: string): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status: "completed",
    partial: false,
    summary: "Child result is synthesis safe.",
    childThreadId,
    structuredOutput: {
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId: "reviewer",
      status: "complete",
      summary: "Child result is synthesis safe.",
      evidence: ["permission guard test"],
      artifacts: [],
      risks: [],
      nextActions: [],
      roleOutput: {
        verdict: "approved",
        findings: [],
      },
    },
  };
}
