import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createTelegramRemoteSurfacePlanResolvers,
  registerTelegramRemoteSurfaceTools,
  type TelegramRemoteSurfaceToolPermissionRequest,
} from "./agentRuntimeTelegramRemoteSurfaceTools";
import { createMessagingBindingStore } from "../../messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messagingGatewayRunner";

describe("registerTelegramRemoteSurfaceTools", () => {
  it("registers and executes the Telegram Remote Ambient Surface preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-remote-surface-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-16T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-16T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-16T00:00:01.000Z",
          message: "Ready for Telegram Remote Ambient Surface preview parity test.",
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
    const permissionRequests: TelegramRemoteSurfaceToolPermissionRequest[] = [];

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      const telegramRemoteSurface = createTelegramRemoteSurfacePlanResolvers({
        bindings,
        gatewayRunner,
      });

      registerTelegramRemoteSurfaceTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-1",
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        } as any,
        getThread: (threadId) => ({ id: threadId, title: "Thread 1" }) as any,
        resolveFirstPartyPluginPermission: async (request) => {
          permissionRequests.push(request);
          return false;
        },
        bindings,
        planForParams: telegramRemoteSurface.planForParams,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_remote_surface_preview",
        "ambient_messaging_telegram_remote_surface_apply",
      ]);

      const createParams = {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: " owner-profile ",
        conversationId: " owner-conversation ",
        ownerUserId: " owner-user ",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      };
      const preview = await toolByName(registeredTools, "ambient_messaging_telegram_remote_surface_preview").execute("telegram-remote-surface-preview", createParams);
      expect(preview.content[0].text).toContain("Telegram Remote Ambient Surface binding preview ready");
      expect(preview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_remote_surface_preview",
        status: "ready",
        bindingSetupStatus: "ready",
        action: "create",
        canApplyNow: true,
        blockers: [],
        lifecycle: {
          action: "create",
          approvalRequired: true,
          wouldPersist: true,
          wouldStartBridge: false,
          wouldReadMessages: false,
          wouldSendMessages: false,
          binding: {
            providerId: "telegram-tdlib",
            authProfileId: "owner-profile",
            conversationId: "owner-conversation",
            purpose: "remote_ambient_surface",
            status: "active",
            ownerUserId: "owner-user",
            ambientSurface: "projects",
            externalTrustClass: "owner",
            maxDisclosureLabel: "owner-private-runtime-summary",
          },
        },
        readiness: {
          providerId: "telegram-tdlib",
          status: "available",
          apiCredentialsPresent: true,
          bridgeReachable: true,
          persistedSessionCount: 1,
        },
        runtimeProvider: {
          providerId: "telegram-tdlib",
          state: "running",
          mode: "real",
        },
        matchedSession: {
          profileId: "owner-profile",
          metadataReadable: true,
          tdlibStateDirPresent: true,
          databaseEncryptionKeyPresent: true,
        },
        safety: {
          startsBridge: false,
          readsProviderMessages: false,
          sendsProviderMessages: false,
          enablesInboundIngestion: false,
        },
      });

      const denied = await toolByName(registeredTools, "ambient_messaging_telegram_remote_surface_apply").execute("telegram-remote-surface-apply", createParams);
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_telegram_remote_surface_apply",
        title: "Create Telegram Remote Ambient Surface binding?",
        message: "Bind Telegram conversation owner-conversation to Ambient projects.",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `telegram-remote-surface:create:${denied.details.lifecycle.binding.id}`,
        grantTargetIdentity: `telegram-tdlib:remote_ambient_surface:create:owner-conversation:${denied.details.lifecycle.binding.id}`,
        allowedReason: "User approved Telegram Remote Ambient Surface binding mutation.",
        deniedReason: "User denied Telegram Remote Ambient Surface binding mutation.",
      });
      expect(permissionRequests[0]!.detail).toContain("This persists routing metadata only.");
      expect(permissionRequests[0]!.detail).toContain("This does not start Telegram, list chats, read messages, ingest events, or send messages.");
      expect(denied.content[0].text).toContain("Telegram Remote Ambient Surface binding denied");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_remote_surface_apply",
        status: "denied",
        bindingSetupStatus: "ready",
        action: "create",
        canApplyNow: true,
        applyStatus: "denied",
        persisted: false,
        approvalRecorded: false,
        lifecycle: {
          action: "create",
          approvalRequired: true,
          wouldPersist: true,
          binding: {
            providerId: "telegram-tdlib",
            authProfileId: "owner-profile",
            conversationId: "owner-conversation",
            purpose: "remote_ambient_surface",
            status: "active",
          },
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
