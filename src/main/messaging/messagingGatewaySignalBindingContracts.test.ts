import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingBindingListResult, MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import { createMessagingBindingStore } from "./messagingBindings";
import {
  buildSignalBindingReadinessPreview,
  buildSignalRemoteSurfaceBindingPlan,
  buildSignalRemoteSurfaceBindingRevokePlan,
  signalBindingReadinessInput,
  signalBindingReadinessPreviewText,
  signalRemoteSurfaceBindingAppliedResult,
  signalRemoteSurfaceBindingCreateInput,
  signalRemoteSurfaceBindingInput,
  signalRemoteSurfaceBindingRevokeInput,
  signalRemoteSurfaceBindingRevokeInputForStore,
  signalRemoteSurfaceBindingRevokeText,
  signalRemoteSurfaceBindingRevokedResult,
  signalRemoteSurfaceBindingText,
} from "./messagingAgentRuntimeSignalFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway Signal contracts", () => {
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
});
