import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ProjectStoreWorkflowAgentThreadRepository,
  WORKFLOW_AGENT_HOME_FOLDER_ID,
} from "./workflowAgentThreadRepository";

describe("ProjectStoreWorkflowAgentThreadRepository", () => {
  let db: Database.Database;
  let createdThreads: Array<{ title: string; workspacePath: string }>;
  let repository: ProjectStoreWorkflowAgentThreadRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        folder_kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        chat_thread_id TEXT,
        project_path TEXT NOT NULL,
        title TEXT NOT NULL,
        phase TEXT NOT NULL,
        initial_request TEXT NOT NULL,
        active_artifact_id TEXT,
        active_graph_snapshot_id TEXT,
        trace_mode TEXT NOT NULL DEFAULT 'production',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    createdThreads = [];
    repository = new ProjectStoreWorkflowAgentThreadRepository(db, {
      workspacePath: () => "/workspace",
      createThread: (title, workspacePath) => {
        createdThreads.push({ title, workspacePath });
        return { id: `chat-${createdThreads.length}` };
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates the default home folder idempotently", () => {
    repository.ensureDefaultWorkflowAgentFolder();
    repository.ensureDefaultWorkflowAgentFolder();

    expect(repository.listWorkflowAgentFolderRows()).toEqual([
      expect.objectContaining({
        id: WORKFLOW_AGENT_HOME_FOLDER_ID,
        name: "Home",
        folder_kind: "home",
      }),
    ]);
  });

  it("creates trimmed custom folders and rejects blank names", () => {
    repository.createWorkflowAgentFolder({ name: "  Reviews  " });

    expect(repository.listWorkflowAgentFolderRows()).toEqual([
      expect.objectContaining({ id: WORKFLOW_AGENT_HOME_FOLDER_ID, name: "Home", folder_kind: "home" }),
      expect.objectContaining({ name: "Reviews", folder_kind: "custom" }),
    ]);
    expect(() => repository.createWorkflowAgentFolder({ name: "   " })).toThrow("Workflow Agent folder name is required.");
  });

  it("creates workflow agent thread records with folder fallback, title derivation, and chat threads", () => {
    const row = repository.createWorkflowAgentThreadRecord({
      folderId: "missing-folder",
      initialRequest: "  Build the workflow\nwith details  ",
      phase: "planned",
      traceMode: "debug",
    });

    expect(row).toMatchObject({
      id: expect.any(String),
      folder_id: WORKFLOW_AGENT_HOME_FOLDER_ID,
      chat_thread_id: "chat-1",
      project_path: "/workspace",
      title: "Build the workflow",
      phase: "planned",
      initial_request: "Build the workflow\nwith details",
      trace_mode: "debug",
      active_artifact_id: null,
      active_graph_snapshot_id: null,
    });
    expect(createdThreads).toEqual([{ title: "Workflow: Build the workflow", workspacePath: "/workspace" }]);
  });

  it("uses explicit folders, titles, and project paths when creating workflow agent threads", () => {
    repository.createWorkflowAgentFolder({ name: "Custom" });
    const customFolder = repository.listWorkflowAgentFolderRows().find((folder) => folder.name === "Custom");

    const row = repository.createWorkflowAgentThreadRecord({
      folderId: customFolder?.id,
      title: "  Curated title  ",
      initialRequest: "Initial request",
      projectPath: " /project ",
    });

    expect(row).toMatchObject({
      folder_id: customFolder?.id,
      project_path: "/project",
      title: "Curated title",
      phase: "discovery",
      trace_mode: "production",
    });
    expect(createdThreads).toEqual([{ title: "Workflow: Curated title", workspacePath: "/project" }]);
  });

  it("moves workflow agent threads between folders and touches both rows", () => {
    repository.createWorkflowAgentFolder({ name: "Target" });
    const targetFolder = repository.listWorkflowAgentFolderRows().find((folder) => folder.name === "Target");
    const thread = repository.createWorkflowAgentThreadRecord({ initialRequest: "Move me" });

    repository.moveWorkflowAgentThread({ threadId: thread.id, folderId: targetFolder?.id ?? "missing" });

    expect(repository.requireWorkflowAgentThread(thread.id).folder_id).toBe(targetFolder?.id);
    expect(() => repository.moveWorkflowAgentThread({ threadId: thread.id, folderId: "missing" })).toThrow(
      "Workflow Agent folder not found: missing",
    );
    expect(() => repository.moveWorkflowAgentThread({ threadId: "missing", folderId: targetFolder?.id ?? "missing" })).toThrow(
      "Workflow Agent thread not found: missing",
    );
  });

  it("updates chat thread, phase, and active artifact fields", () => {
    const thread = repository.createWorkflowAgentThreadRecord({ initialRequest: "Update me" });

    repository.updateWorkflowAgentThreadChatThread(thread.id, "chat-new", "2026-06-17T01:00:00.000Z");
    repository.updateWorkflowAgentThreadPhase(thread.id, "running", "2026-06-17T01:01:00.000Z");
    repository.updateWorkflowAgentThreadActiveArtifact({
      threadId: thread.id,
      artifactId: "artifact-1",
      phase: "ready_for_review",
      updatedAt: "2026-06-17T01:02:00.000Z",
    });

    expect(repository.requireWorkflowAgentThread(thread.id)).toMatchObject({
      chat_thread_id: "chat-new",
      active_artifact_id: "artifact-1",
      phase: "ready_for_review",
      updated_at: "2026-06-17T01:02:00.000Z",
    });
  });

  it("lists workflow agent threads by latest update and creation time", () => {
    insertThread({ id: "thread-old", updatedAt: "2026-06-17T00:00:00.000Z", createdAt: "2026-06-17T00:00:00.000Z" });
    insertThread({ id: "thread-new", updatedAt: "2026-06-17T01:00:00.000Z", createdAt: "2026-06-17T01:00:00.000Z" });

    expect(repository.listWorkflowAgentThreadRows().map((thread) => thread.id)).toEqual(["thread-new", "thread-old"]);
  });

  function insertThread(input: { id: string; updatedAt: string; createdAt: string }): void {
    repository.ensureDefaultWorkflowAgentFolder();
    db.prepare(
      `INSERT INTO workflow_agent_threads
        (id, folder_id, chat_thread_id, project_path, title, phase, initial_request, active_artifact_id, active_graph_snapshot_id, trace_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      WORKFLOW_AGENT_HOME_FOLDER_ID,
      null,
      "/workspace",
      input.id,
      "discovery",
      input.id,
      null,
      null,
      "production",
      input.createdAt,
      input.updatedAt,
    );
  }
});
