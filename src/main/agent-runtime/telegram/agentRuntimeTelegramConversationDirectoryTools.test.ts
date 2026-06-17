import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  registerTelegramConversationDirectoryTools,
  type TelegramConversationDirectoryToolPermissionRequest,
} from "./agentRuntimeTelegramConversationDirectoryTools";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

describe("registerTelegramConversationDirectoryTools", () => {
  it("registers and executes the Telegram conversation directory preview and denied apply tools", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-directory-preview-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-14T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-14T00:00:01.000Z",
          message: "Ready for Telegram conversation directory preview parity test.",
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
    const permissionRequests: TelegramConversationDirectoryToolPermissionRequest[] = [];

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      registerTelegramConversationDirectoryTools({
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
        "ambient_messaging_telegram_conversation_directory_preview",
        "ambient_messaging_telegram_conversation_directory_apply",
      ]);

      const directoryPreview = toolByName(registeredTools, "ambient_messaging_telegram_conversation_directory_preview");
      const result = await directoryPreview.execute("telegram-directory-preview", {
        profileId: " owner-profile ",
        query: "Project",
        unreadOnly: true,
        limit: 7,
      });
      expect(result.content[0].text).toContain("Telegram conversation directory preview: ready");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_conversation_directory_preview",
        status: "ready",
        directoryStatus: "ready",
        providerId: "telegram-tdlib",
        canApplyNow: true,
        approvalRequired: true,
        profileId: "owner-profile",
        query: "Project",
        unreadOnly: true,
        limit: 7,
        endpointPath: "/sessions/owner-profile/chats?limit=7&metadataOnly=true&query=Project&unreadOnly=true",
        knownAuthProfiles: [{
          profileId: "owner-profile",
          metadataReadable: true,
          tdlibStateDirPresent: true,
          databaseEncryptionKeyPresent: true,
        }],
        blockers: [],
        warnings: [
          "Unread-only directory filters by unread count metadata, not unread message bodies.",
        ],
        safety: {
          startsBridge: false,
          readsProviderHistory: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
          returnsProviderMessageContent: false,
          readsProviderConversationMetadata: true,
        },
        messagingConversationDirectorySetup: {
          providerLabel: "Telegram",
          directoryStatus: "ready",
          canApplyNow: true,
        },
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          providerId: "telegram-tdlib",
          executionStatus: "preview",
          approvalRecorded: false,
          fetchedConversationCount: 0,
          returnedConversationCount: 0,
        },
      });

      const directoryApply = toolByName(registeredTools, "ambient_messaging_telegram_conversation_directory_apply");
      const denied = await directoryApply.execute("telegram-directory-apply", {
        profileId: " owner-profile ",
        query: "Project",
        unreadOnly: true,
        limit: 7,
      });
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_telegram_conversation_directory_apply",
        title: "Read Telegram conversation directory?",
        message: "Read up to 7 Telegram conversation metadata row(s) from profile owner-profile.",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: "telegram-directory:owner-profile:7",
        grantTargetIdentity: "telegram-tdlib:owner-profile:Project:true::7",
        allowedReason: "User approved bounded Telegram conversation directory read.",
        deniedReason: "User denied Telegram conversation directory read.",
      });
      expect(permissionRequests[0]!.detail).toContain("Message history is not read");
      expect(denied.content[0].text).toContain("Telegram conversation directory result: denied");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_conversation_directory_apply",
        status: "denied",
        directoryStatus: "ready",
        providerId: "telegram-tdlib",
        applyStatus: "denied",
        approvalRecorded: false,
        failureMode: "permission-denied",
        fetchedConversationCount: 0,
        returnedConversationCount: 0,
        conversations: [],
        safety: {
          startsBridge: false,
          readsProviderHistory: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
          returnsProviderMessageContent: false,
          readsProviderConversationMetadata: false,
        },
        messagingConversationDirectorySetup: {
          providerLabel: "Telegram",
          directoryStatus: "ready",
          canApplyNow: true,
        },
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          providerId: "telegram-tdlib",
          executionStatus: "denied",
          approvalRecorded: false,
          fetchedConversationCount: 0,
          returnedConversationCount: 0,
          failureMode: "permission-denied",
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
