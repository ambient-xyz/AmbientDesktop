import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ThreadSummary, ThreadWorktreeSummary } from "../../shared/threadTypes";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { CreateThreadOptions, ThreadWorktreeInput } from "./projectStoreFacadeHelpers";
import {
  mapThreadRow,
  mapThreadWorktreeRow,
  type ThreadRow,
  type ThreadWorktreeRow,
} from "./threadMappers";
import type { MessageRow } from "./messageMappers";

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

export interface ProjectStoreLastActiveThreadSettings {
  getSetting(key: string, fallback: unknown): unknown;
  setSetting(key: string, value: unknown): void;
}

const LAST_ACTIVE_THREAD_SETTING_KEY = "lastActiveThreadId";

export class ProjectStoreThreadRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly workspacePath: string,
  ) {}

  getLastActiveThreadId(settings: ProjectStoreLastActiveThreadSettings): string | undefined {
    return this.resolveLastActiveThreadId(settings.getSetting(LAST_ACTIVE_THREAD_SETTING_KEY, ""));
  }

  setLastActiveThreadId(settings: ProjectStoreLastActiveThreadSettings, threadId: string): void {
    if (!this.hasThread(threadId)) return;
    settings.setSetting(LAST_ACTIVE_THREAD_SETTING_KEY, threadId);
  }

  keepLastActiveThreadVisible(settings: ProjectStoreLastActiveThreadSettings, visibleThreadIds: readonly string[]): void {
    const activeThreadId = this.getLastActiveThreadId(settings);
    if (activeThreadId && !visibleThreadIds.includes(activeThreadId)) {
      this.setLastActiveThreadId(settings, visibleThreadIds[0] ?? "");
    }
  }

  updateLastActiveThreadAfterThreadDelete(input: {
    settings: ProjectStoreLastActiveThreadSettings;
    activeThreadId: string | undefined;
    deletedThreadIds: readonly string[];
    replacementThreadId?: string;
  }): void {
    if (!input.activeThreadId || !input.deletedThreadIds.includes(input.activeThreadId)) return;
    input.settings.setSetting(LAST_ACTIVE_THREAD_SETTING_KEY, input.replacementThreadId ?? "");
  }

  private resolveLastActiveThreadId(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const row = this.db
      .prepare("SELECT id FROM threads WHERE id = ? AND (archived_at IS NULL OR archived_at = '')")
      .get(value) as { id: string } | undefined;
    return row?.id;
  }

  archiveChats(input: {
    settings: ProjectStoreLastActiveThreadSettings;
    defaults: CreateProjectStoreThreadDefaults;
    now?: string;
  }): number {
    const now = input.now ?? new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE threads
         SET archived_at = ?, updated_at = ?
         WHERE (archived_at IS NULL OR archived_at = '')
           AND NOT EXISTS (
             SELECT 1 FROM orchestration_runs
             WHERE orchestration_runs.thread_id = threads.id
           )`,
      )
      .run(now, now);
    this.ensureVisibleThread(input.defaults);
    this.keepLastActiveThreadVisible(
      input.settings,
      this.listThreads().map((thread) => thread.id),
    );
    return Number(result.changes || 0);
  }

  archiveThread(input: {
    threadId: string;
    settings: ProjectStoreLastActiveThreadSettings;
    defaults: CreateProjectStoreThreadDefaults;
    now?: string;
  }): number {
    const now = input.now ?? new Date().toISOString();
    const result = this.db
      .prepare("UPDATE threads SET archived_at = ?, updated_at = ? WHERE id = ? AND (archived_at IS NULL OR archived_at = '')")
      .run(now, now, input.threadId);
    this.ensureVisibleThread(input.defaults);
    this.keepLastActiveThreadVisible(
      input.settings,
      this.listThreads().map((thread) => thread.id),
    );
    return Number(result.changes || 0);
  }

  pruneRedundantEmptyThreads(settings: ProjectStoreLastActiveThreadSettings): number {
    const candidates = this.db
      .prepare(
        `SELECT id FROM threads
         WHERE title = 'New chat'
           AND last_message_preview = ''
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
         ORDER BY updated_at DESC, created_at DESC`,
      )
      .all() as Array<{ id: string }>;
    if (candidates.length === 0) return 0;

    const nonEmptyThread = this.db
      .prepare(
        `SELECT id FROM threads
         WHERE NOT (
           title = 'New chat'
           AND last_message_preview = ''
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
         )
         LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    const keepId = nonEmptyThread ? undefined : candidates[0]?.id;
    const deleteIds = candidates.map((candidate) => candidate.id).filter((id) => id !== keepId);
    if (deleteIds.length === 0) return 0;

    const activeThreadId = this.getLastActiveThreadId(settings);
    const deleteThread = this.db.prepare("DELETE FROM threads WHERE id = ?");
    const transaction = this.db.transaction((ids: string[]) => {
      for (const id of ids) deleteThread.run(id);
    });
    transaction(deleteIds);
    this.updateLastActiveThreadAfterThreadDelete({
      settings,
      activeThreadId,
      deletedThreadIds: deleteIds,
      replacementThreadId: keepId,
    });
    return deleteIds.length;
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

  ensureDefaultThread(defaults: CreateProjectStoreThreadDefaults): void {
    const row = this.db.prepare("SELECT id FROM threads WHERE archived_at IS NULL OR archived_at = '' LIMIT 1").get() as
      | { id: string }
      | undefined;
    if (!row) this.createThread("New chat", this.workspacePath, {}, defaults);
  }

  nextSubagentChildOrder(parentThreadId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(child_order), -1) + 1 AS next_order FROM threads WHERE parent_thread_id = ?")
      .get(parentThreadId) as { next_order?: number } | undefined;
    return Math.max(0, Math.floor(row?.next_order ?? 0));
  }

  private ensureVisibleThread(defaults: CreateProjectStoreThreadDefaults): void {
    this.ensureDefaultThread(defaults);
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

  forkThread(input: {
    threadId: string;
    workspacePath: string;
    defaults: CreateProjectStoreThreadDefaults;
    now?: string;
  }): ThreadSummary {
    const source = this.getThread(input.threadId);
    const now = input.now ?? new Date().toISOString();
    const fork = this.createThread(source.title, input.workspacePath, {}, input.defaults);
    this.db.prepare(
      `UPDATE threads
       SET permission_mode = ?, collaboration_mode = ?, model = ?, thinking_level = ?, last_message_preview = ?, updated_at = ?, last_read_at = ?
       WHERE id = ?`,
    ).run(
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
    const row = this.db.prepare("SELECT * FROM thread_worktrees WHERE thread_id = ?").get(threadId) as
      | ThreadWorktreeRow
      | undefined;
    return row ? mapThreadWorktreeRow(row) : undefined;
  }

  setThreadWorktree(input: ThreadWorktreeInput): ThreadWorktreeSummary {
    const now = new Date().toISOString();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    this.db
      .prepare(
        `INSERT INTO thread_worktrees
          (thread_id, project_root, worktree_path, branch_name, base_ref, upstream, worktree_status, created_at, updated_at, last_checkpoint_id, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
          project_root = excluded.project_root,
          worktree_path = excluded.worktree_path,
          branch_name = excluded.branch_name,
          base_ref = excluded.base_ref,
          upstream = excluded.upstream,
          worktree_status = excluded.worktree_status,
          updated_at = excluded.updated_at,
          last_checkpoint_id = excluded.last_checkpoint_id,
          error = excluded.error`,
      )
      .run(
        input.threadId,
        input.projectRoot,
        input.worktreePath,
        input.branchName,
        input.baseRef ?? null,
        input.upstream ?? null,
        input.status,
        createdAt,
        updatedAt,
        input.lastCheckpointId ?? null,
        input.error ?? null,
      );
    return this.getThreadWorktree(input.threadId)!;
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
