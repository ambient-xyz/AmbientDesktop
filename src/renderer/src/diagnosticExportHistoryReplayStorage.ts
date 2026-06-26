import type {
  DiagnosticExportSubagentCompletionGuardSummary,
  DiagnosticExportSubagentLifecycleSummary,
  DiagnosticExportSubagentReplayEvidence,
  DiagnosticExportSubagentReplayParentMailboxItem,
  DiagnosticExportSubagentReplaySummary,
  DiagnosticExportSubagentReplayTimelineItem,
  DiagnosticExportSubagentReplayTranscriptItem,
} from "../../shared/diagnosticTypes";
import type { SubagentRepairIssueKind } from "../../shared/subagentTypes";
import {
  MAX_ERROR_MESSAGES,
  MAX_EVIDENCE_STRING_CHARS,
  MAX_REPLAY_ROWS,
  MAX_RESTART_REPAIR_IDS,
  MAX_SUMMARY_MESSAGE_CHARS,
  arrayValue,
  boundedString,
  boundedStringArray,
  chatRoleValue,
  healthStatusValue,
  nonNegativeInteger,
  objectValue,
} from "./diagnosticExportHistoryStorageUtils";

const SUBAGENT_REPAIR_ISSUE_KINDS = new Set<SubagentRepairIssueKind>([
  "missing_parent_thread",
  "missing_child_thread",
  "orphan_child_thread",
  "thread_run_mismatch",
  "active_run_interrupted",
  "missing_lifecycle_start",
  "missing_lifecycle_stop",
  "missing_feature_flag_snapshot",
  "subagent_feature_flag_disabled",
  "missing_model_runtime_snapshot",
  "model_runtime_snapshot_mismatch",
  "missing_capacity_lease",
  "capacity_lease_mismatch",
  "missing_prompt_snapshot",
  "prompt_snapshot_mismatch",
  "missing_tool_scope_snapshot",
  "tool_scope_snapshot_mismatch",
  "missing_result_artifact",
  "invalid_result_artifact",
  "result_artifact_mismatch",
  "missing_spawn_edge",
  "dangling_spawn_edge",
  "spawn_edge_mismatch",
  "dangling_wait_barrier_child",
  "parent_cancel_control_unreconciled",
]);

export function diagnosticReplaySummaryFromStorage(input: unknown): DiagnosticExportSubagentReplaySummary | undefined {
  const value = objectValue(input);
  const status = healthStatusValue(value?.status);
  const message = boundedString(value?.message, MAX_SUMMARY_MESSAGE_CHARS);
  const runCount = nonNegativeInteger(value?.runCount);
  const childThreadCount = nonNegativeInteger(value?.childThreadCount);
  const persistedRunEventCount = nonNegativeInteger(value?.persistedRunEventCount);
  const runtimeEventCount = nonNegativeInteger(value?.runtimeEventCount);
  const parentMailboxEventCount = nonNegativeInteger(value?.parentMailboxEventCount);
  const transcriptMessageCount = nonNegativeInteger(value?.transcriptMessageCount);
  const callableWorkflowTaskCount = nonNegativeInteger(value?.callableWorkflowTaskCount) ?? 0;
  const truncated = typeof value?.truncated === "boolean" ? value.truncated : undefined;
  if (
    !status ||
    !message ||
    runCount === undefined ||
    childThreadCount === undefined ||
    persistedRunEventCount === undefined ||
    runtimeEventCount === undefined ||
    parentMailboxEventCount === undefined ||
    transcriptMessageCount === undefined ||
    truncated === undefined
  ) {
    return undefined;
  }
  return {
    status,
    message,
    runCount,
    childThreadCount,
    persistedRunEventCount,
    runtimeEventCount,
    parentMailboxEventCount,
    transcriptMessageCount,
    callableWorkflowTaskCount,
    truncated,
    errorMessages: boundedStringArray(value?.errorMessages, MAX_ERROR_MESSAGES, MAX_SUMMARY_MESSAGE_CHARS),
  };
}

