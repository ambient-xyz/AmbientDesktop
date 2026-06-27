import { describe, expect, it } from "vitest";

import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import {
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
  projectBoardSatisfiedProofItems,
  stringsFromProjectBoardUnknownArray,
} from "./projectBoardProofMappers";

describe("project board proof mappers", () => {
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
});
