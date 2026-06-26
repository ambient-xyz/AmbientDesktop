import type { AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import type {
  DiagnosticExportHealthStatus,
  DiagnosticExportLocalRuntimeEvidence,
  DiagnosticExportLocalRuntimeSummary,
  DiagnosticExportResult,
  DiagnosticExportSubagentCompletionGuardSummary,
  DiagnosticExportSubagentLifecycleSummary,
  DiagnosticExportSubagentReplayEvidence,
  DiagnosticExportSubagentReplayParentMailboxItem,
  DiagnosticExportSubagentReplayTimelineItem,
} from "../../shared/diagnosticTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";
import { diagnosticExportHistoryEntryId, selectedDiagnosticExportFromHistory } from "./diagnosticExportHistoryStorage";

export interface DiagnosticExportHistoryModel {
  summary: string;
  rows: DiagnosticExportHistoryRowModel[];
  searchText: string;
}

export interface DiagnosticExportHistoryRowModel {
  id: string;
  label: string;
  detail: string;
  replayStatus: string;
  replayTone: "success" | "warning" | "danger" | "neutral";
  localRuntimeStatus: string;
  localRuntimeTone: "success" | "warning" | "danger" | "neutral";
  selected: boolean;
  path: string;
  searchText: string;
}

export function diagnosticExportHistoryModel(
  history: DiagnosticExportResult[],
  selectedId: string | undefined,
): DiagnosticExportHistoryModel | undefined {
  if (!history.length) return undefined;
  const selected = selectedDiagnosticExportFromHistory(history, selectedId);
  const selectedEntryId = selected ? diagnosticExportHistoryEntryId(selected) : undefined;
  const rows = history.map((entry) => diagnosticExportHistoryRow(entry, selectedEntryId));
  return {
    summary: `${history.length} diagnostic bundle${history.length === 1 ? "" : "s"} available`,
    rows,
    searchText: rows.map((row) => row.searchText).join(" "),
  };
}

function diagnosticExportHistoryRow(result: DiagnosticExportResult, selectedId: string | undefined): DiagnosticExportHistoryRowModel {
  const id = diagnosticExportHistoryEntryId(result);
  const replay = result.summary?.subagents.replayEvidence;
  const localRuntime = result.summary?.localRuntimes;
  const agentMemory = result.summary?.agentMemory;
  const agentMemoryStarter = result.summary?.agentMemoryStarter;
  const featureFlagStatus = diagnosticFeatureFlagStatus(result.summary?.featureFlags);
  const agentMemoryStatus = agentMemory
    ? [
        agentMemory.status === "healthy" ? "Agent memory healthy" : `Agent memory ${agentMemory.status.replace(/_/g, " ")}`,
        agentMemory.fileCount > 0 ? countLabel(agentMemory.fileCount, "memory file") : undefined,
        agentMemory.runtimeSnapshots.length > 0 ? countLabel(agentMemory.runtimeSnapshots.length, "runtime snapshot") : undefined,
      ]
        .filter(Boolean)
        .join(" / ")
    : undefined;
  const agentMemoryStarterStatus = agentMemoryStarter
    ? [
        agentMemoryStarter.state === "ready"
          ? "Agent memory starter ready"
          : `Agent memory starter ${agentMemoryStarter.state.replace(/_/g, " ")}`,
        agentMemoryStarter.nextActions.length > 0 ? `next ${agentMemoryStarter.nextActions.join(", ")}` : undefined,
        agentMemoryStarter.blockers.length > 0 ? countLabel(agentMemoryStarter.blockers.length, "starter blocker") : undefined,
      ]
        .filter(Boolean)
        .join(" / ")
    : undefined;
  const replayStatus = replay
    ? [
        replay.status === "healthy" ? "Replay healthy" : `Replay ${replay.status.replace(/_/g, " ")}`,
        replay.runCount > 0 ? countLabel(replay.runCount, "child run") : undefined,
        replay.runtimeEventCount > 0 ? countLabel(replay.runtimeEventCount, "runtime event") : undefined,
        replay.truncated ? "bounded" : undefined,
      ]
        .filter(Boolean)
        .join(" / ")
    : "Replay unavailable";
  const localRuntimeStatus = localRuntime
    ? [
        localRuntime.status === "healthy" ? "Local runtime healthy" : `Local runtime ${localRuntime.status.replace(/_/g, " ")}`,
        localRuntime.runtimeCount > 0 ? countLabel(localRuntime.runtimeCount, "runtime") : undefined,
        localRuntime.activeLeaseCount > 0 ? countLabel(localRuntime.activeLeaseCount, "active lease") : undefined,
        localRuntime.stopBlockedCount > 0 ? countLabel(localRuntime.stopBlockedCount, "stop blocker") : undefined,
        localRuntime.restartBlockedCount > 0 ? countLabel(localRuntime.restartBlockedCount, "restart blocker") : undefined,
        localRuntime.untrackedCount > 0 ? processCountLabel(localRuntime.untrackedCount, "untracked") : undefined,
        localRuntime.memoryPolicyOutcome &&
        localRuntime.memoryPolicyOutcome !== "within-limit" &&
        localRuntime.memoryPolicyOutcome !== "unlimited"
          ? `memory ${localRuntime.memoryPolicyOutcome}`
          : undefined,
      ]
        .filter(Boolean)
        .join(" / ")
    : "Local runtime unavailable";
  const label = fileNameFromPath(result.path);
  const loadedEvidence = [
    result.subagents?.replayEvidence ? "timeline evidence loaded" : undefined,
    result.localRuntimes?.evidence ? "runtime evidence loaded" : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const detail = [
    result.createdAt,
    formatDiagnosticExportSize(result.bytes),
    featureFlagStatus,
    loadedEvidence || (replay || localRuntime || agentMemory || agentMemoryStarter ? "summary only" : undefined),
  ]
    .filter(Boolean)
    .join(" / ");
  const replayEvidence = result.subagents?.replayEvidence;
  const localRuntimeEvidence = result.localRuntimes?.evidence;
  const searchText = [
    label,
    result.path,
    result.createdAt,
    featureFlagStatus,
    replayStatus,
    replay?.message,
    agentMemoryStatus,
    agentMemory ? diagnosticAgentMemorySearchText(agentMemory) : undefined,
    agentMemoryStarterStatus,
    agentMemoryStarter ? diagnosticAgentMemoryStarterSearchText(agentMemoryStarter) : undefined,
    localRuntimeStatus,
    localRuntime ? diagnosticLocalRuntimeSearchText(localRuntime) : undefined,
    replayEvidence ? diagnosticReplayEvidenceSearchText(replayEvidence) : undefined,
    localRuntimeEvidence ? diagnosticLocalRuntimeEvidenceSearchText(localRuntimeEvidence) : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    label,
    detail,
    replayStatus,
    replayTone: replayTone(replay?.status, replay?.truncated),
    localRuntimeStatus,
    localRuntimeTone: localRuntimeTone(localRuntime?.status),
    selected: id === selectedId,
    path: result.path,
    searchText,
  };
}

function diagnosticAgentMemorySearchText(summary: AgentMemoryStorageDiagnostics): string {
  return [
    summary.message,
    summary.status,
    summary.featureEnabled ? "memory feature enabled" : "memory feature disabled",
    summary.settingsEnabled ? "memory setting enabled" : "memory setting disabled",
    summary.defaultThreadEnabled ? "memory default threads enabled" : "memory default threads disabled",
    `memory embeddings ${summary.embedding.status}`,
    summary.embedding.modelId,
    summary.embedding.providerId,
    `active threads ${summary.activeThreadCount}`,
    `thread enabled ${summary.threadEnabledCount}`,
    summary.dataDirExists ? "memory data dir exists" : "memory data dir missing",
    `memory storage schema ${summary.storageSchemaStatus}`,
    summary.storageSchemaVersion,
    summary.storageSchemaMessage,
    `memory files ${summary.fileCount}`,
    `memory bytes ${summary.totalBytes}`,
    `memory top level ${summary.topLevelEntryCount}`,
    summary.rawContentIncluded ? undefined : "raw memory content omitted",
    summary.nativePreflight ? `native preflight ${summary.nativePreflight.status} ${summary.nativePreflight.message}` : undefined,
    summary.nativePreflight?.dependencies
      .map((dependency) =>
        [dependency.name, dependency.status, dependency.resolvable ? "resolvable" : "unresolved", dependency.version]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    summary.errors.join(" "),
    summary.runtimeSnapshots
      .map((snapshot) =>
        [
          snapshot.threadId,
          snapshot.active ? "active" : "inactive",
          snapshot.lastInitialize?.status,
          snapshot.lastInitialize?.message,
          snapshot.lastRecall?.status,
          snapshot.lastRecall?.message,
          snapshot.lastCapture?.status,
          snapshot.lastCapture?.message,
          snapshot.lastSearch?.status,
          snapshot.lastSearch?.message,
          snapshot.lastContextInjection ? `context injection ${snapshot.lastContextInjection.totalInjectedChars} chars` : undefined,
          snapshot.lastContextInjection ? `offload ${snapshot.lastContextInjection.offloadContextChars} chars` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticAgentMemoryStarterSearchText(summary: AgentMemoryStarterStatus): string {
  return [
    `memory starter ${summary.state}`,
    summary.settings.featureFlags.tencentDbMemory ? "starter feature enabled" : "starter feature disabled",
    summary.settings.memory.enabled ? "starter global memory enabled" : "starter global memory disabled",
    summary.settings.memory.defaultThreadEnabled ? "starter new threads enabled" : "starter new threads disabled",
    summary.threadScope.activeThreadMemoryEnabled ? "starter active thread enabled" : "starter active thread disabled",
    summary.threadScope.activeThreadId,
    `starter enabled threads ${summary.threadScope.enabledThreadCount ?? 0}`,
    `starter active threads ${summary.threadScope.activeThreadCount ?? 0}`,
    `starter model asset ${summary.assets.model.state}`,
    summary.assets.model.artifactId,
    summary.assets.model.message,
    `starter runtime asset ${summary.assets.runtime.state}`,
    summary.assets.runtime.artifactId,
    summary.assets.runtime.message,
    `starter runtime ${summary.runtime.state}`,
    summary.runtime.runtimeId,
    summary.runtime.message,
    `starter embeddings ${summary.embedding.status}`,
    summary.embedding.modelId,
    summary.embedding.providerId,
    `starter native preflight ${summary.nativePreflight.status}`,
    summary.nativePreflight.message,
    summary.blockers
      .map((blocker) => [blocker.code, blocker.message, blocker.retryable ? "retryable" : "not retryable"].filter(Boolean).join(" "))
      .join(" "),
    summary.nextActions.map((action) => `starter action ${action}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticFeatureFlagStatus(featureFlags: AmbientFeatureFlagSnapshot | undefined): string | undefined {
  const flag = featureFlags?.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG];
  if (!flag) return undefined;
  return `${AMBIENT_SUBAGENTS_FEATURE_FLAG} ${flag.enabled ? "enabled" : "disabled"} via ${flag.source.replace(/_/g, " ")}`;
}

function diagnosticLocalRuntimeSearchText(summary: DiagnosticExportLocalRuntimeSummary): string {
  return [
    summary.message,
    summary.status,
    `runtime ${summary.runtimeCount}`,
    `running ${summary.runningCount}`,
    `active lease ${summary.activeLeaseCount}`,
    `stop blocker ${summary.stopBlockedCount}`,
    `restart blocker ${summary.restartBlockedCount}`,
    `untracked ${summary.untrackedCount}`,
    `stale lease ${summary.staleLeaseCount}`,
    `released lease ${summary.releasedLeaseCount}`,
    `crashed lease ${summary.crashedLeaseCount}`,
    summary.memoryPolicyOutcome ? `memory ${summary.memoryPolicyOutcome}` : undefined,
    summary.memoryPolicyReason,
    summary.errorMessages.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticLocalRuntimeEvidenceSearchText(evidence: DiagnosticExportLocalRuntimeEvidence): string {
  return [
    evidence.capturedAt,
    evidence.truncated ? "runtime evidence bounded" : undefined,
    evidence.runtimes
      .map((runtime) =>
        [
          runtime.runtimeEntryId,
          runtime.capability,
          runtime.trackingStatus,
          runtime.running ? "running" : "stopped",
          runtime.providerId,
          runtime.modelRuntimeId,
          runtime.modelProfileId,
          runtime.modelId,
          runtime.pid === undefined ? undefined : `pid ${runtime.pid}`,
          runtime.endpoint,
          runtime.ownerLabels.join(" "),
          runtime.activeLeaseIds.join(" "),
          runtime.staleLeaseIds.join(" "),
          runtime.releasedLeaseIds.join(" "),
          runtime.crashedLeaseIds.join(" "),
          runtime.ordinaryStopAllowed ? "ordinary stop allowed" : "ordinary stop blocked",
          runtime.ordinaryRestartAllowed ? "ordinary restart allowed" : "ordinary restart blocked",
          runtime.stopReason,
          runtime.restartReason,
          runtime.forceStopRequiresSubagentCancellation ? "force stop requires subagent cancellation" : undefined,
          runtime.forceRestartRequiresSubagentCancellation ? "force restart requires subagent cancellation" : undefined,
          runtime.untracked ? "untracked runtime" : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    evidence.activeOwners
      .map((owner) =>
        [
          owner.runtimeEntryId,
          owner.leaseId,
          owner.displayName,
          owner.status,
          owner.parentThreadId,
          owner.subagentThreadId,
          owner.subagentRunId,
          owner.capabilityKind,
          owner.providerId,
          owner.modelRuntimeId,
          owner.modelProfileId,
          owner.modelId,
          owner.pid === undefined ? undefined : `pid ${owner.pid}`,
          owner.endpoint,
          owner.acquiredAt,
          owner.lastHeartbeatAt,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    evidence.blockedActions
      .map((action) =>
        [
          action.runtimeEntryId,
          action.action,
          action.reason,
          action.blockerLeaseIds.join(" "),
          action.affectedSubagentLabels.join(" "),
          action.affectedSubagentThreadIds.join(" "),
          action.forceAllowed ? "force allowed" : "force blocked",
          action.forceRequiresSubagentCancellation ? "requires subagent cancellation" : undefined,
          action.untracked ? "untracked" : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    evidence.nextSafeActions
      .map((action) =>
        [
          action.action,
          action.safety,
          action.reason,
          action.runtimeEntryId,
          action.runtimeId,
          action.capability,
          action.toolName,
          action.blockerLeaseIds?.join(" "),
          action.affectedSubagentLabels?.join(" "),
          action.ownershipResolution?.lifecycleAction,
          action.ownershipResolution?.resolution,
          action.ownershipResolution?.reason,
          action.ownershipResolution?.blockerLeaseIds.join(" "),
          action.ownershipResolution?.affectedSubagentLabels.join(" "),
          action.untracked ? "untracked" : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    evidence.memoryEvidence.activeResidentMemoryBasis,
    evidence.memoryEvidence.uncertaintyReasons.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayEvidenceSearchText(evidence: DiagnosticExportSubagentReplayEvidence): string {
  return [
    evidence.childThreads
      .map((thread) =>
        [thread.threadId, thread.runId, thread.parentThreadId, thread.parentRunId, thread.canonicalTaskPath, thread.status]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
    evidence.runtimeEventTimeline.map(diagnosticReplayTimelineSearchText).join(" "),
    evidence.persistedRunEventTimeline.map(diagnosticReplayTimelineSearchText).join(" "),
    evidence.parentMailboxTimeline.map(diagnosticReplayParentMailboxSearchText).join(" "),
    evidence.callableWorkflowTaskTimeline.map(diagnosticReplayCallableWorkflowTaskSearchText).join(" "),
    evidence.restartRepair.callableWorkflowTaskIssues.map(diagnosticReplayCallableWorkflowRestartIssueSearchText).join(" "),
    evidence.transcriptTimeline
      .map((item) => [item.threadId, item.childRunId, item.childThreadId, item.role, item.contentPreview].filter(Boolean).join(" "))
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayCallableWorkflowTaskSearchText(
  task: DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number],
): string {
  return [
    task.taskId,
    task.launchId,
    task.parentThreadId,
    task.parentRunId,
    task.parentMessageId,
    task.toolName,
    task.sourceKind,
    task.title,
    task.status,
    task.statusLabel,
    task.runnerDeferredReason,
    task.workflowThreadId,
    task.workflowArtifactId,
    task.workflowArtifactTitle,
    task.workflowArtifactStatus,
    task.workflowRunId,
    task.workflowRunStatus,
    task.workflowRunEventTypes.join(" "),
    task.artifactLinkState,
    task.runLinkState,
    task.callerKind,
    task.childThreadId,
    task.childRunId,
    task.subagentRunId,
    task.canonicalTaskPath,
    task.approvalSource,
    task.approvalScope,
    task.worktreeIsolated === undefined ? undefined : `worktree ${task.worktreeIsolated ? "isolated" : "parent workspace"}`,
    task.worktreeStatus,
    task.nestedFanoutSource,
    task.lastEventType,
    task.lastEventMessage,
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayCallableWorkflowRestartIssueSearchText(
  issue: DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number],
): string {
  return [
    issue.issueId,
    issue.kind,
    issue.severity,
    issue.messagePreview,
    issue.taskId,
    issue.taskStatus,
    issue.taskStatusLabel,
    issue.blocking === undefined ? undefined : issue.blocking ? "blocking" : "background",
    issue.runnerDeferredReason,
    issue.parentThreadId,
    issue.parentRunId,
    issue.workflowArtifactId,
    issue.workflowRunId,
    issue.callerKind,
    issue.callerThreadId,
    issue.callerRunId,
    issue.childThreadId,
    issue.childRunId,
    issue.subagentRunId,
    issue.canonicalTaskPath,
    issue.childParentThreadId,
    issue.childParentRunId,
    issue.approvalSource,
    issue.approvalScope,
    issue.worktreeRequired ? "worktree required" : undefined,
    issue.worktreeIsolated === undefined ? undefined : `worktree ${issue.worktreeIsolated ? "isolated" : "parent workspace"}`,
    issue.worktreeStatus,
    issue.nestedFanoutRequired ? "nested fanout required" : undefined,
    issue.nestedFanoutSource,
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayTimelineSearchText(event: DiagnosticExportSubagentReplayTimelineItem): string {
  return [
    event.runId,
    event.parentRunId,
    event.childThreadId,
    event.canonicalTaskPath,
    event.roleId,
    event.source,
    event.status,
    event.type,
    event.toolName,
    event.textPreview,
    event.messagePreview,
    event.artifactPath,
    event.approvalId,
    event.approvalSource,
    event.worktreeIsolated === undefined ? undefined : `worktree ${event.worktreeIsolated ? "isolated" : "parent workspace"}`,
    event.worktreePath,
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayParentMailboxSearchText(event: DiagnosticExportSubagentReplayParentMailboxItem): string {
  return [
    event.id,
    event.parentThreadId,
    event.parentRunId,
    event.parentMessageId,
    event.type,
    event.deliveryState,
    event.childRunIds.join(" "),
    event.childThreadIds?.join(" "),
    event.canonicalTaskPaths?.join(" "),
    event.childSourceLabels?.join(" "),
    event.failureStage,
    event.approvalMode,
    event.approvalUnavailable === undefined ? undefined : `approval unavailable ${event.approvalUnavailable}`,
    event.deniedCategoryIds?.join(" "),
    event.deniedToolIds?.join(" "),
    event.deniedCategoryLabels?.join(" "),
    event.deniedToolLabels?.join(" "),
    diagnosticReplayCompletionGuardSearchText(event.completionGuardSummary),
    diagnosticReplayLifecycleSummarySearchText(event.lifecycleSummary),
    event.payloadPreview,
    event.idempotencyKey,
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayCompletionGuardSearchText(
  summary: DiagnosticExportSubagentCompletionGuardSummary | undefined,
): string | undefined {
  if (!summary) return undefined;
  return [
    "completion guard",
    summary.valid === undefined ? undefined : `valid ${summary.valid}`,
    summary.synthesisAllowed === undefined ? undefined : `synthesisAllowed ${summary.synthesisAllowed}`,
    summary.required === undefined ? undefined : `required ${summary.required}`,
    summary.structuredEvidenceCount === undefined ? undefined : `structured ${summary.structuredEvidenceCount}`,
    summary.ambientEvidenceCount === undefined ? undefined : `Ambient ${summary.ambientEvidenceCount}`,
    summary.isolatedWorktreeEvidenceCount === undefined ? undefined : `isolated worktree ${summary.isolatedWorktreeEvidenceCount}`,
    summary.approvalEvidenceCount === undefined ? undefined : `approval ${summary.approvalEvidenceCount}`,
    summary.reason,
  ]
    .filter(Boolean)
    .join(" ");
}

function diagnosticReplayLifecycleSummarySearchText(summary: DiagnosticExportSubagentLifecycleSummary | undefined): string | undefined {
  if (!summary) return undefined;
  return [
    "lifecycle",
    summary.action,
    summary.source,
    summary.status,
    summary.waitBarrierId,
    summary.barrierStatus,
    summary.reason,
    summary.userDecisionPreview,
    summary.partialSummaryPreview,
    summary.detachedRunIds?.join(" "),
    summary.cancelledRunIds?.join(" "),
    summary.stoppedChildRunIds?.join(" "),
    summary.unchangedRunIds?.join(" "),
    summary.cancelledWaitBarrierIds?.join(" "),
    summary.cancelledMailboxEventIds?.join(" "),
    summary.parentCancellationRequested === undefined ? undefined : `parentCancellationRequested ${summary.parentCancellationRequested}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function replayTone(status: string | undefined, truncated: boolean | undefined): DiagnosticExportHistoryRowModel["replayTone"] {
  if (status === "error") return "danger";
  if (status === "needs_attention" || truncated) return "warning";
  if (status === "healthy") return "success";
  return "neutral";
}

function localRuntimeTone(status: DiagnosticExportHealthStatus | undefined): DiagnosticExportHistoryRowModel["localRuntimeTone"] {
  if (status === "error") return "danger";
  if (status === "needs_attention") return "warning";
  if (status === "healthy") return "success";
  return "neutral";
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function processCountLabel(count: number, prefix: string): string {
  return `${count} ${prefix} ${count === 1 ? "process" : "processes"}`;
}

function formatDiagnosticExportSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
