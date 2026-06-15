import type {
  OrchestrationRun,
  OrchestrationTask,
  OrchestrationWorkflowReadiness,
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardGitSyncStatus,
  ProjectBoardSummary,
} from "../../shared/types";
import { DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS } from "../../shared/projectBoardSynthesisRecovery";
import { projectBoardProofCoverageForBoard } from "./projectBoardActiveCardUiModel";
import { projectBoardDecisionQueue } from "./projectBoardDecisionQueueUiModel";
import { projectBoardDependencyHealth } from "./projectBoardDependencyUiModel";
import {
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardPiUpdateReviewQueue,
  projectBoardSourceImpactEventGroupKey,
  projectBoardSourceImpactEventMetadata,
  projectBoardSourceImpactRefreshAppliedToCard,
} from "./projectBoardDraftInboxUiModel";
import {
  projectBoardBoardDecisionImpactRail,
  projectBoardWorkflowImpactPreview,
} from "./projectBoardExecutionUiModel";
import type { ProjectBoardWorkflowImpactMetric } from "./projectBoardExecutionUiModel";
import { projectBoardExecutionOverview } from "./projectBoardExecutionOverviewUiModel";
import type { ProjectBoardExecutionOverviewState } from "./projectBoardExecutionOverviewUiModel";
import { projectBoardDeliverableIntegrationQueue } from "./projectBoardIntegrationUiModel";
import {
  projectBoardSourceGroups,
  projectBoardSourceImpactCharLabel,
} from "./projectBoardSourceUiModel";
import { projectBoardHistoryRecoveryQueue } from "./projectBoardSynthesisRunUiModel";

export type ProjectBoardOverviewTabId = "overview" | "board" | "map" | "proof" | "integration" | "charter" | "decisions" | "draft_inbox" | "history";

export type ProjectBoardOverviewTone = "ready" | "warning" | "danger" | "neutral";
export type ProjectBoardOverviewStepId = "charter" | "decisions" | "draft_inbox" | "map" | "board" | "proof" | "integration" | "history";
export type ProjectBoardImpactQueueKind = "workflow" | "decision" | "source" | "proof" | "integration" | "staged_update" | "recovery";

export interface ProjectBoardOverviewMetric {
  label: string;
  value: number | string;
  title?: string;
}

export interface ProjectBoardOverviewStep {
  id: ProjectBoardOverviewStepId;
  tabId: ProjectBoardOverviewTabId;
  order: number;
  title: string;
  detail: string;
  statusLabel: string;
  actionLabel: string;
  count: number;
  tone: ProjectBoardOverviewTone;
}

export interface ProjectBoardImpactQueueItem {
  id: string;
  kind: ProjectBoardImpactQueueKind;
  tabId: ProjectBoardOverviewTabId;
  title: string;
  detail: string;
  actionLabel: string;
  tone: ProjectBoardOverviewTone;
  modelCallRequired: boolean;
  affectedCardIds: string[];
  eventId?: string;
  createdAt?: string;
  metrics: ProjectBoardOverviewMetric[];
}

export interface ProjectBoardImpactQueueModel {
  visible: boolean;
  headline: string;
  detail: string;
  actionCount: number;
  modelCallRequiredCount: number;
  affectedCardCount: number;
  metrics: ProjectBoardOverviewMetric[];
  items: ProjectBoardImpactQueueItem[];
}

export type ProjectBoardHistoryImpactAuditStatus = "active" | "recorded";

export interface ProjectBoardHistoryImpactAuditItem extends ProjectBoardImpactQueueItem {
  status: ProjectBoardHistoryImpactAuditStatus;
  statusLabel: string;
  eventTitle?: string;
  eventSummary?: string;
  notes?: string[];
}

export interface ProjectBoardHistoryImpactAuditModel {
  visible: boolean;
  headline: string;
  detail: string;
  activeCount: number;
  recordedCount: number;
  modelCallRequiredCount: number;
  affectedCardCount: number;
  metrics: ProjectBoardOverviewMetric[];
  items: ProjectBoardHistoryImpactAuditItem[];
}

export interface ProjectBoardOverviewModel {
  headline: string;
  detail: string;
  tone: ProjectBoardOverviewTone;
  metrics: ProjectBoardOverviewMetric[];
  steps: ProjectBoardOverviewStep[];
  impactQueue: ProjectBoardImpactQueueModel;
}

function projectBoardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function projectBoardStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function projectBoardOverviewBadgeCount(board: ProjectBoardSummary): number {
  const decisionQueue = projectBoardDecisionQueue(board);
  const draftPreview = projectBoardDraftInboxCreateReadyPreview(board);
  const proofCoverage = projectBoardProofCoverageForBoard(board);
  const dependencyHealth = projectBoardDependencyHealth(board);
  const recoveryQueue = projectBoardHistoryRecoveryQueue(board);
  const pendingUpdateCount = projectBoardPiUpdateReviewQueue(board).items.length;
  const sourceImpactCount = projectBoardPendingSourceImpactItems(board).length;
  return (
    decisionQueue.actionCount +
    draftPreview.ticketizableCards.length +
    pendingUpdateCount +
    sourceImpactCount +
    proofCoverage.missing.length +
    dependencyHealth.unresolved.length +
    dependencyHealth.cycles.length +
    recoveryQueue.length
  );
}

