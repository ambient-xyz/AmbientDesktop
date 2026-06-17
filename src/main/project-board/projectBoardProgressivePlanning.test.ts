import { describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft, ProjectBoardSynthesisSource } from "./projectBoardSynthesis";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
  proposalJsonlContent,
} from "./projectBoardProgressivePlanning";

const now = "2026-05-04T12:00:00.000Z";

describe("project board progressive planning", () => {
  it("projects a synthesis draft into progressive JSONL records", () => {
    const records = projectBoardProgressiveRecordsFromDraft({
      draft: sampleDraft(),
      sources: sampleSources(),
      proposalId: "proposal-1",
      createdAt: now,
    });

    expect(records.map((record) => record.type)).toEqual([
      "progress",
      "candidate_card",
      "candidate_card",
      "question",
      "source_coverage",
      "dependency_edge",
      "proposal_final",
    ]);
    expect(records.find((record) => record.type === "candidate_card")).toMatchObject({
      sourceId: "synthesis:shell",
      sourceRefs: [{ sourceId: "source-gdd" }],
    });
    expect(records.filter((record) => record.type === "candidate_card")[1]).toMatchObject({
      sourceId: "synthesis:controls",
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
      clarificationQuestions: ["Should controls be arcade or Newtonian?"],
      clarificationDecisions: [
        expect.objectContaining({
          id: "clarification:controls-feel",
          question: "Should controls be arcade or Newtonian?",
          suggestedAnswer: "Use arcade controls for the first playable slice.",
          safeToAccept: true,
        }),
      ],
    });
    expect(records.find((record) => record.type === "source_coverage")).toMatchObject({
      sourceId: "source-gdd",
      status: "covered",
      cardIds: ["synthesis:shell", "synthesis:controls"],
    });
    expect(records.find((record) => record.type === "dependency_edge")).toMatchObject({
      fromCardId: "synthesis:shell",
      toCardId: "synthesis:controls",
    });
    expect(records.find((record) => record.type === "proposal_final")).toMatchObject({
      summary: "Build a playable game slice.",
      goal: "Build the MVP.",
    });
  });

  it("recovers a draft from candidate-card and question records", () => {
    const records = projectBoardProgressiveRecordsFromDraft({
      draft: sampleDraft(),
      sources: sampleSources(),
      proposalId: "proposal-1",
      createdAt: now,
      includeProgress: false,
    });

    const draft = projectBoardSynthesisDraftFromProgressiveRecords(records, { projectName: "Starfall Courier" });

    expect(draft.summary).toBe("Build a playable game slice.");
    expect(draft.goal).toBe("Build the MVP.");
    expect(draft.qualityBar).toBe("Proof required.");
    expect(draft.questions).toEqual([]);
    expect(draft.cards.map((card) => card.title)).toEqual(["Create the PixiJS shell", "Implement controls"]);
    expect(draft.cards[1].blockedBy).toEqual(["synthesis:shell"]);
    expect(draft.cards[1]).toMatchObject({
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });
    expect(draft.cards[1].clarificationQuestions).toEqual(["Should controls be arcade or Newtonian?"]);
    expect(draft.cards[1].clarificationDecisions).toEqual([
      expect.objectContaining({
        id: "clarification:controls-feel",
        suggestedAnswer: "Use arcade controls for the first playable slice.",
      }),
    ]);
  });

  it("round-trips objective provenance through progressive candidate-card records", () => {
    const records = projectBoardProgressiveRecordsFromDraft({
      draft: {
        ...sampleDraft(),
        cards: [
          {
            ...sampleDraft().cards[0],
            objectiveProvenance: {
              objective: "Add keyboard-accessible board controls.",
              groundingMode: "selected_sources",
              selectedSourceIds: ["source-gdd"],
              sourceRefCount: 1,
              weakGrounding: false,
            },
          },
        ],
      },
      sources: sampleSources(),
      proposalId: "proposal-1",
      createdAt: now,
      includeProgress: false,
    });

    expect(records.find((record) => record.type === "candidate_card")).toMatchObject({
      objectiveProvenance: {
        objective: "Add keyboard-accessible board controls.",
        groundingMode: "selected_sources",
        sourceRefCount: 1,
        weakGrounding: false,
      },
    });
    const recovered = projectBoardSynthesisDraftFromProgressiveRecords(records, { projectName: "Starfall Courier" });
    expect(recovered.cards[0].objectiveProvenance).toMatchObject({
      objective: "Add keyboard-accessible board controls.",
      groundingMode: "selected_sources",
      sourceRefCount: 1,
      weakGrounding: false,
    });
  });

  it("adds a fallback clarification question when progressive candidate card records omit one", () => {
    const records = extractProjectBoardProposalJsonlRecordsFromText(
      JSON.stringify({
        type: "candidate_card",
        sourceId: "synthesis:combat-loop",
        title: "Implement combat loop",
        description: "Add combat resolution from the design document.",
        candidateStatus: "needs_clarification",
        priority: 2,
        phase: "Combat",
        labels: ["combat"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-gdd" }],
        acceptanceCriteria: ["Combat resolves."],
        testPlan: { unit: ["Combat reducer test."], integration: [], visual: [], manual: [] },
      }),
    );

    const draft = projectBoardSynthesisDraftFromProgressiveRecords(records, { projectName: "Starfall Courier" });

    expect(draft.cards[0].clarificationQuestions).toEqual([
      'What PM decision is still required before "Implement combat loop" can move to Ready To Create?',
    ]);
  });

  it("adds proof-scope warnings when pure module cards carry visual proof", () => {
    const records = projectBoardProgressiveRecordsFromDraft({
      draft: {
        ...sampleDraft(),
        cards: [
          {
            sourceId: "synthesis:input-adapter",
            title: "Build InputAdapter for keyboard-to-intent mapping",
            description: "Translate keyboard state into gameplay intents.",
            candidateStatus: "ready_to_create",
            priority: 1,
            phase: "Foundation",
            labels: ["input-adapter", "controls"],
            blockedBy: [],
            acceptanceCriteria: ["Intent objects are stable."],
            testPlan: {
              unit: ["Test keyboard intent mapping."],
              integration: ["Verify game loop consumes intents."],
              visual: ["Capture browser proof that the ship accelerates visually."],
              manual: [],
            },
            sourceRefs: ["source-gdd"],
          },
        ],
      },
      sources: sampleSources(),
      createdAt: now,
      includeProgress: false,
    });

    expect(records.find((record) => record.type === "warning" && record.code === "proof_scope_mismatch")).toMatchObject({
      message: expect.stringContaining("pure/module-boundary card"),
      metadata: {
        cardId: "synthesis:input-adapter",
        proofOwnership: "pure_module",
      },
    });
  });

  it("extracts fenced JSONL records from model text", () => {
    const records = projectBoardProgressiveRecordsFromDraft({
      draft: sampleDraft(),
      sources: sampleSources(),
      createdAt: now,
      includeProgress: false,
    });
    const text = `Here are partial artifacts:\n\n\`\`\`jsonl\n${proposalJsonlContent(records, "candidate_card")}\`\`\``;

    const extracted = extractProjectBoardProposalJsonlRecordsFromText(text);

    expect(extracted).toHaveLength(2);
    expect(extracted[0]).toMatchObject({ type: "candidate_card", sourceId: "synthesis:shell" });
  });

  it("surfaces partially dropped JSONL records as a warning instead of silent loss", () => {
    const valid = JSON.stringify({
      type: "question",
      questionId: "question-weighted-options",
      question: "Should the picker support weighted options for common choices?",
      createdAt: "2026-06-10T00:00:00.000Z",
    });
    const invalid = JSON.stringify({ type: "candidate_card", title: 42 });

    const records = extractProjectBoardProposalJsonlRecordsFromText([valid, invalid].join("\n"));
    const warning = records.find((record) => record.type === "warning");

    expect(records.some((record) => record.type === "question")).toBe(true);
    expect(warning).toMatchObject({ code: "proposal_jsonl_records_dropped" });
    expect((warning as { metadata?: { droppedCount?: number } })?.metadata?.droppedCount).toBe(1);

    // A fully-invalid response stays empty so the section retry path still fires.
    expect(extractProjectBoardProposalJsonlRecordsFromText(invalid)).toEqual([]);
  });
});

function sampleSources(): ProjectBoardSynthesisSource[] {
  return [
    {
      id: "source-gdd",
      kind: "functional_spec",
      title: "Game Design Document",
      summary: "PixiJS shell and controls.",
      path: "GAME_DESIGN_DOCUMENT.md",
      relevance: 98,
    },
  ];
}

function sampleDraft(): ProjectBoardSynthesisDraft {
  return {
    summary: "Build a playable game slice.",
    goal: "Build the MVP.",
    currentState: "The design document exists.",
    targetUser: "Browser players.",
    qualityBar: "Proof required.",
    assumptions: [],
    questions: ["Should controls be arcade or Newtonian?"],
    sourceNotes: ["GDD is primary."],
    cards: [
      {
        sourceId: "synthesis:shell",
        title: "Create the PixiJS shell",
        description: "Create the app shell from GAME_DESIGN_DOCUMENT.md.",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Foundation",
        labels: ["pixijs"],
        blockedBy: [],
        acceptanceCriteria: ["Canvas mounts."],
        testPlan: { unit: [], integration: ["Run app."], visual: ["Screenshot."], manual: [] },
        sourceRefs: ["GAME_DESIGN_DOCUMENT.md"],
      },
      {
        sourceId: "synthesis:controls",
        title: "Implement controls",
        description: "Implement movement described in Game Design Document.",
        candidateStatus: "needs_clarification",
        priority: 2,
        phase: "Core Gameplay",
        labels: ["controls"],
        blockedBy: ["synthesis:shell"],
        acceptanceCriteria: ["Ship responds to input."],
        testPlan: { unit: ["Movement tests."], integration: [], visual: [], manual: [] },
        sourceRefs: ["source-gdd"],
        clarificationQuestions: ["Should controls be arcade or Newtonian?"],
        clarificationDecisions: [
          {
            id: "clarification:controls-feel",
            canonicalKey: "controls feel arcade newtonian",
            question: "Should controls be arcade or Newtonian?",
            source: "card",
            state: "open",
            suggestedAnswer: "Use arcade controls for the first playable slice.",
            rationale: "Arcade controls make the initial playable proof easier to validate.",
            confidence: "medium",
            safeToAccept: true,
            questionKind: "expert_default",
          },
        ],
        uiMockRole: "gated_implementation",
        requiresUiMockApproval: true,
      },
    ],
  };
}
