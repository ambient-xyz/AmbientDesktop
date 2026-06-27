import type { ProjectBoardCard, ProjectBoardPlanningSnapshot, ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import { projectBoardRunBlocksPlanning, projectBoardRunCanProvidePlanningSnapshot } from "../../shared/projectBoardSynthesisGate";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCanonicalCardProjection,
  projectBoardTestSummaryForBoard,
} from "./projectBoardActiveCardUiModel";
import type { ProjectBoardPhaseGroup, ProjectBoardVisualTone } from "./projectBoardActiveCardUiModel";
import { projectBoardCardCanMarkReady } from "./projectBoardCardEditUiModel";
import { projectBoardCardClaimBlocksLocalTicketization } from "./projectBoardCollaborationUiModel";
import { projectBoardDecisionQueue } from "./projectBoardDecisionQueueUiModel";
import { projectBoardDependencyHealth, projectBoardDisplayOrderedCards, sortProjectBoardCards } from "./projectBoardDependencyUiModel";
import {
  projectBoardCardIsDraftInboxCandidate,
  projectBoardDraftCandidatesAvailable,
  projectBoardDraftInboxCardIsTerminalSkipped,
  projectBoardReadyTicketizationCards,
  projectBoardStrictProofScopeBlockedReadyCards,
} from "./projectBoardDraftInboxUiModel";
import { projectBoardLatestRunByTaskId } from "./projectBoardExecutionUiModel";
import { projectBoardDeliverableIntegrationQueue } from "./projectBoardIntegrationUiModel";
import { projectBoardOverviewBadgeCount } from "./projectBoardOverviewUiModel";
import { projectBoardPlanningWarningsForCard } from "./projectBoardPlanningWarningUiModel";
import { projectBoardProofEvidenceModel } from "./projectBoardProofEvidenceUiModel";
import { projectBoardSourceGroups } from "./projectBoardSourceUiModel";

export type ProjectBoardActionKind = "build" | "open" | "close";
export type ProjectBoardThreadPlanActionKind = "no_board" | "no_ready_plan" | "single_ready_plan" | "multiple_ready_plans";
export type ProjectBoardTabId =
  | "overview"
  | "board"
  | "map"
  | "proof"
  | "integration"
  | "charter"
  | "decisions"
  | "draft_inbox"
  | "history";

export interface ProjectBoardActionState {
  kind: ProjectBoardActionKind;
  label: string;
  title: string;
  disabled: boolean;
  statusLabel: string;
}

export interface ProjectBoardThreadPlanActionState {
  kind: ProjectBoardThreadPlanActionKind;
  label: string;
  title: string;
  disabled: boolean;
}

export interface ProjectBoardCreateReadyTasksState {
  count: number;
  label: string;
  title: string;
  disabled: boolean;
}

export interface ProjectBoardCharterReviewActionState {
  label: string;
  title: string;
  disabled: boolean;
}

export interface ProjectBoardColumnModel {
  id: "blocked" | "ready" | "in_progress" | "review" | "done";
  title: string;
  tooltip: string;
  cards: ProjectBoardCard[];
}

export type ProjectBoardPlanningSnapshotTicketizationKind =
  | "planning_running"
  | "snapshot_ready"
  | "snapshot_ticketized"
  | "new_proposal_available"
  | "no_snapshot";

export interface ProjectBoardPlanningSnapshotTicketizationState {
  kind: ProjectBoardPlanningSnapshotTicketizationKind;
  label: string;
  statusLabel: string;
  tone: "neutral" | "warning" | "ready";
  detail: string;
  runId?: string;
  readyCount: number;
  draftCandidateCount: number;
  ticketizedCount: number;
}

export interface ProjectBoardResetImpactMetric {
  label: string;
  value: number;
  detail: string;
}

export interface ProjectBoardResetImpact {
  deleted: ProjectBoardResetImpactMetric[];
  preserved: string[];
  summary: string;
}

export interface ProjectBoardTabModel {
  id: ProjectBoardTabId;
  label: string;
  count?: number;
}

