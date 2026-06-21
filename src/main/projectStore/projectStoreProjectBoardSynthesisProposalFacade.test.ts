import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board synthesis proposal facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("stores large source-scoped synthesis batches without truncating rich design docs to 24 cards", () => {
    const board = store.createProjectBoard({ title: "Large design doc board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Source-scoped elaboration from a large game design document.",
      goal: "Decompose the selected design document into source-grounded candidate cards.",
      currentState: "A rich spec contains more than two dozen distinct systems.",
      targetUser: "Project manager reviewing generated implementation cards.",
      qualityBar: "Every generated card carries proof expectations.",
      assumptions: ["The selected source is authoritative for this elaboration pass."],
      questions: [],
      sourceNotes: ["GAME_DESIGN_DOCUMENT.md is the selected source scope."],
      cards: Array.from({ length: 36 }, (_, index) => ({
        sourceId: `synthesis:design-system-${index + 1}`,
        title: `Implement design system ${index + 1}`,
        description: `Create a self-contained slice for design system ${index + 1}.`,
        candidateStatus: "needs_clarification",
        priority: index + 1,
        phase: index < 12 ? "Foundation" : index < 24 ? "Gameplay" : "Polish",
        labels: ["source-scoped", "game-design"],
        blockedBy: index === 0 ? [] : [`synthesis:design-system-${index}`],
        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
        acceptanceCriteria: [`Design system ${index + 1} has observable behavior.`],
        testPlan: {
          unit: [`Unit proof for design system ${index + 1}.`],
          integration: [],
          visual: index % 3 === 0 ? [`Visual proof for design system ${index + 1}.`] : [],
          manual: [],
        },
      })),
    };

    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft);

    expect(synthesized.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(36);
    expect(synthesized.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({ cardIds: expect.arrayContaining([synthesized.cards[35].id]) }),
    });
  });

  it("stores Pi synthesis as a reviewable proposal before applying draft cards", () => {
    const board = store.createProjectBoard({ title: "Proposal board" });
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Live Pi spaceship synthesis.",
      goal: "Build a WebGL spaceship game with clear project-manager decomposition.",
      currentState: "Architecture notes and rough planning artifacts exist.",
      targetUser: "Browser game player.",
      qualityBar: "Each card needs acceptance criteria and at least one runnable proof expectation.",
      assumptions: ["Use Three.js for the initial rendering stack."],
      questions: ["Should the first control model be arcade movement or inertia-based thrust?"],
      sourceNotes: ["docs/architecture.md describes Three.js rendering and keyboard controls."],
      cards: [
        {
          sourceId: "synthesis:render-shell",
          title: "Create render shell",
          description: "Mount a nonblank WebGL canvas and isolate render-loop setup.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["webgl"],
          blockedBy: [],
          acceptanceCriteria: ["Canvas renders a visible scene."],
          testPlan: { unit: ["Test render-loop helpers."], integration: ["Mount the game scene."], visual: [], manual: [] },
          sourceRefs: ["docs/architecture.md"],
          clarificationQuestions: ["Should the shell use Three.js or PixiJS?"],
          objectiveProvenance: {
            objective: "Add accessibility follow-up cards.",
            groundingMode: "source_scan",
            selectedSourceIds: [],
            sourceRefCount: 1,
            weakGrounding: false,
          },
        },
        {
          sourceId: "synthesis:controls",
          title: "Add ship controls",
          description: "Translate keyboard input into ship motion.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:render-shell"],
          acceptanceCriteria: ["Ship responds to keyboard movement."],
          testPlan: { unit: ["Test input reducer."], integration: [], visual: [], manual: ["Play one movement pass."] },
          sourceRefs: ["docs/architecture.md"],
          clarificationQuestions: ["Should controls be arcade or inertia based?"],
          objectiveProvenance: {
            objective: "Add accessibility follow-up cards.",
            groundingMode: "selected_sources",
            selectedSourceIds: ["source-architecture"],
            sourceRefCount: 1,
            weakGrounding: false,
          },
        },
        {
          sourceId: "synthesis:visual-polish",
          title: "Add visual polish",
          description: "Add particle effects after the core slice is working.",
          candidateStatus: "needs_clarification",
          priority: 3,
          phase: "Polish",
          labels: ["polish"],
          blockedBy: ["synthesis:controls"],
          acceptanceCriteria: ["Deferred polish does not block the first playable slice."],
          testPlan: { unit: [], integration: [], visual: ["Inspect particles."], manual: [] },
          sourceRefs: ["TODO.md"],
        },
        {
          sourceId: "synthesis:boss",
          title: "Prototype boss encounter",
          description: "Explore a boss encounter after MVP proof.",
          candidateStatus: "needs_clarification",
          priority: 4,
          phase: "Later",
          labels: ["later"],
          blockedBy: ["synthesis:controls"],
          acceptanceCriteria: ["Boss scope is explicitly rejected for MVP."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Review scope decision."] },
          sourceRefs: ["TODO.md"],
        },
      ],
    };
    const mergeTarget = store.createProjectBoardManualCard({
      boardId: board.id,
      title: "Existing controls draft",
      description: "Earlier manual card for controls.",
    });

    const proposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: synthesisDraft,
      model: "zai-org/GLM-5.1-FP8",
      durationMs: 1234,
    });
    const proposalRun = store.createProjectBoardSynthesisRun({
      boardId: board.id,
      model: "zai-org/GLM-5.1-FP8",
    });
    store.recordProjectBoardSynthesisRunEvent(proposalRun.id, {
      stage: "proposal_created",
      title: "Created PM Review proposal",
      summary: "Created the review proposal that will later be applied to the draft board.",
      proposalId: proposal.id,
      status: "succeeded",
      cardCount: synthesisDraft.cards.length,
      questionCount: synthesisDraft.questions.length,
      completedAt: "2026-05-17T12:00:00.000Z",
    });
    let summary = store.getActiveProjectBoard()!;

    expect(proposal).toMatchObject({
      status: "pending",
      model: "zai-org/GLM-5.1-FP8",
      durationMs: 1234,
      summary: "Live Pi spaceship synthesis.",
    });
    expect(summary.proposals).toHaveLength(1);
    expect(summary.proposals[0]).toMatchObject({ id: proposal.id, cards: expect.arrayContaining([expect.objectContaining({ sourceId: "synthesis:render-shell" })]) });
    expect(summary.cards.filter((card) => card.sourceKind === "board_synthesis")).toHaveLength(0);
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_created",
      entityId: proposal.id,
      metadata: expect.objectContaining({ cardCount: 4, durationMs: 1234 }),
    });

    const answered = store.answerProjectBoardSynthesisProposalQuestion({
      proposalId: proposal.id,
      questionIndex: 0,
      answer: "Use arcade movement for the first playable slice; defer inertia until later.",
    });
    expect(answered.answers).toEqual([
      expect.objectContaining({
        questionIndex: 0,
        question: "Should the first control model be arcade movement or inertia-based thrust?",
        answer: "Use arcade movement for the first playable slice; defer inertia until later.",
      }),
    ]);
    summary = store.getActiveProjectBoard()!;
    expect(summary.proposals[0].answers).toHaveLength(1);
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_answered",
      entityId: proposal.id,
      metadata: expect.objectContaining({ questionIndex: 0 }),
    });
    expect(() => store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id })).toThrow("Review every proposal card before applying accepted cards.");

    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:render-shell",
      reviewStatus: "accepted",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:controls",
      reviewStatus: "merged",
      mergeTargetCardId: mergeTarget.id,
      reason: "Merge with existing controls draft.",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:visual-polish",
      reviewStatus: "deferred",
      reason: "Keep for later polish pass.",
    });
    const reviewed = store.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "synthesis:boss",
      reviewStatus: "rejected",
      reason: "Boss scope is out of MVP.",
    });
    expect(reviewed.cards.map((card) => [card.sourceId, card.reviewStatus])).toEqual([
      ["synthesis:render-shell", "accepted"],
      ["synthesis:controls", "merged"],
      ["synthesis:visual-polish", "deferred"],
      ["synthesis:boss", "rejected"],
    ]);

    summary = store.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });
    expect(summary.proposals[0]).toMatchObject({ id: proposal.id, status: "applied", appliedAt: expect.any(String) });
    expect(summary.cards.filter((card) => card.sourceKind === "board_synthesis").map((card) => card.sourceId)).toEqual([
      "synthesis:render-shell",
    ]);
    expect(summary.cards.find((card) => card.sourceId === "synthesis:render-shell")).toMatchObject({
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Should the shell use Three.js or PixiJS?"],
      objectiveProvenance: expect.objectContaining({
        objective: "Add accessibility follow-up cards.",
        groundingMode: "source_scan",
      }),
    });
    expect(summary.cards.find((card) => card.id === mergeTarget.id)).toMatchObject({
      title: "Add ship controls",
      blockedBy: ["synthesis:render-shell"],
      acceptanceCriteria: ["Ship responds to keyboard movement."],
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: ["Should controls be arcade or inertia based?"],
      objectiveProvenance: expect.objectContaining({
        objective: "Add accessibility follow-up cards.",
        groundingMode: "selected_sources",
      }),
    });
    expect(summary.cards.map((card) => card.sourceId)).not.toEqual(expect.arrayContaining(["synthesis:visual-polish", "synthesis:boss"]));
    expect(summary.events?.map((event) => event.kind).slice(0, 2)).toEqual(["synthesis_proposal_applied", "board_synthesized"]);
    expect(summary.events?.[0].metadata).toMatchObject({
      acceptedSourceIds: ["synthesis:render-shell"],
      mergedSourceIds: ["synthesis:controls"],
      deferredSourceIds: ["synthesis:visual-polish"],
      rejectedSourceIds: ["synthesis:boss"],
      planningSnapshotRunId: proposalRun.id,
      planningSnapshotKind: "final",
      planningSnapshotCardIds: [summary.cards.find((card) => card.sourceId === "synthesis:render-shell")?.id],
    });
    expect(store.getProjectBoardSynthesisRun(proposalRun.id)?.planningSnapshots?.at(-1)).toMatchObject({
      kind: "final",
      planningStatus: "succeeded",
      cardIds: [summary.cards.find((card) => card.sourceId === "synthesis:render-shell")?.id],
    });

    const nextProposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: { ...synthesisDraft, summary: "Replacement Pi proposal." },
    });
    const nextSummary = store.getActiveProjectBoard()!;
    expect(nextSummary.proposals.find((candidate) => candidate.id === nextProposal.id)?.status).toBe("pending");
    expect(nextSummary.proposals.find((candidate) => candidate.id === proposal.id)?.status).toBe("applied");
  });

  it("applies additive synthesis proposals after ticketization without rewriting protected Local Task cards", () => {
    const board = store.createProjectBoard({ title: "Add Cards after ticketization board" });
    const initialDraft: ProjectBoardSynthesisDraft = {
      summary: "Initial recipe index snapshot.",
      goal: "Build a recipe index from markdown sources.",
      currentState: "Core recipe markdown exists.",
      targetUser: "Home cook.",
      qualityBar: "Every executable card must include local verification.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Core recipe index source is authoritative."],
      cards: [
        {
          sourceId: "synthesis:recipe-index-core",
          title: "Build the recipe index core",
          description: "Scan recipe markdown and generate a deterministic INDEX.md.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["recipe-index"],
          blockedBy: [],
          acceptanceCriteria: ["INDEX.md includes every recipe title."],
          testPlan: { unit: ["Run node --check build-index.mjs."], integration: ["Run node build-index.mjs."], visual: [], manual: [] },
          sourceRefs: ["docs/recipe-index-core.md"],
        },
      ],
    };

    const initial = store.applyProjectBoardSynthesis(board.id, initialDraft, { replaceExistingDraft: true, insertQuestions: false });
    const core = initial.cards.find((card) => card.sourceId === "synthesis:recipe-index-core")!;
    const ticketized = store.approveProjectBoardCard(core.id);
    const taskBefore = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(ticketized).toMatchObject({
      id: core.id,
      status: "ready",
      title: "Build the recipe index core",
      orchestrationTaskId: expect.any(String),
    });

    const additiveProposal = store.createProjectBoardSynthesisProposal({
      boardId: board.id,
      synthesis: {
        summary: "Add mobile sharing cards.",
        goal: initialDraft.goal,
        currentState: "The recipe index core has already been ticketized.",
        targetUser: initialDraft.targetUser,
        qualityBar: initialDraft.qualityBar,
        assumptions: [],
        questions: [],
        sourceNotes: ["New source docs/recipe-index-mobile-share.md adds shopping-list export and share-card scope."],
        cards: [
          {
            sourceId: "synthesis:recipe-shopping-list-export",
            title: "Add shopping-list export to recipe index",
            description: "Generate a shareable shopping-list view from selected recipes without changing the existing core Local Task.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Add Cards",
            labels: ["recipe-index", "sharing"],
            blockedBy: ["synthesis:recipe-index-core"],
            acceptanceCriteria: ["A proposed card captures shopping-list export scope as additive work."],
            testPlan: { unit: ["Validate export data shape."], integration: [], visual: [], manual: ["Review export copy."] },
            sourceRefs: ["docs/recipe-index-mobile-share.md"],
          },
        ],
      },
      model: "test-model",
    });
    store.reviewProjectBoardSynthesisProposalCard({
      proposalId: additiveProposal.id,
      sourceId: "synthesis:recipe-shopping-list-export",
      reviewStatus: "accepted",
    });

    const summary = store.applyProjectBoardSynthesisProposal({ proposalId: additiveProposal.id, replaceExistingDraft: true });
    const protectedCore = summary.cards.find((card) => card.id === ticketized.id)!;
    const additive = summary.cards.find((card) => card.sourceId === "synthesis:recipe-shopping-list-export")!;

    expect(protectedCore).toMatchObject({
      id: ticketized.id,
      sourceId: "synthesis:recipe-index-core",
      title: "Build the recipe index core",
      description: "Scan recipe markdown and generate a deterministic INDEX.md.",
      status: "ready",
      orchestrationTaskId: ticketized.orchestrationTaskId,
      acceptanceCriteria: ["INDEX.md includes every recipe title."],
    });
    expect(additive).toMatchObject({
      status: "draft",
      orchestrationTaskId: undefined,
      blockedBy: ["synthesis:recipe-index-core"],
      sourceRefs: ["docs/recipe-index-mobile-share.md"],
    });
    expect(summary.cards.filter((card) => Boolean(card.orchestrationTaskId))).toHaveLength(1);
    expect(store.getOrchestrationTask(ticketized.orchestrationTaskId!)).toEqual(taskBefore);
    expect(summary.proposals.find((proposal) => proposal.id === additiveProposal.id)).toMatchObject({ status: "applied" });
    expect(summary.events?.[0]).toMatchObject({
      kind: "synthesis_proposal_applied",
      metadata: expect.objectContaining({
        acceptedSourceIds: ["synthesis:recipe-shopping-list-export"],
      }),
    });
  });

});
