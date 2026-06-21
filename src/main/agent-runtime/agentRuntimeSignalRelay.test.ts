import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createDefaultMessagingProviderRegistry } from "./agentRuntimeMessagingFacade";
import { createMessagingBindingStore } from "./agentRuntimeMessagingFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime Signal messaging relay", () => {
  it("records Signal runtime event relay outcomes through the reviewed bridge reply contract", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-relay-"));
    const store = new ProjectStore();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_SIGNAL_BRIDGE_URL,
      fakeUnreadApply: process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY,
      signalCliPath: process.env.AMBIENT_SIGNAL_CLI_PATH,
      signalCliConfigDir: process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR,
    };
    const sentRequests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const jsonResponse = (ok: boolean, status: number, statusText: string, body: Record<string, unknown>) => ({
      ok,
      status,
      statusText,
      json: async () => body,
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(inputUrl);
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
        return jsonResponse(true, 200, "OK", {
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
        }) as any;
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/profiles/owner-profile/status") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          providerId: "signal-cli",
          profileId: "owner-profile",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }) as any;
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/profiles/owner-profile/conversations/owner-chat/unread") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          providerId: "signal-cli",
          profileId: "owner-profile",
          conversationId: "owner-chat",
          messages: [{
            messageId: "signal-message-100",
            senderId: "owner-1",
            senderLabel: "Owner",
            text: "switch project Signal relay project",
            receivedAt: "2026-05-10T00:00:08.000Z",
            outgoing: false,
          }],
        }) as any;
      }
      if (init?.method === "POST" && url.pathname === "/profiles/owner-profile/conversations/owner-chat/send") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
        sentRequests.push({ path: url.pathname, body });
        return jsonResponse(true, 200, "OK", {
          ok: true,
          messageId: `signal-provider-message-${sentRequests.length}`,
          sentAt: "2026-05-10T00:00:10.000Z",
        }) as any;
      }
      return jsonResponse(false, 404, "Not Found", { ok: false }) as any;
    }) as any;

    try {
      store.openWorkspace(workspacePath);
      const stateRoot = join(workspacePath, ".ambient-agent-state", "signal");
      const profileRoot = join(stateRoot, "owner-profile");
      await mkdir(profileRoot, { recursive: true });
      await writeFile(join(profileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner-profile",
        signalCliConfigDir: profileRoot,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }), "utf8");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = "http://127.0.0.1:8092";
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";
      process.env.AMBIENT_SIGNAL_CLI_PATH = join(workspacePath, "missing-signal-cli");
      process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = profileRoot;

      const thread = store.updateThreadSettings(store.createThread("Signal runtime relay").id, { permissionMode: "workspace" });
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      }).create({
        providerId: "signal-cli",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-message-setup",
          initialSeenMessageIds: ["signal-message-setup"],
        },
      }).binding;
      const permissionRequester = vi.fn(async (request: any) => {
        if (
          request.toolName === "ambient_messaging_signal_unread_window_apply" ||
          request.toolName === "ambient_messaging_signal_bridge_reply_apply"
        ) {
          return { allowed: true, mode: "allow_once" as const };
        }
        throw new Error(`Unexpected Signal relay permission request: ${request.title}`);
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
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
      const unreadApply = tool("ambient_messaging_signal_unread_window_apply");
      const relayDiagnostics = tool("ambient_messaging_signal_relay_diagnostics");
      const replyApply = tool("ambient_messaging_signal_bridge_reply_apply");
      const remoteReplyPreview = tool("ambient_messaging_remote_surface_reply_preview");
      const remoteReplyApply = tool("ambient_messaging_remote_surface_reply_apply");
      const status = tool("ambient_messaging_gateway_status");

      const unread = await unreadApply.execute("signal-unread-apply", {
        providerId: "signal-cli",
        bindingId: binding.id,
        profileId: "owner-profile",
        conversationId: "owner-chat",
        limit: 5,
      });
      expect(unread.details).toMatchObject({
        status: "applied",
        acceptedDispatchCount: 1,
        dispatches: [{ messageId: "signal-message-100", accepted: true }],
      });
      const queuedProjectionId = unread.details.dispatches[0].queuedProjectionId;
      if (!queuedProjectionId) {
        throw new Error("Owner command did not produce a queued projection.");
      }
      expect(queuedProjectionId).toBeTruthy();

      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Signal relay project",
        summary: "Active Ambient project switched to Signal relay project.",
        threadId: thread.id,
        queuedProjectionId,
        bindingId: binding.id,
        projectName: "Signal relay project",
        completedAt: "2026-05-10T00:00:09.000Z",
        relaySuggested: true,
      });

      const diagnostics = await relayDiagnostics.execute("signal-relay-diagnostics", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
      });
      expect(diagnostics.content[0].text).toContain("Provider: Signal (signal-cli)");
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Signal bridge ready for approved replies");
      expect(diagnostics.content[0].text).toContain(`Event ${runtimeEvent.id}`);
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        canSendOwnerRelayNow: true,
        providerLabel: "Signal",
        selectedOwnerBindings: [{ bindingId: binding.id }],
        relayableRuntimeEvents: [{ runtimeEventId: runtimeEvent.id }],
      });

      const preview = await remoteReplyPreview.execute("signal-runtime-reply-preview", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(preview.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
      expect(preview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
        delegatedProviderId: "signal-cli",
        runtimeEvent: { id: runtimeEvent.id, status: "completed" },
        replyToMessageId: "signal-message-100",
        text: "Ambient switched the active project to Signal relay project.",
      });

      const sent = await remoteReplyApply.execute("signal-runtime-reply-apply", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(sent.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
      expect(sent.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
        delegatedProviderId: "signal-cli",
        delivery: {
          status: "sent",
          runtimeEventId: runtimeEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "signal-message-100",
          providerMessageId: "signal-provider-message-1",
        },
      });
      expect(sentRequests).toEqual([{
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-message-100",
        },
      }]);
      const replyPermission = permissionRequester.mock.calls
        .map((call) => call[0])
        .find((request) => request.toolName === "ambient_messaging_signal_bridge_reply_apply");
      expect(replyPermission?.detail).toContain(`Runtime event: ${runtimeEvent.id}`);
      expect(replyPermission?.detail).toContain("Exact text: Ambient switched the active project to Signal relay project.");

      const statusAfterSent = await status.execute("signal-status-after-sent", {});
      expect(statusAfterSent.content[0].text).toContain(`Runtime event: ${runtimeEvent.id}`);
      expect(statusAfterSent.content[0].text).toContain("Relay status: sent");
      expect(statusAfterSent.content[0].text).toContain("Relay action status: already-relayed");
      expect(statusAfterSent.content[0].text).toContain("Duplicate blocked: yes");
      expect(statusAfterSent.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === runtimeEvent.id)).toMatchObject({
        relayStatus: "sent",
        relayProviderId: "signal-cli",
        relaySuggested: false,
      });
      expect(statusAfterSent.details.remoteSurfaceRelaySummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          runtimeEventId: runtimeEvent.id,
          relayActionStatus: "already-relayed",
          duplicateBlocked: true,
          targetProviderId: "signal-cli",
        }),
      ]));

      const duplicate = await replyApply.execute("signal-runtime-reply-duplicate", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(duplicate.details.status).toBe("blocked");
      expect(duplicate.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
      expect(sentRequests).toHaveLength(1);

      const expiredProjectionEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Signal expired projection project",
        summary: "Active Ambient project switched to Signal expired projection project.",
        threadId: thread.id,
        queuedProjectionId: "projection-signal-expired",
        sourceEventId: "signal-owner-profile-owner-chat-signal-message-101",
        bindingId: binding.id,
        projectName: "Signal expired projection project",
        completedAt: "2026-05-10T00:00:11.000Z",
        relaySuggested: true,
      });
      const expiredProjectionPreview = await remoteReplyPreview.execute("signal-expired-projection-reply-preview", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(expiredProjectionPreview.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
      expect(expiredProjectionPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
        delegatedProviderId: "signal-cli",
        queuedProjectionId: "projection-signal-expired",
        replyToMessageId: "signal-message-101",
        runtimeEvent: { id: expiredProjectionEvent.id, status: "completed" },
      });

      const expiredProjectionSent = await remoteReplyApply.execute("signal-expired-projection-reply-apply", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionSent.content[0].text).toContain("Remote Ambient Surface reply apply");
      expect(expiredProjectionSent.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
      expect(expiredProjectionSent.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
        delegatedProviderId: "signal-cli",
        delivery: {
          status: "sent",
          runtimeEventId: expiredProjectionEvent.id,
          sourceProjectionId: "projection-signal-expired",
          replyToMessageId: "signal-message-101",
          providerMessageId: "signal-provider-message-2",
        },
      });
      expect(sentRequests).toEqual([{
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-message-100",
        },
      }, {
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal expired projection project.",
          replyToMessageId: "signal-message-101",
        },
      }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      else process.env.AMBIENT_SIGNAL_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.fakeUnreadApply === undefined) delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      else process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = originalEnv.fakeUnreadApply;
      if (originalEnv.signalCliPath === undefined) delete process.env.AMBIENT_SIGNAL_CLI_PATH;
      else process.env.AMBIENT_SIGNAL_CLI_PATH = originalEnv.signalCliPath;
      if (originalEnv.signalCliConfigDir === undefined) delete process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR;
      else process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = originalEnv.signalCliConfigDir;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