export function projectBoardActionState(
  project: ProjectSummary,
  activeProjectPath: string,
  busy = false,
  boardOpen = false,
): ProjectBoardActionState {
  const active = project.path === activeProjectPath;
  if (!project.board) {
    return {
      kind: "open",
      label: busy ? "Building" : "Project Board",
      title: active
        ? "Open project board setup. Building starts only from the Build Board button."
        : "Open this project before viewing its board setup",
      disabled: busy || !active,
      statusLabel: "No board",
    };
  }
  if (active && boardOpen) {
    return {
      kind: "close",
      label: "Open Chat",
      title: "Return to main chat",
      disabled: false,
      statusLabel: projectBoardStatusLabel(project.board),
    };
  }
  return {
    kind: "open",
    label: "Open Board",
    title: active ? "Open project Kanban board" : "Open this project before viewing its board",
    disabled: !active,
    statusLabel: projectBoardStatusLabel(project.board),
  };
}

export function projectBoardSuppressedForWorkflowRecordingThread(thread: { workflowRecording?: unknown } | undefined): boolean {
  return Boolean(thread?.workflowRecording);
}

export function projectBoardThreadPlanActionState(
  hasBoard: boolean,
  readyPlanCount: number,
  busy = false,
): ProjectBoardThreadPlanActionState {
  if (readyPlanCount <= 0) {
    return {
      kind: "no_ready_plan",
      label: "Add Plan to Board",
      title: "Create a ready planner plan first.",
      disabled: true,
    };
  }
  if (!hasBoard) {
    return {
      kind: "no_board",
      label: "Add Plan to Board",
      title: busy ? "Adding plan to board" : "Create a project board and add the ready planner plan.",
      disabled: busy,
    };
  }
  if (readyPlanCount === 1) {
    return {
      kind: "single_ready_plan",
      label: "Add Plan to Board",
      title: busy ? "Adding plan to board" : "Add the ready planner plan to the project board.",
      disabled: busy,
    };
  }
  return {
    kind: "multiple_ready_plans",
    label: "Add Plan to Board",
    title: busy ? "Adding plan to board" : "Choose which ready planner plan to add to the project board.",
    disabled: busy,
  };
}

export function projectBoardHasActiveSynthesisRun(board?: Pick<ProjectBoardSummary, "synthesisRuns">): boolean {
  return Boolean(board?.synthesisRuns?.some(projectBoardRunBlocksPlanning));
}

export function projectBoardPlanningSnapshotTicketizationState(board: ProjectBoardSummary): ProjectBoardPlanningSnapshotTicketizationState {
  const synthesisRuns = board.synthesisRuns ?? [];
  const activeRun = synthesisRuns.find(projectBoardRunBlocksPlanning);
  const stableRun = synthesisRuns.find(projectBoardRunCanProvidePlanningSnapshot);
  const readyCount = projectBoardReadyTicketizationCards(board).length;
  const draftCandidateCount = board.cards.filter((card) => isProjectBoardDraftCandidate(card) && !card.orchestrationTaskId).length;
  const ticketizedCount = board.cards.filter((card) => Boolean(card.orchestrationTaskId)).length;

  if (activeRun) {
    return {
      kind: "planning_running",
      label: "Planning running",
      statusLabel: "Locked",
      tone: "warning",
      detail:
        "Create Ready Tasks waits for the active planner stream to pause or complete, so progressive output cannot race ticketization.",
      runId: activeRun.id,
      readyCount,
      draftCandidateCount,
      ticketizedCount,
    };
  }

  if (ticketizedCount > 0 && draftCandidateCount > 0) {
    return {
      kind: "new_proposal_available",
      label: "New proposal available",
      statusLabel: "Review additive drafts",
      tone: "warning",
      detail: "Existing Local Tasks are protected. Review additive draft cards or staged Pi updates before creating more tasks.",
      runId: stableRun?.id,
      readyCount,
      draftCandidateCount,
      ticketizedCount,
    };
  }

  if (ticketizedCount > 0) {
    return {
      kind: "snapshot_ticketized",
      label: "Snapshot ticketized",
      statusLabel: "Protected",
      tone: "ready",
      detail:
        "A stable planning snapshot has already been converted to Local Tasks. Further planning must add drafts or update suggestions.",
      runId: stableRun?.id,
      readyCount,
      draftCandidateCount,
      ticketizedCount,
    };
  }

  if (stableRun) {
    return {
      kind: "snapshot_ready",
      label: "Snapshot ready",
      statusLabel: "Ready",
      tone: "ready",
      detail: "Planner output is at a stable checkpoint. Choose this snapshot by creating ready Local Tasks from the Draft Inbox.",
      runId: stableRun.id,
      readyCount,
      draftCandidateCount,
      ticketizedCount,
    };
  }

  return {
    kind: "no_snapshot",
    label: "No snapshot",
    statusLabel: "Drafting",
    tone: "neutral",
    detail: "No completed or paused planning snapshot is available yet. Build or pause planning before bulk ticketization.",
    readyCount,
    draftCandidateCount,
    ticketizedCount,
  };
}

