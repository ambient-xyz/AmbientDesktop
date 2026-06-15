import { describe, expect, it } from "vitest";
import {
  projectBoardCardGenerationGate,
  projectBoardCharterReviewGate,
  projectBoardRunBlocksPlanning,
  projectBoardRunCanProvidePlanningSnapshot,
} from "./projectBoardSynthesisGate";
import type { ProjectBoardSummary, ProjectBoardSynthesisRun } from "./types";

function board(input: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  const base: ProjectBoardSummary = {
    id: "board-1",
    projectPath: "/workspace/project",
    status: "draft",
    title: "Project board",
    summary: "Coordinate work.",
    cards: [],
    questions: [],
    sources: [],
    proposals: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...base, ...input } as ProjectBoardSummary;
}

function run(input: Partial<ProjectBoardSynthesisRun> = {}): ProjectBoardSynthesisRun {
  return {
    id: "run-1",
    boardId: "board-1",
    status: "running",
    stage: "model_request",
    sourceCount: 0,
    includedSourceCount: 0,
    sourceCharCount: 0,
    warningCount: 0,
    events: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

describe("projectBoardSynthesisGate", () => {
  it("does not treat kickoff default helper runs as active board planning", () => {
    expect(projectBoardRunBlocksPlanning(run({ stage: "kickoff_defaults" }))).toBe(false);
    expect(projectBoardRunCanProvidePlanningSnapshot(run({ stage: "kickoff_defaults", status: "succeeded" }))).toBe(false);
    expect(projectBoardRunBlocksPlanning(run({ stage: "model_request" }))).toBe(true);
    expect(projectBoardRunBlocksPlanning(run({ stage: "model_request", status: "pause_requested" }))).toBe(true);
    expect(projectBoardRunBlocksPlanning(run({ stage: "model_request", status: "succeeded" }))).toBe(false);
  });

  it("requires answered kickoff questions before charter review on draft boards", () => {
    expect(
      projectBoardCharterReviewGate(
        board({
          questions: [
            { id: "q1", boardId: "board-1", question: "Goal?", required: true, createdAt: "", updatedAt: "" },
            { id: "q2", boardId: "board-1", question: "Proof?", required: true, answer: "Browser smoke.", createdAt: "", updatedAt: "" },
          ],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("1/2 answered"),
    });

    expect(
      projectBoardCharterReviewGate(
        board({
          questions: [
            { id: "q1", boardId: "board-1", question: "Goal?", required: true, answer: "Ship it.", createdAt: "", updatedAt: "" },
          ],
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("requires an active charter before card-generating synthesis", () => {
    expect(projectBoardCardGenerationGate(board(), "Board synthesis")).toMatchObject({
      allowed: false,
      reason: "Board synthesis requires an active project board charter. Answer kickoff questions and activate the board first.",
    });
    expect(projectBoardCardGenerationGate(board({ status: "active" }), "Board synthesis")).toEqual({ allowed: true });
  });
});
