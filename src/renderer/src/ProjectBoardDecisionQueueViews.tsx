import { Archive, Bot, Check, CheckCircle2, SquarePen } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ProjectSummary,
  RefreshProjectBoardDecisionDraftsInput,
  RegenerateProjectBoardDecisionDraftsInput,
  SuggestProjectBoardClarificationDefaultsInput,
  UpdateProjectBoardCardInput,
} from "../../shared/projectBoardTypes";
import { ProjectBoardDecisionImpactSummary } from "./ProjectBoardCandidateDetailViews";
import {
  projectBoardClarificationAnswerInput,
  projectBoardDecisionImpactPreview,
  projectBoardDecisionQueue,
  type ProjectBoardDecisionQueueAuditFilterId,
  type ProjectBoardDecisionQueueRow,
} from "./projectBoardUiModel";

type ProjectBoardDecisionQueue = ReturnType<typeof projectBoardDecisionQueue>;
type ProjectBoardDecisionQueuePanelProps = {
  board: NonNullable<ProjectSummary["board"]>;
  queue: ProjectBoardDecisionQueue;
  onSelectCard: (cardId: string) => void;
  onSaveDecisionAnswer: (input: UpdateProjectBoardCardInput) => Promise<void> | void;
  onSuggestClarificationDefaults: (input: SuggestProjectBoardClarificationDefaultsInput) => Promise<void> | void;
  onApplyDecisionImpactFeedback: (input: ApplyProjectBoardDecisionImpactFeedbackInput) => Promise<void> | void;
  onRefreshDecisionDrafts: (input: RefreshProjectBoardDecisionDraftsInput) => Promise<void> | void;
  onRegenerateDecisionDrafts: (input: RegenerateProjectBoardDecisionDraftsInput) => Promise<void> | void;
};
type ProjectBoardDecisionAnswerMode = "save" | "feedback" | "refresh" | "regenerate";
type SubmitProjectBoardDecisionAnswer = (
  row: ProjectBoardDecisionQueueRow,
  mode: ProjectBoardDecisionAnswerMode,
  explicitAnswer?: string,
) => void | Promise<void>;
type SetProjectBoardDecisionDraft = (row: ProjectBoardDecisionQueueRow, value: string) => void;

