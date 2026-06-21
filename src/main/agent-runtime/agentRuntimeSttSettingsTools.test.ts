import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SttProviderCandidate, SttSettings } from "../../shared/localRuntimeTypes";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { createSttSettingsToolExtension, writePcm16Wav } from "./agentRuntimeSttFacade";

describe("AgentRuntime STT settings tools", () => {
  it("registers typed status, select, policy, and test tools backed by injected STT dependencies", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stt-tools-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const speechPath = "speech.wav";
      await writeFile(join(workspacePath, speechPath), writePcm16Wav({
        sampleRate: 16_000,
        channels: 1,
        samples: new Int16Array(1600).fill(1800),
      }));
      const thread = store.createThread("stt tools");
      const provider = runtimeSttProvider();
      let currentSettings = runtimeSttSettings({
        providerCapabilityId: provider.capabilityId,
        enabled: false,
      });
      const permissionRequests: Array<{ toolName: string; detail: string }> = [];
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

      createSttSettingsToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        listProviders: async () => [provider],
        resolveFirstPartyPluginPermission: async (input) => {
          permissionRequests.push({ toolName: input.toolName, detail: input.detail });
          return true;
        },
        stt: {
          readSettings: () => currentSettings,
          updateSettings: async (input) => {
            currentSettings = { ...currentSettings, ...input };
            return currentSettings;
          },
          testRunner: async (_workspacePath, input) => {
            const outputJsonPath = runtimeRequiredCliArg(input.args, "--output-json");
            await mkdir(dirname(outputJsonPath), { recursive: true });
            await writeFile(
              outputJsonPath,
              `${JSON.stringify({
                text: "ambient speech recognition spike",
                language: "English",
                durationMs: 321,
                providerId: "qwen3-asr-fixture",
              })}\n`,
              "utf8",
            );
            return {
              packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
              packageName: input.packageName ?? "ambient-qwen3-asr",
              commandName: input.command,
              command: [input.command, ...(input.args ?? [])],
              cwd: "",
              durationMs: 7,
              stdout: JSON.stringify({ text: "ambient speech recognition spike" }),
              stderr: "",
            };
          },
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const status = registeredTools.find((tool) => tool.name === "ambient_stt_status")!;
      const select = registeredTools.find((tool) => tool.name === "ambient_stt_select")!;
      const policy = registeredTools.find((tool) => tool.name === "ambient_stt_policy_update")!;
      const test = registeredTools.find((tool) => tool.name === "ambient_stt_test")!;
      expect(status).toBeDefined();
      expect(select).toBeDefined();
      expect(policy).toBeDefined();
      expect(test).toBeDefined();

      const statusResult = await status.execute("status", {});
      expect(statusResult.content[0].text).toContain("Ambient STT status");
      expect(statusResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_status",
        status: "complete",
        providerCount: 1,
        availableProviderCount: 1,
        selectedProviderCapabilityId: provider.capabilityId,
      });

      const selectResult = await select.execute("select", {
        providerCapabilityId: provider.capabilityId,
        spokenLanguage: "Spanish",
        enabled: true,
      });
      expect(selectResult.content[0].text).toContain("Ambient STT settings updated");
      expect(selectResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_select",
        status: "complete",
        selectedProviderCapabilityId: provider.capabilityId,
        settings: {
          enabled: true,
          spokenLanguage: "Spanish",
        },
      });

      const policyResult = await policy.execute("policy", {
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 1.2,
        reason: "fixture policy change",
      });
      expect(policyResult.content[0].text).toContain("Ambient STT policy updated");
      expect(policyResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_policy_update",
        status: "complete",
        settings: {
          autoSendAfterTranscription: false,
          silenceFinalizeSeconds: 1.2,
        },
      });

      const testResult = await test.execute("test", {
        audioPath: speechPath,
        spokenLanguage: "English",
      });
      expect(testResult.content[0].text).toContain("Ambient STT test succeeded");
      expect(testResult.content[0].text).toContain("Transcript: ambient speech recognition spike");
      expect(testResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_test",
        status: "complete",
        testStatus: "ready",
        providerCapabilityId: provider.capabilityId,
        language: "English",
        transcript: "ambient speech recognition spike",
        audioPath: speechPath,
        transcriptPath: expect.stringContaining(".ambient/stt/stt-tool-test/"),
        jsonPath: expect.stringContaining(".ambient/stt/stt-tool-test/"),
      });
      expect(permissionRequests.map((request) => request.toolName)).toEqual([
        "ambient_stt_select",
        "ambient_stt_policy_update",
        "ambient_stt_test",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function runtimeSttSettings(input: Partial<SttSettings> = {}): SttSettings {
  return {
    enabled: input.enabled ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    spokenLanguage: input.spokenLanguage ?? "English",
    pushToTalkShortcut: input.pushToTalkShortcut,
    mode: input.mode ?? "push-to-talk",
    autoSendAfterTranscription: input.autoSendAfterTranscription ?? true,
    silenceFinalizeSeconds: input.silenceFinalizeSeconds ?? 0.8,
    noSpeechGate: input.noSpeechGate ?? { enabled: false, rmsThresholdDbfs: -55 },
    bargeIn: input.bargeIn ?? { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
  };
}

function runtimeSttProvider(input: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    command: input.command ?? "qwen3_asr_transcribe",
    capabilityId: input.capabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    label: input.label ?? "Qwen3-ASR Local",
    description: input.description,
    languages: input.languages ?? ["English", "Spanish", "Japanese"],
    defaultLanguage: input.defaultLanguage ?? "English",
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available.",
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    ...(input.validation ? { validation: input.validation } : {}),
  };
}

function runtimeRequiredCliArg(args: string[] | undefined, name: string): string {
  const index = args?.indexOf(name) ?? -1;
  const value = index >= 0 ? args?.[index + 1] : undefined;
  if (!value) throw new Error(`Missing required test argument: ${name}`);
  return value;
}