export function projectBoardOverviewModel(
  board: ProjectBoardSummary,
  options: {
    tasks?: OrchestrationTask[];
    runs?: OrchestrationRun[];
    workflowReadiness?: OrchestrationWorkflowReadiness;
    gitStatus?: ProjectBoardGitSyncStatus;
    gitError?: string;
    nowMs?: number;
  } = {},
): ProjectBoardOverviewModel {
  const sourceGroups = projectBoardSourceGroups(board.sources);
  const decisionQueue = projectBoardDecisionQueue(board);
  const draftPreview = projectBoardDraftInboxCreateReadyPreview(board);
  const dependencyHealth = projectBoardDependencyHealth(board);
  const proofCoverage = projectBoardProofCoverageForBoard(board);
  const integrationQueue = projectBoardDeliverableIntegrationQueue(board, { tasks: options.tasks ?? [], runs: options.runs ?? [] });
  const executionOverview = projectBoardExecutionOverview(board, options.tasks ?? [], options.runs ?? [], {
    workflowReadiness: options.workflowReadiness,
    gitStatus: options.gitStatus,
    gitError: options.gitError,
  });
  const recoveryQueue = projectBoardHistoryRecoveryQueue(board, {
    nowMs: options.nowMs,
    staleMs: DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  });
  const impactQueue = projectBoardImpactQueue(board, {
    tasks: options.tasks,
    runs: options.runs,
    workflowReadiness: options.workflowReadiness,
    nowMs: options.nowMs,
  });

  const executableCards = board.cards.filter((card) => Boolean(card.orchestrationTaskId));
  const readyNowCount = dependencyHealth.readiness.filter((row) => row.state === "ready_now").length;
  const steps: ProjectBoardOverviewStep[] = [
    {
      id: "charter",
      tabId: "charter",
      order: 1,
      title: "Confirm source authority",
      detail:
        sourceGroups.length > 0
          ? `${sourceGroups.length} source group${sourceGroups.length === 1 ? "" : "s"} are available for source authority, chat include/reject, and prompt-budget review.`
          : "No source snapshot has been recorded yet. Refresh sources before relying on planning decisions.",
      statusLabel: sourceGroups.length > 0 ? "Source inventory ready" : "Needs sources",
      actionLabel: "Review sources",
      count: sourceGroups.length,
      tone: sourceGroups.length > 0 ? "ready" : "warning",
    },
    {
      id: "decisions",
      tabId: "decisions",
      order: 2,
      title: "Resolve canonical decisions",
      detail:
        decisionQueue.actionCount > 0
          ? `${decisionQueue.actionCount} open decision or proposal gap${decisionQueue.actionCount === 1 ? "" : "s"} should be settled before broad ticketization.`
          : `${decisionQueue.answeredCount} answered and ${decisionQueue.duplicateCount} duplicate decision row${decisionQueue.answeredCount + decisionQueue.duplicateCount === 1 ? "" : "s"} are audit-only.`,
      statusLabel: decisionQueue.actionCount > 0 ? "Needs decisions" : "Decision gates clear",
      actionLabel: decisionQueue.actionCount > 0 ? "Open decisions" : "Review audit",
      count: decisionQueue.actionCount,
      tone: decisionQueue.actionCount > 0 ? "warning" : "ready",
    },
    {
      id: "draft_inbox",
      tabId: "draft_inbox",
      order: 3,
      title: "Shape candidates before ticketization",
      detail:
        draftPreview.totalCandidateCount > 0
          ? `${draftPreview.ticketizableCards.length} draft candidate${draftPreview.ticketizableCards.length === 1 ? "" : "s"} can become Local Tasks; ${draftPreview.skippedCards.length} have explicit skipped reasons.`
          : "No Draft Inbox candidates are waiting for approval.",
      statusLabel:
        draftPreview.ticketizableCards.length > 0
          ? "Ready candidates"
          : draftPreview.totalCandidateCount > 0
            ? "Needs candidate review"
            : "No drafts",
      actionLabel: "Open Draft Inbox",
      count: draftPreview.totalCandidateCount,
      tone: draftPreview.ticketizableCards.length > 0 ? "ready" : draftPreview.totalCandidateCount > 0 ? "warning" : "neutral",
    },
    {
      id: "map",
      tabId: "map",
      order: 4,
      title: "Inspect execution order",
      detail:
        dependencyHealth.unresolved.length + dependencyHealth.cycles.length > 0
          ? `${dependencyHealth.unresolved.length} unresolved dependency reference${dependencyHealth.unresolved.length === 1 ? "" : "s"} and ${dependencyHealth.cycles.length} cycle${dependencyHealth.cycles.length === 1 ? "" : "s"} need cleanup.`
          : `${readyNowCount} card${readyNowCount === 1 ? "" : "s"} are ready in dependency order.`,
      statusLabel: dependencyHealth.unresolved.length + dependencyHealth.cycles.length > 0 ? "Dependency issues" : "Map stable",
      actionLabel: "Inspect map",
      count: dependencyHealth.rows.length,
      tone: dependencyHealth.unresolved.length + dependencyHealth.cycles.length > 0 ? "danger" : "ready",
    },
    {
      id: "board",
      tabId: "board",
      order: 5,
      title: "Run or explain executable work",
      detail: executionOverview.detail,
      statusLabel: executionOverview.headline,
      actionLabel: executionOverview.action?.label ?? "Open Board",
      count: executableCards.length,
      tone: projectBoardOverviewToneForExecution(executionOverview.state),
    },
    {
      id: "proof",
      tabId: "proof",
      order: 6,
      title: "Review proof and evidence",
      detail:
        proofCoverage.missing.length > 0
          ? `${proofCoverage.missing.length} proof-eligible card${proofCoverage.missing.length === 1 ? "" : "s"} still need proof expectations.`
          : `${proofCoverage.unit.length + proofCoverage.integration.length + proofCoverage.visual.length + proofCoverage.manual.length} proof-covered card bucket${proofCoverage.unit.length + proofCoverage.integration.length + proofCoverage.visual.length + proofCoverage.manual.length === 1 ? "" : "s"} are represented.`,
      statusLabel: proofCoverage.missing.length > 0 ? "Proof gaps" : "Proof covered",
      actionLabel: "Open Proof",
      count: proofCoverage.missing.length,
      tone: proofCoverage.missing.length > 0 ? (proofCoverage.strict ? "danger" : "warning") : "ready",
    },
    {
      id: "integration",
      tabId: "integration",
      order: 7,
      title: "Integrate deliverables",
      detail: integrationQueue.detail,
      statusLabel: integrationQueue.pendingCount > 0 ? "Integration pending" : integrationQueue.items.length > 0 ? "Outcomes recorded" : "No deliverables",
      actionLabel: "Open Integration",
      count: integrationQueue.pendingCount,
      tone: integrationQueue.pendingCount > 0 ? "warning" : "ready",
    },
    {
      id: "history",
      tabId: "history",
      order: 8,
      title: "Audit recovery and impact",
      detail:
        recoveryQueue.length > 0
          ? `${recoveryQueue.length} planner run${recoveryQueue.length === 1 ? "" : "s"} have recovery actions or saved progressive records.`
          : `${board.events?.length ?? 0} board event${(board.events?.length ?? 0) === 1 ? "" : "s"} are available for audit.`,
      statusLabel: recoveryQueue.length > 0 ? "Recovery available" : "Ledger current",
      actionLabel: "Open History",
      count: recoveryQueue.length,
      tone: recoveryQueue.some((run) => run.tone === "danger") ? "danger" : recoveryQueue.length > 0 ? "warning" : "ready",
    },
  ];

  const urgent = steps.find((step) => step.tone === "danger") ?? steps.find((step) => step.tone === "warning");
  const tone: ProjectBoardOverviewTone = urgent?.tone ?? (impactQueue.actionCount > 0 ? "warning" : "ready");
  return {
    headline: urgent ? urgent.title : impactQueue.actionCount > 0 ? impactQueue.headline : "Board flow is ready to review",
    detail: urgent
      ? urgent.detail
      : impactQueue.actionCount > 0
        ? impactQueue.detail
        : "Source authority, decision gates, draft ticketization, execution readiness, proof, integration, and history all have direct tab targets.",
    tone,
    metrics: [
      { label: "Sources", value: sourceGroups.length, title: "Canonical source groups visible in Charter." },
      { label: "Decisions", value: decisionQueue.actionCount, title: "Open decisions and proposal gaps." },
      { label: "Drafts", value: draftPreview.totalCandidateCount, title: "Draft Inbox candidates before ticketization." },
      { label: "Executable", value: executableCards.length, title: "Cards already linked to Local Tasks." },
      { label: "Integration", value: integrationQueue.pendingCount, title: "Completed run deliverables waiting to apply, export, or defer." },
      { label: "Impact", value: impactQueue.actionCount, title: "Deterministic impact items that need review." },
    ],
    steps,
    impactQueue,
  };
}

