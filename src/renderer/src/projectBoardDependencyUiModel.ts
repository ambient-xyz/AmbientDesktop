import type { ProjectBoardCard, ProjectBoardExecutionArtifact, ProjectBoardSummary } from "../../shared/projectBoardTypes"; import type { OrchestrationTask } from "../../shared/workflowTypes";
import { projectBoardOpenClarificationQuestions } from "../../shared/projectBoardClarificationDecisions";
import { truncateProjectBoardLedgerText } from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardDependencyImpactTone = "ready" | "warning" | "danger" | "neutral";

export interface ProjectBoardDependencyImpactMetric {
  label: string;
  value: string | number;
  title?: string;
}

export interface ProjectBoardDependencyRow {
  card: ProjectBoardCard;
  blockedBy: string[];
  unblocks: ProjectBoardCard[];
}

export type ProjectBoardCardDependencyBadgeState = "blocked" | "satisfied" | "unresolved";

export interface ProjectBoardCardDependencyBadge {
  ref: string;
  label: string;
  prefix: string;
  state: ProjectBoardCardDependencyBadgeState;
  title: string;
  cardId?: string;
  taskId?: string;
}

export type ProjectBoardDependencyChangeAction = "add_blocker" | "remove_blocker";

export interface ProjectBoardDependencyChangeImpactCard {
  cardId: string;
  title: string;
  beforeLabel: string;
  afterLabel: string;
  beforeOrder: number;
  afterOrder: number;
  tone: ProjectBoardDependencyImpactTone;
  detail: string;
}

export interface ProjectBoardDependencyChangeImpactPreview {
  visible: boolean;
  action: ProjectBoardDependencyChangeAction;
  tone: ProjectBoardDependencyImpactTone;
  headline: string;
  detail: string;
  deltaLabel: string;
  modelCallRequired: false;
  existingCardsRewritten: false;
  cardId: string;
  blockerRef: string;
  blockerLabel: string;
  beforeState: ProjectBoardDependencyReadinessState | "unknown";
  afterState: ProjectBoardDependencyReadinessState | "unknown";
  readyNowDelta: number;
  waitingDelta: number;
  issueDelta: number;
  criticalPathDelta: number;
  affectedCount: number;
  beforeMetrics: ProjectBoardDependencyImpactMetric[];
  afterMetrics: ProjectBoardDependencyImpactMetric[];
  affectedCards: ProjectBoardDependencyChangeImpactCard[];
}

export type ProjectBoardDependencyReadinessState =
  | "ready_now"
  | "ready_after_proof"
  | "needs_clarification"
  | "waiting_on_dependencies"
  | "waiting_on_review"
  | "running"
  | "done"
  | "blocked_issue"
  | "cycle";

export interface ProjectBoardDependencyReadiness {
  card: ProjectBoardCard;
  order: number;
  state: ProjectBoardDependencyReadinessState;
  label: string;
  reason: string;
  waitingOn: ProjectBoardCard[];
  unresolvedRefs: string[];
  cyclic: boolean;
  unblocks: ProjectBoardCard[];
  newlyReadyUnblocks: ProjectBoardCard[];
  blockedUnblocks: ProjectBoardCard[];
  impactLabel: string;
  criticalPath: boolean;
  criticalPathIndex?: number;
}

export interface ProjectBoardUnresolvedDependency {
  card: ProjectBoardCard;
  blockerRef: string;
}

export interface ProjectBoardDependencyCycle {
  cardIds: string[];
  titles: string[];
}

export interface ProjectBoardCriticalPath {
  cards: ProjectBoardCard[];
  length: number;
  readyCard?: ProjectBoardCard;
  summary: string;
}

export interface ProjectBoardCycleRepairSuggestion {
  cycle: ProjectBoardDependencyCycle;
  card: ProjectBoardCard;
  blocker: ProjectBoardCard;
  blockerRef: string;
  label: string;
}

export interface ProjectBoardDependencyHealth {
  rows: ProjectBoardDependencyRow[];
  unresolved: ProjectBoardUnresolvedDependency[];
  cycles: ProjectBoardDependencyCycle[];
  cycleRepairSuggestions: ProjectBoardCycleRepairSuggestion[];
  orderedCards: ProjectBoardCard[];
  readiness: ProjectBoardDependencyReadiness[];
  criticalPath: ProjectBoardCriticalPath;
}

export interface ProjectBoardDependencyEditOption {
  ref: string;
  label: string;
  disabled: boolean;
  reason?: string;
}

export function projectBoardDependencyRows(cards: ProjectBoardCard[]): ProjectBoardDependencyRow[] {
  const activeCards = cards.filter((card) => card.status !== "archived");
  return sortProjectBoardCards(activeCards).map((card) => ({
    card,
    blockedBy: projectBoardActiveDependencyBlockerRefs(card, activeCards),
    unblocks: activeCards.filter(
      (candidate) => candidate.id !== card.id && projectBoardActiveDependencyBlockerRefs(candidate, activeCards).some((blocker) => projectBoardCardMatchesRef(card, blocker)),
    ),
  }));
}

