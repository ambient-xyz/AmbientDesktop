import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeWavPcm16Rms,
  normalizeWavPcm16ToMono16k,
  parseWavPcm16,
  writePcm16Wav,
} from "./sttAudio";

describe("STT audio normalization", () => {
  it("normalizes stereo PCM16 WAV to 16 kHz mono WAV", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-audio-"));
    try {
      const inputPath = join(workspace, "stereo-48k.wav");
      const outputPath = join(workspace, ".ambient", "stt", "thread-1", "utt-1.wav");
      await writeFile(inputPath, stereoSineWav({ sampleRate: 48_000, durationMs: 1000, leftAmplitude: 0.5, rightAmplitude: 0.25 }));

      const result = await normalizeWavPcm16ToMono16k({ inputPath, outputPath });
      const normalized = parseWavPcm16(await readFile(outputPath));

      expect(result).toMatchObject({
        inputSampleRate: 48000,
        inputChannels: 2,
        outputSampleRate: 16000,
        outputChannels: 1,
        inputDurationMs: 1000,
        outputDurationMs: 1000,
        outputSampleCount: 16000,
      });
      expect(normalized.sampleRate).toBe(16000);
      expect(normalized.channels).toBe(1);
      expect(normalized.samples).toHaveLength(16000);
      const rms = await analyzeWavPcm16Rms(outputPath);
      expect(rms.durationMs).toBe(1000);
      expect(rms.rmsDbfs).toBeGreaterThan(-15);
      expect(rms.rmsDbfs).toBeLessThan(-10);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects unsupported audio containers before provider invocation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-audio-invalid-"));
    try {
      const inputPath = join(workspace, "utterance.webm");
      const outputPath = join(workspace, "utterance.wav");
      await writeFile(inputPath, Buffer.from("not a wav"));

      await expect(normalizeWavPcm16ToMono16k({ inputPath, outputPath })).rejects.toThrow("RIFF/WAVE PCM audio");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function stereoSineWav(input: { sampleRate: number; durationMs: number; leftAmplitude: number; rightAmplitude: number }): Buffer {
  const channels = 2;
  const sampleCount = Math.max(1, Math.round((input.durationMs / 1000) * input.sampleRate));
  const samples = new Int16Array(sampleCount * channels);
  for (let frame = 0; frame < sampleCount; frame += 1) {
    const t = frame / input.sampleRate;
    const wave = Math.sin(2 * Math.PI * 440 * t);
    samples[frame * 2] = Math.round(wave * input.leftAmplitude * 32767);
    samples[frame * 2 + 1] = Math.round(wave * input.rightAmplitude * 32767);
  }
  return writePcm16Wav({
    sampleRate: input.sampleRate,
    channels,
    samples,
  });
}
