import { describe, expect, it } from "vitest";
import { buildProjectBoardDogfoodReleaseGate } from "./project-board-dogfood-report.mjs";

describe("project-board dogfood release-gate report", () => {
  it("summarizes first-card timing, ticketization, duplicate rate, and proof outcome", () => {
    const board = {
      status: "active",
      cards: [
        {
          id: "card-1",
          title: "Create WebGL shell",
          status: "done",
          candidateStatus: "ready_to_create",
          orchestrationTaskId: "task-1",
          clarificationQuestions: [],
        },
        {
          id: "card-2",
          title: "Implement ship controls",
          status: "draft",
          candidateStatus: "needs_clarification",
          clarificationQuestions: ["Should movement be arcade or inertial?"],
        },
      ],
      sources: [{ id: "source-1", includeInSynthesis: true }, { id: "source-2", includeInSynthesis: false }],
      questions: [{ id: "question-1" }],
      synthesisRuns: [
        {
          id: "run-1",
          status: "completed",
          sourceCount: 2,
          includedSourceCount: 1,
          sourceCharCount: 4000,
          promptCharCount: 9000,
          responseCharCount: 2000,
          progressiveRecordCount: 3,
          eventCount: 2,
          startedAt: "2026-05-08T00:00:00.000Z",
          completedAt: "2026-05-08T00:01:30.000Z",
        },
      ],
    };
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 12_345,
            timeToFirstTicketizedTaskMs: 45_678,
            maxBoardSynthesisCardCount: 2,
            maxTicketizedCardCount: 1,
            sampleCount: 4,
          },
          {
            name: "execute-local-task",
            status: "completed",
            cardStatus: "done",
            proofReview: {
              status: "done",
              recommendedAction: "close",
              evidenceQuality: "strong",
              confidence: 0.92,
            },
            taskActions: { count: 3 },
            proofOfWork: {
              taskToolActions: [
                {
                  actionId: "real-proof",
                  action: "task_report_proof",
                  summary: "Reducer proof passed.",
                  commands: ["pnpm vitest src/main.ts"],
                  changedFiles: ["src/main.ts"],
                },
              ],
            },
            meaningfulChangedPaths: ["src/main.ts"],
            visualProofArtifacts: [{ path: "proof.png" }],
          },
        ],
      },
      { board },
    );

    expect(report.status).toBe("passed");
    expect(report.metrics.timeToFirstCardMs).toBe(12_345);
    expect(report.metrics.timeToFirstTicketizedTaskMs).toBe(45_678);
    expect(report.metrics.finalPlanningDurationMs).toBe(90_000);
    expect(report.metrics.planningObservedDurationMs).toBe(90_000);
    expect(report.metrics.sourceCoverage).toMatchObject({ sourceCount: 2, includedSourceCount: 1, coverageRatio: 0.5 });
    expect(report.metrics.progress.synthesisEventCount).toBe(2);
    expect(report.metrics.duplicateCards).toMatchObject({ totalCardCount: 2, duplicateCardCount: 0, duplicateCardRate: 0 });
    expect(report.metrics.clarificationQuestions).toMatchObject({
      needsClarificationCardCount: 1,
      totalClarificationQuestions: 1,
      needsClarificationWithoutQuestions: 0,
    });
    expect(report.metrics.proofOutcome).toMatchObject({
      observed: true,
      runStatus: "completed",
      proofReviewStatus: "done",
      recommendedAction: "close",
      evidenceQuality: "strong",
      actionableNextStep: true,
      taskActionCount: 3,
      visualProofArtifactCount: 1,
    });
    expect(report.metrics.proofActionIntegrity).toMatchObject({ checkedActionCount: 1, issueCount: 0 });
  });

  it("flags attention when cards duplicate or need clarification without explicit questions", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [{ name: "ticketize-card", taskId: "task-1" }],
      },
      {
        board: {
          status: "active",
          cards: [
            { id: "card-1", title: "Create Game Shell", status: "draft", candidateStatus: "needs_clarification", clarificationQuestions: [] },
            { id: "card-2", title: "create game shell", status: "draft", candidateStatus: "ready_to_create", clarificationQuestions: [] },
          ],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.metrics.duplicateCards).toMatchObject({ duplicateCardCount: 1, duplicateCardRate: 0.5 });
    expect(report.metrics.clarificationQuestions.needsClarificationWithoutQuestions).toBe(1);
    expect(report.notes).toEqual(expect.arrayContaining(["No time-to-first-card measurement was captured.", "Duplicate-card rate was 0.5.", "1 Needs Clarification cards have no explicit clarification question."]));
  });

  it("reports proof-scope warnings and warned ticketization without making advisory warnings a hard gate", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "completed",
            cardStatus: "done",
            proofReview: {
              status: "done",
              recommendedAction: "close",
              evidenceQuality: "strong",
              confidence: 0.92,
            },
            proofOfWork: {
              taskToolActions: [
                {
                  actionId: "real-proof",
                  action: "task_report_proof",
                  summary: "Unit proof passed.",
                  commands: ["pnpm vitest src/inputAdapter.test.ts"],
                  changedFiles: ["src/inputAdapter.ts"],
                },
              ],
            },
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [
            {
              id: "card-1",
              sourceId: "synthesis:input-adapter",
              title: "Build InputAdapter for keyboard-to-intent mapping",
              status: "done",
              candidateStatus: "ready_to_create",
              orchestrationTaskId: "task-1",
              clarificationQuestions: [],
              userTouchedFields: [],
            },
          ],
          sources: [],
          questions: [],
          synthesisRuns: [
            {
              id: "run-1",
              status: "succeeded",
              stage: "proposal_created",
              progressiveRecords: [
                {
                  type: "warning",
                  code: "proof_scope_mismatch",
                  message: "\"Build InputAdapter for keyboard-to-intent mapping\" looks like a pure/module-boundary card but has browser proof.",
                  createdAt: "2026-05-10T00:00:00.000Z",
                  metadata: {
                    cardId: "synthesis:input-adapter",
                    title: "Build InputAdapter for keyboard-to-intent mapping",
                    proofOwnership: "pure_module",
                    visualProofItems: ["Capture browser proof that the ship accelerates visually."],
                  },
                },
              ],
            },
          ],
        },
      },
    );

    expect(report.status).toBe("passed");
    expect(report.gates.proofScopeWarningsAcknowledged).toBe(false);
    expect(report.metrics.proofScopeWarnings).toMatchObject({
      warningCount: 1,
      warnedCardCount: 1,
      warnedTicketizedCardCount: 1,
      warnedTicketizedWithoutAcknowledgementCount: 1,
      advisory: true,
    });
    expect(report.metrics.proofScopeWarnings.warnedTicketizedWithoutAcknowledgement[0]).toMatchObject({
      id: "card-1",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      acknowledged: false,
    });
    expect(report.notes).toEqual(
      expect.arrayContaining([
        "1 proof-scope warning occurred during board planning.",
        "1 warned card was ticketized without durable user/actionable acknowledgement; proof-scope remains advisory for now, but strict profiles should require review before execution.",
      ]),
    );
  });

  it("keeps running planning duration separate from final planning duration", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
            samples: [{ elapsedMs: 3000 }],
          },
          { name: "execute-local-task", skipped: true },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "in_progress", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [
            {
              id: "run-1",
              status: "running",
              startedAt: "2026-05-08T00:00:00.000Z",
              updatedAt: "2026-05-08T00:00:05.000Z",
            },
          ],
        },
      },
    );

    expect(report.metrics.finalPlanningDurationMs).toBeUndefined();
    expect(report.metrics.planningObservedDurationMs).toBe(5000);
    expect(report.metrics.proofOutcome.skipped).toBe(true);
    expect(report.notes).toContain("Worker execution was skipped for this focused pass.");
  });

  it("flags copied task-action sample proof as release-gate attention", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "completed",
            cardStatus: "review",
            proofReview: {
              status: "ready_for_review",
              recommendedAction: "ask_user",
              evidenceQuality: "mixed",
              confidence: 0.75,
            },
            proofOfWork: {
              taskToolActions: [
                {
                  actionId: "proof-1",
                  action: "task_report_proof",
                  createdAt: "2026-05-05T12:00:00.000Z",
                  summary: "Verification passed.",
                  commands: [],
                  changedFiles: [],
                  screenshots: [],
                  browserTraces: [],
                  visualChecks: [],
                  manualChecks: [],
                },
              ],
            },
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "review", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.gates.proofOutcomeActionable).toBe(false);
    expect(report.gates.proofActionIntegrityAcceptable).toBe(false);
    expect(report.metrics.proofActionIntegrity.issueCount).toBe(2);
    expect(report.notes).toEqual(
      expect.arrayContaining([
        "Worker proof review did not include an actionable missing item or next step for its non-close recommendation.",
        expect.stringContaining("Task-action proof integrity issue"),
      ]),
    );
  });

  it("reports bounded worker partial progress as actionable attention", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "attention",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "bounded_timeout",
            partial: true,
            cardStatus: "blocked",
            proofOfWork: {
              changedFiles: ["src/game.ts"],
              projectBoardDogfoodHarnessBudget: {
                exceeded: true,
                maxRuntimeMs: 90_000,
                elapsedMs: 93_000,
              },
              taskToolActions: [
                {
                  actionId: "real-heartbeat",
                  action: "task_heartbeat",
                  summary: "Created the game shell and started control wiring.",
                  completed: ["Created src/game.ts."],
                },
              ],
            },
            meaningfulChangedPaths: ["src/game.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "blocked", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.gates.workerPartialProgressActionable).toBe(true);
    expect(report.metrics.proofOutcome).toMatchObject({
      partial: true,
      runtimeBudgetExceeded: false,
      harnessBoundedTimeout: true,
      harnessBudgetExceeded: true,
      harnessBudgetMaxMs: 90_000,
      harnessBudgetElapsedMs: 93_000,
      recommendedAction: "retry",
      actionableNextStep: true,
    });
    expect(report.notes).toContain("Worker execution stopped at a bounded runtime with partial proof for review.");
  });

  it("passes product-owned runtime-budget follow-up outcomes when a split child remains actionable", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        requireRuntimeSplit: true,
        manualRuntimeSplitCard: true,
        steps: [
          {
            name: "create-runtime-split-manual-card",
            cardId: "parent-1",
            title: "Create shell",
          },
          {
            name: "initial-board-incremental-milestones",
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "completed",
            partial: true,
            cardStatus: "blocked",
            proofReview: {
              status: "needs_follow_up",
              recommendedAction: "follow_up",
              missing: ["Create a follow-up card for the remaining runtime-budget scope."],
              satisfied: ["Created the shell."],
            },
            proofOfWork: {
              changedFiles: ["src/game.ts"],
              projectBoardRuntimeBudget: {
                exceeded: true,
                maxRuntimeMs: 90_000,
                elapsedMs: 93_000,
              },
              taskToolActions: [
                {
                  actionId: "real-heartbeat",
                  action: "task_heartbeat",
                  summary: "Created the game shell and stopped before interaction polish.",
                  completed: ["Created src/game.ts."],
                },
              ],
            },
            meaningfulChangedPaths: ["src/game.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [
            {
              id: "parent-1",
              title: "Create shell",
              status: "blocked",
              candidateStatus: "ready_to_create",
              orchestrationTaskId: "task-1",
              splitOutcome: {
                status: "proposed",
                source: "runtime_budget",
                sourceRunId: "run-1",
                reason: "Runtime budget exceeded after 90s.",
                childCardIds: ["child-1"],
              },
            },
            {
              id: "child-1",
              title: "Continue shell",
              status: "draft",
              candidateStatus: "needs_clarification",
              clarificationQuestions: ["Confirm this follow-up captures the remaining scope."],
            },
          ],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("passed");
    expect(report.gates.firstCardObserved).toBe(true);
    expect(report.gates.runtimeSplitOutcomeActionable).toBe(true);
    expect(report.gates.productRuntimeBudgetClosureObserved).toBe(true);
    expect(report.metrics.focusedManualRuntimeSplit).toMatchObject({ manualCardObserved: true });
    expect(report.metrics.productRuntimeBudgetClosure).toMatchObject({
      required: true,
      observed: true,
      harnessTimedOutFirst: false,
    });
    expect(report.metrics.splitOutcomes).toMatchObject({
      runtimeBudgetSplitCount: 1,
      openRuntimeBudgetSplitCount: 1,
      openRuntimeBudgetSplitWithoutActionableChildCount: 0,
      unresolvedChildRefCount: 0,
      actionableChildCount: 1,
    });
  });

  it("treats unreadable visual proof as handled when PM review keeps the card open", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "completed",
            partial: true,
            cardStatus: "blocked",
            visualProofRequired: true,
            visualProofArtifacts: [
              {
                path: "black.png",
                width: 1280,
                height: 720,
                nonBlackPixels: 0,
                nonBlackRatio: 0,
                distinctColorCount: 1,
              },
            ],
            proofReview: {
              status: "needs_follow_up",
              recommendedAction: "follow_up",
              evidenceQuality: "mixed",
              confidence: 0.88,
              missing: ["Create a follow-up card that renders a nonblank canvas screenshot."],
            },
            proofOfWork: {
              changedFiles: ["src/main.ts"],
              taskToolActions: [
                {
                  actionId: "real-heartbeat",
                  action: "task_heartbeat",
                  summary: "Created the canvas shell before visual proof remained black.",
                  completed: ["Created src/main.ts."],
                },
              ],
            },
            meaningfulChangedPaths: ["src/main.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "blocked", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("passed");
    expect(report.gates.visualProofReadableOrActionable).toBe(true);
    expect(report.metrics.visualProof).toMatchObject({
      required: true,
      artifactCount: 1,
      readableArtifactCount: 0,
      handledByProofReview: true,
    });
    expect(report.notes).toContain("Visual proof screenshot was missing or unreadable; PM proof review kept the card open with an actionable next step.");
  });

  it("flags unreadable visual proof when the card is incorrectly closed", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "completed",
            cardStatus: "done",
            visualProofRequired: true,
            visualProofArtifacts: [
              {
                path: "black.png",
                width: 1280,
                height: 720,
                nonBlackPixels: 0,
                nonBlackRatio: 0,
                distinctColorCount: 1,
              },
            ],
            proofReview: {
              status: "done",
              recommendedAction: "close",
              evidenceQuality: "strong",
              confidence: 0.91,
            },
            proofOfWork: {
              changedFiles: ["src/main.ts"],
              taskToolActions: [
                {
                  actionId: "real-proof",
                  action: "task_report_proof",
                  summary: "Reported a screenshot.",
                  screenshots: ["black.png"],
                  changedFiles: ["src/main.ts"],
                },
              ],
            },
            meaningfulChangedPaths: ["src/main.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "done", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.gates.visualProofReadableOrActionable).toBe(false);
    expect(report.metrics.visualProof).toMatchObject({
      required: true,
      artifactCount: 1,
      readableArtifactCount: 0,
      handledByProofReview: false,
    });
    expect(report.notes).toContain("Visual proof was required but no readable nonblank screenshot was captured.");
  });

  it("flags runtime-budget follow-up outcomes when the split child is missing", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "bounded_timeout",
            partial: true,
            cardStatus: "blocked",
            proofReview: {
              status: "needs_follow_up",
              recommendedAction: "follow_up",
              missing: ["Create a follow-up card for the remaining runtime-budget scope."],
              satisfied: ["Created the shell."],
            },
            proofOfWork: {
              projectBoardRuntimeBudget: {
                exceeded: true,
                maxRuntimeMs: 90_000,
                elapsedMs: 93_000,
              },
            },
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [
            {
              id: "parent-1",
              title: "Create shell",
              status: "blocked",
              candidateStatus: "ready_to_create",
              orchestrationTaskId: "task-1",
            },
          ],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.gates.runtimeSplitOutcomeActionable).toBe(false);
    expect(report.notes).toContain("Runtime-budget follow-up did not leave an actionable split child or resolved parent split decision.");
  });

  it("flags focused runtime-split gates when the harness times out before product closure", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "failed",
        requireRuntimeSplit: true,
        steps: [
          {
            name: "initial-board-incremental-milestones",
            timeToFirstCardMs: 1000,
            timeToFirstTicketizedTaskMs: 2000,
          },
          {
            name: "execute-local-task",
            status: "bounded_timeout",
            partial: true,
            proofOfWork: {
              projectBoardDogfoodHarnessBudget: {
                exceeded: true,
                maxRuntimeMs: 180_000,
                elapsedMs: 181_000,
              },
              taskToolActions: [
                {
                  actionId: "real-heartbeat",
                  action: "task_heartbeat",
                  summary: "Worker reported progress before the harness cap.",
                  completed: ["Created src/game.ts."],
                },
              ],
            },
            meaningfulChangedPaths: ["src/game.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [{ id: "card-1", title: "Create shell", status: "in_progress", candidateStatus: "ready_to_create", orchestrationTaskId: "task-1" }],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("failed");
    expect(report.gates.productRuntimeBudgetClosureObserved).toBe(false);
    expect(report.metrics.proofOutcome).toMatchObject({
      runtimeBudgetExceeded: false,
      harnessBoundedTimeout: true,
      harnessBudgetExceeded: true,
    });
    expect(report.metrics.productRuntimeBudgetClosure).toMatchObject({
      required: true,
      observed: false,
      harnessTimedOutFirst: true,
    });
    expect(report.notes).toContain("Product runtime-budget closure was required, but the dogfood harness timeout fired before the product closed or split the card.");
  });

  it("flags missing live task actions without hiding product-owned runtime closure", () => {
    const report = buildProjectBoardDogfoodReleaseGate(
      {
        status: "passed",
        requireTaskActions: true,
        requireRuntimeSplit: true,
        manualRuntimeSplitCard: true,
        steps: [
          { name: "create-runtime-split-manual-card", cardId: "parent-1", title: "Create shell" },
          { name: "ticketize-card", taskId: "task-1" },
          {
            name: "execute-local-task",
            status: "completed",
            partial: true,
            cardStatus: "blocked",
            proofReview: {
              status: "needs_follow_up",
              recommendedAction: "follow_up",
              missing: ["Create a follow-up card for the remaining runtime-budget scope."],
              satisfied: ["Created the shell."],
            },
            proofOfWork: {
              changedFiles: ["src/game.ts"],
              projectBoardRuntimeBudget: {
                exceeded: true,
                maxRuntimeMs: 90_000,
                elapsedMs: 93_000,
              },
            },
            meaningfulChangedPaths: ["src/game.ts"],
          },
        ],
      },
      {
        board: {
          status: "active",
          cards: [
            {
              id: "parent-1",
              title: "Create shell",
              status: "blocked",
              candidateStatus: "ready_to_create",
              orchestrationTaskId: "task-1",
              splitOutcome: {
                status: "proposed",
                source: "runtime_budget",
                sourceRunId: "run-1",
                reason: "Runtime budget exceeded after 90s.",
                childCardIds: ["child-1"],
              },
            },
            {
              id: "child-1",
              title: "Continue shell",
              status: "draft",
              candidateStatus: "needs_clarification",
              clarificationQuestions: ["Confirm this follow-up captures the remaining scope."],
            },
          ],
          sources: [],
          questions: [],
          synthesisRuns: [],
        },
      },
    );

    expect(report.status).toBe("attention");
    expect(report.gates.productRuntimeBudgetClosureObserved).toBe(true);
    expect(report.gates.taskActionProtocolObserved).toBe(false);
    expect(report.notes).toContain("Live worker did not emit a project-board task action; progress/proof was inferred from transcript and workspace artifacts.");
  });
});
