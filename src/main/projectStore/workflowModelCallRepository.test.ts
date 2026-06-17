import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkflowPromptCacheCheckpoint } from "../../shared/workflowTypes";
import { ProjectStoreWorkflowModelCallRepository } from "./workflowModelCallRepository";

describe("ProjectStoreWorkflowModelCallRepository", () => {
  let db: Database.Database;
  let workflowRunLookups: string[];
  let workflowArtifactLookups: string[];
  let repository: ProjectStoreWorkflowModelCallRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_model_calls (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        artifact_id TEXT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        cache_key TEXT,
        cache_checkpoint_json TEXT,
        model TEXT,
        graph_node_id TEXT,
        graph_edge_id TEXT,
        item_key TEXT,
        validation_error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        latency_ms INTEGER NOT NULL
      );
    `);
    workflowRunLookups = [];
    workflowArtifactLookups = [];
    repository = new ProjectStoreWorkflowModelCallRepository(db, {
      getWorkflowRun: (runId) => {
        workflowRunLookups.push(runId);
        return { artifactId: "artifact-from-run" };
      },
      getWorkflowArtifact: (artifactId) => {
        workflowArtifactLookups.push(artifactId);
        return { id: artifactId };
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("records model calls with run-derived artifacts and computed latency", () => {
    const cacheCheckpoint = workflowPromptCacheCheckpoint();
    const record = repository.recordWorkflowModelCall({
      runId: "run-1",
      task: "workflow.compile",
      status: "succeeded",
      input: { prompt: "compile" },
      output: { ok: true },
      cacheKey: "cache-1",
      cacheCheckpoint,
      model: "kimi",
      graphNodeId: "node-1",
      graphEdgeId: "edge-1",
      itemKey: "item-1",
      startedAt: "2026-06-17T00:00:00.000Z",
      completedAt: "2026-06-17T00:00:02.500Z",
    });

    expect(workflowRunLookups).toEqual(["run-1"]);
    expect(workflowArtifactLookups).toEqual(["artifact-from-run"]);
    expect(record).toMatchObject({
      id: expect.any(String),
      runId: "run-1",
      artifactId: "artifact-from-run",
      task: "workflow.compile",
      status: "succeeded",
      input: { prompt: "compile" },
      output: { ok: true },
      cacheKey: "cache-1",
      cacheCheckpoint,
      model: "kimi",
      graphNodeId: "node-1",
      graphEdgeId: "edge-1",
      itemKey: "item-1",
      startedAt: "2026-06-17T00:00:00.000Z",
      completedAt: "2026-06-17T00:00:02.500Z",
      latencyMs: 2500,
    });
    expect(repository.getWorkflowModelCall(record.id)).toEqual(record);
  });

  it("records explicit artifact ids and preserves caller-provided latency", () => {
    const record = repository.recordWorkflowModelCall({
      artifactId: "artifact-explicit",
      task: "workflow.validate",
      status: "invalid",
      input: { value: 1 },
      validationError: "Invalid output",
      startedAt: "2026-06-17T00:00:00.000Z",
      completedAt: "2026-06-17T00:00:01.000Z",
      latencyMs: 42,
    });

    expect(workflowRunLookups).toEqual([]);
    expect(workflowArtifactLookups).toEqual(["artifact-explicit"]);
    expect(record).toMatchObject({
      artifactId: "artifact-explicit",
      status: "invalid",
      output: undefined,
      validationError: "Invalid output",
      latencyMs: 42,
    });
  });

  it("lists model calls by run, artifact, or all calls in started order", () => {
    insertModelCall({ id: "call-c", runId: "run-2", artifactId: "artifact-2", startedAt: "2026-06-17T00:03:00.000Z" });
    insertModelCall({ id: "call-a", runId: "run-1", artifactId: "artifact-1", startedAt: "2026-06-17T00:01:00.000Z" });
    insertModelCall({ id: "call-b", runId: "run-1", artifactId: "artifact-1", startedAt: "2026-06-17T00:02:00.000Z" });

    expect(repository.listWorkflowModelCalls({ runId: "run-1" }).map((call) => call.id)).toEqual(["call-a", "call-b"]);
    expect(repository.listWorkflowModelCalls({ artifactId: "artifact-1" }).map((call) => call.id)).toEqual(["call-a", "call-b"]);
    expect(repository.listWorkflowModelCalls().map((call) => call.id)).toEqual(["call-a", "call-b", "call-c"]);
  });

  it("preserves missing model call errors", () => {
    expect(() => repository.getWorkflowModelCall("missing")).toThrow("Workflow model call not found: missing");
  });

  function insertModelCall(input: { id: string; runId: string; artifactId: string; startedAt: string }): void {
    db.prepare(
      `INSERT INTO workflow_model_calls
        (id, run_id, artifact_id, task, status, input_json, output_json, cache_key, cache_checkpoint_json, model, graph_node_id, graph_edge_id, item_key, validation_error, started_at, completed_at, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.runId,
      input.artifactId,
      "workflow.compile",
      "succeeded",
      "{}",
      "{}",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      input.startedAt,
      input.startedAt,
      0,
    );
  }

  function workflowPromptCacheCheckpoint(): WorkflowPromptCacheCheckpoint {
    return {
      id: "checkpoint-1",
      stage: "compile",
      stablePrefixHash: "stable-hash",
      stablePrefixChars: 100,
      stablePrefixEstimatedTokens: 25,
      mutableSuffixHash: "mutable-hash",
      mutableSuffixChars: 20,
      mutableSuffixEstimatedTokens: 5,
      requestHash: "request-hash",
      requestEstimatedTokens: 10,
      boundaryLabel: "workflow compile",
      createdAt: "2026-06-17T00:00:00.000Z",
    };
  }
});