function projectBoardOverviewToneForExecution(state: ProjectBoardExecutionOverviewState): ProjectBoardOverviewTone {
  if (state === "workflow_blocked" || state === "collaboration_blocked" || state === "blocked") return "danger";
  if (
    state === "planning_running" ||
    state === "create_tasks" ||
    state === "prepare_run" ||
    state === "start_run" ||
    state === "review" ||
    state === "auto_dispatch_disabled" ||
    state === "integration_pending"
  ) {
    return "warning";
  }
  if (state === "running" || state === "complete") return "ready";
  return "neutral";
}

export function projectBoardImpactQueue(
  board: ProjectBoardSummary,
  options: {
    tasks?: OrchestrationTask[];
    runs?: OrchestrationRun[];
    workflowReadiness?: OrchestrationWorkflowReadiness;
    nowMs?: number;
  } = {},
): ProjectBoardImpactQueueModel {
  const items: ProjectBoardImpactQueueItem[] = [];
  const workflowImpact = projectBoardWorkflowImpactPreview(board, options.tasks ?? [], options.runs ?? [], options.workflowReadiness);
  if (workflowImpact.visible && workflowImpact.state !== "current_workflow") {
    items.push({
      id: `workflow:${workflowImpact.state}:${workflowImpact.workflowHash ?? workflowImpact.workflowPath ?? "unavailable"}`,
      kind: "workflow",
      tabId: "board",
      title: workflowImpact.headline,
      detail: workflowImpact.detail,
      actionLabel: workflowImpact.actions[0]?.label ?? "Review workflow",
      tone: workflowImpact.tone === "neutral" ? "warning" : workflowImpact.tone,
      modelCallRequired: workflowImpact.modelCallRequired,
      affectedCardIds: workflowImpact.affectedCardIds,
      metrics: workflowImpact.metrics.map(projectBoardOverviewMetricFromWorkflowMetric),
    });
  }

  const decisionRail = projectBoardBoardDecisionImpactRail(board);
  if (decisionRail.visible) {
    items.push({
      id: "decision:ticketized-feedback",
      kind: "decision",
      tabId: "board",
      title: decisionRail.headline,
      detail: decisionRail.detail,
      actionLabel: decisionRail.needsFeedbackCount > 0 ? "Add feedback" : "Inspect feedback",
      tone: decisionRail.tone === "neutral" ? "warning" : decisionRail.tone,
      modelCallRequired: decisionRail.modelCallRequired,
      affectedCardIds: decisionRail.affectedCardIds,
      metrics: decisionRail.metrics.map(projectBoardOverviewMetricFromWorkflowMetric),
    });
  }

  items.push(...projectBoardPendingSourceImpactItems(board));

  const updateQueue = projectBoardPiUpdateReviewQueue(board);
  if (updateQueue.visible) {
    items.push({
      id: "staged-update:review",
      kind: "staged_update",
      tabId: "draft_inbox",
      title: updateQueue.headline,
      detail: updateQueue.detail,
      actionLabel: "Review staged updates",
      tone: updateQueue.blockedCount > 0 ? "warning" : "ready",
      modelCallRequired: false,
      affectedCardIds: updateQueue.items.map((item) => item.card.id),
      metrics: [
        { label: "Actionable", value: updateQueue.actionableItems.length },
        { label: "Decision", value: updateQueue.decisionCount },
        { label: "Source", value: updateQueue.sourceCount },
        { label: "Proof", value: updateQueue.proofCount },
      ],
    });
  }

  const proofCoverage = projectBoardProofCoverageForBoard(board);
  if (proofCoverage.missing.length > 0) {
    items.push({
      id: "proof:missing-expectations",
      kind: "proof",
      tabId: "proof",
      title: `${proofCoverage.missing.length} proof expectation gap${proofCoverage.missing.length === 1 ? "" : "s"}`,
      detail: proofCoverage.strict
        ? "Strict proof policy blocks ticketization until these cards carry proof expectations. Recheck coverage or ask Pi for targeted proof suggestions."
        : "These cards can still be reviewed, but proof suggestions should be resolved before low-intervention execution.",
      actionLabel: proofCoverage.strict ? "Suggest proof" : "Review proof",
      tone: proofCoverage.strict ? "danger" : "warning",
      modelCallRequired: false,
      affectedCardIds: proofCoverage.missing.map((card) => card.id),
      metrics: [
        { label: "Missing proof", value: proofCoverage.missing.length },
        { label: "Strict", value: proofCoverage.strict ? "yes" : "no" },
      ],
    });
  }

  const integrationQueue = projectBoardDeliverableIntegrationQueue(board, { tasks: options.tasks ?? [], runs: options.runs ?? [] });
  if (integrationQueue.pendingCount > 0) {
    items.push({
      id: "integration:deliverables",
      kind: "integration",
      tabId: "integration",
      title: integrationQueue.headline,
      detail: integrationQueue.detail,
      actionLabel: "Open Integration",
      tone: "warning",
      modelCallRequired: false,
      affectedCardIds: integrationQueue.items.flatMap((item) => (item.status === "pending" && item.card ? [item.card.id] : [])),
      metrics: [
        { label: "Pending", value: integrationQueue.pendingCount },
        { label: "Material files", value: integrationQueue.materialFileCount },
        { label: "Excluded", value: integrationQueue.excludedFileCount },
      ],
    });
  }

  const recoveryQueue = projectBoardHistoryRecoveryQueue(board, {
    nowMs: options.nowMs,
    staleMs: DEFAULT_PROJECT_BOARD_SYNTHESIS_STALE_MS,
  });
  if (recoveryQueue.length > 0) {
    items.push({
      id: "recovery:planner-runs",
      kind: "recovery",
      tabId: "history",
      title: `${recoveryQueue.length} planner recovery item${recoveryQueue.length === 1 ? "" : "s"}`,
      detail: "History has retry, resume, defer, or progressive-record inspection actions for planner runs that need attention.",
      actionLabel: "Open recovery",
      tone: recoveryQueue.some((run) => run.tone === "danger") ? "danger" : "warning",
      modelCallRequired: false,
      affectedCardIds: [],
      metrics: [
        { label: "Runs", value: recoveryQueue.length },
        { label: "Failed sections", value: recoveryQueue.reduce((total, run) => total + run.failedSectionCount, 0) },
      ],
    });
  }

  const deduped = projectBoardDedupeImpactQueueItems(items);
  const actionCount = deduped.length;
  const modelCallRequiredCount = deduped.filter((item) => item.modelCallRequired).length;
  const affectedCardCount = new Set(deduped.flatMap((item) => item.affectedCardIds)).size;
  return {
    visible: actionCount > 0,
    headline: actionCount > 0 ? `${actionCount} impact item${actionCount === 1 ? "" : "s"} need review` : "No active impact items",
    detail:
      actionCount > 0
        ? "Computed from local board provenance and event metadata. Use targeted actions; there is no default full-board Pi preview."
        : "No source, decision, workflow, proof, or recovery impact currently needs action.",
    actionCount,
    modelCallRequiredCount,
    affectedCardCount,
    metrics: [
      { label: "Items", value: actionCount },
      { label: "Cards", value: affectedCardCount },
      { label: "Need Pi", value: modelCallRequiredCount },
      { label: "Full-board Pi", value: "0", title: "Impact preview never performs a full-board model call." },
    ],
    items: deduped,
  };
}

