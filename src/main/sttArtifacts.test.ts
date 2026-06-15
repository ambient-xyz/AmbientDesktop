import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SttTranscriptionState } from "../shared/types";
import {
  inspectSttArtifactRetention,
  managedSttThreadRoot,
  pruneSttArtifactOrphans,
  sttUtteranceArtifactPaths,
} from "./sttArtifacts";

describe("STT artifact helpers", () => {
  it("creates safe managed paths for utterance artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-artifacts-"));
    try {
      const paths = sttUtteranceArtifactPaths(workspace, "../thread danger", "../utt danger");

      expect(paths.threadRoot).toBe(join(workspace, ".ambient", "stt", "thread-danger"));
      expect(paths.normalizedAudioPath).toBe(join(workspace, ".ambient", "stt", "thread-danger", "utt-danger.wav"));
      expect(paths.transcriptPath).toBe(join(workspace, ".ambient", "stt", "thread-danger", "utt-danger.txt"));
      expect(paths.jsonPath).toBe(join(workspace, ".ambient", "stt", "thread-danger", "utt-danger.json"));
      expect(paths.relative).toMatchObject({
        threadRoot: ".ambient/stt/thread-danger",
        rawAudioPath: ".ambient/stt/thread-danger/utt-danger.raw.wav",
        normalizedAudioPath: ".ambient/stt/thread-danger/utt-danger.wav",
        transcriptPath: ".ambient/stt/thread-danger/utt-danger.txt",
        jsonPath: ".ambient/stt/thread-danger/utt-danger.json",
      });
      expect(managedSttThreadRoot(workspace, "")).toBe(join(workspace, ".ambient", "stt", "stt"));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("summarizes and prunes unreferenced managed STT artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-retention-"));
    try {
      await writeArtifact(workspace, ".ambient/stt/thread-1/utt-1.wav", "audio");
      await writeArtifact(workspace, ".ambient/stt/thread-1/utt-1.txt", "transcript");
      await writeArtifact(workspace, ".ambient/stt/thread-1/utt-1.json", "{}");
      await writeArtifact(workspace, ".ambient/stt/thread-1/orphan.wav", "orphan");
      await writeArtifact(workspace, ".ambient/stt/thread-1/ignored.log", "ignored");
      await writeArtifact(workspace, ".ambient/stt/thread-2/other.wav", "other");

      const summary = await inspectSttArtifactRetention({
        workspacePath: workspace,
        threadId: "thread-1",
        states: [
          transcriptionState({
            normalizedAudioPath: ".ambient/stt/thread-1/utt-1.wav",
            transcriptPath: ".ambient/stt/thread-1/utt-1.txt",
            jsonPath: ".ambient/stt/thread-1/utt-1.json",
          }),
        ],
      });

      expect(summary).toMatchObject({
        threadId: "thread-1",
        rootPath: ".ambient/stt/thread-1",
        managedFileCount: 4,
        referencedFileCount: 3,
        orphanedFileCount: 1,
      });
      expect(summary.orphanedPreview).toEqual([".ambient/stt/thread-1/orphan.wav"]);

      const pruned = await pruneSttArtifactOrphans({
        workspacePath: workspace,
        threadId: "thread-1",
        states: [transcriptionState({ normalizedAudioPath: ".ambient/stt/thread-1/utt-1.wav" })],
      });
      expect(pruned.deletedFileCount).toBe(3);
      await expect(readFile(join(workspace, ".ambient/stt/thread-1/utt-1.wav"), "utf8")).resolves.toBe("audio");
      await expect(readFile(join(workspace, ".ambient/stt/thread-1/utt-1.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(workspace, ".ambient/stt/thread-1/orphan.wav"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function writeArtifact(workspace: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(workspace, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function transcriptionState(input: Partial<SttTranscriptionState>): SttTranscriptionState {
  return {
    utteranceId: input.utteranceId ?? "utt-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    audioPath: input.audioPath ?? ".ambient/stt/thread-1/utt-1.raw.wav",
    normalizedAudioPath: input.normalizedAudioPath,
    providerCapabilityId: input.providerCapabilityId,
    providerId: input.providerId,
    language: input.language,
    text: input.text,
    durationMs: input.durationMs,
    noSpeechGate: input.noSpeechGate,
    transcriptPath: input.transcriptPath,
    jsonPath: input.jsonPath,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    error: input.error,
    createdAt: input.createdAt ?? "2026-05-09T12:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-09T12:00:00.000Z",
  };
}