export function ProjectBoardDecisionQueuePanel({
  board,
  queue,
  onSelectCard,
  onSaveDecisionAnswer,
  onSuggestClarificationDefaults,
  onApplyDecisionImpactFeedback,
  onRefreshDecisionDrafts,
  onRegenerateDecisionDrafts,
}: ProjectBoardDecisionQueuePanelProps) {
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, string>>({});
  const [decisionBusyRow, setDecisionBusyRow] = useState<string | undefined>();
  const [suggestDefaultsBusy, setSuggestDefaultsBusy] = useState(false);
  const [auditFilter, setAuditFilter] = useState<ProjectBoardDecisionQueueAuditFilterId>("all");
  const [auditExpanded, setAuditExpanded] = useState(false);
  const cardById = useMemo(() => new Map(board.cards.map((card) => [card.id, card])), [board.cards]);
  const visibleOpenRows = queue.openRows.slice(0, 8);
  const setDecisionDraft = (row: ProjectBoardDecisionQueueRow, value: string) => {
    setDecisionDrafts((current) => ({ ...current, [row.id]: value }));
  };
  const decisionAnswerForRow = (row: ProjectBoardDecisionQueueRow, explicitAnswer?: string): string => {
    const draftAnswer = decisionDrafts[row.id]?.trim();
    if (explicitAnswer?.trim()) return explicitAnswer.trim();
    if (draftAnswer) return draftAnswer;
    return row.safeToAccept ? (row.suggestedAnswer?.trim() ?? "") : "";
  };
  const clearDecisionDraft = (row: ProjectBoardDecisionQueueRow) => {
    setDecisionDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  };
  const suggestClarificationDefaults = async () => {
    if (suggestDefaultsBusy || queue.missingSuggestionCount === 0) return;
    setSuggestDefaultsBusy(true);
    try {
      await onSuggestClarificationDefaults({
        boardId: board.id,
        cardIds: queue.openRows.filter((row) => !row.suggestedAnswer?.trim()).map((row) => row.cardId),
      });
    } catch {
      // Top-level board actions surface the provider failure and store a fallback when possible.
    } finally {
      setSuggestDefaultsBusy(false);
    }
  };
  const submitDecisionAnswer = async (row: ProjectBoardDecisionQueueRow, mode: ProjectBoardDecisionAnswerMode, explicitAnswer?: string) => {
    const card = cardById.get(row.cardId);
    const answer = decisionAnswerForRow(row, explicitAnswer);
    if (!card || !answer) return;
    setDecisionBusyRow(row.id);
    try {
      if (mode === "refresh") {
        await onRefreshDecisionDrafts({ cardId: row.cardId, question: row.question, answer });
      } else if (mode === "regenerate") {
        await onRegenerateDecisionDrafts({ cardId: row.cardId, question: row.question, answer });
      } else if (mode === "feedback" || card.status !== "draft" || card.orchestrationTaskId) {
        await onApplyDecisionImpactFeedback({ cardId: row.cardId, question: row.question, answer });
      } else {
        await onSaveDecisionAnswer(projectBoardClarificationAnswerInput(card, row.question, answer));
      }
      clearDecisionDraft(row);
    } catch {
      // Top-level board actions already surface the failure; keep the draft answer in place.
    } finally {
      setDecisionBusyRow(undefined);
    }
  };
  return (
    <section className="project-board-proposal-history" aria-label="Canonical board decisions">
      <ProjectBoardDecisionQueueHeader
        queue={queue}
        suggestDefaultsBusy={suggestDefaultsBusy}
        onSuggestClarificationDefaults={suggestClarificationDefaults}
      />
      <ProjectBoardDecisionProposalGaps queue={queue} />
      <ProjectBoardDecisionOpenRows
        board={board}
        rows={visibleOpenRows}
        cardById={cardById}
        decisionDrafts={decisionDrafts}
        decisionBusyRow={decisionBusyRow}
        decisionAnswerForRow={decisionAnswerForRow}
        setDecisionDraft={setDecisionDraft}
        submitDecisionAnswer={submitDecisionAnswer}
        onSelectCard={onSelectCard}
      />
      <ProjectBoardDecisionAuditSection
        queue={queue}
        auditFilter={auditFilter}
        auditExpanded={auditExpanded}
        onAuditFilterChange={(filter) => {
          setAuditFilter(filter);
          setAuditExpanded(false);
        }}
        onToggleAuditExpanded={() => setAuditExpanded((current) => !current)}
        onSelectCard={onSelectCard}
      />
    </section>
  );
}