export function projectBoardHistoryImpactAudit(
  board: ProjectBoardSummary,
  options: {
    tasks?: OrchestrationTask[];
    runs?: OrchestrationRun[];
    workflowReadiness?: OrchestrationWorkflowReadiness;
    nowMs?: number;
  } = {},
): ProjectBoardHistoryImpactAuditModel {
  const activeItems: ProjectBoardHistoryImpactAuditItem[] = projectBoardImpactQueue(board, options).items.map((item) => ({
    ...item,
    status: "active",
    statusLabel: "Needs action",
  }));
  const activeEventIds = new Set(activeItems.map((item) => item.eventId).filter((id): id is string => Boolean(id)));
  const recordedItems = projectBoardHistoryImpactAuditEventItems(board.events ?? [], activeEventIds);
  const items = [...activeItems, ...recordedItems].sort(compareProjectBoardHistoryImpactAuditItems);
  const activeCount = activeItems.length;
  const recordedCount = recordedItems.length;
  const modelCallRequiredCount = items.filter((item) => item.modelCallRequired).length;
  const affectedCardCount = new Set(items.flatMap((item) => item.affectedCardIds)).size;

  return {
    visible: items.length > 0,
    headline:
      activeCount > 0
        ? `${activeCount} active impact item${activeCount === 1 ? "" : "s"} need attention`
        : recordedCount > 0
          ? `${recordedCount} impact event${recordedCount === 1 ? "" : "s"} recorded`
          : "No impact events recorded",
    detail:
      activeCount > 0
        ? "Active impact is computed locally from board provenance. Recorded items show which targeted actions already refreshed drafts, staged Pi updates, created run feedback, or rechecked proof."
        : recordedCount > 0
          ? "The event ledger has resolved impact actions for audit; no active workflow, source, decision, proof, Pi-update, or recovery item currently needs attention."
          : "History will show source, decision, workflow, proof, staged-update, and recovery impact after the planner records them.",
    activeCount,
    recordedCount,
    modelCallRequiredCount,
    affectedCardCount,
    metrics: [
      { label: "Active", value: activeCount },
      { label: "Recorded", value: recordedCount },
      { label: "Cards", value: affectedCardCount },
      { label: "Need Pi", value: modelCallRequiredCount },
      { label: "Full-board Pi", value: "0", title: "History impact audit reads local state and event metadata; it does not run a full-board model preview." },
    ],
    items,
  };
}

