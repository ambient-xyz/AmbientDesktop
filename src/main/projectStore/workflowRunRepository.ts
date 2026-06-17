import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { stringFromRecord } from "./projectStoreJson";
import {
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
  type WorkflowRecoveryContext,
  type WorkflowRunEvent,
  type WorkflowRunEventRow,
  type WorkflowRunProviderHealth,
  type WorkflowRunRow,
  type WorkflowRunRetryMetadata,
  type WorkflowRunScheduleEventRow,
  type WorkflowRunStatus,
  type WorkflowRunSummary,
} from "./workflowRunMappers";

export interface StartWorkflowRunRecordInput {
  artifactId: string;
  status?: WorkflowRunStatus;
  graphSnapshotId?: string;
  recoveryContext?: WorkflowRecoveryContext;
  providerHealth?: WorkflowRunProviderHealth;
  retryMetadata?: WorkflowRunRetryMetadata;
}

export interface UpdateWorkflowRunRecordInput {
  id: string;
  status: WorkflowRunStatus;
  error?: string | null;
  reportPath?: string | null;
  finish?: boolean;
  graphSnapshotId?: string | null;
  providerHealth?: WorkflowRunProviderHealth;
  retryMetadata?: WorkflowRunRetryMetadata;
  recoveryContext?: WorkflowRecoveryContext | null;
}

export interface UpdateWorkflowRunDurabilityInput {
  id: string;
  graphSnapshotId?: string | null;
  providerHealth?: WorkflowRunProviderHealth;
  retryMetadata?: WorkflowRunRetryMetadata;
  recoveryContext?: WorkflowRecoveryContext | null;
}

export interface AppendWorkflowRunEventInput {
  runId: string;
  type: string;
  message?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
}

export class ProjectStoreWorkflowRunRepository {
  constructor(private readonly db: Database.Database) {}

  startWorkflowRun(input: StartWorkflowRunRecordInput): WorkflowRunSummary {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflow_runs
        (id, artifact_id, status, started_at, updated_at, graph_snapshot_id, provider_health_json, retry_metadata_json, recovery_context_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.artifactId,
        input.status ?? "created",
        now,
        now,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
      );
    return this.getWorkflowRun(id);
  }

  updateWorkflowRun(input: UpdateWorkflowRunRecordInput): WorkflowRunSummary {
    const current = this.getWorkflowRun(input.id);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE workflow_runs
         SET status = ?, updated_at = ?, completed_at = ?, error = ?, report_path = ?,
             graph_snapshot_id = CASE WHEN ? THEN ? ELSE graph_snapshot_id END,
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             recovery_context_json = CASE WHEN ? THEN ? ELSE recovery_context_json END
         WHERE id = ?`,
      )
      .run(
        input.status,
        now,
        input.finish || ["succeeded", "failed", "canceled"].includes(input.status) ? now : (current.completedAt ?? null),
        Object.hasOwn(input, "error") ? (input.error ?? null) : (current.error ?? null),
        Object.hasOwn(input, "reportPath") ? (input.reportPath ?? null) : (current.reportPath ?? null),
        Object.hasOwn(input, "graphSnapshotId") ? 1 : 0,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        Object.hasOwn(input, "recoveryContext") ? 1 : 0,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
        input.id,
      );
    return this.getWorkflowRun(input.id);
  }

  updateWorkflowRunDurability(input: UpdateWorkflowRunDurabilityInput): WorkflowRunSummary {
    this.getWorkflowRun(input.id);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE workflow_runs
         SET updated_at = ?,
             graph_snapshot_id = CASE WHEN ? THEN ? ELSE graph_snapshot_id END,
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             recovery_context_json = CASE WHEN ? THEN ? ELSE recovery_context_json END
         WHERE id = ?`,
      )
      .run(
        now,
        Object.hasOwn(input, "graphSnapshotId") ? 1 : 0,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        Object.hasOwn(input, "recoveryContext") ? 1 : 0,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
        input.id,
      );
    return this.getWorkflowRun(input.id);
  }

  getWorkflowRun(runId: string): WorkflowRunSummary {
    const row = this.db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | undefined;
    if (!row) throw new Error(`Workflow run not found: ${runId}`);
    return this.mapWorkflowRun(row);
  }

  tryGetWorkflowRun(runId: string): WorkflowRunSummary | undefined {
    const row = this.db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | undefined;
    return row ? this.mapWorkflowRun(row) : undefined;
  }

  listWorkflowRuns(artifactId?: string, limit = 50): WorkflowRunSummary[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = artifactId
      ? (this.db
          .prepare("SELECT * FROM workflow_runs WHERE artifact_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?")
          .all(artifactId, boundedLimit) as WorkflowRunRow[])
      : (this.db
          .prepare("SELECT * FROM workflow_runs ORDER BY started_at DESC, rowid DESC LIMIT ?")
          .all(boundedLimit) as WorkflowRunRow[]);
    return rows.map((row) => this.mapWorkflowRun(row));
  }

  listWorkflowRunsForRestart(): WorkflowRunSummary[] {
    const rows = this.db.prepare("SELECT * FROM workflow_runs ORDER BY started_at ASC, id ASC").all() as WorkflowRunRow[];
    return rows.map((row) => this.mapWorkflowRun(row));
  }

  appendWorkflowRunEvent(input: AppendWorkflowRunEventInput): WorkflowRunEvent {
    const run = this.getWorkflowRun(input.runId);
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    const seqRow = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM workflow_run_events WHERE run_id = ?")
      .get(input.runId) as { next_seq: number };
    this.db
      .prepare(
        `INSERT INTO workflow_run_events
        (id, run_id, artifact_id, seq, event_type, created_at, message, graph_node_id, graph_edge_id, item_key, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        run.artifactId,
        seqRow.next_seq,
        input.type,
        now,
        input.message ?? null,
        input.graphNodeId ?? stringFromRecord(input.data, "graphNodeId") ?? null,
        input.graphEdgeId ?? stringFromRecord(input.data, "graphEdgeId") ?? null,
        input.itemKey ?? stringFromRecord(input.data, "itemKey") ?? null,
        input.data ? JSON.stringify(input.data) : null,
      );
    this.db.prepare("UPDATE workflow_runs SET updated_at = ? WHERE id = ?").run(now, input.runId);
    return mapWorkflowRunEventRow(this.db.prepare("SELECT * FROM workflow_run_events WHERE id = ?").get(id) as WorkflowRunEventRow);
  }

  listWorkflowRunEvents(runId: string): WorkflowRunEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM workflow_run_events WHERE run_id = ? ORDER BY seq ASC")
      .all(runId) as WorkflowRunEventRow[];
    return rows.map(mapWorkflowRunEventRow);
  }

  private mapWorkflowRun(row: WorkflowRunRow): WorkflowRunSummary {
    return mapWorkflowRunRow(row, { scheduledBy: this.workflowRunScheduleSummary(row.id) });
  }

  private workflowRunScheduleSummary(runId: string) {
    const row = this.db
      .prepare("SELECT event_type, data_json FROM workflow_run_events WHERE run_id = ? AND event_type IN ('workflow.schedule.started', 'workflow.schedule.skipped') ORDER BY seq ASC LIMIT 1")
      .get(runId) as WorkflowRunScheduleEventRow | undefined;
    return mapWorkflowRunScheduleSummaryRow(row);
  }
}
