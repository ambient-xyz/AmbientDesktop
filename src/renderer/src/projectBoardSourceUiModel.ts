import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSource, ProjectBoardSourceChangeState, ProjectBoardSourceKind, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { projectBoardUniqueProofItems } from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardSourceFilterKind = "all" | "included_sources" | "ignored_sources" | "ignored_threads" | ProjectBoardSourceKind;
export type ProjectBoardSourceChangeFilterKind = "all" | Exclude<ProjectBoardSourceChangeState, "removed">;

export interface ProjectBoardSourceFilterItem {
  kind: ProjectBoardSourceFilterKind;
  label: string;
  count: number;
}

export interface ProjectBoardSourceChangeFilterItem {
  kind: ProjectBoardSourceChangeFilterKind;
  label: string;
  count: number;
}

export interface ProjectBoardSourceChangeSummary {
  totalGroups: number;
  totalObservations: number;
  includedCount: number;
  ignoredCount: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  removedCount: number;
  ambientPiClassifiedCount: number;
  userClassifiedCount: number;
  fallbackClassifiedCount: number;
  durablePlanPrimaryCount: number;
  durablePlanIgnoredThreadCount: number;
  sourceAuthorityNotice?: string;
  headline: string;
  detail: string;
  refreshTitle: string;
  hasActionableChanges: boolean;
}

export interface ProjectBoardSourceGroup {
  id: string;
  primary: ProjectBoardSource;
  observations: ProjectBoardSource[];
  generatedObservationCount: number;
}

export interface ProjectBoardAddCardsSourceScope {
  selectedGroupIds: string[];
  selectedSourceIds: string[];
  selectedGroupCount: number;
  selectedObservationCount: number;
  disabled: boolean;
  label: string;
  title: string;
}

export interface ProjectBoardSourceInclusionModel {
  included: boolean;
  label: string;
  badgeLabel: string;
  detail: string;
  addCardsEligible: boolean;
  addCardsTitle: string;
}

export interface ProjectBoardSourceImpactCard {
  cardId: string;
  title: string;
  status: ProjectBoardCard["status"];
  candidateStatus: ProjectBoardCard["candidateStatus"];
  sourceLabel: string;
}

export interface ProjectBoardSourceImpactGroup {
  groupId: string;
  title: string;
  kindLabel: string;
  authorityLabel: string;
  included: boolean;
  observationCount: number;
  estimatedPromptChars: number;
  affectedDraftCount: number;
  affectedExecutableCount: number;
}

export type ProjectBoardSourceImpactTone = "ready" | "warning" | "danger" | "neutral";

export interface ProjectBoardSourceImpactMetric {
  label: string;
  value: string | number;
  title: string;
}

export interface ProjectBoardSourceImpactPreview {
  visible: boolean;
  tone: ProjectBoardSourceImpactTone;
  headline: string;
  detail: string;
  modelCallRequired: boolean;
  broadChange: boolean;
  affectedCardIds: string[];
  affectedDraftCount: number;
  affectedExecutableCount: number;
  durablePlanPrimaryCount: number;
  includedChatCount: number;
  ignoredChatCount: number;
  selectedGroupCount: number;
  selectedObservationCount: number;
  estimatedPromptChars: number;
  metrics: ProjectBoardSourceImpactMetric[];
  groups: ProjectBoardSourceImpactGroup[];
  cards: ProjectBoardSourceImpactCard[];
}

export interface ProjectBoardSourceImpactPreviewOptions {
  selectedGroupIds?: Iterable<string>;
  maxGroups?: number;
  maxCards?: number;
}

export interface ProjectBoardCardSourceBasisItem {
  ref: string;
  label: string;
  detail: string;
  sourceId?: string;
}

