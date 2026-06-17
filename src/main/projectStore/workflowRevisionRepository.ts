import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CreateWorkflowRevisionInput,
  ResolveWorkflowRevisionInput,
  UpdateWorkflowRevisionInput,
  WorkflowArtifactSummary,
  WorkflowAgentThreadPhase,
  WorkflowRevisionSummary,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  mapWorkflowRevisionRow,
  workflowAgentPhaseForArtifactStatus,
  type WorkflowAgentThreadRow,
  type WorkflowRevisionRow,
} from "../projectStoreWorkflowMappers";

export interface ProjectStoreWorkflowRevisionRepositoryDeps {
  getWorkflowVersion(versionId: string): WorkflowVersionSummary;
  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary;
  requireWorkflowGraphSnapshotForThread(snapshotId: string | undefined, workflowThreadId: string): unknown;
  workflowVersionForGraphSnapshot(graphSnapshotId: string | undefined): WorkflowVersionSummary | undefined;
}

export class ProjectStoreWorkflowRevisionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowRevisionRepositoryDeps,
  ) {}

  listWorkflowRevisions(workflowThreadId: string): WorkflowRevisionSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.db
      .prepare("SELECT * FROM workflow_revisions WHERE workflow_thread_id = ? ORDER BY updated_at DESC, created_at DESC, rowid DESC")
      .all(workflowThreadId) as WorkflowRevisionRow[];
    return rows.map((row) => this.mapWorkflowRevision(row));
  }

  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary {
    const row = this.getWorkflowRevisionRow(revisionId);
    return this.mapWorkflowRevision(row);
  }

  createWorkflowRevision(input: CreateWorkflowRevisionInput): WorkflowRevisionSummary {
    const requestedChange = input.requestedChange.trim();
    if (!requestedChange) throw new Error("Workflow revision requested change is required.");
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const baseVersion = input.baseVersionId ? this.deps.getWorkflowVersion(input.baseVersionId) : undefined;
    if (baseVersion && baseVersion.workflowThreadId !== input.workflowThreadId) {
      throw new Error(`Workflow version ${baseVersion.id} does not belong to workflow thread ${input.workflowThreadId}.`);
    }
    const baseArtifact = input.baseArtifactId ? this.deps.getWorkflowArtifact(input.baseArtifactId) : undefined;
    if (baseArtifact?.workflowThreadId && baseArtifact.workflowThreadId !== input.workflowThreadId) {
      throw new Error(`Workflow artifact ${baseArtifact.id} does not belong to workflow thread ${input.workflowThreadId}.`);
    }
    this.deps.requireWorkflowGraphSnapshotForThread(input.proposedGraphSnapshotId, input.workflowThreadId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = input.status ?? "draft";
    this.db
      .prepare(
        `INSERT INTO workflow_revisions
          (id, workflow_thread_id, base_version_id, base_artifact_id, requested_change, proposed_graph_snapshot_id, graph_diff_json, source_diff, revision_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        baseVersion?.id ?? null,
        baseArtifact?.id ?? null,
        requestedChange,
        input.proposedGraphSnapshotId ?? null,
        input.graphDiff === undefined ? null : JSON.stringify(input.graphDiff),
        input.sourceDiff ?? null,
        status,
        now,
        now,
      );
    this.updateWorkflowAgentThreadPhaseRow(input.workflowThreadId, status === "applied" ? "planned" : "revision", now);
    return this.getWorkflowRevision(id);
  }

  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): WorkflowRevisionSummary {
    const current = this.getWorkflowRevision(input.id);
    const requestedChange = input.requestedChange === undefined ? current.requestedChange : input.requestedChange.trim();
    if (!requestedChange) throw new Error("Workflow revision requested change is required.");
    this.deps.requireWorkflowGraphSnapshotForThread(input.proposedGraphSnapshotId === null ? undefined : input.proposedGraphSnapshotId, current.workflowThreadId);
    const now = new Date().toISOString();
    const status = input.status ?? current.status;
    this.db
      .prepare(
        `UPDATE workflow_revisions
         SET requested_change = ?,
             proposed_graph_snapshot_id = ?,
             graph_diff_json = ?,
             source_diff = ?,
             revision_status = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        requestedChange,
        input.proposedGraphSnapshotId === undefined ? (current.proposedGraphSnapshotId ?? null) : input.proposedGraphSnapshotId,
        input.graphDiff === undefined ? (current.graphDiff === undefined ? null : JSON.stringify(current.graphDiff)) : JSON.stringify(input.graphDiff),
        input.sourceDiff === undefined ? (current.sourceDiff ?? null) : input.sourceDiff,
        status,
        now,
        input.id,
      );
    this.updateWorkflowAgentThreadPhaseRow(current.workflowThreadId, status === "applied" ? "planned" : "revision", now);
    return this.getWorkflowRevision(input.id);
  }

  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): WorkflowRevisionSummary {
    const current = this.getWorkflowRevision(input.id);
    if (current.status === input.decision) return current;
    if (current.status === "applied" || current.status === "rejected") {
      throw new Error(`Workflow revision is already ${current.status}.`);
    }

    const thread = this.requireWorkflowAgentThread(current.workflowThreadId);
    let activeArtifactId: string | null | undefined;
    let activeGraphSnapshotId: string | null | undefined;
    let phase: WorkflowAgentThreadPhase = "planned";

    if (input.decision === "applied") {
      const proposedVersion = this.deps.workflowVersionForGraphSnapshot(current.proposedGraphSnapshotId);
      if (!proposedVersion || proposedVersion.workflowThreadId !== current.workflowThreadId) {
        throw new Error("Cannot apply workflow revision without a proposed workflow version.");
      }
      const proposedArtifact = this.deps.getWorkflowArtifact(proposedVersion.artifactId);
      activeArtifactId = proposedArtifact.id;
      activeGraphSnapshotId = proposedVersion.graphSnapshotId ?? current.proposedGraphSnapshotId ?? null;
      phase = workflowAgentPhaseForArtifactStatus(proposedArtifact.status);
    } else {
      const baseVersion = current.baseVersionId ? this.deps.getWorkflowVersion(current.baseVersionId) : undefined;
      const baseArtifactId = baseVersion?.artifactId ?? current.baseArtifactId;
      const baseArtifact = baseArtifactId ? this.deps.getWorkflowArtifact(baseArtifactId) : undefined;
      activeArtifactId = baseArtifact?.id;
      activeGraphSnapshotId = baseVersion?.graphSnapshotId ?? null;
      phase = baseArtifact ? workflowAgentPhaseForArtifactStatus(baseArtifact.status) : "planned";
    }

    const now = new Date().toISOString();
    const nextActiveArtifactId = activeArtifactId === undefined ? thread.active_artifact_id : activeArtifactId;
    const nextActiveGraphSnapshotId = activeGraphSnapshotId === undefined ? thread.active_graph_snapshot_id : activeGraphSnapshotId;
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE workflow_revisions SET revision_status = ?, updated_at = ? WHERE id = ?").run(input.decision, now, current.id);
      this.db.prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, active_graph_snapshot_id = ?, phase = ?, updated_at = ? WHERE id = ?").run(
        nextActiveArtifactId,
        nextActiveGraphSnapshotId,
        phase,
        now,
        current.workflowThreadId,
      );
    });
    transaction();
    return this.getWorkflowRevision(current.id);
  }

  private getWorkflowRevisionRow(revisionId: string): WorkflowRevisionRow {
    const row = this.db.prepare("SELECT * FROM workflow_revisions WHERE id = ?").get(revisionId) as WorkflowRevisionRow | undefined;
    if (!row) throw new Error(`Workflow revision not found: ${revisionId}`);
    return row;
  }

  private mapWorkflowRevision(row: WorkflowRevisionRow): WorkflowRevisionSummary {
    const proposedVersion = this.deps.workflowVersionForGraphSnapshot(row.proposed_graph_snapshot_id ?? undefined);
    return mapWorkflowRevisionRow(row, { proposedVersion });
  }

  private requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    const row = this.db.prepare("SELECT * FROM workflow_agent_threads WHERE id = ?").get(threadId) as WorkflowAgentThreadRow | undefined;
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
    return row;
  }

  private updateWorkflowAgentThreadPhaseRow(threadId: string, phase: WorkflowAgentThreadPhase, updatedAt: string): void {
    this.db.prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?").run(phase, updatedAt, threadId);
  }
}
