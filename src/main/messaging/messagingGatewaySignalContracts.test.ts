import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  MessagingBindingListResult,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
} from "../../shared/messagingGateway";
import { createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  buildMessagingConversationDirectoryPreview,
  messagingConversationDirectoryInput,
  messagingConversationDirectoryPreviewText,
} from "./messagingConversationDirectory";
import { sanitizeMessagingConversationDirectoryEntry } from "./messagingConversationDirectoryContract";
import {
  applySignalBridgeReply,
  applySignalConversationDirectory,
  applySignalOwnerHandoff,
  applySignalRealUnreadWindow,
  applySignalUnreadWindow,
  buildSignalBindingReadinessPreview,
  buildSignalBridgeReplyPreview,
  buildSignalBridgeReplyStatus,
  buildSignalConversationDirectoryPreview,
  buildSignalOwnerHandoffPreview,
  buildSignalRealPollingControlPreview,
  buildSignalRealPollingStatus,
  buildSignalRealUnreadWindowPreview,
  buildSignalRelayDiagnostics,
  buildSignalRemoteSurfaceBindingPlan,
  buildSignalRemoteSurfaceBindingRevokePlan,
  buildSignalUnreadWindowPreview,
  buildSignalUnreadWindowStatus,
  SignalRealPollingRunner,
  signalBindingReadinessInput,
  signalBindingReadinessPreviewText,
  signalBridgeReplyApprovalDetail,
  signalBridgeReplyInput,
  signalBridgeReplyPreviewText,
  signalBridgeReplyResultText,
  signalBridgeReplyStatusText,
  signalConversationDirectoryBlockedResult,
  signalConversationDirectoryInput,
  signalConversationDirectoryPreviewText,
  signalConversationDirectoryResultText,
  signalOwnerHandoffBlockedApplyResult,
  signalOwnerHandoffInput,
  signalOwnerHandoffPreviewText,
  signalOwnerHandoffResultText,
  signalRealPollingControlInput,
  signalRealPollingControlPreviewText,
  signalRealPollingControlResultText,
  signalRealPollingStatusText,
  signalRealUnreadWindowDeniedResult,
  signalRealUnreadWindowInput,
  signalRealUnreadWindowPreviewText,
  signalRealUnreadWindowResultText,
  signalRelayDiagnosticsInput,
  signalRelayDiagnosticsText,
  signalRemoteSurfaceBindingAppliedResult,
  signalRemoteSurfaceBindingCreateInput,
  signalRemoteSurfaceBindingInput,
  signalRemoteSurfaceBindingRevokeInput,
  signalRemoteSurfaceBindingRevokeInputForStore,
  signalRemoteSurfaceBindingRevokeText,
  signalRemoteSurfaceBindingRevokedResult,
  signalRemoteSurfaceBindingText,
  signalSessionMetadataContract,
  signalUnreadWindowInput,
  signalUnreadWindowPreviewText,
  signalUnreadWindowResultText,
  signalUnreadWindowStatusInput,
  signalUnreadWindowStatusText,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import { withTelegramBridgeServer, readJson, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway Signal contracts", () => {
  it("blocks planned Signal conversation directory preview with adapter guidance", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    const preview = buildMessagingConversationDirectoryPreview({
      toolInput: messagingConversationDirectoryInput({
        providerId: "signal-cli",
        purpose: "remote_ambient_surface",
      }),
      providers,
      bindings: bindings.list({ includeInactive: false }),
    });

    expect(preview).toMatchObject({
      status: "blocked",
      providerCount: 1,
      providers: [
        {
          providerId: "signal-cli",
          status: "blocked",
          mode: "planned",
          implementationStatus: "planned",
          purposeSupported: true,
          conversationDiscoveryDeclared: true,
          canListProviderConversationsNow: false,
          knownAuthProfiles: [],
          knownConversations: [],
        },
      ],
    });
    expect(preview.providers[0].providerDirectoryTool).toBe("ambient_messaging_signal_conversation_directory_preview");
    expect(preview.providers[0].metadataOnlyContract).toMatchObject({
      kind: "metadata-only-routing",
      failClosedOnPayloadFields: true,
    });
    expect(preview.providers[0].metadataOnlyContract.allowedFields).toContain("conversationId");
    expect(preview.providers[0].metadataOnlyContract.forbiddenPayloadFields).toContain("lastMessage");
    expect(preview.providers[0].blockers.join("\n")).toContain("Provider implementation is planned");
    expect(preview.providers[0].directoryAdapterStatus).toBe("available");
    expect(preview.providers[0].directoryAdapterKind).toBe("live-metadata-only-adapter");
    expect(preview.providers[0].directoryAdapterRequiresApproval).toBe(true);
    expect(preview.providers[0].blockers.join("\n")).toContain("requires refreshed Signal readiness");
    expect(preview.providers[0].policyNotes.join("\n")).toContain("metadata-only routing contract");
    expect(preview.providers[0].nextSteps.join("\n")).toContain("Do not use provider CLIs");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Directory mode: planned");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain(
      "Provider directory tool: ambient_messaging_signal_conversation_directory_preview",
    );
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Metadata-only contract: metadata-only-routing");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Forbidden payload fields fail closed");
  });

  it("blocks Signal conversation-directory apply until a reviewed bridge contract is ready", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const descriptor = providers.get("signal-cli")!.descriptor;
    const preview = buildSignalConversationDirectoryPreview({
      toolInput: signalConversationDirectoryInput({
        profileId: "signal-owner",
        query: "owner chat",
        purpose: "remote_ambient_surface",
        limit: 5,
      }),
      runtimeStatus: {
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
              configured: false,
              bridgeReachable: false,
              authNeeded: true,
              apiCredentialsPresent: false,
              persistedSessionCount: 0,
              checkedAt: "2026-05-10T00:00:00.000Z",
              message: "Signal is planned.",
              diagnostics: ["No Signal I/O."],
              sessions: [],
            },
          },
        ],
        queuedProjections: [],
        recentOutboundDeliveries: [],
        recentEvents: [],
      },
      descriptor,
    });
    const result = signalConversationDirectoryBlockedResult(preview);

    expect(preview).toMatchObject({
      providerId: "signal-cli",
      status: "blocked",
      implementationStatus: "planned",
      purposeSupported: true,
      canApplyNow: false,
      readinessStatus: "unavailable",
      configured: false,
      bridgeReachable: false,
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        runsProviderCli: false,
        inspectsSignalDesktop: false,
        readsProviderConversationMetadata: false,
        returnsProviderMessageContent: false,
      },
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        executionStatus: "preview",
        requiresApprovalForApply: true,
        approvalRecorded: false,
        canApplyWithReadiness: false,
        failureMode: "bridge-unreachable",
      },
    });
    expect(preview.metadataOnlyContract).toMatchObject({
      kind: "metadata-only-routing",
      failClosedOnPayloadFields: true,
    });
    expect(preview.sessionMetadataContract).toEqual(signalSessionMetadataContract());
    expect(preview.sessionMetadataContract.requiredFutureFields).toContain("signalCliConfigDirPresent");
    expect(preview.sessionMetadataContract.sensitiveFieldsNeverReturned).toContain("messageBodies");
    expect(preview.blockers.join("\n")).toContain("Signal bridge root is not reachable");
    expect(signalConversationDirectoryPreviewText(preview)).toContain("Runs provider CLI: no");
    expect(signalConversationDirectoryPreviewText(preview)).toContain(
      "Signal session metadata contract: signal-local-bridge-session-metadata",
    );
    expect(result).toMatchObject({
      applyStatus: "blocked",
      failureMode: "bridge-unreachable",
      conversations: [],
      adapterExecution: {
        executionStatus: "blocked",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        requiresApprovalForApply: true,
        approvalRecorded: false,
        failureMode: "bridge-unreachable",
      },
    });
    expect(signalConversationDirectoryResultText(result)).toContain("Returned conversations: 0");
    expect(signalConversationDirectoryResultText(result)).toContain("Verify the reviewed local Signal bridge root is reachable");
    expect(signalConversationDirectoryResultText(result)).toContain("Directory adapter execution:");
    expect(signalConversationDirectoryResultText(result)).toContain("Execution status: blocked");
  });

  it("applies a Signal metadata-only directory through a reviewed fake bridge contract", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const descriptor = providers.get("signal-cli")!.descriptor;
    const requests: string[] = [];
    const preview = buildSignalConversationDirectoryPreview({
      toolInput: signalConversationDirectoryInput({
        profileId: "signal-owner",
        query: "ops",
        purpose: "remote_ambient_surface",
        limit: 5,
      }),
      runtimeStatus: {
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
                boundedUnreadWindow: false,
                approvedReplySend: false,
              },
              authNeeded: false,
              apiCredentialsPresent: false,
              persistedSessionCount: 1,
              checkedAt: "2026-05-10T00:00:00.000Z",
              message: "Signal bridge contract readiness is present.",
              diagnostics: ["Signal bridge root contract accepted.", "Signal bridge profile status contract accepted."],
              bridgeBaseUrl: "http://127.0.0.1:19092",
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
      } satisfies MessagingGatewayRuntimeStatus,
      descriptor,
    });

    expect(preview.status).toBe("ready");
    expect(preview.canApplyNow).toBe(true);
    expect(preview.endpointPath).toBe("/profiles/signal-owner/conversations?metadataOnly=true&limit=5&query=ops");
    const result = await applySignalConversationDirectory({
      preview,
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
            conversations: [
              {
                conversationId: "signal-chat-1",
                title: "Ops",
                type: "direct",
                unreadCount: 2,
                folderIds: [],
                updatedAt: "2026-05-10T00:00:00.000Z",
              },
            ],
          }),
        };
      },
    });

    expect(requests).toEqual(["http://127.0.0.1:19092/profiles/signal-owner/conversations?metadataOnly=true&limit=5&query=ops"]);
    expect(result).toMatchObject({
      applyStatus: "applied",
      approvalRecorded: true,
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      failureMode: "none",
      conversations: [
        {
          conversationId: "signal-chat-1",
          title: "Ops",
          unreadCount: 2,
        },
      ],
      adapterExecution: {
        executionStatus: "applied",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        requiresApprovalForApply: true,
        approvalRecorded: true,
      },
    });
    expect(signalConversationDirectoryResultText(result)).toContain("Signal conversation directory result: applied");
    expect(signalConversationDirectoryResultText(result)).toContain("signal-chat-1: Ops");
  });

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

  it("previews Signal binding readiness after directory selection without enabling generic binding apply", () => {
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

    const preview = buildSignalBindingReadinessPreview({
      toolInput: signalBindingReadinessInput({
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
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
      typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
      genericBindingApplyAllowed: false,
      telegramOwnerHandoffAllowed: false,
      futureUnreadEndpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      gates: {
        directoryConversationSelected: true,
        bridgeReadableProfile: true,
        metadataOnlyDirectoryReady: true,
        boundedUnreadContractAvailable: true,
        ownerAuthenticationAvailable: false,
        bindingLifecycleAvailable: true,
        runtimeLifecycleAvailable: false,
        inboundIngestionAvailable: false,
        outboundReplyAvailable: true,
      },
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsUnreadWindow: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        usesTelegramOwnerHandoff: false,
      },
    });
    expect(preview.unreadWindowContract.kind).toBe("signal-bounded-unread-window-v0");
    expect(preview.blockers.join("\n")).toContain("Signal owner authentication requires matched owner-handoff metadata");
    expect(preview.blockers.join("\n")).not.toContain("Signal outbound reply adapter is disabled");
    const text = signalBindingReadinessPreviewText(preview);
    expect(text).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
    expect(text).toContain("Generic binding apply allowed: no");
    expect(text).toContain("Telegram owner handoff allowed: no");
    expect(text).toContain("Selected directory conversation: yes");
    expect(text).toContain("Bounded unread contract available: yes");
    expect(text).toContain("Owner authentication: missing");
    expect(text).toContain("Typed apply tool: ambient_messaging_signal_remote_surface_apply");
  });

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

  it("validates Signal Remote Ambient Surface create and revoke through the typed binding contract", () => {
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
    const toolInput = signalRemoteSurfaceBindingInput({
      providerId: "signal-cli",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "signal-owner-sender",
      ownerHandoffSourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      limit: 5,
    });
    const plan = buildSignalRemoteSurfaceBindingPlan({
      toolInput,
      bindings,
      runtimeStatus,
      descriptor: providers.get("signal-cli")?.descriptor,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });

    expect(plan).toMatchObject({
      providerId: "signal-cli",
      status: "ready",
      canApplyNow: true,
      previewOnly: false,
      typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
      typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
      genericBindingApplyAllowed: false,
      telegramOwnerHandoffAllowed: false,
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "signal-owner-sender",
      ownerHandoffSourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
      initialSeenMessageCount: 2,
      futureUnreadEndpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      futureBinding: {
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        ownerUserId: "signal-owner-sender",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          ownerHandoffSourceMessageId: "seen-1",
          initialSeenMessageIds: ["seen-1", "seen-2"],
        },
      },
      gates: {
        ownerHandoffMetadataAccepted: true,
        bridgeReadableProfile: true,
        metadataOnlyDirectoryReady: true,
        boundedUnreadContractAvailable: true,
        bindingLifecycleAvailable: true,
      },
      safety: {
        readsProviderMessages: false,
        readsUnreadWindow: false,
        mutatesBindings: true,
        persistsBinding: true,
        usesTelegramOwnerHandoff: false,
        usesGenericBindingApply: false,
      },
    });
    expect(plan.blockers).toEqual([]);
    expect(signalRemoteSurfaceBindingText(plan)).toContain("Signal Remote Ambient Surface binding preview ready");
    expect(signalRemoteSurfaceBindingText(plan)).toContain("Generic binding apply allowed: no");
    expect(signalRemoteSurfaceBindingText(plan)).toContain("Owner handoff source message: seen-1");

    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-signal-binding-"));
    try {
      const store = createMessagingBindingStore({
        stateRoot,
        providers,
        now: () => new Date("2026-05-10T00:00:00.000Z"),
      });
      const lifecycle = store.create(signalRemoteSurfaceBindingCreateInput(toolInput));
      const result = signalRemoteSurfaceBindingAppliedResult(plan, lifecycle);
      expect(result).toMatchObject({
        applyStatus: "applied",
        approvalRequested: true,
        approvalRecorded: true,
        persisted: true,
        canFeedFutureBindingLifecycle: false,
        bindingApplyInputReady: true,
        safety: {
          mutatesBindings: true,
          persistsBinding: true,
          usesGenericBindingApply: false,
        },
        futureBinding: {
          providerId: "signal-cli",
          metadata: {
            setupTool: "ambient_messaging_signal_remote_surface_apply",
            ownerHandoffSourceMessageId: "seen-1",
            initialSeenMessageIds: ["seen-1", "seen-2"],
            unreadWindowLimit: 5,
          },
        },
      });
      const resultText = signalRemoteSurfaceBindingText(result);
      expect(resultText).toContain("Signal Remote Ambient Surface binding applied");
      expect(resultText).toContain("Persisted: yes");
      expect(resultText).toContain("Lifecycle state path:");

      const revokeInput = signalRemoteSurfaceBindingRevokeInput({
        action: "revoke",
        providerId: "signal-cli",
        bindingId: lifecycle.binding.id,
        reason: "dogfood cleanup",
      });
      const revokePlan = buildSignalRemoteSurfaceBindingRevokePlan({
        toolInput: revokeInput,
        bindings: store.list({ providerId: "signal-cli", includeInactive: true }),
        descriptor: providers.get("signal-cli")?.descriptor,
      });
      expect(revokePlan).toMatchObject({
        providerId: "signal-cli",
        action: "revoke",
        status: "ready",
        canApplyNow: true,
        bindingId: lifecycle.binding.id,
        reason: "dogfood cleanup",
        targetBinding: {
          providerId: "signal-cli",
          purpose: "remote_ambient_surface",
          status: "active",
        },
        safety: {
          readsProviderMessages: false,
          readsUnreadWindow: false,
          mutatesBindings: true,
          persistsBinding: true,
          usesGenericBindingApply: false,
        },
      });
      expect(signalRemoteSurfaceBindingRevokeText(revokePlan)).toContain("Signal Remote Ambient Surface binding revoke preview ready");
      expect(signalRemoteSurfaceBindingRevokeText(revokePlan)).toContain("Generic binding apply allowed: no");

      const revokeLifecycle = store.revoke(signalRemoteSurfaceBindingRevokeInputForStore(revokeInput));
      const revokeResult = signalRemoteSurfaceBindingRevokedResult(revokePlan, revokeLifecycle);
      expect(revokeResult).toMatchObject({
        applyStatus: "applied",
        approvalRequested: true,
        approvalRecorded: true,
        persisted: true,
        targetBinding: {
          status: "revoked",
          metadata: {
            setupTool: "ambient_messaging_signal_remote_surface_apply",
            ownerHandoffSourceMessageId: "seen-1",
            initialSeenMessageIds: ["seen-1", "seen-2"],
            revokedReason: "dogfood cleanup",
          },
        },
      });
      const revokeText = signalRemoteSurfaceBindingRevokeText(revokeResult);
      expect(revokeText).toContain("Signal Remote Ambient Surface binding revoke applied");
      expect(revokeText).toContain("Persisted: yes");
      expect(revokeText).toContain("Target status: revoked");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(() =>
      signalRemoteSurfaceBindingInput({
        providerId: "signal-cli",
        profileId: "signal-owner",
        conversationId: "signal-chat-1",
        ownerUserId: "signal-owner-sender",
        ownerHandoffSourceMessageId: "seen-1",
        initialSeenMessageIds: ["seen-2"],
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }),
    ).toThrow("initialSeenMessageIds must include ownerHandoffSourceMessageId");
  });

  it("keeps Telegram and Signal directory adapters on the shared metadata-only failure contract", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    const preview = buildMessagingConversationDirectoryPreview({
      toolInput: messagingConversationDirectoryInput({ purpose: "remote_ambient_surface" }),
      providers,
      bindings: bindings.list({ includeInactive: false }),
    });
    const telegram = preview.providers.find((provider) => provider.providerId === "telegram-tdlib")!;
    const signal = preview.providers.find((provider) => provider.providerId === "signal-cli")!;

    expect(telegram.metadataOnlyContract).toEqual(signal.metadataOnlyContract);
    expect(telegram.metadataOnlyContract.forbiddenPayloadFields).toContain("body");
    expect(telegram.policyNotes.join("\n")).toContain("metadata-only routing contract");
    expect(signal.policyNotes.join("\n")).toContain("metadata-only routing contract");
    expect(telegram.providerDirectoryTool).toBe("ambient_messaging_telegram_conversation_directory_preview");
    expect(signal.providerDirectoryTool).toBe("ambient_messaging_signal_conversation_directory_preview");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Provider: Telegram (telegram-tdlib)");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Provider: Signal (signal-cli)");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Forbidden payload fields fail closed");

    for (const contractLabel of ["Telegram bridge", "Signal bridge"]) {
      try {
        sanitizeMessagingConversationDirectoryEntry({
          contractLabel,
          raw: {
            id: `${contractLabel}-chat`,
            title: `${contractLabel} chat`,
            body: "private provider payload must not leak",
          },
        });
        throw new Error("Expected metadata-only contract violation.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toBe(`${contractLabel} metadata-only directory contract violation: response included body.`);
        expect(message).not.toContain("private provider payload");
      }
    }
  });

  it("defines the planned Signal directory adapter target as metadata-only routing data", () => {
    const signalEntry = sanitizeMessagingConversationDirectoryEntry({
      contractLabel: "Signal bridge",
      raw: {
        id: "signal-chat-1",
        title: "Signal Owner Chat",
        type: "direct",
        unreadCount: 0,
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    });

    expect(signalEntry).toEqual({
      conversationId: "signal-chat-1",
      title: "Signal Owner Chat",
      type: "direct",
      unreadCount: 0,
      folderIds: [],
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(() =>
      sanitizeMessagingConversationDirectoryEntry({
        contractLabel: "Signal bridge",
        raw: {
          id: "signal-chat-1",
          title: "Signal Owner Chat",
          lastMessage: { text: "private message body must not leak" },
        },
      }),
    ).toThrow("Signal bridge metadata-only directory contract violation: response included lastMessage.");
    try {
      sanitizeMessagingConversationDirectoryEntry({
        contractLabel: "Signal bridge",
        raw: {
          id: "signal-chat-1",
          title: "Signal Owner Chat",
          lastMessage: { text: "private message body must not leak" },
        },
      });
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).not.toContain("private message body");
    }
  });
});

function signalReadyRuntimeStatus(): MessagingGatewayRuntimeStatus {
  return {
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
}

function signalUnreadBindingList(
  input: {
    metadata?: Record<string, unknown>;
  } = {},
): MessagingBindingListResult {
  return {
    bindings: [
      {
        id: "signal-binding-1",
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        status: "active",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
        metadata: input.metadata ?? {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "seen-setup",
          initialSeenMessageIds: ["seen-setup"],
        },
      },
    ],
    bindingCount: 1,
    activeBindingCount: 1,
    remoteAmbientSurfaceCount: 1,
    messagingConnectorCount: 0,
    headlessSafeBindingCount: 0,
  };
}
