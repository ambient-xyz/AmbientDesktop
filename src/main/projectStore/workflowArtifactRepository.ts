import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  CreateWorkflowAgentThreadInput,
  CreateWorkflowArtifactInput,
  UpdateWorkflowArtifactInput,
  WorkflowAgentThreadPhase,
  WorkflowArtifactSummary,
} from "../../shared/types";
import { mapWorkflowArtifactRow, type WorkflowArtifactRow } from "./workflowArtifactMappers";
import { workflowAgentPhaseForArtifactStatus } from "./projectStoreWorkflowMappers";

export interface ProjectStoreWorkflowArtifactRepositoryDeps {
  createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): { id: string };
}

export class ProjectStoreWorkflowArtifactRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowArtifactRepositoryDeps,
  ) {}

  createWorkflowArtifact(input: CreateWorkflowArtifactInput): WorkflowArtifactSummary {
    const workflowThreadId = input.workflowThreadId ?? this.deps.createWorkflowAgentThreadRecord({
      title: input.title,
      initialRequest: input.spec.goal,
      phase: workflowAgentPhaseForArtifactStatus(input.status ?? "draft"),
    }).id;
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO workflow_artifacts
        (id, workflow_thread_id, title, status, manifest_json, spec_json, source_path, state_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workflowThreadId,
        input.title.trim(),
        input.status ?? "draft",
        JSON.stringify(input.manifest),
        JSON.stringify(input.spec),
        input.sourcePath,
        input.statePath,
        now,
        now,
      );
    const artifact = this.getWorkflowArtifact(id);
    if (input.activate !== false) {
      this.updateWorkflowAgentThreadActiveArtifact(workflowThreadId, artifact.id, workflowAgentPhaseForArtifactStatus(artifact.status), artifact.updatedAt);
    } else {
      this.touchWorkflowAgentThread(workflowThreadId, artifact.updatedAt);
    }
    return artifact;
  }

  listWorkflowArtifacts(): WorkflowArtifactSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM workflow_artifacts ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkflowArtifactRow[];
    return rows.map(mapWorkflowArtifactRow);
  }

  ensureWorkflowAgentThreadLinks(): void {
    const now = new Date().toISOString();
    const artifacts = this.listWorkflowArtifacts();
    for (const artifact of artifacts) {
      if (artifact.workflowThreadId && this.workflowAgentThreadExists(artifact.workflowThreadId)) continue;
      const thread = this.deps.createWorkflowAgentThreadRecord({
        title: artifact.title,
        initialRequest: artifact.spec.goal || artifact.spec.summary || artifact.title,
        phase: workflowAgentPhaseForArtifactStatus(artifact.status),
      });
      this.db
        .prepare("UPDATE workflow_artifacts SET workflow_thread_id = ?, updated_at = ? WHERE id = ?")
        .run(thread.id, now, artifact.id);
      this.updateWorkflowAgentThreadActiveArtifact(thread.id, artifact.id, workflowAgentPhaseForArtifactStatus(artifact.status), now);
    }
  }

  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary {
    const artifact = this.tryGetWorkflowArtifact(artifactId);
    if (!artifact) throw new Error(`Workflow artifact not found: ${artifactId}`);
    return artifact;
  }

  tryGetWorkflowArtifact(artifactId: string): WorkflowArtifactSummary | undefined {
    const row = this.db.prepare("SELECT * FROM workflow_artifacts WHERE id = ?").get(artifactId) as WorkflowArtifactRow | undefined;
    return row ? mapWorkflowArtifactRow(row) : undefined;
  }

  updateWorkflowArtifact(input: UpdateWorkflowArtifactInput): WorkflowArtifactSummary {
    const current = this.getWorkflowArtifact(input.id);
    const threadId = input.workflowThreadId ?? current.workflowThreadId;
    this.db
      .prepare(
        `UPDATE workflow_artifacts
         SET workflow_thread_id = ?, title = ?, status = ?, manifest_json = ?, spec_json = ?, source_path = ?, state_path = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        threadId ?? null,
        input.title?.trim() || current.title,
        input.status ?? current.status,
        JSON.stringify(input.manifest ?? current.manifest),
        JSON.stringify(input.spec ?? current.spec),
        input.sourcePath ?? current.sourcePath,
        input.statePath ?? current.statePath,
        new Date().toISOString(),
        input.id,
      );
    const artifact = this.getWorkflowArtifact(input.id);
    if (threadId) {
      this.updateWorkflowAgentThreadActiveArtifact(threadId, artifact.id, workflowAgentPhaseForArtifactStatus(artifact.status), artifact.updatedAt);
    }
    return artifact;
  }

  private updateWorkflowAgentThreadActiveArtifact(
    threadId: string,
    artifactId: string,
    phase: WorkflowAgentThreadPhase,
    updatedAt: string,
  ): void {
    this.db
      .prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
      .run(artifactId, phase, updatedAt, threadId);
  }

  private touchWorkflowAgentThread(threadId: string, updatedAt: string): void {
    this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(updatedAt, threadId);
  }

  private workflowAgentThreadExists(threadId: string): boolean {
    return Boolean(this.db.prepare("SELECT id FROM workflow_agent_threads WHERE id = ?").get(threadId));
  }
}
