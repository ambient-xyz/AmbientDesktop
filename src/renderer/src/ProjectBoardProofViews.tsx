import { AlertCircle, Bot, Info, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";

import type {
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
  ProjectBoardCard,
  ProjectBoardProofDecisionAction,
  ProjectSummary,
  RerunProjectBoardProofInput,
} from "../../shared/types";
import {
  projectBoardLatestProofCoverageRecheckEvent,
  projectBoardProofCoverageDrift,
  projectBoardProofCoverageRecheck,
} from "../../shared/projectBoardProofImpact";
import { formatOrchestrationRunStatus, ProofOfWorkPreview } from "./AutomationsWorkspace";
import { formatTaskState, formatTimelineTime } from "./RightPanel";
import { projectBoardPhaseDisplayName } from "./ProjectBoardLaneViews";
import {
  projectBoardActiveCardDetail,
  projectBoardCanonicalCardProjection,
  projectBoardProofCoverageForBoard,
  projectBoardProofDecisionModel,
  projectBoardProofEvidenceModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardProofReviewQueueSummary,
  projectBoardTestSummaryForBoard,
} from "./projectBoardUiModel";

export type ProjectBoardProofCardInspectorOptions = { tab?: "spec" | "proof" | "dependencies" | "history"; scroll?: boolean };

export type ProjectBoardProofReviewQueueItemModel = {
  card: ProjectBoardCard;
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
  projection: ReturnType<typeof projectBoardCanonicalCardProjection>;
  decision: ReturnType<typeof projectBoardProofDecisionModel>;
  evidence?: ReturnType<typeof projectBoardProofEvidenceModel>;
  followUpImpact: ReturnType<typeof projectBoardProofFollowUpImpactModel>;
};


export function ProjectBoardProofTab({
  board,
  orchestrationBoard,
  runBusy,
  onSelectCard,
  onResolveProofDecision,
  onRerunProof,
  onRecomputeProofCoverage,
  onSuggestProof,
}: {
  board: NonNullable<ProjectSummary["board"]>;
  orchestrationBoard?: OrchestrationBoard;
  runBusy?: string;
  onSelectCard: (cardId: string, options?: ProjectBoardProofCardInspectorOptions) => void;
  onResolveProofDecision: (cardId: string, action: ProjectBoardProofDecisionAction, reason?: string) => void;
  onRerunProof: (input: RerunProjectBoardProofInput) => void;
  onRecomputeProofCoverage: (boardId: string) => void;
  onSuggestProof: (boardId: string, cardIds?: string[]) => void;
}) {
  const [proofDecisionReasons, setProofDecisionReasons] = useState<Record<string, string>>({});
  const summary = projectBoardTestSummaryForBoard(board);
  const coverage = projectBoardProofCoverageForBoard(board);
  const currentProofImpact = projectBoardProofCoverageRecheck(board);
  const latestProofRecheck = projectBoardLatestProofCoverageRecheckEvent(board.events);
  const proofCoverageBusy = runBusy === `proof-coverage:${board.id}`;
  const proofSuggestionBusy = runBusy === `proof-suggest:${board.id}`;
  const tasks = orchestrationBoard?.tasks ?? [];
  const runs = orchestrationBoard?.runs ?? [];
  const proofReviewCardIds = new Set(projectBoardProofReviewQueueSummary(board, orchestrationBoard).cardIds);
  const proofReviewRank = (item: ProjectBoardProofReviewQueueItemModel) => {
    if (item.projection.terminalDone) return 9;
    if (item.card.proofReview?.status === "retry_recommended") return 0;
    if (item.card.status === "review") return 1;
    if (item.card.proofReview) return 2;
    if (item.latestRun?.status === "completed") return 3;
    if (item.latestRun?.status === "failed" || item.latestRun?.status === "stalled") return 4;
    return 5;
  };
  const proofReviewItems = board.cards
    .filter((card) => card.status !== "draft" && card.status !== "archived")
    .map((card): ProjectBoardProofReviewQueueItemModel => {
      const detail = projectBoardActiveCardDetail(card, board.cards, tasks, runs, board.executionArtifacts ?? []);
      const projection = projectBoardCanonicalCardProjection(card, { task: detail.task, latestRun: detail.latestRun });
      const decision = projectBoardProofDecisionModel(card, board, detail.task, detail.latestRun);
      const evidence = detail.latestRun ? projectBoardProofEvidenceModel(detail.latestRun, card) : undefined;
      const followUpImpact = projectBoardProofFollowUpImpactModel(card, board.cards);
      return { card, task: detail.task, latestRun: detail.latestRun, projection, decision, evidence, followUpImpact };
    })
    .filter((item) => proofReviewCardIds.has(item.card.id))
    .sort((left, right) => proofReviewRank(left) - proofReviewRank(right) || left.card.title.localeCompare(right.card.title));
  const proofReviewItemsByCardId = new Map(proofReviewItems.map((item) => [item.card.id, item]));
  const proofSuggestionTargets = coverage.missing.filter((card) => !card.pendingPiUpdate).slice(0, 12);
  const setProofDecisionReason = (cardId: string, value: string) =>
    setProofDecisionReasons((current) => ({
      ...current,
      [cardId]: value,
    }));
  const submitProofDecision = (cardId: string, action: ProjectBoardProofDecisionAction) => {
    const item = proofReviewItemsByCardId.get(cardId);
    const proofAction = item?.decision.actions.find((candidate) => candidate.action === action);
    if (!item?.decision.readyForDecision || !proofAction || proofAction.disabled) return;
    onResolveProofDecision(cardId, action, proofDecisionReasons[cardId]?.trim() || undefined);
    setProofDecisionReasons((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  };
  return (
    <section className="project-board-tab-panel project-board-proof-panel" aria-label="Project board proof expectations">
      <header className="project-board-panel-header">
        <div>
          <span className="project-board-kicker">Proof</span>
          <h3>{summary.missing.length} card{summary.missing.length === 1 ? "" : "s"} missing proof</h3>
        </div>
        <span className={`project-board-status ${summary.strict && summary.missing.length > 0 ? "warning" : ""}`}>
          {summary.strict && summary.missing.length > 0
            ? "Strict proof gate"
            : `${summary.unit + summary.integration + summary.visual + summary.manual} proof item${summary.unit + summary.integration + summary.visual + summary.manual === 1 ? "" : "s"}`}
        </span>
      </header>
      {summary.strict && summary.missing.length > 0 && (
        <div className="project-board-proof-gate">
          <AlertCircle size={15} />
          <p>Strict proof policy is active. Cards missing unit, integration, visual, or manual proof cannot be marked ready or approved.</p>
        </div>
      )}
      {coverage.relaxedWarning && (
        <div className="project-board-proof-gate relaxed">
          <Info size={15} />
          <p>Relaxed proof policy is active. Missing proof can be inferred at run time, but review these cards before low-intervention dispatch.</p>
        </div>
      )}
      <ProjectBoardProofCoverageRecheckPanel
        cards={board.cards}
        coverage={coverage}
        currentImpact={currentProofImpact}
        latestRecheck={latestProofRecheck}
        busy={proofCoverageBusy}
        suggestionBusy={proofSuggestionBusy}
        onSelectCard={onSelectCard}
        onRecompute={() => onRecomputeProofCoverage(board.id)}
        onSuggest={() => onSuggestProof(board.id, proofSuggestionTargets.map((card) => card.id))}
      />
      <div className="project-board-proof-summary">
        <ProjectBoardProofStat label="Unit" count={summary.unit} />
        <ProjectBoardProofStat label="Integration" count={summary.integration} />
        <ProjectBoardProofStat label="Visual" count={summary.visual} />
        <ProjectBoardProofStat label="Manual" count={summary.manual} />
      </div>
      <ProjectBoardProofReviewQueue
        items={proofReviewItems}
        runBusy={runBusy}
        reasons={proofDecisionReasons}
        onReasonChange={setProofDecisionReason}
        onSubmitDecision={submitProofDecision}
        onRerunProof={(cardId) => onRerunProof({ cardId, reason: proofDecisionReasons[cardId]?.trim() || undefined })}
        onSelectCard={(cardId) => onSelectCard(cardId, { tab: "proof", scroll: true })}
      />
      <div className="project-board-proof-grid">
        <section>
          <h4>Missing proof</h4>
          <div className="project-board-card-list">
            {coverage.missing.length > 0 ? (
              coverage.missing.map((card) => <ProjectBoardProofCard card={card} key={card.id} compact />)
            ) : (
              <div className="project-board-column-empty">Every runnable card currently has at least one proof expectation.</div>
            )}
          </div>
        </section>
        <section>
          <h4>Unit proof</h4>
          <div className="project-board-card-list">
            {coverage.unit.length > 0 ? (
              coverage.unit.map((card) => <ProjectBoardProofCard card={card} key={card.id} proofKinds={["unit"]} />)
            ) : (
              <div className="project-board-column-empty">No cards currently require unit proof.</div>
            )}
          </div>
        </section>
        <section>
          <h4>Integration / browser proof</h4>
          <div className="project-board-card-list">
            {coverage.integrationOrBrowser.length > 0 ? (
              coverage.integrationOrBrowser.map((card) => <ProjectBoardProofCard card={card} key={card.id} proofKinds={["integration", "visual"]} />)
            ) : (
              <div className="project-board-column-empty">No cards currently require integration or browser proof.</div>
            )}
          </div>
        </section>
        <section>
          <h4>Manual review</h4>
          <div className="project-board-card-list">
            {coverage.manual.length > 0 ? (
              coverage.manual.map((card) => <ProjectBoardProofCard card={card} key={card.id} proofKinds={["manual"]} />)
            ) : (
              <div className="project-board-column-empty">No cards currently require manual review.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}


export function ProjectBoardProofCoverageRecheckPanel({
  cards,
  coverage,
  currentImpact,
  latestRecheck,
  busy,
  suggestionBusy,
  onSelectCard,
  onRecompute,
  onSuggest,
}: {
  cards: ProjectBoardCard[];
  coverage: ReturnType<typeof projectBoardProofCoverageForBoard>;
  currentImpact: ReturnType<typeof projectBoardProofCoverageRecheck>;
  latestRecheck?: ReturnType<typeof projectBoardLatestProofCoverageRecheckEvent>;
  busy: boolean;
  suggestionBusy: boolean;
  onSelectCard: (cardId: string) => void;
  onRecompute: () => void;
  onSuggest: () => void;
}) {
  const last = latestRecheck?.proofImpact;
  const drift = projectBoardProofCoverageDrift(currentImpact, last);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const affectedCards = drift.affectedCardIds.slice(0, 6).map((cardId) => ({
    cardId,
    card: cardsById.get(cardId),
    label: projectBoardProofDriftCardLabel(drift, cardId),
  }));
  const proofItemCount =
    currentImpact.unitProofItemCount +
    currentImpact.integrationProofItemCount +
    currentImpact.visualProofItemCount +
    currentImpact.manualProofItemCount;
  const pendingSuggestionCount = coverage.missing.filter((card) => card.pendingPiUpdate?.changedFields.includes("testPlan")).length;
  const actionableSuggestionCount = Math.min(coverage.missing.filter((card) => !card.pendingPiUpdate).length, 12);
  const stale = drift.stale;
  const policyLabel =
    latestRecheck && last?.proofPolicyHash !== currentImpact.proofPolicyHash
      ? `${last?.proofPolicyHash} -> ${currentImpact.proofPolicyHash}`
      : currentImpact.proofPolicyHash;

  return (
    <section className="project-board-proof-recheck" aria-label="Proof coverage impact recheck">
      <div>
        <header>
          <span className="project-board-kicker">Proof impact</span>
          <h4>
            {stale
              ? drift.policyChanged || drift.strictChanged
                ? "Proof policy changed since last recheck"
                : "Coverage changed since last recheck"
              : "Deterministic coverage is visible"}
          </h4>
        </header>
        <p>
          Recompute proof coverage from current cards and proof policy without calling Pi or rewriting approved card fields. This records an audit event so
          policy changes explain exactly which cards are missing proof.
        </p>
        <div className="project-board-proof-review-metrics">
          <span className={coverage.missing.length > 0 ? "warning" : "success"}>
            <strong>Missing proof</strong>
            {coverage.missing.length}
          </span>
          <span>
            <strong>Proof items</strong>
            {proofItemCount}
          </span>
          <span>
            <strong>Model calls</strong>0
          </span>
          <span className={drift.policyChanged || drift.strictChanged ? "warning" : "success"}>
            <strong>Policy</strong>
            {currentImpact.strict ? "Strict" : "Relaxed"} {policyLabel}
          </span>
          <span className={coverage.missing.length > 0 ? "warning" : "success"}>
            <strong>Targeted cards</strong>
            {coverage.missing.length > 12 ? `${actionableSuggestionCount} of ${coverage.missing.length}` : actionableSuggestionCount > 0 ? actionableSuggestionCount : "None"}
          </span>
          <span className={pendingSuggestionCount > 0 ? "warning" : "success"}>
            <strong>Pending review</strong>
            {pendingSuggestionCount}
          </span>
          {latestRecheck && (
            <span className={stale ? "warning" : "success"}>
              <strong>Last recheck</strong>
              {formatTimelineTime(latestRecheck.event.createdAt)}
            </span>
          )}
        </div>
        {latestRecheck && (
          <ul className={`project-board-proof-drift-list ${stale ? "warning" : "success"}`} aria-label="Proof coverage drift reasons">
            {drift.reasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {latestRecheck && affectedCards.length > 0 && (
          <div className="project-board-proof-drift-cards" aria-label="Proof coverage affected cards">
            <div className="project-board-proof-drift-card-summary">
              <strong>{drift.affectedCardIds.length} affected card{drift.affectedCardIds.length === 1 ? "" : "s"}</strong>
              <span>
                {drift.affectedCardIds.length > affectedCards.length
                  ? `Showing ${affectedCards.length}; recheck records the full affected set.`
                  : "Jump to card details before suggesting proof."}
              </span>
            </div>
            <div className="project-board-proof-drift-card-list">
              {affectedCards.map(({ cardId, card, label }) => (
                <article className="project-board-proof-drift-card" key={cardId}>
                  <div>
                    <span>{label}</span>
                    <strong>{card?.title ?? cardId}</strong>
                  </div>
                  {card && (
                    <button type="button" className="project-board-text-button" title={`Inspect ${card.title} in the card detail panel.`} onClick={() => onSelectCard(card.id)}>
                      Inspect
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="project-board-proof-recheck-actions">
        <button
          type="button"
          className="project-board-card-action secondary"
          onClick={onRecompute}
          disabled={busy || suggestionBusy}
          title="Record a deterministic proof coverage recheck in History. This does not call Pi or rewrite cards."
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} />
          {busy ? "Rechecking" : latestRecheck ? "Recheck coverage" : "Record recheck"}
        </button>
        <button
          type="button"
          className="project-board-card-action"
          onClick={onSuggest}
          disabled={suggestionBusy || busy || actionableSuggestionCount === 0}
          title="Ask Ambient/Pi for targeted proof expectations for missing-proof draft cards. Suggestions are staged as reviewable Pi updates; ticketized cards are skipped, not rewritten."
        >
          <Bot size={14} className={suggestionBusy ? "spin" : ""} />
          {suggestionBusy ? "Suggesting" : "Suggest proof"}
        </button>
      </div>
    </section>
  );
}


export function projectBoardProofDriftCardLabel(drift: ReturnType<typeof projectBoardProofCoverageDrift>, cardId: string): string {
  if (drift.addedMissingProofCardIds.includes(cardId)) return "New proof gap";
  if (drift.resolvedMissingProofCardIds.includes(cardId)) return "Proof gap resolved";
  if (drift.proofKindChangedCardIds.includes(cardId)) return "Proof kind changed";
  if (drift.proofItemCountChangedCardIds.includes(cardId)) return "Proof count changed";
  if (drift.addedEligibleCardIds.includes(cardId)) return "New eligible card";
  if (drift.removedEligibleCardIds.includes(cardId)) return "No longer eligible";
  if (drift.policyAffectedCardIds.includes(cardId)) return "Policy review";
  return "Affected card";
}


export function ProjectBoardProofReviewQueue({
  items,
  runBusy,
  reasons,
  onReasonChange,
  onSubmitDecision,
  onRerunProof,
  onSelectCard,
}: {
  items: ProjectBoardProofReviewQueueItemModel[];
  runBusy?: string;
  reasons: Record<string, string>;
  onReasonChange: (cardId: string, value: string) => void;
  onSubmitDecision: (cardId: string, action: ProjectBoardProofDecisionAction) => void;
  onRerunProof: (cardId: string) => void;
  onSelectCard: (cardId: string) => void;
}) {
  return (
    <section className="project-board-proof-review-queue" aria-label="Proof review queue">
      <header>
        <div>
          <h4>Proof review queue</h4>
          <p>Completed runs, PM proof reviews, and failed proof packets land here before a card closes or is sent back for revision.</p>
        </div>
        <span className={`project-board-status ${items.length > 0 ? "warning" : ""}`}>
          {items.length === 0 ? "No proof waiting" : `${items.length} proof item${items.length === 1 ? "" : "s"}`}
        </span>
      </header>
      {items.length > 0 ? (
        <div className="project-board-proof-review-list">
          {items.slice(0, 12).map((item) => (
            <ProjectBoardProofReviewQueueItem
              key={item.card.id}
              item={item}
              runBusy={runBusy}
              reason={reasons[item.card.id] ?? ""}
              onReasonChange={(value) => onReasonChange(item.card.id, value)}
              onSubmitDecision={(action) => onSubmitDecision(item.card.id, action)}
              onRerunProof={() => onRerunProof(item.card.id)}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>
      ) : (
        <div className="project-board-column-empty">No proof packets are currently waiting for PM action.</div>
      )}
    </section>
  );
}


export function ProjectBoardProofReviewQueueItem({
  item,
  runBusy,
  reason,
  onReasonChange,
  onSubmitDecision,
  onRerunProof,
  onSelectCard,
}: {
  item: ProjectBoardProofReviewQueueItemModel;
  runBusy?: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmitDecision: (action: ProjectBoardProofDecisionAction) => void;
  onRerunProof: () => void;
  onSelectCard: (cardId: string) => void;
}) {
  const proofActions = item.decision.actions;
  const canResolveProof = item.decision.readyForDecision && proofActions.some((action) => !action.disabled);
  const rerunBusyKey = `proof:${item.card.id}:rerun`;
  const canRerunProof = Boolean(item.latestRun && !["claimed", "prepared", "preparing", "running", "retry_queued"].includes(item.latestRun.status));
  const latestStatus = item.projection.runLabel ?? (item.latestRun ? formatOrchestrationRunStatus(item.latestRun) : item.task ? formatTaskState(item.task.state) : "No linked run");
  const itemStateClass = item.decision.awaitingRun ? "proof-not-ready" : item.projection.terminalDone ? "done" : item.card.proofReview?.status ?? item.card.status;
  const statusLabel = item.projection.terminalDone ? item.projection.statusLabel : item.decision.statusLabel;
  return (
    <article className={`project-board-proof-review-item ${itemStateClass}`} title={item.decision.awaitingRun ? item.decision.readinessReason : undefined}>
      <header>
        <div>
          <span className={`project-board-card-meta ${item.decision.awaitingRun ? "proof-not-ready-blink" : ""}`} title={item.decision.awaitingRun ? item.decision.readinessReason : undefined}>
            {projectBoardPhaseDisplayName(item.card.phase || "Unassigned")} · {latestStatus}
          </span>
          <h4>{item.card.title}</h4>
        </div>
        <span
          className={`project-board-status ${item.decision.awaitingRun ? "danger proof-not-ready-blink" : ""}`}
          title={item.decision.awaitingRun ? item.decision.readinessReason : item.projection.summary}
        >
          {statusLabel}
        </span>
      </header>
      <p>{item.decision.rationale}</p>
      <p className="project-board-detail-note">{item.decision.nextAction}</p>
      {item.evidence?.metrics.length ? (
        <div className="project-board-proof-review-metrics">
          {item.evidence.metrics.slice(0, 6).map((metric) => (
            <span className={metric.tone} key={`${metric.label}:${metric.value}`}>
              <strong>{metric.label}</strong>
              {metric.value}
            </span>
          ))}
        </div>
      ) : null}
      {item.card.proofReview?.missing.length ? (
        <ul className="project-board-proof-review-missing">
          {item.card.proofReview.missing.slice(0, 4).map((missing) => (
            <li key={missing}>{missing}</li>
          ))}
        </ul>
      ) : null}
      <ProjectBoardProofFollowUpImpactPanel model={item.followUpImpact} onSelectCard={onSelectCard} />
      {item.latestRun && <ProofOfWorkPreview run={item.latestRun} card={item.card} defaultOpen />}
      {canResolveProof && (
        <label className="project-board-proof-decision-note compact">
          <span>Reviewer note</span>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="For send-back, write the revision instruction that should be included in the next run prompt."
          />
        </label>
      )}
      <div className="project-board-card-actions">
        <button type="button" className="project-board-card-action secondary" onClick={() => onSelectCard(item.card.id)} title="Open this card in the Board inspector.">
          Inspect card
        </button>
        <button
          type="button"
          className="project-board-card-action secondary"
          disabled={!canRerunProof || runBusy === rerunBusyKey}
          title={
            canRerunProof
              ? "Re-run the automatic Ambient/Pi proof judgment against the latest proof packet without running implementation again."
              : "Wait for a finished proof packet before re-running automatic proof."
          }
          onClick={onRerunProof}
        >
          {runBusy === rerunBusyKey ? "Re-running" : "Re-run proof"}
        </button>
        {proofActions.map((action) => {
          const busyKey = `proof:${item.card.id}:${action.action}`;
          const proofDecisionDisabled = !item.decision.readyForDecision || action.disabled || runBusy === busyKey;
          return (
            <button
              type="button"
              key={action.action}
              className={`project-board-card-action ${action.tone === "primary" ? "" : action.tone}`}
              disabled={proofDecisionDisabled}
              title={item.decision.readyForDecision ? action.title : item.decision.readinessReason}
              onClick={() => onSubmitDecision(action.action)}
            >
              {runBusy === busyKey ? "Saving" : action.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}


export function ProjectBoardProofFollowUpImpactPanel({
  model,
  compact = false,
  onSelectCard,
}: {
  model: ReturnType<typeof projectBoardProofFollowUpImpactModel>;
  compact?: boolean;
  onSelectCard?: (cardId: string) => void;
}) {
  if (!model.visible) return null;
  return (
    <section className={`project-board-proof-followup-impact ${compact ? "compact" : ""}`} aria-label="Proof follow-up impact">
      <header>
        <div>
          <span className="project-board-kicker">Follow-up preview</span>
          <strong>{model.headline}</strong>
        </div>
        <span>0 model calls</span>
      </header>
      <p>{model.detail}</p>
      <p className="project-board-detail-note">{model.parentOutcome}</p>
      <div className="project-board-proof-review-metrics">
        {model.metrics.map((metric) => (
          <span className={metric.tone} key={`${metric.label}:${metric.value}`}>
            <strong>{metric.label}</strong>
            {metric.value}
          </span>
        ))}
      </div>
      {model.unresolvedFollowUpCardIds.length > 0 && (
        <p className="project-board-detail-note">
          {model.unresolvedFollowUpCardIds.length} linked follow-up reference{model.unresolvedFollowUpCardIds.length === 1 ? "" : "s"} could not be found.
        </p>
      )}
      {model.cards.length > 0 && (
        <div className="project-board-proof-followup-list">
          {model.cards.map((card) => (
            <article className="project-board-proof-followup-card" key={card.cardId}>
              <div>
                <span>{card.sourceLabel}</span>
                <strong>{card.title}</strong>
              </div>
              <p>{card.summary}</p>
              <div className="project-board-detail-tags">
                <span>{card.statusLabel}</span>
                <span className={card.blockedByParent ? "warning" : undefined}>{card.blockerLabel}</span>
                <span>{card.proofExpectationCount} proof item{card.proofExpectationCount === 1 ? "" : "s"}</span>
              </div>
              {card.acceptanceCriteria.length > 0 && !compact && (
                <ul>
                  {card.acceptanceCriteria.map((criterion) => (
                    <li key={`criterion-${card.cardId}-${criterion}`}>{criterion}</li>
                  ))}
                </ul>
              )}
              {card.proofExpectations.length > 0 && !compact && (
                <ul className="proof">
                  {card.proofExpectations.map((proof) => (
                    <li key={`proof-${card.cardId}-${proof}`}>{proof}</li>
                  ))}
                </ul>
              )}
              {onSelectCard && (
                <button
                  type="button"
                  className="project-board-card-action secondary"
                  onClick={() => onSelectCard(card.cardId)}
                  title="Open this follow-up card in the Board inspector."
                >
                  Inspect follow-up
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


export function ProjectBoardProofStat({ label, count }: { label: string; count: number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{count}</strong>
    </article>
  );
}


export function ProjectBoardProofCard({
  card,
  compact = false,
  proofKinds = ["unit", "integration", "visual", "manual"],
}: {
  card: ProjectBoardCard;
  compact?: boolean;
  proofKinds?: Array<keyof ProjectBoardCard["testPlan"]>;
}) {
  const proofItems = proofKinds.flatMap((kind) => card.testPlan[kind].map((item) => ({ kind, item })));
  const pendingProofItems = card.pendingPiUpdate?.testPlan
    ? proofKinds.flatMap((kind) => card.pendingPiUpdate?.testPlan?.[kind].map((item) => ({ kind, item })) ?? [])
    : [];
  const pendingProofSuggestion = card.pendingPiUpdate?.changedFields.includes("testPlan") && pendingProofItems.length > 0;
  return (
    <article className="project-board-proof-card">
      <div>
        <span className="project-board-card-meta">{projectBoardPhaseDisplayName(card.phase || "Unassigned")}</span>
        <h4>{card.title}</h4>
      </div>
      {pendingProofSuggestion && (
        <div className="project-board-card-pi-update" title="Pi proposed proof expectations. Open the card in Draft Inbox to apply or ignore the update.">
          <Zap size={12} />
          <span>Pi proof suggestion pending</span>
        </div>
      )}
      {!compact && proofItems.length > 0 && (
        <ul>
          {proofItems.map(({ kind, item }) => (
            <li key={`${kind}-${item}`}>{projectBoardProofKindLabel(kind)}: {item}</li>
          ))}
        </ul>
      )}
      {!compact && pendingProofItems.length > 0 && (
        <ul>
          {pendingProofItems.map(({ kind, item }) => (
            <li key={`pending-${kind}-${item}`}>Pending {projectBoardProofKindLabel(kind)}: {item}</li>
          ))}
        </ul>
      )}
      {compact && <p>{pendingProofSuggestion ? "Pi suggested proof expectations. Open the card to review." : "No proof expectation recorded."}</p>}
    </article>
  );
}


export function projectBoardProofKindLabel(kind: keyof ProjectBoardCard["testPlan"]): string {
  if (kind === "unit") return "Unit";
  if (kind === "integration") return "Integration";
  if (kind === "visual") return "Visual";
  return "Manual";
}