function projectBoardHistoryImpactAuditEventItems(
  events: ProjectBoardEvent[],
  activeEventIds: Set<string>,
): ProjectBoardHistoryImpactAuditItem[] {
  const items: ProjectBoardHistoryImpactAuditItem[] = [];
  for (const event of events) {
    const metadata = projectBoardRecord(event.metadata);
    const decisionImpact = projectBoardRecord(metadata?.decisionImpact);
    if (decisionImpact) items.push(projectBoardHistoryImpactAuditEventItem(event, "decision", decisionImpact, activeEventIds));
    const sourceImpact = projectBoardRecord(metadata?.sourceImpact);
    if (sourceImpact) items.push(projectBoardHistoryImpactAuditEventItem(event, "source", sourceImpact, activeEventIds));
    const proofImpact = projectBoardRecord(metadata?.proofImpact);
    if (proofImpact) items.push(projectBoardHistoryImpactAuditEventItem(event, "proof", proofImpact, activeEventIds));
    if (projectBoardHistoryEventHasWorkflowImpact(event)) {
      items.push(projectBoardHistoryWorkflowImpactAuditEventItem(event, activeEventIds));
    }
  }
  return items.filter((item) => !activeEventIds.has(item.eventId ?? "")).slice(0, 24);
}

function projectBoardHistoryImpactAuditEventItem(
  event: ProjectBoardEvent,
  kind: Extract<ProjectBoardImpactQueueKind, "decision" | "source" | "proof">,
  impact: Record<string, unknown>,
  activeEventIds: Set<string>,
): ProjectBoardHistoryImpactAuditItem {
  const appliedAction = projectBoardRecordText(impact, "appliedAction");
  const affectedCardIds = projectBoardHistoryImpactAffectedCardIds(impact);
  const modelCallRequired = projectBoardRecordBoolean(impact, "modelCallRequired") === true || projectBoardRecordBoolean(event.metadata, "modelCallRequired") === true;
  const isActiveSourceRecord = kind === "source" && event.kind === "source_updated" && !appliedAction && activeEventIds.has(event.id);
  return {
    id: `event:${kind}:${event.id}`,
    kind,
    tabId: kind === "decision" ? "decisions" : kind === "source" ? "charter" : "proof",
    title: projectBoardHistoryImpactAuditTitle(kind, event, appliedAction),
    detail: projectBoardHistoryImpactAuditDetail(kind, event, impact, affectedCardIds.length),
    actionLabel: projectBoardHistoryImpactAuditActionLabel(kind, appliedAction),
    tone: isActiveSourceRecord ? "warning" : modelCallRequired ? "warning" : "ready",
    modelCallRequired,
    affectedCardIds,
    eventId: event.id,
    createdAt: event.createdAt,
    metrics: projectBoardHistoryImpactAuditMetrics(impact, affectedCardIds),
    status: isActiveSourceRecord ? "active" : "recorded",
    statusLabel: isActiveSourceRecord ? "Needs action" : projectBoardHistoryImpactAuditStatusLabel(kind, appliedAction, modelCallRequired),
    eventTitle: event.title,
    eventSummary: event.summary,
    notes: projectBoardHistoryImpactAuditNotes(kind, impact),
  };
}

function projectBoardHistoryWorkflowImpactAuditEventItem(
  event: ProjectBoardEvent,
  activeEventIds: Set<string>,
): ProjectBoardHistoryImpactAuditItem {
  const metadata = projectBoardRecord(event.metadata);
  const modelCallRequired = projectBoardRecordBoolean(metadata, "modelCallRequired") === true;
  const affectedCardIds = projectBoardHistoryImpactAffectedCardIds(metadata);
  const active = activeEventIds.has(event.id);
  return {
    id: `event:workflow:${event.id}`,
    kind: "workflow",
    tabId: "board",
    title: projectBoardHistoryWorkflowImpactTitle(event),
    detail: event.summary || "Workflow contract impact was recorded in the board history.",
    actionLabel: "Open Board",
    tone: active ? "warning" : event.kind === "workflow_repaired" || event.kind === "workflow_settings_updated" || event.kind === "workflow_raw_updated" ? "ready" : "warning",
    modelCallRequired,
    affectedCardIds,
    eventId: event.id,
    createdAt: event.createdAt,
    metrics: projectBoardHistoryImpactAuditMetrics(metadata, affectedCardIds),
    status: active ? "active" : "recorded",
    statusLabel: active ? "Needs action" : "Workflow recorded",
    eventTitle: event.title,
    eventSummary: event.summary,
    notes: projectBoardHistoryImpactAuditNotes("workflow", metadata),
  };
}

function projectBoardHistoryEventHasWorkflowImpact(event: ProjectBoardEvent): boolean {
  return (
    event.kind === "workflow_created" ||
    event.kind === "workflow_impact_resolved" ||
    event.kind === "workflow_repaired" ||
    event.kind === "workflow_settings_updated" ||
    event.kind === "workflow_raw_updated"
  );
}

