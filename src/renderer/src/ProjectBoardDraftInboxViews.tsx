import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Clock,
  FileText,
  GitBranch,
  Info,
  Kanban,
  ListFilter,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { DragEvent as ReactDragEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";

import { projectBoardSynthesisPartialStatus } from "../../shared/projectBoardSynthesisRecovery";
import {
  projectBoardRunBlocksPlanning,
  projectBoardRunIsKickoffDefaults,
} from "../../shared/projectBoardSynthesisGate";
import type { ApplyProjectBoardDecisionImpactFeedbackInput, ApplyProjectBoardSourceImpactFeedbackInput, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardGitSyncStatus, ProjectBoardQuestion, ProjectBoardSynthesisRun, ProjectSummary, RefreshProjectBoardDecisionDraftsInput, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardDecisionDraftsInput, RegenerateProjectBoardSourceDraftsInput, ResolveProjectBoardCardPiUpdateInput, SuggestProjectBoardKickoffDefaultsInput, UpdateProjectBoardCardInput } from "../../shared/projectBoardTypes";
import {
  ProjectBoardCandidateDetail,
  ProjectBoardProofScopeWarningSummary,
} from "./ProjectBoardCandidateDetailViews";
import {
  ProjectBoardCardShell,
  projectBoardCandidateStatusLabel,
  projectBoardDraftColumnEmptyText,
} from "./ProjectBoardLaneViews";
import {
  ProjectBoardSourceImpactPreviewPanel,
  projectBoardSourceChangeStateLabel,
} from "./ProjectBoardSourceViews";
import {
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCandidateClarificationItems,
  projectBoardKickoffDefaultAnswer,
  projectBoardKickoffDefaultProviderErrorMessage,
} from "./projectBoardCardEditUiModel";
import {
  projectBoardAddCardsSourceScope,
  projectBoardCardDependencyBadges,
  projectBoardCreateReadyTasksState,
  projectBoardPlanningSnapshotTicketizationState,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeSummary,
  projectBoardSourceFilterItems,
  projectBoardSourceGroupCanElaborate,
  projectBoardSourceGroups,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceKindText,
  projectBoardSourceObservationLabel,
  type ProjectBoardCardClaimAction,
  type ProjectBoardSourceFilterKind,
} from "./projectBoardUiModel";
import {
  projectBoardCandidateStatusForDraftColumn,
  projectBoardDraftColumnMoveState,
  projectBoardDraftColumns,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardDraftInboxFilterOptions,
  projectBoardPiUpdateReviewQueue,
  type ProjectBoardDraftInboxCreateReadyPreview,
  type ProjectBoardDraftInboxFilterId,
  type ProjectBoardDraftInboxFilterOption,
  type ProjectBoardPiUpdateReviewQueue,
} from "./projectBoardDraftInboxUiModel";
import {
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
} from "./projectBoardPlanningWarningUiModel";

export function projectBoardKickoffDefaultDraftingStatus(board: NonNullable<ProjectSummary["board"]>, questionId?: string): string | undefined {
  if (!questionId) return undefined;
  const run = projectBoardLatestVisibleSynthesisRun(board.synthesisRuns);
  if (!run || run.status !== "running" || run.stage !== "kickoff_defaults") return undefined;
  const latestQuestionEvent = [...run.events].reverse().find((event) => event.metadata.questionId === questionId);
  if (!latestQuestionEvent || latestQuestionEvent.stage !== "kickoff_defaults") return undefined;
  const total = typeof latestQuestionEvent.metadata.total === "number" ? latestQuestionEvent.metadata.total : undefined;
  const position = typeof latestQuestionEvent.metadata.position === "number" ? latestQuestionEvent.metadata.position : undefined;
  const received = run.responseCharCount && run.responseCharCount > 0 ? `${run.responseCharCount.toLocaleString()} response characters received. ` : "";
  const progress = position && total ? `Question ${position}/${total}. ` : "";
  return `${progress}${received}The editable answer will appear here as soon as Ambient/Pi finishes a valid response for this question.`;
}

function projectBoardLatestVisibleSynthesisRun(runs?: ProjectBoardSynthesisRun[]): ProjectBoardSynthesisRun | undefined {
  if (!runs?.length) return undefined;
  return (
    runs.find(projectBoardRunBlocksPlanning) ??
    runs.find((run) => (run.status === "running" || run.status === "pause_requested") && projectBoardRunIsKickoffDefaults(run)) ??
    runs.find((run) => (run.status === "paused" || run.status === "succeeded") && !projectBoardRunIsKickoffDefaults(run)) ??
    runs[0]
  );
}

export function ProjectBoardDraftInboxTab({
  board,
  columns,
  selectedCard,
  selectedCardId,
  inspectorMode,
  refineBusy,
  sourceBusy,
  sourceImpactBusy,
  onSelectCard,
  onCloseSourcePicker,
  createCardBusy,
  createReadyTasksBusy,
  onCreateCard,
  onCreateReadyTasks,
  onRefreshSources,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onElaborateSources,
  onApproveCard,
  onSplitCard,
  onUpdateCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
  onOpenSourcePicker,
  onReviewSources,
  onInspectSource,
  latestSynthesisRun,
  gitStatus,
  claimBusy,
  onClaimAction,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  columns: ReturnType<typeof projectBoardDraftColumns>;
  selectedCard?: ProjectBoardCard;
  selectedCardId?: string;
  inspectorMode: "candidate" | "source_picker";
  refineBusy: boolean;
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  onSelectCard: (cardId: string | undefined) => void;
  onCloseSourcePicker: () => void;
  createCardBusy: boolean;
  createReadyTasksBusy: boolean;
  onCreateCard: (boardId: string) => void;
  onCreateReadyTasks: (boardId: string) => void;
  onRefreshSources: (boardId: string) => void;
  onRefreshSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void> | void;
  onRegenerateSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void> | void;
  onApplySourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void> | void;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onSplitCard: (cardId: string) => void;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onResolveCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onOpenSourcePicker: () => void;
  onReviewSources: () => void;
  onInspectSource: (sourceId?: string) => void;
  latestSynthesisRun?: ProjectBoardSynthesisRun;
  gitStatus?: ProjectBoardGitSyncStatus;
  claimBusy?: string;
  onClaimAction: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => void;
}) {
  const sourcePickerOpen = inspectorMode === "source_picker";
  const [draftQuery, setDraftQuery] = useState("");
  const [draftFilterId, setDraftFilterId] = useState<ProjectBoardDraftInboxFilterId>("all");
  const [includeSkippedDrafts, setIncludeSkippedDrafts] = useState(true);
  const filterOptions = useMemo(() => projectBoardDraftInboxFilterOptions(board.cards, board), [board]);
  const createReadyPreview = useMemo(() => projectBoardDraftInboxCreateReadyPreview(board), [board]);
  const filteredColumns = useMemo(
    () =>
      projectBoardDraftColumns(board.cards, {
        board,
        query: draftQuery,
        filterId: draftFilterId,
        includeSkipped: includeSkippedDrafts,
      }),
    [board, draftFilterId, draftQuery, includeSkippedDrafts],
  );
  const allCandidateCount = columns.reduce((total, column) => total + column.cards.length, 0);
  const workspaceMode = sourcePickerOpen ? "source-picker-mode" : selectedCard ? "detail-mode" : "lanes-mode";
  return (
    <section className="project-board-tab-panel" aria-label="Project board draft inbox">
      <div className={`project-board-draft-workspace ${workspaceMode}`}>
        {!sourcePickerOpen && !selectedCard && (
          <ProjectBoardDraftBoard
            columns={filteredColumns}
            allCandidateCount={allCandidateCount}
            query={draftQuery}
            filterId={draftFilterId}
            includeSkipped={includeSkippedDrafts}
            filterOptions={filterOptions}
            createReadyPreview={createReadyPreview}
            selectedCardId={selectedCardId}
            board={board}
            onSelectCard={onSelectCard}
            onQueryChange={setDraftQuery}
            onFilterChange={setDraftFilterId}
            onIncludeSkippedChange={setIncludeSkippedDrafts}
            createCardBusy={createCardBusy}
            createReadyTasksBusy={createReadyTasksBusy}
            onCreateCard={onCreateCard}
            onCreateReadyTasks={onCreateReadyTasks}
            onApproveCard={onApproveCard}
            onSplitCard={onSplitCard}
            onUpdateCardCandidate={onUpdateCardCandidate}
            onResolveCardPiUpdate={onResolveCardPiUpdate}
            onOpenSourcePicker={onOpenSourcePicker}
            onReviewSources={onReviewSources}
            latestSynthesisRun={latestSynthesisRun}
          />
        )}
        {sourcePickerOpen ? (
          <ProjectBoardDraftSourcePicker
            board={board}
            sourceBusy={sourceBusy}
            sourceImpactBusy={sourceImpactBusy}
            elaborateBusy={refineBusy}
            onRefreshSources={onRefreshSources}
            onRefreshSourceDrafts={onRefreshSourceDrafts}
            onRegenerateSourceDrafts={onRegenerateSourceDrafts}
            onApplySourceImpactFeedback={onApplySourceImpactFeedback}
            onElaborateSources={onElaborateSources}
            onClose={onCloseSourcePicker}
          />
        ) : selectedCard ? (
          <ProjectBoardCandidateDetail
            card={selectedCard}
            board={board}
            onClose={() => onSelectCard(undefined)}
            onSave={onUpdateCard}
            onApproveCard={onApproveCard}
            onSplitCard={onSplitCard}
            onUpdateCardCandidate={onUpdateCardCandidate}
            onResolveCardPiUpdate={onResolveCardPiUpdate}
            onApplyDecisionImpactFeedback={onApplyDecisionImpactFeedback}
            onRefreshDecisionDrafts={onRefreshDecisionDrafts}
            onRegenerateDecisionDrafts={onRegenerateDecisionDrafts}
            onInspectSource={onInspectSource}
            gitStatus={gitStatus}
            claimBusy={claimBusy}
            onClaimAction={onClaimAction}
          />
        ) : null}
      </div>
    </section>
  );
}


export function ProjectBoardDraftSourcePicker({
  board,
  sourceBusy,
  sourceImpactBusy,
  elaborateBusy,
  onRefreshSources,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onElaborateSources,
  onClose,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  elaborateBusy: boolean;
  onRefreshSources: (boardId: string) => void;
  onRefreshSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void> | void;
  onRegenerateSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void> | void;
  onApplySourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void> | void;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onClose: () => void;
}) {
  const sourceGroups = useMemo(() => projectBoardSourceGroups(board.sources), [board.sources]);
  const [filter, setFilter] = useState<ProjectBoardSourceFilterKind>("all");
  const [objective, setObjective] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>();
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const visibleGroups = useMemo(() => projectBoardSourceGroupsForFilter(sourceGroups, filter), [filter, sourceGroups]);
  const visibleEligibleGroups = useMemo(() => visibleGroups.filter(projectBoardSourceGroupCanElaborate), [visibleGroups]);
  const changeSummary = useMemo(() => projectBoardSourceChangeSummary(sourceGroups, board.events ?? []), [board.events, sourceGroups]);
  const activeGroup = sourceGroups.find((group) => group.id === activeGroupId) ?? visibleGroups[0] ?? sourceGroups[0];
  const scope = projectBoardAddCardsSourceScope(sourceGroups, selectedGroupIds, elaborateBusy);
  const sourceImpact = useMemo(() => projectBoardSourceImpactPreview(board, { selectedGroupIds }), [board, selectedGroupIds]);
  const selectedSourceIds = useMemo(
    () =>
      sourceGroups
        .filter((group) => selectedGroupIds.has(group.id))
        .flatMap((group) => group.observations.map((source) => source.id)),
    [selectedGroupIds, sourceGroups],
  );
  const objectiveText = objective.trim();
  const elaborateDisabled = elaborateBusy || (scope.selectedObservationCount === 0 && objectiveText.length === 0);
  const elaborateLabel = elaborateBusy
    ? "Elaborating"
    : objectiveText && scope.selectedGroupCount === 0
      ? "Elaborate Objective"
      : objectiveText
        ? "Elaborate Objective + Sources"
        : scope.label;
  const elaborateTitle = elaborateDisabled
    ? "Select sources or enter an objective before asking Pi to elaborate additive Draft Inbox cards."
    : objectiveText
      ? `Ask Pi to elaborate additive Draft Inbox cards for this objective${
          scope.selectedGroupCount > 0 ? ` using ${scope.selectedGroupCount} selected source group${scope.selectedGroupCount === 1 ? "" : "s"}` : ""
        }. Existing board cards are preserved.`
      : scope.title;

  useEffect(() => {
    const validIds = new Set(sourceGroups.map((group) => group.id));
    const eligibleIds = new Set(sourceGroups.filter(projectBoardSourceGroupCanElaborate).map((group) => group.id));
    const firstEligibleGroup = sourceGroups.find(projectBoardSourceGroupCanElaborate);
    setSelectedGroupIds((previous) => {
      const next = new Set([...previous].filter((id) => validIds.has(id) && eligibleIds.has(id)));
      if (next.size === 0 && firstEligibleGroup) next.add(firstEligibleGroup.id);
      return next;
    });
    setActiveGroupId((previous) => (previous && validIds.has(previous) ? previous : sourceGroups[0]?.id));
  }, [sourceGroups]);

  function toggleGroup(groupId: string) {
    const group = sourceGroups.find((candidate) => candidate.id === groupId);
    if (!group || !projectBoardSourceGroupCanElaborate(group)) return;
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setActiveGroupId(groupId);
  }

  function selectVisibleGroups() {
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      visibleEligibleGroups.forEach((group) => next.add(group.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedGroupIds(new Set());
  }

  return (
    <aside className="project-board-draft-source-picker" aria-label="Add cards from sources" data-ui-scroll-container="required">
      <header>
        <div>
          <span className="project-board-kicker">Add Cards From Sources</span>
          <h3>Choose source scope</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose} title="Close source picker" aria-label="Close source picker">
          <X size={16} />
        </button>
      </header>
      <p className="project-board-source-picker-intro">
        Select the source groups Pi should use for additive card elaboration. Existing board cards are preserved.
      </p>
      <p className={`project-board-source-change-summary ${changeSummary.hasActionableChanges ? "actionable" : ""}`}>
        {changeSummary.headline} {changeSummary.detail}
      </p>
      <label className="project-board-add-cards-objective">
        <span>Objective</span>
        <textarea
          value={objective}
          maxLength={2000}
          rows={4}
          placeholder="Add analytics cards for the board, cover accessibility gaps, or plan the next gameplay loop."
          onChange={(event) => setObjective(event.currentTarget.value)}
        />
      </label>
      <div className="project-board-source-detail-meta">
        <span>{scope.selectedGroupCount} selected</span>
        <span>{scope.selectedObservationCount} observation{scope.selectedObservationCount === 1 ? "" : "s"}</span>
        <span>{sourceGroups.length} source group{sourceGroups.length === 1 ? "" : "s"}</span>
      </div>
      <ProjectBoardSourceImpactPreviewPanel
        preview={sourceImpact}
        compact
        refreshDraftsBusy={sourceImpactBusy}
        onRefreshDrafts={() => void onRefreshSourceDrafts({ boardId: board.id, sourceIds: selectedSourceIds })}
        regenerateDraftsBusy={sourceImpactBusy}
        onRegenerateDrafts={() => void onRegenerateSourceDrafts({ boardId: board.id, sourceIds: selectedSourceIds })}
        applyFeedbackBusy={sourceImpactBusy}
        onApplyRunFeedback={() => void onApplySourceImpactFeedback({ boardId: board.id, sourceIds: selectedSourceIds })}
      />
      <div className="project-board-source-detail-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={sourceBusy}
          title={sourceBusy ? "Source evidence is already refreshing." : changeSummary.refreshTitle}
          onClick={() => onRefreshSources(board.id)}
        >
          <RefreshCw size={14} className={sourceBusy ? "spin" : ""} />
          <span>{sourceBusy ? "Refreshing" : "Refresh"}</span>
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={visibleEligibleGroups.length === 0}
          title={
            visibleGroups.length === 0
              ? "No source groups match the current filter."
              : visibleEligibleGroups.length === 0
                ? "Visible sources are ignored for synthesis. Reclassify them before using Add Cards."
                : "Select every visible source group that is included in synthesis."
          }
          onClick={selectVisibleGroups}
        >
          <Check size={14} />
          <span>Select Visible</span>
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={scope.selectedGroupCount === 0}
          title={scope.selectedGroupCount === 0 ? "No source groups are selected." : "Clear selected source groups."}
          onClick={clearSelection}
        >
          <X size={14} />
          <span>Clear</span>
        </button>
      </div>
      <div className="project-board-source-counts" aria-label="Source filters">
        {projectBoardSourceFilterItems(sourceGroups).map((item) => (
          <button
            type="button"
            className={filter === item.kind ? "active" : ""}
            key={item.kind}
            title={`Show ${item.label.toLowerCase()} sources.`}
            onClick={() => setFilter(item.kind)}
          >
            {item.label}: {item.count}
          </button>
        ))}
      </div>
      <div className="project-board-draft-source-picker-list">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => {
            const source = group.primary;
            const inclusion = projectBoardSourceInclusion(source);
            const eligible = projectBoardSourceGroupCanElaborate(group);
            const checked = eligible && selectedGroupIds.has(group.id);
            return (
              <label
                className={`project-board-source-scope-item ${checked ? "selected" : ""} ${activeGroup?.id === group.id ? "active" : ""} ${eligible ? "" : "disabled"}`}
                key={group.id}
                title={eligible ? inclusion.addCardsTitle : inclusion.detail}
              >
                <input
                  type="checkbox"
                  disabled={!eligible}
                  checked={checked}
                  onChange={() => toggleGroup(group.id)}
                  onFocus={() => setActiveGroupId(group.id)}
                />
                <span>
                  <strong>{source.title}</strong>
                  <small>
                    {projectBoardSourceKindText(source.kind)} · {inclusion.label} · {projectBoardSourceObservationLabel(group)}
                  </small>
                </span>
              </label>
            );
          })
        ) : (
          <div className="project-board-column-empty">No sources match this filter.</div>
        )}
      </div>
      {activeGroup && (
        <section className="project-board-source-picker-preview">
          <span className="project-board-kicker">Preview</span>
          <h4>{activeGroup.primary.title}</h4>
          <p>{activeGroup.primary.summary}</p>
          {activeGroup.primary.excerpt?.trim() && activeGroup.primary.excerpt.trim() !== activeGroup.primary.summary.trim() && (
            <pre>{activeGroup.primary.excerpt.trim()}</pre>
          )}
          <div className="project-board-source-provenance">
            <span title={projectBoardSourceInclusion(activeGroup.primary).detail}>{projectBoardSourceInclusion(activeGroup.primary).badgeLabel}</span>
            <span>{activeGroup.primary.path || activeGroup.primary.threadId || activeGroup.primary.artifactId || activeGroup.primary.id}</span>
            <span>{projectBoardSourceKindText(activeGroup.primary.kind)}</span>
            {activeGroup.primary.changeState && <span>{projectBoardSourceChangeStateLabel(activeGroup.primary.changeState)}</span>}
          </div>
          <p className="project-board-source-change-summary compact">{projectBoardSourceChangeDetail(activeGroup)}</p>
        </section>
      )}
      <footer>
        <button
          type="button"
          className="primary-button"
          disabled={elaborateDisabled}
          title={elaborateTitle}
          onClick={() => onElaborateSources(board.id, scope.selectedSourceIds, objectiveText || undefined)}
        >
          <Plus size={14} />
          <span>{elaborateLabel}</span>
        </button>
      </footer>
    </aside>
  );
}


