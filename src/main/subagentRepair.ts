import type {
  CallableWorkflowTaskRestartDiagnosticItem,
  CallableWorkflowTaskRestartDiagnosticsReport,
  CallableWorkflowTaskRestartIssue,
  CallableWorkflowTaskRestartReconciliationSummary,
  SubagentRepairDiagnosticAction,
  SubagentRepairDiagnosticItem,
  SubagentRepairDiagnosticsReport,
  SubagentRepairIssue,
  SubagentPromptSnapshotSummary,
  SubagentRunEventSummary,
  SubagentRestartReconciliationSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../shared/types";
import { isAmbientSubagentsEnabled } from "../shared/featureFlags";
import { isSubagentCapacityLeaseSnapshot } from "../shared/subagentCapacity";
import { validateSubagentResultArtifactForSynthesis, type SubagentResultArtifact } from "../shared/subagentProtocol";
import { subagentLifecycleEventType } from "./subagentLifecycleHooks";

const ACTIVE_RESTART_STATUSES = new Set<SubagentRunSummary["status"]>(["reserved", "starting", "running", "waiting"]);
const TERMINAL_STATUSES = new Set<SubagentRunSummary["status"]>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "timed_out",
  "detached",
  "aborted_partial",
]);
const DEFAULT_REPAIR_DIAGNOSTIC_MAX_ISSUES = 50;
const DEFAULT_REPAIR_DIAGNOSTIC_MAX_MESSAGE_CHARS = 280;
const DEFAULT_REPAIR_DIAGNOSTIC_MAX_AFFECTED_IDS = 100;

