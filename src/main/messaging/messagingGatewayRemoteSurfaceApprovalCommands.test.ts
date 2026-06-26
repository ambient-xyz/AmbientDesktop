import { describe, expect, it } from "vitest";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText, routeSyntheticMessagingEvent } from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandApprovalResponse,
  messagingRemoteSurfaceCommandGrantRevokeRequest,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  messagingRemoteSurfaceCommandWorkflowAnswerInput,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway remote surface command tests", () => {
  it("projects and resolves pending permission approvals through Remote Ambient Surface commands", () => {
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
      ambientSurface: "notifications",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
      permissionRequests: [
        {
          id: "permission-telegram-reply",
          threadId: "thread-remote",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          title: "Send Telegram reply?",
          message: "Send one Telegram reply to owner-chat.",
          detail: "Reply text preview: Gateway status looks ready.",
          risk: "plugin-tool",
          reusableScopes: ["thread"],
          grantActionKind: "plugin_tool_execute",
          grantTargetKind: "tool",
          grantTargetLabel: "telegram reply",
          grantTargetHash: "reply-hash",
        },
      ],
    });
    const route = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-notifications",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "notifications",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    expect(route.projection).toMatchObject({
      title: "Notifications, approvals, and grants",
      summary: "Pending approvals: 1; active grants: 0; recent audit entries: 0; relay summaries: 0.",
      actions: expect.arrayContaining([
        expect.objectContaining({ command: "approve request 1" }),
        expect.objectContaining({ command: "deny request 1" }),
      ]),
    });
    expect(messagingProjectionText(route.projection)).toContain("Send Telegram reply?");

    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-approve-permission",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "approve request 1 always thread",
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
      commandKind: "respond_approval",
      approvalRequired: false,
      wouldPersistBinding: false,
      targetSurface: "notifications",
      targetApproval: { id: "permission-telegram-reply" },
      targetApprovalResponse: {
        requestId: "permission-telegram-reply",
        response: "always_thread",
      },
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Approval response: always_thread");
    expect(messagingRemoteSurfaceCommandApprovalResponse(preview)).toEqual(
      expect.objectContaining({
        requestId: "permission-telegram-reply",
        response: "always_thread",
      }),
    );

    const result = messagingRemoteSurfaceCommandAppliedResult({
      preview,
      approvalRecorded: false,
      respondedApproval: messagingRemoteSurfaceCommandApprovalResponse(preview),
      projection: messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      respondedApproval: {
        requestId: "permission-telegram-reply",
        response: "always_thread",
      },
    });
    expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Responded to approval: Send Telegram reply? (always_thread)");
  });

  it("projects and revokes active permission grants through Remote Ambient Surface commands", () => {
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
      ambientSurface: "notifications",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
      permissionGrants: [
        {
          id: "grant-remote-reply",
          createdAt: "2026-05-10T00:00:04.000Z",
          updatedAt: "2026-05-10T00:00:04.000Z",
          createdBy: "user",
          permissionModeAtCreation: "workspace",
          scopeKind: "thread",
          threadId: "thread-remote",
          actionKind: "plugin_tool_execute",
          targetKind: "tool",
          targetHash: "remote-reply-grant",
          targetLabel: "Remote reply grant",
          source: "permission_prompt",
          reason: "User approved remote replies for this thread.",
        },
      ],
      permissionAudit: [
        {
          id: "audit-remote-reply",
          threadId: "thread-remote",
          createdAt: "2026-05-10T00:00:05.000Z",
          permissionMode: "workspace",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          risk: "plugin-tool",
          decision: "allowed",
          reason: "Matched persistent grant.",
          decisionSource: "persistent_grant",
          grantId: "grant-remote-reply",
        },
      ],
    });
    const route = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-notifications-grants",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "notifications",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    expect(route.projection).toMatchObject({
      title: "Notifications, approvals, and grants",
      summary: "Pending approvals: 0; active grants: 1; recent audit entries: 1; relay summaries: 0.",
      actions: expect.arrayContaining([expect.objectContaining({ command: "revoke grant 1" })]),
    });
    expect(messagingProjectionText(route.projection)).toContain("Remote reply grant");

    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-revoke-grant",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "revoke grant 1",
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
      commandKind: "revoke_permission_grant",
      approvalRequired: false,
      wouldPersistBinding: false,
      targetSurface: "notifications",
      targetPermissionGrant: { id: "grant-remote-reply" },
      targetGrantRevoke: {
        grantId: "grant-remote-reply",
        targetLabel: "Remote reply grant",
      },
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Grant revoke: Remote reply grant");
    expect(messagingRemoteSurfaceCommandGrantRevokeRequest(preview)).toEqual(
      expect.objectContaining({
        grantId: "grant-remote-reply",
        targetLabel: "Remote reply grant",
      }),
    );

    const result = messagingRemoteSurfaceCommandAppliedResult({
      preview,
      approvalRecorded: false,
      revokedPermissionGrant: messagingRemoteSurfaceCommandGrantRevokeRequest(preview),
      projection: messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      revokedPermissionGrant: {
        grantId: "grant-remote-reply",
      },
    });
    expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Revoked permission grant: Remote reply grant (grant-remote-reply)");
  });

  it("previews approval-gated workflow discovery answers from selected Remote Ambient Surface workflows", () => {
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
      ambientSurface: "workflow_agents",
      workflowId: "workflow-1",
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
              phase: "discovery",
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
                  choices: [
                    { id: "browser", label: "Use browser", description: "Browse arxiv.org.", recommended: true },
                    { id: "plugin", label: "Use installed plugin", description: "Use pi-arxiv." },
                  ],
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

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-answer-workflow",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "answer B",
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
      commandKind: "answer_workflow_question",
      approvalRequired: true,
      wouldPersistBinding: false,
      targetQuestionId: "question-1",
      answerChoiceId: "plugin",
    });
    expect(messagingRemoteSurfaceCommandWorkflowAnswerInput(preview)).toEqual({
      questionId: "question-1",
      choiceId: "plugin",
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Approval required: yes");
    expect(messagingProjectionText(dispatch.projection)).toContain("B. Use installed plugin");
  });
});