function projectBoardLatestStablePlanningSnapshot(
  board: Pick<ProjectBoardSummary, "synthesisRuns">,
): ProjectBoardPlanningSnapshot | undefined {
  // Mirror the main-process gate (latestStableProjectBoardPlanningSnapshot): only runs
  // whose CURRENT status is paused/succeeded count, ordered by updatedAt desc. Walking
  // started_at order without the status filter picked different snapshots than main,
  // so the Create Ready Tasks button could enable and then throw (or vice versa).
  const stableRuns = (board.synthesisRuns ?? [])
    .filter((run) => run.status === "paused" || run.status === "succeeded")
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  for (const run of stableRuns) {
    const snapshot = [...(run.planningSnapshots ?? [])]
      .reverse()
      .find((candidate) => candidate.planningStatus === "paused" || candidate.planningStatus === "succeeded");
    if (snapshot) return snapshot;
  }
  return undefined;
}

export function projectBoardCreateReadyTasksState(board: ProjectBoardSummary, busy = false): ProjectBoardCreateReadyTasksState {
  const readyCards = projectBoardReadyTicketizationCards(board);
  const count = readyCards.length;
  const proofScopeWarningCount = readyCards.filter((card) => projectBoardPlanningWarningsForCard(card, board).length > 0).length;
  const strictProofScopeBlockedCount = projectBoardStrictProofScopeBlockedReadyCards(board).length;
  const uxMockBlockedCount = board.cards.filter(
    (card) =>
      card.status === "draft" &&
      !card.orchestrationTaskId &&
      card.candidateStatus === "ready_to_create" &&
      projectBoardCardCanMarkReady(card, board) &&
      projectBoardCardBlockedByOpenUxMockGate(card, board.cards),
  ).length;
  const claimBlockedCount = board.cards.filter(
    (card) =>
      card.status === "draft" &&
      !card.orchestrationTaskId &&
      card.candidateStatus === "ready_to_create" &&
      projectBoardCardCanMarkReady(card, board) &&
      projectBoardCardClaimBlocksLocalTicketization(card),
  ).length;
  if (busy) {
    return {
      count,
      label: "Creating Tasks",
      title: "Creating Local Tasks from ready candidate cards.",
      disabled: true,
    };
  }
  if (projectBoardHasActiveSynthesisRun(board)) {
    return {
      count,
      label: "Create Ready Tasks",
      title:
        "Wait for board planning to finish or pause before creating Local Tasks. Progressive planner output can still add, replace, or protect draft cards until the active run reaches a stable checkpoint.",
      disabled: true,
    };
  }
  if (board.status !== "active") {
    return {
      count,
      label: "Create Ready Tasks",
      title: "Activate the project charter before creating Local Tasks from ready candidate cards.",
      disabled: true,
    };
  }
  if (count === 0) {
    if (strictProofScopeBlockedCount > 0) {
      return {
        count,
        label: "Create Ready Tasks",
        title: `${strictProofScopeBlockedCount} ready candidate card${strictProofScopeBlockedCount === 1 ? " has" : "s have"} proof-scope warning${strictProofScopeBlockedCount === 1 ? "" : "s"} that must be acknowledged before ticketization under this board's strict proof policy.`,
        disabled: true,
      };
    }
    if (claimBlockedCount > 0) {
      return {
        count,
        label: "Create Ready Tasks",
        title: `${claimBlockedCount} ready candidate card${claimBlockedCount === 1 ? " is" : "s are"} claimed or conflicted in collaboration mode. Pull the board or wait for the claim to clear before ticketizing.`,
        disabled: true,
      };
    }
    if (uxMockBlockedCount > 0) {
      return {
        count,
        label: "Create Ready Tasks",
        title: `${uxMockBlockedCount} UI implementation candidate card${uxMockBlockedCount === 1 ? " is" : "s are"} waiting for UX mock approval before ticketization.`,
        disabled: true,
      };
    }
    return {
      count,
      label: "Create Ready Tasks",
      title: "Mark candidate cards ready and add proof expectations before creating Local Tasks.",
      disabled: true,
    };
  }
  const readySynthesisCards = readyCards.filter((card) => card.sourceKind === "board_synthesis");
  if (readySynthesisCards.length > 0) {
    const latestSnapshot = projectBoardLatestStablePlanningSnapshot(board);
    if (!latestSnapshot) {
      return {
        count,
        label: "Create Ready Tasks",
        title: "Complete or pause board planning before creating Local Tasks from generated synthesis cards.",
        disabled: true,
      };
    }
    const snapshotCardIds = new Set(latestSnapshot.cardIds);
    const missingSnapshotCards = readySynthesisCards.filter((card) => !snapshotCardIds.has(card.id));
    if (missingSnapshotCards.length > 0) {
      return {
        count,
        label: "Create Ready Tasks",
        title: `${missingSnapshotCards.length} ready synthesis card${missingSnapshotCards.length === 1 ? " is" : "s are"} newer than the latest stable planning snapshot. Pause or complete planning before creating Local Tasks.`,
        disabled: true,
      };
    }
  }
  const proofScopeTitleDetails = [
    proofScopeWarningCount > 0
      ? `${proofScopeWarningCount} ready card${proofScopeWarningCount === 1 ? " has" : "s have"} acknowledged proof-scope warning${proofScopeWarningCount === 1 ? "" : "s"}; review whether visual proof belongs on downstream renderer/gameplay cards before execution.`
      : "",
    strictProofScopeBlockedCount > 0
      ? `${strictProofScopeBlockedCount} additional warned card${strictProofScopeBlockedCount === 1 ? " needs" : "s need"} PM acknowledgement first.`
      : "",
  ].filter(Boolean);
  return {
    count,
    label: `Create ${count} Ready Task${count === 1 ? "" : "s"}`,
    title:
      proofScopeTitleDetails.length > 0
        ? `Create ${count} Local Task${count === 1 ? "" : "s"} from ready candidate card${count === 1 ? "" : "s"}. ${proofScopeTitleDetails.join(" ")}`
        : `Create ${count} Local Task${count === 1 ? "" : "s"} from ready candidate card${count === 1 ? "" : "s"}.`,
    disabled: false,
  };
}

