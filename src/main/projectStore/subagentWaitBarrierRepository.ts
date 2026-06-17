import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
} from "../../shared/subagentProtocol";
import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import {
  mapSubagentWaitBarrierRow,
  resolveSubagentWaitBarrierQuorumThreshold,
  type SubagentWaitBarrierRow,
} from "../projectStoreSubagentMappers";
import { SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION } from "../subagents/subagentWaitBarrierResolution";

export interface SubagentWaitBarrierChildRun {
  id: string;
  parentThreadId: string;
  parentRunId: string;
}

export interface CreateSubagentWaitBarrierInput {
  parentThreadId: string;
  parentRunId: string;
  childRunIds: readonly string[];
  dependencyMode: SubagentWaitBarrierMode;
  failurePolicy: SubagentWaitBarrierFailurePolicy;
  quorumThreshold?: number;
  timeoutMs?: number;
  createdAt?: string;
}

export interface UpdateSubagentWaitBarrierStatusOptions {
  resolutionArtifact?: unknown;
  now?: string;
}

export class ProjectStoreSubagentWaitBarrierRepository {
  constructor(private readonly db: Database.Database) {}

  createSubagentWaitBarrier(input: CreateSubagentWaitBarrierInput): SubagentWaitBarrierSummary {
    const childRunIds = uniqueChildRunIds(input.childRunIds);
    if (childRunIds.length === 0) throw new Error("Sub-agent wait barrier requires at least one child run.");
    const quorumThreshold = resolveSubagentWaitBarrierQuorumThreshold({
      dependencyMode: input.dependencyMode,
      childCount: childRunIds.length,
      quorumThreshold: input.quorumThreshold,
    });
    const childRuns = childRunIds.map((childRunId) => this.getWaitBarrierChildRun(childRunId));
    for (const child of childRuns) {
      if (child.parentThreadId !== input.parentThreadId) {
        throw new Error(`Sub-agent wait barrier child ${child.id} does not belong to parent thread ${input.parentThreadId}.`);
      }
      if (child.parentRunId !== input.parentRunId) {
        throw new Error(`Sub-agent wait barrier child ${child.id} does not belong to parent run ${input.parentRunId}.`);
      }
    }
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO subagent_wait_barriers
         (id, parent_thread_id, parent_run_id, child_run_ids_json, dependency_mode, status, failure_policy,
          quorum_threshold, timeout_ms, created_at, updated_at, resolved_at, resolution_artifact_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.parentThreadId,
        input.parentRunId,
        JSON.stringify(childRunIds),
        input.dependencyMode,
        "waiting_on_children",
        input.failurePolicy,
        quorumThreshold,
        input.timeoutMs ?? null,
        now,
        now,
        null,
        null,
      );
    return this.getSubagentWaitBarrier(id);
  }

  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary {
    const row = this.db.prepare("SELECT * FROM subagent_wait_barriers WHERE id = ?").get(id) as SubagentWaitBarrierRow | undefined;
    if (!row) throw new Error(`Sub-agent wait barrier not found: ${id}`);
    return mapSubagentWaitBarrierRow(row);
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_wait_barriers WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentWaitBarrierRow[];
    return rows.map(mapSubagentWaitBarrierRow);
  }

  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_wait_barriers ORDER BY created_at ASC, id ASC")
      .all() as SubagentWaitBarrierRow[];
    return rows.map(mapSubagentWaitBarrierRow);
  }

  findUnresolvedRequiredSubagentRunBlocker<T extends SubagentWaitBarrierChildRun>(input: {
    parentThreadId: string;
    parentRunId: string;
    matchingRuns: readonly T[];
  }): { run: T; barrier: SubagentWaitBarrierSummary } | undefined {
    if (input.matchingRuns.length === 0) return undefined;
    const matchingRunIds = new Set(input.matchingRuns.map((run) => run.id));
    const rows = this.db
      .prepare(
        `SELECT * FROM subagent_wait_barriers
         WHERE parent_thread_id = ?
           AND parent_run_id = ?
           AND status = 'waiting_on_children'
           AND dependency_mode IN ('required_all', 'required_any', 'quorum')
         ORDER BY created_at ASC, id ASC`,
      )
      .all(input.parentThreadId, input.parentRunId) as SubagentWaitBarrierRow[];
    for (const row of rows) {
      const barrier = mapSubagentWaitBarrierRow(row);
      const blockedRun = input.matchingRuns.find((run) => matchingRunIds.has(run.id) && barrier.childRunIds.includes(run.id));
      if (blockedRun) return { run: blockedRun, barrier };
    }
    return undefined;
  }

  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierStatus,
    options: UpdateSubagentWaitBarrierStatusOptions = {},
  ): SubagentWaitBarrierSummary {
    const current = this.getSubagentWaitBarrier(id);
    const now = options.now ?? new Date().toISOString();
    const resolutionArtifact = options.resolutionArtifact === undefined
      ? current.resolutionArtifact
      : options.resolutionArtifact;
    assertSubagentWaitBarrierTerminalTransition({
      id,
      status,
      resolutionArtifact,
    });
    const resolvedAt = status === "waiting_on_children" ? null : (current.resolvedAt ?? now);
    this.db
      .prepare(
        `UPDATE subagent_wait_barriers
         SET status = ?, updated_at = ?, resolved_at = ?, resolution_artifact_json = ?
         WHERE id = ?`,
      )
      .run(
        status,
        now,
        resolvedAt,
        resolutionArtifact === undefined ? null : JSON.stringify(resolutionArtifact),
        id,
      );
    return this.getSubagentWaitBarrier(id);
  }

  private getWaitBarrierChildRun(childRunId: string): SubagentWaitBarrierChildRun {
    const row = this.db
      .prepare("SELECT id, parent_thread_id AS parentThreadId, parent_run_id AS parentRunId FROM subagent_runs WHERE id = ?")
      .get(childRunId) as SubagentWaitBarrierChildRun | undefined;
    if (!row) throw new Error(`Sub-agent run not found: ${childRunId}`);
    return row;
  }
}

