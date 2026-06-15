import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerTelegramBridgePollPreviewTools } from "./agentRuntimeTelegramBridgePollPreviewTools";
import { createTelegramBridgePollResolvers } from "./agentRuntimeTelegramBridgePollPlan";
import { createMessagingBindingStore } from "./messagingBindings";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgePollPreviewTools", () => {
  it("registers and executes the Telegram bridge poll preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-poll-preview-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-20T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-20T00:00:02.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-20T00:00:01.000Z",
          message: "Ready for Telegram bridge poll preview parity test.",
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
      const telegramBridgePoll = createTelegramBridgePollResolvers({
        bindings,
        gatewayRunner,
        runtimeSurfaceSnapshot: () => undefined,
        stateRoot,
      });

      registerTelegramBridgePollPreviewTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        planForParams: telegramBridgePoll.planForParams,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_poll_preview",
      ]);

      const result = await registeredTools[0]!.execute("telegram-bridge-poll-preview", {
        profileId: " owner-profile ",
        limit: 5,
        minReceivedAt: "2026-05-20T00:00:01.000Z",
      });

      expect(result.content[0].text).toContain("Telegram bridge poll preview");
      expect(result.content[0].text).toContain("Can apply now: yes");
      expect(result.content[0].text).toContain("Runtime state: running/real");
      expect(result.content[0].text).toContain("Sends provider messages: no");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_poll_preview",
        status: "ready",
        pollStatus: "ready",
        providerId: "telegram-tdlib",
        canApplyNow: true,
        limit: 5,
        minReceivedAt: "2026-05-20T00:00:01.000Z",
        statePath: join(stateRoot, "messaging-gateway", "telegram-poll-state.json"),
        selectedBindings: [{
          bindingId: binding.binding.id,
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          ownerUserId: "owner-user",
          ambientSurface: "projects",
          maxDisclosureLabel: "owner-private-runtime-summary",
        }],
        runtimeProvider: {
          providerId: "telegram-tdlib",
          state: "running",
          mode: "real",
          readiness: {
            providerId: "telegram-tdlib",
            status: "available",
            bridgeReachable: true,
            apiCredentialsPresent: true,
          },
        },
        blockers: [],
        safety: {
          readsProviderUnreadMessages: true,
          resolvesSenderProfiles: true,
          writesDedupeState: true,
          startsBridge: false,
          sendsProviderMessages: false,
        },
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
