import { describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisRun } from "../../shared/projectBoardTypes";
import {
  projectBoardHistoryRecoveryQueue,
  projectBoardSynthesisRunControlState,
  projectBoardSynthesisRunPromptBudgetAudit,
  projectBoardSynthesisRunPromptBudgetMetrics,
} from "./projectBoardUiModel";

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

describe("projectBoardUiModel synthesis run model", () => {
  it("models pause and resume controls for synthesis run states", () => {
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }))).toMatchObject({
      pause: {
        visible: true,
        label: "Pause Planning",
        busyLabel: "Pausing",
        disabled: false,
      },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running" }), { pauseBusy: true })).toMatchObject({
      pause: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "running", stage: "kickoff_defaults" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "pause_requested" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: {
        visible: true,
        label: "Resume Planning",
        busyLabel: "Resuming",
        disabled: false,
      },
      startFresh: {
        visible: true,
        label: "Start Fresh",
        busyLabel: "Starting Fresh",
        disabled: false,
      },
    });

    expect(
      projectBoardSynthesisRunControlState(synthesisRun({ status: "paused", stage: "paused" }), { resumeBusy: true, startFreshBusy: true }),
    ).toMatchObject({
      resume: {
        visible: true,
        disabled: true,
      },
      startFresh: {
        visible: true,
        disabled: true,
      },
    });

    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "succeeded" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "failed" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
    expect(projectBoardSynthesisRunControlState(synthesisRun({ status: "abandoned", stage: "paused" }))).toMatchObject({
      pause: { visible: false },
      resume: { visible: false },
      startFresh: { visible: false },
    });
  });

  it("models History recovery actions for exhausted failed source sections", () => {
    const queue = projectBoardHistoryRecoveryQueue({
      sources: [
        {
          id: "source-1",
          boardId: "board-1",
          kind: "plan_artifact",
          title: "Durable plan",
          summary: "Tiny animation plan",
          path: "plan.md",
          includeInSynthesis: true,
          relevance: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      synthesisRuns: [
        synthesisRun({
          status: "failed",
          stage: "failed",
          progressiveRecords: [
            {
              type: "progress",
              title: "Section 1 failed",
              summary: "No usable card records were emitted after inline retry budget was exhausted.",
              createdAt: "2026-01-01T00:01:00.000Z",
              metadata: {
                sectionStatus: "failed",
                sectionId: "section-1",
                sectionIndex: 1,
                sectionCount: 2,
                sectionHeading: "Animation",
                sourcePath: "plan.md",
                failureKind: "section_no_records",
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
          progressiveSummary: {
            recordCount: 2,
            candidateCardCount: 1,
            questionCount: 0,
            sourceCoverageCount: 1,
            dependencyEdgeCount: 0,
            warningCount: 0,
            errorCount: 1,
          },
          updatedAt: "2026-01-01T00:02:00.000Z",
        }),
      ],
    });

    expect(queue[0]).toMatchObject({
      title: "Failed source sections need a decision",
      failedSectionCount: 1,
      completedSectionCount: 1,
      progressiveRecordCount: 2,
      sourcePaths: ["plan.md"],
    });
    expect(queue[0]?.actions.map((action) => [action.id, action.disabled])).toEqual([
      ["retry_failed_sections", false],
      ["defer_failed_sections", false],
      ["view_progressive_records", false],
      ["open_source_context", false],
    ]);
  });

  it("models History recovery actions for stale, paused, and output-cap runs", () => {
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
        sources: [],
        synthesisRuns: [
          synthesisRun({ id: "run-paused", status: "paused", stage: "paused", updatedAt: "2026-01-01T00:02:00.000Z" }),
          synthesisRun({ id: "run-stale", status: "running", updatedAt: "2026-01-01T00:01:00.000Z" }),
          outputCapRun,
        ],
      },
      { nowMs: Date.parse("2026-01-01T00:10:00.000Z"), staleMs: 60_000 },
    );

    expect(queue.map((item) => [item.runId, item.title, item.actions.map((action) => action.id)])).toEqual([
      ["run-output", "Planner batch can continue", ["continue_planner_batch"]],
      ["run-paused", "Paused run can resume", ["resume_paused_run", "start_fresh_from_paused_run"]],
      ["run-stale", "Planning appears stale", ["retry_stalled_run"]],
    ]);
  });

  it("keeps recovered failed section runs auditable without stale retry actions", () => {
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

    const parentRecovery = projectBoardHistoryRecoveryQueue({ sources: [], synthesisRuns: [parent, child] }).find(
      (item) => item.runId === parent.id,
    );

    expect(parentRecovery).toMatchObject({
      title: "Recovered by retry",
      tone: "neutral",
      summary: expect.stringContaining("run-child"),
    });
    expect(parentRecovery?.actions.map((action) => action.id)).toEqual(["view_progressive_records", "open_source_context"]);
  });

  it("splits latest and cumulative prompt budget metrics for sectioned planning", () => {
    const metrics = projectBoardSynthesisRunPromptBudgetMetrics(
      synthesisRun({
        promptCharCount: 1_008_778,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for section 27/51",
            summary: "Sent prompt characters for a source section.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 31_804,
              cumulativePromptCharCount: 1_008_778,
              latestEstimatedInputTokens: 7_951,
              cumulativeEstimatedInputTokens: 252_195,
              promptBudgetAssessment: { promptCharCount: 31_804, summarizationRecommended: false },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "section_prompt_below_threshold",
            },
          },
        ],
      }),
    );

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Latest prompt chars", value: "31,804" }),
        expect.objectContaining({ label: "Cumulative prompt chars", value: "1,008,778" }),
        expect.objectContaining({ label: "Est. input tokens", value: "~7,951 latest / ~252,195 total" }),
        expect.objectContaining({ label: "Compaction", value: "Skipped: below threshold" }),
      ]),
    );
  });

  it("reports planner ledger compaction status from run events", () => {
    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_request",
              title: "Asked Ambient/Pi for planner batch 1",
              summary: "Planner batch used compacted context.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                latestPromptCharCount: 12_000,
                cumulativePromptCharCount: 80_000,
                promptBudgetAssessment: { promptCharCount: 12_000, summarizationRecommended: false },
                plannerLedgerCompactionStatus: "used",
                plannerLedgerCompaction: { cacheHit: false },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Applied" });

    expect(
      projectBoardSynthesisRunPromptBudgetMetrics(
        synthesisRun({
          promptCharCount: 80_000,
          events: [
            {
              stage: "model_response",
              title: "Reused cached planner ledger compaction for batch 1",
              summary: "Compaction cache hit.",
              createdAt: "2026-01-01T00:00:00.000Z",
              metadata: {
                plannerLedgerCompactionStatus: "cache_hit",
                plannerLedgerCompaction: { cacheHit: true },
              },
            },
          ],
        }),
      ).find((metric) => metric.label === "Compaction"),
    ).toMatchObject({ value: "Reused" });
  });

  it("builds a prompt budget audit from sectioned compaction telemetry", () => {
    const usedAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
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
      }),
    );

    expect(usedAudit).toMatchObject({
      tone: "ready",
      headline: "Compacted planner context was applied",
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Latest request", value: "22,000" }),
        expect.objectContaining({ label: "Run total", value: "180,000" }),
        expect.objectContaining({ label: "Compacted cards", value: "9" }),
        expect.objectContaining({ label: "Omitted cards", value: "4" }),
        expect.objectContaining({ label: "Final prompt", value: "22,000" }),
      ]),
      notes: expect.arrayContaining(["Compaction source: pi_rlm.", "Prior card themes and duplicate-avoidance notes were compacted."]),
    });

    const legacyAudit = projectBoardSynthesisRunPromptBudgetAudit(
      synthesisRun({
        promptCharCount: 250_000,
        events: [
          {
            stage: "model_request",
            title: "Asked Ambient/Pi for source section 10/12",
            summary: "Old section telemetry.",
            createdAt: "2026-01-01T00:00:00.000Z",
            metadata: {
              latestPromptCharCount: 70_000,
              cumulativePromptCharCount: 250_000,
              promptBudgetAssessment: { promptCharCount: 70_000, summarizationRecommended: true },
              plannerLedgerCompactionStatus: "skipped",
              plannerLedgerCompactionSkipReason: "sectioned_planning_compaction_not_supported",
            },
          },
        ],
      }),
    );

    expect(legacyAudit).toMatchObject({
      tone: "warning",
      headline: "Legacy run skipped section compaction",
      detail: expect.stringContaining("Current sectioned runs can compact repeated context"),
    });
    expect(legacyAudit?.notes.join(" ")).not.toMatch(/not implemented/i);
  });
});
