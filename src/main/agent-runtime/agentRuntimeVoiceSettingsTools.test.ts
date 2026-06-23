import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createVoiceSettingsToolExtension } from "./agentRuntimeVoiceFacade";

describe("AgentRuntime voice settings tools", () => {
  it("registers typed status, list, select, policy, and test tools backed by injected voice dependencies", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-voice-tools-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("voice tools");
      const provider = runtimeVoiceProvider();
      let currentSettings = runtimeVoiceSettings({
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-warm",
        enabled: false,
      });
      const permissionRequests: Array<{ toolName: string; detail: string }> = [];
      const dogfoodSelectedVoiceProvider = vi.fn(async (
        _thread: unknown,
        _workspace: unknown,
        _settings: VoiceSettings,
        _options?: { text?: string },
      ) => ({
        status: "succeeded" as const,
        audioPath: ".ambient/voice/test.mp3",
        mimeType: "audio/mpeg",
        durationMs: 123,
      }));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

      createVoiceSettingsToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        listProviders: async () => [provider],
        voiceProviderWorkspacePathForCapabilityId: async () => workspacePath,
        resolveFirstPartyPluginPermission: async (input) => {
          permissionRequests.push({ toolName: input.toolName, detail: input.detail });
          return true;
        },
        dogfoodSelectedVoiceProvider,
        voice: {
          readSettings: () => currentSettings,
          updateSettings: async (input) => {
            currentSettings = { ...currentSettings, ...input };
            return currentSettings;
          },
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const status = registeredTools.find((tool) => tool.name === "ambient_voice_status")!;
      const listVoices = registeredTools.find((tool) => tool.name === "ambient_voice_list_voices")!;
      const clonePlan = registeredTools.find((tool) => tool.name === "ambient_voice_clone_plan")!;
      const cloneCreatePreview = registeredTools.find((tool) => tool.name === "ambient_voice_clone_create_preview")!;
      const cloneCreate = registeredTools.find((tool) => tool.name === "ambient_voice_clone_create")!;
      const cloneStatus = registeredTools.find((tool) => tool.name === "ambient_voice_clone_status")!;
      const cloneDelete = registeredTools.find((tool) => tool.name === "ambient_voice_clone_delete")!;
      const select = registeredTools.find((tool) => tool.name === "ambient_voice_select")!;
      const policy = registeredTools.find((tool) => tool.name === "ambient_voice_policy_update")!;
      const test = registeredTools.find((tool) => tool.name === "ambient_voice_test")!;
      expect(status).toBeDefined();
      expect(listVoices).toBeDefined();
      expect(clonePlan).toBeDefined();
      expect(cloneCreatePreview).toBeDefined();
      expect(cloneCreate).toBeDefined();
      expect(cloneStatus).toBeDefined();
      expect(cloneDelete).toBeDefined();
      expect(select).toBeDefined();
      expect(policy).toBeDefined();
      expect(test).toBeDefined();

      const statusResult = await status.execute("status", {});
      expect(statusResult.content[0].text).toContain("Ambient voice status");
      expect(statusResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_status",
        status: "complete",
        providerCount: 1,
        availableProviderCount: 1,
        selectedProviderCapabilityId: provider.capabilityId,
        selectedVoiceId: "voice-warm",
      });

      const listResult = await listVoices.execute("list", {
        providerCapabilityId: provider.capabilityId,
        query: "bright",
      });
      expect(listResult.content[0].text).toContain("Ambient voice list");
      expect(listResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_list_voices",
        status: "complete",
        providerCapabilityId: provider.capabilityId,
        totalVoices: 2,
        matchedVoices: 1,
        returnedVoices: 1,
        voices: [expect.objectContaining({ id: "voice-bright", label: "Bright Narrator" })],
      });

      const clonePlanResult = await clonePlan.execute("clone-plan", {
        providerCapabilityId: provider.capabilityId,
      });
      expect(clonePlanResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_clone_plan",
        status: "complete",
        providerCapabilityId: provider.capabilityId,
        selected: true,
        supported: false,
      });

      const selectResult = await select.execute("select", {
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        enabled: true,
        autoplay: false,
        format: "wav",
        reason: "fixture voice switch",
      });
      expect(selectResult.content[0].text).toContain("Ambient voice settings updated");
      expect(selectResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_select",
        status: "complete",
        selectedProviderCapabilityId: provider.capabilityId,
        selectedVoiceId: "voice-bright",
        settings: {
          enabled: true,
          autoplay: false,
          format: "wav",
          voiceId: "voice-bright",
        },
      });

      const policyResult = await policy.execute("policy", {
        mode: "tagged",
        maxChars: 900,
        longReply: "skip",
        artifactCacheMaxMb: 24,
        reason: "fixture voice policy",
      });
      expect(policyResult.content[0].text).toContain("Ambient voice policy updated");
      expect(policyResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_policy_update",
        status: "complete",
        settings: {
          mode: "tagged",
          maxChars: 900,
          longReply: "skip",
          artifactCacheMaxMb: 24,
        },
      });

      const testResult = await test.execute("test", {
        text: "Hello from Ambient voice.",
        reason: "fixture dogfood",
      });
      expect(testResult.content[0].text).toContain("Ambient voice provider test succeeded");
      expect(testResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_test",
        status: "complete",
        testStatus: "succeeded",
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        audioPath: ".ambient/voice/test.mp3",
        mimeType: "audio/mpeg",
        durationMs: 123,
      });
      expect(dogfoodSelectedVoiceProvider).toHaveBeenCalledTimes(1);
      expect(dogfoodSelectedVoiceProvider.mock.calls[0]?.[2]).toMatchObject({
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        maxChars: 900,
      });
      expect(dogfoodSelectedVoiceProvider.mock.calls[0]?.[3]).toEqual({ text: "Hello from Ambient voice." });
      expect(permissionRequests.map((request) => request.toolName)).toEqual([
        "ambient_voice_select",
        "ambient_voice_policy_update",
        "ambient_voice_test",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function runtimeVoiceSettings(input: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: input.enabled ?? true,
    mode: input.mode ?? "assistant-final",
    autoplay: input.autoplay ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:fixture-voice:tool:voice_tts",
    voiceId: "voiceId" in input ? input.voiceId : "voice-warm",
    preferredVoicesByProvider: input.preferredVoicesByProvider,
    maxChars: input.maxChars ?? 1200,
    longReply: input.longReply ?? "summarize",
    format: input.format ?? "mp3",
    artifactCacheMaxMb: input.artifactCacheMaxMb ?? 32,
  };
}

function runtimeVoiceProvider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:fixture-voice",
    packageName: input.packageName ?? "ambient-fixture-voice",
    command: input.command ?? "voice_tts",
    capabilityId: input.capabilityId ?? "ambient-cli:fixture-voice:tool:voice_tts",
    providerId: input.providerId ?? "fixture-voice",
    label: input.label ?? "Fixture Voice",
    description: input.description,
    format: input.format ?? "mp3",
    formats: input.formats ?? ["mp3", "wav"],
    voices: input.voices ?? [
      { id: "voice-warm", label: "Warm Narrator", locale: "en-US" },
      { id: "voice-bright", label: "Bright Narrator", locale: "en-GB" },
    ],
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available.",
    ...(input.voiceCatalog ? { voiceCatalog: input.voiceCatalog } : {}),
    ...(input.voiceDiscovery ? { voiceDiscovery: input.voiceDiscovery } : {}),
    ...(input.voiceCloning ? { voiceCloning: input.voiceCloning } : {}),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  };
}
