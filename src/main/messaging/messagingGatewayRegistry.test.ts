import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingBindingListResult, MessagingGatewayRemoteSurfaceRuntimeEvent, MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import { firstPartyDesktopToolDescriptors, messagingGatewayToolDescriptor } from "../desktopToolRegistry";
import { bindingLifecyclePreviewText, createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { buildHeadlessRuntimeUxInventory, headlessRuntimeUxInventoryText } from "../headlessRuntimeInventory";
import { buildRuntimeSurfaceSnapshot, runtimeSurfaceSnapshotText } from "../runtimeSurfaceSnapshot";
import {
  buildMessagingPurposePromptContext,
  messagingProjectionText,
  projectToolStatusCard,
  routeSyntheticMessagingEvent,
} from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandApprovalResponse,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandGrantRevokeRequest,
  messagingRemoteSurfaceCommandInput,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandProjectCreateRequest,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  messagingRemoteSurfaceCommandWorkflowAnswerInput,
  messagingRemoteSurfaceCommandWorkflowActionRequest,
  messagingRemoteSurfaceCommandWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommands";
import {
  MessagingGatewayRunner,
  messagingGatewayInboundDispatchText,
  messagingGatewayLifecyclePreviewText,
  messagingGatewayRuntimeStatusText,
} from "./messagingGatewayRunner";
import {
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
} from "../telegram/telegramRemoteSurfaceBinding";
import {
  buildMessagingRemoteSurfaceBindingPreview,
  buildMessagingRemoteSurfaceEventPreview,
  messagingRemoteSurfaceBindingPreviewInput,
  messagingRemoteSurfaceBindingPreviewText,
  messagingRemoteSurfaceEventPreviewInput,
  messagingRemoteSurfaceEventPreviewText,
} from "./messagingRemoteSurfaceProviderPreview";
import {
  buildMessagingConversationDirectoryPreview,
  messagingConversationDirectoryInput,
  messagingConversationDirectoryPreviewText,
} from "./messagingConversationDirectory";
import { sanitizeMessagingConversationDirectoryEntry } from "./messagingConversationDirectoryContract";
import {
  createDefaultMessagingConversationDirectoryAdapterRegistry,
  MessagingConversationDirectoryAdapterRegistry,
} from "./messagingConversationDirectoryAdapters";
import {
  applyTelegramConversationDirectory,
  buildTelegramConversationDirectoryPreview,
  telegramConversationDirectoryBlockedResult,
  telegramConversationDirectoryInput,
  telegramConversationDirectoryPreviewText,
  telegramConversationDirectoryResultText,
} from "../telegram/telegramConversationDirectory";
import {
  applyTelegramOwnerHandoff,
  buildTelegramOwnerHandoffPreview,
  telegramOwnerHandoffInput,
  telegramOwnerHandoffPreviewText,
  telegramOwnerHandoffResultText,
} from "../telegram/telegramOwnerHandoff";
import {
  buildTelegramOwnerLoopActivationPlan,
  telegramOwnerLoopActivationCard,
  telegramOwnerLoopActivationInput,
  telegramOwnerLoopActivationPlanText,
} from "../telegram/telegramOwnerLoopActivation";
import {
  buildMessagingRemoteSurfaceActivationPlan,
  buildMessagingRemoteSurfaceProviderSupportPlan,
  messagingRemoteSurfaceActivationCard,
  messagingRemoteSurfaceActivationInput,
  messagingRemoteSurfaceActivationPlanText,
  messagingRemoteSurfaceProviderSupportPlanInput,
  messagingRemoteSurfaceProviderSupportPlanText,
} from "./messagingRemoteSurfaceActivationPlan";
import {
  applySignalConversationDirectory,
  buildSignalConversationDirectoryPreview,
  signalConversationDirectoryBlockedResult,
  signalConversationDirectoryInput,
  signalConversationDirectoryPreviewText,
  signalConversationDirectoryResultText,
  signalSessionMetadataContract,
} from "../agent-runtime/signal/signalConversationDirectory";
import {
  buildSignalBindingReadinessPreview,
  signalBindingReadinessInput,
  signalBindingReadinessPreviewText,
} from "../agent-runtime/signal/signalBindingReadiness";
import {
  buildSignalRemoteSurfaceBindingRevokePlan,
  buildSignalRemoteSurfaceBindingPlan,
  signalRemoteSurfaceBindingAppliedResult,
  signalRemoteSurfaceBindingCreateInput,
  signalRemoteSurfaceBindingInput,
  signalRemoteSurfaceBindingRevokeInput,
  signalRemoteSurfaceBindingRevokeInputForStore,
  signalRemoteSurfaceBindingRevokeText,
  signalRemoteSurfaceBindingRevokedResult,
  signalRemoteSurfaceBindingText,
} from "../agent-runtime/signal/signalRemoteSurfaceBinding";
import {
  applySignalOwnerHandoff,
  buildSignalOwnerHandoffPreview,
  signalOwnerHandoffBlockedApplyResult,
  signalOwnerHandoffInput,
  signalOwnerHandoffPreviewText,
  signalOwnerHandoffResultText,
} from "../agent-runtime/signal/signalOwnerHandoff";
import {
  applySignalRealUnreadWindow,
  applySignalUnreadWindow,
  buildSignalRealUnreadWindowPreview,
  buildSignalUnreadWindowStatus,
  buildSignalUnreadWindowPreview,
  signalRealUnreadWindowDeniedResult,
  signalRealUnreadWindowInput,
  signalRealUnreadWindowPreviewText,
  signalRealUnreadWindowResultText,
  signalUnreadWindowInput,
  signalUnreadWindowPreviewText,
  signalUnreadWindowResultText,
  signalUnreadWindowStatusInput,
  signalUnreadWindowStatusText,
} from "../agent-runtime/signal/signalUnreadWindow";
import {
  buildSignalRealPollingControlPreview,
  buildSignalRealPollingStatus,
  SignalRealPollingRunner,
  signalRealPollingControlInput,
  signalRealPollingControlPreviewText,
  signalRealPollingControlResultText,
  signalRealPollingStatusText,
} from "../agent-runtime/signal/signalRealPolling";
import {
  applySignalBridgeReply,
  buildSignalBridgeReplyPreview,
  buildSignalBridgeReplyStatus,
  signalBridgeReplyApprovalDetail,
  signalBridgeReplyInput,
  signalBridgeReplyPreviewText,
  signalBridgeReplyResultText,
  signalBridgeReplyStatusText,
} from "../agent-runtime/signal/signalBridgeReply";
import {
  createDefaultMessagingProviderRegistry,
  MessagingProviderRegistry,
  messagingProviderListText,
  messagingProviderStatusText,
  telegramMessagingProviderDescriptor,
} from "./messagingGatewayRegistry";
import {
  applyTelegramBridgePoll,
  buildTelegramBridgePollPlan,
  TelegramBridgePollingRunner,
  telegramBridgePollingControlInput,
  telegramBridgePollingControlPreviewText,
  telegramBridgePollingControlResultText,
  telegramBridgePollingStatusText,
  telegramBridgePollPlanText,
  telegramBridgePollResultText,
  telegramBridgePollToolInput,
} from "../telegram/telegramBridgePolling";
import {
  applyTelegramBridgeReply,
  buildTelegramBridgeReplyPreview,
  telegramBridgeReplyInput,
  telegramBridgeReplyPreviewText,
  telegramBridgeReplyResultText,
} from "../telegram/telegramBridgeOutbound";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import {
  buildTelegramRelayDiagnostics,
  secondProviderRelayReadinessChecklist,
  telegramRelayDiagnosticsInput,
  telegramRelayDiagnosticsText,
} from "../telegram/telegramRelayDiagnostics";
import {
  buildSignalRelayDiagnostics,
  signalRelayDiagnosticsInput,
  signalRelayDiagnosticsText,
} from "../agent-runtime/signal/signalRelayDiagnostics";
import {
  createPlannedMessagingReadinessAdapter,
  readinessProbesFromAdapters,
} from "./messagingProviderReadiness";

describe("messaging gateway provider registry", () => {
  it("registers Telegram and a metadata-only Signal provider target", async () => {
    const registry = createDefaultMessagingProviderRegistry();
    const result = await registry.list(new Date("2026-05-10T00:00:00.000Z"));
    const telegram = result.providers.find((provider) => provider.descriptor.providerId === "telegram-tdlib");
    const signal = result.providers.find((provider) => provider.descriptor.providerId === "signal-cli");

    expect(result.providerCount).toBe(2);
    expect(result.headlessReadyProviderCount).toBe(1);
    expect(result.availableProviderCount).toBe(0);
    expect(telegram).toMatchObject({
      descriptor: {
        providerId: "telegram-tdlib",
        label: "Telegram",
        source: "first-party",
        implementation: {
          status: "available",
          bindingLifecycleEnabled: true,
          runtimeLifecycleEnabled: true,
          inboundIngestionEnabled: true,
          outboundReplyEnabled: true,
        },
        deployment: {
          headlessSafe: true,
          requiresWindowing: false,
          localAudioPlaybackRequired: false,
        },
        purposeSupport: {
          remote_ambient_surface: true,
          messaging_connector: true,
        },
        capabilities: {
          text: true,
          audio: true,
          files: true,
          conversationDiscovery: true,
        },
      },
      health: {
        providerId: "telegram-tdlib",
        status: "not-configured",
        configured: false,
        connected: false,
        headlessReady: true,
        checkedAt: "2026-05-10T00:00:00.000Z",
      },
    });
    expect(signal).toMatchObject({
      descriptor: {
        providerId: "signal-cli",
        label: "Signal",
        implementation: {
          status: "planned",
          bindingLifecycleEnabled: true,
          runtimeLifecycleEnabled: false,
          inboundIngestionEnabled: false,
          outboundReplyEnabled: true,
        },
        deployment: {
          headlessSafe: true,
          requiresWindowing: false,
        },
        purposeSupport: {
          remote_ambient_surface: true,
          messaging_connector: false,
        },
      },
      health: {
        providerId: "signal-cli",
        status: "unavailable",
        configured: false,
        connected: false,
        headlessReady: false,
      },
    });
  });

  it("renders bounded provider list and status text for Pi", async () => {
    const registry = createDefaultMessagingProviderRegistry();
    const result = await registry.list(new Date("2026-05-10T00:00:00.000Z"));
    const summary = result.providers.find((provider) => provider.descriptor.providerId === "telegram-tdlib")!;
    const signalSummary = result.providers.find((provider) => provider.descriptor.providerId === "signal-cli")!;

    expect(messagingProviderListText(result)).toContain("Ambient messaging providers");
    expect(messagingProviderListText(result)).toContain("Telegram (telegram-tdlib)");
    expect(messagingProviderListText(result)).toContain("Signal (signal-cli)");
    expect(messagingProviderListText(result)).toContain("Implementation: planned");
    expect(messagingProviderListText(result)).toContain("Headless-ready: yes");
    expect(messagingProviderListText(result)).toContain("remote_ambient_surface");
    expect(messagingProviderStatusText(summary)).toContain("Provider ID: telegram-tdlib");
    expect(messagingProviderStatusText(summary)).toContain("Implementation: available");
    expect(messagingProviderStatusText(summary)).toContain("Auth: local-session");
    expect(messagingProviderStatusText(summary)).toContain("Event modes: polling, local-bridge");
    expect(messagingProviderStatusText(signalSummary)).toContain("Provider ID: signal-cli");
    expect(messagingProviderStatusText(signalSummary)).toContain("Implementation: planned");
    expect(messagingProviderStatusText(signalSummary)).toContain("Binding lifecycle: enabled");
    expect(messagingProviderStatusText(signalSummary)).toContain("metadata-only Remote Ambient Surface binding persistence");
  });

  it("exposes planned Signal readiness without provider I/O", async () => {
    const adapter = createPlannedMessagingReadinessAdapter({
      providerId: "signal-cli",
      label: "Signal",
      now: () => new Date("2026-05-10T00:00:00.000Z"),
      adapterPlanSummary: "Signal will use a reviewed local bridge rather than Signal Desktop UI automation.",
      diagnostics: ["No local Signal state was inspected."],
    });
    const probes = readinessProbesFromAdapters([adapter]);
    const readiness = await probes["signal-cli"]();

    expect(adapter.safety).toEqual({
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
    });
    expect(readiness).toMatchObject({
      providerId: "signal-cli",
      status: "unavailable",
      configured: false,
      bridgeReachable: false,
      authNeeded: true,
      apiCredentialsPresent: false,
      persistedSessionCount: 0,
      checkedAt: "2026-05-10T00:00:00.000Z",
      sessions: [],
    });
    expect(readiness.diagnostics.join("\n")).toContain("Planned readiness probe performs no provider I/O");
    expect(readiness.diagnostics.join("\n")).toContain("No local Signal state was inspected");
  });

  it("rejects duplicate provider ids", () => {
    const registry = new MessagingProviderRegistry();
    registry.register({ descriptor: telegramMessagingProviderDescriptor() });

    expect(() => registry.register({ descriptor: telegramMessagingProviderDescriptor() })).toThrow(
      /Messaging provider already registered: telegram-tdlib/,
    );
  });

  it("registers provider-neutral conversation-directory adapters for Telegram and Signal", () => {
    const providerRegistry = createDefaultMessagingProviderRegistry();
    const adapterRegistry = createDefaultMessagingConversationDirectoryAdapterRegistry();
    const descriptors = providerRegistry.descriptors();
    const plans = adapterRegistry.plansForDescriptors({
      descriptors,
      purpose: "remote_ambient_surface",
      runtimeStatus: {
        status: "idle",
        providerCount: 2,
        activeProviderCount: 0,
        syntheticActiveProviderCount: 0,
        queuedProjectionCount: 0,
        recentEventCount: 0,
        outboundDeliveryCount: 0,
        providers: [{
          providerId: "telegram-tdlib",
          label: "Telegram",
          state: "running",
          mode: "real",
          syntheticEventCount: 0,
          realEventCount: 0,
          queuedProjectionCount: 0,
          readiness: {
            providerId: "telegram-tdlib",
            status: "available",
            configured: true,
            bridgeReachable: true,
            authNeeded: false,
            apiCredentialsPresent: true,
            persistedSessionCount: 1,
            checkedAt: "2026-05-10T00:00:00.000Z",
            message: "ready",
            diagnostics: [],
            sessions: [],
          },
        }, {
          providerId: "signal-cli",
          label: "Signal",
          state: "stopped",
          mode: "none",
          syntheticEventCount: 0,
          realEventCount: 0,
          queuedProjectionCount: 0,
        }],
        queuedProjections: [],
        recentOutboundDeliveries: [],
        recentEvents: [],
      },
    });
    const telegram = plans.get("telegram-tdlib")!;
    const signal = plans.get("signal-cli")!;

    expect(telegram).toMatchObject({
      status: "available",
      kind: "live-metadata-only-adapter",
      previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
      applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
      requiresApprovalForApply: true,
      canApplyWithReadiness: true,
    });
    expect(signal).toMatchObject({
      status: "available",
      kind: "live-metadata-only-adapter",
      previewToolName: "ambient_messaging_signal_conversation_directory_preview",
      applyToolName: "ambient_messaging_signal_conversation_directory_apply",
      requiresApprovalForApply: true,
      canApplyWithReadiness: false,
    });
    expect(telegram.metadataOnlyContract).toEqual(signal.metadataOnlyContract);
    expect(signal.safety).toMatchObject({
      startsBridge: false,
      runsProviderCli: false,
      inspectsProviderDesktop: false,
      readsProviderMessages: false,
      sendsProviderMessages: false,
    });

    const duplicateRegistry = new MessagingConversationDirectoryAdapterRegistry();
    duplicateRegistry.register({
      providerId: "provider",
      plan: () => telegram,
    });
    expect(() => duplicateRegistry.register({
      providerId: "provider",
      plan: () => signal,
    })).toThrow("Messaging conversation-directory adapter already registered: provider");
  });

  it("exposes messaging tools in the first-party desktop tool registry", () => {
    const tools = firstPartyDesktopToolDescriptors().map((tool) => tool.name);

    expect(tools).toContain("ambient_messaging_list_providers");
    expect(tools).toContain("ambient_messaging_provider_status");
    expect(tools).toContain("ambient_messaging_remote_surface_activation_plan");
    expect(tools).toContain("ambient_messaging_remote_surface_provider_support_plan");
    expect(tools).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
    expect(tools).toContain("ambient_messaging_telegram_session_preview");
    expect(tools).toContain("ambient_messaging_telegram_session_apply");
    expect(tools).toContain("ambient_messaging_signal_session_preview");
    expect(tools).toContain("ambient_messaging_signal_session_apply");
    expect(tools).toContain("ambient_messaging_list_bindings");
    expect(tools).toContain("ambient_messaging_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_telegram_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_telegram_conversation_directory_apply");
    expect(tools).toContain("ambient_messaging_telegram_owner_handoff_preview");
    expect(tools).toContain("ambient_messaging_telegram_owner_handoff_apply");
    expect(tools).toContain("ambient_messaging_signal_conversation_directory_preview");
    expect(tools).toContain("ambient_messaging_signal_conversation_directory_apply");
    expect(tools).toContain("ambient_messaging_signal_unread_window_preview");
    expect(tools).toContain("ambient_messaging_signal_unread_window_apply");
    expect(tools).toContain("ambient_messaging_signal_unread_window_status");
    expect(tools).toContain("ambient_messaging_signal_real_unread_window_preview");
    expect(tools).toContain("ambient_messaging_signal_real_unread_window_apply");
    expect(tools).toContain("ambient_messaging_signal_real_polling_status");
    expect(tools).toContain("ambient_messaging_signal_real_polling_preview");
    expect(tools).toContain("ambient_messaging_signal_real_polling_apply");
    expect(tools).toContain("ambient_messaging_signal_bridge_reply_preview");
    expect(tools).toContain("ambient_messaging_signal_bridge_reply_apply");
    expect(tools).toContain("ambient_messaging_signal_relay_diagnostics");
    expect(tools).toContain("ambient_messaging_signal_binding_readiness_preview");
    expect(tools).toContain("ambient_messaging_signal_owner_handoff_preview");
    expect(tools).toContain("ambient_messaging_signal_owner_handoff_apply");
    expect(tools).toContain("ambient_messaging_signal_remote_surface_preview");
    expect(tools).toContain("ambient_messaging_signal_remote_surface_apply");
    expect(tools).toContain("ambient_messaging_headless_ux_inventory");
    expect(tools).toContain("ambient_messaging_binding_preview");
    expect(tools).toContain("ambient_messaging_binding_apply");
    expect(tools).toContain("ambient_messaging_remote_surface_binding_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_event_preview");
    expect(tools).toContain("ambient_messaging_telegram_remote_surface_preview");
    expect(tools).toContain("ambient_messaging_telegram_remote_surface_apply");
    expect(tools).toContain("ambient_runtime_surface_snapshot");
    expect(tools).toContain("ambient_messaging_synthetic_route");
    expect(tools).toContain("ambient_messaging_telegram_bridge_event_route");
    expect(tools).toContain("ambient_messaging_telegram_bridge_poll_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_poll_apply");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_status");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_polling_apply");
    expect(tools).toContain("ambient_messaging_telegram_bridge_reply_preview");
    expect(tools).toContain("ambient_messaging_telegram_bridge_reply_apply");
    expect(tools).toContain("ambient_messaging_remote_surface_reply_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_reply_apply");
    expect(tools).toContain("ambient_messaging_telegram_relay_diagnostics");
    expect(tools).toContain("ambient_messaging_remote_surface_command_preview");
    expect(tools).toContain("ambient_messaging_remote_surface_command_apply");
    expect(tools).toContain("ambient_messaging_gateway_status");
    expect(tools).toContain("ambient_messaging_gateway_lifecycle_preview");
    expect(tools).toContain("ambient_messaging_gateway_lifecycle_apply");
    expect(messagingGatewayToolDescriptor("ambient_messaging_list_providers")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-provider-read",
      runtimeSupport: ["chat", "workflow"],
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-activation-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain("call that activation plan next before low-level lifecycle");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").description).toContain("Telegram, Signal, or another provider");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain("including requests that explicitly say Telegram, Signal");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain("unsupported_provider repair/status prompts");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-provider-support-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain("unsupported_provider");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain("Signal Desktop being installed is not a Remote Ambient Surface activation route");
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").description).toContain("adapter requirements");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-owner-loop-activation-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain("provider readiness, metadata-only directory, exact setup-code owner handoff");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain("call ambient_messaging_remote_surface_activation_plan first");
    expect(messagingGatewayToolDescriptor("ambient_messaging_list_bindings")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-binding-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_conversation_directory_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-conversation-directory-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-owner-handoff-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_handoff_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-owner-handoff-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-conversation-directory-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-conversation-directory-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-unread-window-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-unread-window-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_unread_window_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-unread-window-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-unread-window-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_unread_window_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-real-unread-window-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-polling-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-real-polling-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_real_polling_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-real-polling-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-bridge-reply-preview",
    });
    const signalReplyPreviewSchema = messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_preview").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(signalReplyPreviewSchema.properties).toHaveProperty("runtimeEventId");
    expect(signalReplyPreviewSchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-signal-bridge-reply-apply",
      supportsDryRun: false,
    });
    const signalReplyApplySchema = messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_apply").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(signalReplyApplySchema.properties).toHaveProperty("runtimeEventId");
    expect(signalReplyApplySchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_relay_diagnostics")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-relay-diagnostics-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_binding_readiness_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-binding-readiness-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-owner-handoff-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_owner_handoff_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-signal-owner-handoff-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-remote-surface-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-signal-remote-surface-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_session_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-session-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "messaging-telegram-session-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_session_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-signal-session-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_signal_session_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-signal-session-apply",
    });
    const telegramApplySchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply").inputSchema as { properties: Record<string, unknown> };
    expect(telegramApplySchema.properties).not.toHaveProperty("code");
    expect(telegramApplySchema.properties).not.toHaveProperty("password");
    expect(messagingGatewayToolDescriptor("ambient_messaging_binding_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-binding-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_binding_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-binding-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_event_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-event-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-remote-surface-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-telegram-remote-surface-write",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_synthetic_route")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-synthetic-route-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_event_route")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-event-route",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-poll-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-bridge-poll-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain("Use one-shot polling");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain("prefer the periodic polling preview/apply tools");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-status",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain("Use periodic polling when the owner wants an ongoing Remote Ambient Surface loop");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain("pass minReceivedAt set to the activation/command boundary");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-bridge-polling-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply").promptGuidelines.join("\n")).toContain("Use periodic polling only for an ongoing owner Remote Ambient Surface loop");
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-reply-preview",
    });
    const telegramReplyPreviewSchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_preview").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(telegramReplyPreviewSchema.properties).toHaveProperty("runtimeEventId");
    expect(telegramReplyPreviewSchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-telegram-bridge-reply-apply",
    });
    const telegramReplyApplySchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_reply_apply").inputSchema as {
      properties: Record<string, unknown>;
      anyOf: unknown[];
    };
    expect(telegramReplyApplySchema.properties).toHaveProperty("runtimeEventId");
    expect(telegramReplyApplySchema.anyOf).toContainEqual({ required: ["runtimeEventId"] });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-reply-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_apply")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "messaging-remote-surface-reply-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_relay_diagnostics")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-relay-diagnostics-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-command-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_apply")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "messaging-remote-surface-command-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-gateway-status-read",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-gateway-lifecycle-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_apply")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "messaging-gateway-lifecycle-apply",
    });
  });

  it("builds the Telegram owner-loop activation plan from readiness, bindings, and polling state", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-activation-plan-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:05.000Z"),
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
          message: "Ready for activation plan dogfood.",
          diagnostics: ["Root probe only; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [{
            profileId: "owner-profile",
            metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          }],
        }),
      },
    });

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      const remoteShortcutNeedsProvider = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ requestText: "set up remote control" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(remoteShortcutNeedsProvider).toMatchObject({
        status: "needs_provider_choice",
        recommendedNextTool: "ambient_messaging_remote_surface_activation_plan",
        lowLevelToolPolicy: {
          activationPlanRequiredBeforeLowLevel: true,
          allowedFirstTools: expect.arrayContaining(["ambient_messaging_remote_surface_activation_plan", "ambient_messaging_telegram_owner_loop_activation_plan"]),
        },
      });
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcutNeedsProvider)).toContain("Choose a reviewed Remote Ambient Surface provider");

      const remoteShortcut = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({
          requestText: "set up Telegram remote control",
          setupCode: "AMBIENT-OWNER-LOOP-SETUP",
        }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(remoteShortcut).toMatchObject({
        status: "route_ready",
        selectedProviderId: "telegram-tdlib",
        recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
        delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      });
      expect(remoteShortcut.repairPrompts.join("\n")).toContain("Owner conversation");
      expect(remoteShortcut.repairPrompts.join("\n")).toContain("Freshness anchor");
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain("Activation plan first tool: ambient_messaging_telegram_owner_loop_activation_plan");
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain("Blocked until activation plan: ambient_messaging_gateway_lifecycle_preview");
      const remoteShortcutCard = messagingRemoteSurfaceActivationCard(remoteShortcut);
      expect(remoteShortcutCard).toMatchObject({
        kind: "messaging-remote-surface-activation",
        intent: "remote_ambient_surface",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        status: "route_ready",
        currentPhase: {
          id: "metadata-directory",
          status: "ready",
          nextTool: "ambient_messaging_telegram_conversation_directory_preview",
        },
        recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
        delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        previewSendSafety: {
          providerSendRequiresSeparateApproval: true,
          providerSendReady: false,
        },
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
        },
      });
      expect(remoteShortcutCard.phaseChips.map((phase) => phase.id)).toEqual(expect.arrayContaining([
        "product-provider-route",
        "metadata-directory",
        "owner-handoff",
        "owner-binding",
        "periodic-polling",
        "command-and-relay-preview",
      ]));
      expect(remoteShortcutCard.blockedUntilActivationPlan).toContain("ambient_messaging_gateway_lifecycle_preview");

      const unsupportedRemoteShortcut = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ provider: "Signal" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(unsupportedRemoteShortcut).toMatchObject({
        status: "unsupported_provider",
      });
      expect(unsupportedRemoteShortcut.selectedProviderId).toBeUndefined();
      expect(unsupportedRemoteShortcut.repairPrompts.join("\n")).toContain("No reviewed Remote Ambient Surface activation shortcut exists");
      expect(messagingRemoteSurfaceActivationCard(unsupportedRemoteShortcut)).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
        currentPhase: {
          id: "product-provider-route",
          status: "blocked",
        },
        previewSendSafety: {
          providerSendRequiresSeparateApproval: true,
          providerSendReady: false,
        },
      });
      const unsupportedRemoteShortcutFromRequest = buildMessagingRemoteSurfaceActivationPlan({
        toolInput: messagingRemoteSurfaceActivationInput({ requestText: "set up Signal remote control for Ambient Desktop" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        telegramPollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(unsupportedRemoteShortcutFromRequest).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
      });
      expect(messagingRemoteSurfaceActivationPlanText(unsupportedRemoteShortcutFromRequest)).toContain("No reviewed Remote Ambient Surface activation shortcut exists for Signal");
      expect(messagingRemoteSurfaceActivationCard(unsupportedRemoteShortcutFromRequest)).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
        repairPrompts: expect.arrayContaining([
          expect.stringContaining("falling back to external Messaging Connector tools"),
        ]),
      });

      const signalProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(messagingRemoteSurfaceProviderSupportPlanInput({
        provider: "Signal",
        ambientSurface: "projects",
        blockerContext: "No reviewed Remote Ambient Surface activation shortcut exists for Signal.",
      }));
      expect(signalProviderSupportPlan).toMatchObject({
        status: "planning_ready",
        intent: "remote_ambient_surface_provider_support",
        requestedProvider: "Signal",
        selectedProviderId: "signal-cli",
        ambientSurface: "projects",
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          installsDependencies: false,
          scaffoldsProviderSupport: false,
        },
      });
      expect(signalProviderSupportPlan.adapterRequirements.join("\n")).toContain("Signal Desktop being installed is not an activation route");
      expect(signalProviderSupportPlan.ownerAuthConstraints.join("\n")).toContain("owner-authenticated chat-to-self control");
      expect(signalProviderSupportPlan.headlessSupportRequirements.join("\n")).toContain("headless Ambient process");
      expect(signalProviderSupportPlan.approvalGates.join("\n")).toContain("Dependency installation");
      expect(signalProviderSupportPlan.validationTargets.join("\n")).toContain("does not start bridges");
      expect(signalProviderSupportPlan.blockedActions.join("\n")).toContain("Generic Messaging Connector setup");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Remote Ambient Surface provider support plan");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Status: planning_ready");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Installs dependencies: no");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Scaffolds provider support: no");

      const telegramProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(messagingRemoteSurfaceProviderSupportPlanInput({
        requestText: "plan Telegram provider support",
      }));
      expect(telegramProviderSupportPlan).toMatchObject({
        status: "already_supported",
        selectedProviderId: "telegram-tdlib",
        recommendedNextTool: "ambient_messaging_remote_surface_activation_plan",
      });

      const setupPlan = buildTelegramOwnerLoopActivationPlan({
        toolInput: telegramOwnerLoopActivationInput({ setupCode: "AMBIENT-OWNER-LOOP-SETUP" }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        pollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(setupPlan).toMatchObject({
        status: "needs_setup",
        selectedProfileId: "owner-profile",
        recommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
        safety: {
          readsProviderMessages: false,
          mutatesBindings: false,
          startsPolling: false,
          sendsProviderMessages: false,
        },
      });
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain("metadata-directory");
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain("ambient_messaging_telegram_owner_handoff_preview -> ambient_messaging_telegram_owner_handoff_apply");
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain("minReceivedAt from the activation/command boundary");
      expect(telegramOwnerLoopActivationCard(setupPlan)).toMatchObject({
        status: "needs_setup",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        currentPhase: {
          id: "metadata-directory",
          status: "ready",
          nextTool: "ambient_messaging_telegram_conversation_directory_preview",
        },
        recommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
      });

      const created = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        externalTrustClass: "owner",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_telegram_remote_surface_apply",
          setupShape: "telegram-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "handoff-1",
        },
      });
      const pollingPlan = buildTelegramOwnerLoopActivationPlan({
        toolInput: telegramOwnerLoopActivationInput({
          bindingId: created.binding.id,
          minReceivedAt: "2026-05-10T00:00:06.000Z",
        }),
        runtimeStatus: runner.runtimeStatus(),
        bindings: bindings.list({ providerId: "telegram-tdlib", purpose: "remote_ambient_surface", includeInactive: false }),
        pollingStatus: new TelegramBridgePollingRunner().status(),
      });
      expect(pollingPlan).toMatchObject({
        status: "ready_to_start_polling",
        selectedBinding: {
          bindingId: created.binding.id,
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
        },
        recommendedNextTool: "ambient_messaging_telegram_bridge_polling_preview",
      });
      expect(telegramOwnerLoopActivationPlanText(pollingPlan)).toContain("ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply");
      expect(telegramOwnerLoopActivationPlanText(pollingPlan)).toContain("Requested minReceivedAt=2026-05-10T00:00:06.000Z");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("blocks planned Signal Remote Ambient Surface previews without provider I/O or Telegram tools", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers).list({ includeInactive: true });

    const bindingPreview = await buildMessagingRemoteSurfaceBindingPreview({
      toolInput: messagingRemoteSurfaceBindingPreviewInput({
        action: "create",
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }),
      providers,
      bindings,
    });

    expect(bindingPreview).toMatchObject({
      providerId: "signal-cli",
      status: "blocked",
      canApplyNow: false,
      providerImplementationStatus: "planned",
      bindingLifecycleEnabled: true,
      purposeSupported: true,
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        sendsProviderMessages: false,
        enablesInboundIngestion: false,
        mutatesBindings: false,
      },
    });
    expect(bindingPreview.typedPreviewTool).toBe("ambient_messaging_signal_remote_surface_preview");
    expect(bindingPreview.typedApplyTool).toBe("ambient_messaging_signal_remote_surface_apply");
    expect(bindingPreview.blockers.join("\n")).toContain("Provider implementation is planned");
    expect(bindingPreview.blockers.join("\n")).toContain("typed Signal preview/apply path");
    expect(bindingPreview.nextSteps.join("\n")).toContain("ambient_messaging_signal_binding_readiness_preview");
    expect(bindingPreview.nextSteps.join("\n")).toContain("ambient_messaging_signal_remote_surface_preview");
    expect(bindingPreview.nextSteps.join("\n")).toContain("Do not use ambient_messaging_binding_apply");
    expect(messagingRemoteSurfaceBindingPreviewText(bindingPreview)).toContain("Typed apply tool: ambient_messaging_signal_remote_surface_apply");

    const eventPreview = buildMessagingRemoteSurfaceEventPreview({
      toolInput: messagingRemoteSurfaceEventPreviewInput({
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        senderId: "owner-signal",
        text: "status",
      }, () => new Date("2026-05-10T00:00:00.000Z")),
      providers,
      bindings,
    });

    expect(eventPreview).toMatchObject({
      providerId: "signal-cli",
      status: "blocked",
      canRouteWithTypedTool: false,
      providerImplementationStatus: "planned",
      inboundIngestionEnabled: false,
      purposeSupported: true,
      safety: {
        startsBridge: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        queuesProjection: false,
      },
    });
    expect(eventPreview.typedRouteTool).toBeUndefined();
    expect(eventPreview.blockers.join("\n")).toContain("Provider inbound ingestion is disabled");
    expect(messagingRemoteSurfaceEventPreviewText(eventPreview)).toContain("Typed route tool: none");
  });

  it("previews conversation-directory readiness without listing provider chats", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "binding-owner-chat",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
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
          message: "Telegram readiness test fixture.",
          diagnostics: ["No provider messages read."],
          sessions: [{
            profileId: "owner-profile",
            metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          }],
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");

    const preview = buildMessagingConversationDirectoryPreview({
      toolInput: messagingConversationDirectoryInput({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        purpose: "remote_ambient_surface",
      }),
      providers,
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: runner.runtimeStatus(),
    });

    expect(preview).toMatchObject({
      status: "limited",
      providerCount: 1,
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      },
      providers: [{
        providerId: "telegram-tdlib",
        status: "limited",
        mode: "existing-bindings-only",
        conversationDiscoveryDeclared: true,
        canListProviderConversationsNow: false,
        providerDirectoryTool: "ambient_messaging_telegram_conversation_directory_preview",
        knownAuthProfiles: [{
          profileId: "owner-profile",
          metadataReadable: true,
        }],
        knownConversations: [{
          conversationId: "owner-chat",
          bindingId: "binding-owner-chat",
          purpose: "remote_ambient_surface",
        }],
      }],
    });
    expect(preview.providers[0].blockers.join("\n")).toContain("requires the Telegram provider to be running in real mode");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Provider directory tool: ambient_messaging_telegram_conversation_directory_preview");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Known conversations from bindings: 1");
  });

  it("previews and applies sanitized Telegram conversation-directory metadata", async () => {
    const runtimeStatus = telegramDirectoryRuntimeStatus();
    const preview = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      }),
      runtimeStatus,
    });

    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      profileId: "owner-profile",
      endpointPath: "/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops",
      safety: {
        startsBridge: false,
        readsProviderHistory: false,
        readsProviderMessages: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        returnsProviderMessageContent: false,
        readsProviderConversationMetadata: true,
      },
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        executionStatus: "preview",
        requiresApprovalForApply: true,
        approvalRecorded: false,
        canApplyWithReadiness: true,
        returnedConversationCount: 0,
      },
    });
    expect(telegramConversationDirectoryPreviewText(preview)).toContain("strips any bridge payload fields such as lastMessage");
    expect(telegramConversationDirectoryPreviewText(preview)).not.toContain("Bridge may return lastMessage payload");

    const requests: Array<{ url: string; headers?: HeadersInit }> = [];
    const result = await applyTelegramConversationDirectory({
      preview,
      approvalRecorded: true,
      env: {
        AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: "http://127.0.0.1:8091",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret",
      },
      fetchFn: async (url, init) => {
        requests.push({ url, headers: init?.headers });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [{
              id: "telegram-chat-1",
              title: "Ops",
              type: "private",
              unreadCount: 2,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
          }),
        };
      },
    });

    expect(requests[0].url).toBe("http://127.0.0.1:8091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops");
    expect(requests[0].headers).toMatchObject({
      "x-telegram-api-id": "123",
      "x-telegram-api-hash": "secret",
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      failureMode: "none",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [{
        conversationId: "telegram-chat-1",
        title: "Ops",
        type: "private",
        unreadCount: 2,
        folderIds: [1],
        updatedAt: "2026-05-10T00:00:00.000Z",
      }],
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        executionStatus: "applied",
        approvalRecorded: true,
        fetchedConversationCount: 1,
        returnedConversationCount: 1,
      },
    });
    expect(telegramConversationDirectoryResultText(result)).toContain("telegram-chat-1: Ops");
    expect(telegramConversationDirectoryResultText(result)).toContain("Failure mode: none");
    expect(telegramConversationDirectoryResultText(result)).toContain("Directory adapter execution:");
    expect(telegramConversationDirectoryResultText(result)).toContain("Execution status: applied");
  });

  it("strips Telegram directory bridge payload fields before returning metadata", async () => {
    const preview = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });

    const result = await applyTelegramConversationDirectory({
      preview,
      approvalRecorded: true,
      env: {
        AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: "http://127.0.0.1:8091",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret",
      },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          chats: [{
            id: "telegram-chat-1",
            title: "Ops",
            lastMessage: { text: "must not be visible" },
          }],
        }),
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      failureMode: "none",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [{
        conversationId: "telegram-chat-1",
        title: "Ops",
        folderIds: [],
      }],
      warnings: [
        "Telegram bridge returned provider message payload fields for 1 conversation(s); Ambient stripped them before returning directory metadata.",
      ],
      adapterExecution: {
        executionStatus: "applied",
        fetchedConversationCount: 1,
        returnedConversationCount: 1,
      },
    });
    expect(telegramConversationDirectoryResultText(result)).toContain("Failure mode: none");
    expect(telegramConversationDirectoryResultText(result)).toContain("metadataOnly=true");
    expect(JSON.stringify(result)).not.toContain("must not be visible");
  });

  it("explains Telegram directory blockers as actionable failure modes", async () => {
    const notRunning = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        limit: 5,
      }),
      runtimeStatus: {
        ...telegramDirectoryRuntimeStatus(),
        providers: [{
          ...telegramDirectoryRuntimeStatus().providers[0],
          state: "stopped",
          mode: "none",
        }],
      },
    });
    const notRunningResult = telegramConversationDirectoryBlockedResult(notRunning);
    expect(notRunningResult).toMatchObject({
      applyStatus: "blocked",
      failureMode: "not-running-real-mode",
      adapterExecution: {
        executionStatus: "blocked",
        failureMode: "not-running-real-mode",
      },
    });
    expect(telegramConversationDirectoryResultText(notRunningResult)).toContain("Start or attach the Telegram provider");

    const missingProfile = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "missing-profile",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });
    const missingProfileResult = telegramConversationDirectoryBlockedResult(missingProfile);
    expect(missingProfileResult).toMatchObject({
      applyStatus: "blocked",
      failureMode: "missing-auth-profile",
      adapterExecution: {
        executionStatus: "blocked",
        failureMode: "missing-auth-profile",
      },
    });
    expect(telegramConversationDirectoryResultText(missingProfileResult)).toContain("pass an exact profileId");
  });

  it("performs Telegram owner handoff through an exact setup-code match without exposing other message text", async () => {
    const preview = buildTelegramOwnerHandoffPreview({
      toolInput: telegramOwnerHandoffInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
        setupCode: "AMBIENT-HANDOFF-123456",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });
    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      endpointPath: "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      safety: {
        readsProviderUnreadMessages: true,
        filtersExactSetupCode: true,
        resolvesSenderProfiles: true,
        returnsProviderMessageContent: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      },
    });
    expect(telegramOwnerHandoffPreviewText(preview)).toContain("does not return provider message bodies");

    const requests: Array<{ path: string; apiId?: string; apiHash?: string }> = [];
    const result = await withTelegramBridgeServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      requests.push({
        path: `${url.pathname}${url.search}`,
        apiId: req.headers["x-telegram-api-id"] as string | undefined,
        apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
      });
      if (url.pathname === "/sessions/owner-profile/inbox/unread") {
        expect(url.searchParams.get("chatId")).toBe("owner-chat");
        writeJson(res, {
          messages: [
            {
              id: "private-1",
              chatId: "owner-chat",
              outgoing: false,
              text: "private body must not leak",
              date: "2026-05-10T00:00:01.000Z",
            },
            {
              id: "handoff-1",
              chatId: "owner-chat",
              outgoing: false,
              text: "AMBIENT-HANDOFF-123456",
              date: "2026-05-10T00:00:02.000Z",
            },
            {
              id: "outgoing-echo",
              chatId: "owner-chat",
              outgoing: true,
              text: "AMBIENT-HANDOFF-123456",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/handoff-1/sender-profile") {
        writeJson(res, {
          sender: {
            kind: "user",
            user: {
              userId: "owner-1",
              displayName: "Owner",
            },
          },
        });
        return;
      }
      res.statusCode = 404;
      writeJson(res, { error: "not found" });
    }, async (baseUrl) => await applyTelegramOwnerHandoff({
      preview,
      setupCode: "AMBIENT-HANDOFF-123456",
      approvalRecorded: true,
      env: {
        AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
        AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
      },
      fetchFn: fetch,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    }));

    expect(result).toMatchObject({
      applyStatus: "applied",
      handoffStatus: "matched",
      fetchedMessageCount: 3,
      candidateMessageCount: 2,
      matchedMessageCount: 1,
      matchedSenderCount: 1,
      ownerUserId: "owner-1",
      ownerLabel: "Owner",
      sourceMessageId: "handoff-1",
      receivedAt: "2026-05-10T00:00:02.000Z",
    });
    expect(telegramOwnerHandoffResultText(result)).toContain("Use ownerUserId owner-1");
    expect(JSON.stringify(result)).not.toContain("private body must not leak");
    expect(telegramOwnerHandoffResultText(result)).not.toContain("private body must not leak");
    expect(requests).toEqual([
      {
        path: "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
        apiId: "12345",
        apiHash: "test-hash",
      },
      {
        path: "/sessions/owner-profile/chats/owner-chat/messages/handoff-1/sender-profile",
        apiId: "12345",
        apiHash: "test-hash",
      },
    ]);
  });

  it("blocks Telegram owner handoff before real-mode readiness", () => {
    const preview = buildTelegramOwnerHandoffPreview({
      toolInput: telegramOwnerHandoffInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
        setupCode: "AMBIENT-HANDOFF-123456",
      }),
      runtimeStatus: {
        ...telegramDirectoryRuntimeStatus(),
        providers: [{
          ...telegramDirectoryRuntimeStatus().providers[0],
          state: "stopped",
          mode: "none",
        }],
      },
    });
    expect(preview.canApplyNow).toBe(false);
    expect(preview.safety.readsProviderUnreadMessages).toBe(false);
    expect(preview.blockers).toContain("Telegram provider is not running in real mode; use the approved gateway lifecycle path before owner handoff.");
    expect(telegramOwnerHandoffPreviewText(preview)).toContain("Do not use Telegram Desktop scraping");
  });

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
      providers: [{
        providerId: "signal-cli",
        status: "blocked",
        mode: "planned",
        implementationStatus: "planned",
        purposeSupported: true,
        conversationDiscoveryDeclared: true,
        canListProviderConversationsNow: false,
        knownAuthProfiles: [],
        knownConversations: [],
      }],
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
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
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
        providers: [{
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
        }],
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
    expect(signalConversationDirectoryPreviewText(preview)).toContain("Signal session metadata contract: signal-local-bridge-session-metadata");
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
        providers: [{
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
            diagnostics: [
              "Signal bridge root contract accepted.",
              "Signal bridge profile status contract accepted.",
            ],
            bridgeBaseUrl: "http://127.0.0.1:19092",
            sessions: [{
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
            }],
          },
        }],
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
            conversations: [{
              conversationId: "signal-chat-1",
              title: "Ops",
              type: "direct",
              unreadCount: 2,
              folderIds: [],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
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
      conversations: [{
        conversationId: "signal-chat-1",
        title: "Ops",
        unreadCount: 2,
      }],
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
      selectedBindings: [{
        bindingId: "signal-binding-1",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        ownerUserId: "owner-1",
      }],
      safety: {
        readsProviderUnreadMessages: false,
        returnsProviderMessageBodiesToPi: false,
        routesRemoteAmbientSurface: false,
        sendsProviderMessages: false,
      },
    });
    expect(preview.blockers).toContain("Signal bounded unread-window apply is enabled only for the reviewed fake bridge when AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY=1.");
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
          readiness: provider.readiness ? {
            ...provider.readiness,
            bridgeCapabilities: {
              ...provider.readiness.bridgeCapabilities,
              boundedUnreadWindow: false,
            },
          } : undefined,
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
    expect(missingCapability.realBridgeUnreadReadiness.blockers).toContain("Real Signal unread single-read requires bridge capability boundedUnreadWindow.");
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
        dispatch: (event) => runner.dispatchInbound({
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
      expect(result.dispatches).toEqual(expect.arrayContaining([
        expect.objectContaining({ messageId: "seen-setup", accepted: false, droppedReason: "duplicate" }),
        expect.objectContaining({ messageId: "outgoing-1", accepted: false, droppedReason: "outgoing" }),
        expect.objectContaining({ messageId: "wrong-1", accepted: false, droppedReason: "wrong-sender" }),
        expect.objectContaining({ messageId: "empty-1", accepted: false, droppedReason: "empty" }),
        expect.objectContaining({ messageId: "real-command-1", accepted: true, queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-real-command-1" }),
      ]));
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
            messages: [
              { messageId: "real-command-1", senderId: "owner-1", text: "duplicate private text must not leak", outgoing: false },
            ],
          }),
        }),
        dispatch: (event) => runner.dispatchInbound({
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
        dispatch: (event) => runner.dispatchInbound({
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
    expect(missingExactBinding.blockers).toContain("Real Signal unread apply requires an exact active bindingId before apply can be ready.");
    expect(missingExactBinding.blockers).toContain("Real Signal unread single-read requires one exact active Signal Remote Ambient Surface binding.");

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
          readiness: provider.readiness ? {
            ...provider.readiness,
            bridgeCapabilities: {
              ...provider.readiness.bridgeCapabilities,
              boundedUnreadWindow: false,
            },
          } : undefined,
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
    const pollOnce = async () => await applySignalRealUnreadWindow({
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
            messages: [{
              messageId: "signal-real-polling-1",
              senderId: "owner-1",
              senderLabel: "Owner",
              text: "polling private text must not leak",
              receivedAt: "2026-05-10T00:00:02.000Z",
              outgoing: false,
            }],
          }),
        };
      },
      dispatch: (event) => gatewayRunner.dispatchInbound({
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
    expect(requests).toEqual([
      "http://127.0.0.1:19092/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
    ]);

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
        readiness: provider.readiness ? {
          ...provider.readiness,
          bridgeCapabilities: {
            ...provider.readiness.bridgeCapabilities,
            approvedReplySend: true,
          },
        } : undefined,
      })),
      queuedProjections: [{
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
      }],
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
    expect(missingReplyCapabilityStatus.repairSteps).toContain("Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.");

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
    await withTelegramBridgeServer(async (req, res) => {
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
    }, async (baseUrl) => {
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
    });

    expect(sentRequests).toEqual([{
      path: "/profiles/signal-owner/conversations/signal-chat-1/send",
      body: {
        text: "Ambient cannot send Signal replies yet.",
        replyToMessageId: "message-1",
      },
    }]);

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
    expect(relayDiagnostics.repairSteps).toContain("No repair needed; preview the selected runtime event with ambient_messaging_signal_bridge_reply_preview using runtimeEventId.");
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
    expect(missingCapabilityDiagnostics.repairSteps).toContain("Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.");

    const runtimeSentRequests: Array<{ path: string; body: unknown }> = [];
    await withTelegramBridgeServer(async (req, res) => {
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
    }, async (baseUrl) => {
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
    });
    expect(runtimeSentRequests).toEqual([{
      path: "/profiles/signal-owner/conversations/signal-chat-1/send",
      body: {
        text: "Ambient switched the active project to Signal project.",
        replyToMessageId: "message-1",
      },
    }]);

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
    expect(overriddenRuntimePreview.blockers).toContain("Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.");
    expect(overriddenRuntimePreview.repairSteps).toContain("Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.");

    const { sourceEventId: _staleSourceEventId, ...staleRuntimeEventBase } = completedRuntimeEvent;
    const staleRuntimeEvent: MessagingGatewayRemoteSurfaceRuntimeEvent = {
      ...staleRuntimeEventBase,
      id: "remote-surface-signal-stale-routing",
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
    expect(staleRuntimePreview.blockers).toContain("Signal reply preview requires an exact replyToMessageId or a queued Signal projection with a parseable source message id.");
    expect(staleRuntimePreview.repairSteps).toContain("This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides the exact replyToMessageId.");
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
    expect(relayedRuntimePreview.repairSteps).toContain("Do not resend this runtime event; inspect Recent outbound deliveries in ambient_messaging_gateway_status and wait for a new runtime event if another owner update is needed.");
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
        dispatch: (event) => runner.dispatchInbound({
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
      expect(result.dispatches).toEqual(expect.arrayContaining([
        expect.objectContaining({ messageId: "seen-setup", accepted: false, droppedReason: "duplicate" }),
        expect.objectContaining({ messageId: "outgoing-1", accepted: false, droppedReason: "outgoing" }),
        expect.objectContaining({ messageId: "wrong-1", accepted: false, droppedReason: "wrong-sender" }),
        expect.objectContaining({ messageId: "empty-1", accepted: false, droppedReason: "empty" }),
        expect.objectContaining({ messageId: "command-1", accepted: true, queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-command-1" }),
      ]));
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
        bindings: [{
          bindingId: "signal-binding-1",
          dedupeSeenMessageCount: 5,
          lastAcceptedMessageId: "command-1",
          queuedProjectionCount: 1,
          queuedProjections: [{
            queuedProjectionId: "projection-signal-cli-signal-signal-owner-signal-chat-1-command-1",
            projectionKind: "unsupported",
          }],
        }],
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
        dispatch: (event) => runner.dispatchInbound({
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
        dispatch: (event) => runner.dispatchInbound({
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
      providers: [{
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
          sessions: [{
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
          }],
        },
      }],
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
      providers: [{
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
          sessions: [{
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
          }],
        },
      }],
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
      providers: [{
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
          sessions: [{
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
          }],
        },
      }],
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
      providers: [{
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
          sessions: [{
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
          }],
        },
      }],
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

    expect(() => signalRemoteSurfaceBindingInput({
      providerId: "signal-cli",
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "signal-owner-sender",
      ownerHandoffSourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-2"],
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
    })).toThrow("initialSeenMessageIds must include ownerHandoffSourceMessageId");
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
    expect(() => sanitizeMessagingConversationDirectoryEntry({
      contractLabel: "Signal bridge",
      raw: {
        id: "signal-chat-1",
        title: "Signal Owner Chat",
        lastMessage: { text: "private message body must not leak" },
      },
    })).toThrow("Signal bridge metadata-only directory contract violation: response included lastMessage.");
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

  it("delegates provider-neutral Remote Ambient Surface previews to Telegram where safe", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-remote-surface-preview-"));
    try {
      const bindingStore = createMessagingBindingStore({ stateRoot, providers });
      const toolInput = messagingRemoteSurfaceBindingPreviewInput({
        action: "create",
        providerId: "telegram-tdlib",
        authProfileId: "owner",
        conversationId: "owner-chat",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const preview = await buildMessagingRemoteSurfaceBindingPreview({
        toolInput,
        providers,
        bindings: bindingStore.list({ includeInactive: true }),
        telegramPlan: async (telegramInput) => buildTelegramRemoteSurfaceBindingPlan({
          toolInput: telegramInput,
          lifecycle: telegramInput.action === "create"
            ? bindingStore.previewCreate(telegramRemoteSurfaceBindingCreateInput(telegramInput))
            : bindingStore.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(telegramInput)),
        }),
      });

      expect(preview).toMatchObject({
        providerId: "telegram-tdlib",
        typedPreviewTool: "ambient_messaging_telegram_remote_surface_preview",
        typedApplyTool: "ambient_messaging_telegram_remote_surface_apply",
        delegatedTelegramPlan: {
          action: "create",
        },
      });
      expect(preview.warnings.join("\n")).toContain("delegated to the Telegram typed");
      expect(messagingRemoteSurfaceBindingPreviewText(preview)).toContain("Delegated Telegram preview summary");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews Telegram inbound event routing without queueing projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const registry = createEmptyMessagingBindingRegistry(providers);
    registry.add({
      id: "binding-owner-chat",
      providerId: "telegram-tdlib",
      authProfileId: "owner",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    const preview = buildMessagingRemoteSurfaceEventPreview({
      toolInput: messagingRemoteSurfaceEventPreviewInput({
        providerId: "telegram-tdlib",
        authProfileId: "owner",
        conversationId: "owner-chat",
        messageId: "101",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "status",
      }, () => new Date("2026-05-10T00:00:01.000Z")),
      providers,
      bindings: registry.list({ includeInactive: false }),
      surface: buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "Dogfood",
          path: "/tmp/dogfood",
          statePath: "/tmp/dogfood/.ambient",
          sessionPath: "/tmp/dogfood/.ambient/session.json",
        },
        threads: [],
        workflowFolders: [],
      }),
    });

    expect(preview).toMatchObject({
      providerId: "telegram-tdlib",
      status: "ready",
      canRouteWithTypedTool: true,
      typedRouteTool: "ambient_messaging_telegram_bridge_event_route",
      matchedBinding: {
        id: "binding-owner-chat",
      },
      routePreview: {
        projection: {
          kind: "surface_list",
        },
      },
    });
    expect(preview.safety.queuesProjection).toBe(false);
    expect(messagingRemoteSurfaceEventPreviewText(preview)).toContain("Projection preview:");
  });

  it("requires explicit binding purpose and validates purpose-specific fields", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);

    bindings.add({
      id: "binding-1",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local",
      conversationId: "123",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    });

    const result = bindings.list();
    expect(result).toMatchObject({
      bindingCount: 1,
      activeBindingCount: 1,
      remoteAmbientSurfaceCount: 1,
      messagingConnectorCount: 0,
      headlessSafeBindingCount: 1,
    });
    expect(result.bindings[0]).toMatchObject({
      id: "binding-1",
      purpose: "remote_ambient_surface",
      headlessSafe: true,
      ownerUserId: "owner-1",
      ambientSurface: "projects",
    });

    expect(() => bindings.add({
      id: "binding-2",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local",
      conversationId: "456",
      purpose: "remote_ambient_surface",
      status: "active",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    })).toThrow(/requires ownerUserId/);

    expect(() => bindings.add({
      id: "binding-3",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local",
      conversationId: "789",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "delegate",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    })).toThrow(/requires externalTrustClass=external/);

    expect(() => bindings.add({
      id: "binding-signal",
      providerId: "signal-cli",
      authProfileId: "signal-local-owner",
      conversationId: "signal-chat-1",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    })).toThrow(/requires setupTool=ambient_messaging_signal_remote_surface_apply/);
  });

  it("summarizes headless runtime UX command readiness", () => {
    const result = buildHeadlessRuntimeUxInventory();

    expect(result.commandCount).toBeGreaterThan(8);
    expect(result.headlessReadyCount).toBeGreaterThan(0);
    expect(result.partialCount).toBeGreaterThan(0);
    expect(result.plannedCount).toBeGreaterThanOrEqual(0);
    expect(result.settingCount).toBeGreaterThan(20);
    expect(result.settingReadyCount).toBeGreaterThan(3);
    expect(result.settingPartialCount).toBeGreaterThan(10);
    expect(result.settingsCatalog.find((setting) => setting.key === "voice.output")).toMatchObject({
      sectionId: "voice",
      rowId: "voice.output",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set voice mode off", "set voice maxChars 1500"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "search.preference")).toMatchObject({
      sectionId: "search",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.provider")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "partial",
      headlessWritable: false,
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.input")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["enable speech input", "set speech language English"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.language")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set stt language Spanish"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.behavior")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set speech autoSend off"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.advanced")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set speech silence 0.8", "set speech rmsThreshold -55"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "media.generated")).toMatchObject({
      sectionId: "media-browser",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set generated media autoplay on", "set generated media autoplay off"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "model-mode.planner")).toMatchObject({
      sectionId: "model-mode",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set planner autoFinalize off", "set planner finalization automatic"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "diagnostics.export")).toMatchObject({
      sectionId: "diagnostics",
      headlessStatus: "planned",
    });
    expect(result.commands.find((command) => command.id === "project.list")).toMatchObject({
      category: "project",
      mode: "read",
      headlessStatus: "ready",
      plannerSafe: true,
      toolNames: ["ambient_runtime_surface_snapshot"],
    });
    expect(result.commands.find((command) => command.id === "project.create")).toMatchObject({
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      toolNames: [
        "ambient_messaging_remote_surface_command_preview",
        "ambient_messaging_remote_surface_command_apply",
      ],
      commandExamples: expect.arrayContaining(["create project Field Notes"]),
    });
    expect(result.commands.find((command) => command.id === "project.switch")).toMatchObject({
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["switch project 1"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.create")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["create workflow Track the Remote Ambient Surface gateway status"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.exploration.run")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["run exploration", "run workflow exploration"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.compile.preview")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["compile from exploration", "compile workflow"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.review.approve")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["approve workflow preview", "approve artifact"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.review.reject")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["reject workflow preview", "reject artifact"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.run.cancel")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["cancel workflow", "stop workflow"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.retry")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["retry failed step", "retry failed event 1"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.resume")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["resume checkpoint"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.skip")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["skip failed item"]),
    });
    expect(result.commands.find((command) => command.id === "chat.create")).toMatchObject({
      category: "chat",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["create chat Remote triage"]),
    });
    expect(result.commands.find((command) => command.id === "settings.voice.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set voice mode off"]),
    });
    expect(result.commands.find((command) => command.id === "settings.search.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(result.commands.find((command) => command.id === "settings.speech.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set speech language English", "set speech silence 0.8"]),
    });
    expect(result.commands.find((command) => command.id === "settings.media.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set generated media autoplay on"]),
    });
    expect(result.commands.find((command) => command.id === "settings.thread.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set chat mode planner", "set chat thinking medium"]),
    });
    expect(result.commands.find((command) => command.id === "settings.planner.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set planner autoFinalize off"]),
    });
    expect(result.commands.find((command) => command.id === "approval.list")).toMatchObject({
      category: "approval",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_runtime_surface_snapshot"],
    });
    expect(result.commands.find((command) => command.id === "approval.respond")).toMatchObject({
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["approve request 1", "deny request 1"]),
    });
    expect(result.commands.find((command) => command.id === "approval.grants.revoke")).toMatchObject({
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["revoke grant 1"]),
    });
    const remoteActivationCommand = result.commands.find((command) => command.id === "messaging.remote.activation.plan");
    expect(remoteActivationCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_telegram_owner_loop_activation_plan",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["set up remote control", "set up Telegram remote control"]),
    });
    expect(remoteActivationCommand?.commandExamples).toEqual(expect.arrayContaining(["set up Signal remote control"]));
    expect(remoteActivationCommand?.notes.join("\n")).toContain("including requests that explicitly name Telegram, Signal");
    expect(remoteActivationCommand?.notes.join("\n")).toContain("unsupported-provider repair/status prompt");
    const remoteProviderSupportCommand = result.commands.find((command) => command.id === "messaging.remote.provider-support.plan");
    expect(remoteProviderSupportCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_remote_surface_provider_support_plan",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["plan Signal remote control support"]),
    });
    expect(remoteProviderSupportCommand?.notes.join("\n")).toContain("adapter requirements");
    expect(remoteProviderSupportCommand?.notes.join("\n")).toContain("Signal Desktop");
    const telegramActivationCommand = result.commands.find((command) => command.id === "messaging.telegram.activation.plan");
    expect(telegramActivationCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: ["ambient_messaging_remote_surface_activation_plan", "ambient_messaging_telegram_owner_loop_activation_plan", "ambient_messaging_gateway_status"],
      commandExamples: expect.arrayContaining(["set up Telegram remote control"]),
    });
    expect(telegramActivationCommand?.notes.join("\n")).toContain("first even when the user explicitly names Telegram");
    expect(result.commands.find((command) => command.id === "messaging.polling.status")).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: ["ambient_messaging_telegram_bridge_polling_status", "ambient_messaging_gateway_status"],
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.once")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_poll_preview",
        "ambient_messaging_telegram_bridge_poll_apply",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["check Telegram once for my command"]),
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.start")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_polling_preview",
        "ambient_messaging_telegram_bridge_polling_apply",
        "ambient_messaging_telegram_bridge_polling_status",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["start Telegram owner polling"]),
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.stop")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_polling_preview",
        "ambient_messaging_telegram_bridge_polling_apply",
        "ambient_messaging_telegram_bridge_polling_status",
      ],
      commandExamples: expect.arrayContaining(["stop Telegram owner polling"]),
    });
    expect(result.commands.find((command) => command.id === "settings.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "partial",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
    });
    expect(result.commands.find((command) => command.id === "runtime.status")).toMatchObject({
      category: "status",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      toolName: "ambient_messaging_gateway_status",
      toolNames: ["ambient_messaging_gateway_status", "ambient_runtime_surface_snapshot"],
    });
    expect(headlessRuntimeUxInventoryText(result)).toContain("Ambient headless runtime UX inventory");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.voice.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.speech.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.media.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.thread.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.planner.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.exploration.run");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.compile.preview");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.review.approve");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.review.reject");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.run.cancel");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.retry");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.resume");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.skip");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.remote.activation.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_remote_surface_activation_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.remote.provider-support.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_remote_surface_provider_support_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.telegram.activation.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set up remote control");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set up Telegram remote control");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.start");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.stop");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.once");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply");
    expect(headlessRuntimeUxInventoryText(result)).toContain("start Telegram owner polling");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approval.respond");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approval.grants.revoke");
    expect(headlessRuntimeUxInventoryText(result)).toContain("Settings catalog:");
    expect(headlessRuntimeUxInventoryText(result)).toContain("voice.output: Voice output policy");
    expect(headlessRuntimeUxInventoryText(result)).toContain("speech.provider: Speech provider");
    expect(headlessRuntimeUxInventoryText(result)).toContain("speech.input: Speech input policy");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set speech language English");
    expect(headlessRuntimeUxInventoryText(result)).toContain("media.generated: Generated media playback");
    expect(headlessRuntimeUxInventoryText(result)).toContain("model-mode.mode: Agent/planner mode");
    expect(headlessRuntimeUxInventoryText(result)).toContain("model-mode.planner: Planner finalization");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set chat mode planner");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set planner autoFinalize off");
    expect(headlessRuntimeUxInventoryText(result)).toContain("run exploration");
    expect(headlessRuntimeUxInventoryText(result)).toContain("compile from exploration");
    expect(headlessRuntimeUxInventoryText(result)).toContain("retry failed step");
    expect(headlessRuntimeUxInventoryText(result)).toContain("resume checkpoint");
    expect(headlessRuntimeUxInventoryText(result)).toContain("skip failed item");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set generated media autoplay on");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approve request 1");
    expect(headlessRuntimeUxInventoryText(result)).toContain("revoke grant 1");
    expect(headlessRuntimeUxInventoryText(result)).toContain("Tool sequence: ambient_messaging_remote_surface_command_preview -> ambient_messaging_remote_surface_command_apply");
    expect(headlessRuntimeUxInventoryText(result)).toContain("Examples: create project Field Notes");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set voice mode off");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_runtime_surface_snapshot");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_project_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_workflow_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_chat_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_settings_update");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_workflow_status");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_runtime_status");
  });

  it("previews, persists, and revokes binding lifecycle records without bridge side effects", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-bindings-"));
    try {
      const providers = createDefaultMessagingProviderRegistry();
      const store = createMessagingBindingStore({
        stateRoot,
        providers,
        now: () => new Date("2026-05-10T00:00:00.000Z"),
      });

      const createInput = {
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local-owner",
        conversationId: "telegram-chat-1",
        purpose: "remote_ambient_surface" as const,
        ownerUserId: "owner-1",
        ambientSurface: "projects" as const,
      };
      const preview = store.previewCreate(createInput);
      expect(preview).toMatchObject({
        action: "create",
        approvalRequired: true,
        wouldPersist: true,
        wouldStartBridge: false,
        wouldReadMessages: false,
        wouldSendMessages: false,
        binding: {
          providerId: "telegram-tdlib",
          purpose: "remote_ambient_surface",
          status: "active",
          headlessSafe: true,
        },
      });
      expect(bindingLifecyclePreviewText(preview)).toContain("Would start bridge: no");

      const created = store.create(createInput);
      expect(created.persisted).toBe(true);
      expect(store.list()).toMatchObject({ bindingCount: 1, activeBindingCount: 1 });
      expect(() => store.create(createInput)).toThrow(/already registered|already exists/);

      const revokePreview = store.previewRevoke({ bindingId: created.binding.id, reason: "test cleanup" });
      expect(revokePreview.binding.status).toBe("revoked");
      const revoked = store.revoke({ bindingId: created.binding.id, reason: "test cleanup" });
      expect(revoked.persisted).toBe(true);
      expect(store.list()).toMatchObject({ bindingCount: 0, activeBindingCount: 0 });
      expect(store.list({ includeInactive: true }).bindings[0]).toMatchObject({
        id: created.binding.id,
        status: "revoked",
        metadata: { revokedReason: "test cleanup" },
      });

      const reloaded = createMessagingBindingStore({ stateRoot, providers });
      expect(reloaded.list({ includeInactive: true }).bindingCount).toBe(1);
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("plans typed Telegram Remote Ambient Surface binding setup with owner, surface, and disclosure requirements", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-remote-surface-"));
    try {
      const providers = createDefaultMessagingProviderRegistry();
      const store = createMessagingBindingStore({
        stateRoot,
        providers,
        now: () => new Date("2026-05-10T00:00:00.000Z"),
      });
      const readiness = {
        providerId: "telegram-tdlib",
        status: "degraded" as const,
        configured: true,
        bridgeReachable: false,
        authNeeded: true,
        apiCredentialsPresent: true,
        persistedSessionCount: 1,
        checkedAt: "2026-05-10T00:00:00.000Z",
        message: "Session metadata exists; bridge startup remains separate.",
        diagnostics: [],
        sessions: [
          {
            profileId: "owner",
            metadataPath: join(stateRoot, "telegram", "owner", "bridge-session.json"),
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          },
        ],
      };
      const runtimeProvider = {
        providerId: "telegram-tdlib",
        label: "Telegram",
        state: "stopped" as const,
        mode: "none" as const,
        syntheticEventCount: 0,
        realEventCount: 0,
        queuedProjectionCount: 0,
        readiness,
      };

      expect(() => telegramRemoteSurfaceBindingInput({
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner",
        conversationId: "telegram-chat-1",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      })).toThrow(/maxDisclosureLabel is required/);

      const createToolInput = telegramRemoteSurfaceBindingInput({
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner",
        conversationId: "telegram-chat-1",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      if (createToolInput.action !== "create") throw new Error("expected create input");
      const createPlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: createToolInput,
        lifecycle: store.previewCreate(telegramRemoteSurfaceBindingCreateInput(createToolInput)),
        readiness,
        runtimeProvider,
      });

      expect(createPlan).toMatchObject({
        status: "ready",
        canApplyNow: true,
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          enablesInboundIngestion: false,
        },
        lifecycle: {
          binding: {
            providerId: "telegram-tdlib",
            purpose: "remote_ambient_surface",
            authProfileId: "owner",
            conversationId: "telegram-chat-1",
            ownerUserId: "owner-1",
            ambientSurface: "projects",
            externalTrustClass: "owner",
            maxDisclosureLabel: "owner-private-runtime-summary",
          },
        },
      });
      expect(telegramRemoteSurfaceBindingText(createPlan)).toContain("Would enable inbound ingestion: no");
      expect(telegramRemoteSurfaceBindingText(createPlan)).toContain("Max disclosure: owner-private-runtime-summary");

      const created = store.create(telegramRemoteSurfaceBindingCreateInput(createToolInput));
      const applied = telegramRemoteSurfaceBindingAppliedResult(createPlan, created);
      expect(applied.persisted).toBe(true);
      expect(telegramRemoteSurfaceBindingText(applied)).toContain("Telegram Remote Ambient Surface binding applied");

      const revokeToolInput = telegramRemoteSurfaceBindingInput({
        action: "revoke",
        bindingId: created.binding.id,
        reason: "typed setup test cleanup",
      });
      if (revokeToolInput.action !== "revoke") throw new Error("expected revoke input");
      const revokePlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: revokeToolInput,
        lifecycle: store.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput)),
        readiness,
        runtimeProvider,
      });
      expect(revokePlan.status).toBe("ready");
      const revoked = store.revoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput));
      expect(revoked.binding.status).toBe("revoked");
      expect(store.list({ includeInactive: true }).bindings[0]).toMatchObject({
        id: created.binding.id,
        status: "revoked",
        metadata: { revokedReason: "typed setup test cleanup" },
      });

      const missingSessionInput = telegramRemoteSurfaceBindingInput({
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "missing-owner",
        conversationId: "telegram-chat-2",
        ownerUserId: "owner-1",
        ambientSurface: "settings",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      if (missingSessionInput.action !== "create") throw new Error("expected create input");
      const blockedPlan = buildTelegramRemoteSurfaceBindingPlan({
        toolInput: missingSessionInput,
        lifecycle: store.previewCreate(telegramRemoteSurfaceBindingCreateInput(missingSessionInput)),
        readiness,
        runtimeProvider,
      });
      expect(blockedPlan.status).toBe("blocked");
      expect(blockedPlan.blockers.join("\n")).toContain("No persisted Telegram session metadata was found");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("builds a bounded runtime surface snapshot for chat-native navigation", () => {
    const snapshot = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      activeThreadId: "thread-1",
      threads: [
        {
          id: "thread-1",
          title: "Operational Status Check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:02.000Z",
          lastReadAt: "2026-05-10T00:00:03.000Z",
          lastMessagePreview: "It worked.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [
        {
          id: "folder-1",
          name: "Workflows",
          kind: "custom",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          threads: [
            {
              id: "workflow-1",
              folderId: "folder-1",
              projectName: "AmbientDesktop",
              projectPath: "/workspace",
              title: "Find papers",
              phase: "discovery",
              initialRequest: "Find papers",
              preview: "Find papers",
              status: "Discovery",
              traceMode: "production",
              discoveryQuestions: [],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
      permissionRequests: [
        {
          id: "permission-1",
          threadId: "thread-1",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          title: "Send Telegram reply?",
          message: "Send one Telegram reply to conversation owner-chat.",
          detail: "Send a compact status reply through Telegram.",
          risk: "plugin-tool",
          reusableScopes: ["thread", "workspace"],
          grantActionKind: "plugin_tool_execute",
          grantTargetKind: "tool",
          grantTargetLabel: "telegram reply",
          grantTargetHash: "reply-hash",
        },
      ],
      permissionGrants: [
        {
          id: "grant-1",
          createdAt: "2026-05-10T00:00:04.000Z",
          updatedAt: "2026-05-10T00:00:04.000Z",
          createdBy: "user",
          permissionModeAtCreation: "workspace",
          scopeKind: "thread",
          threadId: "thread-1",
          actionKind: "plugin_tool_execute",
          targetKind: "tool",
          targetHash: "telegram-reply-grant",
          targetLabel: "Telegram reply grant",
          source: "permission_prompt",
          reason: "User approved Telegram replies for this thread.",
        },
      ],
      permissionAudit: [
        {
          id: "audit-1",
          threadId: "thread-1",
          createdAt: "2026-05-10T00:00:05.000Z",
          permissionMode: "workspace",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          risk: "plugin-tool",
          decision: "allowed",
          reason: "Matched persistent grant.",
          decisionSource: "persistent_grant",
          grantId: "grant-1",
        },
      ],
      settings: {
        voice: {
          enabled: true,
          autoplay: false,
          mode: "assistant-final",
          providerCapabilityId: "voice.piper",
          longReply: "summarize",
          maxChars: 1500,
          format: "wav",
          artifactCacheMaxMb: 256,
        },
        search: { webSearch: { activity: "web_search", preferredProvider: "browser", mode: "prefer", fallback: "allow" } },
        media: { generatedMediaAutoplay: true },
        planner: { autoFinalize: true },
        stt: {
          enabled: true,
          providerCapabilityId: "stt.qwen3",
          spokenLanguage: "English",
          mode: "push-to-talk",
          autoSendAfterTranscription: true,
          silenceFinalizeSeconds: 0.8,
          noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
          bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
        },
      },
    });

    expect(snapshot).toMatchObject({
      workspace: { name: "AmbientDesktop" },
      activeChatId: "thread-1",
      limits: {
        chatCount: 1,
        workflowAgentCount: 1,
        pendingApprovalCount: 1,
        permissionGrantCount: 1,
        permissionAuditCount: 1,
        returnedChatCount: 1,
        returnedWorkflowAgentCount: 1,
        returnedPendingApprovalCount: 1,
        returnedPermissionGrantCount: 1,
        returnedPermissionAuditCount: 1,
      },
    });
    expect(snapshot.pendingApprovals[0]).toMatchObject({
      id: "permission-1",
      title: "Send Telegram reply?",
      responseModes: expect.arrayContaining(["deny", "allow_once", "always_thread", "always_workspace"]),
    });
    expect(snapshot.permissionGrants[0]).toMatchObject({
      id: "grant-1",
      targetLabel: "Telegram reply grant",
      scopeKind: "thread",
    });
    expect(snapshot.permissionAudit[0]).toMatchObject({
      id: "audit-1",
      decision: "allowed",
      decisionSource: "persistent_grant",
    });
    expect(snapshot.settings.find((setting) => setting.key === "security.grants")).toMatchObject({
      label: "Permission grants and pending approvals",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      valueSummary: "pendingApprovals=1; activeGrants=1",
    });
    expect(snapshot.settings.find((setting) => setting.key === "security.log")).toMatchObject({
      label: "Permission log",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      valueSummary: "recentAuditEntries=1",
    });
    expect(snapshot.settings.find((setting) => setting.key === "voice.output")).toMatchObject({
      label: "Voice output policy",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["set voice mode off"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.provider")).toMatchObject({
      label: "Speech provider",
      headlessStatus: "partial",
      headlessReadable: true,
      headlessWritable: false,
      configured: true,
      valueSummary: "provider=stt.qwen3",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.input")).toMatchObject({
      label: "Speech input policy",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["enable speech input", "set speech language English"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.language")).toMatchObject({
      label: "Spoken language",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "spokenLanguage=English",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.behavior")).toMatchObject({
      label: "Speech behavior",
      headlessStatus: "ready",
      headlessWritable: true,
      valueSummary: "enabled=true; autoSendAfterTranscription=true",
    });
    expect(snapshot.settings.find((setting) => setting.key === "speech.advanced")).toMatchObject({
      label: "Advanced speech recognition",
      headlessStatus: "ready",
      headlessWritable: true,
      valueSummary: "silenceFinalizeSeconds=0.8; noSpeechGate=true; bargeInStopTts=true",
    });
    expect(snapshot.settings.find((setting) => setting.key === "search.preference")).toMatchObject({
      label: "Search preference",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "media.generated")).toMatchObject({
      label: "Generated media playback",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "generatedMediaAutoplay=true",
      commandExamples: expect.arrayContaining(["set generated media autoplay off"]),
    });
    expect(snapshot.chats[0]).toMatchObject({
      id: "thread-1",
      active: true,
      model: "ambient:fast",
      thinkingLevel: "medium",
    });
    expect(snapshot.workflowAgents[0]).toMatchObject({
      id: "workflow-1",
      title: "Find papers",
      phase: "discovery",
      traceMode: "production",
      discoveryQuestionCount: 0,
      answeredDiscoveryQuestionCount: 0,
      unansweredDiscoveryQuestionCount: 0,
      nextCommands: expect.arrayContaining(["run exploration", "compile from exploration"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.model")).toMatchObject({
      label: "Model",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: false,
      configured: true,
      valueSummary: "thread=Operational Status Check; model=ambient:fast",
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.mode")).toMatchObject({
      label: "Agent/planner mode",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "thread=Operational Status Check; collaborationMode=agent",
      commandExamples: expect.arrayContaining(["set chat mode planner"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.thinking")).toMatchObject({
      label: "Thinking level",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "thread=Operational Status Check; thinkingLevel=medium",
      commandExamples: expect.arrayContaining(["set chat thinking minimal"]),
    });
    expect(snapshot.settings.find((setting) => setting.key === "model-mode.planner")).toMatchObject({
      label: "Planner finalization",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      configured: true,
      valueSummary: "autoFinalize=true",
      commandExamples: expect.arrayContaining(["set planner autoFinalize off"]),
    });
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Operational Status Check");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Find papers");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Discovery questions: 0/0 answered");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Next commands: open workflow workflow-1; run exploration; compile from exploration");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("voice.output: Voice output policy; status=ready");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("speech.provider: Speech provider; status=partial");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("speech.language: Spoken language; status=ready; readable=yes; writable=yes; configured=yes; spokenLanguage=English");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("speech.advanced: Advanced speech recognition; status=ready; readable=yes; writable=yes; configured=yes; silenceFinalizeSeconds=0.8");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("search.preference: Search preference; status=ready");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("media.generated: Generated media playback; status=ready; readable=yes; writable=yes; configured=yes; generatedMediaAutoplay=true");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("model-mode.mode: Agent/planner mode; status=ready; readable=yes; writable=yes; configured=yes; thread=Operational Status Check; collaborationMode=agent");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("model-mode.planner: Planner finalization; status=ready; readable=yes; writable=yes; configured=yes; autoFinalize=true");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Mode: agent; thinking=medium; model=ambient:fast; permission=workspace; active=yes");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Pending approvals: 1/1");
    expect(runtimeSurfaceSnapshotText(snapshot)).toContain("Send Telegram reply?");
  });

  it("routes synthetic Remote Ambient Surface events into chat-native projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "telegram-chat-1",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "workflow_agents",
      workflowId: "workflow-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [
        {
          id: "folder-1",
          name: "Workflows",
          kind: "custom",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          threads: [
            {
              id: "workflow-1",
              folderId: "folder-1",
              projectName: "AmbientDesktop",
              projectPath: "/workspace",
              title: "Placebo papers",
              phase: "discovery",
              initialRequest: "Find placebo papers",
              preview: "Find recent papers and summarize them.",
              status: "Discovery waiting for answer",
              traceMode: "production",
              discoveryQuestions: [
                {
                  id: "question-1",
                  workflowThreadId: "workflow-1",
                  category: "data_sources",
                  context: "Workflow needs an arxiv access path before compiling.",
                  question: "How should Ambient access arxiv?",
                  choices: [],
                  allowFreeform: true,
                  createdAt: "2026-05-10T00:00:00.000Z",
                },
              ],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
      relaySummaries: [
        {
          runtimeEventId: "remote-surface-relay-1",
          title: "Switch to Research project",
          eventStatus: "completed",
          relayActionStatus: "preview-ready",
          relaySuggested: true,
          duplicateBlocked: false,
          summary: "Active Ambient project switched to Research project.",
          queuedProjectionId: "projection-relay-1",
          bindingId: "remote-binding",
          targetProviderId: "telegram-tdlib",
          targetProviderLabel: "Telegram",
          previewToolName: "ambient_messaging_remote_surface_reply_preview",
          applyToolName: "ambient_messaging_remote_surface_reply_apply",
          diagnosticsToolName: "ambient_messaging_telegram_relay_diagnostics",
          previewCommand: "ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1",
          applyCommand: "ambient_messaging_remote_surface_reply_apply runtimeEventId=remote-surface-relay-1",
          diagnosticsCommand: "ambient_messaging_telegram_relay_diagnostics profileId=telegram-local-owner conversationId=telegram-chat-1",
          nextAction: "Preview relay by calling ambient_messaging_remote_surface_reply_preview with runtimeEventId remote-surface-relay-1. Apply with ambient_messaging_remote_surface_reply_apply only after preview and explicit approval.",
        },
      ],
    });

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-1",
        providerId: "telegram-tdlib",
        conversationId: "telegram-chat-1",
        sender: { id: "owner-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });

    expect(result.projection).toMatchObject({
      kind: "workflow_status",
      purpose: "remote_ambient_surface",
      bindingId: "remote-binding",
      surface: "workflow_agents",
      summary: "Workflow is waiting for input.",
    });
    expect(messagingProjectionText(result.projection)).toContain("How should Ambient access arxiv?");
    expect(messagingProjectionText(result.projection)).toContain("Status relays:");
    expect(messagingProjectionText(result.projection)).toContain("ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1");
    expect(result.projection.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "relay-preview-remote-surface-relay-1",
        command: "ambient_messaging_remote_surface_reply_preview runtimeEventId=remote-surface-relay-1",
      }),
    ]));
    expect(result.promptContext.allowedContext.join("\n")).toContain("Bound surface: workflow_agents");
  });

  it("previews and applies Remote Ambient Surface workflow navigation commands from queued projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-remote-command-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [
        {
          id: "folder-1",
          name: "Workflows",
          kind: "custom",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          threads: [
            {
              id: "workflow-1",
              folderId: "folder-1",
              projectName: "AmbientDesktop",
              projectPath: "/workspace",
              title: "Placebo papers",
              phase: "paused",
              initialRequest: "Find placebo papers",
              preview: "Find recent papers and summarize them.",
              status: "Discovery waiting for answer",
              traceMode: "production",
              discoveryQuestions: [
                {
                  id: "question-1",
                  workflowThreadId: "workflow-1",
                  category: "data_sources",
                  context: "Workflow needs an arxiv access path before compiling.",
                  question: "How should Ambient access arxiv?",
                  choices: [],
                  allowFreeform: true,
                  createdAt: "2026-05-10T00:00:00.000Z",
                },
              ],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open workflow 1",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "open_workflow",
        wouldPersistBinding: true,
        approvalRequired: false,
        targetSurface: "workflow_agents",
        targetWorkflow: { id: "workflow-1" },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Would send provider messages: no");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      expect(update).toEqual({
        bindingId: preview.binding?.id,
        ambientSurface: "workflow_agents",
        workflowId: "workflow-1",
        chatThreadId: null,
        reason: "remote-surface-command:open_workflow",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: false,
        updatedBinding,
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedBinding: {
          ambientSurface: "workflow_agents",
          workflowId: "workflow-1",
        },
        projection: {
          kind: "workflow_status",
          summary: "Workflow is waiting for input.",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("How should Ambient access arxiv?");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "workflow_agents",
        workflowId: "workflow-1",
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("opens chat threads through Remote Ambient Surface commands without provider sends", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-bindings-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [
        {
          id: "chat-1",
          title: "Remote status check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Current status is green.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-4.5",
          thinkingLevel: "minimal",
        },
      ],
      workflowFolders: [],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-chat",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open chat 1",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "open_chat",
        wouldPersistBinding: true,
        approvalRequired: false,
        targetSurface: "chat",
        targetChat: { id: "chat-1" },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Target chat: Remote status check");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      expect(update).toEqual({
        bindingId: preview.binding?.id,
        ambientSurface: "chat",
        workflowId: null,
        chatThreadId: "chat-1",
        reason: "remote-surface-command:open_chat",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: false,
        updatedBinding,
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedBinding: {
          ambientSurface: "chat",
          chatThreadId: "chat-1",
        },
        projection: {
          title: "Remote status check",
          summary: "Chat thread selected: Remote status check.",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Last message preview: Current status is green.");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "chat",
        chatThreadId: "chat-1",
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews approval-gated chat creation commands", () => {
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
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-create-chat",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "create chat Remote triage",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "ready",
      commandKind: "create_chat",
      approvalRequired: true,
      wouldPersistBinding: true,
      targetSurface: "chat",
      newChatTitle: "Remote triage",
    });
    expect(messagingRemoteSurfaceCommandBindingUpdate(preview)).toBeUndefined();
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("New chat title: Remote triage");
  });

  it("previews and projects approval-gated workflow creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-workflow-create-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-create-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "create workflow Remote status workflow :: Track the Remote Ambient Surface gateway status and summarize blockers.",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "create_workflow",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflowCreate: {
          title: "Remote status workflow",
          initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
        },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(preview)).toBeUndefined();
      expect(messagingRemoteSurfaceCommandWorkflowCreateRequest(preview)).toMatchObject({
        title: "Remote status workflow",
        initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("New workflow: Remote status workflow");

      const updatedBinding = bindings.updateRemoteSurfaceScope({
        bindingId: preview.binding!.id,
        ambientSurface: "workflow_agents",
        workflowId: "workflow-created",
        reason: "remote-surface-command:create_workflow",
      });
      const createdSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "AmbientDesktop",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "discovery",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "Discovery",
                traceMode: "production",
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:01.000Z",
              },
            ],
          },
        ],
      });
      const createdWorkflow = createdSurface.workflowAgents[0];
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface: createdSurface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        ...(createdWorkflow ? { createdWorkflow } : {}),
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        createdWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        updatedBinding: {
          ambientSurface: "workflow_agents",
          workflowId: "workflow-created",
        },
        projection: {
          kind: "workflow_status",
          title: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Created workflow: Remote status workflow");

      const explorationDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-run-exploration",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "run exploration",
          receivedAt: "2026-05-10T00:00:03.000Z",
        },
      });
      const explorationPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: explorationDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(explorationPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        targetWorkflowAction: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandWorkflowActionRequest(explorationPreview)).toMatchObject({
        action: "run_exploration",
        workflowThreadId: "workflow-created",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(explorationPreview)).toContain("Workflow action: run exploration");
      const explorationResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: explorationPreview,
        approvalRecorded: true,
        updatedBinding,
        workflowActionResult: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          traceId: "trace-1",
          graphSnapshotId: "graph-1",
          text: "Workflow Agent exploration completed\nTrace: trace-1\nGraph snapshot: graph-1",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: explorationPreview,
          bindings: bindings.list(),
          surface: createdSurface,
        }),
      });
      expect(explorationResult).toMatchObject({
        applyStatus: "applied",
        workflowActionResult: {
          action: "run_exploration",
          traceId: "trace-1",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(explorationResult)).toContain("Workflow action result: exploration; changed=yes; trace=trace-1; graph=graph-1");

      const compileDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-compile-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "compile from exploration",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const compilePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: compileDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(compilePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "compile_preview",
          workflowThreadId: "workflow-created",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(compilePreview)).toContain("Workflow action: compile preview");

      const reviewSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "AmbientDesktop",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "ready_for_review",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "ready_for_preview",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestVersion: {
                  id: "version-ready",
                  workflowThreadId: "workflow-created",
                  artifactId: "artifact-ready",
                  version: 1,
                  sourcePath: "/workspace/workflows/remote-status.js",
                  repoPath: "/workspace",
                  status: "ready_for_review",
                  createdBy: "compiler",
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                latestRun: {
                  id: "run-preview",
                  status: "previewed",
                  startedAt: "2026-05-10T00:00:02.000Z",
                  updatedAt: "2026-05-10T00:00:03.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:03.000Z",
              },
            ],
          },
        ],
      });
      expect(reviewSurface.workflowAgents[0]?.nextCommands).toEqual(
        expect.arrayContaining(["approve workflow preview", "reject workflow preview"]),
      );
      const approveDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: reviewSurface,
        event: {
          id: "event-approve-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "approve workflow preview",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const approvePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: approveDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: reviewSurface,
      });
      expect(approvePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          artifactId: "artifact-ready",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(approvePreview)).toContain("Workflow action: approve workflow preview");
      const approveResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: approvePreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          artifactId: "artifact-ready",
          artifactStatus: "approved",
          text: "Workflow preview approved",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(approveResult)).toContain("Workflow action result: artifact approved; changed=yes; artifact=artifact-ready; artifactStatus=approved");

      const runningSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "AmbientDesktop",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "running",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "running",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-running",
                  status: "running",
                  startedAt: "2026-05-10T00:00:06.000Z",
                  updatedAt: "2026-05-10T00:00:07.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:07.000Z",
              },
            ],
          },
        ],
      });
      expect(runningSurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["cancel workflow"]));
      const cancelDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: runningSurface,
        event: {
          id: "event-cancel-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "cancel workflow",
          receivedAt: "2026-05-10T00:00:08.000Z",
        },
      });
      const cancelPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: cancelDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: runningSurface,
      });
      expect(cancelPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "cancel_run",
          workflowThreadId: "workflow-created",
          runId: "run-running",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(cancelPreview)).toContain("Workflow action: cancel workflow");

      const recoverySurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "AmbientDesktop",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "failed",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "failed",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-failed",
                  status: "failed",
                  startedAt: "2026-05-10T00:00:09.000Z",
                  updatedAt: "2026-05-10T00:00:10.000Z",
                  completedAt: "2026-05-10T00:00:10.000Z",
                },
                graph: {
                  id: "graph-1",
                  workflowThreadId: "workflow-created",
                  version: 1,
                  source: "compile",
                  summary: "Classify records.",
                  nodes: [{ id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." }],
                  edges: [],
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:10.000Z",
              },
            ],
          },
        ],
        workflowRecoveryEvents: [
          {
            id: "event-failed",
            runId: "run-failed",
            type: "ambient.call.error",
            message: "schema mismatch",
            graphNodeId: "classify",
            graphNodeLabel: "Classify",
            graphNodeType: "model_call",
            createdAt: "2026-05-10T00:00:10.000Z",
            retryEligible: true,
            retryLabel: "Retry step",
            retryReasons: ["Retry is eligible when the same input is retained or can be reconstructed from checkpoints."],
            resumeEligible: false,
            resumeReasons: ["Resume from checkpoint requires at least one retained workflow checkpoint."],
            skipEligible: false,
            skipReasons: ["Skip item requires a failed event with a retained item key."],
            commandExamples: ["retry failed step"],
          },
        ],
      });
      expect(recoverySurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["retry failed step"]));
      expect(runtimeSurfaceSnapshotText(recoverySurface)).toContain("Recovery events:");
      const recoveryProjection = routeSyntheticMessagingEvent({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-workflow-status",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "status",
          receivedAt: "2026-05-10T00:00:11.000Z",
        },
      });
      expect(messagingProjectionText(recoveryProjection.projection)).toContain("retry failed step");
      const recoveryDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-retry-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "retry failed step",
          receivedAt: "2026-05-10T00:00:12.000Z",
        },
      });
      const recoveryPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: recoveryDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: recoverySurface,
      });
      expect(recoveryPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          runId: "run-failed",
          eventId: "event-failed",
          graphNodeId: "classify",
          recoveryAction: "retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(recoveryPreview)).toContain("Workflow action: retry failed step");
      const recoveryResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: recoveryPreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          runId: "run-recovered",
          runStatus: "succeeded",
          text: "Workflow recovery run completed\nRecovery action: retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(recoveryResult)).toContain("Workflow action result: recovery retry; changed=yes; run=run-recovered; runStatus=succeeded");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews project open and approval-gated project creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-project-command-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const workspace = {
      name: "AmbientDesktop",
      path: "/workspace/active",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };
    const projects = [
      {
        id: "active-project",
        path: "/workspace/active",
        name: "Active project",
        statePath: "/workspace/active/.ambient-codex",
        sessionPath: "/workspace/active/.ambient-codex/sessions",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      },
      {
        id: "research-project",
        path: "/workspace/research",
        name: "Research project",
        statePath: "/workspace/research/.ambient-codex",
        sessionPath: "/workspace/research/.ambient-codex/sessions",
        createdAt: "2026-05-09T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:02.000Z",
        pinned: true,
        threads: [],
      },
    ];
    const surface = buildRuntimeSurfaceSnapshot({
      workspace,
      threads: [],
      workflowFolders: [],
      projects,
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const openDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-open-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "open project 2",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const openPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: openDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(openPreview).toMatchObject({
        status: "ready",
        commandKind: "open_project",
        approvalRequired: false,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProject: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(openPreview)).toEqual({
        bindingId: openPreview.binding?.id,
        ambientSurface: "projects",
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:open_project",
      });
      const updatedBinding = bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(openPreview)!);
      const openProjection = messagingRemoteSurfaceCommandResultProjection({
        preview: openPreview,
        bindings: bindings.list(),
        surface,
      });
      const openResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: openPreview,
        approvalRecorded: false,
        updatedBinding,
        projection: openProjection,
      });
      expect(openResult).toMatchObject({
        applyStatus: "applied",
        projection: {
          title: "Research project",
          summary: "Registered project selected: Research project.",
        },
      });

      const switchDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-switch-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "switch project 2",
          receivedAt: "2026-05-10T00:00:03.000Z",
        },
      });
      const switchPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: switchDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(switchPreview).toMatchObject({
        status: "ready",
        commandKind: "switch_project",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProject: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(switchPreview)).toEqual({
        bindingId: switchPreview.binding?.id,
        ambientSurface: "projects",
        projectId: "/workspace/research",
        workflowId: null,
        chatThreadId: null,
        reason: "remote-surface-command:switch_project",
      });
      const switchUpdatedBinding = bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(switchPreview)!);
      const switchProjection = messagingRemoteSurfaceCommandResultProjection({
        preview: switchPreview,
        bindings: bindings.list(),
        surface,
      });
      const switchResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: switchPreview,
        approvalRecorded: true,
        updatedBinding: switchUpdatedBinding,
        scheduledProjectSwitch: switchPreview.targetProject,
        projection: switchProjection,
      });
      expect(switchResult).toMatchObject({
        applyStatus: "applied",
        approvalRecorded: true,
        scheduledProjectSwitch: { path: "/workspace/research", name: "Research project" },
      });
      expect(messagingRemoteSurfaceCommandResultText(switchResult)).toContain("Scheduled active project switch: Research project");

      const createDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-create-project",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "create project Field Notes at /workspace/field-notes",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const createPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: createDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });
      expect(createPreview).toMatchObject({
        status: "ready",
        commandKind: "create_project",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "projects",
        targetProjectCreate: {
          name: "Field Notes",
          workspacePath: "/workspace/field-notes",
        },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(createPreview)).toBeUndefined();
      expect(messagingRemoteSurfaceCommandProjectCreateRequest(createPreview)).toMatchObject({
        name: "Field Notes",
        workspacePath: "/workspace/field-notes",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(createPreview)).toContain("New project: name=Field Notes; path=/workspace/field-notes");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("previews approval-gated settings commands and returns settings projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-settings-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
      settings: {
        voice: {
          enabled: true,
          mode: "assistant-final",
          autoplay: true,
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          voiceId: "en_US-lessac-medium",
          maxChars: 1500,
          longReply: "summarize",
          format: "wav",
          artifactCacheMaxMb: 250,
        },
        search: {
          webSearch: {
            activity: "web_search",
            preferredProvider: "brave-search",
            mode: "prefer",
            fallback: "allow",
            updatedAt: "2026-05-10T00:00:01.000Z",
          },
        },
        stt: {
          enabled: true,
          providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
          spokenLanguage: "English",
          mode: "push-to-talk",
          autoSendAfterTranscription: true,
          silenceFinalizeSeconds: 0.8,
          noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
          bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
        },
        media: { generatedMediaAutoplay: false },
        planner: { autoFinalize: true },
      },
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-voice",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set voice mode off",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "voice",
          operation: "voice_policy",
          field: "mode",
          value: "off",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Setting update: voice.mode=off");

      const update = messagingRemoteSurfaceCommandBindingUpdate(preview);
      const updatedBinding = bindings.updateRemoteSurfaceScope(update!);
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        updatedSetting: {
          settingKey: "voice",
          operation: "voice_policy",
          changed: true,
          text: "Ambient voice policy updated",
        },
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        projection: {
          title: "Settings",
          summary: "Headless-readable settings summary.",
        },
      });
      expect(result.projection?.actions.map((action) => action.command)).toEqual(expect.arrayContaining([
        "set voice mode off",
        "set voice autoplay on",
        "set chat mode agent",
        "set chat thinking medium",
        "set planner autoFinalize off",
        "set speech language English",
        "set speech silence 0.8",
        "set generated media autoplay on",
        "clear search preference",
      ]));
      expect(result.projection?.actions.map((action) => action.command)).not.toContain("edit setting voice.output");
      expect(result.projection?.bodyLines.join("\n")).toContain("voice.output: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.mode: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.thinking: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("model-mode.planner: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("search.preference: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.provider: configured; status=partial");
      expect(result.projection?.bodyLines.join("\n")).toContain("speech.language: configured; status=ready");
      expect(result.projection?.bodyLines.join("\n")).toContain("media.generated: configured; status=ready");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Updated setting: voice; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("mode=assistant-final");
      expect(bindings.list().bindings[0]).toMatchObject({
        ambientSurface: "settings",
      });

      const speechDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-speech",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set speech language Spanish",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const speechPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: speechDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(speechPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "stt",
          operation: "stt_policy",
          field: "spokenLanguage",
          value: "Spanish",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(speechPreview)).toContain("Setting update: stt.spokenLanguage=Spanish");

      const speechResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: speechPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(speechPreview)!),
        updatedSetting: {
          settingKey: "stt",
          operation: "stt_policy",
          changed: true,
          text: "Ambient STT policy updated\nSpoken language: English -> Spanish",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: speechPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(speechResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "stt", operation: "stt_policy", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Updated setting: stt; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(speechResult)).toContain("Spoken language: English -> Spanish");

      const mediaDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-media",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set generated media autoplay on",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const mediaPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: mediaDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(mediaPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "media",
          operation: "media_playback",
          field: "generatedMediaAutoplay",
          value: true,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(mediaPreview)).toContain("Setting update: media.generatedMediaAutoplay=true");

      const mediaResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: mediaPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(mediaPreview)!),
        updatedSetting: {
          settingKey: "media",
          operation: "media_playback",
          changed: true,
          text: "Ambient generated media playback updated\nGenerated media autoplay: false -> true",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: mediaPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(mediaResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "media", operation: "media_playback", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Updated setting: media; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(mediaResult)).toContain("Generated media autoplay: false -> true");

      const plannerDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-planner",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set planner autoFinalize off",
          receivedAt: "2026-05-10T00:00:05.500Z",
        },
      });
      const plannerPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: plannerDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(plannerPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "settings",
        targetSettingUpdate: {
          settingKey: "planner",
          operation: "planner_finalization",
          field: "autoFinalize",
          value: false,
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(plannerPreview)).toContain("Setting update: planner.autoFinalize=false");

      const plannerResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: plannerPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(plannerPreview)!),
        updatedSetting: {
          settingKey: "planner",
          operation: "planner_finalization",
          changed: true,
          text: "Ambient Planner finalization updated\nAuto-finalize: true -> false",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: plannerPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(plannerResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "planner", operation: "planner_finalization", changed: true },
      });
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Updated setting: planner; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(plannerResult)).toContain("Auto-finalize: true -> false");

      const threadDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-set-thread",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "set chat thinking low",
          receivedAt: "2026-05-10T00:00:06.000Z",
        },
      });
      const threadPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: threadDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(threadPreview).toMatchObject({
        status: "ready",
        commandKind: "update_setting",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "chat",
        targetChat: { id: "thread-remote", title: "Remote thread settings target" },
        targetSettingUpdate: {
          settingKey: "thread",
          operation: "thread_settings",
          threadId: "thread-remote",
          field: "thinkingLevel",
          value: "low",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(threadPreview)).toContain("Setting update: thread.thinkingLevel=low (Remote thread settings target)");

      const threadResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: threadPreview,
        approvalRecorded: true,
        updatedBinding: bindings.updateRemoteSurfaceScope(messagingRemoteSurfaceCommandBindingUpdate(threadPreview)!),
        updatedSetting: {
          settingKey: "thread",
          operation: "thread_settings",
          changed: true,
          text: "Ambient chat thread settings updated\nThread: Remote thread settings target (thread-remote)\nThinking level: medium -> low",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: threadPreview,
          bindings: bindings.list(),
          surface,
        }),
      });
      expect(threadResult).toMatchObject({
        applyStatus: "applied",
        applied: true,
        updatedSetting: { settingKey: "thread", operation: "thread_settings", changed: true },
        projection: { title: "Remote thread settings target" },
      });
      expect(threadResult.updatedBinding).toMatchObject({
        ambientSurface: "chat",
        chatThreadId: "thread-remote",
      });
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Updated setting: thread; changed=yes");
      expect(messagingRemoteSurfaceCommandResultText(threadResult)).toContain("Thinking level: medium -> low");
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("projects and resolves pending permission approvals through Remote Ambient Surface commands", () => {
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
      ambientSurface: "notifications",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
      permissionRequests: [
        {
          id: "permission-telegram-reply",
          threadId: "thread-remote",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          title: "Send Telegram reply?",
          message: "Send one Telegram reply to owner-chat.",
          detail: "Reply text preview: Gateway status looks ready.",
          risk: "plugin-tool",
          reusableScopes: ["thread"],
          grantActionKind: "plugin_tool_execute",
          grantTargetKind: "tool",
          grantTargetLabel: "telegram reply",
          grantTargetHash: "reply-hash",
        },
      ],
    });
    const route = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-notifications",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "notifications",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    expect(route.projection).toMatchObject({
      title: "Notifications, approvals, and grants",
      summary: "Pending approvals: 1; active grants: 0; recent audit entries: 0; relay summaries: 0.",
      actions: expect.arrayContaining([
        expect.objectContaining({ command: "approve request 1" }),
        expect.objectContaining({ command: "deny request 1" }),
      ]),
    });
    expect(messagingProjectionText(route.projection)).toContain("Send Telegram reply?");

    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-approve-permission",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "approve request 1 always thread",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "ready",
      commandKind: "respond_approval",
      approvalRequired: false,
      wouldPersistBinding: false,
      targetSurface: "notifications",
      targetApproval: { id: "permission-telegram-reply" },
      targetApprovalResponse: {
        requestId: "permission-telegram-reply",
        response: "always_thread",
      },
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Approval response: always_thread");
    expect(messagingRemoteSurfaceCommandApprovalResponse(preview)).toEqual(expect.objectContaining({
      requestId: "permission-telegram-reply",
      response: "always_thread",
    }));

    const result = messagingRemoteSurfaceCommandAppliedResult({
      preview,
      approvalRecorded: false,
      respondedApproval: messagingRemoteSurfaceCommandApprovalResponse(preview),
      projection: messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      respondedApproval: {
        requestId: "permission-telegram-reply",
        response: "always_thread",
      },
    });
    expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Responded to approval: Send Telegram reply? (always_thread)");
  });

  it("projects and revokes active permission grants through Remote Ambient Surface commands", () => {
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
      ambientSurface: "notifications",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
      permissionGrants: [
        {
          id: "grant-remote-reply",
          createdAt: "2026-05-10T00:00:04.000Z",
          updatedAt: "2026-05-10T00:00:04.000Z",
          createdBy: "user",
          permissionModeAtCreation: "workspace",
          scopeKind: "thread",
          threadId: "thread-remote",
          actionKind: "plugin_tool_execute",
          targetKind: "tool",
          targetHash: "remote-reply-grant",
          targetLabel: "Remote reply grant",
          source: "permission_prompt",
          reason: "User approved remote replies for this thread.",
        },
      ],
      permissionAudit: [
        {
          id: "audit-remote-reply",
          threadId: "thread-remote",
          createdAt: "2026-05-10T00:00:05.000Z",
          permissionMode: "workspace",
          toolName: "ambient_messaging_telegram_bridge_reply_apply",
          risk: "plugin-tool",
          decision: "allowed",
          reason: "Matched persistent grant.",
          decisionSource: "persistent_grant",
          grantId: "grant-remote-reply",
        },
      ],
    });
    const route = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-notifications-grants",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "notifications",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    expect(route.projection).toMatchObject({
      title: "Notifications, approvals, and grants",
      summary: "Pending approvals: 0; active grants: 1; recent audit entries: 1; relay summaries: 0.",
      actions: expect.arrayContaining([
        expect.objectContaining({ command: "revoke grant 1" }),
      ]),
    });
    expect(messagingProjectionText(route.projection)).toContain("Remote reply grant");

    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-revoke-grant",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "revoke grant 1",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "ready",
      commandKind: "revoke_permission_grant",
      approvalRequired: false,
      wouldPersistBinding: false,
      targetSurface: "notifications",
      targetPermissionGrant: { id: "grant-remote-reply" },
      targetGrantRevoke: {
        grantId: "grant-remote-reply",
        targetLabel: "Remote reply grant",
      },
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Grant revoke: Remote reply grant");
    expect(messagingRemoteSurfaceCommandGrantRevokeRequest(preview)).toEqual(expect.objectContaining({
      grantId: "grant-remote-reply",
      targetLabel: "Remote reply grant",
    }));

    const result = messagingRemoteSurfaceCommandAppliedResult({
      preview,
      approvalRecorded: false,
      revokedPermissionGrant: messagingRemoteSurfaceCommandGrantRevokeRequest(preview),
      projection: messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface,
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      revokedPermissionGrant: {
        grantId: "grant-remote-reply",
      },
    });
    expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Revoked permission grant: Remote reply grant (grant-remote-reply)");
  });

  it("previews approval-gated workflow discovery answers from selected Remote Ambient Surface workflows", () => {
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
      ambientSurface: "workflow_agents",
      workflowId: "workflow-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [
        {
          id: "folder-1",
          name: "Workflows",
          kind: "custom",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          threads: [
            {
              id: "workflow-1",
              folderId: "folder-1",
              projectName: "AmbientDesktop",
              projectPath: "/workspace",
              title: "Placebo papers",
              phase: "discovery",
              initialRequest: "Find placebo papers",
              preview: "Find recent papers and summarize them.",
              status: "Discovery waiting for answer",
              traceMode: "production",
              discoveryQuestions: [
                {
                  id: "question-1",
                  workflowThreadId: "workflow-1",
                  category: "data_sources",
                  context: "Workflow needs an arxiv access path before compiling.",
                  question: "How should Ambient access arxiv?",
                  choices: [
                    { id: "browser", label: "Use browser", description: "Browse arxiv.org.", recommended: true },
                    { id: "plugin", label: "Use installed plugin", description: "Use pi-arxiv." },
                  ],
                  allowFreeform: true,
                  createdAt: "2026-05-10T00:00:00.000Z",
                },
              ],
              badges: [],
              createdAt: "2026-05-10T00:00:00.000Z",
              updatedAt: "2026-05-10T00:00:01.000Z",
            },
          ],
        },
      ],
    });

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-answer-workflow",
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "answer B",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "ready",
      commandKind: "answer_workflow_question",
      approvalRequired: true,
      wouldPersistBinding: false,
      targetQuestionId: "question-1",
      answerChoiceId: "plugin",
    });
    expect(messagingRemoteSurfaceCommandWorkflowAnswerInput(preview)).toEqual({
      questionId: "question-1",
      choiceId: "plugin",
    });
    expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("Approval required: yes");
    expect(messagingProjectionText(dispatch.projection)).toContain("B. Use installed plugin");
  });

  it("blocks Remote Ambient Surface commands for Messaging Connector projections", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "external-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
    });

    const dispatch = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-connector-command",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local-owner",
        conversationId: "external-chat",
        sender: { id: "external-1" },
        text: "switch surface workflow_agents",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const preview = buildMessagingRemoteSurfaceCommandPreview({
      toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      surface,
    });

    expect(preview).toMatchObject({
      status: "blocked",
      canApplyNow: false,
    });
    expect(preview.blockers.join("\n")).toContain("Messaging Connector projections");
  });

  it("does not project Remote Ambient Surface state for a non-owner sender", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "telegram-chat-1",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "secretProject",
        path: "/secret/workspace",
        statePath: "/secret/workspace/.ambient",
        sessionPath: "/secret/workspace/.ambient/sessions",
      },
      threads: [
        {
          id: "thread-secret",
          title: "Private chat",
          workspacePath: "/secret/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          lastMessagePreview: "Private detail",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-intruder",
        providerId: "telegram-tdlib",
        conversationId: "telegram-chat-1",
        sender: { id: "intruder-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const text = messagingProjectionText(result.projection);

    expect(result.projection).toMatchObject({
      kind: "sender_not_authorized",
      purpose: "remote_ambient_surface",
      bindingId: "remote-binding",
      disclosure: {
        includesRuntimeState: false,
        includesWorkspacePath: false,
        includesPrivateChatState: false,
      },
    });
    expect(text).not.toContain("secretProject");
    expect(text).not.toContain("thread-secret");
    expect(text).not.toContain("Private detail");
  });

  it("previews gateway lifecycle boundaries without starting real provider bridges", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    expect(runner.runtimeStatus()).toMatchObject({
      status: "idle",
      providerCount: 2,
      activeProviderCount: 0,
      queuedProjectionCount: 0,
    });
    expect(runner.runtimeStatus().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "telegram-tdlib",
        state: "stopped",
        mode: "none",
      }),
      expect.objectContaining({
        providerId: "signal-cli",
        state: "stopped",
        mode: "none",
      }),
    ]));

    const syntheticStart = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(syntheticStart).toMatchObject({
      approvalRequired: false,
      canApplyNow: true,
      wouldStartRealBridge: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(syntheticStart)).toContain("Mode: synthetic");

    const signalSyntheticStart = runner.previewLifecycle({
      action: "start",
      providerId: "signal-cli",
      mode: "synthetic",
    });
    expect(signalSyntheticStart).toMatchObject({
      approvalRequired: false,
      canApplyNow: false,
      wouldStartRealBridge: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(signalSyntheticStart)).toContain("Provider implementation status: planned");
    expect(messagingGatewayLifecyclePreviewText(signalSyntheticStart)).toContain("metadata-only");
    const signalApply = runner.applyLifecycle({
      action: "start",
      providerId: "signal-cli",
      mode: "synthetic",
    });
    await expect(signalApply).resolves.toMatchObject({
      applyStatus: "blocked",
      applied: false,
      blockedReason: "Messaging provider lifecycle is not implemented for signal-cli.",
    });

    const realStart = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(realStart).toMatchObject({
      approvalRequired: true,
      canApplyNow: false,
      wouldStartRealBridge: true,
      wouldLaunchBridgeProcess: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    expect(messagingGatewayLifecyclePreviewText(realStart)).toContain("Real provider bridge startup must be approval-gated");
  });

  it("refreshes gateway provider readiness for status and lifecycle previews", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "not-configured",
          configured: false,
          bridgeReachable: false,
          authNeeded: true,
          apiCredentialsPresent: false,
          persistedSessionCount: 0,
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Telegram bridge/session metadata is not configured for this workspace.",
          repairHint: "Create or bind a Telegram TDLib session before attempting real provider startup.",
          diagnostics: ["Readiness probe did not start TDLib."],
          sessions: [],
        }),
      },
    });

    const readiness = await runner.refreshProviderReadiness("telegram-tdlib");
    const status = runner.runtimeStatus();
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });

    expect(readiness).toHaveLength(1);
    expect(status.providers[0]).toMatchObject({
      providerId: "telegram-tdlib",
      readiness: {
        status: "not-configured",
        authNeeded: true,
      },
      lastActivityAt: "2026-05-10T00:00:04.000Z",
    });
    expect(preview.readiness).toMatchObject({
      status: "not-configured",
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Readiness: not-configured");
    expect(messagingGatewayLifecyclePreviewText(preview)).toContain("Readiness: not-configured");
    expect(messagingGatewayLifecyclePreviewText(preview)).toContain("Create or bind a Telegram auth profile/session");
  });

  it("applies synthetic gateway lifecycle without provider side effects", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const start = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(start).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: false,
      runtimeStatus: {
        status: "idle",
        activeProviderCount: 1,
        syntheticActiveProviderCount: 1,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "synthetic-active",
            mode: "synthetic",
          }),
        ]),
      },
    });

    const stop = await runner.applyLifecycle({
      action: "stop",
      providerId: "telegram-tdlib",
      mode: "synthetic",
    });
    expect(stop).toMatchObject({
      applyStatus: "applied",
      applied: true,
      runtimeStatus: {
        activeProviderCount: 0,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "stopped",
            mode: "none",
          }),
        ]),
      },
    });
  });

  it("blocks real gateway lifecycle until readiness and approval boundaries are satisfied", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "degraded",
          configured: true,
          bridgeReachable: false,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Metadata and credentials exist, but bridge root is not reachable.",
          diagnostics: ["No messages read."],
          sessions: [],
        }),
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const withoutApproval = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(withoutApproval).toMatchObject({
      applyStatus: "blocked",
      applied: false,
      approvalRecorded: false,
      blockedReason: "Real provider lifecycle changes require explicit user approval before apply.",
    });

    const withApproval = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(withApproval).toMatchObject({
      applyStatus: "blocked",
      applied: false,
      approvalRecorded: true,
      blockedReason: "No reachable Telegram bridge root was found, and no bridge process supervisor is registered.",
    });
  });

  it("launches a supervised bridge process before attaching real gateway lifecycle", async () => {
    let launched = false;
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date(launched ? "2026-05-10T00:00:05.000Z" : "2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: launched ? "available" : "degraded",
          configured: true,
          bridgeReachable: launched,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: launched ? "2026-05-10T00:00:05.000Z" : "2026-05-10T00:00:04.000Z",
          message: launched ? "Bridge root reachable." : "Bridge root not reachable yet.",
          diagnostics: ["Root health only."],
          sessions: [],
          bridgeSessionCount: launched ? 0 : undefined,
        }),
      },
      bridgeSupervisors: {
        "telegram-tdlib": {
          status: () => ({
            providerId: "telegram-tdlib",
            state: launched ? "running" : "stopped",
            managed: launched,
            command: "pnpm",
            args: ["--dir", "/path/to/user/ambientAgent", "telegram:bridge"],
            cwd: "/path/to/user/ambientAgent",
            bridgeBaseUrl: "http://127.0.0.1:8091",
            stateRoot: "/workspace/.ambient-agent-state/telegram",
            envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
            safeRootProbeOnly: true,
            recentLogs: [],
          }),
          start: async () => {
            launched = true;
            return {
              providerId: "telegram-tdlib",
              state: "running",
              managed: true,
              command: "pnpm",
              args: ["--dir", "/path/to/user/ambientAgent", "telegram:bridge"],
              cwd: "/path/to/user/ambientAgent",
              bridgeBaseUrl: "http://127.0.0.1:8091",
              stateRoot: "/workspace/.ambient-agent-state/telegram",
              envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
              safeRootProbeOnly: true,
              recentLogs: [],
            };
          },
          stop: async () => {
            launched = false;
            return {
              providerId: "telegram-tdlib",
              state: "stopped",
              managed: false,
              command: "pnpm",
              args: ["--dir", "/path/to/user/ambientAgent", "telegram:bridge"],
              cwd: "/path/to/user/ambientAgent",
              bridgeBaseUrl: "http://127.0.0.1:8091",
              stateRoot: "/workspace/.ambient-agent-state/telegram",
              envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
              safeRootProbeOnly: true,
              recentLogs: [],
            };
          },
        },
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(preview).toMatchObject({
      canApplyNow: true,
      wouldAttachExistingBridge: false,
      wouldLaunchBridgeProcess: true,
      wouldReadProviderMessages: false,
      bridgeSupervisor: {
        state: "stopped",
      },
    });

    const result = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      runtimeStatus: {
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
            readiness: expect.objectContaining({
              bridgeReachable: true,
            }),
          }),
        ]),
      },
    });
  });

  it("attaches real gateway lifecycle to an already reachable bridge root after approval", async () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
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
          checkedAt: "2026-05-10T00:00:04.000Z",
          message: "Telegram bridge root is reachable with a loaded bridge session.",
          diagnostics: ["Root health only; no messages read."],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });

    await runner.refreshProviderReadiness("telegram-tdlib");
    const preview = runner.previewLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
    });
    expect(preview).toMatchObject({
      canApplyNow: true,
      wouldAttachExistingBridge: true,
      wouldLaunchBridgeProcess: false,
    });

    const result = await runner.applyLifecycle({
      action: "start",
      providerId: "telegram-tdlib",
      mode: "real",
      approvalRecorded: true,
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      approvalRecorded: true,
      runtimeStatus: {
        activeProviderCount: 1,
        syntheticActiveProviderCount: 0,
        providers: expect.arrayContaining([
          expect.objectContaining({
            providerId: "telegram-tdlib",
            state: "running",
            mode: "real",
          }),
        ]),
      },
    });
  });

  it("queues synthetic gateway projections and reports liveness state", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
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
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      threads: [],
      workflowFolders: [],
    });

    const result = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-queue-1",
        providerId: "telegram-tdlib",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "projects",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const status = runner.runtimeStatus();

    expect(result.queuedProjection).toMatchObject({
      id: "projection-telegram-tdlib-event-queue-1",
      providerId: "telegram-tdlib",
      conversationId: "owner-chat",
      sourceEventId: "event-queue-1",
      bindingId: "remote-binding",
      purpose: "remote_ambient_surface",
    });
    expect(status).toMatchObject({
      status: "idle",
      activeProviderCount: 1,
      syntheticActiveProviderCount: 1,
      queuedProjectionCount: 1,
      recentEventCount: 1,
      providers: expect.arrayContaining([
        expect.objectContaining({
          providerId: "telegram-tdlib",
          state: "synthetic-active",
          mode: "synthetic",
          syntheticEventCount: 1,
          queuedProjectionCount: 1,
          lastActivityAt: "2026-05-10T00:00:03.000Z",
        }),
      ]),
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Queued projection previews");
    expect(messagingGatewayRuntimeStatusText(status)).toContain("registered project");
  });

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
        name: "AmbientDesktop",
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
        name: "AmbientDesktop",
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

    await withTelegramBridgeServer(async (req, res) => {
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
    }, async (baseUrl) => {
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
    });

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
      repairSteps: ["No repair needed; preview the selected runtime event with ambient_messaging_telegram_bridge_reply_preview using runtimeEventId."],
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
    expect(overriddenRuntimePreview.blockers).toContain("Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.");
    expect(overriddenRuntimePreview.repairSteps).toContain("Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.");

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
    expect(missingRuntimePreview.repairSteps).toContain("Call ambient_messaging_gateway_status again and use an exact current runtimeEventId from Recent Remote Ambient Surface runtime events.");

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
    expect(connectorRuntimePreview.blockers).toContain("Outbound replies are currently enabled only for Remote Ambient Surface projections.");
  });

  it("polls Telegram bridge unread messages through active owner bindings with sender checks and dedupe", async () => {
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
      maxDisclosureLabel: "owner-private-runtime-summary",
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
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-poll-"));
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
          message: "Ready for deterministic bridge poll test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    const requests: Array<{ path: string; apiId?: string; apiHash?: string }> = [];

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started.applied).toBe(true);

      await withTelegramBridgeServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        requests.push({
          path: `${url.pathname}${url.search}`,
          apiId: req.headers["x-telegram-api-id"] as string | undefined,
          apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
        });
        if (url.pathname === "/sessions/owner-profile/inbox/unread") {
          expect(url.searchParams.get("chatId")).toBe("owner-chat");
          expect(url.searchParams.get("limit")).toBe("5");
          writeJson(res, {
            messages: [
              {
                id: "099",
                chatId: "owner-chat",
                outgoing: false,
                text: "stale projects",
                date: "2026-05-10T00:00:01.000Z",
              },
              {
                id: "100",
                chatId: "owner-chat",
                outgoing: false,
                text: "projects",
                date: "2026-05-10T00:00:02.000Z",
              },
              {
                id: "101",
                chatId: "owner-chat",
                outgoing: false,
                text: "intruder",
                date: "2026-05-10T00:00:02.500Z",
              },
              {
                id: "102",
                chatId: "owner-chat",
                outgoing: true,
                text: "outbound echo",
                date: "2026-05-10T00:00:02.750Z",
              },
            ],
          });
          return;
        }
        if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile") {
          writeJson(res, {
            sender: {
              kind: "user",
              user: {
                userId: "owner-1",
                displayName: "Owner",
              },
            },
          });
          return;
        }
        if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile") {
          writeJson(res, {
            sender: {
              kind: "user",
              user: {
                userId: "intruder-1",
                displayName: "Intruder",
              },
            },
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      }, async (baseUrl) => {
        const toolInput = telegramBridgePollToolInput({
          profileId: "owner-profile",
          limit: 5,
          minReceivedAt: "2026-05-10T00:00:02.000Z",
        });
        const plan = buildTelegramBridgePollPlan({
          toolInput,
          bindings: bindings.list({ includeInactive: true }),
          runtimeStatus: runner.runtimeStatus(),
          stateRoot,
        });
        expect(plan).toMatchObject({
          status: "ready",
          canApplyNow: true,
          selectedBindings: [
            {
              bindingId: "remote-binding",
              authProfileId: "owner-profile",
              conversationId: "owner-chat",
              ownerUserId: "owner-1",
            },
          ],
        });
        expect(plan.warnings).toContain("Inactive/revoked Telegram bindings are ignored by polling.");
        expect(telegramBridgePollPlanText(plan)).toContain("Sends provider messages: no");

        const first = await applyTelegramBridgePoll({
          plan,
          bindings: bindings.list({ includeInactive: false }),
          stateRoot,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          },
          fetchFn: fetch,
          dispatch: (event) => runner.dispatchInbound({
            source: "telegram-bridge",
            event,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          }),
        });
        expect(first).toMatchObject({
          applyStatus: "applied",
          polled: true,
          fetchedMessageCount: 4,
          candidateMessageCount: 2,
          duplicateMessageCount: 0,
          staleMessageCount: 1,
          skippedMessageCount: 1,
          acceptedDispatchCount: 1,
          droppedDispatchCount: 1,
        });
        expect(first.bindingResults[0]?.dispatches.map((dispatch) => dispatch.accepted)).toEqual([true, false]);
        expect(telegramBridgePollResultText(first)).toContain("Accepted dispatches: 1");
        expect(telegramBridgePollResultText(first)).toContain("Stale messages before minReceivedAt: 1");
        expect(telegramBridgePollResultText(first)).toContain("Queued projection: projection-telegram-tdlib-telegram-owner-profile-owner-chat-100");
        expect(runner.runtimeStatus()).toMatchObject({
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
        });

        const state = JSON.parse(readFileSync(join(stateRoot, "messaging-gateway", "telegram-poll-state.json"), "utf8"));
        expect(state.bindings["remote-binding"].seenMessageIds).toEqual(["099", "100", "101", "102"]);

        const second = await applyTelegramBridgePoll({
          plan,
          bindings: bindings.list({ includeInactive: false }),
          stateRoot,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          },
          fetchFn: fetch,
          dispatch: (event) => runner.dispatchInbound({
            source: "telegram-bridge",
            event,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          }),
        });
        expect(second).toMatchObject({
          fetchedMessageCount: 4,
          candidateMessageCount: 0,
          duplicateMessageCount: 4,
          staleMessageCount: 0,
          skippedMessageCount: 0,
          acceptedDispatchCount: 0,
          droppedDispatchCount: 0,
        });
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => request.path)).toEqual([
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile",
      "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile",
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
  });

  it("runs the Telegram owner setup loop through directory, handoff, polling, command handling, reply, and cleanup", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-owner-loop-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:05.000Z"),
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
          message: "Ready for end-to-end owner loop dogfood.",
          diagnostics: ["Root probe only; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [{
            profileId: "owner-profile",
            metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          }],
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-1",
      threads: [{
        id: "thread-1",
        title: "Operational Status Check",
        workspacePath: "/workspace",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:02.000Z",
        lastMessagePreview: "Ready.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient:fast",
        thinkingLevel: "medium",
      }],
      workflowFolders: [],
    });
    const setupCode = "AMBIENT-HANDOFF-FULL-LOOP-123456";
    const requests: Array<{ method: string; path: string; body?: unknown; apiId?: string; apiHash?: string }> = [];
    let unreadCallCount = 0;

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started).toMatchObject({
        applyStatus: "applied",
        applied: true,
      });

      await withTelegramBridgeServer(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const record: { method: string; path: string; body?: unknown; apiId?: string; apiHash?: string } = {
          method: req.method ?? "GET",
          path: `${url.pathname}${url.search}`,
          apiId: req.headers["x-telegram-api-id"] as string | undefined,
          apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
        };
        if (req.method === "POST") record.body = await readJson(req);
        requests.push(record);

        if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats") {
          expect(url.searchParams.get("metadataOnly")).toBe("true");
          writeJson(res, {
            chats: [{
              id: "owner-chat",
              title: "Owner Remote Control",
              type: "private",
              unreadCount: 2,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:02.000Z",
            }],
          });
          return;
        }
        if (req.method === "GET" && url.pathname === "/sessions/owner-profile/inbox/unread") {
          expect(url.searchParams.get("chatId")).toBe("owner-chat");
          unreadCallCount += 1;
          writeJson(res, {
            messages: unreadCallCount === 1
              ? [
                {
                  id: "noise-before-handoff",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "private setup noise must not leak",
                  date: "2026-05-10T00:00:02.000Z",
                },
                {
                  id: "handoff-setup",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: setupCode,
                  date: "2026-05-10T00:00:03.000Z",
                },
              ]
              : [
                {
                  id: "handoff-setup",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: setupCode,
                  date: "2026-05-10T00:00:03.000Z",
                },
                {
                  id: "status-1",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "status",
                  date: "2026-05-10T00:00:04.000Z",
                },
              ],
          });
          return;
        }
        if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile") {
          writeJson(res, {
            sender: {
              kind: "user",
              user: {
                userId: "owner-1",
                displayName: "Owner",
              },
            },
          });
          return;
        }
        if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile") {
          writeJson(res, {
            sender: {
              kind: "user",
              user: {
                userId: "owner-1",
                displayName: "Owner",
              },
            },
          });
          return;
        }
        if (req.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
          writeJson(res, {
            messageId: "reply-1",
            date: "2026-05-10T00:00:06.000Z",
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      }, async (baseUrl) => {
        const env = {
          AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
          AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
          AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
        };

        const directoryPreview = buildTelegramConversationDirectoryPreview({
          toolInput: telegramConversationDirectoryInput({
            profileId: "owner-profile",
            limit: 5,
          }),
          runtimeStatus: runner.runtimeStatus(),
        });
        expect(directoryPreview.canApplyNow).toBe(true);
        const directoryResult = await applyTelegramConversationDirectory({
          preview: directoryPreview,
          approvalRecorded: true,
          env,
          fetchFn: fetch,
        });
        expect(directoryResult).toMatchObject({
          applyStatus: "applied",
          failureMode: "none",
          conversations: [{ conversationId: "owner-chat", title: "Owner Remote Control" }],
        });
        expect(telegramConversationDirectoryResultText(directoryResult)).toContain("owner-chat: Owner Remote Control");

        const handoffPreview = buildTelegramOwnerHandoffPreview({
          toolInput: telegramOwnerHandoffInput({
            profileId: "owner-profile",
            conversationId: "owner-chat",
            setupCode,
            limit: 5,
          }),
          runtimeStatus: runner.runtimeStatus(),
        });
        expect(handoffPreview.canApplyNow).toBe(true);
        const handoffResult = await applyTelegramOwnerHandoff({
          preview: handoffPreview,
          setupCode,
          approvalRecorded: true,
          env,
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:04.000Z"),
        });
        expect(handoffResult).toMatchObject({
          applyStatus: "applied",
          handoffStatus: "matched",
          ownerUserId: "owner-1",
          sourceMessageId: "handoff-setup",
        });
        expect(JSON.stringify(handoffResult)).not.toContain("private setup noise");

        const createToolInput = telegramRemoteSurfaceBindingInput({
          action: "create",
          purpose: "remote_ambient_surface",
          profileId: "owner-profile",
          conversationId: "owner-chat",
          ownerUserId: handoffResult.ownerUserId,
          ambientSurface: "projects",
          maxDisclosureLabel: "owner-private-runtime-summary",
          ownerHandoffSourceMessageId: handoffResult.sourceMessageId,
        });
        if (createToolInput.action !== "create") throw new Error("Expected create input.");
        const runtimeProvider = runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib");
        const createPlan = buildTelegramRemoteSurfaceBindingPlan({
          toolInput: createToolInput,
          lifecycle: bindings.previewCreate(telegramRemoteSurfaceBindingCreateInput(createToolInput)),
          readiness: runtimeProvider?.readiness,
          runtimeProvider,
        });
        expect(createPlan.canApplyNow).toBe(true);
        const created = bindings.create(telegramRemoteSurfaceBindingCreateInput(createToolInput));
        const createResult = telegramRemoteSurfaceBindingAppliedResult(createPlan, created);
        expect(createResult).toMatchObject({
          applyStatus: "applied",
          persisted: true,
          lifecycle: {
            binding: {
              metadata: {
                ownerHandoffSourceMessageId: "handoff-setup",
              },
            },
          },
        });
        expect(telegramRemoteSurfaceBindingText(createResult)).toContain("Telegram Remote Ambient Surface binding applied");

        const pollPlan = buildTelegramBridgePollPlan({
          toolInput: telegramBridgePollToolInput({
            profileId: "owner-profile",
            limit: 5,
          }),
          bindings: bindings.list({ includeInactive: true }),
          runtimeStatus: runner.runtimeStatus(),
          stateRoot,
        });
        expect(pollPlan.canApplyNow).toBe(true);
        const pollResult = await applyTelegramBridgePoll({
          plan: pollPlan,
          bindings: bindings.list({ includeInactive: false }),
          surface,
          stateRoot,
          env,
          fetchFn: fetch,
          dispatch: (event) => runner.dispatchInbound({
            source: "telegram-bridge",
            event,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          }),
        });
        expect(pollResult).toMatchObject({
          applyStatus: "applied",
          fetchedMessageCount: 2,
          duplicateMessageCount: 1,
          candidateMessageCount: 1,
          acceptedDispatchCount: 1,
          droppedDispatchCount: 0,
        });
        expect(telegramBridgePollResultText(pollResult)).toContain("Accepted dispatches: 1");
        const acceptedDispatch = pollResult.bindingResults[0]?.dispatches.find((dispatch) => dispatch.accepted);
        const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
        expect(queuedProjectionId).toBeTruthy();
        expect(telegramBridgePollResultText(pollResult)).toContain(`Queued projection: ${queuedProjectionId}`);

        const commandPreview = buildMessagingRemoteSurfaceCommandPreview({
          toolInput: messagingRemoteSurfaceCommandInput({ queuedProjectionId }),
          bindings: bindings.list({ includeInactive: false }),
          runtimeStatus: runner.runtimeStatus(),
          surface,
        });
        expect(commandPreview).toMatchObject({
          status: "ready",
          commandKind: "show_status",
          approvalRequired: false,
          wouldReadProviderMessages: false,
          wouldSendProviderMessages: false,
        });
        const commandProjection = messagingRemoteSurfaceCommandResultProjection({
          preview: commandPreview,
          bindings: bindings.list({ includeInactive: false }),
          surface,
        });
        expect(commandProjection).toBeTruthy();
        const commandResult = messagingRemoteSurfaceCommandAppliedResult({
          preview: commandPreview,
          approvalRecorded: false,
          projection: commandProjection,
        });
        expect(commandResult).toMatchObject({
          applyStatus: "noop",
          commandKind: "show_status",
          projection: { purpose: "remote_ambient_surface" },
        });
        expect(messagingRemoteSurfaceCommandResultText(commandResult)).toContain("Projection:");

        const replyText = `Ambient status ready: ${commandResult.projection?.title ?? "runtime status"}.`;
        const replyPreview = buildTelegramBridgeReplyPreview({
          toolInput: telegramBridgeReplyInput({
            queuedProjectionId,
            text: replyText,
          }),
          bindings: bindings.list({ includeInactive: false }),
          runtimeStatus: runner.runtimeStatus(),
        });
        expect(replyPreview).toMatchObject({
          status: "ready",
          endpointPath: "/sessions/owner-profile/messages/send",
          replyToMessageId: "status-1",
        });
        const replyResult = await applyTelegramBridgeReply({
          preview: replyPreview,
          approvalRecorded: true,
          env,
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:06.000Z"),
        });
        runner.recordOutboundDelivery(replyResult.delivery);
        expect(replyResult).toMatchObject({
          applyStatus: "sent",
          providerMessageId: "reply-1",
          delivery: {
            status: "sent",
            sourceProjectionId: queuedProjectionId,
            replyToMessageId: "status-1",
          },
        });
        expect(telegramBridgeReplyResultText(replyResult)).toContain("Delivery status: sent");

        const revokeToolInput = telegramRemoteSurfaceBindingInput({
          action: "revoke",
          bindingId: created.binding.id,
          reason: "owner loop dogfood cleanup",
        });
        if (revokeToolInput.action !== "revoke") throw new Error("Expected revoke input.");
        const revokePlan = buildTelegramRemoteSurfaceBindingPlan({
          toolInput: revokeToolInput,
          lifecycle: bindings.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput)),
          readiness: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib")?.readiness,
          runtimeProvider: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib"),
        });
        expect(revokePlan.canApplyNow).toBe(true);
        const revoked = bindings.revoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput));
        const revokeResult = telegramRemoteSurfaceBindingAppliedResult(revokePlan, revoked);
        expect(revokeResult).toMatchObject({
          applyStatus: "applied",
          persisted: true,
          lifecycle: { binding: { status: "revoked" } },
        });
        expect(bindings.list({ includeInactive: false })).toMatchObject({
          activeBindingCount: 0,
          remoteAmbientSurfaceCount: 0,
        });
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /sessions/owner-profile/chats?limit=5&metadataOnly=true",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile",
      "POST /sessions/owner-profile/messages/send",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
    const sent = requests.find((request) => request.method === "POST");
    expect(sent?.body).toEqual({
      chatId: "owner-chat",
      text: "Ambient status ready: Projects.",
      replyToMessageId: "status-1",
    });
    expect(runner.runtimeStatus()).toMatchObject({
      outboundDeliveryCount: 1,
      recentOutboundDeliveries: [{ providerMessageId: "reply-1" }],
    });
  });

  it("blocks Telegram bridge polling until the provider is running in real mode", () => {
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
    });

    const plan = buildTelegramBridgePollPlan({
      toolInput: telegramBridgePollToolInput({ profileId: "owner-profile" }),
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      stateRoot: "/workspace/.ambient",
    });
    expect(plan).toMatchObject({
      status: "blocked",
      canApplyNow: false,
      safety: {
        readsProviderUnreadMessages: false,
        sendsProviderMessages: false,
      },
    });
    expect(plan.blockers).toContain("Telegram provider is not running in real mode.");
    expect(telegramBridgePollPlanText(plan)).toContain("Can apply now: no");
  });

  it("runs approval-gated periodic Telegram polling with status counters and stop controls", async () => {
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
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-polling-runner-"));
    let nowMs = Date.parse("2026-05-10T00:00:03.000Z");
    let scheduledIntervalMs = 0;
    let clearedTimerCount = 0;
    const pollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date(nowMs),
      schedulePoll: (_callback, intervalMs) => {
        scheduledIntervalMs = intervalMs;
        return { unref: () => undefined } as any;
      },
      clearPoll: () => {
        clearedTimerCount += 1;
      },
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date(nowMs),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: new Date(nowMs).toISOString(),
          message: "Ready for deterministic periodic polling test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "AmbientDesktop",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    let unreadCallCount = 0;

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      await withTelegramBridgeServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/sessions/owner-profile/inbox/unread") {
          unreadCallCount += 1;
          writeJson(res, {
            messages: [
              {
                id: `stale-${unreadCallCount}`,
                chatId: "owner-chat",
                outgoing: false,
                text: "old backlog",
                date: "2026-05-10T00:00:01.000Z",
              },
              {
                id: String(199 + unreadCallCount),
                chatId: "owner-chat",
                outgoing: false,
                text: unreadCallCount === 1 ? "projects" : "status",
                date: new Date(nowMs).toISOString(),
              },
            ],
          });
          return;
        }
        if (url.pathname.startsWith("/sessions/owner-profile/chats/owner-chat/messages/") && url.pathname.endsWith("/sender-profile")) {
          writeJson(res, {
            sender: {
              kind: "user",
              user: {
                userId: "owner-1",
                displayName: "Owner",
              },
            },
          });
          return;
        }
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      }, async (baseUrl) => {
        const input = telegramBridgePollingControlInput({
          action: "start",
          profileId: "owner-profile",
          limit: 5,
          minReceivedAt: "2026-05-10T00:00:02.000Z",
          intervalMs: 5000,
        });
        const buildPlan = () => buildTelegramBridgePollPlan({
          toolInput: input,
          bindings: bindings.list({ includeInactive: true }),
          runtimeStatus: gatewayRunner.runtimeStatus(),
          stateRoot,
        });
        const pollOnce = () => applyTelegramBridgePoll({
          plan: buildPlan(),
          bindings: bindings.list({ includeInactive: false }),
          stateRoot,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
          },
          fetchFn: fetch,
          dispatch: (event) => gatewayRunner.dispatchInbound({
            source: "telegram-bridge",
            event,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          }),
        });

        const startPreview = pollingRunner.preview(input, buildPlan());
        expect(startPreview).toMatchObject({
          action: "start",
          status: "ready",
          canApplyNow: true,
          approvalRequired: true,
          minReceivedAt: "2026-05-10T00:00:02.000Z",
          safety: {
            startsTimer: true,
            sendsProviderMessages: false,
          },
        });
        expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Starts timer: yes");
        expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Freshness minReceivedAt: 2026-05-10T00:00:02.000Z");

        const startResult = await pollingRunner.apply({
          preview: startPreview,
          approvalRecorded: true,
          pollOnce,
        });
        expect(startResult).toMatchObject({
          applyStatus: "applied",
          approvalRecorded: true,
          immediatePollResult: {
            acceptedDispatchCount: 1,
            staleMessageCount: 1,
          },
          runtimeStatus: {
            state: "running",
            running: true,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
            totalPollCount: 1,
            successfulPollCount: 1,
            acceptedDispatchCount: 1,
            staleMessageCount: 1,
            lastSuccessfulPollAt: "2026-05-10T00:00:03.000Z",
          },
        });
        expect(scheduledIntervalMs).toBe(5000);
        expect(telegramBridgePollingControlResultText(startResult)).toContain("Immediate poll:");

        nowMs = Date.parse("2026-05-10T00:00:08.000Z");
        const scheduled = await pollingRunner.runScheduledPoll();
        expect(scheduled).toMatchObject({
          applyStatus: "applied",
          acceptedDispatchCount: 1,
          staleMessageCount: 1,
        });
        expect(pollingRunner.status()).toMatchObject({
          state: "running",
          totalPollCount: 2,
          successfulPollCount: 2,
          acceptedDispatchCount: 2,
          staleMessageCount: 2,
          lastSuccessfulPollAt: "2026-05-10T00:00:08.000Z",
          nextPollDueAt: "2026-05-10T00:00:13.000Z",
        });
        expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Last successful poll: 2026-05-10T00:00:08.000Z");
        expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Stale messages before minReceivedAt: 2");

        const stopInput = telegramBridgePollingControlInput({ action: "stop" });
        const stopPreview = pollingRunner.preview(stopInput, buildPlan());
        expect(stopPreview).toMatchObject({
          action: "stop",
          status: "ready",
          approvalRequired: false,
          safety: {
            stopsTimer: true,
            readsProviderUnreadMessages: false,
          },
        });
        const stopResult = await pollingRunner.apply({
          preview: stopPreview,
          approvalRecorded: false,
          pollOnce,
        });
        expect(stopResult).toMatchObject({
          applyStatus: "applied",
          runtimeStatus: {
            state: "stopped",
            running: false,
            stoppedAt: "2026-05-10T00:00:08.000Z",
          },
        });
        expect(clearedTimerCount).toBe(1);
      });
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("keeps gateway queues purpose-isolated across simultaneous bindings", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-owner",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "chat",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-external",
      conversationId: "external-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "secretProject",
        path: "/secret/workspace",
        statePath: "/secret/workspace/.ambient",
        sessionPath: "/secret/workspace/.ambient/sessions",
      },
      threads: [
        {
          id: "thread-secret",
          title: "Private chat",
          workspacePath: "/secret/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          lastMessagePreview: "Private detail",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const connector = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "external-event",
        providerId: "telegram-tdlib",
        conversationId: "external-chat",
        sender: { id: "external-user", trustClass: "external" },
        text: "What are you working on?",
        receivedAt: "2026-05-10T00:00:01.000Z",
      },
    });
    const remote = runner.dispatchSynthetic({
      bindings: bindings.list(),
      surface,
      event: {
        id: "owner-event",
        providerId: "telegram-tdlib",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "chats",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const connectorText = messagingProjectionText(connector.projection);

    expect(connector.queuedProjection.purpose).toBe("messaging_connector");
    expect(connector.projection.disclosure).toMatchObject({
      includesRuntimeState: false,
      includesWorkspacePath: false,
      includesPrivateChatState: false,
    });
    expect(connectorText).not.toContain("secretProject");
    expect(connectorText).not.toContain("thread-secret");
    expect(connectorText).not.toContain("Private detail");
    expect(remote.queuedProjection.purpose).toBe("remote_ambient_surface");
    expect(remote.projection.disclosure.includesRuntimeState).toBe(true);
    expect(runner.runtimeStatus().queuedProjections.map((projection) => projection.purpose)).toEqual([
      "messaging_connector",
      "remote_ambient_surface",
    ]);
  });

  it("records structured gateway error state for unknown providers", () => {
    const runner = new MessagingGatewayRunner({
      providers: createDefaultMessagingProviderRegistry(),
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    expect(() => runner.dispatchSynthetic({
      bindings: { bindings: [], bindingCount: 0, activeBindingCount: 0, remoteAmbientSurfaceCount: 0, messagingConnectorCount: 0, headlessSafeBindingCount: 0 },
      event: {
        id: "unknown-event",
        providerId: "unknown-provider",
        conversationId: "owner-chat",
        sender: { id: "owner-1" },
        text: "status",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    })).toThrow(/Ambient messaging provider not found: unknown-provider/);

    const status = runner.runtimeStatus();
    expect(status).toMatchObject({
      status: "error",
      lastError: "Ambient messaging provider not found: unknown-provider",
      providers: expect.arrayContaining([
        expect.objectContaining({
          providerId: "unknown-provider",
          state: "error",
          lastError: "Ambient messaging provider not found: unknown-provider",
        }),
      ]),
    });
    expect(messagingGatewayRuntimeStatusText(status)).toContain("Last error: Ambient messaging provider not found: unknown-provider");
  });

  it("keeps Messaging Connector synthetic routes firewalled from runtime state", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "connector-binding",
      providerId: "telegram-tdlib",
      authProfileId: "telegram-local-external",
      conversationId: "external-chat",
      purpose: "messaging_connector",
      status: "active",
      externalTrustClass: "external",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "secretProject",
        path: "/secret/workspace",
        statePath: "/secret/workspace/.ambient",
        sessionPath: "/secret/workspace/.ambient/sessions",
      },
      threads: [
        {
          id: "thread-secret",
          title: "Private chat",
          workspacePath: "/secret/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          lastMessagePreview: "Private detail",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    const result = routeSyntheticMessagingEvent({
      bindings: bindings.list(),
      surface,
      event: {
        id: "event-2",
        providerId: "telegram-tdlib",
        conversationId: "external-chat",
        sender: { id: "external-user", trustClass: "external" },
        text: "What are you working on?",
        receivedAt: "2026-05-10T00:00:02.000Z",
      },
    });
    const text = messagingProjectionText(result.projection);
    const prompt = result.promptContext.systemPromptLines.join("\n");

    expect(result.projection).toMatchObject({
      kind: "connector_guardrail",
      purpose: "messaging_connector",
      disclosure: {
        includesRuntimeState: false,
        includesWorkspacePath: false,
        includesPrivateChatState: false,
      },
    });
    expect(text).not.toContain("secretProject");
    expect(text).not.toContain("/secret/workspace");
    expect(text).not.toContain("thread-secret");
    expect(text).not.toContain("Private detail");
    expect(prompt).toContain("firewalled from private Ambient runtime state");
  });

  it("builds purpose prompt context and compact tool-status projections without raw internals", () => {
    const connector = buildMessagingPurposePromptContext({
      purpose: "messaging_connector",
      explicitAttachments: ["One approved support-ticket summary"],
    });
    expect(connector.allowedContext.join("\n")).toContain("One approved support-ticket summary");
    expect(connector.forbiddenContext.join("\n")).toContain("Do not inspect or reveal Ambient projects");

    const projection = projectToolStatusCard({
      toolName: "ambient_cli",
      label: "YouTube transcript",
      status: "done",
      summary: "Transcript artifact saved.",
      preview: "First 200 characters only.",
      artifactPath: "youtube-transcript.txt",
    });
    expect(projection).toMatchObject({
      kind: "tool_status",
      disclosure: {
        includesRuntimeState: false,
        includesPrivateChatState: false,
      },
    });
    expect(messagingProjectionText(projection)).toContain("Raw tool internals are intentionally omitted");
  });
});

