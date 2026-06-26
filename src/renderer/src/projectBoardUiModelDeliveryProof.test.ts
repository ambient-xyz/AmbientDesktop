import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardDeliverableIntegrationQueue,
  projectBoardEventHasSupersededCardReview,
  projectBoardProofCoverageForBoard,
  projectBoardProofReviewQueueSummary,
  projectBoardSupersededCardReview,
  projectBoardTabs,
  projectBoardTestSummaryForBoard,
  projectBoardUnattachedLocalTasks,
} from "./projectBoardUiModel";
import { project } from "./projectBoardUiModelTestHelpers";

describe("projectBoardUiModel delivery and proof residuals", () => {
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
