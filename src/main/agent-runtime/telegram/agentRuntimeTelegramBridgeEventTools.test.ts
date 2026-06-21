import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerTelegramBridgeEventTools } from "./agentRuntimeTelegramBridgeEventTools";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import { buildRuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerTelegramBridgeEventTools", () => {
  it("registers and executes the Telegram bridge event route tool", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-telegram-bridge-event-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-19T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-19T00:00:02.000Z"),
    });
    const registeredTools: RegisteredTool[] = [];
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

      registerTelegramBridgeEventTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        bindings,
        gatewayRunner,
        runtimeSurfaceSnapshot: () => buildRuntimeSurfaceSnapshot({
          workspace,
          threads: [],
          workflowFolders: [],
          projects: [{
            name: "ambientCoder",
            path: "/workspace",
            updatedAt: "2026-05-19T00:00:00.000Z",
            pinned: true,
            threads: [],
          }],
        } as any),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_telegram_bridge_event_route",
      ]);

      const result = await registeredTools[0]!.execute("telegram-bridge-event-route", {
        profileId: " owner-profile ",
        conversationId: " owner-conversation ",
        messageId: " message-1 ",
        senderId: " owner-user ",
        senderLabel: "Owner",
        text: "show projects",
        receivedAt: "2026-05-19T00:00:01.000Z",
      });

      expect(result.content[0].text).toContain("Ambient messaging inbound dispatch");
      expect(result.content[0].text).toContain("Accepted: yes");
      expect(result.content[0].text).toContain("Projection: Projects (surface_list)");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_telegram_bridge_event_route",
        status: "accepted",
        accepted: true,
        event: {
          id: "telegram-owner-profile-owner-conversation-message-1",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          sender: {
            id: "owner-user",
            label: "Owner",
          },
          text: "show projects",
          receivedAt: "2026-05-19T00:00:01.000Z",
        },
        binding: {
          id: binding.binding.id,
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          purpose: "remote_ambient_surface",
          ambientSurface: "projects",
        },
        projection: {
          kind: "surface_list",
          title: "Projects",
          purpose: "remote_ambient_surface",
          surface: "projects",
          bindingId: binding.binding.id,
        },
        queuedProjection: {
          id: "projection-telegram-tdlib-telegram-owner-profile-owner-conversation-message-1",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-conversation",
          bindingId: binding.binding.id,
          sourceEventId: "telegram-owner-profile-owner-conversation-message-1",
          purpose: "remote_ambient_surface",
          queuedAt: "2026-05-19T00:00:02.000Z",
        },
        runtimeStatus: {
          status: "idle",
          queuedProjectionCount: 1,
          recentEventCount: 1,
          providers: expect.arrayContaining([
            expect.objectContaining({
              providerId: "telegram-tdlib",
              state: "running",
              mode: "real",
              realEventCount: 1,
              queuedProjectionCount: 1,
            }),
          ]),
        },
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
