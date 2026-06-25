import { describe, expect, it } from "vitest";

import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type { ProjectBoardCharter, ProjectBoardEvent } from "../../shared/projectBoardTypes";

import {
  dedupeProjectBoardSynthesisRunProgressiveRecords,
  mapProjectBoardCardProofReview,
  mapProjectBoardCardRow,
  mapProjectBoardCardSplitOutcome,
  mapProjectBoardCharterRow,
  mapProjectBoardEventRow,
  mapProjectBoardExecutionArtifactRow,
  mapProjectBoardQuestionRow,
  mapProjectBoardRow,
  mapProjectBoardSourceRow,
  mapProjectBoardSynthesisProposalRow,
  mapProjectBoardSynthesisRunRow,
  normalizeProjectBoardPlanningSnapshot,
  parseProjectBoardCardTestPlan,
  parseProjectBoardCardTouchedFields,
  parseProjectBoardStringList,
  projectBoardCardRowIsClosedDone,
  projectBoardPlanningStableHash,
  projectBoardPlanningStableJson,
  projectBoardProofReviewApplicationBlocker,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
} from "./projectBoardMappers";
import {
  orchestrationTask,
  projectBoardCard,
  projectBoardCardRow,
  projectBoardQuestion,
  projectBoardRow,
  projectBoardSource,
} from "./projectBoardMappersTestSupport";

