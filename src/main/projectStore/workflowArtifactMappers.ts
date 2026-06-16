import type {
  WorkflowArtifactStatus,
  WorkflowArtifactSummary,
  WorkflowManifest,
  WorkflowSpec,
} from "../../shared/types";
import { parseJsonObject } from "../projectStoreJson";

export interface WorkflowArtifactRow {
  id: string;
  workflow_thread_id: string | null;
  title: string;
  status: WorkflowArtifactStatus;
  manifest_json: string;
  spec_json: string;
  source_path: string;
  state_path: string;
  created_at: string;
  updated_at: string;
}

export function mapWorkflowArtifactRow(row: WorkflowArtifactRow): WorkflowArtifactSummary {
  return {
    id: row.id,
    workflowThreadId: row.workflow_thread_id ?? undefined,
    title: row.title,
    status: row.status,
    manifest: parseJsonObject<WorkflowManifest>(row.manifest_json, { tools: [], mutationPolicy: "read_only" }),
    spec: parseJsonObject<WorkflowSpec>(row.spec_json, { goal: "" }),
    sourcePath: row.source_path,
    statePath: row.state_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
