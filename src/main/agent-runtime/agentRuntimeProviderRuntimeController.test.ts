import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { SttSettings, VoiceSettings } from "../../shared/localRuntimeTypes";
import { LocalModelRuntimeManager } from "./agentRuntimeLocalRuntimeFacade";
import { AgentRuntimeProviderRuntimeController } from "./agentRuntimeProviderRuntimeController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

type RegisteredTool = { name: string; execute?: (...args: unknown[]) => Promise<unknown> };

describe("AgentRuntimeProviderRuntimeController", () => {
  it("owns provider runtime extension dependency assembly", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-provider-owner-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("provider runtime");
      const localModelRuntimeManager = new LocalModelRuntimeManager();
      const controller = new AgentRuntimeProviderRuntimeController({
        store,
        features: {
          voice: {
            readSettings: () => ({ enabled: false }) as VoiceSettings,
            listProviders: () => [],
          },
          stt: {
            readSettings: () => ({ enabled: false }) as SttSettings,
            listProviders: () => [],
          },
        },
        localModelRuntimeManager: () => localModelRuntimeManager,
        resolveFirstPartyPluginPermission: vi.fn(async () => true),
        resolveLocalRuntimeOwnershipForForcedAction: vi.fn(async () => {
          throw new Error("forced ownership resolution should not run during registration");
        }),
        resolveLocalRuntimeOwnershipForStopPlan: vi.fn(async () => undefined),
        resolveLocalRuntimeOwnershipForRestartPlan: vi.fn(async () => undefined),
      });
      const registeredTools: RegisteredTool[] = [];
      const pi = {
        registerTool: (tool: unknown) => {
          registeredTools.push(tool as RegisteredTool);
        },
      } as unknown as Parameters<ExtensionFactory>[0];

      controller.createVoiceSettingsToolExtension(thread.id, workspace)(pi);
      controller.createSttSettingsToolExtension(thread.id, workspace)(pi);
      controller.createLocalRuntimeToolExtension(workspace)(pi);

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_voice_status",
        "ambient_voice_list_voices",
        "ambient_voice_select",
        "ambient_stt_status",
        "ambient_stt_select",
        "ambient_local_model_runtime_status",
        "ambient_local_model_runtime_start",
        "ambient_local_model_runtime_stop",
        "ambient_local_model_runtime_restart",
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
