import { describe, expect, it } from "vitest";

import type {
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardGitSyncStatus,
  ProjectBoardSummary,
  ProjectSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardDraftColumns,
  projectBoardDraftInboxCreateReadyPreview,
  projectBoardReadyTicketizationCards,
} from "./projectBoardDraftInboxUiModel";
import { projectBoardExecutionOverview, projectBoardExecutionReadinessRail } from "./projectBoardExecutionOverviewUiModel";
import { projectBoardBoardDecisionImpactRail, projectBoardWorkflowImpactPreview } from "./projectBoardExecutionUiModel";
import { projectBoardHistoryImpactAudit, projectBoardImpactQueue, projectBoardOverviewModel } from "./projectBoardOverviewUiModel";
import { projectBoardTabs } from "./projectBoardUiModel";

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

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: overrides.id ?? "card-1",
    boardId: overrides.boardId ?? "board-1",
    title: overrides.title ?? "Board card",
    description: overrides.description ?? "",
    status: overrides.status ?? "ready",
    candidateStatus: overrides.candidateStatus ?? "ready_to_create",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testPlan: overrides.testPlan ?? { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: overrides.sourceKind ?? "manual",
    sourceId: overrides.sourceId ?? "source-1",
    orchestrationTaskId: overrides.orchestrationTaskId ?? "task-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: overrides.id ?? "task-1",
    identifier: overrides.identifier ?? "LOCAL-1",
    title: overrides.title ?? "Board task",
    state: overrides.state ?? "ready",
    labels: overrides.labels ?? [],
    blockedBy: overrides.blockedBy ?? [],
    sourceKind: overrides.sourceKind ?? "project_board_card",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: overrides.id ?? "run-1",
    taskId: overrides.taskId ?? "task-1",
    attemptNumber: overrides.attemptNumber ?? 0,
    status: overrides.status ?? "prepared",
    workspacePath: overrides.workspacePath ?? "/workspace/.ambient/runs/run-1",
    startedAt: overrides.startedAt ?? "2026-01-01T00:05:00.000Z",
    lastEventAt: overrides.lastEventAt,
    finishedAt: overrides.finishedAt,
    proofOfWork: overrides.proofOfWork,
    ...overrides,
  };
}

