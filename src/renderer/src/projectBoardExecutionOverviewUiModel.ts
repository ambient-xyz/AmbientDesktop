import type { ProjectBoardCard, ProjectBoardGitSyncStatus, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask, OrchestrationWorkflowReadiness } from "../../shared/workflowTypes";
import { projectBoardRunBlocksPlanning } from "../../shared/projectBoardSynthesisGate";
import { projectBoardCanonicalCardProjection } from "./projectBoardActiveCardUiModel";
import {
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCollaborationExecutionNotice,
} from "./projectBoardCollaborationUiModel";
import { projectBoardDecisionQueue } from "./projectBoardDecisionQueueUiModel";
import {
  projectBoardCardIsDraftInboxCandidate,
  projectBoardDraftCandidatesAvailable,
  projectBoardReadyTicketizationCards,
} from "./projectBoardDraftInboxUiModel";
import { projectBoardLatestRunByTaskId } from "./projectBoardExecutionUiModel";
import type { ProjectBoardExecutionReadinessTone } from "./projectBoardExecutionUiModel";
import { projectBoardDeliverableIntegrationQueue } from "./projectBoardIntegrationUiModel";
import {
  projectBoardReadableState,
  projectBoardRunIsActive,
  projectBoardRunNeedsIntervention,
} from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardExecutionOverviewState =
  | "draft"
  | "planning_running"
  | "decisions_blocked"
  | "source_synthesis_needed"
  | "create_tasks"
  | "prepare_run"
  | "workflow_blocked"
  | "auto_dispatch_disabled"
  | "collaboration_blocked"
  | "start_run"
  | "running"
  | "review"
  | "blocked"
  | "integration_pending"
  | "complete"
  | "empty";

export type ProjectBoardExecutionOverviewAction =
  | "open_charter"
  | "open_decisions"
  | "open_source_picker"
  | "open_draft_inbox"
  | "open_board"
  | "open_integration"
  | "prepare_run"
  | "start_run"
  | "inspect_card";

export interface ProjectBoardExecutionOverviewMetric {
  label: string;
  value: number;
}

export interface ProjectBoardExecutionOverviewActionModel {
  action: ProjectBoardExecutionOverviewAction;
  label: string;
  title: string;
  disabled: boolean;
  busyKey?: string;
  busyLabel?: string;
  cardId?: string;
  runId?: string;
}

export interface ProjectBoardExecutionOverview {
  state: ProjectBoardExecutionOverviewState;
  headline: string;
  detail: string;
  metrics: ProjectBoardExecutionOverviewMetric[];
  blockerKind?: ProjectBoardExecutionReadinessBlockerKind;
  action?: ProjectBoardExecutionOverviewActionModel;
}

export type ProjectBoardExecutionReadinessBlockerKind =
  | "draft_board"
  | "planning_running"
  | "decision_blocked"
  | "needs_source_synthesis"
  | "needs_ticketization"
  | "missing_workflow"
  | "invalid_workflow"
  | "auto_dispatch_disabled"
  | "git_unavailable"
  | "git_unborn"
  | "local_only"
  | "git_no_remote"
  | "projection_invalid"
  | "projection_drift"
  | "remote_updates"
  | "unpublished_board_changes"
  | "claim_conflict"
  | "ready_not_prepared"
  | "start_prepared_run"
  | "active_run"
  | "proof_review"
  | "blocked_run"
  | "integration_pending"
  | "none";

export interface ProjectBoardExecutionReadinessNotice {
  tone: ProjectBoardExecutionReadinessTone;
  blockerKind: ProjectBoardExecutionReadinessBlockerKind;
  headline: string;
  detail: string;
  actionHint: string;
}

export interface ProjectBoardExecutionReadinessRail {
  visible: boolean;
  tone: ProjectBoardExecutionReadinessTone;
  blockerKind: ProjectBoardExecutionReadinessBlockerKind;
  headline: string;
  detail: string;
  doneSummary: string;
  pendingSummary: string;
  nextActionSummary: string;
  metrics: ProjectBoardExecutionOverviewMetric[];
  action?: ProjectBoardExecutionOverviewActionModel;
  secondary?: ProjectBoardExecutionReadinessNotice;
}

