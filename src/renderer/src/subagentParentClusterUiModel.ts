import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import {
  aggregatePatternGraphOverflowApprovalState,
  aggregatePatternGraphOverflowStatus,
  subagentPatternGraphEdgesWithRuntimeState,
  type SubagentPatternGraphOverflowChild,
} from "../../shared/subagentPatternGraph";
import { subagentPatternGraphRendererModel, type SubagentPatternGraphRendererModel } from "./subagentPatternGraphUiModel";
import {
  callableWorkflowTaskModel,
  type SubagentParentClusterTone,
  type SubagentParentClusterWorkflowTaskModel,
  workflowTaskChildWaitsForBackgroundSymphonyTasks,
  workflowTaskParentBlockers,
} from "./subagentParentClusterWorkflowTaskUiModel";
import {
  childModel,
  childPreview,
  childSummary,
  childTitle,
  clusterStatus,
  clusterTone,
  parentBlockingModel,
  resultArtifactSummary,
  subagentRunStatusIsSynthesisSafe,
  type SubagentParentClusterChildBlockerDraft,
  type SubagentParentClusterChildModel,
  type SubagentParentClusterParentBlockingModel,
} from "./subagentParentClusterChildUiModel";
import {
  PARENT_CLUSTER_MAILBOX_ACTIVITY_PREVIEW_LIMIT,
  approvalParentBlocker,
  latestQueuedApprovalRequestForRun,
  latestQueuedSupervisorRequestForRun,
  mailboxActivityModel,
  parentMailboxEventsForParentMessage,
  supervisorRequestParentBlocker,
  type SubagentParentClusterLifecycleEffectModel,
  type SubagentParentClusterMailboxActivityModel,
} from "./subagentParentClusterMailboxUiModel";
import {
  completionGuardDetail,
  latestQueuedWaitBarrierAttentionForRun,
  lifecycleEffectRows,
  lifecycleEffectSummary,
  waitBarrierAttentionParentBlocker,
  waitBarrierDecisionDisplayLabel,
} from "./subagentParentClusterMailboxWaitBarrierUiModel";
import {
  arrayValue,
  booleanValue,
  recordValue,
  statusLabel,
  statusTone,
  stringValue,
  titleCase,
  truncate,
} from "./subagentParentClusterSharedUiModel";
export type {
  SubagentParentClusterTone,
  SubagentParentClusterWorkflowTaskBlockerModel,
  SubagentParentClusterWorkflowTaskChildWaitModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterWorkflowTaskUiModel";

export type {
  SubagentParentClusterChildBlockerModel,
  SubagentParentClusterChildModel,
  SubagentParentClusterParentBlockingChildModel,
  SubagentParentClusterParentBlockingModel,
} from "./subagentParentClusterChildUiModel";
export type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterLifecycleEffectModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterMailboxActivityModel,
} from "./subagentParentClusterMailboxUiModel";
export interface SubagentParentClusterModel {
  parentMessageId: string;
  title: string;
  summary: string;
  status: string;
  statusTone: SubagentParentClusterTone;
  parentBlocking?: SubagentParentClusterParentBlockingModel;
  barriers: SubagentParentClusterBarrierModel[];
  patternGraphs: SubagentPatternGraphRendererModel[];
  workflowTasks: SubagentParentClusterWorkflowTaskModel[];
  mailboxActivities: SubagentParentClusterMailboxActivityModel[];
  children: SubagentParentClusterChildModel[];
}

export interface SubagentParentClusterBarrierModel {
  id: string;
  status: string;
  statusTone: SubagentParentClusterTone;
  dependencyLabel: string;
  childCountLabel: string;
  blockingChildren: SubagentParentClusterBarrierChildModel[];
  blockingChildLabels: string[];
  failurePolicyLabel: string;
  effectRows?: SubagentParentClusterLifecycleEffectModel[];
  decisionLabel?: string;
  decisionSummary?: string;
  timeoutLabel?: string;
}

