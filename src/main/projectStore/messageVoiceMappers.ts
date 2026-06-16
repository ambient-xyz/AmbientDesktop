import type { MessageVoiceState } from "../../shared/types";

export interface MessageVoiceStateRow {
  message_id: string;
  thread_id: string;
  status: MessageVoiceState["status"];
  source: MessageVoiceState["source"];
  source_message_id: string;
  provider_capability_id: string | null;
  provider_id: string | null;
  voice_id: string | null;
  spoken_text: string | null;
  spoken_text_chars: number;
  source_text_chars: number;
  audio_path: string | null;
  last_audio_path: string | null;
  media_url: string | null;
  mime_type: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function mapMessageVoiceStateRow(row: MessageVoiceStateRow): MessageVoiceState {
  return {
    messageId: row.message_id,
    threadId: row.thread_id,
    status: row.status,
    source: row.source,
    sourceMessageId: row.source_message_id,
    providerCapabilityId: row.provider_capability_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    voiceId: row.voice_id ?? undefined,
    spokenText: row.spoken_text ?? undefined,
    spokenTextChars: row.spoken_text_chars,
    sourceTextChars: row.source_text_chars,
    audioPath: row.audio_path ?? undefined,
    lastAudioPath: row.last_audio_path ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
