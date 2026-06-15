import { describe, expect, it } from "vitest";
import {
  projectBoardClarificationDecisions,
  projectBoardClarificationDecisionId,
  projectBoardOpenClarificationQuestions,
  stripAppendedClarificationHistory,
} from "./projectBoardClarificationDecisions";

describe("projectBoardClarificationDecisions", () => {
  it("keeps answered clarification history out of inline question mining", () => {
    const description = `Implement keyboard input.

## Clarifications
- Q: Should numpad operators map directly to calculator operators?
  A: yes

## Notes
Should the notes section still be reviewed?`;

    expect(stripAppendedClarificationHistory(description)).not.toContain("numpad operators");
    expect(
      projectBoardOpenClarificationQuestions({
        description,
        clarificationAnswers: [
          {
            question: "Should numpad operators map directly to calculator operators?",
            answer: "yes",
            answeredAt: "2026-05-15T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual(["Should the notes section still be reviewed?"]);
  });

  it("marks repeated or answered variants as duplicate decisions instead of open questions", () => {
    const original =
      "Should the live preview suppress errors silently or display a muted Error indicator when the partial expression cannot be evaluated?";
    const variant =
      "Should the live preview show a muted Error indicator or stay silent when a partial expression cannot be evaluated?";

    const decisions = projectBoardClarificationDecisions({
      clarificationQuestions: [original, variant],
      clarificationAnswers: [
        {
          question: original,
          answer: "Display a muted error indicator.",
          answeredAt: "2026-05-15T00:00:00.000Z",
        },
      ],
    });

    expect(decisions.map((decision) => decision.state)).toEqual(["answered", "duplicate", "duplicate"]);
    expect(
      projectBoardOpenClarificationQuestions({
        clarificationQuestions: [original, variant],
        clarificationAnswers: [
          {
            question: original,
            answer: "Display a muted error indicator.",
            answeredAt: "2026-05-15T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("keeps card-attached questions open when no answer or canonical duplicate exists", () => {
    expect(
      projectBoardOpenClarificationQuestions({
        clarificationQuestions: ["What minimum font size should auto-shrinking use?"],
      }),
    ).toEqual(["What minimum font size should auto-shrinking use?"]);
  });

  it("attaches expert suggestions to matching open decisions", () => {
    const decisions = projectBoardClarificationDecisions({
      clarificationQuestions: ["Should numpad operators map directly to calculator operators?"],
      clarificationSuggestions: [
        {
          question: "Should numpad operators map directly to calculator operators?",
          suggestedAnswer: "Map numpad operators directly to their calculator equivalents.",
          rationale: "This matches standard calculator keyboard behavior and does not change product scope.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });

    expect(decisions[0]).toMatchObject({
      state: "open",
      suggestedAnswer: "Map numpad operators directly to their calculator equivalents.",
      rationale: expect.stringContaining("standard calculator keyboard"),
      confidence: "high",
      safeToAccept: true,
      questionKind: "expert_default",
    });
  });

  it("uses persisted structured decisions without recreating duplicate card questions", () => {
    const question = "Should the animation pause when the tab is hidden?";
    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: "clarification:animation-pause-hidden-tab",
          question,
          canonicalKey: "animation pause hidden tab",
          source: "card",
          state: "open",
          suggestedAnswer: "Pause the animation when the document is hidden and resume on visibilitychange.",
          rationale: "This avoids wasting work in background tabs without changing the visible behavior.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
      ],
      clarificationQuestions: [question],
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      id: "clarification:animation-pause-hidden-tab",
      state: "open",
      suggestedAnswer: "Pause the animation when the document is hidden and resume on visibilitychange.",
    });
  });

  it("keeps paraphrased persisted-question variants as duplicate audit rows", () => {
    const question =
      "Should the live preview display a muted Error indicator when the partial expression cannot be evaluated?";
    const duplicateQuestion =
      "Should the live preview show a muted Error indicator instead of staying silent when a partial expression cannot be evaluated?";

    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: "clarification:preview-error-indicator",
          question,
          canonicalKey: "live preview display muted error indicator partial expression evaluated",
          source: "card",
          state: "answered",
          answer: "Display a muted error indicator.",
          answeredAt: "2026-05-15T00:00:00.000Z",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
      ],
      clarificationQuestions: [question, duplicateQuestion],
    });

    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({
      id: "clarification:preview-error-indicator",
      state: "answered",
      answer: "Display a muted error indicator.",
    });
    expect(decisions[1]).toMatchObject({
      question: duplicateQuestion,
      state: "duplicate",
      duplicateOf: "clarification:preview-error-indicator",
      answer: "Display a muted error indicator.",
      answeredAt: "2026-05-15T00:00:00.000Z",
    });
    expect(
      projectBoardOpenClarificationQuestions({
        clarificationDecisions: decisions,
        clarificationQuestions: [question, duplicateQuestion],
      }),
    ).toEqual([]);
  });

  it("migrates legacy positional decision ids and duplicate links to canonical ids", () => {
    const question = "Should the tiny hello animation use a subtle pulse effect or celebratory confetti?";
    const duplicateQuestion = "Should the tiny hello animation use pulse instead of confetti?";

    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: "question-1",
          question,
          canonicalKey: "legacy-question-one",
          source: "card",
          state: "answered",
          answer: "Use a subtle pulse animation.",
          answeredAt: "2026-05-15T00:00:00.000Z",
        },
        {
          id: "question-2",
          question: duplicateQuestion,
          canonicalKey: "legacy-question-two",
          source: "card",
          state: "duplicate",
          duplicateOf: "question-1",
          answer: "Use a subtle pulse animation.",
          answeredAt: "2026-05-15T00:00:00.000Z",
        },
      ],
    } as Parameters<typeof projectBoardClarificationDecisions>[0]);

    const expectedId = projectBoardClarificationDecisionId(question);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({
      id: expectedId,
      state: "answered",
      answer: "Use a subtle pulse animation.",
    });
    expect(decisions[1]).toMatchObject({
      state: "duplicate",
      duplicateOf: expectedId,
      answer: "Use a subtle pulse animation.",
    });
    expect(decisions[1].id).not.toBe(expectedId);
    expect(projectBoardOpenClarificationQuestions({ clarificationDecisions: decisions })).toEqual([]);
  });

  it("keeps the recorded answer when a later open near-duplicate arrives", () => {
    const original = "Should the expense list support filtering by category and date range?";
    const regenerated = "Should the expense list support filtering by category and a date range?";

    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: projectBoardClarificationDecisionId(original),
          question: original,
          canonicalKey: original.toLowerCase(),
          source: "card",
          state: "answered",
          answer: "Yes, both category and date range filters.",
          answeredAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: projectBoardClarificationDecisionId(regenerated),
          question: regenerated,
          canonicalKey: regenerated.toLowerCase(),
          source: "card",
          state: "open",
        },
      ],
    } as Parameters<typeof projectBoardClarificationDecisions>[0]);

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      state: "answered",
      answer: "Yes, both category and date range filters.",
      answeredAt: "2026-06-01T00:00:00.000Z",
    });
    expect(projectBoardOpenClarificationQuestions({ clarificationDecisions: decisions })).toEqual([]);
  });

  it("carries suggestion fields from an open near-duplicate onto the surviving answered decision", () => {
    const original = "Which storage backend should the app default to for offline data persistence?";
    const variant = "Which storage backend should this app default to for offline data persistence?";

    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: projectBoardClarificationDecisionId(original),
          question: original,
          canonicalKey: original.toLowerCase(),
          source: "card",
          state: "answered",
          answer: "SQLite.",
          answeredAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: projectBoardClarificationDecisionId(variant),
          question: variant,
          canonicalKey: variant.toLowerCase(),
          source: "card",
          state: "open",
          suggestedAnswer: "SQLite via better-sqlite3.",
          rationale: "Already used elsewhere in the app.",
          confidence: "high",
        },
      ],
    } as Parameters<typeof projectBoardClarificationDecisions>[0]);

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      state: "answered",
      answer: "SQLite.",
      suggestedAnswer: "SQLite via better-sqlite3.",
      rationale: "Already used elsewhere in the app.",
    });
  });

  it("remaps duplicateOf pointers to the surviving merged decision", () => {
    const original = "Should exports include archived cards by default in the report?";
    const regenerated = "Should exports include archived cards by default in reports?";
    const dependent = "Should archived cards appear in exports by default for everyone?";

    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: [
        {
          id: projectBoardClarificationDecisionId(regenerated),
          question: regenerated,
          canonicalKey: regenerated.toLowerCase(),
          source: "card",
          state: "open",
        },
        {
          id: projectBoardClarificationDecisionId(original),
          question: original,
          canonicalKey: original.toLowerCase(),
          source: "card",
          state: "answered",
          answer: "No, archived cards stay out unless toggled.",
          answeredAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: `${projectBoardClarificationDecisionId(dependent)}:duplicate:3`,
          question: dependent,
          canonicalKey: dependent.toLowerCase(),
          source: "card",
          state: "duplicate",
          duplicateOf: projectBoardClarificationDecisionId(regenerated),
        },
      ],
    } as Parameters<typeof projectBoardClarificationDecisions>[0]);

    const survivor = decisions.find((decision) => decision.state === "answered");
    const duplicate = decisions.find((decision) => decision.state === "duplicate");
    expect(survivor).toBeDefined();
    expect(survivor?.answer).toBe("No, archived cards stay out unless toggled.");
    expect(duplicate?.duplicateOf).toBe(survivor?.id);
  });

  it("extracts consecutive inline questions separated only by question marks", () => {
    expect(
      projectBoardOpenClarificationQuestions({
        description: "Should we support dark mode by default? Should we persist data locally or remotely?",
      }),
    ).toEqual([
      "Should we support dark mode by default?",
      "Should we persist data locally or remotely?",
    ]);
  });

  it("does not treat URL query strings or optional-field markers as question ends", () => {
    expect(
      projectBoardOpenClarificationQuestions({
        description: [
          "Build the four Review API endpoints (GET /api/reviews?bookId=123 included).",
          "Support book fields (title, author, currentPage?, rating 1-5), review creation (bookId, text), tag creation (name, color?).",
          "Should reviews be editable after posting?",
        ].join(" "),
      }),
    ).toEqual(["Should reviews be editable after posting?"]);
  });

  it("assigns distinct stable ids to non-Latin questions instead of colliding", () => {
    const persianDarkMode = "آیا برنامه باید حالت تاریک داشته باشد؟";
    const persianStorage = "داده‌ها کجا ذخیره شوند؟";

    const darkModeId = projectBoardClarificationDecisionId(persianDarkMode);
    const storageId = projectBoardClarificationDecisionId(persianStorage);

    expect(darkModeId).not.toBe(storageId);
    expect(darkModeId).toBe(projectBoardClarificationDecisionId(persianDarkMode));
    expect(darkModeId).toMatch(/^clarification:question-[0-9a-f]{8}$/);
  });

  it("disambiguates long questions that share their first 80 slug characters", () => {
    const base =
      "Should the synchronization engine batch outgoing changes and retry failed uploads with exponential backoff";
    const left = `${base} for mobile clients?`;
    const right = `${base} for desktop clients?`;

    expect(projectBoardClarificationDecisionId(left)).not.toBe(projectBoardClarificationDecisionId(right));
  });

  it("keeps existing ids for ordinary English questions", () => {
    expect(projectBoardClarificationDecisionId("Should the app support dark mode?")).toBe(
      "clarification:app-support-dark-mode",
    );
  });
});
