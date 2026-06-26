import { describe, expect, it } from "vitest";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot, runtimeSurfaceSnapshotText } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText, routeSyntheticMessagingEvent } from "./messagingGatewayProjection";
import { buildMessagingRemoteSurfaceCommandPreview } from "./messagingRemoteSurfaceCommands";
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