export function projectBoardSourceFilterItems(
  sourcesOrGroups: ProjectBoardSource[] | ProjectBoardSourceGroup[],
): ProjectBoardSourceFilterItem[] {
  const groups = projectBoardSourceInputGroups(sourcesOrGroups);
  const counts = new Map<ProjectBoardSourceKind, number>();
  let includedCount = 0;
  let ignoredCount = 0;
  let ignoredThreadCount = 0;
  for (const group of groups) {
    counts.set(group.primary.kind, (counts.get(group.primary.kind) ?? 0) + 1);
    const inclusion = projectBoardSourceInclusion(group.primary);
    if (inclusion.included) includedCount += 1;
    else ignoredCount += 1;
    if (group.primary.kind === "thread" && !inclusion.included) ignoredThreadCount += 1;
  }
  return [
    { kind: "all", label: "All", count: groups.length },
    { kind: "included_sources", label: "Included", count: includedCount },
    { kind: "ignored_sources", label: "Ignored for synthesis", count: ignoredCount },
    ...(ignoredThreadCount > 0 ? [{ kind: "ignored_threads" as const, label: "Ignored threads", count: ignoredThreadCount }] : []),
    ...[...counts.entries()]
      .map(([kind, count]) => ({ kind, label: projectBoardSourceKindText(kind), count }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  ];
}

export function projectBoardSourceChangeFilterItems(
  sourcesOrGroups: ProjectBoardSource[] | ProjectBoardSourceGroup[],
): ProjectBoardSourceChangeFilterItem[] {
  const groups = projectBoardSourceInputGroups(sourcesOrGroups);
  const counts = new Map<ProjectBoardSourceChangeFilterKind, number>();
  for (const group of groups) {
    const changeState = projectBoardSourceVisibleChangeState(group.primary.changeState);
    counts.set(changeState, (counts.get(changeState) ?? 0) + 1);
  }
  return [
    { kind: "all", label: "All changes", count: groups.length },
    ...(["new", "changed", "unchanged"] as const)
      .map((kind) => ({ kind, label: projectBoardSourceChangeStateText(kind), count: counts.get(kind) ?? 0 }))
      .filter((item) => item.count > 0),
  ];
}

export function projectBoardSourceChangeSummary(
  sourcesOrGroups: ProjectBoardSource[] | ProjectBoardSourceGroup[],
  events: ProjectBoardEvent[] = [],
): ProjectBoardSourceChangeSummary {
  const groups = projectBoardSourceInputGroups(sourcesOrGroups);
  const latestRefresh = events.find((event) => event.kind === "sources_refreshed");
  const removedCount = projectBoardEventMetadataNumber(latestRefresh, "removedCount");
  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let includedCount = 0;
  let ignoredCount = 0;
  let ambientPiClassifiedCount = 0;
  let userClassifiedCount = 0;
  let fallbackClassifiedCount = 0;
  let durablePlanPrimaryCount = 0;
  let durablePlanIgnoredThreadCount = 0;
  for (const group of groups) {
    const source = group.primary;
    const changeState = projectBoardSourceVisibleChangeState(source.changeState);
    if (changeState === "new") newCount += 1;
    if (changeState === "changed") changedCount += 1;
    if (changeState === "unchanged") unchangedCount += 1;
    if (projectBoardSourceInclusion(source).included) includedCount += 1;
    else ignoredCount += 1;
    if (source.classifiedBy === "ambient_pi") ambientPiClassifiedCount += 1;
    else if (source.classifiedBy === "user") userClassifiedCount += 1;
    else fallbackClassifiedCount += 1;
    if (source.kind === "plan_artifact" && source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") && projectBoardSourceInclusion(source).included) {
      durablePlanPrimaryCount += 1;
    }
    if (source.kind === "thread" && !projectBoardSourceInclusion(source).included) {
      durablePlanIgnoredThreadCount += 1;
    }
  }
  const sourceAuthorityNotice =
    durablePlanPrimaryCount > 0 && durablePlanIgnoredThreadCount > 0
      ? `Durable plan selected as source of truth; ${durablePlanIgnoredThreadCount} chat thread${durablePlanIgnoredThreadCount === 1 ? "" : "s"} ignored by default.`
      : undefined;
  const changedParts = [
    newCount > 0 ? `${newCount} new` : "",
    changedCount > 0 ? `${changedCount} changed` : "",
    removedCount > 0 ? `${removedCount} removed` : "",
  ].filter(Boolean);
  const headline =
    groups.length === 0 && removedCount === 0
      ? "No project sources found yet."
      : changedParts.length > 0
        ? `${changedParts.join(", ")} since the last refresh.`
        : `All ${groups.length} source group${groups.length === 1 ? " is" : "s are"} unchanged.`;
  const classifierParts = [
    ambientPiClassifiedCount > 0 ? `${ambientPiClassifiedCount} Pi-classified` : "",
    userClassifiedCount > 0 ? `${userClassifiedCount} user-classified` : "",
    fallbackClassifiedCount > 0 ? `${fallbackClassifiedCount} fallback-classified` : "",
  ].filter(Boolean);
  const detail = [
    `${includedCount} included for Decisions and card generation`,
    `${ignoredCount} ignored but visible`,
    sourceAuthorityNotice ?? "",
    classifierParts.length > 0 ? classifierParts.join(", ") : "",
    "Refresh preserves user classifications when stable source keys still match",
  ]
    .filter(Boolean)
    .join(". ");
  const refreshTitle = [
    "Refresh the source snapshot used by the charter, Decisions, board generation, and Add Cards.",
    ignoredCount > 0 ? "Ignored sources stay visible in inventory but remain excluded until reclassified." : "",
    sourceAuthorityNotice ?? "",
    userClassifiedCount > 0 ? "User source classifications are preserved when stable source keys still match after refresh." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    totalGroups: groups.length,
    totalObservations: groups.reduce((total, group) => total + group.observations.length, 0),
    includedCount,
    ignoredCount,
    newCount,
    changedCount,
    unchangedCount,
    removedCount,
    ambientPiClassifiedCount,
    userClassifiedCount,
    fallbackClassifiedCount,
    durablePlanPrimaryCount,
    durablePlanIgnoredThreadCount,
    sourceAuthorityNotice,
    headline,
    detail: detail.endsWith(".") ? detail : `${detail}.`,
    refreshTitle,
    hasActionableChanges: newCount + changedCount + removedCount > 0,
  };
}

export function projectBoardSourceImpactPreview(
  board: Pick<ProjectBoardSummary, "sources" | "cards">,
  options: ProjectBoardSourceImpactPreviewOptions = {},
): ProjectBoardSourceImpactPreview {
  const groups = projectBoardSourceGroups(board.sources);
  const selectedIds = options.selectedGroupIds ? new Set([...options.selectedGroupIds]) : undefined;
  const selectedGroupLimit = options.maxGroups ?? 5;
  const selectedCardLimit = options.maxCards ?? 5;
  const chatGroups = groups.filter((group) => group.primary.kind === "thread");
  const includedChatGroups = chatGroups.filter((group) => projectBoardSourceInclusion(group.primary).included);
  const ignoredChatGroups = chatGroups.filter((group) => !projectBoardSourceInclusion(group.primary).included);
  const durablePlanPrimaryCount = groups.filter((group) => projectBoardSourceIsDurablePrimary(group.primary)).length;
  const defaultTargetGroups = chatGroups.length > 0 ? chatGroups : groups.filter((group) => projectBoardSourceInclusion(group.primary).included);
  const targetGroups = selectedIds
    ? groups.filter((group) => selectedIds.has(group.id))
    : defaultTargetGroups;
  const eligibleTargetGroups = targetGroups.filter(projectBoardSourceGroupCanElaborate);
  const selectedObservationCount = eligibleTargetGroups.flatMap(projectBoardSourceGroupIncludedSourceIds).length;
  const estimatedPromptChars = eligibleTargetGroups.reduce((total, group) => total + projectBoardSourceGroupEstimatedPromptChars(group), 0);
  const affectedCards = sortProjectBoardSourceCards(
    projectBoardUniqueProofItems(
      targetGroups.flatMap((group) => projectBoardCardsForSourceGroup(group, board.cards)),
      (card) => card.id,
    ),
  );
  const affectedDraftCards = affectedCards.filter((card) => card.status === "draft");
  const affectedExecutableCards = affectedCards.filter((card) => card.status !== "draft" && card.status !== "archived");
  const broadChange =
    Boolean(selectedIds) &&
    (eligibleTargetGroups.length > 4 ||
      estimatedPromptChars > 24000 ||
      (chatGroups.length > 1 && eligibleTargetGroups.filter((group) => group.primary.kind === "thread").length === chatGroups.length));
  const modelCallRequired = Boolean(selectedIds) && selectedObservationCount > 0;
  const visible = groups.length > 0;
  const tone: ProjectBoardSourceImpactTone =
    broadChange || affectedExecutableCards.length > 0
      ? "warning"
      : modelCallRequired || includedChatGroups.length > 0
        ? "ready"
        : "neutral";
  const headline = projectBoardSourceImpactHeadline({
    visible,
    selectedIds,
    durablePlanPrimaryCount,
    ignoredChatCount: ignoredChatGroups.length,
    includedChatCount: includedChatGroups.length,
    selectedGroupCount: eligibleTargetGroups.length,
    selectedObservationCount,
  });
  const detail = projectBoardSourceImpactDetail({
    selectedIds,
    broadChange,
    modelCallRequired,
    affectedDraftCount: affectedDraftCards.length,
    affectedExecutableCount: affectedExecutableCards.length,
    durablePlanPrimaryCount,
    ignoredChatCount: ignoredChatGroups.length,
  });
  return {
    visible,
    tone,
    headline,
    detail,
    modelCallRequired,
    broadChange,
    affectedCardIds: affectedCards.map((card) => card.id),
    affectedDraftCount: affectedDraftCards.length,
    affectedExecutableCount: affectedExecutableCards.length,
    durablePlanPrimaryCount,
    includedChatCount: includedChatGroups.length,
    ignoredChatCount: ignoredChatGroups.length,
    selectedGroupCount: eligibleTargetGroups.length,
    selectedObservationCount,
    estimatedPromptChars,
    metrics: [
      { label: "Card rewrites", value: 0, title: "Source inclusion changes never rewrite existing cards by default." },
      { label: "Additive sources", value: selectedObservationCount, title: "Included source observations available for additive card elaboration." },
      { label: "Affected drafts", value: affectedDraftCards.length, title: "Draft cards that cite the previewed source groups." },
      { label: "Affected tasks", value: affectedExecutableCards.length, title: "Ticketized Local Task cards that cite the previewed source groups and should receive additive run feedback." },
      {
        label: "Est. chars",
        value: projectBoardSourceImpactCharLabel(estimatedPromptChars),
        title: "Approximate source text sent if the selected included sources are elaborated.",
      },
    ],
    groups: targetGroups.slice(0, selectedGroupLimit).map((group) => {
      const cards = projectBoardCardsForSourceGroup(group, board.cards);
      return {
        groupId: group.id,
        title: group.primary.title,
        kindLabel: projectBoardSourceKindText(group.primary.kind),
        authorityLabel: projectBoardSourceAuthorityLabel(group.primary),
        included: projectBoardSourceInclusion(group.primary).included,
        observationCount: group.observations.length,
        estimatedPromptChars: projectBoardSourceGroupEstimatedPromptChars(group),
        affectedDraftCount: cards.filter((card) => card.status === "draft").length,
        affectedExecutableCount: cards.filter((card) => card.status !== "draft" && card.status !== "archived").length,
      };
    }),
    cards: affectedCards.slice(0, selectedCardLimit).map((card) => ({
      cardId: card.id,
      title: card.title,
      status: card.status,
      candidateStatus: card.candidateStatus,
      sourceLabel: card.status === "draft" ? "Draft can refresh" : "Use additive run feedback",
    })),
  };
}

export function projectBoardSourcesForFilter(sources: ProjectBoardSource[], filter: ProjectBoardSourceFilterKind = "all"): ProjectBoardSource[] {
  if (filter === "all") return sources;
  if (filter === "included_sources") return sources.filter((source) => projectBoardSourceInclusion(source).included);
  if (filter === "ignored_sources") return sources.filter((source) => !projectBoardSourceInclusion(source).included);
  if (filter === "ignored_threads") return sources.filter((source) => source.kind === "thread" && !projectBoardSourceInclusion(source).included);
  return sources.filter((source) => source.kind === filter);
}

export function projectBoardSourceGroups(sources: ProjectBoardSource[]): ProjectBoardSourceGroup[] {
  const groupsByKey = new Map<string, ProjectBoardSource[]>();
  for (const source of sources) {
    const key = projectBoardSourceGroupKey(source);
    groupsByKey.set(key, [...(groupsByKey.get(key) ?? []), source]);
  }
  return [...groupsByKey.entries()]
    .map(([key, observations]) => {
      const sorted = [...observations].sort(compareProjectBoardSourcePrimary);
      return {
        id: key,
        primary: sorted[0],
        observations: sorted,
        generatedObservationCount: sorted.filter(projectBoardSourceIsGeneratedObservation).length,
      };
    })
    .sort((left, right) => {
      const relevance = right.primary.relevance - left.primary.relevance;
      if (relevance !== 0) return relevance;
      return left.primary.title.localeCompare(right.primary.title);
    });
}

export function projectBoardSourceGroupsForFilter(
  groups: ProjectBoardSourceGroup[],
  filter: ProjectBoardSourceFilterKind = "all",
): ProjectBoardSourceGroup[] {
  if (filter === "all") return groups;
  if (filter === "included_sources") return groups.filter((group) => projectBoardSourceInclusion(group.primary).included);
  if (filter === "ignored_sources") return groups.filter((group) => !projectBoardSourceInclusion(group.primary).included);
  if (filter === "ignored_threads") {
    return groups.filter((group) => group.primary.kind === "thread" && !projectBoardSourceInclusion(group.primary).included);
  }
  return groups.filter((group) => group.primary.kind === filter);
}

export function projectBoardSourceGroupsForChangeFilter(
  groups: ProjectBoardSourceGroup[],
  filter: ProjectBoardSourceChangeFilterKind = "all",
): ProjectBoardSourceGroup[] {
  if (filter === "all") return groups;
  return groups.filter((group) => projectBoardSourceVisibleChangeState(group.primary.changeState) === filter);
}

export function projectBoardSourceInclusion(source: ProjectBoardSource): ProjectBoardSourceInclusionModel {
  const ignored = source.kind === "ignored" || source.includeInSynthesis === false || source.authorityRole === "ignored";
  if (ignored) {
    return {
      included: false,
      label: "Ignored",
      badgeLabel: "Ignored for synthesis",
      detail:
        "Visible in source inventory and refresh history, but excluded from Decisions, board generation, and Add Cards until reclassified.",
      addCardsEligible: false,
      addCardsTitle: "Ignored sources are visible for review but excluded from Add Cards. Reclassify this source before using it for card generation.",
    };
  }
  return {
    included: true,
    label: "Included",
    badgeLabel: "Included in synthesis",
    detail: "Included in Decisions, board generation, and Add Cards source scopes.",
    addCardsEligible: true,
    addCardsTitle: "Eligible for Add Cards and board-generation prompts.",
  };
}

export function projectBoardSourceGroupCanElaborate(group: ProjectBoardSourceGroup): boolean {
  return group.observations.some((source) => projectBoardSourceInclusion(source).addCardsEligible);
}

export function projectBoardSourceGroupIncludedSourceIds(group: ProjectBoardSourceGroup): string[] {
  return group.observations.filter((source) => projectBoardSourceInclusion(source).addCardsEligible).map((source) => source.id);
}

export function projectBoardSourceChangeDetail(group: ProjectBoardSourceGroup): string {
  const source = group.primary;
  const status = projectBoardSourceChangeStateText(projectBoardSourceVisibleChangeState(source.changeState));
  const inclusion = projectBoardSourceInclusion(source);
  const classifier =
    source.classifiedBy === "ambient_pi"
      ? "classified by Pi"
      : source.classifiedBy === "user"
        ? "classified by user override"
        : "classified by fallback heuristics";
  const authority = source.authorityRole ? `${source.authorityRole} authority` : "";
  const reason = source.classificationReason?.trim() ?? "";
  return [status, `${projectBoardSourceKindText(source.kind)}, ${inclusion.badgeLabel}`, classifier, authority, inclusion.detail, reason]
    .filter(Boolean)
    .join(". ");
}

export function projectBoardCardSourceBasis(
  card: ProjectBoardCard,
  sources: ProjectBoardSource[] = [],
): ProjectBoardCardSourceBasisItem[] {
  const explicitRefs = (card.sourceRefs ?? []).map((ref) => ref.trim()).filter(Boolean);
  const refs = explicitRefs.length > 0 ? explicitRefs : [card.sourceId].map((ref) => ref.trim()).filter(Boolean);
  const items = refs.flatMap((ref): ProjectBoardCardSourceBasisItem[] => {
    const source = sources.find((candidate) => projectBoardSourceRefMatchesSource(ref, candidate));
    if (!source) return [{ ref, label: ref, detail: "Card source reference" }];
    return [
      {
        ref,
        label: source.title,
        detail: [projectBoardSourceKindText(source.kind), source.path || source.threadId || source.artifactId || source.messageId || source.id]
          .filter(Boolean)
          .join(" - "),
        sourceId: source.id,
      },
    ];
  });
  return projectBoardUniqueProofItems(items, (item) => `${item.sourceId ?? item.label}:${item.ref}`).slice(0, 8);
}

export function projectBoardCardsForSourceGroup(group: ProjectBoardSourceGroup, cards: ProjectBoardCard[]): ProjectBoardCard[] {
  const sourceKeys = new Set(group.observations.flatMap(projectBoardSourceReferenceKeys));
  return sortProjectBoardSourceCards(
    cards.filter((card) =>
      [...(card.sourceRefs ?? []), card.sourceId].some((ref) =>
        projectBoardReferenceKeyMatchesAny(ref, sourceKeys),
      ),
    ),
  );
}

export function projectBoardAddCardsSourceScope(
  groups: ProjectBoardSourceGroup[],
  selectedGroupIds: Iterable<string>,
  busy = false,
): ProjectBoardAddCardsSourceScope {
  const selected = new Set(selectedGroupIds);
  const selectedGroups = groups.filter((group) => selected.has(group.id) && projectBoardSourceGroupCanElaborate(group));
  const selectedSourceIds = selectedGroups.flatMap(projectBoardSourceGroupIncludedSourceIds);
  const selectedGroupCount = selectedGroups.length;
  const selectedObservationCount = selectedSourceIds.length;
  const disabled = busy || selectedObservationCount === 0;
  return {
    selectedGroupIds: selectedGroups.map((group) => group.id),
    selectedSourceIds,
    selectedGroupCount,
    selectedObservationCount,
    disabled,
    label: busy
      ? "Elaborating"
      : selectedGroupCount === 0
        ? "Select Sources"
        : `Elaborate ${selectedGroupCount} Source${selectedGroupCount === 1 ? "" : "s"}`,
    title:
      selectedGroupCount === 0
        ? "Select one or more included project sources before asking Pi to elaborate additive Draft Inbox cards. Ignored sources remain visible but are excluded until reclassified."
        : `Ask Pi to elaborate additive Draft Inbox cards from ${selectedGroupCount} selected source group${
            selectedGroupCount === 1 ? "" : "s"
          } (${selectedObservationCount} included observation${selectedObservationCount === 1 ? "" : "s"}). Existing board cards are preserved.`,
  };
}

export function projectBoardSourceObservationLabel(group: ProjectBoardSourceGroup): string {
  const count = group.observations.length;
  if (count <= 1) return "1 observation";
  const generated = group.generatedObservationCount;
  return generated > 0 ? `${count} observations, ${generated} generated` : `${count} observations`;
}

export function projectBoardSourceIsGeneratedObservation(source: ProjectBoardSource): boolean {
  const path = source.path?.toLowerCase() ?? "";
  return (
    path.startsWith("test-results/") ||
    path.includes("/test-results/") ||
    path.startsWith(".ambient-codex/") ||
    path.includes("/.ambient-codex/") ||
    path.startsWith("coverage/") ||
    path.includes("/coverage/")
  );
}

export function projectBoardSourceKindText(kind: ProjectBoardSourceKind): string {
  if (kind === "plan_artifact") return "Plan";
  if (kind === "architecture_artifact") return "Architecture";
  if (kind === "functional_spec") return "Spec";
  if (kind === "implementation_plan") return "Implementation";
  if (kind === "report_artifact") return "Report";
  if (kind === "workflow_artifact") return "Workflow";
  if (kind === "implementation_file") return "Code";
  if (kind === "test_artifact") return "Test";
  if (kind === "git_state") return "Git";
  if (kind === "thread") return "Thread";
  if (kind === "ignored") return "Ignored";
  return "Markdown";
}

function projectBoardSourceInputGroups(sourcesOrGroups: ProjectBoardSource[] | ProjectBoardSourceGroup[]): ProjectBoardSourceGroup[] {
  const first = sourcesOrGroups[0];
  if (first && "primary" in first) return sourcesOrGroups as ProjectBoardSourceGroup[];
  return projectBoardSourceGroups(sourcesOrGroups as ProjectBoardSource[]);
}

function projectBoardSourceVisibleChangeState(changeState: ProjectBoardSourceChangeState | undefined): ProjectBoardSourceChangeFilterKind {
  if (changeState === "new" || changeState === "changed" || changeState === "unchanged") return changeState;
  return "unchanged";
}

function projectBoardSourceChangeStateText(changeState: ProjectBoardSourceChangeFilterKind): string {
  switch (changeState) {
    case "new":
      return "New";
    case "changed":
      return "Changed";
    case "unchanged":
      return "Unchanged";
    case "all":
      return "All changes";
  }
}

export function projectBoardSourceIsDurablePrimary(source: ProjectBoardSource): boolean {
  return (
    source.kind === "plan_artifact" &&
    source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true &&
    projectBoardSourceInclusion(source).included
  );
}

function projectBoardSourceGroupEstimatedPromptChars(group: ProjectBoardSourceGroup): number {
  return group.observations.reduce((total, source) => total + projectBoardSourceEstimatedPromptChars(source), 0);
}

function projectBoardSourceEstimatedPromptChars(source: ProjectBoardSource): number {
  if (typeof source.byteSize === "number" && Number.isFinite(source.byteSize) && source.byteSize > 0) return Math.round(source.byteSize);
  return [source.title, source.summary, source.excerpt, source.path, source.threadId, source.artifactId, source.messageId]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .length;
}

function projectBoardSourceAuthorityLabel(source: ProjectBoardSource): string {
  if (source.authorityRole === "primary") return "Primary";
  if (source.authorityRole === "supporting") return "Supporting";
  if (source.authorityRole === "context") return "Context";
  if (source.authorityRole === "proof") return "Proof";
  if (source.authorityRole === "ignored") return "Ignored";
  return projectBoardSourceInclusion(source).included ? "Included" : "Ignored";
}

export function projectBoardSourceImpactCharLabel(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return value.toLocaleString();
}

function projectBoardSourceImpactHeadline(input: {
  visible: boolean;
  selectedIds?: Set<string>;
  durablePlanPrimaryCount: number;
  ignoredChatCount: number;
  includedChatCount: number;
  selectedGroupCount: number;
  selectedObservationCount: number;
}): string {
  if (!input.visible) return "No source impact to preview";
  if (input.selectedIds) {
    if (input.selectedGroupCount === 0) return "No included source selected for additive synthesis";
    return `${input.selectedGroupCount} source group${projectBoardPlural(input.selectedGroupCount)} can elaborate additive cards`;
  }
  if (input.durablePlanPrimaryCount > 0 && input.ignoredChatCount > 0) {
    return `Durable plan primary; ${input.ignoredChatCount} chat${projectBoardPlural(input.ignoredChatCount)} excluded`;
  }
  if (input.includedChatCount > 0) {
    return `${input.includedChatCount} chat source${projectBoardPlural(input.includedChatCount)} included for additive synthesis`;
  }
  return `${input.selectedObservationCount} included source observation${projectBoardPlural(input.selectedObservationCount)} available`;
}

function projectBoardSourceImpactDetail(input: {
  selectedIds?: Set<string>;
  broadChange: boolean;
  modelCallRequired: boolean;
  affectedDraftCount: number;
  affectedExecutableCount: number;
  durablePlanPrimaryCount: number;
  ignoredChatCount: number;
}): string {
  const parts = [
    "Existing board cards are not rewritten by default.",
    input.modelCallRequired ? "Selected included sources can run additive card elaboration." : "No Pi call is required to inspect this preview.",
    input.affectedDraftCount > 0
      ? `${input.affectedDraftCount} draft card${projectBoardPlural(input.affectedDraftCount)} cite the previewed source context and may need targeted refresh.`
      : "No draft cards cite the previewed source context.",
    input.affectedExecutableCount > 0
      ? `${input.affectedExecutableCount} ticketized card${projectBoardPlural(input.affectedExecutableCount)} cite this context; use additive next-run feedback instead of rewriting approved cards.`
      : "",
    input.durablePlanPrimaryCount > 0 && input.ignoredChatCount > 0
      ? "Chats remain inspectable but excluded while the durable plan is the source of truth."
      : "",
    input.broadChange ? "Broad source selection should show budget impact before synthesis starts." : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function projectBoardPlural(count: number): string {
  return count === 1 ? "" : "s";
}

function projectBoardEventMetadataNumber(event: ProjectBoardEvent | undefined, key: string): number {
  const value = event?.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function projectBoardSourceRefMatchesSource(ref: string, source: ProjectBoardSource): boolean {
  return projectBoardReferenceKeyMatchesAny(ref, new Set(projectBoardSourceReferenceKeys(source)));
}

function projectBoardReferenceKeyMatchesAny(ref: string, sourceKeys: Set<string>): boolean {
  const normalized = projectBoardSourceReferenceKey(ref);
  if (!normalized) return false;
  for (const key of sourceKeys) {
    if (!key) continue;
    if (normalized === key) return true;
    if (key.length >= 6 && normalized.includes(key)) return true;
    if (normalized.length >= 6 && key.includes(normalized)) return true;
  }
  return false;
}

function projectBoardSourceReferenceKeys(source: ProjectBoardSource): string[] {
  return [source.id, source.sourceKey, source.path, source.title, source.artifactId, source.threadId, source.messageId]
    .filter((value): value is string => Boolean(value))
    .map(projectBoardSourceReferenceKey)
    .filter(Boolean);
}

function projectBoardSourceReferenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\s+/g, " ");
}

function projectBoardSourceGroupKey(source: ProjectBoardSource): string {
  const contentKey = [normalizeProjectBoardSourceText(source.title), normalizeProjectBoardSourceText(source.summary)].filter(Boolean).join("|");
  if (contentKey.length >= 16) return `content:${contentKey}`;
  return [source.kind, source.path ?? "", source.threadId ?? "", source.artifactId ?? "", source.messageId ?? "", source.id].join(":");
}

function normalizeProjectBoardSourceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "")
    .replace(/\b202\d[-:t0-9.]*z?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareProjectBoardSourcePrimary(left: ProjectBoardSource, right: ProjectBoardSource): number {
  const leftGenerated = projectBoardSourceIsGeneratedObservation(left) ? 1 : 0;
  const rightGenerated = projectBoardSourceIsGeneratedObservation(right) ? 1 : 0;
  if (leftGenerated !== rightGenerated) return leftGenerated - rightGenerated;
  const relevance = right.relevance - left.relevance;
  if (relevance !== 0) return relevance;
  const leftPathLength = left.path?.length ?? 0;
  const rightPathLength = right.path?.length ?? 0;
  if (leftPathLength !== rightPathLength) return leftPathLength - rightPathLength;
  return left.title.localeCompare(right.title);
}

function sortProjectBoardSourceCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return [...cards].sort((left, right) => (left.priority ?? 999) - (right.priority ?? 999) || left.title.localeCompare(right.title));
}
