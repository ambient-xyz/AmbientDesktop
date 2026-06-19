import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../../shared/threadTypes";
import { chooseThreadPreview, formatThreadPreview, isAssistantThinkingMessage } from "../../shared/threadPreview";
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
      update.run(chooseThreadPreview(this.listMessages(thread.id)), thread.id);
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

  private refreshThreadPreview(threadId: string): void {
    this.touchThread(threadId, chooseThreadPreview(this.listMessages(threadId)));
  }
}

function messageCanUpdateThreadPreview(message: ChatMessage): boolean {
  return message.role !== "tool" && message.content.trim().length > 0 && !isAssistantThinkingMessage(message);
}
