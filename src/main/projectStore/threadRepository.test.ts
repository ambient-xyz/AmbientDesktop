import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreThreadRepository, type CreateProjectStoreThreadDefaults } from "./threadRepository";

describe("ProjectStoreThreadRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreThreadRepository;

  const defaults: CreateProjectStoreThreadDefaults = {
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "moonshotai/kimi-k2.7-code",
    thinkingLevel: "xhigh",
    memoryDefaultThreadEnabled: true,
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'chat',
        parent_thread_id TEXT,
        parent_message_id TEXT,
        parent_run_id TEXT,
        subagent_run_id TEXT,
        canonical_task_path TEXT,
        child_order INTEGER,
        collapsed_by_default INTEGER NOT NULL DEFAULT 0,
        child_status TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_read_at TEXT,
        last_message_preview TEXT NOT NULL DEFAULT '',
        permission_mode TEXT NOT NULL,
        collaboration_mode TEXT NOT NULL,
        model TEXT NOT NULL,
        thinking_level TEXT NOT NULL,
        memory_enabled INTEGER NOT NULL DEFAULT 0,
        pi_session_file TEXT,
        archived_at TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        workflow_recording_json TEXT
      );
      CREATE TABLE thread_worktrees (
        thread_id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        base_ref TEXT,
        upstream TEXT,
        worktree_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_checkpoint_id TEXT,
        error TEXT
      );
      CREATE TABLE messages (thread_id TEXT NOT NULL);
      CREATE TABLE runs (thread_id TEXT NOT NULL);
      CREATE TABLE orchestration_runs (thread_id TEXT NOT NULL);
      CREATE TABLE context_usage_snapshots (thread_id TEXT NOT NULL);
    `);
    repository = new ProjectStoreThreadRepository(db, "/workspace");
  });

  afterEach(() => {
    db.close();
  });

  it("creates, lists, and updates thread metadata", () => {
    const first = repository.createThread("First", "/workspace", {}, defaults);
    const second = repository.createThread("Second", "/workspace", { permissionMode: "full-access", thinkingLevel: "high" }, defaults);

    const updated = repository.updateThreadSettings(second.id, {
      collaborationMode: "planner",
      memoryEnabled: false,
      piSessionFile: "/tmp/session.json",
    });
    const renamed = repository.updateThreadTitle(second.id, "  Renamed  ");
    const pinned = repository.setThreadPinned(first.id, true);
    const unread = repository.markThreadUnread(second.id);

    expect(first).toMatchObject({ permissionMode: "workspace", memoryEnabled: true });
    expect(updated).toMatchObject({ collaborationMode: "planner", memoryEnabled: false, piSessionFile: "/tmp/session.json" });
    expect(renamed.title).toBe("Renamed");
    expect(pinned.pinned).toBe(true);
    expect(Date.parse(unread.lastReadAt ?? "")).toBeLessThan(Date.parse(unread.updatedAt));
    expect(repository.listThreads()[0]?.id).toBe(first.id);
    expect(repository.listThreadsForStateInspection().map((thread) => thread.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it("clears persisted Pi session files when the thread model changes", () => {
    const thread = repository.createThread("Model switch", "/workspace", { model: "zai-org/GLM-5.1-FP8" }, defaults);
    const sessionBacked = repository.updateThreadSettings(thread.id, { piSessionFile: "/tmp/glm-session.jsonl" });

    expect(sessionBacked.piSessionFile).toBe("/tmp/glm-session.jsonl");

    const modelChanged = repository.updateThreadSettings(thread.id, { model: "moonshotai/kimi-k2.7-code" });

    expect(modelChanged.model).toBe("moonshotai/kimi-k2.7-code");
    expect(modelChanged.piSessionFile).toBeUndefined();
  });

  it("validates active-thread settings and reusable empty thread discovery", () => {
    const thread = repository.createThread("New chat", "/workspace", {}, defaults);

    expect(repository.hasThread(thread.id)).toBe(true);
    expect(repository.getLastActiveThreadId(thread.id)).toBe(thread.id);
    expect(repository.getLastActiveThreadId("missing")).toBeUndefined();
    expect(repository.findReusableEmptyThread()?.id).toBe(thread.id);

    db.prepare("INSERT INTO messages (thread_id) VALUES (?)").run(thread.id);

    expect(repository.findReusableEmptyThread()).toBeUndefined();
  });

  it("hydrates thread worktrees and updates checkpoints", () => {
    const thread = repository.createThread("New chat", "/other-workspace", {}, defaults);
    const now = "2026-06-16T00:00:00.000Z";
    db.prepare(
      `INSERT INTO thread_worktrees
       (thread_id, project_root, worktree_path, branch_name, base_ref, upstream, worktree_status, created_at, updated_at, last_checkpoint_id, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(thread.id, "/workspace", "/workspace-worktree", "codex/example", "origin/main", null, "active", now, now, null, null);

    repository.updateThreadWorktreeCheckpoint(thread.id, "checkpoint-1");

    expect(repository.findReusableEmptyThread()?.id).toBe(thread.id);
    expect(repository.getThread(thread.id).gitWorktree).toMatchObject({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree",
      lastCheckpointId: "checkpoint-1",
    });
  });
});
