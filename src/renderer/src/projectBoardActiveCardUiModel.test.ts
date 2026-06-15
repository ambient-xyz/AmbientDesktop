import { describe, expect, it } from "vitest";
import type { OrchestrationRun, OrchestrationTask, ProjectBoardCard, ProjectBoardExecutionArtifact, ProjectBoardPmReviewReport } from "../../shared/types";
import {
  projectBoardActiveCardDetail,
  projectBoardCanonicalCardProjection,
  projectBoardExecutionControlModel,
  projectBoardExecutionPmReview,
  projectBoardPmReviewReportUiModel,
  projectBoardProofFollowUpImpactModel,
} from "./projectBoardActiveCardUiModel";

function card(overrides: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Create shell",
    description: "Create the shell.",
    status: "ready",
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: ["Canvas mounts."],
    testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
    sourceKind: "board_synthesis",
    sourceId: "synthesis:shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<OrchestrationTask> = {}): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Create shell",
    state: "ready",
    labels: [],
    blockedBy: [],
    sourceKind: "project_board_card",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<OrchestrationRun> = {}): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 0,
    status: "failed",
    workspacePath: "/workspace/app/.ambient-codex/workspaces/run-1",
    threadId: "thread-1",
    startedAt: "2026-01-01T00:01:00.000Z",
    finishedAt: "2026-01-01T00:05:00.000Z",
    error: "Provider failed after proof was recorded.",
    proofOfWork: {
      kind: "agent-run",
      changedFiles: ["src/output.ts"],
      lastAssistantText: "Implemented shell and captured proof.",
    },
    ...overrides,
  };
}

