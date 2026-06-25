import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  applySignalRealUnreadWindow,
  buildSignalRealPollingControlPreview,
  buildSignalRealPollingStatus,
  buildSignalRealUnreadWindowPreview,
  buildSignalUnreadWindowPreview,
  SignalRealPollingRunner,
  signalRealPollingControlInput,
  signalRealPollingControlPreviewText,
  signalRealPollingControlResultText,
  signalRealPollingStatusText,
  signalRealUnreadWindowDeniedResult,
  signalRealUnreadWindowInput,
  signalRealUnreadWindowPreviewText,
  signalRealUnreadWindowResultText,
  signalUnreadWindowInput,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { signalReadyRuntimeStatus, signalUnreadBindingList } from "./messagingGatewaySignalContractsTestSupport";

describe("messaging gateway Signal real unread and polling contracts", () => {
  it("applies a real Signal unread single-read through the dedicated reviewed boundary", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const runner = new MessagingGatewayRunner({ providers });
    const runtimeStatus = signalReadyRuntimeStatus();
    const bindings = signalUnreadBindingList();

    const preview = buildSignalRealUnreadWindowPreview({
      toolInput: signalRealUnreadWindowInput({
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
      status: "ready",
      canApplyNow: true,
      previewOnly: false,
      approvalRequired: true,
      applyToolName: "ambient_messaging_signal_real_unread_window_apply",
      realBridgeUnreadEnabled: true,
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      realBridgeUnreadReadiness: {
        status: "real-ready-for-approved-single-read",
        contractReady: true,
        singleReadReady: true,
        applyImplemented: true,
        contract: {
          kind: "signal-real-bounded-unread-window-v0",
          endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
        },
      },
      safety: {
        requestsApproval: true,
        contactsBridgeUnreadEndpoint: true,
        readsProviderUnreadMessages: true,
        returnsProviderMessageBodiesToPi: false,
        routesRemoteAmbientSurface: true,
        writesDedupeState: true,
        sendsProviderMessages: false,
      },
    });
    expect(preview.blockers).toEqual([]);
    expect(signalRealUnreadWindowPreviewText(preview)).toContain("Signal real unread-window preview: ready");
    expect(signalRealUnreadWindowPreviewText(preview)).toContain("Approval required before apply: yes");
    expect(signalRealUnreadWindowPreviewText(preview)).toContain("Contacts bridge unread endpoint: yes");
    expect(signalRealUnreadWindowPreviewText(preview)).toContain("Ready for approved single read: yes");
    expect(signalRealUnreadWindowPreviewText(preview)).toContain("Apply implemented: yes");

    const denied = signalRealUnreadWindowDeniedResult(preview, "/tmp/signal-state.json");
    expect(denied).toMatchObject({
      applyStatus: "denied",
      approvalRequested: true,
      approvalRecorded: false,
      polled: false,
      fetchedMessageCount: 0,
    });

    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-signal-real-unread-"));
    const requests: string[] = [];
    try {
      const result = await applySignalRealUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: {
          AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY: "0",
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
                  messageId: "real-command-1",
                  senderId: "owner-1",
                  senderLabel: "Owner",
                  text: "show projects private real command must not leak",
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
          contactsBridgeUnreadEndpoint: true,
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
            messageId: "real-command-1",
            accepted: true,
            queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-real-command-1",
          }),
        ]),
      );
      const resultText = signalRealUnreadWindowResultText(result);
      expect(resultText).toContain("Signal real unread-window apply");
      expect(resultText).toContain("Apply status: applied");
      expect(resultText).toContain("Accepted dispatches: 1");
      expect(resultText).toContain("Contacts bridge unread endpoint: yes");
      expect(resultText).not.toContain("must not leak");
      expect(runner.runtimeStatus().recentEvents[0]?.text).toBe("[provider message text withheld]");

      const repeat = await applySignalRealUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: { AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092" },
        fetchFn: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            providerId: "signal-cli",
            profileId: "signal-owner",
            conversationId: "signal-chat-1",
            messages: [{ messageId: "real-command-1", senderId: "owner-1", text: "duplicate private text must not leak", outgoing: false }],
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
      expect(repeat).toMatchObject({
        applyStatus: "applied",
        fetchedMessageCount: 1,
        duplicateMessageCount: 1,
        acceptedDispatchCount: 0,
        droppedDispatchCount: 1,
      });
      expect(signalRealUnreadWindowResultText(repeat)).not.toContain("duplicate private text must not leak");

      const forbiddenPayload = await applySignalRealUnreadWindow({
        preview,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: { AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092" },
        fetchFn: async () => ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            providerId: "signal-cli",
            profileId: "signal-owner",
            conversationId: "signal-chat-1",
            rawMessage: "raw private payload must not leak",
            messages: [],
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
      expect(forbiddenPayload).toMatchObject({
        applyStatus: "failed",
        approvalRequested: true,
        approvalRecorded: true,
        polled: false,
        fetchedMessageCount: 0,
      });
      expect(forbiddenPayload.error).toContain("forbidden field rawMessage");
      expect(signalRealUnreadWindowResultText(forbiddenPayload)).not.toContain("raw private payload must not leak");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    const fakeDogfoodReady = buildSignalUnreadWindowPreview({
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
    expect(fakeDogfoodReady).toMatchObject({
      canApplyNow: true,
      applyToolName: "ambient_messaging_signal_unread_window_apply",
      realBridgeUnreadReadiness: {
        status: "fake-ready",
      },
      safety: {
        readsProviderUnreadMessages: true,
      },
    });
    expect(preview.applyToolName).not.toBe(fakeDogfoodReady.applyToolName);
    expect(preview.safety.readsProviderUnreadMessages).toBe(true);

    const missingExactBinding = buildSignalRealUnreadWindowPreview({
      toolInput: signalRealUnreadWindowInput({
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        limit: 5,
      }),
      bindings,
      runtimeStatus,
    });
    expect(missingExactBinding.realBridgeUnreadReadiness).toMatchObject({
      status: "real-contract-present-but-blocked",
      contractReady: false,
      singleReadReady: false,
      applyImplemented: true,
    });
    expect(missingExactBinding.blockers).toContain(
      "Real Signal unread apply requires an exact active bindingId before apply can be ready.",
    );
    expect(missingExactBinding.blockers).toContain(
      "Real Signal unread single-read requires one exact active Signal Remote Ambient Surface binding.",
    );

    const missingCapability = buildSignalRealUnreadWindowPreview({
      toolInput: signalRealUnreadWindowInput({
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
    });
    expect(missingCapability).toMatchObject({
      status: "blocked",
      canApplyNow: false,
      realBridgeUnreadEnabled: false,
      realBridgeUnreadReadiness: {
        status: "real-contract-present-but-blocked",
        applyImplemented: true,
      },
    });
    expect(missingCapability.blockers).toContain("Real Signal unread single-read requires bridge capability boundedUnreadWindow.");
  });

  it("starts and stops approved Signal real polling through the reviewed single-read core", async () => {
    const runtimeStatus = signalReadyRuntimeStatus();
    const bindings = signalUnreadBindingList();

    const status = buildSignalRealPollingStatus({
      bindings,
      runtimeStatus,
      limit: 5,
      intervalMs: 45_000,
    });
    expect(status).toMatchObject({
      providerId: "signal-cli",
      runnerState: "stopped",
      running: false,
      backgroundLoopImplemented: true,
      timersActive: false,
      selectedBindingCount: 1,
      realSingleReadReadyBindingCount: 1,
      totalPollCount: 0,
      acceptedDispatchCount: 0,
    });
    expect(signalRealPollingStatusText(status)).toContain("Signal real polling runner status");
    expect(signalRealPollingStatusText(status)).toContain("Background loop implemented: yes");
    expect(signalRealPollingStatusText(status)).toContain("Real single-read ready bindings: 1");

    const input = signalRealPollingControlInput({
      action: "start",
      providerId: "signal-cli",
      bindingId: "signal-binding-1",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      limit: 5,
      intervalMs: 45_000,
    });
    let scheduledPoll: (() => void) | undefined;
    let scheduledIntervalMs = 0;
    let clearedTimers = 0;
    const pollingRunner = new SignalRealPollingRunner({
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      schedulePoll: (callback, intervalMs) => {
        scheduledPoll = callback;
        scheduledIntervalMs = intervalMs;
        return { unref: () => undefined } as ReturnType<typeof setInterval> & { unref?: () => void };
      },
      clearPoll: () => {
        clearedTimers += 1;
      },
    });
    const preview = pollingRunner.preview({
      toolInput: input,
      bindings,
      runtimeStatus,
    });
    expect(preview).toMatchObject({
      action: "start",
      status: "ready",
      canApplyNow: true,
      approvalRequired: true,
      applyToolName: "ambient_messaging_signal_real_polling_apply",
      backgroundLoopImplemented: true,
      selectedBindingCount: 1,
      realSingleReadReadyBindingCount: 1,
      singleReadPreview: {
        status: "ready",
        canApplyNow: true,
        applyToolName: "ambient_messaging_signal_real_unread_window_apply",
      },
      safety: {
        requestsApproval: true,
        startsTimer: true,
        contactsBridgeUnreadEndpoint: true,
        readsProviderUnreadMessages: true,
        routesRemoteAmbientSurface: true,
        writesDedupeState: true,
        sendsProviderMessages: false,
        usesReviewedSingleReadCore: true,
      },
    });
    expect(signalRealPollingControlPreviewText(preview)).toContain("Signal real polling start preview");
    expect(signalRealPollingControlPreviewText(preview)).toContain("Starts timer: yes");
    expect(signalRealPollingControlPreviewText(preview)).toContain("Reads provider unread messages: yes");
    expect(signalRealPollingControlPreviewText(preview)).toContain("Signal real unread-window preview: ready");

    const denied = await pollingRunner.apply({
      preview,
      approvalRecorded: false,
      pollOnce: async () => {
        throw new Error("denied apply must not poll");
      },
    });
    expect(denied).toMatchObject({
      applyStatus: "denied",
      immediatePollAttempted: false,
    });

    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-signal-real-polling-"));
    const gatewayRunner = new MessagingGatewayRunner({ providers: createDefaultMessagingProviderRegistry() });
    const requests: string[] = [];
    const pollOnce = async () =>
      await applySignalRealUnreadWindow({
        preview: preview.singleReadPreview!,
        bindings,
        stateRoot,
        approvalRecorded: true,
        env: { AMBIENT_SIGNAL_BRIDGE_URL: "http://127.0.0.1:19092" },
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
                {
                  messageId: "signal-real-polling-1",
                  senderId: "owner-1",
                  senderLabel: "Owner",
                  text: "polling private text must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          };
        },
        dispatch: (event) =>
          gatewayRunner.dispatchInbound({
            source: "signal-bridge",
            event,
            bindings,
            requireRunning: false,
            redactEventTextInResult: true,
          }),
        now: () => new Date("2026-05-10T00:00:03.000Z"),
      });

    const result = await pollingRunner.apply({
      preview,
      approvalRecorded: true,
      pollOnce,
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      approvalRecorded: true,
      startedTimer: true,
      stoppedTimer: false,
      immediatePollAttempted: true,
      runnerState: "running",
      running: true,
      timersActive: true,
      totalPollCount: 1,
      successfulPollCount: 1,
      fetchedMessageCount: 1,
      acceptedDispatchCount: 1,
    });
    expect(scheduledIntervalMs).toBe(45_000);
    expect(scheduledPoll).toBeTypeOf("function");
    expect(signalRealPollingControlResultText(result)).toContain("Signal real polling start apply");
    expect(signalRealPollingControlResultText(result)).toContain("Apply status: applied");
    expect(signalRealPollingControlResultText(result)).toContain("Immediate poll:");
    expect(gatewayRunner.runtimeStatus().recentEvents[0]?.text).toBe("[provider message text withheld]");
    expect(JSON.stringify(result)).not.toContain("polling private text must not leak");
    expect(requests).toEqual(["http://127.0.0.1:19092/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5"]);

    await pollingRunner.runScheduledPoll();
    expect(pollingRunner.status().totalPollCount).toBe(2);
    expect(pollingRunner.status().duplicateMessageCount).toBe(1);
    expect(requests).toHaveLength(2);

    const stopPreview = pollingRunner.preview({
      toolInput: signalRealPollingControlInput({
        action: "stop",
        providerId: "signal-cli",
      }),
      bindings,
      runtimeStatus,
    });
    expect(stopPreview).toMatchObject({
      action: "stop",
      status: "ready",
      canApplyNow: true,
      approvalRequired: false,
      safety: {
        startsTimer: false,
        stopsTimer: true,
        readsProviderUnreadMessages: false,
        sendsProviderMessages: false,
      },
    });
    const stopped = await pollingRunner.apply({
      preview: stopPreview,
      approvalRecorded: true,
      pollOnce,
    });
    expect(stopped).toMatchObject({
      applyStatus: "applied",
      stoppedTimer: true,
      immediatePollAttempted: false,
      runnerState: "stopped",
      running: false,
      timersActive: false,
    });
    expect(clearedTimers).toBe(1);
    await pollingRunner.runScheduledPoll();
    expect(requests).toHaveLength(2);

    const missingBinding = buildSignalRealPollingControlPreview({
      toolInput: signalRealPollingControlInput({
        action: "start",
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
      }),
      bindings,
      runtimeStatus,
    });
    expect(missingBinding.blockers).toContain("Signal real polling requires an exact active bindingId before start can be approved.");
    expect(missingBinding.safety.readsProviderUnreadMessages).toBe(false);
  });
});
