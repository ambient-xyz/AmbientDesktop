import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerTelegramOwnerLoopTools } from "./agentRuntimeTelegramOwnerLoopTools";
import { createMessagingBindingStore } from "../../messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";
import { TelegramBridgePollingRunner } from "../../telegram/telegramBridgePolling";

describe("registerTelegramOwnerLoopTools", () => {
  it("registers and executes the Telegram owner-loop activation plan tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-owner-loop-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-12T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-12T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-12T00:00:01.000Z",
          message: "Ready for owner-loop activation plan parity test.",
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
      now: () => new Date("2026-05-12T00:00:06.000Z"),
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    try {
      const binding = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "projects",
        externalTrustClass: "owner",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      registerTelegramOwnerLoopTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        bindings,
        gatewayRunner,
        telegramBridgePollingRunner,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_owner_loop_activation_plan",
      ]);

      const activationPlan = registeredTools[0]!;
      const result = await activationPlan.execute("activation-plan", {
        profileId: " owner-profile ",
        conversationId: " owner-conversation ",
        bindingId: binding.binding.id,
        setupCode: "AMBIENT-OWNER-LOOP-SETUP",
      });
      expect(result.content[0].text).toContain("Telegram owner-loop activation plan");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_owner_loop_activation_plan",
        providerId: "telegram-tdlib",
        status: "ready_to_start_polling",
        selectedProfileId: "owner-profile",
        selectedConversationId: "owner-conversation",
        selectedBinding: {
          bindingId: binding.binding.id,
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
        },
        providerState: {
          runtimeState: "running",
          mode: "real",
          readinessStatus: "available",
          configured: true,
          bridgeReachable: true,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
        },
      });
      expect(result.details.messagingRemoteSurfaceActivation).toMatchObject({
        kind: "messaging-remote-surface-activation",
        intent: "remote_ambient_surface",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        status: "ready_to_start_polling",
        recommendedNextTool: "ambient_messaging_telegram_bridge_polling_preview",
      });
      expect(result.details.safety).toMatchObject({
        startsBridge: false,
        listsProviderChats: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        mutatesBindings: false,
        startsPolling: false,
        sendsProviderMessages: false,
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
