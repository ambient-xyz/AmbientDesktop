import { join } from "node:path";
import {
  artifactDraftAssemblies,
  artifactDraftKinds,
  artifactDraftOrigins,
  artifactDraftSchemaVersion,
  artifactDraftStates,
  defaultArtifactDraftRetention,
  defaultArtifactDraftValidationState,
  type ArtifactDraftAssembly,
  type ArtifactDraftEvent,
  type ArtifactDraftKind,
  type ArtifactDraftOrigin,
  type ArtifactDraftRetention,
  type ArtifactDraftState,
  type ArtifactDraftSummary,
  type ArtifactDraftValidationState,
} from "../../shared/artifactDrafts";

const ARTIFACT_DRAFT_KIND_VALUES = new Set<ArtifactDraftKind>(artifactDraftKinds);
const ARTIFACT_DRAFT_ASSEMBLY_VALUES = new Set<ArtifactDraftAssembly>(artifactDraftAssemblies);
const ARTIFACT_DRAFT_STATE_VALUES = new Set<ArtifactDraftState>(artifactDraftStates);
const ARTIFACT_DRAFT_ORIGIN_VALUES = new Set<ArtifactDraftOrigin>(artifactDraftOrigins);

export interface ArtifactDraftRow {
  id: string;
  workspace_path: string;
  target_path: string;
  kind: string;
  assembly: string;
  state: string;
  origin: string;
  source_run_id: string | null;
  root_path: string;
  manifest_path: string;
  content_path: string | null;
  validation_json: string;
  retention_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export interface ArtifactDraftEventRow {
  id: string;
  draft_id: string;
  seq: number;
  event_type: string;
  created_at: string;
  summary: string;
  metadata_json: string;
}

export function normalizeArtifactDraftKind(value: string): ArtifactDraftKind {
  if (ARTIFACT_DRAFT_KIND_VALUES.has(value as ArtifactDraftKind)) return value as ArtifactDraftKind;
  throw new Error(`Unsupported artifact draft kind: ${value}`);
}

export function normalizeArtifactDraftAssembly(value: string): ArtifactDraftAssembly {
  if (ARTIFACT_DRAFT_ASSEMBLY_VALUES.has(value as ArtifactDraftAssembly)) return value as ArtifactDraftAssembly;
  throw new Error(`Unsupported artifact draft assembly: ${value}`);
}

export function normalizeArtifactDraftState(value: string): ArtifactDraftState {
  if (ARTIFACT_DRAFT_STATE_VALUES.has(value as ArtifactDraftState)) return value as ArtifactDraftState;
  throw new Error(`Unsupported artifact draft state: ${value}`);
}

export function normalizeArtifactDraftOrigin(value: string): ArtifactDraftOrigin {
  if (ARTIFACT_DRAFT_ORIGIN_VALUES.has(value as ArtifactDraftOrigin)) return value as ArtifactDraftOrigin;
  throw new Error(`Unsupported artifact draft origin: ${value}`);
}

export function mapArtifactDraftRow(row: ArtifactDraftRow, eventCount: number): ArtifactDraftSummary {
  const validationState = parseJsonObject<ArtifactDraftValidationState | undefined>(row.validation_json, undefined) ??
    defaultArtifactDraftValidationState();
  const retention = parseJsonObject<ArtifactDraftRetention | undefined>(row.retention_json, undefined) ??
    defaultArtifactDraftRetention(normalizeArtifactDraftState(row.state), row.updated_at);
  return {
    schemaVersion: artifactDraftSchemaVersion,
    draftId: row.id,
    kind: normalizeArtifactDraftKind(row.kind),
    assembly: normalizeArtifactDraftAssembly(row.assembly),
    targetPath: row.target_path,
    state: normalizeArtifactDraftState(row.state),
    origin: normalizeArtifactDraftOrigin(row.origin),
    ...(row.source_run_id ? { sourceRunId: row.source_run_id } : {}),
    validationState,
    retention,
    paths: {
      rootPath: row.root_path,
      manifestPath: row.manifest_path,
      ...(row.content_path ? { contentPath: row.content_path } : {}),
      sectionsPath: join(row.root_path, "sections"),
      recordsPath: join(row.root_path, "records"),
      validationPath: join(row.root_path, "validation"),
      eventsPath: join(row.root_path, "events.jsonl"),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    eventCount,
  };
}

export function mapArtifactDraftEventRow(row: ArtifactDraftEventRow): ArtifactDraftEvent {
  return {
    id: row.id,
    draftId: row.draft_id,
    seq: row.seq,
    eventType: row.event_type,
    createdAt: row.created_at,
    summary: row.summary,
    metadata: parseJsonObject<Record<string, unknown>>(row.metadata_json, {}),
  };
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