export function analyzeSubagentRestartState(input: {
  threads: readonly ThreadSummary[];
  runs: readonly SubagentRunSummary[];
  runEvents?: readonly SubagentRunEventSummary[];
  spawnEdges?: readonly SubagentSpawnEdgeSummary[];
  promptSnapshots?: readonly SubagentPromptSnapshotSummary[];
  toolScopeSnapshots?: readonly SubagentToolScopeSnapshotSummary[];
  waitBarriers?: readonly SubagentWaitBarrierSummary[];
  createdAt?: string;
}): SubagentRestartReconciliationSummary {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const issues: SubagentRepairIssue[] = [];
  const threadsById = new Map(input.threads.map((thread) => [thread.id, thread]));
  const runsById = new Map(input.runs.map((run) => [run.id, run]));
  const eventsByRunId = input.runEvents ? subagentRunEventsByRunId(input.runEvents) : undefined;
  const spawnEdgesByChildRunId = input.spawnEdges ? subagentSpawnEdgesByChildRunId(input.spawnEdges) : undefined;
  const promptSnapshotsByRunId = input.promptSnapshots ? subagentPromptSnapshotsByRunId(input.promptSnapshots) : undefined;
  const toolScopeSnapshotsByRunId = input.toolScopeSnapshots ? subagentToolScopeSnapshotsByRunId(input.toolScopeSnapshots) : undefined;

  for (const run of input.runs) {
    const parentThread = threadsById.get(run.parentThreadId);
    const childThread = threadsById.get(run.childThreadId);
    const runEvents = eventsByRunId?.get(run.id) ?? [];
    if (!parentThread) {
      issues.push(issue({
        kind: "missing_parent_thread",
        severity: "error",
        runId: run.id,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        message: `Sub-agent run ${run.id} references missing parent thread ${run.parentThreadId}.`,
      }));
    }
    if (!childThread) {
      issues.push(issue({
        kind: "missing_child_thread",
        severity: "error",
        runId: run.id,
        threadId: run.childThreadId,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        message: `Sub-agent run ${run.id} references missing child thread ${run.childThreadId}.`,
      }));
    } else {
      if (
        childThread.kind !== "subagent_child" ||
        childThread.subagentRunId !== run.id ||
        childThread.parentThreadId !== run.parentThreadId ||
        childThread.parentRunId !== run.parentRunId ||
        childThread.canonicalTaskPath !== run.canonicalTaskPath
      ) {
        issues.push(issue({
          kind: "thread_run_mismatch",
          severity: "error",
          runId: run.id,
          threadId: childThread.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          message: `Sub-agent run ${run.id} and child thread ${childThread.id} disagree on linkage metadata.`,
        }));
      }
    }
    if (ACTIVE_RESTART_STATUSES.has(run.status)) {
      issues.push(issue({
        kind: "active_run_interrupted",
        severity: "warning",
        runId: run.id,
        threadId: run.childThreadId,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        message: `Sub-agent run ${run.id} was ${run.status} during restart and needs reconciliation.`,
      }));
    }
    if (eventsByRunId) {
      issues.push(...lifecycleHookIssues(run, runEvents));
    }
    issues.push(...runSnapshotInvariantIssues(run, childThread));
    if (promptSnapshotsByRunId) {
      issues.push(...promptSnapshotIssues(run, promptSnapshotsByRunId.get(run.id) ?? [], runEvents));
    }
    if (toolScopeSnapshotsByRunId) {
      issues.push(...toolScopeSnapshotIssues(run, toolScopeSnapshotsByRunId.get(run.id) ?? [], runEvents));
    }
    if (spawnEdgesByChildRunId) {
      const edge = spawnEdgesByChildRunId.get(run.id);
      if (!edge) {
        issues.push(issue({
          kind: "missing_spawn_edge",
          severity: "error",
          runId: run.id,
          threadId: run.childThreadId,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          message: `Sub-agent run ${run.id} is missing its persisted spawn edge.`,
        }));
      } else {
        issues.push(...spawnEdgeIssues(run, edge));
      }
    }
    if (!TERMINAL_STATUSES.has(run.status)) continue;
    if (run.resultArtifact === undefined) {
      issues.push(issue({
        kind: "missing_result_artifact",
        severity: "warning",
        runId: run.id,
        threadId: run.childThreadId,
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        message: `Terminal sub-agent run ${run.id} (${run.status}) is missing a result artifact.`,
      }));
      continue;
    }
    issues.push(...resultArtifactIssues(run));
  }

  for (const edge of input.spawnEdges ?? []) {
    if (runsById.has(edge.childRunId)) continue;
    issues.push(issue({
      kind: "dangling_spawn_edge",
      severity: "error",
      runId: edge.childRunId,
      threadId: edge.childThreadId,
      parentThreadId: edge.parentThreadId,
      parentRunId: edge.parentRunId,
      message: `Sub-agent spawn edge ${edge.parentRunId}/${edge.childRunId} references missing child run ${edge.childRunId}.`,
    }));
  }

  for (const snapshot of input.promptSnapshots ?? []) {
    if (runsById.has(snapshot.runId)) continue;
    issues.push(issue({
      kind: "prompt_snapshot_mismatch",
      severity: "error",
      runId: snapshot.runId,
      message: `Sub-agent prompt snapshot ${snapshot.runId}/${snapshot.sequence} references missing child run ${snapshot.runId}.`,
    }));
  }

  for (const snapshot of input.toolScopeSnapshots ?? []) {
    if (runsById.has(snapshot.runId)) continue;
    issues.push(issue({
      kind: "tool_scope_snapshot_mismatch",
      severity: "error",
      runId: snapshot.runId,
      message: `Sub-agent tool-scope snapshot ${snapshot.runId}/${snapshot.sequence} references missing child run ${snapshot.runId}.`,
    }));
  }

  for (const thread of input.threads) {
    if (thread.kind !== "subagent_child") continue;
    issues.push(...childThreadParentIssues(thread, threadsById));
    if (!thread.subagentRunId || !runsById.has(thread.subagentRunId)) {
      issues.push(issue({
        kind: "orphan_child_thread",
        severity: "error",
        threadId: thread.id,
        parentThreadId: thread.parentThreadId,
        parentRunId: thread.parentRunId,
        message: `Sub-agent child thread ${thread.id} has no matching sub-agent run.`,
      }));
    }
  }

  for (const barrier of input.waitBarriers ?? []) {
    for (const childRunId of barrier.childRunIds) {
      if (!runsById.has(childRunId)) {
        issues.push(issue({
          kind: "dangling_wait_barrier_child",
          severity: "error",
          barrierId: barrier.id,
          parentThreadId: barrier.parentThreadId,
          parentRunId: barrier.parentRunId,
          message: `Sub-agent wait barrier ${barrier.id} references missing child run ${childRunId}.`,
        }));
      }
    }
    if (waitBarrierHasUnreconciledParentCancelControl(barrier)) {
      issues.push(issue({
        kind: "parent_cancel_control_unreconciled",
        severity: "warning",
        barrierId: barrier.id,
        parentThreadId: barrier.parentThreadId,
        parentRunId: barrier.parentRunId,
        message: `Sub-agent wait barrier ${barrier.id} requested parent cancellation before restart and needs parent-control reconciliation.`,
      }));
    }
  }

  const repairedRunIds = uniqueSubagentRepairIds(issues
    .filter((item) => item.kind === "active_run_interrupted" && item.runId)
    .map((item) => item.runId!));
  const repairedBarrierIds = uniqueSubagentRepairIds((input.waitBarriers ?? [])
    .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.some((childRunId) => repairedRunIds.includes(childRunId)))
    .map((barrier) => barrier.id));
  const repairedParentControlBarrierIds = uniqueSubagentRepairIds(issues
    .filter((item) => item.kind === "parent_cancel_control_unreconciled" && item.barrierId)
    .map((item) => item.barrierId!));
  const repairableSpawnEdgeRunIds = uniqueSubagentRepairIds(issues
    .filter((item) =>
      item.runId &&
      runsById.has(item.runId) &&
      ["missing_spawn_edge", "spawn_edge_mismatch"].includes(item.kind)
    )
    .map((item) => item.runId!));
  const danglingSpawnEdgeRunIds = uniqueSubagentRepairIds(issues
    .filter((item) => item.kind === "dangling_spawn_edge" && item.runId && !runsById.has(item.runId))
    .map((item) => item.runId!));
  const diagnosticRunIds = uniqueSubagentRepairIds(issues
    .filter((item) =>
      item.runId &&
      runsById.has(item.runId) &&
      (
        ["missing_spawn_edge", "spawn_edge_mismatch"].includes(item.kind) ||
        repairDiagnosticAction(item) === "inspect_run_snapshot"
      )
    )
    .map((item) => item.runId!));

  return {
    schemaVersion: "ambient-subagent-restart-reconciliation-v1",
    createdAt,
    issueCount: issues.length,
    repairedRunIds,
    repairedBarrierIds,
    repairedParentControlBarrierIds,
    repairableSpawnEdgeRunIds,
    danglingSpawnEdgeRunIds,
    diagnosticRunIds,
    issues,
  };
}

function childThreadParentIssues(
  thread: ThreadSummary,
  threadsById: Map<string, ThreadSummary>,
): SubagentRepairIssue[] {
  if (!thread.parentThreadId) {
    return [issue({
      kind: "orphan_child_parent_thread",
      severity: "error",
      threadId: thread.id,
      parentRunId: thread.parentRunId,
      message: `Sub-agent child thread ${thread.id} is missing parentThreadId and cannot be nested under its parent.`,
    })];
  }
  if (thread.parentThreadId === thread.id) {
    return [issue({
      kind: "orphan_child_parent_thread",
      severity: "error",
      threadId: thread.id,
      parentThreadId: thread.parentThreadId,
      parentRunId: thread.parentRunId,
      message: `Sub-agent child thread ${thread.id} points to itself as its parent thread.`,
    })];
  }
  if (!threadsById.has(thread.parentThreadId)) {
    return [issue({
      kind: "orphan_child_parent_thread",
      severity: "error",
      threadId: thread.id,
      parentThreadId: thread.parentThreadId,
      parentRunId: thread.parentRunId,
      message: `Sub-agent child thread ${thread.id} references missing parent thread ${thread.parentThreadId}.`,
    })];
  }
  return [];
}

