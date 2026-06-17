import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { MessageVoiceState } from "../../shared/types";
import { clearManagedVoiceArtifacts, inspectVoiceArtifactRetention, pruneManagedVoiceArtifactsToBudget, pruneVoiceArtifactOrphans } from "./voiceArtifacts";

describe("voice artifact retention", () => {
  it("summarizes managed, referenced, and orphaned voice artifacts for a thread", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-voice-retention-"));
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/ready.wav", "ready");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/cleared.wav", "cleared");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/orphan.wav", "orphan");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-2/other.wav", "other");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/notes.txt", "ignored");

    const summary = await inspectVoiceArtifactRetention({
      workspacePath,
      threadId: "thread-1",
      providerCapabilityId: "voice:one",
      voiceStates: [
        voiceState({ audioPath: ".ambient/voice/thread-1/ready.wav", providerCapabilityId: "voice:one" }),
        voiceState({ lastAudioPath: ".ambient/voice/thread-1/cleared.wav", providerCapabilityId: "voice:two" }),
      ],
    });

    expect(summary).toMatchObject({
      threadId: "thread-1",
      providerCapabilityId: "voice:one",
      rootPath: ".ambient/voice/thread-1",
      managedFileCount: 3,
      referencedFileCount: 1,
      orphanedFileCount: 1,
    });
    expect(summary.referencedPreview).toEqual([".ambient/voice/thread-1/ready.wav"]);
    expect(summary.orphanedPreview).toEqual([".ambient/voice/thread-1/orphan.wav"]);
  });

  it("prunes only unreferenced managed audio files", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-voice-prune-"));
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/ready.wav", "ready");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/orphan.wav", "orphan");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/nested/orphan.mp3", "nested");

    const result = await pruneVoiceArtifactOrphans({
      workspacePath,
      threadId: "thread-1",
      voiceStates: [voiceState({ audioPath: ".ambient/voice/thread-1/ready.wav" })],
    });

    expect(result).toMatchObject({
      managedFileCount: 3,
      orphanedFileCount: 2,
      deletedFileCount: 2,
    });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/ready.wav"), "utf8")).resolves.toBe("ready");
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/orphan.wav"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/nested/orphan.mp3"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("clears managed voice audio across thread directories", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-voice-clear-"));
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/one.wav", "one");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-2/two.ogg", "two");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-2/notes.txt", "ignored");

    const result = await clearManagedVoiceArtifacts(workspacePath);

    expect(result).toMatchObject({
      rootPath: ".ambient/voice",
      managedFileCount: 2,
      deletedFileCount: 2,
      deletedBytes: 6,
      deletedPreview: [".ambient/voice/thread-1/one.wav", ".ambient/voice/thread-2/two.ogg"],
    });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/one.wav"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-2/two.ogg"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-2/notes.txt"), "utf8")).resolves.toBe("ignored");
  });

  it("prunes oldest managed voice audio until it fits the cache budget", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-voice-budget-"));
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/old.wav", "oldest");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/middle.wav", "middle");
    await writeVoiceFile(workspacePath, ".ambient/voice/thread-1/new.wav", "newest");
    await setMtime(workspacePath, ".ambient/voice/thread-1/old.wav", 1);
    await setMtime(workspacePath, ".ambient/voice/thread-1/middle.wav", 2);
    await setMtime(workspacePath, ".ambient/voice/thread-1/new.wav", 3);

    const result = await pruneManagedVoiceArtifactsToBudget({ workspacePath, maxBytes: 7 });

    expect(result).toMatchObject({
      rootPath: ".ambient/voice",
      managedFileCount: 3,
      managedBytes: 18,
      deletedFileCount: 2,
      deletedBytes: 12,
      deletedPreview: [".ambient/voice/thread-1/old.wav", ".ambient/voice/thread-1/middle.wav"],
    });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/old.wav"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/middle.wav"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(workspacePath, ".ambient/voice/thread-1/new.wav"), "utf8")).resolves.toBe("newest");
  });
});

async function writeVoiceFile(workspacePath: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(workspacePath, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function setMtime(workspacePath: string, relativePath: string, seconds: number): Promise<void> {
  const date = new Date(seconds * 1000);
  await utimes(join(workspacePath, relativePath), date, date);
}

function voiceState(input: Partial<MessageVoiceState>): MessageVoiceState {
  return {
    messageId: input.messageId ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    source: input.source ?? "assistant-text",
    sourceMessageId: input.sourceMessageId ?? input.messageId ?? "message-1",
    providerCapabilityId: input.providerCapabilityId ?? "voice:one",
    providerId: input.providerId ?? "provider:one",
    voiceId: input.voiceId,
    spokenText: input.spokenText ?? "hello",
    spokenTextChars: input.spokenTextChars ?? 5,
    sourceTextChars: input.sourceTextChars ?? 5,
    audioPath: input.audioPath,
    lastAudioPath: input.lastAudioPath,
    mediaUrl: input.mediaUrl,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    error: input.error,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}