describe("projectBoardActiveCardUiModel", () => {
  it("projects accepted stopped runs as closed audit-only card state", () => {
    const accepted = card({
      id: "accepted-card",
      orchestrationTaskId: "task-accepted",
      blockedBy: ["card:blocker"],
      proofReview: {
        status: "done",
        summary: "Proof accepted after manual inspection.",
        satisfied: ["Integration proof passed."],
        missing: [],
        followUpCardIds: [],
        runId: "run-accepted",
        reviewedAt: "2026-01-01T00:06:00.000Z",
        recommendedAction: "close",
        evidenceQuality: "strong",
        confidence: 0.9,
      },
    });
    const blocker = card({ id: "blocker", title: "Historical blocker", status: "blocked", sourceId: "card:blocker" });
    const acceptedTask = task({ id: "task-accepted", state: "needs_review" });
    const stoppedRun = run({ id: "run-accepted", taskId: "task-accepted", status: "failed" });

    const projection = projectBoardCanonicalCardProjection(accepted, { task: acceptedTask, latestRun: stoppedRun });
    const detail = projectBoardActiveCardDetail(accepted, [accepted, blocker], [acceptedTask], [stoppedRun]);
    const controls = projectBoardExecutionControlModel(accepted, {}, detail);

    expect(projection).toMatchObject({
      kind: "done_after_stopped_run",
      visualStatus: "done",
      statusLabel: "Done: accepted with evidence",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
      terminalDone: true,
    });
    expect(detail.progressLedger.find((entry) => entry.id === "next_action")).toMatchObject({
      state: "done",
      detail: "No next action is required; historical run issues are audit-only.",
    });
    expect(controls).toMatchObject({
      state: "done",
      runLabel: "Historical stopped run accepted",
      proofLabel: "Accepted with evidence",
      blockerLabel: "No active blockers",
    });
    expect(controls.actions.map((action) => action.action)).not.toContain("retry_card");
  });

  it("blocks active-card run preparation when workflow readiness is missing", () => {
    const readyCard = card({ orchestrationTaskId: "task-1" });
    const readyTask = task({ state: "ready" });
    const detail = projectBoardActiveCardDetail(readyCard, [readyCard], [readyTask], []);
    const controls = projectBoardExecutionControlModel(
      readyCard,
      {
        workflowReadiness: {
          status: "missing",
          path: "/workspace/app/WORKFLOW.md",
          checkedAt: "2026-01-01T00:05:00.000Z",
          warnings: [],
          message: "Workflow file not found.",
        },
      },
      detail,
    );

    expect(controls).toMatchObject({
      state: "blocked",
      headline: "Resolve blockers before another worker pass",
      detail: "Workflow file not found.",
    });
    expect(controls.actions.find((action) => action.action === "prepare_run")).toMatchObject({
      disabled: true,
      title: "Workflow file not found.",
    });
  });

  it("models proof follow-up impact without rewriting the parent card", () => {
    const parent = card({
      id: "parent-card",
      title: "Build checkout",
      proofReview: {
        status: "needs_follow_up",
        summary: "Checkout works, but receipt proof is missing.",
        satisfied: ["Checkout flow runs."],
        missing: ["Receipt rendering proof."],
        followUpCardIds: ["follow-up-card"],
        runId: "run-parent",
        reviewedAt: "2026-01-01T00:06:00.000Z",
        recommendedAction: "follow_up",
        evidenceQuality: "mixed",
        confidence: 0.7,
      },
    });
    const followUp = card({
      id: "follow-up-card",
      title: "Add receipt proof",
      sourceKind: "run_follow_up",
      sourceId: "run-parent#follow-up:receipt",
      blockedBy: ["parent-card"],
      acceptanceCriteria: ["Receipt proof is captured."],
      testPlan: { unit: [], integration: ["Run receipt flow."], visual: ["Capture receipt."], manual: [] },
    });

    expect(projectBoardProofFollowUpImpactModel(parent, [parent, followUp])).toMatchObject({
      visible: true,
      headline: "1 proof follow-up card proposed",
      modelCallRequired: false,
      existingCardsRewritten: false,
      followUpCardCount: 1,
      missingProofCount: 1,
      unresolvedFollowUpCardIds: [],
      cards: [expect.objectContaining({ cardId: "follow-up-card", blockedByParent: true, proofExpectationCount: 2 })],
    });
  });

  it("models PM review report coverage and pulled execution review", () => {
    const report: ProjectBoardPmReviewReport = {
      readiness: "ready_for_activation",
      summary: "Sources are ready.",
      sourceConfidence: "high",
      sourceConfidenceNotes: [],
      gitState: "git_ready",
      gitStateNotes: [],
      blockingQuestions: [],
      risks: ["One launch risk."],
      sourceConflicts: [],
      sourceAuthorityNotes: ["README is authoritative."],
      recommendedActivationScope: "Activate the checkout slice.",
      cardGenerationConstraints: [],
    };
    const cardWithArtifact = card({ id: "artifact-card", title: "Artifact card" });
    const artifact: ProjectBoardExecutionArtifact = {
      id: "artifact-1",
      boardId: "board-1",
      cardId: "artifact-card",
      status: "completed",
      source: "git",
      startedAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      completedAt: "2026-01-01T00:05:00.000Z",
      createdAt: "2026-01-01T00:05:00.000Z",
      proof: {
        summary: "Artifact proof passed.",
        commands: ["pnpm test"],
        changedFiles: ["src/output.ts"],
        screenshots: [],
        browserTraces: [],
        visualChecks: [],
        manualChecks: [],
        createdAt: "2026-01-01T00:05:00.000Z",
      },
      handoff: {
        summary: "Ready for review.",
        completed: ["Implementation done."],
        remaining: [],
        risks: [],
        followUps: [],
        createdAt: "2026-01-01T00:05:00.000Z",
      },
    };

    expect(projectBoardPmReviewReportUiModel(report)).toMatchObject({
      readinessLabel: "Ready for activation",
      coverage: {
        recommendationScope: true,
        sourceConfidence: true,
        gitState: true,
        sourceAuthority: true,
      },
      sections: expect.arrayContaining([expect.objectContaining({ key: "risks", tone: "warning" })]),
    });
    expect(projectBoardExecutionPmReview({ cards: [cardWithArtifact], executionArtifacts: [artifact] })).toMatchObject({
      total: 1,
      completed: 1,
      failed: 0,
      impacts: [expect.objectContaining({ title: "Artifact card", tone: "success" })],
      summary: "1 pulled completion can be reviewed against downstream dependencies.",
    });
  });
});
