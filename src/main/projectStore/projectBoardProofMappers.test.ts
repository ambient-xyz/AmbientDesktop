import { describe, expect, it } from "vitest";

import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { ProjectBoardCard, ProjectBoardCardProofReview } from "../../shared/projectBoardTypes";
import type { ProjectBoardTaskToolAction } from "./projectStoreProjectBoardFacade";
import {
  evaluateProjectBoardCardProof,
  mergeProjectBoardTaskToolActionsForProof,
  normalizeRuntimeBudgetCriteria,
  projectBoardAfterRunHookSucceeded,
  projectBoardChangedPathForImplementationEvidence,
  projectBoardChangedProofPaths,
  projectBoardHasAcceptanceEvidence,
  projectBoardHasImplementationEvidence,
  projectBoardHasIntegrationEvidence,
  projectBoardHasManualEvidence,
  projectBoardHasNegatedManualEvidence,
  projectBoardHasNegatedVisualEvidence,
  projectBoardHasUnitEvidence,
  projectBoardHasVisualEvidence,
  projectBoardIsMeaningfulChangedPath,
  projectBoardMissingProofItems,
  projectBoardProofEvidenceText,
  projectBoardProofObject,
  projectBoardProofRequestsDone,
  projectBoardProofReviewFromDraft,
  projectBoardPromptList,
  projectBoardPromptSummary,
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
  projectBoardSatisfiedProofItems,
  stringsFromProjectBoardUnknownArray,
  type ProjectBoardProofReviewDraft,
} from "./projectBoardProofMappers";

