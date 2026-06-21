import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { AgentRuntimeMessagingGatewayController } from "./agentRuntimeMessagingGatewayController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

type RegisteredTool = { name: string; execute?: (...args: unknown[]) => Promise<unknown> };

describe("AgentRuntimeMessagingGatewayController", () => {
  it("owns messaging gateway extension dependency assembly", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-messaging-owner-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("messaging gateway");
      const controller = new AgentRuntimeMessagingGatewayController({
        store,
        remoteSurfaceRuntimeEvents: {
          status: vi.fn((status) => status),
          markRelay: vi.fn(),
          record: vi.fn(),
        },
        activeRuns: new Map([[thread.id, {}]]),
        pendingProjectSwitchByThreadId: new Map(),
        completePendingProjectSwitch: vi.fn(async () => undefined),
        listPermissionRequests: () => [],
        workflowRecoveryEvents: () => [],
        resolveFirstPartyPluginPermission: vi.fn(async () => true),
        secureInputs: undefined,
        switchProjectAvailable: () => false,
        workflowAgents: undefined,
        emit: vi.fn(),
        voice: undefined,
        stt: undefined,
        listSttProviders: vi.fn(async () => []),
        media: undefined,
        planner: undefined,
        search: undefined,
      });
      const registeredTools: RegisteredTool[] = [];

      controller.createMessagingGatewayToolExtension(thread.id, workspace)({
        registerTool: (tool: unknown) => {
          registeredTools.push(tool as RegisteredTool);
        },
      } as unknown as Parameters<ExtensionFactory>[0]);

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_messaging_headless_ux_inventory",
        "ambient_messaging_telegram_session_preview",
        "ambient_messaging_signal_session_preview",
        "ambient_messaging_remote_surface_binding_preview",
        "ambient_messaging_remote_surface_command_apply",
        "ambient_messaging_gateway_status",
        "ambient_messaging_gateway_lifecycle_apply",
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
