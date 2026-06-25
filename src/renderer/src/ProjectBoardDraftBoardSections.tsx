import {
  AlertCircle,
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
  Search,
  X,
} from "lucide-react";
import type { DragEvent as ReactDragEvent, RefObject } from "react";

import type { ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectSummary } from "../../shared/projectBoardTypes";
import { ProjectBoardProofScopeWarningSummary } from "./ProjectBoardCandidateDetailViews";
import {
  projectBoardCardCanMarkReady,
  projectBoardCardCanSplit,
  projectBoardCandidateClarificationItems,
} from "./projectBoardCardEditUiModel";
import { ProjectBoardCardShell, projectBoardCandidateStatusLabel, projectBoardDraftColumnEmptyText } from "./ProjectBoardLaneViews";
import {
  projectBoardCardDependencyBadges,
  projectBoardCreateReadyTasksState,
  projectBoardPlanningSnapshotTicketizationState,
} from "./projectBoardUiModel";
import {
  projectBoardDraftColumnMoveState,
  type ProjectBoardDraftColumnModel,
  type ProjectBoardDraftInboxCreateReadyPreview,
  type ProjectBoardDraftInboxFilterId,
  type ProjectBoardDraftInboxFilterOption,
} from "./projectBoardDraftInboxUiModel";
import { projectBoardPlanningWarningActionTitle, projectBoardPlanningWarningsForCard } from "./projectBoardPlanningWarningUiModel";

type ProjectBoardSummaryBoard = NonNullable<ProjectSummary["board"]>;

export function ProjectBoardDraftBoardHeader({
  count,
  allCandidateCount,
  board,
  createCardBusy,
  createReadyTasksBusy,
  onOpenSourcePicker,
  onReviewSources,
  onCreateReadyTasks,
  onCreateCard,
}: {
  count: number;
  allCandidateCount: number;
  board?: ProjectBoardSummaryBoard;
  createCardBusy: boolean;
  createReadyTasksBusy: boolean;
  onOpenSourcePicker: () => void;
  onReviewSources: () => void;
  onCreateReadyTasks: (boardId: string) => void;
  onCreateCard: (boardId: string) => void;
}) {
  const createReadyTasksState = board ? projectBoardCreateReadyTasksState(board, createReadyTasksBusy) : undefined;
  const planningSnapshotState = board ? projectBoardPlanningSnapshotTicketizationState(board) : undefined;
  return (
    <>
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
        <section
          className={`project-board-planning-snapshot-state ${planningSnapshotState.tone}`}
          aria-label="Planning snapshot ticketization state"
        >
          {planningSnapshotState.kind === "planning_running" ? <Clock size={15} /> : <CheckCircle2 size={15} />}
          <div>
            <strong>{planningSnapshotState.label}</strong>
            <p>{planningSnapshotState.detail}</p>
          </div>
          <span
            className={`project-board-status ${planningSnapshotState.tone === "warning" ? "warning" : planningSnapshotState.tone === "ready" ? "ready" : ""}`}
          >
            {planningSnapshotState.statusLabel}
          </span>
        </section>
      )}
    </>
  );
}

