import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board incremental synthesis facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("persists expert clarification suggestions and keeps them through answered decisions", () => {
    const board = store.createProjectBoard({ title: "Suggestion board" });
    const synthesized = store.applyProjectBoardSynthesis(board.id, {
      summary: "Calculator board.",
      goal: "Build a calculator.",
      currentState: "Durable plan exists.",
      targetUser: "Calculator users.",
      qualityBar: "Unit proof required.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:keyboard-input",
          title: "Implement keyboard input",
          description: "Handle calculator keyboard input.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["input"],
          blockedBy: [],
          sourceRefs: ["plan.html"],
          clarificationQuestions: ["Should numpad operators map directly to calculator operators?"],
          clarificationSuggestions: [
            {
              question: "Should numpad operators map directly to calculator operators?",
              suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
              rationale: "This is standard calculator behavior and is safe as an implementation default.",
              confidence: "high",
              safeToAccept: true,
              questionKind: "expert_default",
            },
          ],
          acceptanceCriteria: ["Numpad operators can be entered from the keyboard."],
          testPlan: { unit: ["Input mapping tests."], integration: [], visual: [], manual: [] },
        },
      ],
    });

    const card = synthesized.cards[0];
    expect(card.clarificationSuggestions).toEqual([
      expect.objectContaining({
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(card.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
        suggestedAnswer: "Map numpad operators directly to matching calculator operators.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);

    const answered = store.updateProjectBoardCard({
      cardId: card.id,
      clarificationQuestions: [],
      clarificationAnswers: [
        {
          question: "Should numpad operators map directly to calculator operators?",
          answer: "Map numpad operators directly to matching calculator operators.",
          answeredAt: new Date().toISOString(),
        },
      ],
    });

    expect(answered.clarificationSuggestions?.[0]?.suggestedAnswer).toBe("Map numpad operators directly to matching calculator operators.");
    expect(answered.clarificationAnswers?.[0]?.answer).toBe("Map numpad operators directly to matching calculator operators.");
    expect(answered.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "answered",
        answer: "Map numpad operators directly to matching calculator operators.",
      }),
    ]);
  });

  it("preserves ticketized first ready card while later incremental synthesis batches replace draft cards", () => {
    const board = store.createProjectBoard({ title: "Incremental board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First incremental batch.",
      goal: "Build an incremental spaceship board.",
      currentState: "Pi has emitted the first small batch.",
      targetUser: "Browser game prototype developer.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["GDD section one produced a ready foundation card."],
      cards: [
        {
          sourceId: "synthesis:game-shell",
          title: "Create game shell",
          description: "Create the app shell and nonblank canvas.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: ["GAME_DESIGN_DOCUMENT.md#shell"],
          acceptanceCriteria: ["Canvas renders a nonblank scene."],
          testPlan: { unit: ["Unit proof."], integration: ["Run app."], visual: [], manual: [] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:game-shell");
    expect(shell).toBeTruthy();
    const ticketized = store.approveProjectBoardCard(shell!.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });

    const secondBatch = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Second incremental batch.",
        cards: [
          firstBatch.cards[0],
          {
            sourceId: "synthesis:ship-controls",
            title: "Implement ship controls",
            description: "Use the shell to add keyboard controls.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Core Gameplay",
            labels: ["controls"],
            blockedBy: ["synthesis:game-shell"],
            sourceRefs: ["GAME_DESIGN_DOCUMENT.md#controls"],
            acceptanceCriteria: ["Keyboard input moves the ship."],
            testPlan: { unit: ["Input reducer proof."], integration: [], visual: [], manual: ["Play one movement pass."] },
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(secondBatch.cards.filter((card) => card.sourceId === "synthesis:game-shell")).toHaveLength(1);
    expect(secondBatch.cards.find((card) => card.sourceId === "synthesis:game-shell")).toMatchObject({
      id: ticketized.id,
      status: "ready",
      orchestrationTaskId: ticketized.orchestrationTaskId,
    });
    expect(secondBatch.cards.find((card) => card.sourceId === "synthesis:ship-controls")).toMatchObject({
      status: "draft",
      candidateStatus: "ready_to_create",
      blockedBy: ["synthesis:game-shell"],
    });
  });

  it("updates matching replaceable synthesis drafts in place during replacement passes", () => {
    const board = store.createProjectBoard({ title: "Stable draft identity board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "First card draft.",
      goal: "Build a stable draft board.",
      currentState: "Pi emitted the first candidate.",
      targetUser: "Project manager answering clarifications.",
      qualityBar: "Every card needs proof.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial source pass."],
      cards: [
        {
          sourceId: "synthesis:renderer-choice",
          title: "Choose renderer",
          description: "Decide whether the game should use Canvas 2D or Three.js.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["rendering"],
          blockedBy: [],
          sourceRefs: ["GDD.md#renderer"],
          clarificationQuestions: ["Should the project use Canvas 2D or Three.js?"],
          acceptanceCriteria: ["Renderer choice is explicit."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Review renderer choice."] },
        },
      ],
    };

    const first = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const original = first.cards.find((card) => card.sourceId === "synthesis:renderer-choice");
    expect(original).toBeTruthy();

    const second = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Refined card draft.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Establish rendering substrate",
            description: "Resolve Canvas 2D versus Three.js before downstream visual cards are created.",
            candidateStatus: "ready_to_create",
            labels: ["rendering", "architecture"],
            acceptanceCriteria: ["The selected renderer is documented.", "Downstream rendering cards depend on the chosen substrate."],
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    const updated = second.cards.find((card) => card.sourceId === "synthesis:renderer-choice");
    expect(updated).toMatchObject({
      id: original!.id,
      title: "Establish rendering substrate",
      description: "Resolve Canvas 2D versus Three.js before downstream visual cards are created.",
      candidateStatus: "ready_to_create",
      labels: ["rendering", "architecture"],
      acceptanceCriteria: ["The selected renderer is documented.", "Downstream rendering cards depend on the chosen substrate."],
    });
    expect(second.cards.filter((card) => card.sourceId === "synthesis:renderer-choice")).toHaveLength(1);
    expect(second.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        cardIds: [],
        updatedCardIds: [original!.id],
        appliedCardIds: [original!.id],
        replacedDraftCardCount: 0,
        updatedDraftCardCount: 1,
        preservedDraftCardIds: [original!.id],
        preservedDraftCardCount: 1,
      }),
    });
  });

  it("supersedes untouched synthesis drafts and namespaces fresh Start Fresh cards", () => {
    const board = store.createProjectBoard({ title: "Start Fresh board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "Paused planning batch.",
      goal: "Build a recoverable game board.",
      currentState: "Pi emitted cards before the run paused.",
      targetUser: "Project manager restarting planning.",
      qualityBar: "Fresh planning should not reuse abandoned drafts.",
      assumptions: [],
      questions: [],
      sourceNotes: ["Initial paused run."],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Create the first playable shell.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          acceptanceCriteria: ["A shell exists."],
          testPlan: { unit: ["Shell proof."], integration: [], visual: [], manual: [] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          clarificationQuestions: ["Should controls use inertia?"],
          acceptanceCriteria: ["Input moves the player."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Try input."] },
        },
        {
          sourceId: "synthesis:boss",
          title: "Add boss",
          description: "Add one boss encounter.",
          candidateStatus: "ready_to_create",
          priority: 3,
          phase: "Gameplay",
          labels: ["boss"],
          blockedBy: ["synthesis:controls"],
          sourceRefs: ["GDD.md#boss"],
          acceptanceCriteria: ["Boss can spawn."],
          testPlan: { unit: ["Spawn proof."], integration: [], visual: [], manual: [] },
        },
      ],
    };

    const first = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const shell = first.cards.find((card) => card.sourceId === "synthesis:shell");
    const controls = first.cards.find((card) => card.sourceId === "synthesis:controls");
    const boss = first.cards.find((card) => card.sourceId === "synthesis:boss");
    expect(shell).toBeTruthy();
    expect(controls).toBeTruthy();
    expect(boss).toBeTruthy();
    const ticketizedShell = store.approveProjectBoardCard(shell!.id);
    store.updateProjectBoardCard({ cardId: boss!.id, title: "Manually reviewed boss card" });

    const cleanup = store.supersedeProjectBoardSynthesisCardsForStartFresh({
      boardId: board.id,
      runId: "paused-run-1",
      reason: "User chose Start Fresh.",
    });

    expect(cleanup).toMatchObject({
      supersededDraftCardIds: [controls!.id],
      preservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
      demotedPreservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
    });
    const afterCleanup = store.getProjectBoard(board.id)!;
    expect(afterCleanup.cards.find((card) => card.id === controls!.id)).toBeUndefined();
    expect(afterCleanup.cards.find((card) => card.id === ticketizedShell.id)).toMatchObject({
      status: "draft",
      candidateStatus: "needs_clarification",
      orchestrationTaskId: undefined,
    });
    expect(afterCleanup.cards.find((card) => card.id === boss!.id)).toMatchObject({
      title: "Manually reviewed boss card",
      status: "draft",
      candidateStatus: "needs_clarification",
      orchestrationTaskId: undefined,
    });
    expect(afterCleanup.events?.[0]).toMatchObject({
      kind: "card_updated",
      title: "Start Fresh cleared draft synthesis cards",
      metadata: expect.objectContaining({
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "paused-run-1",
        supersededDraftCardIds: [controls!.id],
        demotedPreservedCardIds: expect.arrayContaining([ticketizedShell.id, boss!.id]),
      }),
    });

    const fresh = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Fresh planning batch.",
        cards: [
          { ...firstBatch.cards[0], title: "Create fresh shell" },
          { ...firstBatch.cards[1], title: "Implement fresh controls" },
        ],
      },
      {
        replaceExistingDraft: true,
        insertQuestions: false,
        sourceIdNamespace: "start-fresh:fresh-run-1:",
      },
    );

    const freshCards = fresh.cards.filter((card) => card.sourceId.startsWith("start-fresh:fresh-run-1:"));
    expect(freshCards.map((card) => card.sourceId)).toEqual([
      "start-fresh:fresh-run-1:synthesis:shell",
      "start-fresh:fresh-run-1:synthesis:controls",
    ]);
    expect(freshCards.map((card) => card.id)).not.toContain(shell!.id);
    expect(freshCards.map((card) => card.id)).not.toContain(controls!.id);
    expect(fresh.cards.find((card) => card.sourceId === "start-fresh:fresh-run-1:synthesis:controls")).toMatchObject({
      blockedBy: ["start-fresh:fresh-run-1:synthesis:shell"],
      clarificationQuestions: ["Should controls use inertia?"],
    });
    expect(fresh.cards.some((card) => card.id === boss!.id)).toBe(true);
  });

  it("keeps stale replaceable drafts during partial progressive applies until the final boundary", () => {
    const board = store.createProjectBoard({ title: "Progressive stale boundary board" });
    const firstBatch: ProjectBoardSynthesisDraft = {
      summary: "Initial progressive draft.",
      goal: "Build a stable progressive board.",
      currentState: "Two cards have streamed in.",
      targetUser: "Project manager watching live cards.",
      qualityBar: "Progressive batches should not make existing cards disappear.",
      assumptions: [],
      questions: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:shell",
          title: "Create game shell",
          description: "Create the first playable shell.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Foundation",
          labels: ["shell"],
          blockedBy: [],
          sourceRefs: ["GDD.md#shell"],
          clarificationQuestions: ["Which shell target should ship?"],
          acceptanceCriteria: ["A shell exists."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Open the shell."] },
        },
        {
          sourceId: "synthesis:controls",
          title: "Implement controls",
          description: "Add basic input.",
          candidateStatus: "needs_clarification",
          priority: 2,
          phase: "Gameplay",
          labels: ["controls"],
          blockedBy: ["synthesis:shell"],
          sourceRefs: ["GDD.md#controls"],
          clarificationQuestions: ["Should controls be arcade or inertia based?"],
          acceptanceCriteria: ["Input moves the ship."],
          testPlan: { unit: [], integration: [], visual: [], manual: ["Try keyboard input."] },
        },
      ],
    };

    const afterFirstBatch = store.applyProjectBoardSynthesis(board.id, firstBatch, { replaceExistingDraft: true, insertQuestions: false });
    const originalShell = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:shell");
    const originalControls = afterFirstBatch.cards.find((card) => card.sourceId === "synthesis:controls");
    expect(originalShell).toBeTruthy();
    expect(originalControls).toBeTruthy();

    const partial = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Partial progressive update.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create stable game shell",
            description: "Refine the streamed shell card while the controls section is absent from this partial batch.",
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false, deleteStaleDraftCards: false },
    );

    expect(partial.cards.find((card) => card.sourceId === "synthesis:shell")).toMatchObject({
      id: originalShell!.id,
      title: "Create stable game shell",
    });
    expect(partial.cards.find((card) => card.sourceId === "synthesis:controls")).toMatchObject({
      id: originalControls!.id,
      title: "Implement controls",
    });
    expect(partial.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        staleDraftDeletionSkipped: true,
        replacedDraftCardCount: 0,
      }),
    });

    const final = store.applyProjectBoardSynthesis(
      board.id,
      {
        ...firstBatch,
        summary: "Final progressive update.",
        cards: [
          {
            ...firstBatch.cards[0],
            title: "Create final game shell",
            description: "Final synthesis intentionally excludes the old controls card.",
          },
        ],
      },
      { replaceExistingDraft: true, insertQuestions: false },
    );

    expect(final.cards.find((card) => card.sourceId === "synthesis:shell")).toMatchObject({
      id: originalShell!.id,
      title: "Create final game shell",
    });
    expect(final.cards.find((card) => card.sourceId === "synthesis:controls")).toBeUndefined();
    expect(final.events?.[0]).toMatchObject({
      kind: "board_synthesized",
      metadata: expect.objectContaining({
        staleDraftDeletionSkipped: false,
        replacedDraftCardCount: 1,
      }),
    });
  });

  it("dedupes near-duplicate synthesis clarification questions", () => {
    const board = store.createProjectBoard({ title: "Clarification dedupe board" });
    const renderingQuestion =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const renderingQuestionVariant =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Clarification dedupe synthesis.",
        goal: "Build a renderer-aware game board.",
        currentState: "Pi emitted near-duplicate clarification questions.",
        targetUser: "Project manager.",
        qualityBar: "Questions should be concrete and non-redundant.",
        assumptions: [],
        questions: [renderingQuestion, renderingQuestionVariant],
        sourceNotes: [],
        cards: [
          {
            sourceId: "synthesis:renderer-choice",
            title: "Resolve rendering substrate",
            description: "Choose the rendering substrate before downstream cards are created.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Foundation",
            labels: ["rendering"],
            blockedBy: [],
            sourceRefs: ["GDD.md#renderer"],
            clarificationQuestions: [renderingQuestion, renderingQuestionVariant],
            acceptanceCriteria: ["Renderer choice is documented."],
            testPlan: { unit: [], integration: [], visual: [], manual: ["Review renderer choice."] },
          },
        ],
      },
      { replaceExistingDraft: true },
    );

    expect(synthesized.cards.find((card) => card.sourceId === "synthesis:renderer-choice")?.clarificationQuestions).toEqual([renderingQuestion]);
    expect(synthesized.questions.filter((question) => question.question === renderingQuestion || question.question === renderingQuestionVariant)).toHaveLength(
      1,
    );
  });
});
