import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  registerTelegramBridgePollingApplyTools,
  type TelegramBridgePollingApplyToolPermissionRequest,
} from "./agentRuntimeTelegramBridgePollingApplyTools";
import {
  createTelegramBridgePollingResolvers,
} from "./agentRuntimeTelegramBridgePollPlan";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import {
  TelegramBridgePollingRunner,
  type TelegramBridgePollPlan,
  type TelegramBridgePollResult,
} from "../agentRuntimeTelegramFacade";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgePollingApplyTools", () => {
  it("registers and executes the Telegram bridge polling apply tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-polling-apply-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-24T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-24T00:00:02.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-24T00:00:01.000Z",
          message: "Ready for Telegram bridge polling apply parity test.",
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
    const scheduledIntervals: number[] = [];
    const clearedTimers: unknown[] = [];
    const telegramBridgePollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date("2026-05-24T00:00:03.000Z"),
      schedulePoll: (_callback, intervalMs) => {
        scheduledIntervals.push(intervalMs);
        return { unref: () => undefined } as any;
      },
      clearPoll: (handle) => {
        clearedTimers.push(handle);
      },
    });
    const registeredTools: RegisteredTool[] = [];
    const permissionRequests: TelegramBridgePollingApplyToolPermissionRequest[] = [];
    let allowPermission = false;
    const workspace = {
      name: "AmbientDesktop",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };

    let latestPreviewPollPlan: TelegramBridgePollPlan | undefined;
    const telegramBridgePolling = createTelegramBridgePollingResolvers({
      bindings,
      gatewayRunner,
      stateRoot,
      telegramBridgePollingRunner,
      applyPollForParams: async () => {
        if (!latestPreviewPollPlan) {
          throw new Error("Expected polling preview before immediate poll apply");
        }
        return appliedPollResult(latestPreviewPollPlan);
      },
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

      registerTelegramBridgePollingApplyTools({
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
        previewForParams: (params) => {
          const result = telegramBridgePolling.previewForParams(params);
          latestPreviewPollPlan = result.preview.pollPlan;
          return result;
        },
        applyPolling: telegramBridgePolling.applyPolling,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_polling_apply",
      ]);

      const blocked = await registeredTools[0]!.execute("telegram-bridge-polling-apply-blocked", {
        action: "stop",
        profileId: "owner-profile",
      });
      expect(blocked.content[0].text).toContain("Telegram bridge polling stop apply");
      expect(blocked.content[0].text).toContain("Apply status: blocked");
      expect(blocked.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_polling_apply",
        status: "blocked",
        pollingStatus: "blocked",
        applyStatus: "blocked",
        approvalRecorded: false,
        action: "stop",
        canApplyNow: false,
        blockers: ["Telegram bridge polling is not running."],
      });
      expect(permissionRequests).toHaveLength(0);
      expect(scheduledIntervals).toEqual([]);

      const startParams = {
        action: "start",
        profileId: " owner-profile ",
        intervalMs: 300000,
        limit: 5,
        minReceivedAt: "2026-05-24T00:00:01.000Z",
      };
      const denied = await registeredTools[0]!.execute("telegram-bridge-polling-apply-denied", startParams);
      expect(denied.content[0].text).toContain("Telegram bridge polling start apply");
      expect(denied.content[0].text).toContain("Apply status: denied");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_polling_apply",
        status: "denied",
        pollingStatus: "ready",
        applyStatus: "denied",
        approvalRecorded: false,
        action: "start",
        canApplyNow: true,
        runtimeStatus: {
          state: "stopped",
          running: false,
        },
      });
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_telegram_bridge_polling_apply",
        title: "Start periodic Telegram Remote Ambient Surface polling?",
        message: "Start Telegram polling every 300000ms for 1 owner binding(s).",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: "telegram-bridge-polling:1:bindings",
        grantTargetIdentity: `telegram-tdlib:${binding.binding.id}:300000:5`,
        allowedReason: "User approved periodic Telegram bridge polling.",
        deniedReason: "User denied periodic Telegram bridge polling.",
      });
      expect(permissionRequests[0]!.detail).toContain("Would start timer: yes");
      expect(scheduledIntervals).toEqual([]);

      allowPermission = true;
      const applied = await registeredTools[0]!.execute("telegram-bridge-polling-apply-applied", startParams);
      expect(applied.content[0].text).toContain("Apply status: applied");
      expect(applied.content[0].text).toContain("Immediate poll:");
      expect(applied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_polling_apply",
        status: "applied",
        pollingStatus: "ready",
        applyStatus: "applied",
        approvalRecorded: true,
        action: "start",
        canApplyNow: true,
        immediatePollResult: {
          applyStatus: "applied",
          polled: true,
          acceptedDispatchCount: 0,
        },
        runtimeStatus: {
          providerId: "telegram-tdlib",
          state: "running",
          running: true,
          intervalMs: 300000,
          selectedBindingCount: 1,
          totalPollCount: 1,
          successfulPollCount: 1,
        },
      });
      expect(permissionRequests).toHaveLength(2);
      expect(scheduledIntervals).toEqual([300000]);
      expect(clearedTimers).toEqual([]);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

function appliedPollResult(plan: TelegramBridgePollPlan): TelegramBridgePollResult {
  return {
    ...plan,
    applyStatus: "applied",
    approvalRecorded: true,
    polled: true,
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    duplicateMessageCount: 0,
    staleMessageCount: 0,
    skippedMessageCount: 0,
    acceptedDispatchCount: 0,
    droppedDispatchCount: 0,
    bindingResults: [],
  };
}
