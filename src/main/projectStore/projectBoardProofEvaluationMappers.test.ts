import { describe, expect, it } from "vitest";

import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { ProjectBoardCard, ProjectBoardCardProofReview } from "../../shared/projectBoardTypes";
import type { ProjectBoardTaskToolAction } from "./projectStoreProjectBoardFacade";
import {
  evaluateProjectBoardCardProof,
  mergeProjectBoardTaskToolActionsForProof,
  normalizeRuntimeBudgetCriteria,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetFromProof,
  projectBoardRuntimeBudgetHasDurableCompletion,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetPartialProofSummary,
  projectBoardRuntimeBudgetReason,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardRuntimeBudgetTrustworthyTaskActions,
  type ProjectBoardProofReviewDraft,
} from "./projectBoardProofMappers";

describe("project board proof evaluation mappers", () => {
  const projectBoardCard = (card: Partial<ProjectBoardCard> = {}): ProjectBoardCard =>
    ({
      id: "card-1",
      boardId: "board-1",
      title: "Create shell",
      description: "Build the shell.",
      status: "draft",
      candidateStatus: "ready_to_create",
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceKind: "board_synthesis",
      sourceId: "synthesis:shell",
      sourceRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...card,
    }) as ProjectBoardCard;

  it("maps runtime budget proof details conservatively", () => {
    const projectBoardBudget = { exceeded: true, maxRuntimeMs: 125_000, recommendedNextAction: "Split the remaining work." };
    const legacyBudget = { exceeded: false };

    expect(projectBoardRuntimeBudgetFromProof({ projectBoardRuntimeBudget: projectBoardBudget, runtimeBudget: legacyBudget })).toBe(
      projectBoardBudget,
    );
    expect(projectBoardRuntimeBudgetFromProof({ runtimeBudget: legacyBudget })).toBe(legacyBudget);
    expect(projectBoardRuntimeBudgetFromProof({ projectBoardRuntimeBudget: ["not", "an", "object"] })).toBeUndefined();
    expect(projectBoardRuntimeBudgetExceeded({ projectBoardRuntimeBudget: projectBoardBudget })).toBe(true);
    expect(projectBoardRuntimeBudgetExceeded({ runtimeBudget: { exceeded: "true" } })).toBe(false);
    expect(projectBoardRuntimeBudgetHasMeaningfulProgress(undefined, "", [], "/workspace/app")).toBe(false);
    expect(projectBoardRuntimeBudgetHasMeaningfulProgress({}, "", ["Unit proof recorded."], "/workspace/app")).toBe(false);
    expect(
      projectBoardRuntimeBudgetHasMeaningfulProgress({ changedFiles: ["src/main/projectStore/projectStore.ts"] }, "", [], "/workspace/app"),
    ).toBe(true);
    expect(projectBoardRuntimeBudgetReason(projectBoardBudget)).toBe("Runtime budget exceeded after 125s: Split the remaining work.");
    expect(projectBoardRuntimeBudgetReason({})).toBe(
      "Runtime budget exceeded: Review partial workspace changes and retry, split, or create a narrower follow-up card.",
    );
  });

  it("normalizes runtime budget criteria for split follow-ups", () => {
    expect(
      normalizeRuntimeBudgetCriteria(
        [
          "  Runtime budget exceeded after 125s: Finish the remaining project-board export flow.  ",
          "- Finish the remaining project board export flow",
          "Finish the remaining project board export flow",
          "Finish the remaining project-board export flow after carrying over the imported artifact proof from the parent card.",
          "",
          "Capture a regression test.",
          "Capture a regression test.",
          "Review manually.",
        ],
        3,
      ),
    ).toEqual([
      "Runtime budget exceeded after 125s: Finish the remaining project-board export flow.",
      "Capture a regression test.",
      "Review manually.",
    ]);
  });

  it("evaluates incomplete project board proof runs as retryable or terminal", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(card, {
        id: "run-1",
        taskId: "task-1",
        status: "failed",
        error: "Worker failed.",
      } as unknown as OrchestrationRun),
    ).toEqual({
      status: "retry_recommended",
      summary: "The latest run ended as failed; retry or inspect before closing.",
      satisfied: [],
      missing: ["Worker failed."],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
    expect(
      evaluateProjectBoardCardProof(card, {
        id: "run-1",
        taskId: "task-1",
        status: "stalled",
        error: "Waiting on user input.",
      } as unknown as OrchestrationRun),
    ).toEqual({
      status: "terminally_blocked",
      summary: "The latest run appears terminally blocked.",
      satisfied: [],
      missing: ["Terminal blocker: Waiting on user input."],
      evidenceQuality: "weak",
      recommendedAction: "block",
    });
  });

  it("evaluates runtime budget proof without progress as retryable", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(card, {
        id: "run-1",
        taskId: "task-1",
        status: "completed",
        workspacePath: "/workspace/app",
        proofOfWork: {
          projectBoardRuntimeBudget: {
            exceeded: true,
            maxRuntimeMs: 125_000,
            recommendedNextAction: "Split the remaining work.",
          },
        },
      } as unknown as OrchestrationRun),
    ).toEqual({
      status: "retry_recommended",
      summary: "The run hit the runtime budget before recording meaningful implementation progress.",
      satisfied: [],
      missing: [
        "Runtime budget exceeded after 125s: Split the remaining work.",
        "No changed implementation files or meaningful diff evidence recorded.",
      ],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
  });

  it("evaluates proof with remaining card expectations as needing follow-up", () => {
    const card = projectBoardCard({
      testPlan: { unit: [], integration: [], visual: [], manual: ["Manual review"] },
    });

    expect(
      evaluateProjectBoardCardProof(card, {
        id: "run-1",
        taskId: "task-1",
        status: "completed",
        workspacePath: "/workspace/app",
        proofOfWork: {
          changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
        },
      } as unknown as OrchestrationRun),
    ).toEqual({
      status: "needs_follow_up",
      summary: "The run produced evidence, but the board card still needs follow-up before closure.",
      satisfied: ["Implementation evidence recorded."],
      missing: ["Manual proof missing: Manual review"],
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
    });
  });

  it("evaluates complete proof packets as done", () => {
    const card = projectBoardCard();

    expect(
      evaluateProjectBoardCardProof(card, {
        id: "run-1",
        taskId: "task-1",
        status: "completed",
        workspacePath: "/workspace/app",
        proofOfWork: {
          projectBoardStatus: "done",
          changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
        },
      } as unknown as OrchestrationRun),
    ).toEqual({
      status: "done",
      summary: "The proof packet satisfies the recorded acceptance and proof expectations.",
      satisfied: ["Implementation evidence recorded."],
      missing: [],
      evidenceQuality: "strong",
      recommendedAction: "close",
    });
  });

  it("applies runtime budget review outcomes conservatively", () => {
    const review = {
      status: "done",
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: ["Manual proof missing."],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      evidenceQuality: "strong",
      recommendedAction: "close",
    } as ProjectBoardCardProofReview;
    const runtimeBudget = {
      exceeded: true,
      maxRuntimeMs: 125_000,
      recommendedNextAction: "Split the remaining work.",
    };

    expect(
      projectBoardRuntimeBudgetReviewForApplication(review, { projectBoardRuntimeBudget: runtimeBudget }, "", "/workspace/app"),
    ).toEqual({
      ...review,
      status: "retry_recommended",
      summary: "The run hit the runtime budget before recording meaningful implementation progress.",
      satisfied: [],
      missing: ["Runtime budget exceeded after 125s: Split the remaining work.", "Manual proof missing."],
      evidenceQuality: "weak",
      recommendedAction: "retry",
    });
    expect(
      projectBoardRuntimeBudgetReviewForApplication(
        review,
        { projectBoardRuntimeBudget: runtimeBudget, changedFiles: ["src/main/projectStore/projectStore.ts"] },
        "",
        "/workspace/app",
      ),
    ).toEqual({
      ...review,
      status: "needs_follow_up",
      summary: "The run collected proof but hit the runtime budget before recording durable task completion.",
      missing: [
        "Runtime budget exceeded after 125s: Split the remaining work.",
        "Durable task_complete action was not recorded before the runtime budget stopped the run.",
        "Manual proof missing.",
      ],
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
    });
  });

  it("leaves runtime budget reviews unchanged when no rewrite is needed", () => {
    const review = {
      status: "done",
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: [],
      followUpCardIds: [],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      evidenceQuality: "strong",
      recommendedAction: "close",
    } as ProjectBoardCardProofReview;
    const trustedCompletion: ProjectBoardTaskToolAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(projectBoardRuntimeBudgetReviewForApplication(review, undefined, "", "/workspace/app")).toBe(review);
    expect(
      projectBoardRuntimeBudgetReviewForApplication(
        review,
        {
          projectBoardRuntimeBudget: { exceeded: true },
          changedFiles: ["src/main/projectStore/projectStore.ts"],
          taskToolActions: [trustedCompletion],
        },
        "",
        "/workspace/app",
      ),
    ).toBe(review);
  });

  it("summarizes runtime budget partial proof using existing fallback order", () => {
    const run = { error: "Run error summary." } as OrchestrationRun;
    const review = { summary: "Review summary." } as ProjectBoardCardProofReview;

    expect(
      projectBoardRuntimeBudgetPartialProofSummary(
        run,
        { handoff: { summary: " Handoff summary. " }, summary: "Proof summary.", lastAssistantText: "Assistant summary." },
        review,
      ),
    ).toBe("Handoff summary.");
    expect(
      projectBoardRuntimeBudgetPartialProofSummary(run, { summary: " Proof summary. ", lastAssistantText: "Assistant summary." }, review),
    ).toBe("Proof summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, { lastAssistantText: " Assistant summary. " }, review)).toBe(
      "Assistant summary.",
    );
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, {}, review)).toBe("Review summary.");
    expect(projectBoardRuntimeBudgetPartialProofSummary(run, {}, { summary: "" } as ProjectBoardCardProofReview)).toBe(
      "Run error summary.",
    );
    expect(projectBoardRuntimeBudgetPartialProofSummary({} as OrchestrationRun, {}, { summary: "" } as ProjectBoardCardProofReview)).toBe(
      "Runtime budget stopped the card after partial progress.",
    );
  });

  it("truncates runtime budget partial proof summaries", () => {
    const summary = projectBoardRuntimeBudgetPartialProofSummary({} as OrchestrationRun, { handoff: { summary: "x".repeat(4001) } }, {
      summary: "",
    } as ProjectBoardCardProofReview);

    expect(summary).toHaveLength(4000);
    expect(summary).toBe("x".repeat(4000));
  });

  it("maps runtime budget split outcomes for reviews with meaningful partial progress", () => {
    const now = "2026-01-01T00:04:00.000Z";
    const card = projectBoardCard({ acceptanceCriteria: ["Fallback criterion"] });
    const review = {
      summary: "Review summary.",
      satisfied: ["Unit proof recorded."],
      missing: ["Finish manual review."],
    } as unknown as ProjectBoardCardProofReview;
    const run = {
      id: "run-1",
      error: "Run error summary.",
      workspacePath: "/workspace/app",
      proofOfWork: {
        projectBoardRuntimeBudget: {
          exceeded: true,
          maxRuntimeMs: 125_000,
          elapsedMs: 130_500,
          recommendedNextAction: "Split the remaining work.",
        },
        changedFiles: ["src/main/projectStore/projectStore.ts"],
        handoff: {
          summary: "Handoff summary.",
          completed: ["Handoff completed."],
          remaining: ["Handoff remaining."],
        },
        remaining: ["Proof remaining."],
      },
    } as unknown as OrchestrationRun;

    expect(projectBoardRuntimeBudgetSplitOutcomeForReview(card, run, review, ["child-1"], now)).toEqual({
      status: "proposed",
      source: "runtime_budget",
      sourceRunId: "run-1",
      reason: "Runtime budget exceeded after 125s: Split the remaining work.",
      partialProofSummary: "Handoff summary.",
      completedCriteria: ["Implementation evidence recorded.", "Unit proof recorded.", "Handoff completed."],
      remainingCriteria: ["Handoff remaining.", "Proof remaining.", "Finish manual review."],
      childCardIds: ["child-1"],
      maxRuntimeMs: 125_000,
      elapsedMs: 130_500,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("skips runtime budget split outcomes without exceeded budget and meaningful progress", () => {
    const card = projectBoardCard({ acceptanceCriteria: ["Fallback criterion"] });
    const review = {
      summary: "Review summary.",
      satisfied: [],
      missing: ["Finish manual review."],
    } as unknown as ProjectBoardCardProofReview;
    const baseRun = {
      id: "run-1",
      error: "Run error summary.",
      workspacePath: "/workspace/app",
    } as unknown as OrchestrationRun;

    expect(projectBoardRuntimeBudgetSplitOutcomeForReview(card, baseRun, review, ["child-1"], "2026-01-01T00:04:00.000Z")).toBeUndefined();
    expect(
      projectBoardRuntimeBudgetSplitOutcomeForReview(
        card,
        {
          ...baseRun,
          proofOfWork: { projectBoardRuntimeBudget: { exceeded: false }, changedFiles: ["src/main/projectStore/projectStore.ts"] },
        } as unknown as OrchestrationRun,
        review,
        ["child-1"],
        "2026-01-01T00:04:00.000Z",
      ),
    ).toBeUndefined();
    expect(
      projectBoardRuntimeBudgetSplitOutcomeForReview(
        card,
        { ...baseRun, proofOfWork: { projectBoardRuntimeBudget: { exceeded: true } } } as unknown as OrchestrationRun,
        review,
        ["child-1"],
        "2026-01-01T00:04:00.000Z",
      ),
    ).toBeUndefined();
  });

  it("builds runtime budget follow-up text from partial proof sections", () => {
    const review = {
      summary: "  Review summary.  ",
    } as ProjectBoardProofReviewDraft;

    expect(
      projectBoardRuntimeBudgetFollowUpDescription(
        "Parent card",
        review,
        ["Implemented mapper.", "Ran tests."],
        ["Finish UI.", "Manual check."],
      ),
    ).toBe(
      [
        "Runtime-budget split follow-up derived from Parent card.",
        "",
        "Review summary.",
        "",
        "Completed before timeout:",
        "- Implemented mapper.",
        "- Ran tests.",
        "",
        "Remaining scope:",
        "- Finish UI.",
        "- Manual check.",
      ].join("\n"),
    );
    expect(projectBoardRuntimeBudgetFollowUpDescription("Parent card", { summary: " " } as ProjectBoardProofReviewDraft, [], [])).toBe(
      "Runtime-budget split follow-up derived from Parent card.",
    );
  });

  it("truncates runtime budget follow-up descriptions", () => {
    const prefix = "Runtime-budget split follow-up derived from Parent card.\n\n";
    const description = projectBoardRuntimeBudgetFollowUpDescription(
      "Parent card",
      { summary: "x".repeat(4001) } as ProjectBoardProofReviewDraft,
      [],
      [],
    );

    expect(description).toHaveLength(4000);
    expect(description).toBe(`${prefix}${"x".repeat(4000 - prefix.length)}`);
  });

  it("builds runtime budget follow-up clarification questions", () => {
    expect(projectBoardRuntimeBudgetFollowUpClarificationQuestion("Parent card")).toBe(
      'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Parent card" before ticketizing it.',
    );
  });

  it("filters runtime budget task actions to trustworthy proof actions", () => {
    const trustedCompletion = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed the mapper extraction.",
      completed: ["Moved helper into mapper module."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };
    const card = {
      acceptanceCriteria: ["Fallback criterion"],
    } as unknown as ProjectBoardCard;
    const copiedSampleCompletion = {
      ...trustedCompletion,
      actionId: "proof-1",
      summary: "summarize the actual proof collected in this run.",
    };

    expect(projectBoardRuntimeBudgetTrustworthyTaskActions(undefined)).toEqual([]);
    expect(projectBoardRuntimeBudgetTrustworthyTaskActions({ taskToolActions: [trustedCompletion, copiedSampleCompletion] })).toEqual([
      trustedCompletion,
    ]);
    expect(projectBoardRuntimeBudgetHasDurableCompletion(undefined)).toBe(false);
    expect(projectBoardRuntimeBudgetHasDurableCompletion({ taskToolActions: [trustedCompletion] })).toBe(true);
    expect(projectBoardRuntimeBudgetHasDurableCompletion({ taskToolActions: [copiedSampleCompletion] })).toBe(false);
    expect(projectBoardRuntimeBudgetCompletedCriteria(undefined, ["Unit proof recorded."], "/workspace/app")).toEqual([]);
    expect(
      projectBoardRuntimeBudgetCompletedCriteria({ completed: ["Proof completed."] }, ["Unit proof recorded."], "/workspace/app"),
    ).toEqual(["Proof completed."]);
    expect(
      projectBoardRuntimeBudgetCompletedCriteria(
        {
          changedFiles: ["src/main/projectStore/projectStore.ts"],
          handoff: { completed: ["Handoff completed."] },
          completed: ["Proof completed."],
          taskToolActions: [trustedCompletion, copiedSampleCompletion],
        },
        ["Unit proof recorded."],
        "/workspace/app",
      ),
    ).toEqual([
      "Implementation evidence recorded.",
      "Unit proof recorded.",
      "Handoff completed.",
      "Proof completed.",
      "Moved helper into mapper module.",
    ]);
    expect(projectBoardRuntimeBudgetRemainingCriteria(card, undefined, { missing: [] })).toEqual(["Fallback criterion"]);
    expect(
      projectBoardRuntimeBudgetRemainingCriteria(
        card,
        {
          handoff: { remaining: ["Handoff remaining."] },
          remaining: ["Proof remaining."],
          nextSteps: ["Next proof step."],
          taskToolActions: [{ ...trustedCompletion, remaining: ["Task action remaining."] }, copiedSampleCompletion],
        },
        { missing: ["Review missing proof."] },
      ),
    ).toEqual(["Handoff remaining.", "Proof remaining.", "Next proof step.", "Task action remaining.", "Review missing proof."]);
  });

  it("merges project board task actions for proof by action id", () => {
    const firstHeartbeat: ProjectBoardTaskToolAction = {
      action: "task_heartbeat",
      actionId: "heartbeat-current",
      createdAt: "2026-01-01T00:03:00.000Z",
      metadata: { transport: "native_tool", source: "first" },
      summary: "Started the extraction.",
      completed: [],
      remaining: ["Move helper."],
      nextStep: "Patch mapper module.",
    };
    const updatedHeartbeat: ProjectBoardTaskToolAction = {
      ...firstHeartbeat,
      metadata: { transport: "native_tool", source: "updated", toolName: "task_heartbeat" },
      summary: "Patched the mapper module.",
      remaining: ["Run tests."],
    };
    const earlierCompletion: ProjectBoardTaskToolAction = {
      action: "task_complete",
      actionId: "complete-current",
      createdAt: "2026-01-01T00:02:00.000Z",
      metadata: { transport: "native_tool" },
      summary: "Completed a prior helper.",
      completed: ["Prior helper moved."],
      remaining: [],
      risks: [],
      commands: ["pnpm test"],
      changedFiles: ["src/main/projectStore/projectBoardMappers.ts"],
      screenshots: [],
      browserTraces: [],
      visualChecks: [],
      manualChecks: [],
    };

    expect(mergeProjectBoardTaskToolActionsForProof([firstHeartbeat, earlierCompletion, updatedHeartbeat])).toEqual([
      earlierCompletion,
      {
        ...updatedHeartbeat,
        metadata: { transport: "native_tool", source: "updated", toolName: "task_heartbeat" },
      },
    ]);
  });
});
