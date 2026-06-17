import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreWorkflowGraphSnapshotRepository } from "./workflowGraphSnapshotRepository";

describe("ProjectStoreWorkflowGraphSnapshotRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkflowGraphSnapshotRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
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
      CREATE TABLE workflow_graph_snapshots (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT NOT NULL,
        snapshot_version INTEGER NOT NULL,
        snapshot_source TEXT NOT NULL,
        summary TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        artifact_path TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(workflow_thread_id, snapshot_version)
      );
    `);
    repository = new ProjectStoreWorkflowGraphSnapshotRepository(db);
    insertWorkflowThread("workflow-thread-1");
  });

  afterEach(() => {
    db.close();
  });

  it("creates graph snapshots with incrementing versions and activates by default", () => {
    const first = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "discovery",
      summary: "Initial graph",
      nodes: [],
      edges: [],
      artifactPath: "artifacts/graph-1.json",
    });
    const second = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "compile",
      summary: "Compiled graph",
      nodes: [],
      edges: [],
    });

    expect(first).toMatchObject({
      workflowThreadId: "workflow-thread-1",
      version: 1,
      source: "discovery",
      summary: "Initial graph",
      artifactPath: "artifacts/graph-1.json",
      nodes: [],
      edges: [],
    });
    expect(second).toMatchObject({
      workflowThreadId: "workflow-thread-1",
      version: 2,
      source: "compile",
      summary: "Compiled graph",
      nodes: [],
      edges: [],
    });
    expect(activeGraphSnapshotId()).toBe(second.id);
  });

  it("lists snapshots by newest version first", () => {
    const first = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "discovery",
      summary: "Initial graph",
      nodes: [],
      edges: [],
    });
    const second = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "revision",
      summary: "Revised graph",
      nodes: [],
      edges: [],
    });

    expect(repository.listWorkflowGraphSnapshots("workflow-thread-1").map((snapshot) => snapshot.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("can create inactive snapshots without replacing the active graph", () => {
    const active = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "discovery",
      summary: "Active graph",
      nodes: [],
      edges: [],
    });
    const inactive = repository.createWorkflowGraphSnapshot({
      workflowThreadId: "workflow-thread-1",
      source: "exploration",
      summary: "Exploration candidate",
      nodes: [],
      edges: [],
      activate: false,
    });

    expect(inactive.version).toBe(2);
    expect(activeGraphSnapshotId()).toBe(active.id);
  });

  it("preserves missing snapshot and missing thread errors", () => {
    expect(repository.tryGetWorkflowGraphSnapshot("missing")).toBeUndefined();
    expect(() => repository.listWorkflowGraphSnapshots("missing-thread")).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() =>
      repository.createWorkflowGraphSnapshot({
        workflowThreadId: "missing-thread",
        source: "run",
        summary: "Missing thread",
        nodes: [],
        edges: [],
      }),
    ).toThrow("Workflow Agent thread not found: missing-thread");
  });

  function insertWorkflowThread(id: string): void {
    db.prepare(
      `INSERT INTO workflow_agent_threads
       (id, folder_id, chat_thread_id, project_path, title, phase, initial_request, active_artifact_id, active_graph_snapshot_id, trace_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, "home", null, "/tmp/project", "Workflow", "discovery", "Build something", null, null, "production", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:00.000Z");
  }

  function activeGraphSnapshotId(): string | null {
    return (
      db.prepare("SELECT active_graph_snapshot_id FROM workflow_agent_threads WHERE id = ?").get("workflow-thread-1") as {
        active_graph_snapshot_id: string | null;
      }
    ).active_graph_snapshot_id;
  }
});
