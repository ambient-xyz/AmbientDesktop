import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageVoiceState } from "../../shared/types";
import type { AmbientCliRunResult, RunAmbientCliInput } from "../ambient-cli/ambientCliPackages";
import {
  synthesizeWithAmbientCliVoiceProvider,
  voiceSynthesisFailedState,
  voiceSynthesisStartedState,
  type AmbientCliVoiceProviderConfig,
} from "./voiceProvider";

const provider: AmbientCliVoiceProviderConfig = {
  id: "pure-c-voxtral",
  capabilityId: "tts:pure-c-voxtral",
  kind: "ambient-cli",
  packageName: "pure-c-voxtral-tts",
  command: "voxtral_tts",
  format: "wav",
};

function queuedState(input: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    messageId: input.messageId ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "queued",
    source: input.source ?? "assistant-text",
    sourceMessageId: input.sourceMessageId ?? "message-1",
    providerCapabilityId: input.providerCapabilityId ?? "tts:pure-c-voxtral",
    voiceId: input.voiceId ?? "default",
    spokenText: input.spokenText ?? "Pure C Voxtral avoids Python and PyTorch for low-friction local TTS.",
    spokenTextChars: input.spokenTextChars ?? 68,
    sourceTextChars: input.sourceTextChars ?? 68,
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-07T00:00:00.000Z",
    audioPath: input.audioPath,
    mediaUrl: input.mediaUrl,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    error: input.error,
  };
}

