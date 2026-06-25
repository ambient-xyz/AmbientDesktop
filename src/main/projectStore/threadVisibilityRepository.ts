import type Database from "better-sqlite3";
import type { ThreadSummary } from "../../shared/threadTypes";

export interface CreateProjectStoreThreadDefaults {
  permissionMode: ThreadSummary["permissionMode"];
  collaborationMode: ThreadSummary["collaborationMode"];
  model: ThreadSummary["model"];
  thinkingLevel: ThreadSummary["thinkingLevel"];
  memoryDefaultThreadEnabled: boolean;
}

export interface ProjectStoreLastActiveThreadSettings {
  getSetting(key: string, fallback: unknown): unknown;
  setSetting(key: string, value: unknown): void;
}

const LAST_ACTIVE_THREAD_SETTING_KEY = "lastActiveThreadId";

export class ProjectStoreThreadVisibilityRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly input: {
      createDefaultThread(defaults: CreateProjectStoreThreadDefaults): void;
    },
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
    this.ensureDefaultThread(input.defaults);
    this.keepLastActiveThreadVisible(input.settings, this.listVisibleThreadIds());
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
    this.ensureDefaultThread(input.defaults);
    this.keepLastActiveThreadVisible(input.settings, this.listVisibleThreadIds());
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

  ensureDefaultThread(defaults: CreateProjectStoreThreadDefaults): void {
    const row = this.db.prepare("SELECT id FROM threads WHERE archived_at IS NULL OR archived_at = '' LIMIT 1").get() as
      | { id: string }
      | undefined;
    if (!row) this.input.createDefaultThread(defaults);
  }

  private resolveLastActiveThreadId(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const row = this.db.prepare("SELECT id FROM threads WHERE id = ? AND (archived_at IS NULL OR archived_at = '')").get(value) as
      | { id: string }
      | undefined;
    return row?.id;
  }

  private hasThread(threadId: string): boolean {
    const row = this.db.prepare("SELECT id FROM threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    return Boolean(row);
  }

  private listVisibleThreadIds(): string[] {
    return this.db
      .prepare("SELECT id FROM threads WHERE archived_at IS NULL OR archived_at = '' ORDER BY pinned DESC, updated_at DESC")
      .all()
      .map((row) => (row as { id: string }).id);
  }
}
