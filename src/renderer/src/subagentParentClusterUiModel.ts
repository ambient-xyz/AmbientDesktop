import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentParentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierDecision, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import {
  aggregatePatternGraphOverflowApprovalState,
  aggregatePatternGraphOverflowStatus,
  subagentPatternGraphEdgesWithRuntimeState,
  type SubagentPatternGraphOverflowChild,
} from "../../shared/subagentPatternGraph";
import {
  subagentPatternGraphRendererModel,
  type SubagentPatternGraphRendererModel,
} from "./subagentPatternGraphUiModel";

export interface SubagentParentClusterChildModel {
  runId: string;
  childThreadId: string;
  workspacePath: string;
  canOpenThread: boolean;
  openThreadTitle: string;
  title: string;
  status: string;
  runStatus: SubagentRunStatus;
  statusTone: SubagentParentClusterTone;
  isTerminal: boolean;
  isSynthesisSafe: boolean;
  dependencyLabel: string;
  runtimeLabel: string;
  preview: string;
  canCancel: boolean;
  cancelTitle: string;
  canClose: boolean;
  closeTitle: string;
  closedLabel?: string;
  retentionLabel?: string;
  retentionTitle?: string;
  parentBlocker?: SubagentParentClusterChildBlockerModel;
}

export interface SubagentParentClusterChildBlockerModel {
  kind: "approval" | "attention" | "wait_barrier";
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
  metaLabels: string[];
}

type SubagentParentClusterChildBlockerDraft = Omit<SubagentParentClusterChildBlockerModel, "metaLabels">;

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

export interface SubagentParentClusterParentBlockingModel {
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
  blockingChildren: SubagentParentClusterParentBlockingChildModel[];
}

export interface SubagentParentClusterParentBlockingChildModel {
  runId: string;
  childThreadId?: string;
  title: string;
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
  kind: SubagentParentClusterChildBlockerModel["kind"];
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

export interface SubagentParentClusterLifecycleEffectModel {
  key: string;
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
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

export interface SubagentParentClusterMailboxActivityModel {
  id: string;
  label: string;
  sourceLabel?: string;
  statusTone: SubagentParentClusterTone;
  summary: string;
  detail?: string;
  effectRows?: SubagentParentClusterLifecycleEffectModel[];
  actionLabels?: string[];
  actions?: SubagentParentClusterMailboxActionModel[];
  approvalActions?: SubagentParentClusterApprovalActionModel[];
  updatedAt: string;
}

export interface SubagentParentClusterMailboxActionModel {
  label: string;
  title: string;
  waitBarrierId: string;
  decision: SubagentWaitBarrierDecision;
  requiresUserDecision: boolean;
  requiresPartialSummary: boolean;
  childRunIds?: string[];
  sourceLabel?: string;
}

export interface SubagentParentClusterApprovalActionModel {
  label: string;
  title: string;
  decision: "approved" | "denied";
  childRunId: string;
  childThreadId?: string;
  approvalId: string;
  approvalRequestParentMailboxEventId: string;
  requestedScope?: string;
  effectiveScope?: string;
  prompt?: string;
  toolLabel?: string;
  sourceLabel?: string;
}

export interface SubagentParentClusterWorkflowTaskModel {
  id: string;
  title: string;
  status: string;
  statusTone: SubagentParentClusterTone;
  modeLabel: string;
  sourceLabel: string;
  workflowThreadId?: string;
  workflowThreadLabel?: string;
  canOpenWorkflowThread: boolean;
  openWorkflowThreadTitle: string;
  progressLabel: string;
  capabilityLabels: string[];
  telemetryLabels: string[];
  idLabels?: string[];
  launchCardLabels?: string[];
  provenanceLabels?: string[];
  mutationEvidenceLabels?: string[];
  canPause: boolean;
  pauseTitle: string;
  canCancel: boolean;
  cancelTitle: string;
  canResume: boolean;
  resumeTitle: string;
  parentBlocker?: SubagentParentClusterWorkflowTaskBlockerModel;
  detail?: string;
}

export interface SubagentParentClusterWorkflowTaskBlockerModel {
  kind: "waiting" | "attention";
  label: string;
  detail: string;
  statusTone: SubagentParentClusterTone;
}

export type SubagentParentClusterTone = "neutral" | "active" | "success" | "warning" | "danger";

const PARENT_CLUSTER_MAILBOX_ACTIVITY_PREVIEW_LIMIT = 6;

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
    const children = sortedRuns.map((run) => childModel(
      run,
      childThreads.get(run.childThreadId),
      childParentBlocker(run, relevantWaitBarriers, parentMailboxEventsForCluster),
    ));
    const workflowTaskBlockers = workflowTaskParentBlockers(parentMailboxEventsForCluster);
    const workflowTasks = sortedWorkflowTaskSummaries.map((task) => callableWorkflowTaskModel(task, workflowTaskBlockers.get(task.id)));
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

function childModel(
  run: SubagentRunSummary,
  thread: ThreadSummary | undefined,
  parentBlocker: SubagentParentClusterChildBlockerDraft | undefined,
): SubagentParentClusterChildModel {
  const profile = run.modelRuntimeSnapshot.profile;
  const retainedSummary = childThreadSummaryRetained(run, thread);
  const resultSummary = resultArtifactSummary(run.resultArtifact);
  const title = childTitle(run, thread);
  const preview = childPreview(run, thread, resultSummary);
  return {
    runId: run.id,
    childThreadId: run.childThreadId,
    workspacePath: thread?.workspacePath ?? "",
    canOpenThread: Boolean(thread && !thread.archivedAt),
    openThreadTitle: retainedSummary
      ? `Sub-agent ${run.canonicalTaskPath} transcript was collapsed by retention; summary metadata remains.`
      : !thread
        ? `Sub-agent ${run.canonicalTaskPath} thread is unavailable; run metadata remains.`
      : `Open sub-agent ${run.canonicalTaskPath}`,
    title,
    status: statusLabel(run.status),
    runStatus: run.status,
    statusTone: statusTone(run.status),
    isTerminal: subagentRunStatusIsTerminal(run.status),
    isSynthesisSafe: subagentRunStatusIsSynthesisSafe(run.status),
    dependencyLabel: dependencyLabel(run.dependencyMode),
    runtimeLabel: profile.locality === "local" ? "Local" : "Cloud",
    preview,
    canCancel: !retainedSummary && canCancelChildRun(run),
    cancelTitle: `Cancel sub-agent ${run.canonicalTaskPath}`,
    canClose: !retainedSummary && canCloseChildRun(run),
    closeTitle: `Close sub-agent ${run.canonicalTaskPath}; transcript and artifacts are retained`,
    ...(run.closedAt ? { closedLabel: "Closed" } : {}),
    ...(retainedSummary ? {
      retentionLabel: "Summary retained",
      retentionTitle: `Sub-agent ${run.canonicalTaskPath} transcript was collapsed by retention; result metadata and artifacts remain available.`,
    } : {}),
    ...(parentBlocker ? { parentBlocker: withChildBlockerMeta(parentBlocker, run, title, preview) } : {}),
  };
}

function parentBlockingModel(
  children: SubagentParentClusterChildModel[],
): SubagentParentClusterParentBlockingModel | undefined {
  const blockingChildren = children
    .map(parentBlockingChildModel)
    .filter((child): child is SubagentParentClusterParentBlockingChildModel => Boolean(child));
  if (!blockingChildren.length) return undefined;
  const tone = parentBlockingTone(blockingChildren);
  const approvalCount = blockingChildren.filter((child) => child.kind === "approval").length;
  const attentionCount = blockingChildren.filter((child) => child.kind === "attention").length;
  const activeCount = blockingChildren.filter((child) => child.kind === "wait_barrier").length;
  const childLabel = `${blockingChildren.length} ${blockingChildren.length === 1 ? "child" : "children"}`;
  const label = approvalCount
    ? `Parent blocked on ${childLabel}: approval needed`
    : attentionCount
      ? `Parent blocked on ${childLabel}: attention needed`
      : `Parent waiting on ${childLabel}`;
  return {
    label,
    detail: [
      approvalCount ? `${approvalCount} approval ${approvalCount === 1 ? "request" : "requests"}` : undefined,
      attentionCount ? `${attentionCount} attention ${attentionCount === 1 ? "blocker" : "blockers"}` : undefined,
      activeCount ? `${activeCount} active ${activeCount === 1 ? "child" : "children"}` : undefined,
      blockingChildren.slice(0, 3).map((child) => child.title).join(", "),
    ].filter(Boolean).join(" / "),
    statusTone: tone,
    blockingChildren,
  };
}

function parentBlockingChildModel(child: SubagentParentClusterChildModel): SubagentParentClusterParentBlockingChildModel | undefined {
  const blocker = child.parentBlocker;
  if (!blocker || blocker.statusTone === "success") return undefined;
  return {
    runId: child.runId,
    childThreadId: child.childThreadId,
    title: child.title,
    label: `${child.title}: ${blocker.label.replace(/^Blocking:\s*/i, "")}`,
    detail: [blocker.detail, ...blocker.metaLabels].filter(Boolean).join(" / "),
    statusTone: blocker.statusTone,
    kind: blocker.kind,
  };
}

function parentBlockingTone(children: SubagentParentClusterParentBlockingChildModel[]): SubagentParentClusterTone {
  if (children.some((child) => child.statusTone === "danger")) return "danger";
  if (children.some((child) => child.statusTone === "warning" || child.kind === "approval")) return "warning";
  if (children.some((child) => child.statusTone === "active")) return "active";
  return "neutral";
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
    const boundThread = boundRun ? childThreads.get(boundRun.childThreadId) : node.childThreadId ? childThreads.get(node.childThreadId) : undefined;
    const overflowChildren = refreshPatternGraphOverflowChildren(node.overflowChildren ?? [], runsById, childThreads);
    const overflowPatch = overflowChildren.length > 0
      ? patternGraphOverflowNodeRuntimePatch(overflowChildren)
      : {};
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
      ...(!boundToChild && !boundToOverflowChildren ? {
        status: taskStatus,
        statusLabel: taskStatusLabel,
        blockingParent: activeBlocker && node.blockingParent,
      } : {}),
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
    blockingParent: overflowChildren.some((child) =>
      child.blockingParent && child.status !== "completed" && child.status !== "idle"
    ),
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

function subagentRunStatusIsSynthesisSafe(status: SubagentRunSummary["status"]): boolean {
  return status === "completed";
}

function subagentRunStatusIsTerminal(status: SubagentRunSummary["status"]): boolean {
  switch (status) {
    case "completed":
    case "failed":
    case "stopped":
    case "cancelled":
    case "timed_out":
    case "detached":
    case "aborted_partial":
      return true;
    default:
      return false;
  }
}

function patternGraphStatusFromWorkflowTask(task: CallableWorkflowTaskSummary): SubagentPatternGraphSnapshot["nodes"][number]["status"] {
  if (task.status === "queued" || task.status === "compiling") return "queued";
  if (task.status === "running" || task.status === "paused") return "running";
  if (task.status === "succeeded") return "completed";
  if (task.status === "failed") return "failed";
  if (task.status === "canceled") return "cancelled";
  return "idle";
}

function childTitle(run: SubagentRunSummary, thread: ThreadSummary | undefined): string {
  return thread?.title || `${titleCase(run.roleId)} sub-agent`;
}

function childPreview(
  run: SubagentRunSummary,
  thread: ThreadSummary | undefined,
  resultSummary: string | undefined,
): string {
  return thread?.lastMessagePreview || resultSummary || run.canonicalTaskPath;
}

function withChildBlockerMeta(
  blocker: SubagentParentClusterChildBlockerDraft,
  run: SubagentRunSummary,
  title: string,
  preview: string,
): SubagentParentClusterChildBlockerModel {
  return {
    ...blocker,
    metaLabels: [
      ...approvalBlockerScopeMetaLabels(blocker),
      `Child: ${truncate(title, 72)}`,
      `Path: ${run.canonicalTaskPath}`,
      `Status: ${statusLabel(run.status)}`,
      `Elapsed: ${elapsedLabel(run.createdAt, run.updatedAt)}`,
      `Latest: ${truncate(preview, 96)}`,
    ],
  };
}

function approvalBlockerScopeMetaLabels(blocker: SubagentParentClusterChildBlockerDraft): string[] {
  if (blocker.kind !== "approval") return [];
  if (blocker.detail.includes("This child thread")) return [];
  return ["Scope option: This child thread"];
}

function childThreadSummaryRetained(run: SubagentRunSummary, thread: ThreadSummary | undefined): boolean {
  if (thread?.archivedAt) return true;
  return !thread && Boolean(run.closedAt);
}

function resultArtifactSummary(resultArtifact: unknown): string | undefined {
  if (!resultArtifact || typeof resultArtifact !== "object") return undefined;
  const summary = (resultArtifact as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : undefined;
}

function canCancelChildRun(run: SubagentRunSummary): boolean {
  return !run.closedAt && ["reserved", "starting", "running", "waiting", "needs_attention"].includes(run.status);
}

function canCloseChildRun(run: SubagentRunSummary): boolean {
  return !run.closedAt && !["reserved", "starting", "running", "waiting"].includes(run.status);
}

function dependencyLabel(mode: SubagentRunSummary["dependencyMode"]): string {
  if (mode === "required") return "Required";
  if (mode === "supervisor_attention") return "Needs attention";
  return "Background";
}

function childSummary(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierModel[],
  patternGraphs: SubagentPatternGraphRendererModel[],
  workflowTasks: SubagentParentClusterWorkflowTaskModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): string {
  const required = children.filter((child) => child.dependencyLabel === "Required").length;
  const background = children.filter((child) => child.dependencyLabel === "Background").length;
  const needsAttention = children.filter((child) => child.dependencyLabel === "Needs attention" || child.status === "Needs attention").length;
  const childAttentionBlockers = children.filter((child) =>
    child.parentBlocker?.kind === "attention" && child.status !== "Needs attention"
  ).length;
  const retainedSummaries = children.filter((child) => child.retentionLabel === "Summary retained").length;
  const approvalBlocked = children.filter((child) => child.parentBlocker?.kind === "approval").length;
  const waiting = barriers.filter((barrier) => barrier.statusTone === "active").length;
  const workflowBlocking = workflowTasks.filter((task) => task.modeLabel === "Blocking").length;
  const workflowActive = workflowTasks.filter((task) => task.statusTone === "active").length;
  const workflowNeedsAttention = workflowTasks.filter((task) => task.statusTone === "warning" || task.statusTone === "danger").length;
  const activeBatches = mailboxActivities.filter((activity) => activity.label === "Batch progress" && activity.statusTone === "active").length;
  const failedSpawns = mailboxActivities.filter((activity) => activity.label === "Spawn failed").length;
  const interruptions = mailboxActivities.filter((activity) => activity.label === "Child interrupted" || activity.label === "Parent stopped").length;
  const workflowBlockers = mailboxActivities.filter((activity) => activity.label === "Workflow blocked").length;
  const supervisorRequests = mailboxActivities.filter((activity) => activity.label === "Supervisor request").length;
  const pieces = [`${children.length} ${children.length === 1 ? "child" : "children"}`];
  if (required) pieces.push(`${required} required`);
  if (background) pieces.push(`${background} background`);
  if (needsAttention || childAttentionBlockers) pieces.push(`${needsAttention + childAttentionBlockers} attention`);
  if (retainedSummaries) pieces.push(`${retainedSummaries} retained`);
  if (approvalBlocked) pieces.push(`${approvalBlocked} approval blocked`);
  if (waiting) pieces.push(`${waiting} waiting`);
  if (patternGraphs.length) pieces.push(`${patternGraphs.length} pattern ${patternGraphs.length === 1 ? "graph" : "graphs"}`);
  if (workflowTasks.length) pieces.push(`${workflowTasks.length} workflow ${workflowTasks.length === 1 ? "task" : "tasks"}`);
  if (workflowBlocking) pieces.push(`${workflowBlocking} blocking`);
  if (workflowActive) pieces.push(`${workflowActive} active`);
  if (workflowNeedsAttention) pieces.push(`${workflowNeedsAttention} workflow attention`);
  if (workflowBlockers) pieces.push(`${workflowBlockers} workflow blocked`);
  if (supervisorRequests) pieces.push(`${supervisorRequests} supervisor ${supervisorRequests === 1 ? "request" : "requests"}`);
  if (activeBatches) pieces.push(`${activeBatches} batch pending`);
  if (failedSpawns) pieces.push(`${failedSpawns} failed ${failedSpawns === 1 ? "spawn" : "spawns"}`);
  if (interruptions) pieces.push(`${interruptions} interrupted`);
  return pieces.join(" · ");
}

function clusterStatus(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierModel[],
  patternGraphs: SubagentPatternGraphRendererModel[],
  workflowTasks: SubagentParentClusterWorkflowTaskModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): string {
  if (barriers.some((barrier) => barrier.statusTone === "danger")) return "Needs attention";
  if (children.some((child) => child.statusTone === "danger")) return "Needs attention";
  if (workflowTasks.some((task) => task.statusTone === "danger")) return "Needs attention";
  if (mailboxActivities.some((activity) => activity.statusTone === "danger")) return "Needs attention";
  if (hasApprovalBlocker(children, mailboxActivities)) return "Approval needed";
  if (hasChildAttentionBlocker(children)) return "Needs attention";
  if (hasSupervisorAttention(mailboxActivities)) return "Needs attention";
  if (hasWorkflowBlocker(mailboxActivities, "warning")) return "Needs attention";
  if (workflowTasks.some((task) => task.statusTone === "warning")) return "Needs attention";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "warning" || node.tone === "danger"))) return "Needs attention";
  if (hasWorkflowBlocker(mailboxActivities, "active")) return "Waiting";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.blockingParent && node.tone === "active"))) return "Waiting";
  if (workflowTasks.some((task) => task.modeLabel === "Blocking" && task.statusTone === "active")) return "Waiting";
  if (barriers.some((barrier) => barrier.statusTone === "active")) return "Waiting";
  if (children.some((child) => child.statusTone === "active")) return "Running";
  if (workflowTasks.some((task) => task.statusTone === "active")) return "Running";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "active"))) return "Running";
  if (mailboxActivities.some((activity) => activity.statusTone === "active")) return "Running";
  if (children.some((child) => child.status === "Needs attention")) return "Needs attention";
  if (children.some((child) => child.statusTone === "warning")) return "Partial";
  if (mailboxActivities.some((activity) => activity.statusTone === "warning")) return "Partial";
  if (children.length > 0 && children.every((child) => child.statusTone === "success")) return "Complete";
  if (children.length === 0 && workflowTasks.length > 0 && workflowTasks.every((task) => task.statusTone === "success")) return "Complete";
  if (children.length === 0 && workflowTasks.length === 0 && patternGraphs.length > 0 && patternGraphs.every((graph) => graph.nodes.every((node) => node.tone === "success"))) return "Complete";
  if (children.length === 0 && mailboxActivities.some((activity) => activity.statusTone === "success")) return "Complete";
  return "Idle";
}