function projectBoardWorkflowExecutionError(error?: string): { kind: "missing_workflow" | "invalid_workflow"; message: string } | undefined {
  if (!error) return undefined;
  const normalized = error.toLowerCase();
  if (!normalized.includes("workflow")) return undefined;
  const kind =
    normalized.includes("missing_workflow_file") ||
    normalized.includes("workflow file not found") ||
    normalized.includes("not found") ||
    normalized.includes("missing workflow")
      ? "missing_workflow"
      : "invalid_workflow";
  const message = error.length > 220 ? `${error.slice(0, 217)}...` : error;
  return { kind, message };
}

function projectBoardWorkflowReadinessBlocker(
  workflowReadiness?: OrchestrationWorkflowReadiness,
  orchestrationError?: string,
): { kind: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled"; message: string } | undefined {
  if (workflowReadiness?.status === "missing") {
    return {
      kind: "missing_workflow",
      message: workflowReadiness.message ?? `Workflow file not found: ${workflowReadiness.path}`,
    };
  }
  if (workflowReadiness?.status === "invalid") {
    return {
      kind: "invalid_workflow",
      message: workflowReadiness.message ?? `Workflow file is invalid: ${workflowReadiness.path}`,
    };
  }
  if (workflowReadiness?.status === "ready" && workflowReadiness.autoDispatch === false) {
    return {
      kind: "auto_dispatch_disabled",
      message: `${workflowReadiness.path} has orchestration.auto_dispatch set to false.`,
    };
  }
  return projectBoardWorkflowExecutionError(orchestrationError);
}

function projectBoardExecutionReadinessTone(state: ProjectBoardExecutionOverviewState): ProjectBoardExecutionReadinessTone {
  if (state === "start_run" || state === "running") return "ready";
  if (state === "blocked" || state === "workflow_blocked" || state === "collaboration_blocked") return "danger";
  if (state === "complete") return "neutral";
  return "warning";
}

function projectBoardExecutionReadinessBlockerKind(overview: ProjectBoardExecutionOverview): ProjectBoardExecutionReadinessBlockerKind {
  if (overview.blockerKind) return overview.blockerKind;
  if (overview.state === "draft") return "draft_board";
  if (overview.state === "planning_running") return "planning_running";
  if (overview.state === "decisions_blocked") return "decision_blocked";
  if (overview.state === "source_synthesis_needed") return "needs_source_synthesis";
  if (overview.state === "create_tasks" || overview.state === "empty") return "needs_ticketization";
  if (overview.state === "workflow_blocked") {
    if (overview.headline.startsWith("Create WORKFLOW.md")) return "missing_workflow";
    if (overview.headline.startsWith("Commit project")) return "git_unborn";
    return "invalid_workflow";
  }
  if (overview.state === "auto_dispatch_disabled") return "auto_dispatch_disabled";
  if (overview.state === "collaboration_blocked") return "projection_invalid";
  if (overview.state === "prepare_run") return "ready_not_prepared";
  if (overview.state === "start_run") return "start_prepared_run";
  if (overview.state === "running") return "active_run";
  if (overview.state === "review") return "proof_review";
  if (overview.state === "blocked") return overview.headline.includes("ownership") ? "claim_conflict" : "blocked_run";
  if (overview.state === "integration_pending") return "integration_pending";
  return "none";
}

