import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "./types";

export interface ProjectBoardProofCoverageRecheckMetadata {
  schemaVersion: 1;
  appliedAction: "recompute_proof_coverage";
  strict: boolean;
  proofPolicyHash: string;
  eligibleCardIds: string[];
  missingProofCardIds: string[];
  unitCardIds: string[];
  integrationCardIds: string[];
  visualCardIds: string[];
  manualCardIds: string[];
  eligibleCardCount: number;
  missingProofCount: number;
  unitProofItemCount: number;
  integrationProofItemCount: number;
  visualProofItemCount: number;
  manualProofItemCount: number;
  proofItemCountsByCardId: Record<string, number>;
  existingCardsRewritten: false;
  modelCallRequired: false;
}

export interface ProjectBoardProofSuggestionAppliedMetadata {
  schemaVersion: 1;
  appliedAction: "suggest_missing_proof";
  strict: boolean;
  targetCardIds: string[];
  appliedCardIds: string[];
  pendingPiUpdateCardIds?: string[];
  skippedCardIds: string[];
  skippedReasons: Record<string, string>;
  appliedProofItemCount: number;
  suggestedProofItemCount?: number;
  missingProofCountBefore: number;
  missingProofCountAfter: number;
  existingCardsRewritten: false;
  modelCallRequired: true;
  model?: string;
  promptCharCount?: number;
  responseCharCount?: number;
  requestDurationMs?: number;
  fallbackUsed?: boolean;
  providerError?: string;
}

export interface ProjectBoardProofCoverageDrift {
  stale: boolean;
  reasons: string[];
  policyChanged: boolean;
  strictChanged: boolean;
  eligibleCardDelta: number;
  missingProofDelta: number;
  proofItemDelta: number;
  affectedCardIds: string[];
  policyAffectedCardIds: string[];
  addedEligibleCardIds: string[];
  removedEligibleCardIds: string[];
  addedMissingProofCardIds: string[];
  resolvedMissingProofCardIds: string[];
  proofKindChangedCardIds: string[];
  proofItemCountChangedCardIds: string[];
}

export function projectBoardProofCoverageRecheck(
  board: Pick<ProjectBoardSummary, "cards" | "charter">,
): ProjectBoardProofCoverageRecheckMetadata {
  const eligibleCards = projectBoardProofEligibleCards(board.cards);
  const unitCards = eligibleCards.filter((card) => card.testPlan.unit.length > 0);
  const integrationCards = eligibleCards.filter((card) => card.testPlan.integration.length > 0);
  const visualCards = eligibleCards.filter((card) => card.testPlan.visual.length > 0);
  const manualCards = eligibleCards.filter((card) => card.testPlan.manual.length > 0);
  const missingProofCards = eligibleCards.filter((card) => projectBoardCardProofCount(card) === 0);

  return {
    schemaVersion: 1,
    appliedAction: "recompute_proof_coverage",
    strict: projectBoardRequiresProofSpec(board),
    proofPolicyHash: stableProofPolicyHash(board.charter?.testPolicy),
    eligibleCardIds: eligibleCards.map((card) => card.id),
    missingProofCardIds: missingProofCards.map((card) => card.id),
    unitCardIds: unitCards.map((card) => card.id),
    integrationCardIds: integrationCards.map((card) => card.id),
    visualCardIds: visualCards.map((card) => card.id),
    manualCardIds: manualCards.map((card) => card.id),
    eligibleCardCount: eligibleCards.length,
    missingProofCount: missingProofCards.length,
    unitProofItemCount: eligibleCards.reduce((total, card) => total + card.testPlan.unit.length, 0),
    integrationProofItemCount: eligibleCards.reduce((total, card) => total + card.testPlan.integration.length, 0),
    visualProofItemCount: eligibleCards.reduce((total, card) => total + card.testPlan.visual.length, 0),
    manualProofItemCount: eligibleCards.reduce((total, card) => total + card.testPlan.manual.length, 0),
    proofItemCountsByCardId: Object.fromEntries(eligibleCards.map((card) => [card.id, projectBoardCardProofCount(card)])),
    existingCardsRewritten: false,
    modelCallRequired: false,
  };
}