describe("project board store row mappers", () => {
  it("maps project board summary rows with preloaded related data", () => {
    const charter: ProjectBoardCharter = {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Ship the shell.",
      currentState: "Prototype exists.",
      targetUser: "Operators",
      nonGoals: [],
      qualityBar: "Reliable.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Charter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    const claim = {
      status: "active" as const,
      cardId: "card-1",
      runId: "run-1",
      agentId: "agent-1",
      eventId: "event-1",
      claimedAt: "2026-01-01T00:02:00.000Z",
      ownedByLocal: false,
    };
    const card = projectBoardCard({ claim });
    const source = projectBoardSource({ id: "source-1" });
    const question = projectBoardQuestion({ id: "question-1" });
    const event: ProjectBoardEvent = {
      id: "event-1",
      boardId: "board-1",
      kind: "board_created",
      title: "Board created",
      summary: "Created.",
      metadata: {},
      createdAt: "2026-01-01T00:02:00.000Z",
    };

    expect(
      mapProjectBoardRow({
        row: projectBoardRow({ charter_id: "charter-1", active_draft_id: "draft-1" }),
        charter,
        cards: [card],
        sources: [source],
        questions: [question],
        proposals: [],
        synthesisRuns: [],
        executionArtifacts: [],
        events: [event],
        claims: { active: [claim], expired: [], conflicts: [] },
      }),
    ).toEqual({
      id: "board-1",
      projectPath: "/workspace/project",
      status: "active",
      title: "Project Board",
      summary: "Board summary",
      charterId: "charter-1",
      charter,
      activeDraftId: "draft-1",
      cards: [card],
      sources: [source],
      questions: [question],
      proposals: [],
      synthesisRuns: [],
      executionArtifacts: [],
      events: [event],
      claims: { active: [claim], expired: [], conflicts: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
  });

  it("maps project board card rows with linked task projection and persisted metadata", () => {
    const mapped = mapProjectBoardCardRow(
      projectBoardCardRow({
        id: "card-row-7",
        status: "ready",
        priority: 3,
        phase: "Implementation",
        labels_json: JSON.stringify(["shell", "ui"]),
        blocked_by_json: JSON.stringify(["LOCAL-1"]),
        acceptance_criteria_json: JSON.stringify(["Canvas renders.", "Shell opens."]),
        test_plan_json: JSON.stringify({ unit: ["mapper unit"], integration: ["store integration"], visual: [], manual: ["review"] }),
        source_refs_json: JSON.stringify(["docs/plan.md"]),
        clarification_questions_json: JSON.stringify(["Which shell?"]),
        clarification_answers_json: JSON.stringify([
          { question: "Which shell?", answer: "Desktop.", answeredAt: "2026-01-01T00:02:00.000Z" },
        ]),
        run_feedback_json: JSON.stringify([{ feedback: "Carry source context forward.", source: "source_impact" }]),
        objective_provenance_json: JSON.stringify({
          objective: "Ship the shell.",
          groundingMode: "selected_sources",
          selectedSourceIds: [" source-1 ", "source-2"],
          sourceRefCount: 2,
        }),
        ui_mock_role: "mock_gate",
        requires_ui_mock_approval: 1,
        source_thread_id: "thread-1",
        source_message_id: "message-1",
        orchestration_task_id: "task-linked",
        execution_thread_id: "exec-thread-1",
        execution_session_policy: "fresh_context",
        proof_review_json: JSON.stringify({
          status: "ready_for_review",
          summary: "Ready for review.",
          satisfied: ["Unit proof."],
          missing: [],
          followUpCardIds: [],
          runId: "run-1",
          reviewedAt: "2026-01-01T00:04:00.000Z",
        }),
        split_outcome_json: JSON.stringify({
          status: "proposed",
          source: "manual",
          sourceRunId: "run-1",
          reason: "Split follow-up.",
          partialProofSummary: "Some work done.",
          completedCriteria: ["Unit proof."],
          remainingCriteria: ["Visual proof."],
          childCardIds: ["child-1"],
          createdAt: "2026-01-01T00:05:00.000Z",
          updatedAt: "2026-01-01T00:06:00.000Z",
        }),
        user_touched_fields_json: JSON.stringify(["title", "labels", "unsupported"]),
        user_touched_at: "2026-01-01T00:07:00.000Z",
        pending_pi_update_json: JSON.stringify({
          sourceId: "synthesis:shell",
          createdAt: "2026-01-01T00:08:00.000Z",
          changedFields: ["title"],
          title: "Create shell v2",
        }),
      }),
      [orchestrationTask({ id: "task-linked", state: "needs review" })],
    );

    expect(mapped).toMatchObject({
      id: "card-row-7",
      boardId: "board-1",
      status: "review",
      priority: 3,
      phase: "Implementation",
      labels: ["shell", "ui"],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Canvas renders.", "Shell opens."],
      testPlan: { unit: ["mapper unit"], integration: ["store integration"], visual: [], manual: ["review"] },
      sourceRefs: ["docs/plan.md"],
      clarificationQuestions: ["Which shell?"],
      runFeedback: [{ feedback: "Carry source context forward.", source: "source_impact" }],
      objectiveProvenance: {
        objective: "Ship the shell.",
        groundingMode: "selected_sources",
        selectedSourceIds: ["source-1", "source-2"],
        sourceRefCount: 2,
        weakGrounding: false,
      },
      uiMockRole: "mock_gate",
      requiresUiMockApproval: true,
      sourceThreadId: "thread-1",
      sourceMessageId: "message-1",
      orchestrationTaskId: "task-linked",
      executionThreadId: "exec-thread-1",
      executionSessionPolicy: "fresh_context",
      proofReview: {
        status: "ready_for_review",
        summary: "Ready for review.",
      },
      splitOutcome: {
        status: "proposed",
        source: "manual",
        childCardIds: ["child-1"],
      },
      userTouchedFields: ["title", "labels"],
      userTouchedAt: "2026-01-01T00:07:00.000Z",
      pendingPiUpdate: {
        sourceId: "synthesis:shell",
        title: "Create shell v2",
        changedFields: ["title"],
      },
    });
  });

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

  it("parses persisted string lists conservatively", () => {
    expect(parseProjectBoardStringList(JSON.stringify(["a", 1, "b"]))).toEqual(["a", "b"]);
    expect(parseProjectBoardStringList(JSON.stringify({ a: "b" }))).toEqual([]);
    expect(parseProjectBoardStringList("not json")).toEqual([]);
    expect(parseProjectBoardStringList(null)).toEqual([]);
  });

  it("filters touched fields to supported project board card fields", () => {
    expect(
      parseProjectBoardCardTouchedFields(
        JSON.stringify(["candidateStatus", "dependencies", "clarificationDecisions", "uiMockMetadata", "bogus"]),
      ),
    ).toEqual(["candidateStatus", "dependencies", "clarificationDecisions", "uiMockMetadata"]);
  });

  it("maps project board card split outcomes conservatively", () => {
    expect(
      mapProjectBoardCardSplitOutcome(
        JSON.stringify({
          status: "approved",
          source: "unsupported",
          sourceRunId: "run-1",
          reason: "Split is ready.",
          partialProofSummary: "Parent proof is partial.",
          completedCriteria: ["Shell exists.", 42],
          remainingCriteria: ["Wire visual state."],
          childCardIds: ["card-2", null, "card-3"],
          maxRuntimeMs: 120000,
          elapsedMs: Number.NaN,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:01:00.000Z",
        }),
      ),
    ).toEqual({
      status: "approved",
      source: "manual",
      sourceRunId: "run-1",
      reason: "Split is ready.",
      partialProofSummary: "Parent proof is partial.",
      completedCriteria: ["Shell exists."],
      remainingCriteria: ["Wire visual state."],
      childCardIds: ["card-2", "card-3"],
      maxRuntimeMs: 120000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(mapProjectBoardCardSplitOutcome(JSON.stringify({ status: "unsupported" }))).toBeUndefined();
    expect(mapProjectBoardCardSplitOutcome("not json")).toBeUndefined();
  });

  it("maps project board card proof reviews conservatively", () => {
    const rawFollowUpSuggestion = {
      title: "Capture visual proof",
      labels: ["proof"],
    };
    const mapped = mapProjectBoardCardProofReview(
      JSON.stringify({
        status: "needs_follow_up",
        summary: "More proof is needed.",
        satisfied: ["Unit proof recorded.", 7],
        missing: ["Visual proof missing.", null],
        followUpCardIds: ["card-2", false, "card-3"],
        runId: "run-1",
        reviewedAt: "2026-01-01T00:02:00.000Z",
        reviewer: "ambient_pi",
        model: "gmi-test-model",
        confidence: 0.82,
        evidenceQuality: "mixed",
        recommendedAction: "follow_up",
        deterministicStatus: "ready_for_review",
        deterministicSummary: "Deterministic checks need visual proof.",
        judgeDurationMs: 1200,
        followUpSuggestion: rawFollowUpSuggestion,
      }),
      (value) =>
        value && typeof value === "object" && !Array.isArray(value) && (value as { title?: unknown }).title === rawFollowUpSuggestion.title
          ? { title: "Capture visual proof", labels: ["proof"] }
          : undefined,
    );

    expect(mapped).toEqual({
      status: "needs_follow_up",
      summary: "More proof is needed.",
      satisfied: ["Unit proof recorded."],
      missing: ["Visual proof missing."],
      followUpCardIds: ["card-2", "card-3"],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:02:00.000Z",
      reviewer: "ambient_pi",
      model: "gmi-test-model",
      confidence: 0.82,
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
      deterministicStatus: "ready_for_review",
      deterministicSummary: "Deterministic checks need visual proof.",
      judgeDurationMs: 1200,
      followUpSuggestion: { title: "Capture visual proof", labels: ["proof"] },
    });
    expect(mapProjectBoardCardProofReview(JSON.stringify({ status: "unsupported" }))).toBeUndefined();
    expect(mapProjectBoardCardProofReview("not json")).toBeUndefined();
  });

  it("identifies stale project board proof review application blockers", () => {
    const proofReviewJson = (runId: string) =>
      JSON.stringify({
        status: "done",
        summary: "Proof accepted.",
        satisfied: [],
        missing: [],
        followUpCardIds: [],
        runId,
        reviewedAt: "2026-01-01T00:00:00.000Z",
      });

    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-newer",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-1"),
        requireCurrentReview: false,
      }),
    ).toBe("newer_run_started");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: null,
        requireCurrentReview: false,
      }),
    ).toBeUndefined();
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: null,
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_cleared");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-1"),
        requireCurrentReview: true,
      }),
    ).toBeUndefined();
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: proofReviewJson("run-old"),
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_superseded");
    expect(
      projectBoardProofReviewApplicationBlocker({
        latestRunId: "run-1",
        runId: "run-1",
        proofReviewJson: "not json",
        requireCurrentReview: true,
      }),
    ).toBe("proof_review_superseded");
  });

  it("detects closed done card rows from status and proof review", () => {
    expect(projectBoardCardRowIsClosedDone({ status: "done", proof_review_json: null })).toBe(true);
    expect(
      projectBoardCardRowIsClosedDone({
        status: "review",
        proof_review_json: JSON.stringify({
          status: "done",
          summary: "Proof is complete.",
          satisfied: ["All proof recorded."],
          missing: [],
          reviewedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBe(true);
    expect(
      projectBoardCardRowIsClosedDone({
        status: "review",
        proof_review_json: JSON.stringify({
          status: "needs_follow_up",
          summary: "More proof is needed.",
          satisfied: [],
          missing: ["Visual proof missing."],
          reviewedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
    ).toBe(false);
    expect(projectBoardCardRowIsClosedDone({ status: "review", proof_review_json: null })).toBe(false);
    expect(projectBoardCardRowIsClosedDone({ status: "review", proof_review_json: "not json" })).toBe(false);
  });

  it("parses persisted card test plans with the same conservative defaults", () => {
    expect(
      parseProjectBoardCardTestPlan(
        JSON.stringify({
          unit: [" unit ", 1, "unit"],
          integration: [" integration "],
          visual: "not-array",
          manual: [" manual "],
        }),
      ),
    ).toEqual({
      unit: ["unit"],
      integration: ["integration"],
      visual: [],
      manual: ["manual"],
    });
    expect(parseProjectBoardCardTestPlan("not json")).toEqual({ unit: [], integration: [], visual: [], manual: [] });
    expect(parseProjectBoardCardTestPlan(null)).toEqual({ unit: [], integration: [], visual: [], manual: [] });
  });

  it("maps project board execution artifact rows with JSON object fallbacks", () => {
    expect(
      mapProjectBoardExecutionArtifactRow({
        id: "artifact-1",
        board_id: "board-1",
        card_id: "card-1",
        status: "completed",
        source: "unexpected",
        agent_id: "agent-1",
        pi_session_id: null,
        workspace_branch: "feature/one",
        started_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
        completed_at: null,
        proof_json: JSON.stringify({
          summary: "Proof passed.",
          commands: ["pnpm test"],
          changedFiles: ["src/app.ts"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
          createdAt: "2026-01-01T00:01:00.000Z",
        }),
        handoff_json: "not json",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "artifact-1",
      boardId: "board-1",
      cardId: "card-1",
      status: "completed",
      source: "git",
      agentId: "agent-1",
      workspaceBranch: "feature/one",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      proof: {
        summary: "Proof passed.",
        commands: ["pnpm test"],
        changedFiles: ["src/app.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps project board source rows and derives a source key when missing", () => {
    const mapped = mapProjectBoardSourceRow({
      id: "source-1",
      board_id: "board-1",
      source_kind: "markdown",
      source_key: null,
      content_hash: "hash-1",
      change_state: "changed",
      title: "Spec",
      summary: "Source summary.",
      excerpt: null,
      path: "docs/spec.md",
      thread_id: null,
      artifact_id: null,
      message_id: null,
      byte_size: 123,
      mtime: null,
      classification_reason: "Useful source.",
      classified_by: "user",
      classification_confidence: 0.9,
      authority_role: "primary",
      include_in_synthesis: 1,
      relevance: 7,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
    });

    expect(mapped).toMatchObject({
      id: "source-1",
      boardId: "board-1",
      kind: "markdown",
      contentHash: "hash-1",
      changeState: "changed",
      title: "Spec",
      path: "docs/spec.md",
      byteSize: 123,
      classificationReason: "Useful source.",
      classifiedBy: "user",
      classificationConfidence: 0.9,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(mapped.sourceKey).toEqual(expect.any(String));
    expect(mapped.sourceKey?.length).toBeGreaterThan(0);
  });

  it("maps project board event rows with conservative metadata parsing", () => {
    expect(
      mapProjectBoardEventRow({
        id: "event-1",
        board_id: "board-1",
        event_kind: "card_updated",
        title: "Card updated",
        summary: "A card changed.",
        entity_kind: null,
        entity_id: "card-1",
        metadata_json: "not json",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "event-1",
      boardId: "board-1",
      kind: "card_updated",
      title: "Card updated",
      summary: "A card changed.",
      entityId: "card-1",
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps project board charter rows with conservative JSON policy parsing", () => {
    expect(
      mapProjectBoardCharterRow({
        id: "charter-1",
        board_id: "board-1",
        version: 2,
        status: "active",
        goal: "Ship the project.",
        current_state: "Draft exists.",
        target_user: "Operators",
        non_goals_json: JSON.stringify(["Rewrite everything", 42, "Skip proof"]),
        quality_bar: "High confidence proof.",
        test_policy_json: JSON.stringify({ unit: true }),
        decision_policy_json: "not json",
        dependency_policy_json: JSON.stringify(["not-object"]),
        budget_policy_json: JSON.stringify({ maxPassesPerCard: 3 }),
        source_policy_json: JSON.stringify({ includeMarkdown: true }),
        markdown: "# Charter",
        project_summary_json: JSON.stringify({
          summary: "Project summary.",
          majorSystems: ["board"],
          sourceCoverage: [],
          risks: [],
          dependencyHints: [],
          unresolvedDecisions: [],
          citations: [],
          coverageGaps: [],
          sourceChecksumSet: ["source-1:hash"],
          charterAnswerChecksum: "checksum",
          generatedAt: "2026-01-01T00:00:00.000Z",
          generator: "fallback_heuristic",
        }),
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
      }),
    ).toEqual({
      id: "charter-1",
      boardId: "board-1",
      version: 2,
      status: "active",
      goal: "Ship the project.",
      currentState: "Draft exists.",
      targetUser: "Operators",
      nonGoals: ["Rewrite everything", "Skip proof"],
      qualityBar: "High confidence proof.",
      testPolicy: { unit: true },
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: { maxPassesPerCard: 3 },
      sourcePolicy: { includeMarkdown: true },
      markdown: "# Charter",
      projectSummary: {
        summary: "Project summary.",
        majorSystems: ["board"],
        sourceCoverage: [],
        risks: [],
        dependencyHints: [],
        unresolvedDecisions: [],
        citations: [],
        coverageGaps: [],
        sourceChecksumSet: ["source-1:hash"],
        charterAnswerChecksum: "checksum",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generator: "fallback_heuristic",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
  });

  it("maps project board question rows and flags stale suggestions from source context", () => {
    const sources = [
      mapProjectBoardSourceRow({
        id: "source-1",
        board_id: "board-1",
        source_kind: "markdown",
        source_key: "file:docs/spec.md",
        content_hash: null,
        change_state: null,
        title: "Spec",
        summary: "Current product spec.",
        excerpt: null,
        path: "docs/spec.md",
        thread_id: null,
        artifact_id: null,
        message_id: null,
        byte_size: null,
        mtime: null,
        classification_reason: null,
        classified_by: null,
        classification_confidence: null,
        authority_role: "primary",
        include_in_synthesis: 1,
        relevance: 10,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
      }),
    ];
    const question = "What proof is required?";
    const contextFingerprint = projectBoardKickoffDefaultContextFingerprint({ question, sources });

    const mapped = mapProjectBoardQuestionRow(
      {
        id: "question-1",
        board_id: "board-1",
        question_order: 0,
        question,
        required: 1,
        answer: "Use the strict proof policy.",
        answered_at: "2026-01-01T00:02:00.000Z",
        suggested_answer: "Run unit and visual proof.",
        suggestion_rationale: "The source names UI work.",
        suggestion_confidence: "high",
        suggestion_source_ids_json: JSON.stringify(["source-1", 7, "source-2"]),
        suggestion_context_fingerprint: contextFingerprint,
        suggestion_generated_at: "2026-01-01T00:01:00.000Z",
        suggestion_model: "fallback",
        suggestion_provider_error: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:02:00.000Z",
      },
      sources,
    );

    expect(mapped).toMatchObject({
      id: "question-1",
      boardId: "board-1",
      question,
      required: true,
      answer: "Use the strict proof policy.",
      answeredAt: "2026-01-01T00:02:00.000Z",
      suggestedAnswer: "Run unit and visual proof.",
      suggestedAnswerRationale: "The source names UI work.",
      suggestedAnswerConfidence: "high",
      suggestedAnswerSourceIds: ["source-1", "source-2"],
      suggestedAnswerContextFingerprint: contextFingerprint,
      suggestedAnswerGeneratedAt: "2026-01-01T00:01:00.000Z",
      suggestedAnswerModel: "fallback",
      suggestedAnswerStale: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    const stale = mapProjectBoardQuestionRow(
      {
        id: "question-1",
        board_id: "board-1",
        question_order: 0,
        question,
        required: 0,
        answer: null,
        answered_at: null,
        suggested_answer: "Run unit proof.",
        suggestion_rationale: null,
        suggestion_confidence: "unsupported",
        suggestion_source_ids_json: null,
        suggestion_context_fingerprint: "stale-fingerprint",
        suggestion_generated_at: null,
        suggestion_model: null,
        suggestion_provider_error: "Provider unavailable.",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:02:00.000Z",
      },
      sources,
    );

    expect(stale.required).toBe(false);
    expect(stale.suggestedAnswerConfidence).toBeUndefined();
    expect(stale.suggestedAnswerSourceIds).toEqual([]);
    expect(stale.suggestedAnswerStale).toBe(true);
    expect(stale.suggestedAnswerProviderError).toBe("Provider unavailable.");
  });
});
