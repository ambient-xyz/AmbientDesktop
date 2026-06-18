import { AlertCircle, Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ProjectBoardCard, ProjectSummary, UpdateProjectBoardCardInput } from "../../shared/projectBoardTypes";
import {
  projectBoardCanonicalCardProjection,
  projectBoardCardVisualTone,
} from "./projectBoardActiveCardUiModel";
import {
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
} from "./projectBoardCollaborationUiModel";
import {
  projectBoardCardCanEditDependencies,
  projectBoardDependencyChangeImpactPreview,
  projectBoardDependencyEditOptions,
  projectBoardDependencyHealth,
  projectBoardDependencyRows,
} from "./projectBoardDependencyUiModel";
import {
  projectBoardCandidateStatusLabel,
  projectBoardPhaseDisplayName,
} from "./ProjectBoardLaneViews";
import { projectBoardPhaseGroups } from "./projectBoardUiModel";

export function ProjectBoardMapTab({
  board,
  onUpdateCard,
  onInspectCard,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => void;
  onInspectCard: (cardId: string) => void;
}) {
  const dependencyHealth = projectBoardDependencyHealth(board);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  const criticalCardIds = new Set(dependencyHealth.criticalPath.cards.map((card) => card.id));
  const phaseGroups = projectBoardPhaseGroups(board.cards, criticalCardIds);
  const dependencyRows = dependencyHealth.rows;
  const rowsById = new Map(dependencyRows.map((row) => [row.card.id, row]));
  const unresolvedByCardId = new Map<string, string[]>();
  for (const issue of dependencyHealth.unresolved) {
    unresolvedByCardId.set(issue.card.id, [...(unresolvedByCardId.get(issue.card.id) ?? []), issue.blockerRef]);
  }
  const cycleCardIds = new Set(dependencyHealth.cycles.flatMap((cycle) => cycle.cardIds));
  const readinessByCardId = new Map(dependencyHealth.readiness.map((item) => [item.card.id, item]));
  const dependencyCount = dependencyRows.filter((row) => row.blockedBy.length || row.unblocks.length).length;
  const issueCount = dependencyHealth.unresolved.length + dependencyHealth.cycles.length;
  const executableCount = board.cards.filter((card) => Boolean(card.orchestrationTaskId)).length;
  function selectMapCard(cardId: string) {
    setSelectedCardId(cardId);
  }
  function inspectMapCard(cardId: string) {
    setSelectedCardId(cardId);
    onInspectCard(cardId);
  }
  return (
    <section className="project-board-tab-panel project-board-map-panel" aria-label="Project board dependency map">
      <header className="project-board-panel-header">
        <div>
          <span className="project-board-kicker">Map</span>
          <h3>{phaseGroups.length} phase group{phaseGroups.length === 1 ? "" : "s"}</h3>
        </div>
        <span className={`project-board-status ${issueCount > 0 ? "warning" : ""}`} title="The map includes draft candidates and executable Local Task cards.">
          {issueCount > 0
            ? `${issueCount} dependency issue${issueCount === 1 ? "" : "s"}`
            : executableCount === 0
              ? `${dependencyCount} draft dependency touchpoint${dependencyCount === 1 ? "" : "s"}`
              : `${dependencyCount} dependency touchpoint${dependencyCount === 1 ? "" : "s"}`}
        </span>
      </header>
      {issueCount > 0 && <ProjectBoardDependencyIssues health={dependencyHealth} />}
      <ProjectBoardCriticalPath health={dependencyHealth} selectedCardId={selectedCardId} onSelectCard={selectMapCard} onInspectCard={inspectMapCard} />
      <ProjectBoardExecutionOrder health={dependencyHealth} selectedCardId={selectedCardId} onSelectCard={selectMapCard} onInspectCard={inspectMapCard} />
      <div className="project-board-map-grid">
        {phaseGroups.length > 0 ? (
          phaseGroups.map((group) => (
            <section className={`project-board-map-phase tone-${group.tone}`} data-phase-tone={group.tone} key={group.phase}>
              <header>
                <div>
                  <h4>{projectBoardPhaseDisplayName(group.phase)}</h4>
                  <span>{group.cards.length} card{group.cards.length === 1 ? "" : "s"}</span>
                </div>
                <div className="project-board-map-phase-counts" aria-label={`${group.phase} phase summary`}>
                  {group.readyCount > 0 && <strong className="ready">{group.readyCount} ready</strong>}
                  {group.reviewCount > 0 && <strong className="review">{group.reviewCount} review</strong>}
                  {group.blockedCount > 0 && <strong className="blocked">{group.blockedCount} blocked</strong>}
                  {group.criticalPathCount > 0 && <strong className="critical">{group.criticalPathCount} critical</strong>}
                </div>
              </header>
              <div className="project-board-map-card-list">
                {group.cards.map((card) => (
                  <ProjectBoardMapCard
                    card={card}
                    row={rowsById.get(card.id)}
                    unresolvedRefs={unresolvedByCardId.get(card.id) ?? []}
                    cyclic={cycleCardIds.has(card.id)}
                    readiness={readinessByCardId.get(card.id)}
                    allCards={board.cards}
                    selected={selectedCardId === card.id}
                    onSelectCard={selectMapCard}
                    onInspectCard={inspectMapCard}
                    onUpdateCard={onUpdateCard}
                    key={card.id}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="project-board-column-empty">Cards will appear here once the board has draft or executable work.</div>
        )}
      </div>
    </section>
  );
}

export function ProjectBoardCriticalPath({
  health,
  selectedCardId,
  onSelectCard,
  onInspectCard,
}: {
  health: ReturnType<typeof projectBoardDependencyHealth>;
  selectedCardId?: string;
  onSelectCard: (cardId: string) => void;
  onInspectCard: (cardId: string) => void;
}) {
  const path = health.criticalPath.cards;
  if (path.length <= 1 && health.cycleRepairSuggestions.length === 0) return null;
  return (
    <section className="project-board-critical-path" aria-label="Project board critical path">
      <header>
        <div>
          <h4>Critical path</h4>
          <span>{health.criticalPath.summary}</span>
        </div>
        {health.criticalPath.readyCard && <strong>Next: {health.criticalPath.readyCard.title}</strong>}
      </header>
      {path.length > 1 && (
        <ol>
          {path.map((card, index) => {
            const done = card.status === "done";
            return (
              <li
                key={card.id}
                className={`${card.id === health.criticalPath.readyCard?.id ? "next" : ""} ${selectedCardId === card.id ? "selected" : ""} ${done ? "done" : ""}`}
              >
                <button
                  type="button"
                  className="project-board-critical-path-card"
                  title={`Inspect critical path card ${index + 1}: ${card.title}`}
                  onFocus={() => onSelectCard(card.id)}
                  onClick={() => onInspectCard(card.id)}
                >
                  <span aria-label={done ? "Done" : `Step ${index + 1}`}>{done ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
                  <div>
                    <strong>{card.title}</strong>
                    <em>{card.status.replace(/_/g, " ")}</em>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {health.cycleRepairSuggestions.length > 0 && (
        <div className="project-board-cycle-repairs" aria-label="Cycle repair suggestions">
          {health.cycleRepairSuggestions.slice(0, 3).map((suggestion) => (
            <article key={`${suggestion.card.id}:${suggestion.blocker.id}`}>
              <AlertCircle size={14} />
              <p>{suggestion.label}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectBoardExecutionOrder({
  health,
  selectedCardId,
  onSelectCard,
  onInspectCard,
}: {
  health: ReturnType<typeof projectBoardDependencyHealth>;
  selectedCardId?: string;
  onSelectCard: (cardId: string) => void;
  onInspectCard: (cardId: string) => void;
}) {
  const readyCount = health.readiness.filter((item) => item.state === "ready_now").length;
  const waitingCount = health.readiness.filter((item) => item.state === "waiting_on_dependencies" || item.state === "ready_after_proof" || item.state === "needs_clarification").length;
  return (
    <section className="project-board-execution-order" aria-label="Project board execution order">
      <header>
        <div>
          <h4>Execution order</h4>
          <span>{health.orderedCards.length} ordered card{health.orderedCards.length === 1 ? "" : "s"}</span>
        </div>
        <strong>{readyCount} ready now</strong>
      </header>
      {health.readiness.length > 0 ? (
        <div className="project-board-execution-list">
          {health.readiness.slice(0, 8).map((item) => (
            <button
              type="button"
              className={`project-board-execution-item ${item.state} ${selectedCardId === item.card.id ? "selected" : ""}`}
              key={item.card.id}
              title={`Open ${item.card.title} in the full card inspector. ${item.label}: ${item.reason}`}
              onFocus={() => onSelectCard(item.card.id)}
              onClick={() => onInspectCard(item.card.id)}
            >
              <span>{item.order}</span>
              <div>
                <strong>{item.card.title}</strong>
                <p>{item.reason}</p>
              </div>
              <em>{item.label}</em>
            </button>
          ))}
        </div>
      ) : (
        <p className="project-board-column-empty">Add cards to establish an execution order.</p>
      )}
      {waitingCount > 0 && (
        <p>
          {waitingCount} card{waitingCount === 1 ? "" : "s"} {waitingCount === 1 ? "needs" : "need"} dependency or proof cleanup before low-intervention
          dispatch.
        </p>
      )}
    </section>
  );
}

export function ProjectBoardDependencyIssues({ health }: { health: ReturnType<typeof projectBoardDependencyHealth> }) {
  return (
    <section className="project-board-map-issues" aria-label="Project board dependency issues">
      {health.unresolved.map((issue) => (
        <article key={`${issue.card.id}:${issue.blockerRef}`}>
          <AlertCircle size={15} />
          <div>
            <strong>Unresolved blocker</strong>
            <p>{issue.card.title} is blocked by {issue.blockerRef}, but that reference does not match a board card yet.</p>
          </div>
        </article>
      ))}
      {health.cycles.map((cycle) => (
        <article key={cycle.cardIds.join(":")}>
          <AlertCircle size={15} />
          <div>
            <strong>Dependency cycle</strong>
            <p>{cycle.titles.join(" -> ")} loops back on itself. Edit blockers before relying on automatic order.</p>
          </div>
        </article>
      ))}
    </section>
  );
}

export function ProjectBoardMapCard({
  card,
  row,
  unresolvedRefs,
  cyclic,
  readiness,
  allCards,
  selected,
  onSelectCard,
  onInspectCard,
  onUpdateCard,
}: {
  card: ProjectBoardCard;
  row?: ReturnType<typeof projectBoardDependencyRows>[number];
  unresolvedRefs: string[];
  cyclic: boolean;
  readiness?: ReturnType<typeof projectBoardDependencyHealth>["readiness"][number];
  allCards: ProjectBoardCard[];
  selected: boolean;
  onSelectCard: (cardId: string) => void;
  onInspectCard: (cardId: string) => void;
  onUpdateCard: (input: UpdateProjectBoardCardInput) => void;
}) {
  const editOptions = useMemo(() => projectBoardDependencyEditOptions(card, allCards), [allCards, card]);
  const firstAvailableOption = editOptions.find((option) => !option.disabled)?.ref ?? "";
  const [selectedBlockerRef, setSelectedBlockerRef] = useState(firstAvailableOption);
  const canEditDependencies = projectBoardCardCanEditDependencies(card);
  const selectedOption = editOptions.find((option) => option.ref === selectedBlockerRef && !option.disabled);
  const claimLabel = projectBoardCardClaimLabel(card);
  const claimTitle = projectBoardCardClaimTitle(card);
  const projection = projectBoardCanonicalCardProjection(card, { readinessState: readiness?.state });
  const visualTone = projectBoardCardVisualTone(card, readiness?.state);
  const addBlockerImpact = useMemo(
    () =>
      selectedOption
        ? projectBoardDependencyChangeImpactPreview(card, allCards, {
            action: "add_blocker",
            blockerRef: selectedOption.ref,
          })
        : undefined,
    [allCards, card, selectedOption],
  );
  const removeBlockerImpacts = useMemo(
    () =>
      new Map(
        card.blockedBy
          .filter((blocker) => blocker.trim())
          .map((blocker) => [
            blocker,
            projectBoardDependencyChangeImpactPreview(card, allCards, {
              action: "remove_blocker",
              blockerRef: blocker,
            }),
          ]),
      ),
    [allCards, card],
  );

  useEffect(() => {
    if (!canEditDependencies) return;
    if (selectedOption || selectedBlockerRef === firstAvailableOption) return;
    setSelectedBlockerRef(firstAvailableOption);
  }, [canEditDependencies, firstAvailableOption, selectedBlockerRef, selectedOption]);

  function addBlocker() {
    if (!canEditDependencies || !selectedOption) return;
    onUpdateCard({ cardId: card.id, blockedBy: [...card.blockedBy, selectedOption.ref] });
  }

  function removeBlocker(blockerRef: string) {
    if (!canEditDependencies) return;
    onUpdateCard({ cardId: card.id, blockedBy: card.blockedBy.filter((candidate) => candidate !== blockerRef) });
  }

  return (
    <article
      id={`project-board-map-card-${card.id}`}
      className={`project-board-map-card tone-${visualTone} ${readiness?.state ?? ""} ${readiness?.criticalPath ? "critical-path" : ""} ${selected ? "selected" : ""}`}
      data-card-tone={visualTone}
      data-readiness-state={readiness?.state ?? "unknown"}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, select, input, textarea, a")) return;
        onInspectCard(card.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onInspectCard(card.id);
      }}
      onFocus={() => onSelectCard(card.id)}
      title="Open this card in the full inspector."
    >
      <div>
        <span className="project-board-card-meta">{projection.statusLabel}</span>
        <strong>{card.title}</strong>
      </div>
      <div className="project-board-card-tests">
        {card.priority !== undefined && <span className="priority">Priority {card.priority}</span>}
        {card.orchestrationTaskId && <span className="task-linked">Task linked</span>}
        {!card.orchestrationTaskId && <span className={`candidate-${card.candidateStatus}`}>{projectBoardCandidateStatusLabel(card.candidateStatus)}</span>}
        {claimLabel && <span className="claim" title={claimTitle}>Claim: {claimLabel}</span>}
      </div>
      {readiness && (
        <div className="project-board-map-badges" aria-label="Dependency readiness">
          <span className="order">Order {readiness.order}</span>
          <span className={`readiness state-${readiness.state}`}>{readiness.label}</span>
          {readiness.criticalPathIndex && <span className="critical">Critical {readiness.criticalPathIndex}</span>}
          {readiness.newlyReadyUnblocks.length > 0 && <span className="impact">{readiness.newlyReadyUnblocks.length} ready after this</span>}
          {readiness.waitingOn.slice(0, 2).map((blocker) => (
            <span className="waiting" key={blocker.id}>Waiting on {blocker.title}</span>
          ))}
          {readiness.state === "ready_after_proof" && <span className="proof-needed">Add proof expectation</span>}
          {readiness.state === "needs_clarification" && <span className="clarification">Answer clarification</span>}
        </div>
      )}
      <div className="project-board-map-actions">
        <button type="button" className="panel-button mini" title="Open this card in the full card inspector." onClick={() => onInspectCard(card.id)}>
          Details
        </button>
      </div>
      {(row?.blockedBy.length ?? 0) > 0 && (
        <div className="project-board-card-blockers">
          {row!.blockedBy.map((blocker) => (
            <span key={blocker} title={blocker}>Blocked by {projectBoardDependencyRefLabel(blocker, allCards)}</span>
          ))}
        </div>
      )}
      {(unresolvedRefs.length > 0 || cyclic) && (
        <div className="project-board-map-warnings">
          {unresolvedRefs.map((ref) => (
            <span key={ref}>Unresolved {ref}</span>
          ))}
          {cyclic && <span>Cycle detected</span>}
        </div>
      )}
      {(row?.unblocks.length ?? 0) > 0 && (
        <div className="project-board-map-unblocks">
          {readiness?.impactLabel && <strong>{readiness.impactLabel}</strong>}
          {row!.unblocks.slice(0, 4).map((unblocked) => (
            <span key={unblocked.id}>Unblocks {unblocked.title}</span>
          ))}
        </div>
      )}
      {canEditDependencies && (
        <div className="project-board-map-editor" aria-label={`Edit dependencies for ${card.title}`}>
          <strong>Edit dependencies</strong>
          {card.blockedBy.length > 0 ? (
            <div className="project-board-map-editor-list">
              {card.blockedBy.map((blocker) => (
                <span key={blocker}>
                  <span>{projectBoardDependencyRefLabel(blocker, allCards)}</span>
                  {removeBlockerImpacts.get(blocker)?.visible && <em>{removeBlockerImpacts.get(blocker)?.deltaLabel}</em>}
                  <button
                    type="button"
                    className="icon-button"
                    title={removeBlockerImpacts.get(blocker)?.visible ? removeBlockerImpacts.get(blocker)?.headline : `Remove blocker ${projectBoardDependencyRefLabel(blocker, allCards)}`}
                    aria-label={`Remove blocker ${projectBoardDependencyRefLabel(blocker, allCards)}`}
                    onClick={() => removeBlocker(blocker)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p>No blockers set.</p>
          )}
          <div className="project-board-map-add-blocker">
            <select
              aria-label={`Dependency blocker for ${card.title}`}
              value={selectedBlockerRef}
              onChange={(event) => setSelectedBlockerRef(event.target.value)}
              disabled={editOptions.every((option) => option.disabled)}
            >
              <option value="">Add blocker...</option>
              {editOptions.map((option) => (
                <option key={option.ref} value={option.ref} disabled={option.disabled}>
                  {option.reason ? `${option.label} (${option.reason})` : option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="panel-button mini"
              disabled={!selectedOption}
              title={selectedOption ? `Add ${selectedOption.label} as a blocker for ${card.title}.` : "Choose an available board card before adding a blocker."}
              onClick={addBlocker}
            >
              Add blocker
            </button>
          </div>
          {addBlockerImpact?.visible && <ProjectBoardDependencyChangeImpact preview={addBlockerImpact} />}
        </div>
      )}
    </article>
  );
}

export function ProjectBoardDependencyChangeImpact({ preview }: { preview: ReturnType<typeof projectBoardDependencyChangeImpactPreview> }) {
  return (
    <section className={`project-board-dependency-impact ${preview.tone}`} aria-label="Dependency edit impact preview">
      <header>
        <div>
          <strong>{preview.headline}</strong>
          <span>{preview.detail}</span>
        </div>
        <em>{preview.deltaLabel}</em>
      </header>
      <div className="project-board-dependency-impact-metrics" aria-label="Dependency impact counts">
        {preview.afterMetrics.map((metric, index) => (
          <span key={metric.label} title={metric.title}>
            <strong>{preview.beforeMetrics[index]?.value ?? "-"}</strong>
            <small>{metric.label}</small>
            <b>{metric.value}</b>
          </span>
        ))}
      </div>
      {preview.affectedCards.length > 0 && (
        <ul>
          {preview.affectedCards.map((item) => (
            <li className={item.tone} key={item.cardId}>
              <strong>{item.title}</strong>
              <span>
                {item.beforeLabel} {"->"} {item.afterLabel}
              </span>
            </li>
          ))}
          {preview.affectedCount > preview.affectedCards.length && (
            <li className="neutral">
              <strong>+{preview.affectedCount - preview.affectedCards.length} more affected</strong>
              <span>Open the map after saving for the full order.</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function projectBoardDependencyRefLabel(ref: string, cards: ProjectBoardCard[]): string {
  return projectBoardDependencyCardForRef(ref, cards)?.title ?? ref;
}

export function projectBoardDependencyCardForRef(ref: string, cards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  const normalized = ref.trim();
  return cards.find((candidate) =>
    [candidate.id, candidate.sourceId, candidate.orchestrationTaskId ?? "", `card:${candidate.id}`, `project-board-card:${candidate.id}`]
      .filter(Boolean)
      .includes(normalized),
  );
}