function clusterTone(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierModel[],
  patternGraphs: SubagentPatternGraphRendererModel[],
  workflowTasks: SubagentParentClusterWorkflowTaskModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): SubagentParentClusterTone {
  if (barriers.some((barrier) => barrier.statusTone === "danger")) return "danger";
  if (children.some((child) => child.statusTone === "danger")) return "danger";
  if (workflowTasks.some((task) => task.statusTone === "danger")) return "danger";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "danger"))) return "danger";
  if (mailboxActivities.some((activity) => activity.statusTone === "danger")) return "danger";
  if (hasApprovalBlocker(children, mailboxActivities)) return "warning";
  const childAttentionTone = childAttentionBlockerTone(children);
  if (childAttentionTone) return childAttentionTone;
  if (hasSupervisorAttention(mailboxActivities)) return "warning";
  if (hasWorkflowBlocker(mailboxActivities, "warning")) return "warning";
  if (workflowTasks.some((task) => task.statusTone === "warning")) return "warning";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "warning"))) return "warning";
  if (hasWorkflowBlocker(mailboxActivities, "active")) return "active";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.blockingParent && node.tone === "active"))) return "active";
  if (workflowTasks.some((task) => task.modeLabel === "Blocking" && task.statusTone === "active")) return "active";
  if (barriers.some((barrier) => barrier.statusTone === "active")) return "active";
  if (barriers.some((barrier) => barrier.statusTone === "warning")) return "warning";
  if (children.some((child) => child.statusTone === "active")) return "active";
  if (workflowTasks.some((task) => task.statusTone === "active")) return "active";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "active"))) return "active";
  if (mailboxActivities.some((activity) => activity.statusTone === "active")) return "active";
  if (children.some((child) => child.statusTone === "warning")) return "warning";
  if (mailboxActivities.some((activity) => activity.statusTone === "warning")) return "warning";
  if (children.length > 0 && children.every((child) => child.statusTone === "success")) return "success";
  if (children.length === 0 && workflowTasks.length > 0 && workflowTasks.every((task) => task.statusTone === "success")) return "success";
  if (children.length === 0 && workflowTasks.length === 0 && patternGraphs.length > 0 && patternGraphs.every((graph) => graph.nodes.every((node) => node.tone === "success"))) return "success";
  if (children.length === 0 && mailboxActivities.some((activity) => activity.statusTone === "success")) return "success";
  return "neutral";
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

function hasApprovalBlocker(
  children: SubagentParentClusterChildModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): boolean {
  return children.some((child) => child.parentBlocker?.kind === "approval") ||
    mailboxActivities.some((activity) => activity.label === "Approval requested" && activity.statusTone === "active");
}

function hasChildAttentionBlocker(children: SubagentParentClusterChildModel[]): boolean {
  return children.some((child) => child.parentBlocker?.kind === "attention");
}

function childAttentionBlockerTone(children: SubagentParentClusterChildModel[]): SubagentParentClusterTone | undefined {
  const blockers = children
    .map((child) => child.parentBlocker)
    .filter((blocker): blocker is SubagentParentClusterChildBlockerModel => blocker?.kind === "attention");
  if (blockers.some((blocker) => blocker.statusTone === "danger")) return "danger";
  if (blockers.some((blocker) => blocker.statusTone === "warning")) return "warning";
  if (blockers.some((blocker) => blocker.statusTone === "active")) return "active";
  return blockers.length ? "neutral" : undefined;
}

function hasWorkflowBlocker(
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
  tone: SubagentParentClusterTone,
): boolean {
  return mailboxActivities.some((activity) => activity.label === "Workflow blocked" && activity.statusTone === tone);
}

function hasSupervisorAttention(
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): boolean {
  return mailboxActivities.some((activity) => activity.label === "Supervisor request" && activity.statusTone === "warning");
}

