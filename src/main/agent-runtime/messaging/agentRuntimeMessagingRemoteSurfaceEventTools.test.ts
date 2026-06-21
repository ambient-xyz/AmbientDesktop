import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerMessagingRemoteSurfaceEventTools } from "./agentRuntimeMessagingRemoteSurfaceEventTools";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { buildRuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

describe("registerMessagingRemoteSurfaceEventTools", () => {
  it("registers and executes the generic Remote Ambient Surface event preview tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-remote-surface-event-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-15T00:00:00.000Z"),
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const workspace = {
      name: "ambientCoder",
      path: "/workspace",
      statePath: stateRoot,
      sessionPath: join(stateRoot, "sessions"),
    };

    try {
      const binding = bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-user",
        ambientSurface: "projects",
        externalTrustClass: "owner",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });

      registerMessagingRemoteSurfaceEventTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        registry: providers,
        bindings,
        runtimeSurfaceSnapshot: () => buildRuntimeSurfaceSnapshot({
          workspace,
          threads: [],
          workflowFolders: [],
          projects: [{
            name: "ambientCoder",
            path: "/workspace",
            updatedAt: "2026-05-15T00:00:00.000Z",
            pinned: true,
            threads: [],
          }],
        } as any),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_remote_surface_event_preview",
      ]);

      const previewTool = registeredTools[0]!;
      const ready = await previewTool.execute("remote-surface-event-preview", {
        providerId: " telegram-tdlib ",
        authProfileId: " owner-profile ",
        conversationId: " owner-conversation ",
        senderId: " owner-user ",
        senderLabel: "Owner",
        text: "show projects",
        receivedAt: "2026-05-15T00:00:01.000Z",
      });
      expect(ready.content[0].text).toContain("Remote Ambient Surface inbound event preview: ready");
      expect(ready.content[0].text).toContain("Projection preview:");
      expect(ready.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_event_preview",
        status: "ready",
        kind: "remote-surface-event-preview",
        providerId: "telegram-tdlib",
        providerLabel: "Telegram",
        canRouteWithTypedTool: true,
        typedRouteTool: "ambient_messaging_telegram_bridge_event_route",
        event: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          sender: {
            id: "owner-user",
            label: "Owner",
          },
          text: "show projects",
          receivedAt: "2026-05-15T00:00:01.000Z",
        },
        matchedBinding: {
          id: binding.binding.id,
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          purpose: "remote_ambient_surface",
          ownerUserId: "owner-user",
          ambientSurface: "projects",
        },
        routePreview: {
          binding: {
            id: binding.binding.id,
          },
          projection: {
            kind: "surface_list",
            title: "Projects",
            purpose: "remote_ambient_surface",
            surface: "projects",
            bindingId: binding.binding.id,
          },
        },
        safety: {
          startsBridge: false,
          readsProviderHistory: false,
          sendsProviderMessages: false,
          queuesProjection: false,
        },
      });

      const bindingRequired = await previewTool.execute("remote-surface-event-preview-binding-required", {
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "unknown-conversation",
        senderId: "owner-user",
        text: "show projects",
        receivedAt: "2026-05-15T00:00:02.000Z",
      });
      expect(bindingRequired.content[0].text).toContain("Remote Ambient Surface inbound event preview: binding_required");
      expect(bindingRequired.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_remote_surface_event_preview",
        status: "binding_required",
        providerId: "telegram-tdlib",
        canRouteWithTypedTool: false,
        routePreview: {
          projection: {
            kind: "binding_required",
            title: "Messaging binding required",
          },
        },
      });
      expect(bindingRequired.details.matchedBinding).toBeUndefined();
      expect(bindingRequired.details.blockers).toEqual(expect.arrayContaining([
        "No active Remote Ambient Surface binding matches this provider event.",
      ]));
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
