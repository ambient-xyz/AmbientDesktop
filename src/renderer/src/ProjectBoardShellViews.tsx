import { FileText, RefreshCw, Target, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ApplyProjectBoardSourceImpactFeedbackInput, ProjectBoardCard, ProjectBoardGitSyncStatus, ProjectBoardQuestion, ProjectBoardSummary, ProjectSummary, RefreshProjectBoardSourceDraftsInput, RegenerateProjectBoardSourceDraftsInput, SuggestProjectBoardKickoffDefaultsInput, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import type { OrchestrationBoard } from "../../shared/workflowTypes";
import type { ProjectBoardCardInspectorOptions } from "./ProjectBoardActiveCardDetailViews";
import { ProjectBoardKickoffInterview } from "./ProjectBoardDraftInboxViews";
import { projectBoardImpactKindLabel, projectBoardTabTitle } from "./ProjectBoardHistoryViews";
import {
  ProjectBoardCharterPreview,
  ProjectBoardSourceDetail,
  ProjectBoardSourceReview,
} from "./ProjectBoardSourceViews";
import {
  projectBoardCharterReviewActionState,
  projectBoardOverviewModel,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroups,
  projectBoardTabs,
  type ProjectBoardComplexityEstimate,
  type ProjectBoardTabId,
} from "./projectBoardUiModel";

export function ProjectBoardComplexityShadowPanel({ estimate }: { estimate: ProjectBoardComplexityEstimate }) {
  const bandClass = estimate.band === "large" ? "danger" : estimate.band === "medium" ? "warning" : "ready";
  const confidenceLabel = estimate.confidence[0].toUpperCase() + estimate.confidence.slice(1);
  return (
    <section className={`project-board-complexity-shadow ${estimate.band}`} aria-label="Shadow project complexity estimate">
      <div className="project-board-complexity-summary">
        <div className="project-board-complexity-heading">
          <Target size={16} />
          <div>
            <span className="project-board-kicker">{estimate.heading}</span>
            <strong>
              Project complexity: {estimate.label} {estimate.score}/{estimate.maxScore}
            </strong>
          </div>
        </div>
        <p>{estimate.summary}</p>
      </div>
      <div className="project-board-complexity-meta">
        <span className={`project-board-status ${bandClass}`}>Would suggest {estimate.planningMode}</span>
        <span className="project-board-status">{estimate.anchorLabel}</span>
        <span className="project-board-status">{estimate.suggestedCardBudget.label}</span>
        <span className="project-board-status">{confidenceLabel} confidence</span>
        <span className="project-board-status">No behavior changes</span>
      </div>
      <div className="project-board-complexity-signals" aria-label="Complexity score inputs">
        {estimate.signals.slice(0, 5).map((signal) => (
          <span key={signal.id} className={`project-board-complexity-signal ${signal.tone}`} title={signal.detail}>
            <span>{signal.label}</span>
            {estimate.source === "model_scope_contract" ? null : <strong>{signal.score > 0 ? `+${signal.score}` : signal.score}</strong>}
          </span>
        ))}
      </div>
    </section>
  );
}

export function ProjectBoardTabs({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: ReturnType<typeof projectBoardTabs>;
  activeTab: ProjectBoardTabId;
  onSelect: (tab: ProjectBoardTabId) => void;
}) {
  return (
    <nav className="project-board-tabs" aria-label="Project board views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? "active" : ""}
          aria-current={tab.id === activeTab ? "page" : undefined}
          title={projectBoardTabTitle(tab.id)}
          onClick={() => onSelect(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.count !== undefined && <strong>{tab.count}</strong>}
        </button>
      ))}
    </nav>
  );
}

