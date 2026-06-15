import { describe, expect, it } from "vitest";
import {
  buildProjectBoardWorkerReleaseMatrixReport,
  workerReleaseMatrixPassed,
} from "./project-board-worker-release-matrix-lib.mjs";

describe("project-board worker release matrix report", () => {
  it("passes only when the app-boundary worker gates are all satisfied", () => {
    const report = buildProjectBoardWorkerReleaseMatrixReport({
      dogfoodExitCode: 0,
      dogfoodOutputPath: "/tmp/latest.json",
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:03:00.000Z",
      dogfood: {
        status: "passed",
        manualRuntimeSplitCard: true,
        forcedCardRuntimeBudgetMs: 60_000,
        requireRuntimeSplit: true,
        splitDecisionAction: "approve_split",
        workerRunMaxElapsedMs: 180_000,
        steps: [
          { name: "create-runtime-split-manual-card", cardId: "card-1", title: "Runtime split progress marker" },
          { name: "ticketize-card", cardId: "card-1", title: "Runtime split progress marker", taskId: "task-1" },
          {
            name: "execute-local-task",
            status: "completed",
            cardStatus: "blocked",
            taskState: "needs_info",
            taskActions: { count: 2, countsByAction: { task_heartbeat: 1, task_report_proof: 1 } },
            meaningfulChangedPaths: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
            followUpCardCount: 1,
            proofReview: { status: "needs_follow_up", recommendedAction: "follow_up", evidenceQuality: "mixed", confidence: 0.8 },
            followUpCards: [{ id: "child-1", title: "Finish runtime split follow-up" }],
          },
          { name: "resolve-runtime-split", cardId: "card-1", action: "approve_split", afterStatus: "approved" },
        ],
        releaseGate: {
          status: "passed",
          gates: {
            firstCardObserved: true,
            firstTicketizedTaskObserved: true,
            proofOutcomeObserved: true,
            proofOutcomeActionable: true,
            proofActionIntegrityAcceptable: true,
            taskActionProtocolObserved: true,
            runtimeSplitOutcomeActionable: true,
            productRuntimeBudgetClosureObserved: true,
            workerPartialProgressActionable: true,
          },
          metrics: {
            proofOutcome: {
              proofReviewStatus: "needs_follow_up",
              recommendedAction: "follow_up",
              evidenceQuality: "mixed",
              confidence: 0.8,
              taskActionCount: 2,
              meaningfulChangedPathCount: 2,
              runtimeBudgetExceeded: true,
              runtimeBudgetMaxMs: 60_000,
              runtimeBudgetElapsedMs: 61_000,
              followUpCardCount: 1,
            },
            proofActionIntegrity: { issueCount: 0, issues: [] },
            splitOutcomes: { runtimeBudgetSplitCount: 1 },
            productRuntimeBudgetClosure: { observed: true, harnessTimedOutFirst: false },
          },
          notes: ["Runtime split was actionable."],
        },
      },
    });

    expect(report.status).toBe("passed");
    expect(workerReleaseMatrixPassed(report)).toBe(true);
    expect(report.observations).toMatchObject({
      taskActionProtocolObserved: true,
      proofReviewStatus: "needs_follow_up",
      runtimeBudgetSplitCount: 1,
      productRuntimeBudgetClosureObserved: true,
      splitDecisionAction: "approve_split",
      splitDecisionAfterStatus: "approved",
    });
  });

  it("reports attention when task actions are missing even if proof review exists", () => {
    const report = buildProjectBoardWorkerReleaseMatrixReport({
      dogfoodExitCode: 0,
      dogfood: {
        status: "passed",
        steps: [{ name: "execute-local-task", proofReview: { status: "needs_follow_up" } }],
        releaseGate: {
          status: "attention",
          gates: {
            firstCardObserved: true,
            firstTicketizedTaskObserved: true,
            proofOutcomeObserved: true,
            proofOutcomeActionable: true,
            proofActionIntegrityAcceptable: true,
            taskActionProtocolObserved: false,
            runtimeSplitOutcomeActionable: true,
            productRuntimeBudgetClosureObserved: true,
            workerPartialProgressActionable: true,
          },
          metrics: {
            proofOutcome: { proofReviewStatus: "needs_follow_up", taskActionCount: 0 },
            proofActionIntegrity: { issueCount: 0, issues: [] },
            splitOutcomes: { runtimeBudgetSplitCount: 1 },
            productRuntimeBudgetClosure: { observed: true, harnessTimedOutFirst: false },
          },
          notes: ["Live worker did not emit a project-board task action."],
        },
      },
    });

    expect(report.status).toBe("attention");
    expect(workerReleaseMatrixPassed(report)).toBe(false);
    expect(report.observations.taskActionProtocolObserved).toBe(false);
  });
});
