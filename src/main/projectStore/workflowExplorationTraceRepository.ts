import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CreateWorkflowExplorationTraceInput,
  UpdateWorkflowExplorationTraceInput,
  WorkflowExplorationTraceSummary,
} from "../../shared/workflowTypes";
import {
  mapWorkflowExplorationTraceRow,
  type WorkflowExplorationTraceRow,
} from "../projectStoreWorkflowMappers";

export class ProjectStoreWorkflowExplorationTraceRepository {
  constructor(private readonly db: Database.Database) {}

  createWorkflowExplorationTrace(input: CreateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflow_exploration_traces
          (id, workflow_thread_id, exploration_id, exploration_node_id, request_text, model, capability_manifest_json, observations_json, events_json, distillation_json, run_status, graph_snapshot_id, latest_progress_json, provider_health_json, retry_metadata_json, error_message, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.explorationId,
        input.explorationNodeId,
        input.request,
        input.model ?? null,
        JSON.stringify(input.capabilityManifest),
        JSON.stringify(input.observations),
        JSON.stringify(input.events ?? []),
        JSON.stringify(input.distillation),
        input.status ?? "succeeded",
        input.graphSnapshotId ?? null,
        input.latestProgress ? JSON.stringify(input.latestProgress) : null,
        input.providerHealth !== undefined ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata !== undefined ? JSON.stringify(input.retryMetadata) : null,
        input.error ?? null,
        now,
        now,
        input.completedAt ?? (input.status === "succeeded" || input.status === "failed" || input.status === "canceled" || input.status === "fallback" ? now : null),
      );
    return this.getWorkflowExplorationTrace(id);
  }

  updateWorkflowExplorationTrace(input: UpdateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    this.getWorkflowExplorationTraceRow(input.id);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE workflow_exploration_traces
         SET run_status = COALESCE(?, run_status),
             observations_json = COALESCE(?, observations_json),
             events_json = COALESCE(?, events_json),
             distillation_json = COALESCE(?, distillation_json),
             latest_progress_json = COALESCE(?, latest_progress_json),
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             error_message = CASE WHEN ? THEN ? ELSE error_message END,
             completed_at = CASE WHEN ? THEN ? ELSE completed_at END,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? null,
        input.observations !== undefined ? JSON.stringify(input.observations) : null,
        input.events !== undefined ? JSON.stringify(input.events) : null,
        input.distillation !== undefined ? JSON.stringify(input.distillation) : null,
        input.latestProgress !== undefined ? JSON.stringify(input.latestProgress) : null,
        input.providerHealth !== undefined ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata !== undefined ? JSON.stringify(input.retryMetadata) : null,
        input.error !== undefined ? 1 : 0,
        input.error ?? null,
        input.completedAt !== undefined ? 1 : 0,
        input.completedAt ?? null,
        now,
        input.id,
      );
    return this.getWorkflowExplorationTrace(input.id);
  }

  listWorkflowExplorationTraces(workflowThreadId: string): WorkflowExplorationTraceSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.db
      .prepare("SELECT * FROM workflow_exploration_traces WHERE workflow_thread_id = ? ORDER BY created_at DESC, id DESC")
      .all(workflowThreadId) as WorkflowExplorationTraceRow[];
    return rows.map(mapWorkflowExplorationTraceRow);
  }

  private getWorkflowExplorationTrace(id: string): WorkflowExplorationTraceSummary {
    return mapWorkflowExplorationTraceRow(this.getWorkflowExplorationTraceRow(id));
  }

  private getWorkflowExplorationTraceRow(id: string): WorkflowExplorationTraceRow {
    const row = this.db.prepare("SELECT * FROM workflow_exploration_traces WHERE id = ?").get(id) as WorkflowExplorationTraceRow | undefined;
    if (!row) throw new Error(`Workflow exploration trace not found: ${id}`);
    return row;
  }

  private requireWorkflowAgentThread(threadId: string): void {
    const row = this.db.prepare("SELECT id FROM workflow_agent_threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
  }
}
