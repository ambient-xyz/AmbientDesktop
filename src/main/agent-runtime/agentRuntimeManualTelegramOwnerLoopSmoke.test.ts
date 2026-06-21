import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { manualTelegramOwnerLoopSmokeChecklist } from "./agentRuntimeManualTelegramSmokeChecklists";
import {
  applyManualOwnerLoopCommand,
  errorMessage,
  manualTelegramOwnerLoopProjectFeatures,
  normalizedIsoFromEnv,
  previewManualOwnerLoopRelay,
} from "./agentRuntimeManualTelegramOwnerLoopTestSupport";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime manual Telegram owner loop smoke", () => {
  const itManualTelegramOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE === "1" ? it : it.skip;

  itManualTelegramOwnerLoopSmoke("manual real Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-owner-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      expect(directoryPreview.content[0].text).toContain("metadataOnly=true");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      expect(directoryConversationIds).toContain(conversationId);

      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      const handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute("manual-owner-loop-handoff-apply", handoffInput);
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      expect(binding.details.lifecycle.binding.metadata.ownerHandoffSourceMessageId).toBe(ownerHandoffSourceMessageId);
      bindingId = binding.details.lifecycle.binding.id;

      const pollInput = {
        profileId,
        bindingId,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      };
      const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-owner-loop-poll-preview", pollInput);
      expect(pollPreview.details.status).toBe("ready");
      const poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute("manual-owner-loop-poll-apply", pollInput);
      expect(poll.details.applyStatus).toBe("applied");
      expect(poll.details.duplicateMessageCount).toBeGreaterThanOrEqual(1);
      expect(poll.details.acceptedDispatchCount).toBeGreaterThanOrEqual(1);
      const acceptedDispatch = poll.details.bindingResults
        .flatMap((bindingResult: any) => bindingResult.dispatches)
        .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
      const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
      expect(queuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-owner-loop-command-preview", {
        queuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-owner-loop-command-apply",
        queuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }

      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-owner-loop",
        queuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real-finally", {
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
  }, 240_000);
});