export function ProjectBoardDraftBoardControls({
  query,
  includeSkipped,
  filterOptions,
  filterId,
  selectedBulkCardsCount,
  ticketizableCardsCount,
  markReadyCardsCount,
  visibleCardsCount,
  selectedBulkReadyCandidatesCount,
  markAllReadyCandidatesCount,
  onQueryChange,
  onIncludeSkippedChange,
  onFilterChange,
  onSelectVisibleCards,
  onClearBulkSelection,
  onReadySelected,
  onReadyEligible,
}: {
  query: string;
  includeSkipped: boolean;
  filterOptions: ProjectBoardDraftInboxFilterOption[];
  filterId: ProjectBoardDraftInboxFilterId;
  selectedBulkCardsCount: number;
  ticketizableCardsCount: number;
  markReadyCardsCount: number;
  visibleCardsCount: number;
  selectedBulkReadyCandidatesCount: number;
  markAllReadyCandidatesCount: number;
  onQueryChange: (query: string) => void;
  onIncludeSkippedChange: (includeSkipped: boolean) => void;
  onFilterChange: (filterId: ProjectBoardDraftInboxFilterId) => void;
  onSelectVisibleCards: () => void;
  onClearBulkSelection: () => void;
  onReadySelected: () => void;
  onReadyEligible: () => void;
}) {
  return (
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
          {selectedBulkCardsCount} selected · {ticketizableCardsCount} ready to create · {markReadyCardsCount} can be marked ready
        </span>
        <div className="project-board-card-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={visibleCardsCount === 0}
            title="Select every visible candidate card."
            onClick={onSelectVisibleCards}
          >
            <Check size={14} />
            <span>Select visible</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={selectedBulkCardsCount === 0}
            title="Clear the current bulk selection."
            onClick={onClearBulkSelection}
          >
            <X size={14} />
            <span>Clear</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={selectedBulkReadyCandidatesCount === 0}
            title={
              selectedBulkReadyCandidatesCount === 0
                ? "Select candidates that have no open decisions, proof gaps, claim conflicts, or strict proof warnings."
                : `Mark ${selectedBulkReadyCandidatesCount} selected candidate${selectedBulkReadyCandidatesCount === 1 ? "" : "s"} Ready To Create.`
            }
            onClick={onReadySelected}
          >
            <CheckCircle2 size={14} />
            <span>Ready selected</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={markAllReadyCandidatesCount === 0}
            title={
              markAllReadyCandidatesCount === 0
                ? "No visible candidates can be safely marked Ready To Create."
                : `Mark ${markAllReadyCandidatesCount} visible eligible candidate${markAllReadyCandidatesCount === 1 ? "" : "s"} Ready To Create.`
            }
            onClick={onReadyEligible}
          >
            <CheckCircle2 size={14} />
            <span>Ready eligible</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProjectBoardDraftColumnsGrid({
  columns,
  board,
  selectedCardId,
  draggingCard,
  dragTargetColumnId,
  selectedBulkCardIds,
  selectedCardElementRef,
  onSelectCard,
  onToggleBulkCard,
  onDragStartCard,
  onClearDragTarget,
  onClearDragState,
  onUpdateColumnDropEffect,
  onDropCardIntoColumn,
  onApproveCard,
  onSplitCard,
  onUpdateCardCandidate,
}: {
  columns: ProjectBoardDraftColumnModel[];
  board?: ProjectBoardSummaryBoard;
  selectedCardId?: string;
  draggingCard?: ProjectBoardCard;
  dragTargetColumnId?: ProjectBoardDraftColumnModel["id"];
  selectedBulkCardIds: Set<string>;
  selectedCardElementRef: RefObject<HTMLElement | null>;
  onSelectCard: (cardId: string) => void;
  onToggleBulkCard: (cardId: string) => void;
  onDragStartCard: (event: ReactDragEvent<HTMLElement>, card: ProjectBoardCard) => void;
  onClearDragTarget: () => void;
  onClearDragState: () => void;
  onUpdateColumnDropEffect: (event: ReactDragEvent<HTMLElement>, column: ProjectBoardDraftColumnModel) => void;
  onDropCardIntoColumn: (event: ReactDragEvent<HTMLElement>, columnId: ProjectBoardDraftColumnModel["id"]) => void;
  onApproveCard: (card: ProjectBoardCard) => void;
  onSplitCard: (cardId: string) => void;
  onUpdateCardCandidate: (card: ProjectBoardCard, candidateStatus: ProjectBoardCardCandidateStatus) => void;
}) {
  return (
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
            onDragEnter={(event) => onUpdateColumnDropEffect(event, column)}
            onDragOver={(event) => onUpdateColumnDropEffect(event, column)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClearDragTarget();
            }}
            onDrop={(event) => onDropCardIntoColumn(event, column.id)}
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
                    onToggleBulkSelected={onToggleBulkCard}
                    onDragStart={(event) => onDragStartCard(event, card)}
                    onDragEnd={onClearDragState}
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
          <h4>
            {preview.ticketizableCards.length} candidate{preview.ticketizableCards.length === 1 ? "" : "s"} will become Local Tasks
          </h4>
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
            <p>
              {preview.skippedCards.length - skippedPreview.length} more skipped candidate
              {preview.skippedCards.length - skippedPreview.length === 1 ? "" : "s"} hidden.
            </p>
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
  board?: ProjectBoardSummaryBoard;
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
  const markReadyTitle = canMarkReady ? (proofScopeTitle ?? "Mark candidate ready") : proofGateTitle;
  const approveTitle = canMarkReady ? (proofScopeTitle ?? "Approve candidate card") : proofGateTitle;
  const dependencyBadges = board
    ? projectBoardCardDependencyBadges(card, board.cards, { executionArtifacts: board.executionArtifacts })
    : undefined;
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
        <div
          className={`project-board-clarification-summary ${primaryClarification.tone}`}
          title={primaryClarificationText}
          data-ui-allow-truncation="true"
        >
          <Info size={13} />
          <span title={primaryClarificationText}>
            <strong>{primaryClarification.label}:</strong> {primaryClarification.detail}
          </span>
        </div>
      )}
      {planningWarnings.length > 0 && <ProjectBoardProofScopeWarningSummary warnings={planningWarnings} compact />}
      <div className="project-board-card-actions" onClick={(event) => event.stopPropagation()}>
        {card.candidateStatus === "ready_to_create" ? (
          <button
            type="button"
            className="project-board-card-action"
            disabled={!canMarkReady}
            title={approveTitle}
            onClick={() => onApproveCard(card)}
          >
            <Check size={14} />
            <span>Approve</span>
          </button>
        ) : (
          <button
            type="button"
            className="project-board-card-action"
            disabled={!canMarkReady}
            title={markReadyTitle}
            onClick={() => onUpdateCardCandidate(card, "ready_to_create")}
          >
            <Check size={14} />
            <span>Mark Ready</span>
          </button>
        )}
        {card.candidateStatus !== "rejected" && (
          <button
            type="button"
            className="project-board-card-action secondary"
            title="Reject this candidate or mark it as duplicate work."
            onClick={() => onUpdateCardCandidate(card, "rejected")}
          >
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
        <button
          type="button"
          className="project-board-card-action secondary"
          title="Open this candidate in the detail inspector."
          onClick={() => onSelectCard(card.id)}
        >
          <FileText size={14} />
          <span>Details</span>
        </button>
        {card.candidateStatus !== "needs_clarification" && (
          <button
            type="button"
            className="project-board-card-action secondary"
            title="Move this card to Needs Clarification."
            onClick={() => onUpdateCardCandidate(card, "needs_clarification")}
          >
            <Info size={14} />
            <span>Needs Info</span>
          </button>
        )}
        {card.candidateStatus !== "evidence" && (
          <button
            type="button"
            className="project-board-card-action secondary"
            title="Move this candidate to Covered / Done because the work is already represented or no longer needs execution."
            onClick={() => onUpdateCardCandidate(card, "evidence")}
          >
            <CheckCircle2 size={14} />
            <span>Mark Covered</span>
          </button>
        )}
        {canSplit && (
          <button
            type="button"
            className="project-board-card-action secondary"
            title="Split acceptance criteria into smaller candidate cards."
            onClick={() => onSplitCard(card.id)}
          >
            <GitBranch size={14} />
            <span>Split</span>
          </button>
        )}
      </div>
    </ProjectBoardCardShell>
  );
}
