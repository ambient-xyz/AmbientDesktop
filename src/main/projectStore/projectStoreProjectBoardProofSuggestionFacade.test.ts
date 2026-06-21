import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board proof suggestion facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("records deterministic proof coverage rechecks in the board ledger", () => {
    const board = store.createProjectBoard({ title: "Proof coverage board" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Proof coverage smoke.",
        goal: "Track proof coverage deterministically.",
        currentState: "Two cards are ready for proof review.",
        targetUser: "PM reviewer.",
        qualityBar: "Coverage counts are auditable.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "proof:covered",
            title: "Covered proof card",
            description: "Has unit proof expectations.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Unit proof exists."],
            testPlan: { unit: ["Run the unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "proof:missing",
            title: "Missing proof card",
            description: "Needs proof expectations before strict dispatch.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Proof gap is visible."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false },
    );

    const rechecked = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const event = [...(rechecked.events ?? [])].reverse().find((candidate) => candidate.title === "Proof coverage rechecked");

    expect(event).toMatchObject({
      kind: "card_updated",
      summary: expect.stringContaining("0 model calls"),
      entityKind: "project_board",
      entityId: board.id,
    });
    expect(event?.metadata.proofImpact).toMatchObject({
      schemaVersion: 1,
      appliedAction: "recompute_proof_coverage",
      eligibleCardCount: 2,
      missingProofCount: 1,
      missingProofCardIds: [expect.any(String)],
      unitProofItemCount: 1,
      affectedCardIds: [],
      staleSinceLastRecheck: false,
      driftReasons: ["No proof coverage baseline has been recorded yet."],
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
    expect(event?.metadata.proofImpact).not.toHaveProperty("driftBaselineEventId");
    expect(rechecked.cards.map((card) => card.title)).toEqual(["Covered proof card", "Missing proof card"]);

    const missingProofCard = rechecked.cards.find((card) => card.title === "Missing proof card")!;
    store.updateProjectBoardCard({
      cardId: missingProofCard.id,
      testPlan: { unit: [], integration: [], visual: ["Capture the proof-gap repair screenshot."], manual: [] },
    });

    const driftRechecked = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const driftEvent = [...(driftRechecked.events ?? [])].reverse().find((candidate) => candidate.title === "Proof coverage rechecked" && candidate.id !== event?.id);

    expect(driftEvent?.summary).toContain("1 affected card since last recheck");
    expect(driftEvent?.metadata.proofImpact).toMatchObject({
      appliedAction: "recompute_proof_coverage",
      driftBaselineEventId: event?.id,
      staleSinceLastRecheck: true,
      affectedCardIds: [missingProofCard.id],
      resolvedMissingProofCardIds: [missingProofCard.id],
      proofKindChangedCardIds: [missingProofCard.id],
      proofItemCountChangedCardIds: [missingProofCard.id],
      missingProofCount: 0,
      visualProofItemCount: 1,
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
  });

  it("stages proof suggestions as reviewable Pi updates only on missing-proof draft cards", () => {
    const board = store.createProjectBoard({ title: "Proof suggestion board" });
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "test-pi" });
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Proof suggestion smoke.",
        goal: "Fill missing proof expectations without rewriting approved specs.",
        currentState: "One card is already ticketized and one card is still a draft.",
        targetUser: "PM reviewer.",
        qualityBar: "Only draft cards receive generated proof expectations.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "proof:ticketized",
            title: "Already ticketized card",
            description: "This card should not be rewritten after approval.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Ticketized scope remains unchanged."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
          {
            sourceId: "proof:draft",
            title: "Draft card missing proof",
            description: "This card needs generated proof expectations.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Proof",
            labels: [],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["Proof suggestion is visible."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false, snapshotRunId: synthesisRun.id, snapshotKind: "incremental" },
    );
    const ticketizedDraft = synthesized.cards.find((card) => card.sourceId === "proof:ticketized")!;
    const draft = synthesized.cards.find((card) => card.sourceId === "proof:draft")!;
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof suggestion planning snapshot",
      summary: "The proof suggestion board has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: synthesized.cards.length,
      questionCount: 0,
      completedAt: "2026-05-17T12:01:00.000Z",
    });
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);

    const next = store.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds: [ticketized.id, draft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1200, responseCharCount: 300, requestDurationMs: 42 },
      fallbackUsed: true,
      providerError: "GMI stream stalled before content.",
      suggestions: [
        {
          cardId: ticketized.id,
          proofOwnership: "integration",
          confidence: "high",
          rationale: "Should be skipped because it is already approved.",
          testPlan: { unit: [], integration: ["Do not apply this to approved cards."], visual: [], manual: [] },
        },
        {
          cardId: draft.id,
          proofOwnership: "visible_surface",
          confidence: "high",
          rationale: "Draft card needs visible proof expectations.",
          testPlan: {
            unit: [],
            integration: ["Run a browser smoke check for the proof card."],
            visual: ["Capture desktop and mobile screenshots for the proof card."],
            manual: [],
          },
        },
      ],
    });

    expect(ticketized.id).toBe(ticketizedDraft.id);
    expect(next.cards.find((card) => card.id === ticketized.id)?.testPlan).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    const stagedDraft = next.cards.find((card) => card.id === draft.id)!;
    expect(stagedDraft.testPlan).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    expect(stagedDraft.pendingPiUpdate).toMatchObject({
      sourceId: "proof:test-pi",
      changedFields: ["testPlan"],
      testPlan: {
        integration: ["Run a browser smoke check for the proof card."],
        visual: ["Capture desktop and mobile screenshots for the proof card."],
      },
    });
    const applied = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(applied).toMatchObject({
      pendingPiUpdate: undefined,
      testPlan: {
        integration: ["Run a browser smoke check for the proof card."],
        visual: ["Capture desktop and mobile screenshots for the proof card."],
      },
      userTouchedFields: expect.arrayContaining(["testPlan"]),
    });
    const event = (next.events ?? []).find((candidate) => candidate.title === "Proof expectations suggested");
    const proofImpact = event?.metadata.proofImpact as { skippedReasons: Record<string, string> } | undefined;
    expect(proofImpact).toMatchObject({
      schemaVersion: 1,
      appliedAction: "suggest_missing_proof",
      targetCardIds: [ticketized.id, draft.id],
      appliedCardIds: [draft.id],
      pendingPiUpdateCardIds: [draft.id],
      skippedCardIds: [ticketized.id],
      existingCardsRewritten: false,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 1200,
      responseCharCount: 300,
      fallbackUsed: true,
      providerError: "GMI stream stalled before content.",
    });
    expect(proofImpact?.skippedReasons[ticketized.id]).toContain("approved card specs were not rewritten");
    expect((next.events ?? []).find((candidate) => candidate.title === "Proof Pi update available")?.metadata).toMatchObject({
      cardId: draft.id,
      changedFields: ["testPlan"],
      protectedPiUpdate: true,
      modelCallRequired: true,
    });
  });
});
