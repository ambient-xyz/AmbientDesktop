import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerTelegramBridgeReplyPreviewTools } from "./agentRuntimeTelegramBridgeReplyPreviewTools";
import { createTelegramBridgeReplyResolvers } from "./agentRuntimeTelegramBridgeReplyPlan";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import { buildRuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgeReplyPreviewTools", () => {
  it("registers and executes the Telegram bridge reply preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-reply-preview-tools-"));
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
          message: "Ready for Telegram bridge reply preview parity test.",
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
    const workspace = {
      name: "AmbientDesktop",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };

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
          receivedAt: "2026-05-24T00:00:01.000Z",
        },
        bindings: bindings.list({ includeInactive: false }),
        surface: buildRuntimeSurfaceSnapshot({
          workspace,
          threads: [],
          workflowFolders: [],
          projects: [{
            name: "AmbientDesktop",
            path: "/workspace",
            updatedAt: "2026-05-24T00:00:00.000Z",
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
        requestApproval: async () => false,
      });

      registerTelegramBridgeReplyPreviewTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        previewForParams: telegramBridgeReply.previewForParams,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_reply_preview",
      ]);

      const result = await registeredTools[0]!.execute("telegram-bridge-reply-preview", {
        queuedProjectionId: ` ${queuedProjectionId} `,
        text: " status update ",
      });

      expect(result.content[0].text).toContain("Telegram bridge reply preview");
      expect(result.content[0].text).toContain("Can apply now: yes");
      expect(result.content[0].text).toContain("Approval required: yes");
      expect(result.content[0].text).toContain("Sends provider messages: yes");
      expect(result.content[0].text).toContain("Reads provider messages: no");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_reply_preview",
        status: "ready",
        replyStatus: "ready",
        providerId: "telegram-tdlib",
        canApplyNow: true,
        approvalRequired: true,
        queuedProjectionId,
        text: "status update",
        textLength: 13,
        textPreview: "status update",
        endpointPath: "/sessions/owner-profile/messages/send",
        replyToMessageId: "message-1",
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
      expect(runtimeStatusReadCount).toBe(1);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
