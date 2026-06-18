import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask, OrchestrationWorkflowReadiness } from "../../shared/workflowTypes";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import { projectBoardRunIsActive } from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardExecutionReadinessTone = "ready" | "warning" | "danger" | "neutral";

export type ProjectBoardWorkflowImpactPreviewState =
  | "hidden"
  | "workflow_unavailable"
  | "current_workflow"
  | "prepared_workflow_stale"
  | "prepared_workflow_unknown";

export interface ProjectBoardWorkflowImpactMetric {
  label: string;
  value: number | string;
  title?: string;
}

export type ProjectBoardWorkflowImpactActionId =
  | "prepare_next"
  | "create_default_workflow"
  | "repair_workflow"
  | "restore_generated_default"
  | "use_existing_anyway"
  | "continue_old_prep"
  | "prepare_again"
  | "use_current_workflow_next";

export interface ProjectBoardWorkflowImpactAction {
  action: ProjectBoardWorkflowImpactActionId;
  label: string;
  title: string;
  tone: "primary" | "secondary";
}

export interface ProjectBoardWorkflowRepairPreviewModel {
  validationMessage?: string;
  workspaceStrategy: "git-worktree" | "directory";
  currentText: string;
  proposedText: string;
  diff: string;
  currentLineCount: number;
  proposedLineCount: number;
  currentTextTruncated: boolean;
  diffTruncated: boolean;
}

export interface ProjectBoardWorkflowSettingsModel {
  autoDispatch: boolean;
  maxConcurrentAgents: number;
  maxTurns: number;
  workspaceStrategy: "git-worktree" | "directory";
  requireTests: boolean;
  requireDiffSummary: boolean;
  requireScreenshots: boolean;
}

export interface ProjectBoardWorkflowRawEditorModel {
  markdown: string;
  lineCount: number;
  truncated: boolean;
  disabledReason?: string;
}

export interface ProjectBoardWorkflowImpactPreview {
  visible: boolean;
  state: ProjectBoardWorkflowImpactPreviewState;
  tone: ProjectBoardExecutionReadinessTone;
  headline: string;
  detail: string;
  workflowPath?: string;
  workflowHash?: string;
  workflowHashLabel?: string;
  affectedCardIds: string[];
  affectedRunIds: string[];
  modelCallRequired: boolean;
  metrics: ProjectBoardWorkflowImpactMetric[];
  actions: ProjectBoardWorkflowImpactAction[];
  repairPreview?: ProjectBoardWorkflowRepairPreviewModel;
  settings?: ProjectBoardWorkflowSettingsModel;
  rawEditor?: ProjectBoardWorkflowRawEditorModel;
}

const WORKFLOW_IMPACT_BOARD_STATE_NOTICE =
  "Existing cards, PM proof, and board history are preserved; use Reset Board to clear board state.";

export type ProjectBoardBoardDecisionImpactCardState = "needs_feedback" | "feedback_ready";

export interface ProjectBoardBoardDecisionImpactCard {
  cardId: string;
  title: string;
  status: ProjectBoardCard["status"];
  state: ProjectBoardBoardDecisionImpactCardState;
  tone: ProjectBoardExecutionReadinessTone;
  question?: string;
  answer?: string;
  feedback?: string;
  createdAt?: string;
  sourceLabel: string;
  actionLabel: string;
  actionTitle: string;
}

export interface ProjectBoardBoardDecisionImpactRail {
  visible: boolean;
  tone: ProjectBoardExecutionReadinessTone;
  headline: string;
  detail: string;
  needsFeedbackCount: number;
  feedbackReadyCount: number;
  affectedCardIds: string[];
  modelCallRequired: boolean;
  metrics: ProjectBoardWorkflowImpactMetric[];
  cards: ProjectBoardBoardDecisionImpactCard[];
}

export function projectBoardRunSortTime(run: OrchestrationRun): string {
  return run.lastEventAt ?? run.finishedAt ?? run.startedAt;
}

