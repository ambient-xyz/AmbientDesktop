import { describe, expect, it } from "vitest";

import { registerMessagingRemoteSurfaceReplyApplyTools } from "./agentRuntimeMessagingRemoteSurfaceReplyApplyTools";
import type { SignalBridgeReplyResult } from "./signalBridgeReply";
import type { TelegramBridgeReplyResult } from "./telegramBridgeOutbound";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingRemoteSurfaceReplyApplyTools", () => {
  it("registers and executes provider-neutral Remote Ambient Surface reply apply routing", async () => {
    const registeredTools: RegisteredTool[] = [];

    registerMessagingRemoteSurfaceReplyApplyTools({
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
      telegramApplyForParams: async (params) => telegramResult((params as { runtimeEventId: string }).runtimeEventId),
      signalApplyForParams: async (params) => signalResult((params as { runtimeEventId: string }).runtimeEventId),
      gatewayRuntimeStatus: () => ({
        status: "idle",
        providerCount: 2,
        activeProviderCount: 2,
        syntheticActiveProviderCount: 0,
        queuedProjectionCount: 2,
        recentEventCount: 0,
        outboundDeliveryCount: 1,
        providers: [],
        queuedProjections: [],
        recentOutboundDeliveries: [],
        recentEvents: [],
      }),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_remote_surface_reply_apply",
    ]);

    const tool = registeredTools[0]!;
    const blocked = await tool.execute("remote-surface-reply-apply-blocked", {
      runtimeEventId: " missing-event ",
    });
    expect(blocked.content[0].text).toContain("Remote Ambient Surface reply apply");
    expect(blocked.content[0].text).toContain("Status: blocked");
    expect(blocked.content[0].text).toContain("Runtime event: missing-event");
    expect(blocked.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_apply",
      status: "blocked",
      replyStatus: "blocked",
      input: { runtimeEventId: "missing-event" },
      blockers: ["Remote Ambient Surface runtime event was not found in gateway status."],
    });

    const telegram = await tool.execute("remote-surface-reply-apply-telegram", {
      runtimeEventId: "telegram-event",
    });
    expect(telegram.content[0].text).toContain("Remote Ambient Surface reply apply");
    expect(telegram.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
    expect(telegram.content[0].text).toContain("Telegram bridge reply apply");
    expect(telegram.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_apply",
      delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
      delegatedProviderId: "telegram-tdlib",
      status: "sent",
      replyStatus: "ready",
      providerId: "telegram-tdlib",
      queuedProjectionId: "telegram-projection",
      runtimeEvent: { id: "telegram-event" },
      providerMessageId: "telegram-provider-message",
      gatewayRuntimeStatus: {
        status: "idle",
        outboundDeliveryCount: 1,
      },
    });

    const signal = await tool.execute("remote-surface-reply-apply-signal", {
      runtimeEventId: "signal-event",
    });
    expect(signal.content[0].text).toContain("Remote Ambient Surface reply apply");
    expect(signal.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
    expect(signal.content[0].text).toContain("Signal bridge reply preview");
    expect(signal.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_reply_apply",
      delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
      delegatedProviderId: "signal-cli",
      status: "sent",
      replyStatus: "ready",
      providerId: "signal-cli",
      queuedProjectionId: "signal-projection",
      runtimeEvent: { id: "signal-event" },
      providerMessageId: "signal-provider-message",
      gatewayRuntimeStatus: {
        status: "idle",
        outboundDeliveryCount: 1,
      },
    });
  });
});

function telegramResult(runtimeEventId: string): TelegramBridgeReplyResult {
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
      queuedAt: "2026-05-27T00:00:00.000Z",
    } as any,
    binding: {
      id: "telegram-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-conversation",
      purpose: "remote_ambient_surface",
      status: "active",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    },
    endpointPath: "/sessions/owner-profile/messages/send",
    replyToMessageId: "message-1",
    blockers: [],
    repairSteps: [],
    warnings: [],
    policyNotes: ["Telegram policy note."],
    nextSteps: ["Inspect gateway status for the outbound delivery record."],
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: true,
      startsBridge: false,
      readsProviderHistory: false,
      exposesRuntimeStateToExternalConnector: false,
    },
    applyStatus: "sent",
    approvalRecorded: true,
    providerMessageId: "telegram-provider-message",
    delivery: {
      id: "telegram-delivery",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-conversation",
      sourceProjectionId: "telegram-projection",
      bindingId: "telegram-binding",
      purpose: "remote_ambient_surface",
      replyToMessageId: "message-1",
      providerMessageId: "telegram-provider-message",
      status: "sent",
      textPreview: "Telegram relay text",
      textLength: 19,
      sentAt: "2026-05-27T00:00:01.000Z",
    },
  };
}

function signalResult(runtimeEventId: string): SignalBridgeReplyResult {
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
    nextSteps: ["Inspect gateway status for the outbound delivery record."],
    applyStatus: "sent",
    approvalRequested: true,
    approvalRecorded: true,
    sent: true,
    providerMessageId: "signal-provider-message",
    sentAt: "2026-05-27T00:00:01.000Z",
    delivery: {
      id: "signal-delivery",
      providerId: "signal-cli",
      authProfileId: "signal-owner",
      conversationId: "signal-chat",
      sourceProjectionId: "signal-projection",
      bindingId: "signal-binding",
      purpose: "remote_ambient_surface",
      replyToMessageId: "signal-message-1",
      providerMessageId: "signal-provider-message",
      status: "sent",
      textPreview: "Signal relay text",
      textLength: 17,
      sentAt: "2026-05-27T00:00:01.000Z",
    },
  };
}
