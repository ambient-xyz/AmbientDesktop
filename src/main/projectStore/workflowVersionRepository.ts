import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CreateWorkflowVersionInput,
  WorkflowGraphSnapshot,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  mapWorkflowVersionRow,
  type WorkflowVersionRow,
} from "../projectStoreWorkflowMappers";

export interface ProjectStoreWorkflowVersionRepositoryDeps {
  getWorkflowArtifact(artifactId: string): unknown;
  tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined;
}

export class ProjectStoreWorkflowVersionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowVersionRepositoryDeps,
  ) {}

  listWorkflowVersions(workflowThreadId: string): WorkflowVersionSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.db
      .prepare("SELECT * FROM workflow_versions WHERE workflow_thread_id = ? ORDER BY version_number DESC, created_at DESC")
      .all(workflowThreadId) as WorkflowVersionRow[];
    return rows.map(mapWorkflowVersionRow);
  }

  getWorkflowVersion(versionId: string): WorkflowVersionSummary {
    const row = this.db.prepare("SELECT * FROM workflow_versions WHERE id = ?").get(versionId) as WorkflowVersionRow | undefined;
    if (!row) throw new Error(`Workflow version not found: ${versionId}`);
    return mapWorkflowVersionRow(row);
  }

  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined {
    this.requireWorkflowAgentThread(workflowThreadId);
    const row = this.db
      .prepare(
        `SELECT * FROM workflow_versions
         WHERE workflow_thread_id = ? AND version_status = 'approved'
         ORDER BY version_number DESC, created_at DESC LIMIT 1`,
      )
      .get(workflowThreadId) as WorkflowVersionRow | undefined;
    return row ? mapWorkflowVersionRow(row) : undefined;
  }

  createWorkflowVersion(input: CreateWorkflowVersionInput): WorkflowVersionSummary {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    this.deps.getWorkflowArtifact(input.artifactId);
    if (input.graphSnapshotId && !this.deps.tryGetWorkflowGraphSnapshot(input.graphSnapshotId)) {
      throw new Error(`Workflow graph snapshot not found: ${input.graphSnapshotId}`);
    }
    const row = this.db
      .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM workflow_versions WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_version: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflow_versions
          (id, workflow_thread_id, artifact_id, version_number, graph_snapshot_id, source_path, repo_path, git_commit_hash, version_status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.artifactId,
        row.next_version,
        input.graphSnapshotId ?? null,
        input.sourcePath,
        input.repoPath,
        input.gitCommitHash ?? null,
        input.status,
        input.createdBy,
        now,
      );
    this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, input.workflowThreadId);
    return this.getWorkflowVersion(id);
  }

  updateWorkflowVersionStatusForArtifact(artifactId: string, status: WorkflowVersionStatus): WorkflowVersionSummary | undefined {
    this.deps.getWorkflowArtifact(artifactId);
    const row = this.db
      .prepare("SELECT * FROM workflow_versions WHERE artifact_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(artifactId) as WorkflowVersionRow | undefined;
    if (!row) return undefined;
    this.db.prepare("UPDATE workflow_versions SET version_status = ? WHERE id = ?").run(status, row.id);
    return this.getWorkflowVersion(row.id);
  }

  latestWorkflowVersionForThread(workflowThreadId: string): WorkflowVersionSummary | undefined {
    const row = this.db
      .prepare("SELECT * FROM workflow_versions WHERE workflow_thread_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(workflowThreadId) as WorkflowVersionRow | undefined;
    return row ? mapWorkflowVersionRow(row) : undefined;
  }

  workflowVersionForGraphSnapshot(graphSnapshotId: string | undefined): WorkflowVersionSummary | undefined {
    if (!graphSnapshotId) return undefined;
    const row = this.db
      .prepare("SELECT * FROM workflow_versions WHERE graph_snapshot_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(graphSnapshotId) as WorkflowVersionRow | undefined;
    return row ? mapWorkflowVersionRow(row) : undefined;
  }

  private requireWorkflowAgentThread(threadId: string): void {
    const row = this.db.prepare("SELECT id FROM workflow_agent_threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
  }
}
