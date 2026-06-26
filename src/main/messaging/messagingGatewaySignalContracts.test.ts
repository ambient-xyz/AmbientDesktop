import { describe, expect, it } from "vitest";
import type { MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import {
  buildMessagingConversationDirectoryPreview,
  messagingConversationDirectoryInput,
  messagingConversationDirectoryPreviewText,
} from "./messagingConversationDirectory";
import { sanitizeMessagingConversationDirectoryEntry } from "./messagingConversationDirectoryContract";
import {
  applySignalConversationDirectory,
  buildSignalConversationDirectoryPreview,
  signalConversationDirectoryBlockedResult,
  signalConversationDirectoryInput,
  signalConversationDirectoryPreviewText,
  signalConversationDirectoryResultText,
  signalSessionMetadataContract,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

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