function projectBoardHistoryWorkflowImpactTitle(event: ProjectBoardEvent): string {
  if (event.kind === "workflow_created") return "Workflow contract created";
  if (event.kind === "workflow_repaired") return "Workflow contract repaired";
  if (event.kind === "workflow_settings_updated") return "Workflow settings updated";
  if (event.kind === "workflow_raw_updated") return "Workflow raw edit saved";
  if (event.kind === "workflow_impact_resolved") return "Workflow impact resolved";
  return event.title || "Workflow impact recorded";
}

function projectBoardHistoryImpactAuditTitle(
  kind: Extract<ProjectBoardImpactQueueKind, "decision" | "source" | "proof">,
  event: ProjectBoardEvent,
  appliedAction?: string,
): string {
  if (kind === "decision") {
    if (appliedAction === "create_next_run_feedback") return "Decision feedback created";
    if (appliedAction === "refresh_affected_drafts") return "Decision refreshed draft cards";
    if (appliedAction === "propose_targeted_draft_refresh") return "Decision Pi refresh staged";
    return "Decision impact recorded";
  }
  if (kind === "source") {
    if (appliedAction === "create_next_run_feedback") return "Source feedback created";
    if (appliedAction === "refresh_affected_drafts") return "Source refreshed draft cards";
    if (appliedAction === "propose_targeted_draft_refresh") return "Source Pi refresh staged";
    if (event.kind === "source_updated") return "Source change affects cards";
    return "Source impact recorded";
  }
  if (appliedAction === "suggest_missing_proof") return "Proof suggestions staged";
  if (appliedAction === "recompute_proof_coverage") return "Proof coverage rechecked";
  return "Proof impact recorded";
}

function projectBoardHistoryImpactAuditDetail(
  kind: Extract<ProjectBoardImpactQueueKind, "decision" | "source" | "proof">,
  event: ProjectBoardEvent,
  impact: Record<string, unknown>,
  affectedCardCount: number,
): string {
  const action = projectBoardRecordText(impact, "appliedAction");
  const eventSummary = event.summary.trim();
  if (eventSummary) return eventSummary;
  if (kind === "decision") {
    const question = projectBoardRecordText(impact, "question");
    return `${question ? `Decision "${question}"` : "A clarification decision"} affected ${affectedCardCount} card${projectBoardPlural(affectedCardCount)} without a full-board model call.`;
  }
  if (kind === "source") {
    return `Source impact affected ${affectedCardCount} card${projectBoardPlural(affectedCardCount)}. Existing approved card fields were not rewritten.`;
  }
  if (action === "suggest_missing_proof") {
    return `Proof suggestions staged reviewable updates for ${affectedCardCount} card${projectBoardPlural(affectedCardCount)}.`;
  }
  return `Proof impact affected ${affectedCardCount} card${projectBoardPlural(affectedCardCount)}.`;
}

function projectBoardHistoryImpactAuditActionLabel(
  kind: Extract<ProjectBoardImpactQueueKind, "decision" | "source" | "proof">,
  appliedAction?: string,
): string {
  if (appliedAction === "propose_targeted_draft_refresh") return "Review staged updates";
  if (kind === "decision") return appliedAction ? "Open Decisions" : "Resolve decision";
  if (kind === "source") return "Open Charter";
  return appliedAction === "suggest_missing_proof" ? "Review Proof" : "Open Proof";
}

function projectBoardHistoryImpactAuditStatusLabel(
  kind: Extract<ProjectBoardImpactQueueKind, "decision" | "source" | "proof">,
  appliedAction: string | undefined,
  modelCallRequired: boolean,
): string {
  if (appliedAction === "create_next_run_feedback") return "Feedback ready";
  if (appliedAction === "refresh_affected_drafts") return "Drafts refreshed";
  if (appliedAction === "propose_targeted_draft_refresh") return "Pi update staged";
  if (appliedAction === "suggest_missing_proof") return "Proof staged";
  if (appliedAction === "recompute_proof_coverage") return "Coverage checked";
  if (modelCallRequired) return "Targeted Pi recorded";
  if (kind === "decision") return "Decision recorded";
  if (kind === "source") return "Source recorded";
  return "Proof recorded";
}

function projectBoardHistoryImpactAuditNotes(
  kind: ProjectBoardImpactQueueKind,
  impact: Record<string, unknown> | undefined,
): string[] {
  const appliedAction = projectBoardRecordText(impact, "appliedAction");
  if (kind === "proof" && appliedAction === "recompute_proof_coverage") {
    const reasons = projectBoardStringArray(impact?.driftReasons)
      .map((reason) => reason.trim())
      .filter(Boolean);
    if (reasons.length > 0) return [...new Set(reasons)].slice(0, 4);
    if (projectBoardRecordBoolean(impact, "staleSinceLastRecheck") === false) return ["No proof drift since the last recorded coverage baseline."];
  }
  return [];
}

function projectBoardHistoryImpactAffectedCardIds(record: Record<string, unknown> | undefined): string[] {
  if (record && Object.prototype.hasOwnProperty.call(record, "affectedCardIds")) {
    return [...new Set(projectBoardStringArray(record.affectedCardIds))];
  }
  const ids = [
    ...projectBoardStringArray(record?.affectedDraftCardIds),
    ...projectBoardStringArray(record?.affectedExecutableCardIds),
    ...projectBoardStringArray(record?.targetCardIds),
    ...projectBoardStringArray(record?.eligibleCardIds),
    ...projectBoardStringArray(record?.missingProofCardIds),
    ...projectBoardStringArray(record?.appliedCardIds),
    ...projectBoardStringArray(record?.pendingPiUpdateCardIds),
    ...projectBoardStringArray(record?.skippedCardIds),
  ];
  return [...new Set(ids)];
}

