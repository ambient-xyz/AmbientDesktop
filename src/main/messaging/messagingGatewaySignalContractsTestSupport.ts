import type { MessagingBindingListResult, MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";

export function signalReadyRuntimeStatus(): MessagingGatewayRuntimeStatus {
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

export function signalUnreadBindingList(
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