export function ProjectBoardOverviewTab({
  board,
  orchestrationBoard,
  gitStatus,
  gitError,
  onSelectTab,
  onSelectCard,
}: {
  board: ProjectBoardSummary;
  orchestrationBoard?: OrchestrationBoard;
  gitStatus?: ProjectBoardGitSyncStatus;
  gitError?: string;
  onSelectTab: (tabId: ProjectBoardTabId) => void;
  onSelectCard: (cardId: string, options?: ProjectBoardCardInspectorOptions) => void;
}) {
  const overview = useMemo(
    () =>
      projectBoardOverviewModel(board, {
        tasks: orchestrationBoard?.tasks,
        runs: orchestrationBoard?.runs,
        workflowReadiness: orchestrationBoard?.workflowReadiness,
        gitStatus,
        gitError,
      }),
    [board, orchestrationBoard?.runs, orchestrationBoard?.tasks, orchestrationBoard?.workflowReadiness, gitError, gitStatus],
  );

  return (
    <section className="project-board-tab-panel project-board-overview" aria-label="Project board overview">
      <header className={`project-board-overview-summary ${overview.tone}`}>
        <div>
          <span className="project-board-kicker">Overview</span>
          <h3>{overview.headline}</h3>
          <p>{overview.detail}</p>
        </div>
        <div className="project-board-overview-metrics" aria-label="Overview metrics">
          {overview.metrics.map((metric) => (
            <span key={metric.label} title={metric.title}>
              <strong>{metric.value}</strong>
              {metric.label}
            </span>
          ))}
        </div>
      </header>

      <section className="project-board-overview-section" aria-label="Planner workflow steps">
        <header>
          <div>
            <span className="project-board-kicker">Workflow</span>
            <h4>Tabs map to the next user action</h4>
          </div>
        </header>
        <div className="project-board-overview-steps">
          {overview.steps.map((step) => (
            <article key={step.id} className={`project-board-overview-step ${step.tone}`}>
              <div className="project-board-overview-step-number">{step.order}</div>
              <div>
                <h5>{step.title}</h5>
                <p>{step.detail}</p>
                <div className="project-board-overview-step-footer">
                  <span className={`project-board-status ${step.tone === "neutral" ? "" : step.tone}`}>{step.statusLabel}</span>
                  <button type="button" className="secondary-button" onClick={() => onSelectTab(step.tabId)} title={`Open ${step.title.toLowerCase()}.`}>
                    <span>{step.actionLabel}</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="project-board-overview-section" aria-label="Global impact queue">
        <header>
          <div>
            <span className="project-board-kicker">Impact queue</span>
            <h4>{overview.impactQueue.headline}</h4>
            <p>{overview.impactQueue.detail}</p>
          </div>
          <div className="project-board-overview-metrics compact">
            {overview.impactQueue.metrics.map((metric) => (
              <span key={metric.label} title={metric.title}>
                <strong>{metric.value}</strong>
                {metric.label}
              </span>
            ))}
          </div>
        </header>
        {overview.impactQueue.items.length > 0 ? (
          <div className="project-board-impact-queue">
            {overview.impactQueue.items.map((item) => {
              const affectedCards = item.affectedCardIds
                .map((cardId) => board.cards.find((card) => card.id === cardId))
                .filter((card): card is ProjectBoardCard => Boolean(card))
                .slice(0, 3);
              return (
                <article key={item.id} className={`project-board-impact-item ${item.tone}`}>
                  <div>
                    <div className="project-board-impact-item-heading">
                      <span>{projectBoardImpactKindLabel(item.kind)}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.detail}</p>
                    {affectedCards.length > 0 && (
                      <div className="project-board-impact-cards" aria-label="Affected cards">
                        {affectedCards.map((card) => (
                          <button
                            type="button"
                            key={card.id}
                            className="project-board-source-link-button"
                            title={`Inspect ${card.title}.`}
                            onClick={() => onSelectCard(card.id)}
                          >
                            <span>{card.title}</span>
                          </button>
                        ))}
                        {item.affectedCardIds.length > affectedCards.length && <span>+{item.affectedCardIds.length - affectedCards.length} more</span>}
                      </div>
                    )}
                  </div>
                  <div className="project-board-impact-side">
                    <span className={item.modelCallRequired ? "project-board-status warning" : "project-board-status ready"}>
                      {item.modelCallRequired ? "Targeted Pi" : "0 model calls"}
                    </span>
                    <div className="project-board-overview-metrics compact">
                      {item.metrics.map((metric) => (
                        <span key={metric.label} title={metric.title}>
                          <strong>{metric.value}</strong>
                          {metric.label}
                        </span>
                      ))}
                    </div>
                    <button type="button" className="secondary-button" onClick={() => onSelectTab(item.tabId)} title={`Open ${projectBoardImpactKindLabel(item.kind)} actions.`}>
                      <span>{item.actionLabel}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="project-board-column-empty">No workflow, decision, source, proof, or recovery impact needs action right now.</div>
        )}
      </section>
    </section>
  );
}

export function ProjectBoardCharterTab({
  board,
  finalizeBusy,
  sourceBusy,
  sourceImpactBusy,
  kickoffDefaultsBusy,
  refineBusy,
  onAnswerQuestion,
  onFinalizeKickoff,
  onCancelRevision,
  onRefreshSources,
  onSuggestKickoffDefaults,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onRefineWithPi,
  onElaborateSources,
  onUpdateSource,
  sourcePickerRequestId,
  sourceFocusSourceId,
  onOpenSourceReview,
  onInspectCard,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  finalizeBusy: boolean;
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  kickoffDefaultsBusy: boolean;
  refineBusy: boolean;
  onAnswerQuestion: (question: ProjectBoardQuestion, answer: string) => void;
  onFinalizeKickoff: (boardId: string) => void;
  onCancelRevision: (boardId: string) => void;
  onRefreshSources: (boardId: string) => void;
  onSuggestKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void> | void;
  onRefreshSourceDrafts: (input: RefreshProjectBoardSourceDraftsInput) => Promise<void> | void;
  onRegenerateSourceDrafts: (input: RegenerateProjectBoardSourceDraftsInput) => Promise<void> | void;
  onApplySourceImpactFeedback: (input: ApplyProjectBoardSourceImpactFeedbackInput) => Promise<void> | void;
  onRefineWithPi: (boardId: string) => void;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onUpdateSource: (input: UpdateProjectBoardSourceInput) => void;
  sourcePickerRequestId?: number;
  sourceFocusSourceId?: string;
  onOpenSourceReview: (sourceId?: string) => void;
  onInspectCard: (cardId: string) => void;
}) {
  const [selectedSourceGroupId, setSelectedSourceGroupId] = useState<string | undefined>();
  const handledSourcePickerRequestId = useRef(0);
  const sourceGroups = useMemo(() => projectBoardSourceGroups(board.sources), [board.sources]);
  const sourceChangeSummary = useMemo(() => projectBoardSourceChangeSummary(sourceGroups, board.events ?? []), [board.events, sourceGroups]);
  const selectedSourceGroup = sourceGroups.find((group) => group.id === selectedSourceGroupId);

  useEffect(() => {
    if (selectedSourceGroupId && !selectedSourceGroup) setSelectedSourceGroupId(undefined);
  }, [selectedSourceGroup, selectedSourceGroupId]);

  useEffect(() => {
    if (!sourcePickerRequestId || handledSourcePickerRequestId.current === sourcePickerRequestId || sourceGroups.length === 0) return;
    handledSourcePickerRequestId.current = sourcePickerRequestId;
    const focusedGroup =
      sourceFocusSourceId
        ? sourceGroups.find((group) =>
            group.observations.some(
              (source) =>
                source.id === sourceFocusSourceId ||
                source.sourceKey === sourceFocusSourceId ||
                source.path === sourceFocusSourceId ||
                source.threadId === sourceFocusSourceId ||
                source.artifactId === sourceFocusSourceId,
            ),
          )
        : undefined;
    setSelectedSourceGroupId((focusedGroup ?? sourceGroups[0]).id);
  }, [sourceFocusSourceId, sourcePickerRequestId, sourceGroups]);

  const reviewAction = projectBoardCharterReviewActionState(board);
  const reviewDisabled = refineBusy || sourceBusy || reviewAction.disabled;
  const reviewTitle = sourceBusy
    ? "Wait for source refresh to finish before asking Pi to review the charter."
    : refineBusy
      ? "Pi is already reviewing the board or elaborating source cards."
      : reviewAction.title;
  const answeredKickoffQuestionCount = board.questions.filter((question) => question.answer?.trim()).length;
  const kickoffQuestionsComplete = board.questions.length > 0 && answeredKickoffQuestionCount === board.questions.length;
  const workflowCopy =
    board.status === "draft"
      ? kickoffQuestionsComplete
        ? "Kickoff answers are captured. Review the answers with Pi if you want a source-conflict check before activation, then activate the charter to unlock ticketization."
        : "Answer the kickoff questions first to create the charter. After the charter is active, use Pi review to check source conflicts or missing PM decisions before candidate cards become executable."
      : "Use this pane to inspect source authority, proof policy, and ambiguity handling. Pi review checks the active charter against sources, candidate cards, and dependency gaps.";

  return (
    <section className="project-board-tab-panel" aria-label="Project board charter">
      <section className="project-board-charter-actions" aria-label="Charter actions">
        <div>
          <span className="project-board-kicker">Charter workflow</span>
          <h3>{board.status === "draft" ? "Create or revise the project charter" : "Active project charter"}</h3>
          <p>{workflowCopy}</p>
        </div>
        <div className="project-board-card-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={sourceBusy}
            title={sourceBusy ? "Source evidence is already refreshing." : sourceChangeSummary.refreshTitle}
            onClick={() => onRefreshSources(board.id)}
          >
            <RefreshCw size={14} className={sourceBusy ? "spin" : ""} />
            <span>{sourceBusy ? "Refreshing" : "Refresh Sources"}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={reviewDisabled}
            title={reviewTitle}
            onClick={() => onRefineWithPi(board.id)}
          >
            <Zap size={14} className={refineBusy ? "spin" : ""} />
            <span>{refineBusy ? "Reviewing Charter" : reviewAction.label}</span>
          </button>
        </div>
      </section>
      {board.status === "draft" && (
        <ProjectBoardKickoffInterview
          board={board}
          finalizeBusy={finalizeBusy}
          suggestDefaultsBusy={kickoffDefaultsBusy}
          questions={board.questions}
          onAnswerQuestion={onAnswerQuestion}
          onFinalizeKickoff={onFinalizeKickoff}
          onCancelRevision={onCancelRevision}
          onSuggestKickoffDefaults={onSuggestKickoffDefaults}
          onReviewIgnoredThreads={onOpenSourceReview}
        />
      )}
      <div className={`project-board-charter-workspace ${selectedSourceGroup ? "has-inspector" : ""}`}>
        <div>
          {board.charter ? (
            <ProjectBoardCharterPreview board={board} />
          ) : (
            <div className="project-board-column-empty">Answer the kickoff questions to create the active project charter.</div>
          )}
          <ProjectBoardSourceReview
            sources={board.sources}
            cards={board.cards}
            events={board.events ?? []}
            selectedGroupId={selectedSourceGroupId}
            sourcePickerRequestId={sourcePickerRequestId}
            sourceFocusSourceId={sourceFocusSourceId}
            onSelectGroup={setSelectedSourceGroupId}
            onUpdateSource={onUpdateSource}
            sourceImpactBusy={sourceImpactBusy}
            onRefreshSourceDrafts={(sourceIds) => onRefreshSourceDrafts({ boardId: board.id, sourceIds })}
            onRegenerateSourceDrafts={(sourceIds) => onRegenerateSourceDrafts({ boardId: board.id, sourceIds })}
            onApplySourceImpactFeedback={(sourceIds) => onApplySourceImpactFeedback({ boardId: board.id, sourceIds })}
            onInspectCard={onInspectCard}
          />
        </div>
        {selectedSourceGroup ? (
          <ProjectBoardSourceDetail
            group={selectedSourceGroup}
            boardId={board.id}
            cards={board.cards}
            elaborateBusy={refineBusy}
            onElaborateSources={onElaborateSources}
            onInspectCard={onInspectCard}
            onClose={() => setSelectedSourceGroupId(undefined)}
          />
        ) : (
          <aside className="project-board-source-detail empty" aria-label="Project source detail" data-ui-scroll-container="required">
            <FileText size={18} />
            <h3>Select a source</h3>
            <p>Source inspector. Select a source to inspect provenance or ask Pi to elaborate additive cards from that source.</p>
          </aside>
        )}
      </div>
    </section>
  );
}
