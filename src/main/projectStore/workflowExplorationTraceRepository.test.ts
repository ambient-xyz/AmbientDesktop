import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreWorkflowExplorationTraceRepository } from "./workflowExplorationTraceRepository";

describe("ProjectStoreWorkflowExplorationTraceRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkflowExplorationTraceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE workflow_exploration_traces (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT NOT NULL,
        exploration_id TEXT NOT NULL,
        exploration_node_id TEXT NOT NULL,
        request_text TEXT NOT NULL,
        model TEXT,
        capability_manifest_json TEXT NOT NULL,
        observations_json TEXT NOT NULL,
        events_json TEXT NOT NULL DEFAULT '[]',
        distillation_json TEXT NOT NULL,
        run_status TEXT NOT NULL DEFAULT 'succeeded',
        graph_snapshot_id TEXT,
        latest_progress_json TEXT,
        provider_health_json TEXT,
        retry_metadata_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        completed_at TEXT
      );
    `);
    db.prepare("INSERT INTO workflow_agent_threads (id) VALUES (?)").run("workflow-thread-1");
    repository = new ProjectStoreWorkflowExplorationTraceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates traces with serialized fields and terminal completion defaults", () => {
    const trace = repository.createWorkflowExplorationTrace({
      id: "trace-1",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore workflow",
      model: "kimi",
      capabilityManifest: { tools: ["search"] },
      observations: [{ kind: "file" }],
      events: [{ seq: 1, type: "started", createdAt: "2026-06-16T01:00:00.000Z" }],
      distillation: { summary: "ready" },
      status: "failed",
      graphSnapshotId: "graph-1",
      latestProgress: {
        workflowThreadId: "workflow-thread-1",
        explorationId: "exploration-1",
        eventType: "failed",
        phase: "failed",
        status: "failed",
        message: "Stopped",
        updatedAt: "2026-06-16T01:01:00.000Z",
      },
      providerHealth: { ok: false },
      retryMetadata: { attempts: 1 },
      error: "Provider failed",
    });

    expect(trace).toMatchObject({
      id: "trace-1",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore workflow",
      model: "kimi",
      capabilityManifest: { tools: ["search"] },
      observations: [{ kind: "file" }],
      events: [{ seq: 1, type: "started", createdAt: "2026-06-16T01:00:00.000Z" }],
      distillation: { summary: "ready" },
      status: "failed",
      graphSnapshotId: "graph-1",
      providerHealth: { ok: false },
      retryMetadata: { attempts: 1 },
      error: "Provider failed",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      completedAt: expect.any(String),
    });
    expect(trace.completedAt).toBe(trace.createdAt);
  });

  it("keeps running traces incomplete until explicitly completed", () => {
    const trace = repository.createWorkflowExplorationTrace({
      id: "trace-running",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore workflow",
      capabilityManifest: {},
      observations: [],
      distillation: {},
      status: "running",
    });

    expect(trace.status).toBe("running");
    expect(trace.events).toEqual([]);
    expect(trace.completedAt).toBeUndefined();
  });

  it("updates traces selectively and allows completedAt to be cleared", () => {
    const created = repository.createWorkflowExplorationTrace({
      id: "trace-update",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore workflow",
      capabilityManifest: {},
      observations: [{ before: true }],
      distillation: { before: true },
      status: "succeeded",
      error: "Initial error",
    });

    const updated = repository.updateWorkflowExplorationTrace({
      id: created.id,
      status: "running",
      observations: [{ after: true }],
      events: [{ seq: 2, type: "progress", createdAt: "2026-06-16T01:02:00.000Z" }],
      latestProgress: {
        workflowThreadId: "workflow-thread-1",
        explorationId: "exploration-1",
        eventType: "progress",
        phase: "ambient",
        status: "running",
        message: "Still exploring",
        updatedAt: "2026-06-16T01:02:00.000Z",
      },
      completedAt: null,
    });

    expect(updated).toMatchObject({
      id: "trace-update",
      status: "running",
      observations: [{ after: true }],
      events: [{ seq: 2, type: "progress", createdAt: "2026-06-16T01:02:00.000Z" }],
      distillation: { before: true },
      error: "Initial error",
      updatedAt: expect.any(String),
      completedAt: undefined,
    });
  });

  it("lists traces for a workflow thread by newest creation then id", () => {
    insertTrace({ id: "trace-a", createdAt: "2026-06-16T01:00:00.000Z" });
    insertTrace({ id: "trace-b", createdAt: "2026-06-16T02:00:00.000Z" });
    insertTrace({ id: "trace-c", createdAt: "2026-06-16T02:00:00.000Z" });

    expect(repository.listWorkflowExplorationTraces("workflow-thread-1").map((trace) => trace.id)).toEqual([
      "trace-c",
      "trace-b",
      "trace-a",
    ]);
  });

  it("preserves missing trace and missing thread errors", () => {
    expect(() => repository.updateWorkflowExplorationTrace({ id: "missing", status: "failed" })).toThrow(
      "Workflow exploration trace not found: missing",
    );
    expect(() => repository.listWorkflowExplorationTraces("missing-thread")).toThrow("Workflow Agent thread not found: missing-thread");
    expect(() =>
      repository.createWorkflowExplorationTrace({
        id: "trace-missing-thread",
        workflowThreadId: "missing-thread",
        explorationId: "exploration-1",
        explorationNodeId: "node-1",
        request: "Explore workflow",
        capabilityManifest: {},
        observations: [],
        distillation: {},
      }),
    ).toThrow("Workflow Agent thread not found: missing-thread");
  });

  function insertTrace(input: { id: string; createdAt: string }): void {
    db.prepare(
      `INSERT INTO workflow_exploration_traces
       (id, workflow_thread_id, exploration_id, exploration_node_id, request_text, model, capability_manifest_json, observations_json, events_json, distillation_json, run_status, graph_snapshot_id, latest_progress_json, provider_health_json, retry_metadata_json, error_message, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      "workflow-thread-1",
      "exploration-1",
      "node-1",
      "Explore workflow",
      null,
      "{}",
      "[]",
      "[]",
      "{}",
      "succeeded",
      null,
      null,
      null,
      null,
      null,
      input.createdAt,
      input.createdAt,
      input.createdAt,
    );
  }
});
