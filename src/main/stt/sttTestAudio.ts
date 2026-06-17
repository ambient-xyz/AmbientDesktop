import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SttTestAudioInput, SttTestAudioResult } from "../../shared/types";
import { parseWavPcm16 } from "./sttAudio";
import { sttUtteranceArtifactPaths } from "./sttArtifacts";

const maxTestAudioBytes = 20 * 1024 * 1024;
const maxTestAudioDurationMs = 30_000;

export async function saveSttTestAudio(
  workspacePath: string,
  input: SttTestAudioInput,
  options: { now?: () => Date; utteranceId?: string } = {},
): Promise<SttTestAudioResult> {
  const base64 = input.audioBase64.trim();
  if (!base64) throw new Error("STT test audio was empty.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("STT test audio must be base64-encoded WAV data.");

  const audio = Buffer.from(base64, "base64");
  if (audio.length <= 44) throw new Error("STT test audio was too small to contain WAV samples.");
  if (audio.length > maxTestAudioBytes) throw new Error("STT test audio is too large. Record a shorter sample.");

  const parsed = parseWavPcm16(audio);
  const frameCount = Math.floor(parsed.samples.length / parsed.channels);
  const durationMs = Math.round((frameCount / parsed.sampleRate) * 1000);
  if (durationMs > maxTestAudioDurationMs) throw new Error("STT test audio is too long. Record a sample under 30 seconds.");

  const now = options.now ?? (() => new Date());
  const threadId = input.source === "composer-push-to-talk" ? input.threadId?.trim() : "validation";
  if (!threadId) throw new Error("Composer push-to-talk audio requires a thread id.");
  const utteranceId = options.utteranceId ?? `${input.source}-${now().getTime().toString(36)}`;
  const paths = sttUtteranceArtifactPaths(workspacePath, threadId, utteranceId);
  await mkdir(dirname(paths.rawAudioPath), { recursive: true });
  await writeFile(paths.rawAudioPath, audio);
  const microphoneDeviceId = input.microphoneDeviceId?.trim();
  const microphoneDeviceLabel = input.microphoneDeviceLabel?.trim().slice(0, 160);

  return {
    threadId,
    utteranceId,
    audioPath: paths.relative.rawAudioPath,
    bytes: audio.length,
    durationMs,
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    ...(microphoneDeviceId ? { microphoneDeviceId } : {}),
    ...(microphoneDeviceLabel ? { microphoneDeviceLabel } : {}),
    createdAt: now().toISOString(),
  };
}