function telegramDirectoryRuntimeStatus(): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 1,
    activeProviderCount: 1,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
    providers: [{
      providerId: "telegram-tdlib",
      label: "Telegram",
      state: "running",
      mode: "real",
      syntheticEventCount: 0,
      realEventCount: 0,
      queuedProjectionCount: 0,
      readiness: {
        providerId: "telegram-tdlib",
        status: "available",
        configured: true,
        bridgeReachable: true,
        authNeeded: false,
        apiCredentialsPresent: true,
        persistedSessionCount: 1,
        checkedAt: "2026-05-10T00:00:01.000Z",
        message: "Telegram readiness test fixture.",
        diagnostics: ["Root probe only; no provider messages read."],
        sessions: [{
          profileId: "owner-profile",
          metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
          metadataReadable: true,
          tdlibStateDirPresent: true,
          phoneNumberPresent: true,
          databaseEncryptionKeyPresent: true,
        }],
        bridgeBaseUrl: "http://127.0.0.1:8091",
      },
    }],
  };
}

function signalReadyRuntimeStatus(): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 1,
    activeProviderCount: 0,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    providers: [{
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
        sessions: [{
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
        }],
      },
    }],
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
  };
}

function signalUnreadBindingList(input: {
  metadata?: Record<string, unknown>;
} = {}): MessagingBindingListResult {
  return {
    bindings: [{
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
    }],
    bindingCount: 1,
    activeBindingCount: 1,
    remoteAmbientSurfaceCount: 1,
    messagingConnectorCount: 0,
    headlessSafeBindingCount: 0,
  };
}

async function withTelegramBridgeServer<T = void>(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      writeJson(res, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Telegram bridge test server did not bind to a TCP port.");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.statusCode = res.statusCode || 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as unknown : undefined;
}
