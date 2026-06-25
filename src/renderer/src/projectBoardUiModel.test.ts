import { describe, expect, it } from "vitest";
import type {
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
  ProjectSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardActionState,
  projectBoardAddCardsSourceScope,
  defaultProjectBoardTab,
  projectBoardCandidateClarificationItems,
  projectBoardClarificationAnswerInput,
  projectBoardCardEditWithClarificationAnswerInput,
  projectBoardCardCanSplit,
  projectBoardCardSourceBasis,
  projectBoardCharterReviewActionState,
  projectBoardCardsForSourceGroup,
  projectBoardCardEditCanSave,
  projectBoardCardEditDraft,
  projectBoardCardEditInput,
  projectBoardBoardTabShowsDraftCallout,
  projectBoardBoardTabShowsExecutionPanels,
  projectBoardBoardTabStatusLabel,
  projectBoardColumns,
  projectBoardDecisionQueue,
  projectBoardDeliverableIntegrationQueue,
  projectBoardDependencyRows,
  projectBoardEmptyMessage,
  projectBoardEventGroups,
  projectBoardEventHasSupersededCardReview,
  projectBoardEventKindLabel,
  projectBoardEventSummary,
  projectBoardHistoryImpactAudit,
  projectBoardHistoryRecoveryQueue,
  projectBoardPhaseGroups,
  projectBoardPendingClarificationQuestions,
  projectBoardCardCanMarkReady,
  projectBoardCardVisualTone,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
  projectBoardResetImpact,
  projectBoardStatusLabel,
  projectBoardSupersededCardReview,
  projectBoardSuppressedForWorkflowRecordingThread,
  projectBoardSourceChangeDetail,
  projectBoardSourceChangeFilterItems,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroupsForChangeFilter,
  projectBoardSourceGroupsForFilter,
  projectBoardSourceFilterItems,
  projectBoardSourceGroupCanElaborate,
  projectBoardSourceGroupIncludedSourceIds,
  projectBoardSourceGroups,
  projectBoardSourceImpactPreview,
  projectBoardSourceInclusion,
  projectBoardSourceObservationLabel,
  projectBoardSourcesForFilter,
  projectBoardTabs,
  projectBoardTestSummary,
  projectBoardTestSummaryForBoard,
  projectBoardThreadPlanActionState,
  projectBoardKickoffDefaultAnswer,
  projectBoardKickoffDefaultProviderErrorMessage,
  projectBoardUnattachedLocalTasks,
} from "./projectBoardUiModel";

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    path: "/workspace/app",
    name: "App",
    statePath: "/workspace/app/.ambient-codex",
    sessionPath: "/workspace/app/.ambient-codex/sessions",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    threads: [],
    ...overrides,
    id: overrides.id ?? "project-1",
  };
}