export function projectBoardExecutionOverview(
  board: ProjectBoardSummary,
  tasks: OrchestrationTask[] = [],
  runs: OrchestrationRun[] = [],
  options: {
    runBusy?: string;
    orchestrationError?: string;
    workflowReadiness?: OrchestrationWorkflowReadiness;
    gitStatus?: ProjectBoardGitSyncStatus;
    gitError?: string;
  } = {},
): ProjectBoardExecutionOverview {
  const executableCards = board.cards.filter((card) => card.status !== "draft" || projectBoardCanonicalCardProjection(card).visualStatus === "done");
  const readyDraftCount = projectBoardReadyTicketizationCards(board).length;
  const draftCandidateCount = projectBoardDraftCandidatesAvailable(board)
    ? board.cards.filter((card) => projectBoardIsDraftCandidate(card) && !card.orchestrationTaskId).length
    : 0;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const latestRunByTaskId = projectBoardLatestRunByTaskId(runs);
  const cardEntries = executableCards.map((card) => {
    const task = card.orchestrationTaskId ? tasksById.get(card.orchestrationTaskId) : undefined;
    const latestRun = task ? latestRunByTaskId.get(task.id) : undefined;
    return { card, task, latestRun, projection: projectBoardCanonicalCardProjection(card, { task, latestRun }) };
  });
  const readyCards = cardEntries.filter(({ projection }) => projection.visualStatus === "ready").map(({ card }) => card);
  const runningCards = cardEntries.filter(({ projection }) => projection.visualStatus === "in_progress").map(({ card }) => card);
  const reviewCards = cardEntries.filter(({ projection }) => projection.visualStatus === "review").map(({ card }) => card);
  const blockedCards = cardEntries.filter(({ projection }) => projection.visualStatus === "blocked").map(({ card }) => card);
  const doneCards = cardEntries.filter(({ projection }) => projection.visualStatus === "done").map(({ card }) => card);
  const claimBlockedReadyCount = readyCards.filter(projectBoardCardClaimBlocksLocalTicketization).length;
  const openCardEntries = cardEntries.filter(({ projection }) => !projection.terminalDone);
  const startable = openCardEntries.find(({ latestRun, projection }) => !projection.suppressRetryActions && latestRun && ["prepared", "failed", "canceled", "stalled"].includes(latestRun.status));
  const active = openCardEntries.find(({ latestRun, task, card }) => {
    if (latestRun && latestRun.status !== "prepared" && projectBoardRunIsActive(latestRun)) return true;
    return task?.state === "in_progress" || card.status === "in_progress";
  });
  const review = openCardEntries.find(({ task, card, latestRun }) => card.status === "review" || task?.state === "needs_review" || latestRun?.status === "completed");
  const blocked = openCardEntries.find(({ task, card, latestRun, projection }) => {
    if (projection.visualStatus === "blocked") return true;
    if (!projection.suppressStaleRunState && latestRun && projectBoardRunNeedsIntervention(latestRun)) return true;
    return ["needs_info", "budget_exhausted", "terminal_blocker"].includes(task?.state ?? "");
  });
  const metrics: ProjectBoardExecutionOverviewMetric[] = [
    { label: "Ready", value: readyCards.length },
    { label: "Prepared", value: cardEntries.filter(({ latestRun }) => latestRun?.status === "prepared").length },
    { label: "Running", value: runningCards.length },
    { label: "Review", value: reviewCards.length },
    { label: "Blocked", value: blockedCards.length },
    { label: "Done", value: doneCards.length },
  ];
  const integrationQueue = projectBoardDeliverableIntegrationQueue(board, { tasks, runs });
  const activePlanningRun = board.synthesisRuns?.find(projectBoardRunBlocksPlanning);
  const decisionQueue = projectBoardDecisionQueue(board);

  if (board.status === "draft") {
    return {
      state: "draft",
      headline: "Finish the charter before execution starts",
      detail: "Answer the kickoff questions and activate the project charter before reviewing or ticketizing candidate cards.",
      metrics,
      action: {
        action: "open_charter",
        label: "Answer Kickoff Questions",
        title: "Open the Charter tab and answer the kickoff questions before candidate-card review.",
        disabled: false,
      },
    };
  }

  const decisionBlockedOverview = (): ProjectBoardExecutionOverview => ({
    state: "decisions_blocked",
    blockerKind: "decision_blocked",
    headline: `Answer ${decisionQueue.actionCount} PM decision${decisionQueue.actionCount === 1 ? "" : "s"}`,
    detail:
      draftCandidateCount > 0
        ? `${decisionQueue.summary}. ${draftCandidateCount} Draft Inbox candidate${draftCandidateCount === 1 ? "" : "s"} should wait until these decisions are answered.`
        : decisionQueue.detail,
    metrics: [
      { label: "Decisions", value: decisionQueue.actionCount },
      ...(draftCandidateCount > 0 ? [{ label: "Draft candidates", value: draftCandidateCount }] : []),
      ...(readyDraftCount > 0 ? [{ label: "Draft ready", value: readyDraftCount }] : []),
      ...metrics,
    ],
    action: {
      action: "open_decisions",
      label: "Answer Decisions",
      title: "Open the Decisions tab and answer PM decisions before reviewing or ticketizing Draft Inbox candidates.",
      disabled: false,
    },
  });

  if (executableCards.length === 0 && activePlanningRun) {
    return {
      state: "planning_running",
      blockerKind: "planning_running",
      headline: activePlanningRun.status === "pause_requested" ? "Planning is pausing" : "Planning is still running",
      detail:
        readyDraftCount > 0
          ? `${readyDraftCount} ready Draft Inbox candidate${readyDraftCount === 1 ? " is" : "s are"} visible, but the active planning run can still add, replace, or protect draft cards. Wait for planning to pause or finish before reviewing Draft Inbox.`
          : "Ambient/Pi planning can still add, replace, or protect draft cards. Wait for planning to pause or finish before reviewing Draft Inbox.",
      metrics: [
        { label: "Planning", value: 1 },
        ...(readyDraftCount > 0 ? [{ label: "Draft ready", value: readyDraftCount }] : []),
        ...(integrationQueue.pendingCount > 0 ? [{ label: "Pending integration", value: integrationQueue.pendingCount }] : []),
        ...metrics,
      ],
    };
  }

  if (executableCards.length === 0 && decisionQueue.actionCount > 0) {
    return decisionBlockedOverview();
  }

  if (executableCards.length === 0 && projectBoardNeedsSourceSynthesisBeforeTicketization(board)) {
    return {
      state: "source_synthesis_needed",
      blockerKind: "needs_source_synthesis",
      headline: "Run source planning before ticketization",
      detail:
        "This board only has a durable-plan seed card. Ask Ambient/Pi to create source-backed candidate cards before turning the plan into Local Tasks.",
      metrics: [
        { label: "Plan seed", value: readyDraftCount || draftCandidateCount },
        { label: "Synthesized cards", value: 0 },
        ...metrics,
      ],
      action: {
        action: "open_source_picker",
        label: "Add Cards From Sources",
        title: "Open Draft Inbox source planning and ask Ambient/Pi to create candidate cards from the durable plan source.",
        disabled: false,
      },
    };
  }

  if (executableCards.length === 0) {
    if (readyDraftCount > 0) {
      return {
        state: "create_tasks",
        headline: `Create ${readyDraftCount} ready Local Task${readyDraftCount === 1 ? "" : "s"}`,
        detail: "Ready candidates are waiting in Draft Inbox. Create Local Tasks there, then prepared and running work will appear on this board.",
        metrics: [{ label: "Draft ready", value: readyDraftCount }, ...metrics],
        action: {
          action: "open_draft_inbox",
          label: "Open Draft Inbox",
          title: "Open Draft Inbox and use Create Ready Tasks to ticketize approved candidates.",
          disabled: false,
        },
      };
    }
    return {
      state: "empty",
      headline: "No executable cards yet",
      detail: "Approve candidates in Draft Inbox, then create ready Local Tasks before execution can begin here.",
      metrics,
      action: {
        action: "open_draft_inbox",
        label: "Open Draft Inbox",
        title: "Open Draft Inbox to approve candidates and create executable Local Tasks.",
        disabled: false,
      },
    };
  }

  if (startable?.latestRun) {
    const busyKey = `start:${startable.latestRun.id}`;
    const preparedDetail =
      startable.latestRun.status === "prepared"
        ? `${startable.card.title} is prepared and queued: auto-dispatch starts it on the next poll when an agent slot is free${
            runningCards.length > 0 ? ` (${runningCards.length} run${runningCards.length === 1 ? "" : "s"} currently occupying slots)` : ""
          }. Start Run launches it immediately.`
        : `${startable.card.title} has attempt ${startable.latestRun.attemptNumber + 1} in ${projectBoardReadableState(startable.latestRun.status)} state.`;
    return {
      state: "start_run",
      headline: startable.latestRun.status === "prepared" ? "Prepared run is queued" : "Retry a stopped run",
      detail: preparedDetail,
      metrics,
      action: {
        action: "start_run",
        label: startable.latestRun.status === "prepared" ? "Start Run" : "Retry Run",
        busyLabel: "Starting",
        title: startable.latestRun.status === "prepared" ? "Start this prepared Local Task run." : "Retry this stopped Local Task run after inspecting its latest state.",
        disabled: options.runBusy === busyKey,
        busyKey,
        cardId: startable.card.id,
        runId: startable.latestRun.id,
      },
    };
  }

  if (active) {
    return {
      state: "running",
      headline: "Worker progress is active",
      detail: `${active.card.title} is already underway. Select it to inspect run progress, proof, blockers, and handoff state.`,
      metrics,
      action: {
        action: "inspect_card",
        label: "Inspect Running Card",
        title: "Open the running card inspector.",
        disabled: false,
        cardId: active.card.id,
      },
    };
  }

  if (review) {
    return {
      state: "review",
      headline: "Proof is waiting for review",
      detail: `${review.card.title} needs PM review before the board can close or retry the work.`,
      metrics,
      action: {
        action: "inspect_card",
        label: "Review Proof",
        title: "Open the card inspector and review the proof packet.",
        disabled: false,
        cardId: review.card.id,
      },
    };
  }

  const workflowBlocker = projectBoardWorkflowReadinessBlocker(options.workflowReadiness, options.orchestrationError);
  if (readyCards.length > 0 && workflowBlocker) {
    if (workflowBlocker.kind === "auto_dispatch_disabled") {
      const busyKey = "prepare:next";
      const draftInboxNote =
        draftCandidateCount > 0
          ? ` Draft Inbox also has ${draftCandidateCount} candidate${draftCandidateCount === 1 ? "" : "s"}, but candidate cards are separate until approved and created as Local Tasks.`
          : "";
      return {
        state: "auto_dispatch_disabled",
        headline: "Auto-dispatch is off; prepare manually",
        detail: `${readyCards.length} Board Local Task${readyCards.length === 1 ? " is" : "s are"} already Ready. Auto-dispatch is off, so it will not prepare or start by itself. Click Prepare Next Run to prepare it now, or enable Auto-dispatch from the Board workflow settings for future ready work.${draftInboxNote} ${workflowBlocker.message}`,
        metrics,
        action: {
          action: "prepare_run",
          label: "Prepare Next Run",
          busyLabel: "Preparing",
          title: "Prepare the ready Board Local Task now. To make this automatic later, enable Auto-dispatch from the Board workflow settings.",
          disabled: options.runBusy === busyKey,
          busyKey,
          cardId: readyCards[0]?.id,
        },
      };
    }
    const missing = workflowBlocker.kind === "missing_workflow";
    const busyKey = "prepare:next";
    return {
      state: "workflow_blocked",
      headline: missing ? "Create WORKFLOW.md before ready work can run" : "Repair WORKFLOW.md before ready work can run",
      detail: missing
        ? `${readyCards.length} ready Local Task${readyCards.length === 1 ? "" : "s"} cannot be prepared until the project has a valid workflow contract. The app can create a conservative default and prepare the next eligible run. ${workflowBlocker.message}`
        : `${readyCards.length} ready Local Task${readyCards.length === 1 ? "" : "s"} cannot be prepared because the workflow contract is invalid. ${workflowBlocker.message}`,
      metrics,
      action: missing
        ? {
            action: "prepare_run",
            label: "Create Workflow + Prepare",
            busyLabel: "Creating",
            title: "Create the default WORKFLOW.md and prepare the next eligible ready Local Task run.",
            disabled: options.runBusy === busyKey,
            busyKey,
            cardId: readyCards[0]?.id,
          }
        : {
            action: "open_board",
            label: "Review Workflow Blocker",
            title: "Open the Board tab and review the workflow blocker before preparing another Local Task run.",
            disabled: false,
          },
    };
  }

  if (
    readyCards.length > 0 &&
    options.workflowReadiness?.status === "ready" &&
    options.workflowReadiness.workspaceStrategy === "git-worktree" &&
    options.gitStatus?.isGitRepository &&
    options.gitStatus.hasCommit === false
  ) {
    return {
      state: "workflow_blocked",
      blockerKind: "git_unborn",
      headline: "Commit project before preparing worktrees",
      detail:
        "WORKFLOW.md is configured to prepare Local Task runs in git worktrees, but this project repository has no commits yet. Commit the initial project state or change WORKFLOW.md workspace.strategy to directory before preparing a run.",
      metrics,
      action: {
        action: "open_board",
        label: "Review Git Setup",
        title: "Open the Board tab and review workflow workspace settings before preparing a Local Task run.",
        disabled: false,
      },
    };
  }

  const collaborationNotice = projectBoardCollaborationExecutionNotice(options.gitStatus, options.gitError);
  const collaborationShouldBlock =
    collaborationNotice &&
    collaborationNotice.tone === "danger" &&
    (executableCards.length > 0 || readyDraftCount > 0) &&
    (collaborationNotice.blockerKind === "git_unavailable" ||
      collaborationNotice.blockerKind === "projection_invalid" ||
      collaborationNotice.blockerKind === "claim_conflict");
  if (collaborationShouldBlock) {
    return {
      state: "collaboration_blocked",
      blockerKind: collaborationNotice.blockerKind,
      headline: collaborationNotice.headline,
      detail: `${collaborationNotice.detail} ${collaborationNotice.actionHint}`,
      metrics,
      action: {
        action: "open_board",
        label: "Review Git Blocker",
        title: "Review the board Git, projection, and claim state before dispatching more work.",
        disabled: false,
      },
    };
  }

  if (readyCards.length > 0) {
    if (claimBlockedReadyCount > 0) {
      const blockedCard = readyCards.find(projectBoardCardClaimBlocksLocalTicketization);
      return {
        state: "blocked",
        headline: "Resolve ownership before preparing runs",
        detail: `${claimBlockedReadyCount} ready card${claimBlockedReadyCount === 1 ? " is" : "s are"} claimed elsewhere or in conflict. Resolve claims before dispatch.`,
        metrics,
        action: blockedCard
          ? {
              action: "inspect_card",
              label: "Inspect Claim",
              title: "Open the claimed card inspector to resolve ownership.",
              disabled: false,
              cardId: blockedCard.id,
            }
          : undefined,
      };
    }
    const busyKey = "prepare:next";
    return {
      state: "prepare_run",
      headline: `Prepare ${readyCards.length} ready Local Task${readyCards.length === 1 ? "" : "s"}`,
      detail: "Preparing a run creates the executable workspace and unlocks the Start action for the next eligible card.",
      metrics,
      action: {
        action: "prepare_run",
        label: "Prepare Next Run",
        busyLabel: "Preparing",
        title: "Prepare the next eligible ready Local Task run.",
        disabled: options.runBusy === busyKey,
        busyKey,
        cardId: readyCards[0]?.id,
      },
    };
  }

  if (blocked) {
    return {
      state: "blocked",
      headline: "Execution is blocked",
      detail: `${blocked.card.title} needs blocker, timeout, or terminal-state triage before the board can continue.`,
      metrics,
      action: {
        action: "inspect_card",
        label: "Inspect Blocker",
        title: "Open the blocked card inspector.",
        disabled: false,
        cardId: blocked.card.id,
      },
    };
  }

  if (decisionQueue.actionCount > 0 && draftCandidateCount > 0 && !activePlanningRun) {
    return decisionBlockedOverview();
  }

  if (readyDraftCount > 0 && activePlanningRun) {
    return {
      state: "planning_running",
      blockerKind: "planning_running",
      headline: activePlanningRun.status === "pause_requested" ? "Planning is pausing" : "Planning is still running",
      detail: `${readyDraftCount} ready Draft Inbox candidate${readyDraftCount === 1 ? " is" : "s are"} visible, but the active planning run can still add, replace, or protect draft cards. Wait for planning to pause or finish before reviewing Draft Inbox.`,
      metrics: [
        { label: "Planning", value: 1 },
        { label: "Draft ready", value: readyDraftCount },
        ...(integrationQueue.pendingCount > 0 ? [{ label: "Pending integration", value: integrationQueue.pendingCount }] : []),
        ...metrics,
      ],
    };
  }

  if (readyDraftCount > 0) {
    return {
      state: "create_tasks",
      headline: `Create ${readyDraftCount} ready Local Task${readyDraftCount === 1 ? "" : "s"}`,
      detail:
        integrationQueue.pendingCount > 0
          ? `Ready candidates are waiting in Draft Inbox. Create Local Tasks there to continue project work; ${integrationQueue.pendingCount} completed deliverable integration item${integrationQueue.pendingCount === 1 ? "" : "s"} can still be handled from Integration.`
          : "Ready candidates are waiting in Draft Inbox. Create Local Tasks there, then prepared and running work will appear on this board.",
      metrics: [
        { label: "Draft ready", value: readyDraftCount },
        ...(integrationQueue.pendingCount > 0 ? [{ label: "Pending integration", value: integrationQueue.pendingCount }] : []),
        ...metrics,
      ],
      action: {
        action: "open_draft_inbox",
        label: "Open Draft Inbox",
        title: "Open Draft Inbox and use Create Ready Tasks to ticketize approved candidates.",
        disabled: false,
      },
    };
  }

  if (doneCards.length > 0 && integrationQueue.pendingCount > 0) {
    return {
      state: "integration_pending",
      headline: "Executable board closed; integration pending",
      detail: integrationQueue.detail,
      metrics: [{ label: "Pending integration", value: integrationQueue.pendingCount }, ...metrics],
      action: {
        action: "open_integration",
        label: "Open Integration",
        title: "Open the Integration tab to apply, export, or defer completed Local Task deliverables.",
        disabled: false,
      },
    };
  }

  return {
    state: "complete",
    headline:
      doneCards.length > 0 && integrationQueue.items.length > 0
        ? "Executable board closed; deliverables integrated"
        : doneCards.length > 0
          ? "Executable board is closed"
          : "No immediate execution action",
    detail:
      doneCards.length > 0 && integrationQueue.items.length > 0
        ? `All completed run deliverables have explicit integration outcomes: ${integrationQueue.integratedCount} integrated, ${integrationQueue.exportedCount} exported, and ${integrationQueue.deferredCount} deferred.`
        : doneCards.length > 0
          ? "All current executable cards are done. Add or approve more cards when the project needs another work slice."
          : "No ready, running, review, or blocked card currently needs action.",
    metrics,
  };
}