export function compareProjectBoardRunsLatestFirst(left: OrchestrationRun, right: OrchestrationRun): number {
  const time = projectBoardRunSortTime(right).localeCompare(projectBoardRunSortTime(left));
  if (time !== 0) return time;
  const started = right.startedAt.localeCompare(left.startedAt);
  if (started !== 0) return started;
  const attempt = right.attemptNumber - left.attemptNumber;
  if (attempt !== 0) return attempt;
  return right.id.localeCompare(left.id);
}

function projectBoardRunUsesPreparedWorkspace(run: OrchestrationRun): boolean {
  return projectBoardRunCanRestartFromPreparedWorkspace(run) || projectBoardRunIsActive(run);
}

function projectBoardRunCanRestartFromPreparedWorkspace(run: OrchestrationRun): boolean {
  return ["prepared", "failed", "canceled", "stalled", "retry_queued"].includes(run.status);
}

export function projectBoardMetadataObject(metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function projectBoardMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function projectBoardMetadataText(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectBoardRunWorkflowHash(run: OrchestrationRun): string | undefined {
  return projectBoardMetadataText(run.proofOfWork, "workflowHash");
}

function projectBoardShortHash(hash: string): string {
  return hash.length > 12 ? hash.slice(0, 12) : hash;
}

export function projectBoardLatestRunByTaskId(runs: OrchestrationRun[]): Map<string, OrchestrationRun> {
  const latest = new Map<string, OrchestrationRun>();
  for (const run of runs) {
    const current = latest.get(run.taskId);
    if (!current || compareProjectBoardRunsLatestFirst(run, current) < 0) latest.set(run.taskId, run);
  }
  return latest;
}

export function projectBoardWorkflowImpactPreview(
  board: ProjectBoardSummary,
  tasks: OrchestrationTask[] = [],
  runs: OrchestrationRun[] = [],
  workflowReadiness?: OrchestrationWorkflowReadiness,
): ProjectBoardWorkflowImpactPreview {
  const executableCards = board.cards.filter((card) => card.status !== "draft");
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const latestRunByTaskId = projectBoardLatestRunByTaskId(runs);
  const entries = executableCards.map((card) => {
    const task = card.orchestrationTaskId ? tasksById.get(card.orchestrationTaskId) : undefined;
    const latestRun = task ? latestRunByTaskId.get(task.id) : undefined;
    return { card, task, latestRun };
  }).filter(({ card, task }) => card.status !== "done" && task?.state !== "done");
  const dispatchRelevantEntries = entries.filter(({ card, task, latestRun }) => {
    if (card.status === "ready" || task?.state === "ready") return true;
    return Boolean(latestRun && projectBoardRunUsesPreparedWorkspace(latestRun));
  });
  if (dispatchRelevantEntries.length === 0) {
    return projectBoardHiddenWorkflowImpactPreview();
  }

  const currentHash = workflowReadiness?.status === "ready" ? workflowReadiness.workflowHash : undefined;
  const currentHashLabel = currentHash ? projectBoardShortHash(currentHash) : undefined;
  const readyWithoutRun = dispatchRelevantEntries.filter(({ card, task, latestRun }) => !latestRun && (card.status === "ready" || task?.state === "ready"));
  const preparedWithPreviousWorkflow = dispatchRelevantEntries.filter(({ latestRun }) => {
    if (!latestRun || !currentHash || !projectBoardRunUsesPreparedWorkspace(latestRun)) return false;
    const runHash = projectBoardRunWorkflowHash(latestRun);
    return Boolean(runHash && runHash !== currentHash);
  });
  const preparedWithUnknownWorkflow = dispatchRelevantEntries.filter(({ latestRun }) => {
    if (!latestRun || !currentHash || !projectBoardRunUsesPreparedWorkspace(latestRun)) return false;
    return !projectBoardRunWorkflowHash(latestRun);
  });
  const runningWithPreviousWorkflow = preparedWithPreviousWorkflow.filter(({ latestRun }) => latestRun && projectBoardRunIsActive(latestRun));
  const startableWithPreviousWorkflow = preparedWithPreviousWorkflow.filter(({ latestRun }) => latestRun && projectBoardRunCanRestartFromPreparedWorkspace(latestRun));
  const affectedPrevious = preparedWithPreviousWorkflow.filter(({ card }) => card.id).map(({ card }) => card.id);
  const affectedUnknown = preparedWithUnknownWorkflow.filter(({ card }) => card.id).map(({ card }) => card.id);
  const affectedRunIds = [...preparedWithPreviousWorkflow, ...preparedWithUnknownWorkflow]
    .map(({ latestRun }) => latestRun?.id)
    .filter((id): id is string => Boolean(id));

  const metrics: ProjectBoardWorkflowImpactMetric[] = [
    { label: "Ready next prep", value: readyWithoutRun.length, title: "Ready Local Tasks without a prepared run; the next preparation will use the current workflow." },
    { label: "Prepared old", value: startableWithPreviousWorkflow.length, title: "Prepared or retryable runs whose workspace preparation used a previous WORKFLOW.md hash." },
    { label: "Running old", value: runningWithPreviousWorkflow.length, title: "Active runs already started from a workspace prepared under a previous WORKFLOW.md hash." },
    { label: "Model calls", value: "0", title: "Workflow impact is computed from local workflow/run provenance; no Ambient/Pi call is needed." },
  ];

  if (workflowReadiness?.status === "missing" || workflowReadiness?.status === "invalid") {
    const missing = workflowReadiness.status === "missing";
    return {
      visible: true,
      state: "workflow_unavailable",
      tone: "danger",
      headline: missing ? "Workflow impact: preparation is blocked" : "Workflow impact: repair required",
      detail: missing
        ? `${dispatchRelevantEntries.length} ready or prepared Local Task${dispatchRelevantEntries.length === 1 ? "" : "s"} cannot use a current workflow until WORKFLOW.md exists. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} No card specs need a Pi refresh.`
        : `${dispatchRelevantEntries.length} ready or prepared Local Task${dispatchRelevantEntries.length === 1 ? "" : "s"} cannot safely prepare against the current workflow until validation passes. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} No card specs need a Pi refresh.`,
      workflowPath: workflowReadiness.path,
      affectedCardIds: dispatchRelevantEntries.map(({ card }) => card.id),
      affectedRunIds,
      modelCallRequired: false,
      metrics,
      repairPreview: missing ? undefined : projectBoardWorkflowRepairPreviewModel(workflowReadiness),
      actions: [
        ...(missing
          ? [
              {
                action: "create_default_workflow" as const,
                label: "Create default workflow",
                title: "Create the default WORKFLOW.md before preparing ready Local Tasks. Existing cards and PM proof are preserved.",
                tone: "primary" as const,
              },
            ]
          : [
              {
                action: "restore_generated_default" as const,
                label: "Restore default workflow",
                title: "Back up the invalid WORKFLOW.md and replace it with Ambient's generated default execution contract. Existing cards and PM proof are preserved.",
                tone: "primary" as const,
              },
              {
                action: "use_existing_anyway" as const,
                label: "Keep file for now",
                title: "Record that this invalid WORKFLOW.md was reviewed. Local Task preparation remains blocked until the workflow validates.",
                tone: "secondary" as const,
              },
            ]),
      ],
    };
  }

  if (preparedWithPreviousWorkflow.length > 0) {
    return {
      visible: true,
      state: "prepared_workflow_stale",
      tone: "warning",
      headline: "Workflow impact: prepared work uses an older workflow",
      detail:
        `${preparedWithPreviousWorkflow.length} prepared or active run${preparedWithPreviousWorkflow.length === 1 ? "" : "s"} were prepared under a previous WORKFLOW.md hash. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} This is dispatch-only impact.`,
      workflowPath: workflowReadiness?.path,
      workflowHash: currentHash,
      workflowHashLabel: currentHashLabel,
      affectedCardIds: affectedPrevious,
      affectedRunIds,
      modelCallRequired: false,
      metrics,
      actions: [
        {
          action: "continue_old_prep",
          label: "Continue old prep",
          title: "Start or let the existing prepared workspace continue. The next preparation will use the current workflow.",
          tone: "secondary",
        },
        {
          action: "prepare_again",
          label: "Prepare again",
          title: "Recommended when workflow hooks, workspace strategy, or proof policy changed. Cancel or clear the stale prepared run before preparing again; existing cards and PM proof are preserved.",
          tone: "primary",
        },
      ],
    };
  }

  if (preparedWithUnknownWorkflow.length > 0) {
    return {
      visible: true,
      state: "prepared_workflow_unknown",
      tone: "warning",
      headline: "Workflow impact: prepared run provenance is unknown",
      detail:
        `${preparedWithUnknownWorkflow.length} prepared or active run${preparedWithUnknownWorkflow.length === 1 ? "" : "s"} do not record which WORKFLOW.md hash prepared their workspace. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} Starting them is allowed, but future runs will record workflow provenance.`,
      workflowPath: workflowReadiness?.path,
      workflowHash: currentHash,
      workflowHashLabel: currentHashLabel,
      affectedCardIds: affectedUnknown,
      affectedRunIds,
      modelCallRequired: false,
      metrics,
      actions: [
        {
          action: "use_current_workflow_next",
          label: "Use current workflow next",
          title: "The next Local Task preparation will stamp the current workflow hash so future impact is exact.",
          tone: "secondary",
        },
      ],
    };
  }

  if (workflowReadiness?.status === "ready" && (readyWithoutRun.length > 0 || dispatchRelevantEntries.length > 0)) {
    return {
      visible: true,
      state: "current_workflow",
      tone: "ready",
      headline: "Workflow impact: dispatch-only, no card refresh",
      detail:
        readyWithoutRun.length > 0
          ? `${readyWithoutRun.length} ready Local Task${readyWithoutRun.length === 1 ? "" : "s"} will use the current WORKFLOW.md on the next preparation. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} No Ambient/Pi refresh is needed.`
          : `Prepared Local Tasks match the current WORKFLOW.md provenance. ${WORKFLOW_IMPACT_BOARD_STATE_NOTICE} No Ambient/Pi refresh is needed.`,
      workflowPath: workflowReadiness.path,
      workflowHash: currentHash,
      workflowHashLabel: currentHashLabel,
      settings: projectBoardWorkflowSettingsModel(workflowReadiness),
      rawEditor: projectBoardWorkflowRawEditorModel(workflowReadiness),
      affectedCardIds: readyWithoutRun.map(({ card }) => card.id),
      affectedRunIds: [],
      modelCallRequired: false,
      metrics,
      actions:
        readyWithoutRun.length > 0
          ? [
              {
                action: "prepare_next",
                label: "Prepare next",
                title: "Prepare the next eligible ready Local Task using the current WORKFLOW.md. Existing cards and PM proof are unchanged.",
                tone: "primary",
              },
            ]
          : [],
    };
  }

  return projectBoardHiddenWorkflowImpactPreview();
}

function projectBoardHiddenWorkflowImpactPreview(): ProjectBoardWorkflowImpactPreview {
  return {
    visible: false,
    state: "hidden",
    tone: "neutral",
    headline: "Workflow impact unavailable",
    detail: "",
    affectedCardIds: [],
    affectedRunIds: [],
    modelCallRequired: false,
    metrics: [],
    actions: [],
  };
}

function projectBoardWorkflowRepairPreviewModel(
  workflowReadiness: OrchestrationWorkflowReadiness,
): ProjectBoardWorkflowRepairPreviewModel | undefined {
  const preview = workflowReadiness.repairPreview;
  if (!preview) return undefined;
  return {
    validationMessage: workflowReadiness.message,
    workspaceStrategy: preview.workspaceStrategy,
    currentText: preview.currentText,
    proposedText: preview.proposedText,
    diff: preview.diff,
    currentLineCount: preview.currentLineCount,
    proposedLineCount: preview.proposedLineCount,
    currentTextTruncated: preview.currentTextTruncated === true,
    diffTruncated: preview.diffTruncated === true,
  };
}

function projectBoardWorkflowSettingsModel(workflowReadiness?: OrchestrationWorkflowReadiness): ProjectBoardWorkflowSettingsModel | undefined {
  if (workflowReadiness?.status !== "ready") return undefined;
  return {
    autoDispatch: workflowReadiness.autoDispatch ?? true,
    maxConcurrentAgents: workflowReadiness.maxConcurrentAgents ?? 1,
    maxTurns: workflowReadiness.maxTurns ?? 20,
    workspaceStrategy: workflowReadiness.workspaceStrategy ?? "git-worktree",
    requireTests: workflowReadiness.proofOfWork?.requireTests ?? false,
    requireDiffSummary: workflowReadiness.proofOfWork?.requireDiffSummary ?? true,
    requireScreenshots: workflowReadiness.proofOfWork?.requireScreenshots ?? false,
  };
}

function projectBoardWorkflowRawEditorModel(workflowReadiness?: OrchestrationWorkflowReadiness): ProjectBoardWorkflowRawEditorModel | undefined {
  if (workflowReadiness?.status !== "ready" || workflowReadiness.rawContent === undefined) return undefined;
  return {
    markdown: workflowReadiness.rawContent,
    lineCount: projectBoardLineCount(workflowReadiness.rawContent),
    truncated: workflowReadiness.rawContentTruncated === true,
    disabledReason: workflowReadiness.rawContentTruncated ? "This WORKFLOW.md is too large for safe in-app raw editing. Use the file directly or narrow it before saving from the UI." : undefined,
  };
}

function projectBoardLineCount(text: string): number {
  if (!text) return 0;
  return text.replace(/\n$/, "").split(/\r?\n/).length;
}

export function projectBoardBoardDecisionImpactRail(
  board: Pick<ProjectBoardSummary, "cards" | "events">,
): ProjectBoardBoardDecisionImpactRail {
  const executableCards = board.cards.filter(projectBoardCardCanCarryDecisionImpactFeedback);
  const cardsById = new Map(executableCards.map((card) => [card.id, card]));
  const rows = new Map<string, ProjectBoardBoardDecisionImpactCard>();

  for (const event of [...(board.events ?? [])].reverse()) {
    const impact = projectBoardDecisionImpactEvent(event);
    if (!impact || impact.affectedCardIds.length === 0) continue;
    const affectedCards = impact.affectedCardIds
      .map((cardId) => cardsById.get(cardId))
      .filter((card): card is ProjectBoardCard => Boolean(card));
    for (const card of affectedCards) {
      if (projectBoardCardHasDecisionImpactFeedbackForQuestion(card, impact.question)) continue;
      const key = projectBoardBoardDecisionImpactKey(card.id, impact.question);
      if (rows.has(key)) continue;
      rows.set(key, {
        cardId: card.id,
        title: card.title,
        status: card.status,
        state: "needs_feedback",
        tone: "warning",
        question: impact.question,
        createdAt: event.createdAt,
        sourceLabel: "Decision answered",
        actionLabel: "Add feedback",
        actionTitle: "Select this card and add additive next-run feedback before preparing or retrying the Local Task.",
      });
    }
  }

  for (const card of executableCards) {
    for (const feedback of (card.runFeedback ?? []).filter((item) => item.source === "decision_impact").slice(-3)) {
      const key = projectBoardBoardDecisionImpactKey(card.id, feedback.decisionQuestion ?? feedback.id);
      if (rows.has(key)) continue;
      rows.set(key, {
        cardId: card.id,
        title: card.title,
        status: card.status,
        state: "feedback_ready",
        tone: "ready",
        question: feedback.decisionQuestion,
        answer: feedback.decisionAnswer,
        feedback: feedback.feedback,
        createdAt: feedback.createdAt,
        sourceLabel: "Feedback ready",
        actionLabel: "Inspect feedback",
        actionTitle: "Select this card to inspect the decision-impact next-run feedback that will be included in the Local Task prompt.",
      });
    }
  }

  const cards = [...rows.values()].sort((left, right) => {
    if (left.state !== right.state) return left.state === "needs_feedback" ? -1 : 1;
    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  });
  const needsFeedbackCount = cards.filter((card) => card.state === "needs_feedback").length;
  const feedbackReadyCount = cards.filter((card) => card.state === "feedback_ready").length;
  const affectedCardIds = [...new Set(cards.map((card) => card.cardId))];
  const visible = cards.length > 0;
  const tone: ProjectBoardExecutionReadinessTone = needsFeedbackCount > 0 ? "warning" : feedbackReadyCount > 0 ? "ready" : "neutral";
  return {
    visible,
    tone,
    headline: visible
      ? needsFeedbackCount > 0
        ? `${needsFeedbackCount} ticketized card${needsFeedbackCount === 1 ? "" : "s"} need decision feedback`
        : `${feedbackReadyCount} ticketized card${feedbackReadyCount === 1 ? "" : "s"} carry decision feedback`
      : "No ticketized decision impact",
    detail: visible
      ? "Decision answers never rewrite approved Local Task cards silently. Use additive next-run feedback for ticketized cards; draft cards still refresh in Draft Inbox. 0 model calls."
      : "No ready, blocked, or review Local Task currently needs decision-impact feedback.",
    needsFeedbackCount,
    feedbackReadyCount,
    affectedCardIds,
    modelCallRequired: false,
    metrics: [
      { label: "Needs feedback", value: needsFeedbackCount, title: "Ticketized cards affected by a decision answer but not yet carrying next-run feedback." },
      { label: "Feedback ready", value: feedbackReadyCount, title: "Ticketized cards already carrying decision-impact next-run feedback." },
      { label: "Affected cards", value: affectedCardIds.length, title: "Unique ticketized cards represented in this rail." },
      { label: "Model calls", value: "0", title: "Board-side decision impact is computed from card feedback and the event ledger." },
    ],
    cards,
  };
}

function projectBoardCardCanCarryDecisionImpactFeedback(card: ProjectBoardCard): boolean {
  return Boolean(card.orchestrationTaskId) && card.status !== "draft" && card.status !== "in_progress" && card.status !== "done" && card.status !== "archived";
}

function projectBoardBoardDecisionImpactKey(cardId: string, question?: string): string {
  return `${cardId}:${question?.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180) || "decision-impact"}`;
}

function projectBoardCardHasDecisionImpactFeedbackForQuestion(card: ProjectBoardCard, question?: string): boolean {
  const feedback = (card.runFeedback ?? []).filter((item) => item.source === "decision_impact");
  if (feedback.length === 0) return false;
  const normalizedQuestion = question?.trim();
  if (!normalizedQuestion) return true;
  return feedback.some((item) => item.decisionQuestion && projectBoardQuestionsAreNearDuplicates(item.decisionQuestion, normalizedQuestion));
}

function projectBoardDecisionImpactEvent(event: ProjectBoardEvent): { question?: string; affectedCardIds: string[] } | undefined {
  const metadata = projectBoardRecord(event.metadata);
  const decisionImpact = projectBoardRecord(metadata?.decisionImpact);
  if (!decisionImpact) return undefined;
  const affectedCardIds = projectBoardStringArray(decisionImpact.affectedCardIds);
  const affectedCounts = projectBoardRecord(decisionImpact.affectedCounts);
  const readyFeedbackCount = typeof affectedCounts?.readyFeedback === "number" ? affectedCounts.readyFeedback : 0;
  const appliedAction = typeof decisionImpact.appliedAction === "string" ? decisionImpact.appliedAction : undefined;
  const skippedCardIds = projectBoardStringArray(decisionImpact.skippedCardIds);
  const candidateIds = skippedCardIds.length > 0 ? skippedCardIds : affectedCardIds;
  if (readyFeedbackCount <= 0 && appliedAction !== "create_next_run_feedback") return undefined;
  return {
    question: typeof decisionImpact.question === "string" ? decisionImpact.question : undefined,
    affectedCardIds: candidateIds,
  };
}
function projectBoardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function projectBoardStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}
