import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "./projectBoardTypes";
import {
  projectBoardProofCoverageDrift,
  projectBoardLatestProofCoverageRecheckEvent,
  projectBoardProofCoverageRecheck,
  projectBoardProofPolicyRequiresProofSpec,
  projectBoardProofSuggestionAppliedMetadataFromEvent,
} from "./projectBoardProofImpact";

describe("projectBoardProofCoverageRecheck", () => {
  it("recomputes proof coverage without model calls or card rewrites", () => {
    const board = boardWithCards([
      card({ id: "card-unit", title: "Parser", testPlan: { unit: ["Parser unit proof."], integration: [], visual: [], manual: [] } }),
      card({
        id: "card-visual",
        title: "Responsive layout",
        testPlan: { unit: [], integration: ["Run browser smoke."], visual: ["Capture desktop and mobile screenshots."], manual: [] },
      }),
      card({ id: "card-missing", title: "Animation polish" }),
      card({ id: "card-evidence", title: "Imported evidence", candidateStatus: "evidence" }),
    ]);

    const impact = projectBoardProofCoverageRecheck(board);

    expect(impact).toMatchObject({
      schemaVersion: 1,
      appliedAction: "recompute_proof_coverage",
      strict: true,
      eligibleCardCount: 3,
      missingProofCount: 1,
      unitProofItemCount: 1,
      integrationProofItemCount: 1,
      visualProofItemCount: 1,
      manualProofItemCount: 0,
      existingCardsRewritten: false,
      modelCallRequired: false,
    });
    expect(impact.missingProofCardIds).toEqual(["card-missing"]);
    expect(impact.eligibleCardIds).not.toContain("card-evidence");
    expect(impact.proofItemCountsByCardId).toMatchObject({
      "card-unit": 1,
      "card-visual": 2,
      "card-missing": 0,
    });
    expect(impact.proofPolicyHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("finds the newest persisted proof coverage recheck event", () => {
    const earlier = projectBoardProofCoverageRecheck(boardWithCards([card({ id: "card-old", title: "Old" })]));
    const later = projectBoardProofCoverageRecheck(
      boardWithCards([card({ id: "card-new", title: "New", testPlan: { unit: ["Proof."], integration: [], visual: [], manual: [] } })]),
    );
    const latest = projectBoardLatestProofCoverageRecheckEvent([
      event({ id: "event-old", createdAt: "2026-05-16T00:00:00.000Z", proofImpact: earlier }),
      event({ id: "event-new", createdAt: "2026-05-16T00:01:00.000Z", proofImpact: later }),
    ]);

    expect(latest?.event.id).toBe("event-new");
    expect(latest?.proofImpact.eligibleCardIds).toEqual(["card-new"]);
  });

  it("marks proof coverage stale when policy or proof shape changes with the same missing count", () => {
    const previous = projectBoardProofCoverageRecheck(
      boardWithCards([
        card({ id: "card-covered", title: "Covered", testPlan: { unit: ["Run parser proof."], integration: [], visual: [], manual: [] } }),
        card({ id: "card-missing", title: "Missing" }),
      ]),
    );
    const current = projectBoardProofCoverageRecheck({
      ...boardWithCards([
        card({ id: "card-covered", title: "Covered", testPlan: { unit: [], integration: ["Run browser proof."], visual: [], manual: [] } }),
        card({ id: "card-missing", title: "Missing" }),
      ]),
      charter: {
        testPolicy: {
          defaultProof: "Proof is recommended before ticketization.",
          requireProofSpec: false,
        },
      } as unknown as ProjectBoardSummary["charter"],
    });

    const drift = projectBoardProofCoverageDrift(current, previous);

    expect(drift).toMatchObject({
      stale: true,
      policyChanged: true,
      strictChanged: true,
      eligibleCardDelta: 0,
      missingProofDelta: 0,
      proofItemDelta: 0,
    });
    expect(drift.reasons).toEqual(expect.arrayContaining(["Proof policy changed.", "Strict proof gating is no longer active.", "Proof coverage moved between cards."]));
    expect(drift.affectedCardIds).toEqual(expect.arrayContaining(["card-covered", "card-missing"]));
    expect(drift.policyAffectedCardIds).toEqual(["card-covered", "card-missing"]);
    expect(drift.proofKindChangedCardIds).toEqual(["card-covered"]);
  });

  it("reports missing-proof additions and resolutions from the last proof baseline", () => {
    const previous = projectBoardProofCoverageRecheck(
      boardWithCards([
        card({ id: "card-a", title: "A" }),
        card({ id: "card-b", title: "B" }),
      ]),
    );
    const current = projectBoardProofCoverageRecheck(
      boardWithCards([
        card({ id: "card-a", title: "A", testPlan: { unit: ["Covered now."], integration: [], visual: [], manual: [] } }),
        card({ id: "card-c", title: "C" }),
      ]),
    );

    const drift = projectBoardProofCoverageDrift(current, previous);

    expect(drift).toMatchObject({
      stale: true,
      eligibleCardDelta: 0,
      missingProofDelta: -1,
      proofItemDelta: 1,
      affectedCardIds: ["card-c", "card-a", "card-b"],
      addedMissingProofCardIds: ["card-c"],
      resolvedMissingProofCardIds: ["card-a", "card-b"],
      proofKindChangedCardIds: ["card-a"],
      proofItemCountChangedCardIds: ["card-a"],
    });
  });

  it("identifies affected cards when proof item counts change without changing proof kind membership", () => {
    const previous = projectBoardProofCoverageRecheck(
      boardWithCards([
        card({ id: "card-a", title: "A", testPlan: { unit: ["One unit proof."], integration: [], visual: [], manual: [] } }),
      ]),
    );
    const current = projectBoardProofCoverageRecheck(
      boardWithCards([
        card({
          id: "card-a",
          title: "A",
          testPlan: { unit: ["One unit proof.", "Second unit proof."], integration: [], visual: [], manual: [] },
        }),
      ]),
    );

    const drift = projectBoardProofCoverageDrift(current, previous);

    expect(drift).toMatchObject({
      stale: true,
      proofItemDelta: 1,
      affectedCardIds: ["card-a"],
      proofKindChangedCardIds: [],
      proofItemCountChangedCardIds: ["card-a"],
    });
  });

  it("backfills proof item count metadata from older recheck events", () => {
    const previous = projectBoardProofCoverageRecheck(boardWithCards([card({ id: "card-a", title: "A" })]));
    const legacyEvent = event({
      id: "event-legacy",
      createdAt: "2026-05-16T00:02:00.000Z",
      proofImpact: { ...previous, proofItemCountsByCardId: undefined },
    });

    expect(projectBoardLatestProofCoverageRecheckEvent([legacyEvent])?.proofImpact.proofItemCountsByCardId).toEqual({});
  });

  it("parses proof suggestion impact events separately from deterministic rechecks", () => {
    const suggestionEvent = event({
      id: "event-suggest",
      createdAt: "2026-05-16T00:02:00.000Z",
      proofImpact: {
        schemaVersion: 1,
        appliedAction: "suggest_missing_proof",
        strict: true,
        targetCardIds: ["card-missing"],
        appliedCardIds: ["card-missing"],
        pendingPiUpdateCardIds: ["card-missing"],
        skippedCardIds: [],
        skippedReasons: {},
        appliedProofItemCount: 2,
        suggestedProofItemCount: 2,
        missingProofCountBefore: 1,
        missingProofCountAfter: 1,
        existingCardsRewritten: false,
        modelCallRequired: true,
        model: "test-pi",
      },
    });

    expect(projectBoardProofSuggestionAppliedMetadataFromEvent(suggestionEvent)).toMatchObject({
      appliedAction: "suggest_missing_proof",
      appliedCardIds: ["card-missing"],
      pendingPiUpdateCardIds: ["card-missing"],
      modelCallRequired: true,
    });
    expect(projectBoardLatestProofCoverageRecheckEvent([suggestionEvent])).toBeUndefined();
  });
});

describe("projectBoardProofPolicyRequiresProofSpec", () => {
  it("honors the explicit boolean", () => {
    expect(projectBoardProofPolicyRequiresProofSpec({ requireProofSpec: true })).toBe(true);
    expect(projectBoardProofPolicyRequiresProofSpec(undefined)).toBe(false);
    expect(projectBoardProofPolicyRequiresProofSpec({})).toBe(false);
  });

  it("detects affirmative proof requirements in prose", () => {
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Each card must include proof of work." })).toBe(true);
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Automated tests are required before review." })).toBe(true);
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Every change needs a screenshot." })).toBe(true);
  });

  it("does not treat negated requirements as strict gating", () => {
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Automated tests are not required for this prototype." })).toBe(false);
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Cards must not include proof artifacts." })).toBe(false);
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "No proof needed for spike cards." })).toBe(false);
    expect(projectBoardProofPolicyRequiresProofSpec({ defaultProof: "Proof isn't required here." })).toBe(false);
  });

  it("keeps strict gating when an affirmative requirement coexists with a negated one", () => {
    expect(
      projectBoardProofPolicyRequiresProofSpec({
        defaultProof: "Integration proof is required; visual screenshots are not required.",
      }),
    ).toBe(true);
  });
});