export function projectBoardCardDependencyBadges(
  card: ProjectBoardCard,
  cards: ProjectBoardCard[],
  options: { tasks?: OrchestrationTask[]; executionArtifacts?: ProjectBoardExecutionArtifact[] } = {},
): ProjectBoardCardDependencyBadge[] {
  const tasks = options.tasks ?? [];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const latestArtifactByCardId = projectBoardLatestExecutionArtifactByCard(options.executionArtifacts ?? []);
  return card.blockedBy
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => {
      const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, ref));
      const directTask = tasks.find((candidate) => projectBoardTaskMatchesRef(candidate, ref));
      const linkedTask = blockerCard?.orchestrationTaskId ? tasksById.get(blockerCard.orchestrationTaskId) : undefined;
      const task = linkedTask ?? directTask;
      const label = blockerCard?.title ?? task?.identifier ?? ref;
      const terminalAuditBlocker = Boolean(blockerCard && projectBoardCardIsTerminalAuditCandidate(blockerCard));
      const satisfied =
        terminalAuditBlocker ||
        Boolean((blockerCard && projectBoardDependencySatisfied(blockerCard, latestArtifactByCardId)) || (task && projectBoardTaskDependencySatisfied(task)));
      const state: ProjectBoardCardDependencyBadgeState = blockerCard || task ? (satisfied ? "satisfied" : "blocked") : "unresolved";
      return {
        ref,
        label,
        state,
        prefix: terminalAuditBlocker ? "Dependency skipped" : state === "satisfied" ? "Dependency ready" : state === "unresolved" ? "Unresolved blocker" : "Blocked by",
        title:
          terminalAuditBlocker
            ? `Dependency points to terminal audit card: ${label}.`
            : state === "satisfied"
            ? `Dependency is satisfied: ${label}.`
            : state === "unresolved"
              ? `Unresolved dependency blocker reference: ${ref}.`
              : `Active dependency blocker: ${label}.`,
        cardId: blockerCard?.id,
        taskId: task?.id,
      };
    });
}

export function projectBoardCardCanEditDependencies(card: ProjectBoardCard): boolean {
  return !card.orchestrationTaskId && card.status === "draft";
}

export function projectBoardPrimaryBlockingCard(card: ProjectBoardCard, cards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  for (const blockerRef of card.blockedBy) {
    const ref = blockerRef.trim();
    if (!ref) continue;
    const blockerCard = cards.find(
      (candidate) =>
        candidate.id !== card.id &&
        candidate.status !== "archived" &&
        !projectBoardCardIsTerminalAuditCandidate(candidate) &&
        projectBoardCardMatchesRef(candidate, ref),
    );
    if (blockerCard) return blockerCard;
  }
  return undefined;
}

export function projectBoardDependencyEditOptions(card: ProjectBoardCard, cards: ProjectBoardCard[]): ProjectBoardDependencyEditOption[] {
  return sortProjectBoardCards(
    cards.filter((candidate) => candidate.id !== card.id && candidate.status !== "archived" && !projectBoardCardIsTerminalAuditCandidate(candidate)),
  ).map((candidate) => {
    const alreadyBlocked = card.blockedBy.some((blockerRef) => projectBoardCardMatchesRef(candidate, blockerRef));
    return {
      ref: candidate.id,
      label: `${candidate.title}${candidate.phase ? ` - ${candidate.phase}` : ""}`,
      disabled: alreadyBlocked,
      reason: alreadyBlocked ? "Already a blocker" : undefined,
    };
  });
}

export function projectBoardDependencyChangeImpactPreview(
  card: ProjectBoardCard,
  cards: ProjectBoardCard[],
  input: { action: ProjectBoardDependencyChangeAction; blockerRef: string; maxAffectedCards?: number },
): ProjectBoardDependencyChangeImpactPreview {
  const blockerRef = input.blockerRef.trim();
  const maxAffectedCards = input.maxAffectedCards ?? 4;
  const hidden = projectBoardHiddenDependencyChangeImpact(card, input.action, blockerRef);
  if (!blockerRef) return hidden;
  const blockerCard = cards.find((candidate) => projectBoardCardMatchesRef(candidate, blockerRef) || candidate.id === blockerRef);
  const beforeBlockedBy = card.blockedBy.filter((ref) => ref.trim());
  const blockerAlreadyPresent = blockerCard
    ? beforeBlockedBy.some((ref) => projectBoardCardMatchesRef(blockerCard, ref))
    : beforeBlockedBy.some((ref) => ref.trim() === blockerRef);
  const nextBlockedBy =
    input.action === "add_blocker"
      ? blockerAlreadyPresent
        ? beforeBlockedBy
        : [...beforeBlockedBy, blockerCard?.id ?? blockerRef]
      : beforeBlockedBy.filter((ref) => (blockerCard ? !projectBoardCardMatchesRef(blockerCard, ref) : ref.trim() !== blockerRef));
  if (JSON.stringify(beforeBlockedBy) === JSON.stringify(nextBlockedBy)) return hidden;

  const beforeHealth = projectBoardDependencyHealth(cards);
  const afterCards = cards.map((candidate) => (candidate.id === card.id ? { ...candidate, blockedBy: nextBlockedBy } : candidate));
  const afterHealth = projectBoardDependencyHealth(afterCards);
  const beforeCounts = projectBoardDependencyImpactCounts(beforeHealth);
  const afterCounts = projectBoardDependencyImpactCounts(afterHealth);
  const beforeById = new Map(beforeHealth.readiness.map((item) => [item.card.id, item]));
  const afterById = new Map(afterHealth.readiness.map((item) => [item.card.id, item]));
  const allAffectedCards = projectBoardDependencyChangeAffectedCards(cards, beforeById, afterById, card.id);
  const affectedCards = allAffectedCards.slice(0, Math.max(1, maxAffectedCards));
  const readyNowDelta = afterCounts.readyNow - beforeCounts.readyNow;
  const waitingDelta = afterCounts.waiting - beforeCounts.waiting;
  const issueDelta = afterCounts.issues - beforeCounts.issues;
  const criticalPathDelta = afterHealth.criticalPath.length - beforeHealth.criticalPath.length;
  const beforeState = beforeById.get(card.id)?.state ?? "unknown";
  const afterState = afterById.get(card.id)?.state ?? "unknown";
  const blockerLabel = blockerCard?.title ?? blockerRef;
  const tone = projectBoardDependencyChangeImpactTone(input.action, readyNowDelta, waitingDelta, issueDelta, beforeState, afterState);
  const deltaLabel = projectBoardDependencyChangeDeltaLabel(readyNowDelta, waitingDelta, issueDelta, allAffectedCards.length);
  const actionLabel = input.action === "add_blocker" ? "Adding" : "Removing";

  return {
    visible: true,
    action: input.action,
    tone,
    headline:
      issueDelta > 0
        ? `${actionLabel} this blocker would introduce dependency issues`
        : allAffectedCards.length > 0
          ? `${actionLabel} this blocker changes ${allAffectedCards.length} card${allAffectedCards.length === 1 ? "" : "s"}`
          : `${actionLabel} this blocker has no readiness change`,
    detail: `${actionLabel} "${blockerLabel}" ${input.action === "add_blocker" ? "as a blocker" : "from blockers"} is a deterministic map edit: 0 model calls, 0 approved field rewrites, and Local Task prompts only change after the dependency edit is saved.`,
    deltaLabel,
    modelCallRequired: false,
    existingCardsRewritten: false,
    cardId: card.id,
    blockerRef,
    blockerLabel,
    beforeState,
    afterState,
    readyNowDelta,
    waitingDelta,
    issueDelta,
    criticalPathDelta,
    affectedCount: allAffectedCards.length,
    beforeMetrics: projectBoardDependencyImpactMetrics(beforeCounts, beforeHealth.criticalPath.length),
    afterMetrics: projectBoardDependencyImpactMetrics(afterCounts, afterHealth.criticalPath.length),
    affectedCards,
  };
}

