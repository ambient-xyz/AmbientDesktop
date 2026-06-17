import type Database from "better-sqlite3";
import type { AmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentEffectiveRoleSnapshot } from "../../shared/subagentPatternGraph";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentDependencyMode, type SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunEventSummary, SubagentRunSummary, SubagentSpawnEdgeSummary } from "../../shared/subagentTypes";
import type { MutationWorkspaceLease, SymphonyChildLaunchContractBundle } from "../../shared/symphonyFineGrainedContracts";
import type { SubagentRoleProfile } from "../../shared/subagentRoles";
import { assertSubagentRunEventAttribution } from "../subagentInvariants";
import {
  mapSubagentRunEventRow,
  mapSubagentRunRow,
  mapSubagentSpawnEdgeRow,
  type SubagentRunEventRow,
  type SubagentRunRow,
  type SubagentSpawnEdgeRow,
} from "../projectStoreSubagentMappers";

export interface CreateReservedSubagentRunInput {
  runId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  childThreadId: string;
  canonicalTaskPath: string;
  roleId: string;
  roleProfileSnapshot: SubagentRoleProfile;
  effectiveRoleSnapshot?: SubagentEffectiveRoleSnapshot;
  dependencyMode?: SubagentDependencyMode;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  modelRuntimeSnapshot: AmbientModelRuntimeSnapshot;
  capacityLeaseSnapshot: SubagentCapacityLeaseSnapshot;
  symphonyLaunchContracts?: SymphonyChildLaunchContractBundle;
  symphonyMutationWorkspaceLease?: MutationWorkspaceLease;
  createdAt: string;
}

export interface UpdateSubagentRunStatusInput {
  runId: string;
  status: SubagentRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  resultArtifact?: unknown;
  updatedAt: string;
}

export interface CloseSubagentRunInput {
  runId: string;
  closedAt: string;
  capacityLeaseSnapshot: SubagentCapacityLeaseSnapshot;
}

export interface AppendSubagentRunEventInput {
  type: string;
  preview?: unknown;
  artifactPath?: string;
  createdAt?: string;
}

export class ProjectStoreSubagentRunRepository {
  constructor(private readonly db: Database.Database) {}

  createReservedSubagentRun(input: CreateReservedSubagentRunInput): SubagentRunSummary {
    this.db
      .prepare(
        `INSERT INTO subagent_runs
        (id, protocol_version, parent_thread_id, parent_run_id, parent_message_id, child_thread_id,
         canonical_task_path, role_id, role_profile_snapshot_json, effective_role_snapshot_json, dependency_mode, status, feature_flag_snapshot_json,
         model_runtime_snapshot_json, capacity_lease_snapshot_json, symphony_launch_contract_json, symphony_mutation_lease_json, result_artifact_json, created_at, updated_at,
         started_at, completed_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)`,
      )
      .run(
        input.runId,
        AMBIENT_SUBAGENT_PROTOCOL_VERSION,
        input.parentThreadId,
        input.parentRunId,
        input.parentMessageId ?? null,
        input.childThreadId,
        input.canonicalTaskPath,
        input.roleId,
        JSON.stringify(input.roleProfileSnapshot),
        input.effectiveRoleSnapshot ? JSON.stringify(input.effectiveRoleSnapshot) : null,
        input.dependencyMode ?? "optional_background",
        "reserved",
        JSON.stringify(input.featureFlagSnapshot),
        JSON.stringify(input.modelRuntimeSnapshot),
        JSON.stringify(input.capacityLeaseSnapshot),
        input.symphonyLaunchContracts ? JSON.stringify(input.symphonyLaunchContracts) : null,
        input.symphonyMutationWorkspaceLease ? JSON.stringify(input.symphonyMutationWorkspaceLease) : null,
        input.createdAt,
        input.createdAt,
      );
    this.db
      .prepare(
        `INSERT INTO subagent_spawn_edges
        (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
      )
      .run(
        input.parentRunId,
        input.runId,
        input.parentThreadId,
        input.childThreadId,
        input.canonicalTaskPath,
        "reserved",
        input.createdAt,
        input.createdAt,
      );
    return this.getSubagentRun(input.runId);
  }

  updateSubagentRunStatus(input: UpdateSubagentRunStatusInput): SubagentRunSummary {
    const current = this.getSubagentRun(input.runId);
    const resultArtifact = Object.hasOwn(input, "resultArtifact")
      ? input.resultArtifact
      : (current.resultArtifact ?? null);
    this.db
      .prepare(
        `UPDATE subagent_runs
         SET status = ?, updated_at = ?, started_at = ?, completed_at = ?, result_artifact_json = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.updatedAt,
        input.startedAt,
        input.completedAt,
        JSON.stringify(resultArtifact),
        input.runId,
      );
    this.db
      .prepare("UPDATE subagent_spawn_edges SET status = ?, updated_at = ? WHERE child_run_id = ?")
      .run(input.status, input.updatedAt, input.runId);
    return this.getSubagentRun(input.runId);
  }