function parentMailboxEventsForParentMessage(
  parentMessageId: string,
  runs: SubagentRunSummary[],
  workflowTasks: CallableWorkflowTaskSummary[],
  events: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary[] {
  const parentRunIds = new Set([
    ...runs.map((run) => run.parentRunId),
    ...workflowTasks.map((task) => task.parentRunId),
  ]);
  return events
    .filter((event) => event.parentMessageId === parentMessageId || parentRunIds.has(event.parentRunId))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

function childParentBlocker(
  run: SubagentRunSummary,
  barriers: SubagentWaitBarrierSummary[],
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentClusterChildBlockerDraft | undefined {
  const approval = latestQueuedApprovalRequestForRun(run, parentMailboxEvents);
  if (approval) return approvalParentBlocker(approval);
  const supervisor = latestQueuedSupervisorRequestForRun(run, parentMailboxEvents);
  if (supervisor) return supervisorRequestParentBlocker(supervisor);
  const waitBarrierAttention = latestQueuedWaitBarrierAttentionForRun(run, parentMailboxEvents);
  if (waitBarrierAttention) return waitBarrierAttentionParentBlocker(waitBarrierAttention);
  const waitingBarrier = barriers.find((barrier) => barrierBlocksParentForRun(barrier, run));
  if (!waitingBarrier) return undefined;
  if (waitingBarrier.status !== "waiting_on_children") {
    return unresolvedBarrierParentBlocker(run, waitingBarrier);
  }
  if (run.status === "needs_attention") {
    return {
      kind: "attention",
      label: "Blocking: needs steering",
      statusTone: "warning",
      detail: truncate([
        barrierDependencyLabel(waitingBarrier.dependencyMode),
        failurePolicyLabel(waitingBarrier.failurePolicy),
        waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
      ].filter(Boolean).join(" / "), 220),
    };
  }
  const activeBarrierLabel = activeBarrierChildLabel(run.status);
  if (activeBarrierLabel) {
    return {
      kind: "wait_barrier",
      label: activeBarrierLabel,
      statusTone: "active",
      detail: truncate([
        barrierStatusLabel(waitingBarrier.status),
        barrierDependencyLabel(waitingBarrier.dependencyMode),
        failurePolicyLabel(waitingBarrier.failurePolicy),
        waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
      ].filter(Boolean).join(" / "), 220),
    };
  }
  if (run.status === "completed") {
    return {
      kind: "wait_barrier",
      label: "Ready: child complete",
      statusTone: "success",
      detail: truncate([
        statusLabel(run.status),
        barrierDependencyLabel(waitingBarrier.dependencyMode),
        failurePolicyLabel(waitingBarrier.failurePolicy),
        waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
      ].filter(Boolean).join(" / "), 220),
    };
  }
  if (terminalBarrierAttentionStatus(run.status)) {
    return {
      kind: "attention",
      label: terminalBarrierAttentionLabel(run.status),
      statusTone: statusTone(run.status),
      detail: truncate([
        statusLabel(run.status),
        barrierDependencyLabel(waitingBarrier.dependencyMode),
        failurePolicyLabel(waitingBarrier.failurePolicy),
        waitingBarrier.timeoutMs !== undefined ? timeoutLabel(waitingBarrier.timeoutMs) : undefined,
      ].filter(Boolean).join(" / "), 220),
    };
  }
  return undefined;
}

function barrierBlocksParentForRun(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
): boolean {
  if (barrier.dependencyMode === "optional_background") return false;
  if (barrier.status === "satisfied") return false;
  if (!barrier.childRunIds.includes(run.id)) return false;
  if (barrier.status === "waiting_on_children") return true;
  return !barrierChildSynthesisAllowed(barrier, run);
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
    detail: truncate([
      barrierStatusLabel(barrier.status),
      statusLabel(run.status),
      validationDetail,
      barrierDependencyLabel(barrier.dependencyMode),
      failurePolicyLabel(barrier.failurePolicy),
      barrier.timeoutMs !== undefined ? timeoutLabel(barrier.timeoutMs) : undefined,
    ].filter(Boolean).join(" / "), 260),
  };
}

function unresolvedBarrierTone(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
): SubagentParentClusterTone {
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

function latestQueuedApprovalRequestForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.child_approval_requested" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    return payload?.schemaVersion === "ambient-subagent-approval-bridge-v1" &&
      stringValue(payload.childRunId) === run.id;
  });
}

function latestQueuedSupervisorRequestForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.child_supervisor_request" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    return payload?.schemaVersion === "ambient-subagent-supervisor-request-v1" &&
      payload.parentRequiresAttention === true &&
      stringValue(payload.childRunId) === run.id;
  });
}

function latestQueuedWaitBarrierAttentionForRun(
  run: SubagentRunSummary,
  parentMailboxEvents: SubagentParentMailboxEventSummary[],
): SubagentParentMailboxEventSummary | undefined {
  return parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.wait_barrier_attention" || event.deliveryState !== "queued") return false;
    const payload = recordValue(event.payload);
    return payload?.schemaVersion === "ambient-subagent-wait-barrier-attention-v1" &&
      stringValue(payload.childRunId) === run.id;
  });
}

function approvalParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload);
  const title = stringValue(payload?.title) ?? "Child approval needed";
  const toolCategory = stringValue(payload?.requestedToolCategory);
  const requestedAction = stringValue(payload?.requestedAction);
  const effectiveScope = stringValue(payload?.effectiveScope);
  const prompt = stringValue(payload?.prompt);
  return {
    kind: "approval",
    label: "Blocking: approval",
    statusTone: "warning",
    detail: truncate([
      title,
      toolCategory ?? requestedAction,
      effectiveScope ? approvalScopeLabel(effectiveScope) : undefined,
      prompt,
    ].filter(Boolean).join(" / "), 240),
  };
}

function waitBarrierAttentionParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload) ?? {};
  const parentResolution = recordValue(payload.parentResolution);
  const action = stringValue(parentResolution?.action);
  const barrierStatus = stringValue(payload.barrierStatus);
  const dependencyMode = stringValue(payload.dependencyMode);
  const reason = stringValue(payload.reason);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  const completionGuardBlocked = waitBarrierCompletionGuardBlocked(payload);
  return {
    kind: "attention",
    label: completionGuardBlocked ? "Blocking: completion guard" : "Blocking: barrier attention",
    statusTone: waitBarrierAttentionTone(action, barrierStatus),
    detail: truncate([
      action ? waitBarrierActionLabel(action) : "Needs decision",
      barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
      dependencyMode ? barrierDependencyLabelFromString(dependencyMode) : undefined,
      waitBarrierResultValidationDetail(payload),
      reason,
      choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
    ].filter(Boolean).join(" / "), 260),
  };
}

function supervisorRequestParentBlocker(event: SubagentParentMailboxEventSummary): SubagentParentClusterChildBlockerDraft {
  const payload = recordValue(event.payload);
  const kind = stringValue(payload?.kind);
  const title = stringValue(payload?.title) ?? "Child supervisor request";
  const message = stringValue(payload?.messagePreview);
  return {
    kind: "attention",
    label: kind === "blocked" ? "Blocking: child blocked" : "Blocking: needs decision",
    statusTone: "warning",
    detail: truncate([
      supervisorRequestKindLabel(kind),
      title,
      message,
    ].filter(Boolean).join(" / "), 240),
  };
}

function callableWorkflowTaskModel(
  task: CallableWorkflowTaskSummary,
  parentBlocker?: SubagentParentClusterWorkflowTaskBlockerModel,
): SubagentParentClusterWorkflowTaskModel {
  const detail = callableWorkflowTaskDetail(task);
  const launchCardLabels = callableWorkflowTaskLaunchCardLabels(task);
  const provenanceLabels = callableWorkflowTaskProvenanceLabels(task);
  const mutationEvidenceLabels = callableWorkflowTaskMutationEvidenceLabels(task);
  const idLabels = callableWorkflowTaskIdLabels(task);
  return {
    id: task.id,
    title: task.title || task.toolName || task.id,
    status: task.statusLabel || statusLabelFromString(task.status),
    statusTone: callableWorkflowTaskTone(task.status),
    modeLabel: task.blocking ? "Blocking" : "Background",
    sourceLabel: callableWorkflowTaskSourceLabel(task),
    ...(task.workflowThreadId ? { workflowThreadId: task.workflowThreadId, workflowThreadLabel: `Workflow thread: ${task.workflowThreadId}` } : {}),
    canOpenWorkflowThread: Boolean(task.workflowThreadId),
    openWorkflowThreadTitle: task.workflowThreadId ? `Open workflow thread ${task.workflowThreadId}` : "Workflow thread is not linked yet",
    progressLabel: callableWorkflowTaskProgressLabel(task),
    capabilityLabels: callableWorkflowTaskCapabilityLabels(task),
    telemetryLabels: callableWorkflowTaskTelemetryLabels(task),
    ...(idLabels.length ? { idLabels } : {}),
    ...(launchCardLabels.length ? { launchCardLabels } : {}),
    ...(provenanceLabels.length ? { provenanceLabels } : {}),
    ...(mutationEvidenceLabels.length ? { mutationEvidenceLabels } : {}),
    canPause: task.pauseResumeCancel && callableWorkflowTaskCanPause(task),
    pauseTitle: `Pause ${task.blocking ? "blocking" : "background"} workflow task`,
    canCancel: task.pauseResumeCancel && callableWorkflowTaskCanCancel(task.status),
    cancelTitle: `Cancel ${task.blocking ? "blocking" : "background"} workflow task`,
    canResume: task.pauseResumeCancel && callableWorkflowTaskCanResume(task),
    resumeTitle: `Resume ${task.blocking ? "blocking" : "background"} workflow task`,
    ...(parentBlocker ? { parentBlocker } : {}),
    ...(detail ? { detail } : {}),
  };
}

function callableWorkflowTaskIdLabels(task: CallableWorkflowTaskSummary): string[] {
  return [
    `Task: ${task.id}`,
    task.workflowArtifactId ? `Artifact: ${task.workflowArtifactId}` : undefined,
    task.workflowRunId ? `Run: ${task.workflowRunId}` : undefined,
    task.workflowThreadId ? `Thread: ${task.workflowThreadId}` : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskMutationEvidenceLabels(task: CallableWorkflowTaskSummary): string[] {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (stringValue(provenance?.kind) !== "subagent_child_thread") return [];
  const approval = recordValue(provenance?.approval);
  const worktree = recordValue(provenance?.worktree);
  const nestedFanout = recordValue(provenance?.nestedFanout);
  const lastEvent = task.progressSnapshot?.lastEventMessage ?? "";
  const stagedPath = stagedMutationPathFromMessage(lastEvent);
  const isMutatingEvidence = stagedPath ||
    /mutat/i.test(task.launchCard?.toolMutationScope ?? "") ||
    booleanValue(approval?.required) === true ||
    booleanValue(worktree?.required) === true;
  if (!isMutatingEvidence) return [];
  return uniqueStrings([
    "Mutating child worker",
    booleanValue(approval?.required) === true && stringValue(approval?.source) === "child_bridge_policy"
      ? "Approval: child bridge policy"
      : undefined,
    booleanValue(worktree?.isolated) === true && stringValue(worktree?.status) === "active"
      ? "Isolated worktree active"
      : undefined,
    booleanValue(nestedFanout?.required) === true && stringValue(nestedFanout?.source) === "child_bridge_policy"
      ? "Nested fanout granted"
      : undefined,
    stagedPath ? `Staged mutation: ${stagedPath}` : undefined,
    /parent workspace unchanged/i.test(lastEvent) ? "Parent workspace unchanged" : undefined,
    /preview retained|bounded preview/i.test(lastEvent) ? "Output preview retained" : undefined,
  ].filter((label): label is string => Boolean(label)));
}

function stagedMutationPathFromMessage(message: string): string | undefined {
  const match = message.match(/\bStaged mutation:\s*([^;\n]+)/i);
  return match?.[1]?.trim() || undefined;
}

function workflowTaskParentBlockers(
  events: SubagentParentMailboxEventSummary[],
): Map<string, SubagentParentClusterWorkflowTaskBlockerModel> {
  const blockers = new Map<string, SubagentParentClusterWorkflowTaskBlockerModel>();
  for (const event of events) {
    if (event.type !== "callable_workflow.parent_finalization_blocked") continue;
    const payload = recordValue(event.payload);
    if (payload?.schemaVersion !== "ambient-callable-workflow-parent-blocking-v1") continue;
    const waitingTaskIds = new Set(stringArrayValue(payload.waitingTaskIds));
    const attentionTaskIds = new Set(stringArrayValue(payload.attentionTaskIds));
    const taskRecords = arrayValue(payload.tasks)
      .map(recordValue)
      .filter((task): task is Record<string, unknown> => Boolean(task));
    const taskRecordsById = new Map(
      taskRecords
        .map((task) => [stringValue(task.id), task] as const)
        .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0])),
    );
    const taskIds = uniqueStrings([
      ...stringArrayValue(payload.taskIds),
      ...waitingTaskIds,
      ...attentionTaskIds,
      ...taskRecords.map((task) => stringValue(task.id) ?? ""),
    ]);
    for (const taskId of taskIds) {
      if (blockers.has(taskId)) continue;
      const task = taskRecordsById.get(taskId);
      const kind = workflowTaskParentBlockerKind(taskId, task, waitingTaskIds, attentionTaskIds);
      if (!kind) continue;
      blockers.set(taskId, workflowTaskParentBlockerModel(payload, task, kind));
    }
  }
  return blockers;
}

