import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SttSettings } from "../../shared/localRuntimeTypes";
import type { AmbientCliRunResult, RunAmbientCliInput } from "./sttAmbientCliFacade";
import {
  ambientCliSttProviderFromSettings,
  analyzeWavPcm16Rms,
  deterministicTextFixtureSttRunner,
  transcribeWithAmbientCliSttProvider,
  type AmbientCliSttRunner,
} from "./sttProvider";

describe("STT provider runtime", () => {
  it("parses Ambient CLI STT providers from selected settings", () => {
    const settings = baseSettings();

    expect(ambientCliSttProviderFromSettings(settings)).toMatchObject({
      id: settings.providerCapabilityId,
      capabilityId: settings.providerCapabilityId,
      kind: "ambient-cli",
      packageId: "ambient-cli:fixture:ambient-qwen3-asr",
      command: "qwen3_asr_transcribe",
    });
  });

  it("transcribes a WAV utterance through an Ambient CLI STT provider and writes managed artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-provider-"));
    try {
      const audioPath = join(workspace, "utterance.wav");
      await writeFile(audioPath, pcm16Wav({ durationMs: 500, amplitude: 0.16 }));
      let observedRun: RunAmbientCliInput | undefined;
      const runner: AmbientCliSttRunner = async (_workspacePath, input) => {
        observedRun = input;
        const outputJsonPath = requiredArg(input.args, "--output-json");
        await mkdir(dirname(outputJsonPath), { recursive: true });
        await writeFile(
          outputJsonPath,
          `${JSON.stringify({
            text: "open the project settings",
            language: "English",
            durationMs: 500,
            providerId: "qwen3-asr-test",
          })}\n`,
          "utf8",
        );
        return runResult(input, { stdout: JSON.stringify({ text: "open the project settings" }) });
      };

      const state = await transcribeWithAmbientCliSttProvider({
        workspacePath: workspace,
        threadId: "thread-1",
        utteranceId: "utt-1",
        audioPath,
        settings: baseSettings(),
        runner,
        now: fixedNow,
      });

      expect(observedRun).toMatchObject({
        packageId: "ambient-cli:fixture:ambient-qwen3-asr",
        command: "qwen3_asr_transcribe",
      });
      expect(observedRun?.args).toEqual(expect.arrayContaining(["--audio", join(workspace, ".ambient", "stt", "thread-1", "utt-1.wav"), "--language", "English", "--output-json"]));
      expect(state).toMatchObject({
        utteranceId: "utt-1",
        threadId: "thread-1",
        status: "ready",
        audioPath: "utterance.wav",
        normalizedAudioPath: ".ambient/stt/thread-1/utt-1.wav",
        providerCapabilityId: baseSettings().providerCapabilityId,
        providerId: "qwen3-asr-test",
        language: "English",
        text: "open the project settings",
        durationMs: 500,
        transcriptPath: ".ambient/stt/thread-1/utt-1.txt",
        jsonPath: ".ambient/stt/thread-1/utt-1.json",
        createdAt: "2026-05-09T12:00:00.000Z",
        updatedAt: "2026-05-09T12:00:00.000Z",
      });
      expect(state.noSpeechGate).toMatchObject({
        enabled: true,
        skipped: false,
        thresholdDbfs: -55,
        sampleCount: 8000,
        durationMs: 500,
      });
      await expect(readFile(join(workspace, state.transcriptPath!), "utf8")).resolves.toBe("open the project settings\n");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("skips provider invocation when the RMS no-speech gate fires", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-silence-"));
    try {
      const audioPath = join(workspace, "silence.wav");
      await writeFile(audioPath, pcm16Wav({ durationMs: 400, amplitude: 0 }));
      let called = false;
      const state = await transcribeWithAmbientCliSttProvider({
        workspacePath: workspace,
        threadId: "thread-1",
        utteranceId: "silent",
        audioPath,
        settings: baseSettings(),
        runner: async () => {
          called = true;
          throw new Error("provider should not be called");
        },
        now: fixedNow,
      });

      expect(called).toBe(false);
      expect(state).toMatchObject({
        status: "no-speech",
        audioPath: "silence.wav",
        normalizedAudioPath: ".ambient/stt/thread-1/silent.wav",
        noSpeechGate: {
          enabled: true,
          skipped: true,
          rmsDbfs: -120,
          peakDbfs: -120,
          thresholdDbfs: -55,
          sampleCount: 6400,
          durationMs: 400,
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects invalid provider JSON and empty transcripts clearly", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-invalid-"));
    try {
      const audioPath = join(workspace, "utterance.wav");
      await writeFile(audioPath, pcm16Wav({ durationMs: 500, amplitude: 0.16 }));

      await expect(
        transcribeWithAmbientCliSttProvider({
          workspacePath: workspace,
          threadId: "thread-1",
          utteranceId: "invalid",
          audioPath,
          settings: baseSettings(),
          runner: async (_workspacePath, input) => runResult(input, { stdout: "not json" }),
        }),
      ).rejects.toThrow("STT provider returned invalid JSON");

      await expect(
        transcribeWithAmbientCliSttProvider({
          workspacePath: workspace,
          threadId: "thread-1",
          utteranceId: "empty",
          audioPath,
          settings: baseSettings(),
          runner: deterministicTextFixtureSttRunner("   "),
        }),
      ).rejects.toThrow("STT provider returned an empty transcript");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps audio input paths inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-path-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-stt-outside-"));
    try {
      const outsideAudio = join(outside, "utterance.wav");
      await writeFile(outsideAudio, pcm16Wav({ durationMs: 500, amplitude: 0.16 }));

      await expect(
        transcribeWithAmbientCliSttProvider({
          workspacePath: workspace,
          threadId: "thread-1",
          utteranceId: "outside",
          audioPath: outsideAudio,
          settings: baseSettings(),
          runner: deterministicTextFixtureSttRunner(),
        }),
      ).rejects.toThrow("STT audio path must stay inside the workspace.");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("computes deterministic RMS metrics for 16-bit PCM WAV input", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-rms-"));
    try {
      const audioPath = join(workspace, "tone.wav");
      await writeFile(audioPath, pcm16Wav({ durationMs: 1000, amplitude: 0.5 }));

      const analysis = await analyzeWavPcm16Rms(audioPath);

      expect(analysis).toMatchObject({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        sampleCount: 16000,
        durationMs: 1000,
      });
      expect(analysis.rmsDbfs).toBeCloseTo(-9.031, 3);
      expect(analysis.peakDbfs).toBeCloseTo(-6.021, 3);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function baseSettings(): SttSettings {
  return {
    enabled: true,
    providerCapabilityId: "ambient-cli:fixture:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    spokenLanguage: "English",
    mode: "push-to-talk",
    autoSendAfterTranscription: true,
    silenceFinalizeSeconds: 0.8,
    noSpeechGate: {
      enabled: true,
      rmsThresholdDbfs: -55,
    },
    bargeIn: {
      stopTtsOnSpeech: true,
      queueWhileAgentRuns: true,
    },
  };
}

function fixedNow(): Date {
  return new Date("2026-05-09T12:00:00.000Z");
}

function runResult(input: RunAmbientCliInput, output: Pick<AmbientCliRunResult, "stdout" | "stderr"> = {}): AmbientCliRunResult {
  return {
    packageId: input.packageId ?? "ambient-stt-fixture",
    packageName: input.packageName ?? "ambient-stt-fixture",
    commandName: input.command,
    command: [input.command, ...(input.args ?? [])],
    cwd: "",
    durationMs: 1,
    ...output,
  };
}

function requiredArg(args: string[] | undefined, name: string): string {
  const index = args?.indexOf(name) ?? -1;
  const value = index >= 0 ? args?.[index + 1] : undefined;
  if (!value) throw new Error(`Missing required test argument: ${name}`);
  return value;
}

function pcm16Wav(input: { durationMs: number; amplitude: number }): Buffer {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.max(1, Math.round((input.durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const sample = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * 440 * t) * input.amplitude));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return buffer;
}