function projectBoardHistoryImpactAuditMetrics(
  impact: Record<string, unknown> | undefined,
  affectedCardIds: string[],
): ProjectBoardOverviewMetric[] {
  if (projectBoardRecordText(impact, "appliedAction") === "recompute_proof_coverage") {
    return projectBoardHistoryProofImpactAuditMetrics(impact, affectedCardIds);
  }
  const metrics: ProjectBoardOverviewMetric[] = [{ label: "Cards", value: affectedCardIds.length }];
  const appliedCardIds = projectBoardStringArray(impact?.appliedCardIds);
  const pendingPiUpdateCardIds = projectBoardStringArray(impact?.pendingPiUpdateCardIds);
  const skippedCardIds = projectBoardStringArray(impact?.skippedCardIds);
  const missingProofCardIds = projectBoardStringArray(impact?.missingProofCardIds);
  const promptCharCount = projectBoardRecordNumber(impact, "promptCharCount") ?? projectBoardRecordNumber(projectBoardRecord(impact?.telemetry), "promptCharCount");
  const responseCharCount = projectBoardRecordNumber(impact, "responseCharCount") ?? projectBoardRecordNumber(projectBoardRecord(impact?.telemetry), "responseCharCount");
  if (appliedCardIds.length > 0) metrics.push({ label: "Applied", value: appliedCardIds.length });
  if (pendingPiUpdateCardIds.length > 0) metrics.push({ label: "Staged", value: pendingPiUpdateCardIds.length });
  if (skippedCardIds.length > 0) metrics.push({ label: "Skipped", value: skippedCardIds.length });
  if (missingProofCardIds.length > 0) metrics.push({ label: "Missing proof", value: missingProofCardIds.length });
  if (typeof promptCharCount === "number") metrics.push({ label: "Prompt chars", value: promptCharCount.toLocaleString() });
  if (typeof responseCharCount === "number") metrics.push({ label: "Response chars", value: responseCharCount.toLocaleString() });
  if (metrics.length === 1) metrics.push({ label: "Model calls", value: projectBoardRecordBoolean(impact, "modelCallRequired") ? "targeted" : "0" });
  return metrics.slice(0, 5);
}

function projectBoardHistoryProofImpactAuditMetrics(
  impact: Record<string, unknown> | undefined,
  affectedCardIds: string[],
): ProjectBoardOverviewMetric[] {
  const addedMissingProofCardIds = projectBoardStringArray(impact?.addedMissingProofCardIds);
  const resolvedMissingProofCardIds = projectBoardStringArray(impact?.resolvedMissingProofCardIds);
  const proofKindChangedCardIds = projectBoardStringArray(impact?.proofKindChangedCardIds);
  const proofItemCountChangedCardIds = projectBoardStringArray(impact?.proofItemCountChangedCardIds);
  const policyAffectedCardIds = projectBoardStringArray(impact?.policyAffectedCardIds);
  const missingProofCardIds = projectBoardStringArray(impact?.missingProofCardIds);
  const proofShapeChangedCardIds = [...new Set([...proofKindChangedCardIds, ...proofItemCountChangedCardIds])];
  const missingProofCount = projectBoardRecordNumber(impact, "missingProofCount") ?? missingProofCardIds.length;
  const staleSinceLastRecheck = projectBoardRecordBoolean(impact, "staleSinceLastRecheck");
  const metrics: ProjectBoardOverviewMetric[] = [
    {
      label: "Cards",
      value: affectedCardIds.length,
      title: "Cards explicitly affected by this proof coverage recheck.",
    },
    {
      label: "Drift",
      value: staleSinceLastRecheck ? "yes" : "no",
      title: "Whether deterministic proof coverage changed since the previous recorded recheck.",
    },
    {
      label: "Missing proof",
      value: missingProofCount,
      title: "Cards currently missing required proof after the recheck.",
    },
  ];
  if (addedMissingProofCardIds.length > 0) {
    metrics.push({
      label: "New gaps",
      value: addedMissingProofCardIds.length,
      title: "Cards that became missing-proof since the previous recheck.",
    });
  }
  if (resolvedMissingProofCardIds.length > 0) {
    metrics.push({
      label: "Resolved",
      value: resolvedMissingProofCardIds.length,
      title: "Cards whose missing-proof state was resolved since the previous recheck.",
    });
  }
  if (proofShapeChangedCardIds.length > 0) {
    metrics.push({
      label: "Proof shape",
      value: proofShapeChangedCardIds.length,
      title: "Cards whose proof kind or proof item count changed since the previous recheck.",
    });
  }
  if (policyAffectedCardIds.length > 0) {
    metrics.push({
      label: "Policy review",
      value: policyAffectedCardIds.length,
      title: "Cards affected by proof policy or strict-gate changes.",
    });
  }
  return metrics.slice(0, 6);
}

