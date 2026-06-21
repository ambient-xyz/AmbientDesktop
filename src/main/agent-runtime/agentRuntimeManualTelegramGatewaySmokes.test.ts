import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  manualTelegramDirectoryListSmokeChecklist,
  manualTelegramDirectorySmokeChecklist,
  manualTelegramOwnerHandoffCheckSmokeChecklist,
} from "./agentRuntimeManualTelegramSmokeChecklists";
import { createDefaultMessagingProviderRegistry } from "./agentRuntimeMessagingFacade";
import { createMessagingBindingStore } from "./agentRuntimeMessagingFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime manual Telegram gateway smokes", () => {
  const itManualTelegramRelaySmoke = process.env.AMBIENT_MANUAL_TELEGRAM_RELAY_SMOKE === "1" ? it : it.skip;
  const itManualTelegramDirectorySmoke = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_SMOKE === "1" ? it : it.skip;
  const itManualTelegramDirectoryListSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE === "1" ? it : it.skip;
  const itManualTelegramOwnerHandoffCheckSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE === "1" ? it : it.skip;

  itManualTelegramRelaySmoke("manual real Telegram runtime relay smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const ownerUserId = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID?.trim();
    const messageId = process.env.AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID?.trim();
    if (!profileId || !conversationId || !ownerUserId || !messageId) {
      throw new Error([
        "Manual Telegram relay smoke requires:",
        "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
        "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
        "AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID",
        "AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID",
      ].join(" "));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-relay-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram relay smoke").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: profileId,
        conversationId,
        purpose: "remote_ambient_surface",
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }).binding;
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_reply_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram smoke permission request: ${request.title}`);
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
      const lifecycleApply = tool("ambient_messaging_gateway_lifecycle_apply");
      const route = tool("ambient_messaging_telegram_bridge_event_route");
      const diagnostics = tool("ambient_messaging_telegram_relay_diagnostics");
      const preview = tool("ambient_messaging_telegram_bridge_reply_preview");
      const apply = tool("ambient_messaging_telegram_bridge_reply_apply");
      const status = tool("ambient_messaging_gateway_status");
      const remoteSurfaceApply = tool("ambient_messaging_telegram_remote_surface_apply");

      const lifecycle = await lifecycleApply.execute("manual-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");
      const routed = await route.execute("manual-route-owner-message", {
        profileId,
        conversationId,
        messageId,
        senderId: ownerUserId,
        senderLabel: "Owner",
        text: "status",
      });
      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Manual Telegram relay smoke",
        summary: "Manual Telegram relay smoke completed.",
        threadId: thread.id,
        queuedProjectionId: routed.details.queuedProjection.id,
        bindingId: binding.id,
        projectName: "Manual Telegram relay smoke",
        completedAt: new Date().toISOString(),
        relaySuggested: true,
      });

      expect((await diagnostics.execute("manual-diagnostics", {
        profileId,
        conversationId,
      })).details.status).toBe("ready");
      expect((await preview.execute("manual-preview", { runtimeEventId: runtimeEvent.id })).details.status).toBe("ready");
      const sent = await apply.execute("manual-apply", { runtimeEventId: runtimeEvent.id });
      expect(sent.details.status).toBe("sent");
      expect((await status.execute("manual-status-after-send", {})).content[0].text).toContain("Relay status: sent");
      const duplicate = await apply.execute("manual-duplicate-apply", { runtimeEventId: runtimeEvent.id });
      expect(duplicate.details.status).toBe("blocked");
      const revoked = await remoteSurfaceApply.execute("manual-revoke", {
        action: "revoke",
        bindingId: binding.id,
        reason: "manual Telegram relay smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 120_000);

  itManualTelegramDirectorySmoke("manual real Telegram conversation directory smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const query = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const limit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "5");
    const ownerUserId = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID?.trim()
      || process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OWNER_USER_ID?.trim();
    const routeMessageId = process.env.AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID?.trim()
      || `manual-directory-${Date.now()}`;
    if (!profileId || !stateRoot || !ownerUserId || !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() || !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) {
      throw new Error(manualTelegramDirectorySmokeChecklist({
        profileId,
        stateRoot,
        ownerUserId,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-directory-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram directory smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram directory permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(limit) ? limit : 5,
        ...(query ? { query } : {}),
      };
      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-directory-preview", directoryInput);
      expect(preview.details.status).toBe("ready");
      expect(preview.content[0].text).toContain("metadataOnly=true");

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-directory-apply", directoryInput);
      expect(result.details.status).toBe("applied");
      expect(result.details.failureMode).toBe("none");
      expect(result.details.returnedConversationCount).toBeGreaterThan(0);
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      const conversationId = result.details.conversations[0].conversationId;

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(binding.details.status).toBe("applied");
      const bindingId = binding.details.lifecycle.binding.id;

      const routed = await tool("ambient_messaging_telegram_bridge_event_route").execute("manual-route-owner-event", {
        profileId,
        conversationId,
        messageId: routeMessageId,
        senderId: ownerUserId,
        senderLabel: "Owner",
        text: "status",
      });
      expect(routed.details.status).toBe("accepted");
      const queuedProjectionId = routed.details.queuedProjection.id;

      const diagnostics = await tool("ambient_messaging_telegram_relay_diagnostics").execute("manual-relay-diagnostics", {
        profileId,
        conversationId,
        bindingId,
      });
      expect(diagnostics.details.status).toBe("ready");

      const replyPreview = await tool("ambient_messaging_telegram_bridge_reply_preview").execute("manual-reply-preview", {
        queuedProjectionId,
        text: "Ambient received your status request.",
      });
      expect(replyPreview.details.status).toBe("ready");

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual directory-to-binding smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);

  itManualTelegramDirectoryListSmoke("manual real Telegram metadata-only directory list smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const query = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const limit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    if (!profileId || !stateRoot || !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() || !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) {
      throw new Error(manualTelegramDirectoryListSmokeChecklist({
        profileId,
        stateRoot,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-directory-list-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram directory list smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram directory-list permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(limit) ? limit : 10,
        ...(query ? { query } : {}),
      };
      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-directory-list-preview", directoryInput);
      expect(preview.details.status).toBe("ready");
      expect(preview.content[0].text).toContain("metadataOnly=true");

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-directory-list-apply", directoryInput);
      expect(result.details.status).toBe("applied");
      expect(result.details.failureMode).toBe("none");
      expect(result.details.returnedConversationCount).toBeGreaterThan(0);
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      const conversations = (result.details.conversations as Array<{
        conversationId: string;
        title?: string;
        type?: string;
        unreadCount?: number;
        updatedAt?: string;
      }>).map((conversation) => ({
        conversationId: conversation.conversationId,
        title: conversation.title,
        type: conversation.type,
        unreadCount: conversation.unreadCount,
        updatedAt: conversation.updatedAt,
      }));
      const directoryOutputPath = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OUTPUT_PATH?.trim();
      if (directoryOutputPath) {
        await writeFile(directoryOutputPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          profileId,
          query: query ?? "",
          limit: Number.isFinite(limit) ? limit : 10,
          returnedConversationCount: result.details.returnedConversationCount,
          conversations,
          privacy: {
            metadataOnly: true,
            includesMessageBodies: false,
            includesLastMessage: false,
          },
        }, null, 2), "utf8");
      }
      console.info([
        "Manual Telegram metadata-only directory candidates:",
        JSON.stringify(conversations, null, 2),
      ].join("\n"));

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);

  itManualTelegramOwnerHandoffCheckSmoke("manual real Telegram owner handoff check smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramOwnerHandoffCheckSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-handoff-check-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram owner handoff check").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram owner-handoff check permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-handoff-check-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      expect(handoffPreview.content[0].text).toContain("Returns provider message content: no");
      const handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute("manual-handoff-check-apply", handoffInput);
      expect(handoff.details.applyStatus).toBe("applied");
      expect(["matched", "no-match", "ambiguous"]).toContain(handoff.details.handoffStatus);
      if (setupCode.length > 16) {
        expect(JSON.stringify(handoff.details)).not.toContain(setupCode);
        expect(handoff.content[0].text).not.toContain(setupCode);
      }

      console.info([
        "Manual Telegram owner handoff check:",
        JSON.stringify({
          applyStatus: handoff.details.applyStatus,
          handoffStatus: handoff.details.handoffStatus,
          fetchedMessageCount: handoff.details.fetchedMessageCount,
          candidateMessageCount: handoff.details.candidateMessageCount,
          matchedMessageCount: handoff.details.matchedMessageCount,
          matchedSenderCount: handoff.details.matchedSenderCount,
          ownerUserIdPresent: Boolean(handoff.details.ownerUserId),
          sourceMessageIdPresent: Boolean(handoff.details.sourceMessageId),
          errorPresent: Boolean(handoff.details.error),
        }, null, 2),
      ].join("\n"));

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);
});
