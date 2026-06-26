import { describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardExecutionControlModel,
  projectBoardCardCanMarkReady,
  projectBoardProofFollowUpImpactModel,
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
describe("projectBoardProofUiModel", () => {
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
});
