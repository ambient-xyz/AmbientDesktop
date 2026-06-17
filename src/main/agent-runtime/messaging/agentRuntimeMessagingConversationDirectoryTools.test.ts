import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerMessagingConversationDirectoryTools } from "./agentRuntimeMessagingConversationDirectoryTools";
import { createMessagingBindingStore } from "../../messaging/messagingBindings";
import { createDefaultMessagingConversationDirectoryAdapterRegistry } from "../../messaging/messagingConversationDirectoryAdapters";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";

describe("registerMessagingConversationDirectoryTools", () => {
  it("registers and executes the generic conversation directory preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-conversation-directory-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const directoryAdapters = createDefaultMessagingConversationDirectoryAdapterRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-13T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-13T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-13T00:00:01.000Z",
          message: "Ready for conversation directory preview parity test.",
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

      registerMessagingConversationDirectoryTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        registry: providers,
        directoryAdapters,
        bindings,
        gatewayRunner,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_conversation_directory_preview",
      ]);

      const directoryPreview = registeredTools[0]!;
      const result = await directoryPreview.execute("conversation-directory-preview", {
        providerId: " telegram-tdlib ",
        profileId: " owner-profile ",
        purpose: "remote_ambient_surface",
        limit: 5,
      });
      expect(result.content[0].text).toContain("Ambient messaging conversation directory preview: limited");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_conversation_directory_preview",
        status: "limited",
        providerCount: 1,
        filters: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          purpose: "remote_ambient_surface",
          includeInactive: false,
          limit: 5,
        },
        providers: [{
          providerId: "telegram-tdlib",
          providerLabel: "Telegram",
          status: "limited",
          mode: "existing-bindings-only",
          canListProviderConversationsNow: false,
          directoryAdapterStatus: "available",
          directoryAdapterKind: "live-metadata-only-adapter",
          directoryAdapterRequiresApproval: true,
          directoryAdapterCanApplyWithReadiness: false,
          providerDirectoryTool: "ambient_messaging_telegram_conversation_directory_preview",
          providerDirectoryApplyTool: "ambient_messaging_telegram_conversation_directory_apply",
          bindingPreviewTool: "ambient_messaging_telegram_remote_surface_preview",
          bindingApplyTool: "ambient_messaging_telegram_remote_surface_apply",
          readinessStatus: "available",
          bridgeReachable: true,
          configured: true,
          knownAuthProfiles: [{
            profileId: "owner-profile",
            metadataReadable: true,
            tdlibStateDirPresent: true,
            phoneNumberPresent: true,
            databaseEncryptionKeyPresent: true,
          }],
          knownConversations: [{
            bindingId: binding.binding.id,
            authProfileId: "owner-profile",
            conversationId: "owner-conversation",
            purpose: "remote_ambient_surface",
            status: "active",
            ambientSurface: "projects",
            ownerUserId: "owner-user",
            maxDisclosureLabel: "owner-private-runtime-summary",
          }],
          blockers: [
            "Telegram provider directory adapter requires the Telegram provider to be running in real mode.",
          ],
        }],
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          readsProviderHistory: false,
          sendsProviderMessages: false,
          mutatesBindings: false,
        },
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
