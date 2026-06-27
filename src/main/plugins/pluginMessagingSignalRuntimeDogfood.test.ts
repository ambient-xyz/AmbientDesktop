import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { createDefaultMessagingProviderRegistry, createMessagingBindingStore } from "./pluginsMessagingDogfoodFacade";
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

describeNative("Plugin messaging Signal runtime dogfood", () => {
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
    "sends approved Signal bridge replies through the reviewed contract",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal reply send dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-reply");
      await mkdir(signalConfigDir, { recursive: true });
      await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner"), { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-reply-owner",
          signalCliConfigDir: signalConfigDir,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }),
      );
      const bindingStore = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      });
      const createdBinding = bindingStore.create({
        providerId: "signal-cli",
        authProfileId: "dogfood-reply-owner",
        conversationId: "signal-reply-dogfood-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "signal-reply-owner",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-reply-source-message",
          initialSeenMessageIds: ["signal-reply-source-message"],
        },
      });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      let sendRequestCount = 0;
      let unreadRequestCount = 0;
      let sentBody: unknown;
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
        if (request.url === "/profiles/dogfood-reply-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-reply-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/unread?limit=5") {
          unreadRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-reply-owner",
              conversationId: "signal-reply-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-reply-command-message",
                  senderId: "signal-reply-owner",
                  senderLabel: "Signal Owner",
                  text: "switch project Signal relay project private text must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/send") {
          sendRequestCount += 1;
          let raw = "";
          request.on("data", (chunk) => {
            raw += chunk.toString();
          });
          request.on("end", () => {
            sentBody = raw ? JSON.parse(raw) : undefined;
            response.end(
              JSON.stringify({
                ok: true,
                messageId: "signal-dogfood-sent-message",
                sentAt: "2026-05-10T00:00:05.000Z",
              }),
            );
          });
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

      try {
        const thread = store.createThread("Signal reply send dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              if (
                request.toolName === "ambient_messaging_signal_unread_window_apply" ||
                request.toolName === "ambient_messaging_signal_bridge_reply_apply"
              ) {
                return { allowed: true, mode: "allow_once" };
              }
              throw new Error(`Unexpected permission prompt during Signal reply send dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
        );
        const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
        (runtime as any).createMessagingGatewayToolExtension(
          thread.id,
          store.getWorkspace(),
        )({
          registerTool: (tool: any) => registeredTools.push(tool),
        });
        const tool = (name: string) => {
          const found = registeredTools.find((candidate) => candidate.name === name);
          if (!found) throw new Error(`Missing dogfood setup tool ${name}`);
          return found;
        };
        const unread = await tool("ambient_messaging_signal_unread_window_apply").execute("signal-runtime-dogfood-unread", {
          providerId: "signal-cli",
          bindingId: createdBinding.binding.id,
          profileId: "dogfood-reply-owner",
          conversationId: "signal-reply-dogfood-conversation",
          limit: 5,
        });
        expect(unread.details).toMatchObject({
          status: "applied",
          acceptedDispatchCount: 1,
        });
        const queuedProjectionId = unread.details.dispatches?.[0]?.queuedProjectionId;
        expect(queuedProjectionId).toBeTruthy();
        const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
          kind: "active_project_switch",
          status: "completed",
          title: "Switch to Signal relay project",
          summary: "Active Ambient project switched to Signal relay project.",
          threadId: thread.id,
          queuedProjectionId,
          sourceEventId: "signal-dogfood-reply-owner-signal-reply-dogfood-conversation-signal-reply-command-message",
          bindingId: createdBinding.binding.id,
          projectName: "Signal relay project",
          completedAt: "2026-05-10T00:00:04.000Z",
          relaySuggested: true,
        });

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging approved Signal runtime-event relay dogfood test.",
            `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and ownerUserId signal-reply-owner.`,
            `A completed Signal Remote Ambient Surface runtime event already exists with runtimeEventId ${runtimeEvent.id} and queuedProjectionId ${queuedProjectionId}.`,
            "Call ambient_messaging_gateway_status and verify the completed runtime event is present.",
            "Then call ambient_messaging_signal_relay_diagnostics with providerId signal-cli, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and the active bindingId.",
            `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${runtimeEvent.id} only. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient must resolve Signal internally and generate the exact runtime event relay text.`,
            `Then call ambient_messaging_remote_surface_reply_apply with runtimeEventId ${runtimeEvent.id} only. The permission requester will approve exactly one Signal runtime-event reply send through the delegated Signal adapter.`,
            "Then call ambient_messaging_gateway_status again to inspect the outbound delivery record and the runtime event relay status.",
            `Then call ambient_messaging_remote_surface_reply_preview one more time with runtimeEventId ${runtimeEvent.id} only. It should now be blocked as already relayed and show Repair steps; do not call apply again.`,
            "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_signal_unread_window_apply, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_real_polling_apply, shell, browser, Signal Desktop, provider CLI, Telegram tools, generic binding tools, install tools, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK and include the phrases Signal relay diagnostics, Remote Ambient Surface reply preview, Remote Ambient Surface reply apply, Delegated tool, runtime event relay preview, Ambient switched the active project to Signal relay project, Bridge approvedReplySend capability yes, Sends provider messages yes, Approval requested yes, Approval recorded yes, Sent yes, Provider message signal-dogfood-sent-message, Recent outbound deliveries, Relay status sent, Repair steps, Do not resend this runtime event, and chat-to-self ingestion separate.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK",
        });

        expect(transcript).toContain("ambient_messaging_gateway_status completed");
        expect(transcript).toContain("ambient_messaging_signal_relay_diagnostics completed");
        expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
        expect(transcript).toContain("ambient_messaging_remote_surface_reply_apply completed");
        expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
        expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
        expect(transcript).toContain("Signal relay diagnostics");
        expect(transcript).toContain("Remote Ambient Surface reply preview");
        expect(transcript).toContain("Apply result:");
        expect(transcript).toContain("Runtime event:");
        expect(transcript).toContain("Ambient switched the active project to Signal relay project.");
        expect(transcript).toContain("Bridge approvedReplySend capability: yes");
        expect(transcript).toContain("Sends provider messages: yes");
        expect(transcript).toContain("Approval requested: yes");
        expect(transcript).toContain("Approval recorded: yes");
        expect(transcript).toContain("Sent: yes");
        expect(transcript).toContain("Provider message: signal-dogfood-sent-message");
        expect(transcript).toContain("Recent outbound deliveries");
        expect(transcript).toContain("Relay status: sent");
        expect(transcript).toContain("Repair steps:");
        expect(transcript).toContain("Do not resend this runtime event");
        expect(transcript).toContain("Signal chat-to-self ingestion is separate");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_real_polling_apply completed");
        expect(transcript).not.toContain("switch project Signal relay project private text must not leak");
        expect(unreadRequestCount).toBe(1);
        expect(sendRequestCount).toBe(1);
        expect(sentBody).toEqual({
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-reply-command-message",
        });
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );

  itLive(
    "explains the blocked real Signal unread skeleton without using fake apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread skeleton dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Signal real unread skeleton dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during blocked real Signal unread skeleton dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging real Signal unread skeleton dogfood test.",
          "Call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
          "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
          "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK and include the phrases Signal real unread-window preview: blocked, Signal real unread-window apply: blocked, Approval requested no, Contacts bridge unread endpoint no, Reads provider unread messages no, exact active bindingId, no fake unread apply, and no Signal messages read.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
      expect(transcript).toContain("Signal real unread-window preview: blocked");
      expect(transcript).toContain("Signal real unread-window apply: blocked");
      expect(transcript).toContain("Approval requested: no");
      expect(transcript).toContain("Contacts bridge unread endpoint: no");
      expect(transcript).toContain("Reads provider unread messages: no");
      expect(transcript).toContain("exact active bindingId");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK");
      expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
    },
    120_000,
  );

  itLive(
    "applies a real Signal unread single-read through the reviewed boundary",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread apply dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-real");
      await mkdir(signalConfigDir, { recursive: true });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
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
                approvedReplySend: false,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-real-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-real-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-real-owner/conversations/signal-real-dogfood-conversation/unread?limit=5") {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-real-owner",
              conversationId: "signal-real-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-real-seed-message",
                  senderId: "signal-real-owner",
                  text: "seed private text must not leak",
                  receivedAt: "2026-05-10T00:00:00.000Z",
                  outgoing: false,
                },
                {
                  messageId: `signal-real-command-message-${unreadWindowRequestCount}`,
                  senderId: "signal-real-owner",
                  senderLabel: "Signal Owner",
                  text: "show projects real private command must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
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
      delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;

      try {
        const thread = store.createThread("Signal real unread apply dogfood");
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
            "This is a focused Ambient messaging real Signal unread apply dogfood test.",
            `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-real-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
            "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, ownerUserId signal-real-owner, ownerHandoffSourceMessageId signal-real-seed-message, initialSeenMessageIds [signal-real-seed-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to get the active Signal binding id.",
            "Then call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, that active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5.",
            "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5. The permission requester will approve this real bounded single-read.",
            "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK and include the phrases Signal real unread-window preview: ready, Signal real unread-window apply: applied, Approval requested yes, Contacts bridge unread endpoint yes, Reads provider unread messages yes, Accepted dispatches 1, Real Signal unread ingestion enabled yes, no fake unread apply, and no Signal message bodies returned.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).toContain("Signal real unread-window preview: ready");
        expect(transcript).toContain("Signal real unread-window apply: applied");
        expect(transcript).toContain("Approval requested: yes");
        expect(transcript).toContain("Contacts bridge unread endpoint: yes");
        expect(transcript).toContain("Reads provider unread messages: yes");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("Real unread ingestion enabled: yes");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK");
        expect(transcript).toContain("no Signal message bodies returned");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("seed private text must not leak");
        expect(transcript).not.toContain("show projects real private command must not leak");
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );

  itLive(
    "starts and stops approved Signal real polling without leaking provider text",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real polling dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-real-polling");
      await mkdir(signalConfigDir, { recursive: true });
      await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner"), { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-polling-owner",
          signalCliConfigDir: signalConfigDir,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }),
      );
      const bindingStore = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      });
      const createdBinding = bindingStore.create({
        providerId: "signal-cli",
        authProfileId: "dogfood-polling-owner",
        conversationId: "signal-polling-dogfood-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "signal-polling-owner",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-polling-seed-message",
          initialSeenMessageIds: ["signal-polling-seed-message"],
        },
      });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
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
                approvedReplySend: false,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-polling-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-polling-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url?.startsWith("/profiles/dogfood-polling-owner/conversations/signal-polling-dogfood-conversation/unread")) {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-polling-owner",
              conversationId: "signal-polling-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-polling-command-1",
                  senderId: "signal-polling-owner",
                  senderLabel: "Signal Polling Owner",
                  text: "polling private command text must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
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

      try {
        const thread = store.createThread("Signal real polling approved dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              if (request.title === "Start Signal real polling?") {
                return { allowed: true, mode: "allow_once" };
              }
              throw new Error(`Unexpected permission prompt during Signal real polling dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
        );

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging approved Signal real polling dogfood test.",
            `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, and ownerUserId signal-polling-owner.`,
            "Then call ambient_messaging_signal_real_polling_status with providerId signal-cli, limit 5, and intervalMs 300000.",
            `Then call ambient_messaging_signal_real_polling_preview with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000.`,
            `Then call ambient_messaging_signal_real_polling_apply with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000. The permission requester will approve Signal polling.`,
            "Then call ambient_messaging_signal_real_polling_status again and verify State running, Running yes, Timers active yes, and Accepted dispatches 1.",
            "Then call ambient_messaging_signal_real_polling_preview with action stop, providerId signal-cli, limit 5, and intervalMs 300000.",
            "Then call ambient_messaging_signal_real_polling_apply with action stop, providerId signal-cli, limit 5, and intervalMs 300000. Stop should not read messages or ask for approval.",
            "Then call ambient_messaging_signal_real_polling_status once more and verify State stopped, Running no, and Timers active no.",
            "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_list_bindings, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, reply, install, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK and include the phrases Signal real polling runner status, Signal real polling start preview, Signal real polling start apply, Apply status applied, Immediate poll, Accepted dispatches 1, State running, Signal real polling stop preview, Signal real polling stop apply, State stopped, no Signal message bodies returned, and no Signal messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_real_polling_status completed");
        expect(transcript).toContain("ambient_messaging_signal_real_polling_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_real_polling_apply completed");
        expect(transcript).toContain("Signal real polling runner status");
        expect(transcript).toContain("Signal real polling start preview");
        expect(transcript).toContain("Signal real polling start apply");
        expect(transcript).toContain("Apply status: applied");
        expect(transcript).toContain("Immediate poll");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("State: running");
        expect(transcript).toContain("Signal real polling stop preview");
        expect(transcript).toContain("Signal real polling stop apply");
        expect(transcript).toContain("State: stopped");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK");
        expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("polling private command text must not leak");
        expect(unreadWindowRequestCount).toBe(1);
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );
});
