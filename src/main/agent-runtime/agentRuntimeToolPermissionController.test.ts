import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AmbientInstallRoutePlan } from "./agentRuntimeInstallRouteFacade";
import { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { AgentRuntimeFileAuthorityController } from "./agentRuntimeFileAuthorityController";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { AgentRuntimeToolPermissionController } from "./agentRuntimeToolPermissionController";
import type { WorkspaceState } from "../../shared/workspaceTypes";

describe("AgentRuntimeToolPermissionController", () => {
  it("blocks permission-gate tool calls through install-route guard state", async () => {
    const threadId = "thread-1";
    const workspace = workspaceState("/workspace");
    const emitted: unknown[] = [];
    const addMessage = vi.fn((message) => ({
      id: "message-1",
      createdAt: "2026-06-22T00:00:00.000Z",
      ...message,
    }));
    const store = {
      getThread: vi.fn(() => ({
        id: threadId,
        kind: "agent",
        permissionMode: "full-access",
        collaborationMode: "default",
      })),
      addMessage,
      getWorkspace: vi.fn(() => workspace),
    } as unknown as ProjectStore;
    const installRouteGuard = new AgentRuntimeInstallRouteGuard();
    installRouteGuard.recordInstallRoutePlan(threadId, needsClarificationPlan(), "2026-06-22T00:00:00.000Z");
    const requestPermission = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
    const controller = createController({
      store,
      installRouteGuard,
      requestPermission,
      emit: (event) => emitted.push(event),
    });

    let toolCallHandler: ((event: { toolName: string; input: unknown }) => Promise<unknown>) | undefined;
    controller.createPermissionGateExtension(
      threadId,
      workspace,
    )({
      on: (eventName: string, handler: typeof toolCallHandler) => {
        expect(eventName).toBe("tool_call");
        toolCallHandler = handler;
      },
    } as any);

    const result = await toolCallHandler?.({
      toolName: "bash",
      input: { command: "mkdir -p ~/.agents/skills/mystery" },
    });

    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining("needs-clarification"),
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        role: "tool",
        content: expect.stringContaining("Ambient install route gate blocked bash."),
        metadata: expect.objectContaining({
          runtime: "ambient-install-route-gate",
          lane: "needs-clarification",
        }),
      }),
    );
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "message-created",
        message: expect.objectContaining({
          metadata: expect.objectContaining({ runtime: "ambient-install-route-gate" }),
        }),
      }),
    );
  });

  it("delegates interrupted recovery and file authority operations to the file-authority owner", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-tool-permission-controller-"));
    try {
      await mkdir(join(root, ".ambient-codex", "interrupted-tool-calls", "run-1"), { recursive: true });
      await writeFile(
        join(root, ".ambient-codex", "interrupted-tool-calls", "run-1", "tool-1.partial-args.txt"),
        "saved interrupted args",
        "utf8",
      );
      const requestFileAuthority = vi.fn(async () => true);
      const rootPathsForThread = vi.fn((threadId: string, access: "read" | "write") => {
        if (threadId !== "thread-1") return [];
        return access === "read" ? [root] : [join(root, "writes")];
      });
      const includeWorkspaceRootAuthorityForThread = vi.fn(() => false);
      const childApprovalModeForThread = vi.fn(() => "interactive" as const);
      const fileAuthority = {
        rootPathsForThread,
        includeWorkspaceRootAuthorityForThread,
        requestForThread: requestFileAuthority,
        childApprovalModeForThread,
      } as unknown as AgentRuntimeFileAuthorityController;
      const controller = createController({ fileAuthority });

      const artifact = controller.readInterruptedToolCallRecoveryArtifact("thread-1", {
        runId: "run-1",
        toolCallId: "tool-1",
      });
      const request: AmbientFileAuthorityRequest = {
        access: "write",
        absolutePath: join(root, "writes", "out.txt"),
        requestedPath: "out.txt",
        reason: "test",
        toolName: "write",
      };

      expect(artifact.content).toEqual([{ type: "text", text: "saved interrupted args" }]);
      expect(rootPathsForThread).toHaveBeenCalledWith("thread-1", "read");
      expect(controller.fileAuthorityRootPathsForThread("thread-1", "write")).toEqual([join(root, "writes")]);
      expect(controller.includeWorkspaceRootAuthorityForThread("thread-1")).toBe(false);
      const workspace = workspaceState(root);
      await expect(controller.requestFileAuthorityForThread("thread-1", workspace, request)).resolves.toBe(true);
      expect(requestFileAuthority).toHaveBeenCalledWith("thread-1", workspace, request);
      expect(controller.childApprovalModeForThread({ kind: "subagent_child", subagentRunId: "run-1" })).toBe("interactive");
      expect(childApprovalModeForThread).toHaveBeenCalledWith({ kind: "subagent_child", subagentRunId: "run-1" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createController(overrides: Partial<ConstructorParameters<typeof AgentRuntimeToolPermissionController>[0]> = {}) {
  const workspace = workspaceState("/workspace");
  const store = {
    getThread: vi.fn(() => ({
      id: "thread-1",
      kind: "agent",
      permissionMode: "workspace",
      collaborationMode: "default",
    })),
    getWorkspace: vi.fn(() => workspace),
    addMessage: vi.fn((message) => ({ id: "message-1", ...message })),
    listMessages: vi.fn(() => []),
    getProjectArtifactWorkspacePath: vi.fn(() => workspace.path),
    getProjectBoardDependencyWorkspacePathsForExecutionThread: vi.fn(() => []),
  } as unknown as ProjectStore;
  const fileAuthority = {
    rootPathsForThread: vi.fn(() => []),
    includeWorkspaceRootAuthorityForThread: vi.fn(() => true),
    requestForThread: vi.fn(async () => false),
    childApprovalModeForThread: vi.fn(() => undefined),
  } as unknown as AgentRuntimeFileAuthorityController;

  return new AgentRuntimeToolPermissionController({
    activeRunId: () => "run-1",
    browserCredentials: { get: () => undefined },
    fileAuthority,
    googleWorkspace: undefined,
    installRouteGuard: new AgentRuntimeInstallRouteGuard(),
    permissionWaitControl: () => undefined,
    readBrowserState: () => undefined,
    readLocalDeepResearchReadiness: () => ({
      contract: {
        status: undefined,
        installerShape: undefined,
      },
    }),
    requestPermission: async () => ({ allowed: true, mode: "allow_once" }),
    store,
    transientFileAuthorityRoots: new Map(),
    emit: () => undefined,
    ...overrides,
  });
}

function workspaceState(path: string): WorkspaceState {
  return {
    path,
    name: "workspace",
    statePath: join(path, ".ambient"),
    sessionPath: join(path, ".ambient", "sessions"),
  };
}

function needsClarificationPlan(): AmbientInstallRoutePlan {
  return {
    lane: "needs-clarification",
    confidence: "low",
    reason: "The target source is ambiguous.",
    evidence: [],
    blockers: ["Need package source."],
    nextTools: [
      {
        name: "ambient_install_route_plan",
        purpose: "Replan with clarified source.",
      },
    ],
    approvalBoundary: "none-readonly",
    validationTarget: {
      kind: "route-only",
      description: "Ask one targeted clarification before any install side effects.",
    },
    warnings: [],
  };
}