function boardWithCards(cards: ProjectBoardCard[]): Pick<ProjectBoardSummary, "cards" | "charter"> {
  return {
    cards,
    charter: {
      testPolicy: {
        defaultProof: "Proof is required before ticketization.",
        requireProofSpec: true,
      },
    } as unknown as ProjectBoardSummary["charter"],
  };
}

function card(input: Partial<ProjectBoardCard> & Pick<ProjectBoardCard, "id" | "title">): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId ?? "board-proof",
    title: input.title,
    description: input.description ?? "Implement this card.",
    status: input.status ?? "draft",
    candidateStatus: input.candidateStatus ?? "ready_to_create",
    priority: input.priority,
    phase: input.phase,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? ["Acceptance condition exists."],
    testPlan: input.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: input.sourceKind ?? "board_synthesis",
    sourceId: input.sourceId ?? "source-proof",
    sourceRefs: input.sourceRefs,
    clarificationQuestions: input.clarificationQuestions,
    clarificationAnswers: input.clarificationAnswers,
    objectiveProvenance: input.objectiveProvenance,
    sourceThreadId: input.sourceThreadId,
    sourceMessageId: input.sourceMessageId,
    orchestrationTaskId: input.orchestrationTaskId,
    executionThreadId: input.executionThreadId,
    executionSessionPolicy: input.executionSessionPolicy,
    proofReview: input.proofReview,
    splitOutcome: input.splitOutcome,
    claim: input.claim,
    claimConflicts: input.claimConflicts,
    userTouchedFields: input.userTouchedFields,
    userTouchedAt: input.userTouchedAt,
    pendingPiUpdate: input.pendingPiUpdate,
    createdAt: input.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-16T00:00:00.000Z",
  };
}