export function projectBoardDependencyHealth(boardOrCards: ProjectBoardSummary | ProjectBoardCard[]): ProjectBoardDependencyHealth {
  const cards = Array.isArray(boardOrCards) ? boardOrCards : boardOrCards.cards;
  const executionArtifacts = Array.isArray(boardOrCards) ? [] : boardOrCards.executionArtifacts ?? [];
  const latestArtifactByCardId = projectBoardLatestExecutionArtifactByCard(executionArtifacts);
  const activeCards = sortProjectBoardCards(cards.filter((card) => card.status !== "archived"));
  const rows = projectBoardDependencyRows(activeCards);
  const cardByRef = new Map<string, ProjectBoardCard>();
  for (const card of activeCards) {
    for (const ref of projectBoardCardRefs(card)) {
      if (ref) cardByRef.set(ref, card);
    }
  }

  const unresolved: ProjectBoardUnresolvedDependency[] = [];
  const blockersByCardId = new Map<string, string[]>();
  for (const card of activeCards) {
    const blockerIds: string[] = [];
    for (const blockerRef of projectBoardActiveDependencyBlockerRefs(card, activeCards)) {
      const blocker = cardByRef.get(blockerRef.trim());
      if (!blocker) {
        unresolved.push({ card, blockerRef });
        continue;
      }
      if (blocker.id !== card.id && !blockerIds.includes(blocker.id)) blockerIds.push(blocker.id);
    }
    blockersByCardId.set(card.id, blockerIds);
  }

  const cycles = projectBoardDependencyCycles(activeCards, blockersByCardId);
  const orderedCards = projectBoardTopologicalOrder(activeCards, blockersByCardId);
  const dependentsByBlocker = projectBoardDependentsByBlocker(activeCards, blockersByCardId);
  const criticalPath = projectBoardCriticalPath(activeCards, blockersByCardId, cycles, latestArtifactByCardId);
  return {
    rows,
    unresolved,
    cycles,
    cycleRepairSuggestions: projectBoardCycleRepairSuggestions(cycles, blockersByCardId, activeCards),
    orderedCards,
    readiness: projectBoardDependencyReadiness(activeCards, blockersByCardId, dependentsByBlocker, unresolved, cycles, orderedCards, criticalPath, latestArtifactByCardId),
    criticalPath,
  };
}

export function projectBoardLatestExecutionArtifactByCard(executionArtifacts: ProjectBoardExecutionArtifact[]): Map<string, ProjectBoardExecutionArtifact> {
  const latestByCard = new Map<string, ProjectBoardExecutionArtifact>();
  for (const artifact of executionArtifacts) {
    const current = latestByCard.get(artifact.cardId);
    if (!current || projectBoardExecutionArtifactTime(artifact).localeCompare(projectBoardExecutionArtifactTime(current)) > 0) {
      latestByCard.set(artifact.cardId, artifact);
    }
  }
  return latestByCard;
}

export function projectBoardExecutionArtifactStatus(artifact: ProjectBoardExecutionArtifact): string {
  return artifact.status.trim().toLowerCase().replace(/\s+/g, "_");
}

export function projectBoardExecutionArtifactSatisfiesDependency(artifact?: ProjectBoardExecutionArtifact): boolean {
  if (!artifact) return false;
  const status = projectBoardExecutionArtifactStatus(artifact);
  return (status === "completed" || status === "review" || status === "needs_review") && Boolean(artifact.proof || artifact.handoff);
}

