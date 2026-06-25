import { AlertCircle, Check, ChevronDown, ListFilter, Plus, RefreshCw, Search, X } from "lucide-react";
import { DragEvent as ReactDragEvent, useEffect, useMemo, useRef, useState } from "react";

import { projectBoardSynthesisPartialStatus } from "../../shared/projectBoardSynthesisRecovery";
import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardGitSyncStatus,
  ProjectBoardSynthesisRun,
  ProjectSummary,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardSourceDraftsInput,
  ResolveProjectBoardCardPiUpdateInput,
  UpdateProjectBoardCardInput,
} from "../../shared/projectBoardTypes";
import { ProjectBoardCandidateDetail } from "./ProjectBoardCandidateDetailViews";
import {
  ProjectBoardDraftBoardControls,
  ProjectBoardDraftBoardHeader,
  ProjectBoardDraftColumnsGrid,
  ProjectBoardDraftCreateReadyPreviewPanel,
} from "./ProjectBoardDraftBoardSections";
import { ProjectBoardSourceImpactPreviewPanel, projectBoardSourceChangeStateLabel } from "./ProjectBoardSourceViews";
import { projectBoardCardCanMarkReady } from "./projectBoardCardEditUiModel";
import {
  projectBoardAddCardsSourceScope,
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
export {
  ProjectBoardKickoffInterview,
  projectBoardKickoffDefaultDraftingStatus,
  projectBoardQuestionSectionLabel,
} from "./ProjectBoardDraftKickoffInterview";
export { ProjectBoardDraftCardView, ProjectBoardDraftCreateReadyPreviewPanel } from "./ProjectBoardDraftBoardSections";

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
    () => sourceGroups.filter((group) => selectedGroupIds.has(group.id)).flatMap((group) => group.observations.map((source) => source.id)),
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
          scope.selectedGroupCount > 0
            ? ` using ${scope.selectedGroupCount} selected source group${scope.selectedGroupCount === 1 ? "" : "s"}`
            : ""
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
        <span>
          {scope.selectedObservationCount} observation{scope.selectedObservationCount === 1 ? "" : "s"}
        </span>
        <span>
          {sourceGroups.length} source group{sourceGroups.length === 1 ? "" : "s"}
        </span>
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
            <span title={projectBoardSourceInclusion(activeGroup.primary).detail}>
              {projectBoardSourceInclusion(activeGroup.primary).badgeLabel}
            </span>
            <span>
              {activeGroup.primary.path || activeGroup.primary.threadId || activeGroup.primary.artifactId || activeGroup.primary.id}
            </span>
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
  const clearDragTarget = () => setDragTargetColumnId(undefined);
  const startCardDrag = (event: ReactDragEvent<HTMLElement>, card: ProjectBoardCard) => {
    setDraggingCardId(card.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-project-board-card-id", card.id);
    event.dataTransfer.setData("text/plain", card.id);
  };
  const updateColumnDropEffect = (event: ReactDragEvent<HTMLElement>, column: ReturnType<typeof projectBoardDraftColumns>[number]) => {
    const cardId =
      draggingCardId || event.dataTransfer.getData("application/x-project-board-card-id") || event.dataTransfer.getData("text/plain");
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
      <ProjectBoardDraftBoardHeader
        count={count}
        allCandidateCount={allCandidateCount}
        board={board}
        createCardBusy={createCardBusy}
        createReadyTasksBusy={createReadyTasksBusy}
        onOpenSourcePicker={onOpenSourcePicker}
        onReviewSources={onReviewSources}
        onCreateReadyTasks={onCreateReadyTasks}
        onCreateCard={onCreateCard}
      />
      <ProjectBoardDraftBoardControls
        query={query}
        includeSkipped={includeSkipped}
        filterOptions={filterOptions}
        filterId={filterId}
        selectedBulkCardsCount={selectedBulkCards.length}
        ticketizableCardsCount={createReadyPreview.ticketizableCards.length}
        markReadyCardsCount={createReadyPreview.markReadyCards.length}
        visibleCardsCount={visibleCards.length}
        selectedBulkReadyCandidatesCount={selectedBulkReadyCandidates.length}
        markAllReadyCandidatesCount={markAllReadyCandidates.length}
        onQueryChange={onQueryChange}
        onIncludeSkippedChange={onIncludeSkippedChange}
        onFilterChange={onFilterChange}
        onSelectVisibleCards={selectVisibleCards}
        onClearBulkSelection={clearBulkSelection}
        onReadySelected={() => markCardsReady(selectedBulkReadyCandidates)}
        onReadyEligible={() => markCardsReady(markAllReadyCandidates)}
      />
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
            <strong>
              {partialStatus.deferred
                ? "Draft inbox is based on a deferred partial synthesis."
                : "Draft inbox is based on a partial synthesis."}
            </strong>{" "}
            {partialStatus.summary} Review or approve the available candidates, but retry failed sections before assuming the whole project
            source set has been decomposed.
          </p>
        </div>
      )}
      <ProjectBoardDraftColumnsGrid
        columns={columns}
        board={board}
        selectedCardId={selectedCardId}
        draggingCard={draggingCard}
        dragTargetColumnId={dragTargetColumnId}
        selectedBulkCardIds={selectedBulkCardIds}
        selectedCardElementRef={selectedCardElementRef}
        onSelectCard={onSelectCard}
        onToggleBulkCard={toggleBulkCard}
        onDragStartCard={startCardDrag}
        onClearDragTarget={clearDragTarget}
        onClearDragState={clearDragState}
        onUpdateColumnDropEffect={updateColumnDropEffect}
        onDropCardIntoColumn={dropCardIntoColumn}
        onApproveCard={onApproveCard}
        onSplitCard={onSplitCard}
        onUpdateCardCandidate={onUpdateCardCandidate}
      />
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
          <button
            type="button"
            className="secondary-button"
            title="Show only candidates with staged Pi updates or stale impact markers."
            onClick={onShowImpactFilter}
          >
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
        <span title="Draft cards updated by PM decision targeted refreshes.">
          <strong>{queue.decisionCount}</strong> Decisions
        </span>
        <span title="Draft cards updated by source-authority targeted refreshes.">
          <strong>{queue.sourceCount}</strong> Sources
        </span>
        <span title="Draft cards updated by proof-suggestion refreshes.">
          <strong>{queue.proofCount}</strong> Proof
        </span>
        <span title="Draft cards updated by other planner refreshes.">
          <strong>{queue.planningCount}</strong> Other
        </span>
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
          <article
            className={`project-board-pi-update-review-item ${item.sourceKind} ${item.actionable ? "" : "blocked"}`}
            key={item.card.id}
          >
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
              <button
                type="button"
                className="secondary-button"
                title="Open this candidate in the inspector."
                onClick={() => onSelectCard(item.card.id)}
              >
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
        {hiddenCount > 0 && (
          <p>
            {hiddenCount} more staged update{hiddenCount === 1 ? "" : "s"} hidden.
          </p>
        )}
      </div>
    </section>
  );
}
