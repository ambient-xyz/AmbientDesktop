import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { ambientModel } from "./agentRuntimeAmbientFacade";
import { AgentRuntimeModelContextController } from "./agentRuntimeModelContextController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

type RegisteredTool = { name: string; execute?: (...args: unknown[]) => Promise<unknown> };

describe("AgentRuntimeModelContextController", () => {
  it("owns model context extension dependency assembly", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-model-context-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("model context");
      const controller = new AgentRuntimeModelContextController({
        store,
        getActiveSession: () => undefined,
        getBrowserState: () => undefined,
        countSerializedPayload: vi.fn(async (_payload, fallbackTokens) => ({
          source: "estimate" as const,
          tokens: fallbackTokens ?? 0,
          latencyMs: 0,
        })),
        recordContextUsageSnapshot: (snapshot) => ({
          ...snapshot,
          updatedAt: "2026-06-21T00:00:00.000Z",
        }),
        emitContextUsageUpdated: vi.fn(),
      });
      const registeredTools: RegisteredTool[] = [];
      const registeredProviders: string[] = [];
      const registeredEvents: string[] = [];
      const pi = {
        registerProvider: (name: string) => {
          registeredProviders.push(name);
        },
        registerTool: (tool: unknown) => {
          registeredTools.push(tool as RegisteredTool);
        },
        on: (eventName: string) => {
          registeredEvents.push(eventName);
        },
      } as unknown as Parameters<ExtensionFactory>[0];

      for (const factory of controller.createModelContextExtensionFactories({
        thread,
        workspace,
        model: ambientModel(thread.model, "http://ambient.test/v1"),
        apiKey: "test-api-key",
      })) {
        factory(pi);
      }

      expect(registeredProviders).toEqual(["ambient"]);
      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_model_status",
        "ambient_product_context",
      ]));
      expect(registeredEvents).toEqual(expect.arrayContaining([
        "tool_result",
        "before_agent_start",
        "before_provider_request",
        "session_before_compact",
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
