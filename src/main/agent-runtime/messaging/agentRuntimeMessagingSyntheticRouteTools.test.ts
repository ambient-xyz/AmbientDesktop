import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerMessagingSyntheticRouteTools } from "./agentRuntimeMessagingSyntheticRouteTools";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import { buildRuntimeSurfaceSnapshot } from "../../../shared/runtimeSurfaceSnapshot";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

describe("registerMessagingSyntheticRouteTools", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers and executes the synthetic messaging route tool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:00:01.000Z"));

    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-synthetic-route-tools-"));
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-18T00:00:00.000Z"),
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-18T00:00:02.000Z"),
    });
    const registeredTools: RegisteredTool[] = [];
    const workspace = {
      name: "AmbientDesktop",
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

      registerMessagingSyntheticRouteTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        bindings,
        gatewayRunner,
        runtimeSurfaceSnapshot: () => buildRuntimeSurfaceSnapshot({
          workspace,
          threads: [],
          workflowFolders: [],
          projects: [{
            name: "AmbientDesktop",
            path: "/workspace",
            updatedAt: "2026-05-18T00:00:00.000Z",
            pinned: true,
            threads: [],
          }],
        } as any),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_synthetic_route",
      ]);

      const result = await registeredTools[0]!.execute("synthetic-route", {
        providerId: " telegram-tdlib ",
        conversationId: " owner-conversation ",
        senderId: " owner-user ",
        senderLabel: "Owner",
        text: "show projects",
      });

      expect(result.content[0].text).toContain("Messaging projection: Projects");
      expect(result.content[0].text).toContain("Kind: surface_list");
      expect(result.content[0].text).toContain("Surface: projects");
      expect(result.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_synthetic_route",
        status: "complete",
        event: {
          id: "synthetic-1779062401000",
          providerId: "telegram-tdlib",
          conversationId: "owner-conversation",
          sender: {
            id: "owner-user",
            label: "Owner",
          },
          text: "show projects",
          receivedAt: "2026-05-18T00:00:01.000Z",
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
          id: "projection-telegram-tdlib-synthetic-1779062401000",
          providerId: "telegram-tdlib",
          conversationId: "owner-conversation",
          bindingId: binding.binding.id,
          sourceEventId: "synthetic-1779062401000",
          purpose: "remote_ambient_surface",
          queuedAt: "2026-05-18T00:00:02.000Z",
        },
        runtimeStatus: {
          status: "idle",
          queuedProjectionCount: 1,
        },
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
