import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
  projectBoardCardClaimBlocksLocalTicketization,
  projectBoardCardClaimLabel,
  projectBoardCardDependencyBadges,
  projectBoardDependencyHealth,
  projectBoardDependencyRows,
  projectBoardDraftColumns,
  projectBoardDraftColumnMoveState,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardDraftInboxFilterOptions,
  projectBoardPiUpdateReviewQueue,
  projectBoardExecutionControlModel,
  projectBoardPlanningSnapshotTicketizationState,
  projectBoardCreateReadyTasksState,
  projectBoardHasActiveSynthesisRun,
  projectBoardProofDecisionModel,
  projectBoardReadyTicketizationCards,
  projectBoardSynthesisRunProofScopeWarnings,
  projectBoardUiMockReviewPanelModel,
  projectBoardUiMockReviewBadges,
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

describe("projectBoardDraftTicketizationUiModel", () => {
  it("models batch ticketization for ready draft cards", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
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
        summary: "",
        cards: [
          { ...base, id: "card-1", title: "Ready draft", status: "draft" as const },
          { ...base, id: "card-2", title: "Already ticketized", status: "ready" as const, orchestrationTaskId: "task-1" },
          { ...base, id: "card-3", title: "Needs info", status: "draft" as const, candidateStatus: "needs_clarification" as const },
        ],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardReadyTicketizationCards(board).map((card) => card.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(board)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });
    expect(projectBoardCreateReadyTasksState(board, true)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Creating Tasks",
    });
    expect(projectBoardCreateReadyTasksState({ ...board, status: "draft" })).toMatchObject({
      count: 0,
      disabled: true,
      label: "Create Ready Tasks",
      title: expect.stringContaining("Activate the project charter"),
    });

    const kickoffDefaultsBoard = {
      ...board,
      synthesisRuns: [
        {
          id: "run-kickoff",
          boardId: board.id,
          status: "running" as const,
          stage: "kickoff_defaults" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardHasActiveSynthesisRun(kickoffDefaultsBoard)).toBe(false);
    expect(projectBoardCreateReadyTasksState(kickoffDefaultsBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const planningBoard = {
      ...board,
      synthesisRuns: [
        {
          id: "run-1",
          boardId: board.id,
          status: "running" as const,
          stage: "model_request" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardHasActiveSynthesisRun(planningBoard)).toBe(true);
    expect(projectBoardPlanningSnapshotTicketizationState(planningBoard)).toMatchObject({
      kind: "planning_running",
      label: "Planning running",
      statusLabel: "Locked",
      readyCount: 1,
      ticketizedCount: 1,
    });
    expect(projectBoardCreateReadyTasksState(planningBoard)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Create Ready Tasks",
      title: expect.stringContaining("Wait for board planning to finish or pause"),
    });

    const pauseRequestedBoard = {
      ...planningBoard,
      synthesisRuns: planningBoard.synthesisRuns.map((run) => ({ ...run, status: "pause_requested" as const })),
    };
    expect(projectBoardHasActiveSynthesisRun(pauseRequestedBoard)).toBe(true);
    expect(projectBoardCreateReadyTasksState(pauseRequestedBoard)).toMatchObject({
      count: 1,
      disabled: true,
      label: "Create Ready Tasks",
    });

    const pausedBoard = {
      ...planningBoard,
      synthesisRuns: planningBoard.synthesisRuns.map((run) => ({
        ...run,
        status: "paused" as const,
        stage: "paused" as const,
      })),
    };
    expect(projectBoardHasActiveSynthesisRun(pausedBoard)).toBe(false);
    const snapshotReadyBoard = {
      ...pausedBoard,
      cards: [{ ...base, id: "card-4", title: "Snapshot ready task", status: "draft" as const }],
    };
    expect(projectBoardPlanningSnapshotTicketizationState(snapshotReadyBoard)).toMatchObject({
      kind: "snapshot_ready",
      label: "Snapshot ready",
      statusLabel: "Ready",
      readyCount: 1,
      ticketizedCount: 0,
    });
    expect(projectBoardCreateReadyTasksState(pausedBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uncapturedSynthesisBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "card-synth",
          title: "Generated draft",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:generated",
        },
      ],
    };
    expect(projectBoardCreateReadyTasksState(uncapturedSynthesisBoard)).toMatchObject({
      count: 1,
      disabled: true,
      title: expect.stringContaining("Complete or pause board planning"),
    });

    const staleSnapshotBoard = {
      ...uncapturedSynthesisBoard,
      synthesisRuns: [
        {
          id: "run-stable",
          boardId: board.id,
          status: "succeeded" as const,
          stage: "board_applied" as const,
          sourceCount: 1,
          includedSourceCount: 1,
          sourceCharCount: 100,
          warningCount: 0,
          planningSnapshots: [
            {
              id: "snapshot-stale",
              boardId: board.id,
              runId: "run-stable",
              kind: "final" as const,
              planningStatus: "succeeded" as const,
              planningStage: "board_applied" as const,
              createdAt: "2026-01-01T00:00:00.000Z",
              cardCount: 1,
              readyCandidateCount: 1,
              ticketizedCount: 0,
              sourceHashes: [],
              cardIds: ["other-card"],
              cards: [],
              renderFingerprint: "planning-snapshot-stale",
            },
          ],
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardCreateReadyTasksState(staleSnapshotBoard)).toMatchObject({
      count: 1,
      disabled: true,
      title: expect.stringContaining("newer than the latest stable planning snapshot"),
    });
    expect(
      projectBoardCreateReadyTasksState({
        ...staleSnapshotBoard,
        synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
          ...run,
          planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["card-synth"] })),
        })),
      }),
    ).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uxMockBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "mock",
          title: "Create UX mock for approval",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:ux-mock-approval",
          labels: ["ux-mock-approval"],
          uiMockRole: "mock_gate" as const,
        },
        {
          ...base,
          id: "dashboard",
          title: "Implement dashboard UI",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:dashboard",
          labels: ["frontend", "ux-mock-gated"],
          blockedBy: ["synthesis:ux-mock-approval"],
          uiMockRole: "gated_implementation" as const,
          requiresUiMockApproval: true,
        },
      ],
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["mock"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(uxMockBoard).map((card) => card.id)).toEqual(["mock"]);
    expect(projectBoardCreateReadyTasksState(uxMockBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });

    const uxMockDoneBoard = {
      ...uxMockBoard,
      cards: uxMockBoard.cards.map((card) => (card.id === "mock" ? { ...card, status: "done" as const } : card)),
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["dashboard"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(uxMockDoneBoard).map((card) => card.id)).toEqual(["dashboard"]);
    expect(projectBoardCreateReadyTasksState(uxMockDoneBoard)).toMatchObject({
      count: 1,
      disabled: false,
      label: "Create 1 Ready Task",
    });
    const approvedUxMockPreview = projectBoardDraftInboxCreateReadyPreview(uxMockDoneBoard);
    expect(approvedUxMockPreview.ticketizableCards.map((card) => card.id)).toEqual(["dashboard"]);
    expect(approvedUxMockPreview.skippedCards.find((item) => item.card.id === "dashboard")).toBeUndefined();
    expect(projectBoardUiMockReviewBadges(uxMockDoneBoard.cards[1], uxMockDoneBoard.cards)).toEqual([
      { label: "UX Mock", value: "Approved", tone: "done" },
    ]);

    const missingTypedMockGateBoard = {
      ...board,
      cards: [
        {
          ...base,
          id: "dashboard",
          title: "Implement dashboard UI",
          status: "draft" as const,
          sourceKind: "board_synthesis" as const,
          sourceId: "synthesis:dashboard",
          labels: ["frontend"],
          uiMockRole: "gated_implementation" as const,
          requiresUiMockApproval: true,
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(missingTypedMockGateBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(missingTypedMockGateBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("waiting for UX mock approval"),
    });
    expect(
      projectBoardDraftInboxCreateReadyPreview(uxMockBoard).skippedCards.find((item) => item.card.id === "dashboard")?.reasons,
    ).toContain("Approve UX mock before creating UI implementation tasks.");
    expect(projectBoardUiMockReviewBadges(uxMockBoard.cards[0], uxMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Approval gate", tone: "warning" },
    ]);
    expect(projectBoardUiMockReviewBadges(uxMockBoard.cards[1], uxMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Waiting approval", tone: "blocked" },
    ]);
    const dashboardDetail = projectBoardActiveCardDetail(uxMockBoard.cards[1], uxMockBoard.cards, [], []);
    const dashboardOverview = projectBoardActiveCardOverviewModel(
      uxMockBoard.cards[1],
      { sources: [] },
      dashboardDetail,
      projectBoardExecutionControlModel(uxMockBoard.cards[1], { events: [] }, dashboardDetail),
    );
    expect(dashboardOverview.badges).toEqual(expect.arrayContaining([{ label: "UX Mock", value: "Waiting approval", tone: "blocked" }]));
    const mockReviewCard = {
      ...uxMockBoard.cards[0],
      status: "review" as const,
      orchestrationTaskId: "task-mock",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "HTML mock is ready for approval.",
        satisfied: ["Mock artifact exists."],
        missing: [],
        followUpCardIds: [],
        runId: "run-mock",
        reviewedAt: "2026-01-01T00:10:00.000Z",
        recommendedAction: "ask_user" as const,
      },
    };
    const mockRun: OrchestrationRun = {
      id: "run-mock",
      taskId: "task-mock",
      attemptNumber: 0,
      status: "completed",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-MOCK",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:05:00.000Z",
      proofOfWork: { changedFiles: ["mockups/dashboard-review.html", "mockups/dashboard-review.css"] },
    };
    const mockProofDecision = projectBoardProofDecisionModel(
      mockReviewCard,
      {},
      {
        id: "task-mock",
        identifier: "LOCAL-MOCK",
        title: "Create UX mock for approval",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      mockRun,
    );
    expect(projectBoardUiMockReviewPanelModel(mockReviewCard, mockRun, mockProofDecision)).toMatchObject({
      visible: true,
      statusLabel: "Ready for review",
      headline: "Review UX mock artifact",
      previewPath: "mockups/dashboard-review.html",
      actions: [
        { action: "accept_done", label: "Approve mock", disabled: false },
        { action: "retry", label: "Request revision", disabled: false },
        { action: "mark_blocked", label: "Reject mock", disabled: false },
      ],
    });
    const approvedMockProofDecision = projectBoardProofDecisionModel(
      { ...mockReviewCard, status: "done" as const },
      {},
      {
        id: "task-mock",
        identifier: "LOCAL-MOCK",
        title: "Create UX mock for approval",
        state: "done",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      mockRun,
    );
    expect(
      projectBoardUiMockReviewPanelModel({ ...mockReviewCard, status: "done" as const }, mockRun, approvedMockProofDecision),
    ).toMatchObject({
      visible: true,
      statusLabel: "Mock approved",
      headline: "UX mock approved",
      actions: [{ action: "retry", label: "Request revision", disabled: true }],
    });
    const rejectedMockBoard = {
      ...uxMockBoard,
      cards: uxMockBoard.cards.map((card) =>
        card.id === "mock"
          ? {
              ...card,
              status: "blocked" as const,
              orchestrationTaskId: "task-mock",
              proofReview: {
                status: "terminally_blocked" as const,
                summary: "Mock rejected by PM review.",
                satisfied: [],
                missing: ["Navigation treatment is unclear."],
                followUpCardIds: [],
                runId: "run-mock",
                reviewedAt: "2026-01-01T00:20:00.000Z",
                recommendedAction: "block" as const,
              },
            }
          : card,
      ),
      synthesisRuns: staleSnapshotBoard.synthesisRuns.map((run) => ({
        ...run,
        planningSnapshots: run.planningSnapshots?.map((snapshot) => ({ ...snapshot, cardIds: ["dashboard"] })),
      })),
    };
    expect(projectBoardReadyTicketizationCards(rejectedMockBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(rejectedMockBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("waiting for UX mock approval"),
    });
    expect(projectBoardUiMockReviewBadges(rejectedMockBoard.cards[1], rejectedMockBoard.cards)).toEqual([
      { label: "UX Mock", value: "Waiting approval", tone: "blocked" },
    ]);

    const ticketizedBoard = {
      ...snapshotReadyBoard,
      cards: snapshotReadyBoard.cards.map((card) => ({ ...card, status: "ready" as const, orchestrationTaskId: "task-1" })),
    };
    expect(projectBoardPlanningSnapshotTicketizationState(ticketizedBoard)).toMatchObject({
      kind: "snapshot_ticketized",
      label: "Snapshot ticketized",
      statusLabel: "Protected",
      readyCount: 0,
      ticketizedCount: 1,
    });

    const additiveProposalBoard = {
      ...ticketizedBoard,
      cards: [
        ...ticketizedBoard.cards,
        {
          ...base,
          id: "card-7",
          title: "Additive task",
          status: "draft" as const,
          candidateStatus: "ready_to_create" as const,
          sourceId: "synthesis-additive",
        },
      ],
    };
    expect(projectBoardPlanningSnapshotTicketizationState(additiveProposalBoard)).toMatchObject({
      kind: "new_proposal_available",
      label: "New proposal available",
      statusLabel: "Review additive drafts",
      readyCount: 1,
      draftCandidateCount: 1,
      ticketizedCount: 1,
    });

    const remotelyClaimed = {
      ...board,
      cards: [
        {
          ...board.cards[0],
          claim: {
            status: "active" as const,
            cardId: "card-1",
            runId: "run-1",
            agentId: "desktop-b",
            eventId: "evt-1",
            claimedAt: "2026-01-01T00:00:00.000Z",
            leaseUntil: "2099-01-01T00:00:00.000Z",
            ownedByLocal: false,
          },
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(remotelyClaimed)).toEqual([]);
    expect(projectBoardCardClaimBlocksLocalTicketization(remotelyClaimed.cards[0])).toBe(true);
    expect(projectBoardCardClaimLabel(remotelyClaimed.cards[0])).toBe("Claimed by desktop-b");
    expect(projectBoardCreateReadyTasksState(remotelyClaimed)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("claimed or conflicted"),
    });
  });

  it("groups draft candidate cards by review state", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const columns = projectBoardDraftColumns([
      { ...base, id: "card-1", title: "Evidence", candidateStatus: "evidence" },
      { ...base, id: "card-2", title: "Clarify", candidateStatus: "needs_clarification" },
      { ...base, id: "card-3", title: "Ready", candidateStatus: "ready_to_create" },
      { ...base, id: "card-4", title: "Reject", candidateStatus: "rejected" },
      { ...base, id: "card-5", title: "Duplicate", candidateStatus: "duplicate" },
      { ...base, id: "card-6", title: "Task", candidateStatus: "ready_to_create", status: "ready", orchestrationTaskId: "task-1" },
    ]);

    expect(columns.map((column) => [column.id, column.cards.map((card) => card.title)])).toEqual([
      ["evidence", ["Evidence"]],
      ["needs_clarification", ["Clarify"]],
      ["ready_to_create", ["Ready"]],
      ["rejected", ["Reject", "Duplicate"]],
    ]);
    expect(columns[0].title).toBe("Covered / Done");
  });

  it("filters draft inbox candidates by search text, decision state, proof gaps, and stale updates", () => {
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
    const cards = [
      {
        ...base,
        id: "card-1",
        title: "Responsive breakpoint",
        phase: "Layout",
        candidateStatus: "ready_to_create" as const,
        sourceRefs: ["source-chat"],
      },
      {
        ...base,
        id: "card-2",
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
        id: "card-3",
        title: "Display polish",
        candidateStatus: "needs_clarification" as const,
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      },
      {
        ...base,
        id: "card-4",
        title: "Pending Pi update",
        candidateStatus: "ready_to_create" as const,
        pendingPiUpdate: { sourceId: "run-1", createdAt: "2026-01-01T00:00:00.000Z", changedFields: ["description" as const] },
      },
      { ...base, id: "card-5", title: "Already covered", candidateStatus: "duplicate" as const },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [
          {
            id: "event-source-impact",
            boardId: "board-1",
            kind: "source_updated",
            title: "Source inclusion updated",
            summary: "Chat source was included.",
            entityKind: "project_board_source",
            entityId: "source-chat",
            metadata: {
              sourceImpact: {
                schemaVersion: 1,
                sourceId: "source-chat",
                groupSourceIds: ["source-chat"],
                targetedRefreshOptional: true,
                affectedDraftCardIds: ["card-1"],
                modelCallRequired: false,
              },
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const decisionColumns = projectBoardDraftColumns(cards, { board, query: "numpad", filterId: "needs_decision" });
    expect(decisionColumns.flatMap((column) => column.cards.map((card) => card.title))).toEqual(["Keyboard mappings"]);
    expect(
      projectBoardDraftColumns(cards, { board, includeSkipped: false }).flatMap((column) => column.cards.map((card) => card.title)),
    ).not.toContain("Already covered");
    expect(projectBoardDraftInboxFilterOptions(cards, board).map((option) => [option.id, option.count])).toEqual([
      ["all", 5],
      ["blocking_or_critical", 0],
      ["ready", 2],
      ["needs_decision", 1],
      ["missing_proof", 1],
      ["blocked_by_dependency", 0],
      ["stale_impact", 2],
      ["duplicate", 1],
      ["evidence", 0],
      ["rejected", 0],
    ]);
  });

  it("surfaces blocking and critical-path draft candidates near the front of the Draft Inbox filters", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "foundation", title: "Foundation", priority: 1 },
      { ...base, id: "dependent", title: "Dependent", priority: 2, blockedBy: ["foundation"] },
      { ...base, id: "independent", title: "Independent", priority: 3 },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const options = projectBoardDraftInboxFilterOptions(cards, board);
    expect(options.slice(0, 3).map((option) => option.id)).toEqual(["all", "blocking_or_critical", "ready"]);
    expect(options.find((option) => option.id === "blocking_or_critical")?.count).toBe(2);
    expect(
      projectBoardDraftColumns(cards, { board, filterId: "blocking_or_critical" }).flatMap((column) => column.cards.map((card) => card.id)),
    ).toEqual(["foundation", "dependent"]);
  });

  it("orders Draft Inbox lanes by critical path before creation time", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "dependent", title: "Dependent", blockedBy: ["foundation"], createdAt: "2026-01-01T00:01:00.000Z" },
      { ...base, id: "unrelated", title: "Earlier unrelated", createdAt: "2026-01-01T00:00:30.000Z" },
      { ...base, id: "foundation", title: "Foundation", createdAt: "2026-01-01T00:02:00.000Z" },
    ];

    expect(
      projectBoardDraftColumns(cards)
        .find((column) => column.id === "ready_to_create")
        ?.cards.map((card) => card.id),
    ).toEqual(["foundation", "dependent", "unrelated"]);
  });

  it("builds a queue for staged Pi updates across decision, source, and proof refreshes", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual proof."] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      {
        ...base,
        id: "decision-card",
        title: "Keyboard decision",
        pendingPiUpdate: {
          sourceId: "decision:should-keyboard-shortcuts-loop",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "clarificationAnswers", "clarificationDecisions"],
          description: "Implement keyboard shortcuts after accepting the PM decision.",
          clarificationAnswers: [{ question: "Support shortcuts?", answer: "Yes", answeredAt: "2026-01-01T00:00:00.000Z" }],
          clarificationDecisions: [],
        },
      },
      {
        ...base,
        id: "source-card",
        title: "Source refresh",
        pendingPiUpdate: {
          sourceId: "source:durable-plan",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description", "acceptanceCriteria"],
          description: "Refresh from the refined durable plan.",
          acceptanceCriteria: ["Uses the refined durable artifact."],
        },
      },
      {
        ...base,
        id: "proof-card",
        title: "Proof refresh",
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
        pendingPiUpdate: {
          sourceId: "proof:gmi-e2e-smoke",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["testPlan"],
          testPlan: { unit: ["Reducer handles tick."], integration: [], visual: ["Screenshot shows animation."], manual: [] },
        },
      },
      {
        ...base,
        id: "ticketized-card",
        title: "Already ticketized",
        status: "ready" as const,
        orchestrationTaskId: "LOCAL-1",
        pendingPiUpdate: {
          sourceId: "run-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          changedFields: ["description"],
          description: "This should not be applied directly.",
        },
      },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        cards,
        sources: [],
        questions: [],
        proposals: [],
        events: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const queue = projectBoardPiUpdateReviewQueue(board);
    expect(queue).toMatchObject({
      visible: true,
      decisionCount: 1,
      sourceCount: 1,
      proofCount: 1,
      planningCount: 1,
    });
    expect(queue.actionableItems.map((item) => item.card.id)).toEqual(["decision-card", "source-card", "proof-card"]);
    expect(queue.items.map((item) => [item.card.id, item.sourceLabel, item.actionable])).toEqual([
      ["decision-card", "PM decision refresh", true],
      ["source-card", "Source refresh", true],
      ["proof-card", "Proof suggestion", true],
      ["ticketized-card", "Planning refresh", false],
    ]);
    expect(queue.items.find((item) => item.card.id === "proof-card")?.previewLines).toContain("Proof plan: 2 expectations");
    expect(queue.items.find((item) => item.card.id === "ticketized-card")?.blocker).toContain("already ticketized");
  });

  it("previews Create Ready Tasks with ticketizable, mark-ready, skipped, and dependency counts", () => {
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
    const cards = [
      { ...base, id: "card-1", title: "Ready task", candidateStatus: "ready_to_create" as const },
      { ...base, id: "card-2", title: "Markable task", candidateStatus: "needs_clarification" as const },
      { ...base, id: "card-3", title: "Dependency task", candidateStatus: "ready_to_create" as const, blockedBy: ["card-1"] },
      {
        ...base,
        id: "card-4",
        title: "Decision task",
        candidateStatus: "needs_clarification" as const,
        clarificationQuestions: ["Which formatter should be used?"],
      },
      {
        ...base,
        id: "card-5",
        title: "Proof gap task",
        candidateStatus: "ready_to_create" as const,
        testPlan: { unit: [], integration: [], visual: [], manual: [] },
      },
      { ...base, id: "card-6", title: "Duplicate task", candidateStatus: "duplicate" as const },
    ];
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards,
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const preview = projectBoardDraftInboxCreateReadyPreview(board);
    expect(preview.ticketizableCards.map((card) => card.title)).toEqual(["Ready task", "Dependency task"]);
    expect(preview.markReadyCards.map((card) => card.title)).toEqual(["Markable task"]);
    expect(preview.decisionBlockedCount).toBe(1);
    expect(preview.proofGapCount).toBe(1);
    expect(preview.dependencyBlockerCount).toBe(1);
    expect(preview.skippedTerminalCount).toBe(1);
    expect(preview.skippedCards.find((item) => item.card.title === "Decision task")?.reasons.join(" ")).toContain("open PM decision");
  });

  it("treats duplicate or rejected draft blockers as terminal audit dependencies", () => {
    const base = {
      boardId: "board-1",
      description: "Implement the card.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Acceptance is clear."],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const duplicate = { ...base, id: "card-duplicate", title: "Duplicate auth backend", candidateStatus: "duplicate" as const };
    const dependent = {
      ...base,
      id: "card-dependent",
      title: "JWT middleware",
      blockedBy: [duplicate.id],
      sourceId: "synthesis:middleware",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "App board",
        summary: "Active",
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards: [duplicate, dependent],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const preview = projectBoardDraftInboxCreateReadyPreview(board);
    const badges = projectBoardCardDependencyBadges(dependent, board.cards);
    const health = projectBoardDependencyHealth(board.cards);
    const dependentReadiness = health.readiness.find((item) => item.card.id === dependent.id);

    expect(preview.ticketizableCards.map((card) => card.id)).toEqual([dependent.id]);
    expect(preview.dependencyBlockerCount).toBe(0);
    expect(projectBoardDraftInboxFilterOptions(board.cards, board).find((option) => option.id === "blocked_by_dependency")?.count).toBe(0);
    expect(projectBoardDependencyRows(board.cards).find((row) => row.card.id === dependent.id)?.blockedBy).toEqual([]);
    expect(badges).toEqual([
      expect.objectContaining({
        cardId: duplicate.id,
        prefix: "Dependency skipped",
        state: "satisfied",
      }),
    ]);
    expect(dependentReadiness).toMatchObject({
      state: "ready_now",
      waitingOn: [],
    });
  });

  it("explains Draft Inbox drag/drop targets and proof-gated moves", () => {
    const base = {
      id: "card-1",
      boardId: "board-1",
      title: "Ship controls",
      description: "Implement controls.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard input moves the ship."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
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
        charter: {
          id: "charter-1",
          boardId: "board-1",
          version: 1,
          status: "active",
          goal: "Ship safely",
          currentState: "",
          targetUser: "",
          nonGoals: [],
          qualityBar: "Require proof",
          testPolicy: { requireProofSpec: true, defaultProof: "Require proof before ready." },
          decisionPolicy: {},
          dependencyPolicy: {},
          budgetPolicy: {},
          sourcePolicy: {},
          markdown: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        cards: [base],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const columns = projectBoardDraftColumns([base]);
    const readyColumn = columns.find((column) => column.id === "ready_to_create")!;
    const rejectedColumn = columns.find((column) => column.id === "rejected")!;
    const needsInfoColumn = columns.find((column) => column.id === "needs_clarification")!;

    expect(projectBoardDraftColumnMoveState(readyColumn).label).toBe("Proof-ready candidates");
    expect(projectBoardDraftColumnMoveState(readyColumn, base, board)).toMatchObject({
      disabled: true,
      tone: "warning",
      label: "Proof required before Ready",
    });
    expect(projectBoardDraftColumnMoveState(needsInfoColumn, base, board)).toMatchObject({
      disabled: true,
      label: "Already here",
    });
    expect(projectBoardDraftColumnMoveState(rejectedColumn, base, board)).toMatchObject({
      disabled: false,
      tone: "danger",
      label: "Drop to move to Rejected / Duplicate",
    });
    expect(
      projectBoardDraftColumnMoveState(readyColumn, { ...base, testPlan: { ...base.testPlan, manual: ["Manual proof"] } }, board),
    ).toMatchObject({
      disabled: false,
      tone: "ready",
      label: "Drop to move to Ready To Create",
    });
  });

  it("surfaces proof-scope warnings before ready candidates are ticketized", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      description: "Translate keyboard input into player intent.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Input",
      labels: ["input"],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard events produce stable intent objects."],
      testPlan: {
        unit: ["Unit-test key state transitions."],
        integration: ["Exercise the game-loop input boundary."],
        visual: ["Holding thrust key in browser causes ship to accelerate visually."],
        manual: [],
      },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:input-adapter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active" as const,
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        synthesisRuns: [
          {
            id: "run-1",
            boardId: "board-1",
            status: "succeeded" as const,
            stage: "proposal_created" as const,
            sourceCount: 1,
            includedSourceCount: 1,
            sourceCharCount: 100,
            cardCount: 1,
            warningCount: 1,
            progressiveRecordCount: 1,
            progressiveSummary: {
              recordCount: 1,
              candidateCardCount: 1,
              questionCount: 0,
              sourceCoverageCount: 0,
              dependencyEdgeCount: 0,
              warningCount: 1,
              errorCount: 0,
              latestWarning: "Proof scope mismatch.",
            },
            progressiveRecords: [
              {
                type: "warning",
                code: "proof_scope_mismatch",
                message:
                  '"Build InputAdapter for keyboard-to-intent mapping" looks like a pure/module-boundary card but has browser or screenshot proof.',
                createdAt: "2026-01-01T00:01:00.000Z",
                metadata: {
                  cardId: "synthesis:input-adapter",
                  title: "Build InputAdapter for keyboard-to-intent mapping",
                  proofOwnership: "pure_module",
                  visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
                },
              },
            ],
            planningSnapshots: [
              {
                id: "snapshot-1",
                boardId: "board-1",
                runId: "run-1",
                kind: "final" as const,
                planningStatus: "succeeded" as const,
                planningStage: "proposal_created" as const,
                createdAt: "2026-01-01T00:01:00.000Z",
                cardCount: 1,
                readyCandidateCount: 1,
                ticketizedCount: 0,
                sourceHashes: [],
                cardIds: ["card-1"],
                cards: [],
                renderFingerprint: "planning-snapshot-proof-warning",
              },
            ],
            events: [],
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            completedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    const warnings = projectBoardPlanningWarningsForCard(card, board);

    expect(projectBoardSynthesisRunProofScopeWarnings(board.synthesisRuns?.[0])[0]).toMatchObject({
      code: "proof_scope_mismatch",
      cardRef: "synthesis:input-adapter",
      proofOwnership: "pure_module",
      visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
    });
    expect(warnings).toHaveLength(1);
    expect(projectBoardPlanningWarningActionTitle(warnings)).toContain("Move screenshot/browser/visual proof");
    expect(projectBoardCreateReadyTasksState(board).title).toContain("proof-scope warning");

    const needsClarificationCard = { ...card, candidateStatus: "needs_clarification" as const };
    const readyColumn = projectBoardDraftColumns([needsClarificationCard]).find((column) => column.id === "ready_to_create")!;
    expect(
      projectBoardDraftColumnMoveState(readyColumn, needsClarificationCard, { ...board, cards: [needsClarificationCard] }),
    ).toMatchObject({
      disabled: false,
      tone: "warning",
      label: "Review proof warning before Ready",
    });
  });

  it("keeps proof-scope warnings advisory by default but blocks strict-policy ticketization until acknowledged", () => {
    const card = {
      id: "card-1",
      boardId: "board-1",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      description: "Translate keyboard input into player intent.",
      status: "draft" as const,
      candidateStatus: "ready_to_create" as const,
      priority: 1,
      phase: "Input",
      labels: ["input"],
      blockedBy: [],
      acceptanceCriteria: ["Keyboard events produce stable intent objects."],
      testPlan: {
        unit: ["Unit-test key state transitions."],
        integration: ["Exercise the game-loop input boundary."],
        visual: ["Holding thrust key in browser causes ship to accelerate visually."],
        manual: [],
      },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:input-adapter",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const warningRun = {
      id: "run-1",
      boardId: "board-1",
      status: "succeeded" as const,
      stage: "proposal_created" as const,
      sourceCount: 1,
      includedSourceCount: 1,
      sourceCharCount: 100,
      cardCount: 1,
      warningCount: 1,
      progressiveRecordCount: 1,
      progressiveRecords: [
        {
          type: "warning",
          code: "proof_scope_mismatch",
          message:
            '"Build InputAdapter for keyboard-to-intent mapping" looks like a pure/module-boundary card but has browser or screenshot proof.',
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: {
            cardId: "synthesis:input-adapter",
            title: "Build InputAdapter for keyboard-to-intent mapping",
            proofOwnership: "pure_module",
            visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
          },
        },
      ],
      planningSnapshots: [
        {
          id: "snapshot-1",
          boardId: "board-1",
          runId: "run-1",
          kind: "final" as const,
          planningStatus: "succeeded" as const,
          planningStage: "proposal_created" as const,
          createdAt: "2026-01-01T00:01:00.000Z",
          cardCount: 1,
          readyCandidateCount: 1,
          ticketizedCount: 0,
          sourceHashes: [],
          cardIds: ["card-1"],
          cards: [],
          renderFingerprint: "planning-snapshot-proof-warning",
        },
      ],
      events: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
    };
    const baseBoard = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active" as const,
        title: "App board",
        summary: "Active",
        cards: [card],
        sources: [],
        questions: [],
        proposals: [],
        synthesisRuns: [warningRun],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;
    const strictBoard = {
      ...baseBoard,
      charter: {
        id: "charter-1",
        boardId: "board-1",
        version: 1,
        status: "active" as const,
        goal: "Ship a safe board.",
        currentState: "Strict proof policy is active.",
        targetUser: "Ambient Desktop operator",
        nonGoals: [],
        qualityBar: "Require acknowledgement for proof ownership warnings.",
        testPolicy: { proofScopeWarningPolicy: "acknowledgement_required" },
        decisionPolicy: {},
        dependencyPolicy: {},
        budgetPolicy: {},
        sourcePolicy: {},
        markdown: "# Charter",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    expect(projectBoardReadyTicketizationCards(baseBoard).map((item) => item.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(baseBoard)).toMatchObject({
      count: 1,
      disabled: false,
    });

    expect(projectBoardReadyTicketizationCards(strictBoard)).toEqual([]);
    expect(projectBoardCreateReadyTasksState(strictBoard)).toMatchObject({
      count: 0,
      disabled: true,
      title: expect.stringContaining("must be acknowledged"),
    });

    const acknowledgedStrictBoard = {
      ...strictBoard,
      cards: [
        {
          ...card,
          userTouchedFields: ["candidateStatus" as const],
          userTouchedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
    };
    expect(projectBoardReadyTicketizationCards(acknowledgedStrictBoard).map((item) => item.id)).toEqual(["card-1"]);
    expect(projectBoardCreateReadyTasksState(acknowledgedStrictBoard)).toMatchObject({
      count: 1,
      disabled: false,
      title: expect.stringContaining("acknowledged proof-scope warning"),
    });
  });
});