describe("voice provider", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((path) => rm(path, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  async function tempWorkspace(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "ambient-voice-provider-"));
    tempRoots.push(path);
    return path;
  }

  it("synthesizes queued voice text through an Ambient CLI provider into managed media", async () => {
    const workspacePath = await tempWorkspace();
    const calls: Array<{ workspacePath: string; input: RunAmbientCliInput }> = [];
    const runner = async (runnerWorkspacePath: string, input: RunAmbientCliInput): Promise<AmbientCliRunResult> => {
      calls.push({ workspacePath: runnerWorkspacePath, input });
      const outputIndex = input.args?.indexOf("--output") ?? -1;
      const outputPath = input.args?.[outputIndex + 1];
      expect(outputPath).toBeTruthy();
      await writeFile(outputPath!, Buffer.from("RIFF....WAVEfmt "));
      return {
        packageId: "pkg-voice",
        packageName: "pure-c-voxtral-tts",
        commandName: "voxtral_tts",
        command: ["voxtral_tts", ...(input.args ?? [])],
        cwd: workspacePath,
        durationMs: 31,
        stdout: JSON.stringify({ audioPath: outputPath, mimeType: "audio/wav", durationMs: 1200 }),
      };
    };

    const result = await synthesizeWithAmbientCliVoiceProvider({
      workspacePath,
      state: queuedState(),
      provider,
      runner,
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://test/${relativePath}?mime=${mimeType}&size=${size}`,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toMatchObject({
      packageName: "pure-c-voxtral-tts",
      command: "voxtral_tts",
    });
    expect(calls[0].input.args).toEqual([
      "--text",
      "Pure C Voxtral avoids Python and PyTorch for low-friction local TTS.",
      "--output",
      join(workspacePath, ".ambient", "voice", "thread-1", "message-1.wav"),
      "--format",
      "wav",
      "--voice",
      "default",
    ]);
    expect(result).toMatchObject({
      messageId: "message-1",
      threadId: "thread-1",
      status: "ready",
      providerCapabilityId: "tts:pure-c-voxtral",
      providerId: "pure-c-voxtral",
      audioPath: ".ambient/voice/thread-1/message-1.wav",
      mediaUrl: "ambient-media://test/.ambient/voice/thread-1/message-1.wav?mime=audio/wav&size=16",
      mimeType: "audio/wav",
      durationMs: 1200,
    });
  });

  it("accepts a relative provider audio path inside the workspace", async () => {
    const workspacePath = await tempWorkspace();
    const relativeAudioPath = ".ambient/voice/thread-1/message-1.wav";
    const runner = async (): Promise<AmbientCliRunResult> => {
      await mkdir(join(workspacePath, ".ambient", "voice", "thread-1"), { recursive: true });
      await writeFile(join(workspacePath, relativeAudioPath), Buffer.from("RIFF....WAVEfmt "));
      return {
        packageId: "pkg-voice",
        packageName: "pure-c-voxtral-tts",
        commandName: "voxtral_tts",
        command: ["voxtral_tts"],
        cwd: workspacePath,
        durationMs: 15,
        stdout: JSON.stringify({ audioPath: relativeAudioPath }),
      };
    };

    await expect(
      synthesizeWithAmbientCliVoiceProvider({
        workspacePath,
        state: queuedState(),
        provider,
        runner,
      }),
    ).resolves.toMatchObject({
      status: "ready",
      audioPath: relativeAudioPath,
      mimeType: "audio/wav",
    });
  });

  it("keeps generated voice artifact paths workspace-scoped and sanitized", async () => {
    const workspacePath = await tempWorkspace();
    let requestedOutputPath = "";
    const runner = async (_runnerWorkspacePath: string, input: RunAmbientCliInput): Promise<AmbientCliRunResult> => {
      const outputIndex = input.args?.indexOf("--output") ?? -1;
      requestedOutputPath = input.args?.[outputIndex + 1] ?? "";
      await mkdir(join(workspacePath, ".ambient", "voice", "thread-danger-zone"), { recursive: true });
      await writeFile(requestedOutputPath, Buffer.from("RIFF....WAVEfmt "));
      return {
        packageId: "pkg-voice",
        packageName: "pure-c-voxtral-tts",
        commandName: "voxtral_tts",
        command: ["voxtral_tts"],
        cwd: workspacePath,
        durationMs: 15,
        stdout: JSON.stringify({ audioPath: requestedOutputPath }),
      };
    };

    const result = await synthesizeWithAmbientCliVoiceProvider({
      workspacePath,
      state: queuedState({
        threadId: "../thread danger/zone",
        messageId: "../../message danger.wav",
      }),
      provider,
      runner,
    });

    expect(requestedOutputPath).toBe(join(workspacePath, ".ambient", "voice", "thread-danger-zone", "message-danger.wav.wav"));
    expect(result).toMatchObject({
      audioPath: ".ambient/voice/thread-danger-zone/message-danger.wav.wav",
      mimeType: "audio/wav",
    });
    expect(result.audioPath?.includes("..")).toBe(false);
  });

  it("rejects provider audio paths outside the workspace", async () => {
    const workspacePath = await tempWorkspace();
    const runner = async (): Promise<AmbientCliRunResult> => ({
      packageId: "pkg-voice",
      packageName: "pure-c-voxtral-tts",
      commandName: "voxtral_tts",
      command: ["voxtral_tts"],
      cwd: workspacePath,
      durationMs: 15,
      stdout: JSON.stringify({ audioPath: "/tmp/outside.wav" }),
    });

    await expect(
      synthesizeWithAmbientCliVoiceProvider({
        workspacePath,
        state: queuedState(),
        provider,
        runner,
      }),
    ).rejects.toThrow("outside the workspace");
  });

  it("rejects unsupported provider audio extensions inside the workspace", async () => {
    const workspacePath = await tempWorkspace();
    const unsupportedPath = join(workspacePath, ".ambient", "voice", "thread-1", "message-1.flac");
    const runner = async (): Promise<AmbientCliRunResult> => {
      await mkdir(join(workspacePath, ".ambient", "voice", "thread-1"), { recursive: true });
      await writeFile(unsupportedPath, Buffer.from("fLaC"));
      return {
        packageId: "pkg-voice",
        packageName: "pure-c-voxtral-tts",
        commandName: "voxtral_tts",
        command: ["voxtral_tts"],
        cwd: workspacePath,
        durationMs: 15,
        stdout: JSON.stringify({ audioPath: unsupportedPath }),
      };
    };

    await expect(
      synthesizeWithAmbientCliVoiceProvider({
        workspacePath,
        state: queuedState(),
        provider,
        runner,
      }),
    ).rejects.toThrow("unsupported audio file extension");
  });

  it("requires spoken text before provider execution", async () => {
    const workspacePath = await tempWorkspace();

    await expect(
      synthesizeWithAmbientCliVoiceProvider({
        workspacePath,
        state: queuedState({ source: "summary", spokenText: "", spokenTextChars: 0 }),
        provider,
        runner: async () => {
          throw new Error("should not run");
        },
      }),
    ).rejects.toThrow("does not have spoken text");
  });

  it("maps started and failed state transitions without changing message identity", () => {
    const state = queuedState({ audioPath: ".ambient/voice/old.wav", mediaUrl: "ambient-media://old", error: "old" });

    expect(voiceSynthesisStartedState(state)).toMatchObject({
      messageId: "message-1",
      status: "synthesizing",
      audioPath: undefined,
      mediaUrl: undefined,
      error: undefined,
    });
    expect(voiceSynthesisFailedState(state, new Error("provider crashed"))).toMatchObject({
      messageId: "message-1",
      status: "failed",
      error: "provider crashed",
    });
  });
});