function workflowTaskParentBlockerKind(
  taskId: string,
  task: Record<string, unknown> | undefined,
  waitingTaskIds: Set<string>,
  attentionTaskIds: Set<string>,
): SubagentParentClusterWorkflowTaskBlockerModel["kind"] | undefined {
  if (attentionTaskIds.has(taskId)) return "attention";
  if (waitingTaskIds.has(taskId)) return "waiting";
  const statusGroup = stringValue(task?.statusGroup);
  if (statusGroup === "needs_attention") return "attention";
  if (statusGroup === "waiting_on_workflow") return "waiting";
  const status = stringValue(task?.status);
  if (status === "paused" || status === "failed" || status === "canceled") return "attention";
  if (status === "queued" || status === "compiling" || status === "running") return "waiting";
  return undefined;
}

function workflowTaskParentBlockerModel(
  payload: Record<string, unknown>,
  task: Record<string, unknown> | undefined,
  kind: SubagentParentClusterWorkflowTaskBlockerModel["kind"],
): SubagentParentClusterWorkflowTaskBlockerModel {
  const status = stringValue(task?.status);
  const statusLabel = stringValue(task?.statusLabel) ?? (status ? statusLabelFromString(status) : undefined);
  const title = stringValue(task?.title) ?? stringValue(task?.toolName) ?? stringValue(task?.id);
  const message = stringValue(payload.message);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  const detail = truncate([
    title,
    statusLabel,
    callableWorkflowTaskLifecycleLabel(stringValue(task?.runnerDeferredReason), status),
    stringValue(task?.workflowRunId) ? `run ${stringValue(task?.workflowRunId)}` : undefined,
    stringValue(task?.workflowArtifactId) ? `artifact ${stringValue(task?.workflowArtifactId)}` : undefined,
    stringValue(task?.errorMessage) ? `Error: ${stringValue(task?.errorMessage)}` : undefined,
    message,
    choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
  ].filter(Boolean).join(" / "), 260);
  if (kind === "attention") {
    return {
      kind,
      label: "Blocking: workflow attention",
      statusTone: workflowTaskParentBlockerAttentionTone(status),
      detail,
    };
  }
  return {
    kind,
    label: "Blocking: workflow work",
    statusTone: "active",
    detail,
  };
}

function workflowTaskParentBlockerAttentionTone(status: string | undefined): SubagentParentClusterTone {
  return status === "failed" || status === "canceled" ? "danger" : "warning";
}

function callableWorkflowTaskCanCancel(status: CallableWorkflowTaskSummary["status"]): boolean {
  return status === "queued" || status === "compiling" || status === "running" || status === "paused";
}

function callableWorkflowTaskCanPause(task: CallableWorkflowTaskSummary): boolean {
  if (task.status !== "running" || !task.workflowRunId) return false;
  const runStatus = task.progressSnapshot?.workflowRunStatus;
  return !runStatus || runStatus === "running";
}

function callableWorkflowTaskCanResume(task: CallableWorkflowTaskSummary): boolean {
  if (task.status !== "paused" || !task.workflowArtifactId || !task.workflowRunId) return false;
  const runStatus = task.progressSnapshot?.workflowRunStatus;
  if (runStatus) return runStatus === "paused";
  return task.runnerDeferredReason === "workflow_run_paused";
}

function callableWorkflowTaskTone(status: CallableWorkflowTaskSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "queued":
    case "compiling":
    case "running":
      return "active";
    case "succeeded":
      return "success";
    case "paused":
      return "warning";
    case "failed":
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
}

function callableWorkflowTaskProgressLabel(task: CallableWorkflowTaskSummary): string {
  if (task.status === "queued") return "Queued";
  if (task.status === "compiling") return "Compiling artifact";
  if (task.status === "running") {
    if (task.progressSnapshot?.lastEventMessage) return truncate(task.progressSnapshot.lastEventMessage, 64);
    if (task.progressSnapshot?.activeStepCount) return `${task.progressSnapshot.activeStepCount} active / ${task.progressSnapshot.completedStepCount} done`;
    if (task.progressSnapshot?.completedStepCount) return `${task.progressSnapshot.completedStepCount} steps done`;
    return task.workflowRunId ? `Run ${task.workflowRunId}` : "Workflow run active";
  }
  if (task.status === "paused") return callableWorkflowPausedProgressLabel(task);
  if (task.status === "succeeded") return "Complete";
  if (task.status === "failed") return "Failed";
  if (task.status === "canceled") return "Canceled";
  return statusLabelFromString(task.status);
}

function callableWorkflowPausedProgressLabel(task: CallableWorkflowTaskSummary): string {
  if (
    task.runnerDeferredReason === "workflow_run_needs_input" ||
    task.progressSnapshot?.workflowRunStatus === "needs_input" ||
    /^needs input$/i.test(task.statusLabel)
  ) {
    return "Needs input";
  }
  return task.statusLabel || "Paused";
}

function callableWorkflowTaskSourceLabel(task: CallableWorkflowTaskSummary): string {
  if (task.sourceKind === "symphony_recipe") return "Symphony recipe";
  if (task.sourceKind === "recorded_workflow") return "Recorded workflow";
  if (task.sourceKind === "workflow_recipe") return "Workflow recipe";
  return task.sourceKind.split(/[._-]+/g).map(titleCase).join(" ") || "Callable workflow";
}

