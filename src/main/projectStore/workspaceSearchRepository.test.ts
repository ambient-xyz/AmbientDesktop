import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreWorkspaceSearchRepository } from "./workspaceSearchRepository";

describe("ProjectStoreWorkspaceSearchRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkspaceSearchRepository;

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
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT
      );
    `);
    repository = new ProjectStoreWorkspaceSearchRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("searches active thread previews and messages with workspace metadata", () => {
    insertThread(db, {
      id: "thread-1",
      title: "Searchable thread",
      preview: "The durable banana result is here.",
      updatedAt: "2026-06-16T00:02:00.000Z",
    });
    insertThread(db, {
      id: "thread-2",
      title: "Other thread",
      updatedAt: "2026-06-16T00:01:00.000Z",
    });
    insertThread(db, {
      id: "archived-thread",
      title: "Archived banana thread",
      updatedAt: "2026-06-16T00:03:00.000Z",
      archivedAt: "2026-06-16T00:04:00.000Z",
    });
    insertMessage(db, {
      id: "message-1",
      threadId: "thread-2",
      content: "Find the durable banana result in another chat.",
      createdAt: "2026-06-16T00:05:00.000Z",
    });
    insertMessage(db, {
      id: "archived-message",
      threadId: "archived-thread",
      content: "Hidden banana result.",
      createdAt: "2026-06-16T00:06:00.000Z",
    });

    const results = repository.searchWorkspace({
      query: " banana ",
      workspacePath: "/workspace",
      projectName: "Ambient",
    });

    expect(results.map((result) => result.id)).toEqual(["message:message-1", "thread:thread-1"]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "thread:thread-1",
          kind: "thread",
          threadId: "thread-1",
          workspacePath: "/workspace",
          projectName: "Ambient",
          scope: "project",
          excerpt: "The durable banana result is here.",
        }),
        expect.objectContaining({
          id: "message:message-1",
          kind: "message",
          threadId: "thread-2",
          title: "Other thread",
          role: "user",
          scope: "project",
        }),
      ]),
    );
  });

  it("narrows chat-scoped search to the requested thread and honors the result limit", () => {
    insertThread(db, {
      id: "thread-1",
      title: "First thread",
      updatedAt: "2026-06-16T00:01:00.000Z",
    });
    insertThread(db, {
      id: "thread-2",
      title: "Second thread",
      updatedAt: "2026-06-16T00:02:00.000Z",
    });
    insertMessage(db, {
      id: "message-1",
      threadId: "thread-1",
      content: "Banana belongs to this chat.",
      createdAt: "2026-06-16T00:03:00.000Z",
    });
    insertMessage(db, {
      id: "message-2",
      threadId: "thread-2",
      content: "Banana belongs somewhere else.",
      createdAt: "2026-06-16T00:04:00.000Z",
    });

    const results = repository.searchWorkspace({
      query: "banana",
      scope: "chat",
      threadId: "thread-1",
      limit: 1,
      workspacePath: "/workspace",
      projectName: "Ambient",
    });

    expect(results).toEqual([
      expect.objectContaining({
        id: "message:message-1",
        threadId: "thread-1",
        scope: "chat",
      }),
    ]);
  });
});

function insertThread(
  db: Database.Database,
  input: {
    id: string;
    title: string;
    preview?: string;
    updatedAt: string;
    archivedAt?: string;
  },
): void {
  db.prepare(
    `INSERT INTO threads
      (id, title, workspace_path, kind, created_at, updated_at, last_read_at, last_message_preview,
       permission_mode, collaboration_mode, model, thinking_level, memory_enabled, archived_at, pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.title,
    "/workspace",
    "chat",
    "2026-06-16T00:00:00.000Z",
    input.updatedAt,
    input.updatedAt,
    input.preview ?? "",
    "workspace",
    "agent",
    "<model>",
    "xhigh",
    1,
    input.archivedAt ?? null,
    0,
  );
}

function insertMessage(
  db: Database.Database,
  input: {
    id: string;
    threadId: string;
    content: string;
    createdAt: string;
  },
): void {
  db.prepare("INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.id,
    input.threadId,
    "user",
    input.content,
    input.createdAt,
    null,
  );
}
