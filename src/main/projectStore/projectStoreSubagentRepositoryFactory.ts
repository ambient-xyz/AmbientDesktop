import type { ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactoryTypes";
import { cancelPendingParentToChildMailboxEvents, resolveSubagentParentStopWaitBarrier } from "./projectStoreSubagentsFacade";
import { ProjectStoreSubagentBatchProgressRepository } from "./subagentBatchProgressRepository";
import { ProjectStoreSubagentBatchRepository } from "./subagentBatchRepository";
import { ProjectStoreSubagentMailboxRepository } from "./subagentMailboxRepository";
import { ProjectStoreSubagentMaturityEvidenceRepository } from "./subagentMaturityEvidenceRepository";
import { ProjectStoreSubagentMaturitySnapshotRepository } from "./subagentMaturitySnapshotRepository";
import { ProjectStoreSubagentParentMailboxRepository } from "./subagentParentMailboxRepository";
import { ProjectStoreSubagentParentStopCascadeRepository } from "./subagentParentStopCascadeRepository";
import { ProjectStoreSubagentRepairDiagnosticsRepository } from "./subagentRepairDiagnosticsRepository";
import { ProjectStoreSubagentRestartReconciliationRepository } from "./subagentRestartReconciliationRepository";
import { ProjectStoreSubagentRetentionCleanupRepository } from "./subagentRetentionCleanupRepository";
import { ProjectStoreSubagentRunCompletionRepository } from "./subagentRunCompletionRepository";
import { ProjectStoreSubagentRunCreationRepository } from "./subagentRunCreationRepository";
import { ProjectStoreSubagentRunRepository } from "./subagentRunRepository";
import { ProjectStoreSubagentSnapshotRepository } from "./subagentSnapshotRepository";
import { ProjectStoreSubagentSpawnEdgeRepairRepository } from "./subagentSpawnEdgeRepairRepository";
import { ProjectStoreSubagentWaitBarrierRepository } from "./subagentWaitBarrierRepository";
import type { ProjectStoreThreadRepository } from "./threadRepository";
import type { ProjectStoreWorkflowRunRepository } from "./workflowRunRepository";

export interface ProjectStoreSubagentRepositoryFactoryDeps {
  threads(): ProjectStoreThreadRepository;
  workflowRuns(): ProjectStoreWorkflowRunRepository;
}

export class ProjectStoreSubagentRepositoryFactory {
  constructor(
    private readonly host: ProjectStoreRepositoryFactoryHost,
    private readonly deps: ProjectStoreSubagentRepositoryFactoryDeps,
  ) {}

  subagentRuns(): ProjectStoreSubagentRunRepository {
    return new ProjectStoreSubagentRunRepository(this.host.requireDb());
  }

  subagentMailboxes(): ProjectStoreSubagentMailboxRepository {
    return new ProjectStoreSubagentMailboxRepository(this.host.requireDb());
  }

  subagentParentMailboxes(): ProjectStoreSubagentParentMailboxRepository {
    return new ProjectStoreSubagentParentMailboxRepository(this.host.requireDb());
  }

  subagentSnapshots(): ProjectStoreSubagentSnapshotRepository {
    return new ProjectStoreSubagentSnapshotRepository(this.host.requireDb());
  }

  subagentWaitBarriers(): ProjectStoreSubagentWaitBarrierRepository {
    return new ProjectStoreSubagentWaitBarrierRepository(this.host.requireDb());
  }

  subagentBatchProgress(): ProjectStoreSubagentBatchProgressRepository {
    return new ProjectStoreSubagentBatchProgressRepository(this.host.requireDb());
  }

  subagentBatches(): ProjectStoreSubagentBatchRepository {
    return new ProjectStoreSubagentBatchRepository(this.host.requireDb(), {
      upsertProgressNotification: (record, createdAt) =>
        this.subagentBatchProgress().upsertSubagentBatchProgressNotificationForRecord(record, createdAt),
    });
  }

  subagentMaturityEvidence(): ProjectStoreSubagentMaturityEvidenceRepository {
    return new ProjectStoreSubagentMaturityEvidenceRepository(this.host.requireDb());
  }

  subagentRunCreations(): ProjectStoreSubagentRunCreationRepository {
    return new ProjectStoreSubagentRunCreationRepository(this.host.requireDb(), {
      appendSubagentRunEventInternal: (runId, input) => this.host.appendSubagentRunEventInternal(runId, input),
      assertSubagentCanonicalTaskPathAvailableForSpawn: (input) => this.host.assertSubagentCanonicalTaskPathAvailableForSpawn(input),
      createReservedSubagentRun: (input) => this.subagentRuns().createReservedSubagentRun(input),
      createThread: (title, workspacePath, options) => this.host.createThread(title, workspacePath, options),
      getSubagentRun: (runId) => this.host.getSubagentRun(runId),
      getThread: (threadId) => this.host.getThread(threadId),
      nextSubagentChildOrder: (parentThreadId) => this.deps.threads().nextSubagentChildOrder(parentThreadId),
    });
  }

  subagentSpawnEdgeRepairs(): ProjectStoreSubagentSpawnEdgeRepairRepository {
    return new ProjectStoreSubagentSpawnEdgeRepairRepository(this.host.requireDb(), {
      appendSubagentRunEventInternal: (runId, input) => this.host.appendSubagentRunEventInternal(runId, input),
      deleteSubagentSpawnEdgesForChild: (childRunId) => this.subagentRuns().deleteSubagentSpawnEdgesForChild(childRunId),
      insertSubagentSpawnEdge: (edge) => this.subagentRuns().insertSubagentSpawnEdge(edge),
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listSubagentRunEvents: (runId) => this.host.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.host.listSubagentSpawnEdges(),
      listSubagentWaitBarriers: () => this.host.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.host.listThreadsForSubagentStateInspection(),
      replaceSubagentSpawnEdge: (edge) => this.subagentRuns().replaceSubagentSpawnEdge(edge),
    });
  }

  subagentParentStopCascades(): ProjectStoreSubagentParentStopCascadeRepository {
    return new ProjectStoreSubagentParentStopCascadeRepository({
      appendSubagentParentMailboxEvent: (input) => this.host.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEvent: (runId, input) => this.host.appendSubagentRunEvent(runId, input),
      cancelPendingParentToChildMailboxEvents: (input) => cancelPendingParentToChildMailboxEvents(this.host, input),
      getSubagentRun: (runId) => this.host.getSubagentRun(runId),
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listSubagentWaitBarriersForParentRun: (parentRunId) => this.host.listSubagentWaitBarriersForParentRun(parentRunId),
      markSubagentRunStatus: (runId, status, options) => this.host.markSubagentRunStatus(runId, status, options),
      resolveSubagentParentStopWaitBarrier: (input) =>
        resolveSubagentParentStopWaitBarrier({
          store: this.host,
          ...input,
        }),
    });
  }

  subagentRunCompletions(): ProjectStoreSubagentRunCompletionRepository {
    return new ProjectStoreSubagentRunCompletionRepository({
      appendSubagentParentMailboxEvent: (input) => this.host.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEventInternal: (runId, input) => this.host.appendSubagentRunEventInternal(runId, input),
      closeSubagentRun: (input) => this.subagentRuns().closeSubagentRun(input),
      getSubagentRun: (runId) => this.host.getSubagentRun(runId),
      latestQueuedSubagentParentMailboxEvent: (parentRunId, type) => this.host.latestQueuedSubagentParentMailboxEvent(parentRunId, type),
      listSubagentRunEvents: (runId) => this.host.listSubagentRunEvents(runId),
      parentMessageIdForSubagentRun: (runId) => this.host.parentMessageIdForSubagentRun(runId),
      updateSubagentChildStatus: (childThreadId, status, now) => this.deps.threads().updateSubagentChildStatus(childThreadId, status, now),
      updateSubagentParentMailboxPayload: (input) => this.subagentParentMailboxes().updateSubagentParentMailboxPayload(input),
      updateSubagentRunStatus: (input) => this.subagentRuns().updateSubagentRunStatus(input),
    });
  }

  subagentRestartReconciliations(): ProjectStoreSubagentRestartReconciliationRepository {
    return new ProjectStoreSubagentRestartReconciliationRepository({
      appendSubagentLifecycleInterruptionParentMailboxEvent: (input) =>
        this.host.appendSubagentLifecycleInterruptionParentMailboxEvent(input),
      appendSubagentParentMailboxEvent: (input) => this.host.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEvent: (runId, input) => this.host.appendSubagentRunEvent(runId, input),
      getSubagentRun: (runId) => this.host.getSubagentRun(runId),
      getSubagentWaitBarrier: (barrierId) => this.host.getSubagentWaitBarrier(barrierId),
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listSubagentRunEvents: (runId) => this.host.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.host.listSubagentSpawnEdges(),
      listSubagentWaitBarriers: () => this.host.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.host.listThreadsForSubagentStateInspection(),
      markSubagentParentControlBarrierReconciled: (input) => this.host.markSubagentParentControlBarrierReconciled(input),
      markSubagentRunStatus: (runId, status, options) => this.host.markSubagentRunStatus(runId, status, options),
      parentMessageIdForSubagentWaitBarrier: (barrier) => this.host.parentMessageIdForSubagentWaitBarrier(barrier),
      recreateRequiredSubagentWaitBarrierIfMissing: (input) => this.host.recreateRequiredSubagentWaitBarrierIfMissing(input),
    });
  }

  subagentMaturitySnapshots(): ProjectStoreSubagentMaturitySnapshotRepository {
    return new ProjectStoreSubagentMaturitySnapshotRepository({
      getFeatureFlagSettings: () => this.host.getFeatureFlagSettings(),
      getSubagentObservabilitySummary: (input) => this.host.getSubagentObservabilitySummary(input),
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listSubagentMaturityEvidence: () => this.host.listSubagentMaturityEvidence(),
      listSubagentPromptSnapshots: (runId) => this.host.listSubagentPromptSnapshots(runId),
      listSubagentRunEvents: (runId) => this.host.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.host.listSubagentSpawnEdges(),
      listSubagentToolScopeSnapshots: (runId) => this.host.listSubagentToolScopeSnapshots(runId),
      listSubagentWaitBarriers: () => this.host.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.host.listThreadsForSubagentStateInspection(),
    });
  }

  subagentRepairDiagnostics(): ProjectStoreSubagentRepairDiagnosticsRepository {
    return new ProjectStoreSubagentRepairDiagnosticsRepository(this.host.requireDb(), {
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listCallableWorkflowTasks: () => this.host.listCallableWorkflowTasks(),
      listSubagentPromptSnapshots: (runId) => this.host.listSubagentPromptSnapshots(runId),
      listSubagentRunEvents: (runId) => this.host.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.host.listSubagentSpawnEdges(),
      listSubagentToolScopeSnapshots: (runId) => this.host.listSubagentToolScopeSnapshots(runId),
      listSubagentWaitBarriers: () => this.host.listSubagentWaitBarriers(),
      listThreads: () => this.host.listThreads(),
      listThreadsForSubagentStateInspection: () => this.host.listThreadsForSubagentStateInspection(),
      listWorkflowArtifacts: () => this.host.listWorkflowArtifacts(),
      listWorkflowRunsForRestart: () => this.deps.workflowRuns().listWorkflowRunsForRestart(),
    });
  }

  subagentRetentionCleanups(): ProjectStoreSubagentRetentionCleanupRepository {
    return new ProjectStoreSubagentRetentionCleanupRepository({
      appendSubagentRunEventInternal: (runId, input) => this.host.appendSubagentRunEventInternal(runId, input),
      archiveSubagentChildThread: (threadId, archivedAt) => this.deps.threads().archiveSubagentChildThread(threadId, archivedAt),
      listAllSubagentRuns: () => this.host.listAllSubagentRuns(),
      listSubagentWaitBarriers: () => this.host.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.host.listThreadsForSubagentStateInspection(),
    });
  }
}
