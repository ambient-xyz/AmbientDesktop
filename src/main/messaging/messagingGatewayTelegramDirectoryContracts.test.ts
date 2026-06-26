import { describe, expect, it } from "vitest";
import type { MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  buildMessagingConversationDirectoryPreview,
  messagingConversationDirectoryInput,
  messagingConversationDirectoryPreviewText,
} from "./messagingConversationDirectory";
import {
  applyTelegramConversationDirectory,
  applyTelegramOwnerHandoff,
  buildTelegramConversationDirectoryPreview,
  buildTelegramOwnerHandoffPreview,
  telegramConversationDirectoryBlockedResult,
  telegramConversationDirectoryInput,
  telegramConversationDirectoryPreviewText,
  telegramConversationDirectoryResultText,
  telegramOwnerHandoffInput,
  telegramOwnerHandoffPreviewText,
  telegramOwnerHandoffResultText,
} from "./messagingTelegramFacade";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import { withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway Telegram directory contracts", () => {
  it("previews conversation-directory readiness without listing provider chats", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "binding-owner-chat",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
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
          message: "Telegram readiness test fixture.",
          diagnostics: ["No provider messages read."],
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
        }),
      },
    });
    await runner.refreshProviderReadiness("telegram-tdlib");

    const preview = buildMessagingConversationDirectoryPreview({
      toolInput: messagingConversationDirectoryInput({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        purpose: "remote_ambient_surface",
      }),
      providers,
      bindings: bindings.list({ includeInactive: false }),
      runtimeStatus: runner.runtimeStatus(),
    });

    expect(preview).toMatchObject({
      status: "limited",
      providerCount: 1,
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      },
      providers: [
        {
          providerId: "telegram-tdlib",
          status: "limited",
          mode: "existing-bindings-only",
          conversationDiscoveryDeclared: true,
          canListProviderConversationsNow: false,
          providerDirectoryTool: "ambient_messaging_telegram_conversation_directory_preview",
          knownAuthProfiles: [
            {
              profileId: "owner-profile",
              metadataReadable: true,
            },
          ],
          knownConversations: [
            {
              conversationId: "owner-chat",
              bindingId: "binding-owner-chat",
              purpose: "remote_ambient_surface",
            },
          ],
        },
      ],
    });
    expect(preview.providers[0].blockers.join("\n")).toContain("requires the Telegram provider to be running in real mode");
    expect(messagingConversationDirectoryPreviewText(preview)).toContain(
      "Provider directory tool: ambient_messaging_telegram_conversation_directory_preview",
    );
    expect(messagingConversationDirectoryPreviewText(preview)).toContain("Known conversations from bindings: 1");
  });

  it("previews and applies sanitized Telegram conversation-directory metadata", async () => {
    const runtimeStatus = telegramDirectoryRuntimeStatus();
    const preview = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      }),
      runtimeStatus,
    });

    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      profileId: "owner-profile",
      endpointPath: "/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops",
      safety: {
        startsBridge: false,
        readsProviderHistory: false,
        readsProviderMessages: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
        returnsProviderMessageContent: false,
        readsProviderConversationMetadata: true,
      },
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        executionStatus: "preview",
        requiresApprovalForApply: true,
        approvalRecorded: false,
        canApplyWithReadiness: true,
        returnedConversationCount: 0,
      },
    });
    expect(telegramConversationDirectoryPreviewText(preview)).toContain("strips any bridge payload fields such as lastMessage");
    expect(telegramConversationDirectoryPreviewText(preview)).not.toContain("Bridge may return lastMessage payload");

    const requests: Array<{ url: string; headers?: HeadersInit }> = [];
    const result = await applyTelegramConversationDirectory({
      preview,
      approvalRecorded: true,
      env: {
        AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: "http://127.0.0.1:8091",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret",
      },
      fetchFn: async (url, init) => {
        requests.push({ url, headers: init?.headers });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [
              {
                id: "telegram-chat-1",
                title: "Ops",
                type: "private",
                unreadCount: 2,
                folderIds: [1],
                updatedAt: "2026-05-10T00:00:00.000Z",
              },
            ],
          }),
        };
      },
    });

    expect(requests[0].url).toBe("http://127.0.0.1:8091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops");
    expect(requests[0].headers).toMatchObject({
      "x-telegram-api-id": "123",
      "x-telegram-api-hash": "secret",
    });
    expect(result).toMatchObject({
      applyStatus: "applied",
      failureMode: "none",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          type: "private",
          unreadCount: 2,
          folderIds: [1],
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
      adapterExecution: {
        kind: "messaging-conversation-directory-adapter-execution",
        adapterStatus: "available",
        adapterKind: "live-metadata-only-adapter",
        executionStatus: "applied",
        approvalRecorded: true,
        fetchedConversationCount: 1,
        returnedConversationCount: 1,
      },
    });
    expect(telegramConversationDirectoryResultText(result)).toContain("telegram-chat-1: Ops");
    expect(telegramConversationDirectoryResultText(result)).toContain("Failure mode: none");
    expect(telegramConversationDirectoryResultText(result)).toContain("Directory adapter execution:");
    expect(telegramConversationDirectoryResultText(result)).toContain("Execution status: applied");
  });

  it("strips Telegram directory bridge payload fields before returning metadata", async () => {
    const preview = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });

    const result = await applyTelegramConversationDirectory({
      preview,
      approvalRecorded: true,
      env: {
        AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: "http://127.0.0.1:8091",
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "secret",
      },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          chats: [
            {
              id: "telegram-chat-1",
              title: "Ops",
              lastMessage: { text: "must not be visible" },
            },
          ],
        }),
      }),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      failureMode: "none",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          folderIds: [],
        },
      ],
      warnings: [
        "Telegram bridge returned provider message payload fields for 1 conversation(s); Ambient stripped them before returning directory metadata.",
      ],
      adapterExecution: {
        executionStatus: "applied",
        fetchedConversationCount: 1,
        returnedConversationCount: 1,
      },
    });
    expect(telegramConversationDirectoryResultText(result)).toContain("Failure mode: none");
    expect(telegramConversationDirectoryResultText(result)).toContain("metadataOnly=true");
    expect(JSON.stringify(result)).not.toContain("must not be visible");
  });

  it("explains Telegram directory blockers as actionable failure modes", async () => {
    const notRunning = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "owner-profile",
        limit: 5,
      }),
      runtimeStatus: {
        ...telegramDirectoryRuntimeStatus(),
        providers: [
          {
            ...telegramDirectoryRuntimeStatus().providers[0],
            state: "stopped",
            mode: "none",
          },
        ],
      },
    });
    const notRunningResult = telegramConversationDirectoryBlockedResult(notRunning);
    expect(notRunningResult).toMatchObject({
      applyStatus: "blocked",
      failureMode: "not-running-real-mode",
      adapterExecution: {
        executionStatus: "blocked",
        failureMode: "not-running-real-mode",
      },
    });
    expect(telegramConversationDirectoryResultText(notRunningResult)).toContain("Start or attach the Telegram provider");

    const missingProfile = buildTelegramConversationDirectoryPreview({
      toolInput: telegramConversationDirectoryInput({
        profileId: "missing-profile",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });
    const missingProfileResult = telegramConversationDirectoryBlockedResult(missingProfile);
    expect(missingProfileResult).toMatchObject({
      applyStatus: "blocked",
      failureMode: "missing-auth-profile",
      adapterExecution: {
        executionStatus: "blocked",
        failureMode: "missing-auth-profile",
      },
    });
    expect(telegramConversationDirectoryResultText(missingProfileResult)).toContain("pass an exact profileId");
  });

  it("performs Telegram owner handoff through an exact setup-code match without exposing other message text", async () => {
    const preview = buildTelegramOwnerHandoffPreview({
      toolInput: telegramOwnerHandoffInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
        setupCode: "AMBIENT-HANDOFF-123456",
        limit: 5,
      }),
      runtimeStatus: telegramDirectoryRuntimeStatus(),
    });
    expect(preview).toMatchObject({
      status: "ready",
      canApplyNow: true,
      endpointPath: "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      safety: {
        readsProviderUnreadMessages: true,
        filtersExactSetupCode: true,
        resolvesSenderProfiles: true,
        returnsProviderMessageContent: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      },
    });
    expect(telegramOwnerHandoffPreviewText(preview)).toContain("does not return provider message bodies");

    const requests: Array<{ path: string; apiId?: string; apiHash?: string }> = [];
    const result = await withTelegramBridgeServer(
      (req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        requests.push({
          path: `${url.pathname}${url.search}`,
          apiId: req.headers["x-telegram-api-id"] as string | undefined,
          apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
        });
        if (url.pathname === "/sessions/owner-profile/inbox/unread") {
          expect(url.searchParams.get("chatId")).toBe("owner-chat");
          writeJson(res, {
            messages: [
              {
                id: "private-1",
                chatId: "owner-chat",
                outgoing: false,
                text: "private body must not leak",
                date: "2026-05-10T00:00:01.000Z",
              },
              {
                id: "handoff-1",
                chatId: "owner-chat",
                outgoing: false,
                text: "AMBIENT-HANDOFF-123456",
                date: "2026-05-10T00:00:02.000Z",
              },
              {
                id: "outgoing-echo",
                chatId: "owner-chat",
                outgoing: true,
                text: "AMBIENT-HANDOFF-123456",
              },
            ],
          });
          return;
        }
        if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/handoff-1/sender-profile") {
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
        res.statusCode = 404;
        writeJson(res, { error: "not found" });
      },
      async (baseUrl) =>
        await applyTelegramOwnerHandoff({
          preview,
          setupCode: "AMBIENT-HANDOFF-123456",
          approvalRecorded: true,
          env: {
            AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
            AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
            AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
          },
          fetchFn: fetch,
          now: () => new Date("2026-05-10T00:00:03.000Z"),
        }),
    );

    expect(result).toMatchObject({
      applyStatus: "applied",
      handoffStatus: "matched",
      fetchedMessageCount: 3,
      candidateMessageCount: 2,
      matchedMessageCount: 1,
      matchedSenderCount: 1,
      ownerUserId: "owner-1",
      ownerLabel: "Owner",
      sourceMessageId: "handoff-1",
      receivedAt: "2026-05-10T00:00:02.000Z",
    });
    expect(telegramOwnerHandoffResultText(result)).toContain("Use ownerUserId owner-1");
    expect(JSON.stringify(result)).not.toContain("private body must not leak");
    expect(telegramOwnerHandoffResultText(result)).not.toContain("private body must not leak");
    expect(requests).toEqual([
      {
        path: "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
        apiId: "12345",
        apiHash: "test-hash",
      },
      {
        path: "/sessions/owner-profile/chats/owner-chat/messages/handoff-1/sender-profile",
        apiId: "12345",
        apiHash: "test-hash",
      },
    ]);
  });

  it("blocks Telegram owner handoff before real-mode readiness", () => {
    const preview = buildTelegramOwnerHandoffPreview({
      toolInput: telegramOwnerHandoffInput({
        profileId: "owner-profile",
        conversationId: "owner-chat",
        setupCode: "AMBIENT-HANDOFF-123456",
      }),
      runtimeStatus: {
        ...telegramDirectoryRuntimeStatus(),
        providers: [
          {
            ...telegramDirectoryRuntimeStatus().providers[0],
            state: "stopped",
            mode: "none",
          },
        ],
      },
    });
    expect(preview.canApplyNow).toBe(false);
    expect(preview.safety.readsProviderUnreadMessages).toBe(false);
    expect(preview.blockers).toContain(
      "Telegram provider is not running in real mode; use the approved gateway lifecycle path before owner handoff.",
    );
    expect(telegramOwnerHandoffPreviewText(preview)).toContain("Do not use Telegram Desktop scraping");
  });
});

function telegramDirectoryRuntimeStatus(): MessagingGatewayRuntimeStatus {
  return {
    status: "idle",
    providerCount: 1,
    activeProviderCount: 1,
    syntheticActiveProviderCount: 0,
    queuedProjectionCount: 0,
    recentEventCount: 0,
    outboundDeliveryCount: 0,
    queuedProjections: [],
    recentOutboundDeliveries: [],
    recentEvents: [],
    providers: [
      {
        providerId: "telegram-tdlib",
        label: "Telegram",
        state: "running",
        mode: "real",
        syntheticEventCount: 0,
        realEventCount: 0,
        queuedProjectionCount: 0,
        readiness: {
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Telegram readiness test fixture.",
          diagnostics: ["Root probe only; no provider messages read."],
          sessions: [
            {
              profileId: "owner-profile",
              metadataPath: "/tmp/telegram/owner-profile/bridge-session.json",
              metadataReadable: true,
              tdlibStateDirPresent: true,
              phoneNumberPresent: true,
              databaseEncryptionKeyPresent: true,
            },
          ],
          bridgeBaseUrl: "http://127.0.0.1:8091",
        },
      },
    ],
  };
}
