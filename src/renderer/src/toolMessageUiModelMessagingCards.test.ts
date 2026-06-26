import { describe, expect, it } from "vitest";
import {
  parseToolMessage,
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
} from "./toolMessageUiModel";

describe("tool message UI model messaging cards", () => {
  it("parses Telegram session setup cards from tool metadata", () => {
    const parsed = parseToolMessage(
      ["Telegram session bootstrap apply", "Apply status: applied", "Needs code: yes"].join("\n"),
      "ambient_messaging_telegram_session_apply",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_session_apply",
          telegramSessionSetup: {
            kind: "telegram-session-setup",
            providerId: "telegram-tdlib",
            profileId: "owner",
            action: "start_auth",
            status: "needs_code",
            title: "Telegram login code needed",
            summary: "Profile owner is waiting for a Telegram login code.",
            detail: "Use the secure Desktop input dialog.",
            missingInputs: [],
            primaryAction: {
              id: "submit-code",
              label: "Enter code",
              title: "Continue Telegram setup",
              prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
              tone: "primary",
            },
            secondaryActions: [
              {
                id: "refresh-status",
                label: "Refresh status",
                title: "Refresh Telegram setup status",
                prompt: "Call ambient_messaging_telegram_session_apply with status.",
                tone: "secondary",
              },
            ],
            safety: {
              readsProviderMessages: false,
              sendsProviderMessages: false,
              createsBinding: false,
              enablesInboundIngestion: false,
            },
          },
        },
      },
    );

    expect(parsed.telegramSessionSetup).toMatchObject({
      providerId: "telegram-tdlib",
      profileId: "owner",
      status: "needs_code",
      primaryAction: {
        label: "Enter code",
        prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
      },
      secondaryActions: [{ label: "Refresh status" }],
      safety: {
        readsProviderMessages: false,
        sendsProviderMessages: false,
        createsBinding: false,
        enablesInboundIngestion: false,
      },
    });
  });

  it("parses messaging conversation-directory setup cards from tool metadata", () => {
    const parsed = parseToolMessage(
      [
        "Telegram conversation directory result: applied",
        "Fetched conversations: 1",
        "Returned conversations: 1",
        "Provider raw details can remain text-only.",
      ].join("\n"),
      "ambient_messaging_telegram_conversation_directory_apply",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_conversation_directory_apply",
          messagingConversationDirectorySetup: {
            kind: "messaging-conversation-directory-setup",
            providerId: "telegram-tdlib",
            providerLabel: "Telegram",
            status: "applied",
            directoryStatus: "ready",
            adapterStatus: "available",
            adapterKind: "live-metadata-only-adapter",
            previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
            applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
            requiresApprovalForApply: true,
            approvalRecorded: true,
            canApplyWithReadiness: true,
            canApplyNow: true,
            metadataOnlyContractKind: "metadata-only-routing",
            fetchedConversationCount: 1,
            returnedConversationCount: 1,
            blockers: [],
            warnings: [],
            nextSteps: ["Use the selected conversation id with a binding preview."],
            safety: {
              startsBridge: false,
              runsProviderCli: false,
              inspectsProviderDesktop: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              sendsProviderMessages: false,
              mutatesBindings: false,
            },
            conversations: [
              {
                conversationId: "telegram-chat-1",
                title: "Ops",
                type: "group",
                unreadCount: 2,
                folderIds: [0],
                updatedAt: "2026-05-11T12:00:00.000Z",
                lastMessage: "must not be consumed",
              },
            ],
          },
        },
      },
    );

    expect(parsed.messagingConversationDirectorySetup).toMatchObject({
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      status: "applied",
      adapterStatus: "available",
      adapterKind: "live-metadata-only-adapter",
      metadataOnlyContractKind: "metadata-only-routing",
      returnedConversationCount: 1,
      safety: {
        runsProviderCli: false,
        inspectsProviderDesktop: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
      },
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          unreadCount: 2,
        },
      ],
    });
  });

  it("parses Remote Ambient Surface activation cards from tool metadata", () => {
    const parsed = parseToolMessage(
      [
        "Remote Ambient Surface activation plan",
        "Status: route_ready",
        "Recommended next tool: ambient_messaging_telegram_owner_loop_activation_plan",
      ].join("\n"),
      "ambient_messaging_remote_surface_activation_plan",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_activation_plan",
          messagingRemoteSurfaceActivation: {
            kind: "messaging-remote-surface-activation",
            intent: "remote_ambient_surface",
            providerId: "telegram-tdlib",
            providerLabel: "Telegram",
            status: "route_ready",
            title: "Remote Ambient Surface activation",
            summary: "Route ready for Telegram.",
            detail: "Product shortcut selected Telegram and delegated to the provider activation plan.",
            ambientSurface: "projects",
            currentPhase: {
              id: "product-provider-route",
              title: "Choose reviewed provider activation route",
              status: "complete",
              approvalRequired: false,
              nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
              blockerCount: 0,
            },
            phaseChips: [
              {
                id: "product-provider-route",
                title: "Choose reviewed provider activation route",
                status: "complete",
                approvalRequired: false,
                nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
                blockerCount: 0,
              },
              {
                id: "metadata-directory",
                title: "Read metadata-only conversation directory",
                status: "ready",
                approvalRequired: true,
                nextTool: "ambient_messaging_telegram_conversation_directory_preview",
                blockerCount: 0,
              },
            ],
            recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
            delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
            activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
            repairPrompt: "Run the Telegram owner-loop activation plan next.",
            repairPrompts: ["Run the Telegram owner-loop activation plan next."],
            blockedUntilActivationPlan: ["ambient_messaging_gateway_lifecycle_preview"],
            previewSendSafety: {
              commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
              replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
              providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
              previewRequiredBeforeProviderSend: true,
              providerSendRequiresSeparateApproval: true,
              providerSendReady: false,
            },
            safety: {
              startsBridge: false,
              listsProviderChats: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              mutatesBindings: false,
              startsPolling: false,
              sendsProviderMessages: false,
            },
          },
        },
      },
    );

    expect(parsed.messagingRemoteSurfaceActivation).toMatchObject({
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      status: "route_ready",
      recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
      activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      currentPhase: {
        id: "product-provider-route",
        status: "complete",
        nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      },
      phaseChips: [
        { id: "product-provider-route", status: "complete" },
        { id: "metadata-directory", status: "ready" },
      ],
      previewSendSafety: {
        previewRequiredBeforeProviderSend: true,
        providerSendRequiresSeparateApproval: true,
        providerSendReady: false,
      },
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        sendsProviderMessages: false,
      },
    });
    const view = toolMessagingRemoteSurfaceActivationCardViewModel(parsed.messagingRemoteSurfaceActivation!);
    expect(view.actions).toHaveLength(2);
    expect(view.actions[0]).toMatchObject({
      id: "continue",
      label: "Continue",
      tone: "primary",
    });
    expect(view.actions[0].prompt).toContain("calling ambient_messaging_telegram_owner_loop_activation_plan");
    expect(view.actions[0].prompt).toContain("preview tools before apply tools");
    expect(view.actions[1]).toMatchObject({
      id: "repair",
      label: "Repair",
      tone: "secondary",
    });
    expect(view.actions[1].prompt).toContain("Run the Telegram owner-loop activation plan next.");
  });

  it("builds compact Remote Ambient Surface activation card view data", () => {
    const parsed = parseToolMessage(
      "Remote Ambient Surface activation plan",
      "ambient_messaging_remote_surface_activation_plan",
      "/workspace",
      {
        toolResultDetails: {
          messagingRemoteSurfaceActivation: {
            kind: "messaging-remote-surface-activation",
            intent: "remote_ambient_surface",
            requestedProvider: "Signal",
            status: "unsupported_provider",
            title: "Remote Ambient Surface activation",
            summary: "No reviewed Remote Ambient Surface route exists for Signal yet.",
            detail: "Choose Telegram or implement a reviewed provider activation route.",
            ambientSurface: "projects",
            currentPhase: {
              id: "product-provider-route",
              title: "Choose reviewed provider activation route",
              status: "blocked",
              approvalRequired: false,
              blockerCount: 1,
            },
            phaseChips: [
              {
                id: "product-provider-route",
                title: "Choose reviewed provider activation route",
                status: "blocked",
                approvalRequired: false,
                blockerCount: 1,
              },
            ],
            repairPrompts: [
              "Ask the user to choose Telegram for Remote Ambient Surface activation, or implement a reviewed Signal activation route before using Signal low-level tools.",
              "Do not fall back to generic Messaging Connector setup for Remote Ambient Surface.",
              "Keep provider sends behind preview/apply approval.",
              "This fourth prompt should stay out of the compact card.",
            ],
            blockedUntilActivationPlan: [
              "ambient_messaging_signal_conversation_directory_preview",
              "ambient_messaging_gateway_lifecycle_apply",
            ],
            previewSendSafety: {
              commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
              replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
              providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
              previewRequiredBeforeProviderSend: true,
              providerSendRequiresSeparateApproval: true,
              providerSendReady: false,
            },
            safety: {
              startsBridge: false,
              listsProviderChats: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              mutatesBindings: false,
              startsPolling: false,
              sendsProviderMessages: false,
            },
          },
        },
      },
    );

    const view = toolMessagingRemoteSurfaceActivationCardViewModel(parsed.messagingRemoteSurfaceActivation!);
    expect(view).toMatchObject({
      tone: "danger",
      icon: "attention",
      title: "Remote Ambient Surface activation",
      summary: "No reviewed Remote Ambient Surface route exists for Signal yet.",
      detail: "Choose Telegram or implement a reviewed provider activation route.",
    });
    expect(view.rows).toEqual(
      expect.arrayContaining([
        { label: "Surface", value: "projects" },
        { label: "State", value: "Unsupported provider" },
        { label: "Blocked tools", value: "2 until activation plan" },
        { label: "Provider send", value: "separate approval required" },
      ]),
    );
    expect(view.phaseChips).toEqual([
      {
        label: "Route: Blocked",
        title: "Choose reviewed provider activation route",
        tone: "danger",
      },
    ]);
    expect(view.notes).toHaveLength(3);
    expect(view.notes.join("\n")).not.toContain("fourth prompt");
    expect(view.actions).toHaveLength(2);
    expect(view.actions[0]).toMatchObject({
      id: "repair",
      label: "Use repair",
      tone: "secondary",
    });
    expect(view.actions[0].prompt).toContain("Ask the user to choose Telegram");
    expect(view.actions[0].prompt).toContain("do not use provider desktop UI, shell, browser automation, or provider CLIs as fallback");
    expect(view.actions[1]).toMatchObject({
      id: "provider-onboarding",
      label: "Plan provider support",
      tone: "secondary",
    });
    expect(view.actions[1].prompt).toContain(
      "Plan future reviewed Remote Ambient Surface provider support for Signal by calling ambient_messaging_remote_surface_provider_support_plan first",
    );
    expect(view.actions[1].prompt).toContain("Pass provider exactly as Signal and ambientSurface exactly as projects");
    expect(view.actions[1].prompt).toContain("provider onboarding/planning, not active Remote Ambient Surface activation");
    expect(view.actions[1].prompt).toContain("ask for approval before implementing");
    expect(view.actions[1].prompt).toContain("Do not call provider-specific low-level tools");
    expect(view.actions[1].prompt).toContain("provider message reads");
    expect(view.actions[1].prompt).toContain("provider sends");
    expect(view.safetyChips).toEqual([
      "No bridge start",
      "No message reads",
      "No history",
      "No sends",
      "No polling start",
      "Preview before send",
    ]);
  });

  it("builds compact directory card view data for dense conversation results", () => {
    const parsed = parseToolMessage(
      "Telegram conversation directory result: applied",
      "ambient_messaging_telegram_conversation_directory_apply",
      "/workspace",
      {
        toolResultDetails: {
          messagingConversationDirectorySetup: {
            kind: "messaging-conversation-directory-setup",
            providerId: "telegram-tdlib",
            providerLabel: "Telegram",
            status: "applied",
            directoryStatus: "ready",
            adapterStatus: "available",
            adapterKind: "live-metadata-only-adapter",
            previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
            applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
            requiresApprovalForApply: true,
            approvalRecorded: true,
            canApplyWithReadiness: true,
            canApplyNow: true,
            metadataOnlyContractKind: "metadata-only-routing",
            fetchedConversationCount: 12,
            returnedConversationCount: 12,
            blockers: [],
            warnings: [],
            nextSteps: ["Use the selected conversation id with a binding preview."],
            safety: {
              startsBridge: false,
              runsProviderCli: false,
              inspectsProviderDesktop: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              sendsProviderMessages: false,
              mutatesBindings: false,
            },
            conversations: Array.from({ length: 12 }, (_, index) => ({
              conversationId: `telegram-chat-${index + 1}`,
              title: `Conversation ${index + 1}`,
              type: "group",
              unreadCount: index === 0 ? 4 : 0,
              folderIds: [0],
            })),
          },
        },
      },
    );

    const view = toolMessagingConversationDirectorySetupCardViewModel(parsed.messagingConversationDirectorySetup!);
    expect(view).toMatchObject({
      tone: "success",
      icon: "success",
      title: "Telegram conversation directory",
      summary: "12 metadata row(s) available.",
      noteKind: "next-step",
    });
    expect(view.rows).toEqual(
      expect.arrayContaining([
        { label: "Counts", value: "12/12 returned" },
        { label: "Approval", value: "recorded" },
      ]),
    );
    expect(view.conversationChips).toHaveLength(9);
    expect(view.conversationChips[0]).toEqual({ label: "Conversation 1 (4)", title: "telegram-chat-1" });
    expect(view.conversationChips.at(-1)).toEqual({
      label: "4 more",
      title: "4 additional conversation metadata row(s) omitted from this compact card",
    });
    expect(view.safetyChips).toEqual(["No message reads", "No history", "No sends", "No provider CLI", "No desktop scrape", "No bindings"]);
  });

  it("prioritizes blocked directory card notes and caps long guidance for narrow renderers", () => {
    const card = {
      kind: "messaging-conversation-directory-setup" as const,
      providerId: "signal-cli",
      providerLabel: "Signal",
      status: "blocked" as const,
      directoryStatus: "blocked",
      adapterStatus: "blocked" as const,
      adapterKind: "blocked-contract-skeleton" as const,
      previewToolName: "ambient_messaging_signal_conversation_directory_preview",
      applyToolName: "ambient_messaging_signal_conversation_directory_apply",
      requiresApprovalForApply: false,
      approvalRecorded: false,
      canApplyWithReadiness: false,
      canApplyNow: false,
      metadataOnlyContractKind: "metadata-only-routing" as const,
      fetchedConversationCount: 0,
      returnedConversationCount: 0,
      failureMode: "signal-directory-adapter-not-implemented",
      failureHint: "Implement and validate the reviewed Signal local-bridge adapter before reading a Signal conversation directory.",
      blockers: [
        "Signal provider directory adapter is a blocked skeleton; no reviewed Signal local bridge is installed or enabled.",
        "Signal directory apply must remain unavailable until safe readiness, session metadata, metadata-only directory, binding lifecycle, inbound normalization, and reply support are implemented.",
        "Signal Desktop availability is not a supported provider readiness signal.",
        "This fourth blocker should stay out of the compact card and remain in the full text output.",
      ],
      warnings: ["Do not inspect Signal Desktop storage."],
      nextSteps: ["Implement a reviewed bridge."],
      safety: {
        startsBridge: false,
        runsProviderCli: false,
        inspectsProviderDesktop: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      } as const,
      conversations: [],
    };

    const view = toolMessagingConversationDirectorySetupCardViewModel(card);
    expect(view.tone).toBe("danger");
    expect(view.icon).toBe("attention");
    expect(view.noteKind).toBe("blocker");
    expect(view.detail).toBe(
      "Implement and validate the reviewed Signal local-bridge adapter before reading a Signal conversation directory.",
    );
    expect(view.notes).toEqual(card.blockers.slice(0, 3));
    expect(view.notes.join("\n")).not.toContain("fourth blocker");
    expect(view.conversationChips).toEqual([]);
    expect(view.rows).toEqual(
      expect.arrayContaining([
        { label: "Adapter", value: "blocked / blocked-contract-skeleton" },
        { label: "Approval", value: "not required" },
        { label: "Failure", value: "signal-directory-adapter-not-implemented" },
      ]),
    );
  });
});
