import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreMessageVoiceRepository } from "./messageVoiceRepository";

describe("ProjectStoreMessageVoiceRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreMessageVoiceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE message_voice_states (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        provider_capability_id TEXT,
        provider_id TEXT,
        voice_id TEXT,
        spoken_text TEXT,
        spoken_text_chars INTEGER NOT NULL,
        source_text_chars INTEGER NOT NULL,
        audio_path TEXT,
        last_audio_path TEXT,
        media_url TEXT,
        mime_type TEXT,
        duration_ms INTEGER,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    repository = new ProjectStoreMessageVoiceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists and updates message voice state by message id", () => {
    const queued = repository.setMessageVoiceState({
      messageId: "message-1",
      threadId: "thread-1",
      status: "queued",
      source: "assistant-text",
      sourceMessageId: "message-1",
      providerCapabilityId: "voice:fixture",
      providerId: "fixture",
      spokenText: "Ready to speak.",
      spokenTextChars: 15,
      sourceTextChars: 15,
    });

    const ready = repository.setMessageVoiceState({
      ...queued,
      status: "ready",
      audioPath: ".ambient/voice/thread/message.wav",
      mediaUrl: "ambient-media://workspace/token/message.wav",
      mimeType: "audio/wav",
      durationMs: 1200,
    });

    expect(ready).toMatchObject({
      messageId: "message-1",
      status: "ready",
      source: "assistant-text",
      providerCapabilityId: "voice:fixture",
      audioPath: ".ambient/voice/thread/message.wav",
      lastAudioPath: ".ambient/voice/thread/message.wav",
      mimeType: "audio/wav",
      durationMs: 1200,
    });
    expect(repository.getMessageVoiceState("message-1")).toMatchObject({ status: "ready" });
    expect(repository.listMessageVoiceStates("thread-1").map((state) => state.messageId)).toEqual(["message-1"]);
  });

  it("clears voice artifact metadata without deleting the voice row", () => {
    repository.setMessageVoiceState({
      messageId: "message-1",
      threadId: "thread-1",
      status: "ready",
      source: "summary",
      sourceMessageId: "message-1",
      providerCapabilityId: "voice:fixture",
      providerId: "fixture",
      voiceId: "default",
      spokenText: "Ready to clear.",
      spokenTextChars: 15,
      sourceTextChars: 120,
      audioPath: ".ambient/voice/thread/message.wav",
      mediaUrl: "ambient-media://workspace/token/message.wav",
      mimeType: "audio/wav",
      durationMs: 1200,
    });

    const cleared = repository.clearMessageVoiceArtifact("message-1");

    expect(cleared).toMatchObject({
      messageId: "message-1",
      status: "canceled",
      source: "summary",
      providerCapabilityId: "voice:fixture",
      spokenText: "Ready to clear.",
      spokenTextChars: 15,
      sourceTextChars: 120,
      lastAudioPath: ".ambient/voice/thread/message.wav",
      error: "Voice artifact cleared.",
    });
    expect(cleared.audioPath).toBeUndefined();
    expect(cleared.mediaUrl).toBeUndefined();
    expect(cleared.mimeType).toBeUndefined();
    expect(cleared.durationMs).toBeUndefined();
    expect(repository.listMessageVoiceStates("thread-1")).toHaveLength(1);
  });

  it("reports missing voice state on artifact clear", () => {
    expect(() => repository.clearMessageVoiceArtifact("missing")).toThrow("Voice state not found for message: missing");
  });
});
