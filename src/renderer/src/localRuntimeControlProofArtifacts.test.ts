import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import type { MiniCpmVisionSetupResult, VoiceProviderCandidate, VoiceSettings } from "../../shared/types";
import {
  miniCpmVisionSetupActions,
  miniCpmVisionSetupResultModel,
  type MiniCpmVisionSetupResultModel,
} from "./miniCpmVisionUiModel";
import {
  voiceSettingsProviderModel,
  type VoiceSettingsProviderModel,
} from "./voiceUiModel";

describe("local runtime control proof artifacts", () => {
  it("writes stopped-provider display proof for MiniCPM and local voice providers", async () => {
    const miniCpmResult = stoppedMiniCpmResult();
    const miniCpmModel = miniCpmVisionSetupResultModel(miniCpmResult);
    const miniCpmActions = miniCpmVisionSetupActions(miniCpmResult);
    const voiceModel = voiceSettingsProviderModel({
      providers: [stoppedVoiceProvider()],
      settings: voiceSettings(),
    });

    expect(miniCpmModel).toMatchObject({
      statusLabel: "MiniCPM-V stopped",
      statusTone: "info",
    });
    expect(miniCpmModel.detailLabels).toContain("Runtime state: stopped");
    expect(miniCpmActions[0]).toMatchObject({ action: "validate", primary: true });
    expect(voiceModel).toMatchObject({
      statusLabel: "Voice runtime stopped",
      enabledChecked: false,
      runtimeState: {
        status: "stopped",
        label: "Voice runtime stopped",
        tone: "info",
      },
      diagnostics: {
        runtimeLabels: expect.arrayContaining(["Runtime state: stopped"]),
      },
    });
    expect(voiceModel.runtimeState.detail).toContain("stopped local voice runtime");

    await writeStoppedProviderDisplayProofArtifact({ miniCpmModel, voiceModel });
  });
});

function stoppedMiniCpmResult(): MiniCpmVisionSetupResult {
  return {
    provider: "minicpm-v",
    action: "stop",
    status: "stopped",
    packageName: "ambient-minicpm-v-vision",
    installStatuses: [{ packageName: "ambient-minicpm-v-vision", source: "first-party", status: "installed" }],
    runtimeCandidates: [],
    validation: {
      schemaVersion: "ambient-minicpm-v-provider-validation-v1",
      provider: "minicpm-v",
      packageName: "ambient-minicpm-v-vision",
      status: "stopped",
      updatedAt: "2026-05-12T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "macos-arm64-metal",
      missingHints: [],
      diagnostics: [],
      runtimeState: {
        status: "stopped",
        running: false,
        recordedAt: "2026-05-12T00:01:00.000Z",
        previousPid: 4242,
        endpoint: "http://127.0.0.1:39217",
        stoppedAt: "2026-05-12T00:01:00.000Z",
      },
    },
    diagnostics: [],
    nextSteps: ["Run Validate to restart or verify the runtime."],
  };
}

function stoppedVoiceProvider(): VoiceProviderCandidate {
  return {
    packageId: "ambient-cli:piper",
    packageName: "piper",
    command: "piper_tts",
    capabilityId: "ambient-cli:piper:tool:piper_tts",
    providerId: "ambient-cli:piper:tool:piper_tts",
    label: "Piper TTS",
    format: "wav",
    formats: ["wav"],
    voices: [{ id: "default", label: "Default" }],
    local: true,
    installed: true,
    available: false,
    availabilityReason: "Voice provider validation pending: runtime stopped",
    diagnostics: {
      healthStatus: "passed",
      healthError: "runtime stopped",
      missingHints: ["Start Piper before enabling voice output."],
      runtimeState: {
        schemaVersion: "ambient-voice-provider-runtime-state-v1",
        status: "stopped",
        running: false,
        modelRuntimeId: "piper-runtime",
        modelId: "rhasspy/piper/en_US-lessac-medium",
        endpoint: "http://127.0.0.1:59201",
        estimatedResidentMemoryBytes: 2 * 1024 * 1024 * 1024,
        reason: "daemon stopped",
      },
    },
  };
}

function voiceSettings(): VoiceSettings {
  return {
    enabled: true,
    mode: "assistant-final",
    autoplay: true,
    providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
    maxChars: 1500,
    longReply: "summarize",
    format: "wav",
    artifactCacheMaxMb: 30,
  };
}

async function writeStoppedProviderDisplayProofArtifact(input: {
  miniCpmModel: MiniCpmVisionSetupResultModel;
  voiceModel: VoiceSettingsProviderModel;
}): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const existing = await readJsonIfExists(outputPath);
  const scenarios = isRecord(existing?.scenarios) ? existing.scenarios : {};
  const scenario = {
    status: "passed",
    proofKind: "deterministic-stopped-provider-display",
    minicpmDisplayedStopped: input.miniCpmModel.statusLabel === "MiniCPM-V stopped" &&
      input.miniCpmModel.statusTone === "info" &&
      input.miniCpmModel.detailLabels.includes("Runtime state: stopped"),
    voiceDisplayedStopped: input.voiceModel.statusLabel === "Voice runtime stopped" &&
      input.voiceModel.runtimeState.status === "stopped" &&
      input.voiceModel.runtimeState.tone === "info",
    minicpmStatusLabel: input.miniCpmModel.statusLabel,
    voiceStatusLabel: input.voiceModel.statusLabel,
    voiceRuntimeLabel: input.voiceModel.runtimeState.label,
    evidence: "MiniCPM-V setup and local voice provider settings both display stopped runtimes as healthy idle provider state.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-05-12T00:01:00.000Z").toISOString(),
    scenarios: {
      ...scenarios,
      "stopped-provider-display": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