function callableWorkflowTaskCapabilityLabels(task: CallableWorkflowTaskSummary): string[] {
  return [
    task.progressVisible ? "Progress visible" : undefined,
    task.tokenCostTracking ? "Token/cost" : undefined,
    task.pauseResumeCancel ? "Pause/resume/cancel" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskTelemetryLabels(task: CallableWorkflowTaskSummary): string[] {
  const progress = task.progressSnapshot;
  const usage = task.usageSnapshot;
  return [
    progress && progress.eventCount > 0 ? `${progress.eventCount.toLocaleString()} ${plural(progress.eventCount, "event", "events")}` : undefined,
    progress && progress.completedStepCount > 0 ? `${progress.completedStepCount.toLocaleString()} ${plural(progress.completedStepCount, "step", "steps")} done` : undefined,
    usage && usage.modelCallCount > 0 ? `${usage.modelCallCount.toLocaleString()} ${plural(usage.modelCallCount, "model call", "model calls")}` : undefined,
    usage?.tokenCount !== undefined ? `${usage.tokenCountEstimated ? "~" : ""}${usage.tokenCount.toLocaleString()} tokens` : undefined,
    usage?.costMicros !== undefined ? formatCostMicros(usage.costMicros, usage.costEstimated) : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskLaunchCardLabels(task: CallableWorkflowTaskSummary): string[] {
  const launchCard = task.launchCard;
  if (!launchCard) return [];
  return [
    `Risk: ${titleCase(launchCard.riskLevel)}`,
    `Up to ${launchCard.estimatedAgents.toLocaleString()} ${plural(launchCard.estimatedAgents, "agent", "agents")}`,
    `Budget: ${launchCard.estimatedTokenBudget.toLocaleString()} tokens`,
    launchCard.requireConfirmation ? "Confirmation required" : undefined,
    launchCard.smallSliceRecommended ? "Small slice recommended" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function callableWorkflowTaskProvenanceLabels(task: CallableWorkflowTaskSummary): string[] {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (!provenance) return [];
  const approval = recordValue(provenance.approval);
  const worktree = recordValue(provenance.worktree);
  const nestedFanout = recordValue(provenance.nestedFanout);
  const approvalSource = stringValue(approval?.source);
  const nestedFanoutSource = stringValue(nestedFanout?.source);
  return uniqueStrings([
    callableWorkflowCallerKindLabel(stringValue(provenance.kind)),
    stringValue(provenance.subagentRunId) ? `Child run: ${stringValue(provenance.subagentRunId)}` : undefined,
    approvalSource ? `Approval: ${callableWorkflowProvenanceSourceLabel(approvalSource)}` : undefined,
    callableWorkflowWorktreeLabel(worktree),
    booleanValue(nestedFanout?.required) === true && nestedFanoutSource
      ? `Nested fanout: ${callableWorkflowProvenanceSourceLabel(nestedFanoutSource)}`
      : undefined,
  ].filter((label): label is string => Boolean(label)));
}

function callableWorkflowTaskDetail(task: CallableWorkflowTaskSummary): string | undefined {
  const launchCard = task.launchCard;
  const provenanceDetail = callableWorkflowTaskProvenanceDetail(task);
  return truncate([
    launchCard ? `Launch: ${launchCard.riskLevel} risk, up to ${launchCard.estimatedAgents} agents` : undefined,
    launchCard ? `Local memory: ${formatBytes(launchCard.estimatedLocalMemoryBytes)}` : undefined,
    task.runnerTarget ? `Runner: ${task.runnerTarget}` : undefined,
    task.runnerDeferredReason ? `State: ${callableWorkflowTaskLifecycleLabel(task.runnerDeferredReason, task.status)}` : undefined,
    task.workflowThreadId ? `Thread: ${task.workflowThreadId}` : undefined,
    task.workflowArtifactId ? `Artifact: ${task.workflowArtifactId}` : undefined,
    task.workflowRunId ? `Run: ${task.workflowRunId}` : undefined,
    provenanceDetail ? `Provenance: ${provenanceDetail}` : undefined,
    task.errorMessage ? `Error: ${task.errorMessage}` : undefined,
  ].filter(Boolean).join(" / "), 260) || undefined;
}

function callableWorkflowTaskProvenanceDetail(task: CallableWorkflowTaskSummary): string | undefined {
  const provenance = callableWorkflowTaskCallerProvenance(task);
  if (!provenance) return undefined;
  const approval = recordValue(provenance.approval);
  const worktree = recordValue(provenance.worktree);
  const nestedFanout = recordValue(provenance.nestedFanout);
  const runId = stringValue(provenance.runId);
  const subagentRunId = stringValue(provenance.subagentRunId);
  const parts = [
    callableWorkflowCallerKindDetail(stringValue(provenance.kind)),
    stringValue(provenance.threadId) ? `thread ${stringValue(provenance.threadId)}` : undefined,
    runId ? `run ${runId}` : undefined,
    subagentRunId && subagentRunId !== runId ? `sub-agent ${subagentRunId}` : undefined,
    stringValue(provenance.canonicalTaskPath) ? `path ${stringValue(provenance.canonicalTaskPath)}` : undefined,
    callableWorkflowApprovalDetail(approval),
    callableWorkflowWorktreeDetail(worktree),
    callableWorkflowNestedFanoutDetail(nestedFanout),
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function callableWorkflowTaskCallerProvenance(task: CallableWorkflowTaskSummary): Record<string, unknown> | undefined {
  const executionPlan = recordValue(task.executionPlan);
  return recordValue(executionPlan?.callerProvenance);
}

function callableWorkflowCallerKindLabel(kind: string | undefined): string | undefined {
  if (kind === "subagent_child_thread") return "Caller: sub-agent child";
  if (kind === "parent_thread") return "Caller: parent thread";
  return kind ? `Caller: ${statusLabelFromString(kind)}` : undefined;
}

function callableWorkflowCallerKindDetail(kind: string | undefined): string | undefined {
  if (kind === "subagent_child_thread") return "sub-agent child";
  if (kind === "parent_thread") return "parent thread";
  return kind ? statusLabelFromString(kind).toLowerCase() : undefined;
}

function callableWorkflowApprovalDetail(approval: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(approval?.source);
  const scopeHint = stringValue(approval?.scopeHint);
  const required = booleanValue(approval?.required);
  const parts = [
    source ? `approval ${callableWorkflowProvenanceSourceLabel(source).toLowerCase()}` : undefined,
    required === true ? "required" : required === false ? "not required" : undefined,
    scopeHint ? `scope ${callableWorkflowProvenanceSourceLabel(scopeHint).toLowerCase()}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function callableWorkflowWorktreeLabel(worktree: Record<string, unknown> | undefined): string | undefined {
  const isolated = booleanValue(worktree?.isolated);
  const required = booleanValue(worktree?.required);
  if (isolated === true) return "Worktree: isolated";
  if (required === true) return "Worktree: not isolated";
  return undefined;
}

function callableWorkflowWorktreeDetail(worktree: Record<string, unknown> | undefined): string | undefined {
  const isolated = booleanValue(worktree?.isolated);
  const required = booleanValue(worktree?.required);
  const status = stringValue(worktree?.status);
  const branchName = stringValue(worktree?.branchName);
  const parts = [
    isolated === true ? "worktree isolated" : required === true ? "worktree not isolated" : undefined,
    status ? statusLabelFromString(status).toLowerCase() : undefined,
    branchName ? `branch ${branchName}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function callableWorkflowNestedFanoutDetail(nestedFanout: Record<string, unknown> | undefined): string | undefined {
  const required = booleanValue(nestedFanout?.required);
  const source = stringValue(nestedFanout?.source);
  if (required !== true && !source) return undefined;
  return [
    required === true ? "nested fanout required" : "nested fanout not required",
    source ? `via ${callableWorkflowProvenanceSourceLabel(source).toLowerCase()}` : undefined,
  ].filter(Boolean).join(" ");
}

function callableWorkflowProvenanceSourceLabel(source: string): string {
  return source.split(/[._-]+/g).filter(Boolean).map(titleCase).join(" ");
}

function callableWorkflowTaskLifecycleLabel(
  runnerDeferredReason: string | undefined,
  status?: string,
): string | undefined {
  switch (runnerDeferredReason) {
    case "callable_workflow_runner_not_connected":
      return "Waiting for workflow runner";
    case "workflow_artifact_not_compiled":
      return "Compiling workflow artifact";
    case "workflow_run_not_started":
      return "Workflow artifact ready";
    case "workflow_run_started":
      return "Workflow run started";
    case "workflow_run_paused":
      return "Workflow run paused";
    case "workflow_run_needs_input":
      return "Workflow run needs input";
    case "workflow_run_succeeded":
      return "Workflow run succeeded";
    case "workflow_run_failed":
      return "Workflow run failed";
    case "workflow_run_canceled":
      return "Workflow run canceled";
    case "workflow_run_skipped":
      return "Workflow run skipped";
    case "callable_workflow_task_canceled":
      return "Workflow task canceled";
    case "failed":
      return "Workflow task failed";
    default:
      return runnerDeferredReason
        ? runnerDeferredReason.split(/[._-]+/g).filter(Boolean).map(titleCase).join(" ")
        : status ? statusLabelFromString(status) : undefined;
  }
}

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel;
}

function formatCostMicros(costMicros: number, estimated: boolean): string {
  const dollars = costMicros / 1_000_000;
  const formatted = dollars >= 0.01
    ? dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : `$${dollars.toFixed(6)}`;
  return `${estimated ? "~" : ""}${formatted}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 bytes";
  const gib = value / (1024 * 1024 * 1024);
  if (gib >= 1) return `${formatDecimal(gib)} GiB`;
  const mib = value / (1024 * 1024);
  if (mib >= 1) return `${formatDecimal(mib)} MiB`;
  return `${Math.floor(value).toLocaleString()} bytes`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function mailboxActivityModel(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel {
  const batch = batchProgressActivity(event);
  if (batch) return batch;
  const grouped = groupedCompletionActivity(event);
  if (grouped) return grouped;
  const spawnFailure = spawnFailureActivity(event);
  if (spawnFailure) return spawnFailure;
  const approvalRequest = childApprovalRequestActivity(event);
  if (approvalRequest) return approvalRequest;
  const approvalForwarded = childApprovalForwardedActivity(event);
  if (approvalForwarded) return approvalForwarded;
  const supervisorRequest = supervisorRequestActivity(event);
  if (supervisorRequest) return supervisorRequest;
  const waitBarrierAttention = waitBarrierAttentionActivity(event);
  if (waitBarrierAttention) return waitBarrierAttention;
  const waitBarrierDecision = waitBarrierDecisionActivity(event);
  if (waitBarrierDecision) return waitBarrierDecision;
  const callableWorkflowBlock = callableWorkflowParentBlockingActivity(event);
  if (callableWorkflowBlock) return callableWorkflowBlock;
  const lifecycleInterruption = lifecycleInterruptionActivity(event);
  if (lifecycleInterruption) return lifecycleInterruption;
  const cancellationCascade = cancellationCascadeActivity(event);
  if (cancellationCascade) return cancellationCascade;
  return {
    id: event.id,
    label: mailboxTypeLabel(event.type),
    ...(childSourceLabel(recordValue(event.payload)) ? { sourceLabel: childSourceLabel(recordValue(event.payload)) } : {}),
    statusTone: event.deliveryState === "failed" ? "danger" : "neutral",
    summary: event.deliveryState.split("_").map(titleCase).join(" "),
    updatedAt: event.updatedAt,
  };
}

function callableWorkflowParentBlockingActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "callable_workflow.parent_finalization_blocked") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-callable-workflow-parent-blocking-v1") return undefined;
  const taskIds = stringArrayValue(payload.taskIds);
  const waitingTaskIds = stringArrayValue(payload.waitingTaskIds);
  const attentionTaskIds = stringArrayValue(payload.attentionTaskIds);
  const tasks = arrayValue(payload.tasks).map(recordValue).filter((task): task is Record<string, unknown> => Boolean(task));
  const taskCount = taskIds.length || tasks.length;
  const message = stringValue(payload.message);
  const choices = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  return {
    id: event.id,
    label: "Workflow blocked",
    ...(workflowSourceLabel(payload) ? { sourceLabel: workflowSourceLabel(payload) } : {}),
    statusTone: callableWorkflowParentBlockingTone(tasks, attentionTaskIds),
    summary: truncate([
      `${taskCount} blocking ${taskCount === 1 ? "workflow" : "workflows"}`,
      waitingTaskIds.length ? `${waitingTaskIds.length} waiting` : undefined,
      attentionTaskIds.length ? `${attentionTaskIds.length} attention` : undefined,
      workflowTaskPreview(tasks),
    ].filter(Boolean).join(" / "), 180),
    detail: truncate([
      message,
      choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
    ].filter(Boolean).join(" | "), 260),
    updatedAt: event.updatedAt,
  };
}

function callableWorkflowParentBlockingTone(
  tasks: Record<string, unknown>[],
  attentionTaskIds: string[],
): SubagentParentClusterTone {
  const statuses = tasks.map((task) => stringValue(task.status)).filter((status): status is string => Boolean(status));
  if (statuses.some((status) => status === "failed" || status === "canceled")) return "danger";
  if (attentionTaskIds.length > 0 || statuses.some((status) => status === "paused")) return "warning";
  return "active";
}

function workflowTaskPreview(tasks: Record<string, unknown>[]): string | undefined {
  const previews = tasks.slice(0, 2)
    .map((task) => {
      const title = stringValue(task.title) ?? stringValue(task.toolName) ?? stringValue(task.id);
      if (!title) return undefined;
      const statusValue = stringValue(task.status);
      const status = stringValue(task.statusLabel) ?? (statusValue ? statusLabelFromString(statusValue) : undefined);
      return status ? `${title} (${status})` : title;
    })
    .filter((preview): preview is string => Boolean(preview));
  if (!previews.length) return undefined;
  return `${previews.join(", ")}${tasks.length > previews.length ? ` +${tasks.length - previews.length}` : ""}`;
}

function workflowSourceLabel(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const taskIds = stringArrayValue(payload.taskIds);
  const workflowRunIds = stringArrayValue(payload.workflowRunIds);
  const workflowArtifactIds = stringArrayValue(payload.workflowArtifactIds);
  const pieces = [
    compactIdListLabel("task", taskIds),
    compactIdListLabel("run", workflowRunIds),
    compactIdListLabel("artifact", workflowArtifactIds),
  ].filter(Boolean);
  return pieces.length ? `Workflow source: ${pieces.join(" / ")}` : undefined;
}

function compactIdListLabel(label: string, ids: string[]): string | undefined {
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return `${label} ${ids[0]}`;
  return `${label}s ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` +${ids.length - 3}` : ""}`;
}

function lifecycleInterruptionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.lifecycle_interrupted") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-lifecycle-interruption-v1") return undefined;
  const status = stringValue(payload.status);
  const roleId = stringValue(payload.roleId);
  const path = stringValue(payload.canonicalTaskPath);
  const reason = stringValue(payload.reason);
  const source = lifecycleSourceLabel(stringValue(payload.source));
  const controlSummary = lifecycleEffectSummary(payload);
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Child interrupted",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: lifecycleStatusTone(status),
    summary: truncate([
      status ? statusLabelFromString(status) : "Interrupted",
      roleId ? titleCase(roleId) : undefined,
      path,
    ].filter(Boolean).join(" / "), 160),
    detail: truncate([source, reason, controlSummary].filter(Boolean).join(" · "), 240),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function cancellationCascadeActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.cancellation_cascade") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-cancellation-cascade-v1") return undefined;
  const cancelledRunIds = stringArrayValue(payload.cancelledRunIds);
  const detachedRunIds = stringArrayValue(payload.detachedRunIds);
  const stoppedChildRunIds = stringArrayValue(payload.stoppedChildRunIds);
  const unchangedRunIds = stringArrayValue(payload.unchangedRunIds);
  const cancelledWaitBarrierIds = stringArrayValue(payload.cancelledWaitBarrierIds);
  const cancelledMailboxEventIds = stringArrayValue(payload.cancelledMailboxEventIds);
  const reason = stringValue(payload.reason);
  const detail = [
    reason,
    cancelledMailboxEventCountSummary(cancelledMailboxEventIds.length),
  ].filter(Boolean).join(" · ");
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Parent stopped",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: cancelledRunIds.length || cancelledWaitBarrierIds.length ? "danger" : "warning",
    summary: [
      `${cancelledRunIds.length} cancelled`,
      `${detachedRunIds.length} detached`,
      stoppedChildRunIds.length ? `${stoppedChildRunIds.length} stopped` : undefined,
      unchangedRunIds.length ? `${unchangedRunIds.length} unchanged` : undefined,
      cancelledWaitBarrierCountSummary(cancelledWaitBarrierIds.length),
    ].filter(Boolean).join(" · "),
    ...(detail ? { detail: truncate(detail, 240) } : {}),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function childApprovalRequestActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_approval_requested") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-approval-bridge-v1") return undefined;
  const title = stringValue(payload.title);
  const prompt = stringValue(payload.prompt);
  const toolCategory = stringValue(payload.requestedToolCategory);
  const requestedAction = stringValue(payload.requestedAction);
  const effectiveScope = stringValue(payload.effectiveScope);
  const approvalActions = childApprovalRequestActions(event, payload);
  return {
    id: event.id,
    label: "Approval requested",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: event.deliveryState === "queued" ? "active" : "neutral",
    summary: truncate([
      title ?? "Child approval needed",
      toolCategory ?? requestedAction,
      effectiveScope ? approvalScopeLabel(effectiveScope) : undefined,
    ].filter(Boolean).join(" / "), 160),
    ...(prompt ? { detail: truncate(prompt, 240) } : {}),
    ...(approvalActions.length ? { approvalActions } : {}),
    updatedAt: event.updatedAt,
  };
}

function childApprovalRequestActions(
  event: SubagentParentMailboxEventSummary,
  payload: Record<string, unknown>,
): SubagentParentClusterApprovalActionModel[] {
  if (event.deliveryState !== "queued") return [];
  const childRunId = stringValue(payload.childRunId);
  const approvalId = stringValue(payload.approvalId);
  if (!childRunId || !approvalId) return [];
  const title = stringValue(payload.title);
  const prompt = stringValue(payload.prompt);
  const requestedScope = stringValue(payload.requestedScope);
  const effectiveScope = stringValue(payload.effectiveScope);
  const toolLabel = stringValue(payload.requestedToolCategory) ??
    stringValue(payload.requestedAction) ??
    stringValue(payload.requestedToolId);
  const childThreadId = stringValue(payload.childThreadId);
  const sourceLabel = childSourceLabel(payload);
  const base = {
    childRunId,
    approvalId,
    approvalRequestParentMailboxEventId: event.id,
    ...(childThreadId ? { childThreadId } : {}),
    ...(requestedScope ? { requestedScope } : {}),
    ...(effectiveScope ? { effectiveScope } : {}),
    ...(prompt ? { prompt } : {}),
    ...(toolLabel ? { toolLabel } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
  };
  return [
    {
      ...base,
      label: "Approve child",
      title: approvalActionTitle("Approve", title, approvalId, sourceLabel),
      decision: "approved",
    },
    {
      ...base,
      label: "Deny child",
      title: approvalActionTitle("Deny", title, approvalId, sourceLabel),
      decision: "denied",
    },
  ];
}

function approvalActionTitle(
  verb: string,
  title: string | undefined,
  approvalId: string,
  sourceLabel: string | undefined,
): string {
  return [
    `${verb} child approval ${approvalId}${title ? `: ${title}` : ""}`,
    sourceLabel,
  ].filter(Boolean).join(" / ");
}

function childApprovalForwardedActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_approval_forwarded") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-approval-bridge-v1") return undefined;
  const decision = stringValue(payload.decision);
  const effectiveScope = stringValue(payload.effectiveScope);
  const userDecision = stringValue(payload.userDecisionPreview);
  const approvalId = stringValue(payload.approvalId);
  const scope = recordValue(payload.scope);
  const scopeReason = stringValue(scope?.reason);
  const parentBlockingState = recordValue(payload.parentBlockingState);
  const parentResumeLabel = payload.resumeParentBlocking === true || parentBlockingState?.resumeParentBlocking === true
    ? "Parent returned to waiting on this child."
    : undefined;
  const childAlwaysDefaultedLabel = payload.childAlwaysDefaulted === true
    ? "Always defaulted to this child thread."
    : undefined;
  const detail = truncate([
    userDecision,
    childAlwaysDefaultedLabel ?? scopeReason,
    parentResumeLabel,
  ].filter(Boolean).join(" | "), 260);
  return {
    id: event.id,
    label: "Approval forwarded",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: decision === "denied" ? "danger" : decision === "approved" ? "success" : "neutral",
    summary: truncate([
      decision ? approvalDecisionLabel(decision) : "Decision sent",
      effectiveScope ? approvalScopeLabel(effectiveScope) : undefined,
      approvalId,
    ].filter(Boolean).join(" / "), 160),
    ...(detail ? { detail } : {}),
    updatedAt: event.updatedAt,
  };
}

function supervisorRequestActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.child_supervisor_request") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-supervisor-request-v1") return undefined;
  const kind = stringValue(payload.kind);
  const title = stringValue(payload.title);
  const message = stringValue(payload.messagePreview);
  const progressLabel = stringValue(payload.progressLabel);
  const blockedReason = stringValue(payload.blockedReason);
  const choices = arrayValue(payload.requestedChoices)
    .map(recordValue)
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  return {
    id: event.id,
    label: kind === "progress_update" ? "Child progress" : "Supervisor request",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: supervisorRequestTone(event, payload),
    summary: truncate([
      title ?? supervisorRequestKindLabel(kind),
      progressLabel,
      choices.length ? `${choices.length} ${choices.length === 1 ? "choice" : "choices"}` : undefined,
    ].filter(Boolean).join(" / "), 160),
    detail: truncate([
      blockedReason,
      message,
      choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
    ].filter(Boolean).join(" | "), 260),
    ...(choices.length ? { actionLabels: choices.slice(0, 4) } : {}),
    updatedAt: event.updatedAt,
  };
}

function supervisorRequestTone(
  event: SubagentParentMailboxEventSummary,
  payload: Record<string, unknown>,
): SubagentParentClusterTone {
  if (event.deliveryState === "failed") return "danger";
  const severity = stringValue(payload.severity);
  if (severity === "danger") return "danger";
  if (payload.parentRequiresAttention === true && event.deliveryState === "queued") return "warning";
  if (stringValue(payload.kind) === "progress_update") return event.deliveryState === "queued" ? "active" : "neutral";
  return "neutral";
}

function supervisorRequestKindLabel(kind: string | undefined): string {
  if (kind === "need_decision") return "Needs decision";
  if (kind === "blocked") return "Child blocked";
  if (kind === "progress_update") return "Progress update";
  return "Supervisor request";
}

function approvalDecisionLabel(decision: string): string {
  if (decision === "approved") return "Approved";
  if (decision === "denied") return "Denied";
  return decision.split(/[._-]+/g).map(titleCase).join(" ");
}

function approvalScopeLabel(scope: string): string {
  if (scope === "this_action") return "This action";
  if (scope === "this_child_thread") return "This child thread";
  if (scope === "parent_thread_tree") return "Parent thread tree";
  if (scope === "project") return "Project";
  if (scope === "global") return "Global";
  return scope.split(/[._-]+/g).map(titleCase).join(" ");
}

function spawnFailureActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.spawn_failed") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-spawn-failure-v1") return undefined;
  const modelScope = recordValue(payload.modelScope);
  const stage = stringValue(payload.failureStage);
  const requestedRole = stringValue(payload.requestedRoleId) ?? stringValue(payload.roleId);
  const model = modelScopeSummary(modelScope);
  const reason = stringValue(payload.reason);
  const modelDetail = modelScopeFailureDetail(modelScope);
  const toolScopeDetail = toolScopeFailureDetail(recordValue(payload.toolScopeSnapshot), payload.approvalUnavailable === true);
  const detailParts = stage === "tool_scope" ? [toolScopeDetail, reason, modelDetail] : [reason, modelDetail, toolScopeDetail];
  return {
    id: event.id,
    label: "Spawn failed",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: "danger",
    summary: truncate([
      stage ? failureStageLabel(stage, payload) : "Launch blocked",
      requestedRole ? titleCase(requestedRole) : undefined,
      model,
    ].filter(Boolean).join(" / "), 160),
    detail: truncate(detailParts.filter(Boolean).join(" | "), 240),
    updatedAt: event.updatedAt,
  };
}

function modelScopeSummary(modelScope: Record<string, unknown> | undefined): string | undefined {
  if (!modelScope) return undefined;
  const profile = recordValue(modelScope.profile);
  const label = stringValue(profile?.label);
  const selectedModelId = stringValue(modelScope.selectedModelId) ?? stringValue(profile?.modelId);
  if (!label && !selectedModelId) return undefined;
  return label && selectedModelId && label !== selectedModelId ? `${label} (${selectedModelId})` : label ?? selectedModelId;
}

function modelScopeFailureDetail(modelScope: Record<string, unknown> | undefined): string | undefined {
  if (!modelScope) return undefined;
  const blockers = stringArrayValue(modelScope.blockingReasons);
  if (blockers.length > 0) return `Model blockers: ${blockers.join("; ")}`;
  const candidateReason = arrayValue(modelScope.candidateDiagnostics)
    .map(recordValue)
    .find((candidate) => candidate?.selected === true && candidate.eligible !== true);
  if (!candidateReason) return undefined;
  const reasons = stringArrayValue(candidateReason.blockingReasons);
  if (reasons.length > 0) return `Selected candidate blocked: ${reasons.join("; ")}`;
  return undefined;
}

function failureStageLabel(stage: string, payload?: Record<string, unknown>): string {
  if (stage === "model_scope") return "Model scope blocked";
  if (stage === "runtime_launch_preflight") return "Runtime preflight blocked";
  if (stage === "capacity") return "Capacity blocked";
  if (stage === "tool_scope") return payload?.approvalUnavailable === true ? "Approval unavailable" : "Tool scope blocked";
  return stage.split(/[._-]+/g).map(titleCase).join(" ");
}

function toolScopeFailureDetail(
  toolScopeSnapshot: Record<string, unknown> | undefined,
  approvalUnavailable: boolean,
): string | undefined {
  const deniedCategories = arrayValue(toolScopeSnapshot?.deniedCategories)
    .map(recordValue)
    .map(deniedCategoryFailureLabel)
    .filter((item): item is string => Boolean(item));
  const deniedTools = arrayValue(toolScopeSnapshot?.deniedTools)
    .map(recordValue)
    .map(deniedToolFailureLabel)
    .filter((item): item is string => Boolean(item));
  const denyReasons = uniqueStrings([
    ...arrayValue(toolScopeSnapshot?.deniedCategories).map(recordValue).map(deniedCategoryReasonLabel),
    ...arrayValue(toolScopeSnapshot?.deniedTools).map(recordValue).map(deniedToolReasonLabel),
  ].filter((item): item is string => Boolean(item)));
  const detail = [
    approvalUnavailable ? "Approval unavailable: non-interactive launch cannot surface required approval" : undefined,
    deniedCategories.length ? `Denied categories: ${deniedCategories.slice(0, 3).join("; ")}` : undefined,
    deniedTools.length ? `Denied tools: ${deniedTools.slice(0, 3).join("; ")}` : undefined,
    denyReasons.length ? `Deny reasons: ${denyReasons.slice(0, 3).join("; ")}` : undefined,
  ].filter(Boolean).join(" | ");
  return detail || undefined;
}

function deniedCategoryFailureLabel(category: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(category?.id);
  if (!id) return undefined;
  const label = toolScopeCategoryLabel(id);
  return `${label} (${id})`;
}

function deniedToolFailureLabel(tool: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(tool?.source);
  const id = stringValue(tool?.id);
  if (!source || !id) return undefined;
  const categoryId = stringValue(tool?.categoryId);
  const category = categoryId ? ` / ${toolScopeCategoryLabel(categoryId)} (${categoryId})` : "";
  return `${toolScopeSourceLabel(source)} ${id}${category}`;
}

function deniedCategoryReasonLabel(category: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(category?.id);
  const reason = stringValue(category?.reason);
  if (!id || !reason) return undefined;
  return `${toolScopeCategoryLabel(id)} (${id}): ${reason}`;
}

function deniedToolReasonLabel(tool: Record<string, unknown> | undefined): string | undefined {
  const source = stringValue(tool?.source);
  const id = stringValue(tool?.id);
  const reason = stringValue(tool?.reason);
  if (!source || !id || !reason) return undefined;
  return `${toolScopeSourceLabel(source)} ${id}: ${reason}`;
}

function toolScopeSourceLabel(source: string): string {
  return source.split("_").map(titleCase).join(" ");
}

function toolScopeCategoryLabel(category: string): string {
  return category.split(".").map(titleCase).join(" ");
}

function waitBarrierAttentionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.wait_barrier_attention") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-wait-barrier-attention-v1") return undefined;
  const parentResolution = recordValue(payload.parentResolution);
  const action = stringValue(parentResolution?.action);
  const barrierStatus = stringValue(payload.barrierStatus);
  const dependencyMode = stringValue(payload.dependencyMode);
  const reason = stringValue(payload.reason);
  const choiceRecords = arrayValue(payload.allowedUserChoices)
    .map(recordValue)
    .filter((choice): choice is Record<string, unknown> => Boolean(choice));
  const choices = choiceRecords
    .map((choice) => stringValue(choice?.label))
    .filter((label): label is string => Boolean(label));
  const symphonyOptions = symphonyDecisionOptionLabels(payload);
  const actionLabels = uniqueStrings([...choices, ...symphonyOptions]);
  const actions = choiceRecords
    .map((choice) => waitBarrierChoiceAction(payload, choice))
    .filter((action): action is SubagentParentClusterMailboxActionModel => Boolean(action));
  return {
    id: event.id,
    label: "Barrier attention",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: waitBarrierAttentionTone(action, barrierStatus),
    summary: truncate([
      action ? waitBarrierActionLabel(action) : "Needs decision",
      barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
      dependencyMode ? barrierDependencyLabelFromString(dependencyMode) : undefined,
    ].filter(Boolean).join(" / "), 160),
    detail: truncate([
      reason,
      waitBarrierResultValidationDetail(payload),
      choices.length ? `Choices: ${choices.slice(0, 4).join(", ")}` : undefined,
      symphonyOptions.length ? `Symphony options: ${symphonyOptions.slice(0, 5).join(", ")}` : undefined,
    ].filter(Boolean).join(" | "), 240),
    ...(actionLabels.length ? { actionLabels: actionLabels.slice(0, 5) } : {}),
    ...(actions.length ? { actions: actions.slice(0, 4) } : {}),
    updatedAt: event.updatedAt,
  };
}

function symphonyDecisionOptionLabels(payload: Record<string, unknown>): string[] {
  const explicit = arrayValue(payload.symphonyDecisionOptions)
    .map(recordValue)
    .map((option) => {
      const label = stringValue(option?.label);
      if (!label) return undefined;
      return option?.recommended === true ? `${label} (recommended)` : label;
    })
    .filter((label): label is string => Boolean(label));
  if (explicit.length) return uniqueStrings(explicit);
  const request = recordValue(payload.childDecisionRequest);
  const recommendedOption = stringValue(request?.recommendedOption);
  return uniqueStrings(stringArrayValue(request?.options).map((option) => {
    const label = symphonyDecisionOptionLabel(option);
    return option === recommendedOption ? `${label} (recommended)` : label;
  }));
}

function symphonyDecisionOptionLabel(option: string): string {
  switch (option) {
    case "grant_scope":
      return "Grant or re-scope child authority";
    case "retry_child":
      return "Retry child";
    case "retry_with_verifier":
      return "Retry with verifier";
    case "accept_partial":
      return "Accept partial";
    case "cancel_group":
      return "Cancel group";
    case "exit_symphony_mode":
      return "Exit Symphony";
    default:
      return option.split(/[._-]+/g).map(titleCase).join(" ");
  }
}

function waitBarrierResultValidationDetail(payload: Record<string, unknown>): string | undefined {
  const resultValidation = recordValue(payload.resultValidation);
  if (!resultValidation) return undefined;
  const completionGuard = recordValue(resultValidation.completionGuardValidation);
  const detail = completionGuard ? completionGuardDetail(completionGuard) : undefined;
  const reason = stringValue(completionGuard?.reason) ?? stringValue(resultValidation.reason);
  const parts = [
    detail,
    reason,
  ].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  const synthesisAllowed = booleanValue(resultValidation.synthesisAllowed);
  return synthesisAllowed === false ? "Result validation blocked synthesis" : undefined;
}

function waitBarrierCompletionGuardBlocked(payload: Record<string, unknown>): boolean {
  const resultValidation = recordValue(payload.resultValidation);
  const completionGuard = recordValue(resultValidation?.completionGuardValidation);
  return Boolean(completionGuard && (
    booleanValue(completionGuard.valid) === false ||
    booleanValue(completionGuard.synthesisAllowed) === false
  ));
}

function completionGuardDetail(completionGuard: Record<string, unknown>): string | undefined {
  const status = completionGuardStatusLabel(completionGuard);
  const evidence = completionGuardEvidenceLabel(completionGuard);
  return [status, evidence ? `Mutation evidence: ${evidence}` : undefined].filter(Boolean).join(" / ") || undefined;
}

function completionGuardStatusLabel(completionGuard: Record<string, unknown>): string | undefined {
  const required = booleanValue(completionGuard.required);
  const valid = booleanValue(completionGuard.valid);
  const synthesisAllowed = booleanValue(completionGuard.synthesisAllowed);
  if (required === false && valid !== false && synthesisAllowed !== false) return undefined;
  if (valid === true && synthesisAllowed === true) return "Completion guard passed";
  if (valid === false || synthesisAllowed === false) return "Completion guard blocked";
  return "Completion guard recorded";
}

function completionGuardEvidenceLabel(completionGuard: Record<string, unknown>): string | undefined {
  const structured = numberValue(completionGuard.structuredEvidenceCount);
  const ambient = numberValue(completionGuard.ambientEvidenceCount);
  const isolatedWorktree = numberValue(completionGuard.isolatedWorktreeEvidenceCount);
  const approval = numberValue(completionGuard.approvalEvidenceCount);
  const parts = [
    structured !== undefined ? `structured ${structured}` : undefined,
    ambient !== undefined ? `Ambient ${ambient}` : undefined,
    isolatedWorktree !== undefined ? `isolated worktree ${isolatedWorktree}` : undefined,
    approval !== undefined ? `approval ${approval}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : undefined;
}

function waitBarrierChoiceAction(
  payload: Record<string, unknown>,
  choice: Record<string, unknown>,
): SubagentParentClusterMailboxActionModel | undefined {
  if (stringValue(choice.toolAction) !== "resolve_barrier") return undefined;
  const label = stringValue(choice.label);
  const waitBarrierId = stringValue(choice.waitBarrierId) ?? stringValue(payload.waitBarrierId);
  const decision = waitBarrierDecisionValue(choice.decision ?? choice.id);
  if (!label || !waitBarrierId || !decision) return undefined;
  const requiresPartialSummary = choice.requiresPartialSummary === true || decision === "continue_with_partial";
  const requiresUserDecision =
    choice.requiresUserDecision === true ||
    requiresPartialSummary ||
    decision === "detach_child" ||
    decision === "cancel_parent";
  return {
    label,
    title: waitBarrierActionTitle(label, decision, waitBarrierId),
    waitBarrierId,
    decision,
    requiresUserDecision,
    requiresPartialSummary,
    ...(waitBarrierActionChildRunIds(payload).length ? { childRunIds: waitBarrierActionChildRunIds(payload) } : {}),
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
  };
}

function waitBarrierActionChildRunIds(payload: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...(stringValue(payload.childRunId) ? [stringValue(payload.childRunId)!] : []),
    ...stringArrayValue(payload.childRunIds),
  ]);
}

function waitBarrierDecisionValue(value: unknown): SubagentWaitBarrierDecision | undefined {
  const decision = stringValue(value);
  switch (decision) {
    case "continue_with_partial":
    case "fail_parent":
    case "retry_child":
    case "detach_child":
    case "cancel_parent":
      return decision;
    default:
      return undefined;
  }
}

function waitBarrierActionTitle(label: string, decision: SubagentWaitBarrierDecision, waitBarrierId: string): string {
  return `${label}: resolve wait barrier ${waitBarrierId} with ${waitBarrierDecisionLabel(decision)}`;
}

function waitBarrierDecisionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.wait_barrier_decision") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-wait-barrier-decision-v1") return undefined;
  const decision = stringValue(payload.decision);
  const partialSummary = stringValue(payload.partialSummaryPreview);
  const userDecision = stringValue(payload.userDecisionPreview);
  const barrierStatus = stringValue(payload.barrierStatus);
  const controlSummary = lifecycleEffectSummary(payload);
  const detail = [partialSummary, userDecision, controlSummary].filter(Boolean).join(" | ");
  const effectRows = lifecycleEffectRows(payload);
  return {
    id: event.id,
    label: "Barrier decision",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: waitBarrierDecisionTone(decision),
    summary: truncate([
      decision ? waitBarrierDecisionDisplayLabel(decision, payload) : "Decision recorded",
      barrierStatus ? statusLabelFromString(barrierStatus) : undefined,
    ].filter(Boolean).join(" / "), 160),
    ...(detail ? { detail: truncate(detail, 240) } : {}),
    ...(effectRows.length ? { effectRows } : {}),
    updatedAt: event.updatedAt,
  };
}

function waitBarrierAttentionTone(action: string | undefined, barrierStatus: string | undefined): SubagentParentClusterTone {
  if (action === "fail_parent") return "danger";
  if (barrierStatus === "failed") return "danger";
  if (action === "wait_for_child") return "active";
  return "warning";
}

function waitBarrierDecisionTone(decision: string | undefined): SubagentParentClusterTone {
  if (decision === "continue_with_partial") return "warning";
  if (decision === "retry_child") return "active";
  if (decision === "detach_child") return "warning";
  if (decision === "fail_parent" || decision === "cancel_parent") return "danger";
  return "neutral";
}

function waitBarrierActionLabel(action: string): string {
  if (action === "ask_user") return "Ask user";
  if (action === "retry_child") return "Retry needed";
  if (action === "fail_parent") return "Fail parent";
  if (action === "wait_for_child") return "Wait for child";
  if (action === "continue_with_explicit_partial") return "Partial allowed";
  return action.split(/[._-]+/g).map(titleCase).join(" ");
}

function waitBarrierDecisionLabel(decision: string): string {
  if (decision === "continue_with_partial") return "Partial approved";
  if (decision === "retry_child") return "Retry requested";
  if (decision === "detach_child") return "Child detached";
  if (decision === "cancel_parent") return "Parent cancelled";
  if (decision === "fail_parent") return "Fail parent";
  return decision.split(/[._-]+/g).map(titleCase).join(" ");
}

function waitBarrierDecisionDisplayLabel(decision: string, record: Record<string, unknown> | undefined): string {
  if (decision === "retry_child" && stringArrayValue(record?.retryAcceptedRunIds).length > 0) {
    return "Retry accepted";
  }
  return waitBarrierDecisionLabel(decision);
}

function barrierDependencyLabelFromString(mode: string): string {
  if (mode === "required_all") return "Required all";
  if (mode === "required_any") return "Required any";
  if (mode === "optional_background") return "Background";
  if (mode === "quorum") return "Quorum";
  return mode.split(/[._-]+/g).map(titleCase).join(" ");
}

function batchProgressActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.batch_progress") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-batch-progress-mailbox-v1") return undefined;
  const summary = recordValue(payload.summary);
  if (summary?.schemaVersion !== "ambient-subagent-batch-progress-v1") return undefined;
  const itemCount = numberValue(summary.itemCount);
  const acceptedReportCount = numberValue(summary.acceptedReportCount);
  const pendingCount = numberValue(summary.pendingCount);
  if (itemCount === undefined || acceptedReportCount === undefined || pendingCount === undefined) return undefined;
  const jobId = typeof summary.jobId === "string" ? summary.jobId : undefined;
  return {
    id: event.id,
    label: "Batch progress",
    statusTone: pendingCount > 0 ? "active" : "success",
    summary: `${acceptedReportCount}/${itemCount} ${itemCount === 1 ? "item" : "items"} reported`,
    detail: pendingCount > 0
      ? `${pendingCount} pending${jobId ? ` · ${truncate(jobId, 72)}` : ""}`
      : `All items reported${jobId ? ` · ${truncate(jobId, 72)}` : ""}`,
    updatedAt: event.updatedAt,
  };
}

function groupedCompletionActivity(event: SubagentParentMailboxEventSummary): SubagentParentClusterMailboxActivityModel | undefined {
  if (event.type !== "subagent.grouped_completion") return undefined;
  const payload = recordValue(event.payload);
  if (payload?.schemaVersion !== "ambient-subagent-grouped-completion-v1") return undefined;
  const notificationCount = numberValue(payload.notificationCount) ?? arrayValue(payload.childRuns).length;
  return {
    id: event.id,
    label: "Background completions",
    ...(childSourceLabel(payload) ? { sourceLabel: childSourceLabel(payload) } : {}),
    statusTone: "success",
    summary: `${notificationCount} ${notificationCount === 1 ? "child" : "children"} completed`,
    detail: childRunActivityDetail(arrayValue(payload.childRuns)),
    updatedAt: event.updatedAt,
  };
}

function childRunActivityDetail(childRuns: unknown[]): string | undefined {
  const labels = childRuns
    .map(recordValue)
    .map((child) => {
      const role = typeof child?.roleId === "string" ? titleCase(child.roleId) : undefined;
      const status = typeof child?.status === "string" ? child.status.split("_").map(titleCase).join(" ") : undefined;
      return [role, status].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return labels.length ? truncate(labels.join(", "), 140) : undefined;
}

function childSourceLabel(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const path = stringValue(payload.canonicalTaskPath);
  const childRunId = stringValue(payload.childRunId);
  const childThreadId = stringValue(payload.childThreadId);
  const childRunIds = stringArrayValue(payload.childRunIds);
  const detachedRunIds = stringArrayValue(payload.detachedRunIds);
  const cancelledRunIds = stringArrayValue(payload.cancelledRunIds);
  const affectedRunIds = uniqueStrings([
    ...(childRunId ? [childRunId] : []),
    ...childRunIds,
    ...detachedRunIds,
    ...cancelledRunIds,
  ]);
  const pieces = [
    path,
    affectedRunIds.length === 1
      ? `run ${affectedRunIds[0]}`
      : affectedRunIds.length > 1
        ? `runs ${affectedRunIds.slice(0, 3).join(", ")}${affectedRunIds.length > 3 ? ` +${affectedRunIds.length - 3}` : ""}`
        : undefined,
    childThreadId ? `thread ${childThreadId}` : undefined,
  ].filter(Boolean);
  return pieces.length ? `Child source: ${pieces.join(" / ")}` : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function mailboxTypeLabel(type: string): string {
  return type.replace(/^subagent\./, "").split(/[._-]+/g).map(titleCase).join(" ");
}

function lifecycleSourceLabel(source: string | undefined): string | undefined {
  if (source === "parent_cancel_request") return "Cancelled by parent";
  if (source === "direct_child_stop") return "Stopped in child thread";
  if (source === "desktop_restart") return "Needs restart reconciliation";
  if (source === "runtime_budget_exceeded") return "Runtime budget exceeded";
  return undefined;
}

function lifecycleStatusTone(status: string | undefined): SubagentParentClusterTone {
  if (status === "detached" || status === "aborted_partial") return "warning";
  if (status === "completed") return "success";
  if (status === "running" || status === "starting" || status === "waiting") return "active";
  if (status === "failed" || status === "stopped" || status === "cancelled" || status === "timed_out") return "danger";
  return "neutral";
}

function statusLabelFromString(status: string): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
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
    const label = truncate([
      title,
      run.canonicalTaskPath,
      statusLabel(run.status),
      latestLabel,
    ].filter(Boolean).join(" / "), 180);
    const detail = [
      title,
      run.canonicalTaskPath,
      statusLabel(run.status),
      latestLabel,
    ].filter(Boolean).join(" / ");
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

function barrierChildSynthesisAllowed(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
): boolean {
  const childResult = barrierChildResultRecord(barrier, run);
  const synthesisAllowed = booleanValue(childResult?.synthesisAllowed);
  if (synthesisAllowed !== undefined) return synthesisAllowed;
  return subagentRunStatusIsSynthesisSafe(run.status);
}

function barrierChildValidationDetail(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
): string | undefined {
  const childResult = barrierChildResultRecord(barrier, run);
  const resultValidation = recordValue(childResult?.resultValidation);
  if (resultValidation) {
    const completionGuard = recordValue(resultValidation.completionGuardValidation);
    return completionGuard ? completionGuardDetail(completionGuard) || stringValue(resultValidation.reason) : stringValue(resultValidation.reason);
  }
  return stringValue(childResult?.reason);
}

function barrierChildResultRecord(
  barrier: SubagentWaitBarrierSummary,
  run: SubagentRunSummary,
): Record<string, unknown> | undefined {
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

function barrierDecisionLabels(barrier: SubagentWaitBarrierSummary): Pick<SubagentParentClusterBarrierModel, "decisionLabel" | "decisionSummary"> {
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

function lifecycleEffectSummary(record: Record<string, unknown>): string | undefined {
  const parts = lifecycleEffectRows(record).map((row) => row.label);
  return parts.length ? parts.join(" / ") : undefined;
}

function lifecycleEffectRows(record: Record<string, unknown>): SubagentParentClusterLifecycleEffectModel[] {
  const retryRequestedRunIds = stringArrayValue(record.retryRequestedRunIds);
  const retryAcceptedRunIds = stringArrayValue(record.retryAcceptedRunIds);
  const retryMailboxEventIds = stringArrayValue(record.retryMailboxEventIds);
  const detachedRunIds = stringArrayValue(record.detachedRunIds);
  const cancelledRunIds = stringArrayValue(record.cancelledRunIds);
  const stoppedChildRunIds = stringArrayValue(record.stoppedChildRunIds);
  const unchangedRunIds = stringArrayValue(record.unchangedRunIds);
  const cancelledWaitBarrierIds = stringArrayValue(record.cancelledWaitBarrierIds);
  const failedWaitBarrierIds = stringArrayValue(record.failedWaitBarrierIds);
  const partialWaitBarrierIds = stringArrayValue(record.partialWaitBarrierIds);
  const cancelledMailboxEventIds = stringArrayValue(record.cancelledMailboxEventIds);
  return [
    lifecycleChildRunEffectRow("retry-requested-runs", "Retry requested", retryRequestedRunIds, "active"),
    lifecycleChildRunEffectRow("retry-accepted-runs", "Retry accepted", retryAcceptedRunIds, "active"),
    lifecycleIdEffectRow(
      "retry-mailbox-events",
      retryMailboxEventCountSummary(retryMailboxEventIds.length),
      "Mailbox events",
      retryMailboxEventIds,
      "active",
    ),
    lifecycleChildRunEffectRow("detached-runs", "Detached", detachedRunIds, "warning"),
    lifecycleChildRunEffectRow("cancelled-runs", "Cancelled", cancelledRunIds, "danger"),
    lifecycleChildRunEffectRow("stopped-runs", "Stopped", stoppedChildRunIds, "danger"),
    lifecycleChildRunEffectRow("unchanged-runs", "Unchanged", unchangedRunIds, "neutral"),
    lifecycleIdEffectRow(
      "cancelled-wait-barriers",
      cancelledWaitBarrierCountSummary(cancelledWaitBarrierIds.length),
      "Wait barriers",
      cancelledWaitBarrierIds,
      "warning",
    ),
    lifecycleIdEffectRow(
      "failed-wait-barriers",
      failedWaitBarrierCountSummary(failedWaitBarrierIds.length),
      "Wait barriers",
      failedWaitBarrierIds,
      "danger",
    ),
    lifecycleIdEffectRow(
      "partial-wait-barriers",
      partialWaitBarrierCountSummary(partialWaitBarrierIds.length),
      "Wait barriers",
      partialWaitBarrierIds,
      "warning",
    ),
    record.parentCancellationRequested === true
      ? {
        key: "parent-cancellation-requested",
        label: "Parent cancellation requested",
        detail: record.parentStopped === true
          ? "Parent run cancellation was requested by the parent-stop cascade."
          : "Parent run cancellation was requested by the barrier decision.",
        statusTone: "danger" as const,
      }
      : undefined,
    lifecycleIdEffectRow(
      "cancelled-mailbox-events",
      cancelledMailboxEventCountSummary(cancelledMailboxEventIds.length),
      "Mailbox events",
      cancelledMailboxEventIds,
      "warning",
    ),
  ].filter((row): row is SubagentParentClusterLifecycleEffectModel => Boolean(row));
}

function lifecycleChildRunEffectRow(
  key: string,
  label: string,
  runIds: string[],
  statusTone: SubagentParentClusterTone,
): SubagentParentClusterLifecycleEffectModel | undefined {
  const rowLabel = childRunCountSummary(label, runIds.length);
  return lifecycleIdEffectRow(key, rowLabel, "Runs", runIds, statusTone);
}

function lifecycleIdEffectRow(
  key: string,
  label: string | undefined,
  detailPrefix: string,
  ids: string[],
  statusTone: SubagentParentClusterTone,
): SubagentParentClusterLifecycleEffectModel | undefined {
  if (!label) return undefined;
  return {
    key,
    label,
    detail: ids.length ? `${detailPrefix}: ${compactEffectIdList(ids)}` : label,
    statusTone,
  };
}

function compactEffectIdList(ids: string[]): string {
  return `${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ` +${ids.length - 4}` : ""}`;
}

function childRunCountSummary(label: string, count: number): string | undefined {
  return count ? `${label} ${count} ${count === 1 ? "child" : "children"}` : undefined;
}

function cancelledWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} wait ${count === 1 ? "barrier" : "barriers"} cancelled` : undefined;
}

function failedWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} wait ${count === 1 ? "barrier" : "barriers"} failed` : undefined;
}

function partialWaitBarrierCountSummary(count: number): string | undefined {
  return count ? `${count} partial wait ${count === 1 ? "barrier" : "barriers"} available` : undefined;
}

function cancelledMailboxEventCountSummary(count: number): string | undefined {
  return count ? `${count} pending mailbox ${count === 1 ? "event" : "events"} cancelled` : undefined;
}

function retryMailboxEventCountSummary(count: number): string | undefined {
  return count ? `${count} retry mailbox ${count === 1 ? "event" : "events"} queued` : undefined;
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

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function elapsedLabel(startIso: string, endIso: string): string {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "unknown";
  const elapsedMs = end - start;
  if (elapsedMs < 1000) return "<1s";
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function statusLabel(status: SubagentRunSummary["status"]): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

function statusTone(status: SubagentRunSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "running":
    case "starting":
      return "active";
    case "completed":
      return "success";
    case "reserved":
    case "detached":
    case "aborted_partial":
    case "timed_out":
    case "needs_attention":
      return "warning";
    case "failed":
    case "stopped":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