export function projectBoardExecutionArtifactFailed(artifact: ProjectBoardExecutionArtifact): boolean {
  const status = projectBoardExecutionArtifactStatus(artifact);
  return status === "failed" || status === "error" || status === "terminally_blocked";
}

export function projectBoardExecutionArtifactNeedsAttention(artifact?: ProjectBoardExecutionArtifact): boolean {
  if (!artifact) return false;
  const status = projectBoardExecutionArtifactStatus(artifact);
  return projectBoardExecutionArtifactFailed(artifact) || status === "blocked" || status === "stalled" || status === "canceled" || status === "cancelled";
}

export function projectBoardExecutionArtifactAttentionLabel(artifact: ProjectBoardExecutionArtifact): string {
  const status = projectBoardExecutionArtifactStatus(artifact);
  if (projectBoardExecutionArtifactFailed(artifact)) return "Pulled run failed";
  if (status === "blocked") return "Pulled run blocked";
  if (status === "stalled") return "Pulled run stalled";
  if (status === "canceled" || status === "cancelled") return "Pulled run canceled";
  return "Pulled run needs review";
}

export function projectBoardExecutionArtifactAttentionReason(artifact: ProjectBoardExecutionArtifact): string {
  const summary = artifact.handoff?.summary ?? artifact.proof?.summary;
  if (summary) return truncateProjectBoardLedgerText(summary, 180);
  return "A pulled execution artifact needs project-manager review before this card should drive downstream work.";
}

export function projectBoardExecutionArtifactTime(artifact: ProjectBoardExecutionArtifact): string {
  return artifact.completedAt ?? artifact.updatedAt ?? artifact.startedAt;
}

export function sortProjectBoardCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return [...cards].sort(compareProjectBoardCardsByPriority);
}

export function compareProjectBoardCardsByPriority(left: ProjectBoardCard, right: ProjectBoardCard): number {
  return (left.priority ?? 999) - (right.priority ?? 999) || left.title.localeCompare(right.title);
}

export function projectBoardDisplayOrderedCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  const displayCards = cards.filter((card) => card.status !== "archived");
  if (displayCards.length <= 1) return displayCards;
  const indexById = new Map(displayCards.map((card, index) => [card.id, index]));
  const blockersByCardId = projectBoardBlockersByCardId(displayCards);
  const cycles = projectBoardDependencyCycles(displayCards, blockersByCardId);
  const criticalPathRank = new Map(
    projectBoardCriticalPath(displayCards, blockersByCardId, cycles).cards.map((card, index) => [card.id, index]),
  );
  return projectBoardTopologicalOrder(displayCards, blockersByCardId, (left, right) =>
    compareProjectBoardDisplayCards(left, right, criticalPathRank, indexById),
  );
}

function projectBoardBlockersByCardId(cards: ProjectBoardCard[]): Map<string, string[]> {
  const cardByRef = new Map<string, ProjectBoardCard>();
  for (const card of cards) {
    for (const ref of projectBoardCardRefs(card)) {
      if (ref) cardByRef.set(ref, card);
    }
  }
  const blockersByCardId = new Map<string, string[]>();
  for (const card of cards) {
    const blockerIds: string[] = [];
    for (const blockerRef of card.blockedBy) {
      const blocker = cardByRef.get(blockerRef.trim());
      if (blocker && blocker.id !== card.id && !projectBoardCardIsTerminalAuditCandidate(blocker) && !blockerIds.includes(blocker.id)) {
        blockerIds.push(blocker.id);
      }
    }
    blockersByCardId.set(card.id, blockerIds);
  }
  return blockersByCardId;
}

function compareProjectBoardDisplayCards(
  left: ProjectBoardCard,
  right: ProjectBoardCard,
  criticalPathRank: Map<string, number>,
  indexById: Map<string, number>,
): number {
  const leftCriticalRank = criticalPathRank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
  const rightCriticalRank = criticalPathRank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
  return (
    leftCriticalRank - rightCriticalRank ||
    projectBoardCardCreatedSortValue(left).localeCompare(projectBoardCardCreatedSortValue(right)) ||
    (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0) ||
    left.title.localeCompare(right.title)
  );
}

function projectBoardCardCreatedSortValue(card: ProjectBoardCard): string {
  return card.createdAt?.trim() || "9999-12-31T23:59:59.999Z";
}

export function projectBoardCardMatchesRef(card: ProjectBoardCard, ref: string): boolean {
  const normalizedRef = ref.trim();
  return projectBoardCardRefs(card).some((candidate) => candidate === normalizedRef);
}

function projectBoardCardIsTerminalAuditCandidate(card: Pick<ProjectBoardCard, "candidateStatus">): boolean {
  return card.candidateStatus === "evidence" || card.candidateStatus === "duplicate" || card.candidateStatus === "rejected";
}

function projectBoardActiveDependencyBlockerRefs(card: ProjectBoardCard, cards?: ProjectBoardCard[]): string[] {
  if (projectBoardCardIsTerminalAuditCandidate(card)) return [];
  return card.blockedBy
    .map((ref) => ref.trim())
    .filter(Boolean)
    .filter((ref) => {
      const blockerCard = cards?.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, ref));
      return !blockerCard || !projectBoardCardIsTerminalAuditCandidate(blockerCard);
    });
}

export function projectBoardCardProofCount(card: ProjectBoardCard): number {
  return card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
}

