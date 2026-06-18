import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRegistry, archiveProjectChats, projectIdFromWorkspacePath } from "./projectRegistry";
import { AUTHORITY_STATE_ROOT_ENV, workspaceAuthorityStatePaths } from "./workspaceAuthorityState";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const originalAuthorityStateRoot = process.env[AUTHORITY_STATE_ROOT_ENV];

describeNative("ProjectRegistry", () => {
  afterEach(() => {
    if (originalAuthorityStateRoot === undefined) delete process.env[AUTHORITY_STATE_ROOT_ENV];
    else process.env[AUTHORITY_STATE_ROOT_ENV] = originalAuthorityStateRoot;
  });

  it("persists project display metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-registry-"));
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));
      await createProjectThread(projectPath, { id: "thread-hello", title: "Hello" });
      registry.register(projectPath);
      registry.setDisplayName(projectPath, "Renamed project");
      registry.setPinned(projectPath, true);

      expect(registry.listProjects(projectPath)[0]).toMatchObject({
        id: projectIdFromWorkspacePath(projectPath),
        path: projectPath,
        name: "Renamed project",
        pinned: true,
      });
      expect(registry.resolveProjectId(projectIdFromWorkspacePath(projectPath), projectPath)).toBe(projectPath);
      expect(() => registry.resolveProjectId("unregistered", projectPath)).toThrow(/not registered/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archives project chats without deleting project state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-archive-"));
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      await createProjectThread(projectPath, { id: "thread-archive-me", title: "Archive me" });

      expect(archiveProjectChats(projectPath)).toBeGreaterThan(0);
      expect(new ProjectRegistry(join(root, "projects.json")).listProjects(projectPath)[0]?.threads).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("hides workflow agent control chats from inactive project summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-project-workflow-hidden-"));
    try {
      const projectPath = join(root, "workspace");
      process.env[AUTHORITY_STATE_ROOT_ENV] = join(root, "authority-state");
      const registry = new ProjectRegistry(join(root, "projects.json"));
      await createProjectThread(projectPath, { id: "thread-visible", title: "Visible project chat" });
      await createProjectThread(projectPath, { id: "thread-workflow-control", title: "Workflow: Date night workflow" });
      await createWorkflowAgentThread(projectPath, {
        id: "workflow-thread-date-night",
        chatThreadId: "thread-workflow-control",
      });
      registry.register(projectPath);

      const visibleThreadTitles = registry.listProjects(projectPath)[0]?.threads.map((thread) => thread.title) ?? [];
      expect(visibleThreadTitles).toContain("Visible project chat");
      expect(visibleThreadTitles).not.toContain("Workflow: Date night workflow");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createProjectThread(
  workspacePath: string,
  input: { id: string; title: string; updatedAt?: string },
): Promise<void> {
  const { dbPath } = workspaceAuthorityStatePaths(workspacePath);
  await mkdir(workspacePath, { recursive: true });
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    createThreadTables(db);
    const now = input.updatedAt ?? "2026-06-17T00:00:00.000Z";
    db.prepare(
      `INSERT INTO threads
       (id, title, workspace_path, created_at, updated_at, last_read_at, last_message_preview, permission_mode, collaboration_mode, model, thinking_level, pi_session_file, pinned, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.title,
      workspacePath,
      now,
      now,
      now,
      input.title,
      "workspace",
      "agent",
      "auto",
      "medium",
      null,
      0,
      null,
    );
  } finally {
    db.close();
  }
}

async function createWorkflowAgentThread(
  workspacePath: string,
  input: { id: string; chatThreadId: string },
): Promise<void> {
  const { dbPath } = workspaceAuthorityStatePaths(workspacePath);
  await mkdir(workspacePath, { recursive: true });
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    createThreadTables(db);
    db.prepare(
      `INSERT INTO workflow_agent_threads
       (id, chat_thread_id, updated_at)
       VALUES (?, ?, ?)`,
    ).run(input.id, input.chatThreadId, "2026-06-17T00:00:00.000Z");
  } finally {
    db.close();
  }
}

function createThreadTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT,
      last_message_preview TEXT NOT NULL DEFAULT '',
      permission_mode TEXT NOT NULL DEFAULT 'workspace',
      collaboration_mode TEXT,
      model TEXT NOT NULL DEFAULT 'auto',
      thinking_level TEXT NOT NULL DEFAULT 'medium',
      pi_session_file TEXT,
      pinned INTEGER DEFAULT 0,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_agent_threads (
      id TEXT PRIMARY KEY,
      chat_thread_id TEXT,
      updated_at TEXT
    );
  `);
}
