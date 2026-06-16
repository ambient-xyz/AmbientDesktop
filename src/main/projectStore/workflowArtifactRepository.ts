import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  CreateWorkflowArtifactInput,
  UpdateWorkflowArtifactInput,
  WorkflowArtifactSummary,
} from "../../shared/types";
import { mapWorkflowArtifactRow, type WorkflowArtifactRow } from "./workflowArtifactMappers";

export type CreateWorkflowArtifactRecordInput = CreateWorkflowArtifactInput & {
  workflowThreadId: string;
};

export class ProjectStoreWorkflowArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  createWorkflowArtifact(input: CreateWorkflowArtifactRecordInput): WorkflowArtifactSummary {
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
        input.workflowThreadId,
        input.title.trim(),
        input.status ?? "draft",
        JSON.stringify(input.manifest),
        JSON.stringify(input.spec),
        input.sourcePath,
        input.statePath,
        now,
        now,
      );
    return this.getWorkflowArtifact(id);
  }

  listWorkflowArtifacts(): WorkflowArtifactSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM workflow_artifacts ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkflowArtifactRow[];
    return rows.map(mapWorkflowArtifactRow);
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
    this.db
      .prepare(
        `UPDATE workflow_artifacts
         SET workflow_thread_id = ?, title = ?, status = ?, manifest_json = ?, spec_json = ?, source_path = ?, state_path = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.workflowThreadId ?? current.workflowThreadId ?? null,
        input.title?.trim() || current.title,
        input.status ?? current.status,
        JSON.stringify(input.manifest ?? current.manifest),
        JSON.stringify(input.spec ?? current.spec),
        input.sourcePath ?? current.sourcePath,
        input.statePath ?? current.statePath,
        new Date().toISOString(),
        input.id,
      );
    return this.getWorkflowArtifact(input.id);
  }
}
