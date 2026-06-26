import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRemoteSurfaceActivationPrompt } from "../../renderer/src/pluginUiModel";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { registerPluginMessagingActivationDogfoodCases } from "./pluginMessagingActivationDogfoodCases";
import { registerPluginMessagingRemoteSurfaceDogfoodCases } from "./pluginMessagingRemoteSurfaceDogfoodCases";
import { registerPluginMessagingSettingsCommandApplyDogfoodCases } from "./pluginMessagingSettingsCommandApplyDogfoodCases";
import { registerPluginMessagingWorkflowCommandApplyDogfoodCases } from "./pluginMessagingWorkflowCommandApplyDogfoodCases";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { isolatePluginDiscoveryEnv, restoreProcessEnv, seedFixtureMarketplace, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-messaging-dogfood-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
const itTelegramOwnerLoopLive =
  process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" && process.env.AMBIENT_TELEGRAM_OWNER_LOOP_LIVE === "1" ? it : it.skip;

describeNative("Plugin messaging dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-messaging-dogfood-")));
    restoreEnv = isolatePluginDiscoveryEnv(workspacePath);
    await seedFixtureMarketplace(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });

  registerPluginMessagingRemoteSurfaceDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    ProjectStore,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  registerPluginMessagingActivationDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    buildRemoteSurfaceActivationPrompt,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  registerPluginMessagingWorkflowCommandApplyDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  registerPluginMessagingSettingsCommandApplyDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });
  itLive(
    "routes Telegram chat discovery through the typed conversation-directory preview boundary",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory boundary dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );

      const thread = store.createThread("Telegram directory boundary dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Telegram directory boundary dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient Telegram conversation-directory boundary dogfood test.",
            "Call ambient_messaging_list_providers.",
            "Then call ambient_messaging_conversation_directory_preview with providerId telegram-tdlib, authProfileId dogfood-owner, purpose remote_ambient_surface, and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Do not call ambient_messaging_telegram_conversation_directory_apply, lifecycle, shell, browser, Telegram Desktop UI, provider CLI, bridge polling, bridge reply, binding apply, install, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK and include the phrases Telegram provider directory preview, Provider directory tool ambient_messaging_telegram_conversation_directory_preview, real mode blocker, no Telegram messages read, no Telegram messages sent, and no shell/browser fallback.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_list_providers completed");
      expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_preview completed");
      expect(transcript).toContain("Provider directory tool: ambient_messaging_telegram_conversation_directory_preview");
      expect(transcript).toContain("Telegram provider is not running in real mode");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("Sends provider messages: no");
      expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    },
    240_000,
  );

  itLive(
    "dogfoods Telegram directory result through binding and owner-route previews",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory-to-binding dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin !== "http://127.0.0.1:19092") {
          return originalFetch(input as RequestInfo | URL, init);
        }
        if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
          } as Response;
        }
        if ((init?.method ?? "GET") === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              chats: [
                {
                  id: "telegram-dogfood-chat",
                  title: "Dogfood Owner Chat",
                  type: "private",
                  unreadCount: 0,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({ error: "not found" }),
        } as Response;
      }) as typeof fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19092";

      const thread = store.createThread("Telegram directory to binding dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
              request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
              request.toolName === "ambient_messaging_telegram_remote_surface_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Telegram directory-to-binding dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient Telegram directory-to-binding dogfood test.",
            "Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, messageId dogfood-message-1.",
            "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId dogfood-owner, conversationId telegram-dogfood-chat, messageId dogfood-message-1, senderId owner-1, senderLabel Owner, and text status.",
            "Then call ambient_messaging_telegram_relay_diagnostics with profileId dogfood-owner and conversationId telegram-dogfood-chat.",
            "Then call ambient_messaging_telegram_bridge_reply_preview using the queuedProjectionId from the route result and text exactly Ambient received your status request.",
            "Finally call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the create apply result, and reason dogfood cleanup.",
            "Do not call ambient_messaging_telegram_bridge_reply_apply, polling, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK and include the phrases metadata-only directory row, Remote Ambient Surface binding applied, owner route accepted, relay diagnostics ready, reply preview ready, binding revoked, no Telegram messages read, no Telegram messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_gateway_lifecycle_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_apply completed");
      expect(transcript).toContain("Failure mode: none");
      expect(transcript).toContain("telegram-dogfood-chat: Dogfood Owner Chat");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_telegram_relay_diagnostics completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_preview completed");
      expect(transcript).toContain("Bridge mode: real Telegram bridge running");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_reply_apply completed");
    },
    420_000,
  );

  itTelegramOwnerLoopLive(
    "dogfoods Telegram owner handoff through real-mode poll and reply tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      const setupCode = "AMBIENT-HANDOFF-DOGFOOD-123456";
      const sentMessages: unknown[] = [];
      let unreadCallCount = 0;
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin !== "http://127.0.0.1:19093") {
          return originalFetch(input as RequestInfo | URL, init);
        }
        const method = init?.method ?? "GET";
        if (method === "GET" && url.pathname === "/") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
          } as Response;
        }
        if (method === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              chats: [
                {
                  id: "telegram-dogfood-chat",
                  title: "Dogfood Owner Chat",
                  type: "private",
                  unreadCount: 2,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          } as Response;
        }
        if (method === "GET" && url.pathname === "/sessions/dogfood-owner/inbox/unread") {
          unreadCallCount += 1;
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              messages:
                unreadCallCount === 1
                  ? [
                      {
                        id: "dogfood-noise",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: "private setup noise must not leak",
                        date: "2026-05-10T00:00:01.000Z",
                      },
                      {
                        id: "dogfood-handoff",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:02.000Z",
                      },
                    ]
                  : [
                      {
                        id: "dogfood-handoff",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:02.000Z",
                      },
                      {
                        id: "dogfood-status",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: "status",
                        date: "2026-05-10T00:00:03.000Z",
                      },
                    ],
            }),
          } as Response;
        }
        if (
          method === "GET" &&
          (url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-handoff/sender-profile" ||
            url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-status/sender-profile")
        ) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            }),
          } as Response;
        }
        if (method === "POST" && url.pathname === "/sessions/dogfood-owner/messages/send") {
          sentMessages.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              messageId: "dogfood-reply-1",
              date: "2026-05-10T00:00:04.000Z",
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({ error: "not found" }),
        } as Response;
      }) as typeof fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19093";

      const thread = store.createThread("Telegram owner loop dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
              request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
              request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply" ||
              request.toolName === "ambient_messaging_telegram_bridge_reply_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Telegram owner-loop dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 1 of a focused Ambient Telegram owner-loop dogfood test.",
            `Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode ${setupCode}, and ownerUserId owner-1 once handoff returns it.`,
            "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_owner_handoff_preview with profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode from above, and limit 5.",
            "Then call ambient_messaging_telegram_owner_handoff_apply with those same handoff arguments.",
            "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments and ownerHandoffSourceMessageId set to the sourceMessageId from the handoff apply result.",
            "Do not poll, send replies, call bridge_event_route, call synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK and include the phrases owner handoff matched, metadata-only directory row, Remote Ambient Surface binding applied, no Telegram Desktop fallback.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK",
        });
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 2 of the same Telegram owner-loop dogfood test.",
            "Use the existing active dogfood-owner Remote Ambient Surface binding from step 1.",
            "Then call ambient_messaging_telegram_bridge_poll_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_bridge_poll_apply with profileId dogfood-owner and limit 5.",
            "Read the queued projection id from the poll apply result or gateway status.",
            "Then call ambient_messaging_remote_surface_command_preview with that queuedProjectionId.",
            "Then call ambient_messaging_remote_surface_command_apply with that same queuedProjectionId.",
            "Then call ambient_messaging_telegram_bridge_reply_preview with that same queuedProjectionId and text exactly Ambient status ready from owner loop dogfood.",
            "Then call ambient_messaging_telegram_bridge_reply_apply with that same queuedProjectionId and exact text.",
            "Do not call ambient_messaging_telegram_bridge_event_route, ambient_messaging_synthetic_route, lifecycle, directory, handoff, binding create, binding revoke, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK and include the phrases real-mode poll accepted, queued projection id visible, Remote Ambient Surface command apply, Telegram reply sent, no synthetic route.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK",
        });
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 3 of the same Telegram owner-loop dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the step 1 create apply result, and reason dogfood cleanup.",
            "Do not call polling, reply, bridge_event_route, synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool result, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK and include the phrase binding revoked.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_owner_handoff_apply completed");
      expect(transcript).toContain("Use ownerUserId owner-1");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_poll_apply completed");
      expect(transcript).toContain("Queued projection:");
      expect(transcript).toContain("Duplicate messages: 1");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_apply completed");
      expect(transcript).toContain("Delivery status: sent");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).not.toContain("ambient_messaging_synthetic_route completed");
      expect(transcript).not.toContain("private setup noise must not leak");
      expect(sentMessages).toEqual([
        {
          chatId: "telegram-dogfood-chat",
          text: "Ambient status ready from owner loop dogfood",
          replyToMessageId: "dogfood-status",
        },
      ]);
    },
    420_000,
  );
});