function uniqueChildRunIds(childRunIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const childRunId of childRunIds) {
    if (!childRunId || seen.has(childRunId)) continue;
    seen.add(childRunId);
    unique.push(childRunId);
  }
  return unique;
}

const terminalBarrierEvidenceKindsByStatus: Record<
  Exclude<SubagentWaitBarrierStatus, "waiting_on_children">,
  Set<string>
> = {
  satisfied: new Set(["child_terminal", "explicit_partial"]),
  failed: new Set(["child_terminal", "child_detached", "explicit_failure", "failed_spawn"]),
  timed_out: new Set(["child_runtime_timeout"]),
  cancelled: new Set(["child_cancelled", "parent_stopped"]),
};

function assertSubagentWaitBarrierTerminalTransition(input: {
  id: string;
  status: SubagentWaitBarrierStatus;
  resolutionArtifact: unknown;
}): void {
  if (input.status === "waiting_on_children") return;
  const artifact = recordFromUnknown(input.resolutionArtifact);
  if (!artifact) {
    throw new Error(`Terminal sub-agent wait barrier ${input.id} requires a resolution artifact.`);
  }
  const transitionEvidence = recordFromUnknown(artifact.transitionEvidence);
  if (!transitionEvidence) {
    throw new Error(`Terminal sub-agent wait barrier ${input.id} requires durable transitionEvidence.`);
  }
  if (transitionEvidence.schemaVersion !== SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`Terminal sub-agent wait barrier ${input.id} has invalid transitionEvidence schema.`);
  }
  const kind = typeof transitionEvidence.kind === "string" ? transitionEvidence.kind : "";
  if (kind === "progress_return") {
    throw new Error(`Terminal sub-agent wait barrier ${input.id} cannot use progress_return as terminal evidence.`);
  }
  const allowedKinds = terminalBarrierEvidenceKindsByStatus[input.status];
  if (!allowedKinds.has(kind)) {
    throw new Error(
      `Terminal sub-agent wait barrier ${input.id} status ${input.status} cannot use transition evidence kind ${kind || "(missing)"}.`,
    );
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
