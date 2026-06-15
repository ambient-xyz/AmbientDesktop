import { describe, expect, it } from "vitest";
import {
  PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
  boardEventArtifactPath,
  cardArtifactSchema,
  parseBoardArtifactJsonl,
  proposalJsonlRecordArtifactSchema,
  serializeBoardArtifact,
  stableBoardArtifactId,
  validateBoardEventArtifact,
  validateProjectBoardArtifactSet,
  validateProposalFinalArtifact,
  validateSourceSnapshotArtifact,
  type BoardConfigArtifact,
  type CardArtifact,
  type CharterArtifact,
  type SourceSnapshotArtifact,
} from "./projectBoardArtifacts";
import { projectBoardClarificationDecisionId } from "../shared/projectBoardClarificationDecisions";

const now = "2026-05-04T12:00:00.000Z";

function boardConfig(overrides: Partial<BoardConfigArtifact> = {}): BoardConfigArtifact {
  return {
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    boardId: "board-starship",
    title: "Starship board",
    status: "active",
    summary: "Dogfood board",
    collaboration: { mode: "local" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function charter(overrides: Partial<CharterArtifact> = {}): CharterArtifact {
  return {
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    charterId: "charter-1",
    boardId: "board-starship",
    version: 1,
    status: "active",
    goal: "Create a playable starship MVP.",
    currentState: "Design document and shell exist.",
    targetUser: "Players who like fast 2D space action.",
    nonGoals: [],
    qualityBar: "Every card needs unit, integration, visual, or manual proof.",
    testPolicy: {},
    decisionPolicy: {},
    dependencyPolicy: {},
    budgetPolicy: {},
    sourcePolicy: {},
    markdown: "# Starship board\n",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sourceSnapshot(overrides: Partial<SourceSnapshotArtifact> = {}): SourceSnapshotArtifact {
  return {
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    snapshotId: "source-snapshot-1",
    boardId: "board-starship",
    createdAt: now,
    sources: [
      {
        sourceId: "source-gdd",
        sourceKey: "file:GAME_DESIGN_DOCUMENT.md",
        kind: "functional_spec",
        changeState: "new",
        title: "THE LAST VECTOR",
        summary: "Game design document.",
        path: "GAME_DESIGN_DOCUMENT.md",
        contentHash: "a".repeat(64),
        byteSize: 18_000,
      },
    ],
    ...overrides,
  };
}

function card(overrides: Partial<CardArtifact> = {}): CardArtifact {
  return {
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    cardId: "card-shell",
    boardId: "board-starship",
    title: "Create the PixiJS shell",
    description: "Create the browser game shell.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Foundation",
    labels: ["foundation"],
    blockedBy: [],
    unresolvedBlockers: [],
    acceptanceCriteria: ["The app mounts one nonblank canvas."],
    testPlan: {
      unit: ["Cover shell configuration helpers."],
      integration: ["Run the app and verify canvas mount."],
      visual: ["Capture a nonblank canvas screenshot."],
      manual: ["Resize the window and confirm stability."],
    },
    sourceKind: "board_synthesis",
    sourceId: "synthesis:shell",
    sourceRefs: [{ sourceId: "source-gdd", range: "section:3.1" }],
    clarificationQuestions: [],
    clarificationAnswers: [],
    clarificationDecisions: [],
    runFeedback: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("project board artifact protocol", () => {
  it("validates a sample board artifact set with cards, sources, charter, and events", () => {
    const shell = card();
    const controls = card({
      cardId: "card-controls",
      sourceId: "synthesis:controls",
      title: "Implement ship controls",
      blockedBy: ["card-shell"],
      priority: 2,
    });

    const result = validateProjectBoardArtifactSet({
      config: boardConfig({ activeCharterId: "charter-1" }),
      charter: charter(),
      sourceSnapshots: [sourceSnapshot()],
      cards: [shell, controls],
      events: [
        {
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          eventId: "evt-board-created",
          boardId: "board-starship",
          type: "board.created",
          entityKind: "board",
          entityId: "board-starship",
          createdAt: now,
          payload: { title: "Starship board" },
        },
      ],
    });

    expect(result.cards.map((item) => item.cardId)).toEqual(["card-shell", "card-controls"]);
    expect(result.sourceSnapshots[0].sources[0].sourceId).toBe("source-gdd");
  });

  it("accepts priority 0 cards so a UI-set minimum priority cannot block git export", () => {
    const parsed = cardArtifactSchema.parse(card({ priority: 0 }));
    expect(parsed.priority).toBe(0);
    expect(() => cardArtifactSchema.parse(card({ priority: -1 }))).toThrow();
  });

  it("normalizes legacy clarification decision artifacts without ids or canonical keys", () => {
    const question = "Should keyboard shortcuts use single-letter accelerators?";
    const parsed = cardArtifactSchema.parse({
      ...card({
        candidateStatus: "needs_clarification",
      }),
      clarificationDecisions: [
        {
          question,
          source: "card",
          state: "open",
          suggestedAnswer: "Use standard modifier shortcuts instead of single-letter accelerators.",
          rationale: "Modifier shortcuts avoid interfering with normal text input.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });

    expect(parsed.clarificationDecisions?.[0]).toMatchObject({
      id: projectBoardClarificationDecisionId(question),
      question,
      canonicalKey: expect.any(String),
      state: "open",
      suggestedAnswer: "Use standard modifier shortcuts instead of single-letter accelerators.",
      safeToAccept: true,
      questionKind: "expert_default",
    });
  });

  it("preserves UI mock gating metadata on card and proposal artifacts", () => {
    const parsedCard = cardArtifactSchema.parse(
      card({
        uiMockRole: "gated_implementation",
        requiresUiMockApproval: true,
      }),
    );
    expect(parsedCard).toMatchObject({
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });

    const parsedProposal = validateProposalFinalArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      proposalId: "proposal-ui-gate",
      boardId: "board-starship",
      status: "pending",
      summary: "Add UI mock gated cards.",
      goal: "Build the board safely.",
      currentState: "No UI mock approved yet.",
      targetUser: "Project board reviewer.",
      qualityBar: "UI implementation waits for mock approval.",
      assumptions: [],
      questions: [],
      answers: [],
      sourceNotes: [],
      cards: [
        {
          sourceId: "synthesis:ui",
          title: "Implement the UI",
          description: "Build the approved UI.",
          candidateStatus: "ready_to_create",
          labels: ["ui"],
          blockedBy: ["synthesis:ux-mock-approval"],
          acceptanceCriteria: ["The UI matches the approved mock."],
          testPlan: { unit: [], integration: [], visual: ["Compare against the mock."], manual: [] },
          sourceRefs: ["docs/ui.md"],
          clarificationQuestions: [],
          clarificationDecisions: [],
          objectiveProvenance: undefined,
          uiMockRole: "gated_implementation",
          requiresUiMockApproval: true,
          reviewStatus: "accepted",
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    expect(parsedProposal.cards[0]).toMatchObject({
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    });
  });

  it("rejects duplicate cards, missing blockers, and missing source references", () => {
    expect(() =>
      validateProjectBoardArtifactSet({
        config: boardConfig(),
        sourceSnapshots: [sourceSnapshot()],
        cards: [
          card(),
          card({
            cardId: "card-shell",
            sourceId: "synthesis:controls",
            blockedBy: ["missing-card"],
            sourceRefs: [{ sourceId: "missing-source" }],
          }),
        ],
      }),
    ).toThrow(/duplicate card id card-shell[\s\S]*missing dependency missing-card[\s\S]*missing source missing-source/);
  });

  it("validates run manifests, proof packets, and handoffs against their cards", () => {
    const result = validateProjectBoardArtifactSet({
      config: boardConfig(),
      cards: [card()],
      runManifests: [
        {
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: "run-shell-1",
          boardId: "board-starship",
          cardId: "card-shell",
          status: "completed",
          startedAt: now,
          updatedAt: now,
          completedAt: now,
        },
      ],
      runProofs: [
        {
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: "run-shell-1",
          boardId: "board-starship",
          cardId: "card-shell",
          summary: "The app mounts and renders a canvas.",
          changedFiles: ["src/game.ts"],
          createdAt: now,
        },
      ],
      runHandoffs: [
        {
          schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
          runId: "run-shell-1",
          boardId: "board-starship",
          cardId: "card-shell",
          summary: "Shell is ready for controls work.",
          completed: ["Created PixiJS app shell."],
          remaining: ["Implement controls."],
          risks: [],
          followUps: [{ title: "Tune resize behavior", reason: "Keep visual proof stable.", blockedBy: ["card-shell"] }],
          createdAt: now,
        },
      ],
    });

    expect(result.runManifests[0]).toMatchObject({ runId: "run-shell-1", status: "completed" });
    expect(result.runProofs[0].changedFiles).toEqual(["src/game.ts"]);
  });

  it("rejects run proof and handoff artifacts that do not match their manifest", () => {
    expect(() =>
      validateProjectBoardArtifactSet({
        config: boardConfig(),
        cards: [card()],
        runManifests: [
          {
            schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
            runId: "run-shell-1",
            boardId: "board-starship",
            cardId: "card-shell",
            status: "completed",
            startedAt: now,
            updatedAt: now,
          },
        ],
        runProofs: [
          {
            schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
            runId: "run-shell-1",
            boardId: "board-starship",
            cardId: "missing-card",
            summary: "Proof points at the wrong card.",
            createdAt: now,
          },
        ],
      }),
    ).toThrow(/run proof run-shell-1 references card missing-card, not manifest card card-shell[\s\S]*references missing card missing-card/);
  });

  it("validates JSONL records independently with line-numbered errors", () => {
    const valid = [
      JSON.stringify({ type: "progress", stage: "planning", title: "Planning", summary: "Reading source.", createdAt: now }),
      JSON.stringify({
        type: "candidate_card",
        sourceId: "synthesis:shell",
        title: "Create shell",
        description: "Create the shell.",
        acceptanceCriteria: ["Canvas mounts."],
        testPlan: { unit: [], integration: ["Run app."], visual: ["Screenshot."], manual: [] },
      }),
    ].join("\n");

    const records = parseBoardArtifactJsonl(valid, proposalJsonlRecordArtifactSchema, "proposal");
    expect(records.map((record) => record.type)).toEqual(["progress", "candidate_card"]);

    expect(() =>
      parseBoardArtifactJsonl(
        `${valid}\n${JSON.stringify({ type: "dependency_edge", fromCardId: "card-a", toCardId: "card-a", createdAt: now })}`,
        proposalJsonlRecordArtifactSchema,
        "proposal",
      ),
    ).toThrow(/proposal line 3/);
  });

  it("serializes artifacts with deterministic key ordering and stable ids", () => {
    expect(serializeBoardArtifact({ z: 1, nested: { b: true, a: false }, a: 2 })).toBe(
      '{\n  "a": 2,\n  "nested": {\n    "a": false,\n    "b": true\n  },\n  "z": 1\n}\n',
    );
    expect(stableBoardArtifactId("card", ["Create shell", "Foundation"])).toBe(stableBoardArtifactId("card", ["Create shell", "Foundation"]));
    expect(stableBoardArtifactId("card", ["Create shell", "Foundation"])).toMatch(/^card-create-shell-foundation-[a-f0-9]{10}$/);
  });

  it("rejects paths that are absolute or escape the project root", () => {
    expect(() => validateSourceSnapshotArtifact(sourceSnapshot({ sources: [{ ...sourceSnapshot().sources[0], path: "../secret.md" }] }))).toThrow(
      /project-relative path/,
    );
    expect(() => validateCardArtifactWithAbsoluteSource()).toThrow(/project-relative path/);
  });

  it("validates event types and builds dated event artifact paths", () => {
    expect(() =>
      validateBoardEventArtifact({
        schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
        eventId: "evt-1",
        boardId: "board-starship",
        type: "card.started",
        createdAt: now,
        payload: {},
      }),
    ).toThrow(/type/);

    expect(
      boardEventArtifactPath({
        eventId: "evt-card-claimed",
        createdAt: "2026-05-04T12:34:56.789Z",
      }),
    ).toBe(".ambient/board/events/2026/05/04/20260504T123456789Z-evt-card-claimed.json");
  });
});

function validateCardArtifactWithAbsoluteSource(): CardArtifact {
  return cardArtifactSchema.parse(card({ sourceRefs: [{ path: "/tmp/source.md" }] }));
}
