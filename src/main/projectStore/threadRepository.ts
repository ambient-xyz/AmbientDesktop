import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/types";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { CreateThreadOptions } from "../projectStoreFacadeHelpers";
import {
  mapThreadRow,
  mapThreadWorktreeRow,
  type ThreadRow,
  type ThreadWorktreeRow,
} from "./threadMappers";

export interface CreateProjectStoreThreadDefaults {
  permissionMode: ThreadSummary["permissionMode"];
  collaborationMode: ThreadSummary["collaborationMode"];
  model: ThreadSummary["model"];
  thinkingLevel: ThreadSummary["thinkingLevel"];
  memoryDefaultThreadEnabled: boolean;
}

export type UpdateProjectStoreThreadSettingsInput = Partial<
  Pick<ThreadSummary, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">
> & {
  piSessionFile?: string | null;
};

export class ProjectStoreThreadRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly workspacePath: string,
  ) {}

  getLastActiveThreadId(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const row = this.db
      .prepare("SELECT id FROM threads WHERE id = ? AND (archived_at IS NULL OR archived_at = '')")
      .get(value) as { id: string } | undefined;
    return row?.id;
  }

  hasThread(threadId: string): boolean {
    const row = this.db.prepare("SELECT id FROM threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    return Boolean(row);
  }

  listThreads(): ThreadSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM threads WHERE archived_at IS NULL OR archived_at = '' ORDER BY pinned DESC, updated_at DESC")
      .all() as ThreadRow[];
    return rows.map((row) => this.mapThread(row));
  }

  listThreadsForStateInspection(): ThreadSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM threads ORDER BY pinned DESC, updated_at DESC")
      .all() as ThreadRow[];
    return rows.map((row) => this.mapThread(row));
  }

  findReusableEmptyThread(): ThreadSummary | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM threads
         WHERE title = 'New chat'
           AND (archived_at IS NULL OR archived_at = '')
           AND (
             workspace_path = ?
             OR EXISTS (
               SELECT 1 FROM thread_worktrees
               WHERE thread_worktrees.thread_id = threads.id
                 AND thread_worktrees.project_root = ?
             )
           )
           AND last_message_preview = ''
           AND (pi_session_file IS NULL OR pi_session_file = '')
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM context_usage_snapshots WHERE context_usage_snapshots.thread_id = threads.id)
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(this.workspacePath, this.workspacePath) as ThreadRow | undefined;
    return row ? this.mapThread(row) : undefined;
  }

  getThread(threadId: string): ThreadSummary {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    if (!row) throw new Error(`Thread not found: ${threadId}`);
    return this.mapThread(row);
  }

  tryGetThread(threadId: string): ThreadSummary | undefined {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    return row ? this.mapThread(row) : undefined;
  }

  createThread(
    title: string,
    workspacePath: string,
    options: CreateThreadOptions,
    defaults: CreateProjectStoreThreadDefaults,
  ): ThreadSummary {
    const now = new Date().toISOString();
    const permissionMode = options.permissionMode ?? defaults.permissionMode;
    const collaborationMode = options.collaborationMode ?? defaults.collaborationMode;
    const model = options.model ?? defaults.model;
    const thinkingLevel = options.thinkingLevel ?? defaults.thinkingLevel;
    const kind = options.kind ?? "chat";
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO threads
        (id, title, workspace_path, kind, parent_thread_id, parent_message_id, parent_run_id, subagent_run_id,
         canonical_task_path, child_order, collapsed_by_default, child_status,
         created_at, updated_at, last_read_at, last_message_preview, permission_mode, collaboration_mode, model, thinking_level, memory_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        title,
        workspacePath,
        kind,
        options.parentThreadId ?? null,
        options.parentMessageId ?? null,
        options.parentRunId ?? null,
        options.subagentRunId ?? null,
        options.canonicalTaskPath ?? null,
        options.childOrder ?? null,
        options.collapsedByDefault ? 1 : 0,
        options.childStatus ?? null,
        now,
        now,
        now,
        "",
        permissionMode,
        collaborationMode,
        model,
        thinkingLevel,
        defaults.memoryDefaultThreadEnabled ? 1 : 0,
      );
    return this.getThread(id);
  }

  updateThreadSettings(threadId: string, input: UpdateProjectStoreThreadSettingsInput): ThreadSummary {
    const current = this.getThread(threadId);
    const now = new Date().toISOString();
    const nextModel = normalizeAmbientModelId(input.model ?? current.model);
    const modelChanged = nextModel !== normalizeAmbientModelId(current.model);
    const nextPiSessionFile = Object.hasOwn(input, "piSessionFile")
      ? (input.piSessionFile ?? null)
      : modelChanged
        ? null
      : (current.piSessionFile ?? null);
    this.db
      .prepare(
        `UPDATE threads
         SET permission_mode = ?, collaboration_mode = ?, model = ?, thinking_level = ?, memory_enabled = ?, pi_session_file = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.permissionMode ?? current.permissionMode,
        input.collaborationMode ?? current.collaborationMode,
        nextModel,
        input.thinkingLevel ?? current.thinkingLevel,
        (input.memoryEnabled ?? current.memoryEnabled) ? 1 : 0,
        nextPiSessionFile,
        now,
        threadId,
      );
    return this.getThread(threadId);
  }

  updateThreadTitle(threadId: string, title: string): ThreadSummary {
    const trimmed = title.trim();
    if (!trimmed) return this.getThread(threadId);
    this.db.prepare("UPDATE threads SET title = ? WHERE id = ?").run(trimmed, threadId);
    return this.getThread(threadId);
  }

  setThreadPinned(threadId: string, pinned: boolean): ThreadSummary {
    this.db.prepare("UPDATE threads SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, threadId);
    return this.getThread(threadId);
  }

  markThreadRead(threadId: string, readAt = new Date().toISOString()): ThreadSummary {
    this.db.prepare("UPDATE threads SET last_read_at = ? WHERE id = ?").run(readAt, threadId);
    return this.getThread(threadId);
  }

  markThreadUnread(threadId: string): ThreadSummary {
    const thread = this.getThread(threadId);
    const updatedMs = Date.parse(thread.updatedAt);
    const readAt = Number.isFinite(updatedMs) && updatedMs > 0
      ? new Date(updatedMs - 1).toISOString()
      : "1970-01-01T00:00:00.000Z";
    return this.markThreadRead(threadId, readAt);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE threads SET workspace_path = ?, updated_at = ? WHERE id = ?")
      .run(workspacePath, now, threadId);
    return this.getThread(threadId);
  }

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    const row = this.db.prepare("SELECT * FROM thread_worktrees WHERE thread_id = ?").get(threadId) as
      | ThreadWorktreeRow
      | undefined;
    return row ? mapThreadWorktreeRow(row) : undefined;
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.db
      .prepare("UPDATE thread_worktrees SET last_checkpoint_id = ?, updated_at = ? WHERE thread_id = ?")
      .run(checkpointId, new Date().toISOString(), threadId);
  }

  private mapThread(row: ThreadRow): ThreadSummary {
    return mapThreadRow(row, { gitWorktree: this.getThreadWorktree(row.id) });
  }
}