export function projectBoardCardRefs(card: ProjectBoardCard): string[] {
  return [card.id, card.orchestrationTaskId ?? "", card.sourceId, `card:${card.id}`, `project-board-card:${card.id}`].filter(Boolean);
}

export function projectBoardTaskMatchesRef(task: OrchestrationTask, ref: string): boolean {
  const normalizedRef = ref.trim();
  return [task.id, task.identifier, task.sourceUrl ?? ""].some((candidate) => candidate === normalizedRef);
}

function projectBoardDependencyCycles(cards: ProjectBoardCard[], blockersByCardId: Map<string, string[]>): ProjectBoardDependencyCycle[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const seen = new Set<string>();
  const cycles: ProjectBoardDependencyCycle[] = [];

  const visit = (cardId: string) => {
    const currentState = state.get(cardId);
    if (currentState === "visited") return;
    if (currentState === "visiting") {
      const start = stack.indexOf(cardId);
      const cycleIds = start >= 0 ? stack.slice(start) : [cardId];
      const key = [...cycleIds].sort().join("|");
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push({
          cardIds: cycleIds,
          titles: cycleIds.map((id) => byId.get(id)?.title ?? id),
        });
      }
      return;
    }

    state.set(cardId, "visiting");
    stack.push(cardId);
    for (const blockerId of blockersByCardId.get(cardId) ?? []) visit(blockerId);
    stack.pop();
    state.set(cardId, "visited");
  };

  for (const card of cards) visit(card.id);
  return cycles;
}

export function projectBoardTopologicalOrder(
  cards: ProjectBoardCard[],
  blockersByCardId: Map<string, string[]>,
  compareCards: (left: ProjectBoardCard, right: ProjectBoardCard) => number = compareProjectBoardCardsByPriority,
): ProjectBoardCard[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const dependentsByBlocker = new Map<string, string[]>();
  const blockerCounts = new Map(cards.map((card) => [card.id, 0]));
  for (const card of cards) {
    for (const blockerId of blockersByCardId.get(card.id) ?? []) {
      if (!byId.has(blockerId)) continue;
      dependentsByBlocker.set(blockerId, [...(dependentsByBlocker.get(blockerId) ?? []), card.id]);
      blockerCounts.set(card.id, (blockerCounts.get(card.id) ?? 0) + 1);
    }
  }

  const ready = [...cards.filter((card) => (blockerCounts.get(card.id) ?? 0) === 0)].sort(compareCards);
  const ordered: ProjectBoardCard[] = [];
  while (ready.length) {
    const card = ready.shift()!;
    ordered.push(card);
    for (const dependentId of dependentsByBlocker.get(card.id) ?? []) {
      const nextCount = (blockerCounts.get(dependentId) ?? 0) - 1;
      blockerCounts.set(dependentId, nextCount);
      if (nextCount === 0) {
        const dependent = byId.get(dependentId);
        if (dependent) {
          ready.push(dependent);
          ready.sort(compareCards);
        }
      }
    }
  }

  const orderedIds = new Set(ordered.map((card) => card.id));
  return [...ordered, ...cards.filter((card) => !orderedIds.has(card.id)).sort(compareCards)];
}

export function projectBoardDependentsByBlocker(cards: ProjectBoardCard[], blockersByCardId: Map<string, string[]>): Map<string, ProjectBoardCard[]> {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const dependents = new Map<string, ProjectBoardCard[]>();
  for (const card of cards) {
    for (const blockerId of blockersByCardId.get(card.id) ?? []) {
      if (!byId.has(blockerId)) continue;
      dependents.set(blockerId, [...(dependents.get(blockerId) ?? []), card]);
    }
  }
  for (const [blockerId, blockerDependents] of dependents) {
    dependents.set(blockerId, sortProjectBoardCards(blockerDependents));
  }
  return dependents;
}

function projectBoardCriticalPath(
  cards: ProjectBoardCard[],
  blockersByCardId: Map<string, string[]>,
  cycles: ProjectBoardDependencyCycle[],
  latestArtifactByCardId: Map<string, ProjectBoardExecutionArtifact> = new Map(),
): ProjectBoardCriticalPath {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const cyclicIds = new Set(cycles.flatMap((cycle) => cycle.cardIds));
  const memo = new Map<string, string[]>();

  const pathTo = (cardId: string, visiting = new Set<string>()): string[] => {
    if (memo.has(cardId)) return memo.get(cardId)!;
    if (visiting.has(cardId) || cyclicIds.has(cardId)) return [cardId];
    visiting.add(cardId);
    const blockerPaths = (blockersByCardId.get(cardId) ?? [])
      .filter((blockerId) => byId.has(blockerId))
      .map((blockerId) => pathTo(blockerId, new Set(visiting)));
    visiting.delete(cardId);
    const longestBlockerPath = blockerPaths.sort((left, right) => right.length - left.length)[0] ?? [];
    const path = [...longestBlockerPath, cardId];
    memo.set(cardId, path);
    return path;
  };

  const cardIds = cards
    .map((card) => pathTo(card.id))
    .sort((left, right) => right.length - left.length || (byId.get(left[left.length - 1])?.priority ?? 999) - (byId.get(right[right.length - 1])?.priority ?? 999))[0] ?? [];
  const pathCards = cardIds.map((id) => byId.get(id)).filter((card): card is ProjectBoardCard => Boolean(card));
  const readyCard = pathCards.find((card) => !projectBoardDependencySatisfied(card, latestArtifactByCardId));
  return {
    cards: pathCards,
    length: pathCards.length,
    readyCard,
    summary: projectBoardCriticalPathSummary(pathCards, readyCard),
  };
}

