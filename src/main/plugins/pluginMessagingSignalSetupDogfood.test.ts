import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
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

describeNative("Plugin messaging Signal setup dogfood", () => {
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

  itLive(
    "recognizes the planned Signal messaging provider stub without using it",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live messaging provider stub dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Signal provider stub dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Signal provider stub dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging provider stub dogfood test.",
          "Call ambient_messaging_list_providers.",
          "Then call ambient_messaging_conversation_directory_preview with providerId signal-cli and purpose remote_ambient_surface.",
          "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
          "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. It should return blocked without approval or provider I/O.",
          "Then call ambient_messaging_remote_surface_binding_preview with action create, providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
          "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. It should return blocked without approval or provider I/O.",
          "Then call ambient_messaging_remote_surface_event_preview with providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, senderId signal-owner, and text status.",
          "Then call ambient_messaging_gateway_status.",
          "Do not call any lifecycle, binding apply, bridge, polling, reply, shell, browser, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_STUB_OK and include the phrases Signal planned provider, metadata-only, implementation planned, bindings disabled, runtime disabled, Signal readiness unavailable, Provider directory tool ambient_messaging_signal_conversation_directory_preview, Signal directory apply blocked, Signal binding readiness blocked, Signal owner handoff blocked, Signal owner handoff apply blocked, Handoff status not-attempted, Can feed binding apply no, Generic binding apply no, Telegram owner handoff no, no Signal messages read, no Signal messages sent, Typed apply tool none, and Typed route tool none.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_STUB_OK",
      });

      expect(transcript).toContain("ambient_messaging_list_providers completed");
      expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_binding_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_event_preview completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("Signal (signal-cli)");
      expect(transcript).toContain("Implementation: planned");
      expect(transcript).toContain("Readiness: unavailable");
      expect(transcript).toContain("Binding lifecycle: disabled");
      expect(transcript).toContain("Inbound ingestion: disabled");
      expect(transcript).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
      expect(transcript).toContain("Signal conversation directory result: blocked");
      expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
      expect(transcript).toContain("Signal owner handoff preview: blocked");
      expect(transcript).toContain("Signal owner handoff apply: blocked");
      expect(transcript).toContain("Handoff status: not-attempted");
      expect(transcript).toContain("Can feed binding apply: no");
      expect(transcript).toContain("Reads Signal unread messages: no");
      expect(transcript).toContain("Generic binding apply allowed: no");
      expect(transcript).toContain("Telegram owner handoff allowed: no");
      expect(transcript).toContain("Uses Telegram owner handoff: no");
      expect(transcript).toContain("Typed apply tool: none");
      expect(transcript).toContain("Typed route tool: none");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_STUB_OK");
      expect(transcript).toContain("no Signal messages read");
      expect(transcript).toContain("no Signal messages sent");
    },
    240_000,
  );

  itLive(
    "records Signal setup metadata without provider I/O",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal setup metadata dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config");
      await mkdir(signalConfigDir, { recursive: true });
      const thread = store.createThread("Signal setup metadata dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging Signal setup metadata dogfood test.",
          `Call ambient_messaging_signal_session_preview with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          `Then call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          "Then call ambient_messaging_gateway_status.",
          "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, conversation directory apply, binding apply, polling, reply, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_SETUP_OK and include the phrases Signal setup metadata written, no Signal messages read, no Signal messages sent, Signal runtime disabled, and Signal readiness unavailable.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_SETUP_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_session_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("Signal session setup apply");
      expect(transcript).toContain("Apply status: applied");
      expect(transcript).toContain("Readiness: unavailable");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_SETUP_OK");
      expect(transcript).toContain("no Signal messages read");
      expect(transcript).toContain("no Signal messages sent");
    },
    240_000,
  );

  itLive(
    "recognizes a fake Signal bridge contract without enabling Signal sends",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal bridge contract dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config");
      await mkdir(signalConfigDir, { recursive: true });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      const previousSignalOwnerHandoffFakeApply = process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;
      const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      let unreadWindowRequestCount = 0;
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: true,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/conversations?metadataOnly=true&limit=5&query=dogfood") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              conversations: [
                {
                  conversationId: "signal-dogfood-conversation",
                  title: "Signal Dogfood",
                  type: "direct",
                  unreadCount: 1,
                  folderIds: [],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/conversations/signal-dogfood-conversation/unread?limit=5") {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              conversationId: "signal-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-dogfood-setup-message",
                  senderId: "signal-owner",
                  senderLabel: "Signal Owner",
                  text: "ambient-signal-setup-code-12345",
                  receivedAt: "2026-05-10T00:00:00.000Z",
                  outgoing: false,
                },
                {
                  messageId: "signal-dogfood-other-message",
                  senderId: "other-sender",
                  text: "private text that must not leak",
                  receivedAt: "2026-05-10T00:00:01.000Z",
                  outgoing: false,
                },
                ...(unreadWindowRequestCount >= 2
                  ? [
                      {
                        messageId: "signal-dogfood-command-message",
                        senderId: "signal-owner",
                        senderLabel: "Signal Owner",
                        text: "show projects private command must not leak",
                        receivedAt: "2026-05-10T00:00:02.000Z",
                        outgoing: false,
                      },
                    ]
                  : []),
              ],
            }),
          );
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
      process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY = "1";
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

      try {
        const thread = store.createThread("Signal bridge contract dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async () => ({ allowed: true, mode: "allow_once" }),
            denyThread: () => undefined,
          },
        );

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging Signal bridge contract dogfood test.",
            `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
            "Then call ambient_messaging_gateway_status.",
            "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
            "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. The permission requester will approve this metadata-only read.",
            "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
            "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. The permission requester will approve this bounded fake-bridge owner handoff read.",
            "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ownerHandoffSourceMessageId signal-dogfood-setup-message, initialSeenMessageIds [signal-dogfood-setup-message, signal-dogfood-other-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write, so it should persist the binding without starting Signal, reading messages, polling unread windows, or sending replies.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the active Signal binding.",
            "Then call ambient_messaging_signal_unread_window_preview with providerId signal-cli, bindingId from the active Signal binding, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5.",
            "Then call ambient_messaging_signal_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve this bounded fake-bridge unread-window read.",
            "Then call ambient_messaging_signal_unread_window_status with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
            "Then call ambient_messaging_signal_unread_window_apply a second time with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve it; this repeat should be idempotent and report duplicate messages instead of creating another accepted dispatch.",
            "Then call ambient_messaging_signal_unread_window_status again with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
            "Then call ambient_messaging_signal_remote_surface_preview with action revoke, providerId signal-cli, bindingId from the active Signal binding, and reason dogfood cleanup.",
            "Then call ambient_messaging_signal_remote_surface_apply with action revoke, providerId signal-cli, the same bindingId, and reason dogfood cleanup. The permission requester will approve this metadata-only revoke.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the Signal binding is revoked.",
            "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, generic binding apply, polling, reply, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK and include the phrases Signal bridge root contract accepted, Signal bridge profile status contract accepted, Bridge reachable yes, Configured yes, Signal conversation directory applied, signal-dogfood-conversation, Signal binding readiness blocked, Signal owner handoff ready, Signal owner handoff applied, Handoff status matched, Can feed binding apply yes, Signal remote surface preview ready, Signal remote surface applied, Signal unread apply applied, Accepted dispatches 1, Signal unread-window status ready, Duplicate messages 3, Queued Signal projections 1, Real Signal unread ingestion enabled no, Signal remote surface revoke ready, Signal remote surface revoke applied, Persisted yes, Status revoked, Generic binding apply no, Telegram owner handoff no, Apply tool ambient_messaging_signal_unread_window_apply, no Signal message bodies returned, and no Signal messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
        expect(transcript).toContain("ambient_messaging_gateway_status completed");
        expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
        expect(transcript).toContain("ambient_messaging_list_bindings completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_status completed");
        expect(transcript).toContain("Signal bridge root contract accepted");
        expect(transcript).toContain("Signal bridge profile status contract accepted");
        expect(transcript).toContain("Bridge reachable: yes");
        expect(transcript).toContain("Configured: yes");
        expect(transcript).toContain("Signal conversation directory result: applied");
        expect(transcript).toContain("signal-dogfood-conversation");
        expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
        expect(transcript).toContain("Signal owner handoff preview: ready");
        expect(transcript).toContain("Signal owner handoff apply: applied");
        expect(transcript).toContain("Handoff status: matched");
        expect(transcript).toContain("Can feed binding apply: yes");
        expect(transcript).toContain("Reads Signal unread messages: yes");
        expect(transcript).toContain("Signal Remote Ambient Surface binding preview ready");
        expect(transcript).toContain("Signal Remote Ambient Surface binding applied");
        expect(transcript).toContain("Signal bounded unread-window apply");
        expect(transcript).toContain("Apply status: applied");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("Signal unread-window status");
        expect(transcript).toContain("Status: ready");
        expect(transcript).toContain("Duplicate messages: 3");
        expect(transcript).toContain("Queued Signal projections: 1");
        expect(transcript).toContain("Real Signal unread ingestion enabled: no");
        expect(transcript).toContain("Signal Remote Ambient Surface binding revoke preview ready");
        expect(transcript).toContain("Signal Remote Ambient Surface binding revoke applied");
        expect(transcript).toContain("Persisted: yes");
        expect(transcript).toContain("Active: 1");
        expect(transcript).toContain("Status: revoked");
        expect(transcript).toContain("Generic binding apply allowed: no");
        expect(transcript).toContain("Telegram owner handoff allowed: no");
        expect(transcript).toContain("Uses Telegram owner handoff: no");
        expect(transcript).toContain("Signal bounded unread-window preview");
        expect(transcript).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK");
        expect(transcript).toContain("no Signal message bodies returned");
        expect(transcript).toContain("no Signal messages sent");
        expect(transcript).not.toContain("private text that must not leak");
        expect(transcript).not.toContain("show projects private command must not leak");
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY", previousSignalOwnerHandoffFakeApply);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    240_000,
  );
});
