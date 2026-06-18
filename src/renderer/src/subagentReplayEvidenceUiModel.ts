import type { DiagnosticExportSubagentCompletionGuardSummary, DiagnosticExportSubagentLifecycleSummary, DiagnosticExportSubagentReplayEvidence, DiagnosticExportSubagentReplayParentMailboxItem, DiagnosticExportSubagentReplaySummary, DiagnosticExportSubagentReplayTimelineItem, DiagnosticExportSubagentReplayTranscriptItem } from "../../shared/diagnosticTypes";

export interface SubagentReplayEvidenceInspectorModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
  summary: string;
  badges: string[];
  countsRows: Array<{ label: string; value: string }>;
  childThreadRows: SubagentReplayEvidenceRowModel[];
  runtimeEventRows: SubagentReplayEvidenceRowModel[];
  persistedEventRows: SubagentReplayEvidenceRowModel[];
  parentMailboxRows: SubagentReplayEvidenceRowModel[];
  callableWorkflowRows: SubagentReplayEvidenceRowModel[];
  transcriptRows: SubagentReplayEvidenceRowModel[];
  restartRepairRows: SubagentReplayEvidenceRowModel[];
  lifecycleEdgeRows: SubagentReplayEvidenceRowModel[];
  searchText: string;
}

export interface SubagentReplayEvidenceRowModel {
  key: string;
  title: string;
  detail: string;
  meta: string;
  tone: "success" | "warning" | "danger" | "neutral";
}