export function projectBoardStatusLabel(board: ProjectBoardSummary): string {
  if (board.status === "draft") return (board.charter?.version ?? 1) > 1 ? "Revision draft" : "Kickoff draft";
  if (board.status === "active") return "Active board";
  if (board.status === "paused") return "Paused board";
  return "Archived board";
}

export function projectBoardBoardTabStatusLabel(board: ProjectBoardSummary, executableCardCount: number, readyCardCount: number): string {
  if (board.status === "active" || executableCardCount > 0) {
    if (executableCardCount === 0) return "Needs ticketization";
    if (readyCardCount > 0) return `${readyCardCount} ready Local Task${readyCardCount === 1 ? "" : "s"}`;
    return "Execution board";
  }
  if (board.status === "draft") return (board.charter?.version ?? 1) > 1 ? "Revision draft" : "Kickoff draft";
  if (board.status === "paused") return "Paused board";
  return "Archived board";
}

export function projectBoardBoardTabShowsDraftCallout(board: ProjectBoardSummary, executableCardCount: number): boolean {
  return board.status === "draft" && executableCardCount === 0;
}

export function projectBoardBoardTabShowsExecutionPanels(board: ProjectBoardSummary, executableCardCount: number): boolean {
  return (board.status === "active" || executableCardCount > 0) && executableCardCount > 0;
}

export function projectBoardEmptyMessage(board?: ProjectBoardSummary): string {
  if (!board) return "Build a board to run the project kickoff interview and start ticketizing approved plans.";
  if (board.status === "draft" && (board.charter?.version ?? 1) > 1)
    return "Revision draft is active. Review the charter answers, then apply or cancel the revision.";
  if (board.status === "draft") {
    const hiddenDraftCount = board.cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId).length;
    if (hiddenDraftCount > 0) {
      return `${hiddenDraftCount} draft candidate${hiddenDraftCount === 1 ? "" : "s"} ${hiddenDraftCount === 1 ? "exists" : "exist"}, but the executable Board tab stays empty until kickoff questions create the active charter. Answer kickoff questions first, then review Draft Inbox.`;
    }
    return "Kickoff is ready. Answer the kickoff questions to create the charter before converting approved candidates into executable cards.";
  }
  if (board.status === "paused") return "This board is paused. Resume it before dispatching cards.";
  return "Board is ready for project cards.";
}

