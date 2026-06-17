import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writePcm16Wav } from "./sttAudio";
import { saveSttTestAudio } from "./sttTestAudio";

describe("STT test audio artifacts", () => {
  it("persists settings microphone WAV under managed STT validation artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-test-audio-"));
    try {
      const wav = writePcm16Wav({
        sampleRate: 16_000,
        channels: 1,
        samples: new Int16Array(1600).fill(2000),
      });
      const result = await saveSttTestAudio(
        workspace,
        {
          source: "settings-microphone",
          audioBase64: wav.toString("base64"),
          durationMs: 100,
          sampleRate: 16_000,
          channels: 1,
          microphoneDeviceId: " airpods-pro ",
          microphoneDeviceLabel: " AirPods Pro Microphone ",
        },
        {
          utteranceId: "mic-check",
          now: () => new Date("2026-05-10T00:00:00.000Z"),
        },
      );

      expect(result).toEqual({
        threadId: "validation",
        utteranceId: "mic-check",
        audioPath: ".ambient/stt/validation/mic-check.raw.wav",
        bytes: wav.length,
        durationMs: 100,
        sampleRate: 16_000,
        channels: 1,
        microphoneDeviceId: "airpods-pro",
        microphoneDeviceLabel: "AirPods Pro Microphone",
        createdAt: "2026-05-10T00:00:00.000Z",
      });
      await expect(readFile(join(workspace, result.audioPath))).resolves.toEqual(wav);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("persists composer push-to-talk audio under the active thread", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-composer-audio-"));
    try {
      const wav = writePcm16Wav({
        sampleRate: 24_000,
        channels: 1,
        samples: new Int16Array(2400).fill(1200),
      });
      const result = await saveSttTestAudio(
        workspace,
        {
          source: "composer-push-to-talk",
          threadId: "thread-1",
          audioBase64: wav.toString("base64"),
        },
        {
          utteranceId: "utt-1",
          now: () => new Date("2026-05-10T00:00:01.000Z"),
        },
      );

      expect(result).toMatchObject({
        threadId: "thread-1",
        utteranceId: "utt-1",
        audioPath: ".ambient/stt/thread-1/utt-1.raw.wav",
        durationMs: 100,
        sampleRate: 24_000,
        channels: 1,
      });
      await expect(readFile(join(workspace, result.audioPath))).resolves.toEqual(wav);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects non-WAV microphone payloads before writing an artifact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-test-audio-invalid-"));
    try {
      await mkdir(join(workspace, ".ambient"), { recursive: true });
      await expect(
        saveSttTestAudio(workspace, {
          source: "settings-microphone",
          audioBase64: Buffer.alloc(64, 1).toString("base64"),
        }),
      ).rejects.toThrow("RIFF/WAVE PCM audio");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
