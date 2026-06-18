import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../../shared/threadTypes";
import { formatThreadPreview } from "../../shared/threadPreview";
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

  deleteMessagesAfter(threadId: string, messageId: string): ChatMessage[] {
    const messages = this.listMessages(threadId);
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new Error(`Message not found in thread: ${messageId}`);
    const removeIds = messages.slice(index + 1).map((message) => message.id);
    if (removeIds.length > 0) {
      const placeholders = removeIds.map(() => "?").join(", ");
      this.db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...removeIds);
    }
    const remaining = messages.slice(0, index + 1);
    const preview = [...remaining].reverse().find((message) => message.role !== "tool" && message.content.trim())?.content ?? "";
    this.touchThread(threadId, preview);
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
    this.touchThread(input.threadId, input.content);
    return this.getMessage(id);
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
    this.touchThread(message.threadId, content);
    return message;
  }

  repairThreadPreviews(): void {
    const threads = this.db.prepare("SELECT id FROM threads").all() as Array<{ id: string }>;
    const latestNonTool = this.db.prepare(
      "SELECT content FROM messages WHERE thread_id = ? AND role != 'tool' AND trim(content) != '' ORDER BY created_at DESC LIMIT 1",
    );
    const latestMessage = this.db.prepare(
      "SELECT content FROM messages WHERE thread_id = ? AND trim(content) != '' ORDER BY created_at DESC LIMIT 1",
    );
    const update = this.db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?");

    for (const thread of threads) {
      const nonTool = latestNonTool.get(thread.id) as { content: string } | undefined;
      const fallback = latestMessage.get(thread.id) as { content: string } | undefined;
      update.run(formatThreadPreview(nonTool?.content ?? fallback?.content ?? ""), thread.id);
    }
  }

  private getMessage(messageId: string): ChatMessage {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!row) throw new Error(`Message not found: ${messageId}`);
    return mapMessageRow(row);
  }

  private touchThread(threadId: string, preview: string): void {
    this.db
      .prepare("UPDATE threads SET updated_at = ?, last_message_preview = ? WHERE id = ?")
      .run(new Date().toISOString(), formatThreadPreview(preview), threadId);
  }
}
