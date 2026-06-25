import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import { firstPartyDesktopToolDescriptors, messagingGatewayToolDescriptor } from "./messagingDesktopToolsTestFacade";
import { bindingLifecyclePreviewText, createEmptyMessagingBindingRegistry, createMessagingBindingStore } from "./messagingBindings";
import { buildHeadlessRuntimeUxInventory, headlessRuntimeUxInventoryText } from "../../shared/headlessRuntimeInventory";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import {
  buildMessagingPurposePromptContext,
  messagingProjectionText,
  projectToolStatusCard,
  routeSyntheticMessagingEvent,
} from "./messagingGatewayProjection";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
} from "./messagingTelegramFacade";
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
} from "./messagingTelegramFacade";
import {
  applyTelegramOwnerHandoff,
  buildTelegramOwnerHandoffPreview,
  telegramOwnerHandoffInput,
  telegramOwnerHandoffPreviewText,
  telegramOwnerHandoffResultText,
} from "./messagingTelegramFacade";
import {
  buildTelegramOwnerLoopActivationPlan,
  telegramOwnerLoopActivationCard,
  telegramOwnerLoopActivationInput,
  telegramOwnerLoopActivationPlanText,
} from "./messagingTelegramFacade";
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
  createDefaultMessagingProviderRegistry,
  MessagingProviderRegistry,
  messagingProviderListText,
  messagingProviderStatusText,
  telegramMessagingProviderDescriptor,
} from "./messagingGatewayRegistry";
import { TelegramBridgePollingRunner } from "./messagingTelegramFacade";
import { createPlannedMessagingReadinessAdapter, readinessProbesFromAdapters } from "./messagingProviderReadiness";
import { withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";

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
        providers: [
          {
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
          },
          {
            providerId: "signal-cli",
            label: "Signal",
            state: "stopped",
            mode: "none",
            syntheticEventCount: 0,
            realEventCount: 0,
            queuedProjectionCount: 0,
          },
        ],
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
    expect(() =>
      duplicateRegistry.register({
        providerId: "provider",
        plan: () => signal,
      }),
    ).toThrow("Messaging conversation-directory adapter already registered: provider");
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
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "call that activation plan next before low-level lifecycle",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").description).toContain(
      "Telegram, Signal, or another provider",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "including requests that explicitly say Telegram, Signal",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_activation_plan").promptGuidelines.join("\n")).toContain(
      "unsupported_provider repair/status prompts",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-remote-surface-provider-support-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain(
      "unsupported_provider",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").promptGuidelines.join("\n")).toContain(
      "Signal Desktop being installed is not a Remote Ambient Surface activation route",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_remote_surface_provider_support_plan").description).toContain(
      "adapter requirements",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-owner-loop-activation-plan",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain(
      "provider readiness, metadata-only directory, exact setup-code owner handoff",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_owner_loop_activation_plan").promptGuidelines.join("\n")).toContain(
      "call ambient_messaging_remote_surface_activation_plan first",
    );
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
    const telegramApplySchema = messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply").inputSchema as {
      properties: Record<string, unknown>;
    };
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
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain(
      "Use one-shot polling",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply").promptGuidelines.join("\n")).toContain(
      "prefer the periodic polling preview/apply tools",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-status",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview")).toMatchObject({
      sideEffects: "none",
      permissionScope: "messaging-telegram-bridge-polling-preview",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain(
      "Use periodic polling when the owner wants an ongoing Remote Ambient Surface loop",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_preview").promptGuidelines.join("\n")).toContain(
      "pass minReceivedAt set to the activation/command boundary",
    );
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "messaging-telegram-bridge-polling-apply",
    });
    expect(messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_polling_apply").promptGuidelines.join("\n")).toContain(
      "Use periodic polling only for an ongoing owner Remote Ambient Surface loop",
    );
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
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
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
          allowedFirstTools: expect.arrayContaining([
            "ambient_messaging_remote_surface_activation_plan",
            "ambient_messaging_telegram_owner_loop_activation_plan",
          ]),
        },
      });
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcutNeedsProvider)).toContain(
        "Choose a reviewed Remote Ambient Surface provider",
      );

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
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain(
        "Activation plan first tool: ambient_messaging_telegram_owner_loop_activation_plan",
      );
      expect(messagingRemoteSurfaceActivationPlanText(remoteShortcut)).toContain(
        "Blocked until activation plan: ambient_messaging_gateway_lifecycle_preview",
      );
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
      expect(remoteShortcutCard.phaseChips.map((phase) => phase.id)).toEqual(
        expect.arrayContaining([
          "product-provider-route",
          "metadata-directory",
          "owner-handoff",
          "owner-binding",
          "periodic-polling",
          "command-and-relay-preview",
        ]),
      );
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
      expect(messagingRemoteSurfaceActivationPlanText(unsupportedRemoteShortcutFromRequest)).toContain(
        "No reviewed Remote Ambient Surface activation shortcut exists for Signal",
      );
      expect(messagingRemoteSurfaceActivationCard(unsupportedRemoteShortcutFromRequest)).toMatchObject({
        status: "unsupported_provider",
        requestedProvider: "Signal",
        repairPrompts: expect.arrayContaining([expect.stringContaining("falling back to external Messaging Connector tools")]),
      });

      const signalProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(
        messagingRemoteSurfaceProviderSupportPlanInput({
          provider: "Signal",
          ambientSurface: "projects",
          blockerContext: "No reviewed Remote Ambient Surface activation shortcut exists for Signal.",
        }),
      );
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
      expect(signalProviderSupportPlan.adapterRequirements.join("\n")).toContain(
        "Signal Desktop being installed is not an activation route",
      );
      expect(signalProviderSupportPlan.ownerAuthConstraints.join("\n")).toContain("owner-authenticated chat-to-self control");
      expect(signalProviderSupportPlan.headlessSupportRequirements.join("\n")).toContain("headless Ambient process");
      expect(signalProviderSupportPlan.approvalGates.join("\n")).toContain("Dependency installation");
      expect(signalProviderSupportPlan.validationTargets.join("\n")).toContain("does not start bridges");
      expect(signalProviderSupportPlan.blockedActions.join("\n")).toContain("Generic Messaging Connector setup");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain(
        "Remote Ambient Surface provider support plan",
      );
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Status: planning_ready");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Installs dependencies: no");
      expect(messagingRemoteSurfaceProviderSupportPlanText(signalProviderSupportPlan)).toContain("Scaffolds provider support: no");

      const telegramProviderSupportPlan = buildMessagingRemoteSurfaceProviderSupportPlan(
        messagingRemoteSurfaceProviderSupportPlanInput({
          requestText: "plan Telegram provider support",
        }),
      );
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
      expect(telegramOwnerLoopActivationPlanText(setupPlan)).toContain(
        "ambient_messaging_telegram_owner_handoff_preview -> ambient_messaging_telegram_owner_handoff_apply",
      );
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
      expect(telegramOwnerLoopActivationPlanText(pollingPlan)).toContain(
        "ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply",
      );
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
    expect(messagingRemoteSurfaceBindingPreviewText(bindingPreview)).toContain(
      "Typed apply tool: ambient_messaging_signal_remote_surface_apply",
    );

    const eventPreview = buildMessagingRemoteSurfaceEventPreview({
      toolInput: messagingRemoteSurfaceEventPreviewInput(
        {
          providerId: "signal-cli",
          authProfileId: "owner",
          conversationId: "signal-owner-chat",
          senderId: "owner-signal",
          text: "status",
        },
        () => new Date("2026-05-10T00:00:00.000Z"),
      ),
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
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
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
      providers: [
        {
          providerId: "telegram-tdlib",
          status: "limited",
          mode: "existing-bindings-only",
          conversationDiscoveryDeclared: true,
          canListProviderConversationsNow: false,
          providerDirectoryTool: "ambient_messaging_telegram_conversation_directory_preview",
          knownAuthProfiles: [
            {
              profileId: "owner-profile",
              metadataReadable: true,
            },
          ],
          knownConversations: [
            {
              conversationId: "owner-chat",
              bindingId: "binding-owner-chat",
              purpose: "remote_ambient_surface",
            },
          ],
        },
      ],
    });
    expect(preview.providers[0].blockers.join("\n")).toContain("requires the Telegram provider to be running in real mode");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain(
      "Provider directory tool: ambient_messaging_telegram_conversation_directory_preview",
    );
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
            chats: [
              {
                id: "telegram-chat-1",
                title: "Ops",
                type: "private",
                unreadCount: 2,
                folderIds: [1],
                updatedAt: "2026-05-10T00:00:00.000Z",
              },
            ],
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
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          type: "private",
          unreadCount: 2,
          folderIds: [1],
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
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
          chats: [
            {
              id: "telegram-chat-1",
              title: "Ops",
              lastMessage: { text: "must not be visible" },
            },
          ],
        }),
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      failureMode: "none",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          folderIds: [],
        },
      ],
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
        providers: [
          {
            ...telegramDirectoryRuntimeStatus().providers[0],
            state: "stopped",
            mode: "none",
          },
        ],
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
    const result = await withTelegramBridgeServer(
      (req, res) => {
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
      },
      async (baseUrl) =>
        await applyTelegramOwnerHandoff({
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
        }),
    );

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
        providers: [
          {
            ...telegramDirectoryRuntimeStatus().providers[0],
            state: "stopped",
            mode: "none",
          },
        ],
      },
    });
    expect(preview.canApplyNow).toBe(false);
    expect(preview.safety.readsProviderUnreadMessages).toBe(false);
    expect(preview.blockers).toContain(
      "Telegram provider is not running in real mode; use the approved gateway lifecycle path before owner handoff.",
    );
    expect(telegramOwnerHandoffPreviewText(preview)).toContain("Do not use Telegram Desktop scraping");
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
        telegramPlan: async (telegramInput) =>
          buildTelegramRemoteSurfaceBindingPlan({
            toolInput: telegramInput,
            lifecycle:
              telegramInput.action === "create"
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
      toolInput: messagingRemoteSurfaceEventPreviewInput(
        {
          providerId: "telegram-tdlib",
          authProfileId: "owner",
          conversationId: "owner-chat",
          messageId: "101",
          senderId: "owner-1",
          senderLabel: "Owner",
          text: "status",
        },
        () => new Date("2026-05-10T00:00:01.000Z"),
      ),
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

    expect(() =>
      bindings.add({
        id: "binding-2",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local",
        conversationId: "456",
        purpose: "remote_ambient_surface",
        status: "active",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires ownerUserId/);

    expect(() =>
      bindings.add({
        id: "binding-3",
        providerId: "telegram-tdlib",
        authProfileId: "telegram-local",
        conversationId: "789",
        purpose: "messaging_connector",
        status: "active",
        externalTrustClass: "delegate",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires externalTrustClass=external/);

    expect(() =>
      bindings.add({
        id: "binding-signal",
        providerId: "signal-cli",
        authProfileId: "signal-local-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
        status: "active",
        ownerUserId: "owner-1",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      }),
    ).toThrow(/requires setupTool=ambient_messaging_signal_remote_surface_apply/);
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
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
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
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_telegram_owner_loop_activation_plan",
        "ambient_messaging_gateway_status",
      ],
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
    expect(headlessRuntimeUxInventoryText(result)).toContain(
      "ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply",
    );
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
    expect(headlessRuntimeUxInventoryText(result)).toContain(
      "Tool sequence: ambient_messaging_remote_surface_command_preview -> ambient_messaging_remote_surface_command_apply",
    );
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

      expect(() =>
        telegramRemoteSurfaceBindingInput({
          action: "create",
          purpose: "remote_ambient_surface",
          profileId: "owner",
          conversationId: "telegram-chat-1",
          ownerUserId: "owner-1",
          ambientSurface: "projects",
        }),
      ).toThrow(/maxDisclosureLabel is required/);

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
    providers: [
      {
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
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
          bridgeBaseUrl: "http://127.0.0.1:8091",
        },
      },
    ],
  };
}
