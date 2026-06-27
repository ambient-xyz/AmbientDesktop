import { describe, expect, it } from "vitest";

import {
  dedupeProjectBoardSynthesisRunProgressiveRecords,
  mapProjectBoardSynthesisProposalRow,
  mapProjectBoardSynthesisRunRow,
  normalizeProjectBoardPlanningSnapshot,
  projectBoardPlanningStableHash,
  projectBoardPlanningStableJson,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
} from "./projectBoardMappers";

describe("project board synthesis row mappers", () => {
  it("maps project board synthesis proposal rows with normalized answers, cards, and review reports", () => {
    const proposal = mapProjectBoardSynthesisProposalRow({
      id: "proposal-1",
      board_id: "board-1",
      status: "pending",
      summary: "Review the plan.",
      goal: "Ship the shell.",
      current_state: "Empty app.",
      target_user: "Operators",
      quality_bar: "Works end to end.",
      assumptions_json: JSON.stringify([" Existing renderer ", 42, "Small first slice"]),
      questions_json: JSON.stringify(["Which renderer?"]),
      answers_json: JSON.stringify([
        { questionIndex: 0, question: "Which renderer?", answer: "Use React." },
        { questionIndex: -1, answer: "Dropped." },
      ]),
      source_notes_json: JSON.stringify(["README.md"]),
      cards_json: JSON.stringify([
        {
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Build the first shell.",
          candidateStatus: "ready_to_create",
          labels: ["shell", 7],
          testPlan: { unit: ["mapper parity"], integration: [], visual: [], manual: [] },
          reviewStatus: "accepted",
        },
      ]),
      review_report_json: JSON.stringify({
        readiness: "ready_for_card_generation",
        summary: "Ready to turn into cards.",
        sourceConfidence: "high",
        sourceConfidenceNotes: ["Sources agree."],
        gitState: "git_ready",
        gitStateNotes: ["Branch is clean."],
        blockingQuestions: [],
        risks: ["Keep the slice small."],
        sourceConflicts: [],
        sourceAuthorityNotes: [],
        recommendedActivationScope: "Create the initial shell card.",
        cardGenerationConstraints: ["Avoid cleanup."],
      }),
      model: "test-model",
      duration_ms: 1234,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      applied_at: null,
    });

    expect(proposal).toMatchObject({
      id: "proposal-1",
      boardId: "board-1",
      status: "pending",
      summary: "Review the plan.",
      goal: "Ship the shell.",
      currentState: "Empty app.",
      targetUser: "Operators",
      qualityBar: "Works end to end.",
      assumptions: [" Existing renderer ", "Small first slice"],
      questions: ["Which renderer?"],
      answers: [{ questionIndex: 0, question: "Which renderer?", answer: "Use React.", answeredAt: "2026-01-01T00:01:00.000Z" }],
      sourceNotes: ["README.md"],
      cards: [
        expect.objectContaining({
          sourceId: "synthesis:shell",
          title: "Create shell",
          labels: ["shell"],
          testPlan: { unit: ["mapper parity"], integration: [], visual: [], manual: [] },
          reviewStatus: "accepted",
        }),
      ],
      reviewReport: {
        readiness: "ready_for_card_generation",
        summary: "Ready to turn into cards.",
        sourceConfidence: "high",
        sourceConfidenceNotes: ["Sources agree."],
        gitState: "git_ready",
        gitStateNotes: ["Branch is clean."],
        blockingQuestions: [],
        risks: ["Keep the slice small."],
        sourceConflicts: [],
        sourceAuthorityNotes: [],
        recommendedActivationScope: "Create the initial shell card.",
        cardGenerationConstraints: ["Avoid cleanup."],
      },
      model: "test-model",
      durationMs: 1234,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      appliedAt: undefined,
    });
  });

  it("maps project board synthesis proposal rows with empty collections when JSON is invalid", () => {
    const proposal = mapProjectBoardSynthesisProposalRow({
      id: "proposal-2",
      board_id: "board-1",
      status: "superseded",
      summary: "",
      goal: "",
      current_state: "",
      target_user: "",
      quality_bar: "",
      assumptions_json: "not json",
      questions_json: "not json",
      answers_json: "not json",
      source_notes_json: "not json",
      cards_json: "not json",
      review_report_json: "{}",
      model: null,
      duration_ms: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      applied_at: null,
    });

    expect(proposal).toEqual({
      id: "proposal-2",
      boardId: "board-1",
      status: "superseded",
      summary: "",
      goal: "",
      currentState: "",
      targetUser: "",
      qualityBar: "",
      assumptions: [],
      questions: [],
      answers: [],
      sourceNotes: [],
      cards: [],
      reviewReport: undefined,
      model: undefined,
      durationMs: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      appliedAt: undefined,
    });
  });

  it("dedupes project board synthesis run progressive records by serialized record identity", () => {
    const candidate = { type: "candidate_card", sourceId: "synthesis:shell", title: "Create shell" };
    const sameValuesDifferentOrder = { title: "Create shell", sourceId: "synthesis:shell", type: "candidate_card" };
    expect(dedupeProjectBoardSynthesisRunProgressiveRecords([candidate, candidate, sameValuesDifferentOrder] as never)).toEqual([
      candidate,
      sameValuesDifferentOrder,
    ]);
  });

  it("summarizes project board synthesis run progressive records with rendered-card ledger details", () => {
    const summary = summarizeProjectBoardSynthesisRunProgressiveRecords([
      {
        type: "candidate_card",
        sourceId: "synthesis:shell",
        title: " Create shell ",
        candidateStatus: "ready_to_create",
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-1" }],
      },
      {
        type: "question",
        questionId: "question:shell",
        question: " Which renderer should the shell use? ",
      },
      { type: "proposal_final" },
      { type: "source_coverage", sourceId: "source-1", status: "covered" },
      { type: "dependency_edge", fromCardId: "synthesis:shell", toCardId: "synthesis:api" },
      { type: "warning", code: "section_batch_card_limit", message: " Too many cards. " },
      { type: "error", code: "section_semantic_idle_timeout", message: " Section stalled. " },
      { type: "progress", metadata: { sectionStatus: "succeeded", sectionHeading: "Auth" } },
      { type: "progress", metadata: { sectionStatus: "failed", sectionHeading: "Billing" } },
      { type: "progress", metadata: { sectionStatus: "skipped", sectionHeading: "Reports" } },
    ] as never);

    expect(summary).toMatchObject({
      recordCount: 10,
      candidateCardCount: 1,
      questionCount: 1,
      proposalFinalCount: 1,
      sourceCoverageCount: 1,
      dependencyEdgeCount: 1,
      warningCount: 1,
      errorCount: 1,
      semanticIdleSectionCount: 1,
      sectionSucceededCount: 1,
      sectionFailedCount: 1,
      sectionSkippedCount: 1,
      latestCandidateCardTitle: "Create shell",
      latestQuestion: "Which renderer should the shell use?",
      latestWarning: "Too many cards.",
      latestError: "Section stalled.",
      latestSectionHeading: "Reports",
      renderedCardCount: 1,
      renderedCardBlockedCount: 0,
      renderedCardDuplicateCount: 0,
      renderedCardRejectedCount: 0,
      renderedCardEvidenceCount: 0,
      renderedCardSplitLineageCount: 0,
      renderedCardInvalidatedCount: 0,
      renderedCardLedgerChecksum: expect.stringMatching(/^rendered-card-ledger-/),
      renderedCardLedger: [
        expect.objectContaining({
          cardId: "synthesis:shell",
          title: "Create shell",
          candidateStatus: "ready_to_create",
          renderFingerprint: expect.stringMatching(/^rendered-card-/),
        }),
      ],
    });
  });

  it("maps project board synthesis run rows with normalized records, snapshots, and events", () => {
    const run = mapProjectBoardSynthesisRunRow({
      id: "run-1",
      board_id: "board-1",
      proposal_id: "proposal-1",
      retry_of_run_id: "run-0",
      status: "succeeded",
      stage: "schema_validation",
      model: "test-model",
      source_count: 3,
      included_source_count: 2,
      source_char_count: 1234,
      prompt_char_count: 200,
      response_char_count: 300,
      card_count: 4,
      question_count: 1,
      warning_count: 1,
      error: null,
      events_json: JSON.stringify([
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated records.",
          metadata: { cardCount: 4 },
          createdAt: "2026-01-01T00:02:00.000Z",
        },
        { stage: "unsupported", title: "Dropped" },
      ]),
      progressive_records_json: JSON.stringify([
        { type: "question", question: "Clarify scope?" },
        { type: "warning", message: "Needs review." },
        { type: " " },
      ]),
      planning_snapshots_json: JSON.stringify([
        {
          id: "snapshot-1",
          boardId: "board-1",
          runId: "run-1",
          kind: "final",
          planningStage: "schema_validation",
          planningStatus: "succeeded",
          createdAt: "",
          sourceHashes: [{ sourceId: "source-1", kind: "markdown", path: "README.md" }],
          cardIds: ["card-1"],
          cards: [
            {
              cardId: "card-1",
              sourceId: "synthesis:shell",
              sourceKind: "board_synthesis",
              title: "Create shell",
              status: "draft",
              candidateStatus: "ready_to_create",
              renderFingerprint: "rendered-card-1",
            },
          ],
          cardCount: 1,
          readyCandidateCount: 1,
          ticketizedCount: 0,
        },
      ]),
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:03:00.000Z",
      completed_at: "2026-01-01T00:04:00.000Z",
    });

    expect(run).toMatchObject({
      id: "run-1",
      boardId: "board-1",
      proposalId: "proposal-1",
      retryOfRunId: "run-0",
      status: "succeeded",
      stage: "schema_validation",
      model: "test-model",
      sourceCount: 3,
      includedSourceCount: 2,
      sourceCharCount: 1234,
      promptCharCount: 200,
      responseCharCount: 300,
      cardCount: 4,
      questionCount: 1,
      warningCount: 1,
      progressiveRecordCount: 2,
      progressiveSummary: {
        recordCount: 2,
        questionCount: 1,
        warningCount: 1,
        latestQuestion: "Clarify scope?",
        latestWarning: "Needs review.",
      },
      events: [
        {
          stage: "schema_validation",
          title: "Validated schema",
          summary: "Validated records.",
          metadata: { cardCount: 4 },
          createdAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:03:00.000Z",
      completedAt: "2026-01-01T00:04:00.000Z",
    });
    expect(run.progressiveRecords).toEqual([
      { type: "question", question: "Clarify scope?" },
      { type: "warning", message: "Needs review." },
    ]);
    expect(run.planningSnapshots).toEqual([
      expect.objectContaining({
        id: "snapshot-1",
        boardId: "board-1",
        runId: "run-1",
        kind: "final",
        planningStatus: "succeeded",
        planningStage: "schema_validation",
        createdAt: "2026-01-01T00:03:00.000Z",
        cardIds: ["card-1"],
        cards: [expect.objectContaining({ cardId: "card-1", sourceId: "synthesis:shell", renderFingerprint: "rendered-card-1" })],
      }),
    ]);
  });

  it("maps project board synthesis run rows with empty optional collections when JSON is invalid", () => {
    const run = mapProjectBoardSynthesisRunRow({
      id: "run-2",
      board_id: "board-1",
      proposal_id: null,
      retry_of_run_id: null,
      status: "running",
      stage: "model_request",
      model: null,
      source_count: 0,
      included_source_count: 0,
      source_char_count: 0,
      prompt_char_count: null,
      response_char_count: null,
      card_count: null,
      question_count: null,
      warning_count: 0,
      error: null,
      events_json: "not json",
      progressive_records_json: "not json",
      planning_snapshots_json: null,
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: null,
    });

    expect(run).toEqual({
      id: "run-2",
      boardId: "board-1",
      proposalId: undefined,
      retryOfRunId: undefined,
      status: "running",
      stage: "model_request",
      model: undefined,
      sourceCount: 0,
      includedSourceCount: 0,
      sourceCharCount: 0,
      promptCharCount: undefined,
      responseCharCount: undefined,
      cardCount: undefined,
      questionCount: undefined,
      warningCount: 0,
      error: undefined,
      events: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      completedAt: undefined,
    });
  });

  it("normalizes project board planning snapshots conservatively", () => {
    const fallbackCreatedAt = "2026-01-01T00:00:00.000Z";
    const sourceHashes = [
      {
        sourceId: "source-1",
        kind: "implementation_file",
        sourceKey: "source-key-1",
        path: "src/App.tsx",
        contentHash: "hash-1",
        changeState: "changed",
        includeInSynthesis: true,
      },
    ];
    const cards = [
      {
        cardId: "card-1",
        sourceId: "source-1",
        sourceKind: "manual",
        title: "Create shell",
        status: "blocked",
        candidateStatus: "ready_to_create",
        sourceRefs: ["source-1"],
        blockedBy: ["card-0"],
        renderFingerprint: "card-fingerprint-1",
        orchestrationTaskId: "task-1",
      },
    ];

    expect(
      normalizeProjectBoardPlanningSnapshot(
        {
          id: " snapshot-1 ",
          boardId: " board-1 ",
          runId: " run-1 ",
          kind: "final",
          planningStatus: "unsupported",
          planningStage: "schema_validation",
          createdAt: "  ",
          cardCount: 2.6,
          readyCandidateCount: -2,
          ticketizedCount: Number.NaN,
          sourceHashes: [
            {
              sourceId: " source-1 ",
              kind: "implementation_file",
              sourceKey: " source-key-1 ",
              path: " src/App.tsx ",
              contentHash: " hash-1 ",
              changeState: "changed",
              includeInSynthesis: true,
            },
            { sourceId: "", kind: "markdown" },
            { sourceId: "source-2", kind: "unsupported" },
          ],
          cardIds: [" card-1 ", "", 42],
          cards: [
            {
              cardId: " card-1 ",
              sourceId: " source-1 ",
              sourceKind: "manual",
              title: "Create shell",
              status: "blocked",
              candidateStatus: "ready_to_create",
              sourceRefs: ["source-1", 42],
              blockedBy: ["card-0", null],
              renderFingerprint: " card-fingerprint-1 ",
              orchestrationTaskId: " task-1 ",
            },
            { cardId: "card-2", sourceId: "source-1", renderFingerprint: "  " },
          ],
          renderFingerprint: "",
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([
      {
        id: "snapshot-1",
        boardId: "board-1",
        runId: "run-1",
        kind: "final",
        planningStatus: "running",
        planningStage: "schema_validation",
        createdAt: fallbackCreatedAt,
        cardCount: 3,
        readyCandidateCount: 0,
        ticketizedCount: 0,
        sourceHashes,
        cardIds: [" card-1 "],
        cards,
        renderFingerprint: projectBoardPlanningStableHash("planning-snapshot", { sourceHashes, cards }),
      },
    ]);

    expect(normalizeProjectBoardPlanningSnapshot({ id: "   " } as never, fallbackCreatedAt)).toEqual([]);
    expect(
      normalizeProjectBoardPlanningSnapshot(
        {
          id: "snapshot-2",
          boardId: "board-1",
          runId: "run-1",
          kind: "final",
          planningStatus: "running",
          planningStage: "unsupported",
        } as never,
        fallbackCreatedAt,
      ),
    ).toEqual([]);
  });

  it("serializes project board planning hash inputs stably", () => {
    expect(projectBoardPlanningStableJson({ b: 2, a: [{ z: true, y: null }] })).toBe('{"a":[{"y":null,"z":true}],"b":2}');
    expect(projectBoardPlanningStableHash("prefix", { b: 2, a: 1 })).toBe(projectBoardPlanningStableHash("prefix", { a: 1, b: 2 }));
  });
});