  closeSubagentRun(input: CloseSubagentRunInput): SubagentRunSummary {
    this.db
      .prepare("UPDATE subagent_runs SET closed_at = ?, updated_at = ?, capacity_lease_snapshot_json = ? WHERE id = ?")
      .run(input.closedAt, input.closedAt, JSON.stringify(input.capacityLeaseSnapshot), input.runId);
    this.db
      .prepare("UPDATE subagent_spawn_edges SET capacity_released_at = ?, updated_at = ? WHERE child_run_id = ?")
      .run(input.closedAt, input.closedAt, input.runId);
    return this.getSubagentRun(input.runId);
  }

  insertSubagentSpawnEdge(edge: SubagentSpawnEdgeSummary): void {
    this.db
      .prepare(
        `INSERT INTO subagent_spawn_edges
         (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        edge.parentRunId,
        edge.childRunId,
        edge.parentThreadId,
        edge.childThreadId,
        edge.canonicalTaskPath,
        edge.depth,
        edge.status,
        edge.capacityReleasedAt ?? null,
        edge.createdAt,
        edge.updatedAt,
      );
  }

  replaceSubagentSpawnEdge(edge: SubagentSpawnEdgeSummary): void {
    this.deleteSubagentSpawnEdgesForChild(edge.childRunId);
    this.insertSubagentSpawnEdge(edge);
  }

  deleteSubagentSpawnEdgesForChild(childRunId: string): void {
    this.db.prepare("DELETE FROM subagent_spawn_edges WHERE child_run_id = ?").run(childRunId);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const row = this.db.prepare("SELECT * FROM subagent_runs WHERE id = ?").get(runId) as SubagentRunRow | undefined;
    if (!row) throw new Error(`Sub-agent run not found: ${runId}`);
    return mapSubagentRunRow(row);
  }

  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_runs WHERE parent_thread_id = ? ORDER BY created_at ASC")
      .all(parentThreadId) as SubagentRunRow[];
    return rows.map(mapSubagentRunRow);
  }

  listSubagentRunsForCanonicalTask(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): SubagentRunSummary[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM subagent_runs
         WHERE parent_thread_id = ? AND parent_run_id = ? AND canonical_task_path = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(input.parentThreadId, input.parentRunId, input.canonicalTaskPath) as SubagentRunRow[];
    return rows.map(mapSubagentRunRow);
  }

  listAllSubagentRuns(): SubagentRunSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_runs ORDER BY created_at ASC")
      .all() as SubagentRunRow[];
    return rows.map(mapSubagentRunRow);
  }

  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_spawn_edges ORDER BY created_at ASC, parent_run_id ASC, child_run_id ASC")
      .all() as SubagentSpawnEdgeRow[];
    return rows.map(mapSubagentSpawnEdgeRow);
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_run_events WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentRunEventRow[];
    return rows.map(mapSubagentRunEventRow);
  }

  appendSubagentRunEvent(runId: string, input: AppendSubagentRunEventInput): SubagentRunEventSummary {
    assertSubagentRunEventAttribution({
      runId,
      eventType: input.type,
      preview: input.preview,
    });
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM subagent_run_events WHERE run_id = ?")
      .get(runId) as { next_sequence?: number } | undefined;
    const sequence = row?.next_sequence ?? 1;
    this.db
      .prepare(
        `INSERT INTO subagent_run_events (run_id, sequence, type, preview_json, artifact_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        sequence,
        input.type,
        input.preview === undefined ? null : JSON.stringify(input.preview),
        input.artifactPath ?? null,
        input.createdAt ?? new Date().toISOString(),
      );
    const event = this.db
      .prepare("SELECT * FROM subagent_run_events WHERE run_id = ? AND sequence = ?")
      .get(runId, sequence) as SubagentRunEventRow | undefined;
    if (!event) throw new Error(`Sub-agent run event not found: ${runId}#${sequence}`);
    return mapSubagentRunEventRow(event);
  }

  parentMessageIdForSubagentRun(runId: string): string | undefined {
    const row = this.db
      .prepare("SELECT parent_message_id FROM subagent_runs WHERE id = ?")
      .get(runId) as { parent_message_id?: string | null } | undefined;
    return row?.parent_message_id ?? undefined;
  }
}
