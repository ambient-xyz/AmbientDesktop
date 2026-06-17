import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  RecordWorkflowModelCallInput,
  WorkflowModelCallRecord,
} from "../../shared/workflowTypes";
import {
  mapWorkflowModelCallRow,
  type WorkflowModelCallRow,
} from "../projectStoreWorkflowMappers";

export interface ProjectStoreWorkflowModelCallRepositoryDeps {
  getWorkflowRun(runId: string): { artifactId: string };
  getWorkflowArtifact(artifactId: string): unknown;
}

export class ProjectStoreWorkflowModelCallRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowModelCallRepositoryDeps,
  ) {}

  recordWorkflowModelCall(input: RecordWorkflowModelCallInput): WorkflowModelCallRecord {
    const run = input.runId ? this.deps.getWorkflowRun(input.runId) : undefined;
    const artifactId = input.artifactId ?? run?.artifactId;
    if (artifactId) this.deps.getWorkflowArtifact(artifactId);
    const id = randomUUID();
    const startedAt = input.startedAt ?? new Date().toISOString();
    const completedAt = input.completedAt ?? new Date().toISOString();
    const latencyMs = input.latencyMs ?? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
    this.db
      .prepare(
        `INSERT INTO workflow_model_calls
        (id, run_id, artifact_id, task, status, input_json, output_json, cache_key, cache_checkpoint_json, model, graph_node_id, graph_edge_id, item_key, validation_error, started_at, completed_at, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId ?? null,
        artifactId ?? null,
        input.task,
        input.status,
        JSON.stringify(input.input),
        input.output === undefined ? null : JSON.stringify(input.output),
        input.cacheKey ?? null,
        input.cacheCheckpoint ? JSON.stringify(input.cacheCheckpoint) : null,
        input.model ?? null,
        input.graphNodeId ?? null,
        input.graphEdgeId ?? null,
        input.itemKey ?? null,
        input.validationError ?? null,
        startedAt,
        completedAt,
        latencyMs,
      );
    return {
      id,
      runId: input.runId,
      artifactId,
      task: input.task,
      status: input.status,
      input: input.input,
      output: input.output,
      cacheKey: input.cacheKey,
      cacheCheckpoint: input.cacheCheckpoint,
      model: input.model,
      graphNodeId: input.graphNodeId,
      graphEdgeId: input.graphEdgeId,
      itemKey: input.itemKey,
      validationError: input.validationError,
      startedAt,
      completedAt,
      latencyMs,
    };
  }

  getWorkflowModelCall(callId: string): WorkflowModelCallRecord {
    const row = this.db.prepare("SELECT * FROM workflow_model_calls WHERE id = ?").get(callId) as WorkflowModelCallRow | undefined;
    if (!row) throw new Error(`Workflow model call not found: ${callId}`);
    return mapWorkflowModelCallRow(row);
  }

  listWorkflowModelCalls(input: { runId?: string; artifactId?: string } = {}): WorkflowModelCallRecord[] {
    const rows = input.runId
      ? (this.db.prepare("SELECT * FROM workflow_model_calls WHERE run_id = ? ORDER BY started_at ASC").all(input.runId) as WorkflowModelCallRow[])
      : input.artifactId
        ? (this.db.prepare("SELECT * FROM workflow_model_calls WHERE artifact_id = ? ORDER BY started_at ASC").all(input.artifactId) as WorkflowModelCallRow[])
        : (this.db.prepare("SELECT * FROM workflow_model_calls ORDER BY started_at ASC").all() as WorkflowModelCallRow[]);
    return rows.map(mapWorkflowModelCallRow);
  }
}
