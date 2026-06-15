import { describe, expect, it } from "vitest";
import {
  projectBoardSynthesisOutputCapRecovery,
  projectBoardSynthesisPartialStatus,
  projectBoardSynthesisSectionStatuses,
  projectBoardSynthesisStaleRecovery,
  sectionStatusLabel,
} from "./projectBoardSynthesisRecovery";
import type { ProjectBoardSynthesisRun } from "./types";

const baseRun: ProjectBoardSynthesisRun = {
  id: "run-1",
  boardId: "board-1",
  status: "failed",
  stage: "failed",
  model: "zai-org/GLM-5.1-FP8",
  sourceCount: 1,
  includedSourceCount: 1,
  sourceCharCount: 1200,
  cardCount: 1,
  questionCount: 0,
  warningCount: 0,
  progressiveRecordCount: 3,
  progressiveSummary: {
    recordCount: 3,
    candidateCardCount: 1,
    questionCount: 0,
    sourceCoverageCount: 1,
    dependencyEdgeCount: 0,
    warningCount: 0,
    errorCount: 1,
    sectionSucceededCount: 1,
    sectionFailedCount: 1,
  },
  progressiveRecords: [
    {
      type: "progress",
      stage: "section_succeeded",
      title: "Completed section 1/2",
      summary: "Movement planned.",
      createdAt: "2026-05-04T00:00:00.000Z",
      metadata: {
        sectionId: "section-movement",
        sectionStatus: "succeeded",
        sectionIndex: 1,
        sectionCount: 2,
        sectionHeading: "Movement",
        sourcePath: "GDD.md",
      },
    },
    {
      type: "progress",
      stage: "section_failed",
      title: "Failed section 2/2",
      summary: "Combat timed out.",
      createdAt: "2026-05-04T00:01:00.000Z",
      metadata: {
        sectionId: "section-combat",
        sectionStatus: "failed",
        failureKind: "semantic_idle_timeout",
        sectionIndex: 2,
        sectionCount: 2,
        sectionHeading: "Combat",
        sourcePath: "GDD.md",
      },
    },
  ],
  events: [
    {
      stage: "source_scan",
      title: "Synthesis run started",
      summary: "Started.",
      metadata: {},
      createdAt: "2026-05-04T00:00:00.000Z",
    },
  ],
  startedAt: "2026-05-04T00:00:00.000Z",
  updatedAt: "2026-05-04T00:01:00.000Z",
  completedAt: "2026-05-04T00:01:00.000Z",
};