export function projectBoardExecutionReadinessRail(
  board: ProjectBoardSummary,
  tasks: OrchestrationTask[] = [],
  runs: OrchestrationRun[] = [],
  options: {
    runBusy?: string;
    orchestrationError?: string;
    workflowReadiness?: OrchestrationWorkflowReadiness;
    gitStatus?: ProjectBoardGitSyncStatus;
    gitError?: string;
  } = {},
): ProjectBoardExecutionReadinessRail {
  const overview = projectBoardExecutionOverview(board, tasks, runs, options);
  const collaborationNotice = projectBoardCollaborationExecutionNotice(options.gitStatus, options.gitError);
  if (overview.state === "complete" && collaborationNotice) {
    const action = {
      action: "open_board",
      label: "Review Git Sync",
      title: "Review the board Git, projection, and claim state.",
      disabled: false,
    } satisfies ProjectBoardExecutionOverviewActionModel;
    const summaries = projectBoardExecutionReadinessRailSummaries(overview, action);
    return {
      visible: true,
      tone: collaborationNotice.tone,
      blockerKind: collaborationNotice.blockerKind,
      headline: collaborationNotice.headline,
      detail: `${collaborationNotice.detail} ${collaborationNotice.actionHint}`,
      ...summaries,
      metrics: overview.metrics,
      action,
    };
  }
  const detail =
    overview.state === "prepare_run"
      ? "Ready Local Tasks exist, but no executable run has been prepared yet. Prepare the next eligible run before auto-dispatch can start work."
      : overview.detail;
  const secondary =
    collaborationNotice && overview.blockerKind !== collaborationNotice.blockerKind && overview.state !== "collaboration_blocked"
      ? collaborationNotice
      : undefined;
  return {
    visible: overview.state !== "complete" || Boolean(secondary),
    tone: projectBoardExecutionReadinessTone(overview.state),
    blockerKind: projectBoardExecutionReadinessBlockerKind(overview),
    headline: overview.headline,
    detail,
    ...projectBoardExecutionReadinessRailSummaries(overview, overview.action),
    metrics: overview.metrics,
    action: overview.action,
    secondary,
  };
}

