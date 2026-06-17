import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreWorkflowTraceRetentionRepository } from "./workflowTraceRetentionRepository";

describe("ProjectStoreWorkflowTraceRetentionRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkflowTraceRetentionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_agent_threads (
        id TEXT PRIMARY KEY,
        trace_mode TEXT NOT NULL
      );
      CREATE TABLE workflow_artifacts (
        id TEXT PRIMARY KEY,
        workflow_thread_id TEXT
      );
      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL
      );
      CREATE TABLE workflow_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        item_key TEXT,
        data_json TEXT
      );
      CREATE TABLE workflow_model_calls (
        id TEXT PRIMARY KEY,
        artifact_id TEXT,
        started_at TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT
      );
    `);
    repository = new ProjectStoreWorkflowTraceRetentionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("compacts expired debug trace payloads and production item evidence", () => {
    insertThread("debug-thread", "debug");
    insertThread("production-thread", "production");
    insertArtifact("debug-artifact", "debug-thread");
    insertArtifact("production-artifact", "production-thread");
    insertRun("debug-run", "debug-artifact");
    insertRun("production-run", "production-artifact");
    insertEvent({ id: "debug-expired", runId: "debug-run", artifactId: "debug-artifact", createdAt: "2026-03-20T00:00:00.000Z", data: { text: "debug" } });
    insertEvent({ id: "debug-fresh", runId: "debug-run", artifactId: "debug-artifact", createdAt: "2026-04-20T00:00:00.000Z", data: { text: "fresh" } });
    insertEvent({ id: "production-summary", runId: "production-run", artifactId: "production-artifact", createdAt: "2026-03-20T00:00:00.000Z", data: { text: "summary" } });
    insertEvent({
      id: "production-item",
      runId: "production-run",
      artifactId: "production-artifact",
      createdAt: "2026-03-20T00:00:00.000Z",
      itemKey: "item-1",
      data: { text: "item evidence" },
    });
    insertModelCall({
      id: "debug-call",
      artifactId: "debug-artifact",
      startedAt: "2026-03-20T00:00:00.000Z",
      input: { prompt: "debug prompt" },
      output: { text: "debug output" },
    });
    insertModelCall({
      id: "debug-call-null-output",
      artifactId: "debug-artifact",
      startedAt: "2026-03-20T00:00:00.000Z",
      input: { prompt: "debug prompt null output" },
      output: null,
    });
    insertModelCall({
      id: "production-call",
      artifactId: "production-artifact",
      startedAt: "2026-03-20T00:00:00.000Z",
      input: { prompt: "production prompt" },
      output: { text: "production output" },
    });

    const result = repository.compactExpiredWorkflowTraceData({ now: "2026-05-02T00:00:00.000Z" });

    expect(result).toEqual({
      cutoff: "2026-04-02T00:00:00.000Z",
      eventsCompacted: 2,
      modelCallsCompacted: 2,
    });
    expect(eventData("debug-expired")).toMatchObject({ retention: "compacted", compactedAt: "2026-05-02T00:00:00.000Z" });
    expect(eventData("debug-fresh")).toEqual({ text: "fresh" });
    expect(eventData("production-summary")).toEqual({ text: "summary" });
    expect(eventData("production-item")).toMatchObject({ retention: "compacted", reason: "workflow_trace_retention_expired" });
    expect(modelCallJson("debug-call", "input_json")).toMatchObject({ retention: "compacted" });
    expect(modelCallJson("debug-call", "output_json")).toMatchObject({ retention: "compacted" });
    expect(modelCallJson("debug-call-null-output", "input_json")).toMatchObject({ retention: "compacted" });
    expect(modelCallRaw("debug-call-null-output", "output_json")).toBeNull();
    expect(modelCallJson("production-call", "input_json")).toEqual({ prompt: "production prompt" });
    expect(modelCallJson("production-call", "output_json")).toEqual({ text: "production output" });
  });

  it("bounds retention days to at least one day", () => {
    insertThread("debug-thread", "debug");
    insertArtifact("debug-artifact", "debug-thread");
    insertRun("debug-run", "debug-artifact");
    insertEvent({ id: "two-days-old", runId: "debug-run", artifactId: "debug-artifact", createdAt: "2026-05-01T00:00:00.000Z", data: { text: "old" } });
    insertEvent({ id: "same-day", runId: "debug-run", artifactId: "debug-artifact", createdAt: "2026-05-02T12:00:00.000Z", data: { text: "same day" } });

    const result = repository.compactExpiredWorkflowTraceData({ now: "2026-05-03T00:00:00.000Z", debugRetentionDays: 0 });

    expect(result).toMatchObject({ cutoff: "2026-05-02T00:00:00.000Z", eventsCompacted: 1, modelCallsCompacted: 0 });
    expect(eventData("two-days-old")).toMatchObject({ retention: "compacted" });
    expect(eventData("same-day")).toEqual({ text: "same day" });
  });

  function insertThread(id: string, traceMode: "debug" | "production"): void {
    db.prepare("INSERT INTO workflow_agent_threads (id, trace_mode) VALUES (?, ?)").run(id, traceMode);
  }

  function insertArtifact(id: string, workflowThreadId: string): void {
    db.prepare("INSERT INTO workflow_artifacts (id, workflow_thread_id) VALUES (?, ?)").run(id, workflowThreadId);
  }

  function insertRun(id: string, artifactId: string): void {
    db.prepare("INSERT INTO workflow_runs (id, artifact_id) VALUES (?, ?)").run(id, artifactId);
  }

  function insertEvent(input: {
    id: string;
    runId: string;
    artifactId: string;
    createdAt: string;
    itemKey?: string;
    data: Record<string, unknown> | null;
  }): void {
    db.prepare(
      "INSERT INTO workflow_run_events (id, run_id, artifact_id, created_at, item_key, data_json) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(input.id, input.runId, input.artifactId, input.createdAt, input.itemKey ?? null, input.data ? JSON.stringify(input.data) : null);
  }

  function insertModelCall(input: {
    id: string;
    artifactId: string;
    startedAt: string;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }): void {
    db.prepare(
      "INSERT INTO workflow_model_calls (id, artifact_id, started_at, input_json, output_json) VALUES (?, ?, ?, ?, ?)",
    ).run(input.id, input.artifactId, input.startedAt, JSON.stringify(input.input), input.output ? JSON.stringify(input.output) : null);
  }

  function eventData(id: string): unknown {
    const raw = db.prepare("SELECT data_json FROM workflow_run_events WHERE id = ?").get(id) as { data_json: string | null };
    return raw.data_json ? JSON.parse(raw.data_json) : null;
  }

  function modelCallJson(id: string, column: "input_json" | "output_json"): unknown {
    const raw = modelCallRaw(id, column);
    return raw ? JSON.parse(raw) : null;
  }

  function modelCallRaw(id: string, column: "input_json" | "output_json"): string | null {
    const row = db.prepare(`SELECT ${column} FROM workflow_model_calls WHERE id = ?`).get(id) as Record<typeof column, string | null>;
    return row[column];
  }
});
