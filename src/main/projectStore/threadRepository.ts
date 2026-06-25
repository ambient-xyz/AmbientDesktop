import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { CreateThreadOptions, ThreadWorktreeInput } from "./projectStoreFacadeHelpers";
import { mapThreadRow, type ThreadRow } from "./threadMappers";
import type { MessageRow } from "./messageMappers";
import {
  ProjectStoreThreadVisibilityRepository,
  type CreateProjectStoreThreadDefaults,
  type ProjectStoreLastActiveThreadSettings,
} from "./threadVisibilityRepository";
import { ProjectStoreThreadWorktreeRepository } from "./threadWorktreeRepository";

export type { CreateProjectStoreThreadDefaults, ProjectStoreLastActiveThreadSettings } from "./threadVisibilityRepository";

export type UpdateProjectStoreThreadSettingsInput = Partial<
  Pick<ThreadSummary, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">
> & {
  piSessionFile?: string | null;
};

export class ProjectStoreThreadRepository {
  private readonly visibility: ProjectStoreThreadVisibilityRepository;
  private readonly worktrees: ProjectStoreThreadWorktreeRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly workspacePath: string,
  ) {
    this.visibility = new ProjectStoreThreadVisibilityRepository(db, {
      createDefaultThread: (defaults) => {
        this.createThread("New chat", this.workspacePath, {}, defaults);
      },
    });
    this.worktrees = new ProjectStoreThreadWorktreeRepository(db);
  }

  getLastActiveThreadId(settings: ProjectStoreLastActiveThreadSettings): string | undefined {
    return this.visibility.getLastActiveThreadId(settings);
  }

  setLastActiveThreadId(settings: ProjectStoreLastActiveThreadSettings, threadId: string): void {
    this.visibility.setLastActiveThreadId(settings, threadId);
  }

  keepLastActiveThreadVisible(settings: ProjectStoreLastActiveThreadSettings, visibleThreadIds: readonly string[]): void {
    this.visibility.keepLastActiveThreadVisible(settings, visibleThreadIds);
  }

  updateLastActiveThreadAfterThreadDelete(input: {
    settings: ProjectStoreLastActiveThreadSettings;
    activeThreadId: string | undefined;
    deletedThreadIds: readonly string[];
    replacementThreadId?: string;
  }): void {
    this.visibility.updateLastActiveThreadAfterThreadDelete(input);
  }

  archiveChats(input: {
    settings: ProjectStoreLastActiveThreadSettings;
    defaults: CreateProjectStoreThreadDefaults;
    now?: string;
  }): number {
    return this.visibility.archiveChats(input);
  }

  archiveThread(input: {
    threadId: string;
    settings: ProjectStoreLastActiveThreadSettings;
    defaults: CreateProjectStoreThreadDefaults;
    now?: string;
  }): number {
    return this.visibility.archiveThread(input);
  }

  pruneRedundantEmptyThreads(settings: ProjectStoreLastActiveThreadSettings): number {
    return this.visibility.pruneRedundantEmptyThreads(settings);
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
    const rows = this.db.prepare("SELECT * FROM threads ORDER BY pinned DESC, updated_at DESC").all() as ThreadRow[];
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

  ensureDefaultThread(defaults: CreateProjectStoreThreadDefaults): void {
    this.visibility.ensureDefaultThread(defaults);
  }

  nextSubagentChildOrder(parentThreadId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(child_order), -1) + 1 AS next_order FROM threads WHERE parent_thread_id = ?")
      .get(parentThreadId) as { next_order?: number } | undefined;
    return Math.max(0, Math.floor(row?.next_order ?? 0));
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

  forkThread(input: { threadId: string; workspacePath: string; defaults: CreateProjectStoreThreadDefaults; now?: string }): ThreadSummary {
    const source = this.getThread(input.threadId);
    const now = input.now ?? new Date().toISOString();
    const fork = this.createThread(source.title, input.workspacePath, {}, input.defaults);
    this.db
      .prepare(
        `UPDATE threads
       SET permission_mode = ?, collaboration_mode = ?, model = ?, thinking_level = ?, last_message_preview = ?, updated_at = ?, last_read_at = ?
       WHERE id = ?`,
      )
      .run(
        source.permissionMode,
        source.collaborationMode,
        source.model,
        source.thinkingLevel,
        source.lastMessagePreview,
        now,
        now,
        fork.id,
      );
    const messages = this.db
      .prepare("SELECT role, content, created_at, metadata_json FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(input.threadId) as Pick<MessageRow, "role" | "content" | "created_at" | "metadata_json">[];
    const insertMessage = this.db.prepare(
      "INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertMany = this.db.transaction((rows: typeof messages) => {
      for (const row of rows) {
        insertMessage.run(randomUUID(), fork.id, row.role, row.content, row.created_at, row.metadata_json);
      }
    });
    insertMany(messages);
    return this.getThread(fork.id);
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
    const readAt = Number.isFinite(updatedMs) && updatedMs > 0 ? new Date(updatedMs - 1).toISOString() : "1970-01-01T00:00:00.000Z";
    return this.markThreadRead(threadId, readAt);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE threads SET workspace_path = ?, updated_at = ? WHERE id = ?").run(workspacePath, now, threadId);
    return this.getThread(threadId);
  }

  updateSubagentChildStatus(threadId: string, status: NonNullable<ThreadSummary["childStatus"]>, updatedAt: string): void {
    this.db.prepare("UPDATE threads SET child_status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, threadId);
  }

  archiveSubagentChildThread(threadId: string, archivedAt: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE threads
         SET archived_at = ?, updated_at = ?
         WHERE id = ?
           AND kind = 'subagent_child'
           AND (archived_at IS NULL OR archived_at = '')`,
      )
      .run(archivedAt, archivedAt, threadId);
    return Number(result.changes || 0) > 0;
  }

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    return this.worktrees.getThreadWorktree(threadId);
  }

  setThreadWorktree(input: ThreadWorktreeInput): ThreadWorktreeSummary {
    return this.worktrees.setThreadWorktree(input);
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.worktrees.updateThreadWorktreeCheckpoint(threadId, checkpointId);
  }

  private mapThread(row: ThreadRow): ThreadSummary {
    return mapThreadRow(row, { gitWorktree: this.worktrees.getThreadWorktree(row.id) });
  }
}