export function projectBoardCharterReviewActionState(board: ProjectBoardSummary): ProjectBoardCharterReviewActionState {
  const answeredCount = board.questions.filter((question) => question.answer?.trim()).length;
  const questionCount = board.questions.length;
  const isRevision = (board.charter?.version ?? 1) > 1;
  if (board.status === "draft") {
    if (questionCount === 0) {
      return {
        label: "Review Charter With Pi",
        title: "Kickoff questions are still being prepared. Answer kickoff questions before asking Pi to review the charter.",
        disabled: true,
      };
    }
    if (answeredCount < questionCount) {
      return {
        label: "Review Charter With Pi",
        title: `Answer all kickoff questions first (${answeredCount}/${questionCount} answered). Pi review is most useful once the charter has answers to inspect.`,
        disabled: true,
      };
    }
    return {
      label: isRevision ? "Review Revision With Pi" : "Review Answers With Pi",
      title: isRevision
        ? "Ask Pi to review the saved charter revision answers and source corpus before applying the revision."
        : "Ask Pi to review the saved kickoff answers and source corpus before activating the charter.",
      disabled: false,
    };
  }
  return {
    label: "Review Charter With Pi",
    title: "Ask Pi for a lightweight PM readiness review of the active charter and source corpus without generating draft cards.",
    disabled: false,
  };
}

export function projectBoardColumns(
  cards: ProjectBoardCard[],
  orchestrationBoard?: { tasks: OrchestrationTask[]; runs: OrchestrationRun[] },
): ProjectBoardColumnModel[] {
  const orderedCards = projectBoardDisplayOrderedCards(cards);
  const tasksById = new Map((orchestrationBoard?.tasks ?? []).map((task) => [task.id, task]));
  const latestRunByTaskId = projectBoardLatestRunByTaskId(orchestrationBoard?.runs ?? []);
  const cardsForProjectionStatus = (status: ProjectBoardColumnModel["id"]) =>
    orderedCards.filter((card) => {
      const task = card.orchestrationTaskId ? tasksById.get(card.orchestrationTaskId) : undefined;
      const latestRun = task ? latestRunByTaskId.get(task.id) : undefined;
      return projectBoardCanonicalCardProjection(card, { task, latestRun }).visualStatus === status;
    });
  return [
    {
      id: "blocked",
      title: "Blocked",
      tooltip: "Cards that cannot run yet because dependencies, claims, decisions, proof gates, or execution state are blocking them.",
      cards: cardsForProjectionStatus("blocked"),
    },
    {
      id: "ready",
      title: "Ready",
      tooltip: "Approved Local Task cards that are eligible to prepare or dispatch when workflow and collaboration checks allow it.",
      cards: cardsForProjectionStatus("ready"),
    },
    {
      id: "in_progress",
      title: "In Progress",
      tooltip: "Cards with active or recently prepared execution work in progress.",
      cards: cardsForProjectionStatus("in_progress"),
    },
    {
      id: "review",
      title: "Review",
      tooltip: "Cards waiting for PM review of implementation output, proof, or follow-up decisions.",
      cards: cardsForProjectionStatus("review"),
    },
    {
      id: "done",
      title: "Done",
      tooltip: "Cards accepted as complete or intentionally covered without more execution.",
      cards: cardsForProjectionStatus("done"),
    },
  ];
}

