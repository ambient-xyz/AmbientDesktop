import { describe, expect, it } from "vitest";
import type { MessagingGatewayRemoteSurfaceRuntimeEvent, MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import {
  applySignalBridgeReply,
  buildSignalBridgeReplyPreview,
  buildSignalBridgeReplyStatus,
  buildSignalRelayDiagnostics,
  signalBridgeReplyApprovalDetail,
  signalBridgeReplyInput,
  signalBridgeReplyPreviewText,
  signalBridgeReplyResultText,
  signalBridgeReplyStatusText,
  signalRelayDiagnosticsInput,
  signalRelayDiagnosticsText,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { readJson, withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import { signalReadyRuntimeStatus, signalUnreadBindingList } from "./messagingGatewaySignalContractsTestSupport";

describe("messaging gateway Signal contracts", () => {
  it("sends approved Signal bridge replies only through the reviewed bridge contract", async () => {
    const bindings = signalUnreadBindingList();
    const baseRuntimeStatus = signalReadyRuntimeStatus();
    const runtimeStatus: MessagingGatewayRuntimeStatus = {
      ...baseRuntimeStatus,
      providers: baseRuntimeStatus.providers.map((provider) => ({
        ...provider,
        readiness: provider.readiness
          ? {
              ...provider.readiness,
              bridgeCapabilities: {
                ...provider.readiness.bridgeCapabilities,
                approvedReplySend: true,
              },
            }
          : undefined,
      })),
      queuedProjections: [
        {
          id: "projection-signal-reply-1",
          providerId: "signal-cli",
          authProfileId: "signal-owner",
          conversationId: "signal-chat-1",
          sourceEventId: "signal-signal-owner-signal-chat-1-message-1",
          bindingId: "signal-binding-1",
          purpose: "remote_ambient_surface" as const,
          projection: {
            kind: "surface_list" as const,
            purpose: "remote_ambient_surface" as const,
            bindingId: "signal-binding-1",
            surface: "projects",
            title: "Ambient projects",
            summary: "Project list ready.",
            bodyLines: ["Project list ready."],
            actions: [],
            disclosure: {
              includesRuntimeState: true,
              includesWorkspacePath: false,
              includesPrivateChatState: false,
              notes: ["Dogfood projection."],
            },
          },
          queuedAt: "2026-05-10T00:00:04.000Z",
        },
      ],
    };
    const descriptor = createDefaultMessagingProviderRegistry().get("signal-cli")?.descriptor;
    const status = buildSignalBridgeReplyStatus({
      bindings,
      runtimeStatus,
      descriptor,
    });
    expect(status).toMatchObject({
      status: "ready",
      reviewedReplySendImplemented: true,
      outboundReplyEnabled: true,
      bridgeApprovedReplyCapability: true,
      bridgeReachable: true,
      configured: true,
      activeOwnerBindingCount: 1,
      replyCandidateBindingCount: 1,
      contract: {
        kind: "signal-approved-reply-send-v0",
        method: "POST",
      },
    });
    expect(status.repairSteps).toEqual([]);
    expect(signalBridgeReplyStatusText(status)).toContain("Signal outbound reply contract status");
    expect(signalBridgeReplyStatusText(status)).toContain("Bridge approvedReplySend capability: yes");
    expect(signalBridgeReplyStatusText(status)).toContain("Repair steps:");
    expect(signalBridgeReplyStatusText(status)).toContain("- None");

    const missingReplyCapabilityStatus = buildSignalBridgeReplyStatus({
      bindings,
      runtimeStatus: baseRuntimeStatus,
      descriptor,
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      bindingId: "signal-binding-1",
    });
    expect(missingReplyCapabilityStatus.status).toBe("blocked");
    expect(missingReplyCapabilityStatus.repairSteps).toContain(
      "Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.",
    );

    const input = signalBridgeReplyInput({
      providerId: "signal-cli",
      queuedProjectionId: "projection-signal-reply-1",
      text: "Ambient cannot send Signal replies yet.",
    });
    const preview = buildSignalBridgeReplyPreview({
      toolInput: input,
      bindings,
      runtimeStatus,
      descriptor,
    });
    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      approvalRequired: true,
      futureApprovalRequired: false,
      applyToolName: "ambient_messaging_signal_bridge_reply_apply",
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "owner-1",
      replyToMessageId: "message-1",
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/send",
      textLength: 39,
      safety: {
        requestsApproval: true,
        sendsProviderMessages: true,
        readsProviderMessages: false,
        readsProviderHistory: false,
        startsBridge: false,
        usesReviewedBridgeSendContract: true,
      },
    });
    expect(preview.blockers).toEqual([]);
    expect(preview.repairSteps).toEqual([]);
    expect(signalBridgeReplyPreviewText(preview)).toContain("Signal bridge reply preview");
    expect(signalBridgeReplyPreviewText(preview)).toContain("Sends provider messages: yes");
    expect(signalBridgeReplyPreviewText(preview)).toContain("Bridge approvedReplySend capability: yes");
    expect(signalBridgeReplyApprovalDetail(preview)).toContain("Exact text: Ambient cannot send Signal replies yet.");

    const denied = await applySignalBridgeReply({
      preview,
      approvalRecorded: false,
    });
    expect(denied).toMatchObject({
      applyStatus: "denied",
      approvalRequested: true,
      approvalRecorded: false,
      sent: false,
      delivery: {
        status: "denied",
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        bindingId: "signal-binding-1",
        replyToMessageId: "message-1",
      },
    });

    const sentRequests: Array<{ path: string; body: unknown }> = [];
    await withTelegramBridgeServer(
      async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/profiles/signal-owner/conversations/signal-chat-1/send") {
          sentRequests.push({
            path: url.pathname,
            body: await readJson(req),
          });
          writeJson(res, {
            ok: true,
            messageId: "signal-sent-1",
            sentAt: "2026-05-10T00:00:05.000Z",
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { ok: false });
      },
      async (baseUrl) => {
        const result = await applySignalBridgeReply({
          preview,
          approvalRecorded: true,
          env: { AMBIENT_SIGNAL_BRIDGE_URL: baseUrl },
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:05.000Z"),
        });
        expect(result).toMatchObject({
          applyStatus: "sent",
          approvalRequested: true,
          approvalRecorded: true,
          sent: true,
          providerMessageId: "signal-sent-1",
          delivery: {
            status: "sent",
            providerId: "signal-cli",
            authProfileId: "signal-owner",
            conversationId: "signal-chat-1",
            sourceProjectionId: "projection-signal-reply-1",
            bindingId: "signal-binding-1",
            replyToMessageId: "message-1",
            providerMessageId: "signal-sent-1",
          },
        });
        expect(signalBridgeReplyResultText(result)).toContain("Apply status: sent");
        expect(signalBridgeReplyResultText(result)).toContain("Approval requested: yes");
        expect(signalBridgeReplyResultText(result)).toContain("Sent: yes");
      },
    );

    expect(sentRequests).toEqual([
      {
        path: "/profiles/signal-owner/conversations/signal-chat-1/send",
        body: {
          text: "Ambient cannot send Signal replies yet.",
          replyToMessageId: "message-1",
        },
      },
    ]);

    const completedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      id: "remote-surface-signal-completed-switch",
      kind: "active_project_switch",
      status: "completed",
      title: "Switch to Signal project",
      summary: "Active Ambient project switched to Signal project.",
      queuedProjectionId: "projection-signal-reply-1",
      bindingId: "signal-binding-1",
      projectName: "Signal project",
      scheduledAt: "2026-05-10T00:00:02.000Z",
      completedAt: "2026-05-10T00:00:06.000Z",
      relaySuggested: true,
    };
    const runtimeEventStatus: MessagingGatewayRuntimeStatus = {
      ...runtimeStatus,
      remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
      pendingRemoteSurfaceRuntimeEventCount: 0,
      recentRemoteSurfaceRuntimeEventCount: 1,
    };
    const completedRuntimePreview = buildSignalBridgeReplyPreview({
      toolInput: signalBridgeReplyInput({ runtimeEventId: completedRuntimeEvent.id }),
      bindings,
      runtimeStatus: runtimeEventStatus,
      descriptor,
    });
    expect(completedRuntimePreview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      queuedProjectionId: "projection-signal-reply-1",
      runtimeEvent: { id: completedRuntimeEvent.id, status: "completed" },
      replyToMessageId: "message-1",
    });
    expect(completedRuntimePreview.text).toBe("Ambient switched the active project to Signal project.");
    expect(runtimeEventRelayText(completedRuntimeEvent)).toBe(completedRuntimePreview.text);
    expect(signalBridgeReplyPreviewText(completedRuntimePreview)).toContain(`Runtime event: ${completedRuntimeEvent.id}`);
    expect(signalBridgeReplyApprovalDetail(completedRuntimePreview)).toContain(`Runtime event: ${completedRuntimeEvent.id}`);

    const relayDiagnostics = buildSignalRelayDiagnostics({
      toolInput: signalRelayDiagnosticsInput({
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
      }),
      bindings,
      runtimeStatus: runtimeEventStatus,
    });
    expect(relayDiagnostics).toMatchObject({
      status: "ready",
      bridgeModeLabel: "real Signal bridge ready for approved replies",
      canSendOwnerRelayNow: true,
      providerLabel: "Signal",
      selectedOwnerBindings: [{ bindingId: "signal-binding-1" }],
      relayableRuntimeEvents: [{ runtimeEventId: completedRuntimeEvent.id }],
    });
    expect(relayDiagnostics.repairSteps).toContain(
      "No repair needed; preview the selected runtime event with ambient_messaging_signal_bridge_reply_preview using runtimeEventId.",
    );
    expect(signalRelayDiagnosticsText(relayDiagnostics)).toContain("Remote Ambient Surface relay diagnostics");
    expect(signalRelayDiagnosticsText(relayDiagnostics)).toContain("Provider: Signal (signal-cli)");
    expect(signalRelayDiagnosticsText(relayDiagnostics)).toContain(`Event ${completedRuntimeEvent.id}`);
    expect(signalRelayDiagnosticsText(relayDiagnostics)).toContain("Repair steps:");

    const missingCapabilityDiagnostics = buildSignalRelayDiagnostics({
      toolInput: signalRelayDiagnosticsInput({
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
      }),
      bindings,
      runtimeStatus: {
        ...baseRuntimeStatus,
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
      },
    });
    expect(missingCapabilityDiagnostics.status).toBe("blocked");
    expect(missingCapabilityDiagnostics.repairSteps).toContain(
      "Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.",
    );

    const runtimeSentRequests: Array<{ path: string; body: unknown }> = [];
    await withTelegramBridgeServer(
      async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/profiles/signal-owner/conversations/signal-chat-1/send") {
          runtimeSentRequests.push({
            path: url.pathname,
            body: await readJson(req),
          });
          writeJson(res, {
            ok: true,
            messageId: "signal-runtime-sent-1",
            sentAt: "2026-05-10T00:00:07.000Z",
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { ok: false });
      },
      async (baseUrl) => {
        const runtimeResult = await applySignalBridgeReply({
          preview: completedRuntimePreview,
          approvalRecorded: true,
          env: { AMBIENT_SIGNAL_BRIDGE_URL: baseUrl },
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:07.000Z"),
        });
        expect(runtimeResult).toMatchObject({
          applyStatus: "sent",
          providerMessageId: "signal-runtime-sent-1",
          delivery: {
            status: "sent",
            providerId: "signal-cli",
            runtimeEventId: completedRuntimeEvent.id,
            sourceProjectionId: "projection-signal-reply-1",
            replyToMessageId: "message-1",
          },
        });
        expect(signalBridgeReplyResultText(runtimeResult)).toContain(`Runtime event: ${completedRuntimeEvent.id}`);
      },
    );
    expect(runtimeSentRequests).toEqual([
      {
        path: "/profiles/signal-owner/conversations/signal-chat-1/send",
        body: {
          text: "Ambient switched the active project to Signal project.",
          replyToMessageId: "message-1",
        },
      },
    ]);

    const overriddenRuntimePreview = buildSignalBridgeReplyPreview({
      toolInput: signalBridgeReplyInput({
        runtimeEventId: completedRuntimeEvent.id,
        text: "Manual Signal status text.",
      }),
      bindings,
      runtimeStatus: runtimeEventStatus,
      descriptor,
    });
    expect(overriddenRuntimePreview.canApplyNow).toBe(false);
    expect(overriddenRuntimePreview.text).toBe("Ambient switched the active project to Signal project.");
    expect(overriddenRuntimePreview.blockers).toContain(
      "Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.",
    );
    expect(overriddenRuntimePreview.repairSteps).toContain(
      "Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.",
    );

    const staleRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-signal-stale-routing",
      sourceEventId: undefined,
    };
    const staleRuntimePreview = buildSignalBridgeReplyPreview({
      toolInput: signalBridgeReplyInput({ runtimeEventId: staleRuntimeEvent.id }),
      bindings,
      runtimeStatus: {
        ...runtimeStatus,
        queuedProjections: [],
        remoteSurfaceRuntimeEvents: [staleRuntimeEvent],
      },
      descriptor,
    });
    expect(staleRuntimePreview.canApplyNow).toBe(false);
    expect(staleRuntimePreview.blockers).toContain(
      "Signal reply preview requires an exact replyToMessageId or a queued Signal projection with a parseable source message id.",
    );
    expect(staleRuntimePreview.repairSteps).toContain(
      "This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides the exact replyToMessageId.",
    );
    expect(signalBridgeReplyPreviewText(staleRuntimePreview)).toContain("Repair steps:");

    const relayedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-signal-already-relayed",
      relayStatus: "sent",
      relayProviderId: "signal-cli",
      relayDeliveryId: "outbound-signal-cli-20260510T000007000Z",
      relayedAt: "2026-05-10T00:00:08.000Z",
      relaySuggested: false,
    };
    const relayedRuntimePreview = buildSignalBridgeReplyPreview({
      toolInput: signalBridgeReplyInput({ runtimeEventId: relayedRuntimeEvent.id }),
      bindings,
      runtimeStatus: {
        ...runtimeStatus,
        remoteSurfaceRuntimeEvents: [relayedRuntimeEvent],
      },
      descriptor,
    });
    expect(relayedRuntimePreview.canApplyNow).toBe(false);
    expect(relayedRuntimePreview.blockers).toContain("Remote Ambient Surface runtime event has already been relayed.");
    expect(relayedRuntimePreview.repairSteps).toContain(
      "Do not resend this runtime event; inspect Recent outbound deliveries in ambient_messaging_gateway_status and wait for a new runtime event if another owner update is needed.",
    );
  });
});