function claimSummary(
  overrides: {
    status?: "active" | "expired" | "conflict";
    ownedByLocal?: boolean;
    expirationRecorded?: boolean;
  } = {},
) {
  return {
    status: overrides.status ?? ("active" as const),
    cardId: "card-1",
    runId: "run-1",
    agentId: overrides.ownedByLocal ? "desktop-local" : "desktop-remote",
    eventId: "evt-claim-1",
    claimedAt: "2026-01-01T00:00:00.000Z",
    leaseUntil: overrides.status === "expired" ? "2026-01-01T00:15:00.000Z" : "2099-01-01T00:00:00.000Z",
    expirationRecorded: overrides.expirationRecorded,
    ownedByLocal: overrides.ownedByLocal,
  };
}

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "model_request",
    sourceCount: 2,
    includedSourceCount: 2,
    sourceCharCount: 1200,
    warningCount: 0,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function boardSummary(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/app",
    status: "active",
    title: "App board",
    summary: "Project board",
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectBoardUiModel", () => {
  it("opens board setup for the active project when no board exists", () => {
    expect(projectBoardActionState(project(), "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Project Board",
      disabled: false,
      statusLabel: "No board",
    });
    expect(projectBoardActionState(project({ path: "/workspace/other" }), "/workspace/app")).toMatchObject({
      kind: "open",
      disabled: true,
    });
    expect(projectBoardActionState(project(), "/workspace/app").title).toContain("Building starts only from the Build Board button");
  });

  it("suppresses project board entry points in workflow recording chats", () => {
    expect(projectBoardSuppressedForWorkflowRecordingThread(undefined)).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({})).toBe(false);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "recording" } })).toBe(true);
    expect(projectBoardSuppressedForWorkflowRecordingThread({ workflowRecording: { status: "stopped" } })).toBe(true);
  });

  it("shows open board once a project board exists", () => {
    const withBoard = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(projectBoardActionState(withBoard, "/workspace/app")).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", false, true)).toMatchObject({
      kind: "close",
      label: "Open Chat",
      title: "Return to main chat",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/app", true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: false,
      statusLabel: "Kickoff draft",
    });
    expect(projectBoardActionState(withBoard, "/workspace/other", false, true)).toMatchObject({
      kind: "open",
      label: "Open Board",
      disabled: true,
    });
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Kickoff draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("Answer the kickoff questions");
    expect(
      projectBoardEmptyMessage(
        boardSummary({
          status: "draft",
          cards: [
            {
              id: "draft-1",
              boardId: "board-1",
              title: "Implement compact app",
              description: "Build the single-file local app.",
              status: "draft",
              candidateStatus: "ready_to_create",
              labels: [],
              blockedBy: [],
              acceptanceCriteria: ["App works."],
              testPlan: { unit: [], integration: [], visual: [], manual: ["Manual check."] },
              sourceKind: "planner_plan",
              sourceId: "plan-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toContain("1 draft candidate exists");

    withBoard.board!.charter = {
      id: "charter-2",
      boardId: "board-1",
      version: 2,
      status: "draft",
      goal: "",
      currentState: "",
      targetUser: "",
      nonGoals: [],
      qualityBar: "",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Revision draft");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("apply or cancel");

    withBoard.board!.status = "active";
    expect(projectBoardStatusLabel(withBoard.board!)).toBe("Active board");
    expect(projectBoardEmptyMessage(withBoard.board!)).toContain("ready for project cards");
  });

  it("treats draft boards with executable cards as an execution board in the Board tab", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardBoardTabStatusLabel(board, 4, 0)).toBe("Execution board");
    expect(projectBoardBoardTabShowsDraftCallout(board, 4)).toBe(false);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 4)).toBe(true);
    expect(projectBoardBoardTabStatusLabel(board, 0, 0)).toBe("Kickoff draft");
    expect(projectBoardBoardTabShowsDraftCallout(board, 0)).toBe(true);
    expect(projectBoardBoardTabShowsExecutionPanels(board, 0)).toBe(false);
  });

  it("models pause and resume controls for synthesis run states", () => {
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }))).toMatchObject({
      pause: {
        visible: true,
        label: "Pause Planning",
        busyLabel: "Pausing",
        disabled: false,
      },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }), { pauseBusy: true })).toMatchObject({
      pause: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running", stage: "kickoff_defaults" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "pause_requested" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: {
        visible: true,
        label: "Resume Planning",
        busyLabel: "Resuming",
        disabled: false,
      },
      startFresh: {
        visible: true,
        label: "Start Fresh",
        busyLabel: "Starting Fresh",
        disabled: false,
      },
    });

    expect(
      projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }), { resumeBusy: true, startFreshBusy: true }),
    ).toMatchObject({
      resume: {
        visible: true,
        disabled: true,
      },
      startFresh: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "succeeded" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "failed" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "abandoned", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
  });

  it("models History recovery actions for exhausted failed source sections", () => {
    const queue = projectBoardHistoryRecoveryQueue({
      sources: [
        {
          id: "source-1",
          boardId: "board-1",
          kind: "plan_artifact",
          title: "Durable plan",
          summary: "Tiny animation plan",
          path: "plan.md",
          includeInSynthesis: true,
          relevance: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      synthesisRuns: [
        synthesisRun({
          status: "failed",
          stage: "failed",
          progressiveRecords: [
            {
              type: "progress",
              title: "Section 1 failed",
              summary: "No usable card records were emitted after inline retry budget was exhausted.",
              createdAt: "2026-01-01T00:01:00.000Z",
              metadata: {
                sectionStatus: "failed",
                sectionId: "section-1",
                sectionIndex: 1,
                sectionCount: 2,
                sectionHeading: "Animation",
                sourcePath: "plan.md",
                failureKind: "section_no_records",
              },
            },
            {
              type: "progress",
              title: "Section 2 completed",
              summary: "Saved card records.",
              createdAt: "2026-01-01T00:02:00.000Z",
              metadata: { sectionStatus: "succeeded", sectionId: "section-2", sectionIndex: 2, sectionCount: 2 },
            },
          ],
          progressiveRecordCount: 2,
          progressiveSummary: {
            recordCount: 2,
            candidateCardCount: 1,
            questionCount: 0,
            sourceCoverageCount: 1,
            dependencyEdgeCount: 0,
            warningCount: 0,
            errorCount: 1,
          },
          updatedAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });

    expect(queue[0]).toMatchObject({
      title: "Failed source sections need a decision",
      failedSectionCount: 1,
      completedSectionCount: 1,
      progressiveRecordCount: 2,
      sourcePaths: ["plan.md"],
    });
    expect(queue[0]?.actions.map((action) => [action.id, action.disabled])).toEqual([
      ["retry_failed_sections", false],
      ["defer_failed_sections", false],
      ["view_progressive_records", false],
      ["open_source_context", false],
    ]);
  });

  it("models History recovery actions for stale, paused, and output-cap runs", () => {
    const outputCapRun = synthesisRun({
      id: "run-output",
      status: "failed",
      stage: "failed",
      updatedAt: "2026-01-01T00:03:00.000Z",
      events: [
        {
          stage: "model_response",
          title: "Planner batch stopped",
          summary: "Stopped after output token limit.",
          createdAt: "2026-01-01T00:03:00.000Z",
          metadata: {
            recoverableOutputStop: true,
            finishReason: "length",
            lastValidRecordId: "card-1",
            lastValidRecordType: "candidate_card",
            lastValidRecordIndex: 1,
          },
        },
      ],
    });
    const queue = projectBoardHistoryRecoveryQueue(
      {
        sources: [],
        synthesisRuns: [
          synthesisRun({ id: "run-paused", status: "paused", stage: "paused", updatedAt: "2026-01-01T00:02:00.000Z" }),
          synthesisRun({ id: "run-stale", status: "running", updatedAt: "2026-01-01T00:01:00.000Z" }),
          outputCapRun,
        ],
      },
      { nowMs: Date.parse("2026-01-01T00:10:00.000Z"), staleMs: 60_000 },
    );

    expect(queue.map((item) => [item.runId, item.title, item.actions.map((action) => action.id)])).toEqual([
      ["run-output", "Planner batch can continue", ["continue_planner_batch"]],
      ["run-paused", "Paused run can resume", ["resume_paused_run", "start_fresh_from_paused_run"]],
      ["run-stale", "Planning appears stale", ["retry_stalled_run"]],
    ]);
  });

  it("keeps recovered failed section runs auditable without stale retry actions", () => {
    const parent = synthesisRun({
      id: "run-parent",
      status: "succeeded",
      progressiveRecords: [
        {
          type: "progress",
          title: "Section failed",
          summary: "The section failed before a later retry recovered it.",
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: { sectionStatus: "failed", sectionId: "section-1", sectionIndex: 1, sectionCount: 1, sourcePath: "plan.md" },
        },
      ],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    const child = synthesisRun({
      id: "run-child",
      retryOfRunId: parent.id,
      status: "succeeded",
      progressiveRecords: [{ type: "candidate_card", title: "Recovered card" }],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    const parentRecovery = projectBoardHistoryRecoveryQueue({ sources: [], synthesisRuns: [parent, child] }).find(
      (item) => item.runId === parent.id,
    );

    expect(parentRecovery).toMatchObject({
      title: "Recovered by retry",
      tone: "neutral",
      summary: expect.stringContaining("run-child"),
    });
    expect(parentRecovery?.actions.map((action) => action.id)).toEqual(["view_progressive_records", "open_source_context"]);
  });

  it("splits latest and cumulative prompt budget metrics for sectioned planning", () => {
    const metrics = projectBoardSynthesisRunPromptBudgetMetrics(
      synthesisRun({
        promptCharCount: 1_008_778,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for section 27/51",
            summary: "Sent prompt characters for a source section.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 31_804,
              cumulativePromptCharCount: 1_008_778,
              latestEstimatedInputTokens: 7_951,
              cumulativeEstimatedInputTokens: 252_195,
              promptBudgetAssessment: { promptCharCount: 31_804, summarizationRecommended: false },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
            },
          },
        ],
      }),
    );

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Latest prompt chars", value: "31,804" }),
        expect.objectContaining({ label: "Cumulative prompt chars", value: "1,008,778" }),
        expect.objectContaining({ label: "Est. input tokens", value: "~7,951 latest / ~252,195 total" }),
        expect.objectContaining({ label: "Compaction", value: "Skipped: below threshold" }),
      ]),
    );
  });

  it("reports planner ledger compaction status from run events", () => {
    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_request",
              title: "Asked Ambient/Pi for planner batch 1",
              summary: "Planner batch used compacted context.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                latestPromptCharCount: 12_000,
                cumulativePromptCharCount: 80_000,
                promptBudgetAssessment: { promptCharCount: 12_000, summarizationRecommended: false },
                plannerLedgerCompactionStatus: "used",
                plannerLedgerCompaction: { cacheHit: false },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Applied" });

    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_response",
              title: "Reused cached planner ledger compaction for batch 1",
              summary: "Compaction cache hit.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                plannerLedgerCompactionStatus: "cache_hit",
                plannerLedgerCompaction: { cacheHit: true },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Reused" });
  });

  it("builds a prompt budget audit from sectioned compaction telemetry", () => {
    const usedAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
        promptCharCount: 180_000,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for source section 9/12",
            summary: "Section request used compacted context.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 22_000,
              cumulativePromptCharCount: 180_000,
              promptBudgetAssessment: { promptCharCount: 22_000, summarizationRecommended: false },
              plannerLedgerCompactionStatus: "used",
              plannerLedgerCompaction: {
                source: "pi_rlm",
                summary: "Prior card themes and duplicate-avoidance notes were compacted.",
                renderedCardCount: 9,
                omittedRenderedCardCount: 4,
                sourceCount: 3,
                finalPromptCharCount: 22_000,
              },
            },
          },
        ],
      }),
    );

    expect(usedAudit).toMatchObject({
      tone: "ready",
      headline: "Compacted planner context was applied",
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Latest request", value: "22,000" }),
        expect.objectContaining({ label: "Run total", value: "180,000" }),
        expect.objectContaining({ label: "Compacted cards", value: "9" }),
        expect.objectContaining({ label: "Omitted cards", value: "4" }),
        expect.objectContaining({ label: "Final prompt", value: "22,000" }),
      ]),
      notes: expect.arrayContaining(["Compaction source: pi_rlm.", "Prior card themes and duplicate-avoidance notes were compacted."]),
    });

    const legacyAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
        promptCharCount: 250_000,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for source section 10/12",
            summary: "Old section telemetry.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 70_000,
              cumulativePromptCharCount: 250_000,
              promptBudgetAssessment: { promptCharCount: 70_000, summarizationRecommended: true },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "sectioned_planning_compaction_not_supported",
            },
          },
        ],
      }),
    );

    expect(legacyAudit).toMatchObject({
      tone: "warning",
      headline: "Legacy run skipped section compaction",
      detail: expect.stringContaining("Current sectioned runs can compact repeated context"),
    });
    expect(legacyAudit?.notes.join(" ")).not.toMatch(/not implemented/i);
  });

  it("gates charter Pi review behind kickoff answers", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "draft",
        title: "App board",
        summary: "Draft",
        charterId: "charter-1",
        cards: [],
        sources: [],
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "What is the primary outcome?",
            required: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "question-2",
            boardId: "board-1",
            question: "Which sources are authoritative?",
            required: true,
            answer: "Use the GDD first.",
            answeredAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: true,
      title: expect.stringContaining("Answer all kickoff questions first"),
    });

    board.questions[0] = { ...board.questions[0], answer: "Build the playable slice.", answeredAt: "2026-01-01T00:00:00.000Z" };
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Answers With Pi",
      disabled: false,
      title: expect.stringContaining("saved kickoff answers"),
    });

    board.status = "active";
    expect(projectBoardCharterReviewActionState(board)).toMatchObject({
      label: "Review Charter With Pi",
      disabled: false,
      title: expect.stringContaining("active charter"),
    });
  });

  it("models thread-level Add Plan to Board availability", () => {
    expect(projectBoardThreadPlanActionState(false, 1)).toMatchObject({
      kind: "no_board",
      disabled: false,
      title: "Create a project board and add the ready planner plan.",
    });
    expect(projectBoardThreadPlanActionState(true, 0)).toMatchObject({
      kind: "no_ready_plan",
      disabled: true,
      title: "Create a ready planner plan first.",
    });
    expect(projectBoardThreadPlanActionState(true, 1)).toMatchObject({
      kind: "single_ready_plan",
      disabled: false,
      label: "Add Plan to Board",
    });
    expect(projectBoardThreadPlanActionState(true, 2)).toMatchObject({
      kind: "multiple_ready_plans",
      disabled: false,
    });
    expect(projectBoardThreadPlanActionState(true, 1, true)).toMatchObject({
      kind: "single_ready_plan",
      disabled: true,
      title: "Adding plan to board",
    });
  });

  it("groups board cards into draft, ready, progress, and review columns", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const columns = projectBoardColumns([
      { ...base, id: "card-1", title: "Draft", status: "draft" },
      { ...base, id: "card-blocked", title: "Blocked", status: "blocked" },
      { ...base, id: "card-2", title: "Ready", status: "ready" },
      { ...base, id: "card-3", title: "Running", status: "in_progress" },
      { ...base, id: "card-4", title: "Review", status: "review" },
      { ...base, id: "card-5", title: "Done", status: "done" },
    ]);

    expect(columns.map((column) => [column.id, column.cards.map((card) => card.title)])).toEqual([
      ["blocked", ["Blocked"]],
      ["ready", ["Ready"]],
      ["in_progress", ["Running"]],
      ["review", ["Review"]],
      ["done", ["Done"]],
    ]);
    expect(columns.map((column) => column.tooltip)).toEqual([
      expect.stringContaining("blocking"),
      expect.stringContaining("eligible"),
      expect.stringContaining("in progress"),
      expect.stringContaining("PM review"),
      expect.stringContaining("complete"),
    ]);
  });

  it("orders board lane cards by critical path before creation time", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const columns = projectBoardColumns([
      { ...base, id: "dependent", title: "Dependent", blockedBy: ["foundation"], createdAt: "2026-01-01T00:01:00.000Z" },
      { ...base, id: "unrelated", title: "Earlier unrelated", createdAt: "2026-01-01T00:00:30.000Z" },
      { ...base, id: "foundation", title: "Foundation", createdAt: "2026-01-01T00:02:00.000Z" },
    ]);

    expect(columns.find((column) => column.id === "ready")?.cards.map((card) => card.id)).toEqual(["foundation", "dependent", "unrelated"]);
  });

  it("uses explicit proof recheck affected-card ids in the History impact audit", () => {
    const baseCard = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Do the work."],
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const proofRecheckEvent: ProjectBoardEvent = {
      id: "event-proof-recheck",
      boardId: "board-1",
      kind: "card_updated",
      title: "Proof coverage rechecked",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. 1 affected card since last recheck.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "recompute_proof_coverage",
          eligibleCardIds: ["changed-card", "unchanged-card", "legacy-card"],
          missingProofCardIds: ["changed-card"],
          affectedCardIds: ["changed-card"],
          staleSinceLastRecheck: true,
          driftReasons: ["1 missing-proof card added."],
          addedMissingProofCardIds: ["changed-card"],
          proofKindChangedCardIds: ["changed-card"],
          proofItemCountChangedCardIds: ["changed-card"],
          policyAffectedCardIds: ["changed-card"],
          eligibleCardCount: 3,
          missingProofCount: 1,
          modelCallRequired: false,
          existingCardsRewritten: false,
        },
      },
      createdAt: "2026-01-01T00:20:00.000Z",
    };
    const baselineEvent: ProjectBoardEvent = {
      ...proofRecheckEvent,
      id: "event-proof-baseline",
      summary: "3 proof-eligible cards rechecked; 1 missing proof; 2 proof items. 0 model calls. First recorded proof baseline.",
      metadata: {
        proofImpact: {
          ...(proofRecheckEvent.metadata.proofImpact as Record<string, unknown>),
          affectedCardIds: [],
          staleSinceLastRecheck: false,
          driftReasons: ["No proof coverage baseline has been recorded yet."],
        },
      },
      createdAt: "2026-01-01T00:19:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "",
        cards: [
          {
            ...baseCard,
            id: "changed-card",
            title: "Changed proof card",
            status: "draft" as const,
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
          {
            ...baseCard,
            id: "unchanged-card",
            title: "Unchanged proof card",
            status: "draft" as const,
            testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
          },
          {
            ...baseCard,
            id: "legacy-card",
            title: "Legacy proof card",
            status: "draft" as const,
            testPlan: { unit: [], integration: ["Browser proof."], visual: [], manual: [] },
          },
        ],
        sources: [],
        questions: [],
        proposals: [],
        events: [baselineEvent, proofRecheckEvent],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const audit = projectBoardHistoryImpactAudit(board);

    expect(audit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event:proof:event-proof-recheck",
          title: "Proof coverage rechecked",
          affectedCardIds: ["changed-card"],
          notes: ["1 missing-proof card added."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 1 }),
            expect.objectContaining({ label: "Drift", value: "yes" }),
            expect.objectContaining({ label: "New gaps", value: 1 }),
            expect.objectContaining({ label: "Proof shape", value: 1 }),
          ]),
        }),
        expect.objectContaining({
          id: "event:proof:event-proof-baseline",
          affectedCardIds: [],
          notes: ["No proof coverage baseline has been recorded yet."],
          metrics: expect.arrayContaining([
            expect.objectContaining({ label: "Cards", value: 0 }),
            expect.objectContaining({ label: "Drift", value: "no" }),
          ]),
        }),
      ]),
    );
  });

  it("normalizes candidate card edit drafts into update input", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft card",
      description: "Original",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 5,
      phase: "Phase 1",
      labels: ["frontend"],
      blockedBy: [],
      acceptanceCriteria: ["Old criterion"],
      testPlan: { unit: ["Old unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const draft = {
      ...projectBoardCardEditDraft(card),
      title: " Updated card ",
      candidateStatus: "ready_to_create" as const,
      priority: "101",
      labels: "UI, ui, qa",
      blockedBy: "LOCAL-1\nLOCAL-2\nLOCAL-1",
      acceptanceCriteria: "Ship it\n\nVerify it\nShip it",
      unitTests: "Run unit\nRun unit",
      integrationTests: "Run smoke",
      visualTests: "",
      manualTests: "Review copy",
    };

    expect(projectBoardCardEditCanSave(card, draft)).toBe(true);
    expect(projectBoardCardEditInput(card.id, draft)).toMatchObject({
      title: "Updated card",
      candidateStatus: "ready_to_create",
      priority: 100,
      labels: ["ui", "qa"],
      blockedBy: ["LOCAL-1", "LOCAL-2"],
      acceptanceCriteria: ["Ship it", "Verify it"],
      testPlan: {
        unit: ["Run unit"],
        integration: ["Run smoke"],
        visual: [],
        manual: ["Review copy"],
      },
    });
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One"] })).toBe(false);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"] })).toBe(true);
    expect(projectBoardCardCanSplit({ ...card, acceptanceCriteria: ["One", "Two"], orchestrationTaskId: "task-1" })).toBe(false);
  });

  it("builds a cross-card Decisions queue from proposal gaps and canonical clarification decisions", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            ...base,
            id: "card-open",
            title: "Keyboard mappings",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should numpad operators map directly?"],
            clarificationSuggestions: [
              {
                question: "Should numpad operators map directly?",
                suggestedAnswer: "Support direct numpad operator mappings.",
                rationale: "This matches calculator keyboard conventions.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-answered",
            title: "Answered display",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["What threshold should auto-shrink use?"],
            clarificationAnswers: [
              {
                question: "What threshold should auto-shrink use?",
                answer: "Begin shrinking after 11 visible characters.",
                answeredAt: "2026-01-01T00:05:00.000Z",
              },
            ],
          },
          {
            ...base,
            id: "card-accepted-default",
            title: "Z accepted default audit",
            candidateStatus: "ready_to_create" as const,
            clarificationDecisions: [
              {
                id: "clarification:animation-style",
                question: "Should the animation use pulse or confetti?",
                canonicalKey: "animation-style",
                source: "card" as const,
                state: "answered" as const,
                answer: "Use a subtle pulse animation.",
                answeredAt: "2026-01-01T00:08:00.000Z",
                suggestedAnswer: "Use a subtle pulse animation.",
                rationale: "Pulse is easy to verify and avoids decorative scope creep.",
                confidence: "high" as const,
                safeToAccept: true,
                questionKind: "expert_default" as const,
              },
            ],
          },
          {
            ...base,
            id: "card-missing-suggestion",
            title: "Preview error default",
            candidateStatus: "needs_clarification" as const,
            clarificationQuestions: ["Should preview errors show a muted indicator?"],
          },
        ],
        sources: [],
        questions: [],
        proposals: [
          {
            id: "proposal-1",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Which interaction mode should be primary?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const queue = projectBoardDecisionQueue(board);
    expect(queue).toMatchObject({
      openCount: 2,
      answeredCount: 2,
      duplicateCount: 1,
      suggestedCount: 1,
      suggestedAuditCount: 1,
      missingSuggestionCount: 1,
      safeSuggestionCount: 1,
      proposalGapCount: 1,
      actionCount: 3,
    });
    expect(queue.auditFilterItems).toEqual([
      { id: "all", label: "All audit", count: 3 },
      { id: "answered", label: "Answered", count: 2 },
      { id: "duplicate", label: "Duplicates", count: 1 },
      { id: "suggested", label: "Suggestion trail", count: 1 },
    ]);
    expect(queue.auditRows.map((row) => [row.cardId, row.state])).toEqual([
      ["card-accepted-default", "answered"],
      ["card-answered", "answered"],
      ["card-answered", "duplicate"],
    ]);
    expect(queue.openRows[0]).toMatchObject({
      cardId: "card-open",
      actionLabel: "Accept suggested default",
      sourceLabel: "Card question",
      impact: expect.objectContaining({ modelCallRequired: false }),
    });
    expect(queue.answeredRows.find((row) => row.cardId === "card-answered")).toMatchObject({
      cardId: "card-answered",
      state: "answered",
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("Answered"),
    });
    expect(queue.duplicateRows[0]).toMatchObject({
      cardId: "card-answered",
      state: "duplicate",
      duplicateOf: expect.any(String),
      answer: "Begin shrinking after 11 visible characters.",
      detail: expect.stringContaining("hidden from open gates"),
    });
    expect(
      projectBoardTabs(board)
        .map((tab) => tab.id)
        .slice(0, 4),
    ).toEqual(["overview", "charter", "decisions", "draft_inbox"]);
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(3);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(defaultProjectBoardTab({ ...board, status: "draft" })).toBe("charter");

    const proposalAnsweredByCardBoard = project({
      board: {
        ...board,
        cards: [
          {
            ...base,
            id: "card-proposal-answer",
            title: "Answered proposal gap",
            candidateStatus: "ready_to_create" as const,
            clarificationQuestions: ["Synced scrolling between editor and preview?"],
            clarificationAnswers: [
              {
                question: "Synced scrolling between editor and preview?",
                answer: "Use independent scroll for v1.",
                answeredAt: "2026-01-01T00:10:00.000Z",
              },
            ],
          },
        ],
        proposals: [
          {
            id: "proposal-answered-by-card",
            boardId: "board-1",
            status: "pending",
            summary: "Pi proposal",
            goal: "Goal",
            currentState: "State",
            targetUser: "User",
            qualityBar: "Proof required.",
            assumptions: [],
            questions: ["Synced scrolling between editor and preview?"],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:06:00.000Z",
            updatedAt: "2026-01-01T00:06:00.000Z",
          },
        ],
      },
    }).board!;
    expect(projectBoardDecisionQueue(proposalAnsweredByCardBoard)).toMatchObject({
      openCount: 0,
      answeredCount: 1,
      proposalGapCount: 0,
      actionCount: 0,
    });
    expect(projectBoardTabs(proposalAnsweredByCardBoard).find((tab) => tab.id === "decisions")?.count).toBe(0);
  });

  it("summarizes reset impact without implying project files are deleted", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            id: "draft-card",
            boardId: "board-1",
            title: "Draft",
            description: "",
            status: "draft" as const,
            candidateStatus: "needs_clarification" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
            sourceKind: "manual" as const,
            sourceId: "manual",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "linked-card",
            boardId: "board-1",
            title: "Linked",
            description: "",
            status: "in_progress" as const,
            candidateStatus: "ready_to_create" as const,
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: ["Unit"], integration: [], visual: [], manual: [] },
            sourceKind: "planner_plan" as const,
            sourceId: "plan",
            orchestrationTaskId: "task-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown" as const,
            sourceKey: "README.md",
            contentHash: "hash",
            title: "README",
            summary: "Summary",
            byteSize: 10,
            relevance: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [
          {
            id: "question-1",
            boardId: "board-1",
            question: "Goal?",
            required: true,
            answer: "Ship",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        proposals: [
          {
            id: "proposal-1",
            boardId: "board-1",
            status: "pending" as const,
            summary: "Summary",
            goal: "Ship",
            currentState: "Draft",
            targetUser: "User",
            qualityBar: "Proof",
            assumptions: [],
            questions: [],
            answers: [],
            sourceNotes: [],
            cards: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        synthesisRuns: [
          {
            id: "run-1",
            boardId: "board-1",
            status: "failed" as const,
            stage: "model_request" as const,
            sourceCount: 1,
            includedSourceCount: 1,
            sourceCharCount: 10,
            warningCount: 0,
            events: [],
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        executionArtifacts: [
          {
            id: "artifact-1",
            boardId: "board-1",
            cardId: "linked-card",
            status: "running" as const,
            source: "local_export" as const,
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        events: [
          {
            id: "event-1",
            boardId: "board-1",
            kind: "board_created" as const,
            title: "Created",
            summary: "Created",
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        claims: { active: [claimSummary({ ownedByLocal: true })], expired: [], conflicts: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const impact = projectBoardResetImpact(board);

    expect(impact.summary).toContain("2 board cards");
    expect(impact.deleted.map((metric) => [metric.label, metric.value])).toEqual([
      ["Cards", 2],
      ["Sources", 1],
      ["Questions", 1],
      ["PM proposals", 1],
      ["Progress runs", 1],
      ["Proof/handoff artifacts", 1],
      ["History events", 1],
      ["Active claims", 1],
    ]);
    expect(impact.deleted[0].detail).toContain("1 draft candidate");
    expect(impact.preserved).toEqual([
      "Project files and Git working tree.",
      "Chat threads and planning artifacts outside this board.",
      "1 existing Local Task; they will no longer be attached to this board.",
    ]);
  });

  it("explains needs-clarification candidates at the PM decision point", () => {
    const base = {
      id: "card-1",
      boardId: "board-1",
      title: "Clarify controls",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      priority: 1,
      phase: "Gameplay",
      labels: [],
      blockedBy: [],
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      })[0],
    ).toEqual(
      expect.objectContaining({
        label: "Clarification question",
        detail: "Should this use thrust inertia or direct arcade steering?",
      }),
    );

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        sourceKind: "manual" as const,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).toContain("Question from card");

    // Synthesis cards only surface structured questions; their prose is full of
    // technical "?" usage and is never mined.
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        description: "Should the ship use tank controls or thrust controls?",
        acceptanceCriteria: [],
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?"],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.detail),
    ).not.toContain("Should this use thrust inertia or direct arcade steering?");

    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description:
          "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }).map((item) => item.label),
    ).not.toContain("Question from card");
    expect(
      projectBoardCandidateClarificationItems({
        ...base,
        clarificationQuestions: [],
        clarificationAnswers: [
          {
            question: "Should this use thrust inertia or direct arcade steering?",
            answer: "Use inertia.",
            answeredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        description:
          "Implement the control model.\n\n## Clarifications\n- Q: Should this use thrust inertia or direct arcade steering?\n  A: Use inertia.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      }),
    ).toEqual([]);

    const answerInput = projectBoardClarificationAnswerInput(
      {
        ...base,
        clarificationQuestions: ["Should this use thrust inertia or direct arcade steering?", "What proof is required?"],
        description: "Implement the control model.",
        acceptanceCriteria: ["Ship moves inside the play area."],
        testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
      },
      "Should this use thrust inertia or direct arcade steering?",
      "Use inertia-based thrust from the design document.",
    );
    expect(answerInput).toMatchObject({
      cardId: "card-1",
      clarificationQuestions: ["What proof is required?"],
      clarificationAnswers: [
        expect.objectContaining({
          question: "Should this use thrust inertia or direct arcade steering?",
          answer: "Use inertia-based thrust from the design document.",
        }),
      ],
    });
    expect(answerInput.description).toContain("## Clarifications");
    expect(answerInput.description).toContain("Use inertia-based thrust");

    const clarificationCard = {
      ...base,
      clarificationQuestions: ["What proof is required?"],
      description: "Implement the control model.",
      acceptanceCriteria: ["Ship moves inside the play area."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    const composedAnswerInput = projectBoardCardEditWithClarificationAnswerInput(
      clarificationCard,
      {
        ...projectBoardCardEditDraft(clarificationCard),
        description: "Edited details before accepting.",
        manualTests: "Manual proof survives accept",
      },
      "What proof is required?",
      "Run the unit test and complete the manual proof.",
    );
    expect(composedAnswerInput).toMatchObject({
      cardId: "card-1",
      description: expect.stringContaining("Edited details before accepting."),
      testPlan: expect.objectContaining({ manual: ["Manual proof survives accept"] }),
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: "What proof is required?",
          answer: "Run the unit test and complete the manual proof.",
        }),
      ],
    });

    const duplicateRenderingQuestion =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const duplicateRenderingQuestionVariant =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";
    const duplicateQuestionCard = {
      ...base,
      clarificationQuestions: [duplicateRenderingQuestion, duplicateRenderingQuestionVariant],
      description: "Resolve the rendering substrate.",
      acceptanceCriteria: ["Renderer choice is documented."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardPendingClarificationQuestions(duplicateQuestionCard)).toEqual([duplicateRenderingQuestion]);
    expect(
      projectBoardCandidateClarificationItems(duplicateQuestionCard)
        .filter((item) => item.label === "Clarification question")
        .map((item) => item.detail),
    ).toEqual([duplicateRenderingQuestion]);
    expect(
      projectBoardClarificationAnswerInput(duplicateQuestionCard, duplicateRenderingQuestionVariant, "Use Three.js/WebGL."),
    ).toMatchObject({
      clarificationQuestions: [],
      clarificationAnswers: [
        expect.objectContaining({
          question: duplicateRenderingQuestionVariant,
          answer: "Use Three.js/WebGL.",
        }),
      ],
    });

    const noQuestionCard = {
      ...base,
      description: "Implement the game shell.",
      acceptanceCriteria: ["Canvas renders."],
      testPlan: { unit: ["Unit test"], integration: [], visual: [], manual: [] },
    };
    expect(projectBoardCandidateClarificationItems(noQuestionCard)).toEqual([
      expect.objectContaining({
        label: "No explicit question attached",
        tone: "neutral",
      }),
    ]);
    expect(projectBoardCandidateClarificationItems(noQuestionCard, boardSummary({ cards: [noQuestionCard] }))).toEqual([]);

    const closedParent = {
      ...base,
      id: "parent-card",
      title: "Open random-picker/index.html via browser_local_preview",
      status: "done" as const,
      candidateStatus: "ready_to_create" as const,
      description: "Open the local preview.",
      acceptanceCriteria: ["Preview opens."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Browser preview was checked."] },
    };
    const proofFollowUp = {
      ...base,
      id: "proof-follow-up",
      title: "Complete proof for Open random-picker/index.html via browser_local_preview",
      sourceKind: "run_follow_up" as const,
      sourceId: "run-1",
      blockedBy: ["parent-card"],
      description: "Complete proof for the already-finished local preview task.",
      acceptanceCriteria: ["Proof is captured or the follow-up is dismissed."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Capture browser preview proof."] },
    };
    const proofFollowUpBoard = boardSummary({
      cards: [closedParent, proofFollowUp],
    });
    expect(projectBoardCardCanMarkReady(proofFollowUp, proofFollowUpBoard)).toBe(false);
    expect(projectBoardCandidateClarificationItems(proofFollowUp, proofFollowUpBoard)).toEqual([]);
  });

  it("links cards back to their source basis", () => {
    const source = {
      id: "source-gdd",
      boardId: "board-1",
      kind: "functional_spec" as const,
      sourceKey: "docs/GDD.md",
      title: "Game Design Document",
      summary: "Main game scope",
      path: "docs/GDD.md",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Implement ship controls",
      description: "Controls from GDD.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Ship moves."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:ship-controls",
      sourceRefs: ["source-gdd", "docs/GDD.md"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(projectBoardCardSourceBasis(card, [source])[0]).toEqual(
      expect.objectContaining({ label: "Game Design Document", sourceId: "source-gdd" }),
    );
    expect(
      projectBoardCardsForSourceGroup({ id: "group-1", primary: source, observations: [source], generatedObservationCount: 0 }, [card]),
    ).toHaveLength(1);
  });

  it("builds source review filters from canonical source groups", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Relevant source",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      classifiedBy: "ambient_pi" as const,
      includeInSynthesis: true,
      classificationReason: "Pi selected this source for planning.",
    };
    const sources = [
      {
        ...sourceBase,
        id: "source-1",
        title: "Architecture",
        kind: "architecture_artifact" as const,
        path: "docs/architecture.md",
        changeState: "new" as const,
      },
      {
        ...sourceBase,
        id: "source-2",
        title: "Workflow",
        kind: "workflow_artifact" as const,
        path: "WORKFLOW.md",
        changeState: "changed" as const,
      },
      {
        ...sourceBase,
        id: "source-3",
        title: "Workflow",
        kind: "workflow_artifact" as const,
        path: "test-results/WORKFLOW.md",
        changeState: "changed" as const,
      },
      {
        ...sourceBase,
        id: "source-4",
        title: "Scratch",
        kind: "ignored" as const,
        path: "scratch.md",
        changeState: "unchanged" as const,
        classifiedBy: "user" as const,
        includeInSynthesis: false,
      },
    ];
    const groups = projectBoardSourceGroups(sources);

    expect(groups).toHaveLength(3);
    const workflowGroup = groups.find((group) => group.primary.title === "Workflow")!;
    expect(workflowGroup.primary.path).toBe("WORKFLOW.md");
    expect(projectBoardSourceObservationLabel(workflowGroup)).toBe("2 observations, 1 generated");
    expect(projectBoardSourceFilterItems(groups)).toEqual([
      { kind: "all", label: "All", count: 3 },
      { kind: "included_sources", label: "Included", count: 2 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "architecture_artifact", label: "Architecture", count: 1 },
      { kind: "ignored", label: "Ignored", count: 1 },
      { kind: "workflow_artifact", label: "Workflow", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(groups, "included_sources").map((group) => group.primary.title)).toEqual([
      "Architecture",
      "Workflow",
    ]);
    expect(projectBoardSourceGroupsForFilter(groups, "ignored_sources").map((group) => group.primary.title)).toEqual(["Scratch"]);
    expect(projectBoardSourcesForFilter(sources, "included_sources").map((source) => source.id)).toEqual([
      "source-1",
      "source-2",
      "source-3",
    ]);
    expect(projectBoardSourcesForFilter(sources, "ignored_sources").map((source) => source.id)).toEqual(["source-4"]);
    expect(projectBoardSourcesForFilter(sources, "workflow_artifact").map((source) => source.id)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourcesForFilter(sources, "all")).toHaveLength(4);
    expect(projectBoardSourceChangeFilterItems(groups)).toEqual([
      { kind: "all", label: "All changes", count: 3 },
      { kind: "new", label: "New", count: 1 },
      { kind: "changed", label: "Changed", count: 1 },
      { kind: "unchanged", label: "Unchanged", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForChangeFilter(groups, "changed").map((group) => group.primary.title)).toEqual(["Workflow"]);
    const sourceSummary = projectBoardSourceChangeSummary(groups, [
      {
        id: "event-1",
        boardId: "board-1",
        kind: "sources_refreshed",
        title: "Sources refreshed",
        summary: "",
        metadata: { removedCount: 2 },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(sourceSummary).toMatchObject({
      newCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      removedCount: 2,
      includedCount: 2,
      ignoredCount: 1,
      headline: "1 new, 1 changed, 2 removed since the last refresh.",
    });
    expect(sourceSummary.detail).toContain("2 included for Decisions and card generation");
    expect(sourceSummary.detail).toContain("1 ignored but visible");
    expect(sourceSummary.refreshTitle).toContain("Ignored sources stay visible in inventory");
    expect(sourceSummary.refreshTitle).toContain("User source classifications are preserved");
    expect(projectBoardSourceChangeDetail(workflowGroup)).toContain("Changed. Workflow, Included in synthesis. classified by Pi");

    const ignoredGroup = groups.find((group) => group.primary.kind === "ignored")!;
    expect(projectBoardSourceInclusion(workflowGroup.primary)).toMatchObject({
      included: true,
      label: "Included",
      addCardsEligible: true,
    });
    expect(projectBoardSourceInclusion(ignoredGroup.primary)).toMatchObject({
      included: false,
      label: "Ignored",
      badgeLabel: "Ignored for synthesis",
      addCardsEligible: false,
    });
    expect(projectBoardSourceChangeDetail(ignoredGroup)).toContain("Visible in source inventory and refresh history");
    expect(projectBoardSourceGroupCanElaborate(workflowGroup)).toBe(true);
    expect(projectBoardSourceGroupCanElaborate(ignoredGroup)).toBe(false);
    expect(projectBoardSourceGroupIncludedSourceIds(workflowGroup)).toEqual(["source-2", "source-3"]);
    expect(projectBoardSourceGroupIncludedSourceIds(ignoredGroup)).toEqual([]);

    const scope = projectBoardAddCardsSourceScope(groups, [workflowGroup.id]);
    expect(scope).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
      disabled: false,
      label: "Elaborate 1 Source",
    });
    expect(projectBoardAddCardsSourceScope(groups, [ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 0,
      selectedObservationCount: 0,
      selectedSourceIds: [],
      disabled: true,
      label: "Select Sources",
    });
    expect(projectBoardAddCardsSourceScope(groups, [workflowGroup.id, ignoredGroup.id])).toMatchObject({
      selectedGroupCount: 1,
      selectedObservationCount: 2,
      selectedSourceIds: ["source-2", "source-3"],
    });
    expect(projectBoardAddCardsSourceScope(groups, [], true)).toMatchObject({
      disabled: true,
      label: "Elaborating",
    });

    const durableGroups = [
      {
        id: "durable-plan",
        primary: {
          ...sourceBase,
          id: "durable-plan-source",
          title: "Refined Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/App-DurablePlan.html",
          authorityRole: "primary" as const,
        },
        observations: [],
        generatedObservationCount: 0,
      },
      {
        id: "chat-thread",
        primary: {
          ...sourceBase,
          id: "chat-source",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          authorityRole: "ignored" as const,
          includeInSynthesis: false,
        },
        observations: [],
        generatedObservationCount: 0,
      },
    ];
    const durableSummary = projectBoardSourceChangeSummary(durableGroups);
    expect(durableSummary).toMatchObject({
      durablePlanPrimaryCount: 1,
      durablePlanIgnoredThreadCount: 1,
      sourceAuthorityNotice: "Durable plan selected as source of truth; 1 chat thread ignored by default.",
    });
    expect(durableSummary.detail).toContain("Durable plan selected as source of truth");
    expect(projectBoardSourceFilterItems(durableGroups)).toEqual([
      { kind: "all", label: "All", count: 2 },
      { kind: "included_sources", label: "Included", count: 1 },
      { kind: "ignored_sources", label: "Ignored for synthesis", count: 1 },
      { kind: "ignored_threads", label: "Ignored threads", count: 1 },
      { kind: "plan_artifact", label: "Plan", count: 1 },
      { kind: "thread", label: "Thread", count: 1 },
    ]);
    expect(projectBoardSourceGroupsForFilter(durableGroups, "ignored_threads").map((group) => group.primary.title)).toEqual([
      "Planning chat",
    ]);
  });

  it("previews source inclusion impact without rewriting existing cards", () => {
    const sourceBase = {
      boardId: "board-1",
      summary: "Planning context.",
      relevance: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const durableSource = {
      ...sourceBase,
      id: "durable-plan-source",
      title: "Refined Durable Plan",
      kind: "plan_artifact" as const,
      path: ".ambient/board/plans/App-DurablePlan.html",
      authorityRole: "primary" as const,
      includeInSynthesis: true,
      byteSize: 6000,
    };
    const chatSource = {
      ...sourceBase,
      id: "chat-source",
      title: "Planning chat",
      kind: "thread" as const,
      threadId: "thread-1",
      includeInSynthesis: false,
      authorityRole: "ignored" as const,
      byteSize: 9000,
    };
    const includedChatSource = {
      ...sourceBase,
      id: "included-chat-source",
      title: "Promoted UX chat",
      kind: "thread" as const,
      threadId: "thread-2",
      includeInSynthesis: true,
      byteSize: 7000,
    };
    const baseCard: ProjectBoardCard = {
      id: "card-1",
      boardId: "board-1",
      title: "Draft from chat",
      description: "",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "included-chat-source",
      sourceRefs: ["included-chat-source", "thread-2"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const readyCard: ProjectBoardCard = {
      ...baseCard,
      id: "card-2",
      title: "Ready from durable plan",
      status: "ready",
      sourceId: "durable-plan-source",
      sourceRefs: ["durable-plan-source"],
    };

    const board = { sources: [durableSource, chatSource, includedChatSource], cards: [baseCard, readyCard] };
    const defaultPreview = projectBoardSourceImpactPreview(board);

    expect(defaultPreview).toMatchObject({
      modelCallRequired: false,
      durablePlanPrimaryCount: 1,
      includedChatCount: 1,
      ignoredChatCount: 1,
      affectedDraftCount: 1,
      affectedExecutableCount: 0,
    });
    expect(defaultPreview.headline).toBe("Durable plan primary; 1 chat excluded");
    expect(defaultPreview.detail).toContain("Existing board cards are not rewritten by default.");
    expect(defaultPreview.metrics.find((metric) => metric.label === "Card rewrites")?.value).toBe(0);

    const selectedGroup = projectBoardSourceGroups(board.sources).find((group) => group.primary.id === "included-chat-source")!;
    const selectedPreview = projectBoardSourceImpactPreview(board, { selectedGroupIds: [selectedGroup.id] });

    expect(selectedPreview).toMatchObject({
      modelCallRequired: true,
      selectedGroupCount: 1,
      selectedObservationCount: 1,
      estimatedPromptChars: 7000,
      affectedCardIds: ["card-1"],
      affectedDraftCount: 1,
    });
    expect(selectedPreview.headline).toBe("1 source group can elaborate additive cards");
    expect(selectedPreview.groups[0]).toMatchObject({
      title: "Promoted UX chat",
      kindLabel: "Thread",
      included: true,
      estimatedPromptChars: 7000,
      affectedDraftCount: 1,
    });
    expect(selectedPreview.cards[0]).toMatchObject({ cardId: "card-1", sourceLabel: "Draft can refresh" });
  });

  it("suggests editable kickoff defaults from source authority context", () => {
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "draft" as const,
      title: "Asteroids",
      summary: "",
      cards: [],
      sources: [
        {
          id: "durable-plan-source",
          boardId: "board-1",
          title: "Revised Durable Plan",
          kind: "plan_artifact" as const,
          path: ".ambient/board/plans/Asteroids-DurablePlan.html",
          summary: "Authoritative plan.",
          relevance: 1,
          includeInSynthesis: true,
          authorityRole: "primary" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "thread-source",
          boardId: "board-1",
          title: "Planning chat",
          kind: "thread" as const,
          threadId: "thread-1",
          summary: "Older thread.",
          relevance: 1,
          includeInSynthesis: false,
          authorityRole: "ignored" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [],
      proposals: [],
      events: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "question-1",
          boardId: "board-1",
          question: "Which sources are authoritative?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        1,
      ),
    ).toContain("Revised Durable Plan");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "answered",
          boardId: "board-1",
          question: "Goal?",
          required: true,
          answer: "Saved answer",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      ),
    ).toBe("Saved answer");
    expect(
      projectBoardKickoffDefaultAnswer(
        board,
        {
          id: "execution-policy",
          boardId: "board-1",
          question: "How should Ambient sequence and retry card execution when work is blocked or incomplete?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        4,
      ),
    ).toContain("retry transient failures");
  });

  it("formats kickoff default provider errors without leaking raw JSON", () => {
    const message = projectBoardKickoffDefaultProviderErrorMessage(
      'Ambient project-board kickoff default suggestion failed (402): {"error":{"message":"Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access.","type":"insufficient_quota_error"}}',
    );

    expect(message).toBe(
      "Ambient/Pi default suggestion failed (HTTP 402): Daily and monthly free usage exhausted. Daily budget resets in 20 hours. Purchase credits for uninterrupted access. (quota limit)",
    );
    expect(message).not.toContain('{"error"');
  });

  it("models board tabs, dependency rows, phase groups, and proof summary", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      {
        ...base,
        id: "card-1",
        title: "Foundation",
        phase: "Phase 1",
        priority: 1,
        orchestrationTaskId: "task-1",
        testPlan: { ...base.testPlan, unit: ["unit"] },
      },
      { ...base, id: "card-2", title: "Dependent", phase: "Phase 2", priority: 2, orchestrationTaskId: "task-2", blockedBy: ["card-1"] },
      { ...base, id: "card-3", title: "Candidate", status: "draft" as const, phase: "Phase 2" },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [
          {
            id: "source-1",
            boardId: "board-1",
            kind: "markdown",
            title: "README",
            summary: "Project notes",
            path: "README.md",
            relevance: 0.8,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        questions: [],
        proposals: [],
        events: [
          {
            id: "event-1",
            boardId: "board-1",
            kind: "plan_promoted",
            title: "Plan added to board",
            summary: "Project plan entered the draft inbox.",
            entityKind: "project_board_card",
            entityId: "card-3",
            metadata: { artifactId: "artifact-1" },
            createdAt: "2026-01-01T00:05:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardTabs(board).map((tab) => [tab.id, tab.count])).toEqual([
      ["overview", 3],
      ["charter", 1],
      ["decisions", 0],
      ["draft_inbox", 1],
      ["map", 2],
      ["board", 2],
      ["proof", 2],
      ["integration", 0],
      ["history", 1],
    ]);
    board.proposals = [
      {
        id: "proposal-1",
        boardId: "board-1",
        status: "pending",
        summary: "Pi proposal",
        goal: "Goal",
        currentState: "State",
        targetUser: "User",
        qualityBar: "Proof required.",
        assumptions: [],
        questions: ["Which control model should ship first?"],
        answers: [],
        sourceNotes: [],
        cards: [],
        createdAt: "2026-01-01T00:06:00.000Z",
        updatedAt: "2026-01-01T00:06:00.000Z",
      },
    ];
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(1);
    expect(defaultProjectBoardTab(board)).toBe("decisions");
    expect(projectBoardEventKindLabel(board.events![0].kind)).toBe("Plan");
    expect(projectBoardEventKindLabel("synthesis_proposal_created")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_answered")).toBe("Proposal");
    expect(projectBoardEventKindLabel("synthesis_proposal_card_reviewed")).toBe("Proposal");
    expect(projectBoardEventKindLabel("board_revision_started")).toBe("Revision");
    expect(projectBoardEventKindLabel("manual_card_created")).toBe("Manual");
    expect(projectBoardEventKindLabel("source_updated")).toBe("Source");
    expect(projectBoardEventKindLabel("ready_tasks_created")).toBe("Ticket");
    expect(projectBoardEventKindLabel("card_proof_reviewed")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_proof_review_ignored")).toBe("Proof");
    expect(projectBoardEventKindLabel("card_execution_session_assigned")).toBe("Session");
    expect(projectBoardEventKindLabel("card_run_completed")).toBe("Run");
    expect(projectBoardEventKindLabel("card_run_handoff_created")).toBe("Handoff");
    expect(projectBoardEventKindLabel("card_claimed")).toBe("Claim");
    expect(projectBoardEventKindLabel("execution_readiness_blocked")).toBe("Execution");
    expect(projectBoardEventKindLabel("workflow_created")).toBe("Workflow");
    expect(projectBoardEventKindLabel("workflow_raw_updated")).toBe("Workflow");
    expect(projectBoardEventKindLabel("deliverable_integration_resolved")).toBe("Integration");
    expect(projectBoardEventSummary(board.events)).toBe("1 plan event");
    board.status = "draft";
    board.proposals = [];
    expect(defaultProjectBoardTab(board)).toBe("charter");
    board.status = "active";
    board.cards = [{ ...base, id: "card-draft-only", title: "Candidate only", status: "draft" as const, phase: "Phase 1" }];
    expect(defaultProjectBoardTab(board)).toBe("draft_inbox");
    board.cards = cards;
    expect(projectBoardEventGroups(board.events)).toHaveLength(1);
    expect(
      projectBoardDependencyRows(cards)
        .find((row) => row.card.id === "card-1")
        ?.unblocks.map((card) => card.id),
    ).toEqual(["card-2"]);
    expect(
      projectBoardPhaseGroups(cards, new Set(["card-1"])).map((group) => [
        group.phase,
        group.cards.length,
        group.blockedCount,
        group.readyCount,
        group.reviewCount,
        group.criticalPathCount,
        group.tone,
      ]),
    ).toEqual([
      ["Phase 1", 1, 0, 1, 0, 1, "critical"],
      ["Phase 2", 2, 1, 1, 0, 0, "blocked"],
    ]);
    expect(
      projectBoardPhaseGroups([{ ...base, id: "card-review", title: "Review", status: "review" as const, phase: "Phase 3" }])[0]?.tone,
    ).toBe("review");
    expect(
      projectBoardCardVisualTone({
        ...base,
        id: "tone-blocked",
        title: "Blocked",
        status: "draft" as const,
        candidateStatus: "needs_clarification",
      }),
    ).toBe("blocked");
    expect(
      projectBoardCardVisualTone(
        { ...base, id: "tone-ready", title: "Ready", status: "ready" as const, candidateStatus: "ready_to_create" },
        "ready_now",
      ),
    ).toBe("ready");
    expect(projectBoardCardVisualTone({ ...base, id: "tone-running", title: "Running", status: "in_progress" as const }, "running")).toBe(
      "running",
    );
    expect(projectBoardTestSummary(cards)).toMatchObject({
      unit: 1,
      integration: 0,
      visual: 0,
      manual: 0,
      missing: [expect.objectContaining({ id: "card-2" }), expect.objectContaining({ id: "card-3" })],
    });
    expect(projectBoardProofCoverageForBoard(board)).toMatchObject({
      unit: [expect.objectContaining({ id: "card-1" })],
      integrationOrBrowser: [],
      manual: [],
      missing: [expect.objectContaining({ id: "card-2" }), expect.objectContaining({ id: "card-3" })],
      strict: false,
      relaxedWarning: true,
    });
  });

  it("counts proof review queue cards in the Proof tab badge", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-proof-review",
      boardId: "board-1",
      title: "Review finished proof",
      description: "Inspect the finished run.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: ["local-task"],
      blockedBy: [],
      acceptanceCriteria: ["Proof is inspectable."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-proof-review",
      orchestrationTaskId: "task-proof-review",
      proofReview: {
        status: "ready_for_review",
        summary: "Proof is ready for PM review.",
        satisfied: ["Unit proof passed."],
        missing: [],
        followUpCardIds: [],
        runId: "run-proof-review",
        reviewedAt: now,
        reviewer: "deterministic",
        recommendedAction: "close",
      },
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-proof-review",
      identifier: "LOCAL-1",
      title: "Review finished proof",
      state: "needs_review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const run: OrchestrationRun = {
      id: "run-proof-review",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: now,
      finishedAt: now,
      proofOfWork: {
        kind: "agent-run",
        commands: ["pnpm test"],
        changedFiles: ["src/proof.ts"],
      },
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = { tasks: [task], runs: [run] };

    expect(projectBoardTestSummaryForBoard(board).missing).toHaveLength(0);
    expect(projectBoardProofReviewQueueSummary(board, orchestration)).toMatchObject({
      count: 1,
      cardIds: ["card-proof-review"],
    });
    expect(projectBoardTabs(board, orchestration).find((tab) => tab.id === "proof")?.count).toBe(1);
  });

  it("excludes sibling-board deliverables from the integration queue", () => {
    const now = "2026-01-01T00:00:00.000Z";
    // Two boards share one workspace folder: this board's card links task-1; task-2
    // belongs to the OTHER board (a board-card task with no card here).
    const card: ProjectBoardCard = {
      id: "card-own",
      boardId: "board-1",
      title: "Implement Unit Converter App",
      description: "Build the converter.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Converter works."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Open it."] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:converter",
      orchestrationTaskId: "task-1",
      createdAt: now,
      updatedAt: now,
    };
    const ownTask: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Implement Unit Converter App",
      description: "Build the converter.",
      state: "review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const foreignTask: OrchestrationTask = {
      ...ownTask,
      id: "task-2",
      identifier: "LOCAL-2",
      title: "Scaffold Vite project (other board)",
    };
    const manualTask: OrchestrationTask = {
      ...ownTask,
      id: "task-3",
      identifier: "LOCAL-3",
      title: "Manual local task",
      sourceKind: "manual",
    };
    const run = (id: string, taskId: string): OrchestrationRun => ({
      id,
      taskId,
      attemptNumber: 1,
      status: "completed",
      workspacePath: `/workspace/app/.ambient-codex/orchestration/workspaces/${taskId}`,
      startedAt: now,
      finishedAt: now,
      proofOfWork: { kind: "agent-run", changedFiles: ["index.html"], artifactFiles: [], commands: [], commits: [], dependencyImports: [] },
    });
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "Converter board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = {
      tasks: [ownTask, foreignTask, manualTask],
      runs: [run("run-1", "task-1"), run("run-2", "task-2"), run("run-3", "task-3")],
    };

    const queue = projectBoardDeliverableIntegrationQueue(board, orchestration);

    const titles = queue.items.map((item) => item.task?.title);
    // Own card's run and the manual (non-board) task stay; the sibling board's run is excluded.
    expect(titles).toContain("Implement Unit Converter App");
    expect(titles).toContain("Manual local task");
    expect(titles).not.toContain("Scaffold Vite project (other board)");
    expect(queue.items).toHaveLength(2);
  });

  it("models deliverable integration as an explicit apply/export/defer queue", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-deliverable",
      boardId: "board-1",
      title: "Build Pomodoro root",
      description: "Create the Pomodoro app files.",
      status: "review",
      candidateStatus: "ready_to_create",
      phase: "Phase 2",
      labels: ["local-task"],
      blockedBy: [],
      acceptanceCriteria: ["Pomodoro app files are ready to review."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-deliverable",
      orchestrationTaskId: "task-1",
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Build Pomodoro root",
      description: "Create the Pomodoro app files.",
      state: "review",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      projectPath: "/workspace/app",
      createdAt: now,
      updatedAt: now,
    };
    const run: OrchestrationRun = {
      id: "run-1",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: now,
      finishedAt: now,
      proofOfWork: {
        kind: "agent-run",
        changedFiles: [
          "index.html",
          "src/pomodoro.ts",
          "tests/pomodoro.spec.ts",
          ".ambient-codex/session.json",
          "node_modules/cache/index.js",
        ],
        artifactFiles: ["dist/screenshot.png"],
        commands: ["pnpm test"],
        commits: ["abc123"],
        dependencyImports: ["date-fns"],
      },
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: now,
        updatedAt: now,
      },
    }).board!;
    const orchestration = { tasks: [task], runs: [run] };

    const pending = projectBoardDeliverableIntegrationQueue(board, orchestration);
    expect(pending).toMatchObject({
      pendingCount: 1,
      materialFileCount: 4,
      excludedFileCount: 2,
    });
    expect(pending.items[0]).toMatchObject({
      status: "pending",
      materialFiles: expect.arrayContaining([
        expect.objectContaining({ path: "index.html" }),
        expect.objectContaining({ path: "src/pomodoro.ts" }),
      ]),
      excludedFiles: expect.arrayContaining([
        expect.objectContaining({ path: ".ambient-codex/session.json", exclusionReason: "runtime_folder" }),
        expect.objectContaining({ path: "node_modules/cache/index.js", exclusionReason: "dependency_folder" }),
      ]),
    });
    expect(pending.items[0].actions.map((action) => [action.action, action.disabled])).toEqual([
      ["apply_to_root", false],
      ["export_bundle", false],
      ["defer", false],
    ]);
    expect(projectBoardTabs(board, orchestration).find((tab) => tab.id === "integration")?.count).toBe(1);

    board.events = [
      {
        id: "event-deferred",
        boardId: board.id,
        kind: "deliverable_integration_resolved",
        title: "Deliverable integration deferred",
        summary: "Deferred.",
        entityKind: "orchestration_run",
        entityId: run.id,
        metadata: {
          runId: run.id,
          taskId: task.id,
          cardId: card.id,
          action: "defer",
          status: "deferred",
          materialFiles: ["index.html"],
          excludedFiles: [".ambient-codex/session.json"],
          appliedFiles: [],
          skippedFiles: [],
          reason: "Waiting for PM design review.",
        },
        createdAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "event-integrated",
        boardId: board.id,
        kind: "deliverable_integration_resolved",
        title: "Deliverables applied to project root",
        summary: "Applied.",
        entityKind: "orchestration_run",
        entityId: run.id,
        metadata: {
          runId: run.id,
          taskId: task.id,
          cardId: card.id,
          action: "apply_to_root",
          status: "integrated",
          materialFiles: ["index.html", "src/pomodoro.ts"],
          excludedFiles: [".ambient-codex/session.json"],
          appliedFiles: ["index.html", "src/pomodoro.ts"],
          skippedFiles: [],
        },
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ];
    const resolved = projectBoardDeliverableIntegrationQueue(board, orchestration);
    expect(resolved.pendingCount).toBe(0);
    expect(resolved.integratedCount).toBe(1);
    expect(resolved.deferredCount).toBe(0);
    expect(resolved.items[0]).toMatchObject({ status: "integrated", actionLabel: "Integrated" });
    expect(resolved.items[0].actions.every((action) => action.disabled)).toBe(true);
  });

  it("models Start Fresh superseded-card history review from audit metadata", () => {
    const event: ProjectBoardEvent = {
      id: "evt-start-fresh",
      boardId: "board-1",
      kind: "card_updated",
      title: "Start Fresh cleared draft synthesis cards",
      summary: "Superseded 1 untouched draft synthesis card. Moved 1 preserved card back to non-active review.",
      entityKind: "project_board_synthesis_run",
      entityId: "run-abandoned",
      metadata: {
        decision: "start_fresh_supersede_drafts",
        abandonedRunId: "run-abandoned",
        supersededDraftCardIds: ["card-superseded"],
        supersededDraftCards: [
          {
            cardId: "card-superseded",
            title: "Old generated shell",
            sourceId: "synthesis:shell",
            status: "draft",
            candidateStatus: "ready_to_create",
            clarificationQuestionCount: 2,
          },
        ],
        preservedCardIds: ["card-preserved"],
        preservedCards: [
          {
            cardId: "card-preserved",
            title: "User edited gameplay loop",
            sourceId: "synthesis:gameplay",
            status: "ready",
            candidateStatus: "ready_to_create",
            userTouchedFields: ["description"],
            orchestrationTaskId: "task-1",
          },
        ],
        demotedPreservedCardIds: ["card-preserved"],
      },
      createdAt: "2026-01-01T00:08:00.000Z",
    };

    expect(projectBoardEventHasSupersededCardReview(event)).toBe(true);
    expect(projectBoardSupersededCardReview([event])).toMatchObject({
      eventCount: 1,
      supersededCount: 1,
      demotedCount: 1,
      preservedCount: 0,
      summary: "1 superseded draft card, 1 preserved card moved back to review",
      items: [
        {
          category: "superseded",
          cardId: "card-superseded",
          title: "Old generated shell",
          sourceId: "synthesis:shell",
          runId: "run-abandoned",
          clarificationQuestionCount: 2,
        },
        {
          category: "demoted",
          cardId: "card-preserved",
          title: "User edited gameplay loop",
          userTouchedFields: ["description"],
          orchestrationTaskId: "task-1",
        },
      ],
    });
    expect(projectBoardSupersededCardReview([{ ...event, metadata: {} }]).summary).toBe(
      "No Start Fresh superseded cards have been recorded yet.",
    );
  });

  it("models existing Local Tasks that can be imported into a project board", () => {
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          {
            id: "card-1",
            boardId: "board-1",
            title: "Attached",
            description: "",
            status: "ready",
            candidateStatus: "ready_to_create",
            labels: [],
            blockedBy: [],
            acceptanceCriteria: [],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
            sourceKind: "local_task_import",
            sourceId: "task-attached",
            orchestrationTaskId: "task-attached",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const tasks = [
      {
        id: "task-attached",
        identifier: "LOCAL-1",
        title: "Already attached",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-orphan",
        identifier: "LOCAL-2",
        title: "Orphan task",
        state: "todo",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-board-owned",
        identifier: "LOCAL-3",
        title: "Board owned",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(projectBoardUnattachedLocalTasks(board, tasks).map((task) => task.id)).toEqual(["task-orphan"]);
  });

  it("groups project board proof coverage by validation style", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards: [
          { ...base, id: "unit", title: "Unit", testPlan: { ...base.testPlan, unit: ["pnpm test"] } },
          { ...base, id: "integration", title: "Integration", testPlan: { ...base.testPlan, integration: ["pnpm e2e"] } },
          { ...base, id: "visual", title: "Visual", testPlan: { ...base.testPlan, visual: ["visual smoke"] } },
          { ...base, id: "manual", title: "Manual", testPlan: { ...base.testPlan, manual: ["review"] } },
          { ...base, id: "missing", title: "Missing" },
          { ...base, id: "evidence", title: "Evidence", candidateStatus: "evidence" as const },
        ],
        sources: [],
        questions: [],
        proposals: [],
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const coverage = projectBoardProofCoverageForBoard(board);

    expect(coverage.unit.map((card) => card.id)).toEqual(["unit"]);
    expect(coverage.integration.map((card) => card.id)).toEqual(["integration"]);
    expect(coverage.visual.map((card) => card.id)).toEqual(["visual"]);
    expect(coverage.integrationOrBrowser.map((card) => card.id)).toEqual(["integration", "visual"]);
    expect(coverage.manual.map((card) => card.id)).toEqual(["manual"]);
    expect(coverage.missing.map((card) => card.id)).toEqual(["missing"]);
    expect(coverage.strict).toBe(true);
    expect(coverage.relaxedWarning).toBe(false);
  });
});
