import { Info, ListFilter, MessageCircle, Plus, RefreshCw, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectSummary, UpdateProjectBoardSourceInput } from "../../shared/projectBoardTypes";
import { projectBoardCandidateStatusLabel } from "./ProjectBoardLaneViews";
import {
  projectBoardCardsForSourceGroup,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeFilterItems,
  projectBoardSourceChangeSummary,
  projectBoardSourceFilterItems,
  projectBoardSourceGroupIncludedSourceIds,
  projectBoardSourceGroups,
  projectBoardSourceGroupsForChangeFilter,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceKindText,
  projectBoardSourceObservationLabel,
  type ProjectBoardSourceChangeFilterKind,
  type ProjectBoardSourceFilterKind,
  type ProjectBoardSourceGroup,
} from "./projectBoardUiModel";

export function ProjectBoardCharterPreview({ board }: { board: NonNullable<ProjectSummary["board"]> }) {
  const charter = board.charter;
  if (!charter) return null;
  const sourcePolicy = projectBoardPolicyText(charter.sourcePolicy, "policy");
  const decisionPolicy = projectBoardPolicyText(charter.decisionPolicy, "defaultPolicy");
  const proofPolicy = projectBoardPolicyText(charter.testPolicy, "defaultProof");
  return (
    <section className="project-board-charter-preview" aria-label="Project board charter preview">
      <header>
        <div>
          <span className="project-board-kicker">Charter preview</span>
          <h3>{charter.goal || board.title}</h3>
        </div>
        <span className="project-board-status">Active board</span>
      </header>
      <div className="project-board-charter-grid">
        <ProjectBoardCharterPolicy label="Source authority" value={sourcePolicy} />
        <ProjectBoardCharterPolicy label="Judgment calls" value={decisionPolicy} />
        <ProjectBoardCharterPolicy label="Proof bar" value={proofPolicy || charter.qualityBar} />
      </div>
      {charter.markdown && (
        <section className="project-board-charter-document" aria-label="Active project charter">
          <header>
            <span className="project-board-kicker">Active charter</span>
            <strong>Version {charter.version}</strong>
          </header>
          <pre>{charter.markdown}</pre>
        </section>
      )}
    </section>
  );
}


export function ProjectBoardCharterPolicy({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <p>{value || "Use the active project charter."}</p>
    </article>
  );
}


export function projectBoardPolicyText(policy: Record<string, unknown>, key: string): string {
  const value = policy[key];
  return typeof value === "string" ? value : "";
}


export const projectBoardSourceKindOptions: Array<{ kind: ProjectBoardSourceKind; label: string }> = [
  { kind: "thread", label: "Thread" },
  { kind: "plan_artifact", label: "Plan" },
  { kind: "architecture_artifact", label: "Architecture" },
  { kind: "functional_spec", label: "Spec" },
  { kind: "implementation_plan", label: "Implementation" },
  { kind: "report_artifact", label: "Report" },
  { kind: "workflow_artifact", label: "Workflow" },
  { kind: "implementation_file", label: "Code" },
  { kind: "test_artifact", label: "Test" },
  { kind: "git_state", label: "Git" },
  { kind: "markdown", label: "Markdown" },
  { kind: "ignored", label: "Ignored" },
];


export function projectBoardSourceChangeStateLabel(changeState: ProjectBoardSourceChangeState): string {
  switch (changeState) {
    case "new":
      return "New";
    case "changed":
      return "Changed";
    case "unchanged":
      return "Unchanged";
    case "removed":
      return "Removed";
  }
}


