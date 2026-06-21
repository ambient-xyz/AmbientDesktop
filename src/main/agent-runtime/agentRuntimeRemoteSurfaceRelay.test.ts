import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createDefaultMessagingProviderRegistry } from "./agentRuntimeMessagingFacade";
import { createMessagingBindingStore } from "./agentRuntimeMessagingFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime Remote Ambient Surface relay", () => {
  it("records failed Remote Ambient Surface project switches in gateway status", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-remote-switch-status-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("remote switch status").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const researchProjectPath = join(workspacePath, "research-project");
      const project = (path: string, name: string): ProjectSummary => ({
        id: path,
        path,
        name,
        statePath: join(path, ".ambient-codex"),
        sessionPath: join(path, ".ambient-codex", "sessions"),
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      }, {
        projects: {
          listProjects: () => [
            project(workspacePath, "Active project"),
            project(researchProjectPath, "Research project"),
          ],
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_command_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const routed = await route.execute("route-switch-project", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "message-switch-project",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "switch project Research project",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      await expect(apply.execute("apply-switch-project", { queuedProjectionId })).rejects.toThrow("Ambient active project switching is not available");

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Remote Ambient Surface runtime events:");
      expect(gatewayStatus.content[0].text).toContain("Status: failed");
      expect(gatewayStatus.content[0].text).toContain("Project: Research project");
      expect(gatewayStatus.content[0].text).toContain("Relay suggested: yes");
      expect(gatewayStatus.content[0].text).toContain("Relay action status: preview-ready");
      expect(gatewayStatus.content[0].text).toContain(`Provider-neutral relay preview command: ambient_messaging_remote_surface_reply_preview runtimeEventId=${gatewayStatus.details.remoteSurfaceRuntimeEvents[0].id}`);
      expect(gatewayStatus.content[0].text).toContain(`Provider-neutral relay apply command: ambient_messaging_remote_surface_reply_apply runtimeEventId=${gatewayStatus.details.remoteSurfaceRuntimeEvents[0].id}`);
      expect(gatewayStatus.details.remoteSurfaceRelaySummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          relayActionStatus: "preview-ready",
          previewToolName: "ambient_messaging_remote_surface_reply_preview",
          applyToolName: "ambient_messaging_remote_surface_reply_apply",
          duplicateBlocked: false,
        }),
      ]));
      expect(gatewayStatus.details.remoteSurfaceRuntimeEvents).toMatchObject([
        {
          kind: "active_project_switch",
          status: "failed",
          queuedProjectionId,
          projectName: "Research project",
          relaySuggested: true,
        },
      ]);
      expect(gatewayStatus.details.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
      expect(gatewayStatus.details.recentRemoteSurfaceRuntimeEventCount).toBe(1);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("applies Remote Ambient Surface project switches immediately outside an active Pi run", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-remote-switch-immediate-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("remote switch immediate").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const researchProjectPath = join(workspacePath, "research-project");
      const project = (path: string, name: string): ProjectSummary => ({
        id: path,
        path,
        name,
        statePath: join(path, ".ambient-codex"),
        sessionPath: join(path, ".ambient-codex", "sessions"),
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      });
      const switchCalls: Array<{ workspacePath: string; reason: string }> = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      }, {
        projects: {
          listProjects: () => [
            project(workspacePath, "Active project"),
            project(researchProjectPath, "Research project"),
          ],
          switchProject: (input) => {
            switchCalls.push(input);
          },
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_command_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const routed = await route.execute("route-switch-project", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "message-switch-project",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "switch project Research project",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      const result = await apply.execute("apply-switch-project", { queuedProjectionId });

      expect(result.content[0].text).toContain("Completed active project switch: Research project");
      expect(result.details).toMatchObject({
        status: "applied",
        commandStatus: "ready",
        completedProjectSwitch: {
          path: researchProjectPath,
          name: "Research project",
        },
      });
      expect(switchCalls).toEqual([{ workspacePath: researchProjectPath, reason: "remote-surface-command:switch_project" }]);

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Remote Ambient Surface runtime events:");
      expect(gatewayStatus.content[0].text).toContain("Status: completed");
      expect(gatewayStatus.content[0].text).toContain("Project: Research project");
      expect(gatewayStatus.content[0].text).toContain("Relay suggested: yes");
      expect(gatewayStatus.content[0].text).toContain("Relay action status: preview-ready");
      expect(gatewayStatus.details.remoteSurfaceRuntimeEvents).toMatchObject([
        {
          kind: "active_project_switch",
          status: "completed",
          queuedProjectionId,
          projectName: "Research project",
          relaySuggested: true,
        },
      ]);
      expect(gatewayStatus.details.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
      expect(gatewayStatus.details.recentRemoteSurfaceRuntimeEventCount).toBe(1);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records real-mode Telegram runtime event relay outcomes and blocks duplicate sent relays", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-real-relay-"));
    const store = new ProjectStore();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
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
          stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
          sessionCount: 1,
        }) as any;
      }
      if (init?.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
        sentRequests.push({ path: url.pathname, body });
        if (String(body.text ?? "").includes("Failure project")) {
          return jsonResponse(false, 503, "Service Unavailable", { error: "forced relay failure" }) as any;
        }
        return jsonResponse(true, 200, "OK", {
          messageId: `provider-message-${sentRequests.length}`,
          date: "2026-05-10T00:00:10.000Z",
        }) as any;
      }
      return jsonResponse(false, 404, "Not Found", { error: "not found" }) as any;
    }) as any;

    try {
      store.openWorkspace(workspacePath);
      const stateRoot = join(workspacePath, ".ambient-agent-state", "telegram");
      const profileRoot = join(stateRoot, "owner-profile");
      await mkdir(profileRoot, { recursive: true });
      await writeFile(join(profileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner-profile",
        phoneNumber: "+15550000000",
        tdlibStateDir: profileRoot,
        databaseEncryptionKey: "test-encryption-key",
      }), "utf8");
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "test-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:8091";
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;

      const thread = store.updateThreadSettings(store.createThread("runtime relay").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }).binding;
      const permissionRequests: any[] = [];
      let deniedRuntimeEventId = "";
      const permissionRequester = vi.fn(async (request: any) => {
        permissionRequests.push(request);
        if (
          request.toolName === "ambient_messaging_telegram_bridge_reply_apply" &&
          deniedRuntimeEventId &&
          request.detail.includes(deniedRuntimeEventId)
        ) {
          return { allowed: false, mode: "deny" as const };
        }
        return { allowed: true, mode: "allow_once" as const };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const lifecycleApply = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_lifecycle_apply")!;
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const replyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_reply_preview")!;
      const replyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_reply_apply")!;
      const remoteReplyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_reply_preview")!;
      const remoteReplyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_reply_apply")!;
      const relayDiagnostics = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_relay_diagnostics")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const lifecycle = await lifecycleApply.execute("start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const routed = await route.execute("route-owner-message", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "100",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "status",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;
      const recordRuntimeEvent = (projectName: string, overrides: Record<string, unknown> = {}) => (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: `Switch to ${projectName}`,
        summary: `Active Ambient project switched to ${projectName}.`,
        threadId: thread.id,
        queuedProjectionId,
        bindingId: binding.id,
        projectName,
        completedAt: "2026-05-10T00:00:09.000Z",
        relaySuggested: true,
        ...overrides,
      });

      const sentEvent = recordRuntimeEvent("Relay success project");
      const diagnostics = await relayDiagnostics.execute("relay-diagnostics", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
      });
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Telegram bridge running");
      expect(diagnostics.content[0].text).toContain(`Event ${sentEvent.id}`);
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        bridgeModeLabel: "real Telegram bridge running",
        canSendOwnerRelayNow: true,
        providerLabel: "Telegram",
        selectedOwnerBindings: [{ bindingId: binding.id }],
        relayableRuntimeEvents: [{ runtimeEventId: sentEvent.id }],
      });
      const sentPreview = await replyPreview.execute("preview-sent-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(sentPreview.details).toMatchObject({
        status: "ready",
        runtimeEvent: { id: sentEvent.id, status: "completed" },
      });

      const sentResult = await replyApply.execute("apply-sent-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(sentResult.details).toMatchObject({
        status: "sent",
        delivery: {
          status: "sent",
          runtimeEventId: sentEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "100",
          providerMessageId: "provider-message-1",
        },
      });
      expect(sentRequests).toHaveLength(1);
      expect(sentRequests[0]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Relay success project.",
          replyToMessageId: "100",
        },
      });
      const sentPermission = permissionRequests.find((request) =>
        request.toolName === "ambient_messaging_telegram_bridge_reply_apply" &&
        request.detail.includes(sentEvent.id));
      expect(sentPermission?.detail).toContain(`Runtime event: ${sentEvent.id}`);
      expect(sentPermission?.detail).toContain("Conversation: owner-chat");
      expect(sentPermission?.detail).toContain("Reply to provider message: 100");
      expect(sentPermission?.detail).toContain("Exact text: Ambient switched the active project to Relay success project.");

      const statusAfterSent = await status.execute("status-after-sent", {});
      expect(statusAfterSent.content[0].text).toContain(`Runtime event: ${sentEvent.id}`);
      expect(statusAfterSent.content[0].text).toContain("Relay status: sent");
      expect(statusAfterSent.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === sentEvent.id)).toMatchObject({
        relayStatus: "sent",
        relayProviderId: "telegram-tdlib",
        relaySuggested: false,
      });

      const duplicateResult = await replyApply.execute("apply-duplicate-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(duplicateResult.details.status).toBe("blocked");
      expect(duplicateResult.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
      expect(sentRequests).toHaveLength(1);
      const statusAfterDuplicate = await status.execute("status-after-duplicate", {});
      expect(statusAfterDuplicate.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === sentEvent.id)).toMatchObject({
        relayStatus: "sent",
        relaySuggested: false,
      });

      const aliasEvent = recordRuntimeEvent("Relay alias project");
      const aliasPreview = await remoteReplyPreview.execute("preview-alias-runtime-event", {
        runtimeEventId: aliasEvent.id,
      });
      expect(aliasPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(aliasPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
      expect(aliasPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
        delegatedProviderId: "telegram-tdlib",
        runtimeEvent: { id: aliasEvent.id, status: "completed" },
      });

      const aliasResult = await remoteReplyApply.execute("apply-alias-runtime-event", {
        runtimeEventId: aliasEvent.id,
      });
      expect(aliasResult.content[0].text).toContain("Remote Ambient Surface reply apply");
      expect(aliasResult.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
      expect(aliasResult.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
        delegatedProviderId: "telegram-tdlib",
        delivery: {
          status: "sent",
          runtimeEventId: aliasEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "100",
          providerMessageId: "provider-message-2",
        },
      });
      expect(sentRequests).toHaveLength(2);
      expect(sentRequests[1]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Relay alias project.",
          replyToMessageId: "100",
        },
      });

      const expiredProjectionEvent = recordRuntimeEvent("Expired projection project", {
        queuedProjectionId: "projection-telegram-expired",
        sourceEventId: "telegram-owner-profile-owner-chat-101",
      });
      const expiredProjectionPreview = await remoteReplyPreview.execute("preview-expired-projection-runtime-event", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(expiredProjectionPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
      expect(expiredProjectionPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
        delegatedProviderId: "telegram-tdlib",
        queuedProjectionId: "projection-telegram-expired",
        replyToMessageId: "101",
        runtimeEvent: { id: expiredProjectionEvent.id, status: "completed" },
      });

      const expiredProjectionResult = await remoteReplyApply.execute("apply-expired-projection-runtime-event", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionResult.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
        delegatedProviderId: "telegram-tdlib",
        delivery: {
          status: "sent",
          runtimeEventId: expiredProjectionEvent.id,
          sourceProjectionId: "projection-telegram-expired",
          replyToMessageId: "101",
          providerMessageId: "provider-message-3",
        },
      });
      expect(sentRequests).toHaveLength(3);
      expect(sentRequests[2]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Expired projection project.",
          replyToMessageId: "101",
        },
      });

      const unsupportedProviderEvent = recordRuntimeEvent("Unsupported provider project", {
        queuedProjectionId: "projection-unsupported-provider",
        sourceEventId: "telegram-owner-profile-owner-chat-102",
        relayProviderId: "matrix-bridge",
      });
      const unsupportedProviderStatus = await status.execute("status-unsupported-provider", {});
      const unsupportedSummary = unsupportedProviderStatus.details.remoteSurfaceRelaySummaries.find((summary: any) => summary.runtimeEventId === unsupportedProviderEvent.id);
      expect(unsupportedSummary).toMatchObject({
        relayActionStatus: "repair-needed",
        targetProviderId: "matrix-bridge",
        previewToolName: "ambient_messaging_remote_surface_reply_preview",
        previewCommand: `ambient_messaging_remote_surface_reply_preview runtimeEventId=${unsupportedProviderEvent.id}`,
      });
      expect(unsupportedSummary.applyToolName).toBeUndefined();
      const unsupportedProviderPreview = await remoteReplyPreview.execute("preview-unsupported-provider-runtime-event", {
        runtimeEventId: unsupportedProviderEvent.id,
      });
      expect(unsupportedProviderPreview.details.status).toBe("blocked");
      expect(unsupportedProviderPreview.content[0].text).toContain("Remote Ambient Surface reply alias does not support provider matrix-bridge.");
      expect(unsupportedProviderPreview.content[0].text).toContain("Provider matrix-bridge has no reviewed Remote Ambient Surface reply adapter");
      expect(unsupportedProviderPreview.content[0].text).toContain("Do not use shell, browser, provider desktop apps, provider CLIs, generic messaging tools, or Messaging Connector sends as a workaround.");
      expect(unsupportedProviderPreview.content[0].text).not.toContain("Delegated tool:");
      const unsupportedProviderApply = await remoteReplyApply.execute("apply-unsupported-provider-runtime-event", {
        runtimeEventId: unsupportedProviderEvent.id,
      });
      expect(unsupportedProviderApply.details.status).toBe("blocked");
      expect(unsupportedProviderApply.content[0].text).toContain("Remote Ambient Surface reply alias does not support provider matrix-bridge.");
      expect(sentRequests).toHaveLength(3);

      const failedEvent = recordRuntimeEvent("Failure project");
      const failedResult = await replyApply.execute("apply-failed-runtime-event", {
        runtimeEventId: failedEvent.id,
      });
      expect(failedResult.details).toMatchObject({
        status: "failed",
        delivery: {
          status: "failed",
          runtimeEventId: failedEvent.id,
        },
      });
      expect(failedResult.details.delivery.error).toContain("HTTP 503 Service Unavailable");
      expect(sentRequests).toHaveLength(4);

      const deniedEvent = recordRuntimeEvent("Denied project");
      deniedRuntimeEventId = deniedEvent.id;
      const deniedResult = await replyApply.execute("apply-denied-runtime-event", {
        runtimeEventId: deniedEvent.id,
      });
      expect(deniedResult.details).toMatchObject({
        status: "denied",
        delivery: {
          status: "denied",
          runtimeEventId: deniedEvent.id,
        },
      });
      expect(sentRequests).toHaveLength(4);

      const finalStatus = await status.execute("final-status", {});
      expect(finalStatus.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === failedEvent.id)).toMatchObject({
        relayStatus: "failed",
        relayError: expect.stringContaining("HTTP 503 Service Unavailable"),
        relaySuggested: true,
      });
      expect(finalStatus.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === deniedEvent.id)).toMatchObject({
        relayStatus: "denied",
        relaySuggested: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
