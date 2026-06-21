import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board clarification default facade (requires Node ABI better-sqlite3 build)", () => {
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

  it("applies clarification default suggestions as reviewable metadata without rewriting card specs", () => {
    const board = store.createProjectBoard({ title: "Clarification defaults board" });
    const synthesized = store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Clarification default smoke.",
        goal: "Suggest expert defaults for legacy questions without regenerating cards.",
        currentState: "One draft has an open legacy clarification question.",
        targetUser: "PM reviewer.",
        qualityBar: "Defaults are PM reviewable and card specs stay intact.",
        assumptions: [],
        questions: [],
        sourceNotes: [],
        cards: [
          {
            sourceId: "clarification:legacy",
            title: "Create animated hello-world page",
            description: "Build src/index.html with the approved greeting.",
            candidateStatus: "needs_clarification",
            priority: 1,
            phase: "Decisions",
            labels: ["html"],
            blockedBy: [],
            sourceRefs: [],
            acceptanceCriteria: ["src/index.html renders Hello from Ambient."],
            testPlan: { unit: ["Check greeting text."], integration: [], visual: [], manual: [] },
            clarificationQuestions: ["Should the animation use pulse or confetti?"],
          },
        ],
      },
      { replaceExistingDraft: false, insertQuestions: false },
    );
    const draft = synthesized.cards.find((card) => card.sourceId === "clarification:legacy")!;
    const decision = draft.clarificationDecisions?.[0];
    expect(decision).toMatchObject({ state: "open" });
    expect(decision?.suggestedAnswer).toBeUndefined();

    const next = store.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds: [draft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 900, responseCharCount: 240, requestDurationMs: 33 },
      suggestions: [
        {
          cardId: draft.id,
          decisionId: decision!.id,
          canonicalKey: decision!.canonicalKey,
          question: "Should the animation use pulse or confetti?",
          suggestedAnswer: "Use a subtle pulse animation.",
          rationale: "Pulse is cheap to implement and easy to verify visually.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });

    const suggested = next.cards.find((card) => card.id === draft.id)!;
    expect(suggested).toMatchObject({
      title: "Create animated hello-world page",
      description: "Build src/index.html with the approved greeting.",
      acceptanceCriteria: ["src/index.html renders Hello from Ambient."],
      pendingPiUpdate: undefined,
    });
    expect(suggested.userTouchedFields ?? []).toEqual([]);
    expect(suggested.clarificationSuggestions).toEqual([
      expect.objectContaining({
        question: "Should the animation use pulse or confetti?",
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    expect(suggested.clarificationDecisions).toEqual([
      expect.objectContaining({
        id: decision!.id,
        state: "open",
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
        questionKind: "expert_default",
      }),
    ]);
    const event = (next.events ?? []).find((candidate) => candidate.title === "Clarification defaults suggested");
    expect(event?.metadata.clarificationDefaults).toMatchObject({
      appliedAction: "suggest_expert_defaults",
      targetCardIds: [draft.id],
      appliedCardIds: [draft.id],
      suggestedDecisionCount: 1,
      safeSuggestionCount: 1,
      existingCardsRewritten: false,
      modelCallRequired: true,
      model: "test-pi",
      promptCharCount: 900,
      responseCharCount: 240,
    });
  });
});