export function ProjectBoardSourceReview({
  sources,
  cards,
  events,
  selectedGroupId,
  sourcePickerRequestId,
  sourceFocusSourceId,
  onSelectGroup,
  onUpdateSource,
  sourceImpactBusy,
  onRefreshSourceDrafts,
  onRegenerateSourceDrafts,
  onApplySourceImpactFeedback,
  onInspectCard,
}: {
  sources: ProjectBoardSource[];
  cards: ProjectBoardCard[];
  events: ProjectBoardEvent[];
  selectedGroupId?: string;
  sourcePickerRequestId?: number;
  sourceFocusSourceId?: string;
  onSelectGroup: (groupId: string) => void;
  onUpdateSource: (input: UpdateProjectBoardSourceInput) => void;
  sourceImpactBusy: boolean;
  onRefreshSourceDrafts: (sourceIds?: string[]) => Promise<void> | void;
  onRegenerateSourceDrafts: (sourceIds?: string[]) => Promise<void> | void;
  onApplySourceImpactFeedback: (sourceIds?: string[]) => Promise<void> | void;
  onInspectCard: (cardId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<ProjectBoardSourceFilterKind>("all");
  const [activeChangeFilter, setActiveChangeFilter] = useState<ProjectBoardSourceChangeFilterKind>("all");
  const handledSourcePickerRequestId = useRef(0);
  const sourceItemRefs = useRef(new Map<string, HTMLElement>());
  const [scrollTargetGroupId, setScrollTargetGroupId] = useState<string | undefined>();
  const sourceGroups = useMemo(() => projectBoardSourceGroups(sources), [sources]);
  const filters = useMemo(() => projectBoardSourceFilterItems(sourceGroups), [sourceGroups]);
  const changeFilters = useMemo(() => projectBoardSourceChangeFilterItems(sourceGroups), [sourceGroups]);
  const changeSummary = useMemo(() => projectBoardSourceChangeSummary(sourceGroups, events), [events, sourceGroups]);
  const selectedGroup = sourceGroups.find((group) => group.id === selectedGroupId);
  const hasActionableSourceImpactEvent = useMemo(
    () =>
      events.some((event) => {
        const impact = (event.metadata as { sourceImpact?: { targetedRefreshOptional?: unknown; nextRunFeedbackRecommended?: unknown } }).sourceImpact;
        return event.kind === "source_updated" && (impact?.targetedRefreshOptional === true || impact?.nextRunFeedbackRecommended === true);
      }),
    [events],
  );
  const sourceImpact = useMemo(
    () => projectBoardSourceImpactPreview({ sources, cards }, selectedGroup ? { selectedGroupIds: [selectedGroup.id] } : {}),
    [cards, selectedGroup, sources],
  );
  const visibleGroups = useMemo(() => {
    const kindGroups = projectBoardSourceGroupsForFilter(sourceGroups, activeFilter);
    return projectBoardSourceGroupsForChangeFilter(kindGroups, activeChangeFilter);
  }, [activeChangeFilter, activeFilter, sourceGroups]);
  const hiddenObservationCount = Math.max(0, sources.length - sourceGroups.length);

  useEffect(() => {
    if (!filters.some((filter) => filter.kind === activeFilter)) setActiveFilter("all");
  }, [activeFilter, filters]);

  useEffect(() => {
    if (!changeFilters.some((filter) => filter.kind === activeChangeFilter)) setActiveChangeFilter("all");
  }, [activeChangeFilter, changeFilters]);

  useEffect(() => {
    if (!sourcePickerRequestId || handledSourcePickerRequestId.current === sourcePickerRequestId || sourceGroups.length === 0) return;
    handledSourcePickerRequestId.current = sourcePickerRequestId;
    const focusedGroup = sourceFocusSourceId
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
    const targetGroup = focusedGroup ?? sourceGroups[0];
    const targetSource = targetGroup.primary;
    const targetIsIgnoredThread = targetSource.kind === "thread" && !projectBoardSourceInclusion(targetSource).included;
    setActiveFilter(targetIsIgnoredThread ? "ignored_threads" : "all");
    setActiveChangeFilter("all");
    onSelectGroup(targetGroup.id);
    setScrollTargetGroupId(targetGroup.id);
  }, [onSelectGroup, sourceFocusSourceId, sourceGroups, sourcePickerRequestId]);

  useEffect(() => {
    if (!scrollTargetGroupId || !visibleGroups.some((group) => group.id === scrollTargetGroupId)) return;
    const frame = requestAnimationFrame(() => {
      sourceItemRefs.current.get(scrollTargetGroupId)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setScrollTargetGroupId(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTargetGroupId, visibleGroups]);

  return (
    <section className="project-board-source-review" aria-label="Project board source review">
      <header>
        <div>
          <span className="project-board-kicker">Source review</span>
          <h3>
            {visibleGroups.length} of {sourceGroups.length} project source{sourceGroups.length === 1 ? "" : "s"}
          </h3>
          <p className={changeSummary.hasActionableChanges ? "project-board-source-change-summary actionable" : "project-board-source-change-summary"}>
            {changeSummary.headline} {changeSummary.detail}
          </p>
          {hiddenObservationCount > 0 && (
            <p>
              {sources.length} observations scanned. {hiddenObservationCount} duplicate observation{hiddenObservationCount === 1 ? "" : "s"} grouped under canonical sources.
            </p>
          )}
        </div>
        <div className="project-board-source-counts">
          {filters.map((item) => (
            <button
              type="button"
              key={item.kind}
              className={item.kind === activeFilter ? "active" : ""}
              aria-pressed={item.kind === activeFilter}
              title={`Show ${item.label.toLowerCase()} sources`}
              onClick={() => setActiveFilter(item.kind)}
            >
              {item.label}: {item.count}
            </button>
          ))}
        </div>
      </header>
      <div className="project-board-source-counts project-board-source-change-filters" aria-label="Source change filters">
        {changeFilters.map((item) => (
          <button
            type="button"
            key={item.kind}
            className={item.kind === activeChangeFilter ? "active" : ""}
            aria-pressed={item.kind === activeChangeFilter}
            title={`Show ${item.label.toLowerCase()} sources`}
            onClick={() => setActiveChangeFilter(item.kind)}
          >
            {item.label}: {item.count}
          </button>
        ))}
      </div>
      {changeSummary.durablePlanIgnoredThreadCount > 0 && (
        <section className="project-board-source-authority-callout" aria-label="Ignored thread source authority">
          <Info size={15} />
          <div>
            <strong>{changeSummary.sourceAuthorityNotice ?? "Threads are ignored while the durable plan is authoritative."}</strong>
            <p>Review ignored threads before activating the board. Use Include on any thread that should affect synthesis, Decisions, or Add Cards.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            title="Show only ignored thread sources that can be included before activation."
            onClick={() => setActiveFilter("ignored_threads")}
          >
            <ListFilter size={14} />
            <span>Review Threads</span>
          </button>
        </section>
      )}
      <ProjectBoardSourceImpactPreviewPanel
        preview={sourceImpact}
        refreshDraftsBusy={sourceImpactBusy}
        onRefreshDrafts={
          selectedGroup || hasActionableSourceImpactEvent
            ? () => onRefreshSourceDrafts(selectedGroup ? selectedGroup.observations.map((source) => source.id) : undefined)
            : undefined
        }
        regenerateDraftsBusy={sourceImpactBusy}
        onRegenerateDrafts={
          selectedGroup || hasActionableSourceImpactEvent
            ? () => onRegenerateSourceDrafts(selectedGroup ? selectedGroup.observations.map((source) => source.id) : undefined)
            : undefined
        }
        applyFeedbackBusy={sourceImpactBusy}
        onApplyRunFeedback={
          selectedGroup || hasActionableSourceImpactEvent
            ? () => onApplySourceImpactFeedback(selectedGroup ? selectedGroup.observations.map((source) => source.id) : undefined)
            : undefined
        }
        onInspectCard={onInspectCard}
      />
      <div className="project-board-source-list">
        {visibleGroups.length > 0 ? (
          visibleGroups.map((group) => (
            <ProjectBoardSourceItem
              group={group}
              key={group.id}
              selected={group.id === selectedGroupId}
              itemRef={(node) => {
                if (node) sourceItemRefs.current.set(group.id, node);
                else sourceItemRefs.current.delete(group.id);
              }}
              onSelect={() => onSelectGroup(group.id)}
              onUpdateSource={onUpdateSource}
            />
          ))
        ) : (
          <div className="project-board-column-empty">
            {sources.length > 0 ? "No sources match this filter." : "No sources found yet. Add project notes, create plans, or refresh after new thread work."}
          </div>
        )}
      </div>
    </section>
  );
}


export function ProjectBoardSourceImpactPreviewPanel({
  preview,
  compact = false,
  onInspectCard,
  onRefreshDrafts,
  onRegenerateDrafts,
  onApplyRunFeedback,
  refreshDraftsBusy = false,
  regenerateDraftsBusy = false,
  applyFeedbackBusy = false,
}: {
  preview: ReturnType<typeof projectBoardSourceImpactPreview>;
  compact?: boolean;
  onInspectCard?: (cardId: string) => void;
  onRefreshDrafts?: () => void;
  onRegenerateDrafts?: () => void;
  onApplyRunFeedback?: () => void;
  refreshDraftsBusy?: boolean;
  regenerateDraftsBusy?: boolean;
  applyFeedbackBusy?: boolean;
}) {
  if (!preview.visible) return null;
  const canRefreshDrafts = preview.affectedDraftCount > 0 && Boolean(onRefreshDrafts);
  const canRegenerateDrafts = preview.affectedDraftCount > 0 && Boolean(onRegenerateDrafts);
  const canApplyRunFeedback = preview.affectedExecutableCount > 0 && Boolean(onApplyRunFeedback);
  return (
    <section className={`project-board-source-impact ${preview.tone} ${compact ? "compact" : ""}`} aria-label="Source impact preview">
      <header>
        <div>
          <span className="project-board-kicker">Source impact</span>
          <h4>{preview.headline}</h4>
          <p>{preview.detail}</p>
        </div>
        <span title={preview.modelCallRequired ? "Additive card elaboration will call Pi for the selected included sources." : "This preview is deterministic and does not require Pi."}>
          {preview.modelCallRequired ? "Pi call on apply" : "0 model calls"}
        </span>
      </header>
      {(canRefreshDrafts || canRegenerateDrafts || canApplyRunFeedback) && (
        <div className="project-board-source-impact-actions">
          {canRefreshDrafts && (
            <button
              type="button"
              className="secondary-button"
              disabled={refreshDraftsBusy}
              title={
                refreshDraftsBusy
                  ? "Refreshing affected draft cards."
                  : "Apply a deterministic source-impact note to affected draft cards. Approved Local Task cards are not rewritten."
              }
              onClick={onRefreshDrafts}
            >
              <RefreshCw size={14} className={refreshDraftsBusy ? "spin" : ""} />
              <span>{refreshDraftsBusy ? "Refreshing drafts" : "Refresh affected drafts"}</span>
            </button>
          )}
          {canRegenerateDrafts && (
            <button
              type="button"
              className="secondary-button"
              disabled={regenerateDraftsBusy}
              title={
                regenerateDraftsBusy
                  ? "Asking Pi for targeted draft updates."
                  : "Ask Pi for targeted source-aware draft spec updates. Results appear as reviewable Pi updates; approved cards are not rewritten."
              }
              onClick={onRegenerateDrafts}
            >
              <Zap size={14} className={regenerateDraftsBusy ? "spin" : ""} />
              <span>{regenerateDraftsBusy ? "Asking Pi" : "Ask Pi refresh"}</span>
            </button>
          )}
          {canApplyRunFeedback && (
            <button
              type="button"
              className="secondary-button"
              disabled={applyFeedbackBusy}
              title={
                applyFeedbackBusy
                  ? "Creating additive next-run feedback for affected Local Task cards."
                  : "Create additive next-run feedback for affected Local Task cards. Approved card fields are not rewritten."
              }
              onClick={onApplyRunFeedback}
            >
              <MessageCircle size={14} />
              <span>{applyFeedbackBusy ? "Adding feedback" : "Create run feedback"}</span>
            </button>
          )}
        </div>
      )}
      <div className="project-board-source-impact-metrics">
        {preview.metrics.map((metric) => (
          <span key={metric.label} title={metric.title}>
            <strong>{metric.value}</strong> {metric.label}
          </span>
        ))}
      </div>
      {!compact && preview.groups.length > 0 && (
        <div className="project-board-source-impact-groups">
          {preview.groups.map((group) => (
            <article key={group.groupId} className={group.included ? "included" : "ignored"}>
              <div>
                <strong>{group.title}</strong>
                <span>
                  {group.kindLabel} · {group.authorityLabel} · {group.observationCount} observation{group.observationCount === 1 ? "" : "s"}
                </span>
              </div>
              <small>
                {group.affectedDraftCount} draft · {group.affectedExecutableCount} ticketized · {group.estimatedPromptChars.toLocaleString()} est. chars
              </small>
            </article>
          ))}
        </div>
      )}
      {!compact && preview.cards.length > 0 && (
        <div className="project-board-source-impact-cards">
          {preview.cards.map((card) => (
            <button
              type="button"
              key={card.cardId}
              className="project-board-source-link-button"
              disabled={!onInspectCard}
              title={onInspectCard ? `Open ${card.title}.` : `${card.title} cites a previewed source.`}
              onClick={() => onInspectCard?.(card.cardId)}
            >
              <strong>{card.title}</strong>
              <span>{card.sourceLabel}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}


export function ProjectBoardSourceItem({
  group,
  selected,
  itemRef,
  onSelect,
  onUpdateSource,
}: {
  group: ProjectBoardSourceGroup;
  selected: boolean;
  itemRef?: (node: HTMLElement | null) => void;
  onSelect: () => void;
  onUpdateSource: (input: UpdateProjectBoardSourceInput) => void;
}) {
  const { primary: source } = group;
  const occurrenceSources = group.observations.filter((observation) => observation.id !== source.id);
  const pathLabel = source.path || source.threadId || source.artifactId;
  const inclusion = projectBoardSourceInclusion(source);
  const updateGroupKind = (kind: ProjectBoardSourceKind) => {
    for (const observation of group.observations) {
      onUpdateSource({ sourceId: observation.id, kind });
    }
  };
  const toggleGroupInclusion = () => {
    const includeInSynthesis = !inclusion.included;
    for (const observation of group.observations) {
      onUpdateSource({ sourceId: observation.id, kind: observation.kind, includeInSynthesis });
    }
  };
  const canToggleInclusion = source.kind !== "ignored";

  return (
    <article
      ref={itemRef}
      className={`project-board-source-item ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      title={projectBoardSourceChangeDetail(group)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
    >
      <div className="project-board-source-kind-row">
        <div className="project-board-card-meta" title={inclusion.detail}>
          {projectBoardSourceKindText(source.kind)} · {inclusion.label}
        </div>
        <select
          aria-label={`Classify ${source.title}`}
          value={source.kind}
          title={`Reclassify ${source.title}. Choosing Ignored keeps it visible but excludes it from Decisions, board generation, and Add Cards.`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => updateGroupKind(event.target.value as ProjectBoardSourceKind)}
        >
          {projectBoardSourceKindOptions.map((option) => (
            <option value={option.kind} key={option.kind}>
              {option.label}
            </option>
          ))}
        </select>
        {canToggleInclusion && (
          <button
            type="button"
            className="project-board-card-action secondary"
            title={
              inclusion.included
                ? "Exclude this source from Decisions, board generation, and Add Cards while keeping it visible."
                : "Include this visible source in Decisions, board generation, and Add Cards."
            }
            onClick={(event) => {
              event.stopPropagation();
              toggleGroupInclusion();
            }}
          >
            {inclusion.included ? "Exclude" : "Include"}
          </button>
        )}
      </div>
      <h4>{source.title}</h4>
      <p>{source.summary}</p>
      <div className="project-board-source-provenance">
        <span title={pathLabel}>{pathLabel}</span>
        <span title={inclusion.detail}>{inclusion.badgeLabel}</span>
        <span>{projectBoardSourceObservationLabel(group)}</span>
        {source.changeState && <span>{projectBoardSourceChangeStateLabel(source.changeState)}</span>}
      </div>
      {occurrenceSources.length > 0 && (
        <details className="project-board-source-occurrences" onClick={(event) => event.stopPropagation()}>
          <summary>Show grouped observations</summary>
          <ul>
            {occurrenceSources.slice(0, 6).map((observation) => (
              <li key={observation.id}>{observation.path || observation.threadId || observation.artifactId || observation.title}</li>
            ))}
          </ul>
          {occurrenceSources.length > 6 && <span>+{occurrenceSources.length - 6} more observations</span>}
        </details>
      )}
    </article>
  );
}


export function ProjectBoardSourceDetail({
  group,
  boardId,
  cards,
  elaborateBusy,
  onElaborateSources,
  onInspectCard,
  onClose,
}: {
  group: ProjectBoardSourceGroup;
  boardId: string;
  cards: ProjectBoardCard[];
  elaborateBusy: boolean;
  onElaborateSources: (boardId: string, sourceIds: string[], objective?: string) => void;
  onInspectCard: (cardId: string) => void;
  onClose: () => void;
}) {
  const source = group.primary;
  const inclusion = projectBoardSourceInclusion(source);
  const sourceIds = projectBoardSourceGroupIncludedSourceIds(group);
  const referencedCards = projectBoardCardsForSourceGroup(group, cards);
  return (
    <aside className="project-board-source-detail" aria-label="Project source detail" data-ui-scroll-container="required">
      <header>
        <div className="project-board-inspector-title">
          <span className="project-board-kicker">Source inspector</span>
          <h3>{source.title}</h3>
          <p>Selected source group. Use this pane to inspect provenance and ask Pi for additive cards grounded in this material.</p>
        </div>
        <div className="project-board-card-actions">
          <span className="project-board-inspector-badge source">Selected source</span>
          <button type="button" className="icon-button" onClick={onClose} title="Close source detail" aria-label="Close source detail">
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="project-board-source-detail-meta">
        <span>{projectBoardSourceKindText(source.kind)}</span>
        <span title={inclusion.detail}>{inclusion.badgeLabel}</span>
        <span>{projectBoardSourceObservationLabel(group)}</span>
        <span>Relevance {source.relevance}</span>
        {source.changeState && <span>{projectBoardSourceChangeStateLabel(source.changeState)}</span>}
      </div>
      <div className="project-board-source-detail-actions">
        <button
          type="button"
          className="primary-button"
          disabled={elaborateBusy || sourceIds.length === 0}
          title={
            sourceIds.length === 0
              ? "This source group is ignored for synthesis. Reclassify it before using Add Cards."
              : "Ask Pi to propose additive Draft Inbox cards grounded only in this selected source group. Existing board cards are preserved."
          }
          onClick={() => onElaborateSources(boardId, sourceIds)}
        >
          <Plus size={14} />
          <span>{elaborateBusy ? "Elaborating" : "Elaborate Cards"}</span>
        </button>
      </div>
      <section className="project-board-source-change-card">
        <span className="project-board-kicker">Refresh status</span>
        <p>{projectBoardSourceChangeDetail(group)}</p>
        <div className="project-board-source-detail-facts">
          <span title={inclusion.detail}>{inclusion.badgeLabel}</span>
          {source.classifiedBy && <span>{source.classifiedBy === "ambient_pi" ? "Pi classified" : source.classifiedBy === "user" ? "User override" : "Fallback classified"}</span>}
          {typeof source.classificationConfidence === "number" && <span>{Math.round(source.classificationConfidence * 100)}% confidence</span>}
          {source.authorityRole && <span>{source.authorityRole} authority</span>}
        </div>
      </section>
      <section>
        <span className="project-board-kicker">Summary</span>
        <p>{source.summary}</p>
      </section>
      {source.excerpt?.trim() && source.excerpt.trim() !== source.summary.trim() && (
        <section>
          <span className="project-board-kicker">Synthesis excerpt</span>
          <pre>{source.excerpt.trim()}</pre>
        </section>
      )}
      <section>
        <span className="project-board-kicker">Primary provenance</span>
        <p>{source.path || source.threadId || source.artifactId || source.messageId || source.id}</p>
      </section>
      <section className="project-board-source-card-links">
        <span className="project-board-kicker">Referenced cards</span>
        {referencedCards.length > 0 ? (
          <ul>
            {referencedCards.slice(0, 8).map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="project-board-source-link-button"
                  title={`Open ${card.title} in its board inspector.`}
                  onClick={() => onInspectCard(card.id)}
                >
                  <strong>{card.title}</strong>
                  <span>{projectBoardCandidateStatusLabel(card.candidateStatus)} · {card.phase || "Unphased"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No candidate or executable cards cite this source yet.</p>
        )}
      </section>
      {group.observations.length > 1 && (
        <section>
          <span className="project-board-kicker">Grouped observations</span>
          <ul>
            {group.observations.map((observation) => (
              <li key={observation.id}>
                <strong>{observation.path || observation.threadId || observation.artifactId || observation.messageId || observation.id}</strong>
                <span>{projectBoardSourceKindText(observation.kind)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

