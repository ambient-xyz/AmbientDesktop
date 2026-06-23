import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import { compactSubagentMailboxEventForPreview, subagentRunStatusIsTerminal } from "./projectStoreSubagentMappers";
import type { AppendSubagentParentMailboxEventInput } from "./subagentParentMailboxRepository";
import type { AppendSubagentRunEventInput } from "./subagentRunRepository";

export interface CascadeSubagentParentRunStoppedInput {
  parentThreadId: string;
  parentRunId: string;
  reason: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  now?: string;
}

export interface CascadeSubagentParentRunStoppedResult {
  parentThreadId: string;
  parentRunId: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  subagentsDisabledSafetyCascade: boolean;
  parentCancellationRequested: boolean;
  cancelledRunIds: string[];
  detachedRunIds: string[];
  unchangedRunIds: string[];
  cancelledWaitBarrierIds: string[];
  cancelledMailboxEventIds: string[];
  parentMailboxEventId?: string;
}

export interface ResolveSubagentParentStopWaitBarrierInput {
  waitBarrier: SubagentWaitBarrierSummary;
  parentThreadId: string;
  parentRunId: string;
  reason: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  subagentsDisabledSafetyCascade: boolean;
  childStatuses: Array<{ childRunId: string; status: SubagentRunSummary["status"] }>;
  now?: string;
}

export interface ProjectStoreSubagentParentStopCascadeRepositoryDeps {
  appendSubagentParentMailboxEvent(input: AppendSubagentParentMailboxEventInput): SubagentParentMailboxEventSummary;
  appendSubagentRunEvent(runId: string, input: AppendSubagentRunEventInput): void;
  cancelPendingParentToChildMailboxEvents(input: { runId: string; now: string }): { events: SubagentMailboxEventSummary[] };
  getSubagentRun(runId: string): SubagentRunSummary;
  listAllSubagentRuns(): SubagentRunSummary[];
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
  markSubagentRunStatus(
    runId: string,
    status: "cancelled" | "detached",
    options: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary;
  resolveSubagentParentStopWaitBarrier(input: ResolveSubagentParentStopWaitBarrierInput): SubagentWaitBarrierSummary;
}

export class ProjectStoreSubagentParentStopCascadeRepository {
  constructor(private readonly deps: ProjectStoreSubagentParentStopCascadeRepositoryDeps) {}

  cascadeSubagentParentRunStopped(input: CascadeSubagentParentRunStoppedInput): CascadeSubagentParentRunStoppedResult {
    const now = input.now ?? new Date().toISOString();
    const subagentsDisabledSafetyCascade = !isAmbientSubagentsEnabled(input.featureFlagSnapshot);
    const runs = this.deps
      .listAllSubagentRuns()
      .filter((run) => run.parentThreadId === input.parentThreadId && run.parentRunId === input.parentRunId);
    const cancelledRunIds: string[] = [];
    const detachedRunIds: string[] = [];
    const unchangedRunIds: string[] = [];
    const cancelledMailboxEventIds: string[] = [];

    for (const run of runs) {
      if (subagentRunStatusIsTerminal(run.status)) {
        unchangedRunIds.push(run.id);
        continue;
      }
      const status = run.dependencyMode === "optional_background" ? "detached" : "cancelled";
      const summary =
        status === "detached"
          ? `Parent run stopped; optional background child was detached. ${input.reason}`
          : `Parent run stopped; child was cancelled. ${input.reason}`;
      const updated = this.deps.markSubagentRunStatus(run.id, status, {
        now,
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: run.id,
          status,
          partial: false,
          summary,
          childThreadId: run.childThreadId,
        },
      });
      const cancelledMailboxEvents =
        status === "cancelled" ? this.deps.cancelPendingParentToChildMailboxEvents({ runId: updated.id, now }).events : [];
      cancelledMailboxEventIds.push(...cancelledMailboxEvents.map((event) => event.id));
      this.deps.appendSubagentRunEvent(updated.id, {
        type: "subagent.parent_stopped",
        preview: {
          previousStatus: run.status,
          status,
          reason: input.reason,
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          featureFlagSnapshot: input.featureFlagSnapshot,
          ...(subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade } : {}),
          ...(cancelledMailboxEvents.length
            ? {
                cancelledMailboxEvents: cancelledMailboxEvents.map(compactSubagentMailboxEventForPreview),
              }
            : {}),
        },
        createdAt: now,
      });
      if (status === "detached") detachedRunIds.push(run.id);
      else cancelledRunIds.push(run.id);
    }

    const childStatuses = runs.map((run) => ({
      childRunId: run.id,
      status: this.deps.getSubagentRun(run.id).status,
    }));
    const cancelledWaitBarrierIds = this.deps
      .listSubagentWaitBarriersForParentRun(input.parentRunId)
      .filter((barrier) => barrier.parentThreadId === input.parentThreadId && barrier.status === "waiting_on_children")
      .map(
        (barrier) =>
          this.deps.resolveSubagentParentStopWaitBarrier({
            waitBarrier: barrier,
            parentThreadId: input.parentThreadId,
            parentRunId: input.parentRunId,
            reason: input.reason,
            featureFlagSnapshot: input.featureFlagSnapshot,
            subagentsDisabledSafetyCascade,
            childStatuses: childStatuses.filter((child) => barrier.childRunIds.includes(child.childRunId)),
            now,
          }).id,
      );

    let parentMailboxEventId: string | undefined;
    if (cancelledRunIds.length || detachedRunIds.length || cancelledWaitBarrierIds.length) {
      const parentMessageId = runs.find((run) => run.parentMessageId)?.parentMessageId;
      const event = this.deps.appendSubagentParentMailboxEvent({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId,
        type: "subagent.cancellation_cascade",
        payload: {
          schemaVersion: "ambient-subagent-cancellation-cascade-v1",
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          ...(parentMessageId ? { parentMessageId } : {}),
          parentStopped: true,
          parentCancellationRequested: true,
          reason: input.reason,
          featureFlagSnapshot: input.featureFlagSnapshot,
          ...(subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade } : {}),
          cancelledRunIds,
          detachedRunIds,
          unchangedRunIds,
          cancelledWaitBarrierIds,
          cancelledMailboxEventIds,
        },
        idempotencyKey: `subagent:parent_stopped:${input.parentRunId}`,
        createdAt: now,
      });
      parentMailboxEventId = event.id;
    }

    return {
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      featureFlagSnapshot: input.featureFlagSnapshot,
      subagentsDisabledSafetyCascade,
      parentCancellationRequested: true,
      cancelledRunIds,
      detachedRunIds,
      unchangedRunIds,
      cancelledWaitBarrierIds,
      cancelledMailboxEventIds,
      ...(parentMailboxEventId ? { parentMailboxEventId } : {}),
    };
  }
}
