import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../../shared/threadTypes";
import { chooseThreadPreview, formatThreadPreview, isAssistantThinkingMessage, isHiddenTranscriptMessage } from "../../shared/threadPreview";
import { mapMessageRow, type MessageRow } from "./messageMappers";

export interface AddProjectStoreMessageInput {
  threadId: string;
  role: ChatMessage["role"];
  content: string;
  metadata?: Record<string, unknown>;
}

export class ProjectStoreMessageRepository {
  constructor(private readonly db: Database.Database) {}

  listMessages(threadId: string): ChatMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(threadId) as MessageRow[];
    return rows.map(mapMessageRow);
  }

  listRecentMessages(threadId: string, limit: number): ChatMessage[] {
    const boundedLimit = Math.max(0, Math.min(Math.floor(limit), 1000));
    if (boundedLimit === 0) return [];
    const rows = this.db
      .prepare(`
        SELECT id, thread_id, role, content, created_at, metadata_json
        FROM (
          SELECT rowid AS message_rowid, *
          FROM messages
          WHERE thread_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?
        )
        ORDER BY created_at ASC, message_rowid ASC
      `)
      .all(threadId, boundedLimit) as MessageRow[];
    return rows.map(mapMessageRow);
  }

  countMessages(threadId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM messages WHERE thread_id = ?").get(threadId) as { count: number };
    return row.count;
  }

  listMessagesBefore(
    threadId: string,
    beforeMessageId: string | undefined,
    limit: number,
  ): { messages: ChatMessage[]; hasMoreBefore: boolean } {
    const boundedLimit = Math.max(0, Math.min(Math.floor(limit), 1000));
    if (boundedLimit === 0) return { messages: [], hasMoreBefore: false };
    const cursor = beforeMessageId
      ? this.db
        .prepare("SELECT rowid AS message_rowid, created_at FROM messages WHERE thread_id = ? AND id = ?")
        .get(threadId, beforeMessageId) as { message_rowid: number; created_at: string } | undefined
      : undefined;
    if (beforeMessageId && !cursor) throw new Error(`Message not found in thread: ${beforeMessageId}`);
    const rows = cursor
      ? this.db
        .prepare(`
          SELECT id, thread_id, role, content, created_at, metadata_json
          FROM messages
          WHERE thread_id = ?
            AND (created_at < ? OR (created_at = ? AND rowid < ?))
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?
        `)
        .all(threadId, cursor.created_at, cursor.created_at, cursor.message_rowid, boundedLimit + 1) as MessageRow[]
      : this.db
        .prepare(`
          SELECT id, thread_id, role, content, created_at, metadata_json
          FROM messages
          WHERE thread_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?
        `)
        .all(threadId, boundedLimit + 1) as MessageRow[];
    const hasMoreBefore = rows.length > boundedLimit;
    return {
      messages: rows.slice(0, boundedLimit).reverse().map(mapMessageRow),
      hasMoreBefore,
    };
  }

  deleteMessagesAfter(threadId: string, messageId: string): ChatMessage[] {
    const cursor = this.db
      .prepare("SELECT rowid AS message_rowid, created_at FROM messages WHERE thread_id = ? AND id = ?")
      .get(threadId, messageId) as { message_rowid: number; created_at: string } | undefined;
    if (!cursor) throw new Error(`Message not found in thread: ${messageId}`);
    this.db
      .prepare(`
        DELETE FROM messages
        WHERE thread_id = ?
          AND (created_at > ? OR (created_at = ? AND rowid > ?))
      `)
      .run(threadId, cursor.created_at, cursor.created_at, cursor.message_rowid);
    const remaining = this.listMessages(threadId);
    this.touchThread(threadId, chooseThreadPreview(remaining));
    return remaining;
  }

  addMessage(input: AddProjectStoreMessageInput): ChatMessage {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.threadId,
        input.role,
        input.content,
        now,
        input.metadata ? JSON.stringify(input.metadata) : null,
      );
    const message = this.getMessage(id);
    if (messageCanUpdateThreadPreview(message)) {
      this.touchThread(input.threadId, message.content);
    } else {
      this.refreshThreadPreview(input.threadId);
    }
    return message;
  }

  appendToMessage(messageId: string, delta: string): ChatMessage {
    this.db.prepare("UPDATE messages SET content = content || ? WHERE id = ?").run(delta, messageId);
    return this.getMessage(messageId);
  }

  replaceMessage(messageId: string, content: string, metadata?: Record<string, unknown>): ChatMessage {
    this.db
      .prepare("UPDATE messages SET content = ?, metadata_json = ? WHERE id = ?")
      .run(content, metadata ? JSON.stringify(metadata) : null, messageId);
    const message = this.getMessage(messageId);
    this.refreshThreadPreview(message.threadId);
    return message;
  }

  repairThreadPreviews(): void {
    const threads = this.db.prepare("SELECT id FROM threads").all() as Array<{ id: string }>;
    const update = this.db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?");

    for (const thread of threads) {
      update.run(this.previewForThread(thread.id), thread.id);
    }
  }

  getMessage(messageId: string): ChatMessage {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!row) throw new Error(`Message not found: ${messageId}`);
    return mapMessageRow(row);
  }

  private touchThread(threadId: string, preview: string): void {
    this.db
      .prepare("UPDATE threads SET updated_at = ?, last_message_preview = ? WHERE id = ?")
      .run(new Date().toISOString(), formatThreadPreview(preview), threadId);
  }

  private refreshThreadPreview(threadId: string): void {
    this.touchThread(threadId, this.previewForThread(threadId));
  }

  private previewForThread(threadId: string): string {
    const preferred = this.latestPreviewCandidate(threadId, { includeTool: false });
    if (preferred) return formatThreadPreview(preferred.content);
    const fallback = this.latestPreviewCandidate(threadId, { includeTool: true });
    return formatThreadPreview(fallback?.content ?? "");
  }

  private latestPreviewCandidate(threadId: string, input: { includeTool: boolean }): ChatMessage | undefined {
    const roleFilter = input.includeTool ? "" : "AND role != 'tool'";
    const row = this.db
      .prepare(`
        SELECT *
        FROM messages
        WHERE thread_id = ?
          AND length(trim(content)) > 0
          AND (metadata_json IS NULL OR json_extract(metadata_json, '$.hiddenFromTranscript') IS NOT 1)
          AND (role != 'assistant' OR json_extract(metadata_json, '$.kind') IS NOT 'thinking')
          ${roleFilter}
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `)
      .get(threadId) as MessageRow | undefined;
    return row ? mapMessageRow(row) : undefined;
  }
}

function messageCanUpdateThreadPreview(message: ChatMessage): boolean {
  return message.role !== "tool" && message.content.trim().length > 0 && !isAssistantThinkingMessage(message) && !isHiddenTranscriptMessage(message);
}