export function interruptedSubagentResultArtifact(input: {
  run: SubagentRunSummary;
  reason?: string;
}): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.run.id,
    status: "stopped",
    partial: false,
    summary: input.reason ?? "Ambient restarted before this child run finished. Re-run, follow up, or inspect the preserved child transcript.",
    childThreadId: input.run.childThreadId,
  };
}

export function createSubagentRepairDiagnosticsReport(input: {
  summary: SubagentRestartReconciliationSummary;
  maxIssues?: number;
  maxMessageChars?: number;
  maxAffectedIds?: number;
}): SubagentRepairDiagnosticsReport {
  const maxIssues = positiveInteger(input.maxIssues, DEFAULT_REPAIR_DIAGNOSTIC_MAX_ISSUES);
  const maxMessageChars = positiveInteger(input.maxMessageChars, DEFAULT_REPAIR_DIAGNOSTIC_MAX_MESSAGE_CHARS);
  const maxAffectedIds = positiveInteger(input.maxAffectedIds, DEFAULT_REPAIR_DIAGNOSTIC_MAX_AFFECTED_IDS);
  const shownIssues = input.summary.issues.slice(0, maxIssues);
  const affectedRunIds = boundedUniqueDefined(input.summary.issues.map((issue) => issue.runId), maxAffectedIds);
  const affectedThreadIds = boundedUniqueDefined(input.summary.issues.map((issue) => issue.threadId), maxAffectedIds);
  const affectedBarrierIds = boundedUniqueDefined(input.summary.issues.map((issue) => issue.barrierId), maxAffectedIds);
  const actionCounts: Partial<Record<SubagentRepairDiagnosticAction, number>> = {};
  for (const issue of input.summary.issues) {
    const action = repairDiagnosticAction(issue);
    actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  }

  return {
    schemaVersion: "ambient-subagent-repair-diagnostics-v1",
    createdAt: input.summary.createdAt,
    issueCount: input.summary.issueCount,
    shownIssueCount: shownIssues.length,
    truncatedIssues: input.summary.issues.length > shownIssues.length,
    affectedIdsTruncated: [affectedRunIds, affectedThreadIds, affectedBarrierIds].some((ids) => ids.truncated),
    errorCount: input.summary.issues.filter((issue) => issue.severity === "error").length,
    warningCount: input.summary.issues.filter((issue) => issue.severity === "warning").length,
    infoCount: input.summary.issues.filter((issue) => issue.severity === "info").length,
    repairedRunIds: input.summary.repairedRunIds,
    repairedBarrierIds: input.summary.repairedBarrierIds,
    repairedParentControlBarrierIds: input.summary.repairedParentControlBarrierIds,
    repairedSpawnEdgeRunIds: input.summary.repairableSpawnEdgeRunIds,
    prunedDanglingSpawnEdgeRunIds: input.summary.danglingSpawnEdgeRunIds,
    diagnosticRunIds: input.summary.diagnosticRunIds,
    affectedRunIds: affectedRunIds.values,
    affectedThreadIds: affectedThreadIds.values,
    affectedBarrierIds: affectedBarrierIds.values,
    actionCounts,
    issues: shownIssues.map((issue) => repairDiagnosticItem(issue, maxMessageChars)),
    ...(input.summary.callableWorkflowTasks
      ? { callableWorkflowTasks: callableWorkflowTaskRestartDiagnosticsReport(input.summary.callableWorkflowTasks, maxIssues, maxMessageChars) }
      : {}),
  };
}

function callableWorkflowTaskRestartDiagnosticsReport(
  summary: CallableWorkflowTaskRestartReconciliationSummary,
  maxIssues: number,
  maxMessageChars: number,
): CallableWorkflowTaskRestartDiagnosticsReport {
  const shownIssues = summary.issues.slice(0, maxIssues);
  return {
    schemaVersion: "ambient-callable-workflow-task-restart-diagnostics-v1",
    createdAt: summary.createdAt,
    issueCount: summary.issueCount,
    shownIssueCount: shownIssues.length,
    truncatedIssues: summary.issues.length > shownIssues.length,
    repairedTaskIds: summary.repairedTaskIds,
    diagnosticTaskIds: summary.diagnosticTaskIds,
    staleWorkflowArtifactTaskIds: summary.staleWorkflowArtifactTaskIds,
    staleWorkflowRunTaskIds: summary.staleWorkflowRunTaskIds,
    issues: shownIssues.map((issue) => callableWorkflowTaskRestartDiagnosticItem(issue, maxMessageChars)),
  };
}