export function projectBoardTabs(
  board: ProjectBoardSummary,
  orchestrationBoard?: { tasks: OrchestrationTask[]; runs: OrchestrationRun[] },
): ProjectBoardTabModel[] {
  const executableCards = board.cards.filter((card) => Boolean(card.orchestrationTaskId));
  const draftCards = projectBoardDraftCandidatesAvailable(board) ? board.cards.filter(isProjectBoardDraftCandidate) : [];
  const actionableDraftCards = draftCards.filter((card) => !projectBoardDraftInboxCardIsTerminalSkipped(card));
  const dependencyBoard = projectBoardDraftCandidatesAvailable(board) ? board : { ...board, cards: executableCards };
  const dependencyHealth = projectBoardDependencyHealth(dependencyBoard);
  const dependencyIssueCount = dependencyHealth.unresolved.length + dependencyHealth.cycles.length;
  const sourceGroupCount = projectBoardSourceGroups(board.sources).length;
  const decisionQueue = projectBoardDecisionQueue(board);
  const overviewCount = projectBoardOverviewBadgeCount(board);
  const integrationQueue = projectBoardDeliverableIntegrationQueue(board, orchestrationBoard);
  const proofMissingCards = projectBoardTestSummaryForBoard(board).missing;
  const proofReviewQueue = projectBoardProofReviewQueueSummary(board, orchestrationBoard);
  const proofCount = new Set([...proofMissingCards.map((card) => card.id), ...proofReviewQueue.cardIds]).size;
  return [
    { id: "overview", label: "Overview", count: overviewCount },
    { id: "charter", label: "Charter", count: sourceGroupCount },
    { id: "decisions", label: "Decisions", count: decisionQueue.actionCount },
    { id: "draft_inbox", label: "Draft Inbox", count: actionableDraftCards.length },
    {
      id: "map",
      label: "Map",
      count: dependencyIssueCount || dependencyHealth.rows.filter((row) => row.blockedBy.length || row.unblocks.length).length,
    },
    { id: "board", label: "Board", count: executableCards.length },
    { id: "proof", label: "Proof", count: proofCount },
    { id: "integration", label: "Integration", count: integrationQueue.pendingCount },
    { id: "history", label: "History", count: board.events?.length ?? 0 },
  ];
}

export function projectBoardProofReviewQueueSummary(
  board: ProjectBoardSummary,
  orchestrationBoard?: { tasks: OrchestrationTask[]; runs: OrchestrationRun[] },
): { count: number; cardIds: string[] } {
  const tasks = orchestrationBoard?.tasks ?? [];
  const runs = orchestrationBoard?.runs ?? [];
  const cardIds = board.cards
    .filter((card) => card.status !== "draft" && card.status !== "archived")
    .filter((card) => {
      const detail = projectBoardActiveCardDetail(card, board.cards, tasks, runs, board.executionArtifacts ?? []);
      const evidence = detail.latestRun ? projectBoardProofEvidenceModel(detail.latestRun, card) : undefined;
      return Boolean(
        card.proofReview ||
        card.status === "review" ||
        detail.latestRun?.status === "completed" ||
        detail.latestRun?.status === "failed" ||
        detail.latestRun?.status === "stalled" ||
        (evidence && (evidence.hasProof || evidence.error)),
      );
    })
    .map((card) => card.id);
  return { count: cardIds.length, cardIds };
}

export function defaultProjectBoardTab(board: ProjectBoardSummary): ProjectBoardTabId {
  if (board.status === "draft") return "charter";
  if (projectBoardDecisionQueue(board).actionCount > 0 || (board.proposals ?? []).some((proposal) => proposal.status === "pending"))
    return "decisions";
  const executableCards = board.cards.filter((card) => Boolean(card.orchestrationTaskId));
  const draftCards = board.cards.filter(isProjectBoardDraftCandidate);
  if (executableCards.length === 0 && draftCards.length > 0) return "draft_inbox";
  return "board";
}

export function projectBoardPhaseGroups(cards: ProjectBoardCard[], criticalCardIds: Set<string> = new Set()): ProjectBoardPhaseGroup[] {
  const groups = new Map<string, ProjectBoardCard[]>();
  for (const card of cards.filter((candidate) => candidate.status !== "archived")) {
    const phase = card.phase?.trim() || "Unassigned";
    groups.set(phase, [...(groups.get(phase) ?? []), card]);
  }
  return [...groups.entries()]
    .map(([phase, phaseCards]) => {
      const projections = phaseCards.map((card) => projectBoardCanonicalCardProjection(card));
      const blockedCount = phaseCards.filter(
        (card, index) =>
          !projections[index].suppressBlockers && (card.blockedBy.length > 0 || projections[index].visualStatus === "blocked"),
      ).length;
      const readyCount = projections.filter((projection) => projection.visualStatus === "ready").length;
      const reviewCount = projections.filter((projection) => projection.visualStatus === "review").length;
      const criticalPathCount = phaseCards.filter((card) => criticalCardIds.has(card.id)).length;
      return {
        phase,
        cards: sortProjectBoardCards(phaseCards),
        blockedCount,
        readyCount,
        reviewCount,
        criticalPathCount,
        tone: projectBoardPhaseTone(phaseCards, { blockedCount, readyCount, reviewCount, criticalPathCount }),
      };
    })
    .sort((left, right) => left.phase.localeCompare(right.phase));
}

