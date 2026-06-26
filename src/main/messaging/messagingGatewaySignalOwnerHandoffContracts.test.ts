import { describe, expect, it } from "vitest";
import type { MessagingBindingListResult, MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import {
  applySignalOwnerHandoff,
  buildSignalOwnerHandoffPreview,
  signalOwnerHandoffBlockedApplyResult,
  signalOwnerHandoffInput,
  signalOwnerHandoffPreviewText,
  signalOwnerHandoffResultText,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway Signal contracts", () => {
  it("previews Signal owner handoff contract without enabling unread reads or binding apply", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const runtimeStatus: MessagingGatewayRuntimeStatus = {
      status: "idle",
      providerCount: 1,
      activeProviderCount: 0,
      syntheticActiveProviderCount: 0,
      queuedProjectionCount: 0,
      recentEventCount: 0,
      outboundDeliveryCount: 0,
      providers: [
        {
          providerId: "signal-cli",
          label: "Signal",
          state: "stopped",
          mode: "none",
          syntheticEventCount: 0,
          realEventCount: 0,
          queuedProjectionCount: 0,
          readiness: {
            providerId: "signal-cli",
            status: "unavailable",
            configured: true,
            bridgeReachable: true,
            bridgeCapabilities: {
              profileStatus: true,
              metadataOnlyConversationDirectory: true,
              boundedUnreadWindow: true,
              approvedReplySend: false,
            },
            authNeeded: false,
            apiCredentialsPresent: false,
            persistedSessionCount: 1,
            checkedAt: "2026-05-10T00:00:00.000Z",
            message: "Signal bridge contract readiness is present.",
            diagnostics: ["Signal bridge root contract accepted."],
            sessions: [
              {
                profileId: "signal-owner",
                metadataPath: "/tmp/signal-owner/bridge-session.json",
                metadataReadable: true,
                tdlibStateDirPresent: false,
                phoneNumberPresent: false,
                databaseEncryptionKeyPresent: false,
                signalCliConfigDirPresent: true,
                accountIdentifierPresent: true,
                linkedDevicePresent: true,
                registrationMetadataPresent: true,
                bridgeSessionReadable: true,
              },
            ],
          },
        },
      ],
      queuedProjections: [],
      recentOutboundDeliveries: [],
      recentEvents: [],
    };
    const bindings: MessagingBindingListResult = {
      bindings: [],
      bindingCount: 0,
      activeBindingCount: 0,
      remoteAmbientSurfaceCount: 0,
      messagingConnectorCount: 0,
      headlessSafeBindingCount: 0,
    };

    const preview = buildSignalOwnerHandoffPreview({
      toolInput: signalOwnerHandoffInput({
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        setupCode: "ambient-signal-setup-code-12345",
        limit: 5,
      }),
      bindings,
      runtimeStatus,
      descriptor: providers.get("signal-cli")?.descriptor,
    });

    expect(preview).toMatchObject({
      providerId: "signal-cli",
      status: "blocked",
      canApplyNow: false,
      previewOnly: true,
      typedPreviewTool: "ambient_messaging_signal_owner_handoff_preview",
      typedApplyTool: "ambient_messaging_signal_owner_handoff_apply",
      bindingApplyTool: "none",
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      setupCodeLength: "ambient-signal-setup-code-12345".length,
      setupCodePreview: "31 chars",
      gates: {
        profileSelected: true,
        conversationSelected: true,
        setupCodeReady: true,
        bridgeReadableProfile: true,
        boundedUnreadWindowAvailable: true,
        fakeBridgeApplyEnabled: false,
        ownerHandoffApplyAvailable: false,
        bindingApplyAvailable: false,
      },
      safety: {
        readsProviderUnreadMessages: false,
        filtersExactSetupCode: false,
        returnsMatchedSenderId: false,
        returnsProviderMessageContent: false,
        writesInitialDedupeState: false,
        createsBinding: false,
        usesTelegramOwnerHandoff: false,
      },
    });
    expect(preview.contract.kind).toBe("signal-owner-handoff-v0");
    expect(preview.contract.applyToolName).toBe("ambient_messaging_signal_owner_handoff_apply");
    expect(preview.contract.initialDedupeFields).toContain("initialSeenMessageIds");
    expect(preview.blockers.join("\n")).toContain("AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY=1");
    expect(preview.policyNotes.join("\n")).toContain("compare message text to the one-time setup code internally");
    const text = signalOwnerHandoffPreviewText(preview);
    expect(text).toContain("Signal owner handoff preview: blocked");
    expect(text).toContain("Typed apply tool: ambient_messaging_signal_owner_handoff_apply");
    expect(text).toContain("Binding apply tool: none");
    expect(text).toContain("Reads Signal unread messages now: no");
    expect(text).toContain("Returns provider message content: no");
    expect(text).toContain("Uses Telegram owner handoff: no");
    expect(text).not.toContain("ambient-signal-setup-code-12345");

    const result = signalOwnerHandoffBlockedApplyResult(preview);
    expect(result).toMatchObject({
      applyStatus: "blocked",
      approvalRequested: false,
      approvalRecorded: false,
      handoffStatus: "not-attempted",
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      matchedMessageCount: 0,
      matchedSenderCount: 0,
      initialSeenMessageIds: [],
      canFeedBindingApply: false,
      bindingApplyInputReady: false,
      failureMode: "fake-bridge-apply-disabled",
      safety: {
        readsProviderUnreadMessages: false,
        returnsMatchedSenderId: false,
        returnsProviderMessageContent: false,
        writesInitialDedupeState: false,
        createsBinding: false,
        usesTelegramOwnerHandoff: false,
      },
    });
    expect("ownerUserId" in result).toBe(false);
    const resultText = signalOwnerHandoffResultText(result);
    expect(resultText).toContain("Signal owner handoff apply: blocked");
    expect(resultText).toContain("Handoff status: not-attempted");
    expect(resultText).toContain("Can feed binding apply: no");
    expect(resultText).toContain("Reads Signal unread messages: no");
    expect(resultText).not.toContain("ambient-signal-setup-code-12345");
  });

  it("applies Signal fake-bridge owner handoff behind the explicit apply gate", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const runtimeStatus: MessagingGatewayRuntimeStatus = {
      status: "idle",
      providerCount: 1,
      activeProviderCount: 0,
      syntheticActiveProviderCount: 0,
      queuedProjectionCount: 0,
      recentEventCount: 0,
      outboundDeliveryCount: 0,
      providers: [
        {
          providerId: "signal-cli",
          label: "Signal",
          state: "stopped",
          mode: "none",
          syntheticEventCount: 0,
          realEventCount: 0,
          queuedProjectionCount: 0,
          readiness: {
            providerId: "signal-cli",
            status: "unavailable",
            configured: true,
            bridgeReachable: true,
            bridgeCapabilities: {
              profileStatus: true,
              metadataOnlyConversationDirectory: true,
              boundedUnreadWindow: true,
              approvedReplySend: false,
            },
            authNeeded: false,
            apiCredentialsPresent: false,
            persistedSessionCount: 1,
            checkedAt: "2026-05-10T00:00:00.000Z",
            message: "Signal bridge contract readiness is present.",
            diagnostics: ["Signal bridge root contract accepted."],
            sessions: [
              {
                profileId: "signal-owner",
                metadataPath: "/tmp/signal-owner/bridge-session.json",
                metadataReadable: true,
                tdlibStateDirPresent: false,
                phoneNumberPresent: false,
                databaseEncryptionKeyPresent: false,
                signalCliConfigDirPresent: true,
                accountIdentifierPresent: true,
                linkedDevicePresent: true,
                registrationMetadataPresent: true,
                bridgeSessionReadable: true,
              },
            ],
          },
        },
      ],
      queuedProjections: [],
      recentOutboundDeliveries: [],
      recentEvents: [],
    };
    const bindings: MessagingBindingListResult = {
      bindings: [],
      bindingCount: 0,
      activeBindingCount: 0,
      remoteAmbientSurfaceCount: 0,
      messagingConnectorCount: 0,
      headlessSafeBindingCount: 0,
    };
    const setupCode = "ambient-signal-setup-code-12345";
    const requests: string[] = [];
    const preview = buildSignalOwnerHandoffPreview({
      toolInput: signalOwnerHandoffInput({
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        setupCode,
        limit: 5,
      }),
      bindings,
      runtimeStatus,
      descriptor: providers.get("signal-cli")?.descriptor,
      env: { AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY: "1" },
    });

    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      previewOnly: false,
      fakeBridgeApplyEnabled: true,
      endpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      gates: {
        fakeBridgeApplyEnabled: true,
        ownerHandoffApplyAvailable: true,
        bindingApplyAvailable: false,
      },
      safety: {
        readsProviderUnreadMessages: true,
        filtersExactSetupCode: true,
        returnsMatchedSenderId: true,
        returnsProviderMessageContent: false,
      },
    });

    const result = await applySignalOwnerHandoff({
      preview,
      setupCode,
      approvalRecorded: true,
      env: {
        AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY: "1",
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
              {
                messageId: "seen-1",
                senderId: "signal-owner-sender",
                senderLabel: "Signal Owner",
                text: setupCode,
                receivedAt: "2026-05-10T00:00:00.000Z",
                outgoing: false,
              },
              {
                messageId: "seen-2",
                senderId: "other",
                text: "unrelated private text",
                outgoing: false,
              },
            ],
          }),
        };
      },
    });

    expect(requests).toEqual(["http://127.0.0.1:19092/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5"]);
    expect(result).toMatchObject({
      applyStatus: "applied",
      approvalRequested: true,
      approvalRecorded: true,
      handoffStatus: "matched",
      fetchedMessageCount: 2,
      candidateMessageCount: 2,
      matchedMessageCount: 1,
      matchedSenderCount: 1,
      ownerUserId: "signal-owner-sender",
      ownerLabel: "Signal Owner",
      sourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
      canFeedBindingApply: true,
      bindingApplyInputReady: true,
      failureMode: "none",
      safety: {
        readsProviderUnreadMessages: true,
        filtersExactSetupCode: true,
        returnsMatchedSenderId: true,
        returnsProviderMessageContent: false,
        createsBinding: false,
        usesTelegramOwnerHandoff: false,
      },
    });
    const resultText = signalOwnerHandoffResultText(result);
    expect(resultText).toContain("Signal owner handoff apply: applied");
    expect(resultText).toContain("Handoff status: matched");
    expect(resultText).toContain("Can feed binding apply: yes");
    expect(resultText).toContain("Owner user: signal-owner-sender");
    expect(resultText).not.toContain(setupCode);
    expect(resultText).not.toContain("unrelated private text");

    const ambiguous = await applySignalOwnerHandoff({
      preview,
      setupCode,
      approvalRecorded: true,
      env: {
        AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY: "1",
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
            { messageId: "m1", senderId: "sender-1", text: setupCode, outgoing: false },
            { messageId: "m2", senderId: "sender-2", text: setupCode, outgoing: false },
          ],
        }),
      }),
    });
    expect(ambiguous).toMatchObject({
      applyStatus: "failed",
      handoffStatus: "ambiguous",
      canFeedBindingApply: false,
      failureMode: "ambiguous",
    });

    const violation = await applySignalOwnerHandoff({
      preview,
      setupCode,
      approvalRecorded: true,
      env: {
        AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY: "1",
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
          messages: [{ messageId: "m1", senderId: "sender-1", body: setupCode }],
        }),
      }),
    });
    expect(violation).toMatchObject({
      applyStatus: "failed",
      handoffStatus: "not-attempted",
      canFeedBindingApply: false,
      failureMode: "bridge-contract-violation",
    });
    expect(signalOwnerHandoffResultText(violation)).not.toContain(setupCode);
  });
});