function board(overrides: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: overrides.id ?? "board-1",
    projectPath: overrides.projectPath ?? "/workspace",
    status: overrides.status ?? "active",
    title: overrides.title ?? "Board",
    summary: overrides.summary ?? "",
    cards: overrides.cards ?? [],
    sources: overrides.sources ?? [],
    questions: overrides.questions ?? [],
    proposals: overrides.proposals ?? [],
    synthesisRuns: overrides.synthesisRuns ?? [],
    events: overrides.events ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
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

describe("projectBoardExecutionOverviewUiModel", () => {
  it("models draft boards from the execution owner", () => {
    const draftBoard = board({ status: "draft", cards: [card({ status: "draft", orchestrationTaskId: undefined })] });

    expect(projectBoardExecutionOverview(draftBoard)).toMatchObject({
      state: "draft",
      headline: "Finish the charter before execution starts",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardExecutionReadinessRail(draftBoard)).toMatchObject({
      blockerKind: "draft_board",
      nextActionSummary: "Click Answer Kickoff Questions",
    });
  });

  it("keeps PM decisions ahead of draft ticketization", () => {
    const decisionBoard = board({
      cards: [
        card({
          id: "draft-needs-decision",
          title: "Draft needs decision",
          status: "draft",
          orchestrationTaskId: undefined,
          clarificationQuestions: ["Should this ship as one card or split first?"],
        }),
      ],
    });

    expect(projectBoardExecutionOverview(decisionBoard)).toMatchObject({
      state: "decisions_blocked",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      action: { action: "open_decisions", label: "Answer Decisions" },
      metrics: expect.arrayContaining([
        { label: "Decisions", value: 1 },
        { label: "Draft candidates", value: 1 },
      ]),
    });
  });

  it("models prepared-run and integration-pending execution states", () => {
    const readyBoard = board({ cards: [card({ id: "ready-card", title: "Ready executable" })] });
    const readyTask = task();
    const preparedRun = run();

    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [preparedRun])).toMatchObject({
      state: "start_run",
      headline: "Prepared run is queued",
      action: { action: "start_run", label: "Start Run", cardId: "ready-card", runId: "run-1" },
    });

    const doneBoard = board({ cards: [card({ id: "done-card", title: "Done executable", status: "done" })] });
    const doneTask = task({ state: "done" });
    const completedRun = run({ status: "completed", proofOfWork: { changedFiles: ["index.html", ".ambient/runtime.json"] } });

    expect(projectBoardExecutionOverview(doneBoard, [doneTask], [completedRun])).toMatchObject({
      state: "integration_pending",
      headline: "Executable board closed; integration pending",
      metrics: expect.arrayContaining([{ label: "Pending integration", value: 1 }]),
      action: { action: "open_integration", label: "Open Integration" },
    });
  });

  it("models the board execution overview next action", () => {
    const base = {
      boardId: "board-1",
      description: "",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Do the work."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as ProjectBoardCard["sourceKind"],
      sourceId: "artifact-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const boardForCards = (
      cards: Array<
        typeof base & {
          id: string;
          title: string;
          status: "draft" | "ready" | "in_progress" | "review" | "blocked" | "done";
          orchestrationTaskId?: string;
          runFeedback?: ProjectBoardCard["runFeedback"];
          pendingPiUpdate?: ProjectBoardCard["pendingPiUpdate"];
          sourceRefs?: ProjectBoardCard["sourceRefs"];
          clarificationQuestions?: ProjectBoardCard["clarificationQuestions"];
          clarificationDecisions?: ProjectBoardCard["clarificationDecisions"];
          clarificationSuggestions?: ProjectBoardCard["clarificationSuggestions"];
          clarificationAnswers?: ProjectBoardCard["clarificationAnswers"];
        }
      >,
      events: ProjectBoardEvent[] = [],
    ) =>
      project({
        board: {
          id: "board-1",
          projectPath: "/workspace/app",
          status: "active",
          title: "App board",
          summary: "",
          cards,
          sources: [],
          questions: [],
          proposals: [],
          events,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }).board!;

    const staleDraftCard = { ...base, id: "draft-ready", title: "Ready draft", status: "draft" as const };
    const draftKickoffBoard = boardSummary({
      status: "draft",
      cards: [staleDraftCard],
      questions: [
        {
          id: "question-1",
          boardId: "board-1",
          question: "What is the project goal?",
          required: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(projectBoardExecutionOverview(draftKickoffBoard)).toMatchObject({
      state: "draft",
      headline: "Finish the charter before execution starts",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardExecutionReadinessRail(draftKickoffBoard)).toMatchObject({
      nextActionSummary: "Click Answer Kickoff Questions",
      action: { action: "open_charter", label: "Answer Kickoff Questions" },
    });
    expect(projectBoardTabs(draftKickoffBoard).find((tab) => tab.id === "draft_inbox")).toMatchObject({ count: 0 });
    expect(projectBoardTabs(draftKickoffBoard).find((tab) => tab.id === "map")).toMatchObject({ count: 0 });
    expect(projectBoardDraftInboxCreateReadyPreview(draftKickoffBoard)).toMatchObject({
      totalCandidateCount: 0,
      ticketizableCards: [],
      markReadyCards: [],
    });
    expect(projectBoardDraftColumns(draftKickoffBoard.cards, { board: draftKickoffBoard }).flatMap((column) => column.cards)).toEqual([]);
    expect(projectBoardReadyTicketizationCards(draftKickoffBoard)).toEqual([]);

    const activeWithDraftCard = { ...draftKickoffBoard, status: "active" as const };
    expect(projectBoardTabs(activeWithDraftCard).find((tab) => tab.id === "draft_inbox")).toMatchObject({ count: 1 });
    expect(projectBoardDraftInboxCreateReadyPreview(activeWithDraftCard).totalCandidateCount).toBe(1);

    const draftReadyBoard = boardForCards([
      { ...base, id: "draft-ready", title: "Ready draft", status: "draft", sourceKind: "manual" as const },
    ]);
    expect(projectBoardExecutionOverview(draftReadyBoard)).toMatchObject({
      state: "create_tasks",
      headline: "Create 1 ready Local Task",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    const plannerSeedBoard = boardForCards([{ ...base, id: "planner-seed", title: "Durable plan seed", status: "draft" }]);
    expect(projectBoardExecutionOverview(plannerSeedBoard)).toMatchObject({
      state: "source_synthesis_needed",
      blockerKind: "needs_source_synthesis",
      headline: "Run source planning before ticketization",
      action: { action: "open_source_picker", label: "Add Cards From Sources" },
      metrics: expect.arrayContaining([
        { label: "Plan seed", value: 1 },
        { label: "Synthesized cards", value: 0 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(plannerSeedBoard)).toMatchObject({
      blockerKind: "needs_source_synthesis",
      headline: "Run source planning before ticketization",
      nextActionSummary: "Click Add Cards From Sources",
      action: { action: "open_source_picker", label: "Add Cards From Sources" },
    });
    const decisionBlockedDraftBoard = boardForCards([
      {
        ...base,
        id: "draft-needs-decision",
        title: "Preview container decision",
        status: "draft",
        clarificationQuestions: ["Should the preview use a div or sandboxed iframe?"],
      },
    ]);
    expect(projectBoardExecutionOverview(decisionBlockedDraftBoard)).toMatchObject({
      state: "decisions_blocked",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      action: { action: "open_decisions", label: "Answer Decisions" },
      metrics: expect.arrayContaining([
        { label: "Decisions", value: 1 },
        { label: "Draft candidates", value: 1 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(decisionBlockedDraftBoard)).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "decision_blocked",
      headline: "Answer 1 PM decision",
      pendingSummary: "1 decision, 1 draft candidate",
      nextActionSummary: "Click Answer Decisions",
      action: { action: "open_decisions", label: "Answer Decisions" },
    });
    const planningDraftReadyBoard = {
      ...draftReadyBoard,
      synthesisRuns: [
        {
          id: "run-planning",
          boardId: draftReadyBoard.id,
          status: "running" as const,
          stage: "source_classification" as const,
          sourceCount: 2,
          includedSourceCount: 2,
          sourceCharCount: 8391,
          warningCount: 0,
          events: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(projectBoardExecutionOverview(planningDraftReadyBoard)).toMatchObject({
      state: "planning_running",
      headline: "Planning is still running",
      metrics: expect.arrayContaining([
        { label: "Planning", value: 1 },
        { label: "Draft ready", value: 1 },
      ]),
    });
    expect(projectBoardExecutionOverview(planningDraftReadyBoard).action).toBeUndefined();
    expect(projectBoardExecutionReadinessRail(planningDraftReadyBoard)).toMatchObject({
      blockerKind: "planning_running",
      headline: "Planning is still running",
      pendingSummary: "1 planning, 1 draft ready",
      nextActionSummary: "Wait for planning to finish",
    });

    const finishedPlanningDraftReadyBoard = {
      ...planningDraftReadyBoard,
      synthesisRuns: planningDraftReadyBoard.synthesisRuns.map((run) => ({ ...run, status: "succeeded" as const })),
    };
    expect(projectBoardExecutionOverview(finishedPlanningDraftReadyBoard)).toMatchObject({
      state: "create_tasks",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });

    const readyBoard = boardForCards([
      { ...base, id: "ready-card", title: "Ready executable", status: "ready", orchestrationTaskId: "task-1" },
    ]);
    const readyTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Ready executable",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [])).toMatchObject({
      state: "prepare_run",
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    expect(projectBoardExecutionReadinessRail(readyBoard, [readyTask], [])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "ready_not_prepared",
      headline: "Prepare 1 ready Local Task",
      doneSummary: "No completed work yet",
      pendingSummary: "1 ready",
      nextActionSummary: "Click Prepare Next Run",
      metrics: expect.arrayContaining([{ label: "Done", value: 0 }]),
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    const gitReadyStatus: ProjectBoardGitSyncStatus = {
      boardId: "board-1",
      projectRoot: "/workspace/app",
      artifactRoot: "/workspace/app/.ambient/board",
      isGitRepository: true,
      repoRoot: "/workspace/app",
      branch: "main",
      hasCommit: true,
      remote: "origin",
      hasRemote: true,
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      dirtyBoardFileCount: 0,
      dirtyBoardFiles: [],
      mode: "git_ready",
      projection: {
        ok: true,
        valid: true,
        differenceCount: 0,
        differences: [],
        fileCount: 4,
        cardCount: 1,
        sourceCount: 0,
        eventCount: 0,
        proposalRunCount: 0,
        activeClaimCount: 0,
        expiredClaimCount: 0,
        claimConflictCount: 0,
      },
    };
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        gitStatus: { ...gitReadyStatus, hasRemote: false, remote: undefined, upstream: undefined, mode: "git_no_remote" },
      }),
    ).toMatchObject({
      visible: true,
      blockerKind: "ready_not_prepared",
      secondary: {
        tone: "warning",
        blockerKind: "git_no_remote",
        headline: "Git exists, but collaboration is local",
      },
    });
    expect(
      projectBoardExecutionOverview(readyBoard, [readyTask], [], {
        gitStatus: {
          ...gitReadyStatus,
          projection: {
            ...gitReadyStatus.projection!,
            ok: false,
            valid: false,
            differenceCount: 1,
            differences: ["Invalid .ambient/board/config.json"],
          },
        },
      }),
    ).toMatchObject({
      state: "collaboration_blocked",
      blockerKind: "projection_invalid",
      headline: "Pulled board projection is invalid",
      action: { action: "open_board", label: "Review Git Blocker" },
    });
    expect(
      projectBoardExecutionOverview(readyBoard, [readyTask], [], {
        orchestrationError: "Workflow file not found: /workspace/app/WORKFLOW.md",
      }),
    ).toMatchObject({
      state: "workflow_blocked",
      headline: "Create WORKFLOW.md before ready work can run",
      action: { action: "prepare_run", label: "Create Workflow + Prepare", cardId: "ready-card" },
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        orchestrationError: "Workflow file not found: /workspace/app/WORKFLOW.md",
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "missing_workflow",
      headline: "Create WORKFLOW.md before ready work can run",
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "missing",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
        },
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "missing_workflow",
      headline: "Create WORKFLOW.md before ready work can run",
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
          autoDispatch: false,
        },
      }),
    ).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "auto_dispatch_disabled",
      headline: "Auto-dispatch is off; prepare manually",
      nextActionSummary: "Click Prepare Next Run",
      action: { action: "prepare_run", label: "Prepare Next Run", cardId: "ready-card" },
    });
    expect(
      projectBoardExecutionReadinessRail(readyBoard, [readyTask], [], {
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
          autoDispatch: true,
          workspaceStrategy: "git-worktree",
        },
        gitStatus: { ...gitReadyStatus, hasCommit: false, hasRemote: false, remote: undefined, upstream: undefined, mode: "git_no_remote" },
      }),
    ).toMatchObject({
      visible: true,
      tone: "danger",
      blockerKind: "git_unborn",
      headline: "Commit project before preparing worktrees",
      action: { action: "open_board", label: "Review Git Setup" },
    });

    const preparedRun = {
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 0,
      status: "prepared",
      workspacePath: "/workspace/app/.ambient/runs/run-1",
      startedAt: "2026-01-01T00:05:00.000Z",
    };
    expect(projectBoardExecutionOverview(readyBoard, [readyTask], [preparedRun])).toMatchObject({
      state: "start_run",
      headline: "Prepared run is queued",
      action: { action: "start_run", label: "Start Run", runId: "run-1", cardId: "ready-card" },
    });

    const doneBoard = boardForCards([
      { ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" },
    ]);
    const doneTask = { ...readyTask, state: "done" as const };
    const doneOverview = projectBoardExecutionOverview(doneBoard, [doneTask], [{ ...preparedRun, status: "failed" }]);
    expect(doneOverview).toMatchObject({
      state: "complete",
      headline: "Executable board is closed",
    });
    expect(doneOverview.action).toBeUndefined();
    const completedDeliverableRun = {
      ...preparedRun,
      status: "completed",
      proofOfWork: { changedFiles: ["index.html", "app.js", ".ambient/runtime.json", "node_modules/cache/index.js"] },
    };
    const pendingIntegrationOverview = projectBoardExecutionOverview(doneBoard, [doneTask], [completedDeliverableRun]);
    expect(pendingIntegrationOverview).toMatchObject({
      state: "integration_pending",
      headline: "Executable board closed; integration pending",
      metrics: expect.arrayContaining([{ label: "Pending integration", value: 1 }]),
      action: { action: "open_integration", label: "Open Integration" },
    });
    expect(projectBoardExecutionReadinessRail(doneBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "integration_pending",
      headline: "Executable board closed; integration pending",
      doneSummary: "1 done",
      pendingSummary: "1 pending integration",
      nextActionSummary: "Click Open Integration",
      action: { action: "open_integration", label: "Open Integration" },
    });
    const doneWithReadyDraftBoard = boardForCards([
      { ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" },
      { ...base, id: "draft-next", title: "Next draft", status: "draft" },
    ]);
    expect(projectBoardExecutionOverview(doneWithReadyDraftBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "create_tasks",
      headline: "Create 1 ready Local Task",
      metrics: expect.arrayContaining([
        { label: "Draft ready", value: 1 },
        { label: "Pending integration", value: 1 },
      ]),
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    expect(projectBoardExecutionReadinessRail(doneWithReadyDraftBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      tone: "warning",
      blockerKind: "needs_ticketization",
      headline: "Create 1 ready Local Task",
      doneSummary: "1 done",
      pendingSummary: "1 draft ready, 1 pending integration",
      nextActionSummary: "Click Open Draft Inbox",
      action: { action: "open_draft_inbox", label: "Open Draft Inbox" },
    });
    const doneWithReadyDraftAndPlanningBoard = {
      ...doneWithReadyDraftBoard,
      synthesisRuns: planningDraftReadyBoard.synthesisRuns,
    };
    expect(projectBoardExecutionOverview(doneWithReadyDraftAndPlanningBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "planning_running",
      headline: "Planning is still running",
      metrics: expect.arrayContaining([
        { label: "Planning", value: 1 },
        { label: "Draft ready", value: 1 },
        { label: "Pending integration", value: 1 },
      ]),
    });
    expect(projectBoardExecutionReadinessRail(doneWithReadyDraftAndPlanningBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      visible: true,
      blockerKind: "planning_running",
      headline: "Planning is still running",
      doneSummary: "1 done",
      pendingSummary: "1 planning, 1 draft ready, 1 pending integration",
      nextActionSummary: "Wait for planning to finish",
    });
    expect(
      projectBoardOverviewModel(doneBoard, {
        tasks: [doneTask],
        runs: [completedDeliverableRun],
      }).steps.find((step) => step.id === "board"),
    ).toMatchObject({
      statusLabel: "Executable board closed; integration pending",
      actionLabel: "Open Integration",
      tone: "warning",
    });
    const integratedDoneBoard = boardForCards(
      [{ ...base, id: "done-card", title: "Done executable", status: "done", orchestrationTaskId: "task-1" }],
      [
        {
          id: "event-deliverable-integrated",
          boardId: "board-1",
          kind: "deliverable_integration_resolved",
          title: "Deliverables applied to project root",
          summary: "2 files applied.",
          entityKind: "orchestration_run",
          entityId: completedDeliverableRun.id,
          metadata: {
            runId: completedDeliverableRun.id,
            taskId: doneTask.id,
            cardId: "done-card",
            action: "apply_to_root",
            status: "integrated",
            materialFiles: ["index.html", "app.js"],
            excludedFiles: [".ambient/runtime.json", "node_modules/cache/index.js"],
            appliedFiles: ["index.html", "app.js"],
            skippedFiles: [],
          },
          createdAt: "2026-01-01T00:10:00.000Z",
        },
      ],
    );
    expect(projectBoardExecutionOverview(integratedDoneBoard, [doneTask], [completedDeliverableRun])).toMatchObject({
      state: "complete",
      headline: "Executable board closed; deliverables integrated",
      detail: "All completed run deliverables have explicit integration outcomes: 1 integrated, 0 exported, and 0 deferred.",
    });
    expect(
      projectBoardWorkflowImpactPreview(doneBoard, [doneTask], [preparedRun], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        autoDispatch: true,
      }),
    ).toMatchObject({ visible: false });

    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        rawContent: "---\norchestration:\n  max_concurrent_agents: 2\n---\nPrompt",
        autoDispatch: true,
        maxConcurrentAgents: 2,
        maxTurns: 35,
        workspaceStrategy: "directory",
        proofOfWork: { requireTests: true, requireDiffSummary: true, requireScreenshots: false },
      }),
    ).toMatchObject({
      visible: true,
      state: "current_workflow",
      tone: "ready",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
      settings: {
        autoDispatch: true,
        maxConcurrentAgents: 2,
        maxTurns: 35,
        workspaceStrategy: "directory",
        requireTests: true,
        requireDiffSummary: true,
        requireScreenshots: false,
      },
      rawEditor: {
        markdown: expect.stringContaining("max_concurrent_agents: 2"),
        lineCount: 5,
        truncated: false,
      },
      metrics: expect.arrayContaining([{ label: "Model calls", value: "0", title: expect.any(String) }]),
      actions: expect.arrayContaining([expect.objectContaining({ action: "prepare_next", label: "Prepare next" })]),
    });
    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [], {
        status: "invalid",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        code: "workflow_validation_error",
        message: "orchestration.max_concurrent_agents must be positive",
        warnings: [],
        repairPreview: {
          workspaceStrategy: "directory",
          currentText: "---\norchestration:\n  max_concurrent_agents: 0\n---\nPrompt",
          proposedText:
            "---\nversion: 1\norchestration:\n  auto_dispatch: true\n  max_concurrent_agents: 1\n---\nWork on Local Task {{ task.identifier }}.",
          diff: "diff --git a/WORKFLOW.md b/WORKFLOW.md\n--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n@@ -1,5 +1,7 @@\n ---\n+version: 1\n orchestration:\n-  max_concurrent_agents: 0\n+  auto_dispatch: true\n+  max_concurrent_agents: 1\n ---\n-Prompt\n+Work on Local Task {{ task.identifier }}.\n",
          currentLineCount: 5,
          proposedLineCount: 7,
        },
      }),
    ).toMatchObject({
      visible: true,
      state: "workflow_unavailable",
      tone: "danger",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      repairPreview: {
        validationMessage: "orchestration.max_concurrent_agents must be positive",
        workspaceStrategy: "directory",
        currentLineCount: 5,
        proposedLineCount: 7,
        currentTextTruncated: false,
        diffTruncated: false,
        diff: expect.stringContaining("-  max_concurrent_agents: 0"),
      },
      actions: expect.arrayContaining([
        expect.objectContaining({ action: "restore_generated_default", label: "Restore default workflow" }),
        expect.objectContaining({ action: "use_existing_anyway", label: "Keep file for now" }),
      ]),
    });
    expect(
      projectBoardWorkflowImpactPreview(
        readyBoard,
        [readyTask],
        [
          {
            ...preparedRun,
            proofOfWork: {
              kind: "preparation",
              workflowHash: "old-workflow-hash",
              workflowPath: "/workspace/app/WORKFLOW.md",
            },
          },
        ],
        {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:00:00.000Z",
          workflowHash: "current-workflow-hash",
          warnings: [],
          autoDispatch: true,
        },
      ),
    ).toMatchObject({
      visible: true,
      state: "prepared_workflow_stale",
      tone: "warning",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
      affectedRunIds: ["run-1"],
      actions: expect.arrayContaining([
        expect.objectContaining({ action: "continue_old_prep", label: "Continue old prep" }),
        expect.objectContaining({ action: "prepare_again", label: "Prepare again" }),
      ]),
    });
    expect(
      projectBoardWorkflowImpactPreview(readyBoard, [readyTask], [preparedRun], {
        status: "ready",
        path: "/workspace/app/WORKFLOW.md",
        checkedAt: "2026-01-01T00:00:00.000Z",
        workflowHash: "current-workflow-hash",
        warnings: [],
        autoDispatch: true,
      }),
    ).toMatchObject({
      visible: true,
      state: "prepared_workflow_unknown",
      tone: "warning",
      detail: expect.stringContaining("Existing cards, PM proof, and board history are preserved"),
      modelCallRequired: false,
      affectedCardIds: ["ready-card"],
    });

    const decisionImpactEvent: ProjectBoardEvent = {
      id: "event-decision-impact",
      boardId: "board-1",
      kind: "card_updated",
      title: "Clarification decision answered",
      summary: "Decision answer affects one ready card.",
      entityKind: "project_board_card",
      entityId: "draft-card",
      metadata: {
        decisionImpact: {
          question: "What threshold should auto-shrink use?",
          affectedCardIds: ["ready-card"],
          affectedCounts: { readyFeedback: 1 },
          modelCallRequired: false,
        },
      },
      createdAt: "2026-01-01T00:10:00.000Z",
    };
    expect(
      projectBoardBoardDecisionImpactRail(
        boardForCards(
          [{ ...base, id: "ready-card", title: "Ready executable", status: "ready", orchestrationTaskId: "task-1" }],
          [decisionImpactEvent],
        ),
      ),
    ).toMatchObject({
      visible: true,
      tone: "warning",
      needsFeedbackCount: 1,
      feedbackReadyCount: 0,
      modelCallRequired: false,
      cards: [
        expect.objectContaining({
          cardId: "ready-card",
          state: "needs_feedback",
          question: "What threshold should auto-shrink use?",
          actionLabel: "Add feedback",
        }),
      ],
    });
    expect(
      projectBoardBoardDecisionImpactRail(
        boardForCards(
          [
            {
              ...base,
              id: "ready-card",
              title: "Ready executable",
              status: "ready",
              orchestrationTaskId: "task-1",
              runFeedback: [
                {
                  id: "feedback-1",
                  source: "decision_impact",
                  feedback: "Use the accepted auto-shrink threshold on the next run.",
                  decisionQuestion: "What threshold should auto-shrink use?",
                  decisionAnswer: "Begin shrinking at 11 characters.",
                  createdAt: "2026-01-01T00:11:00.000Z",
                },
              ],
            },
          ],
          [decisionImpactEvent],
        ),
      ),
    ).toMatchObject({
      visible: true,
      tone: "ready",
      needsFeedbackCount: 0,
      feedbackReadyCount: 1,
      cards: [expect.objectContaining({ cardId: "ready-card", state: "feedback_ready", actionLabel: "Inspect feedback" })],
    });

    const sourceImpactEvent: ProjectBoardEvent = {
      id: "event-source-impact",
      boardId: "board-1",
      kind: "source_updated",
      title: "Source classification updated",
      summary: "Source change affected draft and ticketized cards.",
      entityKind: "project_board_source",
      entityId: "source-1",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          sourceId: "source-1",
          groupSourceIds: ["source-1"],
          existingCardsRewritten: false,
          modelCallRequired: false,
          additiveSynthesisAvailable: true,
          targetedRefreshOptional: true,
          nextRunFeedbackRecommended: true,
          affectedCardIds: ["source-draft", "source-ready"],
          affectedDraftCardIds: ["source-draft"],
          affectedExecutableCardIds: ["source-ready"],
          affectedDraftCount: 1,
          affectedExecutableCount: 1,
          selectedObservationCount: 1,
          estimatedPromptChars: 240,
          recommendedAction: "add_next_run_feedback",
          detail: "Source selection updated without rewriting existing cards.",
        },
      },
      createdAt: "2026-01-01T00:12:00.000Z",
    };
    const overviewDecisionImpactEvent: ProjectBoardEvent = {
      ...decisionImpactEvent,
      id: "event-overview-decision-impact",
      metadata: {
        decisionImpact: {
          question: "What threshold should auto-shrink use?",
          affectedCardIds: ["source-ready"],
          affectedCounts: { readyFeedback: 1 },
          modelCallRequired: false,
        },
      },
      createdAt: "2026-01-01T00:11:00.000Z",
    };
    const proofImpactEvent: ProjectBoardEvent = {
      id: "event-proof-impact",
      boardId: "board-1",
      kind: "card_updated",
      title: "Proof expectations suggested",
      summary: "Pi suggested reviewable proof expectations for one card.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        proofImpact: {
          schemaVersion: 1,
          appliedAction: "suggest_missing_proof",
          targetCardIds: ["missing-proof"],
          appliedCardIds: ["missing-proof"],
          pendingPiUpdateCardIds: ["missing-proof"],
          skippedCardIds: [],
          appliedProofItemCount: 2,
          missingProofCountBefore: 1,
          missingProofCountAfter: 1,
          existingCardsRewritten: false,
          modelCallRequired: true,
          promptCharCount: 1200,
        },
      },
      createdAt: "2026-01-01T00:13:00.000Z",
    };
    const overviewBoard = boardForCards(
      [
        { ...base, id: "source-draft", title: "Source draft", status: "draft", sourceId: "source-1" },
        { ...base, id: "source-ready", title: "Source ready", status: "ready", sourceId: "source-1", orchestrationTaskId: "task-source" },
        {
          ...base,
          id: "staged-card",
          title: "Staged Pi update",
          status: "draft",
          sourceId: "source-1",
          pendingPiUpdate: {
            sourceId: "source:source-1",
            createdAt: "2026-01-01T00:13:00.000Z",
            changedFields: ["description"],
            description: "Updated source-aware description.",
          },
        },
        {
          ...base,
          id: "missing-proof",
          title: "Missing proof",
          status: "draft",
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
        },
      ],
      [proofImpactEvent, sourceImpactEvent, overviewDecisionImpactEvent],
    );
    const overview = projectBoardOverviewModel(overviewBoard);
    const impactQueue = projectBoardImpactQueue(overviewBoard);
    const impactAudit = projectBoardHistoryImpactAudit(overviewBoard);
    expect(projectBoardTabs(overviewBoard)[0]).toMatchObject({ id: "overview", count: expect.any(Number) });
    expect(overview.steps.map((step) => step.id)).toEqual([
      "charter",
      "decisions",
      "draft_inbox",
      "map",
      "board",
      "proof",
      "integration",
      "history",
    ]);
    expect(impactQueue.items.map((item) => item.kind)).toEqual(expect.arrayContaining(["decision", "source", "staged_update", "proof"]));
    expect(impactQueue.items.find((item) => item.kind === "source")).toMatchObject({
      modelCallRequired: false,
      affectedCardIds: expect.arrayContaining(["source-draft", "source-ready"]),
      metrics: expect.arrayContaining([expect.objectContaining({ label: "Local Tasks", value: 1 })]),
    });
    expect(impactQueue.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Full-board Pi", value: "0" })]));
    expect(impactAudit).toMatchObject({
      activeCount: expect.any(Number),
      recordedCount: expect.any(Number),
      affectedCardCount: expect.any(Number),
      metrics: expect.arrayContaining([expect.objectContaining({ label: "Full-board Pi", value: "0" })]),
    });
    expect(impactAudit.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "active", kind: "source", title: expect.stringContaining("Source") }),
        expect.objectContaining({
          status: "recorded",
          kind: "proof",
          title: "Proof suggestions staged",
          modelCallRequired: true,
          affectedCardIds: ["missing-proof"],
          metrics: expect.arrayContaining([expect.objectContaining({ label: "Staged", value: 1 })]),
        }),
        expect.objectContaining({
          status: "recorded",
          kind: "decision",
          title: "Decision impact recorded",
          modelCallRequired: false,
        }),
      ]),
    );

    const sourceRefreshAppliedEvent: ProjectBoardEvent = {
      id: "event-source-refresh-applied",
      boardId: "board-1",
      kind: "card_updated",
      title: "Source drafts refreshed",
      summary: "Source impact applied to affected drafts.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          appliedAction: "refresh_affected_drafts",
          sourceImpactEventIds: ["event-source-impact"],
          sourceIds: ["source-1"],
          appliedCardIds: ["source-draft"],
        },
      },
      createdAt: "2026-01-01T00:14:00.000Z",
    };
    const handledSourceBoard = boardForCards(
      [
        { ...base, id: "source-draft", title: "Source draft", status: "draft", sourceId: "source-1" },
        {
          ...base,
          id: "source-ready",
          title: "Source ready",
          status: "ready",
          sourceId: "source-1",
          orchestrationTaskId: "task-source",
          runFeedback: [
            {
              id: "source-feedback-1",
              source: "source_impact",
              feedback: "Review the updated source on the next run.",
              sourceImpactEventId: "event-source-impact",
              sourceImpactEventIds: ["event-source-impact"],
              sourceIds: ["source-1"],
              createdAt: "2026-01-01T00:15:00.000Z",
            },
          ],
        },
      ],
      [sourceRefreshAppliedEvent, sourceImpactEvent],
    );
    expect(projectBoardImpactQueue(handledSourceBoard).items.some((item) => item.kind === "source")).toBe(false);
  });
});
