import { describe, expect, it } from "vitest";

import { registerMessagingRemoteSurfaceReplyPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";
import type { SignalBridgeReplyPreview } from "./signalBridgeReply";
import type { TelegramBridgeReplyPreview } from "./telegramBridgeOutbound";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingRemoteSurfaceReplyPreviewTools", () => {
  it("registers and executes provider-neutral Remote Ambient Surface reply preview routing", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerMessagingRemoteSurfaceReplyPreviewTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      inputForParams: (params) => {
        const raw = params as Record<string, unknown>;
        return { runtimeEventId: String(raw.runtimeEventId ?? "").trim() };
      },
      targetForInput: (input) => {
        if (input.runtimeEventId === "missing-event") {
          return {
            input,
            blockers: ["Remote Ambient Surface runtime event was not found in gateway status."],
          };
        }
        if (input.runtimeEventId === "signal-event") {
          return {
            input,
            runtimeEvent: { id: input.runtimeEventId, status: "completed" },
            providerId: "signal-cli",
            providerLabel: "Signal",
            relaySummary: { relayActionStatus: "preview-ready" },
            blockers: [],
          };
        }
        return {
          input,
          runtimeEvent: { id: input.runtimeEventId, status: "completed" },
          providerId: "telegram-tdlib",
          providerLabel: "Telegram",
          relaySummary: { relayActionStatus: "preview-ready" },
          blockers: [],
        };
      },
      telegramPreviewForParams: (params) => telegramPreview((params as { runtimeEventId: string }).runtimeEventId),
      signalPreviewForParams: async (params) => ({
        preview: signalPreview((params as { runtimeEventId: string }).runtimeEventId),
      }),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_remote_surface_reply_preview",
    ]);

    const tool = registeredTools[0]!;
    const blocked = await tool.execute("remote-surface-reply-preview-blocked", {
      runtimeEventId: " missing-event ",
    });
    expect(blocked.content[0].text).toContain("Remote Ambient Surface reply preview");
    expect(blocked.content[0].text).toContain("Status: blocked");
    expect(blocked.content[0].text).toContain("Runtime event: missing-event");
    expect(blocked.content[0].text).toContain("Call ambient_messaging_gateway_status");
    expect(blocked.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_preview",
      status: "blocked",
      replyStatus: "blocked",
      input: { runtimeEventId: "missing-event" },
      blockers: ["Remote Ambient Surface runtime event was not found in gateway status."],
    });

    const telegram = await tool.execute("remote-surface-reply-preview-telegram", {
      runtimeEventId: "telegram-event",
    });
    expect(telegram.content[0].text).toContain("Remote Ambient Surface reply preview");
    expect(telegram.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
    expect(telegram.content[0].text).toContain("Telegram bridge reply preview");
    expect(telegram.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_preview",
      delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
      delegatedProviderId: "telegram-tdlib",
      status: "ready",
      replyStatus: "ready",
      providerId: "telegram-tdlib",
      queuedProjectionId: "telegram-projection",
      runtimeEvent: { id: "telegram-event" },
    });

    const signal = await tool.execute("remote-surface-reply-preview-signal", {
      runtimeEventId: "signal-event",
    });
    expect(signal.content[0].text).toContain("Remote Ambient Surface reply preview");
    expect(signal.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
    expect(signal.content[0].text).toContain("Signal bridge reply preview");
    expect(signal.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_preview",
      delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
      delegatedProviderId: "signal-cli",
      status: "ready",
      replyStatus: "ready",
      providerId: "signal-cli",
      queuedProjectionId: "signal-projection",
      runtimeEvent: { id: "signal-event" },
    });
  });
});

function telegramPreview(runtimeEventId: string): TelegramBridgeReplyPreview {
  return {
    providerId: "telegram-tdlib",
    status: "ready",
    canApplyNow: true,
    approvalRequired: true,
    queuedProjectionId: "telegram-projection",
    text: "Telegram relay text",
    textLength: 19,
    textPreview: "Telegram relay text",
    runtimeEvent: { id: runtimeEventId, status: "completed" } as any,
    queuedProjection: {
      id: "telegram-projection",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-conversation",
      sourceEventId: "telegram-owner-profile-owner-conversation-message-1",
      queuedAt: "2026-05-26T00:00:00.000Z",
    } as any,
    binding: {
      id: "telegram-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-conversation",
      purpose: "remote_ambient_surface",
      status: "active",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    },
    endpointPath: "/sessions/owner-profile/messages/send",
    replyToMessageId: "message-1",
    blockers: [],
    repairSteps: [],
    warnings: [],
    policyNotes: ["Telegram policy note."],
    nextSteps: ["Ask the user to approve this exact Telegram reply text."],
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: true,
      startsBridge: false,
      readsProviderHistory: false,
      exposesRuntimeStateToExternalConnector: false,
    },
  };
}

function signalPreview(runtimeEventId: string): SignalBridgeReplyPreview {
  return {
    providerId: "signal-cli",
    status: "ready",
    reviewedReplySendImplemented: true,
    outboundReplyEnabled: true,
    bridgeApprovedReplyCapability: true,
    bridgeReachable: true,
    configured: true,
    activeOwnerBindingCount: 1,
    replyCandidateBindingCount: 1,
    contract: { kind: "ambient-signal-local-bridge-approved-reply-send", version: "v0" } as any,
    selectedBindings: [],
    blockers: [],
    repairSteps: [],
    warnings: [],
    boundaries: ["Signal boundary."],
    canApplyNow: true,
    previewOnly: true,
    approvalRequired: true,
    futureApprovalRequired: false,
    applyToolName: "ambient_messaging_signal_bridge_reply_apply",
    queuedProjectionId: "signal-projection",
    runtimeEvent: { id: runtimeEventId, status: "completed" } as any,
    bindingId: "signal-binding",
    profileId: "signal-owner",
    conversationId: "signal-chat",
    ownerUserId: "owner-1",
    replyToMessageId: "signal-message-1",
    endpointPath: "/profiles/signal-owner/conversations/signal-chat/send",
    text: "Signal relay text",
    textLength: 17,
    textPreview: "Signal relay text",
    safety: {
      requestsApproval: true,
      sendsProviderMessages: true,
      readsProviderMessages: false,
      readsProviderHistory: false,
      startsBridge: false,
      mutatesBindings: false,
      usesReviewedBridgeSendContract: true,
      exposesRuntimeStateToMessagingConnector: false,
    },
    nextSteps: ["Ask the user to approve this exact Signal reply text."],
  };
}
