import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  registerTelegramBridgePollApplyTools,
  type TelegramBridgePollApplyToolPermissionRequest,
} from "./agentRuntimeTelegramBridgePollApplyTools";
import {
  createTelegramBridgePollResolvers,
} from "./agentRuntimeTelegramBridgePollPlan";
import { createMessagingBindingStore } from "./messagingBindings";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgePollApplyTools", () => {
  it("registers and executes the Telegram bridge poll apply tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-poll-apply-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-21T00:00:02.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-21T00:00:01.000Z",
          message: "Ready for Telegram bridge poll apply parity test.",
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
    const permissionRequests: TelegramBridgePollApplyToolPermissionRequest[] = [];
    const applyParams: unknown[] = [];
    let allowPermission = false;
    const workspace = {
      name: "ambientCoder",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };
    let runtimeSurfaceReadCount = 0;
    const telegramBridgePoll = createTelegramBridgePollResolvers({
      bindings,
      gatewayRunner,
      runtimeSurfaceSnapshot: () => {
        runtimeSurfaceReadCount += 1;
        return undefined;
      },
      stateRoot,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ messages: [] }),
      }),
    });

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

      registerTelegramBridgePollApplyTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-1",
        workspace: workspace as any,
        getThread: (threadId) => ({
          id: threadId,
          title: "Thread 1",
          permissionMode: "standard",
        }) as any,
        resolveFirstPartyPluginPermission: async (request) => {
          permissionRequests.push(request);
          return allowPermission;
        },
        planForParams: telegramBridgePoll.planForParams,
        applyPollForParams: async (params) => {
          applyParams.push(params);
          return await telegramBridgePoll.applyPollForParams(params);
        },
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_poll_apply",
      ]);

      const blocked = await registeredTools[0]!.execute("telegram-bridge-poll-apply-blocked", {
        bindingId: "missing-binding",
        limit: 5,
      });
      expect(blocked.content[0].text).toContain("Telegram bridge poll apply");
      expect(blocked.content[0].text).toContain("Apply status: blocked");
      expect(blocked.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_poll_apply",
        status: "blocked",
        pollStatus: "blocked",
        applyStatus: "blocked",
        canApplyNow: false,
        approvalRecorded: false,
        polled: false,
        blockers: [
          "No active owner Remote Ambient Surface Telegram bindings match the requested poll scope.",
        ],
      });
      expect(permissionRequests).toHaveLength(0);
      expect(applyParams).toHaveLength(0);
      expect(runtimeSurfaceReadCount).toBe(0);

      const readyParams = {
        profileId: " owner-profile ",
        limit: 5,
        minReceivedAt: "2026-05-21T00:00:01.000Z",
      };
      const denied = await registeredTools[0]!.execute("telegram-bridge-poll-apply-denied", readyParams);
      expect(denied.content[0].text).toContain("Apply status: denied");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_poll_apply",
        status: "denied",
        pollStatus: "ready",
        applyStatus: "denied",
        canApplyNow: true,
        approvalRecorded: false,
        polled: false,
      });
      expect(permissionRequests).toHaveLength(1);
      expect(runtimeSurfaceReadCount).toBe(0);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_telegram_bridge_poll_apply",
        title: "Poll Telegram Remote Ambient Surface messages?",
        message: "Poll 1 Telegram owner binding(s) for unread Remote Ambient Surface messages.",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: "telegram-bridge-poll:1:bindings",
        grantTargetIdentity: `telegram-tdlib:${binding.binding.id}:5`,
        allowedReason: "User approved bounded Telegram bridge polling.",
        deniedReason: "User denied Telegram bridge polling.",
      });
      expect(permissionRequests[0]!.detail).toContain("Would read unread messages: yes");
      expect(applyParams).toHaveLength(0);

      allowPermission = true;
      const applied = await registeredTools[0]!.execute("telegram-bridge-poll-apply-applied", readyParams);
      expect(applied.content[0].text).toContain("Apply status: applied");
      expect(applied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_poll_apply",
        status: "applied",
        pollStatus: "ready",
        applyStatus: "applied",
        canApplyNow: true,
        approvalRecorded: true,
        polled: true,
        fetchedMessageCount: 0,
        acceptedDispatchCount: 0,
      });
      expect(permissionRequests).toHaveLength(2);
      expect(applyParams).toEqual([readyParams]);
      expect(runtimeSurfaceReadCount).toBe(1);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
