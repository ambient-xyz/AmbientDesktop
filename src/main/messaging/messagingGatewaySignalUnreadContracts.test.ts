import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  applySignalUnreadWindow,
  buildSignalUnreadWindowPreview,
  buildSignalUnreadWindowStatus,
  signalUnreadWindowInput,
  signalUnreadWindowPreviewText,
  signalUnreadWindowResultText,
  signalUnreadWindowStatusInput,
  signalUnreadWindowStatusText,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { signalReadyRuntimeStatus, signalUnreadBindingList } from "./messagingGatewaySignalContractsTestSupport";

describe("messaging gateway Signal contracts", () => {
  it("previews Signal bounded unread-window routing behind the fake-bridge apply gate", () => {
    const runtimeStatus = signalReadyRuntimeStatus();
    const bindings = signalUnreadBindingList();

    const preview = buildSignalUnreadWindowPreview({
      toolInput: signalUnreadWindowInput({
        providerId: "signal-cli",
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
      }),
      bindings,
      runtimeStatus,
    });

    expect(preview).toMatchObject({
      providerId: "signal-cli",
      status: "blocked",
      canApplyNow: false,
      contractReady: true,
      previewOnly: true,
      applyToolName: "ambient_messaging_signal_unread_window_apply",
      fakeBridgeApplyEnabled: false,
      realBridgeUnreadEnabled: false,
      realBridgeUnreadReadiness: {
        status: "real-ready-for-approved-single-read",
        contractReady: true,
        singleReadReady: true,
        applyImplemented: false,
        contract: {
          kind: "signal-real-bounded-unread-window-v0",
          endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
        },
        blockers: ["Real Signal unread apply is not implemented in this build; current apply remains fake-bridge dogfood only."],
      },
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      selectedBindings: [
        {
          bindingId: "signal-binding-1",
          authProfileId: "signal-owner",
          conversationId: "signal-chat-1",
          ownerUserId: "owner-1",
        },
      ],
      safety: {
        readsProviderUnreadMessages: false,
        returnsProviderMessageBodiesToPi: false,
        routesRemoteAmbientSurface: false,
        sendsProviderMessages: false,
      },
    });
    expect(preview.blockers).toContain(
      "Signal bounded unread-window apply is enabled only for the reviewed fake bridge when AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY=1.",
    );
    expect(preview.contract.forbiddenPiVisibleFields).toContain("text");
    expect(preview.contract.bridgeInternalMessageFields).toContain("text");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Returns provider message bodies to Pi: no");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Forbidden Pi-visible fields: text");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Real Signal unread readiness:");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Status: real-ready-for-approved-single-read");
    expect(signalUnreadWindowPreviewText(preview)).toContain("Apply implemented: no");

    const ready = buildSignalUnreadWindowPreview({
      toolInput: signalUnreadWindowInput({
        providerId: "signal-cli",
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
      }),
      bindings,
      runtimeStatus,
      env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
    });
    expect(ready).toMatchObject({
      status: "ready",
      canApplyNow: true,
      contractReady: true,
      previewOnly: false,
      fakeBridgeApplyEnabled: true,
      realBridgeUnreadReadiness: {
        status: "fake-ready",
        contractReady: true,
        singleReadReady: true,
        applyImplemented: false,
      },
      safety: {
        readsProviderUnreadMessages: true,
        returnsProviderMessageBodiesToPi: false,
        routesRemoteAmbientSurface: true,
        writesDedupeState: true,
      },
    });

    const missingCapability = buildSignalUnreadWindowPreview({
      toolInput: signalUnreadWindowInput({
        providerId: "signal-cli",
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
      }),
      bindings,
      runtimeStatus: {
        ...runtimeStatus,
        providers: runtimeStatus.providers.map((provider) => ({
          ...provider,
          readiness: provider.readiness
            ? {
                ...provider.readiness,
                bridgeCapabilities: {
                  ...provider.readiness.bridgeCapabilities,
                  boundedUnreadWindow: false,
                },
              }
            : undefined,
        })),
      },
      env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
    });
    expect(missingCapability.realBridgeUnreadReadiness).toMatchObject({
      status: "real-contract-present-but-blocked",
      contractReady: false,
      singleReadReady: false,
      applyImplemented: false,
    });
    expect(missingCapability.realBridgeUnreadReadiness.blockers).toContain(
      "Real Signal unread single-read requires bridge capability boundedUnreadWindow.",
    );
    expect(signalUnreadWindowPreviewText(missingCapability)).toContain("Status: real-contract-present-but-blocked");
  });

  it("applies a Signal fake-bridge unread window through sanitized owner dispatch and dedupe", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const runner = new MessagingGatewayRunner({ providers });
    const runtimeStatus = signalReadyRuntimeStatus();
    const bindings = signalUnreadBindingList({
      metadata: {
        setupTool: "ambient_messaging_signal_remote_surface_apply",
        setupShape: "signal-owner-remote-ambient-surface",
        ownerHandoffSourceMessageId: "seen-setup",
        initialSeenMessageIds: ["seen-setup"],
      },
    });
    const preview = buildSignalUnreadWindowPreview({
      toolInput: signalUnreadWindowInput({
        providerId: "signal-cli",
        bindingId: "signal-binding-1",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
      }),
      bindings,
      runtimeStatus,
      env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-signal-unread-"));
    const requests: string[] = [];

    try {
      const result = await applySignalUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: {
          AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1",
          AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092",
        },
        fetchFn: async (url) => {
          requests.push(url);
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              providerId: "signal-cli",
              profileId: "signal-owner",
              conversationId: "signal-chat-1",
              messages: [
                { messageId: "seen-setup", senderId: "owner-1", text: "setup text must not leak", outgoing: false },
                { messageId: "outgoing-1", senderId: "owner-1", text: "outgoing text must not leak", outgoing: true },
                { messageId: "wrong-1", senderId: "other-1", text: "wrong sender text must not leak", outgoing: false },
                { messageId: "empty-1", senderId: "owner-1", text: "   ", outgoing: false },
                {
                  messageId: "command-1",
                  senderId: "owner-1",
                  senderLabel: "Owner",
                  text: "show projects private command must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          };
        },
        dispatch: (event) =>
          runner.dispatchInbound({
            source: "signal-bridge",
            event,
            bindings,
            requireRunning: false,
            redactEventTextInResult: true,
          }),
        now: () => new Date("2026-05-10T00:00:03.000Z"),
      });

      expect(requests).toEqual(["http://127.0.0.1:19092/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5"]);
      expect(result).toMatchObject({
        applyStatus: "applied",
        approvalRequested: true,
        approvalRecorded: true,
        polled: true,
        fetchedMessageCount: 5,
        candidateMessageCount: 1,
        duplicateMessageCount: 1,
        skippedMessageCount: 3,
        acceptedDispatchCount: 1,
        droppedDispatchCount: 4,
        safety: {
          readsProviderUnreadMessages: true,
          returnsProviderMessageBodiesToPi: false,
          routesRemoteAmbientSurface: true,
          writesDedupeState: true,
          sendsProviderMessages: false,
        },
      });
      expect(result.dispatches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ messageId: "seen-setup", accepted: false, droppedReason: "duplicate" }),
          expect.objectContaining({ messageId: "outgoing-1", accepted: false, droppedReason: "outgoing" }),
          expect.objectContaining({ messageId: "wrong-1", accepted: false, droppedReason: "wrong-sender" }),
          expect.objectContaining({ messageId: "empty-1", accepted: false, droppedReason: "empty" }),
          expect.objectContaining({
            messageId: "command-1",
            accepted: true,
            queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-command-1",
          }),
        ]),
      );
      const resultText = signalUnreadWindowResultText(result);
      expect(resultText).toContain("Signal bounded unread-window apply");
      expect(resultText).toContain("Accepted dispatches: 1");
      expect(resultText).toContain("Dropped reason: wrong-sender");
      expect(resultText).not.toContain("must not leak");
      const state = readFileSync(join(stateRoot, "messaging-gateway", "signal-unread-window-state.json"), "utf8");
      expect(state).toContain("command-1");
      expect(state).not.toContain("must not leak");
      expect(runner.runtimeStatus().recentEvents[0]?.text).toBe("[provider message text withheld]");

      const status = buildSignalUnreadWindowStatus({
        toolInput: signalUnreadWindowStatusInput({
          providerId: "signal-cli",
          bindingId: "signal-binding-1",
          profileId: "signal-owner",
          conversationId: "signal-chat-1",
        }),
        bindings,
        runtimeStatus: runner.runtimeStatus(),
        stateRoot,
        env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
      });
      expect(status).toMatchObject({
        status: "ready",
        fakeBridgeApplyEnabled: true,
        realBridgeUnreadEnabled: false,
        realBridgeUnreadReadiness: {
          status: "real-contract-present-but-blocked",
          contractReady: false,
          singleReadReady: false,
          applyImplemented: false,
          contract: {
            kind: "signal-real-bounded-unread-window-v0",
            endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=10",
          },
        },
        selectedBindingCount: 1,
        dedupeBindingCount: 1,
        queuedSignalProjectionCount: 1,
        bindings: [
          {
            bindingId: "signal-binding-1",
            dedupeSeenMessageCount: 5,
            lastAcceptedMessageId: "command-1",
            queuedProjectionCount: 1,
            queuedProjections: [
              {
                queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-command-1",
                projectionKind: "unsupported",
              },
            ],
          },
        ],
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });
      const statusText = signalUnreadWindowStatusText(status);
      expect(statusText).toContain("Signal unread-window status");
      expect(statusText).toContain("Real Signal unread ingestion enabled: no");
      expect(statusText).toContain("Status: real-contract-present-but-blocked");
      expect(statusText).toContain("Contract: signal-real-bounded-unread-window-v0");
      expect(statusText).toContain("Last accepted message: command-1");
      expect(statusText).toContain("projection-signal-cli-signal-signal-owner-signal-chat-1-command-1");
      expect(statusText).not.toContain("must not leak");

      const readyStatus = buildSignalUnreadWindowStatus({
        toolInput: signalUnreadWindowStatusInput({
          providerId: "signal-cli",
          bindingId: "signal-binding-1",
          profileId: "signal-owner",
          conversationId: "signal-chat-1",
        }),
        bindings,
        runtimeStatus: {
          ...runner.runtimeStatus(),
          providers: signalReadyRuntimeStatus().providers,
        },
        stateRoot,
        env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
      });
      expect(readyStatus.realBridgeUnreadReadiness).toMatchObject({
        status: "fake-ready",
        contractReady: true,
        singleReadReady: true,
        applyImplemented: false,
      });
      expect(signalUnreadWindowStatusText(readyStatus)).toContain("Status: fake-ready");

      const inactiveBindings = {
        ...bindings,
        bindings: bindings.bindings.map((binding) => ({ ...binding, status: "paused" as const })),
        activeBindingCount: 0,
      };
      const inactiveStatus = buildSignalUnreadWindowStatus({
        toolInput: signalUnreadWindowStatusInput({
          providerId: "signal-cli",
          bindingId: "signal-binding-1",
          profileId: "signal-owner",
          conversationId: "signal-chat-1",
          includeInactive: true,
        }),
        bindings: inactiveBindings,
        runtimeStatus: {
          ...runner.runtimeStatus(),
          providers: signalReadyRuntimeStatus().providers,
        },
        stateRoot,
        env: { AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1" },
      });
      expect(inactiveStatus.realBridgeUnreadReadiness).toMatchObject({
        status: "real-contract-present-but-blocked",
        contractReady: false,
        singleReadReady: false,
        applyImplemented: false,
      });
      expect(inactiveStatus.realBridgeUnreadReadiness.blockers).toContain("Selected binding is not active.");

      const repeated = await applySignalUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: {
          AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1",
          AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092",
        },
        fetchFn: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            providerId: "signal-cli",
            profileId: "signal-owner",
            conversationId: "signal-chat-1",
            messages: [
              { messageId: "seen-setup", senderId: "owner-1", text: "setup text must not leak", outgoing: false },
              { messageId: "outgoing-1", senderId: "owner-1", text: "outgoing text must not leak", outgoing: true },
              { messageId: "wrong-1", senderId: "other-1", text: "wrong sender text must not leak", outgoing: false },
              { messageId: "empty-1", senderId: "owner-1", text: "   ", outgoing: false },
              {
                messageId: "command-1",
                senderId: "owner-1",
                senderLabel: "Owner",
                text: "show projects private command must not leak",
                receivedAt: "2026-05-10T00:00:02.000Z",
                outgoing: false,
              },
            ],
          }),
        }),
        dispatch: (event) =>
          runner.dispatchInbound({
            source: "signal-bridge",
            event,
            bindings,
            requireRunning: false,
            redactEventTextInResult: true,
          }),
        now: () => new Date("2026-05-10T00:00:04.000Z"),
      });
      expect(repeated).toMatchObject({
        applyStatus: "applied",
        fetchedMessageCount: 5,
        duplicateMessageCount: 5,
        skippedMessageCount: 0,
        acceptedDispatchCount: 0,
        droppedDispatchCount: 5,
        seenMessageCount: 5,
        lastAcceptedMessageId: "command-1",
      });
      expect(repeated.dispatches.every((dispatch) => dispatch.droppedReason === "duplicate")).toBe(true);
      expect(runner.runtimeStatus().queuedProjectionCount).toBe(1);
      expect(signalUnreadWindowResultText(repeated)).toContain("Duplicate messages: 5");
      expect(signalUnreadWindowResultText(repeated)).not.toContain("must not leak");

      const violation = await applySignalUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: {
          AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "1",
          AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092",
        },
        fetchFn: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            providerId: "signal-cli",
            profileId: "signal-owner",
            conversationId: "signal-chat-1",
            messages: [{ messageId: "bad-1", senderId: "owner-1", body: "forbidden private body" }],
          }),
        }),
        dispatch: (event) =>
          runner.dispatchInbound({
            source: "signal-bridge",
            event,
            bindings,
            requireRunning: false,
            redactEventTextInResult: true,
          }),
      });
      expect(violation).toMatchObject({
        applyStatus: "failed",
        polled: false,
        acceptedDispatchCount: 0,
      });
      expect(signalUnreadWindowResultText(violation)).not.toContain("forbidden private body");
      expect(signalUnreadWindowResultText(violation)).toContain("forbidden field");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
