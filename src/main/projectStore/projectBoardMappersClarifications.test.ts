import { describe, expect, it } from "vitest";
import type { ProjectBoardCardClarificationAnswer } from "../../shared/projectBoardTypes";
import {
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationAnswerSection,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardMaterialPendingPiUpdateForRow,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardUnansweredClarificationQuestions,
} from "./projectBoardMappers";
import { projectBoardCardPendingPiUpdateRow } from "./projectBoardMappersTestSupport";

describe("project board mapper clarifications", () => {
  it("normalizes project board clarification questions by trimming, deduping, and bounding length", () => {
    const longQuestion = `${"Which target should ship first? ".repeat(30)}This part is clipped.`;
    expect(
      normalizeProjectBoardClarificationQuestions(
        ["  Should the shell use Three.js or PixiJS?  ", "Should shell use Three.js or PixiJS", "", longQuestion, "Is mobile required?"],
        2,
      ),
    ).toEqual(["Should the shell use Three.js or PixiJS?", longQuestion.trim().slice(0, 500)]);
  });

  it("normalizes project board clarification suggestions conservatively", () => {
    expect(
      normalizeProjectBoardClarificationSuggestions([
        {
          question: "  Which renderer should the shell use?  ",
          suggestedAnswer: "  Keep the existing React renderer.  ",
          rationale: "  It keeps the first slice small.  ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
        {
          question: "Which renderer should the shell use",
          suggestedAnswer: "Use the current renderer and defer alternatives.",
          safeToAccept: true,
          questionKind: "user_preference",
        },
        {
          question: "Which theme is required?",
          suggestedAnswer: "",
        },
      ] as never),
    ).toEqual([
      {
        question: "Which renderer should the shell use",
        suggestedAnswer: "Use the current renderer and defer alternatives.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "user_preference",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationSuggestions(undefined, [
        {
          question: "  Is mobile required?  ",
          suggestedAnswer: "  Not for the first pass.  ",
          questionKind: "external_constraint",
        },
      ] as never),
    ).toEqual([
      {
        question: "Is mobile required?",
        suggestedAnswer: "Not for the first pass.",
        rationale: "Expert suggested answer from Ambient planning.",
        confidence: "low",
        safeToAccept: false,
        questionKind: "external_constraint",
      },
    ]);
  });

  it("parses project board clarification suggestions from JSON", () => {
    expect(
      parseProjectBoardClarificationSuggestions(
        JSON.stringify([
          {
            question: "Should proof be required?",
            suggestedAnswer: "Yes, require proof before Done.",
            rationale: "Matches the strict proof policy.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        suggestedAnswer: "Yes, require proof before Done.",
        rationale: "Matches the strict proof policy.",
        confidence: "medium",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(parseProjectBoardClarificationSuggestions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions("not json")).toEqual([]);
    expect(parseProjectBoardClarificationSuggestions(null)).toEqual([]);
  });

  it("normalizes project board clarification answers conservatively", () => {
    expect(
      normalizeProjectBoardClarificationAnswers([
        {
          question: " Which renderer should the shell use? ",
          answer: " Use the existing React renderer. ",
          answeredAt: " 2026-01-01T00:00:00.000Z ",
        },
        {
          question: "Which renderer should the shell use",
          answer: "Prefer the existing renderer and defer alternatives.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        {
          question: " ",
          answer: "Dropped.",
          answeredAt: "2026-01-01T00:02:00.000Z",
        },
        {
          question: "Which theme is required?",
          answer: "   ",
          answeredAt: "2026-01-01T00:03:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Which renderer should the shell use?",
        answer: "Prefer the existing renderer and defer alternatives.",
        answeredAt: "2026-01-01T00:01:00.000Z",
      },
    ]);

    expect(
      normalizeProjectBoardClarificationAnswers(undefined, [
        {
          question: " Is mobile required? ",
          answer: " Not for the first pass. ",
          answeredAt: "2026-01-01T00:04:00.000Z",
        },
      ]),
    ).toEqual([
      {
        question: "Is mobile required?",
        answer: "Not for the first pass.",
        answeredAt: "2026-01-01T00:04:00.000Z",
      },
    ]);
  });

  it("finds the changed project board clarification answer", () => {
    const previous: ProjectBoardCardClarificationAnswer[] = [
      {
        question: "Which renderer should the shell use?",
        answer: "Use the existing React renderer.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const sameQuestionVariant: ProjectBoardCardClarificationAnswer = {
      question: "Which renderer should shell use",
      answer: "Use the existing React renderer.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    };
    const changedAnswer: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answer: "Use the existing renderer and defer alternatives.",
    };
    const changedAnsweredAt: ProjectBoardCardClarificationAnswer = {
      ...sameQuestionVariant,
      answeredAt: "2026-01-01T00:05:00.000Z",
    };
    const newQuestion: ProjectBoardCardClarificationAnswer = {
      question: "Is mobile required?",
      answer: "Not for the first pass.",
      answeredAt: "2026-01-01T00:06:00.000Z",
    };

    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant])).toBeUndefined();
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnswer])).toBe(changedAnswer);
    expect(projectBoardChangedClarificationAnswer(previous, [changedAnsweredAt])).toBe(changedAnsweredAt);
    expect(projectBoardChangedClarificationAnswer(previous, [sameQuestionVariant, newQuestion])).toBe(newQuestion);
  });

  it("formats project board clarification answer sections", () => {
    expect(projectBoardClarificationAnswerSection(" Which renderer should the shell use? ", " Use React. ")).toBe(
      "- Q: Which renderer should the shell use?\n  A: Use React.",
    );
  });

  it("appends project board clarification answers to descriptions idempotently", () => {
    const question = "Which renderer should the shell use?";
    const answer = "Use React.";
    const entry = "- Q: Which renderer should the shell use?\n  A: Use React.";

    expect(projectBoardDescriptionWithClarificationAnswer("", question, answer)).toBe(`## Clarifications\n${entry}`);
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer("Build the shell.\n\n## Clarifications", question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
    expect(projectBoardDescriptionWithClarificationAnswer(`Build the shell.\n\n## Clarifications\n${entry}`, question, answer)).toBe(
      `Build the shell.\n\n## Clarifications\n${entry}`,
    );
  });

  it("matches project board clarification questions against known variants", () => {
    expect(
      projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [
        "Which renderer should shell use",
        "Is mobile required?",
      ]),
    ).toBe(true);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", ["Is mobile required?"])).toBe(false);
    expect(projectBoardQuestionMatchesAnyVariant("Which renderer should the shell use?", [])).toBe(false);
  });

  it("parses project board clarification answers from JSON", () => {
    expect(
      parseProjectBoardClarificationAnswers(
        JSON.stringify([
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { question: "Missing answer" },
        ]),
      ),
    ).toEqual([
      {
        question: "Should proof be required?",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationAnswers("{}")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers("not json")).toEqual([]);
    expect(parseProjectBoardClarificationAnswers(null)).toEqual([]);
  });

  it("normalizes project board clarification decisions conservatively", () => {
    const decisions = normalizeProjectBoardClarificationDecisions([
      {
        id: "decision-1",
        question: " Which renderer should the shell use? ",
        canonicalKey: " renderer shell ",
        source: "card",
        state: "open",
        suggestedAnswer: " Keep React. ",
        rationale: " Preserves the current stack. ",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
        createdAt: " 2026-01-01T00:00:00.000Z ",
        updatedAt: " 2026-01-01T00:01:00.000Z ",
      },
      {
        id: "decision-2",
        question: "Broken answered decision?",
        canonicalKey: "broken answered decision",
        source: "answer_history",
        state: "answered",
      },
    ] as never);

    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({
      id: "clarification:renderer-shell",
      question: "Which renderer should the shell use?",
      canonicalKey: "renderer shell",
      source: "card",
      state: "open",
      duplicateOf: undefined,
      suggestedAnswer: "Keep React.",
      rationale: "Preserves the current stack.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(decisions[1]).toMatchObject({
      id: "clarification:broken-answered-decision",
      question: "Broken answered decision?",
      source: "answer_history",
      state: "open",
    });
  });

  it("parses project board clarification decisions from JSON with fallback questions", () => {
    expect(
      parseProjectBoardClarificationDecisions(
        JSON.stringify([
          {
            id: "q1",
            question: "Should proof be required?",
            source: "unsupported",
            state: "answered",
            answer: " Yes, require proof before Done. ",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
          { answer: "Missing question" },
        ]),
      ),
    ).toEqual([
      {
        id: "clarification:proof-required",
        question: "Should proof be required?",
        canonicalKey: "proof required",
        source: "card",
        state: "answered",
        answer: "Yes, require proof before Done.",
        answeredAt: "2026-01-01T00:00:00.000Z",
        safeToAccept: false,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
    expect(
      parseProjectBoardClarificationDecisions(null, {
        clarificationQuestions: [" Is mobile required? "],
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      }),
    ).toMatchObject([
      {
        id: "clarification:mobile-required",
        question: "Is mobile required?",
        state: "open",
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    expect(parseProjectBoardClarificationDecisions("{}")).toEqual([]);
    expect(parseProjectBoardClarificationDecisions("not json")).toEqual([]);
  });

  it("normalizes project board synthesis clarification fields with answered questions filtered", () => {
    const answeredAt = "2026-01-01T00:00:00.000Z";
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationQuestions: [" Should proof be required? ", "Which renderer should ship first?"],
      clarificationAnswers: [
        {
          question: "Should proof be required?",
          answer: "Yes, require proof before Done.",
          answeredAt,
        },
      ],
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Which renderer should ship first?",
          canonicalKey: "renderer ship first",
          source: "card",
          state: "open",
          suggestedAnswer: " Use React. ",
          rationale: " Existing stack. ",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    expect(result.clarificationQuestions).toEqual(["Which renderer should ship first?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Which renderer should ship first?",
        suggestedAnswer: "Use React.",
        rationale: "Existing stack.",
        confidence: "high",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
    expect(result.clarificationDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "Which renderer should ship first?",
          state: "open",
          suggestedAnswer: "Use React.",
        }),
        expect.objectContaining({
          question: "Should proof be required?",
          state: "answered",
          answer: "Yes, require proof before Done.",
        }),
      ]),
    );
  });

  it("derives project board clarification questions and suggestions from open decisions", () => {
    const result = normalizeProjectBoardSynthesisClarificationFields({
      clarificationDecisions: [
        {
          id: "decision-1",
          question: "Should mobile layout ship in the first pass?",
          canonicalKey: "mobile layout ship first pass",
          source: "card",
          state: "open",
          suggestedAnswer: "Defer mobile layout until desktop is stable.",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ] as never,
    });

    expect(result.clarificationQuestions).toEqual(["Should mobile layout ship in the first pass?"]);
    expect(result.clarificationSuggestions).toEqual([
      {
        question: "Should mobile layout ship in the first pass?",
        suggestedAnswer: "Defer mobile layout until desktop is stable.",
        rationale: "Suggested default from the structured clarification decision.",
        confidence: "low",
        safeToAccept: true,
        questionKind: "expert_default",
      },
    ]);
  });

  it("filters answered project board clarification questions", () => {
    expect(
      projectBoardUnansweredClarificationQuestions(
        [" Should proof be required? ", "Which renderer should ship first?"],
        [
          {
            question: "Should proof be required?",
            answer: "Yes, require proof before Done.",
            answeredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ),
    ).toEqual(["Which renderer should ship first?"]);
  });

  it("preserves candidate status when synthesis only reopens answered clarification gates", () => {
    const answeredDecision = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
    } as never;
    const openDecision = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
    } as never;

    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [answeredDecision])).toBe(
      "ready_to_create",
    );
    expect(projectBoardCandidateStatusForSynthesisUpdate("needs_clarification", "ready_to_create", [openDecision])).toBe(
      "needs_clarification",
    );
    expect(projectBoardCandidateStatusForSynthesisUpdate("ready_to_create", "needs_clarification", [])).toBe("ready_to_create");
  });

  it("returns no project board pending Pi update when the synthesis card still matches the row", () => {
    expect(
      projectBoardCardPendingPiUpdateFromSynthesisCard(
        projectBoardCardPendingPiUpdateRow(),
        {
          sourceId: " synthesis:shell ",
          title: " Create shell ",
          description: " Build the shell. ",
          candidateStatus: "ready_to_create",
          priority: 2,
          phase: " Foundation ",
          labels: [" shell "],
          blockedBy: [],
          acceptanceCriteria: [" Canvas renders. "],
          testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
          sourceRefs: [" docs/architecture.md "],
        },
        "2026-01-01T00:02:00.000Z",
      ),
    ).toBeUndefined();
  });

  it("maps changed synthesis cards to project board pending Pi updates", () => {
    const update = projectBoardCardPendingPiUpdateFromSynthesisCard(
      projectBoardCardPendingPiUpdateRow({
        clarification_questions_json: JSON.stringify(["Renderer choice?"]),
        clarification_answers_json: JSON.stringify([
          {
            question: "Renderer choice?",
            answer: "Use React.",
            answeredAt: "2026-01-01T00:00:30.000Z",
          },
        ]),
      }),
      {
        sourceId: " synthesis:shell ",
        title: " Create shell v2 ",
        description: " Build the shell. ",
        candidateStatus: "needs_clarification",
        priority: 2.4,
        phase: " Foundation ",
        labels: [" shell ", "webgl"],
        blockedBy: [],
        acceptanceCriteria: [" Canvas renders. "],
        testPlan: { unit: [" unit test "], integration: [], visual: [], manual: [] },
        sourceRefs: [" docs/architecture.md "],
        clarificationQuestions: ["Renderer choice?"],
        uiMockRole: "mock_gate",
        requiresUiMockApproval: true,
      },
      "2026-01-01T00:02:00.000Z",
    );

    expect(update).toMatchObject({
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:02:00.000Z",
      title: "Create shell v2",
      description: "Build the shell.",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "Foundation",
      labels: ["shell", "webgl"],
      blockedBy: [],
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["unit test"], integration: [], visual: [], manual: [] },
      sourceRefs: ["docs/architecture.md"],
      clarificationQuestions: [],
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      changedFields: expect.arrayContaining(["title", "labels", "uiMockMetadata"]),
    });
    expect(update?.changedFields).not.toContain("candidateStatus");
    expect(update?.changedFields).not.toContain("clarificationQuestions");
  });

  it("materializes no project board pending Pi update when staged values match the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["title", "labels"],
        title: " Create shell ",
        labels: [" shell "],
      }),
    ).toBeUndefined();
  });

  it("recomputes project board pending Pi update changed fields against the row", () => {
    expect(
      projectBoardMaterialPendingPiUpdateForRow(projectBoardCardPendingPiUpdateRow(), {
        sourceId: "synthesis:shell",
        createdAt: "2026-01-01T00:02:00.000Z",
        changedFields: ["description"],
        title: " Create shell v2 ",
        labels: ["shell", "webgl"],
      }),
    ).toMatchObject({
      sourceId: "synthesis:shell",
      title: " Create shell v2 ",
      labels: ["shell", "webgl"],
      changedFields: ["title", "labels"],
    });
  });

  it("compares project board clarification decisions using the persisted gate shape", () => {
    const answeredLeft = {
      id: "clarification:proof-required",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "answer_history",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-01T00:00:00.000Z",
      suggestedAnswer: "Maybe.",
      safeToAccept: true,
    } as never;
    const answeredRight = {
      id: "different-id",
      question: "Should proof be required?",
      canonicalKey: "proof required",
      source: "card",
      state: "answered",
      answer: "Yes.",
      answeredAt: "2026-01-02T00:00:00.000Z",
      suggestedAnswer: "No.",
      safeToAccept: false,
    } as never;
    const openLeft = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use React.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;
    const openRight = {
      id: "clarification:renderer",
      question: "Which renderer should ship first?",
      canonicalKey: "renderer",
      source: "card",
      state: "open",
      suggestedAnswer: "Use Canvas.",
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    } as never;

    expect(projectBoardClarificationDecisionsEquivalent([answeredLeft], [answeredRight])).toBe(true);
    expect(projectBoardClarificationDecisionsEquivalent([openLeft], [openRight])).toBe(false);
  });
});
