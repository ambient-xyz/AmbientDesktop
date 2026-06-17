import { describe, expect, it } from "vitest";

import { registerSignalBindingReadinessTools } from "./agentRuntimeSignalBindingReadinessTools";
import { createEmptyMessagingBindingRegistry } from "../../messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

describe("registerSignalBindingReadinessTools", () => {
  it("registers and executes the Signal binding readiness preview tool", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-16T00:00:05.000Z"),
      readinessProbes: {
        "signal-cli": async () => ({
          providerId: "signal-cli",
          status: "available",
          configured: true,
          bridgeReachable: true,
          bridgeCapabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: true,
          },
          authNeeded: false,
          apiCredentialsPresent: false,
          persistedSessionCount: 1,
          checkedAt: "2026-05-16T00:00:01.000Z",
          message: "Signal bridge contract readiness is present.",
          diagnostics: [
            "Signal bridge root contract accepted.",
            "Signal bridge bounded unread contract accepted.",
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
        }),
      },
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    await gatewayRunner.refreshProviderReadiness("signal-cli");

    registerSignalBindingReadinessTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      bindings,
      gatewayRunner,
      signalDescriptor: () => providers.get("signal-cli")?.descriptor,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_messaging_signal_binding_readiness_preview",
    ]);

    const result = await registeredTools[0]!.execute("signal-binding-readiness-preview", {
      providerId: " signal-cli ",
      profileId: " signal-owner ",
      conversationId: " signal-chat-1 ",
      ownerUserId: " owner-1 ",
      ambientSurface: "projects",
      maxDisclosureLabel: " owner-private-runtime-summary ",
      limit: 5,
    });
    expect(result.content[0].text).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
    expect(result.content[0].text).toContain("Generic binding apply allowed: no");
    expect(result.content[0].text).toContain("Telegram owner handoff allowed: no");
    expect(result.content[0].text).toContain("Owner authentication: missing");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_signal_binding_readiness_preview",
      status: "blocked",
      bindingReadinessStatus: "blocked",
      providerId: "signal-cli",
      providerLabel: "Signal",
      canApplyNow: false,
      previewOnly: true,
      typedPreviewTool: "ambient_messaging_signal_binding_readiness_preview",
      typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
      genericBindingApplyAllowed: false,
      telegramOwnerHandoffAllowed: false,
      implementationStatus: "planned",
      purposeSupported: true,
      bindingLifecycleEnabled: true,
      runtimeLifecycleEnabled: false,
      inboundIngestionEnabled: false,
      outboundReplyEnabled: true,
      profileId: "signal-owner",
      conversationId: "signal-chat-1",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      limit: 5,
      futureUnreadEndpointPath: "/profiles/signal-owner/conversations/signal-chat-1/unread?limit=5",
      readinessStatus: "available",
      configured: true,
      bridgeReachable: true,
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
    expect(result.details.blockers.join("\n")).toContain("Signal owner authentication requires matched owner-handoff metadata");
    expect(result.details.existingBindings).toEqual([]);
  });
});
