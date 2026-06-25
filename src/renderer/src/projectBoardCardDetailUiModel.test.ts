import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardExecutionArtifact } from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCardCanEditDependencies,
  projectBoardCardDependencyBadges,
  projectBoardCardIsDraftInboxCandidate,
  projectBoardDependencyChangeImpactPreview,
  projectBoardDependencyEditOptions,
  projectBoardDependencyHealth,
  projectBoardExecutionControlModel,
  projectBoardExecutionPmReview,
  projectBoardPrimaryBlockingCard,
  projectBoardProofEvidenceModel,
  projectBoardTabs,
} from "./projectBoardUiModel";

describe("projectBoardCardDetailUiModel", () => {
  it("detects unresolved blockers, cycles, and deterministic dependency order", () => {
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
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", priority: 1, sourceId: "artifact-foundation" },
      { ...base, id: "dependent", title: "Dependent", priority: 2, blockedBy: ["foundation", "missing-ref"] },
      { ...base, id: "cycle-a", title: "Cycle A", priority: 3, blockedBy: ["cycle-b"] },
      { ...base, id: "cycle-b", title: "Cycle B", priority: 4, blockedBy: ["cycle-a"] },
      {
        ...base,
        id: "source-ref",
        title: "Source ref",
        priority: 5,
        blockedBy: ["artifact-foundation"],
        testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      },
    ];

    const health = projectBoardDependencyHealth(cards);

    expect(health.unresolved.map((item) => [item.card.id, item.blockerRef])).toEqual([["dependent", "missing-ref"]]);
    expect(health.cycles).toEqual([{ cardIds: ["cycle-a", "cycle-b"], titles: ["Cycle A", "Cycle B"] }]);
    expect(health.cycleRepairSuggestions[0]).toMatchObject({
      card: expect.objectContaining({ id: "cycle-b" }),
      blocker: expect.objectContaining({ id: "cycle-a" }),
      blockerRef: "cycle-a",
    });
    expect(health.criticalPath.cards.map((card) => card.id)).toEqual(["foundation", "dependent"]);
    expect(health.criticalPath.summary).toContain("2-card critical path");
    expect(health.orderedCards.slice(0, 3).map((card) => card.id)).toEqual(["foundation", "dependent", "source-ref"]);
    expect(health.readiness.map((item) => [item.card.id, item.order, item.state])).toEqual([
      ["foundation", 1, "ready_after_proof"],
      ["dependent", 2, "blocked_issue"],
      ["source-ref", 3, "waiting_on_dependencies"],
      ["cycle-a", 4, "cycle"],
      ["cycle-b", 5, "cycle"],
    ]);
    expect(health.readiness.find((item) => item.card.id === "foundation")).toMatchObject({
      impactLabel: "Would make 1 downstream card ready.",
      criticalPath: true,
      criticalPathIndex: 1,
    });
  });

  it("classifies card dependency badges by current blocker state", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards: ProjectBoardCard[] = [
      { ...base, id: "done-card", title: "Finished foundation", status: "done", orchestrationTaskId: "task-done" },
      { ...base, id: "ready-card", title: "Still waiting", status: "ready", orchestrationTaskId: "task-ready" },
      {
        ...base,
        id: "dependent",
        title: "Dependent",
        status: "in_progress",
        blockedBy: ["done-card", "ready-card", "missing-ref", "LOCAL-7"],
      },
    ];
    const tasks = [
      {
        id: "task-done",
        identifier: "LOCAL-1",
        title: "Finished foundation",
        state: "done",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-ready",
        identifier: "LOCAL-2",
        title: "Still waiting",
        state: "ready",
        labels: [],
        blockedBy: [],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-review",
        identifier: "LOCAL-7",
        title: "Review handoff",
        state: "review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(
      projectBoardCardDependencyBadges(cards[2], cards, { tasks }).map((badge) => [badge.ref, badge.prefix, badge.state, badge.label]),
    ).toEqual([
      ["done-card", "Dependency ready", "satisfied", "Finished foundation"],
      ["ready-card", "Blocked by", "blocked", "Still waiting"],
      ["missing-ref", "Unresolved blocker", "unresolved", "missing-ref"],
      ["LOCAL-7", "Dependency ready", "satisfied", "LOCAL-7"],
    ]);
  });

  it("previews dependency edit impact before mutating blocker lists", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", priority: 1 },
      { ...base, id: "feature", title: "Feature", priority: 2, blockedBy: ["foundation"] },
      { ...base, id: "polish", title: "Polish", priority: 3, blockedBy: ["feature"] },
    ];

    const removeImpact = projectBoardDependencyChangeImpactPreview(cards[1], cards, {
      action: "remove_blocker",
      blockerRef: "foundation",
    });
    const cycleImpact = projectBoardDependencyChangeImpactPreview(cards[0], cards, {
      action: "add_blocker",
      blockerRef: "polish",
    });

    expect(removeImpact).toMatchObject({
      visible: true,
      tone: "ready",
      modelCallRequired: false,
      existingCardsRewritten: false,
      blockerLabel: "Foundation",
      beforeState: "waiting_on_dependencies",
      afterState: "ready_now",
      readyNowDelta: 1,
      issueDelta: 0,
    });
    expect(removeImpact.deltaLabel).toBe("+1 ready");
    expect(removeImpact.affectedCards.map((item) => [item.cardId, item.beforeLabel, item.afterLabel])).toContainEqual([
      "feature",
      "Waiting on dependencies (#2)",
      "Ready now (#2)",
    ]);
    expect(cycleImpact).toMatchObject({
      visible: true,
      tone: "danger",
      issueDelta: 1,
      beforeState: "ready_now",
      afterState: "cycle",
    });
    expect(cycleImpact.headline).toContain("dependency issues");
    expect(cycleImpact.afterMetrics.find((metric) => metric.label === "Issues")?.value).toBe(1);
  });

  it("explains ready, blocked, running, and review map states", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "done", title: "Done", status: "done" as const, priority: 1 },
      { ...base, id: "running", title: "Running", status: "in_progress" as const, priority: 2 },
      { ...base, id: "review", title: "Review", status: "review" as const, priority: 3 },
      { ...base, id: "ready", title: "Ready", priority: 4, blockedBy: ["done"] },
      { ...base, id: "blocked", title: "Blocked", priority: 5, blockedBy: ["running"] },
      { ...base, id: "proof", title: "Proof", priority: 6, testPlan: { unit: [], integration: [], visual: [], manual: [] } },
      { ...base, id: "manual-blocked", title: "Manual Blocked", status: "blocked" as const, priority: 7 },
      {
        ...base,
        id: "clarify",
        title: "Clarify",
        status: "draft" as const,
        candidateStatus: "needs_clarification" as const,
        priority: 8,
        clarificationQuestions: ["Which input model should ship?"],
      },
      {
        ...base,
        id: "ready-unanswered",
        title: "Ready but unanswered",
        status: "draft" as const,
        candidateStatus: "ready_to_create" as const,
        priority: 9,
        clarificationQuestions: ["Which renderer should ship?"],
      },
    ];

    const readiness = projectBoardDependencyHealth(cards).readiness;

    expect(readiness.map((item) => [item.card.id, item.state, item.label])).toEqual([
      ["done", "done", "Done"],
      ["running", "running", "Running"],
      ["review", "waiting_on_review", "Waiting on review"],
      ["ready", "ready_now", "Ready now"],
      ["blocked", "waiting_on_dependencies", "Waiting on dependencies"],
      ["proof", "ready_after_proof", "Ready after proof"],
      ["manual-blocked", "blocked_issue", "Blocked"],
      ["clarify", "needs_clarification", "Needs clarification"],
      ["ready-unanswered", "needs_clarification", "Needs clarification"],
    ]);
    expect(readiness.find((item) => item.card.id === "blocked")?.waitingOn.map((card) => card.id)).toEqual(["running"]);
  });

  it("uses pulled execution proof to satisfy dependency blockers while keeping the card in PM review", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Works"],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Create game shell", priority: 1, sourceId: "artifact-foundation" },
      { ...base, id: "controls", title: "Add controls", priority: 2, blockedBy: ["foundation"], sourceId: "artifact-controls" },
    ];
    const artifact: ProjectBoardExecutionArtifact = {
      id: "run-foundation",
      boardId: "board-1",
      cardId: "foundation",
      status: "completed",
      source: "git",
      workspaceBranch: "board/foundation",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
      completedAt: "2026-01-01T00:04:00.000Z",
      proof: {
        summary: "Created the shell with a visible canvas.",
        commands: ["pnpm test"],
        changedFiles: ["src/game.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      handoff: {
        summary: "Shell is ready for dependent controls work.",
        completed: ["Mounted canvas."],
        remaining: [],
        risks: [],
        followUps: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      createdAt: "2026-01-01T00:04:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Game board",
      summary: "",
      cards,
      sources: [],
      questions: [],
      proposals: [],
      executionArtifacts: [artifact],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
    };

    const readiness = projectBoardDependencyHealth(board).readiness;

    expect(readiness.find((item) => item.card.id === "foundation")).toMatchObject({
      state: "waiting_on_review",
      label: "Pulled proof",
      newlyReadyUnblocks: [expect.objectContaining({ id: "controls" })],
    });
    expect(readiness.find((item) => item.card.id === "controls")).toMatchObject({
      state: "ready_now",
      waitingOn: [],
    });
  });

  it("summarizes pulled execution artifacts for project-manager review", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Works"],
      testPlan: { unit: ["unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "shell", title: "Shell", priority: 1, sourceId: "artifact-shell" },
      { ...base, id: "controls", title: "Controls", priority: 2, sourceId: "artifact-controls", blockedBy: ["shell"] },
      { ...base, id: "audio", title: "Audio", priority: 3, sourceId: "artifact-audio" },
      {
        ...base,
        id: "resize-follow-up",
        title: "Add resize regression",
        description: "Pulled handoff follow-up from Shell.\n\nManual-only proof",
        status: "draft" as const,
        candidateStatus: "needs_clarification" as const,
        priority: 4,
        sourceKind: "run_follow_up" as const,
        sourceId: "run-shell#follow-up:1",
        blockedBy: ["shell"],
        labels: ["run-follow-up", "pulled-handoff"],
      },
    ];
    const completed: ProjectBoardExecutionArtifact = {
      id: "run-shell",
      boardId: "board-1",
      cardId: "shell",
      status: "completed",
      source: "git",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:02:00.000Z",
      proof: {
        summary: "Shell proof is present.",
        commands: ["pnpm test"],
        changedFiles: ["src/shell.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      handoff: {
        summary: "Shell can unblock controls, but resize should be checked again.",
        completed: ["Canvas mounted."],
        remaining: [],
        risks: ["Resize behavior only checked manually."],
        followUps: [{ title: "Add resize regression", reason: "Manual-only proof", blockedBy: ["shell"] }],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      createdAt: "2026-01-01T00:02:00.000Z",
    };
    const failed: ProjectBoardExecutionArtifact = {
      id: "run-audio",
      boardId: "board-1",
      cardId: "audio",
      status: "failed",
      source: "git",
      startedAt: "2026-01-01T00:03:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
      handoff: {
        summary: "Audio manager could not initialize.",
        completed: [],
        remaining: ["Retry with mocked audio context."],
        risks: ["Browser audio policy blocked initialization."],
        followUps: [],
        createdAt: "2026-01-01T00:04:00.000Z",
      },
      createdAt: "2026-01-01T00:04:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Game board",
      summary: "",
      cards,
      sources: [],
      questions: [],
      proposals: [],
      executionArtifacts: [completed, failed],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:04:00.000Z",
    };

    const review = projectBoardExecutionPmReview(board);

    expect(review).toMatchObject({
      total: 2,
      completed: 1,
      failed: 1,
      followUpCount: 1,
      riskCount: 2,
    });
    expect(review.impacts.find((impact) => impact.artifact.id === "run-shell")).toMatchObject({
      tone: "warning",
      newlyReadyUnblocks: expect.arrayContaining([expect.objectContaining({ id: "controls" })]),
    });
    expect(review.impacts.find((impact) => impact.artifact.id === "run-shell")?.newlyReadyUnblocks.map((card) => card.id)).not.toContain(
      "resize-follow-up",
    );
    expect(review.impacts.find((impact) => impact.artifact.id === "run-audio")).toMatchObject({
      tone: "danger",
      action: expect.stringContaining("retry"),
    });
    expect(review.materializedFollowUps).toEqual([
      expect.objectContaining({
        card: expect.objectContaining({ id: "resize-follow-up" }),
        parentCard: expect.objectContaining({ id: "shell" }),
        runId: "run-shell",
        statusLabel: "Needs clarification",
        blockerLabel: "Blocked by Shell",
        summary: "Manual-only proof",
      }),
    ]);
    expect(projectBoardTabs(board).find((tab) => tab.id === "decisions")?.count).toBe(0);
    expect(projectBoardDependencyHealth(board).readiness.find((item) => item.card.id === "audio")).toMatchObject({
      state: "blocked_issue",
      label: "Pulled run failed",
    });
  });

  it("builds dependency edit options for unticketized draft cards", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = { ...base, id: "draft", title: "Draft", priority: 2, blockedBy: ["card:ready"] };
    const cards = [
      { ...base, id: "ready", title: "Ready blocker", status: "ready" as const, priority: 1 },
      card,
      { ...base, id: "done", title: "Done blocker", status: "done" as const, priority: 3 },
      { ...base, id: "archived", title: "Archived blocker", status: "archived" as const, priority: 4 },
    ];

    expect(projectBoardCardCanEditDependencies(card)).toBe(true);
    expect(projectBoardCardCanEditDependencies({ ...card, orchestrationTaskId: "task-1" })).toBe(false);
    expect(projectBoardCardCanEditDependencies({ ...card, status: "ready" })).toBe(false);
    expect(projectBoardDependencyEditOptions(card, cards)).toEqual([
      { ref: "ready", label: "Ready blocker", disabled: true, reason: "Already a blocker" },
      { ref: "done", label: "Done blocker", disabled: false, reason: undefined },
    ]);
  });

  it("resolves the first board-card blocker that can be jumped to", () => {
    const base = {
      boardId: "board-1",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const blocker = { ...base, id: "draft-blocker", title: "Draft blocker", status: "blocked" as const, sourceId: "artifact-blocker" };
    const ticketizedBlocker = {
      ...base,
      id: "ticketized-blocker",
      title: "Ticketized blocker",
      status: "ready" as const,
      orchestrationTaskId: "task-blocker",
      sourceId: "artifact-ticketized",
    };
    const card = {
      ...base,
      id: "dependent",
      title: "Dependent",
      status: "ready" as const,
      blockedBy: ["missing-ref", "project-board-card:draft-blocker", "task-blocker"],
    };
    const cards = [
      card,
      blocker,
      ticketizedBlocker,
      { ...base, id: "archived-blocker", title: "Archived", status: "archived" as const, sourceId: "artifact-archived" },
    ];

    expect(projectBoardPrimaryBlockingCard(card, cards)?.id).toBe("draft-blocker");
    expect(projectBoardPrimaryBlockingCard({ ...card, blockedBy: ["task-blocker"] }, cards)?.id).toBe("ticketized-blocker");
    expect(projectBoardPrimaryBlockingCard({ ...card, blockedBy: ["dependent", "artifact-archived"] }, cards)).toBeUndefined();
    expect(projectBoardCardIsDraftInboxCandidate(blocker)).toBe(true);
    expect(projectBoardCardIsDraftInboxCandidate(ticketizedBlocker)).toBe(false);
  });

  it("models active card detail from linked task state, dependencies, and run history", () => {
    const base = {
      boardId: "board-1",
      description: "Card description.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: ["ui"],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: ["Run unit"], integration: ["Run smoke"], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const cards = [
      { ...base, id: "foundation", title: "Foundation", status: "done" as const, orchestrationTaskId: "task-foundation" },
      {
        ...base,
        id: "active",
        title: "Active card",
        orchestrationTaskId: "task-active",
        blockedBy: ["foundation", "LOCAL-7", "missing-ref"],
      },
      { ...base, id: "dependent", title: "Dependent", status: "ready" as const, blockedBy: ["card:active"] },
    ];
    const tasks = [
      {
        id: "task-active",
        identifier: "LOCAL-8",
        title: "Active task",
        state: "in_progress",
        labels: ["project-board"],
        blockedBy: ["LOCAL-7"],
        sourceKind: "project_board_card",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      {
        id: "task-blocker",
        identifier: "LOCAL-7",
        title: "Task blocker",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ];
    const runs = [
      {
        id: "run-old",
        taskId: "task-active",
        attemptNumber: 0,
        status: "failed",
        workspacePath: "/tmp/old",
        startedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "run-new",
        taskId: "task-active",
        attemptNumber: 1,
        status: "running",
        workspacePath: "/tmp/new",
        startedAt: "2026-01-01T00:03:00.000Z",
        proofOfWork: { changedFiles: ["src/App.tsx"] },
      },
    ];

    const detail = projectBoardActiveCardDetail(cards[1], cards, tasks, runs);

    expect(detail.task?.identifier).toBe("LOCAL-8");
    expect(detail.latestRun?.id).toBe("run-new");
    expect(detail.runs.map((run) => run.id)).toEqual(["run-new", "run-old"]);
    expect(detail.blockedByCards.map((card) => card.id)).toEqual([]);
    expect(detail.blockedByTasks.map((task) => task.identifier)).toEqual([]);
    expect(detail.unresolvedBlockers).toEqual(["missing-ref"]);
    expect(detail.unblocks.map((card) => card.id)).toEqual(["dependent"]);
    expect(detail.proofExpectationCount).toBe(2);
    expect(detail.progressLedger.map((entry) => [entry.id, entry.state])).toEqual([
      ["completed_work", "active"],
      ["remaining_work", "blocked"],
      ["files_touched", "done"],
      ["verification", "done"],
      ["proof_collected", "done"],
      ["task_actions", "active"],
      ["blockers_questions", "blocked"],
      ["next_action", "blocked"],
    ]);
    expect(detail.progressLedger.find((entry) => entry.id === "files_touched")?.detail).toBe("src/App.tsx");
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")?.detail).toContain("unresolved missing-ref");
  });

  it("does not treat satisfied dependency refs as active execution blockers", () => {
    const foundation: ProjectBoardCard = {
      boardId: "board-1",
      id: "foundation",
      title: "Foundation",
      description: "Done prerequisite.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Foundation exists."],
      testPlan: { unit: ["Checked."], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:foundation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const validation: ProjectBoardCard = {
      ...foundation,
      id: "validation",
      title: "Validate complete game",
      status: "ready",
      blockedBy: ["synthesis:foundation"],
      sourceId: "synthesis:validation",
      orchestrationTaskId: "task-validation",
    };
    const task: OrchestrationTask = {
      id: "task-validation",
      identifier: "LOCAL-7",
      title: "Validate complete game",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(validation, [foundation, validation], [task], []);
    const execution = projectBoardExecutionControlModel(validation, { events: [] }, detail);

    expect(detail.blockedByCards).toEqual([]);
    expect(execution).toMatchObject({
      state: "ready",
      blockerLabel: "No blockers",
      headline: "Ready Local Task needs a run",
    });
  });

  it("groups active card inspector state into decision, execution, proof, dependency, source, feedback, and history sections", () => {
    const card: ProjectBoardCard = {
      boardId: "board-1",
      id: "ticketized-card",
      title: "Build hello animation",
      description: "Create a tiny animated hello world page.",
      status: "ready",
      candidateStatus: "ready_to_create",
      labels: ["ui"],
      blockedBy: [],
      acceptanceCriteria: ["The greeting animates."],
      testPlan: { unit: [], integration: ["Open the page"], visual: ["Capture desktop screenshot"], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "source-plan",
      sourceRefs: ["source-plan"],
      orchestrationTaskId: "task-hello",
      clarificationDecisions: [
        {
          id: "decision-open",
          question: "Should the greeting pulse or slide?",
          canonicalKey: "animation-style",
          source: "card",
          state: "open",
          suggestedAnswer: "Use a subtle pulse.",
          safeToAccept: true,
        },
        {
          id: "decision-answered",
          question: "Should it support reduced motion?",
          canonicalKey: "reduced-motion",
          source: "card",
          state: "answered",
          answer: "Yes.",
          answeredAt: "2026-01-01T00:01:00.000Z",
        },
        {
          id: "decision-duplicate",
          question: "Should the text pulse?",
          canonicalKey: "animation-style-alt",
          source: "description",
          state: "duplicate",
          duplicateOf: "decision-open",
        },
      ],
      pendingPiUpdate: {
        sourceId: "decision-refresh",
        createdAt: "2026-01-01T00:01:00.000Z",
        changedFields: ["description", "testPlan"],
        description: "Create a tiny animated hello world page with a pulse.",
        testPlan: { unit: [], integration: ["Open the page"], visual: ["Capture desktop and mobile screenshots"], manual: [] },
      },
      runFeedback: [
        {
          id: "feedback-1",
          feedback: "Use a reduced-motion-safe pulse.",
          source: "decision_impact",
          createdAt: "2026-01-01T00:02:00.000Z",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const board = {
      id: "board-1",
      projectPath: "/workspace/app",
      status: "active" as const,
      title: "Hello board",
      summary: "Tiny project",
      cards: [card],
      sources: [
        {
          id: "source-plan",
          boardId: "board-1",
          kind: "plan_artifact" as const,
          title: "Hello Durable Plan",
          summary: "Plan for a tiny hello world page.",
          path: ".ambient/board/plans/hello.html",
          relevance: 1,
          authorityRole: "primary" as const,
          includeInSynthesis: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [],
      proposals: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-hello",
      identifier: "LOCAL-HELLO",
      title: "Build hello animation",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const execution = projectBoardExecutionControlModel(card, {}, detail);
    const overview = projectBoardActiveCardOverviewModel(card, board, detail, execution);

    expect(overview.sections.map((section) => section.id)).toEqual([
      "decision",
      "pi_update",
      "execution",
      "proof",
      "dependencies",
      "source",
      "feedback",
      "history",
    ]);
    expect(overview.decisionAudit).toEqual({ open: 1, answered: 1, duplicate: 1, dismissed: 0 });
    expect(overview.sections.find((section) => section.id === "decision")).toMatchObject({
      headline: "1 open decision",
      tone: "warning",
    });
    expect(overview.sections.find((section) => section.id === "pi_update")).toMatchObject({
      label: "Protected Pi proposal",
      headline: "2 proposed fields",
      tone: "warning",
    });
    expect(overview.sections.find((section) => section.id === "source")?.detail).toBe("Hello Durable Plan");
    expect(overview.sections.find((section) => section.id === "feedback")).toMatchObject({
      headline: "1 additive note",
      tone: "ready",
    });
    expect(overview.badges.map((badge) => badge.label)).toEqual(["Card", "Task", "Run", "Proof"]);
  });

  it("surfaces pulled execution artifacts as card run history and PM handoff context", () => {
    const card = {
      boardId: "board-1",
      id: "card-shell",
      title: "Create shell",
      description: "Card description.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts"],
      testPlan: { unit: [], integration: ["Run smoke"], visual: [], manual: [] },
      sourceKind: "board_synthesis" as const,
      sourceId: "synthesis:shell",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const artifact: ProjectBoardExecutionArtifact = {
      id: "run-shell-1",
      boardId: "board-1",
      cardId: "card-shell",
      status: "completed",
      source: "git",
      piSessionId: "sessions/card-shell.json",
      workspaceBranch: "board/card-shell",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      completedAt: "2026-01-01T00:02:00.000Z",
      proof: {
        summary: "Created the shell.",
        commands: ["pnpm test"],
        changedFiles: ["src/App.tsx"],
        screenshots: ["test-results/shell.png"],
        browserTraces: [],
        visualChecks: [{ result: "pass" }],
        manualChecks: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      handoff: {
        summary: "Shell is ready for controls.",
        completed: ["Mounted one canvas."],
        remaining: ["Implement controls."],
        risks: [],
        followUps: [],
        createdAt: "2026-01-01T00:02:00.000Z",
      },
      createdAt: "2026-01-01T00:02:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [], [], [artifact]);

    expect(detail.latestExecutionArtifact?.id).toBe("run-shell-1");
    expect(detail.latestRun).toMatchObject({
      id: "run-shell-1",
      status: "completed",
      workspacePath: "Git board artifact: board/card-shell",
      proofOfWork: {
        kind: "git-board-run-artifact",
        lastAssistantText: "Shell is ready for controls.",
        changedFiles: ["src/App.tsx"],
      },
    });
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "done",
      detail: "Shell is ready for controls.",
    });
    expect(projectBoardProofEvidenceModel(detail.latestRun!, card)).toMatchObject({
      hasProof: true,
      summary: expect.stringContaining("1 meaningful changed file"),
    });
  });

  it("treats needs_review task blockers as dependency-satisfied in the card ledger", () => {
    const card = {
      boardId: "board-1",
      id: "active",
      title: "Dependent card",
      description: "",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Ship the dependent work."],
      testPlan: { unit: ["Run unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-dependent",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const tasks = [
      {
        id: "task-blocker",
        identifier: "LOCAL-1",
        title: "Prerequisite task",
        state: "needs_review",
        labels: [],
        blockedBy: [],
        sourceKind: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ];

    const detail = projectBoardActiveCardDetail(card, [card], tasks, []);

    expect(detail.blockedByTasks.map((task) => task.identifier)).toEqual([]);
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")).toMatchObject({
      state: "done",
      detail: "No blockers or review questions are recorded.",
    });
  });
});
