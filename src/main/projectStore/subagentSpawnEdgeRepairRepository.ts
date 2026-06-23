import type Database from "better-sqlite3";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  SubagentPersistedChildTreeRepairAction,
  SubagentPersistedChildTreeRepairResult,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import { subagentSpawnEdgeRecordForRun } from "./projectStoreSubagentMappers";
import { analyzeSubagentRestartState, uniqueSubagentRepairIds } from "./projectStoreSubagentsFacade";
import type { AppendSubagentRunEventInput } from "./subagentRunRepository";

export type RepairSubagentSpawnEdgesOptions =
  | { now?: string; dryRun: true }
  | { now?: string; dryRun?: false; featureFlagSnapshot: AmbientFeatureFlagSnapshot };

export interface ProjectStoreSubagentSpawnEdgeRepairRepositoryDeps {
  appendSubagentRunEventInternal(runId: string, input: AppendSubagentRunEventInput): void;
  deleteSubagentSpawnEdgesForChild(childRunId: string): void;
  insertSubagentSpawnEdge(edge: SubagentSpawnEdgeSummary): void;
  listAllSubagentRuns(): SubagentRunSummary[];
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[];
  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[];
  listThreadsForSubagentStateInspection(): ThreadSummary[];
  replaceSubagentSpawnEdge(edge: SubagentSpawnEdgeSummary): void;
}

export class ProjectStoreSubagentSpawnEdgeRepairRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreSubagentSpawnEdgeRepairRepositoryDeps,
  ) {}

  repairSubagentSpawnEdges(options: RepairSubagentSpawnEdgesOptions): SubagentPersistedChildTreeRepairResult {
    const now = options.now ?? new Date().toISOString();
    const dryRun = options.dryRun === true;
    const beforeRuns = this.deps.listAllSubagentRuns();
    const beforeRunEvents = beforeRuns.flatMap((run) => this.deps.listSubagentRunEvents(run.id));
    const beforeSpawnEdges = this.deps.listSubagentSpawnEdges();
    const beforeSummary = analyzeSubagentRestartState({
      threads: this.deps.listThreadsForSubagentStateInspection(),
      runs: beforeRuns,
      runEvents: beforeRunEvents,
      spawnEdges: beforeSpawnEdges,
      waitBarriers: this.deps.listSubagentWaitBarriers(),
      createdAt: now,
    });
    const runsById = new Map(beforeRuns.map((run) => [run.id, run]));
    const edgesByChildRunId = new Map(beforeSpawnEdges.map((edge) => [edge.childRunId, edge]));
    const missingRunIds = uniqueSubagentRepairIds(
      beforeSummary.issues
        .filter((issue) => issue.kind === "missing_spawn_edge" && issue.runId && runsById.has(issue.runId))
        .map((issue) => issue.runId!),
    );
    const mismatchedRunIds = uniqueSubagentRepairIds(
      beforeSummary.issues
        .filter((issue) => issue.kind === "spawn_edge_mismatch" && issue.runId && runsById.has(issue.runId))
        .map((issue) => issue.runId!),
    );
    const danglingRunIds = uniqueSubagentRepairIds(
      beforeSummary.issues
        .filter((issue) => issue.kind === "dangling_spawn_edge" && issue.runId && !runsById.has(issue.runId))
        .map((issue) => issue.runId!),
    );
    const skippedIssueIds = beforeSummary.issues
      .filter(
        (issue) =>
          ["missing_spawn_edge", "spawn_edge_mismatch", "dangling_spawn_edge"].includes(issue.kind) &&
          (!issue.runId || (issue.kind !== "dangling_spawn_edge" && !runsById.has(issue.runId))),
      )
      .map((issue) => issue.id);
    const requestedActions: SubagentPersistedChildTreeRepairAction[] = [
      missingRunIds.length ? "reconstruct_missing_spawn_edge" : undefined,
      mismatchedRunIds.length ? "realign_spawn_edge" : undefined,
      danglingRunIds.length ? "prune_dangling_spawn_edge" : undefined,
    ].filter((action): action is SubagentPersistedChildTreeRepairAction => Boolean(action));

    if (!dryRun && !isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      return {
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: now,
        dryRun,
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: options.featureFlagSnapshot,
        requestedActions,
        beforeIssueCount: beforeSummary.issueCount,
        reconstructedMissingSpawnEdgeRunIds: missingRunIds,
        realignedSpawnEdgeRunIds: mismatchedRunIds,
        prunedDanglingSpawnEdgeRunIds: danglingRunIds,
        skippedIssueIds,
      };
    }

    if (!dryRun && requestedActions.length > 0) {
      const apply = this.db.transaction(() => {
        for (const runId of missingRunIds) {
          const run = runsById.get(runId);
          if (!run) continue;
          const edge = subagentSpawnEdgeRecordForRun(run, { now, createdAt: run.createdAt, depth: 1 });
          this.deps.insertSubagentSpawnEdge(edge);
          this.deps.appendSubagentRunEventInternal(run.id, {
            type: "subagent.spawn_edge_repaired",
            preview: {
              schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
              action: "reconstruct_missing_spawn_edge",
              childRunId: run.id,
              parentRunId: run.parentRunId,
              childThreadId: run.childThreadId,
              canonicalTaskPath: run.canonicalTaskPath,
              status: run.status,
            },
            createdAt: now,
          });
        }
        for (const runId of mismatchedRunIds) {
          const run = runsById.get(runId);
          if (!run) continue;
          const previousEdge = edgesByChildRunId.get(run.id);
          const edge = subagentSpawnEdgeRecordForRun(run, {
            now,
            createdAt: previousEdge?.createdAt ?? run.createdAt,
            depth: previousEdge?.depth ?? 1,
          });
          this.deps.replaceSubagentSpawnEdge(edge);
          this.deps.appendSubagentRunEventInternal(run.id, {
            type: "subagent.spawn_edge_repaired",
            preview: {
              schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
              action: "realign_spawn_edge",
              childRunId: run.id,
              parentRunId: run.parentRunId,
              childThreadId: run.childThreadId,
              canonicalTaskPath: run.canonicalTaskPath,
              status: run.status,
              previousEdge,
            },
            createdAt: now,
          });
        }
        for (const runId of danglingRunIds) {
          this.deps.deleteSubagentSpawnEdgesForChild(runId);
        }
      });
      apply();
    }

    const afterSummary = (() => {
      if (dryRun) return undefined;
      const afterRuns = this.deps.listAllSubagentRuns();
      const afterRunEvents = afterRuns.flatMap((run) => this.deps.listSubagentRunEvents(run.id));
      return analyzeSubagentRestartState({
        threads: this.deps.listThreadsForSubagentStateInspection(),
        runs: afterRuns,
        runEvents: afterRunEvents,
        spawnEdges: this.deps.listSubagentSpawnEdges(),
        waitBarriers: this.deps.listSubagentWaitBarriers(),
        createdAt: now,
      });
    })();

    return {
      schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
      createdAt: now,
      dryRun,
      requestedActions,
      beforeIssueCount: beforeSummary.issueCount,
      ...(afterSummary ? { afterIssueCount: afterSummary.issueCount } : {}),
      reconstructedMissingSpawnEdgeRunIds: missingRunIds,
      realignedSpawnEdgeRunIds: mismatchedRunIds,
      prunedDanglingSpawnEdgeRunIds: danglingRunIds,
      skippedIssueIds,
      ...(afterSummary ? { remainingIssues: afterSummary.issues } : {}),
    };
  }
}
