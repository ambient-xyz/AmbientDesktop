import { describe, expect, it } from "vitest";
import type { MessagingGatewayRemoteSurfaceRuntimeEvent } from "../../shared/messagingGateway";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import { MessagingGatewayRunner, messagingGatewayInboundDispatchText, messagingGatewayRuntimeStatusText } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  applyTelegramBridgeReply,
  buildTelegramBridgeReplyPreview,
  buildTelegramRelayDiagnostics,
  secondProviderRelayReadinessChecklist,
  telegramBridgeReplyInput,
  telegramBridgeReplyPreviewText,
  telegramBridgeReplyResultText,
  telegramRelayDiagnosticsInput,
  telegramRelayDiagnosticsText,
} from "./messagingTelegramFacade";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import { readJson, withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway runtime lifecycle", () => {
  it("dispatches real Telegram bridge events only for active owner Remote Ambient Surface bindings", async () => {
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
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "revoked-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "revoked-chat",
      purpose: "remote_ambient_surface",
      status: "revoked",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic real inbound test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");
    const started = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(started.applied).toBe(true);

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
    const accepted = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-100",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1", label: "Owner" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    expect(accepted).toMatchObject({
      accepted: true,
      queuedProjection: {
        id: "projection-telegram-tdlib-telegram-owner-profile-owner-chat-100",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        bindingId: "remote-binding",
        purpose: "remote_ambient_surface",
      },
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
            realEventCount: 1,
            queuedProjectionCount: 1,
          }),
        ]),
      },
    });
    expect(messagingGatewayInboundDispatchText(accepted)).toContain("Accepted: yes");

    const wrongSender = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-101",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "intruder-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:03.000Z",
      },
    });
    expect(wrongSender).toMatchObject({
      accepted: false,
      droppedReason: "Sender does not match the Remote Ambient Surface owner binding.",
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
      },
    });
    expect(messagingGatewayInboundDispatchText(wrongSender)).toContain("Accepted: no");

    const revoked = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-revoked-chat-102",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "revoked-chat",
        sender: { id: "owner-1" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:04.000Z",
      },
    });
    expect(revoked).toMatchObject({
      accepted: false,
      droppedReason: "No active Remote Ambient Surface binding matches this Telegram event.",
      runtimeStatus: {
        queuedProjectionCount: 1,
        recentEventCount: 1,
      },
    });
  });

  it("sends approved Telegram replies only from queued Remote Ambient Surface projections", async () => {
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
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic reply send test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");
    await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
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
    const accepted = runner.dispatchInbound({
      source: "telegram-bridge",
      bindings: bindings.list(),
      surface,
      event: {
        id: "telegram-owner-profile-owner-chat-100",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1", label: "Owner" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    expect(accepted.accepted).toBe(true);
    const queuedProjectionId = accepted.queuedProjection!.id;
    const sentRequests: Array<{ path: string; body: unknown; apiId?: string; apiHash?: string }> = [];

    await withTelegramBridgeServer(
      async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
          sentRequests.push({
            path: url.pathname,
            body: await readJson(req),
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          });
          writeJson(res, {
            message: {
              id: "200",
              date: "2026-05-10T00:00:04.000Z",
            },
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      },
      async (baseUrl) => {
        const replyInput = telegramBridgeReplyInput({
          queuedProjectionId,
          text: "I found the active project.",
        });
        const preview = buildTelegramBridgeReplyPreview({
          toolInput: replyInput,
          bindings: bindings.list({ includeInactive: false }),
          runtimeStatus: runner.runtimeStatus(),
        });
        expect(preview).toMatchObject({
          status: "ready",
          canApplyNow: true,
          endpointPath: "/sessions/owner-profile/messages/send",
          replyToMessageId: "100",
          safety: {
            sendsProviderMessages: true,
            readsProviderMessages: false,
            readsProviderHistory: false,
            startsBridge: false,
            exposesRuntimeStateToExternalConnector: false,
          },
        });
        expect(telegramBridgeReplyPreviewText(preview)).toContain("Approval required: yes");
        expect(telegramBridgeReplyPreviewText(preview)).toContain("Repair steps:");
        expect(telegramBridgeReplyPreviewText(preview)).toContain("- None");

        const result = await applyTelegramBridgeReply({
          preview,
          approvalRecorded: true,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          },
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:04.000Z"),
        });
        runner.recordOutboundDelivery(result.delivery);
        expect(result).toMatchObject({
          applyStatus: "sent",
          providerMessageId: "200",
          delivery: {
            status: "sent",
            providerId: "telegram-tdlib",
            authProfileId: "owner-profile",
            conversationId: "owner-chat",
            sourceProjectionId: queuedProjectionId,
            bindingId: "remote-binding",
            replyToMessageId: "100",
            providerMessageId: "200",
          },
        });
        expect(telegramBridgeReplyResultText(result)).toContain("Delivery status: sent");
      },
    );

    expect(sentRequests).toEqual([
      {
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "I found the active project.",
          replyToMessageId: "100",
        },
        apiId: "12345",
        apiHash: "test-hash",
      },
    ]);
    expect(runner.runtimeStatus()).toMatchObject({
      outboundDeliveryCount: 1,
      recentOutboundDeliveries: [
        {
          status: "sent",
          providerMessageId: "200",
          sourceProjectionId: queuedProjectionId,
        },
      ],
    });
    expect(messagingGatewayRuntimeStatusText(runner.runtimeStatus())).toContain("Recent outbound deliveries:");

    const completedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      id: "remote-surface-completed-switch",
      kind: "active_project_switch",
      status: "completed",
      title: "Switch to Remote gateway project",
      summary: "Active Ambient project switched to Remote gateway project.",
      queuedProjectionId,
      bindingId: "remote-binding",
      projectName: "Remote gateway project",
      scheduledAt: "2026-05-10T00:00:02.000Z",
      completedAt: "2026-05-10T00:00:06.000Z",
      relaySuggested: true,
    };
    const completedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: completedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(completedRuntimePreview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      queuedProjectionId,
      runtimeEvent: { id: completedRuntimeEvent.id, status: "completed" },
    });
    expect(completedRuntimePreview.text).toBe("Ambient switched the active project to Remote gateway project.");
    expect(runtimeEventRelayText(completedRuntimeEvent)).toBe(completedRuntimePreview.text);
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain(`Runtime event: ${completedRuntimeEvent.id}`);
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain("Runtime-event replies use Ambient-generated event text");
    expect(telegramBridgeReplyPreviewText(completedRuntimePreview)).toContain("Repair steps:");
    const relayDiagnostics = buildTelegramRelayDiagnostics({
      toolInput: telegramRelayDiagnosticsInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(relayDiagnostics).toMatchObject({
      status: "ready",
      bridgeModeLabel: "real Telegram bridge running",
      canSendOwnerRelayNow: true,
      providerLabel: "Telegram",
      selectedOwnerBindings: [{ bindingId: "remote-binding" }],
      relayableRuntimeEvents: [{ runtimeEventId: completedRuntimeEvent.id }],
      repairSteps: [
        "No repair needed; preview the selected runtime event with ambient_messaging_telegram_bridge_reply_preview using runtimeEventId.",
      ],
    });
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Remote Ambient Surface relay diagnostics");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Provider: Telegram (telegram-tdlib)");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Bridge mode: real Telegram bridge running");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain(`Event ${completedRuntimeEvent.id}`);
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Provider-specific assumptions:");
    expect(telegramRelayDiagnosticsText(relayDiagnostics)).toContain("Repair steps:");

    const syntheticDiagnostics = buildTelegramRelayDiagnostics({
      toolInput: telegramRelayDiagnosticsInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        providers: runner.runtimeStatus().providers.map((provider) => ({
          ...provider,
          state: "synthetic-active" as const,
          mode: "synthetic" as const,
        })),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(syntheticDiagnostics.status).toBe("synthetic-only");
    expect(syntheticDiagnostics.canSendOwnerRelayNow).toBe(false);
    expect(syntheticDiagnostics.blockers).toContain("Telegram is in synthetic dogfood mode; no real Telegram messages can be sent.");
    expect(syntheticDiagnostics.repairSteps).toContain(
      "Synthetic dogfood routing cannot send real Telegram messages; preview and approve ambient_messaging_gateway_lifecycle_apply with providerId=telegram-tdlib and mode=real before relay smoke testing.",
    );
    const signalChecklist = secondProviderRelayReadinessChecklist("signal");
    expect(signalChecklist).toMatchObject({
      providerCandidate: "signal",
      purpose: "remote_ambient_surface",
      headlessSafeTarget: true,
      items: expect.arrayContaining([
        expect.objectContaining({ id: "relay-diagnostics", status: "ready" }),
        expect.objectContaining({ id: "reply-adapter", required: true }),
      ]),
    });
    expect(signalChecklist.providerSpecificQuestions.join("\n")).toContain("headlessly");
    const overriddenRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({
        runtimeEventId: completedRuntimeEvent.id,
        text: "Manual status text.",
      }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(overriddenRuntimePreview.text).toBe("Ambient switched the active project to Remote gateway project.");
    expect(overriddenRuntimePreview.canApplyNow).toBe(false);
    expect(overriddenRuntimePreview.blockers).toContain(
      "Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.",
    );
    expect(overriddenRuntimePreview.repairSteps).toContain(
      "Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.",
    );

    const failedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-failed-switch",
      status: "failed",
      summary: "Active Ambient project switch failed.",
      failedAt: "2026-05-10T00:00:07.000Z",
      error: "Project switch feature is unavailable.",
    };
    const failedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: failedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [failedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(failedRuntimePreview.canApplyNow).toBe(true);
    expect(failedRuntimePreview.text).toBe(
      "Ambient could not switch the active project to Remote gateway project: Project switch feature is unavailable.",
    );

    const relayedRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-already-relayed",
      relayStatus: "sent",
      relayProviderId: "telegram-tdlib",
      relayDeliveryId: "outbound-telegram-tdlib-20260510T000004000Z",
      relayedAt: "2026-05-10T00:00:08.000Z",
      relaySuggested: false,
    };
    const relayedRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: relayedRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [relayedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(relayedRuntimePreview.canApplyNow).toBe(false);
    expect(relayedRuntimePreview.blockers).toContain("Remote Ambient Surface runtime event has already been relayed.");
    expect(relayedRuntimePreview.repairSteps).toContain(
      "Do not resend this runtime event; inspect Recent outbound deliveries in ambient_messaging_gateway_status and wait for a new runtime event if another owner update is needed.",
    );

    const missingRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: "remote-surface-missing" }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [completedRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(missingRuntimePreview.canApplyNow).toBe(false);
    expect(missingRuntimePreview.repairSteps).toContain(
      "Call ambient_messaging_gateway_status again and use an exact current runtimeEventId from Recent Remote Ambient Surface runtime events.",
    );

    const staleRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-stale-routing",
      queuedProjectionId: "projection-gone",
    };
    const staleRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: staleRuntimeEvent.id }),
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [staleRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(staleRuntimePreview.canApplyNow).toBe(false);
    expect(staleRuntimePreview.repairSteps).toContain(
      "This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides exact Telegram reply routing.",
    );

    const connectorBindings = createEmptyMessagingBindingRegistry(providers);
    connectorBindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "connector-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const connector = runner.dispatchSynthetic({
      bindings: connectorBindings.list(),
      surface,
      event: {
        id: "connector-event",
        providerId: "telegram-tdlib",
        conversationId: "connector-chat",
        sender: { id: "external-user" },
        text: "hello",
        receivedAt: "2026-05-10T00:00:05.000Z",
      },
    });
    const connectorPreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({
        queuedProjectionId: connector.queuedProjection.id,
        text: "External reply",
      }),
      bindings: connectorBindings.list({ includeInactive: false }),
      runtimeStatus: runner.runtimeStatus(),
    });
    expect(connectorPreview.canApplyNow).toBe(false);
    expect(connectorPreview.blockers).toContain("Outbound replies are currently enabled only for Remote Ambient Surface projections.");
    expect(connectorPreview.repairSteps).toContain(
      "Use only an active owner-scoped Telegram Remote Ambient Surface projection; Messaging Connector conversations remain firewalled from Ambient runtime relay state.",
    );

    const connectorRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...completedRuntimeEvent,
      id: "remote-surface-connector-blocked",
      queuedProjectionId: connector.queuedProjection.id,
      bindingId: "connector-binding",
    };
    const connectorRuntimePreview = buildTelegramBridgeReplyPreview({
      toolInput: telegramBridgeReplyInput({ runtimeEventId: connectorRuntimeEvent.id }),
      bindings: connectorBindings.list({ includeInactive: false }),
      runtimeStatus: {
        ...runner.runtimeStatus(),
        remoteSurfaceRuntimeEvents: [connectorRuntimeEvent],
        pendingRemoteSurfaceRuntimeEventCount: 0,
        recentRemoteSurfaceRuntimeEventCount: 1,
      },
    });
    expect(connectorRuntimePreview.canApplyNow).toBe(false);
    expect(connectorRuntimePreview.blockers).toContain(
      "Outbound replies are currently enabled only for Remote Ambient Surface projections.",
    );
  });
});
