import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { CreateWorkflowGraphSnapshotInput, WorkflowGraphSnapshot } from "../../shared/workflowTypes";
import {
  mapWorkflowGraphSnapshotRow,
  type WorkflowGraphSnapshotRow,
} from "./projectStoreWorkflowMappers";

export class ProjectStoreWorkflowGraphSnapshotRepository {
  constructor(private readonly db: Database.Database) {}

  listWorkflowGraphSnapshots(workflowThreadId: string): WorkflowGraphSnapshot[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.db
      .prepare("SELECT * FROM workflow_graph_snapshots WHERE workflow_thread_id = ? ORDER BY snapshot_version DESC")
      .all(workflowThreadId) as WorkflowGraphSnapshotRow[];
    return rows.map(mapWorkflowGraphSnapshotRow);
  }

  createWorkflowGraphSnapshot(input: CreateWorkflowGraphSnapshotInput): WorkflowGraphSnapshot {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const row = this.db
      .prepare("SELECT COALESCE(MAX(snapshot_version), 0) + 1 AS next_version FROM workflow_graph_snapshots WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_version: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    const graphJson = JSON.stringify({ nodes: input.nodes, edges: input.edges });
    this.db
      .prepare(
        `INSERT INTO workflow_graph_snapshots
          (id, workflow_thread_id, snapshot_version, snapshot_source, summary, graph_json, artifact_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.workflowThreadId, row.next_version, input.source, input.summary, graphJson, input.artifactPath ?? null, now);
    if (input.activate !== false) {
      this.db
        .prepare("UPDATE workflow_agent_threads SET active_graph_snapshot_id = ?, updated_at = ? WHERE id = ?")
        .run(id, now, input.workflowThreadId);
    } else {
      this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, input.workflowThreadId);
    }
    return this.getWorkflowGraphSnapshot(id);
  }

  tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined {
    const row = this.db.prepare("SELECT * FROM workflow_graph_snapshots WHERE id = ?").get(snapshotId) as
      | WorkflowGraphSnapshotRow
      | undefined;
    return row ? mapWorkflowGraphSnapshotRow(row) : undefined;
  }

  private getWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot {
    const snapshot = this.tryGetWorkflowGraphSnapshot(snapshotId);
    if (!snapshot) throw new Error(`Workflow graph snapshot not found: ${snapshotId}`);
    return snapshot;
  }

  private requireWorkflowAgentThread(threadId: string): void {
    const row = this.db.prepare("SELECT id FROM workflow_agent_threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
  }
}
