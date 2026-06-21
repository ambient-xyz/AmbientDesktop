import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board PM review proposal facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists lightweight PM review reports without generated cards", () => {
    const board = store.createProjectBoard({ title: "Lightweight PM review board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Charter review needs one answer.",
      goal: "Build a focused editor.",
      currentState: "Kickoff answers and source scan are available.",
      targetUser: "Desktop note taker.",
      qualityBar: "Every later generated card needs proof.",
      assumptions: ["The active charter is the source of truth."],
      questions: ["Should offline sync be in scope for v1?"],
      sourceNotes: ["Authority: PRD outranks scratch notes."],
      cards: [],
    };
    const reviewReport = {
      readiness: "needs_answers" as const,
      summary: "The charter is mostly coherent, but one product-scope question blocks confident card generation.",
      sourceConfidence: "medium" as const,
      sourceConfidenceNotes: ["The PRD is primary, but scratch TODO scope conflicts remain."],
      gitState: "git_ready" as const,
      gitStateNotes: ["Board artifacts can be coordinated through Git."],
      blockingQuestions: ["Should offline sync be in scope for v1?"],
      risks: ["Offline sync would change persistence and test strategy."],
      sourceConflicts: ["Scratch TODO mentions cloud sync, but the PRD says local-first."],
      sourceAuthorityNotes: ["Treat the PRD as primary and scratch TODO as context."],
      recommendedActivationScope: "Answer the sync scope question, then generate the draft board from the recommendation.",
      cardGenerationConstraints: ["Do not generate sync cards unless the user explicitly includes offline sync."],
    };

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: synthesisDraft,
      reviewReport,
      model: "test-model",
    });

    expect(proposal.cards).toEqual([]);
    expect(proposal.reviewReport).toEqual(reviewReport);
    expect(proposal.questions).toEqual(["Should offline sync be in scope for v1?"]);
    expect(() => store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id })).toThrow(
      "Lightweight PM review reports do not apply cards.",
    );

    const summary = store.getActiveProjectBoard()!;
    expect(summary.proposals[0]).toMatchObject({
      id: proposal.id,
      reviewReport,
      cards: [],
    });
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      title: "Pi charter review ready",
      metadata: expect.objectContaining({ reviewReport: true, readiness: "needs_answers", cardCount: 0 }),
    });
  });

  it("updates pending synthesis proposals while preserving still-current card reviews", () => {
    const board = store.createProjectBoard({ title: "Progressive proposal board" });
    const initialDraft: ProjectBoardSynthesisDraft = {
      summary: "Initial partial synthesis.",
      goal: "Decompose a spaceship game.",
      currentState: "Sources have started streaming.",
      targetUser: "Player.",
      qualityBar: "Proof required.",
      assumptions: ["Use the source corpus."],
      questions: ["Which camera behavior is canonical?"],
      sourceNotes: ["First source section covered."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Create the game shell.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          acceptanceCriteria: ["Shell mounts."],
          testPlan: { unit: ["Test shell helpers."], integration: [], visual: [], manual: [] },
          sourceRefs: ["gdd.md#shell"],
        },
        {
          sourceId: "synthesis:controls",
          title: "Create controls",
          description: "Create the first control model.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          acceptanceCriteria: ["Ship moves."],
          testPlan: { unit: ["Test controls reducer."], integration: [], visual: [], manual: [] },
          sourceRefs: ["gdd.md#controls"],
        },
      ],
    };
    const proposal = store.createProjectBoardSynthesisProposal({ boardId: board.id, synthesis: initialDraft, model: "test-model" });
    store.reviewProjectBoardSynthesisProposalCard({ proposalId: proposal.id, sourceId: "synthesis:shell", reviewStatus: "accepted" });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:controls",
      reviewStatus: "deferred",
      reason: "Wait for physics details.",
    });

    const updated = store.updateProjectBoardSynthesisProposal({
      proposalId: proposal.id,
      model: "test-model",
      durationMs: 2500,
      synthesis: {
        ...initialDraft,
        summary: "Updated progressive synthesis.",
        questions: ["Which camera behavior is canonical?", "Should dodge be a separate card?"],
        cards: [
          initialDraft.cards[0],
          {
            ...initialDraft.cards[1],
            description: "Create the first control model with hybrid Newtonian thrust.",
            acceptanceCriteria: ["Ship moves.", "Compensation jets counter overshoot."],
          },
          {
            sourceId: "synthesis:enemy-wave",
            title: "Add enemy wave",
            description: "Add the first enemy encounter.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Gameplay",
            labels: ["combat"],
            blockedBy: ["synthesis:controls"],
            acceptanceCriteria: ["Enemy wave spawns."],
            testPlan: { unit: [], integration: ["Run one encounter."], visual: [], manual: [] },
            sourceRefs: ["gdd.md#enemies"],
          },
        ],
      },
    });

    expect(updated).toMatchObject({ id: proposal.id, summary: "Updated progressive synthesis.", durationMs: 2500 });
    expect(updated.questions).toHaveLength(2);
    expect(updated.cards.map((card) => [card.sourceId, card.reviewStatus, card.reviewReason])).toEqual([
      ["synthesis:shell", "accepted", undefined],
      ["synthesis:controls", "pending", undefined],
      ["synthesis:enemy-wave", "pending", undefined],
    ]);
    expect(store.getActiveProjectBoard()?.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      title: "Pi synthesis proposal updated",
      metadata: expect.objectContaining({ progressiveUpdate: true, cardCount: 3 }),
    });
  });

});
