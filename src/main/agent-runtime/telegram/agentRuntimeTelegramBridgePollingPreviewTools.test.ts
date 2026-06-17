import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createTelegramBridgePollingResolvers } from "./agentRuntimeTelegramBridgePollPlan";
import { registerTelegramBridgePollingPreviewTools } from "./agentRuntimeTelegramBridgePollingPreviewTools";
import { createMessagingBindingStore } from "../../messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";
import {
  TelegramBridgePollingRunner,
} from "../../telegram/telegramBridgePolling";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgePollingPreviewTools", () => {
  it("registers and executes the Telegram bridge polling preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-polling-preview-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-23T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-23T00:00:02.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-23T00:00:01.000Z",
          message: "Ready for Telegram bridge polling preview parity test.",
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
      now: () => new Date("2026-05-23T00:00:03.000Z"),
    });
    const registeredTools: RegisteredTool[] = [];

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
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
      const telegramBridgePolling = createTelegramBridgePollingResolvers({
        bindings,
        gatewayRunner,
        stateRoot,
        telegramBridgePollingRunner,
        applyPollForParams: async () => {
          throw new Error("polling preview should not apply a Telegram bridge poll");
        },
      });

      registerTelegramBridgePollingPreviewTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        previewForParams: (params) => telegramBridgePolling.previewForParams(params).preview,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_polling_preview",
      ]);

      const result = await registeredTools[0]!.execute("telegram-bridge-polling-preview", {
        action: "start",
        profileId: " owner-profile ",
        intervalMs: 300000,
        limit: 5,
        minReceivedAt: "2026-05-23T00:00:01.000Z",
      });

      expect(result.content[0].text).toContain("Telegram bridge polling start preview");
      expect(result.content[0].text).toContain("Can apply now: yes");
      expect(result.content[0].text).toContain("Approval required: yes");
      expect(result.content[0].text).toContain("Starts timer: yes");
      expect(result.content[0].text).toContain("Sends provider messages: no");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_polling_preview",
        status: "ready",
        pollingStatus: "ready",
        providerId: "telegram-tdlib",
        action: "start",
        canApplyNow: true,
        approvalRequired: true,
        intervalMs: 300000,
        limit: 5,
        minReceivedAt: "2026-05-23T00:00:01.000Z",
        profileId: "owner-profile",
        statePath: join(stateRoot, "messaging-gateway", "telegram-poll-state.json"),
        selectedBindings: [{
          bindingId: binding.binding.id,
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          ownerUserId: "owner-user",
          ambientSurface: "projects",
          maxDisclosureLabel: "owner-private-runtime-summary",
        }],
        runtimeStatus: {
          providerId: "telegram-tdlib",
          state: "stopped",
          running: false,
          totalPollCount: 0,
        },
        pollPlan: {
          providerId: "telegram-tdlib",
          status: "ready",
          canApplyNow: true,
          selectedBindings: [{
            bindingId: binding.binding.id,
          }],
        },
        safety: {
          startsTimer: true,
          stopsTimer: false,
          readsProviderUnreadMessages: true,
          resolvesSenderProfiles: true,
          writesDedupeState: true,
          startsBridge: false,
          sendsProviderMessages: false,
        },
        blockers: [],
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
