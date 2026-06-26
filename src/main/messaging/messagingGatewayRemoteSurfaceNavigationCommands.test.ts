import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandProjectCreateRequest,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway remote surface command tests", () => {
  it("previews and applies Remote Ambient Surface workflow navigation commands from queued projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-remote-command-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [
        {
          id: "folder-1",
          name: "Workflows",
          kind: "custom",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          threads: [
            {
              id: "workflow-1",
              folderId: "folder-1",
              projectName: "ambientCoder",
              projectPath: "/workspace",
              title: "Placebo papers",
              phase: "paused",
              initialRequest: "Find placebo papers",
              preview: "Find recent papers and summarize them.",
              status: "Discovery waiting for answer",
              traceMode: "production",
              discoveryQuestions: [
                {
                  id: "question-1",
                  workflowThreadId: "workflow-1",
                  category: "data_sources",
                  context: "Workflow needs an arxiv access path before compiling.",
                  question: "How should Ambient access arxiv?",
                  choices: [],
                  allowFreeform: true,
                  createdAt: "2026-05-10T00:00:00.000Z",
                },
              ],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open workflow 1",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "open_workflow",
        wouldPersistBinding: true,
        approvalRequired: false,
        targetSurface: "workflow_agents",
        targetWorkflow: { id: "workflow-1" },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Would send provider messages: no");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      expect(update).toEqual({
        bindingId: preview.binding?.id,
        ambientSurface: "workflow_agents",
        workflowId: "workflow-1",
        chatThreadId: null,
        reason: "remote-surface-command:open_workflow",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: false,
        updatedBinding,
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedBinding: {
          ambientSurface: "workflow_agents",
          workflowId: "workflow-1",
        },
        projection: {
          kind: "workflow_status",
          summary: "Workflow is waiting for input.",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("How should Ambient access arxiv?");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "workflow_agents",
        workflowId: "workflow-1",
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("opens chat threads through Remote Ambient Surface commands without provider sends", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-bindings-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [
        {
          id: "chat-1",
          title: "Remote status check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Current status is green.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-4.5",
          thinkingLevel: "minimal",
        },
      ],
      workflowFolders: [],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-chat",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open chat 1",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "open_chat",
        wouldPersistBinding: true,
        approvalRequired: false,
        targetSurface: "chat",
        targetChat: { id: "chat-1" },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Target chat: Remote status check");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      expect(update).toEqual({
        bindingId: preview.binding?.id,
        ambientSurface: "chat",
        workflowId: null,
        chatThreadId: "chat-1",
        reason: "remote-surface-command:open_chat",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: false,
        updatedBinding,
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedBinding: {
          ambientSurface: "chat",
          chatThreadId: "chat-1",
        },
        projection: {
          title: "Remote status check",
          summary: "Chat thread selected: Remote status check.",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Last message preview: Current status is green.");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "chat",
        chatThreadId: "chat-1",
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews approval-gated chat creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-create-chat",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "create chat Remote triage",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "ready",
      commandKind: "create_chat",
      approvalRequired: true,
      wouldPersistBinding: true,
      targetSurface: "chat",
      newChatTitle: "Remote triage",
    });
    expect(messagingRemoteSurfaceCommandBindingUpdate(preview)).toBeUndefined();
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("New chat title: Remote triage");
  });

  it("previews project open and approval-gated project creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-project-command-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const workspace = {
      name: "ambientCoder",
      path: "/workspace/active",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };
    const projects = [
      {
        id: "active-project",
        path: "/workspace/active",
        name: "Active project",
        statePath: "/workspace/active/.ambient-codex",
        sessionPath: "/workspace/active/.ambient-codex/sessions",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      },
      {
        id: "research-project",
        path: "/workspace/research",
        name: "Research project",
        statePath: "/workspace/research/.ambient-codex",
        sessionPath: "/workspace/research/.ambient-codex/sessions",
        createdAt: "2026-05-09T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:02.000Z",
        pinned: true,
        threads: [],
      },
    ];
    const surface = buildRuntimeSurfaceSnapshot({
      workspace,
      threads: [],
      workflowFolders: [],
      projects,
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const openDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open project 2",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const openPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: openDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(openPreview).toMatchObject({
        status: "ready",
        commandKind: "open_project",
        approvalRequired: false,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProject: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(openPreview)).toEqual({
        bindingId: openPreview.binding?.id,
        ambientSurface: "projects",
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:open_project",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(openPreview)!);
      const openProjection = messagingRemoteSurfaceCommandResultProjection({
        preview: openPreview,
        bindings: bindings.list(),
        surface,
      });
      const openResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: openPreview,
        approvalRecorded: false,
        updatedBinding,
        projection: openProjection,
      });
      expect(openResult).toMatchObject({
        applyStatus: "applied",
        projection: {
          title: "Research project",
          summary: "Registered project selected: Research project.",
        },
      });

      const switchDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-switch-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "switch project 2",
          receivedAt: "2026-05-10T00:00:03.000Z",
        },
      });
      const switchPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: switchDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(switchPreview).toMatchObject({
        status: "ready",
        commandKind: "switch_project",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProject: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(switchPreview)).toEqual({
        bindingId: switchPreview.binding?.id,
        ambientSurface: "projects",
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:switch_project",
      });
      const switchUpdatedBinding = bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(switchPreview)!);
      const switchProjection = messagingRemoteSurfaceCommandResultProjection({
        preview: switchPreview,
        bindings: bindings.list(),
        surface,
      });
      const switchResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: switchPreview,
        approvalRecorded: true,
        updatedBinding: switchUpdatedBinding,
        scheduledProjectSwitch: switchPreview.targetProject,
        projection: switchProjection,
      });
      expect(switchResult).toMatchObject({
        applyStatus: "applied",
        approvalRecorded: true,
        scheduledProjectSwitch: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandResultText(switchResult)).toContain("Scheduled active project switch: Research project");

      const createDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-create-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "create project Field Notes at /workspace/field-notes",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const createPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: createDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });
      expect(createPreview).toMatchObject({
        status: "ready",
        commandKind: "create_project",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProjectCreate: {
          name: "Field Notes",
          workspacePath: "/workspace/field-notes",
        },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(createPreview)).toBeUndefined();
      expect(messagingRemoteSurfaceCommandProjectCreateRequest(createPreview)).toMatchObject({
        name: "Field Notes",
        workspacePath: "/workspace/field-notes",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(createPreview)).toContain(
        "New project: name=Field Notes; path=/workspace/field-notes",
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