function callableWorkflowTaskRestartDiagnosticItem(
  issue: CallableWorkflowTaskRestartIssue,
  maxMessageChars: number,
): CallableWorkflowTaskRestartDiagnosticItem {
  return {
    issueId: issue.id,
    kind: issue.kind,
    severity: issue.severity,
    messagePreview: boundedText(issue.message, maxMessageChars),
    taskId: issue.taskId,
    ...(issue.taskStatus ? { taskStatus: issue.taskStatus } : {}),
    ...(issue.taskStatusLabel ? { taskStatusLabel: issue.taskStatusLabel } : {}),
    ...(issue.blocking !== undefined ? { blocking: issue.blocking } : {}),
    ...(issue.runnerDeferredReason ? { runnerDeferredReason: issue.runnerDeferredReason } : {}),
    parentThreadId: issue.parentThreadId,
    parentRunId: issue.parentRunId,
    ...(issue.workflowArtifactId ? { workflowArtifactId: issue.workflowArtifactId } : {}),
    ...(issue.workflowRunId ? { workflowRunId: issue.workflowRunId } : {}),
    ...(issue.callerKind ? { callerKind: issue.callerKind } : {}),
    ...(issue.callerThreadId ? { callerThreadId: issue.callerThreadId } : {}),
    ...(issue.callerRunId ? { callerRunId: issue.callerRunId } : {}),
    ...(issue.childThreadId ? { childThreadId: issue.childThreadId } : {}),
    ...(issue.childRunId ? { childRunId: issue.childRunId } : {}),
    ...(issue.subagentRunId ? { subagentRunId: issue.subagentRunId } : {}),
    ...(issue.canonicalTaskPath ? { canonicalTaskPath: issue.canonicalTaskPath } : {}),
    ...(issue.childParentThreadId ? { childParentThreadId: issue.childParentThreadId } : {}),
    ...(issue.childParentRunId ? { childParentRunId: issue.childParentRunId } : {}),
    ...(issue.approvalSource ? { approvalSource: issue.approvalSource } : {}),
    ...(issue.approvalScope ? { approvalScope: issue.approvalScope } : {}),
    ...(issue.worktreeRequired !== undefined ? { worktreeRequired: issue.worktreeRequired } : {}),
    ...(issue.worktreeIsolated !== undefined ? { worktreeIsolated: issue.worktreeIsolated } : {}),
    ...(issue.worktreeStatus ? { worktreeStatus: issue.worktreeStatus } : {}),
    ...(issue.nestedFanoutRequired !== undefined ? { nestedFanoutRequired: issue.nestedFanoutRequired } : {}),
    ...(issue.nestedFanoutSource ? { nestedFanoutSource: issue.nestedFanoutSource } : {}),
  };
}

function issue(input: Omit<SubagentRepairIssue, "id">): SubagentRepairIssue {
  const stable = [
    input.kind,
    input.runId ?? "",
    input.threadId ?? "",
    input.parentRunId ?? "",
    input.barrierId ?? "",
  ].join(":");
  return {
    id: stable,
    ...input,
  };
}

function repairDiagnosticItem(issue: SubagentRepairIssue, maxMessageChars: number): SubagentRepairDiagnosticItem {
  const action = repairDiagnosticAction(issue);
  return {
    issueId: issue.id,
    kind: issue.kind,
    severity: issue.severity,
    messagePreview: boundedText(issue.message, maxMessageChars),
    runId: issue.runId,
    threadId: issue.threadId,
    parentThreadId: issue.parentThreadId,
    parentRunId: issue.parentRunId,
    barrierId: issue.barrierId,
    action,
    actionLabel: repairDiagnosticActionLabel(action),
    destructive: false,
  };
}

function repairDiagnosticAction(issue: SubagentRepairIssue): SubagentRepairDiagnosticAction {
  switch (issue.kind) {
    case "active_run_interrupted":
    case "parent_cancel_control_unreconciled":
      return "auto_reconcile_restart";
    case "missing_spawn_edge":
    case "dangling_spawn_edge":
    case "spawn_edge_mismatch":
      return "repair_spawn_edge";
    case "missing_result_artifact":
    case "invalid_result_artifact":
    case "result_artifact_mismatch":
      return "inspect_result_artifact";
    case "missing_lifecycle_start":
    case "missing_lifecycle_stop":
      return "inspect_lifecycle_events";
    case "missing_feature_flag_snapshot":
    case "subagent_feature_flag_disabled":
    case "missing_role_profile_snapshot":
    case "role_profile_snapshot_mismatch":
    case "missing_model_runtime_snapshot":
    case "model_runtime_snapshot_mismatch":
    case "missing_capacity_lease":
    case "capacity_lease_mismatch":
    case "missing_prompt_snapshot":
    case "prompt_snapshot_mismatch":
    case "missing_tool_scope_snapshot":
    case "tool_scope_snapshot_mismatch":
      return "inspect_run_snapshot";
    case "orphan_child_thread":
    case "orphan_child_parent_thread":
    case "thread_run_mismatch":
      return "inspect_child_thread";
    case "missing_parent_thread":
    case "missing_child_thread":
    case "dangling_wait_barrier_child":
      return "manual_repair_required";
  }
}

function waitBarrierHasUnreconciledParentCancelControl(barrier: SubagentWaitBarrierSummary): boolean {
  const artifact = objectRecord(barrier.resolutionArtifact);
  return artifact.parentCancellationRequested === true && typeof artifact.parentControlReconciledAt !== "string";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function repairDiagnosticActionLabel(action: SubagentRepairDiagnosticAction): string {
  switch (action) {
    case "auto_reconcile_restart":
      return "Run startup reconciliation";
    case "repair_spawn_edge":
      return "Repair spawn edge";
    case "inspect_child_thread":
      return "Inspect child thread linkage";
    case "inspect_lifecycle_events":
      return "Inspect lifecycle event history";
    case "inspect_run_snapshot":
      return "Inspect run snapshot";
    case "inspect_result_artifact":
      return "Inspect result artifact";
    case "manual_repair_required":
      return "Manual repair required";
  }
}

function subagentRunEventsByRunId(events: readonly SubagentRunEventSummary[]): Map<string, SubagentRunEventSummary[]> {
  const byRunId = new Map<string, SubagentRunEventSummary[]>();
  for (const event of events) {
    const existing = byRunId.get(event.runId);
    if (existing) {
      existing.push(event);
    } else {
      byRunId.set(event.runId, [event]);
    }
  }
  return byRunId;
}

function subagentSpawnEdgesByChildRunId(edges: readonly SubagentSpawnEdgeSummary[]): Map<string, SubagentSpawnEdgeSummary> {
  const byChildRunId = new Map<string, SubagentSpawnEdgeSummary>();
  for (const edge of edges) {
    byChildRunId.set(edge.childRunId, edge);
  }
  return byChildRunId;
}

function subagentPromptSnapshotsByRunId(snapshots: readonly SubagentPromptSnapshotSummary[]): Map<string, SubagentPromptSnapshotSummary[]> {
  const byRunId = new Map<string, SubagentPromptSnapshotSummary[]>();
  for (const snapshot of snapshots) {
    const existing = byRunId.get(snapshot.runId);
    if (existing) {
      existing.push(snapshot);
    } else {
      byRunId.set(snapshot.runId, [snapshot]);
    }
  }
  return byRunId;
}

function subagentToolScopeSnapshotsByRunId(snapshots: readonly SubagentToolScopeSnapshotSummary[]): Map<string, SubagentToolScopeSnapshotSummary[]> {
  const byRunId = new Map<string, SubagentToolScopeSnapshotSummary[]>();
  for (const snapshot of snapshots) {
    const existing = byRunId.get(snapshot.runId);
    if (existing) {
      existing.push(snapshot);
    } else {
      byRunId.set(snapshot.runId, [snapshot]);
    }
  }
  return byRunId;
}

function lifecycleHookIssues(run: SubagentRunSummary, events: readonly SubagentRunEventSummary[]): SubagentRepairIssue[] {
  const issues: SubagentRepairIssue[] = [];
  if (!events.some((event) => event.type === subagentLifecycleEventType("SubagentStart"))) {
    issues.push(issue({
      kind: "missing_lifecycle_start",
      severity: "warning",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} is missing its SubagentStart lifecycle event.`,
    }));
  }
  if (TERMINAL_STATUSES.has(run.status) && !events.some((event) => event.type === subagentLifecycleEventType("SubagentStop"))) {
    issues.push(issue({
      kind: "missing_lifecycle_stop",
      severity: "warning",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Terminal sub-agent run ${run.id} (${run.status}) is missing its SubagentStop lifecycle event.`,
    }));
  }
  return issues;
}

