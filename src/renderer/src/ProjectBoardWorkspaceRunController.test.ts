import { describe, expect, it } from "vitest";

import type {
  OrchestrationPrepareResult,
  ProjectBoardCard,
  ProjectBoardSummary,
} from "../../shared/types";
import {
  projectBoardPrepareSkipReasonLabel,
  projectBoardPrepareSkippedMessage,
  projectBoardTaskFingerprint,
} from "./ProjectBoardWorkspaceRunController";

describe("ProjectBoardWorkspaceRunController", () => {
  it("builds a stable task fingerprint from attached cards", () => {
    expect(
      projectBoardTaskFingerprint(
        projectBoard({
          cards: [
            projectBoardCard({ id: "card-a", orchestrationTaskId: "task-b" }),
            projectBoardCard({ id: "card-b", orchestrationTaskId: undefined }),
            projectBoardCard({ id: "card-c", orchestrationTaskId: "task-a" }),
          ],
        }),
      ),
    ).toBe("task-a|task-b");
    expect(projectBoardTaskFingerprint(undefined)).toBe("");
  });

  it("keeps prepare skip labels and capped joined messages stable", () => {
    expect(projectBoardPrepareSkipReasonLabel("state-concurrency")).toContain("agent slot is busy");
    expect(projectBoardPrepareSkipReasonLabel("blocked")).toBe("not prepared: blocked by an unfinished dependency.");
    expect(projectBoardPrepareSkipReasonLabel("already-claimed")).toBe("claimed by another desktop.");
    expect(projectBoardPrepareSkipReasonLabel("unknown-reason")).toBe(
      "not prepared (unknown-reason). Check dependencies, state, and auto-dispatch settings.",
    );

    expect(
      projectBoardPrepareSkippedMessage({
        prepared: [],
        skipped: [
          skippedTask("TASK-1", "blocked"),
          skippedTask("TASK-2", "already-running"),
          skippedTask("TASK-3", "retry-queued"),
          skippedTask("TASK-4", "already-claimed"),
        ],
      }),
    ).toBe(
      "TASK-1: not prepared: blocked by an unfinished dependency. | TASK-2: already has a running attempt. | TASK-3: already queued for retry.",
    );
    expect(projectBoardPrepareSkippedMessage({ prepared: [preparedTask("TASK-1")], skipped: [] })).toBeUndefined();
  });
});

function preparedTask(identifier: string): OrchestrationPrepareResult["prepared"][number] {
  return {
    taskId: identifier.toLowerCase(),
    identifier,
    title: identifier,
    dispatchRank: 0,
    workspacePath: `/workspace/${identifier.toLowerCase()}`,
    workspaceKey: identifier.toLowerCase(),
    createdNow: true,
    strategy: "git-worktree",
    hooks: [],
  };
}

function skippedTask(identifier: string, reason: string): OrchestrationPrepareResult["skipped"][number] {
  return {
    taskId: identifier.toLowerCase(),
    identifier,
    title: identifier,
    reason,
  };
}

function projectBoard(input: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/project",
    status: "active",
    title: "Project board",
    summary: "Board summary",
    cards: [],
    questions: [],
    proposals: [],
    sources: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardSummary;
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Card",
    description: "Card description",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "implementation",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: {
      unit: [],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceRefs: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardCard;
}
