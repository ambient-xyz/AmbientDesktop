import { describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisRun } from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  projectBoardPlannerContinuationForRetry,
  truncateProjectBoardPlannerContinuationRecords,
} from "./projectBoardPlannerContinuation";

const now = "2026-05-04T00:00:00.000Z";

function record(input: unknown): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact(input);
}

function baseRun(): ProjectBoardSynthesisRun {
  return {
    id: "run-output-cap",
    boardId: "board-1",
    status: "succeeded",
    stage: "board_applied",
    model: "zai-org/GLM-5.1-FP8",
    sourceCount: 1,
    includedSourceCount: 1,
    sourceCharCount: 1000,
    cardCount: 1,
    questionCount: 0,
    warningCount: 0,
    events: [
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
          lastValidRecordIndex: 1,
        },
        createdAt: now,
      },
    ],
    startedAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function pausedRun(progressiveRecords: ProposalJsonlRecordArtifact[]): ProjectBoardSynthesisRun {
  return {
    ...baseRun(),
    id: "run-paused",
    status: "paused",
    stage: "paused",
    progressiveRecords,
    events: [
      {
        stage: "paused",
        title: "Planning paused",
        summary: "Planning paused at a safe planner checkpoint.",
        metadata: {
          decision: "planning_paused",
          checkpointPolicy: "validated_progressive_records",
          retryable: true,
        },
        createdAt: now,
      },
    ],
  };
}

describe("projectBoardPlannerContinuation", () => {
  it("truncates resume records to the last valid record before the recoverable output stop", () => {
    const records = [
      record({
        type: "candidate_card",
        sourceId: "synthesis:first",
        title: "First card",
        description: "Build the first card.",
        candidateStatus: "ready_to_create",
        labels: [],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["First card is done."],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Check first card."] },
      }),
      record({
        type: "source_coverage",
        sourceId: "source-kanban",
        range: "intro",
        status: "partial",
        cardIds: ["synthesis:first"],
        note: "Covered intro.",
        updatedAt: now,
      }),
      record({
        type: "progress",
        stage: "planner_batch_succeeded",
        title: "Completed planner batch 1",
        summary: "Budget exhausted.",
        createdAt: now,
        metadata: {
          recoverableOutputStop: true,
          lastValidRecordId: "source-kanban",
          lastValidRecordType: "source_coverage",
        },
      }),
      record({
        type: "candidate_card",
        sourceId: "synthesis:post-stop",
        title: "Post-stop duplicate",
        description: "This came from a later assembled draft and should not define the continuation point.",
        candidateStatus: "ready_to_create",
        labels: [],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "later" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["Post-stop card is done."],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Check post-stop card."] },
      }),
    ];

    const truncated = truncateProjectBoardPlannerContinuationRecords(records, {
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
    });

    expect(truncated.matched).toBe(true);
    expect(truncated.records.map((item) => item.type)).toEqual(["candidate_card", "source_coverage"]);
  });

  it("returns continuation metadata for output-cap retries", () => {
    const records = [
      record({
        type: "source_coverage",
        sourceId: "source-kanban",
        range: "intro",
        status: "partial",
        cardIds: [],
        note: "Covered intro.",
        updatedAt: now,
      }),
      record({
        type: "progress",
        stage: "planner_batch_succeeded",
        title: "Completed planner batch 1",
        summary: "Budget exhausted.",
        createdAt: now,
        metadata: {
          recoverableOutputStop: true,
          lastValidRecordId: "source-kanban",
          lastValidRecordType: "source_coverage",
        },
      }),
    ];

    const result = projectBoardPlannerContinuationForRetry(baseRun(), records);

    expect(result.continuation).toMatchObject({
      retryOfRunId: "run-output-cap",
      finishReason: "length",
      outputTokenBudget: 6000,
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
      originalRecordCount: 2,
      retainedRecordCount: 1,
      truncatedToLastValidRecord: true,
    });
    expect(result.records).toHaveLength(1);
  });

  it("truncates paused-run continuation records at the planner-batch pause checkpoint", () => {
    const records = [
      record({
        type: "candidate_card",
        sourceId: "synthesis:kanban-shell",
        title: "Create kanban shell",
        description: "Create columns and a first card model.",
        candidateStatus: "ready_to_create",
        labels: ["kanban"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "intro" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["The kanban board renders columns."],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Check the shell."] },
      }),
      record({
        type: "source_coverage",
        sourceId: "source-kanban",
        range: "intro",
        status: "partial",
        cardIds: ["synthesis:kanban-shell"],
        note: "Covered the shell.",
        updatedAt: now,
      }),
      record({
        type: "progress",
        stage: "planner_batch_succeeded",
        title: "Completed planner batch 1",
        summary: "Planner batch paused after a validated checkpoint.",
        createdAt: now,
        metadata: {
          plannerBatchIndex: 1,
          plannerBatchCount: 4,
          plannerStatus: "user_cancelled",
          finishReason: "user_cancelled",
          stopReason: "pause_requested",
          recoverableOutputStop: true,
          lastValidRecordId: "source-kanban",
          lastValidRecordType: "source_coverage",
          lastValidRecordIndex: 1,
        },
      }),
      record({
        type: "candidate_card",
        sourceId: "synthesis:post-pause",
        title: "Post-pause partial card",
        description: "This record came after the pause checkpoint and must not be replayed.",
        candidateStatus: "ready_to_create",
        labels: ["kanban"],
        blockedBy: [],
        sourceRefs: [{ sourceId: "source-kanban", range: "later" }],
        clarificationQuestions: [],
        acceptanceCriteria: ["The post-pause card is done."],
        testPlan: { unit: [], integration: [], visual: [], manual: ["Check post-pause card."] },
      }),
      record({
        type: "proposal_final",
        summary: "A reconstructed final proposal must not become part of resume context.",
        goal: "Build a kanban board.",
        currentState: "The first batch paused.",
        targetUser: "Project managers.",
        qualityBar: "Resume without duplicating partial records.",
        createdAt: now,
      }),
    ];

    const result = projectBoardPlannerContinuationForRetry(pausedRun(records), records);

    expect(result.continuation).toMatchObject({
      retryOfRunId: "run-paused",
      finishReason: "user_cancelled",
      stopReason: "pause_requested",
      lastValidRecordId: "source-kanban",
      lastValidRecordType: "source_coverage",
      lastValidRecordIndex: 1,
      plannerBatchIndex: 1,
      plannerBatchCount: 4,
      originalRecordCount: 5,
      retainedRecordCount: 2,
      truncatedToLastValidRecord: true,
    });
    expect(result.records.map((item) => (item.type === "candidate_card" ? item.sourceId : item.type === "source_coverage" ? item.sourceId : item.type))).toEqual([
      "synthesis:kanban-shell",
      "source-kanban",
    ]);
  });
});
