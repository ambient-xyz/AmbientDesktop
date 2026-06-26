import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SubagentPatternGraphRendererModel } from "./subagentPatternGraphUiModel";
import type { SubagentParentClusterMailboxActivityModel } from "./subagentParentClusterMailboxUiModel";
import type {
  SubagentParentClusterTone,
  SubagentParentClusterWorkflowTaskChildWaitModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterWorkflowTaskUiModel";
import { elapsedLabel, statusLabel, statusTone, titleCase, truncate } from "./subagentParentClusterSharedUiModel";

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

export type SubagentParentClusterChildBlockerDraft = Omit<SubagentParentClusterChildBlockerModel, "metaLabels">;

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

interface SubagentParentClusterBarrierStatusModel {
  statusTone: SubagentParentClusterTone;
}

export function childModel(
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
    ...(retainedSummary
      ? {
          retentionLabel: "Summary retained",
          retentionTitle: `Sub-agent ${run.canonicalTaskPath} transcript was collapsed by retention; result metadata and artifacts remain available.`,
        }
      : {}),
    ...(parentBlocker ? { parentBlocker: withChildBlockerMeta(parentBlocker, run, title, preview) } : {}),
  };
}

export function parentBlockingModel(children: SubagentParentClusterChildModel[]): SubagentParentClusterParentBlockingModel | undefined {
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
      blockingChildren
        .slice(0, 3)
        .map((child) => child.title)
        .join(", "),
    ]
      .filter(Boolean)
      .join(" / "),
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

export function subagentRunStatusIsSynthesisSafe(status: SubagentRunSummary["status"]): boolean {
  return status === "completed";
}

export function subagentRunStatusIsTerminal(status: SubagentRunSummary["status"]): boolean {
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

export function childTitle(run: SubagentRunSummary, thread: ThreadSummary | undefined): string {
  return thread?.title || `${titleCase(run.roleId)} sub-agent`;
}

export function childPreview(run: SubagentRunSummary, thread: ThreadSummary | undefined, resultSummary: string | undefined): string {
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

export function resultArtifactSummary(resultArtifact: unknown): string | undefined {
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

export function childSummary(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierStatusModel[],
  patternGraphs: SubagentPatternGraphRendererModel[],
  workflowTasks: SubagentParentClusterWorkflowTaskModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): string {
  const required = children.filter((child) => child.dependencyLabel === "Required").length;
  const background = children.filter((child) => child.dependencyLabel === "Background").length;
  const needsAttention = children.filter(
    (child) => child.dependencyLabel === "Needs attention" || child.status === "Needs attention",
  ).length;
  const childAttentionBlockers = children.filter(
    (child) => child.parentBlocker?.kind === "attention" && child.status !== "Needs attention",
  ).length;
  const retainedSummaries = children.filter((child) => child.retentionLabel === "Summary retained").length;
  const approvalBlocked = children.filter((child) => child.parentBlocker?.kind === "approval").length;
  const waiting = barriers.filter((barrier) => barrier.statusTone === "active").length;
  const workflowBlocking = workflowTasks.filter((task) => task.modeLabel === "Blocking").length;
  const workflowActive = workflowTasks.filter((task) => task.statusTone === "active").length;
  const workflowNeedsAttention = workflowTasks.filter((task) => task.statusTone === "warning" || task.statusTone === "danger").length;
  const workflowChildWaits = workflowTasks
    .map((task) => task.childWait)
    .filter((wait): wait is SubagentParentClusterWorkflowTaskChildWaitModel => Boolean(wait));
  const activeBatches = mailboxActivities.filter(
    (activity) => activity.label === "Batch progress" && activity.statusTone === "active",
  ).length;
  const failedSpawns = mailboxActivities.filter((activity) => activity.label === "Spawn failed").length;
  const interruptions = mailboxActivities.filter(
    (activity) => activity.label === "Child interrupted" || activity.label === "Parent stopped",
  ).length;
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
  if (workflowChildWaits.length) pieces.push(workflowChildWaitSummary(workflowChildWaits));
  if (workflowBlockers) pieces.push(`${workflowBlockers} workflow blocked`);
  if (supervisorRequests) pieces.push(`${supervisorRequests} supervisor ${supervisorRequests === 1 ? "request" : "requests"}`);
  if (activeBatches) pieces.push(`${activeBatches} batch pending`);
  if (failedSpawns) pieces.push(`${failedSpawns} failed ${failedSpawns === 1 ? "spawn" : "spawns"}`);
  if (interruptions) pieces.push(`${interruptions} interrupted`);
  return pieces.join(" · ");
}

function workflowChildWaitSummary(waits: SubagentParentClusterWorkflowTaskChildWaitModel[]): string {
  const first = waits[0];
  const labels = first?.childLabels.slice(0, 2) ?? [];
  if (!labels.length) return `${waits.length} Waiting on children`;
  const hidden = first && first.childLabels.length > labels.length ? `, ${first.childLabels.length - labels.length} more` : "";
  return `Waiting on ${labels.join(", ")}${hidden}`;
}

export function clusterStatus(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierStatusModel[],
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
  const workflowChildWait = workflowTasks.find((task) => task.childWait)?.childWait;
  if (workflowChildWait) return workflowChildWait.statusTone === "active" ? "Waiting on children" : "Waiting on child attention";
  if (workflowTasks.some((task) => task.statusTone === "warning")) return "Needs attention";
  if (patternGraphs.some((graph) => graph.nodes.some((node) => node.tone === "warning" || node.tone === "danger")))
    return "Needs attention";
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
  if (
    children.length === 0 &&
    workflowTasks.length === 0 &&
    patternGraphs.length > 0 &&
    patternGraphs.every((graph) => graph.nodes.every((node) => node.tone === "success"))
  )
    return "Complete";
  if (children.length === 0 && mailboxActivities.some((activity) => activity.statusTone === "success")) return "Complete";
  return "Idle";
}

export function clusterTone(
  children: SubagentParentClusterChildModel[],
  barriers: SubagentParentClusterBarrierStatusModel[],
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
  if (
    children.length === 0 &&
    workflowTasks.length === 0 &&
    patternGraphs.length > 0 &&
    patternGraphs.every((graph) => graph.nodes.every((node) => node.tone === "success"))
  )
    return "success";
  if (children.length === 0 && mailboxActivities.some((activity) => activity.statusTone === "success")) return "success";
  return "neutral";
}

function hasApprovalBlocker(
  children: SubagentParentClusterChildModel[],
  mailboxActivities: SubagentParentClusterMailboxActivityModel[],
): boolean {
  return (
    children.some((child) => child.parentBlocker?.kind === "approval") ||
    mailboxActivities.some((activity) => activity.label === "Approval requested" && activity.statusTone === "active")
  );
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

function hasWorkflowBlocker(mailboxActivities: SubagentParentClusterMailboxActivityModel[], tone: SubagentParentClusterTone): boolean {
  return mailboxActivities.some((activity) => activity.label === "Workflow blocked" && activity.statusTone === tone);
}

function hasSupervisorAttention(mailboxActivities: SubagentParentClusterMailboxActivityModel[]): boolean {
  return mailboxActivities.some((activity) => activity.label === "Supervisor request" && activity.statusTone === "warning");
}