function projectBoardCriticalPathSummary(cards: ProjectBoardCard[], readyCard?: ProjectBoardCard): string {
  if (cards.length === 0) return "No dependency path yet.";
  if (cards.length === 1) return "Single-card path; dependencies are not driving order yet.";
  if (readyCard) return `${cards.length}-card critical path. Next attention: ${readyCard.title}.`;
  return `${cards.length}-card critical path is currently satisfied.`;
}

function projectBoardCycleRepairSuggestions(
  cycles: ProjectBoardDependencyCycle[],
  blockersByCardId: Map<string, string[]>,
  cards: ProjectBoardCard[],
): ProjectBoardCycleRepairSuggestion[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return cycles
    .map((cycle) => {
      const card = cycle.cardIds.map((id) => byId.get(id)).filter((item): item is ProjectBoardCard => Boolean(item)).sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
      const blockerId = card ? (blockersByCardId.get(card.id) ?? []).find((id) => cycle.cardIds.includes(id)) : undefined;
      const blocker = blockerId ? byId.get(blockerId) : undefined;
      if (!card || !blocker) return undefined;
      const blockerRef = card.blockedBy.find((ref) => projectBoardCardMatchesRef(blocker, ref)) ?? blocker.id;
      return {
        cycle,
        card,
        blocker,
        blockerRef,
        label: `Remove "${blocker.title}" as a blocker of "${card.title}" or split one of the cards.`,
      };
    })
    .filter((suggestion): suggestion is ProjectBoardCycleRepairSuggestion => Boolean(suggestion));
}

