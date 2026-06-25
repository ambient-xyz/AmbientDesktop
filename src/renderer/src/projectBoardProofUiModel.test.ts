import { describe, expect, it } from "vitest";
import type {
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardPmReviewReport,
  ProjectBoardSummary,
  ProjectSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardActiveCardOverviewModel,
  projectBoardCanonicalCardProjection,
  projectBoardColumns,
  projectBoardLiveSessionPreviewModel,
  projectBoardExecutionControlModel,
  projectBoardExecutionOverview,
  projectBoardCardCanMarkReady,
  projectBoardCardVisualTone,
  projectBoardPmReviewReportUiModel,
  projectBoardProofDecisionModel,
  projectBoardProofEvidenceModel,
  projectBoardProofFollowUpImpactModel,
  projectBoardProofInspectionNavigationModel,
  projectBoardRequiresProofSpec,
  projectBoardTestSummaryForBoard,
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

describe("projectBoardProofUiModel", () => {
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

  it("summarizes runtime-budget split follow-up children on the parent card", () => {
    const parent = {
      id: "parent-card",
      boardId: "board-1",
      title: "Large card",
      description: "Timed out after useful progress.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Create shell.", "Wire controls."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-parent",
      orchestrationTaskId: "task-parent",
      proofReview: {
        status: "needs_follow_up" as const,
        summary: "Partial progress needs split follow-up.",
        satisfied: ["Create shell."],
        missing: ["Wire controls."],
        followUpCardIds: ["child-card"],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up" as const,
      },
      splitOutcome: {
        status: "proposed" as const,
        source: "runtime_budget" as const,
        sourceRunId: "run-parent",
        reason: "Runtime budget exceeded after 90s.",
        partialProofSummary: "The shell was created before timeout.",
        completedCriteria: ["Create shell."],
        remainingCriteria: ["Wire controls."],
        childCardIds: ["child-card", "missing-child"],
        maxRuntimeMs: 90_000,
        elapsedMs: 95_000,
        createdAt: "2026-01-01T00:05:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const child = {
      id: "child-card",
      boardId: "board-1",
      title: "Continue large card",
      description: "Finish remaining work.",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
      labels: ["runtime-split-follow-up"],
      blockedBy: [],
      acceptanceCriteria: ["Wire controls."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "run_follow_up" as const,
      sourceId: "run-parent#runtime-split",
      createdAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(parent, [parent, child], [], []);

    expect(detail.splitOutcome).toMatchObject({
      statusLabel: "Proposed",
      sourceLabel: "Runtime budget",
      reason: "Runtime budget exceeded after 90s.",
      completedCriteria: ["Create shell."],
      remainingCriteria: ["Wire controls."],
      unresolvedChildIds: ["missing-child"],
    });
    expect(detail.splitOutcome?.children).toEqual([
      {
        card: child,
        statusLabel: "Needs clarification",
        blockedByParent: false,
      },
    ]);

    const task = {
      id: "task-parent",
      identifier: "LOCAL-20",
      title: "Large card",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const terminalParent = {
      ...parent,
      splitOutcome: { ...parent.splitOutcome, childCardIds: ["child-card"], status: "approved" as const },
    };
    const terminalChild = { ...child, candidateStatus: "evidence" as const };
    const terminalDetail = projectBoardActiveCardDetail(terminalParent, [terminalParent, terminalChild], [task], []);

    expect(terminalDetail.splitOutcome?.canCloseViaSplit).toBe(true);
    expect(terminalDetail.splitOutcome?.actions.map((action) => [action.action, action.disabled])).toEqual([
      ["approve_split", true],
      ["retry_original", false],
      ["merge_followups", false],
      ["mark_replaced", false],
      ["accept_done_via_split", false],
      ["reject_split", false],
    ]);
  });

  it("previews proof follow-up cards without model calls or parent rewrites", () => {
    const parent: ProjectBoardCard = {
      id: "parent-card",
      boardId: "board-1",
      title: "Responsive layout task",
      description: "Needs visual proof before close.",
      status: "blocked",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Layout adapts below 400px."],
      testPlan: { unit: [], integration: [], visual: ["Capture desktop and mobile screenshots."], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-parent",
      orchestrationTaskId: "task-parent",
      proofReview: {
        status: "needs_follow_up",
        summary: "Implementation changed files, but visual proof is missing.",
        satisfied: ["Implementation files changed."],
        missing: ["Visual proof missing for mobile viewport."],
        followUpCardIds: ["follow-up-card", "missing-card"],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up",
        evidenceQuality: "mixed",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const followUp: ProjectBoardCard = {
      id: "follow-up-card",
      boardId: "board-1",
      title: "Collect responsive layout visual proof",
      description: "Capture the missing mobile proof and close the parent if it passes.",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: ["proof-follow-up"],
      blockedBy: ["parent-card"],
      acceptanceCriteria: ["Attach a 375px screenshot.", "Confirm layout does not crop controls."],
      testPlan: { unit: [], integration: [], visual: ["Capture 375px and 1280px screenshots."], manual: ["Inspect screenshot evidence."] },
      sourceKind: "run_follow_up",
      sourceId: "run-parent#proof-follow-up",
      createdAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const impact = projectBoardProofFollowUpImpactModel(parent, [parent, followUp]);

    expect(impact).toMatchObject({
      visible: true,
      headline: "1 proof follow-up card proposed",
      followUpCardCount: 1,
      missingProofCount: 1,
      modelCallRequired: false,
      existingCardsRewritten: false,
      unresolvedFollowUpCardIds: ["missing-card"],
    });
    expect(impact.parentOutcome).toContain("not rewritten");
    expect(impact.metrics.map((metric) => [metric.label, metric.value])).toEqual([
      ["Follow-ups", "1"],
      ["Missing proof", "1"],
      ["Model calls", "0"],
      ["Rewritten fields", "0"],
    ]);
    expect(impact.cards).toEqual([
      expect.objectContaining({
        cardId: "follow-up-card",
        sourceLabel: "Proof follow-up draft",
        statusLabel: "Needs clarification",
        blockerLabel: "Blocked by parent: Responsive layout task",
        blockedByParent: true,
        proofExpectationCount: 2,
        proofExpectations: ["Visual: Capture 375px and 1280px screenshots.", "Manual: Inspect screenshot evidence."],
      }),
    ]);
  });

  it("flags proof follow-up recommendations that have not materialized a draft card", () => {
    const parent: ProjectBoardCard = {
      id: "parent-card",
      boardId: "board-1",
      title: "Animation polish task",
      description: "Needs another proof pass.",
      status: "review",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Animation does not stutter."],
      testPlan: { unit: [], integration: [], visual: ["Record animation proof."], manual: [] },
      sourceKind: "planner_plan",
      sourceId: "artifact-parent",
      proofReview: {
        status: "needs_follow_up",
        summary: "Follow-up proof is required.",
        satisfied: [],
        missing: ["Animation proof missing."],
        followUpCardIds: [],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:05:00.000Z",
        recommendedAction: "follow_up",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const impact = projectBoardProofFollowUpImpactModel(parent, [parent]);

    expect(impact.visible).toBe(true);
    expect(impact.headline).toBe("Proof follow-up recommended");
    expect(impact.followUpCardCount).toBe(0);
    expect(impact.detail).toContain("no draft follow-up card is linked yet");
    expect(impact.parentOutcome).toContain("materialized");
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

  it("surfaces durable execution blockers in ready-card controls", () => {
    const card = {
      id: "ready-card",
      boardId: "board-1",
      title: "Ready card",
      description: "Needs an execution contract before dispatch.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Run the work."],
      testPlan: { unit: ["Run unit proof."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-ready",
      orchestrationTaskId: "task-ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const task = {
      id: "task-ready",
      identifier: "LOCAL-12",
      title: "Ready card",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const event: ProjectBoardEvent = {
      id: "event-workflow",
      boardId: "board-1",
      kind: "execution_readiness_blocked",
      title: "Execution blocked: missing WORKFLOW.md",
      summary: "Ready Local Tasks could not be prepared because /workspace/app/WORKFLOW.md is missing.",
      entityKind: "project_board",
      entityId: "board-1",
      metadata: { blocker: "missing_workflow" },
      createdAt: "2026-01-01T00:06:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);
    const controls = projectBoardExecutionControlModel(
      card,
      {
        events: [event],
        workflowReadiness: {
          status: "missing",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:06:00.000Z",
          warnings: [],
        },
      },
      detail,
    );

    expect(controls.state).toBe("blocked");
    expect(controls.detail).toContain("/workspace/app/WORKFLOW.md is missing");
    expect(controls.blockerLabel).toBe("Missing Workflow");
    expect(controls.actions.find((action) => action.action === "prepare_run")).toMatchObject({
      disabled: true,
      title: "Workflow file not found: /workspace/app/WORKFLOW.md",
    });

    const autoDispatchOffControls = projectBoardExecutionControlModel(
      card,
      {
        events: [],
        workflowReadiness: {
          status: "ready",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:06:00.000Z",
          warnings: [],
          autoDispatch: false,
        },
      },
      detail,
    );
    expect(autoDispatchOffControls.state).toBe("ready");
    expect(autoDispatchOffControls.actions.find((action) => action.action === "prepare_run")).toMatchObject({
      disabled: false,
      title: "Prepare the next eligible ready Local Task run so it can be started from this board.",
    });
  });

  it("classifies proof artifacts for PM evidence inspection", () => {
    const card = {
      id: "evidence-card",
      boardId: "board-1",
      title: "Evidence card",
      description: "Needs inspectable evidence.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the game shell."],
      testPlan: { unit: ["Run state tests."], integration: ["Run smoke build."], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-evidence",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "Proof is strong enough to close.",
        satisfied: ["Unit proof recorded.", "Visual/browser proof recorded."],
        missing: [],
        followUpCardIds: [],
        runId: "run-evidence",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        reviewer: "ambient_pi" as const,
        model: "ambient-pi",
        confidence: 0.88,
        evidenceQuality: "strong" as const,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-evidence",
      taskId: "task-evidence",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 8,
        lastAssistantStatus: "done",
        changedFiles: [
          { path: "src/App.tsx", status: " M", category: "modified" },
          { path: "src/game/state.test.ts", status: "A ", category: "added" },
          { path: "test-results/spaceship-shell.png", status: "??", category: "untracked" },
          { path: "node_modules/.vite/vitest/results.json", status: " M", category: "modified" },
        ],
        gitStatus: [" M src/App.tsx", "A  src/game/state.test.ts"],
        screenshots: [{ path: "/tmp/project/test-results/spaceship-shell.png", width: 1280, height: 720 }],
        visualChecks: [
          { path: "test-results/spaceship-shell.png", result: "nonblank_image_detected", width: 1280, height: 720, nonBlackPixels: 1234 },
        ],
        browserTraces: ["test-results/trace.zip"],
        testOutput: "pnpm test passed",
        afterRunHook: { ok: true, command: "pnpm test", output: "tests passed", durationMs: 420 },
        focusLoop: { action: "finish", reason: "proof_satisfied", passNumber: 2 },
        lastAssistantText: "Implemented the shell and captured a nonblank screenshot.",
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n+render shell",
        diffTruncated: true,
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("3 meaningful changed files");
    expect(evidence.metrics.map((metric) => metric.label)).toEqual(
      expect.arrayContaining(["Messages", "Assistant", "Files", "Visual", "Checks", "Trace", "Focus", "Diff"]),
    );
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", ["src/App.tsx"]],
      ["Tests", ["src/game/state.test.ts"]],
      ["Visual", ["test-results/spaceship-shell.png"]],
      ["Dependencies", ["node_modules/.vite/vitest/results.json"]],
    ]);
    expect(evidence.files.find((file) => file.path.includes("node_modules"))?.meaningful).toBe(false);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "browser_trace", "command"]);
    expect(evidence.artifacts[0]).toMatchObject({
      label: "Screenshot 1",
      dimensionsLabel: "1280x720",
      viewportLabel: "Desktop viewport 1280x720",
      visualRole: "desktop",
    });
    expect(evidence.artifacts[0]?.previewSrc).toBe("file:///tmp/project/test-results/spaceship-shell.png");
    expect(evidence.artifacts[1]).toMatchObject({
      kind: "log",
      label: "Nonblank Image Detected",
      detail: expect.stringContaining("1234 nonblack pixels"),
    });
    expect(evidence.hook).toMatchObject({ label: "afterRun passed", tone: "success" });
    expect(evidence.artifacts[3]).toMatchObject({ kind: "command", detail: "pnpm test passed" });
    expect(evidence.focus).toMatchObject({ label: "Focus loop Finish", detail: expect.stringContaining("proof_satisfied") });
    expect(evidence.review).toMatchObject({
      reviewer: "Ambient/Pi PM judge",
      confidence: "88%",
      evidenceQuality: "Strong",
      recommendedAction: "close",
    });
    expect(evidence.inspection).toMatchObject({
      headline: "Proof packet needs PM attention",
      qualityLabel: "Strong evidence · Needs review",
      qualityTone: "warning",
      issueCount: 0,
      issueTarget: "inspection-checklist",
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      diffLabel: "Diff attached, truncated",
      failedAssertions: [],
    });
    expect(evidence.inspection.checklist.map((item) => [item.label, item.tone])).toEqual(
      expect.arrayContaining([
        ["Implementation evidence", "success"],
        ["Command / test evidence", "success"],
        ["Visual evidence", "success"],
        ["PM judge", "success"],
      ]),
    );
    expect(evidence.inspection.checklist.map((item) => [item.label, item.target])).toEqual(
      expect.arrayContaining([
        ["Command / test evidence", "command-evidence"],
        ["Visual evidence", "visual-evidence"],
        ["PM judge", "pm-judge"],
      ]),
    );
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Visual proof", "Screenshot attached", "success"],
      ["Desktop visual check", "Additional visual check", "success"],
      ["Browser trace", "Additional trace", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      comparisonLabel: "Desktop viewport screenshot is available for PM review.",
    });
  });

  it("classifies absolute files inside the run workspace by their relative source path", () => {
    const workspacePath = "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-absolute";
    const run = {
      id: "run-absolute-files",
      taskId: "task-absolute-files",
      attemptNumber: 1,
      status: "completed",
      workspacePath,
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: [
          `${workspacePath}/index.html`,
          `file://${workspacePath}/src/app.js`,
          `${workspacePath}/.ambient-codex/browser/screenshots/title.png`,
          `${workspacePath}/node_modules/cache/index.js`,
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.summary).toContain("2 meaningful changed files");
    expect(evidence.fileGroups.map((group) => [group.label, group.files.map((file) => file.path)])).toEqual([
      ["Implementation", [`${workspacePath}/index.html`, `file://${workspacePath}/src/app.js`]],
      ["Generated/cache", [`${workspacePath}/.ambient-codex/browser/screenshots/title.png`]],
      ["Dependencies", [`${workspacePath}/node_modules/cache/index.js`]],
    ]);
  });

  it("identifies missing visual proof and failed assertions in proof packet inspection", () => {
    const card = {
      id: "weak-visual-card",
      boardId: "board-1",
      title: "Weak visual card",
      description: "Needs mobile and desktop proof.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: ["Run layout tests."], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-weak-visual",
      proofReview: {
        status: "needs_follow_up" as const,
        summary: "Desktop proof exists, but mobile proof and tests failed.",
        satisfied: ["Desktop screenshot recorded."],
        missing: ["Mobile screenshot proof missing.", "Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-weak-visual",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "weak" as const,
        recommendedAction: "follow_up" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-weak-visual",
      taskId: "task-weak-visual",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-2",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        commands: [{ command: "pnpm test", result: "failed", output: "layout.spec.ts failed at mobile breakpoint" }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured. Mobile screenshot was not captured because the viewport setup failed.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityLabel).toBe("Weak evidence · 4 review issues");
    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.issueCount).toBe(4);
    expect(evidence.inspection.issueTarget).toBe("proof-issues");
    expect(evidence.inspection.headline).toContain("review issues");
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.visualEvidence[0]).toMatchObject({
      role: "mobile",
      viewportLabel: "Mobile viewport",
      comparisonLabel: "Expected evidence is missing",
    });
    expect(evidence.inspection.visualEvidence[1]).toMatchObject({
      role: "desktop",
      viewportLabel: "Desktop viewport 1280x720",
      dimensionsLabel: "1280x720",
      thumbnailSrc: "data:image/png;base64,AAAA",
    });
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.failedAssertions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Command 1"),
        "Mobile screenshot proof missing.",
        "Command/test proof failed.",
        expect.stringContaining("Mobile screenshot was not captured"),
      ]),
    );
    expect(evidence.inspection.transcriptExcerpt).toContain("Mobile screenshot was not captured");
  });

  it("keeps strong PM evidence distinct from review issues in proof packet inspection", () => {
    const card = {
      id: "strong-with-issues-card",
      boardId: "board-1",
      title: "Strong evidence with issues",
      description: "The judge thinks proof is strong, but deterministic review still found issues.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Tests are passing."],
      testPlan: { unit: ["Run tests."], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-strong-with-issues",
      proofReview: {
        status: "ready_for_review" as const,
        summary: "The implementation is likely complete.",
        satisfied: ["Core tests were reported."],
        missing: ["Command/test proof failed."],
        followUpCardIds: [],
        runId: "run-strong-with-issues",
        reviewedAt: "2026-01-01T00:07:00.000Z",
        evidenceQuality: "strong" as const,
        confidence: 0.97,
        recommendedAction: "close" as const,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-strong-with-issues",
      taskId: "task-strong-with-issues",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/engine.ts"],
        commands: [{ command: "pnpm test", exitCode: 1, output: "engine.test.ts failed" }],
        lastAssistantText: "Tests reported one failure.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.qualityTone).toBe("danger");
    expect(evidence.inspection.qualityLabel).toBe("Strong evidence · 2 review issues");
    expect(evidence.review).toMatchObject({ evidenceQuality: "Strong", confidence: "97%" });
    expect(evidence.inspection.headline).toBe("2 review issues need attention");
    expect(evidence.inspection.checklist.find((item) => item.label === "Command / test evidence")?.target).toBe("command-evidence");
    expect(evidence.inspection.checklist.find((item) => item.label === "PM judge")?.target).toBe("pm-judge");
  });

  it("exposes accessible proof inspection jump targets for the renderer", () => {
    const inspection = {
      headline: "2 review issues need attention",
      detail: "1 meaningful file · strong evidence · 2 review issues",
      qualityLabel: "Strong evidence · 2 review issues",
      qualityTone: "danger" as const,
      issueCount: 2,
      issueTarget: "proof-issues" as const,
      workspaceLabel: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-3",
      diffLabel: "Diff attached",
      checklist: [
        {
          label: "Command / test evidence",
          detail: "1 command record attached.",
          tone: "danger" as const,
          target: "command-evidence" as const,
        },
        { label: "Visual evidence", detail: "No visual proof expected for this card.", tone: "neutral" as const },
        { label: "PM judge", detail: "ready_for_review · close · Strong · 97%", tone: "success" as const, target: "pm-judge" as const },
      ],
      visualEvidence: [],
      failedAssertions: ["Command 1 failed.", "Command/test proof failed."],
    };

    const navigation = projectBoardProofInspectionNavigationModel(inspection, "run strong/issues", "card #1");

    expect(navigation).toMatchObject({
      anchorPrefix: "proof-card-1-run-strong-issues",
      inspectionId: "proof-card-1-run-strong-issues-inspection",
      issueTargetId: "proof-card-1-run-strong-issues-proof-issues",
      proofIssuesId: "proof-card-1-run-strong-issues-proof-issues",
      commandEvidenceId: "proof-card-1-run-strong-issues-command-evidence",
      pmJudgeId: "proof-card-1-run-strong-issues-pm-judge",
      issueJumpAriaLabel: "Jump to 2 review issues need attention.",
    });
    expect(navigation.checklist).toEqual([
      {
        label: "Command / test evidence",
        checkId: "proof-card-1-run-strong-issues-check-command-test-evidence",
        target: "command-evidence",
        targetId: "proof-card-1-run-strong-issues-command-evidence",
        ariaLabel: "Jump to supporting proof evidence for Command / test evidence.",
      },
      {
        label: "Visual evidence",
        checkId: "proof-card-1-run-strong-issues-check-visual-evidence",
        target: undefined,
        targetId: undefined,
        ariaLabel: undefined,
      },
      {
        label: "PM judge",
        checkId: "proof-card-1-run-strong-issues-check-pm-judge",
        target: "pm-judge",
        targetId: "proof-card-1-run-strong-issues-pm-judge",
        ariaLabel: "Jump to supporting proof evidence for PM judge.",
      },
    ]);
  });

  it("routes visual-only proof gaps to the visual evidence target", () => {
    const card = {
      id: "visual-gap-card",
      boardId: "board-1",
      title: "Visual gap card",
      description: "Needs mobile and desktop proof, but only desktop exists.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Responsive layout is visible."],
      testPlan: { unit: [], integration: [], visual: ["Capture mobile and desktop screenshots."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-visual-gap",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-visual-gap",
      taskId: "task-visual-gap",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-4",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        changedFiles: ["src/responsive.css"],
        screenshots: [{ path: "proof/desktop-layout.png", absolutePath: "data:image/png;base64,AAAA", width: 1280, height: 720 }],
        diff: "diff --git a/src/responsive.css b/src/responsive.css\n+@media (max-width: 400px){}",
        lastAssistantText: "Desktop screenshot captured.",
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.inspection.issueCount).toBe(1);
    expect(evidence.inspection.issueTarget).toBe("visual-evidence");
    expect(evidence.inspection.headline).toBe("1 visual evidence gap");
    expect(evidence.inspection.failedAssertions).toEqual([]);
    expect(evidence.inspection.visualEvidence.map((item) => [item.label, item.statusLabel, item.tone])).toEqual([
      ["Mobile screenshot", "Missing evidence", "danger"],
      ["Desktop screenshot", "Screenshot attached", "success"],
    ]);
    expect(evidence.inspection.checklist.find((item) => item.label === "Visual evidence")?.target).toBe("visual-evidence");
  });

  it("resolves relative proof screenshot previews against the run workspace", () => {
    const run: OrchestrationRun = {
      id: "run-relative-proof",
      taskId: "task-relative-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [{ path: ".ambient-codex/browser/screenshots/browser-proof.png", width: 1440, height: 900 }],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run);

    expect(evidence.artifacts[0]).toMatchObject({
      kind: "screenshot",
      path: ".ambient-codex/browser/screenshots/browser-proof.png",
      previewSrc:
        "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    });
    expect(evidence.inspection.visualEvidence[0]?.thumbnailSrc).toBe(
      "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/browser-proof.png",
    );
  });

  it("uses screenshot sequences for animation proof and previews visual check images", () => {
    const card = {
      id: "animated-proof-card",
      boardId: "board-1",
      title: "Animated proof card",
      description: "Needs motion proof.",
      status: "review" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas transitions between visible states."],
      testPlan: {
        unit: [],
        integration: [],
        visual: ["Capture animation in browser showing title, paused, and gravity storm states."],
        manual: [],
      },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-animation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run: OrchestrationRun = {
      id: "run-animation-proof",
      taskId: "task-animation-proof",
      attemptNumber: 1,
      status: "completed",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        screenshots: [
          { path: ".ambient-codex/browser/screenshots/title.png", width: 1280, height: 720, summary: "TITLE state" },
          { path: ".ambient-codex/browser/screenshots/paused.png", width: 1280, height: 720, summary: "PAUSED state" },
          { path: ".ambient-codex/browser/screenshots/gravity-storm.png", width: 1280, height: 720, summary: "GRAVITY STORM state" },
        ],
        visualChecks: [
          {
            path: ".ambient-codex/browser/screenshots/title.png",
            result: "nonblank_image_detected",
            width: 1280,
            height: 720,
            summary: "Browser evidence title state.",
          },
        ],
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const [animationProof, browserProof] = evidence.inspection.visualEvidence;

    expect(animationProof).toMatchObject({
      label: "Animation visual proof",
      statusLabel: "3 motion frames attached",
      role: "animation",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
      comparisonLabel: "Motion proof includes 3 captured states for PM review.",
    });
    expect(animationProof?.frames?.map((frame) => frame.path)).toEqual([
      ".ambient-codex/browser/screenshots/title.png",
      ".ambient-codex/browser/screenshots/paused.png",
      ".ambient-codex/browser/screenshots/gravity-storm.png",
    ]);
    expect(browserProof).toMatchObject({
      label: "Browser visual proof",
      statusLabel: "Visual check attached",
      role: "browser",
      tone: "success",
      thumbnailSrc: "file:///tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1/.ambient-codex/browser/screenshots/title.png",
    });
  });

  it("surfaces structured task actions as proof evidence and card progress", () => {
    const card = {
      id: "action-card",
      boardId: "board-1",
      title: "Action card",
      description: "Needs structured progress.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Render the shell."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: ["Capture a screenshot."], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-action",
      orchestrationTaskId: "task-action",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const task = {
      id: "task-action",
      identifier: "LOCAL-42",
      title: "Action task",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:07:00.000Z",
    };
    const run = {
      id: "run-action",
      taskId: "task-action",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-42",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "action-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Mounted the shell and moved into verification.",
            completed: ["Created the render loop."],
            remaining: ["Capture visual proof."],
            metadata: { transport: "native_tool", toolName: "task_heartbeat" },
          },
          {
            actionId: "proof-1",
            action: "task_report_proof",
            cardId: "action-card",
            createdAt: "2026-01-01T00:06:00.000Z",
            summary: "Unit and visual proof passed.",
            commands: ["pnpm vitest src/game/renderLoop.test.ts"],
            changedFiles: ["src/game/renderLoop.ts"],
            screenshots: ["/tmp/project/test-results/render-loop.png"],
            browserTraces: [],
            visualChecks: [{ path: "test-results/render-loop.png", result: "nonblank_image_detected", width: 1024, height: 768 }],
            manualChecks: ["Opened the scene locally."],
            metadata: { transport: "native_tool", toolName: "task_report_proof" },
          },
        ],
        taskActionDiagnostics: {
          schemaVersion: 1,
          actionCount: 2,
          nativeToolActionCount: 2,
          fencedFallbackActionCount: 0,
          unknownActionCount: 0,
          terminalActionCount: 1,
          nativeToolUsed: true,
          fallbackJsonUsed: false,
          fallbackOnly: false,
          missingProtocol: [],
          integrityIssueCount: 0,
        },
      },
    };

    const evidence = projectBoardProofEvidenceModel(run, card);
    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const overview = projectBoardActiveCardOverviewModel(
      card,
      { sources: [] },
      detail,
      projectBoardExecutionControlModel(card, { events: [] }, detail),
    );

    expect(evidence.summary).toContain("2 task actions");
    expect(evidence.metrics.map((metric) => metric.label)).toContain("Actions");
    expect(evidence.taskActions.map((action) => [action.label, action.tone])).toEqual([
      ["Progress heartbeat", "neutral"],
      ["Proof reported", "success"],
    ]);
    expect(evidence.files.map((file) => file.path)).toEqual(["src/game/renderLoop.ts"]);
    expect(evidence.artifacts.map((artifact) => artifact.kind)).toEqual(["screenshot", "log", "command", "log"]);
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Native task tools: 2; fallback JSON: 0; terminal: 1"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "done",
      detail: expect.stringContaining("Proof reported"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("4 verification items");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("2 task actions");
    expect(overview.sections.find((section) => section.id === "proof")?.detail).toContain(
      "Native task tools: 2; fallback JSON: 0; terminal: 1",
    );
  });

  it("treats running transcript snapshots as live progress instead of completed proof", () => {
    const card = {
      id: "progress-card",
      boardId: "board-1",
      title: "Build shell",
      description: "Create the first shell.",
      status: "in_progress" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Canvas mounts."],
      testPlan: { unit: ["Run unit tests"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-progress",
      orchestrationTaskId: "task-progress",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-progress",
      identifier: "LOCAL-12",
      title: "Build shell",
      state: "in_progress",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const run = {
      id: "run-progress",
      taskId: "task-progress",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-12",
      startedAt: "2026-01-01T00:03:00.000Z",
      proofOfWork: {
        kind: "agent-run-progress",
        elapsedMs: 6500,
        outputCharCount: 1204,
        messageCount: 3,
        toolMessageCount: 1,
        lastAssistantText: "Working on the shell.",
        lastAssistantStatus: "streaming",
        taskToolActions: [
          {
            actionId: "heartbeat-1",
            action: "task_heartbeat",
            cardId: "progress-card",
            createdAt: "2026-01-01T00:04:00.000Z",
            summary: "Scaffolded the shell and started validation.",
            completed: ["Created app scaffold."],
            remaining: ["Finish validation."],
          },
        ],
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [run]);
    const evidence = projectBoardProofEvidenceModel(run, card);

    expect(evidence.summary).toContain("1,204 output chars");
    expect(evidence.metrics.map((metric) => [metric.label, metric.value])).toEqual(
      expect.arrayContaining([
        ["Elapsed", "6.5s"],
        ["Output", "1,204 chars"],
        ["Tools", "1"],
      ]),
    );
    expect(detail.progressLedger.find((entry) => entry.id === "completed_work")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("Progress heartbeat"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "verification")).toMatchObject({
      state: "active",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")).toMatchObject({
      state: "active",
      detail: expect.stringContaining("6.5s elapsed"),
    });
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1,204 output chars");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("1 tool card");
    expect(detail.progressLedger.find((entry) => entry.id === "task_actions")).toMatchObject({
      state: "active",
    });
  });

  it("explains progress ledger states for failed runs and missing proof specs", () => {
    const base = {
      boardId: "board-1",
      description: "Card description.",
      status: "ready" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const card = { ...base, id: "blocked", title: "Blocked card", orchestrationTaskId: "task-blocked" };
    const task = {
      id: "task-blocked",
      identifier: "LOCAL-9",
      title: "Blocked task",
      state: "ready",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const failedRun = {
      id: "run-failed",
      taskId: "task-blocked",
      attemptNumber: 0,
      status: "failed",
      workspacePath: "/tmp/failed",
      startedAt: "2026-01-01T00:03:00.000Z",
      error: "Need API credentials.",
      proofOfWork: {
        kind: "agent-run",
        messageCount: 3,
        lastAssistantStatus: "error",
        afterRunHook: { ok: false, durationMs: 125 },
        focusLoop: { passNumber: 2, maxTurns: 3, action: "finish", reason: "needs_info", missingProof: [] },
      },
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], [failedRun]);

    expect(detail.proofExpectationCount).toBe(0);
    expect(detail.progressLedger.map((entry) => [entry.id, entry.state])).toEqual([
      ["completed_work", "blocked"],
      ["remaining_work", "blocked"],
      ["files_touched", "missing"],
      ["verification", "blocked"],
      ["proof_collected", "done"],
      ["task_actions", "missing"],
      ["blockers_questions", "blocked"],
      ["next_action", "blocked"],
    ]);
    expect(detail.progressLedger.find((entry) => entry.id === "blockers_questions")?.detail).toContain("Need API credentials");
    expect(detail.progressLedger.find((entry) => entry.id === "proof_collected")?.detail).toContain("focus pass 2 needs_info");
    expect(detail.progressLedger.find((entry) => entry.id === "verification")?.detail).toContain("afterRun hook failed");
  });

  it("surfaces explicit task pause states in the progress ledger", () => {
    const card = {
      id: "needs-info-card",
      boardId: "board-1",
      title: "Needs info card",
      description: "Card description.",
      status: "blocked" as const,
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Accept it"],
      testPlan: { unit: ["Run unit"], integration: [], visual: [], manual: [] },
      sourceKind: "planner_plan" as const,
      sourceId: "artifact-base",
      orchestrationTaskId: "task-needs-info",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const task = {
      id: "task-needs-info",
      identifier: "LOCAL-10",
      title: "Needs info task",
      state: "needs_info",
      labels: [],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    const detail = projectBoardActiveCardDetail(card, [card], [task], []);

    expect(detail.progressLedger.find((entry) => entry.id === "remaining_work")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "blocked",
      detail: "Collect the missing information or credentials before retrying this task.",
    });
  });

  it("models strict proof policy readiness gates", () => {
    const missingProofCard = {
      id: "card-1",
      boardId: "board-1",
      title: "Missing proof",
      description: "",
      status: "draft" as const,
      candidateStatus: "needs_clarification" as const,
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
        title: "Strict board",
        summary: "Strict",
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
        cards: [missingProofCard],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardRequiresProofSpec(board)).toBe(true);
    expect(projectBoardCardCanMarkReady(missingProofCard, board)).toBe(false);
    expect(projectBoardTestSummaryForBoard(board)).toMatchObject({ strict: true, missing: [expect.objectContaining({ id: "card-1" })] });
    expect(
      projectBoardCardCanMarkReady(
        { ...missingProofCard, testPlan: { ...missingProofCard.testPlan, manual: ["Review manually."] } },
        board,
      ),
    ).toBe(true);
  });

  it("does not allow obsolete run follow-up cards to be marked ready after their parent is done", () => {
    const parent: ProjectBoardCard = {
      boardId: "board-1",
      id: "parent-card",
      title: "Implement the feature",
      description: "Parent implementation card.",
      status: "done",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: ["Feature works."],
      testPlan: { unit: ["Run unit tests."], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:feature",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const followUp: ProjectBoardCard = {
      ...parent,
      id: "proof-follow-up",
      title: "Complete proof for the feature",
      description: "Collect missing proof.",
      status: "draft",
      candidateStatus: "needs_clarification",
      blockedBy: [parent.id],
      testPlan: { unit: [], integration: [], visual: [], manual: ["Review proof."] },
      sourceKind: "run_follow_up",
      sourceId: "run-1#proof-review",
    };
    const board = project({
      board: {
        id: "board-1",
        projectPath: "/workspace/app",
        status: "active",
        title: "Follow-up board",
        summary: "",
        cards: [parent, followUp],
        sources: [],
        questions: [],
        proposals: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }).board!;

    expect(projectBoardCardCanMarkReady(followUp, board)).toBe(false);
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

  it("models live Pi session preview with terminal copy gating", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const card: ProjectBoardCard = {
      id: "card-live",
      boardId: "board-1",
      title: "Show live Pi events",
      description: "Expose session activity from the selected board card.",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      labels: ["project-board"],
      blockedBy: [],
      acceptanceCriteria: ["Live activity stays scoped to the selected card."],
      testPlan: { unit: ["Model preview state."], integration: [], visual: [], manual: [] },
      sourceKind: "manual",
      sourceId: "manual:card-live",
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      createdAt: now,
      updatedAt: now,
    };
    const task: OrchestrationTask = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Show live Pi events",
      state: "in_progress",
      labels: ["project-board"],
      blockedBy: [],
      sourceKind: "project_board_card",
      createdAt: now,
      updatedAt: now,
    };
    const runningRun: OrchestrationRun = {
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 0,
      status: "running",
      workspacePath: "/workspace/app/.ambient-codex/orchestration/workspaces/LOCAL-1",
      threadId: "thread-1",
      startedAt: now,
      lastEventAt: now,
      proofOfWork: {
        progress: { messageCount: 3, toolMessageCount: 1, elapsedMs: 42_000 },
        lastAssistantText: "Inspecting the board detail pane and wiring recent activity into the selected card.",
      },
    };

    const running = projectBoardLiveSessionPreviewModel({
      card,
      task,
      latestRun: runningRun,
      threadStatus: "tool",
      activityLines: [{ id: "activity-1", kind: "tool", text: "Tool call: file_read App.tsx", timestamp: Date.parse(now) }],
      now: Date.parse(now) + 42_000,
    });

    expect(running).toMatchObject({
      visible: true,
      active: true,
      terminal: false,
      statusLabel: "Tool call running",
      latestAssistantText: expect.stringContaining("Inspecting the board detail pane"),
    });
    expect(running.copyAction).toMatchObject({
      disabled: true,
      label: "Copy Session to Thread",
    });
    expect(running.activity[0]).toMatchObject({ label: "Tool call", text: expect.stringContaining("file_read") });

    const completed = projectBoardLiveSessionPreviewModel({
      card: { ...card, status: "review" },
      task: { ...task, state: "needs_review" },
      latestRun: { ...runningRun, status: "completed", finishedAt: "2026-01-01T00:02:00.000Z" },
      threadStatus: "idle",
    });

    expect(completed).toMatchObject({
      active: false,
      terminal: true,
      statusLabel: "Completed",
    });
    expect(completed.copyAction).toMatchObject({
      disabled: false,
      runId: "run-1",
      threadId: "thread-1",
    });
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
