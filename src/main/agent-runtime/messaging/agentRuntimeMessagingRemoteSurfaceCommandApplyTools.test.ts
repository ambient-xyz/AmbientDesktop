import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  createMessagingRemoteSurfaceCommandApplyResolver,
  messagingRemoteSurfaceCommandApplyResultResponse,
  messagingRemoteSurfaceCommandApplyToolResponse,
  registerMessagingRemoteSurfaceCommandApplyTools,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  activeBinding,
  bindingList,
  commandPreview,
  commandResult,
  runtimeSurface,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: unknown[]) => Promise<unknown> };

describe("registerMessagingRemoteSurfaceCommandApplyTools", () => {
  it("registers and delegates the Remote Ambient Surface command apply tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const seenParams: unknown[] = [];
    const applyResult = {
      content: [{ type: "text", text: "Remote Ambient Surface command apply\nApply status: applied" }],
      details: {
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_command_apply",
        status: "applied",
        commandStatus: "ready",
        queuedProjectionId: "projection-ready",
      },
    };

    registerMessagingRemoteSurfaceCommandApplyTools(
      {
        registerTool: (tool) => registeredTools.push(tool as RegisteredTool),
      },
      {
        applyForParams: async (params) => {
          seenParams.push(params);
          return applyResult;
        },
      },
    );

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_messaging_remote_surface_command_apply"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("remote-surface-command-apply", {
      queuedProjectionId: "projection-ready",
    });

    expect(seenParams).toEqual([{ queuedProjectionId: "projection-ready" }]);
    expect(result).toBe(applyResult);
  });

  it("creates a resolver that returns blocked preflight responses without side effects", async () => {
    const seenParams: unknown[] = [];
    const permissionRequests: unknown[] = [];
    const unexpectedSideEffect = vi.fn((label: string) => {
      throw new Error(`Unexpected resolver side effect: ${label}`);
    });
    const applyForParams = createMessagingRemoteSurfaceCommandApplyResolver({
      previewForParams: (params) => {
        seenParams.push(params);
        return commandPreview({
          status: "blocked",
          canApplyNow: false,
          blockers: ["No queued Remote Ambient Surface command is ready to apply."],
        });
      },
      threadId: "thread-1",
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      getThread: (threadId) =>
        ({
          id: threadId,
          title: "Thread 1",
          workspacePath: "/workspace",
          permissionMode: "standard",
          collaborationMode: "default",
          thinkingLevel: "medium",
        }) as unknown as ThreadSummary,
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
      bindings: {
        list: () => {
          unexpectedSideEffect("bindings.list");
          return bindingList();
        },
        updateRemoteSurfaceScope: () => {
          unexpectedSideEffect("bindings.updateRemoteSurfaceScope");
          return activeBinding();
        },
      },
      runtimeSurfaceSnapshot: () => {
        unexpectedSideEffect("runtimeSurfaceSnapshot");
        return runtimeSurface();
      },
      isRunActive: () => {
        unexpectedSideEffect("isRunActive");
        return false;
      },
      createChatThread: () => {
        unexpectedSideEffect("createChatThread");
        return { id: "chat-unexpected" };
      },
      createWorkflowAgentThreadSummary: () => {
        unexpectedSideEffect("createWorkflowAgentThreadSummary");
        return { id: "workflow-unexpected" };
      },
      switchProjectAvailable: () => {
        unexpectedSideEffect("switchProjectAvailable");
        return false;
      },
      recordRuntimeEvent: () => {
        unexpectedSideEffect("recordRuntimeEvent");
        return { id: "event-unexpected" };
      },
      storePendingProjectSwitch: () => unexpectedSideEffect("storePendingProjectSwitch"),
      completeProjectSwitch: () => unexpectedSideEffect("completeProjectSwitch"),
      answerWorkflowDiscoveryQuestion: () => unexpectedSideEffect("answerWorkflowDiscoveryQuestion"),
      getWorkflowDiscoveryQuestion: () => undefined,
      getWorkflowThreadSummary: () => {
        unexpectedSideEffect("getWorkflowThreadSummary");
        return { id: "workflow-unexpected", title: "Workflow", phase: "discovery" };
      },
      workflowAgents: undefined,
      onWorkflowUpdated: () => unexpectedSideEffect("onWorkflowUpdated"),
      updateThreadSettings: () => {
        unexpectedSideEffect("updateThreadSettings");
        return {} as ThreadSummary;
      },
      onThreadUpdated: () => unexpectedSideEffect("onThreadUpdated"),
      voice: undefined,
      stt: undefined,
      listSttProviders: () => {
        unexpectedSideEffect("listSttProviders");
        return [];
      },
      media: undefined,
      planner: undefined,
      search: undefined,
      discoverAmbientCliPackages: async () => {
        unexpectedSideEffect("discoverAmbientCliPackages");
        return { packages: [], errors: [] };
      },
      revokePermissionGrant: () => {
        unexpectedSideEffect("revokePermissionGrant");
        return {};
      },
      onPermissionGrantRevoked: () => unexpectedSideEffect("onPermissionGrantRevoked"),
    });

    const result = await applyForParams({ queuedProjectionId: "projection-blocked" });

    expect(seenParams).toEqual([{ queuedProjectionId: "projection-blocked" }]);
    expect(permissionRequests).toEqual([]);
    expect(unexpectedSideEffect).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Apply status: blocked");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_apply",
      status: "blocked",
      commandStatus: "blocked",
      applyStatus: "blocked",
      blockers: ["No queued Remote Ambient Surface command is ready to apply."],
    });
  });

  it("formats Remote Ambient Surface command apply tool responses", () => {
    const response = messagingRemoteSurfaceCommandApplyToolResponse(commandResult(), {
      workflowActionResult: {
        action: "run_exploration",
        workflowThreadId: "workflow-1",
        changed: true,
      },
    });

    expect(response.content[0].text).toContain("Remote Ambient Surface command");
    expect(response.content[0].text).toContain("Apply status: applied");
    expect(response.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_apply",
      status: "applied",
      commandStatus: "ready",
      applyStatus: "applied",
      queuedProjectionId: "projection-ready",
      commandKind: "workflow_action",
      workflowActionResult: {
        action: "run_exploration",
        workflowThreadId: "workflow-1",
        changed: true,
      },
    });
  });

  it("assembles Remote Ambient Surface command apply result responses", () => {
    const updatedBinding = activeBinding({
      ambientSurface: "chat",
      chatThreadId: "chat-created",
    });
    const workflowActionResult = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-created",
      workflowTitle: "Launch workflow",
      changed: true,
      text: "Started workflow exploration.",
      runId: "run-1",
      runStatus: "running",
    };
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };
    const grantRevoke = {
      grantId: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      reason: "Owner revoked remote grant.",
    };
    const updatedSetting = {
      settingKey: "search" as const,
      operation: "search_preference" as const,
      changed: true,
      text: "Search preference updated.",
      nextSummary: "Search enabled",
    };

    const response = messagingRemoteSurfaceCommandApplyResultResponse({
      preview: commandPreview({
        commandKind: "create_chat",
        commandText: "create chat Launch room",
        textPreview: "create chat Launch room",
      }),
      approvalRecorded: true,
      bindings: bindingList(updatedBinding),
      surface: runtimeSurface(),
      updatedBinding,
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
      workflowAnswerResult: { changed: true, text: "Answered workflow question." },
      workflowActionResult,
      approvalResponse,
      grantRevoke,
      updatedSetting,
    });

    expect(response.content[0].text).toContain("Apply status: applied");
    expect(response.content[0].text).toContain("Created project: New project (/workspace/new-project)");
    expect(response.content[0].text).toContain("Created chat: Launch room (chat-created)");
    expect(response.content[0].text).toContain("Created workflow: Launch workflow (workflow-created)");
    expect(response.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_apply",
      status: "applied",
      commandStatus: "ready",
      applyStatus: "applied",
      approvalRecorded: true,
      updatedBinding: {
        id: "binding-1",
        ambientSurface: "chat",
        chatThreadId: "chat-created",
      },
      createdProject: {
        path: "/workspace/new-project",
        name: "New project",
      },
      createdChat: {
        id: "chat-created",
        title: "Launch room",
      },
      createdWorkflow: {
        id: "workflow-created",
        title: "Launch workflow",
      },
      workflowAnswerResult: { changed: true, text: "Answered workflow question." },
      workflowActionResult,
      approvalResponseResult: approvalResponse,
      permissionGrantRevokeResult: grantRevoke,
      settingUpdateResult: updatedSetting,
    });
  });
});