export function subagentReplayEvidenceInspectorModel(
  evidence: DiagnosticExportSubagentReplayEvidence | undefined,
  summary?: DiagnosticExportSubagentReplaySummary,
): SubagentReplayEvidenceInspectorModel | undefined {
  if (!evidence && !summary) return undefined;

  const statusTone = summary ? summaryTone(summary) : evidence?.truncated ? "warning" : "success";
  const statusLabel = summary ? summaryStatusLabel(summary) : evidenceStatusLabel(evidence);
  const lifecycleEdgeRows = evidence ? lifecycleEdgeRowsForEvidence(evidence) : [];
  const badges = [
    summary?.status && summary.status !== "healthy" ? titleCase(summary.status) : undefined,
    evidence?.liveTokens === false ? "Token-free" : undefined,
    evidence?.truncated || summary?.truncated ? "Bounded timeline" : undefined,
    evidence && evidence.counts.runtimeEvents > 0 ? countLabel(evidence.counts.runtimeEvents, "runtime event") : undefined,
    evidence && evidence.counts.persistedRunEvents > 0 ? countLabel(evidence.counts.persistedRunEvents, "persisted event") : undefined,
    evidence && evidence.counts.parentMailboxEvents > 0 ? countLabel(evidence.counts.parentMailboxEvents, "parent mailbox event") : undefined,
    evidence && evidence.counts.callableWorkflowTasks > 0 ? countLabel(evidence.counts.callableWorkflowTasks, "callable workflow task") : undefined,
    evidence && restartRepairCount(evidence) > 0 ? `${restartRepairCount(evidence)} restart repair signals` : undefined,
    lifecycleEdgeRows.length > 0 ? countLabel(lifecycleEdgeRows.length, "lifecycle edge") : undefined,
    summary && summary.errorMessages.length > 0 ? `${summary.errorMessages.length} collection error${summary.errorMessages.length === 1 ? "" : "s"}` : undefined,
  ].filter((badge): badge is string => Boolean(badge));

  const countsRows = evidence ? [
    replayCountRow("Runs", evidence.counts.runs, evidence.shownCounts.runs),
    replayCountRow("Child threads", evidence.counts.childThreads, evidence.shownCounts.childThreads),
    replayCountRow("Runtime events", evidence.counts.runtimeEvents, evidence.shownCounts.runtimeEvents),
    replayCountRow("Persisted events", evidence.counts.persistedRunEvents, evidence.shownCounts.persistedRunEvents),
    replayCountRow("Parent mailbox events", evidence.counts.parentMailboxEvents, evidence.shownCounts.parentMailboxEvents),
    replayCountRow("Transcript messages", evidence.counts.transcriptMessages, evidence.shownCounts.transcriptMessages),
    replayCountRow("Callable workflow tasks", evidence.counts.callableWorkflowTasks, evidence.shownCounts.callableWorkflowTasks),
  ] : [];

  const childThreadRows = evidence?.childThreads.map((thread) => ({
    key: thread.threadId,
    title: thread.canonicalTaskPath || thread.threadId,
    detail: [
      thread.status ? `Status: ${statusValueLabel(thread.status)}` : undefined,
      thread.collapsedByDefault === true ? "Collapsed by default" : undefined,
    ].filter(Boolean).join(" / ") || "Child thread captured in diagnostic replay evidence.",
    meta: [
      thread.runId ? `run ${thread.runId}` : undefined,
      thread.parentRunId ? `parent run ${thread.parentRunId}` : undefined,
      thread.parentThreadId ? `parent thread ${thread.parentThreadId}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: thread.status ? statusToneFromValue(thread.status) : "neutral",
  })) ?? [];

  const runtimeEventRows = evidence?.runtimeEventTimeline.map((event) => timelineRow(event, "runtime")) ?? [];
  const persistedEventRows = evidence?.persistedRunEventTimeline.map((event) => timelineRow(event, "persisted")) ?? [];
  const parentMailboxRows = evidence?.parentMailboxTimeline.map(parentMailboxRow) ?? [];
  const callableWorkflowRows = evidence?.callableWorkflowTaskTimeline.map(callableWorkflowTaskRow) ?? [];
  const transcriptRows = evidence?.transcriptTimeline.map(transcriptRow) ?? [];
  const restartRepairRows = evidence ? restartRepairRowsForEvidence(evidence) : [];

  return {
    statusLabel,
    statusTone,
    summary: summary?.message ?? evidenceSummary(evidence),
    badges,
    countsRows,
    childThreadRows,
    runtimeEventRows,
    persistedEventRows,
    parentMailboxRows,
    callableWorkflowRows,
    transcriptRows,
    restartRepairRows,
    lifecycleEdgeRows,
    searchText: [
      statusLabel,
      summary?.message,
      summary?.errorMessages.join(" "),
      badges.join(" "),
      countsRows.map((row) => `${row.label} ${row.value}`).join(" "),
      childThreadRows.map(rowSearchText).join(" "),
      runtimeEventRows.map(rowSearchText).join(" "),
      persistedEventRows.map(rowSearchText).join(" "),
      parentMailboxRows.map(rowSearchText).join(" "),
      evidence?.parentMailboxTimeline.map(parentMailboxSearchText).join(" "),
      callableWorkflowRows.map(rowSearchText).join(" "),
      evidence?.callableWorkflowTaskTimeline.map(callableWorkflowTaskSearchText).join(" "),
      transcriptRows.map(rowSearchText).join(" "),
      restartRepairRows.map(rowSearchText).join(" "),
      lifecycleEdgeRows.map(rowSearchText).join(" "),
    ].filter(Boolean).join(" "),
  };
}

function callableWorkflowTaskRow(task: DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number]): SubagentReplayEvidenceRowModel {
  const linkDetail = [
    `artifact ${statusValueLabel(task.artifactLinkState)}`,
    `run ${statusValueLabel(task.runLinkState)}`,
  ];
  const provenanceDetail = [
    task.callerKind ? `caller ${sourceLabel(task.callerKind)}` : undefined,
    task.canonicalTaskPath,
    task.childRunId ? `child run ${task.childRunId}` : undefined,
    task.childThreadId ? `child thread ${task.childThreadId}` : undefined,
    task.approvalSource ? `approval ${sourceLabel(task.approvalSource)}` : undefined,
    task.approvalScope ? `scope ${sourceLabel(task.approvalScope)}` : undefined,
    task.worktreeIsolated !== undefined ? `worktree ${task.worktreeIsolated ? "isolated" : "parent workspace"}` : undefined,
    task.worktreeStatus ? `worktree ${statusValueLabel(task.worktreeStatus)}` : undefined,
    task.nestedFanoutSource ? `nested fanout ${sourceLabel(task.nestedFanoutSource)}` : undefined,
  ].filter(Boolean).join(" / ");
  const workflowDetail = [
    task.workflowArtifactTitle ? `artifact title ${task.workflowArtifactTitle}` : undefined,
    task.workflowArtifactStatus ? `artifact ${statusValueLabel(task.workflowArtifactStatus)}` : undefined,
    task.workflowArtifactMutationPolicy ? `mutation ${statusValueLabel(task.workflowArtifactMutationPolicy)}` : undefined,
    task.workflowRunStatus ? `run ${statusValueLabel(task.workflowRunStatus)}` : undefined,
    task.lastEventType ? `last event ${eventTypeLabel(task.lastEventType)}` : undefined,
    task.lastEventMessage,
    task.workflowRunEventTypes.length ? `events ${idList(task.workflowRunEventTypes)}` : undefined,
  ].filter(Boolean).join(" / ");
  return {
    key: `callable-workflow:${task.taskId}`,
    title: `${task.title} (${statusValueLabel(task.status)})`,
    detail: truncate([
      task.blocking ? "Blocking" : "Background",
      task.statusLabel,
      statusValueLabel(task.runnerDeferredReason),
      linkDetail.join(" / "),
      workflowDetail,
      provenanceDetail,
    ].filter(Boolean).join(" | "), 280),
    meta: [
      `task ${task.taskId}`,
      `launch ${task.launchId}`,
      `parent run ${task.parentRunId}`,
      task.parentMessageId ? `parent message ${task.parentMessageId}` : undefined,
      task.workflowThreadId ? `workflow thread ${task.workflowThreadId}` : undefined,
      task.workflowArtifactId ? `artifact ${task.workflowArtifactId}` : undefined,
      task.workflowArtifactSourcePath ? `source ${task.workflowArtifactSourcePath}` : undefined,
      task.workflowArtifactStatePath ? `state ${task.workflowArtifactStatePath}` : undefined,
      task.workflowRunId ? `run ${task.workflowRunId}` : undefined,
      task.toolName,
      task.sourceKind,
      task.tokenCount !== undefined ? `${task.tokenCount.toLocaleString()} tokens` : undefined,
      task.costMicros !== undefined ? `${task.costMicros.toLocaleString()} cost micros` : undefined,
    ].filter(Boolean).join(" / "),
    tone: callableWorkflowTaskTone(task),
  };
}

function callableWorkflowTaskTone(
  task: DiagnosticExportSubagentReplayEvidence["callableWorkflowTaskTimeline"][number],
): SubagentReplayEvidenceRowModel["tone"] {
  if (task.artifactLinkState === "missing" || task.runLinkState === "missing" || task.runLinkState === "artifact_mismatch") {
    return "danger";
  }
  return statusToneFromValue(task.status);
}

function evidenceStatusLabel(evidence: DiagnosticExportSubagentReplayEvidence | undefined): string {
  if (!evidence) return "Replay evidence unavailable";
  if (evidence.counts.runs === 0) return "No child runs";
  return countLabel(evidence.counts.runs, "child run");
}

function evidenceSummary(evidence: DiagnosticExportSubagentReplayEvidence | undefined): string {
  if (!evidence) return "Sub-agent replay evidence was not available.";
  if (evidence.counts.runs === 0) return "No persisted child runs were present in this diagnostic bundle.";
  return `Captured ${countLabel(evidence.counts.runs, "child run")} with ${countLabel(evidence.counts.runtimeEvents, "runtime event")}, ${countLabel(evidence.counts.persistedRunEvents, "persisted event")}, and ${countLabel(evidence.counts.parentMailboxEvents, "parent mailbox event")}.`;
}

function summaryStatusLabel(summary: DiagnosticExportSubagentReplaySummary): string {
  if (summary.status === "healthy") return summary.runCount > 0 ? countLabel(summary.runCount, "child run") : "Replay evidence healthy";
  if (summary.status === "error") return "Replay evidence failed";
  if (summary.status === "unavailable") return "Replay evidence unavailable";
  return "Replay evidence needs attention";
}

function summaryTone(summary: DiagnosticExportSubagentReplaySummary): SubagentReplayEvidenceInspectorModel["statusTone"] {
  if (summary.status === "error") return "danger";
  if (summary.status === "needs_attention" || summary.truncated) return "warning";
  if (summary.status === "healthy") return "success";
  return "neutral";
}

function replayCountRow(label: string, total: number, shown: number): { label: string; value: string } {
  return { label, value: total === shown ? String(total) : `${shown}/${total} shown` };
}

function timelineRow(
  event: DiagnosticExportSubagentReplayTimelineItem,
  kind: "runtime" | "persisted",
): SubagentReplayEvidenceRowModel {
  const preview = event.messagePreview || event.textPreview;
  return {
    key: `${kind}:${event.runId}:${event.sequence}`,
    title: [
      event.toolName ? `${event.toolName} ${eventTypeLabel(event.type)}` : eventTypeLabel(event.type),
      event.status ? `(${statusValueLabel(event.status)})` : undefined,
    ].filter(Boolean).join(" "),
    detail: truncate(preview || event.artifactPath || event.createdAt, 240),
    meta: [
      event.source ? `source ${sourceLabel(event.source)}` : undefined,
      `run ${event.runId}`,
      `child ${event.childThreadId}`,
      event.canonicalTaskPath,
      event.artifactPath ? `artifact ${event.artifactPath}` : undefined,
      event.approvalId ? `approval ${approvalLabel(event.approvalSource, event.approvalId)}` : undefined,
      event.worktreeIsolated !== undefined ? `worktree ${event.worktreeIsolated ? "isolated" : "parent workspace"}` : undefined,
      event.worktreePath ? `worktree path ${event.worktreePath}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: statusToneFromValue(event.status || event.type),
  };
}

function approvalLabel(source: string | undefined, id: string): string {
  return source ? `${sourceLabel(source)} (${id})` : id;
}

function transcriptRow(message: DiagnosticExportSubagentReplayTranscriptItem): SubagentReplayEvidenceRowModel {
  return {
    key: `transcript:${message.threadId}:${message.sequence}`,
    title: `${titleCase(message.role)} transcript message`,
    detail: truncate(message.contentPreview, 240),
    meta: [
      `thread ${message.threadId}`,
      message.childRunId ? `run ${message.childRunId}` : undefined,
      message.childThreadId ? `child ${message.childThreadId}` : undefined,
      message.createdAt,
    ].filter(Boolean).join(" / "),
    tone: "neutral",
  };
}

function parentMailboxRow(event: DiagnosticExportSubagentReplayParentMailboxItem): SubagentReplayEvidenceRowModel {
  const completionGuardDetail = completionGuardSummaryDetail(event.completionGuardSummary);
  const lifecycleDetail = lifecycleSummaryDetail(event.lifecycleSummary);
  const deniedCategoryDisplay = event.deniedCategoryLabels?.length ? event.deniedCategoryLabels : event.deniedCategoryIds;
  const deniedToolDisplay = event.deniedToolLabels?.length ? event.deniedToolLabels : event.deniedToolIds;
  const childSourceDisplay = event.childSourceLabels?.length ? event.childSourceLabels : [
    ...(event.canonicalTaskPaths ?? []),
    ...(event.childThreadIds?.map((id) => `thread ${id}`) ?? []),
  ];
  const toolScopeDetail = [
    event.failureStage ? `failure ${statusValueLabel(event.failureStage)}` : undefined,
    event.approvalMode ? `approval ${statusValueLabel(event.approvalMode)}` : undefined,
    event.approvalUnavailable === true ? "approval unavailable" : undefined,
    deniedCategoryDisplay?.length ? `denied categories ${idList(deniedCategoryDisplay)}` : undefined,
    deniedToolDisplay?.length ? `denied tools ${idList(deniedToolDisplay)}` : undefined,
    completionGuardDetail,
    lifecycleDetail,
  ].filter(Boolean).join(" / ");
  const eventTone = statusToneFromValue(event.type);
  const lifecycleTone = lifecycleSummaryTone(event.lifecycleSummary);
  return {
    key: `parent-mailbox:${event.id}:${event.sequence}`,
    title: eventTypeLabel(event.type),
    detail: truncate([toolScopeDetail, event.payloadPreview || event.createdAt].filter(Boolean).join(" | "), 240),
    meta: [
      `parent run ${event.parentRunId}`,
      `parent thread ${event.parentThreadId}`,
      event.parentMessageId ? `parent message ${event.parentMessageId}` : undefined,
      `delivery ${statusValueLabel(event.deliveryState)}`,
      event.childRunIds.length ? `children ${idList(event.childRunIds)}` : undefined,
      childSourceDisplay.length ? `child sources ${idList(childSourceDisplay)}` : undefined,
      event.failureStage ? `failure ${statusValueLabel(event.failureStage)}` : undefined,
      event.approvalMode ? `approval ${statusValueLabel(event.approvalMode)}` : undefined,
      event.approvalUnavailable === true ? "approval unavailable" : undefined,
      deniedCategoryDisplay?.length ? `denied categories ${idList(deniedCategoryDisplay)}` : undefined,
      deniedToolDisplay?.length ? `denied tools ${idList(deniedToolDisplay)}` : undefined,
      completionGuardDetail,
      lifecycleDetail,
      event.idempotencyKey ? `idempotency ${event.idempotencyKey}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: lifecycleTone ?? (eventTone === "neutral" ? statusToneFromValue(event.deliveryState) : eventTone),
  };
}

function completionGuardSummaryDetail(
  summary: DiagnosticExportSubagentCompletionGuardSummary | undefined,
): string | undefined {
  if (!summary) return undefined;
  const status = completionGuardStatusLabel(summary);
  const evidence = completionGuardEvidenceLabel(summary);
  const parts = [
    status,
    evidence ? `mutation evidence ${evidence}` : undefined,
    summary.reason,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function lifecycleSummaryDetail(summary: DiagnosticExportSubagentLifecycleSummary | undefined): string | undefined {
  if (!summary) return undefined;
  const parts = [
    summary.action ? `lifecycle ${statusValueLabel(summary.action)}` : undefined,
    summary.source ? `source ${statusValueLabel(summary.source)}` : undefined,
    summary.status ? `status ${statusValueLabel(summary.status)}` : undefined,
    summary.waitBarrierId ? `barrier ${summary.waitBarrierId}` : undefined,
    summary.barrierStatus ? `barrier ${statusValueLabel(summary.barrierStatus)}` : undefined,
    summary.detachedRunIds?.length ? `detached ${idList(summary.detachedRunIds)}` : undefined,
    summary.cancelledRunIds?.length ? `cancelled ${idList(summary.cancelledRunIds)}` : undefined,
    summary.stoppedChildRunIds?.length ? `stopped ${idList(summary.stoppedChildRunIds)}` : undefined,
    summary.unchangedRunIds?.length ? `unchanged ${idList(summary.unchangedRunIds)}` : undefined,
    summary.cancelledWaitBarrierIds?.length ? `cancelled barriers ${idList(summary.cancelledWaitBarrierIds)}` : undefined,
    summary.cancelledMailboxEventIds?.length ? `cancelled mailbox ${idList(summary.cancelledMailboxEventIds)}` : undefined,
    summary.parentCancellationRequested === true ? "parent cancellation requested" : undefined,
    summary.reason,
    summary.userDecisionPreview ? `user ${summary.userDecisionPreview}` : undefined,
    summary.partialSummaryPreview ? `partial ${summary.partialSummaryPreview}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function lifecycleSummaryTone(
  summary: DiagnosticExportSubagentLifecycleSummary | undefined,
): SubagentReplayEvidenceRowModel["tone"] | undefined {
  if (!summary) return undefined;
  if (
    summary.action === "cancel_parent" ||
    summary.cancelledRunIds?.length ||
    summary.cancelledWaitBarrierIds?.length ||
    summary.parentCancellationRequested === true
  ) return "danger";
  if (
    summary.action === "detach_child" ||
    summary.detachedRunIds?.length ||
    summary.stoppedChildRunIds?.length ||
    summary.status === "stopped"
  ) return "warning";
  return undefined;
}

function completionGuardStatusLabel(summary: DiagnosticExportSubagentCompletionGuardSummary): string {
  if (summary.required === false && summary.valid !== false && summary.synthesisAllowed !== false) return "completion guard not required";
  if (summary.valid === true && summary.synthesisAllowed === true) return "completion guard passed";
  if (summary.valid === false || summary.synthesisAllowed === false) return "completion guard blocked";
  return "completion guard recorded";
}

function completionGuardEvidenceLabel(summary: DiagnosticExportSubagentCompletionGuardSummary): string | undefined {
  const parts = [
    summary.structuredEvidenceCount !== undefined ? `structured ${summary.structuredEvidenceCount}` : undefined,
    summary.ambientEvidenceCount !== undefined ? `Ambient ${summary.ambientEvidenceCount}` : undefined,
    summary.isolatedWorktreeEvidenceCount !== undefined ? `isolated worktree ${summary.isolatedWorktreeEvidenceCount}` : undefined,
    summary.approvalEvidenceCount !== undefined ? `approval ${summary.approvalEvidenceCount}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function restartRepairRowsForEvidence(
  evidence: DiagnosticExportSubagentReplayEvidence,
): SubagentReplayEvidenceRowModel[] {
  const repair = evidence.restartRepair;
  return [
    restartRepairRow("Observed issue kinds", repair.observedIssueKinds),
    ...repair.callableWorkflowTaskIssues.map(callableWorkflowRestartIssueRow),
    restartRepairRow("Repaired runs", repair.repairedRunIds),
    restartRepairRow("Repaired barriers", repair.repairedBarrierIds),
    restartRepairRow("Repaired parent controls", repair.repairedParentControlBarrierIds),
    restartRepairRow("Repairable spawn edges", repair.repairableSpawnEdgeRunIds),
    restartRepairRow("Dangling spawn edges", repair.danglingSpawnEdgeRunIds, "warning"),
    restartRepairRow("Diagnostic runs", repair.diagnosticRunIds),
  ].filter((row): row is SubagentReplayEvidenceRowModel => Boolean(row));
}

function lifecycleEdgeRowsForEvidence(
  evidence: DiagnosticExportSubagentReplayEvidence,
): SubagentReplayEvidenceRowModel[] {
  const rows = [
    restartRepairLifecycleEdgeRow(evidence),
    ...evidence.parentMailboxTimeline.flatMap((event) => lifecycleMailboxEdgeRow(event) ?? []),
  ];
  return rows.filter((row): row is SubagentReplayEvidenceRowModel => Boolean(row));
}

function restartRepairLifecycleEdgeRow(
  evidence: DiagnosticExportSubagentReplayEvidence,
): SubagentReplayEvidenceRowModel | undefined {
  const repair = evidence.restartRepair;
  const repairSignals = restartRepairCount(evidence);
  if (repairSignals <= 0) return undefined;
  const detail = [
    repair.observedIssueKinds.length ? `observed ${idList(repair.observedIssueKinds)}` : undefined,
    repair.repairedRunIds.length ? `repaired ${idList(repair.repairedRunIds)}` : undefined,
    repair.repairableSpawnEdgeRunIds.length ? `repairable spawn edges ${idList(repair.repairableSpawnEdgeRunIds)}` : undefined,
    repair.diagnosticRunIds.length ? `diagnostic ${idList(repair.diagnosticRunIds)}` : undefined,
    repair.danglingSpawnEdgeRunIds.length ? `dangling ${idList(repair.danglingSpawnEdgeRunIds)}` : undefined,
    repair.callableWorkflowTaskIssues.length ? countLabel(repair.callableWorkflowTaskIssues.length, "callable workflow restart issue") : undefined,
  ].filter(Boolean).join(" / ");
  return {
    key: "lifecycle-edge:restart-repair",
    title: "Lifecycle Restart Repair",
    detail: detail || "Restart repair evidence was recorded for the replay diagnostic.",
    meta: countLabel(repairSignals, "restart repair signal"),
    tone: repair.danglingSpawnEdgeRunIds.length || repair.callableWorkflowTaskIssues.length ? "warning" : "neutral",
  };
}

function lifecycleMailboxEdgeRow(
  event: DiagnosticExportSubagentReplayParentMailboxItem,
): SubagentReplayEvidenceRowModel | undefined {
  const lifecycle = event.lifecycleSummary;
  if (!lifecycle) return undefined;
  const action = lifecycle.action || lifecycle.status || lifecycle.barrierStatus || event.type;
  const lifecycleDetail = lifecycleSummaryDetail(lifecycle);
  const meta = [
    `parent run ${event.parentRunId}`,
    event.parentMessageId ? `parent message ${event.parentMessageId}` : undefined,
    event.childRunIds.length ? `children ${idList(event.childRunIds)}` : undefined,
    lifecycle.waitBarrierId ? `barrier ${lifecycle.waitBarrierId}` : undefined,
    `delivery ${statusValueLabel(event.deliveryState)}`,
  ].filter(Boolean).join(" / ");
  return {
    key: `lifecycle-edge:${event.id}:${event.sequence}`,
    title: `Lifecycle ${statusValueLabel(action)}`,
    detail: truncate([lifecycleDetail, event.payloadPreview].filter(Boolean).join(" | "), 280),
    meta,
    tone: lifecycleSummaryTone(lifecycle) ?? statusToneFromValue(action),
  };
}

function callableWorkflowRestartIssueRow(
  issue: DiagnosticExportSubagentReplayEvidence["restartRepair"]["callableWorkflowTaskIssues"][number],
): SubagentReplayEvidenceRowModel {
  const provenance = [
    issue.callerKind ? `caller ${sourceLabel(issue.callerKind)}` : undefined,
    issue.canonicalTaskPath,
    issue.childRunId ? `child run ${issue.childRunId}` : undefined,
    issue.childThreadId ? `child thread ${issue.childThreadId}` : undefined,
    issue.subagentRunId ? `sub-agent run ${issue.subagentRunId}` : undefined,
    issue.approvalSource ? `approval ${sourceLabel(issue.approvalSource)}` : undefined,
    issue.approvalScope ? `scope ${sourceLabel(issue.approvalScope)}` : undefined,
    issue.worktreeRequired ? "worktree required" : undefined,
    issue.worktreeIsolated !== undefined ? `worktree ${issue.worktreeIsolated ? "isolated" : "parent workspace"}` : undefined,
    issue.worktreeStatus ? `worktree ${statusValueLabel(issue.worktreeStatus)}` : undefined,
    issue.nestedFanoutRequired ? "nested fanout required" : undefined,
    issue.nestedFanoutSource ? `nested fanout ${sourceLabel(issue.nestedFanoutSource)}` : undefined,
  ].filter(Boolean).join(" / ");
  const taskState = [
    issue.taskStatus ? `task ${statusValueLabel(issue.taskStatus)}` : undefined,
    issue.taskStatusLabel,
    issue.blocking === true ? "Blocking" : issue.blocking === false ? "Background" : undefined,
    issue.runnerDeferredReason ? statusValueLabel(issue.runnerDeferredReason) : undefined,
  ].filter(Boolean).join(" / ");
  return {
    key: `restart-repair:callable-workflow:${issue.issueId}`,
    title: `Callable workflow ${statusValueLabel(issue.kind)} (${statusValueLabel(issue.severity)})`,
    detail: truncate([issue.messagePreview, taskState, provenance].filter(Boolean).join(" | "), 280),
    meta: [
      `task ${issue.taskId}`,
      `parent run ${issue.parentRunId}`,
      `parent thread ${issue.parentThreadId}`,
      issue.workflowArtifactId ? `artifact ${issue.workflowArtifactId}` : undefined,
      issue.workflowRunId ? `run ${issue.workflowRunId}` : undefined,
      issue.callerRunId ? `caller run ${issue.callerRunId}` : undefined,
      issue.callerThreadId ? `caller thread ${issue.callerThreadId}` : undefined,
      issue.childParentRunId ? `child parent run ${issue.childParentRunId}` : undefined,
      issue.childParentThreadId ? `child parent thread ${issue.childParentThreadId}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: severityTone(issue.severity),
  };
}

function restartRepairRow(
  title: string,
  ids: string[],
  tone: SubagentReplayEvidenceRowModel["tone"] = "neutral",
): SubagentReplayEvidenceRowModel | undefined {
  if (!ids.length) return undefined;
  return {
    key: `restart-repair:${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    detail: idList(ids),
    meta: countLabel(ids.length, "item"),
    tone,
  };
}

function restartRepairCount(evidence: DiagnosticExportSubagentReplayEvidence): number {
  const repair = evidence.restartRepair;
  return [
    repair.observedIssueKinds,
    repair.repairedRunIds,
    repair.repairedBarrierIds,
    repair.repairedParentControlBarrierIds,
    repair.repairableSpawnEdgeRunIds,
    repair.danglingSpawnEdgeRunIds,
    repair.diagnosticRunIds,
    repair.callableWorkflowTaskIssues,
  ].reduce((count, ids) => count + ids.length, 0);
}

function severityTone(severity: string): SubagentReplayEvidenceRowModel["tone"] {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "info") return "neutral";
  return "neutral";
}

function rowSearchText(row: SubagentReplayEvidenceRowModel): string {
  return `${row.title} ${row.detail} ${row.meta}`;
}

function parentMailboxSearchText(event: DiagnosticExportSubagentReplayParentMailboxItem): string {
  return [
    event.type,
    event.deliveryState,
    event.parentThreadId,
    event.parentRunId,
    event.parentMessageId,
    event.childRunIds.join(" "),
    event.childThreadIds?.join(" "),
    event.canonicalTaskPaths?.join(" "),
    event.childSourceLabels?.join(" "),
    event.idempotencyKey,
    event.payloadPreview,
    event.failureStage,
    event.approvalMode,
    event.approvalUnavailable === undefined ? undefined : `approvalUnavailable ${event.approvalUnavailable}`,
    event.deniedCategoryIds?.join(" "),
    event.deniedToolIds?.join(" "),
    event.deniedCategoryLabels?.join(" "),
    event.deniedToolLabels?.join(" "),
    completionGuardSummarySearchText(event.completionGuardSummary),
    lifecycleSummarySearchText(event.lifecycleSummary),
  ].filter(Boolean).join(" ");
}

function callableWorkflowTaskSearchText(
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
    task.workflowArtifactSourcePath,
    task.workflowArtifactStatePath,
    task.workflowArtifactMutationPolicy,
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
  ].filter(Boolean).join(" ");
}

function completionGuardSummarySearchText(
  summary: DiagnosticExportSubagentCompletionGuardSummary | undefined,
): string | undefined {
  if (!summary) return undefined;
  return [
    "completion guard",
    summary.valid === undefined ? undefined : `valid ${summary.valid}`,
    summary.synthesisAllowed === undefined ? undefined : `synthesisAllowed ${summary.synthesisAllowed}`,
    summary.required === undefined ? undefined : `required ${summary.required}`,
    completionGuardEvidenceLabel(summary),
    summary.reason,
  ].filter(Boolean).join(" ");
}

function lifecycleSummarySearchText(
  summary: DiagnosticExportSubagentLifecycleSummary | undefined,
): string | undefined {
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
  ].filter(Boolean).join(" ");
}

function statusToneFromValue(value: string): SubagentReplayEvidenceRowModel["tone"] {
  const normalized = value.toLowerCase();
  if (/(failed|error|denied|missing|dangling)/.test(normalized)) return "danger";
  if (/(stopped|cancelled|timed_out|aborted|partial|warning|interrupted)/.test(normalized)) return "warning";
  if (/(completed|succeeded|satisfied|closed|done)/.test(normalized)) return "success";
  return "neutral";
}

function statusValueLabel(value: string): string {
  return value.split(/[._-]+/g).map(titleCase).join(" ");
}

function eventTypeLabel(value: string): string {
  return value.replace(/^subagent\./, "").split(/[._-]+/g).map(titleCase).join(" ");
}

function sourceLabel(value: string): string {
  return value.split(/[._-]+/g).map(titleCase).join(" ");
}

function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function idList(ids: string[]): string {
  return ids.length > 5 ? `${ids.slice(0, 5).join(", ")} +${ids.length - 5}` : ids.join(", ");
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