export function ProjectBoardDraftBoard({
  columns,
  allCandidateCount,
  query,
  filterId,
  includeSkipped,
  filterOptions,
  createReadyPreview,
  selectedCardId,
  board,
  onSelectCard,
  onQueryChange,
  onFilterChange,
  onIncludeSkippedChange,
  createCardBusy,
  createReadyTasksBusy,
  onCreateCard,
  onCreateReadyTasks,
  onApproveCard,
  onSplitCard,
  onUpdateCardCandidate,
  onResolveCardPiUpdate,
  onOpenSourcePicker,
  onReviewSources,
  latestSynthesisRun,
}: {
  columns: ReturnType<typeof projectBoardDraftColumns>;
  allCandidateCount: number;
  query: string;
  filterId: ProjectBoardDraftInboxFilterId;
  includeSkipped: boolean;
  filterOptions: ProjectBoardDraftInboxFilterOption[];
  createReadyPreview: ProjectBoardDraftInboxCreateReadyPreview;
  selectedCardId?: string;
  board?: NonNullable<ProjectSummary["board"]>;
  onSelectCard: (cardId: string | undefined) => void;
  onQueryChange: (query: string) => void;
  onFilterChange: (filterId: ProjectBoardDraftInboxFilterId) => void;
  onIncludeSkippedChange: (includeSkipped: boolean) => void;
  createCardBusy: boolean;
  createReadyTasksBusy: boolean;
  onCreateCard: (boardId: string) => void;
  onCreateReadyTasks: (boardId: string) => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onSplitCard: (cardId: string) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
  onResolveCardPiUpdate: (input: ResolveProjectBoardCardPiUpdateInput) => Promise<void> | void;
  onOpenSourcePicker: () => void;
  onReviewSources: () => void;
  latestSynthesisRun?: ProjectBoardSynthesisRun;
}) {
  const count = columns.reduce((total, column) => total + column.cards.length, 0);
  const createReadyTasksState = board ? projectBoardCreateReadyTasksState(board, createReadyTasksBusy) : undefined;
  const planningSnapshotState = board ? projectBoardPlanningSnapshotTicketizationState(board) : undefined;
  const partialStatus = latestSynthesisRun ? projectBoardSynthesisPartialStatus(latestSynthesisRun) : undefined;
  const visibleCards = useMemo(() => columns.flatMap((column) => column.cards), [columns]);
  const draftCardsById = useMemo(() => new Map(visibleCards.map((card) => [card.id, card])), [visibleCards]);
  const [selectedBulkCardIds, setSelectedBulkCardIds] = useState<Set<string>>(() => new Set());
  const [showSkippedPreview, setShowSkippedPreview] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | undefined>();
  const [dragTargetColumnId, setDragTargetColumnId] = useState<ReturnType<typeof projectBoardDraftColumns>[number]["id"] | undefined>();
  const selectedCardElementRef = useRef<HTMLElement | null>(null);
  const draggingCard = draggingCardId ? draftCardsById.get(draggingCardId) : undefined;
  const markAllReadyCandidates = createReadyPreview.markReadyCards.filter((card) => draftCardsById.has(card.id));
  const markReadyCandidateIds = new Set(markAllReadyCandidates.map((card) => card.id));
  const selectedBulkCards = visibleCards.filter((card) => selectedBulkCardIds.has(card.id));
  const selectedBulkReadyCandidates = selectedBulkCards.filter((card) => markReadyCandidateIds.has(card.id));
  const piUpdateQueue = useMemo(() => (board ? projectBoardPiUpdateReviewQueue(board) : undefined), [board]);
  const [showPiUpdateQueueDetails, setShowPiUpdateQueueDetails] = useState(false);
  const [piUpdateQueueBusy, setPiUpdateQueueBusy] = useState<"apply" | "ignore" | undefined>();
  const [piUpdateQueueError, setPiUpdateQueueError] = useState<string | undefined>();

  useEffect(() => {
    const visibleIds = new Set(visibleCards.map((card) => card.id));
    setSelectedBulkCardIds((current) => {
      const next = new Set([...current].filter((cardId) => visibleIds.has(cardId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleCards]);

  useEffect(() => {
    if (!selectedCardId) return;
    window.requestAnimationFrame(() => {
      const cardElement = selectedCardElementRef.current;
      if (!cardElement) return;
      cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
      cardElement.focus({ preventScroll: true });
    });
  }, [selectedCardId]);

  const toggleBulkCard = (cardId: string) => {
    setSelectedBulkCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const clearBulkSelection = () => setSelectedBulkCardIds(new Set());
  const selectVisibleCards = () => setSelectedBulkCardIds(new Set(visibleCards.map((card) => card.id)));
  const markCardsReady = (cards: ProjectBoardCard[]) => {
    cards.forEach((card) => onUpdateCardCandidate(card, "ready_to_create"));
    setSelectedBulkCardIds(new Set());
  };
  const resolvePiUpdateItems = async (action: "apply" | "ignore", items: ProjectBoardPiUpdateReviewQueue["actionableItems"]) => {
    if (items.length === 0) return;
    setPiUpdateQueueBusy(action);
    setPiUpdateQueueError(undefined);
    // Resolve every item even when one fails: an uncaught rejection used to abort
    // the rest of the batch silently with zero feedback after "Apply N updates".
    const failures: string[] = [];
    try {
      for (const item of items) {
        try {
          await onResolveCardPiUpdate({ cardId: item.card.id, action });
        } catch (error) {
          failures.push(`${item.card.title}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (failures.length > 0) {
        setPiUpdateQueueError(
          `${failures.length} of ${items.length} Pi update${items.length === 1 ? "" : "s"} failed to ${action}. ${failures[0]}`,
        );
      }
    } finally {
      setPiUpdateQueueBusy(undefined);
    }
  };
  const clearDragState = () => {
    setDraggingCardId(undefined);
    setDragTargetColumnId(undefined);
  };
  const updateColumnDropEffect = (
    event: ReactDragEvent<HTMLElement>,
    column: ReturnType<typeof projectBoardDraftColumns>[number],
  ) => {
    const cardId = draggingCardId || event.dataTransfer.getData("application/x-project-board-card-id") || event.dataTransfer.getData("text/plain");
    const card = cardId ? draftCardsById.get(cardId) : undefined;
    const moveState = projectBoardDraftColumnMoveState(column, card, board);
    event.preventDefault();
    event.dataTransfer.dropEffect = moveState.disabled ? "none" : "move";
    setDragTargetColumnId(column.id);
  };
  const dropCardIntoColumn = (event: ReactDragEvent<HTMLElement>, columnId: ReturnType<typeof projectBoardDraftColumns>[number]["id"]) => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("application/x-project-board-card-id") || event.dataTransfer.getData("text/plain");
    const card = draftCardsById.get(cardId);
    const candidateStatus = projectBoardCandidateStatusForDraftColumn(columnId);
    clearDragState();
    if (!card || !candidateStatus || card.candidateStatus === candidateStatus) return;
    if (candidateStatus === "ready_to_create" && !projectBoardCardCanMarkReady(card, board)) {
      onSelectCard(card.id);
      return;
    }
    onUpdateCardCandidate(card, candidateStatus);
    onSelectCard(card.id);
  };
  return (
    <section className="project-board-draft-board" aria-label="Project board draft candidates">
      <header>
        <div>
          <span className="project-board-kicker">Draft board</span>
          <h3>
            {count} of {allCandidateCount} candidate card{allCandidateCount === 1 ? "" : "s"}
          </h3>
        </div>
        <div className="project-board-card-actions">
          <span className="project-board-status">Triage before execution</span>
          {board && (
            <>
              <button
                type="button"
                className="secondary-button"
                title="Open Add Cards From Sources and choose included source groups for additive card elaboration."
                onClick={onOpenSourcePicker}
              >
                <Plus size={14} />
                <span>Add Cards From Sources</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                title="Open the Charter source review. Source inspection and source-scoped Add Cards live there so source provenance stays in one place."
                onClick={onReviewSources}
              >
                <FileText size={14} />
                <span>Open Source Review</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={createReadyTasksState?.disabled}
                title={createReadyTasksState?.title}
                onClick={() => onCreateReadyTasks(board.id)}
              >
                <ClipboardPaste size={14} />
                <span>{createReadyTasksState?.label}</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={createCardBusy}
                title="Create a blank candidate card in the Draft Inbox for manual PM triage."
                onClick={() => onCreateCard(board.id)}
              >
                <Plus size={14} />
                <span>{createCardBusy ? "Creating" : "New Draft Card"}</span>
              </button>
            </>
          )}
        </div>
      </header>
      {planningSnapshotState && planningSnapshotState.kind !== "no_snapshot" && (
        <section className={`project-board-planning-snapshot-state ${planningSnapshotState.tone}`} aria-label="Planning snapshot ticketization state">
          {planningSnapshotState.kind === "planning_running" ? <Clock size={15} /> : <CheckCircle2 size={15} />}
          <div>
            <strong>{planningSnapshotState.label}</strong>
            <p>{planningSnapshotState.detail}</p>
          </div>
          <span className={`project-board-status ${planningSnapshotState.tone === "warning" ? "warning" : planningSnapshotState.tone === "ready" ? "ready" : ""}`}>
            {planningSnapshotState.statusLabel}
          </span>
        </section>
      )}
      <section className="project-board-draft-controls" aria-label="Draft Inbox search and bulk controls">
        <div className="project-board-draft-search-row">
          <label className="project-board-search-field">
            <Search size={15} />
            <input
              type="search"
              value={query}
              placeholder="Search title, phase, source, decision id, dependency, or proof text"
              aria-label="Search Draft Inbox candidates"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </label>
          <label className="project-board-draft-toggle" title="Hide rejected, duplicate, and covered cards from the working columns.">
            <input type="checkbox" checked={includeSkipped} onChange={(event) => onIncludeSkippedChange(event.currentTarget.checked)} />
            <span>Show skipped</span>
          </label>
        </div>
        <div className="project-board-draft-filter-row" aria-label="Draft Inbox filters">
          <ListFilter size={15} />
          {filterOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={filterId === option.id ? "active" : ""}
              title={option.title}
              onClick={() => onFilterChange(option.id)}
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </button>
          ))}
        </div>
        <div className="project-board-draft-bulk-row">
          <span>
            {selectedBulkCards.length} selected · {createReadyPreview.ticketizableCards.length} ready to create · {createReadyPreview.markReadyCards.length} can be marked ready
          </span>
          <div className="project-board-card-actions">
            <button type="button" className="secondary-button" disabled={visibleCards.length === 0} title="Select every visible candidate card." onClick={selectVisibleCards}>
              <Check size={14} />
              <span>Select visible</span>
            </button>
            <button type="button" className="secondary-button" disabled={selectedBulkCards.length === 0} title="Clear the current bulk selection." onClick={clearBulkSelection}>
              <X size={14} />
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={selectedBulkReadyCandidates.length === 0}
              title={
                selectedBulkReadyCandidates.length === 0
                  ? "Select candidates that have no open decisions, proof gaps, claim conflicts, or strict proof warnings."
                  : `Mark ${selectedBulkReadyCandidates.length} selected candidate${selectedBulkReadyCandidates.length === 1 ? "" : "s"} Ready To Create.`
              }
              onClick={() => markCardsReady(selectedBulkReadyCandidates)}
            >
              <CheckCircle2 size={14} />
              <span>Ready selected</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={markAllReadyCandidates.length === 0}
              title={
                markAllReadyCandidates.length === 0
                  ? "No visible candidates can be safely marked Ready To Create."
                  : `Mark ${markAllReadyCandidates.length} visible eligible candidate${markAllReadyCandidates.length === 1 ? "" : "s"} Ready To Create.`
              }
              onClick={() => markCardsReady(markAllReadyCandidates)}
            >
              <CheckCircle2 size={14} />
              <span>Ready eligible</span>
            </button>
          </div>
        </div>
      </section>
      {piUpdateQueue?.visible && (
        <ProjectBoardPiUpdateReviewPanel
          queue={piUpdateQueue}
          busyAction={piUpdateQueueBusy}
          showDetails={showPiUpdateQueueDetails}
          onToggleDetails={() => setShowPiUpdateQueueDetails((current) => !current)}
          onShowImpactFilter={() => onFilterChange("stale_impact")}
          onSelectCard={onSelectCard}
          onResolveItems={resolvePiUpdateItems}
        />
      )}
      <ProjectBoardDraftCreateReadyPreviewPanel
        preview={createReadyPreview}
        showSkipped={showSkippedPreview}
        onToggleSkipped={() => setShowSkippedPreview((current) => !current)}
      />
      {partialStatus?.hasPartialProposal && (
        <div className={`project-board-partial-warning ${partialStatus.deferred ? "deferred" : ""}`}>
          <AlertCircle size={15} />
          <p>
            <strong>{partialStatus.deferred ? "Draft inbox is based on a deferred partial synthesis." : "Draft inbox is based on a partial synthesis."}</strong>{" "}
            {partialStatus.summary} Review or approve the available candidates, but retry failed sections before assuming the whole project source set has been decomposed.
          </p>
        </div>
      )}
      <div className="project-board-draft-grid">
        {columns.map((column) => {
          const moveState = projectBoardDraftColumnMoveState(column, draggingCard, board);
          const activeDropTarget = draggingCard && dragTargetColumnId === column.id;
          return (
            <section
              className={`project-board-draft-column ${draggingCard ? "dragging-card" : ""} ${activeDropTarget ? `drop-target ${moveState.disabled ? "drop-blocked" : `drop-${moveState.tone}`}` : ""}`}
              key={column.id}
              title={moveState.title}
              aria-label={`${column.title}. ${moveState.title}`}
              onDragEnter={(event) => updateColumnDropEffect(event, column)}
              onDragOver={(event) => updateColumnDropEffect(event, column)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTargetColumnId(undefined);
              }}
              onDrop={(event) => dropCardIntoColumn(event, column.id)}
            >
              <header>
                <div>
                  <span>{column.title}</span>
                  <small className={`project-board-draft-drop-hint ${activeDropTarget ? moveState.tone : ""}`}>{moveState.label}</small>
                </div>
                <strong>{column.cards.length}</strong>
              </header>
              <div className="project-board-card-list">
                {column.cards.length > 0 ? (
                  column.cards.map((card) => (
                    <ProjectBoardDraftCardView
                      card={card}
                      key={card.id}
                      selected={selectedCardId === card.id}
                      focusRef={selectedCardId === card.id ? selectedCardElementRef : undefined}
                      bulkSelected={selectedBulkCardIds.has(card.id)}
                      board={board}
                      onSelectCard={onSelectCard}
                      onToggleBulkSelected={toggleBulkCard}
                      onDragStart={(event) => {
                        setDraggingCardId(card.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-project-board-card-id", card.id);
                        event.dataTransfer.setData("text/plain", card.id);
                      }}
                      onDragEnd={clearDragState}
                      onApproveCard={onApproveCard}
                      onSplitCard={onSplitCard}
                      onUpdateCardCandidate={onUpdateCardCandidate}
                    />
                  ))
                ) : (
                  <div className="project-board-column-empty">{projectBoardDraftColumnEmptyText(column.title)}</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}


export function ProjectBoardPiUpdateReviewPanel({
  queue,
  busyAction,
  showDetails,
  onToggleDetails,
  onShowImpactFilter,
  onSelectCard,
  onResolveItems,
}: {
  queue: ProjectBoardPiUpdateReviewQueue;
  busyAction?: "apply" | "ignore";
  showDetails: boolean;
  onToggleDetails: () => void;
  onShowImpactFilter: () => void;
  onSelectCard: (cardId: string) => void;
  onResolveItems: (action: "apply" | "ignore", items: ProjectBoardPiUpdateReviewQueue["actionableItems"]) => Promise<void> | void;
}) {
  const previewItems = showDetails ? queue.items : queue.items.slice(0, 4);
  const hiddenCount = Math.max(0, queue.items.length - previewItems.length);
  const busy = Boolean(busyAction);
  return (
    <section className="project-board-pi-update-review" aria-label="Pi update review queue">
      <header>
        <div>
          <span className="project-board-kicker">Pi update review</span>
          <h4>{queue.headline}</h4>
          <p>{queue.detail}</p>
        </div>
        <div className="project-board-card-actions">
          <button type="button" className="secondary-button" title="Show only candidates with staged Pi updates or stale impact markers." onClick={onShowImpactFilter}>
            <ListFilter size={14} />
            <span>Show impacted</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={queue.items.length <= 4}
            title={showDetails ? "Collapse the staged update queue." : "Show every staged update in this queue."}
            onClick={onToggleDetails}
          >
            <ChevronDown size={14} className={showDetails ? "rotated" : ""} />
            <span>{showDetails ? "Collapse" : "Show all"}</span>
          </button>
        </div>
      </header>
      <div className="project-board-pi-update-metrics" aria-label="Pi update sources">
        <span title="Draft cards updated by PM decision targeted refreshes."><strong>{queue.decisionCount}</strong> Decisions</span>
        <span title="Draft cards updated by source-authority targeted refreshes."><strong>{queue.sourceCount}</strong> Sources</span>
        <span title="Draft cards updated by proof-suggestion refreshes."><strong>{queue.proofCount}</strong> Proof</span>
        <span title="Draft cards updated by other planner refreshes."><strong>{queue.planningCount}</strong> Other</span>
      </div>
      <div className="project-board-pi-update-bulk-actions">
        <span>{queue.actionableItems.length} reviewable before ticketization</span>
        <div className="project-board-card-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || queue.actionableItems.length === 0}
            title="Dismiss every staged update and keep the current user-owned draft fields."
            onClick={() => void onResolveItems("ignore", queue.actionableItems)}
          >
            <X size={14} />
            <span>{busyAction === "ignore" ? "Ignoring" : "Ignore all"}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || queue.actionableItems.length === 0}
            title="Apply every staged update to draft cards before ticketization."
            onClick={() => void onResolveItems("apply", queue.actionableItems)}
          >
            <Check size={14} />
            <span>{busyAction === "apply" ? "Applying" : "Apply all"}</span>
          </button>
        </div>
      </div>
      <div className="project-board-pi-update-review-list">
        {previewItems.map((item) => (
          <article className={`project-board-pi-update-review-item ${item.sourceKind} ${item.actionable ? "" : "blocked"}`} key={item.card.id}>
            <div>
              <span>{item.sourceLabel}</span>
              <strong>{item.card.title}</strong>
              <small>{item.changedFieldLabels.join(", ")}</small>
            </div>
            <ul>
              {item.previewLines.slice(0, 3).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {item.blocker && <li>{item.blocker}</li>}
            </ul>
            <div className="project-board-card-actions">
              <button type="button" className="secondary-button" title="Open this candidate in the inspector." onClick={() => onSelectCard(item.card.id)}>
                <Search size={14} />
                <span>Inspect</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !item.actionable}
                title={item.actionable ? "Dismiss this staged update and keep the current card." : item.blocker}
                onClick={() => void onResolveItems("ignore", [item])}
              >
                <X size={14} />
                <span>Ignore</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !item.actionable}
                title={item.actionable ? "Apply this staged update to the draft card." : item.blocker}
                onClick={() => void onResolveItems("apply", [item])}
              >
                <Check size={14} />
                <span>Apply</span>
              </button>
            </div>
          </article>
        ))}
        {hiddenCount > 0 && <p>{hiddenCount} more staged update{hiddenCount === 1 ? "" : "s"} hidden.</p>}
      </div>
    </section>
  );
}


export function ProjectBoardDraftCreateReadyPreviewPanel({
  preview,
  showSkipped,
  onToggleSkipped,
}: {
  preview: ProjectBoardDraftInboxCreateReadyPreview;
  showSkipped: boolean;
  onToggleSkipped: () => void;
}) {
  const skippedPreview = preview.skippedCards.slice(0, 8);
  return (
    <section className="project-board-create-ready-preview" aria-label="Create ready task preview">
      <header>
        <div>
          <span className="project-board-kicker">Create-ready preview</span>
          <h4>{preview.ticketizableCards.length} candidate{preview.ticketizableCards.length === 1 ? "" : "s"} will become Local Tasks</h4>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={preview.skippedCards.length === 0}
          title={preview.skippedCards.length === 0 ? "No skipped candidates to show." : "Show skipped cards and their blocker reasons."}
          onClick={onToggleSkipped}
        >
          <ChevronDown size={14} className={showSkipped ? "rotated" : ""} />
          <span>{showSkipped ? "Hide skipped" : "Show skipped"}</span>
        </button>
      </header>
      <div className="project-board-create-ready-metrics">
        <span title="Candidate cards that match the exact bulk Create Ready Tasks policy.">
          <strong>{preview.ticketizableCards.length}</strong>
          Ready now
        </span>
        <span title="Candidates that can be moved to Ready To Create without a Pi call.">
          <strong>{preview.markReadyCards.length}</strong>
          Can mark ready
        </span>
        <span title="Cards with open canonical clarification decisions.">
          <strong>{preview.decisionBlockedCount}</strong>
          Decisions
        </span>
        <span title="Cards missing proof expectations required by the board proof policy.">
          <strong>{preview.proofGapCount}</strong>
          Proof gaps
        </span>
        <span title="Cards with dependency blockers that will become Local Task blockers after ticketization.">
          <strong>{preview.dependencyBlockerCount}</strong>
          Dependencies
        </span>
        <span title="Cards with pending Pi updates or stale impact markers.">
          <strong>{preview.staleImpactCount}</strong>
          Pi updates
        </span>
      </div>
      {showSkipped && (
        <div className="project-board-create-ready-skipped">
          {skippedPreview.length > 0 ? (
            skippedPreview.map((item) => (
              <article key={item.card.id}>
                <strong>{item.card.title}</strong>
                <ul>
                  {item.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </article>
            ))
          ) : (
            <div className="project-board-column-empty">No skipped candidates match the current preview.</div>
          )}
          {preview.skippedCards.length > skippedPreview.length && (
            <p>{preview.skippedCards.length - skippedPreview.length} more skipped candidate{preview.skippedCards.length - skippedPreview.length === 1 ? "" : "s"} hidden.</p>
          )}
        </div>
      )}
    </section>
  );
}


export function ProjectBoardDraftCardView({
  card,
  selected,
  focusRef,
  bulkSelected,
  board,
  onSelectCard,
  onToggleBulkSelected,
  onDragStart,
  onDragEnd,
  onApproveCard,
  onSplitCard,
  onUpdateCardCandidate,
}: {
  card: ProjectBoardCard;
  selected: boolean;
  focusRef?: RefObject<HTMLElement | null>;
  bulkSelected: boolean;
  board?: NonNullable<ProjectSummary["board"]>;
  onSelectCard: (cardId: string) => void;
  onToggleBulkSelected: (cardId: string) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onSplitCard: (cardId: string) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
}) {
  const canSplit = projectBoardCardCanSplit(card);
  const canMarkReady = projectBoardCardCanMarkReady(card, board);
  const clarificationItems = projectBoardCandidateClarificationItems(card, board);
  const primaryClarification = clarificationItems[0];
  const primaryClarificationText = primaryClarification ? `${primaryClarification.label}: ${primaryClarification.detail}` : "";
  const planningWarnings = projectBoardPlanningWarningsForCard(card, board);
  const proofGateTitle = "Add at least one proof expectation before marking this card ready.";
  const proofScopeTitle = projectBoardPlanningWarningActionTitle(planningWarnings);
  const markReadyTitle = canMarkReady
    ? proofScopeTitle ?? "Mark candidate ready"
    : proofGateTitle;
  const approveTitle = canMarkReady
    ? proofScopeTitle ?? "Approve candidate card"
    : proofGateTitle;
  const dependencyBadges = board ? projectBoardCardDependencyBadges(card, board.cards, { executionArtifacts: board.executionArtifacts }) : undefined;
  return (
    <ProjectBoardCardShell
      card={card}
      meta={projectBoardCandidateStatusLabel(card.candidateStatus)}
      selected={selected}
      focusRef={focusRef}
      allCards={board?.cards}
      dependencyBadges={dependencyBadges}
      onSelectDependencyCard={onSelectCard}
      role="button"
      tabIndex={0}
      draggable
      title="Click to inspect this candidate. Drag it between Draft Inbox columns to change triage state."
      onClick={() => onSelectCard(card.id)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectCard(card.id);
      }}
    >
      <label className="project-board-card-select" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={bulkSelected}
          aria-label={`Select ${card.title} for bulk Draft Inbox actions`}
          onChange={() => onToggleBulkSelected(card.id)}
        />
        <span>Bulk select</span>
      </label>
      <div className="project-board-drag-affordance" aria-hidden="true">
        <Kanban size={13} />
        <span>Click for inspector · drag to triage</span>
      </div>
      {primaryClarification && (
        <div className={`project-board-clarification-summary ${primaryClarification.tone}`} title={primaryClarificationText} data-ui-allow-truncation="true">
          <Info size={13} />
          <span title={primaryClarificationText}>
            <strong>{primaryClarification.label}:</strong> {primaryClarification.detail}
          </span>
        </div>
      )}
      {planningWarnings.length > 0 && (
        <ProjectBoardProofScopeWarningSummary warnings={planningWarnings} compact />
      )}
      <div className="project-board-card-actions" onClick={(event) => event.stopPropagation()}>
        {card.candidateStatus === "ready_to_create" ? (
          <button type="button" className="project-board-card-action" disabled={!canMarkReady} title={approveTitle} onClick={() => onApproveCard(card)}>
            <Check size={14} />
            <span>Approve</span>
          </button>
        ) : (
          <button type="button" className="project-board-card-action" disabled={!canMarkReady} title={markReadyTitle} onClick={() => onUpdateCardCandidate(card, "ready_to_create")}>
            <Check size={14} />
            <span>Mark Ready</span>
          </button>
        )}
        {card.candidateStatus !== "rejected" && (
          <button type="button" className="project-board-card-action secondary" title="Reject this candidate or mark it as duplicate work." onClick={() => onUpdateCardCandidate(card, "rejected")}>
            <X size={14} />
            <span>Reject</span>
          </button>
        )}
        {!canMarkReady && (
          <span className="project-board-proof-required">
            <AlertCircle size={13} />
            Proof required
          </span>
        )}
        <button type="button" className="project-board-card-action secondary" title="Open this candidate in the detail inspector." onClick={() => onSelectCard(card.id)}>
          <FileText size={14} />
          <span>Details</span>
        </button>
        {card.candidateStatus !== "needs_clarification" && (
          <button type="button" className="project-board-card-action secondary" title="Move this card to Needs Clarification." onClick={() => onUpdateCardCandidate(card, "needs_clarification")}>
            <Info size={14} />
            <span>Needs Info</span>
          </button>
        )}
        {card.candidateStatus !== "evidence" && (
          <button type="button" className="project-board-card-action secondary" title="Move this candidate to Covered / Done because the work is already represented or no longer needs execution." onClick={() => onUpdateCardCandidate(card, "evidence")}>
            <CheckCircle2 size={14} />
            <span>Mark Covered</span>
          </button>
        )}
        {canSplit && (
          <button type="button" className="project-board-card-action secondary" title="Split acceptance criteria into smaller candidate cards." onClick={() => onSplitCard(card.id)}>
            <GitBranch size={14} />
            <span>Split</span>
          </button>
        )}
      </div>
    </ProjectBoardCardShell>
  );
}


export function ProjectBoardKickoffInterview({
  board,
  finalizeBusy,
  suggestDefaultsBusy,
  questions,
  onAnswerQuestion,
  onFinalizeKickoff,
  onCancelRevision,
  onSuggestKickoffDefaults,
  onReviewIgnoredThreads,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  finalizeBusy: boolean;
  suggestDefaultsBusy: boolean;
  questions: ProjectBoardQuestion[];
  onAnswerQuestion: (question: ProjectBoardQuestion, answer: string) => void;
  onFinalizeKickoff: (boardId: string) => void;
  onCancelRevision: (boardId: string) => void;
  onSuggestKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void> | void;
  onReviewIgnoredThreads: (sourceId?: string) => void;
}) {
  const isRevision = (board.charter?.version ?? 1) > 1;
  const firstUnansweredIndex = questions.findIndex((question) => !question.answer);
  const initialQuestionIndex = isRevision ? 0 : firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length;
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(initialQuestionIndex);
  const activeQuestion = questions[activeQuestionIndex];
  const activeSuggestion = activeQuestion?.suggestedAnswer?.trim() ?? "";
  const activeProviderError = projectBoardKickoffDefaultProviderErrorMessage(activeQuestion?.suggestedAnswerProviderError);
  const activeDraftingStatus = projectBoardKickoffDefaultDraftingStatus(board, activeQuestion?.id);
  const activeSuggestionFresh = Boolean(activeSuggestion && !activeQuestion?.suggestedAnswerStale);
  const activeStaticDefault = activeQuestion ? projectBoardKickoffDefaultAnswer(board, activeQuestion, activeQuestionIndex) : "";
  const activeDraftDefault = activeQuestion?.answer ?? (activeSuggestionFresh ? activeSuggestion : activeStaticDefault);
  const [draft, setDraft] = useState(activeDraftDefault);
  // Tracks whether the user has typed into the active answer. Without this, a kickoff
  // defaults run completing in the background changes activeDraftDefault and the sync
  // effect would overwrite the user's in-progress answer with the suggestion.
  const [draftDirty, setDraftDirty] = useState(false);
  const unansweredQuestionIds = questions.filter((question) => !question.answer?.trim()).map((question) => question.id);
  const missingSuggestionQuestionIds = questions
    .filter((question) => !question.answer?.trim() && (!question.suggestedAnswer?.trim() || question.suggestedAnswerStale))
    .map((question) => question.id);
  const suggestedCount = questions.filter((question) => !question.answer?.trim() && question.suggestedAnswer?.trim()).length;
  const staleSuggestionCount = questions.filter((question) => !question.answer?.trim() && question.suggestedAnswer?.trim() && question.suggestedAnswerStale).length;

  useEffect(() => {
    const nextIndex = isRevision ? 0 : firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length;
    setActiveQuestionIndex(nextIndex);
  }, [board.id, board.charter?.id, firstUnansweredIndex, isRevision, questions.length]);

  useEffect(() => {
    setDraft(activeDraftDefault);
    setDraftDirty(false);
    // Reset only when the question changes; a changing default must not clobber typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (!draftDirty) setDraft(activeDraftDefault);
  }, [activeDraftDefault, draftDirty]);

  const answered = questions.filter((question) => question.answer?.trim()).length;
  const displayStep = questions.length === 0 ? 0 : activeQuestion ? activeQuestionIndex + 1 : questions.length;
  const currentSection = activeQuestion ? projectBoardQuestionSectionLabel(activeQuestion, activeQuestionIndex) : undefined;
  const ignoredThreads = board.sources.filter((source) => source.kind === "thread" && !projectBoardSourceInclusion(source).included);
  const ignoredThreadCount = ignoredThreads.length;
  const canMoveNext = Boolean(activeQuestion && draft.trim());
  const statusText =
    board.status === "active"
      ? "Charter active"
      : !activeQuestion
        ? "Ready to activate"
        : isRevision || activeQuestion.answer?.trim()
          ? "Review answer"
          : "Needs input";
  const moveNext = () => {
    if (!activeQuestion || !draft.trim()) return;
    const trimmed = draft.trim();
    if (trimmed !== activeQuestion.answer?.trim()) onAnswerQuestion(activeQuestion, trimmed);
    const nextIndex = Math.min(activeQuestionIndex + 1, questions.length);
    setActiveQuestionIndex(nextIndex);
  };
  const requestDefaults = async (questionIds: string[]) => {
    const targetIds = questionIds.filter(Boolean);
    if (suggestDefaultsBusy || targetIds.length === 0) return;
    try {
      await onSuggestKickoffDefaults({ boardId: board.id, questionIds: targetIds });
    } catch {
      // The top-level project board error banner carries provider failures.
    }
  };
  const showReady = !activeQuestion;
  return (
    <section className={`project-board-kickoff ${board.status === "draft" && activeQuestion ? "needs-input" : ""}`} aria-label="Project board kickoff interview">
      <header>
        <div>
          <span className="project-board-kicker">{isRevision ? "Charter revision interview" : "Kickoff interview"}</span>
          <h3>{displayStep} of {questions.length}</h3>
          {board.status === "draft" && (
            <p>
              {isRevision
                ? "Review or adjust the existing answers before applying this charter revision."
                : "Answer these questions to create the project charter."}{" "}
              {answered} answered. The execution board stays empty until the charter is active and draft candidates are ticketized.
            </p>
          )}
        </div>
        {questions.length > 0 && (
          <div className="project-board-kickoff-actions">
            <span className="project-board-status">{statusText}</span>
            {board.status === "draft" && unansweredQuestionIds.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                disabled={suggestDefaultsBusy || missingSuggestionQuestionIds.length === 0}
                title={
                  missingSuggestionQuestionIds.length === 0
                    ? "All unanswered kickoff questions already have current Ambient/Pi defaults."
                    : "Ask Ambient/Pi for editable source-derived defaults for unanswered kickoff questions."
                }
                onClick={() => void requestDefaults(missingSuggestionQuestionIds)}
              >
                <Bot size={14} className={suggestDefaultsBusy ? "spin" : ""} />
                <span>{suggestDefaultsBusy ? "Suggesting" : staleSuggestionCount > 0 ? "Regenerate Defaults" : "Suggest Defaults"}</span>
              </button>
            )}
          </div>
        )}
      </header>
      {activeQuestion ? (
        <div className="project-board-question">
          <label>
            <span>{activeQuestion.question}</span>
            {currentSection && <em>Updates charter section: {currentSection}</em>}
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setDraftDirty(true);
              }}
              placeholder="Answer for the project charter"
            />
          </label>
          {!activeQuestion.answer?.trim() && activeSuggestion && (
            <div className="project-board-kickoff-default" aria-label="Suggested kickoff default">
              <div>
                <Bot size={14} />
                <strong>Ambient/Pi editable default</strong>
                <span className={`project-board-kickoff-default-badge ${activeQuestion.suggestedAnswerStale ? "stale" : ""}`}>
                  {activeQuestion.suggestedAnswerStale ? "Needs review" : activeQuestion.suggestedAnswerConfidence ?? "Suggested"}
                </span>
              </div>
              <p className="project-board-kickoff-default-answer">{activeSuggestion}</p>
              {activeQuestion.suggestedAnswerRationale && <p className="project-board-kickoff-default-rationale">{activeQuestion.suggestedAnswerRationale}</p>}
              {activeQuestion.suggestedAnswerStale && (
                <p className="project-board-kickoff-default-warning">
                  This suggestion was generated before the latest source or question changes. Review it, regenerate it, or use it as a draft.
                </p>
              )}
              {activeQuestion.suggestedAnswerSourceIds && activeQuestion.suggestedAnswerSourceIds.length > 0 && (
                <p className="project-board-kickoff-default-sources">
                  {activeQuestion.suggestedAnswerSourceIds.length} cited source{activeQuestion.suggestedAnswerSourceIds.length === 1 ? "" : "s"}
                </p>
              )}
              <div className="project-board-kickoff-default-actions">
                <button
                  type="button"
                  className="secondary-button"
                  title={
                    activeQuestion.suggestedAnswerStale
                      ? "Copy this older Ambient/Pi suggestion into the editable draft answer so you can review or revise it."
                      : "Use this Ambient/Pi default as the editable draft answer."
                  }
                  onClick={() => {
                    setDraft(activeSuggestion);
                    setDraftDirty(true);
                  }}
                >
                  <RotateCcw size={14} />
                  <span>{activeQuestion.suggestedAnswerStale ? "Use Anyway" : "Use Default"}</span>
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={suggestDefaultsBusy}
                  title="Regenerate this default from the current source scan."
                  onClick={() => void requestDefaults([activeQuestion.id])}
                >
                  <RefreshCw size={14} className={suggestDefaultsBusy ? "spin" : ""} />
                  <span>Regenerate</span>
                </button>
              </div>
            </div>
          )}
          {!activeQuestion.answer?.trim() && !activeSuggestion && activeProviderError && (
            <div className="project-board-kickoff-default warning" aria-label="Kickoff default unavailable">
              <div>
                <Bot size={14} />
                <strong>Ambient/Pi default unavailable</strong>
              </div>
              <p className="project-board-kickoff-default-answer">{activeProviderError}</p>
              <button
                type="button"
                className="secondary-button"
                disabled={suggestDefaultsBusy}
                title="Retry Ambient/Pi default generation for this question."
                onClick={() => void requestDefaults([activeQuestion.id])}
              >
                <RefreshCw size={14} className={suggestDefaultsBusy ? "spin" : ""} />
                <span>Retry</span>
              </button>
            </div>
          )}
          {!activeQuestion.answer?.trim() && !activeSuggestion && !activeProviderError && activeDraftingStatus && (
            <div className="project-board-kickoff-default streaming" aria-label="Kickoff default drafting">
              <div>
                <Bot size={14} />
                <strong>Ambient/Pi is drafting</strong>
                <span className="project-board-kickoff-default-badge">Live</span>
              </div>
              <p className="project-board-kickoff-default-answer">{activeDraftingStatus}</p>
            </div>
          )}
          <div className="project-board-question-actions">
            {isRevision && (
              <button
                type="button"
                className="secondary-button"
                title="Cancel this draft charter revision and restore the previous active charter."
                onClick={() => onCancelRevision(board.id)}
              >
                <X size={14} />
                <span>Cancel Revision</span>
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={!canMoveNext}
              title={canMoveNext ? "Save this charter answer and move to the next section." : "Enter an answer before moving to the next charter section."}
              onClick={moveNext}
            >
              <Check size={14} />
              <span>{activeQuestionIndex >= questions.length - 1 ? "Finish Questions" : "Next"}</span>
            </button>
          </div>
        </div>
      ) : showReady && board.status === "draft" ? (
        <div className="project-board-kickoff-ready">
          {suggestedCount > 0 && (
            <span className="project-board-status ready">
              {suggestedCount} Pi default{suggestedCount === 1 ? "" : "s"} reviewed
            </span>
          )}
          {ignoredThreadCount > 0 && (
            <button
              type="button"
              className="project-board-source-authority-callout compact interactive"
              aria-label="Review ignored threads before activation"
              title="Jump to the ignored thread in Source review."
              onClick={() => onReviewIgnoredThreads(ignoredThreads[0]?.id)}
            >
              <Info size={15} />
              <div>
                <strong>{ignoredThreadCount} ignored thread{ignoredThreadCount === 1 ? "" : "s"} before activation</strong>
                <p>Open Source review and include any ignored thread that should influence synthesis before activating this charter.</p>
              </div>
            </button>
          )}
          <p className="project-board-kickoff-complete">The charter answers are captured. Activate the board to freeze the charter, unlock ticketized execution, and make ready candidates eligible for Local Task creation.</p>
          <div className="project-board-card-actions">
            {isRevision && (
              <button
                type="button"
                className="secondary-button"
                title="Cancel this draft charter revision and restore the previous active charter."
                onClick={() => onCancelRevision(board.id)}
              >
                <X size={14} />
                <span>Cancel Revision</span>
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={finalizeBusy}
              title="Activate this charter so ready candidate cards can be ticketized into Local Tasks."
              onClick={() => onFinalizeKickoff(board.id)}
            >
              <CheckCircle2 size={14} className={finalizeBusy ? "spin" : ""} />
              <span>{finalizeBusy ? (isRevision ? "Applying Revision" : "Activating Board") : isRevision ? "Apply Revision" : "Activate Board"}</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="project-board-kickoff-complete">The project charter is active and will guide future board cards.</p>
      )}
    </section>
  );
}


export function projectBoardQuestionSectionLabel(question: ProjectBoardQuestion, index: number): string {
  const text = question.question.toLowerCase();
  if (text.includes("primary outcome") || text.includes("goal")) return "Project goal";
  if (text.includes("source") || text.includes("authority")) return "Source authority";
  if (text.includes("proof") || text.includes("test") || text.includes("quality")) return "Proof bar";
  if (text.includes("decision") || text.includes("judgment") || text.includes("ambiguous")) return "Judgment policy";
  if (text.includes("dependency") || text.includes("order")) return "Dependency policy";
  if (text.includes("scope") || text.includes("non-goal")) return "Scope boundaries";
  return ["Project goal", "Source authority", "Judgment policy", "Proof bar", "Execution policy"][index] ?? "Project charter";
}