function projectBoardPhaseTone(
  cards: ProjectBoardCard[],
  counts: Pick<ProjectBoardPhaseGroup, "blockedCount" | "readyCount" | "reviewCount" | "criticalPathCount">,
): ProjectBoardVisualTone {
  if (counts.criticalPathCount > 0) return "critical";
  if (counts.blockedCount > 0 || cards.some((card) => card.candidateStatus === "needs_clarification")) return "blocked";
  if (counts.reviewCount > 0) return "review";
  if (cards.some((card) => projectBoardCanonicalCardProjection(card).visualStatus === "in_progress")) return "running";
  if (counts.readyCount > 0 || cards.some((card) => card.candidateStatus === "ready_to_create")) return "ready";
  if (
    cards.length > 0 &&
    cards.every((card) => projectBoardCanonicalCardProjection(card).tone === "done" || card.candidateStatus === "evidence")
  )
    return "done";
  if (cards.some((card) => card.status === "draft")) return "draft";
  return "neutral";
}

export function projectBoardResetImpact(board: ProjectBoardSummary): ProjectBoardResetImpact {
  const draftCards = board.cards.filter((card) => !card.orchestrationTaskId && card.status === "draft").length;
  const executableCards = board.cards.filter((card) => Boolean(card.orchestrationTaskId) || card.status !== "draft").length;
  const linkedTasks = board.cards.filter((card) => Boolean(card.orchestrationTaskId)).length;
  const proposalCount = board.proposals?.length ?? 0;
  const synthesisRunCount = board.synthesisRuns?.length ?? 0;
  const executionArtifactCount = board.executionArtifacts?.length ?? 0;
  const eventCount = board.events?.length ?? 0;
  const activeClaimCount = board.claims?.active.length ?? 0;
  const deleted = [
    {
      label: "Cards",
      value: board.cards.length,
      detail: `${draftCards} draft candidate${draftCards === 1 ? "" : "s"}, ${executableCards} executable or linked card${executableCards === 1 ? "" : "s"}.`,
    },
    { label: "Sources", value: board.sources.length, detail: "Classified source review records and source-to-card provenance." },
    { label: "Questions", value: board.questions.length, detail: "Kickoff and charter-revision answers stored with this board." },
    { label: "PM proposals", value: proposalCount, detail: "Pending or historical Ambient/Pi board proposal records." },
    {
      label: "Progress runs",
      value: synthesisRunCount,
      detail: "Build Board, Revise Board, retry, and Add Cards synthesis progress records.",
    },
    {
      label: "Proof/handoff artifacts",
      value: executionArtifactCount,
      detail: "Board-owned execution proof, handoff, and follow-up projection records.",
    },
    { label: "History events", value: eventCount, detail: "Board audit history, including card, source, ticketization, and claim events." },
    { label: "Active claims", value: activeClaimCount, detail: "Git collaboration leases recorded for this board." },
  ];
  const preserved = [
    "Project files and Git working tree.",
    "Chat threads and planning artifacts outside this board.",
    linkedTasks > 0
      ? `${linkedTasks} existing Local Task${linkedTasks === 1 ? "" : "s"}; they will no longer be attached to this board.`
      : "Existing Local Task history.",
  ];
  return {
    deleted,
    preserved,
    summary: `Reset will remove ${board.cards.length} board card${board.cards.length === 1 ? "" : "s"}, ${board.sources.length} source record${board.sources.length === 1 ? "" : "s"}, and ${eventCount} board history event${eventCount === 1 ? "" : "s"}.`,
  };
}

export function projectBoardUnattachedLocalTasks(board: ProjectBoardSummary, tasks: OrchestrationTask[]): OrchestrationTask[] {
  const linkedTaskIds = new Set(board.cards.map((card) => card.orchestrationTaskId).filter(Boolean));
  return tasks.filter((task) => !linkedTaskIds.has(task.id) && task.sourceKind !== "project_board_card");
}

function isProjectBoardDraftCandidate(card: ProjectBoardCard): boolean {
  return projectBoardCardIsDraftInboxCandidate(card);
}