function projectBoardRecordBoolean(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function compareProjectBoardHistoryImpactAuditItems(
  left: ProjectBoardHistoryImpactAuditItem,
  right: ProjectBoardHistoryImpactAuditItem,
): number {
  const statusRank: Record<ProjectBoardHistoryImpactAuditStatus, number> = { active: 0, recorded: 1 };
  const status = statusRank[left.status] - statusRank[right.status];
  if (status !== 0) return status;
  const impact = compareProjectBoardImpactQueueItems(left, right);
  if (impact !== 0) return impact;
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
}

function projectBoardOverviewMetricFromWorkflowMetric(metric: ProjectBoardWorkflowImpactMetric): ProjectBoardOverviewMetric {
  return { label: metric.label, value: metric.value, title: metric.title };
}

function projectBoardPendingSourceImpactItems(board: Pick<ProjectBoardSummary, "cards" | "events">): ProjectBoardImpactQueueItem[] {
  const events = board.events ?? [];
  const cardsById = new Map(board.cards.map((card) => [card.id, card]));
  const latestByGroup = new Map<string, { event: ProjectBoardEvent; impact: NonNullable<ReturnType<typeof projectBoardSourceImpactEventMetadata>> }>();

  for (const event of [...events].sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))) {
    const impact = projectBoardSourceImpactEventMetadata(event);
    if (!impact || (!impact.targetedRefreshOptional && !impact.nextRunFeedbackRecommended)) continue;
    const key = projectBoardSourceImpactEventGroupKey(impact);
    if (!latestByGroup.has(key)) latestByGroup.set(key, { event, impact });
  }

  return [...latestByGroup.values()]
    .map(({ event, impact }): ProjectBoardImpactQueueItem | undefined => {
      const sourceIds = impact.groupSourceIds.length > 0 ? impact.groupSourceIds : [impact.sourceId];
      const pendingDraftIds = impact.targetedRefreshOptional
        ? impact.affectedDraftCardIds.filter((cardId) => {
            const card = cardsById.get(cardId);
            return Boolean(
              card &&
                card.status === "draft" &&
                !card.orchestrationTaskId &&
                !card.pendingPiUpdate &&
                !projectBoardSourceImpactRefreshAppliedToCard(events, event.id, card.id),
            );
          })
        : [];
      const pendingExecutableIds = impact.nextRunFeedbackRecommended
        ? impact.affectedExecutableCardIds.filter((cardId) => {
            const card = cardsById.get(cardId);
            return Boolean(card && projectBoardCardCanCarrySourceImpactFeedback(card) && !projectBoardCardHasSourceImpactFeedback(card, [event.id], sourceIds));
          })
        : [];
      const affectedCardIds = [...new Set([...pendingDraftIds, ...pendingExecutableIds])];
      if (affectedCardIds.length === 0) return undefined;
      const draftPhrase =
        pendingDraftIds.length > 0
          ? `${pendingDraftIds.length} draft${projectBoardPlural(pendingDraftIds.length)} can refresh before ticketization`
          : "";
      const executablePhrase =
        pendingExecutableIds.length > 0
          ? `${pendingExecutableIds.length} ticketized card${projectBoardPlural(pendingExecutableIds.length)} need additive run feedback`
          : "";
      return {
        id: `source:${projectBoardSourceImpactEventGroupKey(impact)}:${event.id}`,
        kind: "source",
        tabId: "charter",
        title:
          pendingDraftIds.length > 0 && pendingExecutableIds.length > 0
            ? "Source change affects drafts and Local Tasks"
            : pendingExecutableIds.length > 0
              ? "Source change needs Local Task feedback"
              : "Source change can refresh drafts",
        detail:
          impact.detail ||
          [draftPhrase, executablePhrase, "Existing approved card fields are not rewritten; use targeted draft refreshes or next-run feedback."]
            .filter(Boolean)
            .join(". "),
        actionLabel:
          pendingExecutableIds.length > 0 && pendingDraftIds.length === 0
            ? "Create run feedback"
            : pendingDraftIds.length > 0
              ? "Review source refresh"
              : "Review source impact",
        tone: "warning",
        modelCallRequired: false,
        affectedCardIds,
        eventId: event.id,
        createdAt: event.createdAt,
        metrics: [
          { label: "Drafts", value: pendingDraftIds.length },
          { label: "Local Tasks", value: pendingExecutableIds.length },
          { label: "Sources", value: sourceIds.length },
          { label: "Est. chars", value: projectBoardSourceImpactCharLabel(impact.estimatedPromptChars) },
        ],
      };
    })
    .filter((item): item is ProjectBoardImpactQueueItem => Boolean(item));
}

function projectBoardCardCanCarrySourceImpactFeedback(card: ProjectBoardCard): boolean {
  return Boolean(card.orchestrationTaskId) && card.status !== "draft" && card.status !== "in_progress" && card.status !== "done" && card.status !== "archived";
}

function projectBoardCardHasSourceImpactFeedback(card: ProjectBoardCard, sourceImpactEventIds: string[], sourceIds: string[]): boolean {
  const sourceImpactEventIdSet = new Set(sourceImpactEventIds.filter(Boolean));
  const sourceIdSet = new Set(sourceIds.filter(Boolean));
  return (card.runFeedback ?? []).some((item) => {
    if (item.source !== "source_impact") return false;
    if (item.sourceImpactEventId && sourceImpactEventIdSet.has(item.sourceImpactEventId)) return true;
    if ((item.sourceImpactEventIds ?? []).some((eventId) => sourceImpactEventIdSet.has(eventId))) return true;
    if (sourceImpactEventIdSet.size > 0) return false;
    return (item.sourceIds ?? []).some((sourceId) => sourceIdSet.has(sourceId));
  });
}

function projectBoardDedupeImpactQueueItems(items: ProjectBoardImpactQueueItem[]): ProjectBoardImpactQueueItem[] {
  const byId = new Map<string, ProjectBoardImpactQueueItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort(compareProjectBoardImpactQueueItems);
}

function compareProjectBoardImpactQueueItems(left: ProjectBoardImpactQueueItem, right: ProjectBoardImpactQueueItem): number {
  const toneRank: Record<ProjectBoardOverviewTone, number> = { danger: 0, warning: 1, ready: 2, neutral: 3 };
  const kindRank: Record<ProjectBoardImpactQueueKind, number> = {
    workflow: 0,
    recovery: 1,
    decision: 2,
    source: 3,
    staged_update: 4,
    proof: 5,
    integration: 6,
  };
  const tone = toneRank[left.tone] - toneRank[right.tone];
  if (tone !== 0) return tone;
  const modelCall = Number(right.modelCallRequired) - Number(left.modelCallRequired);
  if (modelCall !== 0) return modelCall;
  const kind = kindRank[left.kind] - kindRank[right.kind];
  if (kind !== 0) return kind;
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "") || left.title.localeCompare(right.title);
}

function projectBoardRecordText(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function projectBoardRecordTextArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function projectBoardRecordNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function projectBoardPlural(count: number): string {
  return count === 1 ? "" : "s";
}