function projectBoardExecutionReadinessRailSummaries(
  overview: ProjectBoardExecutionOverview,
  action?: ProjectBoardExecutionOverviewActionModel,
): Pick<ProjectBoardExecutionReadinessRail, "doneSummary" | "pendingSummary" | "nextActionSummary"> {
  const doneCount = overview.metrics.find((metric) => metric.label === "Done")?.value ?? 0;
  const pendingMetrics = overview.metrics.filter((metric) => metric.label !== "Done" && metric.value > 0);
  return {
    doneSummary: doneCount > 0 ? `${doneCount} done` : "No completed work yet",
    pendingSummary:
      pendingMetrics.length > 0
        ? pendingMetrics.map((metric) => `${metric.value} ${projectBoardExecutionMetricSummaryLabel(metric)}`).join(", ")
        : overview.state === "complete"
          ? "No pending execution work"
          : overview.headline,
    nextActionSummary: action
      ? `Click ${action.label}`
      : overview.state === "planning_running"
        ? "Wait for planning to finish"
        : overview.state === "complete"
          ? "No click needed"
          : "Inspect the board",
  };
}

function projectBoardExecutionMetricSummaryLabel(metric: ProjectBoardExecutionOverviewMetric): string {
  const label = metric.label.toLowerCase();
  if (metric.value === 1 && label.endsWith("s")) return label.slice(0, -1);
  return label;
}

function projectBoardNeedsSourceSynthesisBeforeTicketization(board: ProjectBoardSummary): boolean {
  const draftCandidates = board.cards.filter((card) => projectBoardIsDraftCandidate(card) && !card.orchestrationTaskId);
  if (draftCandidates.length === 0) return false;
  if (!draftCandidates.every((card) => card.sourceKind === "planner_plan")) return false;
  return !board.cards.some((card) => card.sourceKind === "board_synthesis" && card.candidateStatus !== "evidence" && card.candidateStatus !== "duplicate" && card.candidateStatus !== "rejected");
}

function projectBoardIsDraftCandidate(card: ProjectBoardCard): boolean {
  return projectBoardCardIsDraftInboxCandidate(card);
}
