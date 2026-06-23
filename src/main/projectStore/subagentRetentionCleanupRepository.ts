import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import { planSubagentRetention, type SubagentRetentionCleanupResult, type SubagentRetentionPlan } from "./projectStoreSubagentsFacade";
import type { AppendSubagentRunEventInput } from "./subagentRunRepository";

export interface ApplySubagentRetentionCleanupInput {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  now?: string;
  cleanupWindowMs?: number;
  maxRetainedChildrenPerParent?: number;
}

export interface GetSubagentRetentionPlanInput {
  now?: string;
  cleanupWindowMs?: number;
  maxRetainedChildrenPerParent?: number;
}

export interface ProjectStoreSubagentRetentionCleanupRepositoryDeps {
  appendSubagentRunEventInternal(runId: string, input: AppendSubagentRunEventInput): void;
  archiveSubagentChildThread(threadId: string, archivedAt: string): boolean;
  listAllSubagentRuns(): SubagentRunSummary[];
  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[];
  listThreadsForSubagentStateInspection(): ThreadSummary[];
}

export class ProjectStoreSubagentRetentionCleanupRepository {
  constructor(private readonly deps: ProjectStoreSubagentRetentionCleanupRepositoryDeps) {}

  getSubagentRetentionPlan(input: GetSubagentRetentionPlanInput = {}): SubagentRetentionPlan {
    return planSubagentRetention({
      runs: this.deps.listAllSubagentRuns(),
      threads: this.deps.listThreadsForSubagentStateInspection(),
      now: input.now,
      cleanupWindowMs: input.cleanupWindowMs,
      maxRetainedChildrenPerParent: input.maxRetainedChildrenPerParent,
      waitBarriers: this.deps.listSubagentWaitBarriers(),
    });
  }

  applySubagentRetentionCleanup(input: ApplySubagentRetentionCleanupInput): SubagentRetentionCleanupResult {
    const now = input.now ?? new Date().toISOString();
    const plan = this.getSubagentRetentionPlan({
      now,
      cleanupWindowMs: input.cleanupWindowMs,
      maxRetainedChildrenPerParent: input.maxRetainedChildrenPerParent,
    });
    if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
      return {
        schemaVersion: "ambient-subagent-retention-cleanup-v1",
        createdAt: now,
        mode: "archive_child_threads",
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: input.featureFlagSnapshot,
        plan,
        archivedRunIds: [],
        archivedThreadIds: [],
        skippedRunIds: plan.eligibleRunIds,
      };
    }
    const archivedRunIds: string[] = [];
    const archivedThreadIds: string[] = [];
    const skippedRunIds: string[] = [];
    for (const decision of plan.decisions) {
      if (decision.action !== "eligible_for_cleanup") continue;
      if (!this.deps.archiveSubagentChildThread(decision.childThreadId, now)) {
        skippedRunIds.push(decision.runId);
        continue;
      }
      archivedRunIds.push(decision.runId);
      archivedThreadIds.push(decision.childThreadId);
      this.deps.appendSubagentRunEventInternal(decision.runId, {
        type: "subagent.retention_archived",
        preview: {
          childThreadId: decision.childThreadId,
          parentThreadId: decision.parentThreadId,
          reason: decision.reason,
          retentionDefault: decision.retentionDefault,
          parentArchived: decision.parentArchived,
          ...(decision.parentArchivedAt ? { parentArchivedAt: decision.parentArchivedAt } : {}),
          retentionPlanCreatedAt: plan.createdAt,
          cleanupWindowMs: plan.cleanupWindowMs,
          maxRetainedChildrenPerParent: plan.maxRetainedChildrenPerParent,
          transcriptRetained: true,
          artifactsRetained: true,
        },
        createdAt: now,
      });
    }
    return {
      schemaVersion: "ambient-subagent-retention-cleanup-v1",
      createdAt: now,
      mode: "archive_child_threads",
      plan,
      archivedRunIds,
      archivedThreadIds,
      skippedRunIds,
    };
  }
}