export function projectBoardProofCoverageDrift(
  current: ProjectBoardProofCoverageRecheckMetadata,
  previous: ProjectBoardProofCoverageRecheckMetadata | undefined,
): ProjectBoardProofCoverageDrift {
  if (!previous) {
    return {
      stale: false,
      reasons: ["No proof coverage baseline has been recorded yet."],
      policyChanged: false,
      strictChanged: false,
      eligibleCardDelta: 0,
      missingProofDelta: 0,
      proofItemDelta: 0,
      affectedCardIds: [],
      policyAffectedCardIds: [],
      addedEligibleCardIds: [],
      removedEligibleCardIds: [],
      addedMissingProofCardIds: [],
      resolvedMissingProofCardIds: [],
      proofKindChangedCardIds: [],
      proofItemCountChangedCardIds: [],
    };
  }

  const addedEligibleCardIds = current.eligibleCardIds.filter((cardId) => !previous.eligibleCardIds.includes(cardId));
  const removedEligibleCardIds = previous.eligibleCardIds.filter((cardId) => !current.eligibleCardIds.includes(cardId));
  const addedMissingProofCardIds = current.missingProofCardIds.filter((cardId) => !previous.missingProofCardIds.includes(cardId));
  const resolvedMissingProofCardIds = previous.missingProofCardIds.filter((cardId) => !current.missingProofCardIds.includes(cardId));
  const proofKindChangedCardIds = uniqueStrings([
    ...symmetricDifference(current.unitCardIds, previous.unitCardIds),
    ...symmetricDifference(current.integrationCardIds, previous.integrationCardIds),
    ...symmetricDifference(current.visualCardIds, previous.visualCardIds),
    ...symmetricDifference(current.manualCardIds, previous.manualCardIds),
  ]);
  const proofItemCountChangedCardIds = uniqueStrings([
    ...Object.keys(current.proofItemCountsByCardId),
    ...Object.keys(previous.proofItemCountsByCardId),
  ]).filter((cardId) => (current.proofItemCountsByCardId[cardId] ?? 0) !== (previous.proofItemCountsByCardId[cardId] ?? 0));
  const eligibleCardDelta = current.eligibleCardCount - previous.eligibleCardCount;
  const missingProofDelta = current.missingProofCount - previous.missingProofCount;
  const proofItemDelta = projectBoardProofCoverageItemCount(current) - projectBoardProofCoverageItemCount(previous);
  const policyChanged = current.proofPolicyHash !== previous.proofPolicyHash;
  const strictChanged = current.strict !== previous.strict;
  const policyAffectedCardIds = policyChanged || strictChanged ? current.eligibleCardIds : [];
  const affectedCardIds = uniqueStrings([
    ...addedMissingProofCardIds,
    ...resolvedMissingProofCardIds,
    ...proofKindChangedCardIds,
    ...proofItemCountChangedCardIds,
    ...addedEligibleCardIds,
    ...removedEligibleCardIds,
    ...policyAffectedCardIds,
  ]);
  const coverageCardsChanged =
    !sameStringSet(current.eligibleCardIds, previous.eligibleCardIds) ||
    !sameStringSet(current.unitCardIds, previous.unitCardIds) ||
    !sameStringSet(current.integrationCardIds, previous.integrationCardIds) ||
    !sameStringSet(current.visualCardIds, previous.visualCardIds) ||
    !sameStringSet(current.manualCardIds, previous.manualCardIds) ||
    !sameStringSet(current.missingProofCardIds, previous.missingProofCardIds);
  const stale = policyChanged || strictChanged || coverageCardsChanged || proofItemDelta !== 0;
  const reasons: string[] = [];
  if (policyChanged) reasons.push("Proof policy changed.");
  if (strictChanged) reasons.push(current.strict ? "Strict proof gating is now active." : "Strict proof gating is no longer active.");
  if (eligibleCardDelta !== 0) {
    reasons.push(
      `${Math.abs(eligibleCardDelta)} eligible card${Math.abs(eligibleCardDelta) === 1 ? "" : "s"} ${eligibleCardDelta > 0 ? "added" : "removed"}.`,
    );
  }
  if (missingProofDelta !== 0) {
    reasons.push(
      `${Math.abs(missingProofDelta)} missing-proof card${Math.abs(missingProofDelta) === 1 ? "" : "s"} ${missingProofDelta > 0 ? "added" : "resolved"}.`,
    );
  }
  if (proofItemDelta !== 0) {
    reasons.push(`${Math.abs(proofItemDelta)} proof item${Math.abs(proofItemDelta) === 1 ? "" : "s"} ${proofItemDelta > 0 ? "added" : "removed"}.`);
  }
  if (coverageCardsChanged && eligibleCardDelta === 0 && missingProofDelta === 0 && proofItemDelta === 0) reasons.push("Proof coverage moved between cards.");
  if (reasons.length === 0) reasons.push("Proof coverage matches the latest recorded recheck.");

  return {
    stale,
    reasons,
    policyChanged,
    strictChanged,
    eligibleCardDelta,
    missingProofDelta,
    proofItemDelta,
    affectedCardIds,
    policyAffectedCardIds,
    addedEligibleCardIds,
    removedEligibleCardIds,
    addedMissingProofCardIds,
    resolvedMissingProofCardIds,
    proofKindChangedCardIds,
    proofItemCountChangedCardIds,
  };
}

