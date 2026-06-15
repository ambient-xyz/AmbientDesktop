import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerTelegramBridgeReplyApplyTools } from "./agentRuntimeTelegramBridgeReplyApplyTools";
import {
  createTelegramBridgeReplyResolvers,
  telegramBridgeReplyApprovalRequest,
} from "./agentRuntimeTelegramBridgeReplyPlan";
import { createMessagingBindingStore } from "./messagingBindings";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { buildRuntimeSurfaceSnapshot } from "./runtimeSurfaceSnapshot";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgeReplyApplyTools", () => {
  it("registers and executes the Telegram bridge reply apply tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-reply-apply-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-25T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-25T00:00:02.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-25T00:00:01.000Z",
          message: "Ready for Telegram bridge reply apply parity test.",
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
    const fetchCalls: Array<{ input: string; init?: RequestInit; body?: Record<string, unknown> }> = [];
    const fetchFn = async (input: string, init?: RequestInit) => {
      fetchCalls.push({
        input,
        init,
        body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          messageId: "provider-message-1",
          date: "2026-05-25T00:00:03.000Z",
        }),
      };
    };
    const workspace = {
      name: "ambientCoder",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };
    const thread = { id: "thread-1", title: "Thread 1" } as any;
    const approvalRequests: unknown[] = [];

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
      const dispatch = gatewayRunner.dispatchInbound({
        source: "telegram-bridge",
        event: {
          id: "telegram-owner-profile-owner-conversation-message-1",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          sender: {
            id: "owner-user",
            label: "Owner",
          },
          text: "show projects",
          receivedAt: "2026-05-25T00:00:01.000Z",
        },
        bindings: bindings.list({ includeInactive: false }),
        surface: buildRuntimeSurfaceSnapshot({
          workspace,
          threads: [],
          workflowFolders: [],
          projects: [{
            name: "ambientCoder",
            path: "/workspace",
            updatedAt: "2026-05-25T00:00:00.000Z",
            pinned: true,
            threads: [],
          }],
        } as any),
      });
      const queuedProjectionId = dispatch.queuedProjection?.id;
      expect(queuedProjectionId).toBeTruthy();

      let runtimeStatusReadCount = 0;
      const telegramBridgeReply = createTelegramBridgeReplyResolvers({
        bindings,
        gatewayRuntimeStatus: () => {
          runtimeStatusReadCount += 1;
          return gatewayRunner.runtimeStatus();
        },
        requestApproval: async (preview) => {
          approvalRequests.push(telegramBridgeReplyApprovalRequest({ preview, thread, workspace: workspace as any }));
          return true;
        },
        onResult: (result) => {
          gatewayRunner.recordOutboundDelivery(result.delivery);
        },
        env: {
          AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: "http://127.0.0.1:8091/",
        },
        fetchFn,
        now: () => new Date("2026-05-25T00:00:04.000Z"),
      });

      registerTelegramBridgeReplyApplyTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        applyForParams: telegramBridgeReply.applyForParams,
        gatewayRuntimeStatus: () => gatewayRunner.runtimeStatus(),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_reply_apply",
      ]);

      const result = await registeredTools[0]!.execute("telegram-bridge-reply-apply", {
        queuedProjectionId: ` ${queuedProjectionId} `,
        text: " status update ",
      });

      expect(approvalRequests).toEqual([expect.objectContaining({
        thread,
        workspace,
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        title: "Send Telegram Remote Ambient Surface reply?",
        message: "Send one Telegram reply to conversation owner-conversation.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `telegram-bridge-reply:${queuedProjectionId}`,
        grantTargetIdentity: `telegram-tdlib:${queuedProjectionId}:13:status update`,
        allowedReason: "User approved Telegram Remote Ambient Surface reply.",
        deniedReason: "User denied Telegram Remote Ambient Surface reply.",
      })]);
      expect(fetchCalls).toEqual([{
        input: "http://127.0.0.1:8091/sessions/owner-profile/messages/send",
        init: expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        }),
        body: {
          text: "status update",
          chatId: "owner-conversation",
          replyToMessageId: "message-1",
        },
      }]);
      expect(result.content[0].text).toContain("Telegram bridge reply apply");
      expect(result.content[0].text).toContain("Apply status: sent");
      expect(result.content[0].text).toContain("Delivery status: sent");
      expect(result.content[0].text).toContain("Provider message: provider-message-1");
      expect(runtimeStatusReadCount).toBe(1);
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        status: "sent",
        replyStatus: "ready",
        providerId: "telegram-tdlib",
        canApplyNow: true,
        applyStatus: "sent",
        approvalRecorded: true,
        queuedProjectionId,
        text: "status update",
        textLength: 13,
        textPreview: "status update",
        endpointPath: "/sessions/owner-profile/messages/send",
        replyToMessageId: "message-1",
        providerMessageId: "provider-message-1",
        queuedProjection: {
          id: queuedProjectionId,
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          bindingId: binding.binding.id,
          sourceEventId: "telegram-owner-profile-owner-conversation-message-1",
          purpose: "remote_ambient_surface",
        },
        binding: {
          id: binding.binding.id,
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          purpose: "remote_ambient_surface",
          ownerUserId: "owner-user",
        },
        delivery: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          sourceProjectionId: queuedProjectionId,
          bindingId: binding.binding.id,
          purpose: "remote_ambient_surface",
          replyToMessageId: "message-1",
          providerMessageId: "provider-message-1",
          status: "sent",
          textPreview: "status update",
          textLength: 13,
          sentAt: "2026-05-25T00:00:03.000Z",
        },
        gatewayRuntimeStatus: {
          status: "idle",
          queuedProjectionCount: 1,
          outboundDeliveryCount: 1,
          recentOutboundDeliveries: [{
            providerId: "telegram-tdlib",
            status: "sent",
            providerMessageId: "provider-message-1",
          }],
        },
        safety: {
          readsProviderMessages: false,
          sendsProviderMessages: true,
          startsBridge: false,
          readsProviderHistory: false,
          exposesRuntimeStateToExternalConnector: false,
        },
        blockers: [],
        repairSteps: [],
        warnings: [],
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
