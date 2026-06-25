import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot, runtimeSurfaceSnapshotText } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText, routeSyntheticMessagingEvent } from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandApprovalResponse,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandGrantRevokeRequest,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandProjectCreateRequest,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  messagingRemoteSurfaceCommandWorkflowAnswerInput,
  messagingRemoteSurfaceCommandWorkflowActionRequest,
  messagingRemoteSurfaceCommandWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway remote surface command tests", () => {
  it("builds a bounded runtime surface snapshot for chat-native navigation", () => {
    const snapshot = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      activeThreadId: "thread-1",
      threads: [
        {
          id: "thread-1",
          title: "Operational Status Check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:02.000Z",
          lastReadAt: "2026-05-10T00:00:03.000Z",
          lastMessagePreview: "It worked.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
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
              title: "Find papers",
              phase: "discovery",
              initialRequest: "Find papers",
              preview: "Find papers",
              status: "Discovery",
              traceMode: "production",
              discoveryQuestions: [],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
      permissionRequests: [
        {
          id: "permission-1",
          threadId: "thread-1",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          title: "Send Telegram reply?",
          message: "Send one Telegram reply to conversation owner-chat.",
          detail: "Send a compact status reply through Telegram.",
          risk: "plugin-tool",
          reusableScopes: ["thread", "workspace"],
          grantActionKind: "plugin_tool_execute",
          grantTargetKind: "tool",
          grantTargetLabel: "telegram reply",
          grantTargetHash: "reply-hash",
        },
      ],
      permissionGrants: [
        {
          id: "grant-1",
          createdAt: "2026-05-10T00:00:04.000Z",
          updatedAt: "2026-05-10T00:00:04.000Z",
          createdBy: "user",
          permissionModeAtCreation: "workspace",
          scopeKind: "thread",
          threadId: "thread-1",
          actionKind: "plugin_tool_execute",
          targetKind: "tool",
          targetHash: "telegram-reply-grant",
          targetLabel: "Telegram reply grant",
          source: "permission_prompt",
          reason: "User approved Telegram replies for this thread.",
        },
      ],
      permissionAudit: [
        {
          id: "audit-1",
          threadId: "thread-1",
          createdAt: "2026-05-10T00:00:05.000Z",
          permissionMode: "workspace",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          risk: "plugin-tool",
          decision: "allowed",
          reason: "Matched persistent grant.",
          decisionSource: "persistent_grant",
          grantId: "grant-1",
        },
      ],
      settings: {
        voice: {
          enabled: true,
          autoplay: false,
          mode: "assistant-final",
          providerCapabilityId: "voice.piper",
          longReply: "summarize",
          maxChars: 1500,
          format: "wav",
          artifactCacheMaxMb: 256,
        },
        search: { webSearch: { activity: "web_search", preferredProvider: "browser", mode: "prefer", fallback: "allow" } },
        media: { generatedMediaAutoplay: true },
        planner: { autoFinalize: true },
        stt: {
          enabled: true,
          providerCapabilityId: "stt.qwen3",
          spokenLanguage: "English",
          mode: "push-to-talk",
          autoSendAfterTranscription: true,
          silenceFinalizeSeconds: 0.8,
          noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
          bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
        },
      },
    });

    expect(snapshot).toMatchObject({
      workspace: { name: "ambientCoder" },
      activeChatId: "thread-1",
      limits: {
        chatCount: 1,
        workflowAgentCount: 1,
        pendingApprovalCount: 1,
        permissionGrantCount: 1,
        permissionAuditCount: 1,
        returnedChatCount: 1,
        returnedWorkflowAgentCount: 1,
        returnedPendingApprovalCount: 1,
        returnedPermissionGrantCount: 1,
        returnedPermissionAuditCount: 1,
      },
    });
    expect(snapshot.pendingApprovals[0]).toMatchObject({
      id: "permission-1",
      title: "Send Telegram reply?",
      responseModes: expect.arrayContaining(["deny", "allow_once", "always_thread", "always_workspace"]),
    });
    expect(snapshot.permissionGrants[0]).toMatchObject({
      id: "grant-1",
      targetLabel: "Telegram reply grant",
      scopeKind: "thread",
    });
    expect(snapshot.permissionAudit[0]).toMatchObject({
      id: "audit-1",
      decision: "allowed",
      decisionSource: "persistent_grant",
    });
    expect(snapshot.settings.find((setting) => setting.key === "security.grants")).toMatchObject({
      label: "Permission grants and pending approvals",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      valueSummary: "pendingApprovals=1; activeGrants=1",
    });
    expect(snapshot.settings.find((setting) => setting.key === "security.log")).toMatchObject({
      label: "Permission log",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      valueSummary: "recentAuditEntries=1",
    });
    expect(snapshot.settings.find((setting) => setting.key === "voice.output")).toMatchObject({
      label: "Voice output policy",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["set voice mode off"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.provider")).toMatchObject({
      label: "Speech provider",
      headlessStatus: "partial",
      headlessReadable: true,
      headlessWritable: false,
      configured: true,
      valueSummary: "provider=stt.qwen3",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.input")).toMatchObject({
      label: "Speech input policy",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["enable speech input", "set speech language English"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.language")).toMatchObject({
      label: "Spoken language",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "spokenLanguage=English",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.behavior")).toMatchObject({
      label: "Speech behavior",
      headlessStatus: "ready",
      headlessWritable: true,
      valueSummary: "enabled=true; autoSendAfterTranscription=true",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.advanced")).toMatchObject({
      label: "Advanced speech recognition",
      headlessStatus: "ready",
      headlessWritable: true,
      valueSummary: "silenceFinalizeSeconds=0.8; noSpeechGate=true; bargeInStopTts=true",
    });
    expect(snapshot.settings.find((setting) => setting.key === "search.preference")).toMatchObject({
      label: "Search preference",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "media.generated")).toMatchObject({
      label: "Generated media playback",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "generatedMediaAutoplay=true",
      commandExamples: expect.arrayContaining(["set generated media autoplay off"]),
    });
    expect(snapshot.chats[0]).toMatchObject({
      id: "thread-1",
      active: true,
      model: "ambient:fast",
      thinkingLevel: "medium",
    });
    expect(snapshot.workflowAgents[0]).toMatchObject({
      id: "workflow-1",
      title: "Find papers",
      phase: "discovery",
      traceMode: "production",
      discoveryQuestionCount: 0,
      answeredDiscoveryQuestionCount: 0,
      unansweredDiscoveryQuestionCount: 0,
      nextCommands: expect.arrayContaining(["run exploration", "compile from exploration"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.model")).toMatchObject({
      label: "Model",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      configured: true,
      valueSummary: "thread=Operational Status Check; model=ambient:fast",
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.mode")).toMatchObject({
      label: "Agent/planner mode",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "thread=Operational Status Check; collaborationMode=agent",
      commandExamples: expect.arrayContaining(["set chat mode planner"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.thinking")).toMatchObject({
      label: "Thinking level",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "thread=Operational Status Check; thinkingLevel=medium",
      commandExamples: expect.arrayContaining(["set chat thinking minimal"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.planner")).toMatchObject({
      label: "Planner finalization",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "autoFinalize=true",
      commandExamples: expect.arrayContaining(["set planner autoFinalize off"]),
    });
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Operational Status Check");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Find papers");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Discovery questions: 0/0 answered");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "Next commands: open workflow workflow-1; run exploration; compile from exploration",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("voice.output: Voice output policy; status=ready");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("speech.provider: Speech provider; status=partial");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "speech.language: Spoken language; status=ready; readable=yes; writable=yes; configured=yes; spokenLanguage=English",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "speech.advanced: Advanced speech recognition; status=ready; readable=yes; writable=yes; configured=yes; silenceFinalizeSeconds=0.8",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("search.preference: Search preference; status=ready");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "media.generated: Generated media playback; status=ready; readable=yes; writable=yes; configured=yes; generatedMediaAutoplay=true",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "model-mode.mode: Agent/planner mode; status=ready; readable=yes; writable=yes; configured=yes; thread=Operational Status Check; collaborationMode=agent",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "model-mode.planner: Planner finalization; status=ready; readable=yes; writable=yes; configured=yes; autoFinalize=true",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain(
      "Mode: agent; thinking=medium; model=ambient:fast; permission=workspace; active=yes",
    );
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Pending approvals: 1/1");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Send Telegram reply?");
  });

  it("routes synthetic Remote Ambient Surface events into chat-native projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "telegram-chat-1",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "workflow_agents",
      workflowId: "workflow-1",
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
      relaySummaries: [
        {
          runtimeEventId: "remote-surface-relay-1",
          title: "Switch to Research project",
          eventStatus: "completed",
          relayActionStatus: "preview-ready",
          relaySuggested: true,
          duplicateBlocked: false,
          summary: "Active Ambient project switched to Research project.",
          queuedProjectionId: "projection-relay-1",
          bindingId: "remote-binding",
          targetProviderId: "telegram-tdlib",
          targetProviderLabel: "Telegram",
          previewToolName: "ambient_messaging_remote_surface_reply_preview",
          applyToolName: "ambient_messaging_remote_surface_reply_apply",
          diagnosticsToolName: "ambient_messaging_telegram_relay_diagnostics",
          previewCommand: "ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1",
          applyCommand: "ambient_messaging_remote_surface_reply_apply runtimeEventId=remote-surface-relay-1",
          diagnosticsCommand: "ambient_messaging_telegram_relay_diagnostics profileId=telegram-local-owner conversationId=telegram-chat-1",
          nextAction:
            "Preview relay by calling ambient_messaging_remote_surface_reply_preview with runtimeEventId remote-surface-relay-1. Apply with ambient_messaging_remote_surface_reply_apply only after preview and explicit approval.",
        },
      ],
    });

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-1",
        providerId: "telegram-tdlib",
        conversationId: "telegram-chat-1",
        sender: { id: "owner-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });

    expect(result.projection).toMatchObject({
      kind: "workflow_status",
      purpose: "remote_ambient_surface",
      bindingId: "remote-binding",
      surface: "workflow_agents",
      summary: "Workflow is waiting for input.",
    });
    expect(messagingProjectionText(result.projection)).toContain("How should Ambient access arxiv?");
    expect(messagingProjectionText(result.projection)).toContain("Status relays:");
    expect(messagingProjectionText(result.projection)).toContain(
      "ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1",
    );
    expect(result.projection.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "relay-preview-remote-surface-relay-1",
          command: "ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1",
        }),
      ]),
    );
    expect(result.promptContext.allowedContext.join("\n")).toContain("Bound surface: workflow_agents");
  });

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

  it("previews and projects approval-gated workflow creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-workflow-create-"));
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
          id: "event-create-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "create workflow Remote status workflow :: Track the Remote Ambient Surface gateway status and summarize blockers.",
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
        commandKind: "create_workflow",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflowCreate: {
          title: "Remote status workflow",
          initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
        },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(preview)).toBeUndefined();
      expect(messagingRemoteSurfaceCommandWorkflowCreateRequest(preview)).toMatchObject({
        title: "Remote status workflow",
        initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("New workflow: Remote status workflow");

      const updatedBinding = bindings.updateRemoteSurfaceScope({
        bindingId: preview.binding!.id,
        ambientSurface: "workflow_agents",
        workflowId: "workflow-created",
        reason: "remote-surface-command:create_workflow",
      });
      const createdSurface = buildRuntimeSurfaceSnapshot({
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
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "discovery",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "Discovery",
                traceMode: "production",
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:01.000Z",
              },
            ],
          },
        ],
      });
      const createdWorkflow = createdSurface.workflowAgents[0];
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface: createdSurface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        ...(createdWorkflow ? { createdWorkflow } : {}),
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        createdWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        updatedBinding: {
          ambientSurface: "workflow_agents",
          workflowId: "workflow-created",
        },
        projection: {
          kind: "workflow_status",
          title: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Created workflow: Remote status workflow");

      const explorationDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-run-exploration",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "run exploration",
          receivedAt: "2026-05-10T00:00:03.000Z",
        },
      });
      const explorationPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: explorationDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(explorationPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        targetWorkflowAction: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandWorkflowActionRequest(explorationPreview)).toMatchObject({
        action: "run_exploration",
        workflowThreadId: "workflow-created",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(explorationPreview)).toContain("Workflow action: run exploration");
      const explorationResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: explorationPreview,
        approvalRecorded: true,
        updatedBinding,
        workflowActionResult: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          traceId: "trace-1",
          graphSnapshotId: "graph-1",
          text: "Workflow Agent exploration completed\nTrace: trace-1\nGraph snapshot: graph-1",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: explorationPreview,
          bindings: bindings.list(),
          surface: createdSurface,
        }),
      });
      expect(explorationResult).toMatchObject({
        applyStatus: "applied",
        workflowActionResult: {
          action: "run_exploration",
          traceId: "trace-1",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(explorationResult)).toContain(
        "Workflow action result: exploration; changed=yes; trace=trace-1; graph=graph-1",
      );

      const compileDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-compile-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "compile from exploration",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const compilePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: compileDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(compilePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "compile_preview",
          workflowThreadId: "workflow-created",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(compilePreview)).toContain("Workflow action: compile preview");

      const reviewSurface = buildRuntimeSurfaceSnapshot({
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
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "ready_for_review",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "ready_for_preview",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestVersion: {
                  id: "version-ready",
                  workflowThreadId: "workflow-created",
                  artifactId: "artifact-ready",
                  version: 1,
                  sourcePath: "/workspace/workflows/remote-status.js",
                  repoPath: "/workspace",
                  status: "ready_for_review",
                  createdBy: "compiler",
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                latestRun: {
                  id: "run-preview",
                  status: "previewed",
                  startedAt: "2026-05-10T00:00:02.000Z",
                  updatedAt: "2026-05-10T00:00:03.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:03.000Z",
              },
            ],
          },
        ],
      });
      expect(reviewSurface.workflowAgents[0]?.nextCommands).toEqual(
        expect.arrayContaining(["approve workflow preview", "reject workflow preview"]),
      );
      const approveDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: reviewSurface,
        event: {
          id: "event-approve-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "approve workflow preview",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const approvePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: approveDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: reviewSurface,
      });
      expect(approvePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          artifactId: "artifact-ready",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(approvePreview)).toContain("Workflow action: approve workflow preview");
      const approveResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: approvePreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          artifactId: "artifact-ready",
          artifactStatus: "approved",
          text: "Workflow preview approved",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(approveResult)).toContain(
        "Workflow action result: artifact approved; changed=yes; artifact=artifact-ready; artifactStatus=approved",
      );

      const runningSurface = buildRuntimeSurfaceSnapshot({
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
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "running",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "running",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-running",
                  status: "running",
                  startedAt: "2026-05-10T00:00:06.000Z",
                  updatedAt: "2026-05-10T00:00:07.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:07.000Z",
              },
            ],
          },
        ],
      });
      expect(runningSurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["cancel workflow"]));
      const cancelDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: runningSurface,
        event: {
          id: "event-cancel-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "cancel workflow",
          receivedAt: "2026-05-10T00:00:08.000Z",
        },
      });
      const cancelPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: cancelDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: runningSurface,
      });
      expect(cancelPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "cancel_run",
          workflowThreadId: "workflow-created",
          runId: "run-running",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(cancelPreview)).toContain("Workflow action: cancel workflow");

      const recoverySurface = buildRuntimeSurfaceSnapshot({
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
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "failed",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "failed",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-failed",
                  status: "failed",
                  startedAt: "2026-05-10T00:00:09.000Z",
                  updatedAt: "2026-05-10T00:00:10.000Z",
                  completedAt: "2026-05-10T00:00:10.000Z",
                },
                graph: {
                  id: "graph-1",
                  workflowThreadId: "workflow-created",
                  version: 1,
                  source: "compile",
                  summary: "Classify records.",
                  nodes: [{ id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." }],
                  edges: [],
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:10.000Z",
              },
            ],
          },
        ],
        workflowRecoveryEvents: [
          {
            id: "event-failed",
            runId: "run-failed",
            type: "ambient.call.error",
            message: "schema mismatch",
            graphNodeId: "classify",
            graphNodeLabel: "Classify",
            graphNodeType: "model_call",
            createdAt: "2026-05-10T00:00:10.000Z",
            retryEligible: true,
            retryLabel: "Retry step",
            retryReasons: ["Retry is eligible when the same input is retained or can be reconstructed from checkpoints."],
            resumeEligible: false,
            resumeReasons: ["Resume from checkpoint requires at least one retained workflow checkpoint."],
            skipEligible: false,
            skipReasons: ["Skip item requires a failed event with a retained item key."],
            commandExamples: ["retry failed step"],
          },
        ],
      });
      expect(recoverySurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["retry failed step"]));
      expect(runtimeSurfaceSnapshotText(recoverySurface)).toContain("Recovery events:");
      const recoveryProjection = routeSyntheticMessagingEvent({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-workflow-status",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "status",
          receivedAt: "2026-05-10T00:00:11.000Z",
        },
      });
      expect(messagingProjectionText(recoveryProjection.projection)).toContain("retry failed step");
      const recoveryDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-retry-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "retry failed step",
          receivedAt: "2026-05-10T00:00:12.000Z",
        },
      });
      const recoveryPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: recoveryDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: recoverySurface,
      });
      expect(recoveryPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          runId: "run-failed",
          eventId: "event-failed",
          graphNodeId: "classify",
          recoveryAction: "retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(recoveryPreview)).toContain("Workflow action: retry failed step");
      const recoveryResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: recoveryPreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          runId: "run-recovered",
          runStatus: "succeeded",
          text: "Workflow recovery run completed\nRecovery action: retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(recoveryResult)).toContain(
        "Workflow action result: recovery retry; changed=yes; run=run-recovered; runStatus=succeeded",
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
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

  it("previews approval-gated settings commands and returns settings projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-settings-"));
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
      settings: {
        voice: {
          enabled: true,
          mode: "assistant-final",
          autoplay: true,
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          voiceId: "en_US-lessac-medium",
          maxChars: 1500,
          longReply: "summarize",
          format: "wav",
          artifactCacheMaxMb: 250,
        },
        search: {
          webSearch: {
            activity: "web_search",
            preferredProvider: "brave-search",
            mode: "prefer",
            fallback: "allow",
            updatedAt: "2026-05-10T00:00:01.000Z",
          },
        },
        stt: {
          enabled: true,
          providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
          spokenLanguage: "English",
          mode: "push-to-talk",
          autoSendAfterTranscription: true,
          silenceFinalizeSeconds: 0.8,
          noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
          bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
        },
        media: { generatedMediaAutoplay: false },
        planner: { autoFinalize: true },
      },
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
          id: "event-set-voice",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set voice mode off",
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
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "voice",
          operation: "voice_policy",
          field: "mode",
          value: "off",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Setting update: voice.mode=off");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        updatedSetting: {
          settingKey: "voice",
          operation: "voice_policy",
          changed: true,
          text: "Ambient voice policy updated",
        },
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        projection: {
          title: "Settings",
          summary: "Headless-readable settings summary.",
        },
      });
      expect(result.projection?.actions.map((action) => action.command)).toEqual(
        expect.arrayContaining([
          "set voice mode off",
          "set voice autoplay on",
          "set chat mode agent",
          "set chat thinking medium",
          "set planner autoFinalize off",
          "set speech language English",
          "set speech silence 0.8",
          "set generated media autoplay on",
          "clear search preference",
        ]),
      );
      expect(result.projection?.actions.map((action) => action.command)).not.toContain("edit setting voice.output");
      expect(result.projection?.bodyLines.join("\n")).toContain("voice.output: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.mode: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.thinking: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.planner: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("search.preference: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.provider: configured; status=partial");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.language: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("media.generated: configured; status=ready");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Updated setting: voice; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("mode=assistant-final");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "settings",
      });

      const speechDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-speech",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set speech language Spanish",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const speechPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: speechDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(speechPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "stt",
          operation: "stt_policy",
          field: "spokenLanguage",
          value: "Spanish",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(speechPreview)).toContain("Setting update: stt.spokenLanguage=Spanish");

      const speechResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: speechPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(speechPreview)!),
        updatedSetting: {
          settingKey: "stt",
          operation: "stt_policy",
          changed: true,
          text: "Ambient STT policy updated\nSpoken language: English -> Spanish",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: speechPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(speechResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "stt", operation: "stt_policy", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Updated setting: stt; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Spoken language: English -> Spanish");

      const mediaDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-media",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set generated media autoplay on",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const mediaPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: mediaDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(mediaPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "media",
          operation: "media_playback",
          field: "generatedMediaAutoplay",
          value: true,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(mediaPreview)).toContain("Setting update: media.generatedMediaAutoplay=true");

      const mediaResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: mediaPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(mediaPreview)!),
        updatedSetting: {
          settingKey: "media",
          operation: "media_playback",
          changed: true,
          text: "Ambient generated media playback updated\nGenerated media autoplay: false -> true",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: mediaPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(mediaResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "media", operation: "media_playback", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Updated setting: media; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Generated media autoplay: false -> true");

      const plannerDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-planner",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set planner autoFinalize off",
          receivedAt: "2026-05-10T00:00:05.500Z",
        },
      });
      const plannerPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: plannerDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(plannerPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "planner",
          operation: "planner_finalization",
          field: "autoFinalize",
          value: false,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(plannerPreview)).toContain("Setting update: planner.autoFinalize=false");

      const plannerResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: plannerPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(plannerPreview)!),
        updatedSetting: {
          settingKey: "planner",
          operation: "planner_finalization",
          changed: true,
          text: "Ambient Planner finalization updated\nAuto-finalize: true -> false",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: plannerPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(plannerResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "planner", operation: "planner_finalization", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Updated setting: planner; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Auto-finalize: true -> false");

      const threadDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-thread",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set chat thinking low",
          receivedAt: "2026-05-10T00:00:06.000Z",
        },
      });
      const threadPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: threadDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(threadPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "chat",
        targetChat: { id: "thread-remote", title: "Remote thread settings target" },
        targetSettingUpdate: {
          settingKey: "thread",
          operation: "thread_settings",
          threadId: "thread-remote",
          field: "thinkingLevel",
          value: "low",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(threadPreview)).toContain(
        "Setting update: thread.thinkingLevel=low (Remote thread settings target)",
      );

      const threadResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: threadPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(threadPreview)!),
        updatedSetting: {
          settingKey: "thread",
          operation: "thread_settings",
          changed: true,
          text: "Ambient chat thread settings updated\nThread: Remote thread settings target (thread-remote)\nThinking level: medium -> low",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: threadPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(threadResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "thread", operation: "thread_settings", changed: true },
        projection: { title: "Remote thread settings target" },
      });
      expect(threadResult.updatedBinding).toMatchObject({
        ambientSurface: "chat",
        chatThreadId: "thread-remote",
      });
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Updated setting: thread; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Thinking level: medium -> low");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

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

  it("blocks Remote Ambient Surface commands for Messaging Connector projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "external-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
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
      workflowFolders: [],
    });

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-connector-command",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local-owner",
        conversationId: "external-chat",
        sender: { id: "external-1" },
        text: "switch surface workflow_agents",
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
      status: "blocked",
      canApplyNow: false,
    });
    expect(preview.blockers.join("\n")).toContain("Messaging Connector projections");
  });

  it("does not project Remote Ambient Surface state for a non-owner sender", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "telegram-chat-1",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "secretProject",
        path: "/secret/workspace",
        statePath: "/secret/workspace/.ambient",
        sessionPath: "/secret/workspace/.ambient/sessions",
      },
      threads: [
        {
          id: "thread-secret",
          title: "Private chat",
          workspacePath: "/secret/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          lastMessagePreview: "Private detail",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-intruder",
        providerId: "telegram-tdlib",
        conversationId: "telegram-chat-1",
        sender: { id: "intruder-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const text = messagingProjectionText(result.projection);

    expect(result.projection).toMatchObject({
      kind: "sender_not_authorized",
      purpose: "remote_ambient_surface",
      bindingId: "remote-binding",
      disclosure: {
        includesRuntimeState: false,
        includesWorkspacePath: false,
        includesPrivateChatState: false,
      },
    });
    expect(text).not.toContain("secretProject");
    expect(text).not.toContain("thread-secret");
    expect(text).not.toContain("Private detail");
  });
});
