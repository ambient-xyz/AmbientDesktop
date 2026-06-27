import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ProjectStoreThreadRepository,
  type CreateProjectStoreThreadDefaults,
  type ProjectStoreLastActiveThreadSettings,
} from "./threadRepository";

describe("ProjectStoreThreadRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreThreadRepository;

  const defaults: CreateProjectStoreThreadDefaults = {
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "example/model-id",
    thinkingLevel: "xhigh",
    memoryDefaultThreadEnabled: true,
  };

  function createLastActiveThreadSettings(initialValue?: unknown): ProjectStoreLastActiveThreadSettings {
    const settings = new Map<string, unknown>();
    if (initialValue !== undefined) settings.set("lastActiveThreadId", initialValue);
    return {
      getSetting: (key, fallback) => (settings.has(key) ? settings.get(key) : fallback),
      setSetting: (key, value) => {
        settings.set(key, value);
      },
    };
  }

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
      CREATE TABLE messages (
        id TEXT,
        thread_id TEXT NOT NULL,
        role TEXT,
        content TEXT,
        created_at TEXT,
        metadata_json TEXT
      );
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

  it("forks thread metadata and transcript rows", () => {
    const source = repository.createThread("Forkable chat", "/workspace", {
      permissionMode: "full-access",
      collaborationMode: "planner",
      thinkingLevel: "high",
    }, defaults);
    db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?").run("Prototype built.", source.id);
    db.prepare("INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").run(
      "message-2",
      source.id,
      "assistant",
      "Prototype built.",
      "2026-06-16T00:02:00.000Z",
      JSON.stringify({ status: "complete" }),
    );
    db.prepare("INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").run(
      "message-1",
      source.id,
      "user",
      "Build the prototype.",
      "2026-06-16T00:01:00.000Z",
      null,
    );

    const fork = repository.forkThread({
      threadId: source.id,
      workspacePath: "/other-workspace",
      defaults,
      now: "2026-06-16T00:03:00.000Z",
    });

    expect(fork).toMatchObject({
      title: "Forkable chat",
      workspacePath: "/other-workspace",
      permissionMode: "full-access",
      collaborationMode: "planner",
      thinkingLevel: "high",
      lastMessagePreview: "Prototype built.",
      updatedAt: "2026-06-16T00:03:00.000Z",
      lastReadAt: "2026-06-16T00:03:00.000Z",
    });
    expect(fork.id).not.toBe(source.id);

    const forkRows = db
      .prepare("SELECT id, role, content, created_at, metadata_json FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(fork.id) as Array<{ id: string; role: string; content: string; created_at: string; metadata_json: string | null }>;
    expect(forkRows.map((row) => [row.role, row.content, row.created_at, row.metadata_json])).toEqual([
      ["user", "Build the prototype.", "2026-06-16T00:01:00.000Z", null],
      ["assistant", "Prototype built.", "2026-06-16T00:02:00.000Z", JSON.stringify({ status: "complete" })],
    ]);
    expect(forkRows.map((row) => row.id)).not.toEqual(["message-1", "message-2"]);
  });

  it("clears persisted Pi session files when the thread model changes", () => {
    const thread = repository.createThread("Model switch", "/workspace", { model: "zai-org/GLM-5.1-FP8" }, defaults);
    const sessionBacked = repository.updateThreadSettings(thread.id, { piSessionFile: "/tmp/glm-session.jsonl" });

    expect(sessionBacked.piSessionFile).toBe("/tmp/glm-session.jsonl");

    const modelChanged = repository.updateThreadSettings(thread.id, { model: "example/model-id" });

    expect(modelChanged.model).toBe("example/model-id");
    expect(modelChanged.piSessionFile).toBeUndefined();
  });

  it("owns validated last-active thread settings", () => {
    const thread = repository.createThread("New chat", "/workspace", {}, defaults);
    const replacement = repository.createThread("Replacement", "/workspace", {}, defaults);
    const settings = createLastActiveThreadSettings();

    repository.setLastActiveThreadId(settings, thread.id);
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(thread.id);
    expect(repository.getLastActiveThreadId(settings)).toBe(thread.id);

    repository.setLastActiveThreadId(settings, "missing");
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(thread.id);

    repository.keepLastActiveThreadVisible(settings, [replacement.id]);
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(replacement.id);

    repository.updateLastActiveThreadAfterThreadDelete({
      settings,
      activeThreadId: replacement.id,
      deletedThreadIds: [replacement.id],
      replacementThreadId: thread.id,
    });
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(thread.id);

    db.prepare("UPDATE threads SET archived_at = ? WHERE id = ?").run("2026-06-16T00:00:00.000Z", thread.id);
    expect(repository.getLastActiveThreadId(settings)).toBeUndefined();
    repository.keepLastActiveThreadVisible(settings, [replacement.id]);
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(thread.id);
  });

  it("validates active-thread settings and reusable empty thread discovery", () => {
    const thread = repository.createThread("New chat", "/workspace", {}, defaults);

    expect(repository.hasThread(thread.id)).toBe(true);
    expect(repository.getLastActiveThreadId(createLastActiveThreadSettings(thread.id))).toBe(thread.id);
    expect(repository.getLastActiveThreadId(createLastActiveThreadSettings("missing"))).toBeUndefined();
    expect(repository.findReusableEmptyThread()?.id).toBe(thread.id);

    db.prepare("INSERT INTO messages (thread_id) VALUES (?)").run(thread.id);

    expect(repository.findReusableEmptyThread()).toBeUndefined();
  });

  it("ensures a visible default thread when no active thread exists", () => {
    repository.ensureDefaultThread(defaults);

    const created = repository.listThreads();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: "New chat", workspacePath: "/workspace" });

    repository.ensureDefaultThread(defaults);
    expect(repository.listThreads().map((thread) => thread.id)).toEqual([created[0]?.id]);

    db.prepare("UPDATE threads SET archived_at = ? WHERE id = ?").run("2026-06-16T00:00:00.000Z", created[0]?.id);
    repository.ensureDefaultThread(defaults);

    const visible = repository.listThreads();
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ title: "New chat", workspacePath: "/workspace" });
    expect(visible[0]?.id).not.toBe(created[0]?.id);
  });

  it("calculates the next subagent child order for a parent thread", () => {
    const parent = repository.createThread("Parent", "/workspace", {}, defaults);

    expect(repository.nextSubagentChildOrder(parent.id)).toBe(0);

    repository.createThread("Child 0", "/workspace", { parentThreadId: parent.id, childOrder: 0 }, defaults);
    repository.createThread("Child 3", "/workspace", { parentThreadId: parent.id, childOrder: 3 }, defaults);
    repository.createThread("Other child", "/workspace", { parentThreadId: "other-parent", childOrder: 8 }, defaults);

    expect(repository.nextSubagentChildOrder(parent.id)).toBe(4);
    expect(repository.nextSubagentChildOrder("missing-parent")).toBe(0);
  });

  it("archives chat threads behind the thread repository", () => {
    const first = repository.createThread("First chat", "/workspace", {}, defaults);
    const orchestrationBacked = repository.createThread("Running task", "/workspace", {}, defaults);
    db.prepare("INSERT INTO orchestration_runs (thread_id) VALUES (?)").run(orchestrationBacked.id);
    const settings = createLastActiveThreadSettings(orchestrationBacked.id);
    const now = "2026-06-16T01:00:00.000Z";

    expect(repository.archiveChats({ settings, defaults, now })).toBe(1);

    expect(repository.listThreads().map((thread) => thread.id)).toEqual([orchestrationBacked.id]);
    expect(repository.listThreadsForStateInspection().find((thread) => thread.id === first.id)?.archivedAt).toBe(now);
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(orchestrationBacked.id);
  });

  it("archives individual threads and creates a fallback visible thread", () => {
    const onlyThread = repository.createThread("Only chat", "/workspace", {}, defaults);
    const settings = createLastActiveThreadSettings(onlyThread.id);
    const now = "2026-06-16T02:00:00.000Z";

    expect(repository.archiveThread({ threadId: onlyThread.id, settings, defaults, now })).toBe(1);

    const visibleThreads = repository.listThreads();
    expect(visibleThreads).toHaveLength(1);
    expect(visibleThreads[0]).toMatchObject({ title: "New chat", workspacePath: "/workspace" });
    expect(visibleThreads[0]?.id).not.toBe(onlyThread.id);
    expect(repository.listThreadsForStateInspection().find((thread) => thread.id === onlyThread.id)?.archivedAt).toBe(now);
  });

  it("updates subagent child status on the thread row", () => {
    const child = repository.createThread("Child", "/workspace", {
      kind: "subagent_child",
      childStatus: "reserved",
    }, defaults);
    const now = "2026-06-16T03:00:00.000Z";

    repository.updateSubagentChildStatus(child.id, "running", now);

    expect(repository.getThread(child.id)).toMatchObject({
      childStatus: "running",
      updatedAt: now,
    });
  });

  it("archives active subagent child threads only", () => {
    const child = repository.createThread("Child", "/workspace", { kind: "subagent_child" }, defaults);
    const chat = repository.createThread("Chat", "/workspace", {}, defaults);
    const now = "2026-06-16T04:00:00.000Z";

    expect(repository.archiveSubagentChildThread(child.id, now)).toBe(true);
    expect(repository.archiveSubagentChildThread(chat.id, now)).toBe(false);

    expect(repository.listThreadsForStateInspection().find((thread) => thread.id === child.id)?.archivedAt).toBe(now);
    expect(repository.listThreadsForStateInspection().find((thread) => thread.id === chat.id)?.archivedAt).toBeUndefined();

    expect(repository.archiveSubagentChildThread(child.id, "2026-06-16T04:01:00.000Z")).toBe(false);
    expect(repository.listThreadsForStateInspection().find((thread) => thread.id === child.id)?.archivedAt).toBe(now);
  });

  it("prunes redundant empty threads and keeps active-thread settings current", () => {
    const older = repository.createThread("New chat", "/workspace", {}, defaults);
    const newer = repository.createThread("New chat", "/workspace", {}, defaults);
    db.prepare("UPDATE threads SET created_at = ?, updated_at = ? WHERE id = ?").run(
      "2026-06-16T00:00:00.000Z",
      "2026-06-16T00:00:00.000Z",
      older.id,
    );
    db.prepare("UPDATE threads SET created_at = ?, updated_at = ? WHERE id = ?").run(
      "2026-06-16T00:01:00.000Z",
      "2026-06-16T00:01:00.000Z",
      newer.id,
    );
    const settings = createLastActiveThreadSettings(older.id);

    expect(repository.pruneRedundantEmptyThreads(settings)).toBe(1);

    expect(repository.listThreads().map((thread) => thread.id)).toEqual([newer.id]);
    expect(settings.getSetting("lastActiveThreadId", "")).toBe(newer.id);
  });

  it("hydrates thread worktrees and updates checkpoints", () => {
    const thread = repository.createThread("New chat", "/other-workspace", {}, defaults);
    const now = "2026-06-16T00:00:00.000Z";
    const created = repository.setThreadWorktree({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree",
      branchName: "codex/example",
      baseRef: "origin/main",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    expect(created).toMatchObject({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree",
      branchName: "codex/example",
      baseRef: "origin/main",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const updated = repository.setThreadWorktree({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree-v2",
      branchName: "codex/example-v2",
      upstream: "origin/codex/example-v2",
      status: "failed",
      createdAt: "2026-06-16T00:01:00.000Z",
      updatedAt: "2026-06-16T00:02:00.000Z",
      lastCheckpointId: "checkpoint-0",
      error: "needs refresh",
    });

    expect(updated).toMatchObject({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree-v2",
      branchName: "codex/example-v2",
      upstream: "origin/codex/example-v2",
      status: "failed",
      createdAt: now,
      updatedAt: "2026-06-16T00:02:00.000Z",
      lastCheckpointId: "checkpoint-0",
      error: "needs refresh",
    });

    repository.updateThreadWorktreeCheckpoint(thread.id, "checkpoint-1");

    expect(repository.findReusableEmptyThread()?.id).toBe(thread.id);
    expect(repository.getThread(thread.id).gitWorktree).toMatchObject({
      threadId: thread.id,
      projectRoot: "/workspace",
      worktreePath: "/workspace-worktree-v2",
      branchName: "codex/example-v2",
      lastCheckpointId: "checkpoint-1",
    });
  });
});
