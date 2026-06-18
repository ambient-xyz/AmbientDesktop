import { Shield, Zap } from "lucide-react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";

import type { ProjectBoardAddCardsObjectiveProvenance, ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardExecutionArtifact } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { latestRunForTask } from "./automationUiModel";
import {
  projectBoardCanonicalCardProjection,
  projectBoardCardClaimLabel,
  projectBoardCardClaimTitle,
  projectBoardCardDependencyBadges,
  projectBoardUiMockReviewBadges,
} from "./projectBoardUiModel";
import { formatTaskState } from "./RightPanel";

export type ProjectBoardLaneCardSelectOptions = {
  tab?: "spec" | "proof" | "dependencies" | "history";
  scroll?: boolean;
};

export function ProjectBoardColumn({
  title,
  tooltip,
  cards,
  allCards,
  selectedCardId,
  onSelectCard,
  taskById,
  tasks,
  runs,
  executionArtifacts,
}: {
  title: string;
  tooltip: string;
  cards: ProjectBoardCard[];
  allCards: ProjectBoardCard[];
  selectedCardId?: string;
  onSelectCard: (cardId: string, options?: ProjectBoardLaneCardSelectOptions) => void;
  taskById: Map<string, OrchestrationTask>;
  tasks: OrchestrationTask[];
  runs: OrchestrationRun[];
  executionArtifacts?: ProjectBoardExecutionArtifact[];
}) {
  const laneClass = title.toLowerCase().replace(/\s+/g, "-");
  return (
    <section className={`project-board-column lane-${laneClass}`}>
      <header data-project-board-tooltip={tooltip} tabIndex={0} aria-label={`${title}: ${tooltip}`}>
        <span>{title}</span>
        <strong>{cards.length}</strong>
      </header>
      <div className="project-board-card-list">
        {cards.length > 0 ? (
          cards.map((card) => (
            <ProjectBoardCardView
              card={card}
              key={card.id}
              selected={selectedCardId === card.id}
              onSelectCard={onSelectCard}
              allCards={allCards}
              tasks={tasks}
              executionArtifacts={executionArtifacts}
              task={card.orchestrationTaskId ? taskById.get(card.orchestrationTaskId) : undefined}
              latestRun={card.orchestrationTaskId ? latestRunForTask(runs, card.orchestrationTaskId) : undefined}
            />
          ))
        ) : (
          <div className="project-board-column-empty">{projectBoardColumnEmptyText(title)}</div>
        )}
      </div>
    </section>
  );
}

export function ProjectBoardCardView({
  card,
  selected,
  onSelectCard,
  allCards,
  tasks,
  executionArtifacts,
  task,
  latestRun,
}: {
  card: ProjectBoardCard;
  selected?: boolean;
  onSelectCard: (cardId: string, options?: ProjectBoardLaneCardSelectOptions) => void;
  allCards: ProjectBoardCard[];
  tasks: OrchestrationTask[];
  executionArtifacts?: ProjectBoardExecutionArtifact[];
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
}) {
  const projection = projectBoardCanonicalCardProjection(card, { task, latestRun });
  const dependencyBadges = projectBoardCardDependencyBadges(card, allCards, { tasks, executionArtifacts });
  return (
    <ProjectBoardCardShell
      card={card}
      meta={projectBoardCardSourceLabel(card.sourceKind)}
      projection={projection}
      selected={selected}
      allCards={allCards}
      dependencyBadges={dependencyBadges}
      role="button"
      tabIndex={0}
      onClick={() => onSelectCard(card.id, { tab: card.status === "review" ? "proof" : undefined, scroll: true })}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelectCard(card.id, { tab: card.status === "review" ? "proof" : undefined, scroll: true });
      }}
    >
      {card.orchestrationTaskId && (
        <div className="project-board-card-task">
          <span>{task ? `${task.identifier} · ${formatTaskState(task.state)}` : "Local task linked"}</span>
          {latestRun && <span>{projection.runLabel ?? `Run ${formatTaskState(latestRun.status)} · Attempt ${latestRun.attemptNumber + 1}`}</span>}
        </div>
      )}
    </ProjectBoardCardShell>
  );
}