describe("projectBoardSynthesisRecovery", () => {
  it("derives ordered source section statuses from progressive records", () => {
    const statuses = projectBoardSynthesisSectionStatuses(baseRun);

    expect(statuses.map((status) => [status.key, status.status, status.sectionHeading])).toEqual([
      ["section-movement", "succeeded", "Movement"],
      ["section-combat", "failed", "Combat"],
    ]);
    expect(statuses[1]?.failureKind).toBe("semantic_idle_timeout");
    expect(sectionStatusLabel("failed", statuses[1]?.failureKind)).toBe("Stalled, retryable");
    expect(sectionStatusLabel("failed")).toBe("Needs retry");
  });

  it("identifies partial proposals that need failed-section retry", () => {
    const partial = projectBoardSynthesisPartialStatus(baseRun);

    expect(partial).toMatchObject({
      failedCount: 1,
      completedCount: 1,
      reusedCount: 0,
      sectionCount: 2,
      hasFailedSections: true,
      hasPartialProposal: true,
      deferred: false,
      failedSectionIds: ["section-combat"],
      failedSectionHeadings: ["Combat"],
    });
    expect(partial.summary).toContain("partial proposal");
    expect(partial.summary).toContain("1 source section still needs retry");
  });

  it("does not treat deterministic baseline card counts as a partial proposal", () => {
    const partial = projectBoardSynthesisPartialStatus({
      ...baseRun,
      cardCount: 5,
      progressiveSummary: {
        ...baseRun.progressiveSummary!,
        candidateCardCount: 0,
      },
    });

    expect(partial.hasFailedSections).toBe(true);
    expect(partial.hasPartialProposal).toBe(false);
    expect(partial.summary).toContain("No usable proposal was created");
  });

  it("keeps explicit defer decisions visible in recovery status", () => {
    const deferred = projectBoardSynthesisPartialStatus({
      ...baseRun,
      events: [
        ...baseRun.events,
        {
          stage: "failed",
          title: "Deferred failed source sections",
          summary: "Kept the partial proposal.",
          metadata: { decision: "defer_failed_sections" },
          createdAt: "2026-05-04T00:02:00.000Z",
        },
      ],
    });

    expect(deferred.deferred).toBe(true);
    expect(deferred.summary).toContain("explicitly deferred");
  });

  it("explains how a stale running run can be resumed", () => {
    const recovery = projectBoardSynthesisStaleRecovery(
      {
        ...baseRun,
        status: "running",
        stage: "model_response",
        completedAt: undefined,
        updatedAt: "2026-05-04T00:01:00.000Z",
      },
      {
        nowMs: Date.parse("2026-05-04T00:07:15.000Z"),
        staleMs: 5 * 60 * 1000,
      },
    );

    expect(recovery).toMatchObject({
      stale: true,
      completedCount: 1,
      failedCount: 1,
      sectionCount: 2,
    });
    expect(recovery.summary).toContain("6 minutes");
    expect(recovery.summary).toContain("Retry can reuse 1 completed or reused section record");
  });

  it("finds planner-batch output-cap continuation checkpoints", () => {
    const recovery = projectBoardSynthesisOutputCapRecovery({
      ...baseRun,
      status: "succeeded",
      stage: "board_applied",
      events: [
        ...baseRun.events,
        {
          stage: "schema_validation",
          title: "Validated planner batch 1",
          summary: "Imported partial records.",
          metadata: {
            plannerBatchIndex: 1,
            plannerBatchCount: 4,
            finishReason: "length",
            outputTokenBudget: 6000,
            recoverableOutputStop: true,
            lastValidRecordId: "source-kanban",
            lastValidRecordType: "source_coverage",
            lastValidRecordIndex: 2,
          },
          createdAt: "2026-05-04T00:02:00.000Z",
        },
      ],
    });

    expect(recovery).toMatchObject({
      canContinue: true,
      finishReason: "length",
      outputTokenBudget: 6000,
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
      plannerBatchIndex: 1,
      plannerBatchCount: 4,
    });
    expect(recovery.summary).toContain("Continue the batch");
  });

  it("finds paused planner-batch continuation checkpoints from progressive records", () => {
    const recovery = projectBoardSynthesisOutputCapRecovery({
      ...baseRun,
      status: "paused",
      stage: "paused",
      progressiveRecords: [
        ...(baseRun.progressiveRecords ?? []),
        {
          type: "progress",
          stage: "planner_batch_succeeded",
          title: "Completed planner batch 1",
          summary: "Planner batch paused after a validated checkpoint.",
          metadata: {
            plannerBatchIndex: 1,
            plannerBatchCount: 4,
            plannerStatus: "user_cancelled",
            finishReason: "user_cancelled",
            stopReason: "pause_requested",
            recoverableOutputStop: true,
            lastValidRecordId: "source-kanban",
            lastValidRecordType: "source_coverage",
            lastValidRecordIndex: 2,
          },
          createdAt: "2026-05-04T00:02:00.000Z",
        },
      ],
    });

    expect(recovery).toMatchObject({
      canContinue: true,
      finishReason: "user_cancelled",
      stopReason: "pause_requested",
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
      plannerBatchIndex: 1,
      plannerBatchCount: 4,
    });
    expect(recovery.summary).toContain("pause_requested");
    expect(recovery.summary).toContain("Continue the batch");
  });
});

it("treats a running run with an unparsable updatedAt as stale instead of fresh forever", () => {
  const recovery = projectBoardSynthesisStaleRecovery(
    {
      id: "run-corrupt",
      boardId: "board-1",
      status: "running",
      stage: "model_response",
      sourceCount: 1,
      includedSourceCount: 1,
      sourceCharCount: 100,
      cardCount: 0,
      questionCount: 0,
      warningCount: 0,
      events: [],
      startedAt: "not-a-timestamp",
      updatedAt: "not-a-timestamp",
    } as never,
    { nowMs: 1_000_000 },
  );

  expect(recovery.stale).toBe(true);
  expect(recovery.idleMs).toBe(Number.POSITIVE_INFINITY);
});
