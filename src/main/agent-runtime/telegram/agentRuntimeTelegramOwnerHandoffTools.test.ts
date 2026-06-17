import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  registerTelegramOwnerHandoffTools,
  type TelegramOwnerHandoffToolPermissionRequest,
} from "./agentRuntimeTelegramOwnerHandoffTools";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

describe("registerTelegramOwnerHandoffTools", () => {
  it("registers and executes the Telegram owner handoff preview and denied apply tools", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-owner-handoff-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-15T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-15T00:00:01.000Z",
          message: "Ready for Telegram owner handoff preview parity test.",
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
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const permissionRequests: TelegramOwnerHandoffToolPermissionRequest[] = [];

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      registerTelegramOwnerHandoffTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-1",
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        } as any,
        getThread: (threadId) => ({ id: threadId, title: "Thread 1" }) as any,
        resolveFirstPartyPluginPermission: async (request) => {
          permissionRequests.push(request);
          return false;
        },
        gatewayRunner,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_owner_handoff_preview",
        "ambient_messaging_telegram_owner_handoff_apply",
      ]);

      const handoffPreview = toolByName(registeredTools, "ambient_messaging_telegram_owner_handoff_preview");
      const result = await handoffPreview.execute("owner-handoff-preview", {
        profileId: " owner-profile ",
        conversationId: " owner-conversation ",
        setupCode: "AMBIENT-OWNER-HANDOFF-SETUP",
        limit: 7,
      });
      expect(result.content[0].text).toContain("Telegram owner handoff preview");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_owner_handoff_preview",
        status: "ready",
        handoffStatus: "ready",
        providerId: "telegram-tdlib",
        canApplyNow: true,
        approvalRequired: true,
        profileId: "owner-profile",
        conversationId: "owner-conversation",
        setupCodeLength: 27,
        setupCodePreview: "AMBIENT-...ETUP",
        limit: 7,
        endpointPath: "/sessions/owner-profile/inbox/unread?chatId=owner-conversation&limit=7",
        matchedSession: {
          profileId: "owner-profile",
          metadataReadable: true,
          tdlibStateDirPresent: true,
          databaseEncryptionKeyPresent: true,
        },
        blockers: [],
        warnings: [],
        safety: {
          readsProviderUnreadMessages: true,
          filtersExactSetupCode: true,
          resolvesSenderProfiles: true,
          returnsMatchedSenderId: true,
          readsProviderHistory: false,
          sendsProviderMessages: false,
          startsBridge: false,
          mutatesBindings: false,
          returnsProviderMessageContent: false,
        },
      });

      const setupCode = "AMBIENT-OWNER-HANDOFF-SETUP";
      const setupCodeHash = createHash("sha256").update(setupCode).digest("hex").slice(0, 16);
      const handoffApply = toolByName(registeredTools, "ambient_messaging_telegram_owner_handoff_apply");
      const denied = await handoffApply.execute("owner-handoff-apply", {
        profileId: " owner-profile ",
        conversationId: " owner-conversation ",
        setupCode,
        limit: 7,
      });
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_telegram_owner_handoff_apply",
        title: "Read Telegram owner handoff code?",
        message: "Read up to 7 unread Telegram message(s) from conversation owner-conversation to find the setup-code sender.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: "telegram-owner-handoff:owner-profile:owner-conversation",
        grantTargetIdentity: `telegram-tdlib:owner-profile:owner-conversation:7:${setupCodeHash}`,
        allowedReason: "User approved bounded Telegram owner handoff.",
        deniedReason: "User denied Telegram owner handoff.",
      });
      expect(permissionRequests[0]!.detail).toContain("Would read unread messages: yes");
      expect(denied.content[0].text).toContain("Telegram owner handoff apply");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_owner_handoff_apply",
        status: "denied",
        previewStatus: "ready",
        providerId: "telegram-tdlib",
        applyStatus: "denied",
        approvalRecorded: false,
        handoffStatus: "no-match",
        fetchedMessageCount: 0,
        candidateMessageCount: 0,
        matchedMessageCount: 0,
        matchedSenderCount: 0,
        safety: {
          readsProviderUnreadMessages: true,
          filtersExactSetupCode: true,
          resolvesSenderProfiles: true,
          returnsMatchedSenderId: true,
          readsProviderHistory: false,
          sendsProviderMessages: false,
          startsBridge: false,
          mutatesBindings: false,
          returnsProviderMessageContent: false,
        },
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
