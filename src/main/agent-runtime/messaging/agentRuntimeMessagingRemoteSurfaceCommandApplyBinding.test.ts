import { describe, expect, it, vi } from "vitest";

import {
  messagingRemoteSurfaceCommandApplyBindingPlan,
  messagingRemoteSurfaceCommandApplyBindingUpdates,
  messagingRemoteSurfaceCommandApplyCreatePlan,
  messagingRemoteSurfaceCommandApplyCreatedResources,
  messagingRemoteSurfaceCommandApplyResultOptions,
  messagingRemoteSurfaceCommandCreatedResourceRefs,
  messagingRemoteSurfaceCommandCreatedScopeBindingUpdates,
  messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  activeBinding,
  bindingList,
  commandPreview,
  runtimeSurface,
  switchProjectResult,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

describe("Remote Ambient Surface command apply binding and create plans", () => {
  it("builds created-scope binding updates in runtime apply order", () => {
    expect(
      messagingRemoteSurfaceCommandCreatedScopeBindingUpdates({
        preview: commandPreview({
          binding: activeBinding(),
          commandKind: "create_workflow",
          commandText: "create workflow Launch workflow",
          textPreview: "create workflow Launch workflow",
        }),
        createdProjectPath: "/workspace/new-project",
        createdChatThreadId: "chat-created",
        createdWorkflowThreadId: "workflow-created",
      }),
    ).toEqual([
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
    expect(
      messagingRemoteSurfaceCommandCreatedScopeBindingUpdates({
        preview: commandPreview({
          commandKind: "create_chat",
          commandText: "create chat Launch room",
          textPreview: "create chat Launch room",
        }),
        createdChatThreadId: "chat-created",
      }),
    ).toEqual([]);
  });

  it("builds Remote Ambient Surface command apply binding plans", () => {
    expect(
      messagingRemoteSurfaceCommandApplyBindingPlan({
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
      }),
    ).toEqual({
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

    expect(
      messagingRemoteSurfaceCommandApplyBindingPlan({
        preview: commandPreview({
          binding: activeBinding(),
          commandKind: "create_workflow",
          commandText: "create workflow Launch workflow",
          textPreview: "create workflow Launch workflow",
        }),
        createdProjectPath: "/workspace/new-project",
        createdChatThreadId: "chat-created",
        createdWorkflowThreadId: "workflow-created",
      }),
    ).toEqual({
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

    expect(appliedUpdates).toEqual([bindingPlan.initialBindingUpdate, ...bindingPlan.createdScopeBindingUpdates]);
    expect(updatedBinding).toMatchObject({ id: "updated-3" });
    expect(
      messagingRemoteSurfaceCommandApplyBindingUpdates({
        bindingPlan: { createdScopeBindingUpdates: [] },
        updateRemoteSurfaceScope: () => activeBinding({ id: "unused" }),
      }),
    ).toBeUndefined();
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

    expect(
      messagingRemoteSurfaceCommandApplyResultOptions({
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
      }),
    ).toEqual({
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

    expect(
      messagingRemoteSurfaceCommandApplyResultOptions({
        preview,
        approvalRecorded: true,
        bindings: bindingList(updatedBinding),
        surface: runtimeSurface(),
        completedProjectSwitch: targetProject,
      }),
    ).toEqual({
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

    expect(
      messagingRemoteSurfaceCommandApplyCreatePlan(
        commandPreview({
          commandKind: "create_project",
          targetProjectCreate: projectCreateRequest,
        }),
      ),
    ).toEqual({ projectCreateRequest });
    expect(
      messagingRemoteSurfaceCommandApplyCreatePlan(
        commandPreview({
          commandKind: "create_chat",
          newChatTitle: "  Launch room  ",
        }),
      ),
    ).toEqual({ createChatTitle: "Launch room" });
    expect(
      messagingRemoteSurfaceCommandApplyCreatePlan(
        commandPreview({
          commandKind: "create_workflow",
          targetWorkflowCreate: workflowCreateRequest,
        }),
      ),
    ).toEqual({ workflowCreateRequest });
  });

  it("builds workflow thread create summary inputs", () => {
    expect(
      messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
        workflowCreateRequest: {
          title: "Launch workflow",
          initialRequest: "Build the launch checklist.",
          projectPath: "/workspace/new-project",
          reason: "Owner created a workflow from remote surface.",
        },
        defaultProjectPath: "/workspace",
      }),
    ).toEqual({
      title: "Launch workflow",
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace/new-project",
      traceMode: "production",
      phase: "discovery",
    });

    expect(
      messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
        workflowCreateRequest: {
          initialRequest: "Build the launch checklist.",
          reason: "Owner created a workflow from remote surface.",
        },
        defaultProjectPath: "/workspace",
      }),
    ).toEqual({
      initialRequest: "Build the launch checklist.",
      projectPath: "/workspace",
      traceMode: "production",
      phase: "discovery",
    });
  });

  it("builds created resource refs for Remote Ambient Surface command apply", () => {
    expect(
      messagingRemoteSurfaceCommandCreatedResourceRefs({
        createdProject: { path: "/workspace/new-project" },
        createdChatThread: { id: "chat-created" },
        createdWorkflowThread: { id: "workflow-created" },
      }),
    ).toEqual({
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
    expect(createdWorkflowThreads).toEqual([
      {
        title: "Launch workflow",
        initialRequest: "Build the launch checklist.",
        projectPath: "/workspace/new-project",
        traceMode: "production",
        phase: "discovery",
      },
    ]);
    expect(result).toEqual({
      createdProjectPath: "/workspace/new-project",
      createdChatThreadId: "chat-created",
      createdWorkflowThreadId: "workflow-created",
    });
  });

  it("fails created-resource application when project creation is unavailable", async () => {
    await expect(
      messagingRemoteSurfaceCommandApplyCreatedResources({
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
      }),
    ).rejects.toThrow("Ambient project creation is not available in this runtime.");
  });

  it("returns no created resources when create plans are empty", async () => {
    const createChatThread = vi.fn(() => ({ id: "unused-chat" }));
    const createWorkflowAgentThreadSummary = vi.fn(() => ({ id: "unused-workflow" }));

    await expect(
      messagingRemoteSurfaceCommandApplyCreatedResources({
        createPlan: {},
        defaultProjectPath: "/workspace/current",
        createProject: async () => ({ path: "/workspace/unused" }),
        createChatThread,
        createWorkflowAgentThreadSummary,
      }),
    ).resolves.toEqual({});

    expect(createChatThread).not.toHaveBeenCalled();
    expect(createWorkflowAgentThreadSummary).not.toHaveBeenCalled();
  });
});
