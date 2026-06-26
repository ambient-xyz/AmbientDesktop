import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandInput,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  applyTelegramBridgePoll,
  applyTelegramBridgeReply,
  applyTelegramConversationDirectory,
  applyTelegramOwnerHandoff,
  buildTelegramBridgePollPlan,
  buildTelegramBridgeReplyPreview,
  buildTelegramConversationDirectoryPreview,
  buildTelegramOwnerHandoffPreview,
  buildTelegramRemoteSurfaceBindingPlan,
  telegramBridgePollResultText,
  telegramBridgePollToolInput,
  telegramBridgeReplyInput,
  telegramBridgeReplyResultText,
  telegramConversationDirectoryInput,
  telegramConversationDirectoryResultText,
  telegramOwnerHandoffInput,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
} from "./messagingTelegramFacade";
import { readJson, withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway runtime lifecycle", () => {
  it("runs the Telegram owner setup loop through directory, handoff, polling, command handling, reply, and cleanup", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-owner-loop-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:05.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for end-to-end owner loop dogfood.",
          diagnostics: ["Root probe only; no provider messages read."],
          bridgeSessionCount: 1,
          bridgeBaseUrl: "http://127.0.0.1:8091",
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: join(stateRoot, "telegram", "owner-profile", "bridge-session.json"),
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-1",
      threads: [
        {
          id: "thread-1",
          title: "Operational Status Check",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:02.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "ambient:fast",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });
    const setupCode = "AMBIENT-HANDOFF-FULL-LOOP-123456";
    const requests: Array<{ method: string; path: string; body?: unknown; apiId?: string; apiHash?: string }> = [];
    let unreadCallCount = 0;

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started).toMatchObject({
        applyStatus: "applied",
        applied: true,
      });

      await withTelegramBridgeServer(
        async (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          const record: { method: string; path: string; body?: unknown; apiId?: string; apiHash?: string } = {
            method: req.method ?? "GET",
            path: `${url.pathname}${url.search}`,
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          };
          if (req.method === "POST") record.body = await readJson(req);
          requests.push(record);

          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats") {
            expect(url.searchParams.get("metadataOnly")).toBe("true");
            writeJson(res, {
              chats: [
                {
                  id: "owner-chat",
                  title: "Owner Remote Control",
                  type: "private",
                  unreadCount: 2,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:02.000Z",
                },
              ],
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/inbox/unread") {
            expect(url.searchParams.get("chatId")).toBe("owner-chat");
            unreadCallCount += 1;
            writeJson(res, {
              messages:
                unreadCallCount === 1
                  ? [
                      {
                        id: "noise-before-handoff",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: "private setup noise must not leak",
                        date: "2026-05-10T00:00:02.000Z",
                      },
                      {
                        id: "handoff-setup",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:03.000Z",
                      },
                    ]
                  : [
                      {
                        id: "handoff-setup",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:03.000Z",
                      },
                      {
                        id: "status-1",
                        chatId: "owner-chat",
                        outgoing: false,
                        text: "status",
                        date: "2026-05-10T00:00:04.000Z",
                      },
                    ],
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (req.method === "GET" && url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (req.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
            writeJson(res, {
              messageId: "reply-1",
              date: "2026-05-10T00:00:06.000Z",
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const env = {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          };

          const directoryPreview = buildTelegramConversationDirectoryPreview({
            toolInput: telegramConversationDirectoryInput({
              profileId: "owner-profile",
              limit: 5,
            }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(directoryPreview.canApplyNow).toBe(true);
          const directoryResult = await applyTelegramConversationDirectory({
            preview: directoryPreview,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
          });
          expect(directoryResult).toMatchObject({
            applyStatus: "applied",
            failureMode: "none",
            conversations: [{ conversationId: "owner-chat", title: "Owner Remote Control" }],
          });
          expect(telegramConversationDirectoryResultText(directoryResult)).toContain("owner-chat: Owner Remote Control");

          const handoffPreview = buildTelegramOwnerHandoffPreview({
            toolInput: telegramOwnerHandoffInput({
              profileId: "owner-profile",
              conversationId: "owner-chat",
              setupCode,
              limit: 5,
            }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(handoffPreview.canApplyNow).toBe(true);
          const handoffResult = await applyTelegramOwnerHandoff({
            preview: handoffPreview,
            setupCode,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
            now: () => new Date("2026-05-10T00:00:04.000Z"),
          });
          expect(handoffResult).toMatchObject({
            applyStatus: "applied",
            handoffStatus: "matched",
            ownerUserId: "owner-1",
            sourceMessageId: "handoff-setup",
          });
          expect(JSON.stringify(handoffResult)).not.toContain("private setup noise");

          const createToolInput = telegramRemoteSurfaceBindingInput({
            action: "create",
            purpose: "remote_ambient_surface",
            profileId: "owner-profile",
            conversationId: "owner-chat",
            ownerUserId: handoffResult.ownerUserId,
            ambientSurface: "projects",
            maxDisclosureLabel: "owner-private-runtime-summary",
            ownerHandoffSourceMessageId: handoffResult.sourceMessageId,
          });
          if (createToolInput.action !== "create") throw new Error("Expected create input.");
          const runtimeProvider = runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib");
          const createPlan = buildTelegramRemoteSurfaceBindingPlan({
            toolInput: createToolInput,
            lifecycle: bindings.previewCreate(telegramRemoteSurfaceBindingCreateInput(createToolInput)),
            readiness: runtimeProvider?.readiness,
            runtimeProvider,
          });
          expect(createPlan.canApplyNow).toBe(true);
          const created = bindings.create(telegramRemoteSurfaceBindingCreateInput(createToolInput));
          const createResult = telegramRemoteSurfaceBindingAppliedResult(createPlan, created);
          expect(createResult).toMatchObject({
            applyStatus: "applied",
            persisted: true,
            lifecycle: {
              binding: {
                metadata: {
                  ownerHandoffSourceMessageId: "handoff-setup",
                },
              },
            },
          });
          expect(telegramRemoteSurfaceBindingText(createResult)).toContain("Telegram Remote Ambient Surface binding applied");

          const pollPlan = buildTelegramBridgePollPlan({
            toolInput: telegramBridgePollToolInput({
              profileId: "owner-profile",
              limit: 5,
            }),
            bindings: bindings.list({ includeInactive: true }),
            runtimeStatus: runner.runtimeStatus(),
            stateRoot,
          });
          expect(pollPlan.canApplyNow).toBe(true);
          const pollResult = await applyTelegramBridgePoll({
            plan: pollPlan,
            bindings: bindings.list({ includeInactive: false }),
            surface,
            stateRoot,
            env,
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(pollResult).toMatchObject({
            applyStatus: "applied",
            fetchedMessageCount: 2,
            duplicateMessageCount: 1,
            candidateMessageCount: 1,
            acceptedDispatchCount: 1,
            droppedDispatchCount: 0,
          });
          expect(telegramBridgePollResultText(pollResult)).toContain("Accepted dispatches: 1");
          const acceptedDispatch = pollResult.bindingResults[0]?.dispatches.find((dispatch) => dispatch.accepted);
          const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
          expect(queuedProjectionId).toBeTruthy();
          expect(telegramBridgePollResultText(pollResult)).toContain(`Queued projection: ${queuedProjectionId}`);

          const commandPreview = buildMessagingRemoteSurfaceCommandPreview({
            toolInput: messagingRemoteSurfaceCommandInput({ queuedProjectionId }),
            bindings: bindings.list({ includeInactive: false }),
            runtimeStatus: runner.runtimeStatus(),
            surface,
          });
          expect(commandPreview).toMatchObject({
            status: "ready",
            commandKind: "show_status",
            approvalRequired: false,
            wouldReadProviderMessages: false,
            wouldSendProviderMessages: false,
          });
          const commandProjection = messagingRemoteSurfaceCommandResultProjection({
            preview: commandPreview,
            bindings: bindings.list({ includeInactive: false }),
            surface,
          });
          expect(commandProjection).toBeTruthy();
          const commandResult = messagingRemoteSurfaceCommandAppliedResult({
            preview: commandPreview,
            approvalRecorded: false,
            projection: commandProjection,
          });
          expect(commandResult).toMatchObject({
            applyStatus: "noop",
            commandKind: "show_status",
            projection: { purpose: "remote_ambient_surface" },
          });
          expect(messagingRemoteSurfaceCommandResultText(commandResult)).toContain("Projection:");

          const replyText = `Ambient status ready: ${commandResult.projection?.title ?? "runtime status"}.`;
          const replyPreview = buildTelegramBridgeReplyPreview({
            toolInput: telegramBridgeReplyInput({
              queuedProjectionId,
              text: replyText,
            }),
            bindings: bindings.list({ includeInactive: false }),
            runtimeStatus: runner.runtimeStatus(),
          });
          expect(replyPreview).toMatchObject({
            status: "ready",
            endpointPath: "/sessions/owner-profile/messages/send",
            replyToMessageId: "status-1",
          });
          const replyResult = await applyTelegramBridgeReply({
            preview: replyPreview,
            approvalRecorded: true,
            env,
            fetchFn: fetch,
            now: () => new Date("2026-05-10T00:00:06.000Z"),
          });
          runner.recordOutboundDelivery(replyResult.delivery);
          expect(replyResult).toMatchObject({
            applyStatus: "sent",
            providerMessageId: "reply-1",
            delivery: {
              status: "sent",
              sourceProjectionId: queuedProjectionId,
              replyToMessageId: "status-1",
            },
          });
          expect(telegramBridgeReplyResultText(replyResult)).toContain("Delivery status: sent");

          const revokeToolInput = telegramRemoteSurfaceBindingInput({
            action: "revoke",
            bindingId: created.binding.id,
            reason: "owner loop dogfood cleanup",
          });
          if (revokeToolInput.action !== "revoke") throw new Error("Expected revoke input.");
          const revokePlan = buildTelegramRemoteSurfaceBindingPlan({
            toolInput: revokeToolInput,
            lifecycle: bindings.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput)),
            readiness: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib")?.readiness,
            runtimeProvider: runner.runtimeStatus().providers.find((provider) => provider.providerId === "telegram-tdlib"),
          });
          expect(revokePlan.canApplyNow).toBe(true);
          const revoked = bindings.revoke(telegramRemoteSurfaceBindingRevokeInput(revokeToolInput));
          const revokeResult = telegramRemoteSurfaceBindingAppliedResult(revokePlan, revoked);
          expect(revokeResult).toMatchObject({
            applyStatus: "applied",
            persisted: true,
            lifecycle: { binding: { status: "revoked" } },
          });
          expect(bindings.list({ includeInactive: false })).toMatchObject({
            activeBindingCount: 0,
            remoteAmbientSurfaceCount: 0,
          });
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /sessions/owner-profile/chats?limit=5&metadataOnly=true",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/handoff-setup/sender-profile",
      "GET /sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "GET /sessions/owner-profile/chats/owner-chat/messages/status-1/sender-profile",
      "POST /sessions/owner-profile/messages/send",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
    const sent = requests.find((request) => request.method === "POST");
    expect(sent?.body).toEqual({
      chatId: "owner-chat",
      text: "Ambient status ready: Projects.",
      replyToMessageId: "status-1",
    });
    expect(runner.runtimeStatus()).toMatchObject({
      outboundDeliveryCount: 1,
      recentOutboundDeliveries: [{ providerMessageId: "reply-1" }],
    });
  });
});