export function projectBoardLatestProofCoverageRecheckEvent(
  events: ProjectBoardEvent[] | undefined,
): { event: ProjectBoardEvent; proofImpact: ProjectBoardProofCoverageRecheckMetadata } | undefined {
  for (const event of [...(events ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    const proofImpact = projectBoardProofCoverageRecheckMetadataFromEvent(event);
    if (proofImpact) return { event, proofImpact };
  }
  return undefined;
}

export function projectBoardProofCoverageRecheckMetadataFromEvent(
  event: ProjectBoardEvent,
): ProjectBoardProofCoverageRecheckMetadata | undefined {
  const metadata = event.metadata as { proofImpact?: Partial<ProjectBoardProofCoverageRecheckMetadata> } | undefined;
  const impact = metadata?.proofImpact;
  if (!impact || impact.schemaVersion !== 1 || impact.appliedAction !== "recompute_proof_coverage") return undefined;
  if (!Array.isArray(impact.eligibleCardIds) || !Array.isArray(impact.missingProofCardIds)) return undefined;
  if (!Array.isArray(impact.unitCardIds) || !Array.isArray(impact.integrationCardIds)) return undefined;
  if (!Array.isArray(impact.visualCardIds) || !Array.isArray(impact.manualCardIds)) return undefined;
  const proofItemCountsByCardId =
    impact.proofItemCountsByCardId && typeof impact.proofItemCountsByCardId === "object" && !Array.isArray(impact.proofItemCountsByCardId)
      ? Object.fromEntries(
          Object.entries(impact.proofItemCountsByCardId as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
          ),
        )
      : {};
  // Persisted numeric fields can be missing or malformed; derive every count from the
  // validated arrays so partial metadata cannot produce NaN drift deltas and
  // "NaN proof items removed" user-facing reasons.
  return {
    ...impact,
    proofItemCountsByCardId,
    eligibleCardCount: Number.isFinite(impact.eligibleCardCount as number) ? (impact.eligibleCardCount as number) : impact.eligibleCardIds.length,
    missingProofCount: Number.isFinite(impact.missingProofCount as number) ? (impact.missingProofCount as number) : impact.missingProofCardIds.length,
    unitProofItemCount: Number.isFinite(impact.unitProofItemCount as number) ? (impact.unitProofItemCount as number) : impact.unitCardIds.length,
    integrationProofItemCount: Number.isFinite(impact.integrationProofItemCount as number)
      ? (impact.integrationProofItemCount as number)
      : impact.integrationCardIds.length,
    visualProofItemCount: Number.isFinite(impact.visualProofItemCount as number) ? (impact.visualProofItemCount as number) : impact.visualCardIds.length,
    manualProofItemCount: Number.isFinite(impact.manualProofItemCount as number) ? (impact.manualProofItemCount as number) : impact.manualCardIds.length,
  } as ProjectBoardProofCoverageRecheckMetadata;
}

export function projectBoardProofSuggestionAppliedMetadataFromEvent(
  event: ProjectBoardEvent,
): ProjectBoardProofSuggestionAppliedMetadata | undefined {
  const metadata = event.metadata as { proofImpact?: Partial<ProjectBoardProofSuggestionAppliedMetadata> } | undefined;
  const impact = metadata?.proofImpact;
  if (!impact || impact.schemaVersion !== 1 || impact.appliedAction !== "suggest_missing_proof") return undefined;
  if (!Array.isArray(impact.targetCardIds) || !Array.isArray(impact.appliedCardIds) || !Array.isArray(impact.skippedCardIds)) return undefined;
  return impact as ProjectBoardProofSuggestionAppliedMetadata;
}

function projectBoardProofEligibleCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return cards.filter(
    (card) => card.status !== "archived" && card.candidateStatus !== "evidence" && card.candidateStatus !== "rejected" && card.candidateStatus !== "duplicate",
  );
}

function projectBoardCardProofCount(card: ProjectBoardCard): number {
  return card.testPlan.unit.length + card.testPlan.integration.length + card.testPlan.visual.length + card.testPlan.manual.length;
}

function projectBoardProofCoverageItemCount(impact: ProjectBoardProofCoverageRecheckMetadata): number {
  return impact.unitProofItemCount + impact.integrationProofItemCount + impact.visualProofItemCount + impact.manualProofItemCount;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function symmetricDifference(left: string[], right: string[]): string[] {
  return [...left.filter((item) => !right.includes(item)), ...right.filter((item) => !left.includes(item))];
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function projectBoardRequiresProofSpec(board: Pick<ProjectBoardSummary, "charter">): boolean {
  return projectBoardProofPolicyRequiresProofSpec(board.charter?.testPolicy);
}

const PROOF_REQUIREMENT_KEYWORD = /^(?:require[ds]?|must|needs?)$/;
const PROOF_REQUIREMENT_NEGATORS = new Set([
  "no",
  "not",
  "never",
  "none",
  "without",
  "unless",
  "don't",
  "dont",
  "doesn't",
  "doesnt",
  "won't",
  "wont",
  "shouldn't",
  "shouldnt",
  "isn't",
  "isnt",
  "aren't",
  "arent",
]);

export function projectBoardProofPolicyRequiresProofSpec(
  policy: { requireProofSpec?: unknown; defaultProof?: unknown } | undefined,
): boolean {
  if (!policy) return false;
  if (policy.requireProofSpec === true) return true;
  const defaultProof = typeof policy.defaultProof === "string" ? policy.defaultProof.toLowerCase() : "";
  // A bare keyword match would read "automated tests are not required" as requiring
  // proof. A requirement keyword only counts when no negator sits near it.
  const tokens = defaultProof.split(/[^a-z']+/).filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    if (!PROOF_REQUIREMENT_KEYWORD.test(tokens[index])) continue;
    const before = tokens.slice(Math.max(0, index - 3), index);
    const after = tokens.slice(index + 1, index + 3);
    if (before.some((token) => PROOF_REQUIREMENT_NEGATORS.has(token)) || after.some((token) => PROOF_REQUIREMENT_NEGATORS.has(token))) {
      continue;
    }
    return true;
  }
  return false;
}

function stableProofPolicyHash(value: unknown): string {
  const text = stableJson(value ?? {});
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
