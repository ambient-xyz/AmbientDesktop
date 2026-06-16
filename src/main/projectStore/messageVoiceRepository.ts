import type Database from "better-sqlite3";
import type { MessageVoiceState } from "../../shared/types";
import { mapMessageVoiceStateRow, type MessageVoiceStateRow } from "./messageVoiceMappers";

export class ProjectStoreMessageVoiceRepository {
  constructor(private readonly db: Database.Database) {}

  listMessageVoiceStates(threadId: string): MessageVoiceState[] {
    const rows = this.db
      .prepare("SELECT * FROM message_voice_states WHERE thread_id = ? ORDER BY updated_at ASC")
      .all(threadId) as MessageVoiceStateRow[];
    return rows.map(mapMessageVoiceStateRow);
  }

  getMessageVoiceState(messageId: string): MessageVoiceState | undefined {
    const row = this.db.prepare("SELECT * FROM message_voice_states WHERE message_id = ?").get(messageId) as
      | MessageVoiceStateRow
      | undefined;
    return row ? mapMessageVoiceStateRow(row) : undefined;
  }

  clearMessageVoiceArtifact(messageId: string, error = "Voice artifact cleared."): MessageVoiceState {
    const current = this.getMessageVoiceState(messageId);
    if (!current) throw new Error(`Voice state not found for message: ${messageId}`);
    return this.setMessageVoiceState({
      messageId: current.messageId,
      threadId: current.threadId,
      status: "canceled",
      source: current.source,
      sourceMessageId: current.sourceMessageId,
      providerCapabilityId: current.providerCapabilityId,
      providerId: current.providerId,
      voiceId: current.voiceId,
      spokenText: current.spokenText,
      spokenTextChars: current.spokenTextChars,
      sourceTextChars: current.sourceTextChars,
      lastAudioPath: current.audioPath ?? current.lastAudioPath,
      error,
    });
  }

  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO message_voice_states
          (message_id, thread_id, status, source, source_message_id, provider_capability_id, provider_id, voice_id, spoken_text,
           spoken_text_chars, source_text_chars, audio_path, last_audio_path, media_url, mime_type, duration_ms, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           thread_id = excluded.thread_id,
           status = excluded.status,
           source = excluded.source,
           source_message_id = excluded.source_message_id,
           provider_capability_id = excluded.provider_capability_id,
           provider_id = excluded.provider_id,
           voice_id = excluded.voice_id,
           spoken_text = excluded.spoken_text,
           spoken_text_chars = excluded.spoken_text_chars,
           source_text_chars = excluded.source_text_chars,
           audio_path = excluded.audio_path,
           last_audio_path = excluded.last_audio_path,
           media_url = excluded.media_url,
           mime_type = excluded.mime_type,
           duration_ms = excluded.duration_ms,
           error = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.messageId,
        input.threadId,
        input.status,
        input.source,
        input.sourceMessageId,
        input.providerCapabilityId ?? null,
        input.providerId ?? null,
        input.voiceId ?? null,
        input.spokenText ?? null,
        input.spokenTextChars,
        input.sourceTextChars,
        input.audioPath ?? null,
        input.lastAudioPath ?? input.audioPath ?? null,
        input.mediaUrl ?? null,
        input.mimeType ?? null,
        input.durationMs ?? null,
        input.error ?? null,
        now,
        now,
      );
    return this.getMessageVoiceState(input.messageId)!;
  }
}
