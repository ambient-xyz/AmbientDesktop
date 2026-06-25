import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type {
  SubagentMaturityEvidence,
  SubagentMaturityEvidenceKind,
  SubagentMaturityEvidenceStatus,
  SubagentMaturitySnapshot,
} from "../../shared/subagentMaturity";
import type {
  SubagentRunStatus,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
} from "../../shared/subagentProtocol";
import type {
  CreateSubagentRunInput,
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentPersistedChildTreeRepairResult,
  SubagentPromptSnapshotSummary,
  SubagentRepairDiagnosticsReport,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import { assertValidMutationWorkspaceLease } from "../../shared/symphonyFineGrainedContracts";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import { ProjectStoreProjectBoardFacadeMethods } from "./projectStoreProjectBoardFacadeMethods";
import {
  resolveSubagentParentControlBarrierReconciliation,
  summarizeSubagentObservability,
  type SubagentBatchJobPlan,
  type SubagentBatchJobRecord,
  type SubagentBatchReportApplyResult,
  type SubagentBatchResultReport,
  type SubagentLifecycleInterruptionSource,
  type SubagentMaturityInput,
  type SubagentObservabilitySummary,
  type SubagentRetentionCleanupResult,
  type SubagentRetentionPlan,
} from "./projectStoreSubagentsFacade";

export abstract class ProjectStoreSubagentFacadeMethods extends ProjectStoreProjectBoardFacadeMethods {
  abstract getThread(threadId: string): ThreadSummary;
  abstract getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary;

  createSubagentRun(input: CreateSubagentRunInput): SubagentRunSummary {
    return this.repos.subagentRunCreations().createSubagentRun(input);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    return this.repos.subagentRuns().getSubagentRun(runId);
  }

  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[] {
    return this.repos.subagentRuns().listSubagentRunsForParentThread(parentThreadId);
  }

  listAllSubagentRuns(): SubagentRunSummary[] {
    return this.repos.subagentRuns().listAllSubagentRuns();
  }

  assertSubagentCanonicalTaskPathAvailableForSpawn(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): void {
    const blocker = this.findUnresolvedRequiredSubagentCanonicalPathBlocker(input);
    if (!blocker) return;
    throw new Error(
      [
        `Sub-agent canonical task path ${input.canonicalTaskPath} is already owned by child run ${blocker.run.id}.`,
        `Unresolved required wait barrier ${blocker.barrier.id} still references that child.`,
        "Use the existing child run, wait for the barrier, or resolve the barrier before spawning replacement child work.",
      ].join(" "),
    );
  }

  upsertSubagentBatchJobPlan(
    plan: SubagentBatchJobPlan,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): SubagentBatchJobRecord {
    if (!isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      throw new Error("Sub-agent batch jobs are disabled while ambient.subagents is off.");
    }
    this.getThread(plan.parentThreadId);
    return this.repos.subagentBatches().upsertSubagentBatchJobPlan(plan);
  }

  getSubagentBatchJob(jobId: string): SubagentBatchJobRecord | undefined {
    return this.repos.subagentBatches().getSubagentBatchJob(jobId);
  }

  listSubagentBatchJobsForParentRun(parentRunId: string): SubagentBatchJobRecord[] {
    return this.repos.subagentBatches().listSubagentBatchJobsForParentRun(parentRunId);
  }

  listSubagentBatchResultReports(jobId: string): SubagentBatchResultReport[] {
    return this.repos.subagentBatches().listSubagentBatchResultReports(jobId);
  }

  applySubagentBatchResultReport(report: SubagentBatchResultReport): SubagentBatchReportApplyResult {
    return this.repos.subagentBatches().applySubagentBatchResultReport(report);
  }

  upsertSubagentBatchProgressNotification(jobId: string, input: { createdAt?: string } = {}): SubagentParentMailboxEventSummary {
    const record = this.getSubagentBatchJob(jobId);
    if (!record) throw new Error(`Sub-agent batch job not found: ${jobId}`);
    return this.repos.subagentBatchProgress().upsertSubagentBatchProgressNotificationForRecord(record, input.createdAt ?? record.updatedAt);
  }

  getSubagentObservabilitySummary(input: { parentRunId?: string; createdAt?: string } = {}): SubagentObservabilitySummary {
    const runs = input.parentRunId
      ? this.listAllSubagentRuns().filter((run) => run.parentRunId === input.parentRunId)
      : this.listAllSubagentRuns();
    const parentRunIds = input.parentRunId ? [input.parentRunId] : [...new Set(runs.map((run) => run.parentRunId))];
    return summarizeSubagentObservability({
      runs,
      runEvents: runs.flatMap((run) => this.listSubagentRunEvents(run.id)),
      waitBarriers: input.parentRunId ? this.listSubagentWaitBarriersForParentRun(input.parentRunId) : this.listSubagentWaitBarriers(),
      parentMailboxEvents: parentRunIds.flatMap((parentRunId) => this.listSubagentParentMailboxEventsForParentRun(parentRunId)),
      toolScopeSnapshots: runs.flatMap((run) => this.listSubagentToolScopeSnapshots(run.id)),
      createdAt: input.createdAt,
    });
  }

  recordSubagentMaturityEvidence(input: {
    kind: SubagentMaturityEvidenceKind;
    status: SubagentMaturityEvidenceStatus;
    evidenceKey?: string;
    runId?: string;
    parentRunId?: string;
    artifactPath?: string;
    reviewer?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence {
    const run = input.runId ? this.getSubagentRun(input.runId) : undefined;
    return this.repos.subagentMaturityEvidence().recordSubagentMaturityEvidence({
      kind: input.kind,
      status: input.status,
      evidenceKey: input.evidenceKey,
      run: run ? { id: run.id, parentRunId: run.parentRunId } : undefined,
      parentRunId: input.parentRunId,
      artifactPath: input.artifactPath,
      reviewer: input.reviewer,
      notes: input.notes,
      details: input.details,
      createdAt: input.createdAt,
    });
  }

  getSubagentMaturityEvidence(id: string): SubagentMaturityEvidence {
    return this.repos.subagentMaturityEvidence().getSubagentMaturityEvidence(id);
  }

  listSubagentMaturityEvidence(kind?: SubagentMaturityEvidenceKind): SubagentMaturityEvidence[] {
    return this.repos.subagentMaturityEvidence().listSubagentMaturityEvidence(kind);
  }

  getSubagentMaturitySnapshot(
    input: Omit<SubagentMaturityInput, "observability" | "restartReconciliation"> = {},
  ): SubagentMaturitySnapshot {
    return this.repos.subagentMaturitySnapshots().getSubagentMaturitySnapshot(input);
  }

  getSubagentRetentionPlan(
    input: { now?: string; cleanupWindowMs?: number; maxRetainedChildrenPerParent?: number } = {},
  ): SubagentRetentionPlan {
    return this.repos.subagentRetentionCleanups().getSubagentRetentionPlan(input);
  }

  applySubagentRetentionCleanup(input: {
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    now?: string;
    cleanupWindowMs?: number;
    maxRetainedChildrenPerParent?: number;
  }): SubagentRetentionCleanupResult {
    return this.repos.subagentRetentionCleanups().applySubagentRetentionCleanup(input);
  }

  cascadeSubagentParentRunStopped(input: {
    parentThreadId: string;
    parentRunId: string;
    reason: string;
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    now?: string;
  }): {
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
  } {
    return this.repos.subagentParentStopCascades().cascadeSubagentParentRunStopped(input);
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return this.repos.subagentRuns().listSubagentRunEvents(runId);
  }

  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[] {
    return this.repos.subagentRuns().listSubagentSpawnEdges();
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    this.getSubagentRun(runId);
    return this.repos.subagentRuns().appendSubagentRunEvent(runId, input);
  }

  appendSubagentMailboxEvent(
    runId: string,
    input: {
      direction: SubagentMailboxDirection;
      type: string;
      payload: unknown;
      deliveryState?: SubagentMailboxDeliveryState;
      createdAt?: string;
      deliveredAt?: string;
    },
  ): SubagentMailboxEventSummary {
    this.getSubagentRun(runId);
    return this.repos.subagentMailboxes().appendSubagentMailboxEvent(runId, input);
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    this.getSubagentRun(runId);
    return this.repos.subagentMailboxes().listSubagentMailboxEvents(runId);
  }

  getSubagentMailboxEvent(id: string): SubagentMailboxEventSummary {
    return this.repos.subagentMailboxes().getSubagentMailboxEvent(id);
  }

  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary {
    return this.repos.subagentMailboxes().updateSubagentMailboxEventDeliveryState(id, deliveryState, options);
  }

  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary {
    return this.repos.subagentParentMailboxes().appendSubagentParentMailboxEvent(input);
  }

  appendSubagentLifecycleInterruptionParentMailboxEvent(input: {
    run: SubagentRunSummary;
    previousStatus?: SubagentRunStatus;
    source: SubagentLifecycleInterruptionSource;
    reason: string;
    resultArtifact?: unknown;
    toolCallId?: string;
    waitBarrierIds?: readonly string[];
    cancelledMailboxEventIds?: readonly string[];
    idempotencyKey?: string;
    createdAt?: string;
  }): SubagentParentMailboxEventSummary {
    return this.repos.subagentRunCompletions().appendSubagentLifecycleInterruptionParentMailboxEvent(input);
  }

  upsertSubagentGroupedCompletionNotification(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunStatus;
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary {
    return this.repos.subagentRunCompletions().upsertSubagentGroupedCompletionNotification(input);
  }

  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[] {
    return this.repos.subagentParentMailboxes().listSubagentParentMailboxEventsForParentRun(parentRunId);
  }

  listSubagentParentMailboxEventsForParentThread(parentThreadId: string): SubagentParentMailboxEventSummary[] {
    return this.repos.subagentParentMailboxes().listSubagentParentMailboxEventsForParentThread(parentThreadId);
  }

  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary {
    return this.repos.subagentParentMailboxes().getSubagentParentMailboxEvent(id);
  }

  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary {
    return this.repos.subagentParentMailboxes().updateSubagentParentMailboxEventDeliveryState(id, deliveryState, options);
  }

  recordSubagentPromptSnapshot(
    runId: string,
    input: { prompt: string; snapshot: unknown; createdAt?: string },
  ): SubagentPromptSnapshotSummary {
    this.getSubagentRun(runId);
    return this.repos.subagentSnapshots().recordSubagentPromptSnapshot(runId, input);
  }

  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[] {
    this.getSubagentRun(runId);
    return this.repos.subagentSnapshots().listSubagentPromptSnapshots(runId);
  }

  recordSubagentToolScopeSnapshot(
    runId: string,
    input: { scope: SubagentToolScopeSnapshotSummary["scope"]; resolverInputs?: unknown; createdAt?: string },
  ): SubagentToolScopeSnapshotSummary {
    this.getSubagentRun(runId);
    return this.repos.subagentSnapshots().recordSubagentToolScopeSnapshot(runId, input);
  }

  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[] {
    this.getSubagentRun(runId);
    return this.repos.subagentSnapshots().listSubagentToolScopeSnapshots(runId);
  }

  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
    ownerId?: string;
    quorumThreshold?: number;
    timeoutMs?: number;
    createdAt?: string;
  }): SubagentWaitBarrierSummary {
    const childRunIds = [...new Set(input.childRunIds.filter(Boolean))];
    if (childRunIds.length === 0) throw new Error("Sub-agent wait barrier requires at least one child run.");
    return this.repos.subagentWaitBarriers().createSubagentWaitBarrier({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      childRunIds,
      dependencyMode: input.dependencyMode,
      failurePolicy: input.failurePolicy,
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      quorumThreshold: input.quorumThreshold,
      timeoutMs: input.timeoutMs,
      createdAt: input.createdAt,
    });
  }

  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary {
    return this.repos.subagentWaitBarriers().getSubagentWaitBarrier(id);
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return this.repos.subagentWaitBarriers().listSubagentWaitBarriersForParentRun(parentRunId);
  }

  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[] {
    return this.repos.subagentWaitBarriers().listSubagentWaitBarriers();
  }

  getSubagentRepairDiagnostics(
    options: {
      now?: string;
      maxIssues?: number;
      maxMessageChars?: number;
      maxAffectedIds?: number;
    } = {},
  ): SubagentRepairDiagnosticsReport {
    return this.repos.subagentRepairDiagnostics().getSubagentRepairDiagnostics(options);
  }

  repairSubagentSpawnEdges(
    options: { now?: string; dryRun: true } | { now?: string; dryRun?: false; featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): SubagentPersistedChildTreeRepairResult {
    return this.repos.subagentSpawnEdgeRepairs().repairSubagentSpawnEdges(options);
  }

  reconcileSubagentRestartState(options: { now?: string } = {}): SubagentRestartReconciliationSummary {
    return this.repos.subagentRestartReconciliations().reconcileSubagentRestartState(options);
  }

  private recreateRequiredSubagentWaitBarrierIfMissing(input: {
    run: SubagentRunSummary;
    existingWaitBarrierIds: readonly string[];
    now: string;
  }): SubagentWaitBarrierSummary | undefined {
    if (input.run.dependencyMode !== "required") return undefined;
    if (input.existingWaitBarrierIds.length > 0) return undefined;
    const existing = this.listSubagentWaitBarriersForParentRun(input.run.parentRunId).find(
      (barrier) =>
        barrier.parentThreadId === input.run.parentThreadId &&
        barrier.status === "waiting_on_children" &&
        barrier.childRunIds.includes(input.run.id) &&
        ["required_all", "required_any", "quorum"].includes(barrier.dependencyMode),
    );
    if (existing) return undefined;
    return this.createSubagentWaitBarrier({
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      childRunIds: [input.run.id],
      dependencyMode: "required_all",
      failurePolicy: input.run.roleProfileSnapshot.guardPolicy.allowPartialResult ? "degrade_partial" : "ask_user",
      timeoutMs: input.run.roleProfileSnapshot.guardPolicy.maxRuntimeMs,
      createdAt: input.now,
    });
  }

  markSubagentParentControlBarrierReconciled(input: {
    waitBarrierId: string;
    source: "runtime_parent_abort" | "desktop_restart";
    now?: string;
  }): SubagentWaitBarrierSummary {
    const barrier = this.getSubagentWaitBarrier(input.waitBarrierId);
    const now = input.now ?? new Date().toISOString();
    return resolveSubagentParentControlBarrierReconciliation({
      store: this,
      waitBarrier: barrier,
      source: input.source,
      now,
    });
  }

  private parentMessageIdForSubagentWaitBarrier(barrier: SubagentWaitBarrierSummary): string | undefined {
    for (const childRunId of barrier.childRunIds) {
      try {
        const run = this.getSubagentRun(childRunId);
        if (run.parentMessageId) return run.parentMessageId;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierStatus,
    options: { resolutionArtifact?: unknown; now?: string } = {},
  ): SubagentWaitBarrierSummary {
    return this.repos.subagentWaitBarriers().updateSubagentWaitBarrierStatus(id, status, options);
  }

  markSubagentRunStatus(
    runId: string,
    status: SubagentRunStatus,
    options: { resultArtifact?: unknown; now?: string } = {},
  ): SubagentRunSummary {
    return this.repos.subagentRunCompletions().markSubagentRunStatus(runId, status, options);
  }

  closeSubagentRun(runId: string, now = new Date().toISOString()): SubagentRunSummary {
    return this.repos.subagentRunCompletions().closeSubagentRun(runId, now);
  }

  updateSubagentRunMutationWorkspaceLease(runId: string, lease: unknown): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const validated = assertValidMutationWorkspaceLease({
      ...(typeof lease === "object" && lease && !Array.isArray(lease) ? (lease as Record<string, unknown>) : {}),
      parentThreadId: current.parentThreadId,
      childThreadId: current.childThreadId,
      childRunId: current.id,
    });
    return this.repos.subagentRuns().updateSubagentRunMutationWorkspaceLease(runId, validated);
  }

  private findUnresolvedRequiredSubagentCanonicalPathBlocker(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): { run: SubagentRunSummary; barrier: SubagentWaitBarrierSummary } | undefined {
    const matchingRuns = this.repos.subagentRuns().listSubagentRunsForCanonicalTask(input);
    return this.repos.subagentWaitBarriers().findUnresolvedRequiredSubagentRunBlocker({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      matchingRuns,
      ignoreBarrier: (barrier) => this.subagentWaitBarrierBelongsToNonblockingCallableWorkflowTask(barrier),
    });
  }

  private subagentWaitBarrierBelongsToNonblockingCallableWorkflowTask(barrier: SubagentWaitBarrierSummary): boolean {
    if (barrier.ownerKind !== "callable_workflow_symphony_launch_bridge" || !barrier.ownerId) return false;
    let task: CallableWorkflowTaskSummary;
    try {
      task = this.getCallableWorkflowTask(barrier.ownerId);
    } catch {
      return false;
    }
    return task.parentRunId === barrier.parentRunId && task.blocking === false;
  }

  private appendSubagentRunEventInternal(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): void {
    this.repos.subagentRuns().appendSubagentRunEvent(runId, input);
  }

  private parentMessageIdForSubagentRun(runId: string): string | undefined {
    return this.repos.subagentRuns().parentMessageIdForSubagentRun(runId);
  }

  private latestQueuedSubagentParentMailboxEvent(parentRunId: string, type: string): SubagentParentMailboxEventSummary | undefined {
    return this.repos.subagentParentMailboxes().latestQueuedSubagentParentMailboxEvent(parentRunId, type);
  }
}