export function diagnosticReplayEvidenceFromStorage(input: unknown): DiagnosticExportSubagentReplayEvidence | undefined {
  const value = objectValue(input);
  if (
    value?.schemaVersion !== "ambient-subagent-replay-evidence-v1" ||
    value.source !== "diagnostic_export" ||
    value.liveTokens !== false
  ) {
    return undefined;
  }
  const createdAt = boundedString(value.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const truncated = typeof value.truncated === "boolean" ? value.truncated : undefined;
  const counts = diagnosticReplayCountsFromStorage(value.counts);
  const shownCounts = diagnosticReplayCountsFromStorage(value.shownCounts);
  const restartRepair = diagnosticReplayRestartRepairFromStorage(value.restartRepair);
  if (!createdAt || truncated === undefined || !counts || !shownCounts || !restartRepair) return undefined;
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    source: "diagnostic_export",
    createdAt,
    liveTokens: false,
    truncated,
    counts,
    shownCounts,
    childThreads: arrayValue(value.childThreads)
      .flatMap((thread) => {
        const parsed = diagnosticReplayChildThreadFromStorage(thread);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    runtimeEventTimeline: arrayValue(value.runtimeEventTimeline)
      .flatMap((event) => {
        const parsed = diagnosticReplayTimelineItemFromStorage(event);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    persistedRunEventTimeline: arrayValue(value.persistedRunEventTimeline)
      .flatMap((event) => {
        const parsed = diagnosticReplayTimelineItemFromStorage(event);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    parentMailboxTimeline: arrayValue(value.parentMailboxTimeline)
      .flatMap((event) => {
        const parsed = diagnosticReplayParentMailboxItemFromStorage(event);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    transcriptTimeline: arrayValue(value.transcriptTimeline)
      .flatMap((item) => {
        const parsed = diagnosticReplayTranscriptItemFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    callableWorkflowTaskTimeline: arrayValue(value.callableWorkflowTaskTimeline)
      .flatMap((item) => {
        const parsed = diagnosticReplayCallableWorkflowTaskFromStorage(item);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
    restartRepair,
  };
}

function diagnosticReplayCountsFromStorage(input: unknown): DiagnosticExportSubagentReplayEvidence["counts"] | undefined {
  const value = objectValue(input);
  const runs = nonNegativeInteger(value?.runs);
  const childThreads = nonNegativeInteger(value?.childThreads);
  const persistedRunEvents = nonNegativeInteger(value?.persistedRunEvents);
  const runtimeEvents = nonNegativeInteger(value?.runtimeEvents);
  const parentMailboxEvents = nonNegativeInteger(value?.parentMailboxEvents);
  const transcriptMessages = nonNegativeInteger(value?.transcriptMessages);
  const callableWorkflowTasks = nonNegativeInteger(value?.callableWorkflowTasks) ?? 0;
  if (
    runs === undefined ||
    childThreads === undefined ||
    persistedRunEvents === undefined ||
    runtimeEvents === undefined ||
    parentMailboxEvents === undefined ||
    transcriptMessages === undefined
  ) {
    return undefined;
  }
  return { runs, childThreads, persistedRunEvents, runtimeEvents, parentMailboxEvents, transcriptMessages, callableWorkflowTasks };
}

function diagnosticReplayChildThreadFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["childThreads"][number] | undefined {
  const value = objectValue(input);
  const threadId = boundedString(value?.threadId, MAX_SUMMARY_MESSAGE_CHARS);
  if (!threadId) return undefined;
  return {
    threadId,
    ...(boundedString(value?.runId, MAX_EVIDENCE_STRING_CHARS) ? { runId: boundedString(value?.runId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { parentThreadId: boundedString(value?.parentThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.parentRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { parentRunId: boundedString(value?.parentRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS)
      ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value?.collapsedByDefault === "boolean" ? { collapsedByDefault: value.collapsedByDefault } : {}),
    ...(boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
}

function diagnosticReplayTimelineItemFromStorage(input: unknown): DiagnosticExportSubagentReplayTimelineItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const runId = boundedString(value?.runId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const childThreadId = boundedString(value?.childThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const type = boundedString(value?.type, MAX_SUMMARY_MESSAGE_CHARS);
  if (sequence === undefined || !createdAt || !runId || !parentRunId || !childThreadId || !type) return undefined;
  return {
    sequence,
    createdAt,
    runId,
    parentRunId,
    childThreadId,
    type,
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS)
      ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.roleId, MAX_EVIDENCE_STRING_CHARS) ? { roleId: boundedString(value?.roleId, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.source, MAX_EVIDENCE_STRING_CHARS) ? { source: boundedString(value?.source, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value?.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value?.toolName, MAX_EVIDENCE_STRING_CHARS)
      ? { toolName: boundedString(value?.toolName, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.textPreview, MAX_EVIDENCE_STRING_CHARS)
      ? { textPreview: boundedString(value?.textPreview, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.messagePreview, MAX_EVIDENCE_STRING_CHARS)
      ? { messagePreview: boundedString(value?.messagePreview, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.artifactPath, MAX_EVIDENCE_STRING_CHARS)
      ? { artifactPath: boundedString(value?.artifactPath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.approvalId, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalId: boundedString(value?.approvalId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalSource: boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value?.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value?.worktreePath, MAX_EVIDENCE_STRING_CHARS)
      ? { worktreePath: boundedString(value?.worktreePath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
  };
}

function diagnosticReplayParentMailboxItemFromStorage(input: unknown): DiagnosticExportSubagentReplayParentMailboxItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const id = boundedString(value?.id, MAX_SUMMARY_MESSAGE_CHARS);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const updatedAt = boundedString(value?.updatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const type = boundedString(value?.type, MAX_SUMMARY_MESSAGE_CHARS);
  const deliveryState = subagentMailboxDeliveryState(value?.deliveryState);
  if (sequence === undefined || !id || !createdAt || !updatedAt || !parentThreadId || !parentRunId || !type || !deliveryState) {
    return undefined;
  }
  const deniedCategoryIds = boundedStringArray(value?.deniedCategoryIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedToolIds = boundedStringArray(value?.deniedToolIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedCategoryLabels = boundedStringArray(value?.deniedCategoryLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const deniedToolLabels = boundedStringArray(value?.deniedToolLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const childThreadIds = boundedStringArray(value?.childThreadIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const canonicalTaskPaths = boundedStringArray(value?.canonicalTaskPaths, 80, MAX_EVIDENCE_STRING_CHARS);
  const childSourceLabels = boundedStringArray(value?.childSourceLabels, 80, MAX_EVIDENCE_STRING_CHARS);
  const completionGuardSummary = diagnosticReplayCompletionGuardSummaryFromStorage(value?.completionGuardSummary);
  const lifecycleSummary = diagnosticReplayLifecycleSummaryFromStorage(value?.lifecycleSummary);
  return {
    sequence,
    id,
    createdAt,
    updatedAt,
    parentThreadId,
    parentRunId,
    type,
    deliveryState,
    childRunIds: boundedStringArray(value?.childRunIds, 80, MAX_EVIDENCE_STRING_CHARS),
    ...(childThreadIds.length ? { childThreadIds } : {}),
    ...(canonicalTaskPaths.length ? { canonicalTaskPaths } : {}),
    ...(childSourceLabels.length ? { childSourceLabels } : {}),
    ...(boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS)
      ? { parentMessageId: boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.idempotencyKey, MAX_EVIDENCE_STRING_CHARS)
      ? { idempotencyKey: boundedString(value?.idempotencyKey, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.payloadPreview, MAX_EVIDENCE_STRING_CHARS)
      ? { payloadPreview: boundedString(value?.payloadPreview, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.failureStage, MAX_EVIDENCE_STRING_CHARS)
      ? { failureStage: boundedString(value?.failureStage, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.approvalMode, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalMode: boundedString(value?.approvalMode, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value?.approvalUnavailable === "boolean" ? { approvalUnavailable: value.approvalUnavailable } : {}),
    ...(deniedCategoryIds.length ? { deniedCategoryIds } : {}),
    ...(deniedToolIds.length ? { deniedToolIds } : {}),
    ...(deniedCategoryLabels.length ? { deniedCategoryLabels } : {}),
    ...(deniedToolLabels.length ? { deniedToolLabels } : {}),
    ...(completionGuardSummary ? { completionGuardSummary } : {}),
    ...(lifecycleSummary ? { lifecycleSummary } : {}),
  };
}

function diagnosticReplayCompletionGuardSummaryFromStorage(input: unknown): DiagnosticExportSubagentCompletionGuardSummary | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const summary: DiagnosticExportSubagentCompletionGuardSummary = {
    ...(typeof value.valid === "boolean" ? { valid: value.valid } : {}),
    ...(typeof value.synthesisAllowed === "boolean" ? { synthesisAllowed: value.synthesisAllowed } : {}),
    ...(typeof value.required === "boolean" ? { required: value.required } : {}),
    ...(nonNegativeInteger(value.structuredEvidenceCount) !== undefined
      ? { structuredEvidenceCount: nonNegativeInteger(value.structuredEvidenceCount) }
      : {}),
    ...(nonNegativeInteger(value.ambientEvidenceCount) !== undefined
      ? { ambientEvidenceCount: nonNegativeInteger(value.ambientEvidenceCount) }
      : {}),
    ...(nonNegativeInteger(value.isolatedWorktreeEvidenceCount) !== undefined
      ? { isolatedWorktreeEvidenceCount: nonNegativeInteger(value.isolatedWorktreeEvidenceCount) }
      : {}),
    ...(nonNegativeInteger(value.approvalEvidenceCount) !== undefined
      ? { approvalEvidenceCount: nonNegativeInteger(value.approvalEvidenceCount) }
      : {}),
    ...(boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) ? { reason: boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function diagnosticReplayLifecycleSummaryFromStorage(input: unknown): DiagnosticExportSubagentLifecycleSummary | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  const detachedRunIds = boundedStringArray(value.detachedRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledRunIds = boundedStringArray(value.cancelledRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const stoppedChildRunIds = boundedStringArray(value.stoppedChildRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const unchangedRunIds = boundedStringArray(value.unchangedRunIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledWaitBarrierIds = boundedStringArray(value.cancelledWaitBarrierIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const cancelledMailboxEventIds = boundedStringArray(value.cancelledMailboxEventIds, 80, MAX_EVIDENCE_STRING_CHARS);
  const summary: DiagnosticExportSubagentLifecycleSummary = {
    ...(boundedString(value.action, MAX_EVIDENCE_STRING_CHARS) ? { action: boundedString(value.action, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.source, MAX_EVIDENCE_STRING_CHARS) ? { source: boundedString(value.source, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.status, MAX_EVIDENCE_STRING_CHARS) ? { status: boundedString(value.status, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.waitBarrierId, MAX_EVIDENCE_STRING_CHARS)
      ? { waitBarrierId: boundedString(value.waitBarrierId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.barrierStatus, MAX_EVIDENCE_STRING_CHARS)
      ? { barrierStatus: boundedString(value.barrierStatus, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) ? { reason: boundedString(value.reason, MAX_EVIDENCE_STRING_CHARS) } : {}),
    ...(boundedString(value.userDecisionPreview, MAX_EVIDENCE_STRING_CHARS)
      ? { userDecisionPreview: boundedString(value.userDecisionPreview, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.partialSummaryPreview, MAX_EVIDENCE_STRING_CHARS)
      ? { partialSummaryPreview: boundedString(value.partialSummaryPreview, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(detachedRunIds.length ? { detachedRunIds } : {}),
    ...(cancelledRunIds.length ? { cancelledRunIds } : {}),
    ...(stoppedChildRunIds.length ? { stoppedChildRunIds } : {}),
    ...(unchangedRunIds.length ? { unchangedRunIds } : {}),
    ...(cancelledWaitBarrierIds.length ? { cancelledWaitBarrierIds } : {}),
    ...(cancelledMailboxEventIds.length ? { cancelledMailboxEventIds } : {}),
    ...(typeof value.parentCancellationRequested === "boolean" ? { parentCancellationRequested: value.parentCancellationRequested } : {}),
  };
  return Object.keys(summary).length ? summary : undefined;
}

function diagnosticReplayTranscriptItemFromStorage(input: unknown): DiagnosticExportSubagentReplayTranscriptItem | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const threadId = boundedString(value?.threadId, MAX_SUMMARY_MESSAGE_CHARS);
  const role = chatRoleValue(value?.role);
  const contentPreview = boundedString(value?.contentPreview, MAX_SUMMARY_MESSAGE_CHARS);
  if (sequence === undefined || !createdAt || !threadId || !role || !contentPreview) return undefined;
  return {
    sequence,
    createdAt,
    threadId,
    role,
    contentPreview,
    ...(boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { childRunId: boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { childThreadId: boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
  };
}

function diagnosticReplayCallableWorkflowTaskFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const taskId = boundedString(value?.taskId, MAX_SUMMARY_MESSAGE_CHARS);
  const launchId = boundedString(value?.launchId, MAX_SUMMARY_MESSAGE_CHARS);
  const createdAt = boundedString(value?.createdAt, MAX_SUMMARY_MESSAGE_CHARS);
  const updatedAt = boundedString(value?.updatedAt, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  const toolName = boundedString(value?.toolName, MAX_SUMMARY_MESSAGE_CHARS);
  const sourceKind = boundedString(value?.sourceKind, MAX_SUMMARY_MESSAGE_CHARS);
  const title = boundedString(value?.title, MAX_SUMMARY_MESSAGE_CHARS);
  const status = callableWorkflowTaskStatus(value?.status);
  const statusLabel = boundedString(value?.statusLabel, MAX_SUMMARY_MESSAGE_CHARS);
  const blocking = typeof value?.blocking === "boolean" ? value.blocking : undefined;
  const runnerDeferredReason = boundedString(value?.runnerDeferredReason, MAX_SUMMARY_MESSAGE_CHARS);
  const artifactLinkState = callableWorkflowArtifactLinkState(value?.artifactLinkState);
  const runLinkState = callableWorkflowRunLinkState(value?.runLinkState);
  if (
    sequence === undefined ||
    !taskId ||
    !launchId ||
    !createdAt ||
    !updatedAt ||
    !parentThreadId ||
    !parentRunId ||
    !toolName ||
    !sourceKind ||
    !title ||
    !status ||
    !statusLabel ||
    blocking === undefined ||
    !runnerDeferredReason ||
    !artifactLinkState ||
    !runLinkState
  ) {
    return undefined;
  }
  const tokenCount = nonNegativeInteger(value?.tokenCount);
  const costMicros = nonNegativeInteger(value?.costMicros);
  return {
    sequence,
    taskId,
    launchId,
    createdAt,
    updatedAt,
    parentThreadId,
    parentRunId,
    toolName,
    sourceKind,
    title,
    status,
    statusLabel,
    blocking,
    runnerDeferredReason,
    workflowRunEventTypes: boundedStringArray(value?.workflowRunEventTypes, 80, MAX_EVIDENCE_STRING_CHARS),
    artifactLinkState,
    runLinkState,
    ...(boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS)
      ? { parentMessageId: boundedString(value?.parentMessageId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.workflowThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowThreadId: boundedString(value?.workflowThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowArtifactId: boundedString(value?.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.workflowArtifactTitle, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowArtifactTitle: boundedString(value?.workflowArtifactTitle, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(workflowArtifactStatus(value?.workflowArtifactStatus)
      ? { workflowArtifactStatus: workflowArtifactStatus(value?.workflowArtifactStatus)! }
      : {}),
    ...(boundedString(value?.workflowRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowRunId: boundedString(value?.workflowRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(workflowRunStatus(value?.workflowRunStatus) ? { workflowRunStatus: workflowRunStatus(value?.workflowRunStatus)! } : {}),
    ...(boundedString(value?.callerKind, MAX_EVIDENCE_STRING_CHARS)
      ? { callerKind: boundedString(value?.callerKind, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { childThreadId: boundedString(value?.childThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { childRunId: boundedString(value?.childRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { subagentRunId: boundedString(value?.subagentRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS)
      ? { canonicalTaskPath: boundedString(value?.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalSource: boundedString(value?.approvalSource, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.approvalScope, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalScope: boundedString(value?.approvalScope, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value?.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value?.worktreeStatus, MAX_EVIDENCE_STRING_CHARS)
      ? { worktreeStatus: boundedString(value?.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS)
      ? { nestedFanoutSource: boundedString(value?.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.lastEventType, MAX_EVIDENCE_STRING_CHARS)
      ? { lastEventType: boundedString(value?.lastEventType, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value?.lastEventMessage, MAX_EVIDENCE_STRING_CHARS)
      ? { lastEventMessage: boundedString(value?.lastEventMessage, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(tokenCount !== undefined ? { tokenCount } : {}),
    ...(costMicros !== undefined ? { costMicros } : {}),
  };
}

function callableWorkflowTaskStatus(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["status"] | undefined {
  return value === "queued" ||
    value === "compiling" ||
    value === "running" ||
    value === "paused" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "canceled"
    ? value
    : undefined;
}

function workflowArtifactStatus(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["workflowArtifactStatus"] | undefined {
  return value === "draft" || value === "ready_for_preview" || value === "approved" || value === "rejected" || value === "archived"
    ? value
    : undefined;
}

function workflowRunStatus(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["workflowRunStatus"] | undefined {
  return value === "created" ||
    value === "previewed" ||
    value === "running" ||
    value === "paused" ||
    value === "needs_input" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "canceled" ||
    value === "skipped"
    ? value
    : undefined;
}

function callableWorkflowArtifactLinkState(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["artifactLinkState"] | undefined {
  return value === "not_linked" || value === "linked" || value === "missing" ? value : undefined;
}

function callableWorkflowRunLinkState(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]["runLinkState"] | undefined {
  return value === "not_linked" || value === "linked" || value === "missing" || value === "artifact_mismatch" ? value : undefined;
}

function subagentMailboxDeliveryState(value: unknown): DiagnosticExportSubagentReplayParentMailboxItem["deliveryState"] | undefined {
  return value === "queued" || value === "delivered" || value === "consumed" || value === "failed" || value === "cancelled"
    ? value
    : undefined;
}

function diagnosticReplayRestartRepairFromStorage(input: unknown): DiagnosticExportSubagentReplayEvidence["restartRepair"] | undefined {
  const value = objectValue(input);
  if (!value) return undefined;
  return {
    observedIssueKinds: arrayValue(value.observedIssueKinds)
      .filter(
        (kind): kind is SubagentRepairIssueKind =>
          typeof kind === "string" && SUBAGENT_REPAIR_ISSUE_KINDS.has(kind as SubagentRepairIssueKind),
      )
      .slice(0, MAX_RESTART_REPAIR_IDS),
    repairedRunIds: boundedStringArray(value.repairedRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    repairedBarrierIds: boundedStringArray(value.repairedBarrierIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    repairedParentControlBarrierIds: boundedStringArray(
      value.repairedParentControlBarrierIds,
      MAX_RESTART_REPAIR_IDS,
      MAX_SUMMARY_MESSAGE_CHARS,
    ),
    repairableSpawnEdgeRunIds: boundedStringArray(value.repairableSpawnEdgeRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    danglingSpawnEdgeRunIds: boundedStringArray(value.danglingSpawnEdgeRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    diagnosticRunIds: boundedStringArray(value.diagnosticRunIds, MAX_RESTART_REPAIR_IDS, MAX_SUMMARY_MESSAGE_CHARS),
    callableWorkflowTaskIssues: arrayValue(value.callableWorkflowTaskIssues)
      .flatMap((issue) => {
        const parsed = diagnosticReplayCallableWorkflowRestartIssueFromStorage(issue);
        return parsed ? [parsed] : [];
      })
      .slice(0, MAX_REPLAY_ROWS),
  };
}

function diagnosticReplayCallableWorkflowRestartIssueFromStorage(
  input: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number] | undefined {
  const value = objectValue(input);
  const sequence = nonNegativeInteger(value?.sequence);
  const issueId = boundedString(value?.issueId, MAX_SUMMARY_MESSAGE_CHARS);
  const kind = callableWorkflowTaskRestartIssueKind(value?.kind);
  const severity = diagnosticSeverity(value?.severity);
  const messagePreview = boundedString(value?.messagePreview, MAX_SUMMARY_MESSAGE_CHARS);
  const taskId = boundedString(value?.taskId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentThreadId = boundedString(value?.parentThreadId, MAX_SUMMARY_MESSAGE_CHARS);
  const parentRunId = boundedString(value?.parentRunId, MAX_SUMMARY_MESSAGE_CHARS);
  if (!value || sequence === undefined || !issueId || !kind || !severity || !messagePreview || !taskId || !parentThreadId || !parentRunId) {
    return undefined;
  }
  const taskStatus = callableWorkflowTaskStatus(value.taskStatus);
  return {
    sequence,
    issueId,
    kind,
    severity,
    messagePreview,
    taskId,
    parentThreadId,
    parentRunId,
    ...(taskStatus ? { taskStatus } : {}),
    ...(boundedString(value.taskStatusLabel, MAX_EVIDENCE_STRING_CHARS)
      ? { taskStatusLabel: boundedString(value.taskStatusLabel, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value.blocking === "boolean" ? { blocking: value.blocking } : {}),
    ...(boundedString(value.runnerDeferredReason, MAX_EVIDENCE_STRING_CHARS)
      ? { runnerDeferredReason: boundedString(value.runnerDeferredReason, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowArtifactId: boundedString(value.workflowArtifactId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.workflowRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { workflowRunId: boundedString(value.workflowRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.callerKind, MAX_EVIDENCE_STRING_CHARS)
      ? { callerKind: boundedString(value.callerKind, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.callerThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { callerThreadId: boundedString(value.callerThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.callerRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { callerRunId: boundedString(value.callerRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.childThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { childThreadId: boundedString(value.childThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.childRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { childRunId: boundedString(value.childRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.subagentRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { subagentRunId: boundedString(value.subagentRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS)
      ? { canonicalTaskPath: boundedString(value.canonicalTaskPath, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.childParentThreadId, MAX_EVIDENCE_STRING_CHARS)
      ? { childParentThreadId: boundedString(value.childParentThreadId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.childParentRunId, MAX_EVIDENCE_STRING_CHARS)
      ? { childParentRunId: boundedString(value.childParentRunId, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.approvalSource, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalSource: boundedString(value.approvalSource, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(boundedString(value.approvalScope, MAX_EVIDENCE_STRING_CHARS)
      ? { approvalScope: boundedString(value.approvalScope, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value.worktreeRequired === "boolean" ? { worktreeRequired: value.worktreeRequired } : {}),
    ...(typeof value.worktreeIsolated === "boolean" ? { worktreeIsolated: value.worktreeIsolated } : {}),
    ...(boundedString(value.worktreeStatus, MAX_EVIDENCE_STRING_CHARS)
      ? { worktreeStatus: boundedString(value.worktreeStatus, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
    ...(typeof value.nestedFanoutRequired === "boolean" ? { nestedFanoutRequired: value.nestedFanoutRequired } : {}),
    ...(boundedString(value.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS)
      ? { nestedFanoutSource: boundedString(value.nestedFanoutSource, MAX_EVIDENCE_STRING_CHARS) }
      : {}),
  };
}

function callableWorkflowTaskRestartIssueKind(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number]["kind"] | undefined {
  return value === "missing_parent_thread" ||
    value === "missing_parent_run" ||
    value === "parent_run_thread_mismatch" ||
    value === "active_task_interrupted" ||
    value === "missing_workflow_artifact" ||
    value === "missing_workflow_thread" ||
    value === "missing_workflow_run" ||
    value === "workflow_run_artifact_mismatch" ||
    value === "missing_task_artifact_link" ||
    value === "workflow_run_terminal_task_unfinished"
    ? value
    : undefined;
}

function diagnosticSeverity(
  value: unknown,
): DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number]["severity"] | undefined {
  return value === "info" || value === "warning" || value === "error" ? value : undefined;
}
