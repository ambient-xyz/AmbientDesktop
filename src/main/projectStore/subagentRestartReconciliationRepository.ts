import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import { analyzeSubagentRestartState, uniqueSubagentRepairIds } from "./projectStoreSubagentsFacade";
import type { AppendSubagentParentMailboxEventInput } from "./subagentParentMailboxRepository";
import type { AppendSubagentRunEventInput } from "./subagentRunRepository";

export interface ProjectStoreSubagentRestartReconciliationRepositoryDeps {
  appendSubagentLifecycleInterruptionParentMailboxEvent(input: {
    run: SubagentRunSummary;
    previousStatus?: SubagentRunSummary["status"];
    source: "desktop_restart";
    reason: string;
    waitBarrierIds?: readonly string[];
    idempotencyKey?: string;
    createdAt?: string;
  }): SubagentParentMailboxEventSummary;
  appendSubagentParentMailboxEvent(input: AppendSubagentParentMailboxEventInput): SubagentParentMailboxEventSummary;
  appendSubagentRunEvent(runId: string, input: AppendSubagentRunEventInput): SubagentRunEventSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  getSubagentWaitBarrier(barrierId: string): SubagentWaitBarrierSummary;
  listAllSubagentRuns(): SubagentRunSummary[];
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[];
  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[];
  listThreadsForSubagentStateInspection(): ThreadSummary[];
  markSubagentParentControlBarrierReconciled(input: {
    waitBarrierId: string;
    source: "desktop_restart";
    now: string;
  }): SubagentWaitBarrierSummary;
  markSubagentRunStatus(runId: string, status: "needs_attention", options: { resultArtifact?: unknown; now?: string }): SubagentRunSummary;
  parentMessageIdForSubagentWaitBarrier(barrier: SubagentWaitBarrierSummary): string | undefined;
  recreateRequiredSubagentWaitBarrierIfMissing(input: {
    run: SubagentRunSummary;
    existingWaitBarrierIds: readonly string[];
    now: string;
  }): SubagentWaitBarrierSummary | undefined;
}

export class ProjectStoreSubagentRestartReconciliationRepository {
  constructor(private readonly deps: ProjectStoreSubagentRestartReconciliationRepositoryDeps) {}

  reconcileSubagentRestartState(options: { now?: string } = {}): SubagentRestartReconciliationSummary {
    const now = options.now ?? new Date().toISOString();
    const subagentRuns = this.deps.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.deps.listSubagentRunEvents(run.id));
    const summary = analyzeSubagentRestartState({
      threads: this.deps.listThreadsForSubagentStateInspection(),
      runs: subagentRuns,
      runEvents: subagentRunEvents,
      spawnEdges: this.deps.listSubagentSpawnEdges(),
      waitBarriers: this.deps.listSubagentWaitBarriers(),
      createdAt: now,
    });
    const recreatedBarrierIds: string[] = [];
    for (const runId of summary.repairedRunIds) {
      const run = this.deps.getSubagentRun(runId);
      const needsReconciliation = this.deps.markSubagentRunStatus(runId, "needs_attention", {
        now,
      });
      const existingWaitBarrierIds = summary.repairedBarrierIds.filter((barrierId) => {
        const barrier = this.deps.getSubagentWaitBarrier(barrierId);
        return barrier.childRunIds.includes(runId);
      });
      const recreatedBarrier = this.deps.recreateRequiredSubagentWaitBarrierIfMissing({
        run: needsReconciliation,
        existingWaitBarrierIds,
        now,
      });
      if (recreatedBarrier) recreatedBarrierIds.push(recreatedBarrier.id);
      const affectedWaitBarrierIds = [...existingWaitBarrierIds, ...(recreatedBarrier ? [recreatedBarrier.id] : [])];
      this.deps.appendSubagentRunEvent(needsReconciliation.id, {
        type: "subagent.restart_reconciled",
        preview: {
          previousStatus: run.status,
          status: needsReconciliation.status,
          reason: "desktop_restart",
          parentBlockingState: "needs_reconciliation",
          waitBarrierIds: affectedWaitBarrierIds,
          ...(recreatedBarrier
            ? {
                recreatedWaitBarrier: {
                  id: recreatedBarrier.id,
                  dependencyMode: recreatedBarrier.dependencyMode,
                  failurePolicy: recreatedBarrier.failurePolicy,
                  timeoutMs: recreatedBarrier.timeoutMs,
                },
              }
            : {}),
        },
        createdAt: now,
      });
      this.deps.appendSubagentLifecycleInterruptionParentMailboxEvent({
        run: needsReconciliation,
        previousStatus: run.status,
        source: "desktop_restart",
        reason:
          "Ambient restarted before this child run finished. The child needs explicit retry, cancellation, detachment, or user steering before the parent can continue.",
        waitBarrierIds: affectedWaitBarrierIds,
        idempotencyKey: "desktop_restart",
        createdAt: now,
      });
    }
    for (const barrierId of summary.repairedParentControlBarrierIds) {
      const barrier = this.deps.markSubagentParentControlBarrierReconciled({
        waitBarrierId: barrierId,
        source: "desktop_restart",
        now,
      });
      this.deps.appendSubagentParentMailboxEvent({
        parentThreadId: barrier.parentThreadId,
        parentRunId: barrier.parentRunId,
        parentMessageId: this.deps.parentMessageIdForSubagentWaitBarrier(barrier),
        type: "subagent.parent_control_reconciled",
        payload: {
          schemaVersion: "ambient-subagent-parent-control-reconciled-v1",
          parentThreadId: barrier.parentThreadId,
          parentRunId: barrier.parentRunId,
          waitBarrierId: barrier.id,
          action: "cancel_parent",
          source: "desktop_restart",
          barrierStatus: barrier.status,
          childRunIds: barrier.childRunIds,
          synthesisAllowed: false,
          reason:
            "Ambient restarted after a cancel-parent wait-barrier decision; parent-control cancellation was reconciled from the persisted barrier.",
        },
        idempotencyKey: `desktop_restart_parent_control:${barrier.id}`,
        createdAt: now,
      });
    }
    for (const runId of summary.diagnosticRunIds) {
      const runIssues = summary.issues.filter((item) => item.runId === runId);
      if (runIssues.length === 0) continue;
      this.deps.appendSubagentRunEvent(runId, {
        type: "subagent.restart_diagnostic",
        preview: {
          schemaVersion: "ambient-subagent-restart-diagnostic-v1",
          reason: "desktop_restart",
          issueCount: runIssues.length,
          issues: runIssues.map((item) => ({
            id: item.id,
            kind: item.kind,
            severity: item.severity,
            message: item.message,
          })),
        },
        createdAt: now,
      });
    }
    return {
      ...summary,
      repairedRunIds: summary.repairedRunIds,
      repairedBarrierIds: uniqueSubagentRepairIds([...summary.repairedBarrierIds, ...recreatedBarrierIds]),
      repairedParentControlBarrierIds: summary.repairedParentControlBarrierIds,
      diagnosticRunIds: summary.diagnosticRunIds,
    };
  }
}
