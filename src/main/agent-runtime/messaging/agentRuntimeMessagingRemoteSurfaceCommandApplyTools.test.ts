import { describe, expect, it, vi } from "vitest";

import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  RuntimeSurfaceSnapshot,
} from "../../../shared/messagingGateway";
import {
  completeMessagingRemoteSurfaceCommandPendingProjectSwitch,
  createMessagingRemoteSurfaceCommandApplyResolver,
  finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun,
  messagingRemoteSurfaceCommandApplyBindingPlan,
  messagingRemoteSurfaceCommandApplyBindingUpdates,
  messagingRemoteSurfaceCommandApplyCreatePlan,
  messagingRemoteSurfaceCommandApplyCreatedResources,
  messagingRemoteSurfaceCommandApplyPermissionRequest,
  messagingRemoteSurfaceCommandApplyPreflight,
  messagingRemoteSurfaceCommandApplyProjectSwitch,
  messagingRemoteSurfaceCommandApplyResultOptions,
  messagingRemoteSurfaceCommandApplyResultResponse,
  messagingRemoteSurfaceCommandApplyRuntimeSideEffects,
  messagingRemoteSurfaceCommandApplySettingUpdate,
  messagingRemoteSurfaceCommandApplySideEffectPlan,
  messagingRemoteSurfaceCommandApplyToolResponse,
  messagingRemoteSurfaceCommandApplyWorkflowAction,
  messagingRemoteSurfaceCommandCreatedScopeBindingUpdates,
  messagingRemoteSurfaceCommandCreatedResourceRefs,
  messagingRemoteSurfaceCommandProjectSwitchPlan,
  messagingRemoteSurfaceCommandSwitchProjectCanceledPatch,
  messagingRemoteSurfaceCommandSwitchProjectCompletedPatch,
  messagingRemoteSurfaceCommandSwitchProjectFailedPatch,
  messagingRemoteSurfaceCommandSwitchProjectPendingEvent,
  messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch,
  messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent,
  messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput,
  registerMessagingRemoteSurfaceCommandApplyTools,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import type {
  MessagingRemoteSurfaceCommandPreview,
  MessagingRemoteSurfaceCommandResult,
} from "../../messaging/messagingRemoteSurfaceCommands";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

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

    registerMessagingRemoteSurfaceCommandApplyTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      applyForParams: async (params) => {
        seenParams.push(params);
        return applyResult;
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_remote_surface_command_apply",
    ]);
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
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      getThread: (threadId) => ({
        id: threadId,
        title: "Thread 1",
        workspacePath: "/workspace",
        permissionMode: "standard",
        collaborationMode: "default",
        thinkingLevel: "medium",
      }) as any,
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
        return {} as any;
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

  it("builds created-scope binding updates in runtime apply order", () => {
    expect(messagingRemoteSurfaceCommandCreatedScopeBindingUpdates({
      preview: commandPreview({
        binding: activeBinding(),
        commandKind: "create_workflow",
        commandText: "create workflow Launch workflow",
        textPreview: "create workflow Launch workflow",
      }),
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
    })).toEqual([
      {
        bindingId: "binding-1",
        ambientSurface: "projects",
        projectId: "/workspace/new-project",
        reason: "remote-surface-command:create_workflow",
      },
      {
        bindingId: "binding-1",
        ambientSurface: "chat",
        chatThreadId: "chat-created",
        reason: "remote-surface-command:create_workflow",
      },
      {
        bindingId: "binding-1",
        ambientSurface: "workflow_agents",
        workflowId: "workflow-created",
        reason: "remote-surface-command:create_workflow",
      },
    ]);
  });

  it("does not build created-scope binding updates without a binding", () => {
    expect(messagingRemoteSurfaceCommandCreatedScopeBindingUpdates({
      preview: commandPreview({
        commandKind: "create_chat",
        commandText: "create chat Launch room",
        textPreview: "create chat Launch room",
      }),
      createdChatThreadId: "chat-created",
    })).toEqual([]);
  });

  it("builds Remote Ambient Surface command apply binding plans", () => {
    expect(messagingRemoteSurfaceCommandApplyBindingPlan({
      preview: commandPreview({
        binding: activeBinding(),
        commandKind: "open_project",
        commandText: "open project Research project",
        textPreview: "open project Research project",
        targetSurface: "projects",
        targetProject: {
          id: "/workspace/research",
          name: "Research project",
          path: "/workspace/research",
          updatedAt: "2026-06-11T00:00:00.000Z",
          threadCount: 0,
          active: false,
        },
      }),
    })).toEqual({
      initialBindingUpdate: {
        bindingId: "binding-1",
        ambientSurface: "projects",
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:open_project",
      },
      createdScopeBindingUpdates: [],
    });

    expect(messagingRemoteSurfaceCommandApplyBindingPlan({
      preview: commandPreview({
        binding: activeBinding(),
        commandKind: "create_workflow",
        commandText: "create workflow Launch workflow",
        textPreview: "create workflow Launch workflow",
      }),
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
    })).toEqual({
      createdScopeBindingUpdates: [
        {
          bindingId: "binding-1",
          ambientSurface: "projects",
          projectId: "/workspace/new-project",
          reason: "remote-surface-command:create_workflow",
        },
        {
          bindingId: "binding-1",
          ambientSurface: "chat",
          chatThreadId: "chat-created",
          reason: "remote-surface-command:create_workflow",
        },
        {
          bindingId: "binding-1",
          ambientSurface: "workflow_agents",
          workflowId: "workflow-created",
          reason: "remote-surface-command:create_workflow",
        },
      ],
    });
  });

  it("applies Remote Ambient Surface command binding updates in plan order", () => {
    const appliedUpdates: unknown[] = [];
    const bindingPlan = {
      initialBindingUpdate: {
        bindingId: "binding-1",
        ambientSurface: "projects" as const,
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:open_project",
      },
      createdScopeBindingUpdates: [
        {
          bindingId: "binding-1",
          ambientSurface: "chat" as const,
          chatThreadId: "chat-created",
          reason: "remote-surface-command:create_workflow",
        },
        {
          bindingId: "binding-1",
          ambientSurface: "workflow_agents" as const,
          workflowId: "workflow-created",
          reason: "remote-surface-command:create_workflow",
        },
      ],
    };

    const updatedBinding = messagingRemoteSurfaceCommandApplyBindingUpdates({
      bindingPlan,
      updateRemoteSurfaceScope: (update) => {
        appliedUpdates.push(update);
        return activeBinding({ id: `updated-${appliedUpdates.length}` });
      },
    });

    expect(appliedUpdates).toEqual([
      bindingPlan.initialBindingUpdate,
      ...bindingPlan.createdScopeBindingUpdates,
    ]);
    expect(updatedBinding).toMatchObject({ id: "updated-3" });
    expect(messagingRemoteSurfaceCommandApplyBindingUpdates({
      bindingPlan: { createdScopeBindingUpdates: [] },
      updateRemoteSurfaceScope: () => activeBinding({ id: "unused" }),
    })).toBeUndefined();
  });

  it("builds Remote Ambient Surface command apply result options", () => {
    const preview = switchProjectResult();
    const targetProject = preview.targetProject!;
    const updatedBinding = activeBinding({
      ambientSurface: "projects",
      projectId: "/workspace/research",
    });
    const workflowActionResult = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-created",
      workflowTitle: "Launch workflow",
      changed: true,
      text: "Started workflow exploration.",
    };
    const updatedSetting = {
      settingKey: "search" as const,
      operation: "search_preference" as const,
      changed: true,
      text: "Search preference updated.",
    };

    expect(messagingRemoteSurfaceCommandApplyResultOptions({
      preview,
      approvalRecorded: true,
      bindings: bindingList(updatedBinding),
      surface: runtimeSurface(),
      updatedBinding,
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
      workflowAnswerResult: { changed: true, text: "Answered workflow question." },
      workflowActionResult,
      updatedSetting,
    })).toEqual({
      preview,
      approvalRecorded: true,
      bindings: bindingList(updatedBinding),
      surface: runtimeSurface(),
      updatedBinding,
      scheduledProjectSwitch: targetProject,
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
      workflowAnswerResult: { changed: true, text: "Answered workflow question." },
      workflowActionResult,
      updatedSetting,
    });

    expect(messagingRemoteSurfaceCommandApplyResultOptions({
      preview,
      approvalRecorded: true,
      bindings: bindingList(updatedBinding),
      surface: runtimeSurface(),
      completedProjectSwitch: targetProject,
    })).toEqual({
      preview,
      approvalRecorded: true,
      bindings: bindingList(updatedBinding),
      surface: runtimeSurface(),
      completedProjectSwitch: targetProject,
    });
  });

  it("returns no create requests when the command has no create target", () => {
    expect(messagingRemoteSurfaceCommandApplyCreatePlan(commandPreview())).toEqual({});
  });

  it("builds Remote Ambient Surface command apply create requests", () => {
    const projectCreateRequest = {
      name: "New project",
      workspacePath: "/workspace/new-project",
      reason: "Owner created a project from remote surface.",
    };
    const workflowCreateRequest = {
      title: "Launch workflow",
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace/new-project",
      reason: "Owner created a workflow from remote surface.",
    };

    expect(messagingRemoteSurfaceCommandApplyCreatePlan(commandPreview({
      commandKind: "create_project",
      targetProjectCreate: projectCreateRequest,
    }))).toEqual({ projectCreateRequest });
    expect(messagingRemoteSurfaceCommandApplyCreatePlan(commandPreview({
      commandKind: "create_chat",
      newChatTitle: "  Launch room  ",
    }))).toEqual({ createChatTitle: "Launch room" });
    expect(messagingRemoteSurfaceCommandApplyCreatePlan(commandPreview({
      commandKind: "create_workflow",
      targetWorkflowCreate: workflowCreateRequest,
    }))).toEqual({ workflowCreateRequest });
  });

  it("builds workflow thread create summary inputs", () => {
    expect(messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
      workflowCreateRequest: {
        title: "Launch workflow",
        initialRequest: "Build the launch checklist.",
        projectPath: "/workspace/new-project",
        reason: "Owner created a workflow from remote surface.",
      },
      defaultProjectPath: "/workspace",
    })).toEqual({
      title: "Launch workflow",
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace/new-project",
      traceMode: "production",
      phase: "discovery",
    });

    expect(messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
      workflowCreateRequest: {
        initialRequest: "Build the launch checklist.",
        reason: "Owner created a workflow from remote surface.",
      },
      defaultProjectPath: "/workspace",
    })).toEqual({
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace",
      traceMode: "production",
      phase: "discovery",
    });
  });

  it("builds created resource refs for Remote Ambient Surface command apply", () => {
    expect(messagingRemoteSurfaceCommandCreatedResourceRefs({
      createdProject: { path: "/workspace/new-project" },
      createdChatThread: { id: "chat-created" },
      createdWorkflowThread: { id: "workflow-created" },
    })).toEqual({
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
    });

    expect(messagingRemoteSurfaceCommandCreatedResourceRefs({})).toEqual({});
  });

  it("applies created resources from create plans in runtime order", async () => {
    const createdProjects: unknown[] = [];
    const createdChats: unknown[] = [];
    const createdWorkflowThreads: unknown[] = [];
    const projectCreateRequest = {
      name: "New project",
      workspacePath: "/workspace/new-project",
      reason: "Owner created a project from remote surface.",
    };
    const workflowCreateRequest = {
      title: "Launch workflow",
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace/new-project",
      reason: "Owner created a workflow from remote surface.",
    };

    const result = await messagingRemoteSurfaceCommandApplyCreatedResources({
      createPlan: {
        projectCreateRequest,
        createChatTitle: "Launch room",
        workflowCreateRequest,
      },
      defaultProjectPath: "/workspace/current",
      createProject: async (input) => {
        createdProjects.push(input);
        return { path: "/workspace/new-project" };
      },
      createChatThread: (title, workspacePath) => {
        createdChats.push({ title, workspacePath });
        return { id: "chat-created" };
      },
      createWorkflowAgentThreadSummary: (input) => {
        createdWorkflowThreads.push(input);
        return { id: "workflow-created" };
      },
    });

    expect(createdProjects).toEqual([projectCreateRequest]);
    expect(createdChats).toEqual([{ title: "Launch room", workspacePath: "/workspace/current" }]);
    expect(createdWorkflowThreads).toEqual([{
      title: "Launch workflow",
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace/new-project",
      traceMode: "production",
      phase: "discovery",
    }]);
    expect(result).toEqual({
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
    });
  });

  it("fails created-resource application when project creation is unavailable", async () => {
    await expect(messagingRemoteSurfaceCommandApplyCreatedResources({
      createPlan: {
        projectCreateRequest: {
          name: "New project",
          workspacePath: "/workspace/new-project",
          reason: "Owner created a project from remote surface.",
        },
      },
      defaultProjectPath: "/workspace/current",
      createChatThread: () => ({ id: "unused-chat" }),
      createWorkflowAgentThreadSummary: () => ({ id: "unused-workflow" }),
    })).rejects.toThrow("Ambient project creation is not available in this runtime.");
  });

  it("returns no created resources when create plans are empty", async () => {
    const createChatThread = vi.fn(() => ({ id: "unused-chat" }));
    const createWorkflowAgentThreadSummary = vi.fn(() => ({ id: "unused-workflow" }));

    await expect(messagingRemoteSurfaceCommandApplyCreatedResources({
      createPlan: {},
      defaultProjectPath: "/workspace/current",
      createProject: async () => ({ path: "/workspace/unused" }),
      createChatThread,
      createWorkflowAgentThreadSummary,
    })).resolves.toEqual({});

    expect(createChatThread).not.toHaveBeenCalled();
    expect(createWorkflowAgentThreadSummary).not.toHaveBeenCalled();
  });

  it("returns no side-effect requests when the command has no side-effect target", () => {
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview())).toEqual({});
  });

  it("builds Remote Ambient Surface command apply side-effect requests", () => {
    const workflowActionRequest = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked to start exploration.",
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
    const settingUpdateRequest = {
      settingKey: "search" as const,
      operation: "search_preference" as const,
      field: "enabled",
      value: true,
      reason: "Owner enabled search from remote surface.",
    };

    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview({
      commandKind: "answer_workflow_question",
      targetQuestionId: "question-1",
      answerChoiceId: "choice-1",
      answerFreeform: "Ship the simple version.",
    }))).toEqual({
      workflowAnswerInput: {
        questionId: "question-1",
        choiceId: "choice-1",
        freeform: "Ship the simple version.",
      },
    });
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview({
      commandKind: "workflow_action",
      targetWorkflowAction: workflowActionRequest,
    }))).toEqual({ workflowActionRequest });
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview({
      commandKind: "respond_approval",
      targetApprovalResponse: approvalResponse,
    }))).toEqual({ approvalResponse });
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview({
      commandKind: "revoke_permission_grant",
      targetGrantRevoke: grantRevoke,
    }))).toEqual({ grantRevoke });
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview({
      commandKind: "update_setting",
      targetSettingUpdate: settingUpdateRequest,
    }))).toEqual({ settingUpdateRequest });
  });

  it("applies Remote Ambient Surface workflow-answer side effects through injected dependencies", async () => {
    const workflowAnswerInput = {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Ship the simple version.",
    };
    const workflowAnswerResult = { changed: true, text: "Answered workflow question." };
    const answeredQuestion = {
      id: "question-1",
      workflowThreadId: "workflow-1",
      category: "scope" as const,
      context: "Launch workflow",
      question: "What should we ship?",
      choices: [],
      allowFreeform: true,
      answer: {
        choiceId: "choice-1",
        freeform: "Ship the simple version.",
        answeredAt: "2026-06-11T00:00:00.000Z",
      },
      createdAt: "2026-06-11T00:00:00.000Z",
      answeredAt: "2026-06-11T00:00:00.000Z",
    };
    const answerWorkflowDiscoveryQuestion = vi.fn(async (input: { questionId: string; choiceId?: string; freeform?: string }) => {
      expect(input).toBe(workflowAnswerInput);
      return workflowAnswerResult;
    });
    const getWorkflowDiscoveryQuestion = vi.fn((questionId: string) => {
      expect(questionId).toBe("question-1");
      return answeredQuestion;
    });

    await expect(messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
      sideEffectPlan: { workflowAnswerInput },
      answerWorkflowDiscoveryQuestion,
      getWorkflowDiscoveryQuestion,
      applyWorkflowAction: vi.fn(),
      applySettingUpdate: vi.fn(),
      revokePermissionGrant: vi.fn(),
      onPermissionGrantRevoked: vi.fn(),
    })).resolves.toEqual({
      answeredQuestion,
      workflowAnswerResult,
    });

    expect(answerWorkflowDiscoveryQuestion).toHaveBeenCalledWith(workflowAnswerInput);
    expect(getWorkflowDiscoveryQuestion).toHaveBeenCalledWith("question-1");
  });

  it("keeps Remote Ambient Surface runtime side effects in apply order", async () => {
    const calls: string[] = [];
    const workflowAnswerInput = {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Ship the simple version.",
    };
    const answeredQuestion = {
      id: "question-1",
      workflowThreadId: "workflow-1",
      category: "scope" as const,
      context: "Launch workflow",
      question: "What should we ship?",
      choices: [],
      allowFreeform: true,
      createdAt: "2026-06-11T00:00:00.000Z",
    };
    const workflowActionRequest = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked to start exploration.",
    };
    const workflowActionResult = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      changed: true,
      text: "Started workflow exploration.",
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
    const revokedGrant = {
      id: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      revokedAt: "2026-06-11T00:00:00.000Z",
    };
    const settingUpdateRequest = {
      settingKey: "thread" as const,
      operation: "thread_settings" as const,
      field: "thinkingLevel",
      value: "high",
      reason: "Owner requested deeper thinking.",
    };
    const updatedSetting = {
      settingKey: "thread" as const,
      operation: "thread_settings" as const,
      changed: true,
      text: "Thread settings updated.",
      previousSummary: "thinkingLevel=medium",
      nextSummary: "thinkingLevel=high",
    };

    await expect(messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
      sideEffectPlan: {
        workflowAnswerInput,
        workflowActionRequest,
        approvalResponse,
        grantRevoke,
        settingUpdateRequest,
      },
      answerWorkflowDiscoveryQuestion: async () => {
        calls.push("answer");
        return { changed: true, text: "Answered workflow question." };
      },
      getWorkflowDiscoveryQuestion: () => {
        calls.push("get-question");
        return answeredQuestion;
      },
      applyWorkflowAction: async () => {
        calls.push("workflow-action");
        return workflowActionResult;
      },
      applySettingUpdate: async () => {
        calls.push("setting-update");
        return updatedSetting;
      },
      respondToPermissionPrompt: () => {
        calls.push("respond");
      },
      revokePermissionGrant: () => {
        calls.push("revoke");
        return revokedGrant;
      },
      onPermissionGrantRevoked: () => {
        calls.push("emit-revoked");
      },
    })).resolves.toMatchObject({
      answeredQuestion,
      workflowActionResult,
      approvalResponse,
      grantRevoke,
      updatedSetting,
    });

    expect(calls).toEqual([
      "answer",
      "get-question",
      "workflow-action",
      "respond",
      "revoke",
      "emit-revoked",
      "setting-update",
    ]);
  });

  it("applies Remote Ambient Surface approval and grant side effects through injected dependencies", async () => {
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
    const revokedGrant = {
      id: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      revokedAt: "2026-06-11T00:00:00.000Z",
    };
    const respondToPermissionPrompt = vi.fn();
    const revokePermissionGrant = vi.fn((grantId: string) => {
      expect(grantId).toBe("grant-1");
      return revokedGrant;
    });
    const onPermissionGrantRevoked = vi.fn();

    await expect(messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
      sideEffectPlan: { approvalResponse, grantRevoke },
      answerWorkflowDiscoveryQuestion: vi.fn(),
      getWorkflowDiscoveryQuestion: vi.fn(),
      applyWorkflowAction: vi.fn(),
      applySettingUpdate: vi.fn(),
      respondToPermissionPrompt,
      revokePermissionGrant,
      onPermissionGrantRevoked,
    })).resolves.toEqual({
      approvalResponse,
      grantRevoke,
    });

    expect(respondToPermissionPrompt).toHaveBeenCalledWith("approval-1", "allow_once");
    expect(revokePermissionGrant).toHaveBeenCalledWith("grant-1");
    expect(onPermissionGrantRevoked).toHaveBeenCalledWith(revokedGrant);
  });

  it("preserves Remote Ambient Surface approval response runtime availability errors", async () => {
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };

    await expect(messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
      sideEffectPlan: { approvalResponse },
      answerWorkflowDiscoveryQuestion: vi.fn(),
      getWorkflowDiscoveryQuestion: vi.fn(),
      applyWorkflowAction: vi.fn(),
      applySettingUpdate: vi.fn(),
      revokePermissionGrant: vi.fn(),
      onPermissionGrantRevoked: vi.fn(),
    })).rejects.toThrow("Ambient permission prompt responses are not available in this runtime.");
  });

  it("does not apply runtime side effects when the side-effect plan is empty", async () => {
    const answerWorkflowDiscoveryQuestion = vi.fn();
    const getWorkflowDiscoveryQuestion = vi.fn();
    const applyWorkflowAction = vi.fn();
    const applySettingUpdate = vi.fn();
    const revokePermissionGrant = vi.fn();
    const onPermissionGrantRevoked = vi.fn();

    await expect(messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
      sideEffectPlan: {},
      answerWorkflowDiscoveryQuestion,
      getWorkflowDiscoveryQuestion,
      applyWorkflowAction,
      applySettingUpdate,
      revokePermissionGrant,
      onPermissionGrantRevoked,
    })).resolves.toEqual({});

    expect(answerWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
    expect(getWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
    expect(applyWorkflowAction).not.toHaveBeenCalled();
    expect(applySettingUpdate).not.toHaveBeenCalled();
    expect(revokePermissionGrant).not.toHaveBeenCalled();
    expect(onPermissionGrantRevoked).not.toHaveBeenCalled();
  });

  it("applies Remote Ambient Surface workflow actions through injected workflow agents", async () => {
    const beforeThread = workflowThread({ phase: "discovery" });
    const explorationThread = workflowThread({ phase: "exploration" });
    const compileThread = workflowThread({ phase: "compiled" });
    const reviewThread = workflowThread({ phase: "review" });
    const recoverThread = workflowThread({ phase: "running" });
    const cancelThread = workflowThread({ phase: "canceled" });
    const workflowUpdates: unknown[] = [];
    const workflowAgents = {
      runExploration: vi.fn(async () => ({
        thread: explorationThread,
        traceId: "trace-1",
        graphSnapshotId: "graph-1",
      })),
      compilePreview: vi.fn(async () => ({
        thread: compileThread,
        artifactId: "artifact-1",
        runId: "run-compile",
      })),
      reviewArtifact: vi.fn(async () => ({
        thread: reviewThread,
        artifactId: "artifact-1",
        artifactStatus: "approved",
        changed: true,
      })),
      recoverRun: vi.fn(async () => ({
        thread: recoverThread,
        runId: "run-recovered",
        runStatus: "running",
        changed: true,
      })),
      cancelRun: vi.fn(async () => ({
        thread: cancelThread,
        runId: "run-cancel",
        runStatus: "canceled",
        changed: true,
      })),
    };
    const applyWorkflowAction = (input: Parameters<typeof messagingRemoteSurfaceCommandApplyWorkflowAction>[0]["input"]) =>
      messagingRemoteSurfaceCommandApplyWorkflowAction({
        input,
        getWorkflowThreadSummary: (workflowThreadId) => {
          expect(workflowThreadId).toBe("workflow-1");
          return beforeThread;
        },
        workflowAgents,
        onWorkflowUpdated: () => workflowUpdates.push({ type: "workflow-updated" }),
      });

    const exploration = await applyWorkflowAction({
      action: "run_exploration",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked for exploration.",
    });
    const compile = await applyWorkflowAction({
      action: "compile_preview",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked for a preview.",
    });
    const review = await applyWorkflowAction({
      action: "approve_artifact",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      artifactId: "artifact-1",
      reason: "Owner approved the artifact.",
    });
    const recovery = await applyWorkflowAction({
      action: "retry_failed_step",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      runId: "run-1",
      eventId: "event-1",
      recoveryAction: "retry_step",
      graphNodeId: "node-1",
      itemKey: "item-1",
      reason: "Owner requested retry.",
    });
    const cancel = await applyWorkflowAction({
      action: "cancel_run",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      runId: "run-cancel",
      reason: "Owner canceled the run.",
    });

    expect(workflowAgents.runExploration).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      reason: "Owner asked for exploration.",
    });
    expect(workflowAgents.compilePreview).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      reason: "Owner asked for a preview.",
    });
    expect(workflowAgents.reviewArtifact).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      artifactId: "artifact-1",
      decision: "approved",
      reason: "Owner approved the artifact.",
    });
    expect(workflowAgents.recoverRun).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      runId: "run-1",
      eventId: "event-1",
      action: "retry_step",
      graphNodeId: "node-1",
      itemKey: "item-1",
      reason: "Owner requested retry.",
    });
    expect(workflowAgents.cancelRun).toHaveBeenCalledWith({
      workflowThreadId: "workflow-1",
      runId: "run-cancel",
      reason: "Owner canceled the run.",
    });
    expect(workflowUpdates).toHaveLength(5);
    expect(exploration).toMatchObject({
      action: "run_exploration",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      changed: true,
      traceId: "trace-1",
      graphSnapshotId: "graph-1",
    });
    expect(exploration.text).toContain("Phase: discovery -> exploration");
    expect(compile).toMatchObject({
      action: "compile_preview",
      artifactId: "artifact-1",
      runId: "run-compile",
    });
    expect(compile.text).toContain("Workflow Agent compile preview completed");
    expect(review).toMatchObject({
      action: "approve_artifact",
      artifactId: "artifact-1",
      artifactStatus: "approved",
      changed: true,
    });
    expect(review.text).toContain("Workflow preview approved");
    expect(recovery).toMatchObject({
      action: "retry_failed_step",
      runId: "run-recovered",
      runStatus: "running",
      changed: true,
    });
    expect(recovery.text).toContain("Recovery action: retry_step");
    expect(cancel).toMatchObject({
      action: "cancel_run",
      runId: "run-cancel",
      runStatus: "canceled",
      changed: true,
    });
    expect(cancel.text).toContain("Workflow cancellation requested");
  });

  it("preserves Remote Ambient Surface workflow action validation errors", async () => {
    const applyWorkflowAction = (input: Parameters<typeof messagingRemoteSurfaceCommandApplyWorkflowAction>[0]["input"], workflowAgents: any = {}) =>
      messagingRemoteSurfaceCommandApplyWorkflowAction({
        input,
        getWorkflowThreadSummary: () => workflowThread(),
        workflowAgents,
        onWorkflowUpdated: () => {
          throw new Error("Workflow update should not be emitted.");
        },
      });

    await expect(applyWorkflowAction({
      action: "run_exploration",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked for exploration.",
    })).rejects.toThrow("Ambient Workflow Agent exploration is not available in this runtime.");
    await expect(applyWorkflowAction({
      action: "approve_artifact",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner approved the artifact.",
    }, { reviewArtifact: vi.fn() })).rejects.toThrow("Workflow preview review requires an artifact id.");
    await expect(applyWorkflowAction({
      action: "resume_checkpoint",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      runId: "run-1",
      reason: "Owner requested recovery.",
    }, { recoverRun: vi.fn() })).rejects.toThrow("Workflow recovery requires a run id, event id, and recovery action.");
    await expect(applyWorkflowAction({
      action: "cancel_run",
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner canceled the run.",
    }, { cancelRun: vi.fn() })).rejects.toThrow("Workflow cancellation requires a run id.");
  });

  it("applies Remote Ambient Surface setting updates through injected settings dependencies", async () => {
    const threadEvents: unknown[] = [];
    const threads = new Map<string, any>([
      ["thread-1", threadSummary()],
    ]);
    const updateThreadSettings = vi.fn((threadId: string, next: any) => {
      const updated = { ...threads.get(threadId), ...next };
      threads.set(threadId, updated);
      return updated;
    });
    let voice = voiceSettings();
    let stt = sttSettings();
    let media = { generatedMediaAutoplay: false };
    let planner = { autoFinalize: true };
    let search: any = {};
    const voiceUpdateSettings = vi.fn(async (next) => {
      voice = next;
      return next;
    });
    const sttUpdateSettings = vi.fn(async (next) => {
      stt = next;
      return next;
    });
    const mediaUpdateSettings = vi.fn(async (next) => {
      media = next;
      return next;
    });
    const plannerUpdateSettings = vi.fn(async (next) => {
      planner = next;
      return next;
    });
    const searchUpdateSettings = vi.fn(async (next) => {
      search = next;
      return next;
    });
    const discoverAmbientCliPackages = vi.fn(async (_workspacePath: string, options?: unknown) => {
      expect(options).toEqual({ includeHealth: true });
      return searchCatalog();
    });
    const baseOptions = () => ({
      threadId: "thread-1",
      workspacePath: "/workspace",
      getThread: (threadId: string) => threads.get(threadId),
      updateThreadSettings,
      onThreadUpdated: (thread: unknown) => threadEvents.push(thread),
      voice: {
        readSettings: () => voice,
        updateSettings: voiceUpdateSettings,
        onStateUpdated: vi.fn(),
      },
      stt: {
        readSettings: () => stt,
        updateSettings: sttUpdateSettings,
      },
      listSttProviders: vi.fn(async () => [sttProvider()]),
      media: {
        readSettings: () => media,
        updateSettings: mediaUpdateSettings,
      },
      planner: {
        readSettings: () => planner,
        updateSettings: plannerUpdateSettings,
      },
      search: {
        readSettings: () => search,
        updateSettings: searchUpdateSettings,
      },
      discoverAmbientCliPackages,
    });
    const applySettingUpdate = (input: Parameters<typeof messagingRemoteSurfaceCommandApplySettingUpdate>[0]["input"]) =>
      messagingRemoteSurfaceCommandApplySettingUpdate({
        ...baseOptions(),
        input,
      });

    const threadResult = await applySettingUpdate({
      settingKey: "thread",
      operation: "thread_settings",
      field: "thinkingLevel",
      value: "high",
      reason: "Owner asked for deeper thinking.",
    });
    const voiceResult = await applySettingUpdate({
      settingKey: "voice",
      operation: "voice_policy",
      field: "autoplay",
      value: true,
      reason: "Owner enabled voice autoplay.",
    });
    const sttResult = await applySettingUpdate({
      settingKey: "stt",
      operation: "stt_policy",
      field: "autoSendAfterTranscription",
      value: false,
      reason: "Owner disabled auto-send.",
    });
    const mediaResult = await applySettingUpdate({
      settingKey: "media",
      operation: "media_playback",
      field: "generatedMediaAutoplay",
      value: true,
      reason: "Owner enabled generated media autoplay.",
    });
    const plannerResult = await applySettingUpdate({
      settingKey: "planner",
      operation: "planner_finalization",
      field: "autoFinalize",
      value: false,
      reason: "Owner disabled planner auto-finalize.",
    });
    const searchResult = await applySettingUpdate({
      settingKey: "search",
      operation: "search_preference",
      providerAlias: "brave-search",
      mode: "require",
      fallback: "block",
      reason: "Owner prefers Brave.",
    });

    expect(updateThreadSettings).toHaveBeenCalledWith("thread-1", { thinkingLevel: "high" });
    expect(threadEvents).toHaveLength(1);
    expect(threadResult).toMatchObject({
      settingKey: "thread",
      operation: "thread_settings",
      changed: true,
      nextSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=high; model=ambient",
    });
    expect(threadResult.text).toContain("Thinking level: medium -> high");

    expect(voiceUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ autoplay: true }), {
      source: "chat-tool",
      toolName: "ambient_messaging_remote_surface_command_apply",
      threadId: "thread-1",
      summary: "Remote Ambient Surface updated voice policy settings.",
    });
    expect(voiceResult).toMatchObject({
      settingKey: "voice",
      operation: "voice_policy",
      changed: true,
      nextSummary: "enabled=true; mode=assistant-final; autoplay=true; longReply=summarize; maxChars=1200; provider=voice-cap; voice=alloy",
    });

    expect(sttUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ autoSendAfterTranscription: false }));
    expect(sttResult).toMatchObject({
      settingKey: "stt",
      operation: "stt_policy",
      changed: true,
    });
    expect(sttResult.nextSummary).toContain("autoSendAfterTranscription=false");

    expect(mediaUpdateSettings).toHaveBeenCalledWith({ generatedMediaAutoplay: true });
    expect(mediaResult).toMatchObject({
      settingKey: "media",
      operation: "media_playback",
      changed: true,
      previousSummary: "generatedMediaAutoplay=false",
      nextSummary: "generatedMediaAutoplay=true",
    });

    expect(plannerUpdateSettings).toHaveBeenCalledWith({ autoFinalize: false });
    expect(plannerResult).toMatchObject({
      settingKey: "planner",
      operation: "planner_finalization",
      changed: true,
      previousSummary: "autoFinalize=true",
      nextSummary: "autoFinalize=false",
    });

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith("/workspace", { includeHealth: true });
    expect(searchUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      webResearch: expect.objectContaining({
        fallbackPolicy: { allowBrowserFallback: false },
      }),
    }));
    expect(searchResult).toMatchObject({
      settingKey: "search",
      operation: "search_preference",
      changed: true,
    });
    expect(searchResult.text).toContain("Brave Search");
  });

  it("preserves Remote Ambient Surface setting update safety and no-op behavior", async () => {
    const updateThreadSettings = vi.fn();
    const baseOptions = {
      threadId: "thread-1",
      workspacePath: "/workspace",
      getThread: () => threadSummary({ collaborationMode: "agent" }),
      updateThreadSettings,
      onThreadUpdated: vi.fn(),
      listSttProviders: vi.fn(async () => []),
      discoverAmbientCliPackages: vi.fn(async () => ({ packages: [], errors: [] })),
    };

    await expect(messagingRemoteSurfaceCommandApplySettingUpdate({
      ...baseOptions,
      getThread: () => threadSummary({ collaborationMode: "planner" }),
      input: {
        settingKey: "media",
        operation: "media_playback",
        field: "generatedMediaAutoplay",
        value: true,
        reason: "Owner enabled media autoplay.",
      },
    })).rejects.toThrow("Remote Ambient Surface settings changes are blocked in Planner Mode.");

    const noop = await messagingRemoteSurfaceCommandApplySettingUpdate({
      ...baseOptions,
      input: {
        settingKey: "thread",
        operation: "thread_settings",
        field: "thinkingLevel",
        value: "medium",
        reason: "Owner kept current thinking.",
      },
    });
    expect(updateThreadSettings).not.toHaveBeenCalled();
    expect(noop).toMatchObject({
      settingKey: "thread",
      operation: "thread_settings",
      changed: false,
      previousSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=medium; model=ambient",
      nextSummary: "thread=Launch room; id=thread-1; mode=agent; thinkingLevel=medium; model=ambient",
    });
    await expect(messagingRemoteSurfaceCommandApplySettingUpdate({
      ...baseOptions,
      input: {
        settingKey: "voice",
        operation: "voice_policy",
        field: "wat",
        value: true,
        reason: "Owner tried an unsupported field.",
      },
    })).rejects.toThrow("Ambient voice settings updates are not available in this runtime.");
  });

  it("builds Remote Ambient Surface command apply approval requests", () => {
    expect(messagingRemoteSurfaceCommandApplyPermissionRequest({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      preview: commandResult(),
    })).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_remote_surface_command_apply",
      title: "Apply Remote Ambient Surface command?",
      message: "Apply workflow_action from queued projection projection-ready.",
      risk: "plugin-tool",
      reusableScopes: ["thread"],
      grantTargetLabel: "remote-surface-command:projection-ready",
      grantTargetIdentity: "projection-ready:workflow_action:run workflow",
      allowedReason: "User approved Remote Ambient Surface command apply.",
      deniedReason: "User denied Remote Ambient Surface command apply.",
    });
  });

  it("returns a blocked apply response during preflight without requesting permission", async () => {
    const permissionRequests: unknown[] = [];
    let threadReads = 0;

    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview({
        status: "blocked",
        canApplyNow: false,
        blockers: ["Queued projection was not found in the messaging gateway runtime."],
      }),
      getThread: () => {
        threadReads += 1;
        return { id: "thread-1" };
      },
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    });

    expect(threadReads).toBe(0);
    expect(permissionRequests).toEqual([]);
    expect(preflight).toMatchObject({
      status: "blocked",
      approvalRecorded: false,
      response: {
        details: {
          status: "blocked",
          commandStatus: "blocked",
          queuedProjectionId: "projection-ready",
        },
      },
    });
  });

  it("skips permission during preflight when approval is not required", async () => {
    let threadReads = 0;
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview({ approvalRequired: false }),
      getThread: () => {
        threadReads += 1;
        return { id: "thread-1" };
      },
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async () => {
        throw new Error("Permission should not be requested.");
      },
    });

    expect(threadReads).toBe(0);
    expect(preflight).toEqual({
      status: "ready",
      approvalRecorded: false,
    });
  });

  it("records approval during preflight when permission is allowed", async () => {
    const permissionRequests: unknown[] = [];
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview(),
      getThread: () => ({ id: "thread-1" }),
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async (request) => {
        permissionRequests.push(request);
        return true;
      },
    });

    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      thread: { id: "thread-1" },
      workspace: { path: "/workspace" },
      toolName: "ambient_messaging_remote_surface_command_apply",
      grantTargetLabel: "remote-surface-command:projection-ready",
    });
    expect(preflight).toEqual({
      status: "ready",
      approvalRecorded: true,
    });
  });

  it("returns a denied apply response during preflight when permission is denied", async () => {
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview: commandPreview(),
      getThread: () => ({ id: "thread-1" }),
      workspace: { path: "/workspace" },
      resolveFirstPartyPluginPermission: async () => false,
    });

    expect(preflight).toMatchObject({
      status: "denied",
      approvalRecorded: false,
      response: {
        details: {
          status: "denied",
          commandStatus: "ready",
          queuedProjectionId: "projection-ready",
        },
      },
    });
  });

  it("builds project-switch apply plans", () => {
    expect(messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: commandPreview(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    })).toEqual({ status: "none" });

    expect(messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: false,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    })).toMatchObject({
      status: "unavailable",
      message: "Ambient active project switching is not available in this runtime.",
      event: {
        kind: "active_project_switch",
        status: "failed",
        threadId: "thread-1",
        queuedProjectionId: "projection-switch",
        projectName: "Research project",
        failedAt: "2026-06-11T00:00:00.000Z",
        relaySuggested: true,
      },
    });

    expect(messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: true,
      failedAt: "2026-06-11T00:00:00.000Z",
    })).toMatchObject({
      status: "pending",
      deferProjectSwitch: true,
      targetProject: {
        path: "/workspace/research",
        name: "Research project",
      },
      event: {
        kind: "active_project_switch",
        status: "pending",
        summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
        relaySuggested: false,
      },
      projectSwitch: {
        workspacePath: "/workspace/research",
        reason: "remote-surface-command:switch_project",
        projectName: "Research project",
      },
    });
  });

  it("does not apply project switches when the project-switch plan has no work", async () => {
    const recordRuntimeEvent = vi.fn();
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(messagingRemoteSurfaceCommandApplyProjectSwitch({
      projectSwitchPlan: { status: "none" },
      recordRuntimeEvent,
      storePendingProjectSwitch,
      completeProjectSwitch,
    })).resolves.toEqual({});

    expect(recordRuntimeEvent).not.toHaveBeenCalled();
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("records unavailable project-switch events and preserves the runtime error", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: false,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(messagingRemoteSurfaceCommandApplyProjectSwitch({
      projectSwitchPlan,
      recordRuntimeEvent,
      storePendingProjectSwitch,
      completeProjectSwitch,
    })).rejects.toThrow("Ambient active project switching is not available in this runtime.");

    expect(recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: "active_project_switch",
      status: "failed",
      threadId: "thread-1",
      queuedProjectionId: "projection-switch",
    }));
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("queues deferred project switches after recording the pending runtime event", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: true,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn();

    await expect(messagingRemoteSurfaceCommandApplyProjectSwitch({
      projectSwitchPlan,
      recordRuntimeEvent,
      storePendingProjectSwitch,
      completeProjectSwitch,
    })).resolves.toEqual({});

    expect(recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: "active_project_switch",
      status: "pending",
      summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
    }));
    expect(storePendingProjectSwitch).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
      projectName: "Research project",
      runtimeEventId: "remote-surface-event-1",
    });
    expect(completeProjectSwitch).not.toHaveBeenCalled();
  });

  it("completes immediate project switches after recording the pending runtime event", async () => {
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview: switchProjectResult(),
      threadId: "thread-1",
      switchProjectAvailable: true,
      deferProjectSwitch: false,
      failedAt: "2026-06-11T00:00:00.000Z",
    });
    const recordRuntimeEvent = vi.fn(() => ({ id: "remote-surface-event-1" }));
    const storePendingProjectSwitch = vi.fn();
    const completeProjectSwitch = vi.fn(async () => undefined);

    await expect(messagingRemoteSurfaceCommandApplyProjectSwitch({
      projectSwitchPlan,
      recordRuntimeEvent,
      storePendingProjectSwitch,
      completeProjectSwitch,
    })).resolves.toEqual({
      completedProjectSwitch: switchProjectResult().targetProject,
    });

    expect(recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: "active_project_switch",
      status: "pending",
      summary: "Active Ambient project switch to Research project is being applied now.",
    }));
    expect(completeProjectSwitch).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
      projectName: "Research project",
      runtimeEventId: "remote-surface-event-1",
    });
    expect(storePendingProjectSwitch).not.toHaveBeenCalled();
  });

  it("builds failed project-switch runtime events when project switching is unavailable", () => {
    expect(messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent({
      preview: switchProjectResult(),
      threadId: "thread-1",
      message: "Ambient active project switching is not available in this runtime.",
      failedAt: "2026-06-11T00:00:00.000Z",
    })).toEqual({
      kind: "active_project_switch",
      status: "failed",
      title: "Switch to Research project",
      summary: "Ambient active project switching is not available in this runtime.",
      threadId: "thread-1",
      queuedProjectionId: "projection-switch",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projectName: "Research project",
      failedAt: "2026-06-11T00:00:00.000Z",
      error: "Ambient active project switching is not available in this runtime.",
      relaySuggested: true,
    });
  });

  it("builds pending project-switch runtime events for immediate and deferred switches", () => {
    expect(messagingRemoteSurfaceCommandSwitchProjectPendingEvent({
      preview: switchProjectResult(),
      threadId: "thread-1",
      deferProjectSwitch: false,
    })).toEqual({
      kind: "active_project_switch",
      status: "pending",
      title: "Switch to Research project",
      summary: "Active Ambient project switch to Research project is being applied now.",
      threadId: "thread-1",
      queuedProjectionId: "projection-switch",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projectName: "Research project",
      relaySuggested: false,
    });

    expect(messagingRemoteSurfaceCommandSwitchProjectPendingEvent({
      preview: switchProjectResult(),
      threadId: "thread-1",
      deferProjectSwitch: true,
    })).toMatchObject({
      status: "pending",
      summary: "Active Ambient project switch to Research project is scheduled after the current Pi turn finishes.",
      relaySuggested: false,
    });
  });

  it("builds project-switch completion runtime event patches", () => {
    expect(messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch({
      message: "Ambient active project switching is not available in this runtime.",
      failedAt: "2026-06-11T00:00:00.000Z",
    })).toEqual({
      status: "failed",
      summary: "Active Ambient project switch failed because this runtime does not expose project switching.",
      failedAt: "2026-06-11T00:00:00.000Z",
      error: "Ambient active project switching is not available in this runtime.",
      relaySuggested: true,
    });

    expect(messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
      projectName: "Research project",
      completedAt: "2026-06-11T00:00:01.000Z",
    })).toEqual({
      status: "completed",
      summary: "Active Ambient project switched to Research project.",
      completedAt: "2026-06-11T00:00:01.000Z",
      relaySuggested: true,
    });

    expect(messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
      completedAt: "2026-06-11T00:00:02.000Z",
    })).toMatchObject({
      status: "completed",
      summary: "Active Ambient project switch completed.",
      relaySuggested: true,
    });

    expect(messagingRemoteSurfaceCommandSwitchProjectFailedPatch({
      projectName: "Research project",
      message: "Could not switch.",
      failedAt: "2026-06-11T00:00:03.000Z",
    })).toEqual({
      status: "failed",
      summary: "Active Ambient project switch to Research project failed.",
      failedAt: "2026-06-11T00:00:03.000Z",
      error: "Could not switch.",
      relaySuggested: true,
    });

    expect(messagingRemoteSurfaceCommandSwitchProjectCanceledPatch({
      canceledAt: "2026-06-11T00:00:04.000Z",
    })).toEqual({
      status: "canceled",
      summary: "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
      canceledAt: "2026-06-11T00:00:04.000Z",
      relaySuggested: true,
    });
  });

  it("completes pending project switches with the runtime switch callback", async () => {
    const switchProject = vi.fn(async () => undefined);
    const patches: Array<{ eventId: string; patch: unknown }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      switchProject,
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      now: () => "2026-06-11T00:00:01.000Z",
    });

    expect(result).toBe("completed");
    expect(switchProject).toHaveBeenCalledWith({
      workspacePath: "/workspace/research",
      reason: "remote-surface-command:switch_project",
    });
    expect(patches).toEqual([{
      eventId: "remote-surface-event-1",
      patch: {
        status: "completed",
        summary: "Active Ambient project switched to Research project.",
        completedAt: "2026-06-11T00:00:01.000Z",
        relaySuggested: true,
      },
    }]);
  });

  it("marks pending project switches failed when project switching is unavailable", async () => {
    const patches: Array<{ eventId: string; patch: unknown }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      now: () => "2026-06-11T00:00:02.000Z",
    });

    expect(result).toBe("failed");
    expect(patches).toEqual([{
      eventId: "remote-surface-event-1",
      patch: {
        status: "failed",
        summary: "Active Ambient project switch failed because this runtime does not expose project switching.",
        failedAt: "2026-06-11T00:00:02.000Z",
        error: "Ambient active project switching is not available in this runtime.",
        relaySuggested: true,
      },
    }]);
  });

  it("marks pending project switches failed, emits runtime errors, and can rethrow failures", async () => {
    const switchProject = vi.fn(async () => {
      throw new Error("Could not switch.");
    });
    const patches: Array<{ eventId: string; patch: unknown }> = [];
    const emittedErrors: Array<{ message: string; threadId: string; workspacePath: string }> = [];

    const result = await completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      switchProject,
      threadId: "thread-1",
      workspacePath: "/workspace/current",
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      emitError: (event) => emittedErrors.push(event),
      now: () => "2026-06-11T00:00:03.000Z",
    });

    expect(result).toBe("failed");
    expect(patches).toEqual([{
      eventId: "remote-surface-event-1",
      patch: {
        status: "failed",
        summary: "Active Ambient project switch to Research project failed.",
        failedAt: "2026-06-11T00:00:03.000Z",
        error: "Could not switch.",
        relaySuggested: true,
      },
    }]);
    expect(emittedErrors).toEqual([{
      message: "Could not switch.",
      threadId: "thread-1",
      workspacePath: "/workspace/current",
    }]);

    await expect(completeMessagingRemoteSurfaceCommandPendingProjectSwitch({
      projectSwitch: pendingProjectSwitch(),
      switchProject,
      updateRuntimeEvent: () => undefined,
      throwOnFailure: true,
      now: () => "2026-06-11T00:00:04.000Z",
    })).rejects.toThrow("Could not switch.");
  });

  it("ignores after-run project switch finalization when no switch is pending", () => {
    const updateRuntimeEvent = vi.fn();
    const scheduleCompletion = vi.fn();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      shouldEmitQueueClear: true,
      updateRuntimeEvent,
      scheduleCompletion,
      now: () => "2026-06-11T00:00:05.000Z",
    });

    expect(result).toBe("none");
    expect(updateRuntimeEvent).not.toHaveBeenCalled();
    expect(scheduleCompletion).not.toHaveBeenCalled();
  });

  it("cancels pending project switches when a run does not clear the queue", () => {
    const patches: Array<{ eventId: string; patch: unknown }> = [];
    const scheduleCompletion = vi.fn();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      projectSwitch: pendingProjectSwitch(),
      shouldEmitQueueClear: false,
      updateRuntimeEvent: (eventId, patch) => patches.push({ eventId, patch }),
      scheduleCompletion,
      now: () => "2026-06-11T00:00:05.000Z",
    });

    expect(result).toBe("canceled");
    expect(scheduleCompletion).not.toHaveBeenCalled();
    expect(patches).toEqual([{
      eventId: "remote-surface-event-1",
      patch: {
        status: "canceled",
        summary: "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
        canceledAt: "2026-06-11T00:00:05.000Z",
        relaySuggested: true,
      },
    }]);
  });

  it("schedules pending project switch completion after a queue-clearing run", () => {
    const updateRuntimeEvent = vi.fn();
    const scheduled: unknown[] = [];
    const projectSwitch = pendingProjectSwitch();

    const result = finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
      projectSwitch,
      shouldEmitQueueClear: true,
      updateRuntimeEvent,
      scheduleCompletion: (input) => scheduled.push(input),
      now: () => "2026-06-11T00:00:06.000Z",
    });

    expect(result).toBe("scheduled");
    expect(updateRuntimeEvent).not.toHaveBeenCalled();
    expect(scheduled).toEqual([projectSwitch]);
  });
});