export interface SubagentParentClusterBarrierChildModel {
  runId: string;
  childThreadId?: string;
  title: string;
  canonicalTaskPath: string;
  status: string;
  statusTone: SubagentParentClusterTone;
  latestLabel?: string;
  label: string;
  detail: string;
}

export function subagentParentClusterModelsByMessageId(
  runs: SubagentRunSummary[],
  threads: ThreadSummary[],
  waitBarriers: SubagentWaitBarrierSummary[] = [],
  parentMailboxEvents: SubagentParentMailboxEventSummary[] = [],
  callableWorkflowTasks: CallableWorkflowTaskSummary[] = [],
  patternGraphSnapshots: SubagentPatternGraphSnapshot[] = [],
): Map<string, SubagentParentClusterModel> {
  const childThreads = new Map(threads.map((thread) => [thread.id, thread]));
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const runsByParentMessage = new Map<string, SubagentRunSummary[]>();
  const mailboxEventsByParentMessage = new Map<string, SubagentParentMailboxEventSummary[]>();
  const workflowTasksByParentMessage = new Map<string, CallableWorkflowTaskSummary[]>();
  const patternGraphsByParentMessage = new Map<string, SubagentPatternGraphSnapshot[]>();

  for (const run of runs) {
    if (!run.parentMessageId) continue;
    const parentRuns = runsByParentMessage.get(run.parentMessageId) ?? [];
    parentRuns.push(run);
    runsByParentMessage.set(run.parentMessageId, parentRuns);
  }

  for (const event of parentMailboxEvents) {
    if (!event.parentMessageId) continue;
    const events = mailboxEventsByParentMessage.get(event.parentMessageId) ?? [];
    events.push(event);
    mailboxEventsByParentMessage.set(event.parentMessageId, events);
  }

  for (const task of callableWorkflowTasks) {
    if (!task.parentMessageId) continue;
    const tasks = workflowTasksByParentMessage.get(task.parentMessageId) ?? [];
    tasks.push(task);
    workflowTasksByParentMessage.set(task.parentMessageId, tasks);
    if (task.patternGraphSnapshot) {
      const graphParentMessageId = task.patternGraphSnapshot.parentMessageId ?? task.parentMessageId;
      const graphs = patternGraphsByParentMessage.get(graphParentMessageId) ?? [];
      graphs.push(patternGraphSnapshotForWorkflowTask(task, runsById, childThreads));
      patternGraphsByParentMessage.set(graphParentMessageId, graphs);
    }
  }

  for (const snapshot of patternGraphSnapshots) {
    if (!snapshot.parentMessageId) continue;
    const graphs = patternGraphsByParentMessage.get(snapshot.parentMessageId) ?? [];
    graphs.push(snapshot);
    patternGraphsByParentMessage.set(snapshot.parentMessageId, graphs);
  }

  const models = new Map<string, SubagentParentClusterModel>();
  const parentMessageIds = new Set([
    ...runsByParentMessage.keys(),
    ...mailboxEventsByParentMessage.keys(),
    ...workflowTasksByParentMessage.keys(),
    ...patternGraphsByParentMessage.keys(),
  ]);
  for (const parentMessageId of parentMessageIds) {
    const parentRuns = runsByParentMessage.get(parentMessageId) ?? [];
    const sortedRuns = [...parentRuns].sort((a, b) => {
      const childA = childThreads.get(a.childThreadId);
      const childB = childThreads.get(b.childThreadId);
      return (childA?.childOrder ?? 0) - (childB?.childOrder ?? 0) || a.createdAt.localeCompare(b.createdAt);
    });
    const sortedWorkflowTaskSummaries = [...(workflowTasksByParentMessage.get(parentMessageId) ?? [])].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    const runIds = new Set(sortedRuns.map((run) => run.id));
    const relevantWaitBarriers = waitBarriers
      .filter((barrier) => barrier.childRunIds.some((runId) => runIds.has(runId)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const barriers = relevantWaitBarriers.map((barrier) => barrierModel(barrier, sortedRuns, childThreads));
    const parentMailboxEventsForCluster = parentMailboxEventsForParentMessage(
      parentMessageId,
      sortedRuns,
      sortedWorkflowTaskSummaries,
      parentMailboxEvents,
    );
    const children = sortedRuns.map((run) =>
      childModel(
        run,
        childThreads.get(run.childThreadId),
        childParentBlocker(run, relevantWaitBarriers, sortedWorkflowTaskSummaries, parentMailboxEventsForCluster),
      ),
    );
    const workflowTaskBlockers = workflowTaskParentBlockers(parentMailboxEventsForCluster);
    const workflowTaskChildWaits = workflowTaskChildWaitsForBackgroundSymphonyTasks(
      sortedWorkflowTaskSummaries,
      relevantWaitBarriers,
      runsById,
      childThreads,
    );
    const workflowTasks = sortedWorkflowTaskSummaries.map((task) =>
      callableWorkflowTaskModel(task, workflowTaskBlockers.get(task.id), workflowTaskChildWaits.get(task.id)),
    );
    const patternGraphs = uniquePatternGraphSnapshots(patternGraphsByParentMessage.get(parentMessageId) ?? [])
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.patternId.localeCompare(b.patternId))
      .map(subagentPatternGraphRendererModel);
    const mailboxActivities = parentMailboxEventsForCluster
      .slice(0, PARENT_CLUSTER_MAILBOX_ACTIVITY_PREVIEW_LIMIT)
      .map(mailboxActivityModel);
    const parentBlocking = parentBlockingModel(children);
    models.set(parentMessageId, {
      parentMessageId,
      title: "Sub-agent threads",
      summary: childSummary(children, barriers, patternGraphs, workflowTasks, mailboxActivities),
      status: clusterStatus(children, barriers, patternGraphs, workflowTasks, mailboxActivities),
      statusTone: clusterTone(children, barriers, patternGraphs, workflowTasks, mailboxActivities),
      ...(parentBlocking ? { parentBlocking } : {}),
      barriers,
      patternGraphs,
      workflowTasks,
      mailboxActivities,
      children,
    });
  }

  return models;
}

function patternGraphSnapshotForWorkflowTask(
  task: CallableWorkflowTaskSummary,
  runsById: Map<string, SubagentRunSummary>,
  childThreads: Map<string, ThreadSummary>,
): SubagentPatternGraphSnapshot {
  const snapshot = task.patternGraphSnapshot!;
  const taskStatus = patternGraphStatusFromWorkflowTask(task);
  const taskStatusLabel = task.statusLabel || titleCase(task.status);
  const activeBlocker = task.blocking && ["queued", "compiling", "running", "paused"].includes(task.status);
  const nodes = snapshot.nodes.map((node) => {
    const boundRun = node.childRunId ? runsById.get(node.childRunId) : undefined;
    const boundThread = boundRun
      ? childThreads.get(boundRun.childThreadId)
      : node.childThreadId
        ? childThreads.get(node.childThreadId)
        : undefined;
    const overflowChildren = refreshPatternGraphOverflowChildren(node.overflowChildren ?? [], runsById, childThreads);
    const overflowPatch = overflowChildren.length > 0 ? patternGraphOverflowNodeRuntimePatch(overflowChildren) : {};
    if (boundRun) {
      return {
        ...node,
        ...overflowPatch,
        childThreadId: boundRun.childThreadId,
        workflowTaskId: node.workflowTaskId ?? task.id,
        ...(task.workflowRunId ? { workflowRunId: node.workflowRunId ?? task.workflowRunId } : {}),
        label: boundThread?.title || node.label,
        status: patternGraphStatusFromChildRun(boundRun.status),
        statusLabel: statusLabel(boundRun.status),
        blockingParent: node.blockingParent && !subagentRunStatusIsSynthesisSafe(boundRun.status),
        summary: boundThread?.lastMessagePreview || node.summary || boundRun.canonicalTaskPath,
      };
    }
    const boundToChild = Boolean(node.childRunId || node.childThreadId);
    const boundToOverflowChildren = overflowChildren.length > 0;
    return {
      ...node,
      ...overflowPatch,
      workflowTaskId: node.workflowTaskId ?? task.id,
      ...(task.workflowRunId ? { workflowRunId: node.workflowRunId ?? task.workflowRunId } : {}),
      ...(!boundToChild && !boundToOverflowChildren
        ? {
            status: taskStatus,
            statusLabel: taskStatusLabel,
            blockingParent: activeBlocker && node.blockingParent,
          }
        : {}),
    };
  });
  return {
    ...snapshot,
    workflowTaskId: snapshot.workflowTaskId ?? task.id,
    ...(task.workflowRunId ? { workflowRunId: task.workflowRunId } : {}),
    updatedAt: task.updatedAt > snapshot.updatedAt ? task.updatedAt : snapshot.updatedAt,
    nodes,
    edges: subagentPatternGraphEdgesWithRuntimeState(snapshot.edges, nodes),
  };
}

function refreshPatternGraphOverflowChildren(
  overflowChildren: readonly SubagentPatternGraphOverflowChild[],
  runsById: Map<string, SubagentRunSummary>,
  childThreads: Map<string, ThreadSummary>,
): SubagentPatternGraphOverflowChild[] {
  return overflowChildren.map((child) => {
    const boundRun = runsById.get(child.childRunId);
    const boundThread = boundRun ? childThreads.get(boundRun.childThreadId) : childThreads.get(child.childThreadId);
    if (!boundRun) {
      return {
        ...child,
        ...(boundThread?.title ? { label: boundThread.title } : {}),
        ...(boundThread?.lastMessagePreview ? { summary: boundThread.lastMessagePreview } : {}),
      };
    }
    return {
      ...child,
      childThreadId: boundRun.childThreadId,
      label: boundThread?.title || child.label,
      status: patternGraphStatusFromChildRun(boundRun.status),
      statusLabel: statusLabel(boundRun.status),
      blockingParent: child.blockingParent && !subagentRunStatusIsSynthesisSafe(boundRun.status),
      summary: boundThread?.lastMessagePreview || child.summary || boundRun.canonicalTaskPath,
    };
  });
}

function patternGraphOverflowNodeRuntimePatch(overflowChildren: SubagentPatternGraphOverflowChild[]) {
  const status = aggregatePatternGraphOverflowStatus(overflowChildren);
  const approvalState = aggregatePatternGraphOverflowApprovalState(overflowChildren);
  return {
    overflowChildren,
    status,
    statusLabel: status === "idle" ? `${overflowChildren.length} more` : `${overflowChildren.length} ${titleCase(status).toLowerCase()}`,
    approvalState,
    blockingParent: overflowChildren.some((child) => child.blockingParent && child.status !== "completed" && child.status !== "idle"),
  };
}

function patternGraphStatusFromChildRun(status: SubagentRunSummary["status"]): SubagentPatternGraphSnapshot["nodes"][number]["status"] {
  if (status === "reserved" || status === "starting") return "queued";
  if (status === "waiting" || status === "needs_attention") return "blocked";
  if (status === "aborted_partial" || status === "detached") return "partial";
  if (status === "stopped" || status === "cancelled") return "cancelled";
  if (status === "timed_out") return "timed_out";
  return status;
}

function patternGraphStatusFromWorkflowTask(task: CallableWorkflowTaskSummary): SubagentPatternGraphSnapshot["nodes"][number]["status"] {
  if (task.status === "queued" || task.status === "compiling") return "queued";
  if (task.status === "running" || task.status === "paused") return "running";
  if (task.status === "succeeded") return "completed";
  if (task.status === "failed") return "failed";
  if (task.status === "canceled") return "cancelled";
  return "idle";
}

function uniquePatternGraphSnapshots(snapshots: SubagentPatternGraphSnapshot[]): SubagentPatternGraphSnapshot[] {
  const seen = new Set<string>();
  const unique: SubagentPatternGraphSnapshot[] = [];
  for (const snapshot of snapshots) {
    const key = [
      snapshot.parentThreadId,
      snapshot.parentMessageId,
      snapshot.workflowTaskId,
      snapshot.workflowRunId,
      snapshot.patternId,
      snapshot.updatedAt,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(snapshot);
  }
  return unique;
}

function childParentBlocker(
  run: SubagentRunSummary,
  barriers: SubagentWaitBarrierSummary[],
  workflowTasks: CallableWorkflowTaskSummary[],
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentClusterChildBlockerDraft | undefined {
  const approval = latestQueuedApprovalRequestForRun(run, parentMailboxEvents);
  if (approval) return approvalParentBlocker(approval);
  const supervisor = latestQueuedSupervisorRequestForRun(run, parentMailboxEvents);
  if (supervisor) return supervisorRequestParentBlocker(supervisor);
  const waitBarrierAttention = latestQueuedWaitBarrierAttentionForRun(
    run,
    parentMailboxEvents,
    barriers,
    workflowTasks,
    barrierBelongsToBackgroundCallableWorkflow,
  );
  if (waitBarrierAttention) return waitBarrierAttentionParentBlocker(waitBarrierAttention);
  const waitingBarrier = barriers.find((barrier) => barrierBlocksParentForRun(barrier, run, workflowTasks));
  if (!waitingBarrier) return undefined;
  if (waitingBarrier.status !== "waiting_on_children") {
    return unresolvedBarrierParentBlocker(run, waitingBarrier);
  }
  if (run.status === "needs_attention") {
    return {
      kind: "attention",
      label: "Blocking: needs steering",
      statusTone: "warning",
      detail: truncate(
        [
          barrierDependencyLabel(waitingBarrier.dependencyMode),
          failurePolicyLabel(waitingBarrier.failurePolicy),
          waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
        ]
          .filter(Boolean)
          .join(" / "),
        220,
      ),
    };
  }
  const activeBarrierLabel = activeBarrierChildLabel(run.status);
  if (activeBarrierLabel) {
    return {
      kind: "wait_barrier",
      label: activeBarrierLabel,
      statusTone: "active",
      detail: truncate(
        [
          barrierStatusLabel(waitingBarrier.status),
          barrierDependencyLabel(waitingBarrier.dependencyMode),
          failurePolicyLabel(waitingBarrier.failurePolicy),
          waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
        ]
          .filter(Boolean)
          .join(" / "),
        220,
      ),
    };
  }
  if (run.status === "completed") {
    return {
      kind: "wait_barrier",
      label: "Ready: child complete",
      statusTone: "success",
      detail: truncate(
        [
          statusLabel(run.status),
          barrierDependencyLabel(waitingBarrier.dependencyMode),
          failurePolicyLabel(waitingBarrier.failurePolicy),
          waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
        ]
          .filter(Boolean)
          .join(" / "),
        220,
      ),
    };
  }
  if (terminalBarrierAttentionStatus(run.status)) {
    return {
      kind: "attention",
      label: terminalBarrierAttentionLabel(run.status),
      statusTone: statusTone(run.status),
      detail: truncate(
        [
          statusLabel(run.status),
          barrierDependencyLabel(waitingBarrier.dependencyMode),
          failurePolicyLabel(waitingBarrier.failurePolicy),
          waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
        ]
          .filter(Boolean)
          .join(" / "),
        220,
      ),
    };
  }
  return undefined;
}

function barrierBlocksParentForRun(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
  workflowTasks: CallableWorkflowTaskSummary[],
): boolean {
  if (barrier.dependencyMode === "optional_background") return false;
  if (barrierBelongsToBackgroundCallableWorkflow(barrier, workflowTasks)) return false;
  if (barrier.status === "satisfied") return false;
  if (!barrier.childRunIds.includes(run.id)) return false;
  if (barrier.status === "waiting_on_children") return true;
  return !barrierChildSynthesisAllowed(barrier, run);
}

function barrierBelongsToBackgroundCallableWorkflow(
  barrier: SubagentWaitBarrierSummary,
  workflowTasks: CallableWorkflowTaskSummary[],
): boolean {
  if (barrier.ownerKind !== "callable_workflow_symphony_launch_bridge" || !barrier.ownerId) return false;
  return workflowTasks.some((task) => task.id === barrier.ownerId && task.blocking === false);
}

function unresolvedBarrierParentBlocker(
  run: SubagentRunSummary,
  barrier: SubagentWaitBarrierSummary,
): SubagentParentClusterChildBlockerDraft {
  const validationDetail = barrierChildValidationDetail(barrier, run);
  const label = terminalBarrierAttentionStatus(run.status)
    ? terminalBarrierAttentionLabel(run.status)
    : `Blocking: barrier ${barrierStatusLabel(barrier.status).toLowerCase()}`;
  return {
    kind: "attention",
    label,
    statusTone: unresolvedBarrierTone(barrier, run),
    detail: truncate(
      [
        barrierStatusLabel(barrier.status),
        statusLabel(run.status),
        validationDetail,
        barrierDependencyLabel(barrier.dependencyMode),
        failurePolicyLabel(barrier.failurePolicy),
        barrier.timeoutMs !== undefined ? timeoutLabel(barrier.timeoutMs) : undefined,
      ]
        .filter(Boolean)
        .join(" / "),
      260,
    ),
  };
}

function unresolvedBarrierTone(barrier: SubagentWaitBarrierSummary, run: SubagentRunSummary): SubagentParentClusterTone {
  if (run.status === "failed" || run.status === "stopped" || run.status === "cancelled") return "danger";
  return barrierTone(barrier.status);
}

function activeBarrierChildLabel(status: SubagentRunSummary["status"]): string | undefined {
  if (status === "reserved") return "Blocking: child queued";
  if (status === "starting") return "Blocking: child starting";
  if (status === "running") return "Blocking: child running";
  if (status === "waiting") return "Blocking: child waiting";
  return undefined;
}

function terminalBarrierAttentionStatus(status: SubagentRunSummary["status"]): boolean {
  return ["failed", "timed_out", "cancelled", "stopped", "detached", "aborted_partial"].includes(status);
}

function terminalBarrierAttentionLabel(status: SubagentRunSummary["status"]): string {
  if (status === "timed_out") return "Blocking: child timed out";
  if (status === "aborted_partial") return "Blocking: partial child";
  return `Blocking: child ${statusLabel(status).toLowerCase()}`;
}

function barrierModel(
  barrier: SubagentWaitBarrierSummary,
  runs: SubagentRunSummary[],
  childThreads: Map<string, ThreadSummary>,
): SubagentParentClusterBarrierModel {
  const blockingChildren = barrierBlockingChildren(barrier, runs, childThreads);
  const effectRows = barrierDecisionLifecycleEffectRows(barrier);
  return {
    id: barrier.id,
    status: barrierStatusLabel(barrier.status),
    statusTone: barrierTone(barrier.status),
    dependencyLabel: barrierDependencyLabel(barrier.dependencyMode),
    childCountLabel: barrierChildCountLabel(barrier),
    blockingChildren,
    blockingChildLabels: barrierBlockingChildLabels(barrier, runs, childThreads),
    failurePolicyLabel: failurePolicyLabel(barrier.failurePolicy),
    ...(effectRows.length ? { effectRows } : {}),
    ...barrierDecisionLabels(barrier),
    ...(barrier.timeoutMs !== undefined ? { timeoutLabel: timeoutLabel(barrier.timeoutMs) } : {}),
  };
}

function barrierBlockingChildren(
  barrier: SubagentWaitBarrierSummary,
  runs: SubagentRunSummary[],
  childThreads: Map<string, ThreadSummary>,
): SubagentParentClusterBarrierChildModel[] {
  if (barrier.status === "satisfied") return [];
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const children: SubagentParentClusterBarrierChildModel[] = [];
  for (const runId of barrier.childRunIds) {
    const run = runsById.get(runId);
    if (!run) {
      children.push({
        runId,
        title: `Missing child ${runId}`,
        canonicalTaskPath: runId,
        status: "Missing",
        statusTone: "danger",
        label: `Missing child ${runId}`,
        detail: `Wait barrier ${barrier.id} references missing child run ${runId}.`,
      });
      continue;
    }
    if (barrier.status !== "waiting_on_children" && barrierChildSynthesisAllowed(barrier, run)) continue;
    const title = childTitle(run, childThreads.get(run.childThreadId));
    const latest = childPreview(run, childThreads.get(run.childThreadId), resultArtifactSummary(run.resultArtifact));
    const latestLabel = latest && latest !== run.canonicalTaskPath ? `Latest: ${truncate(latest, 64)}` : undefined;
    const label = truncate([title, run.canonicalTaskPath, statusLabel(run.status), latestLabel].filter(Boolean).join(" / "), 180);
    const detail = [title, run.canonicalTaskPath, statusLabel(run.status), latestLabel].filter(Boolean).join(" / ");
    children.push({
      runId: run.id,
      childThreadId: run.childThreadId,
      title,
      canonicalTaskPath: run.canonicalTaskPath,
      status: statusLabel(run.status),
      statusTone: statusTone(run.status),
      ...(latestLabel ? { latestLabel } : {}),
      label,
      detail,
    });
  }
  return children;
}

function barrierChildSynthesisAllowed(barrier: SubagentWaitBarrierSummary, run: SubagentRunSummary): boolean {
  const childResult = barrierChildResultRecord(barrier, run);
  const synthesisAllowed = booleanValue(childResult?.synthesisAllowed);
  if (synthesisAllowed !== undefined) return synthesisAllowed;
  return subagentRunStatusIsSynthesisSafe(run.status);
}

function barrierChildValidationDetail(barrier: SubagentWaitBarrierSummary, run: SubagentRunSummary): string | undefined {
  const childResult = barrierChildResultRecord(barrier, run);
  const resultValidation = recordValue(childResult?.resultValidation);
  if (resultValidation) {
    const completionGuard = recordValue(resultValidation.completionGuardValidation);
    return completionGuard
      ? completionGuardDetail(completionGuard) || stringValue(resultValidation.reason)
      : stringValue(resultValidation.reason);
  }
  return stringValue(childResult?.reason);
}

function barrierChildResultRecord(barrier: SubagentWaitBarrierSummary, run: SubagentRunSummary): Record<string, unknown> | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  const evaluation = recordValue(artifact?.waitBarrierEvaluation);
  return arrayValue(evaluation?.childResults)
    .map(recordValue)
    .find((child) => stringValue(child?.childRunId) === run.id);
}

function barrierBlockingChildLabels(
  barrier: SubagentWaitBarrierSummary,
  runs: SubagentRunSummary[],
  childThreads: Map<string, ThreadSummary>,
): string[] {
  return barrierBlockingChildren(barrier, runs, childThreads).map((child) => child.label);
}

function barrierChildCountLabel(barrier: SubagentWaitBarrierSummary): string {
  const count = barrier.childRunIds.length;
  const base = `${count} ${count === 1 ? "child" : "children"}`;
  return barrier.quorumThreshold !== undefined ? `${base} · quorum ${barrier.quorumThreshold}` : base;
}

function barrierDecisionLabels(
  barrier: SubagentWaitBarrierSummary,
): Pick<SubagentParentClusterBarrierModel, "decisionLabel" | "decisionSummary"> {
  const decision = barrierDecisionRecord(barrier);
  if (!decision) return {};
  const decisionValue = typeof decision.decision === "string" ? decision.decision : "";
  const userDecision = typeof decision.userDecision === "string" ? decision.userDecision.trim() : "";
  const partialSummary = typeof decision.partialSummary === "string" ? decision.partialSummary.trim() : "";
  const controlSummary = barrierDecisionControlSummary(barrier);
  const summaryLimit = 180;
  if (decisionValue === "continue_with_partial") {
    const decisionSummary = firstText(partialSummary, userDecision, controlSummary);
    return {
      decisionLabel: "Partial approved",
      ...(decisionSummary ? { decisionSummary: truncate(decisionSummary, summaryLimit) } : {}),
    };
  }
  if (decisionValue === "retry_child") {
    const decisionSummary = firstText(userDecision, controlSummary);
    return {
      decisionLabel: waitBarrierDecisionDisplayLabel(decisionValue, recordValue(barrier.resolutionArtifact)),
      ...(decisionSummary ? { decisionSummary: truncate(decisionSummary, summaryLimit) } : {}),
    };
  }
  if (decisionValue === "detach_child") {
    const decisionSummary = firstText(userDecision, controlSummary);
    return {
      decisionLabel: "Child detached",
      ...(decisionSummary ? { decisionSummary: truncate(decisionSummary, summaryLimit) } : {}),
    };
  }
  if (decisionValue === "cancel_parent") {
    const decisionSummary = firstText(userDecision, controlSummary);
    return {
      decisionLabel: "Parent cancelled",
      ...(decisionSummary ? { decisionSummary: truncate(decisionSummary, summaryLimit) } : {}),
    };
  }
  if (decisionValue === "fail_parent") {
    const decisionSummary = firstText(userDecision, controlSummary);
    return {
      decisionLabel: "Fail parent",
      ...(decisionSummary ? { decisionSummary: truncate(decisionSummary, summaryLimit) } : {}),
    };
  }
  return {};
}

function barrierDecisionRecord(barrier: SubagentWaitBarrierSummary): Record<string, unknown> | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  const decision = recordValue(artifact?.userDecision);
  return decision?.schemaVersion === "ambient-subagent-user-decision-v1" ? decision : undefined;
}

function barrierDecisionControlSummary(barrier: SubagentWaitBarrierSummary): string | undefined {
  const artifact = recordValue(barrier.resolutionArtifact);
  if (!artifact) return undefined;
  return lifecycleEffectSummary(artifact);
}

function barrierDecisionLifecycleEffectRows(barrier: SubagentWaitBarrierSummary): SubagentParentClusterLifecycleEffectModel[] {
  const artifact = recordValue(barrier.resolutionArtifact);
  return artifact ? lifecycleEffectRows(artifact) : [];
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value));
}

function barrierStatusLabel(status: SubagentWaitBarrierSummary["status"]): string {
  if (status === "waiting_on_children") return "Waiting on child";
  return status.split("_").map(titleCase).join(" ");
}

function barrierDependencyLabel(mode: SubagentWaitBarrierSummary["dependencyMode"]): string {
  if (mode === "required_all") return "Required all";
  if (mode === "required_any") return "Required any";
  if (mode === "optional_background") return "Background";
  return "Quorum";
}

function failurePolicyLabel(policy: SubagentWaitBarrierSummary["failurePolicy"]): string {
  if (policy === "ask_user") return "Ask user on failure";
  if (policy === "degrade_partial") return "Allow partial";
  if (policy === "retry_child") return "Retry child";
  return "Fail parent";
}

function barrierTone(status: SubagentWaitBarrierSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "waiting_on_children":
      return "active";
    case "satisfied":
      return "success";
    case "timed_out":
    case "cancelled":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function timeoutLabel(timeoutMs: number): string {
  if (timeoutMs < 1000) return `${timeoutMs}ms timeout`;
  const seconds = Math.round(timeoutMs / 1000);
  if (seconds < 60) return `${seconds}s timeout`;
  return `${Math.round(seconds / 60)}m timeout`;
}
