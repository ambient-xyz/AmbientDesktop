import { describe, expect, it } from "vitest";
import type { PlannerPlanArtifact, ProjectBoardSourceKind, ProjectBoardSummary } from "../shared/types";
import { projectBoardMatchesCurrentPlannerArtifact } from "./projectBoardActiveScope";

describe("projectBoardMatchesCurrentPlannerArtifact", () => {
  it("keeps a board visible when the current durable planner source is classified as an implementation plan", () => {
    const board = boardWithPlannerSource("implementation_plan", "artifact-1", "thread-1");
    const artifact = plannerArtifact("artifact-1", "thread-1");

    expect(projectBoardMatchesCurrentPlannerArtifact(board, "thread-1", artifact)).toBe(true);
  });

  it("rejects a planner-scoped board when the artifact id belongs to an older plan", () => {
    const board = boardWithPlannerSource("implementation_plan", "old-artifact", "thread-1");
    const artifact = plannerArtifact("artifact-1", "thread-1");

    expect(projectBoardMatchesCurrentPlannerArtifact(board, "thread-1", artifact)).toBe(false);
  });
});

function boardWithPlannerSource(kind: ProjectBoardSourceKind, artifactId: string, threadId: string): ProjectBoardSummary {
  const now = "2026-06-02T06:37:50.126Z";
  return {
    id: "board-1",
    projectPath: "/tmp/project",
    status: "draft",
    title: "Tests board",
    summary: "Project board kickoff draft.",
    cards: [],
    sources: [
      {
        id: "source-1",
        boardId: "board-1",
        kind,
        title: "Plan: Yes / No / Maybe Decision App",
        summary: "Durable planner artifact.",
        path: ".ambient/board/plans/Yes-or-No-Decider-DurablePlan.html",
        threadId,
        artifactId,
        authorityRole: "primary",
        includeInSynthesis: true,
        relevance: 100,
        createdAt: now,
        updatedAt: now,
      },
    ],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    createdAt: now,
    updatedAt: now,
  };
}

function plannerArtifact(id: string, threadId: string): PlannerPlanArtifact {
  const now = "2026-06-02T06:37:49.000Z";
  return {
    id,
    threadId,
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "durable_ready",
    durableArtifactPath: ".ambient/board/plans/Yes-or-No-Decider-DurablePlan.html",
    durableArtifactGeneratedAt: now,
    title: "Plan: Yes / No / Maybe Decision App",
    summary: "A Yes / No / Maybe decider.",
    content: "User taps a button and gets a random Yes / No / Maybe answer.",
    steps: [],
    openQuestions: [],
    risks: [],
    verification: [],
    warnings: [],
    diagrams: [],
    decisionQuestions: [],
    createdAt: now,
    updatedAt: now,
  };
}