function runSnapshotInvariantIssues(run: SubagentRunSummary, childThread: ThreadSummary | undefined): SubagentRepairIssue[] {
  return [
    ...featureFlagSnapshotIssues(run),
    ...roleProfileSnapshotIssues(run),
    ...modelRuntimeSnapshotIssues(run, childThread),
    ...capacityLeaseSnapshotIssues(run),
  ];
}

function featureFlagSnapshotIssues(run: SubagentRunSummary): SubagentRepairIssue[] {
  const featureFlagSnapshot = (run as { featureFlagSnapshot?: unknown }).featureFlagSnapshot;
  const snapshot = objectRecord(featureFlagSnapshot);
  const flags = objectRecord(snapshot.flags);
  const subagentFlag = optionalObjectRecord(flags["ambient.subagents"]);
  if (
    snapshot.schemaVersion !== "ambient-feature-flags-v1" ||
    !subagentFlag ||
    subagentFlag.id !== "ambient.subagents" ||
    typeof subagentFlag.enabled !== "boolean"
  ) {
    return [issue({
      kind: "missing_feature_flag_snapshot",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} is missing its ambient.subagents feature-flag snapshot.`,
    })];
  }
  if (!isAmbientSubagentsEnabled(run.featureFlagSnapshot)) {
    return [issue({
      kind: "subagent_feature_flag_disabled",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} has a feature-flag snapshot where ambient.subagents is disabled.`,
    })];
  }
  return [];
}

function roleProfileSnapshotIssues(run: SubagentRunSummary): SubagentRepairIssue[] {
  const roleProfileSnapshot = (run as { roleProfileSnapshot?: unknown }).roleProfileSnapshot;
  const snapshot = optionalObjectRecord(roleProfileSnapshot);
  if (
    run.roleProfileSnapshotSource !== "resolved" ||
    !snapshot ||
    snapshot.schemaVersion !== "ambient-subagent-role-profile-v1" ||
    typeof snapshot.id !== "string" ||
    typeof snapshot.label !== "string" ||
    typeof snapshot.promptMode !== "string" ||
    typeof snapshot.defaultModelId !== "string" ||
    !Array.isArray(snapshot.allowedForkModes) ||
    typeof snapshot.defaultForkMode !== "string" ||
    !Array.isArray(snapshot.allowedToolCategories) ||
    !Array.isArray(snapshot.deniedToolCategories) ||
    typeof snapshot.nestedFanout !== "string" ||
    typeof snapshot.mutationPolicy !== "string" ||
    typeof snapshot.memoryPolicy !== "string" ||
    typeof snapshot.schedulingPolicy !== "string" ||
    !optionalObjectRecord(snapshot.guardPolicy)
  ) {
    return [issue({
      kind: "missing_role_profile_snapshot",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} is missing its resolved role profile snapshot.`,
    })];
  }
  const allowedForkModes = snapshot.allowedForkModes.filter((item): item is string => typeof item === "string");
  const guardPolicy = optionalObjectRecord(snapshot.guardPolicy);
  const mismatches = [
    snapshot.id !== run.roleId ? `role profile id ${String(snapshot.id)} does not match run roleId ${run.roleId}` : undefined,
    !allowedForkModes.includes(String(snapshot.defaultForkMode))
      ? `default fork mode ${String(snapshot.defaultForkMode)} is not allowed by the role snapshot`
      : undefined,
    typeof guardPolicy?.maxTurns !== "number" ? "guardPolicy.maxTurns is missing" : undefined,
    typeof guardPolicy?.maxRuntimeMs !== "number" ? "guardPolicy.maxRuntimeMs is missing" : undefined,
    typeof guardPolicy?.allowPartialResult !== "boolean" ? "guardPolicy.allowPartialResult is missing" : undefined,
    typeof guardPolicy?.structuredOutputRequired !== "boolean" ? "guardPolicy.structuredOutputRequired is missing" : undefined,
    typeof guardPolicy?.implementationEvidenceRequired !== "boolean" ? "guardPolicy.implementationEvidenceRequired is missing" : undefined,
  ].filter((item): item is string => Boolean(item));
  if (mismatches.length === 0) return [];
  return [issue({
    kind: "role_profile_snapshot_mismatch",
    severity: "error",
    runId: run.id,
    threadId: run.childThreadId,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    message: `Sub-agent run ${run.id} has role profile snapshot mismatch: ${mismatches.join("; ")}.`,
  })];
}

function modelRuntimeSnapshotIssues(run: SubagentRunSummary, childThread: ThreadSummary | undefined): SubagentRepairIssue[] {
  const modelRuntimeSnapshot = (run as { modelRuntimeSnapshot?: unknown }).modelRuntimeSnapshot;
  const snapshot = optionalObjectRecord(modelRuntimeSnapshot);
  const profile = optionalObjectRecord(snapshot?.profile);
  if (
    !snapshot ||
    snapshot.schemaVersion !== "ambient-model-runtime-snapshot-v1" ||
    typeof snapshot.resolvedAt !== "string" ||
    typeof snapshot.requestedModelId !== "string" ||
    !profile ||
    profile.schemaVersion !== "ambient-model-runtime-profile-v1" ||
    typeof profile.profileId !== "string" ||
    typeof profile.providerId !== "string" ||
    typeof profile.modelId !== "string" ||
    typeof profile.locality !== "string" ||
    typeof profile.toolUse !== "string" ||
    typeof profile.structuredOutput !== "string"
  ) {
    return [issue({
      kind: "missing_model_runtime_snapshot",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} is missing its resolved model/runtime snapshot.`,
    })];
  }
  const lease = isSubagentCapacityLeaseSnapshot(run.capacityLeaseSnapshot) ? run.capacityLeaseSnapshot : undefined;
  const mismatches = [
    childThread && childThread.model !== profile.modelId
      ? `child thread model ${childThread.model} does not match runtime model ${profile.modelId}`
      : undefined,
    lease && lease.provider.providerId !== profile.providerId
      ? `lease providerId ${lease.provider.providerId} does not match runtime providerId ${profile.providerId}`
      : undefined,
    lease && lease.provider.modelId !== profile.modelId
      ? `lease modelId ${lease.provider.modelId} does not match runtime modelId ${profile.modelId}`
      : undefined,
    lease && lease.provider.locality !== profile.locality
      ? `lease locality ${lease.provider.locality} does not match runtime locality ${profile.locality}`
      : undefined,
  ].filter((item): item is string => Boolean(item));
  if (mismatches.length === 0) return [];
  return [issue({
    kind: "model_runtime_snapshot_mismatch",
    severity: "error",
    runId: run.id,
    threadId: run.childThreadId,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    message: `Sub-agent run ${run.id} has model/runtime snapshot mismatch: ${mismatches.join("; ")}.`,
  })];
}