export function ProjectBoardCardShell({
  card,
  meta,
  projection: suppliedProjection,
  selected = false,
  focusRef,
  allCards = [],
  dependencyBadges,
  children,
  role,
  tabIndex,
  draggable,
  title,
  onClick,
  onDragStart,
  onDragEnd,
  onKeyDown,
  onSelectDependencyCard,
}: {
  card: ProjectBoardCard;
  meta: string;
  projection?: ReturnType<typeof projectBoardCanonicalCardProjection>;
  selected?: boolean;
  focusRef?: RefObject<HTMLElement | null>;
  allCards?: ProjectBoardCard[];
  dependencyBadges?: ReturnType<typeof projectBoardCardDependencyBadges>;
  children?: ReactNode;
  role?: "button";
  tabIndex?: number;
  draggable?: boolean;
  title?: string;
  onClick?: () => void;
  onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onSelectDependencyCard?: (cardId: string) => void;
}) {
  const projection = suppliedProjection ?? projectBoardCanonicalCardProjection(card);
  const badges = dependencyBadges ?? projectBoardCardDependencyBadges(card, allCards);
  const uiMockBadges = projectBoardUiMockReviewBadges(card, allCards);
  const claimLabel = projectBoardCardClaimLabel(card);
  const claimTitle = projectBoardCardClaimTitle(card);
  const claimTone =
    (card.claimConflicts?.length ?? 0) > 0 ? "conflict" : card.claim?.status === "expired" ? "expired" : card.claim?.ownedByLocal ? "owned" : card.claim ? "remote" : "";
  const tests = [
    card.testPlan.unit.length ? `${card.testPlan.unit.length} unit` : "",
    card.testPlan.integration.length ? `${card.testPlan.integration.length} integration` : "",
    card.testPlan.visual.length ? `${card.testPlan.visual.length} visual` : "",
    card.testPlan.manual.length ? `${card.testPlan.manual.length} manual` : "",
  ].filter(Boolean);
  return (
    <article
      ref={focusRef}
      className={`project-board-card status-${projection.visualStatus} candidate-${card.candidateStatus} ${selected ? "selected" : ""}`}
      role={role}
      tabIndex={tabIndex}
      draggable={draggable}
      title={title}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
    >
      <div className="project-board-card-meta" title={projection.summary}>{projection.terminalDone || projection.kind === "covered_without_task" ? projection.statusLabel : meta}</div>
      <h3>{card.title}</h3>
      <p className="project-board-card-description" title={card.description} data-ui-allow-truncation="true">
        {card.description}
      </p>
      {claimLabel && (
        <div className={`project-board-card-claim ${claimTone}`} title={claimTitle}>
          <Shield size={12} />
          <span>{claimLabel}</span>
        </div>
      )}
      {card.pendingPiUpdate && (
        <div className="project-board-card-pi-update" title="Pi proposed a newer version of this protected card. Open Details to review it.">
          <Zap size={12} />
          <span>Pi update available</span>
        </div>
      )}
      <div className="project-board-card-tags">
        {card.phase && <span>{projectBoardPhaseDisplayName(card.phase)}</span>}
        {card.priority !== undefined && <span>Priority {card.priority}</span>}
        {uiMockBadges.map((badge) => (
          <span key={`${badge.label}:${badge.value}`} className={`tone-${badge.tone}`} title={`${badge.label}: ${badge.value}`}>
            {badge.label}: {badge.value}
          </span>
        ))}
        {card.labels.slice(0, 3).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {card.objectiveProvenance && <ProjectBoardObjectiveProvenanceBlock provenance={card.objectiveProvenance} compact />}
      {card.acceptanceCriteria.length > 0 && (
        <ul className="project-board-card-list-compact">
          {card.acceptanceCriteria.slice(0, 3).map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      )}
      {tests.length > 0 && (
        <div className="project-board-card-tests">
          {tests.map((test) => (
            <span key={test}>{test}</span>
          ))}
        </div>
      )}
      {!projection.suppressBlockers && badges.length > 0 && (
        <div className="project-board-card-blockers" aria-label="Dependencies">
          {badges.slice(0, 3).map((badge) => {
            if (badge.cardId && onSelectDependencyCard) {
              return (
                <button
                  type="button"
                  className={`project-board-card-blocker-link dependency-${badge.state}`}
                  key={badge.ref}
                  title={`${badge.title} Open dependency card: ${badge.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectDependencyCard(badge.cardId!);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {badge.prefix} {badge.label}
                </button>
              );
            }
            return (
              <span className={`dependency-${badge.state}`} key={badge.ref} title={badge.title}>
                {badge.prefix} {badge.label}
              </span>
            );
          })}
          {badges.length > 3 && <span>+{badges.length - 3} more</span>}
        </div>
      )}
      {children}
    </article>
  );
}

export function ProjectBoardObjectiveProvenanceBlock({
  provenance,
  compact = false,
}: {
  provenance: ProjectBoardAddCardsObjectiveProvenance;
  compact?: boolean;
}) {
  return (
    <div className={`project-board-objective-provenance${provenance.weakGrounding ? " weak" : ""}${compact ? " compact" : ""}`}>
      <div className="project-board-objective-provenance-heading">
        <strong>Add Cards objective</strong>
        <span>{projectBoardObjectiveGroundingLabel(provenance.groundingMode)}</span>
      </div>
      {!compact && <p>{provenance.objective}</p>}
      <div className="project-board-objective-provenance-meta">
        <span>{provenance.sourceRefCount} source ref{provenance.sourceRefCount === 1 ? "" : "s"}</span>
        {provenance.selectedSourceIds.length > 0 && (
          <span>{provenance.selectedSourceIds.length} selected source{provenance.selectedSourceIds.length === 1 ? "" : "s"}</span>
        )}
        {provenance.weakGrounding && <span>Weak grounding</span>}
      </div>
      {!compact && provenance.sourceGap && <p className="project-board-objective-provenance-gap">{provenance.sourceGap}</p>}
    </div>
  );
}

export function projectBoardCandidateStatusLabel(status: ProjectBoardCardCandidateStatus): string {
  if (status === "needs_clarification") return "Needs clarification";
  if (status === "ready_to_create") return "Ready to create";
  if (status === "evidence") return "Covered / Done";
  if (status === "duplicate") return "Duplicate";
  return "Rejected";
}

export function projectBoardPhaseDisplayName(phase: string): string {
  return phase.trim().toLowerCase() === "proof" ? "Verification" : phase;
}

export function projectBoardObjectiveGroundingLabel(groundingMode: ProjectBoardAddCardsObjectiveProvenance["groundingMode"]): string {
  if (groundingMode === "selected_sources") return "Selected-source grounded";
  if (groundingMode === "source_scan") return "Source-scan grounded";
  return "Objective only";
}

export function projectBoardCardSourceLabel(sourceKind: ProjectBoardCard["sourceKind"]): string {
  if (sourceKind === "board_synthesis") return "Board synthesis";
  if (sourceKind === "planner_plan") return "Plan artifact";
  if (sourceKind === "run_follow_up") return "Run follow-up";
  if (sourceKind === "local_task_import") return "Local Task import";
  return "Manual card";
}

export function projectBoardDraftColumnEmptyText(title: string): string {
  if (title === "Covered / Done") return "Work that is already covered or intentionally complete without execution will appear here.";
  if (title === "Needs Clarification") return "Cards missing scope, proof, or dependency details land here.";
  if (title === "Ready To Create") return "Reviewed candidate cards can be approved into local tasks.";
  return "Rejected and duplicate proposals stay out of execution.";
}

export function projectBoardColumnEmptyText(title: string): string {
  if (title === "Ready") return "Approved cards will queue here.";
  if (title === "In Progress") return "No cards are currently running.";
  if (title === "Review") return "Work waiting for review will land here.";
  return "Completed cards will land here.";
}
