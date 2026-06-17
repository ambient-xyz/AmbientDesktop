import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  registerMessagingBindingTools,
  type MessagingBindingToolPermissionRequest,
} from "./agentRuntimeMessagingBindingTools";
import { createMessagingBindingStore } from "../../messaging/messagingBindings";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";

describe("registerMessagingBindingTools", () => {
  it("registers the read-only binding list tool with provider, purpose, and inactive filters", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-messaging-binding-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-12T00:00:00.000Z"),
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const permissionRequests: MessagingBindingToolPermissionRequest[] = [];

    try {
      const active = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "projects",
        externalTrustClass: "owner",
      });
      const revoked = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "old-owner-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "projects",
        externalTrustClass: "owner",
      });
      bindings.revoke({ bindingId: revoked.binding.id, reason: "parity test" });

      registerMessagingBindingTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-1",
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        getThread: (threadId) => ({ id: threadId, title: "Thread 1" }) as any,
        resolveFirstPartyPluginPermission: async (request) => {
          permissionRequests.push(request);
          return false;
        },
        bindings,
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_list_bindings",
        "ambient_messaging_binding_preview",
        "ambient_messaging_binding_apply",
      ]);

      const listBindings = toolByName(registeredTools, "ambient_messaging_list_bindings");
      const activeList = await listBindings.execute("list-bindings", {
        providerId: " telegram-tdlib ",
        purpose: "remote_ambient_surface",
      });
      expect(activeList.content[0].text).toContain("Ambient messaging bindings");
      expect(activeList.content[0].text).toContain("Bindings: 1");
      expect(activeList.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_list_bindings",
        status: "complete",
        bindingCount: 1,
        activeBindingCount: 1,
        remoteAmbientSurfaceCount: 1,
        headlessSafeBindingCount: 1,
      });
      expect(activeList.details.bindings[0]).toMatchObject({
        id: active.binding.id,
        status: "active",
        providerId: "telegram-tdlib",
        conversationId: "owner-conversation",
      });

      const inactiveList = await listBindings.execute("list-bindings-inactive", {
        providerId: "telegram-tdlib",
        purpose: "remote_ambient_surface",
        includeInactive: true,
      });
      expect(inactiveList.details).toMatchObject({
        bindingCount: 2,
        activeBindingCount: 1,
      });
      expect(inactiveList.details.bindings.map((binding: any) => binding.status)).toEqual(expect.arrayContaining([
        "active",
        "revoked",
      ]));

      const createParams = {
        action: "create",
        providerId: " telegram-tdlib ",
        authProfileId: " owner-profile ",
        conversationId: " new-owner-conversation ",
        purpose: "remote_ambient_surface",
        ownerUserId: " owner-user ",
        ambientSurface: "projects",
        externalTrustClass: "owner",
      };
      const preview = await toolByName(registeredTools, "ambient_messaging_binding_preview").execute("binding-preview", createParams);
      expect(preview.content[0].text).toContain("Ambient messaging binding create preview");
      expect(preview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_binding_preview",
        status: "complete",
        action: "create",
        approvalRequired: true,
        wouldPersist: true,
        wouldStartBridge: false,
        wouldReadMessages: false,
        wouldSendMessages: false,
        binding: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "new-owner-conversation",
          purpose: "remote_ambient_surface",
          status: "active",
          ownerUserId: "owner-user",
          ambientSurface: "projects",
          externalTrustClass: "owner",
        },
      });

      const denied = await toolByName(registeredTools, "ambient_messaging_binding_apply").execute("binding-apply", createParams);
      expect(permissionRequests).toHaveLength(1);
      expect(permissionRequests[0]).toMatchObject({
        thread: { id: "thread-1" },
        workspace: { path: "/workspace" },
        toolName: "ambient_messaging_binding_apply",
        title: "Create messaging binding?",
        message: "Create remote_ambient_surface binding for telegram-tdlib.",
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: "ambient-messaging-binding:telegram-tdlib:remote_ambient_surface",
        grantTargetIdentity: `telegram-tdlib:remote_ambient_surface:new-owner-conversation:${denied.details.binding.id}`,
        allowedReason: "User approved messaging binding lifecycle mutation.",
        deniedReason: "User denied messaging binding lifecycle mutation.",
      });
      expect(permissionRequests[0]!.detail).toContain("This does not start provider bridges, read provider messages, or send provider messages.");
      expect(denied.content[0].text).toContain("Messaging binding change was not applied because approval was denied.");
      expect(denied.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_binding_apply",
        status: "denied",
        action: "create",
        approvalRequired: true,
        wouldPersist: true,
        binding: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "new-owner-conversation",
          purpose: "remote_ambient_surface",
          status: "active",
        },
      });

      const signalParams = {
        action: "create",
        providerId: "signal-cli",
        authProfileId: "signal-owner",
        conversationId: "signal-chat-1",
        purpose: "remote_ambient_surface",
      };
      const signalBlocked = await toolByName(registeredTools, "ambient_messaging_binding_preview").execute("signal-binding-preview", signalParams);
      expect(signalBlocked.content[0].text).toContain("Generic Signal messaging binding lifecycle is blocked.");
      expect(signalBlocked.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_binding_preview",
        status: "blocked",
        action: "create",
        providerId: "signal-cli",
        purpose: "remote_ambient_surface",
        conversationId: "signal-chat-1",
        genericBindingApplyAllowed: false,
        typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        approvalRequested: false,
        persisted: false,
      });

      const signalApplyBlocked = await toolByName(registeredTools, "ambient_messaging_binding_apply").execute("signal-binding-apply", signalParams);
      expect(signalApplyBlocked.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_binding_apply",
        status: "blocked",
        providerId: "signal-cli",
        approvalRequested: false,
        persisted: false,
      });
      expect(permissionRequests).toHaveLength(1);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

function toolByName(
  registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }>,
  name: string,
): { name: string; execute: (...args: any[]) => Promise<any> } {
  const tool = registeredTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Expected registered tool ${name}.`);
  return tool;
}