function commandPreview(overrides: Partial<MessagingRemoteSurfaceCommandPreview> = {}): MessagingRemoteSurfaceCommandPreview {
  return {
    status: "ready",
    canApplyNow: true,
    queuedProjectionId: "projection-ready",
    commandText: "run workflow",
    commandKind: "workflow_action",
    approvalRequired: true,
    wouldPersistBinding: true,
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    blockers: [],
    policyNotes: ["Policy note."],
    nextSteps: ["Next step."],
    textPreview: "run workflow",
    ...overrides,
  };
}

function pendingProjectSwitch() {
  return {
    workspacePath: "/workspace/research",
    reason: "remote-surface-command:switch_project",
    projectName: "Research project",
    runtimeEventId: "remote-surface-event-1",
  };
}

function commandResult(): MessagingRemoteSurfaceCommandResult {
  return {
    ...commandPreview(),
    applyStatus: "applied",
    applied: true,
    approvalRecorded: true,
  };
}

function activeBinding(overrides: Partial<MessagingBindingDescriptor> = {}): MessagingBindingDescriptor {
  return {
    id: "binding-1",
    providerId: "telegram-tdlib",
    authProfileId: "owner-profile",
    conversationId: "owner-chat",
    purpose: "remote_ambient_surface",
    status: "active",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

function bindingList(binding: MessagingBindingDescriptor = activeBinding()): MessagingBindingListResult {
  return {
    bindings: [binding],
    bindingCount: 1,
    activeBindingCount: binding.status === "active" ? 1 : 0,
    remoteAmbientSurfaceCount: binding.purpose === "remote_ambient_surface" ? 1 : 0,
    messagingConnectorCount: binding.purpose === "messaging_connector" ? 1 : 0,
    headlessSafeBindingCount: binding.headlessSafe ? 1 : 0,
  };
}

function runtimeSurface(): RuntimeSurfaceSnapshot {
  return {
    workspace: {
      name: "AmbientDesktop",
      path: "/workspace",
    },
    projects: [{
      id: "/workspace/new-project",
      name: "New project",
      path: "/workspace/new-project",
      updatedAt: "2026-06-11T00:00:00.000Z",
      threadCount: 0,
      active: false,
    }],
    chats: [{
      id: "chat-created",
      title: "Launch room",
      updatedAt: "2026-06-11T00:00:00.000Z",
      permissionMode: "standard",
      collaborationMode: "default",
      model: "ambient",
      thinkingLevel: "medium",
      messagePreview: "",
    }],
    workflowAgents: [{
      id: "workflow-created",
      title: "Launch workflow",
      projectPath: "/workspace",
      phase: "discovery",
    }],
    pendingApprovals: [],
    permissionGrants: [],
    permissionAudit: [],
    relaySummaries: [],
    settings: [],
    limits: {
      projectCount: 1,
      chatCount: 1,
      workflowAgentCount: 1,
      pendingApprovalCount: 0,
      permissionGrantCount: 0,
      permissionAuditCount: 0,
      relaySummaryCount: 0,
      returnedProjectCount: 1,
      returnedChatCount: 1,
      returnedWorkflowAgentCount: 1,
      returnedPendingApprovalCount: 0,
      returnedPermissionGrantCount: 0,
      returnedPermissionAuditCount: 0,
      returnedRelaySummaryCount: 0,
    },
  };
}

function switchProjectResult(): MessagingRemoteSurfaceCommandResult {
  return {
    ...commandResult(),
    queuedProjectionId: "projection-switch",
    commandText: "switch project Research project",
    commandKind: "switch_project",
    textPreview: "switch project Research project",
    queuedProjection: {
      id: "projection-switch",
      providerId: "telegram-tdlib",
      conversationId: "owner-chat",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projection: {} as any,
      queuedAt: "2026-06-11T00:00:00.000Z",
    },
    binding: {
      id: "binding-1",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
    },
    targetProject: {
      id: "/workspace/research",
      path: "/workspace/research",
      name: "Research project",
      updatedAt: "2026-06-11T00:00:00.000Z",
      threadCount: 0,
      active: false,
    },
  };
}

function workflowThread(overrides: Partial<{ id: string; title: string; phase: string }> = {}): { id: string; title: string; phase: string } {
  return {
    id: "workflow-1",
    title: "Launch workflow",
    phase: "discovery",
    ...overrides,
  };
}

function threadSummary(overrides: Record<string, unknown> = {}): any {
  return {
    id: "thread-1",
    title: "Launch room",
    collaborationMode: "agent",
    thinkingLevel: "medium",
    model: "ambient",
    ...overrides,
  };
}

function voiceSettings(overrides: Record<string, unknown> = {}): any {
  return {
    enabled: true,
    mode: "assistant-final",
    autoplay: false,
    providerCapabilityId: "voice-cap",
    voiceId: "alloy",
    maxChars: 1200,
    longReply: "summarize",
    format: "mp3",
    artifactCacheMaxMb: 64,
    ...overrides,
  };
}

function sttSettings(overrides: Record<string, unknown> = {}): any {
  return {
    enabled: true,
    providerCapabilityId: "stt-cap",
    spokenLanguage: "en",
    mode: "push-to-talk",
    autoSendAfterTranscription: true,
    silenceFinalizeSeconds: 1,
    noSpeechGate: {
      enabled: true,
      rmsThresholdDbfs: -45,
    },
    bargeIn: {
      stopTtsOnSpeech: true,
      queueWhileAgentRuns: false,
    },
    ...overrides,
  };
}

function sttProvider(overrides: Record<string, unknown> = {}): any {
  return {
    packageId: "stt-package",
    packageName: "ambient-stt",
    command: "transcribe",
    capabilityId: "stt-cap",
    providerId: "stt-provider",
    label: "Ambient STT",
    languages: ["en"],
    defaultLanguage: "en",
    installed: true,
    available: true,
    availabilityReason: "ready",
    ...overrides,
  };
}

function searchCatalog(): any {
  return {
    packages: [{
      id: "pkg-brave",
      name: "brave-search",
      description: "Brave Search provider",
      installed: true,
      errors: [],
      envRequirements: [],
      skills: [],
      generated: {
        installerShape: "search-provider",
        provider: "Brave Search",
      },
      commands: [{
        name: "search",
        description: "Search the public web",
      }],
      healthChecks: [],
    }],
    errors: [],
  };
}
