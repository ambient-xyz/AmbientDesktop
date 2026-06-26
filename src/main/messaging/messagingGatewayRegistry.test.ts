import { describe, expect, it } from "vitest";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import {
  buildMessagingRemoteSurfaceBindingPreview,
  buildMessagingRemoteSurfaceEventPreview,
  messagingRemoteSurfaceBindingPreviewInput,
  messagingRemoteSurfaceBindingPreviewText,
  messagingRemoteSurfaceEventPreviewInput,
  messagingRemoteSurfaceEventPreviewText,
} from "./messagingRemoteSurfaceProviderPreview";
import {
  createDefaultMessagingConversationDirectoryAdapterRegistry,
  MessagingConversationDirectoryAdapterRegistry,
} from "./messagingConversationDirectoryAdapters";
import {
  createDefaultMessagingProviderRegistry,
  MessagingProviderRegistry,
  messagingProviderListText,
  messagingProviderStatusText,
  telegramMessagingProviderDescriptor,
} from "./messagingGatewayRegistry";
import { createPlannedMessagingReadinessAdapter, readinessProbesFromAdapters } from "./messagingProviderReadiness";

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
});