function projectBoardDependencyReadiness(
  cards: ProjectBoardCard[],
  blockersByCardId: Map<string, string[]>,
  dependentsByBlocker: Map<string, ProjectBoardCard[]>,
  unresolved: ProjectBoardUnresolvedDependency[],
  cycles: ProjectBoardDependencyCycle[],
  orderedCards: ProjectBoardCard[],
  criticalPath: ProjectBoardCriticalPath,
  latestArtifactByCardId: Map<string, ProjectBoardExecutionArtifact> = new Map(),
): ProjectBoardDependencyReadiness[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const unresolvedByCardId = new Map<string, string[]>();
  for (const issue of unresolved) {
    unresolvedByCardId.set(issue.card.id, [...(unresolvedByCardId.get(issue.card.id) ?? []), issue.blockerRef]);
  }
  const cycleCardIds = new Set(cycles.flatMap((cycle) => cycle.cardIds));
  const orderByCardId = new Map(orderedCards.map((card, index) => [card.id, index + 1]));
  const criticalIndexByCardId = new Map(criticalPath.cards.map((card, index) => [card.id, index + 1]));
  return orderedCards.map((card) => {
    const blockers = (blockersByCardId.get(card.id) ?? []).map((id) => cardsById.get(id)).filter((item): item is ProjectBoardCard => Boolean(item));
    const waitingOn = blockers.filter((blocker) => !projectBoardDependencySatisfied(blocker, latestArtifactByCardId));
    const unblocks = dependentsByBlocker.get(card.id) ?? [];
    const newlyReadyUnblocks = unblocks.filter(
      (dependent) =>
        (unresolvedByCardId.get(dependent.id) ?? []).length === 0 &&
        projectBoardWouldBeReadyIfDependencySatisfied(dependent, card.id, blockersByCardId, cardsById, latestArtifactByCardId),
    );
    const blockedUnblocks = unblocks.filter((dependent) => !newlyReadyUnblocks.some((ready) => ready.id === dependent.id));
    const unresolvedRefs = unresolvedByCardId.get(card.id) ?? [];
    const cyclic = cycleCardIds.has(card.id);
    const proofCount = projectBoardCardProofCount(card);
    const impact = projectBoardDependencyImpactLabel(unblocks, newlyReadyUnblocks);
    const criticalPathIndex = criticalIndexByCardId.get(card.id);
    const executionArtifact = latestArtifactByCardId.get(card.id);

    if (cyclic) {
      return projectBoardReadiness(card, orderByCardId, "cycle", "Cycle detected", "Edit dependency blockers before this card can be ordered.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (unresolvedRefs.length > 0) {
      return projectBoardReadiness(card, orderByCardId, "blocked_issue", "Blocked issue", `Unresolved blocker ${unresolvedRefs[0]}.`, waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (executionArtifact && projectBoardExecutionArtifactNeedsAttention(executionArtifact)) {
      return projectBoardReadiness(
        card,
        orderByCardId,
        "blocked_issue",
        projectBoardExecutionArtifactAttentionLabel(executionArtifact),
        projectBoardExecutionArtifactAttentionReason(executionArtifact),
        waitingOn,
        unresolvedRefs,
        cyclic,
        unblocks,
        newlyReadyUnblocks,
        blockedUnblocks,
        impact,
        criticalPathIndex,
      );
    }
    if (card.status === "done") {
      return projectBoardReadiness(card, orderByCardId, "done", "Done", "Completed cards publish dependency artifacts for downstream prepared runs.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (card.status === "in_progress") {
      return projectBoardReadiness(card, orderByCardId, "running", "Running", "Work is already in progress.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (executionArtifact && projectBoardExecutionArtifactSatisfiesDependency(executionArtifact)) {
      return projectBoardReadiness(
        card,
        orderByCardId,
        "waiting_on_review",
        "Pulled proof",
        "Pulled execution proof is available as dependency evidence; review the handoff before closing the card or dispatching downstream work.",
        waitingOn,
        unresolvedRefs,
        cyclic,
        unblocks,
        newlyReadyUnblocks,
        blockedUnblocks,
        impact,
        criticalPathIndex,
      );
    }
    if (card.status === "review") {
      return projectBoardReadiness(card, orderByCardId, "waiting_on_review", "Waiting on review", "Implementation is ready for review.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (card.status === "blocked") {
      return projectBoardReadiness(card, orderByCardId, "blocked_issue", "Blocked", "Resolve the blocked card before low-intervention dispatch.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (waitingOn.length > 0) {
      return projectBoardReadiness(card, orderByCardId, "waiting_on_dependencies", "Waiting on dependencies", `Blocked by ${waitingOn[0].title}.`, waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    if (card.status === "draft" && (card.candidateStatus === "needs_clarification" || projectBoardCardHasUnansweredClarifications(card))) {
      const questionCount = (card.clarificationQuestions ?? []).filter((question) => question.trim()).length;
      return projectBoardReadiness(
        card,
        orderByCardId,
        "needs_clarification",
        "Needs clarification",
        questionCount > 0
          ? `${questionCount} clarification question${questionCount === 1 ? "" : "s"} must be answered before this card becomes executable.`
          : "Review the card scope, dependencies, and proof expectations before marking it ready.",
        waitingOn,
        unresolvedRefs,
        cyclic,
        unblocks,
        newlyReadyUnblocks,
        blockedUnblocks,
        impact,
        criticalPathIndex,
      );
    }
    if (card.status === "draft" && card.candidateStatus !== "ready_to_create") {
      return projectBoardReadiness(
        card,
        orderByCardId,
        "waiting_on_review",
        "Not executable",
        "This candidate is marked covered, duplicate, or rejected and will not dispatch unless PM review moves it back to Ready.",
        waitingOn,
        unresolvedRefs,
        cyclic,
        unblocks,
        newlyReadyUnblocks,
        blockedUnblocks,
        impact,
        criticalPathIndex,
      );
    }
    if (proofCount === 0 && card.candidateStatus !== "evidence") {
      return projectBoardReadiness(card, orderByCardId, "ready_after_proof", "Ready after proof", "Add a proof expectation before relying on low-intervention execution.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
    }
    return projectBoardReadiness(card, orderByCardId, "ready_now", "Ready now", "Dependencies are satisfied and prepared runs will import available dependency artifacts.", waitingOn, unresolvedRefs, cyclic, unblocks, newlyReadyUnblocks, blockedUnblocks, impact, criticalPathIndex);
  });
}

function projectBoardCardHasUnansweredClarifications(card: ProjectBoardCard): boolean {
  return projectBoardOpenClarificationQuestions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    includeInlineQuestions: false,
    limit: 8,
  }).length > 0;
}

export function projectBoardWouldBeReadyIfDependencySatisfied(
  dependent: ProjectBoardCard,
  completedCardId: string,
  blockersByCardId: Map<string, string[]>,
  cardsById: Map<string, ProjectBoardCard>,
  latestArtifactByCardId: Map<string, ProjectBoardExecutionArtifact> = new Map(),
): boolean {
  if (["done", "review", "in_progress", "blocked"].includes(dependent.status)) return false;
  if (dependent.status === "draft" && dependent.candidateStatus !== "ready_to_create") return false;
  if (projectBoardCardHasUnansweredClarifications(dependent)) return false;
  if (projectBoardCardProofCount(dependent) === 0) return false;
  return (blockersByCardId.get(dependent.id) ?? []).every((blockerId) => {
    const blocker = cardsById.get(blockerId);
    return blockerId === completedCardId || Boolean(blocker && projectBoardDependencySatisfied(blocker, latestArtifactByCardId));
  });
}

function projectBoardDependencyImpactLabel(unblocks: ProjectBoardCard[], newlyReadyUnblocks: ProjectBoardCard[]): string {
  if (unblocks.length === 0) return "No downstream cards yet.";
  if (newlyReadyUnblocks.length > 0) {
    return `Would make ${newlyReadyUnblocks.length} downstream card${newlyReadyUnblocks.length === 1 ? "" : "s"} ready.`;
  }
  return `Unblocks ${unblocks.length} downstream card${unblocks.length === 1 ? "" : "s"} after other dependencies clear.`;
}

function projectBoardHiddenDependencyChangeImpact(
  card: ProjectBoardCard,
  action: ProjectBoardDependencyChangeAction,
  blockerRef: string,
): ProjectBoardDependencyChangeImpactPreview {
  return {
    visible: false,
    action,
    tone: "neutral",
    headline: "No dependency change selected",
    detail: "Choose a blocker to preview dependency-map impact.",
    deltaLabel: "No change",
    modelCallRequired: false,
    existingCardsRewritten: false,
    cardId: card.id,
    blockerRef,
    blockerLabel: blockerRef,
    beforeState: "unknown",
    afterState: "unknown",
    readyNowDelta: 0,
    waitingDelta: 0,
    issueDelta: 0,
    criticalPathDelta: 0,
    affectedCount: 0,
    beforeMetrics: [],
    afterMetrics: [],
    affectedCards: [],
  };
}

function projectBoardDependencyImpactCounts(health: ProjectBoardDependencyHealth): { readyNow: number; waiting: number; issues: number; proof: number } {
  return {
    readyNow: health.readiness.filter((item) => item.state === "ready_now").length,
    waiting: health.readiness.filter((item) => item.state === "waiting_on_dependencies" || item.state === "needs_clarification").length,
    issues: health.unresolved.length + health.cycles.length,
    proof: health.readiness.filter((item) => item.state === "ready_after_proof").length,
  };
}

function projectBoardDependencyImpactMetrics(
  counts: { readyNow: number; waiting: number; issues: number; proof: number },
  criticalPathLength: number,
): ProjectBoardDependencyImpactMetric[] {
  return [
    { label: "Ready now", value: counts.readyNow },
    { label: "Waiting", value: counts.waiting },
    { label: "Proof needed", value: counts.proof },
    { label: "Issues", value: counts.issues },
    { label: "Critical path", value: criticalPathLength },
  ];
}

function projectBoardDependencyChangeAffectedCards(
  cards: ProjectBoardCard[],
  beforeById: Map<string, ProjectBoardDependencyReadiness>,
  afterById: Map<string, ProjectBoardDependencyReadiness>,
  editedCardId: string,
): ProjectBoardDependencyChangeImpactCard[] {
  return sortProjectBoardCards(cards)
    .map((card) => {
      const before = beforeById.get(card.id);
      const after = afterById.get(card.id);
      if (!before || !after) return undefined;
      const changed =
        card.id === editedCardId ||
        before.state !== after.state ||
        before.reason !== after.reason ||
        before.order !== after.order ||
        before.criticalPathIndex !== after.criticalPathIndex;
      if (!changed) return undefined;
      return {
        cardId: card.id,
        title: card.title,
        beforeLabel: `${before.label} (#${before.order})`,
        afterLabel: `${after.label} (#${after.order})`,
        beforeOrder: before.order,
        afterOrder: after.order,
        tone: projectBoardDependencyChangeCardTone(before.state, after.state),
        detail: before.reason === after.reason ? after.reason : `${before.reason} -> ${after.reason}`,
      };
    })
    .filter((item): item is ProjectBoardDependencyChangeImpactCard => Boolean(item));
}

function projectBoardDependencyChangeCardTone(
  beforeState: ProjectBoardDependencyReadinessState,
  afterState: ProjectBoardDependencyReadinessState,
): ProjectBoardDependencyImpactTone {
  if (afterState === "cycle" || afterState === "blocked_issue") return "danger";
  if (afterState === "waiting_on_dependencies" || afterState === "needs_clarification" || afterState === "ready_after_proof") return "warning";
  if (beforeState !== "ready_now" && afterState === "ready_now") return "ready";
  return "neutral";
}

function projectBoardDependencyChangeImpactTone(
  action: ProjectBoardDependencyChangeAction,
  readyNowDelta: number,
  waitingDelta: number,
  issueDelta: number,
  beforeState: ProjectBoardDependencyReadinessState | "unknown",
  afterState: ProjectBoardDependencyReadinessState | "unknown",
): ProjectBoardDependencyImpactTone {
  if (issueDelta > 0 || afterState === "cycle" || afterState === "blocked_issue") return "danger";
  if (readyNowDelta < 0 || waitingDelta > 0 || (action === "add_blocker" && beforeState !== afterState)) return "warning";
  if (readyNowDelta > 0 || waitingDelta < 0) return "ready";
  return "neutral";
}

function projectBoardDependencyChangeDeltaLabel(readyNowDelta: number, waitingDelta: number, issueDelta: number, affectedCount: number): string {
  if (issueDelta > 0) return `+${issueDelta} issue${issueDelta === 1 ? "" : "s"}`;
  if (readyNowDelta > 0) return `+${readyNowDelta} ready`;
  if (readyNowDelta < 0) return `${Math.abs(readyNowDelta)} fewer ready`;
  if (waitingDelta > 0) return `+${waitingDelta} waiting`;
  if (waitingDelta < 0) return `${Math.abs(waitingDelta)} fewer waiting`;
  if (affectedCount > 0) return `${affectedCount} affected`;
  return "No readiness change";
}

function projectBoardReadiness(
  card: ProjectBoardCard,
  orderByCardId: Map<string, number>,
  state: ProjectBoardDependencyReadinessState,
  label: string,
  reason: string,
  waitingOn: ProjectBoardCard[],
  unresolvedRefs: string[],
  cyclic: boolean,
  unblocks: ProjectBoardCard[],
  newlyReadyUnblocks: ProjectBoardCard[],
  blockedUnblocks: ProjectBoardCard[],
  impactLabel: string,
  criticalPathIndex?: number,
): ProjectBoardDependencyReadiness {
  return {
    card,
    order: orderByCardId.get(card.id) ?? 999,
    state,
    label,
    reason,
    waitingOn,
    unresolvedRefs,
    cyclic,
    unblocks,
    newlyReadyUnblocks,
    blockedUnblocks,
    impactLabel,
    criticalPath: criticalPathIndex !== undefined,
    criticalPathIndex,
  };
}

export function projectBoardDependencySatisfied(card: ProjectBoardCard, latestArtifactByCardId: Map<string, ProjectBoardExecutionArtifact> = new Map()): boolean {
  return (
    card.status === "done" ||
    card.status === "review" ||
    projectBoardCardIsTerminalAuditCandidate(card) ||
    projectBoardExecutionArtifactSatisfiesDependency(latestArtifactByCardId.get(card.id))
  );
}

export function projectBoardTaskDependencySatisfied(task: OrchestrationTask): boolean {
  const state = task.state.trim().toLowerCase().replace(/\s+/g, "_");
  return ["done", "review", "needs_review", "completed"].includes(state);
}
