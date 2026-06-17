import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerMessagingOverviewTools } from "./agentRuntimeMessagingOverviewTools";
import { createMessagingBindingStore } from "../../messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messagingGatewayRunner";
import { TelegramBridgePollingRunner } from "../../telegramBridgePolling";

describe("registerMessagingOverviewTools", () => {
  it("registers and executes the read-only messaging overview tools", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-messaging-overview-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
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
          message: "Ready for activation plan parity test.",
          diagnostics: ["Synthetic readiness probe; no provider messages read."],
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
    const telegramBridgePollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date("2026-05-10T00:00:06.000Z"),
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      registerMessagingOverviewTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        registry: providers,
        bindings,
        gatewayRunner,
        telegramBridgePollingRunner,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_headless_ux_inventory",
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_remote_surface_provider_support_plan",
        "ambient_messaging_list_providers",
        "ambient_messaging_provider_status",
      ]);

      const inventory = toolByName(registeredTools, "ambient_messaging_headless_ux_inventory");
      const uxInventory = await inventory.execute("headless-ux-inventory", {});
      expect(uxInventory.content[0].text).toContain("Ambient headless runtime UX inventory");
      expect(uxInventory.content[0].text).toContain("ambient_runtime_surface_snapshot");
      expect(uxInventory.content[0].text).toContain("settings.voice.update");
      expect(uxInventory.content[0].text).toContain("messaging.polling.start");
      expect(uxInventory.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_headless_ux_inventory",
        status: "complete",
      });

      const listProviders = toolByName(registeredTools, "ambient_messaging_list_providers");
      const providerList = await listProviders.execute("list-providers", {});
      expect(providerList.content[0].text).toContain("Ambient messaging providers");
      expect(providerList.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_list_providers",
        status: "complete",
      });
      expect(providerList.details.providers.map((provider: any) => provider.descriptor.providerId)).toEqual(expect.arrayContaining([
        "telegram-tdlib",
        "signal-cli",
      ]));

      const providerStatus = toolByName(registeredTools, "ambient_messaging_provider_status");
      const telegramStatus = await providerStatus.execute("provider-status", { providerId: " telegram-tdlib " });
      expect(telegramStatus.content[0].text).toContain("Provider ID: telegram-tdlib");
      expect(telegramStatus.details.provider.descriptor.providerId).toBe("telegram-tdlib");

      const providerSupportPlan = toolByName(registeredTools, "ambient_messaging_remote_surface_provider_support_plan");
      const signalSupport = await providerSupportPlan.execute("provider-support", {
        provider: "Signal",
        ambientSurface: "projects",
      });
      expect(signalSupport.content[0].text).toContain("Remote Ambient Surface provider support plan");
      expect(signalSupport.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_provider_support_plan",
        status: "planning_ready",
        selectedProviderId: "signal-cli",
      });

      const activationPlan = toolByName(registeredTools, "ambient_messaging_remote_surface_activation_plan");
      const telegramActivation = await activationPlan.execute("activation-plan", {
        requestText: "set up Telegram remote control",
        setupCode: "AMBIENT-OWNER-LOOP-SETUP",
      });
      expect(telegramActivation.content[0].text).toContain("Remote Ambient Surface activation shortcut");
      expect(telegramActivation.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_activation_plan",
        status: "route_ready",
        selectedProviderId: "telegram-tdlib",
        recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      });
      expect(telegramActivation.details.telegramPlan.providerState).toMatchObject({
        runtimeState: "running",
        mode: "real",
        readinessStatus: "available",
      });
      expect(telegramActivation.details.messagingRemoteSurfaceActivation).toMatchObject({
        kind: "messaging-remote-surface-activation",
        providerId: "telegram-tdlib",
        status: "route_ready",
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
