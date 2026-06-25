/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { restoreProcessEnv, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

interface PluginMessagingActivationDogfoodDeps {
  AgentRuntime: new (...args: any[]) => any;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  buildRemoteSurfaceActivationPrompt: (providerId?: "choose" | "telegram" | "signal") => string;
  getStore: () => any;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: any) => void;
}

export function registerPluginMessagingActivationDogfoodCases(deps: PluginMessagingActivationDogfoodDeps): void {
  const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as any, {
    get(_target, property) {
      const current = deps.getStore();
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as any;
  let runtime: any;
  const createRuntime = (...args: any[]) => {
    const value = new deps.AgentRuntime(...args);
    runtime = value;
    deps.setRuntime(value);
    return value;
  };

  itLive(
    "uses Telegram owner-loop activation plan before low-level setup tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop activation plan dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19133";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "activation-plan-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "activation-plan-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "activation-plan-owner",
            phoneNumber: "+15550000999",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-activation-plan-key",
          },
          null,
          2,
        ),
        "utf8",
      );
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin === "http://127.0.0.1:19133" && url.pathname === "/") {
          return new Response(
            JSON.stringify({
              ok: true,
              stateRoot: join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.origin !== "http://127.0.0.1:19133") {
          return originalFetch(input, init);
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const thread = store.createThread("Telegram owner-loop activation plan dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Telegram owner-loop activation plan dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient Telegram owner-loop activation planning dogfood test.",
            "Call ambient_messaging_telegram_owner_loop_activation_plan exactly once with profileId activation-plan-owner, setupCode AMBIENT-OWNER-LOOP-ACTIVATION-DOGFOOD, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and minReceivedAt 2026-05-10T00:00:06.000Z.",
            "Do not call lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Telegram Desktop UI, provider CLI, install, or send-message tools.",
            "After checking the tool result, answer starting with TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_OK and include the phrases Telegram owner-loop activation plan, provider-readiness, metadata-directory, owner-handoff, owner-binding, periodic-polling, command-and-relay-preview, no provider message reads, no Telegram Desktop fallback, and minReceivedAt.",
          ],
          expected: "TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
      expect(transcript).toContain("Telegram owner-loop activation plan");
      expect(transcript).toContain("provider-readiness");
      expect(transcript).toContain("metadata-directory");
      expect(transcript).toContain("owner-handoff");
      expect(transcript).toContain("owner-binding");
      expect(transcript).toContain("periodic-polling");
      expect(transcript).toContain("command-and-relay-preview");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("minReceivedAt");
      expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_owner_handoff_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_polling_apply completed");
    },
    180_000,
  );

  itLive(
    "routes ordinary Remote Ambient Surface setup through product shortcut before Telegram plan",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface shortcut dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19136";
      const profileId = "remote-shortcut-owner";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", profileId, "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", profileId, "bridge-session.json"),
        JSON.stringify(
          {
            profileId,
            phoneNumber: "+15550001002",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-remote-shortcut-key",
          },
          null,
          2,
        ),
        "utf8",
      );
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (url.origin === "http://127.0.0.1:19136" && url.pathname === "/") {
          return new Response(
            JSON.stringify({
              ok: true,
              stateRoot: join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.origin !== "http://127.0.0.1:19136") {
          return originalFetch(input, init);
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const thread = store.createThread("Remote Ambient Surface shortcut dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface shortcut dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            deps.buildRemoteSurfaceActivationPrompt("telegram"),
            "",
            "Dogfood constraint: this is the Settings Remote control Telegram route-ready entrypoint.",
            "For the Telegram plan use profileId remote-shortcut-owner, setupCode AMBIENT-OWNER-LOOP-SHORTCUT-DOGFOOD, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and minReceivedAt 2026-05-10T00:00:06.000Z.",
            "Do not call lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Telegram Desktop UI, provider CLI, install, or send-message tools.",
            "After checking the tool results, answer starting with REMOTE_SURFACE_ACTIVATION_SHORTCUT_OK and include the phrases Remote Ambient Surface activation, activation plan first tool, Telegram owner-loop activation plan, no provider message reads, preview before send, and no generic Messaging Connector fallback.",
          ],
          expected: "REMOTE_SURFACE_ACTIVATION_SHORTCUT_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      const shortcutIndex = transcript.indexOf("ambient_messaging_remote_surface_activation_plan completed");
      const telegramPlanIndex = transcript.indexOf("ambient_messaging_telegram_owner_loop_activation_plan completed");
      expect(shortcutIndex).toBeGreaterThanOrEqual(0);
      expect(telegramPlanIndex).toBeGreaterThan(shortcutIndex);
      expect(transcript).toContain("Remote Ambient Surface activation");
      expect(transcript).toContain("Activation plan first tool: ambient_messaging_telegram_owner_loop_activation_plan");
      expect(transcript).toContain("Telegram owner-loop activation plan");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("preview before send");
      expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_owner_handoff_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_polling_apply completed");
    },
    180_000,
  );

  itLive(
    "routes unsupported Remote Ambient Surface setup through product repair card",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error(
          "Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live unsupported Remote Ambient Surface shortcut dogfood.",
        );
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Remote Ambient Surface unsupported-provider dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during unsupported Remote Ambient Surface shortcut dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          deps.buildRemoteSurfaceActivationPrompt("signal"),
          "",
          "Dogfood constraint: this is the Settings Remote control unsupported-provider entrypoint.",
          "Do not call ambient_messaging_telegram_owner_loop_activation_plan, Signal low-level tools, lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Signal Desktop UI, signal-cli, provider CLI, install, send-message tools, generic Messaging Connector setup, or external messaging tools.",
          "After checking the tool result, answer starting with REMOTE_SURFACE_UNSUPPORTED_PROVIDER_OK and include the phrases Remote Ambient Surface activation, unsupported_provider, Signal, No reviewed Remote Ambient Surface activation shortcut exists for Signal, no generic Messaging Connector fallback, no provider message reads, and no provider sends.",
        ],
        expected: "REMOTE_SURFACE_UNSUPPORTED_PROVIDER_OK",
      });

      expect(transcript).toContain("ambient_messaging_remote_surface_activation_plan completed");
      expect(transcript).toContain("Status: unsupported_provider");
      expect(transcript).toContain("Requested provider: Signal");
      expect(transcript).toContain("No reviewed Remote Ambient Surface activation shortcut exists for Signal");
      expect(transcript).toContain("no generic Messaging Connector fallback");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("Sends provider messages: no");
      expect(transcript).not.toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
      expect(transcript).not.toContain("ambient_messaging_signal_conversation_directory_preview completed");
      expect(transcript).not.toContain("ambient_messaging_signal_owner_handoff_preview completed");
      expect(transcript).not.toContain("ambient_messaging_signal_remote_surface_preview completed");
      expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
      expect(transcript).not.toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_preview completed");
    },
    180_000,
  );

  itLive(
    "plans unsupported Remote Ambient Surface provider support without provider improvisation",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface provider-support dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Remote Ambient Surface provider-support planning dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface provider-support dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          deps.buildRemoteSurfaceActivationPrompt("signal"),
          "",
          "Dogfood constraint: this is the unsupported-provider Plan provider support card action, not active Signal activation.",
          "First call ambient_messaging_remote_surface_activation_plan with requestText exactly: set up Signal remote control for Ambient Desktop projects.",
          "After it returns unsupported_provider, call ambient_messaging_remote_surface_provider_support_plan with provider exactly Signal, ambientSurface projects, and blockerContext from the activation result.",
          "Do not call ambient_messaging_telegram_owner_loop_activation_plan, Signal low-level tools, lifecycle, directory, owner handoff, binding preview/apply, polling, gateway status, command preview/apply, relay, shell, browser, Signal Desktop UI, signal-cli, provider CLI, install, scaffold, send-message tools, generic Messaging Connector setup, or external messaging tools.",
          "After checking both tool results, answer starting with REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_OK and include the phrases provider onboarding/planning, reviewed adapter, owner-auth constraints, headless support, approval gates, validation targets, Signal Desktop being installed is not an activation route, no provider message reads, no provider sends, no dependency installation, and no generic Messaging Connector fallback.",
        ],
        expected: "REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_OK",
      });

      const activationIndex = transcript.indexOf("ambient_messaging_remote_surface_activation_plan completed");
      const providerSupportIndex = transcript.indexOf("ambient_messaging_remote_surface_provider_support_plan completed");
      expect(activationIndex).toBeGreaterThanOrEqual(0);
      expect(providerSupportIndex).toBeGreaterThan(activationIndex);
      expect(transcript).toContain("Status: unsupported_provider");
      expect(transcript).toContain("Remote Ambient Surface provider support plan");
      expect(transcript).toContain("Status: planning_ready");
      expect(transcript).toContain("Owner-auth constraints:");
      expect(transcript).toContain("Headless support requirements:");
      expect(transcript).toContain("Approval gates:");
      expect(transcript).toContain("Validation targets:");
      expect(transcript).toContain("Signal Desktop being installed is not an activation route");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("Sends provider messages: no");
      expect(transcript).toContain("Installs dependencies: no");
      expect(transcript).toContain("Scaffolds provider support: no");
      expect(transcript).toContain("no generic Messaging Connector fallback");
      expect(transcript).not.toContain("ambient_messaging_telegram_owner_loop_activation_plan completed");
      expect(transcript).not.toContain("ambient_messaging_signal_conversation_directory_preview completed");
      expect(transcript).not.toContain("ambient_messaging_signal_owner_handoff_preview completed");
      expect(transcript).not.toContain("ambient_messaging_signal_remote_surface_preview completed");
      expect(transcript).not.toContain("ambient_messaging_gateway_lifecycle_apply completed");
      expect(transcript).not.toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_preview completed");
    },
    180_000,
  );

  itLive(
    "drives Telegram owner-loop activation plan through periodic polling without provider send",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop activation flow dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      const profileId = "activation-flow-owner";
      const conversationId = "activation-flow-chat";
      const setupCode = "AMBIENT-OWNER-LOOP-ACTIVATION-FLOW";
      const commandFreshness = "2026-05-10T00:00:03.000Z";
      let unreadCallCount = 0;
      const sentMessages: unknown[] = [];
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19134";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", profileId, "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", profileId, "bridge-session.json"),
        JSON.stringify(
          {
            profileId,
            phoneNumber: "+15550001000",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-activation-flow-key",
          },
          null,
          2,
        ),
        "utf8",
      );
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin !== "http://127.0.0.1:19134") {
          return originalFetch(input, init);
        }
        const method = init?.method ?? "GET";
        if (method === "GET" && url.pathname === "/") {
          return new Response(
            JSON.stringify({
              ok: true,
              stateRoot: join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (method === "GET" && url.pathname === `/sessions/${profileId}/chats`) {
          return new Response(
            JSON.stringify({
              chats: [
                {
                  id: conversationId,
                  title: "Activation Flow Owner Chat",
                  type: "private",
                  unreadCount: 3,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:04.000Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (method === "GET" && url.pathname === `/sessions/${profileId}/inbox/unread`) {
          unreadCallCount += 1;
          return new Response(
            JSON.stringify({
              messages: [
                {
                  id: `activation-stale-${unreadCallCount}`,
                  chatId: conversationId,
                  outgoing: false,
                  text: "old private backlog must not route",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: "activation-handoff",
                  chatId: conversationId,
                  outgoing: false,
                  text: setupCode,
                  date: "2026-05-10T00:00:02.000Z",
                },
                {
                  id: "activation-status",
                  chatId: conversationId,
                  outgoing: false,
                  text: "status",
                  date: "2026-05-10T00:00:04.000Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (
          method === "GET" &&
          url.pathname.startsWith(`/sessions/${profileId}/chats/${conversationId}/messages/`) &&
          url.pathname.endsWith("/sender-profile")
        ) {
          return new Response(
            JSON.stringify({
              sender: {
                kind: "user",
                user: {
                  userId: "activation-owner-1",
                  displayName: "Activation Owner",
                },
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (method === "POST" && url.pathname === `/sessions/${profileId}/messages/send`) {
          sentMessages.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
          return new Response(
            JSON.stringify({
              messageId: "unexpected-provider-send",
              date: "2026-05-10T00:00:05.000Z",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const thread = store.createThread("Telegram owner-loop activation flow dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
              request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
              request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Telegram owner-loop activation flow dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = "";
      try {
        const setupTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 1 of a plan-driven Telegram owner-loop activation dogfood test.",
            `Call ambient_messaging_telegram_owner_loop_activation_plan as the first tool with profileId ${profileId}, setupCode ${setupCode}, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
            "Then follow the plan's provider-readiness phase by calling ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
            `Then follow metadata-directory: call ambient_messaging_telegram_conversation_directory_preview with profileId ${profileId} and limit 5, then ambient_messaging_telegram_conversation_directory_apply with profileId ${profileId} and limit 5.`,
            `Then follow owner-handoff: call ambient_messaging_telegram_owner_handoff_preview with profileId ${profileId}, conversationId ${conversationId}, setupCode ${setupCode}, and limit 5, then ambient_messaging_telegram_owner_handoff_apply with the same fields.`,
            `Then follow owner-binding: call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId ${profileId}, conversationId ${conversationId}, ownerUserId activation-owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.`,
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields and ownerHandoffSourceMessageId from the owner handoff result.",
            `Then call ambient_messaging_telegram_owner_loop_activation_plan again with profileId ${profileId}, conversationId ${conversationId}, setupCode ${setupCode}, ownerUserId activation-owner-1, ownerHandoffSourceMessageId activation-handoff, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
            "Do not poll, preview replies, apply replies, call Telegram Desktop, shell, browser, provider CLI, install, or send-message tools in this step.",
            "After checking the tool results, answer with exactly TELEGRAM_ACTIVATION_FLOW_SETUP_OK and include the phrases activation plan first, metadata-only directory row, owner handoff matched, Remote Ambient Surface binding applied, recommended next tool ambient_messaging_telegram_bridge_polling_preview, and no Telegram Desktop fallback.",
          ],
          expected: "TELEGRAM_ACTIVATION_FLOW_SETUP_OK",
        });
        transcript += `\n${setupTranscript}`;

        const pollingTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 2 of the same plan-driven Telegram owner-loop activation dogfood test.",
            `Use the active ${profileId} Remote Ambient Surface binding from step 1.`,
            `Call ambient_messaging_telegram_bridge_polling_preview with action start, profileId ${profileId}, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
            `Then call ambient_messaging_telegram_bridge_polling_apply with action start, profileId ${profileId}, minReceivedAt ${commandFreshness}, intervalMs 300000, and limit 5.`,
            "Then call ambient_messaging_telegram_bridge_polling_status and ambient_messaging_gateway_status.",
            "Read the queuedProjectionId from the immediate poll result or gateway status, then call ambient_messaging_remote_surface_command_preview with that queuedProjectionId.",
            "Then call ambient_messaging_remote_surface_command_apply with the same queuedProjectionId.",
            "Then call ambient_messaging_gateway_status again and call ambient_messaging_remote_surface_reply_preview with only the completed runtimeEventId from gateway status. Do not provide text and do not apply the reply.",
            "Then cleanup: call ambient_messaging_telegram_bridge_polling_preview with action stop, then ambient_messaging_telegram_bridge_polling_apply with action stop.",
            "Finally call ambient_messaging_telegram_remote_surface_apply with action revoke, the active bindingId from step 1, and reason activation flow dogfood cleanup.",
            "Do not call ambient_messaging_remote_surface_reply_apply, ambient_messaging_telegram_bridge_reply_apply, one-shot poll tools, Telegram Desktop, shell, browser, provider CLI, install, or send-message tools.",
            "After checking the tool results, answer with exactly TELEGRAM_ACTIVATION_FLOW_PERIODIC_OK and include the phrases periodic polling start applied, stale backlog stayed stale, Remote Ambient Surface command apply, provider-neutral relay preview ready, polling stopped, binding revoked, no provider reply sent, and no provider message bodies returned.",
          ],
          expected: "TELEGRAM_ACTIVATION_FLOW_PERIODIC_OK",
        });
        transcript += `\n${pollingTranscript}`;
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      const planIndex = transcript.indexOf("ambient_messaging_telegram_owner_loop_activation_plan completed");
      const lifecycleIndex = transcript.indexOf("ambient_messaging_gateway_lifecycle_apply completed");
      expect(planIndex).toBeGreaterThanOrEqual(0);
      expect(lifecycleIndex).toBeGreaterThan(planIndex);
      expect((transcript.match(/ambient_messaging_telegram_owner_loop_activation_plan completed/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(transcript).toContain("Recommended next tool: ambient_messaging_telegram_bridge_polling_preview");
      expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_owner_handoff_apply completed");
      expect(transcript).toContain("Use ownerUserId activation-owner-1");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_apply completed");
      expect(transcript).toContain("Immediate poll:");
      expect(transcript).toContain("Accepted dispatches: 1");
      expect(transcript).toContain("Stale messages before minReceivedAt");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
      expect(transcript).toContain("State: stopped");
      expect(transcript).not.toContain("ambient_messaging_remote_surface_reply_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_reply_apply completed");
      expect(transcript).not.toContain("old private backlog must not route");
      expect(sentMessages).toEqual([]);
      expect(unreadCallCount).toBeGreaterThanOrEqual(2);
    },
    420_000,
  );
}
