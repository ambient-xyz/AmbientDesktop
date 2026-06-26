import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardPmReviewReport, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCanonicalCardProjection,
  projectBoardCardVisualTone,
  projectBoardColumns,
  projectBoardExecutionControlModel,
  projectBoardExecutionOverview,
  projectBoardPmReviewReportUiModel,
  projectBoardProofDecisionModel,
} from "./projectBoardUiModel";

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

describe("projectBoardProofUiModel PM review", () => {
  it("explains PM proof decisions and exposes close controls", () => {
    const card = {
      id: "review-card",
      boardId: "board-1",
      title: "Review card",
      description: "Ready for PM proof close.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-review",
      orchestrationTaskId: "task-review",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "All proof expectations have been satisfied.",
        satisfied: ["Unit proof passed."],
        missing: [],
        followUpCardIds: [],
        runId: "run-review",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "close" as const,
        evidenceQuality: "strong" as const,
        confidence: 0.88,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const board = {
      charter: {
        budgetPolicy: {
          maxPassesPerCard: 5,
          pauseOnTerminalBlocker: true,
          smallestSufficientProof: true,
        },
      },
    };
    const task = {
      id: "task-review",
      identifier: "LOCAL-10",
      title: "Review card",
      state: "needs_review",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const decision = projectBoardProofDecisionModel(card, board, task);
    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const controls = projectBoardExecutionControlModel(card, board, detail);

    expect(decision.statusLabel).toBe("Ready for review");
    expect(decision.recommendationLabel).toBe("Recommended: close");
    expect(decision.policySummary).toContain("Focus passes: 5");
    expect(decision.nextAction).toContain("Accept as done");
    expect(decision.readyForDecision).toBe(true);
    expect(decision.readinessLabel).toBe("Ready for decision");
    expect(decision.actions.find((action) => action.action === "retry")?.label).toBe("Send back for revision");
    expect(decision.actions.find((action) => action.action === "retry")?.title).toContain(
      "include the reviewer note in the next run prompt",
    );
    expect(decision.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", false],
      ["retry", false],
      ["mark_blocked", false],
    ]);
    expect(controls.state).toBe("review");
    expect(controls.headline).toContain("Review proof");
    expect(controls.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", false],
      ["retry_card", false],
      ["mark_blocked", false],
    ]);
    expect(controls.policySummary).toContain("pause on terminal blockers");

    const doneDecision = projectBoardProofDecisionModel({ ...card, status: "done" as const }, board, { ...task, state: "done" });
    expect(doneDecision.nextAction).toContain("no proof close decision is needed");
    expect(doneDecision.actions).toEqual([]);

    const runningRun: OrchestrationRun = {
      id: "run-review-active",
      taskId: task.id,
      attemptNumber: 1,
      status: "running",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-10-active",
      startedAt: "2026-01-01T00:06:00.000Z",
      proofOfWork: { kind: "agent-run", lastAssistantText: "Still gathering proof." },
    };
    const runningDecision = projectBoardProofDecisionModel(
      { ...card, status: "in_progress" as const, proofReview: undefined },
      board,
      { ...task, state: "in_progress" },
      runningRun,
    );
    expect(runningDecision).toMatchObject({
      statusLabel: "Proof not ready",
      readyForDecision: false,
      readinessLabel: "Proof not ready",
      awaitingRun: true,
    });
    expect(runningDecision.readinessReason).toContain("Wait for the current run to finish");
    expect(runningDecision.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["accept_done", true],
      ["retry", true],
      ["mark_blocked", true],
    ]);
  });

  it("puts failed execution retry and disabled close policy in one PM control model", () => {
    const card = {
      id: "failed-card",
      boardId: "board-1",
      title: "Failed card",
      description: "Needs another worker pass.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-failed",
      orchestrationTaskId: "task-failed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-failed",
      identifier: "LOCAL-11",
      title: "Failed card",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-failed",
      taskId: "task-failed",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/failed-card",
      threadId: "thread-failed",
      startedAt: "2026-01-01T00:03:00.000Z",
      error: "Missing API token.",
      proofOfWork: {
        kind: "agent-run",
        lastAssistantStatus: "error",
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(controls.state).toBe("blocked");
    expect(controls.headline).toContain("retry");
    expect(controls.detail).toContain("missing information");
    expect(controls.actions.find((action) => action.action === "start_run")).toMatchObject({
      label: "Retry run",
      disabled: false,
      runId: "run-failed",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: true,
      title: "Wait for the PM proof review before applying a close decision.",
    });
    expect(controls.actions.find((action) => action.action === "open_run_chat")).toMatchObject({
      threadId: "thread-failed",
    });
  });

  it("allows manual PM close decisions for stopped runs with reviewable evidence", () => {
    const card = {
      id: "failed-proof-card",
      boardId: "board-1",
      title: "Failed card with proof",
      description: "The worker changed files before the provider failed.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-failed-proof",
      orchestrationTaskId: "task-failed-proof",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-failed-proof",
      identifier: "LOCAL-12",
      title: "Failed card with proof",
      state: "budget_exhausted",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-failed-proof",
      taskId: "task-failed-proof",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/failed-card-proof",
      threadId: "thread-failed-proof",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:04:00.000Z",
      error: "429 Rate limit exceeded.",
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["src/output.ts"],
        testOutput: "node test.mjs -> 20 passed, 0 failed",
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(controls.state).toBe("blocked");
    expect(controls.detail).toContain("accept manually");
    expect(controls.actions.find((action) => action.action === "start_run")).toMatchObject({
      label: "Retry run",
      disabled: false,
      runId: "run-failed-proof",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("manual inspection"),
    });
    expect(controls.actions.find((action) => action.action === "retry_card")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("reviewer feedback"),
    });
    expect(controls.actions.find((action) => action.action === "mark_blocked")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("terminal error"),
    });
  });

  it("projects accepted stopped-run cards as clean done state across board controls", () => {
    const card: ProjectBoardCard = {
      id: "accepted-stopped-card",
      boardId: "board-1",
      title: "Accepted stopped card",
      description: "The worker changed files before a provider failure, and PM accepted the proof.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: ["old-blocker"],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-accepted",
      orchestrationTaskId: "task-accepted",
      proofReview: {
        status: "done",
        summary: "Accepted as done by user PM decision. Reason: changed files and unit proof were sufficient.",
        satisfied: ["Unit proof passed.", "Accepted by user PM decision."],
        missing: [],
        followUpCardIds: [],
        runId: "run-stopped",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        recommendedAction: "close",
        evidenceQuality: "strong",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const blocker: ProjectBoardCard = {
      ...card,
      id: "old-blocker",
      title: "Historical blocker",
      blockedBy: [],
      orchestrationTaskId: "task-blocker",
      proofReview: undefined,
    };
    const task = {
      id: "task-accepted",
      identifier: "LOCAL-7",
      title: "Accepted stopped card",
      state: "done",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-stopped",
      taskId: "task-accepted",
      attemptNumber: 1,
      status: "failed",
      workspacePath: "/tmp/accepted-stopped-card",
      threadId: "thread-stopped",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:06:00.000Z",
      error: "Provider failed after proof was recorded.",
      proofOfWork: {
        kind: "agent-run",
        changedFiles: ["src/output.ts"],
        testOutput: "node test.mjs -> passed",
      },
    };

    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: run });
    const detail = projectBoardActiveCardDetail(card, [card, blocker], [task], [run]);
    const controls = projectBoardExecutionControlModel(card, {}, detail);
    const overview = projectBoardActiveCardOverviewModel(card, { sources: [] }, detail, controls);

    expect(projection).toMatchObject({
      kind: "done_after_stopped_run",
      visualStatus: "done",
      statusLabel: "Done: accepted with evidence",
      runLabel: "Historical stopped run accepted",
      blockerLabel: "No active blockers",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
      terminalDone: true,
    });
    expect(
      projectBoardColumns([card])
        .find((column) => column.id === "done")
        ?.cards.map((item) => item.id),
    ).toEqual(["accepted-stopped-card"]);
    expect(projectBoardCardVisualTone(card)).toBe("done");
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")).toMatchObject({
      state: "done",
      detail: "No active blockers remain after the PM done decision.",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "done",
      detail: "No next action is required; historical run issues are audit-only.",
    });
    expect(controls).toMatchObject({
      state: "done",
      headline: "Done: accepted with evidence",
      runLabel: "Historical stopped run accepted",
      proofLabel: "Accepted with evidence",
      blockerLabel: "No active blockers",
    });
    expect(controls.actions.map((action) => action.action)).not.toContain("start_run");
    expect(controls.actions.map((action) => action.action)).not.toContain("accept_done");
    expect(controls.actions.map((action) => action.action)).not.toContain("mark_blocked");
    expect(controls.actions.map((action) => action.action)).not.toContain("retry_card");
    expect(overview.badges.map((badge) => [badge.label, badge.value, badge.tone])).toEqual(
      expect.arrayContaining([
        ["Card", "Done: accepted with evidence", "done"],
        ["Run", "Historical stopped run accepted", "done"],
        ["Proof", "Accepted with evidence", "done"],
      ]),
    );
    expect(overview.sections.find((section) => section.id === "history")).toMatchObject({
      tone: "done",
      detail: "Historical stopped run accepted; retained for audit.",
    });

    const readyTaskWithoutRun = {
      ...task,
      state: "ready",
      updatedAt: "2026-01-01T00:08:00.000Z",
    };
    const readyDetail = projectBoardActiveCardDetail(card, [card], [readyTaskWithoutRun], []);
    const readyControls = projectBoardExecutionControlModel(
      card,
      {
        workflowReadiness: {
          status: "missing",
          path: "/tmp/workflow/WORKFLOW.md",
          checkedAt: "2026-01-01T00:08:00.000Z",
          warnings: [],
          message: "No workflow file is present.",
        },
      },
      readyDetail,
    );
    expect(readyControls).toMatchObject({
      state: "done",
      blockerLabel: "No active blockers",
    });
    expect(readyControls.actions.map((action) => action.action)).not.toContain("prepare_run");
  });

  it("uses retry attempt order when accepted proof runs share timestamps", () => {
    const card: ProjectBoardCard = {
      id: "accepted-retry-card",
      boardId: "board-1",
      title: "Accepted retry card",
      description: "The worker failed once, retried immediately, and PM accepted the passing proof.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Retry proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "retry-fixture",
      orchestrationTaskId: "task-retry",
      proofReview: {
        status: "done",
        summary: "Accepted as done by user PM decision. Reason: retry proof passed.",
        satisfied: ["Retry proof passed.", "Accepted by user PM decision."],
        missing: [],
        followUpCardIds: [],
        runId: "run-retry-completed",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "close",
        evidenceQuality: "strong",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-retry",
      identifier: "LOCAL-8",
      title: card.title,
      state: "done",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const sharedTime = "2026-01-01T00:04:00.000Z";
    const failedRun = {
      id: "run-retry-failed",
      taskId: task.id,
      attemptNumber: 0,
      status: "failed",
      workspacePath: "/tmp/retry-card",
      threadId: "thread-failed",
      startedAt: sharedTime,
      finishedAt: sharedTime,
      lastEventAt: sharedTime,
      error: "Initial proof failed.",
      proofOfWork: {
        commands: [{ command: "pnpm test", exitCode: 1 }],
      },
    };
    const completedRun = {
      id: "run-retry-completed",
      taskId: task.id,
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/retry-card",
      threadId: "thread-completed",
      startedAt: sharedTime,
      finishedAt: sharedTime,
      lastEventAt: sharedTime,
      proofOfWork: {
        changedFiles: ["src/retry.ts"],
        commands: [{ command: "pnpm test", exitCode: 0 }],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [failedRun, completedRun]);
    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: detail.latestRun });
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(detail.latestRun?.id).toBe("run-retry-completed");
    expect(projection).toMatchObject({
      kind: "done_with_manual_evidence",
      statusLabel: "Done with evidence",
      runLabel: "Historical run accepted",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
    });
    expect(controls).toMatchObject({
      state: "done",
      headline: "Done with evidence",
      runLabel: "Historical run accepted",
      blockerLabel: "No active blockers",
    });
  });

  it("allows manual PM close decisions for completed runs when the task still needs review", () => {
    const card = {
      id: "completed-budget-card",
      boardId: "board-1",
      title: "Completed card with proof",
      description: "The worker completed the run but did not emit a terminal task action.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Proof is sufficient."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-completed-proof",
      orchestrationTaskId: "task-completed-proof",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-completed-proof",
      identifier: "LOCAL-13",
      title: "Completed card with proof",
      state: "budget_exhausted",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-completed-proof",
      taskId: "task-completed-proof",
      attemptNumber: 1,
      status: "completed" as const,
      workspacePath: "/tmp/completed-card-proof",
      threadId: "thread-completed-proof",
      startedAt: "2026-01-01T00:03:00.000Z",
      finishedAt: "2026-01-01T00:04:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        lastAssistantText: "The fixture is valid and all required scenarios are present.",
        commands: ["node -e \"JSON.parse(fs.readFileSync('tokens.json'))\""],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const projection = projectBoardCanonicalCardProjection(card, { task, latestRun: detail.latestRun });
    const controls = projectBoardExecutionControlModel(card, {}, detail);

    expect(projection).toMatchObject({
      kind: "review",
      visualStatus: "review",
      statusLabel: "Review",
      proofLabel: "Needs PM review",
      suppressStaleRunState: true,
    });
    expect(
      projectBoardColumns([card], { tasks: [task], runs: [run] })
        .find((column) => column.id === "review")
        ?.cards.map((item) => item.id),
    ).toEqual(["completed-budget-card"]);
    expect(projectBoardExecutionOverview(boardSummary({ cards: [card] }), [task], [run])).toMatchObject({
      state: "review",
      headline: "Proof is waiting for review",
      metrics: expect.arrayContaining([
        { label: "Review", value: 1 },
        { label: "Blocked", value: 0 },
      ]),
      action: { action: "inspect_card", label: "Review Proof", cardId: "completed-budget-card" },
    });
    expect(controls).toMatchObject({
      state: "review",
      statusLabel: "PM decision",
      headline: "Review proof and choose a PM close action",
      taskLabel: "LOCAL-13 · Needs Review",
      blockerLabel: "No blockers",
    });
    expect(controls.actions.find((action) => action.action === "accept_done")).toMatchObject({
      disabled: false,
      title: expect.stringContaining("manual inspection"),
    });
    expect(controls.actions.find((action) => action.action === "retry_card")).toMatchObject({
      disabled: false,
    });
  });

  it("models PM Review report UI variants for constraints, conflicts, ignored sources, and activation recommendations", () => {
    const scenarios: Array<{
      name: string;
      report: ProjectBoardPmReviewReport;
      expectedCoverage: Partial<ReturnType<typeof projectBoardPmReviewReportUiModel>["coverage"]>;
      expectedSections: string[];
      excludedText?: string[];
    }> = [
      {
        name: "ready_with_constraints",
        report: pmReviewReport({
          readiness: "ready_for_card_generation",
          summary: "The calculator charter is ready for card generation, constrained to the MVP.",
          sourceConfidence: "medium",
          sourceConfidenceNotes: ["Primary PRD is authoritative, but changed implementation notes should constrain card scope."],
          risks: ["Changed implementation notes could pull the first board beyond MVP scope."],
          sourceAuthorityNotes: ["Treat docs/PRD.md as primary over changed implementation notes."],
          recommendedActivationScope: "Generate only the calculator shell, arithmetic reducer, and visual proof cards.",
          cardGenerationConstraints: ["Generate at most three MVP cards.", "Defer settings, theming, memory, and collaboration cards."],
        }),
        expectedCoverage: { recommendationScope: true, cardGenerationConstraints: true, sourceAuthority: true },
        expectedSections: ["Source confidence: Medium", "Risks", "Source authority", "Card generation constraints"],
      },
      {
        name: "source_conflict_needs_answer",
        report: pmReviewReport({
          readiness: "needs_answers",
          summary: "The editor charter has a blocking source conflict around sync scope.",
          sourceConfidence: "low",
          sourceConfidenceNotes: ["Primary and scratch sources disagree on whether sync is in scope."],
          blockingQuestions: ["Should the first board stay local-only, or include cloud sync/account work?"],
          risks: ["Generating cards before resolving sync scope would produce conflicting implementation work."],
          sourceConflicts: ["docs/PRD.md excludes cloud sync, while scratch/collaboration.md proposes cloud sync and login."],
          sourceAuthorityNotes: ["Prefer docs/PRD.md unless the PM explicitly overrides sync scope."],
          recommendedActivationScope: "Ask the sync-scope question before card generation.",
          cardGenerationConstraints: ["Do not generate sync, login, or collaboration cards until the PM resolves the conflict."],
        }),
        expectedCoverage: { blockingQuestions: true, sourceConflicts: true, cardGenerationConstraints: true },
        expectedSections: ["Source confidence: Low", "Blocking questions", "Source conflicts", "Card generation constraints"],
      },
      {
        name: "ignored_source_excluded",
        report: pmReviewReport({
          summary: "The included PRD is enough for a local kanban board.",
          sourceConfidence: "high",
          sourceConfidenceNotes: ["The ignored spike was excluded; the included PRD covers the local board scope."],
          risks: ["Do not reintroduce ignored spike scope."],
          sourceAuthorityNotes: ["Only docs/kanban-prd.md should guide the first board."],
          recommendedActivationScope: "Generate local kanban board cards from the PRD only.",
          cardGenerationConstraints: ["Exclude experimental ledger scope."],
        }),
        expectedCoverage: { sourceConfidence: true, recommendationScope: true, cardGenerationConstraints: true },
        expectedSections: ["Source confidence: High", "Source authority", "Card generation constraints"],
        excludedText: ["blockchain", "token-gated"],
      },
      {
        name: "recommendation_scope_ready_for_activation",
        report: pmReviewReport({
          readiness: "ready_for_activation",
          summary: "The asteroids charter is ready to activate a narrow first playable slice.",
          sourceConfidence: "high",
          sourceConfidenceNotes: ["The GDD is primary and covers the first playable slice."],
          risks: ["Powerups and online leaderboard work should not enter the first board."],
          sourceAuthorityNotes: ["Treat docs/asteroids-gdd.md as authoritative for first playable scope."],
          recommendedActivationScope: "Activate only player movement, asteroid spawning, shooting, collision, score, and visual proof.",
          cardGenerationConstraints: ["Leave powerups, boss waves, online leaderboard, and monetization to later Add Cards work."],
        }),
        expectedCoverage: { recommendationScope: true, cardGenerationConstraints: true, sourceAuthority: true },
        expectedSections: ["Source confidence: High", "Risks", "Source authority", "Card generation constraints"],
      },
    ];

    for (const scenario of scenarios) {
      const model = projectBoardPmReviewReportUiModel(scenario.report);
      const renderedText = [
        model.readinessLabel,
        model.summary,
        model.recommendedActivationScope,
        ...model.sections.flatMap((section) => [section.title, ...section.items]),
      ].join("\n");

      expect(model.recommendedActivationScope.trim().length, scenario.name).toBeGreaterThan(20);
      expect(model.coverage, scenario.name).toMatchObject({
        sourceConfidence: true,
        gitState: true,
        ...scenario.expectedCoverage,
      });
      for (const title of scenario.expectedSections) {
        expect(
          model.sections.map((section) => section.title),
          scenario.name,
        ).toContain(title);
      }
      for (const excluded of scenario.excludedText ?? []) {
        expect(renderedText.toLowerCase(), scenario.name).not.toContain(excluded);
      }
    }
  });
});
function pmReviewReport(overrides: Partial<ProjectBoardPmReviewReport> = {}): ProjectBoardPmReviewReport {
  return {
    readiness: "ready_for_card_generation",
    summary: "The charter is ready for a lightweight PM review.",
    sourceConfidence: "high",
    sourceConfidenceNotes: ["The selected source set is sufficient for this review."],
    gitState: "git_ready",
    gitStateNotes: ["Git coordination is ready."],
    blockingQuestions: [],
    risks: [],
    sourceConflicts: [],
    sourceAuthorityNotes: [],
    recommendedActivationScope: "Generate the next narrow draft board from this PM review recommendation.",
    cardGenerationConstraints: [],
    ...overrides,
  };
}
