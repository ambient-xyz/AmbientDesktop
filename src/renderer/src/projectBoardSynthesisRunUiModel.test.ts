import { describe, expect, it } from "vitest";

import type { ProjectBoardSource, ProjectBoardSynthesisRun } from "../../shared/projectBoardTypes";
import {
  projectBoardHistoryRecoveryQueue,
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
} from "./projectBoardSynthesisRunUiModel";

function synthesisRun(overrides: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "model_request",
    sourceCount: 2,
    includedSourceCount: 2,
    sourceCharCount: 1200,
    warningCount: 0,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function source(overrides: Partial<ProjectBoardSource> = {}): ProjectBoardSource {
  return {
    id: "source-1",
    boardId: "board-1",
    kind: "plan_artifact",
    title: "Durable plan",
    summary: "Planning source",
    path: "plan.md",
    includeInSynthesis: true,
    relevance: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectBoardSynthesisRunUiModel", () => {
  it("models pause, resume, and start-fresh controls for planner run states", () => {
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }))).toMatchObject({
      pause: { visible: true, label: "Pause Planning", disabled: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }), { pauseBusy: true })).toMatchObject({
      pause: { visible: true, disabled: true },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running", stage: "kickoff_defaults" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }), { resumeBusy: true, startFreshBusy: true })).toMatchObject({
      pause: { visible: false },
      resume: { visible: true, label: "Resume Planning", disabled: true },
      startFresh: { visible: true, label: "Start Fresh", disabled: true },
    });
  });

  it("models History recovery actions for failed sections, stale runs, paused runs, and output-cap continuation", () => {
    const failedRun = synthesisRun({
      id: "run-failed",
      status: "failed",
      stage: "failed",
      progressiveRecords: [
        {
          type: "progress",
          title: "Section 1 failed",
          summary: "No usable card records were emitted.",
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: {
            sectionStatus: "failed",
            sectionId: "section-1",
            sectionIndex: 1,
            sectionCount: 2,
            sourcePath: "plan.md",
          },
        },
        {
          type: "progress",
          title: "Section 2 completed",
          summary: "Saved card records.",
          createdAt: "2026-01-01T00:02:00.000Z",
          metadata: { sectionStatus: "succeeded", sectionId: "section-2", sectionIndex: 2, sectionCount: 2 },
        },
      ],
      progressiveRecordCount: 2,
      updatedAt: "2026-01-01T00:04:00.000Z",
    });
    const outputCapRun = synthesisRun({
      id: "run-output",
      status: "failed",
      stage: "failed",
      updatedAt: "2026-01-01T00:03:00.000Z",
      events: [
        {
          stage: "model_response",
          title: "Planner batch stopped",
          summary: "Stopped after output token limit.",
          createdAt: "2026-01-01T00:03:00.000Z",
          metadata: {
            recoverableOutputStop: true,
            finishReason: "length",
            lastValidRecordId: "card-1",
            lastValidRecordType: "candidate_card",
            lastValidRecordIndex: 1,
          },
        },
      ],
    });

    const queue = projectBoardHistoryRecoveryQueue(
      {
        sources: [source()],
        synthesisRuns: [
          synthesisRun({ id: "run-paused", status: "paused", stage: "paused", updatedAt: "2026-01-01T00:02:00.000Z" }),
          synthesisRun({ id: "run-stale", status: "running", updatedAt: "2026-01-01T00:01:00.000Z" }),
          outputCapRun,
          failedRun,
        ],
      },
      { nowMs: Date.parse("2026-01-01T00:10:00.000Z"), staleMs: 60_000 },
    );

    expect(queue.map((item) => [item.runId, item.title, item.actions.map((action) => action.id)])).toEqual([
      ["run-failed", "Failed source sections need a decision", ["retry_failed_sections", "defer_failed_sections", "view_progressive_records", "open_source_context"]],
      ["run-output", "Planner batch can continue", ["continue_planner_batch", "open_source_context"]],
      ["run-paused", "Paused run can resume", ["resume_paused_run", "start_fresh_from_paused_run", "open_source_context"]],
      ["run-stale", "Planning appears stale", ["retry_stalled_run", "open_source_context"]],
    ]);
    expect(queue[0]).toMatchObject({ failedSectionCount: 1, completedSectionCount: 1, progressiveRecordCount: 2, sourcePaths: ["plan.md"] });
  });

  it("keeps recovered failed-section runs auditable without stale retry actions", () => {
    const parent = synthesisRun({
      id: "run-parent",
      status: "succeeded",
      progressiveRecords: [
        {
          type: "progress",
          title: "Section failed",
          summary: "The section failed before a later retry recovered it.",
          createdAt: "2026-01-01T00:01:00.000Z",
          metadata: { sectionStatus: "failed", sectionId: "section-1", sectionIndex: 1, sectionCount: 1, sourcePath: "plan.md" },
        },
      ],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:01:00.000Z",
    });
    const child = synthesisRun({
      id: "run-child",
      retryOfRunId: parent.id,
      status: "succeeded",
      progressiveRecords: [{ type: "candidate_card", title: "Recovered card" }],
      progressiveRecordCount: 1,
      updatedAt: "2026-01-01T00:02:00.000Z",
    });

    const parentRecovery = projectBoardHistoryRecoveryQueue({ sources: [], synthesisRuns: [parent, child] }).find((item) => item.runId === parent.id);

    expect(parentRecovery).toMatchObject({
      title: "Recovered by retry",
      tone: "neutral",
      summary: expect.stringContaining("run-child"),
    });
    expect(parentRecovery?.actions.map((action) => action.id)).toEqual(["view_progressive_records", "open_source_context"]);
  });

  it("splits latest and cumulative prompt-budget metrics and reports compaction audits", () => {
    const run = synthesisRun({
      promptCharCount: 180_000,
      events: [
        {
          stage: "model_request",
          title: "Asked Ambient/Pi for source section 9/12",
          summary: "Section request used compacted context.",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: {
            latestPromptCharCount: 22_000,
            cumulativePromptCharCount: 180_000,
            latestEstimatedInputTokens: 5_500,
            cumulativeEstimatedInputTokens: 45_000,
            promptBudgetAssessment: { promptCharCount: 22_000, summarizationRecommended: false },
            plannerLedgerCompactionStatus: "used",
            plannerLedgerCompaction: {
              source: "pi_rlm",
              summary: "Prior card themes and duplicate-avoidance notes were compacted.",
              renderedCardCount: 9,
              omittedRenderedCardCount: 4,
              sourceCount: 3,
              finalPromptCharCount: 22_000,
            },
          },
        },
      ],
    });

    expect(projectBoardSynthesisRunPromptBudgetMetrics(run)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Latest prompt chars", value: "22,000" }),
        expect.objectContaining({ label: "Cumulative prompt chars", value: "180,000" }),
        expect.objectContaining({ label: "Est. input tokens", value: "~5,500 latest / ~45,000 total" }),
        expect.objectContaining({ label: "Compaction", value: "Applied" }),
      ]),
    );
    expect(projectBoardSynthesisRunPromptBudgetAudit(run)).toMatchObject({
      tone: "ready",
      headline: "Compacted planner context was applied",
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Latest request", value: "22,000" }),
        expect.objectContaining({ label: "Run total", value: "180,000" }),
        expect.objectContaining({ label: "Compacted cards", value: "9" }),
        expect.objectContaining({ label: "Final prompt", value: "22,000" }),
      ]),
      notes: expect.arrayContaining(["Compaction source: pi_rlm.", "Prior card themes and duplicate-avoidance notes were compacted."]),
    });
  });
});
