import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { TelegramBridgeSupervisor } from "./agentRuntimeTelegramFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime Telegram messaging gateway setup", () => {
  it("applies Telegram conversation directory through the real-mode AgentRuntime tool path", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-telegram-directory-"));
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "owner-profile", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "owner-profile", "bridge-session.json"),
      JSON.stringify({
        profileId: "owner-profile",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "directory-key",
      }),
      "utf8",
    );
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
    };
    const requests: Array<{ method: string; url: string; headers?: HeadersInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      requests.push({ method: init?.method ?? "GET", url, headers: init?.headers });
      if (url === "http://127.0.0.1:19091/") {
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
      if (url === "http://127.0.0.1:19091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [{
              id: "telegram-chat-1",
              title: "Ops",
              type: "private",
              unreadCount: 1,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;

    const store = new ProjectStore();
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19091";
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "123";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "hash";
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("telegram directory fake-real").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected Telegram directory permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("directory-preview", {
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      });
      expect(preview.details).toMatchObject({
        status: "ready",
        directoryStatus: "ready",
        canApplyNow: true,
        endpointPath: "/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops",
        messagingConversationDirectorySetup: {
          kind: "messaging-conversation-directory-setup",
          providerId: "telegram-tdlib",
          status: "preview",
          directoryStatus: "ready",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
          applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
          canApplyNow: true,
          safety: {
            readsProviderMessages: false,
            readsProviderHistory: false,
            sendsProviderMessages: false,
          },
        },
      });

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("directory-apply", {
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      });
      expect(result.details).toMatchObject({
        status: "applied",
        applyStatus: "applied",
        failureMode: "none",
        returnedConversationCount: 1,
        messagingConversationDirectorySetup: {
          kind: "messaging-conversation-directory-setup",
          providerId: "telegram-tdlib",
          status: "applied",
          returnedConversationCount: 1,
          conversations: [{
            conversationId: "telegram-chat-1",
            title: "Ops",
          }],
        },
        conversations: [{
          conversationId: "telegram-chat-1",
          title: "Ops",
        }],
      });
      expect(result.content[0].text).toContain("Failure mode: none");
      expect(result.content[0].text).toContain("metadataOnly=true");
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      expect(requests.some((request) => request.url === "http://127.0.0.1:19091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops")).toBe(true);
      const conversationId = result.details.conversations[0].conversationId;

      const bindingPreview = await tool("ambient_messaging_telegram_remote_surface_preview").execute("binding-preview", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner-profile",
        conversationId,
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(bindingPreview.details).toMatchObject({
        status: "ready",
        canApplyNow: true,
        lifecycle: {
          binding: {
            authProfileId: "owner-profile",
            conversationId,
            ownerUserId: "owner-1",
            purpose: "remote_ambient_surface",
          },
        },
      });

      const bindingApply = await tool("ambient_messaging_telegram_remote_surface_apply").execute("binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner-profile",
        conversationId,
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(bindingApply.details).toMatchObject({
        status: "applied",
        persisted: true,
        lifecycle: {
          binding: {
            conversationId,
            ownerUserId: "owner-1",
            purpose: "remote_ambient_surface",
          },
        },
      });
      const bindingId = bindingApply.details.lifecycle.binding.id;

      const routed = await tool("ambient_messaging_telegram_bridge_event_route").execute("route-owner-event", {
        profileId: "owner-profile",
        conversationId,
        messageId: "directory-message-1",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "status",
      });
      expect(routed.details).toMatchObject({
        status: "accepted",
        accepted: true,
        queuedProjection: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId,
          bindingId,
          purpose: "remote_ambient_surface",
        },
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      const diagnostics = await tool("ambient_messaging_telegram_relay_diagnostics").execute("relay-diagnostics", {
        profileId: "owner-profile",
        conversationId,
      });
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        selectedOwnerBindings: [{
          bindingId,
          conversationId,
        }],
        queuedOwnerProjections: [{
          queuedProjectionId,
          conversationId,
        }],
      });
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Telegram bridge running");

      const replyPreview = await tool("ambient_messaging_telegram_bridge_reply_preview").execute("reply-preview", {
        queuedProjectionId,
        text: "Ambient received your status request.",
      });
      expect(replyPreview.details).toMatchObject({
        status: "ready",
        canApplyNow: true,
        endpointPath: "/sessions/owner-profile/messages/send",
        binding: {
          id: bindingId,
          purpose: "remote_ambient_surface",
        },
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "directory-to-binding smoke cleanup",
      });
      expect(revoked.details).toMatchObject({
        status: "applied",
        persisted: true,
        lifecycle: {
          binding: {
            id: bindingId,
            status: "revoked",
          },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("requests Telegram login codes through secure input instead of Pi tool arguments", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-telegram-secure-input-"));
    const store = new ProjectStore();
    const originalEnv = {
      id: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      hash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
    };
    const originalFetch = globalThis.fetch;
    const supervisorStatus: any = {
      providerId: "telegram-tdlib",
      state: "running",
      managed: true,
      pid: 12345,
      command: "pnpm",
      args: ["--dir", "/Users/example/ambientAgent", "telegram:bridge"],
      cwd: "/Users/example/ambientAgent",
      bridgeBaseUrl: "http://127.0.0.1:8091",
      stateRoot: `${workspacePath}/.ambient-agent-state/telegram`,
      envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
      safeRootProbeOnly: true,
      recentLogs: [],
    };
    const statusSpy = vi.spyOn(TelegramBridgeSupervisor.prototype, "status").mockReturnValue(supervisorStatus);
    const startSpy = vi.spyOn(TelegramBridgeSupervisor.prototype, "startForSetup").mockResolvedValue(supervisorStatus);
    const fetchRequests: Array<{ input: string; body?: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      fetchRequests.push({
        input,
        body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => input.endsWith("/code")
          ? { state: "ready", ready: true, needsCode: false, needsPassword: false }
          : { ok: true, stateRoot: `${workspacePath}/.ambient-agent-state/telegram`, sessionCount: 1 },
      } as any;
    }) as any;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "123";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "secret-hash";
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("telegram secure input").id, { permissionMode: "workspace" });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const secureInputRequester = vi.fn(async (request) => {
        expect(request).toMatchObject({
          inputKind: "telegram_login_code",
          inputMode: "text",
          providerId: "telegram-tdlib",
          profileId: "owner",
        });
        expect(JSON.stringify(request)).not.toContain("86420");
        return { allowed: true, value: "86420" };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      }, {
        secureInputs: {
          request: secureInputRequester,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_session_apply");

      const result = await apply!.execute("telegram-code", {
        action: "submit_code",
        providerId: "telegram-tdlib",
        profileId: "owner",
      });

      expect(permissionRequester).toHaveBeenCalledTimes(1);
      expect(secureInputRequester).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith({ apiCredentialsPresent: true });
      expect(fetchRequests.find((request) => request.input.endsWith("/sessions/owner/code"))?.body).toEqual({
        profileId: "owner",
        code: "86420",
      });
      expect(result.content[0].text).toContain("Apply status: applied");
      expect(result.details.telegramSessionSetup).toMatchObject({
        kind: "telegram-session-setup",
        providerId: "telegram-tdlib",
        profileId: "owner",
        status: "ready",
        safety: {
          readsProviderMessages: false,
          sendsProviderMessages: false,
          createsBinding: false,
          enablesInboundIngestion: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain("86420");
    } finally {
      statusSpy.mockRestore();
      startSpy.mockRestore();
      globalThis.fetch = originalFetch;
      if (originalEnv.id === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.id;
      if (originalEnv.hash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.hash;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