function event(input: {
  id: string;
  createdAt: string;
  proofImpact: unknown;
}): ProjectBoardEvent {
  return {
    id: input.id,
    boardId: "board-proof",
    kind: "card_updated",
    title: "Proof coverage rechecked",
    summary: "Proof coverage rechecked.",
    entityKind: "project_board",
    entityId: "board-proof",
    metadata: { proofImpact: input.proofImpact },
    createdAt: input.createdAt,
  };
}

describe("projectBoardProofCoverageRecheckMetadataFromEvent", () => {
  it("derives missing numeric counts from the validated arrays instead of producing NaN drift", () => {
    const current = projectBoardProofCoverageRecheck(
      boardWithCards([card({ id: "card-a", title: "A", testPlan: { unit: ["Proof."], integration: [], visual: [], manual: [] } })]),
    );
    const partialEvent = event({
      id: "event-partial",
      createdAt: "2026-05-16T00:00:00.000Z",
      proofImpact: {
        schemaVersion: 1,
        appliedAction: "recompute_proof_coverage",
        strict: true,
        eligibleCardIds: ["card-a", "card-b"],
        missingProofCardIds: ["card-b"],
        unitCardIds: ["card-a"],
        integrationCardIds: [],
        visualCardIds: [],
        manualCardIds: [],
        // numeric count fields intentionally missing (legacy/partial persistence)
      },
    });

    const parsed = projectBoardLatestProofCoverageRecheckEvent([partialEvent]);
    expect(parsed?.proofImpact).toMatchObject({
      eligibleCardCount: 2,
      missingProofCount: 1,
      unitProofItemCount: 1,
      integrationProofItemCount: 0,
    });

    const drift = projectBoardProofCoverageDrift(current, parsed!.proofImpact);
    expect(Number.isNaN(drift.proofItemDelta)).toBe(false);
    expect(drift.reasons.join(" ")).not.toContain("NaN");
  });
});