describe("project board proof mappers", () => {
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

  it("maps project board proof review drafts with run metadata", () => {
    expect(
      projectBoardProofReviewFromDraft(
        {
          status: "needs_follow_up",
          summary: "Proof needs one more screenshot.",
          satisfied: ["Unit proof recorded."],
          missing: ["Visual/browser proof recorded."],
          reviewer: "ambient_pi",
          model: "test-model",
          confidence: 0.82,
          evidenceQuality: "mixed",
          recommendedAction: "follow_up",
          deterministicStatus: "ready_for_review",
          deterministicSummary: "Deterministic proof mostly passed.",
          judgeDurationMs: 42,
          followUpSuggestion: { title: "Capture screenshot", labels: ["visual-proof"] },
        },
        {
          id: "run-1",
          taskId: "task-1",
          attemptNumber: 1,
          status: "completed",
          workspacePath: "/tmp/proof-review",
          startedAt: "2026-01-01T00:00:00.000Z",
        },
        "2026-01-01T00:05:00.000Z",
        ["follow-up-1"],
      ),
    ).toEqual({
      status: "needs_follow_up",
      summary: "Proof needs one more screenshot.",
      satisfied: ["Unit proof recorded."],
      missing: ["Visual/browser proof recorded."],
      followUpCardIds: ["follow-up-1"],
      runId: "run-1",
      reviewedAt: "2026-01-01T00:05:00.000Z",
      reviewer: "ambient_pi",
      model: "test-model",
      confidence: 0.82,
      evidenceQuality: "mixed",
      recommendedAction: "follow_up",
      deterministicStatus: "ready_for_review",
      deterministicSummary: "Deterministic proof mostly passed.",
      judgeDurationMs: 42,
      followUpSuggestion: { title: "Capture screenshot", labels: ["visual-proof"] },
    });
  });

  it("normalizes unknown proof sub-objects conservatively", () => {
    const record = { ok: true, durationMs: 42 };

    expect(projectBoardProofObject(record)).toBe(record);
    expect(projectBoardProofObject({ nested: { value: "kept" } })).toEqual({ nested: { value: "kept" } });
    expect(projectBoardProofObject(["not", "an", "object"])).toBeUndefined();
    expect(projectBoardProofObject(null)).toBeUndefined();
    expect(projectBoardProofObject("not an object")).toBeUndefined();
  });

  it("normalizes unknown string arrays conservatively", () => {
    expect(stringsFromProjectBoardUnknownArray(["  one  ", "", "two", 3, { label: "ignored" }, " three "])).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(stringsFromProjectBoardUnknownArray("one")).toEqual([]);
    expect(stringsFromProjectBoardUnknownArray(null)).toEqual([]);
  });

  it("normalizes project board prompt lists and summaries", () => {
    expect(projectBoardPromptList([" one ", "", "two", "one", " three ", "two"], 3)).toEqual(["one", "two", "three"]);
    expect(projectBoardPromptList(["one", "two"], 1)).toEqual(["one"]);
    expect(projectBoardPromptSummary(undefined, "   ", "  summary text  ")).toBe("summary text");
    expect(projectBoardPromptSummary("x".repeat(705))).toBe("x".repeat(700));
    expect(projectBoardPromptSummary(undefined, "   ")).toBeUndefined();
  });

  it("normalizes project board proof evidence text", () => {
    const text = projectBoardProofEvidenceText("Run ERROR", {
      lastAssistantText: "Implemented Feature",
      testOutput: "VITEST passed",
      afterRunHook: { ok: true },
      browserEvidence: { screenshotCount: 1 },
      taskToolActions: [{ action: "task_complete" }],
      commands: ["pnpm test"],
      visualChecks: ["nonblank canvas"],
      screenshots: ["shot.png"],
      focusLoop: { status: "done" },
      projectBoardRuntimeBudget: { exceeded: false },
      gitStatus: [" M src/main/example.ts"],
      ignored: "not included",
    });

    expect(text).toContain("run error");
    expect(text).toContain("implemented feature");
    expect(text).toContain('"ok":true');
    expect(text).toContain('"screenshotcount":1');
    expect(text).toContain('"task_complete"');
    expect(text).toContain("m src/main/example.ts");
    expect(text).not.toContain("not included");
  });

  it("maps proof request completion signals conservatively", () => {
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: { ok: false } })).toBe(false);
    expect(projectBoardAfterRunHookSucceeded({ afterRunHook: ["not", "an", "object"] })).toBe(false);
    expect(projectBoardAfterRunHookSucceeded(undefined)).toBe(false);

    expect(projectBoardProofRequestsDone({ projectBoardStatus: "done" })).toBe(true);
    expect(projectBoardProofRequestsDone({ projectBoardReview: { status: "done" } })).toBe(true);
    expect(projectBoardProofRequestsDone({ markProjectBoardDone: true })).toBe(true);
    expect(
      projectBoardProofRequestsDone({ projectBoardStatus: "ready_for_review", projectBoardReview: { status: "needs_follow_up" } }),
    ).toBe(false);
    expect(projectBoardProofRequestsDone(undefined)).toBe(false);
  });

  it("detects negated proof evidence phrasing", () => {
    expect(projectBoardHasNegatedVisualEvidence("no browser screenshot was available")).toBe(true);
    expect(projectBoardHasNegatedVisualEvidence("playwright screenshot was not captured")).toBe(true);
    expect(projectBoardHasNegatedVisualEvidence("browser screenshot captured and nonblank canvas verified")).toBe(false);

    expect(projectBoardHasNegatedManualEvidence("manual review was not completed")).toBe(true);
    expect(projectBoardHasNegatedManualEvidence("unable to open the app for manual verification")).toBe(true);
    expect(projectBoardHasNegatedManualEvidence("manual review confirmed the behavior")).toBe(false);
  });

  it("detects basic proof evidence signals", () => {
    expect(projectBoardHasAcceptanceEvidence("acceptance criteria verified")).toBe(true);
    expect(projectBoardHasAcceptanceEvidence("waiting for details")).toBe(false);
    expect(projectBoardHasUnitEvidence("vitest passed", undefined)).toBe(true);
    expect(projectBoardHasUnitEvidence("no proof keywords here", { afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardHasUnitEvidence("no proof keywords here", { afterRunHook: { ok: false } })).toBe(false);
    expect(projectBoardHasIntegrationEvidence("electron smoke verified", undefined)).toBe(true);
    expect(projectBoardHasIntegrationEvidence("no proof keywords here", { afterRunHook: { ok: true } })).toBe(true);
    expect(projectBoardHasIntegrationEvidence("no proof keywords here", { afterRunHook: { ok: false } })).toBe(false);
  });

  it("normalizes implementation proof paths", () => {
    expect(projectBoardChangedPathForImplementationEvidence('"./src/main/example.ts"')).toBe("src/main/example.ts");
    expect(projectBoardChangedPathForImplementationEvidence("/workspace/app/src/main/example.ts", "/workspace/app")).toBe(
      "src/main/example.ts",
    );
    expect(projectBoardChangedPathForImplementationEvidence("file:///workspace/app/src/main/example.ts", "file:///workspace/app")).toBe(
      "src/main/example.ts",
    );
    expect(projectBoardChangedPathForImplementationEvidence("/outside/example.ts", "/workspace/app")).toBe("/outside/example.ts");
  });

  it("collects changed proof paths from proof fields and task-tool evidence", () => {
    expect(
      projectBoardChangedProofPaths(
        {
          changedFiles: ['"./src/main/changed.ts"', { path: "file:///workspace/app/src/main/object.ts" }],
          gitStatus: [" M src/main/git.ts", "?? src/main/new.ts", ""],
          taskToolActions: [
            {
              action: "task_complete",
              actionId: "complete-current",
              createdAt: "2026-01-01T00:03:00.000Z",
              metadata: { transport: "native_tool" },
              summary: "Completed the mapper extraction.",
              completed: [],
              remaining: [],
              risks: [],
              commands: [],
              changedFiles: ["src/main/task.ts"],
              screenshots: [],
              browserTraces: [],
              visualChecks: [],
              manualChecks: [],
            },
          ],
        },
        "/workspace/app",
      ),
    ).toEqual(["src/main/changed.ts", "src/main/object.ts", "src/main/git.ts", "src/main/new.ts", "src/main/task.ts"]);
  });

  it("filters non-meaningful implementation proof paths", () => {
    expect(projectBoardIsMeaningfulChangedPath("src/main/example.ts")).toBe(true);
    expect(projectBoardIsMeaningfulChangedPath("node_modules/pkg/index.js")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".git/config")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".ambient/state.json")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".ambient-codex/state.json")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".vite/cache")).toBe(false);
    expect(projectBoardIsMeaningfulChangedPath(".DS_Store")).toBe(false);
  });

  it("detects implementation evidence from changed paths and diffs", () => {
    expect(projectBoardHasImplementationEvidence(undefined, "")).toBe(false);
    expect(projectBoardHasImplementationEvidence({ changedFiles: ["src/main/example.ts"] }, "")).toBe(true);
    expect(projectBoardHasImplementationEvidence({ changedFiles: ["node_modules/pkg/index.js"] }, "")).toBe(false);
    expect(
      projectBoardHasImplementationEvidence(
        {
          diff: "diff --git a/src/main/example.ts b/src/main/example.ts\n+changed",
        },
        "",
      ),
    ).toBe(true);
    expect(
      projectBoardHasImplementationEvidence(
        {
          diff: "diff --git a/.ambient/state.json b/.ambient/state.json\n+changed",
        },
        "",
      ),
    ).toBe(false);
    expect(projectBoardHasImplementationEvidence({ diff: "Binary files changed" }, "")).toBe(true);
  });

  it("detects visual evidence from structured proof sources", () => {
    expect(projectBoardHasVisualEvidence("", undefined)).toBe(false);
    expect(projectBoardHasVisualEvidence("", { screenshots: ["shot.png"] })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { visualChecks: [{ status: "passed" }] })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { browserEvidence: { screenshotCount: 1 } })).toBe(true);
    expect(projectBoardHasVisualEvidence("", { browserEvidence: { visualCheckCount: 1 } })).toBe(true);
    expect(projectBoardHasVisualEvidence("no browser screenshot was available", {})).toBe(false);
    expect(
      projectBoardHasVisualEvidence("", {
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:03:00.000Z",
            metadata: { transport: "native_tool" },
            summary: "Captured visual proof.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: ["trace.zip"],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      }),
    ).toBe(true);
  });

  it("detects manual evidence from structured proof sources and proof text", () => {
    expect(projectBoardHasManualEvidence("", undefined)).toBe(false);
    expect(projectBoardHasManualEvidence("", { manualChecks: ["Manual review confirmed the behavior."] })).toBe(true);
    expect(projectBoardHasManualEvidence("", { manualChecks: ["manual review was not completed"] })).toBe(false);
    expect(projectBoardHasManualEvidence("manual review confirmed the behavior", {})).toBe(true);
    expect(projectBoardHasManualEvidence("manual review was not completed", {})).toBe(false);
    expect(
      projectBoardHasManualEvidence("", {
        taskToolActions: [
          {
            action: "task_report_proof",
            actionId: "proof-current",
            createdAt: "2026-01-01T00:03:00.000Z",
            metadata: { transport: "native_tool" },
            summary: "Manual proof captured.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: ["Opened the app and verified the workflow."],
          },
        ],
      }),
    ).toBe(true);
  });

  it("maps satisfied proof items from card expectations", () => {
    const card = {
      acceptanceCriteria: ["Acceptance criteria verified"],
      testPlan: {
        unit: ["Run unit tests"],
        integration: ["Run integration smoke"],
        visual: ["Capture screenshot"],
        manual: ["Manual review"],
      },
    } as ProjectBoardCard;
    const proof = {
      changedFiles: ["src/main/projectStore/projectStore.ts"],
      afterRunHook: { ok: true },
      screenshots: ["screenshot.png"],
      manualChecks: ["Manual review confirmed the behavior."],
    };

    expect(
      projectBoardSatisfiedProofItems(
        card,
        "Acceptance criteria verified. Vitest passed. Electron smoke verified.",
        proof,
        "/workspace/app",
      ),
    ).toEqual([
      "Implementation evidence recorded.",
      "Acceptance criteria discussed in proof.",
      "Unit proof recorded.",
      "Integration proof recorded.",
      "Visual/browser proof recorded.",
      "Manual review proof recorded.",
    ]);
    expect(
      projectBoardSatisfiedProofItems(
        {
          ...card,
          acceptanceCriteria: [],
          testPlan: { unit: [], integration: [], visual: [], manual: [] },
        } as ProjectBoardCard,
        "Acceptance criteria verified. Vitest passed.",
        proof,
        "/workspace/app",
      ),
    ).toEqual(["Implementation evidence recorded."]);
  });

  it("maps missing proof items from card expectations", () => {
    const card = {
      acceptanceCriteria: ["Acceptance criteria verified"],
      sourceKind: "pi_task",
      candidateStatus: "candidate",
      testPlan: {
        unit: ["Run unit tests"],
        integration: ["Run integration smoke"],
        visual: ["Capture screenshot"],
        manual: ["Manual review"],
      },
    } as unknown as ProjectBoardCard;

    expect(projectBoardMissingProofItems(card, "", undefined, "/workspace/app")).toEqual(["No proof packet recorded."]);
    expect(projectBoardMissingProofItems(card, "", {}, "/workspace/app")).toEqual([
      "Acceptance criteria were not explicitly addressed in the proof packet.",
      "No changed implementation files or meaningful diff evidence recorded.",
      "Unit proof missing: Run unit tests",
      "Integration proof missing: Run integration smoke",
      "Visual proof missing: Capture screenshot",
      "Manual proof missing: Manual review",
    ]);
    expect(
      projectBoardMissingProofItems({ ...card, sourceKind: "local_task_import" } as ProjectBoardCard, "", {}, "/workspace/app"),
    ).not.toContain("No changed implementation files or meaningful diff evidence recorded.");
    expect(
      projectBoardMissingProofItems({ ...card, candidateStatus: "evidence" } as ProjectBoardCard, "", {}, "/workspace/app"),
    ).not.toContain("No changed implementation files or meaningful diff evidence recorded.");
    expect(
      projectBoardMissingProofItems(
        card,
        "",
        { projectBoardRuntimeBudget: { exceeded: true, maxRuntimeMs: 125_000, recommendedNextAction: "Split the remaining work." } },
        "/workspace/app",
      ),
    ).toContain("Runtime budget exceeded after 125s: Split the remaining work.");
    expect(projectBoardMissingProofItems(card, "", { afterRunHook: { ok: false } }, "/workspace/app")).toContain("afterRun hook failed.");
  });

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