function capacityLeaseSnapshotIssues(run: SubagentRunSummary): SubagentRepairIssue[] {
  const capacityLeaseSnapshot = (run as { capacityLeaseSnapshot?: unknown }).capacityLeaseSnapshot;
  if (!isSubagentCapacityLeaseSnapshot(capacityLeaseSnapshot)) {
    return [issue({
      kind: "missing_capacity_lease",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} is missing its launch-time capacity lease snapshot.`,
    })];
  }
  const lease = capacityLeaseSnapshot;
  const mismatches = [
    lease.parentThreadId !== run.parentThreadId ? `lease parentThreadId ${lease.parentThreadId} does not match run parentThreadId ${run.parentThreadId}` : undefined,
    lease.parentRunId !== run.parentRunId ? `lease parentRunId ${lease.parentRunId} does not match run parentRunId ${run.parentRunId}` : undefined,
    lease.childRunId !== run.id ? `lease childRunId ${String(lease.childRunId)} does not match run ${run.id}` : undefined,
    lease.childThreadId !== run.childThreadId ? `lease childThreadId ${String(lease.childThreadId)} does not match child thread ${run.childThreadId}` : undefined,
    lease.canonicalTaskPath !== run.canonicalTaskPath
      ? `lease canonicalTaskPath ${lease.canonicalTaskPath} does not match run canonicalTaskPath ${run.canonicalTaskPath}`
      : undefined,
    lease.roleId !== run.roleId ? `lease roleId ${lease.roleId} does not match run roleId ${run.roleId}` : undefined,
    run.closedAt && lease.status !== "released" ? `lease status ${lease.status} is not released for closed run` : undefined,
    !run.closedAt && lease.status === "released" ? "lease status is released while run is still open" : undefined,
  ].filter((item): item is string => Boolean(item));
  if (mismatches.length === 0) return [];
  return [issue({
    kind: "capacity_lease_mismatch",
    severity: "error",
    runId: run.id,
    threadId: run.childThreadId,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    message: `Sub-agent run ${run.id} has capacity lease snapshot mismatch: ${mismatches.join("; ")}.`,
  })];
}

function promptSnapshotIssues(
  run: SubagentRunSummary,
  snapshots: readonly SubagentPromptSnapshotSummary[],
  events: readonly SubagentRunEventSummary[],
): SubagentRepairIssue[] {
  const issues: SubagentRepairIssue[] = [];
  if (snapshots.length === 0 && events.some((event) => event.type === "subagent.child_session_started")) {
    issues.push(issue({
      kind: "missing_prompt_snapshot",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} started a Pi child session without a persisted prompt snapshot.`,
    }));
  }
  for (const snapshot of snapshots) {
    const mismatches = promptSnapshotMismatches(run, snapshot);
    if (mismatches.length === 0) continue;
    issues.push(issue({
      kind: "prompt_snapshot_mismatch",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} has prompt snapshot ${snapshot.sequence} mismatch: ${mismatches.join("; ")}.`,
    }));
  }
  return issues;
}

function promptSnapshotMismatches(run: SubagentRunSummary, snapshot: SubagentPromptSnapshotSummary): string[] {
  const body = optionalObjectRecord(snapshot.snapshot);
  const modelScope = optionalObjectRecord(body?.modelScope);
  const toolScope = optionalObjectRecord(body?.toolScope);
  const profile = optionalObjectRecord(run.modelRuntimeSnapshot?.profile);
  const boundaryInstructions = Array.isArray(body?.boundaryInstructions)
    ? body.boundaryInstructions.filter((item): item is string => typeof item === "string")
    : [];
  return [
    snapshot.runId !== run.id ? `snapshot runId ${snapshot.runId} does not match run ${run.id}` : undefined,
    !Number.isInteger(snapshot.sequence) || snapshot.sequence < 1 ? `snapshot sequence ${snapshot.sequence} is invalid` : undefined,
    !/^[a-f0-9]{64}$/i.test(snapshot.promptSha256) ? "promptSha256 is not a 64-character hex digest" : undefined,
    !body || body.schemaVersion !== "ambient-subagent-prompt-snapshot-v1" ? "snapshot payload schemaVersion is invalid" : undefined,
    body && body.runId !== run.id ? `payload runId ${String(body.runId)} does not match run ${run.id}` : undefined,
    body && body.childThreadId !== run.childThreadId
      ? `payload childThreadId ${String(body.childThreadId)} does not match child thread ${run.childThreadId}`
      : undefined,
    body && body.canonicalTaskPath !== run.canonicalTaskPath
      ? `payload canonicalTaskPath ${String(body.canonicalTaskPath)} does not match run canonicalTaskPath ${run.canonicalTaskPath}`
      : undefined,
    body && body.roleId !== run.roleId ? `payload roleId ${String(body.roleId)} does not match run roleId ${run.roleId}` : undefined,
    body && typeof body.activeAgentTag !== "string" ? "activeAgentTag is missing" : undefined,
    !modelScope || modelScope.schemaVersion !== "ambient-subagent-prompt-model-scope-v1" ? "modelScope schemaVersion is invalid" : undefined,
    modelScope && profile && modelScope.requestedModelId !== run.modelRuntimeSnapshot.requestedModelId
      ? `modelScope requestedModelId ${String(modelScope.requestedModelId)} does not match runtime requestedModelId ${run.modelRuntimeSnapshot.requestedModelId}`
      : undefined,
    modelScope && profile && modelScope.profileId !== profile.profileId
      ? `modelScope profileId ${String(modelScope.profileId)} does not match runtime profileId ${String(profile.profileId)}`
      : undefined,
    modelScope && profile && modelScope.providerId !== profile.providerId
      ? `modelScope providerId ${String(modelScope.providerId)} does not match runtime providerId ${String(profile.providerId)}`
      : undefined,
    modelScope && profile && modelScope.modelId !== profile.modelId
      ? `modelScope modelId ${String(modelScope.modelId)} does not match runtime modelId ${String(profile.modelId)}`
      : undefined,
    !Array.isArray(body?.inheritedRefs) ? "inheritedRefs must be an array" : undefined,
    !Array.isArray(body?.strippedRefs) ? "strippedRefs must be an array" : undefined,
    !boundaryInstructions.includes("no_parent_spawn_tool") ? "boundaryInstructions is missing no_parent_spawn_tool" : undefined,
    !boundaryInstructions.includes("strip_subagent_tool_calls") ? "boundaryInstructions is missing strip_subagent_tool_calls" : undefined,
    !boundaryInstructions.includes("structured_result_json") ? "boundaryInstructions is missing structured_result_json" : undefined,
    !toolScope || toolScope.schemaVersion !== "ambient-subagent-tool-scope-v1" ? "toolScope schemaVersion is invalid" : undefined,
    !optionalObjectRecord(body?.guardPolicy) ? "guardPolicy snapshot is missing" : undefined,
  ].filter((item): item is string => Boolean(item));
}

function toolScopeSnapshotIssues(
  run: SubagentRunSummary,
  snapshots: readonly SubagentToolScopeSnapshotSummary[],
  events: readonly SubagentRunEventSummary[],
): SubagentRepairIssue[] {
  const issues: SubagentRepairIssue[] = [];
  if (snapshots.length === 0 && events.some((event) => event.type === "subagent.spawn_requested")) {
    issues.push(issue({
      kind: "missing_tool_scope_snapshot",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} recorded a spawn request without a persisted tool-scope snapshot.`,
    }));
  }
  for (const snapshot of snapshots) {
    const mismatches = toolScopeSnapshotMismatches(run, snapshot);
    if (mismatches.length === 0) continue;
    issues.push(issue({
      kind: "tool_scope_snapshot_mismatch",
      severity: "error",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Sub-agent run ${run.id} has tool-scope snapshot ${snapshot.sequence} mismatch: ${mismatches.join("; ")}.`,
    }));
  }
  return issues;
}

function toolScopeSnapshotMismatches(run: SubagentRunSummary, snapshot: SubagentToolScopeSnapshotSummary): string[] {
  const scope = optionalObjectRecord((snapshot as { scope?: unknown }).scope);
  const resolverInputs = optionalObjectRecord(snapshot.resolverInputs);
  const resolverModel = optionalObjectRecord(resolverInputs?.model);
  const profile = optionalObjectRecord(run.modelRuntimeSnapshot?.profile);
  const loadedCategories = Array.isArray(scope?.loadedCategories) ? scope.loadedCategories.filter((item): item is string => typeof item === "string") : [];
  const piVisibleTools = Array.isArray(scope?.piVisibleTools)
    ? scope.piVisibleTools.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  return [
    snapshot.runId !== run.id ? `snapshot runId ${snapshot.runId} does not match run ${run.id}` : undefined,
    !Number.isInteger(snapshot.sequence) || snapshot.sequence < 1 ? `snapshot sequence ${snapshot.sequence} is invalid` : undefined,
    !scope || scope.schemaVersion !== "ambient-subagent-tool-scope-v1" ? "scope schemaVersion is invalid" : undefined,
    !Array.isArray(scope?.loadedCategories) ? "loadedCategories must be an array" : undefined,
    !Array.isArray(scope?.piVisibleCategories) ? "piVisibleCategories must be an array" : undefined,
    !Array.isArray(scope?.deniedCategories) ? "deniedCategories must be an array" : undefined,
    !Array.isArray(scope?.loadedTools) ? "loadedTools must be an array" : undefined,
    !Array.isArray(scope?.piVisibleTools) ? "piVisibleTools must be an array" : undefined,
    !Array.isArray(scope?.deniedTools) ? "deniedTools must be an array" : undefined,
    scope && scope.approvalMode !== "interactive" && scope.approvalMode !== "non_interactive" ? "approvalMode is invalid" : undefined,
    scope && typeof scope.worktreeIsolated !== "boolean" ? "worktreeIsolated must be boolean" : undefined,
    scope && typeof scope.fanoutAvailable !== "boolean" ? "fanoutAvailable must be boolean" : undefined,
    scope && typeof scope.fanoutAvailable === "boolean" && scope.fanoutAvailable !== loadedCategories.includes("subagent.spawn")
      ? "fanoutAvailable does not match loaded subagent.spawn category"
      : undefined,
    piVisibleTools.some((tool) => tool.piVisible !== true) ? "piVisibleTools contains a non-visible grant" : undefined,
    piVisibleTools.some((tool) => ["extension_load", "skill", "fanout"].includes(String(tool.source)))
      ? "piVisibleTools contains a non-callable source"
      : undefined,
    !resolverInputs || resolverInputs.schemaVersion !== "ambient-subagent-tool-scope-resolver-input-v1"
      ? "resolverInputs schemaVersion is invalid"
      : undefined,
    resolverInputs && resolverInputs.roleId !== run.roleId
      ? `resolverInputs roleId ${String(resolverInputs.roleId)} does not match run roleId ${run.roleId}`
      : undefined,
    resolverModel && profile && resolverModel.profileId !== profile.profileId
      ? `resolverInputs model profileId ${String(resolverModel.profileId)} does not match runtime profileId ${String(profile.profileId)}`
      : undefined,
    resolverModel && profile && resolverModel.providerId !== profile.providerId
      ? `resolverInputs model providerId ${String(resolverModel.providerId)} does not match runtime providerId ${String(profile.providerId)}`
      : undefined,
    resolverModel && profile && resolverModel.modelId !== profile.modelId
      ? `resolverInputs model modelId ${String(resolverModel.modelId)} does not match runtime modelId ${String(profile.modelId)}`
      : undefined,
  ].filter((item): item is string => Boolean(item));
}

function spawnEdgeIssues(run: SubagentRunSummary, edge: SubagentSpawnEdgeSummary): SubagentRepairIssue[] {
  const mismatches = [
    edge.parentRunId !== run.parentRunId ? `edge parentRunId ${edge.parentRunId} does not match run parentRunId ${run.parentRunId}` : undefined,
    edge.parentThreadId !== run.parentThreadId
      ? `edge parentThreadId ${edge.parentThreadId} does not match run parentThreadId ${run.parentThreadId}`
      : undefined,
    edge.childThreadId !== run.childThreadId
      ? `edge childThreadId ${edge.childThreadId} does not match run childThreadId ${run.childThreadId}`
      : undefined,
    edge.canonicalTaskPath !== run.canonicalTaskPath
      ? `edge canonicalTaskPath ${edge.canonicalTaskPath} does not match run canonicalTaskPath ${run.canonicalTaskPath}`
      : undefined,
    edge.status !== run.status ? `edge status ${edge.status} does not match run status ${run.status}` : undefined,
    run.closedAt && edge.capacityReleasedAt !== run.closedAt
      ? `edge capacityReleasedAt ${String(edge.capacityReleasedAt)} does not match run closedAt ${run.closedAt}`
      : undefined,
    !run.closedAt && edge.capacityReleasedAt
      ? `edge capacityReleasedAt ${edge.capacityReleasedAt} is set while run is not closed`
      : undefined,
  ].filter((item): item is string => Boolean(item));
  if (mismatches.length === 0) return [];
  return [issue({
    kind: "spawn_edge_mismatch",
    severity: "error",
    runId: run.id,
    threadId: run.childThreadId,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    message: `Sub-agent run ${run.id} has spawn-edge linkage mismatch: ${mismatches.join("; ")}.`,
  })];
}

function resultArtifactIssues(run: SubagentRunSummary): SubagentRepairIssue[] {
  const validation = validateSubagentResultArtifactForSynthesis(run.resultArtifact);
  if (!validation.valid) {
    return [issue({
      kind: "invalid_result_artifact",
      severity: "warning",
      runId: run.id,
      threadId: run.childThreadId,
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      message: `Terminal sub-agent run ${run.id} has an invalid result artifact: ${validation.reason ?? "unknown validation failure"}`,
    })];
  }
  const artifact = run.resultArtifact as Record<string, unknown>;
  const mismatches = [
    artifact.runId !== run.id ? `artifact runId ${String(artifact.runId)} does not match run ${run.id}` : undefined,
    artifact.childThreadId !== run.childThreadId
      ? `artifact childThreadId ${String(artifact.childThreadId)} does not match child thread ${run.childThreadId}`
      : undefined,
    artifact.status !== run.status ? `artifact status ${String(artifact.status)} does not match run status ${run.status}` : undefined,
  ].filter((item): item is string => Boolean(item));
  if (mismatches.length === 0) return [];
  return [issue({
    kind: "result_artifact_mismatch",
    severity: "warning",
    runId: run.id,
    threadId: run.childThreadId,
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    message: `Terminal sub-agent run ${run.id} has result artifact linkage mismatch: ${mismatches.join("; ")}.`,
  })];
}

export function uniqueSubagentRepairIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function boundedText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3)}...`;
}

function boundedUniqueDefined(values: Array<string | undefined>, maxValues: number): { values: string[]; truncated: boolean } {
  const result: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    total += 1;
    if (result.length < maxValues) result.push(value);
  }
  return {
    values: result,
    truncated: total > result.length,
  };
}