function ProjectBoardDecisionQueueHeader({
  queue,
  suggestDefaultsBusy,
  onSuggestClarificationDefaults,
}: {
  queue: ProjectBoardDecisionQueue;
  suggestDefaultsBusy: boolean;
  onSuggestClarificationDefaults: () => void;
}) {
  return (
    <header>
      <div>
        <span className="project-board-kicker">Decisions</span>
        <h3>{queue.summary}</h3>
        <p className="project-board-proposal-note">{queue.detail}</p>
      </div>
      <div className="project-board-proposal-meta">
        <span>{queue.openCount} open</span>
        <span>{queue.missingSuggestionCount} need suggestions</span>
        <span>{queue.safeSuggestionCount} safe defaults</span>
        <span>{queue.userOwnedCount} user-owned</span>
        <span>{queue.answeredCount} answered</span>
        <span>{queue.duplicateCount} duplicate</span>
        <span>{queue.proposalGapCount} proposal gaps</span>
        {queue.missingSuggestionCount > 0 && (
          <button
            type="button"
            className="secondary-button"
            disabled={suggestDefaultsBusy}
            title="Ask Ambient/Pi for expert defaults on open card decisions that do not already have suggestions. This only enriches decision metadata."
            onClick={() => void onSuggestClarificationDefaults()}
          >
            <Bot size={14} className={suggestDefaultsBusy ? "spin" : ""} />
            <span>{suggestDefaultsBusy ? "Suggesting" : "Suggest defaults"}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function ProjectBoardDecisionProposalGaps({ queue }: { queue: ProjectBoardDecisionQueue }) {
  if (queue.proposalGaps.length === 0) return null;
  return (
    <div className="project-board-source-counts" aria-label="Proposal gap questions">
      {queue.proposalGaps.slice(0, 4).map((gap) => (
        <span key={`${gap.proposalId}:${gap.questionIndex}`} title={gap.question}>
          {gap.answered ? "Answered" : "Open"} proposal gap · {gap.question}
        </span>
      ))}
    </div>
  );
}

type ProjectBoardDecisionOpenRowsProps = {
  board: NonNullable<ProjectSummary["board"]>;
  rows: ProjectBoardDecisionQueueRow[];
  cardById: Map<string, NonNullable<ProjectSummary["board"]>["cards"][number]>;
  decisionDrafts: Record<string, string>;
  decisionBusyRow?: string;
  decisionAnswerForRow: (row: ProjectBoardDecisionQueueRow, explicitAnswer?: string) => string;
  setDecisionDraft: SetProjectBoardDecisionDraft;
  submitDecisionAnswer: SubmitProjectBoardDecisionAnswer;
  onSelectCard: (cardId: string) => void;
};

function ProjectBoardDecisionOpenRows({
  board,
  rows,
  cardById,
  decisionDrafts,
  decisionBusyRow,
  decisionAnswerForRow,
  setDecisionDraft,
  submitDecisionAnswer,
  onSelectCard,
}: ProjectBoardDecisionOpenRowsProps) {
  if (rows.length === 0) {
    return (
      <p className="project-board-column-empty">
        No open card-level clarification decisions. Answered and duplicate decisions stay below for audit.
      </p>
    );
  }
  return (
    <div className="project-board-card-list">
      {rows.map((row) => (
        <ProjectBoardDecisionOpenRow
          key={row.id}
          board={board}
          row={row}
          card={cardById.get(row.cardId)}
          draftAnswer={decisionDrafts[row.id] ?? ""}
          busy={decisionBusyRow === row.id}
          decisionAnswerForRow={decisionAnswerForRow}
          setDecisionDraft={setDecisionDraft}
          submitDecisionAnswer={submitDecisionAnswer}
          onSelectCard={onSelectCard}
        />
      ))}
    </div>
  );
}

function ProjectBoardDecisionOpenRow({
  board,
  row,
  card,
  draftAnswer,
  busy,
  decisionAnswerForRow,
  setDecisionDraft,
  submitDecisionAnswer,
  onSelectCard,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  row: ProjectBoardDecisionQueueRow;
  card?: NonNullable<ProjectSummary["board"]>["cards"][number];
  draftAnswer: string;
  busy: boolean;
  decisionAnswerForRow: (row: ProjectBoardDecisionQueueRow, explicitAnswer?: string) => string;
  setDecisionDraft: SetProjectBoardDecisionDraft;
  submitDecisionAnswer: SubmitProjectBoardDecisionAnswer;
  onSelectCard: (cardId: string) => void;
}) {
  const effectiveAnswer = decisionAnswerForRow(row);
  const currentImpact = projectBoardDecisionImpactPreview(board, {
    question: row.question,
    answer: effectiveAnswer,
    answeredCardId: row.cardId,
  });
  const draftSource = Boolean(card && card.status === "draft" && !card.orchestrationTaskId);
  return (
    <article className={`project-board-card status-${row.cardStatus}`}>
      <div className="project-board-card-header-row">
        <span className="project-board-kicker">{row.sourceLabel}</span>
        <span className={`project-board-status ${row.safeToAccept ? "" : "warning"}`}>{row.actionLabel}</span>
      </div>
      <h4>{row.question}</h4>
      <p>{row.detail}</p>
      {row.suggestedAnswer && (
        <div className={`project-board-clarification-suggestion ${row.safeToAccept ? "safe" : "manual"}`}>
          <strong>{row.safeToAccept ? "Suggested expert default" : "Suggestion requires PM review"}</strong>
          <p>{row.suggestedAnswer}</p>
          {row.rationale && <small>{row.rationale}</small>}
          <div className="project-board-card-actions">
            <span className="project-board-inspector-badge">
              {row.questionKind?.replace(/_/g, " ") ?? "clarification"} · {row.confidence ?? "low"} confidence
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              title={
                row.safeToAccept
                  ? "Save this expert default as the decision answer. Use the impact actions below when linked drafts or ticketized cards also need updates."
                  : "Copy this suggestion into the editable answer so it can be reviewed before saving."
              }
              onClick={() =>
                row.safeToAccept
                  ? void submitDecisionAnswer(row, "save", row.suggestedAnswer)
                  : setDecisionDraft(row, row.suggestedAnswer ?? "")
              }
            >
              <Check size={14} />
              <span>{row.safeToAccept ? "Accept default" : "Use as draft"}</span>
            </button>
          </div>
        </div>
      )}
      <div className="project-board-decision-answer" aria-label="Decision answer">
        <label>
          <span>Answer</span>
          <textarea
            value={draftAnswer}
            onChange={(event) => setDecisionDraft(row, event.target.value)}
            placeholder={
              row.safeToAccept && row.suggestedAnswer
                ? "Use the expert default above or enter a different answer."
                : "Answer once here. Linked draft refresh and run-feedback actions stay deterministic."
            }
          />
        </label>
        <ProjectBoardDecisionImpactSummary
          impact={currentImpact.visible ? currentImpact : row.impact}
          actionBusy={busy}
          onApplyReadyFeedback={() => void submitDecisionAnswer(row, "feedback")}
          onRefreshDrafts={draftSource ? () => void submitDecisionAnswer(row, "refresh") : undefined}
          onRegenerateDrafts={draftSource ? () => void submitDecisionAnswer(row, "regenerate") : undefined}
        />
        <div className="project-board-decision-answer-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!draftAnswer.trim() || busy}
            title={
              draftAnswer.trim()
                ? "Save this answer on the linked decision row. Ticketized cards receive additive feedback instead of protected field rewrites."
                : "Enter an answer or accept the suggested default."
            }
            onClick={() => void submitDecisionAnswer(row, "save")}
          >
            <Check size={14} className={busy ? "spin" : ""} />
            <span>{busy ? "Saving" : "Save answer"}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onSelectCard(row.cardId)}
            title="Open the linked card inspector for full source basis, proof, and dependency context."
          >
            <SquarePen size={14} />
            <span>Review card</span>
          </button>
        </div>
      </div>
      <div className="project-board-proposal-meta">
        <span>{row.cardTitle}</span>
        {row.questionKind && <span>{row.questionKind.replace(/_/g, " ")}</span>}
        {row.confidence && <span>{row.confidence} confidence</span>}
        {currentImpact.visible && <span>{currentImpact.headline}</span>}
        {currentImpact.visible && <span>0 model calls</span>}
      </div>
    </article>
  );
}

function ProjectBoardDecisionAuditSection({
  queue,
  auditFilter,
  auditExpanded,
  onAuditFilterChange,
  onToggleAuditExpanded,
  onSelectCard,
}: {
  queue: ProjectBoardDecisionQueue;
  auditFilter: ProjectBoardDecisionQueueAuditFilterId;
  auditExpanded: boolean;
  onAuditFilterChange: (filter: ProjectBoardDecisionQueueAuditFilterId) => void;
  onToggleAuditExpanded: () => void;
  onSelectCard: (cardId: string) => void;
}) {
  const auditFilterRows = projectBoardDecisionAuditRows(queue, auditFilter);
  const visibleAuditRows = auditExpanded ? auditFilterRows : auditFilterRows.slice(0, 4);
  const hiddenAuditCount = Math.max(0, auditFilterRows.length - visibleAuditRows.length);
  const currentAuditFilterCount = queue.auditFilterItems.find((item) => item.id === auditFilter)?.count ?? 0;
  if (visibleAuditRows.length > 0) {
    return (
      <section className="project-board-decision-audit" aria-label="Decision audit rows">
        <header>
          <div>
            <span className="project-board-kicker">Decision audit</span>
            <h4>Answered and duplicate questions stay traceable</h4>
          </div>
          <div className="project-board-decision-audit-actions">
            <span className="project-board-status">
              {queue.answeredCount} answered · {queue.duplicateCount} duplicate
              {queue.suggestedAuditCount > 0 ? ` · ${queue.suggestedAuditCount} with suggestions` : ""}
            </span>
            {auditFilterRows.length > 4 && (
              <button
                type="button"
                className="secondary-button"
                onClick={onToggleAuditExpanded}
                title={auditExpanded ? "Collapse the retained decision audit rows." : "Show every retained decision audit row."}
              >
                {auditExpanded ? "Show less" : `Show all ${auditFilterRows.length}`}
              </button>
            )}
          </div>
        </header>
        <ProjectBoardDecisionAuditFilters queue={queue} auditFilter={auditFilter} onAuditFilterChange={onAuditFilterChange} />
        <div className="project-board-decision-audit-list">
          {visibleAuditRows.map((row) => (
            <ProjectBoardDecisionAuditRow row={row} onSelectCard={onSelectCard} key={row.id} />
          ))}
        </div>
        {hiddenAuditCount > 0 && (
          <p className="project-board-decision-audit-overflow">
            {hiddenAuditCount} more {projectBoardDecisionAuditHiddenLabel(auditFilter)}
            {hiddenAuditCount === 1 ? "" : "s"} hidden. Show all to review the full decision trail.
          </p>
        )}
      </section>
    );
  }
  if (queue.auditRows.length === 0) return null;
  return (
    <section className="project-board-decision-audit" aria-label="Decision audit rows">
      <header>
        <div>
          <span className="project-board-kicker">Decision audit</span>
          <h4>No rows match this audit filter</h4>
          <p className="project-board-proposal-note">
            {currentAuditFilterCount === 0
              ? "This board has no matching retained decision records."
              : "Choose another filter to inspect retained answers and duplicates."}
          </p>
        </div>
      </header>
      <ProjectBoardDecisionAuditFilters queue={queue} auditFilter={auditFilter} onAuditFilterChange={onAuditFilterChange} />
    </section>
  );
}

function ProjectBoardDecisionAuditFilters({
  queue,
  auditFilter,
  onAuditFilterChange,
}: {
  queue: ProjectBoardDecisionQueue;
  auditFilter: ProjectBoardDecisionQueueAuditFilterId;
  onAuditFilterChange: (filter: ProjectBoardDecisionQueueAuditFilterId) => void;
}) {
  return (
    <div className="project-board-source-counts" aria-label="Decision audit filters">
      {queue.auditFilterItems.map((item) => (
        <button
          type="button"
          className={auditFilter === item.id ? "active" : ""}
          key={item.id}
          title={`Show ${item.count} ${item.label.toLowerCase()} decision audit row${item.count === 1 ? "" : "s"}.`}
          onClick={() => onAuditFilterChange(item.id)}
        >
          {item.label} {item.count}
        </button>
      ))}
    </div>
  );
}

function ProjectBoardDecisionAuditRow({
  row,
  onSelectCard,
}: {
  row: ProjectBoardDecisionQueueRow;
  onSelectCard: (cardId: string) => void;
}) {
  return (
    <article className={`project-board-decision-audit-row ${row.state}`}>
      <div className="project-board-decision-audit-icon" aria-hidden="true">
        {row.state === "answered" ? <CheckCircle2 size={16} /> : <Archive size={16} />}
      </div>
      <div>
        <div className="project-board-card-header-row">
          <span className="project-board-kicker">{row.state === "answered" ? "Answered decision" : "Hidden duplicate"}</span>
          <span className="project-board-status">{row.sourceLabel}</span>
        </div>
        <h5>{row.question}</h5>
        <p>{row.detail}</p>
        {row.answer && <p className="project-board-decision-audit-answer">Answer: {row.answer}</p>}
        {row.suggestedAnswer && (
          <div className={`project-board-clarification-suggestion ${row.safeToAccept ? "safe" : "manual"}`}>
            <strong>{row.state === "answered" ? "Suggestion trail" : "Duplicate inherited suggestion"}</strong>
            <p>{row.suggestedAnswer}</p>
            {row.rationale && <small>{row.rationale}</small>}
            <div className="project-board-proposal-meta">
              {row.questionKind && <span>{row.questionKind.replace(/_/g, " ")}</span>}
              {row.confidence && <span>{row.confidence} confidence</span>}
              <span>{row.safeToAccept ? "Safe expert default" : "PM reviewed"}</span>
            </div>
          </div>
        )}
        <div className="project-board-proposal-meta">
          <span>{row.cardTitle}</span>
          {row.duplicateOf && <span>Duplicate of {row.duplicateOf}</span>}
          {row.answeredAt && <span>{row.answeredAt.slice(0, 10)}</span>}
        </div>
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onSelectCard(row.cardId)}
        title="Open the linked card inspector for full context."
      >
        <SquarePen size={14} />
        <span>Review card</span>
      </button>
    </article>
  );
}

function projectBoardDecisionAuditRows(queue: ProjectBoardDecisionQueue, auditFilter: ProjectBoardDecisionQueueAuditFilterId) {
  return queue.auditRows.filter((row) => {
    if (auditFilter === "answered") return row.state === "answered";
    if (auditFilter === "duplicate") return row.state === "duplicate";
    if (auditFilter === "suggested") return Boolean(row.suggestedAnswer);
    return true;
  });
}

function projectBoardDecisionAuditHiddenLabel(auditFilter: ProjectBoardDecisionQueueAuditFilterId): string {
  if (auditFilter === "answered") return "answered decision";
  if (auditFilter === "duplicate") return "duplicate decision";
  if (auditFilter === "suggested") return "suggestion-trail row";
  return "decision audit row";
}
