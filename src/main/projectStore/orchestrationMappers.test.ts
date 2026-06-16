import { describe, expect, it } from "vitest";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
  type OrchestrationRunRow,
  type OrchestrationTaskRow,
} from "./orchestrationMappers";

describe("project store orchestration mappers", () => {
  it("maps orchestration task rows without store state", () => {
    const row: OrchestrationTaskRow = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Build the thing",
      description: "Implement the scoped task.",
      state: "ready",
      priority: 2,
      labels_json: "[\"project-board\",7,\"proof\"]",
      blocked_by_json: "[\"LOCAL-0\",false,\"LOCAL-00\"]",
      project_path: "/tmp/project",
      branch_name: "codex/task",
      workspace_path: "/tmp/worktree",
      source_kind: "project_board_card",
      source_url: "project-board-card:card-1",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapOrchestrationTaskRow(row)).toEqual({
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Build the thing",
      description: "Implement the scoped task.",
      state: "ready",
      priority: 2,
      labels: ["project-board", "proof"],
      blockedBy: ["LOCAL-0", "LOCAL-00"],
      projectPath: "/tmp/project",
      branchName: "codex/task",
      workspacePath: "/tmp/worktree",
      sourceKind: "project_board_card",
      sourceUrl: "project-board-card:card-1",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("preserves orchestration task optional fields and list fallbacks", () => {
    const mapped = mapOrchestrationTaskRow({
      ...baseOrchestrationTaskRow(),
      description: null,
      priority: null,
      labels_json: "not json",
      blocked_by_json: "{}",
      project_path: null,
      branch_name: null,
      workspace_path: null,
      source_url: null,
    });

    expect(mapped).toMatchObject({
      description: undefined,
      priority: undefined,
      labels: [],
      blockedBy: [],
      projectPath: undefined,
      branchName: undefined,
      workspacePath: undefined,
      sourceUrl: undefined,
    });
  });

  it("maps orchestration run rows without store state", () => {
    const row: OrchestrationRunRow = {
      id: "run-1",
      task_id: "task-1",
      attempt_number: 3,
      status: "completed",
      workspace_path: "/tmp/worktree",
      thread_id: "thread-1",
      pi_session_file: "/tmp/pi-session.json",
      started_at: "2026-06-06T19:00:00.000Z",
      finished_at: "2026-06-06T19:05:00.000Z",
      last_event_at: "2026-06-06T19:04:00.000Z",
      error: null,
      proof_of_work_json: "{\"summary\":\"Done\",\"files\":[\"src/app.ts\"]}",
    };

    expect(mapOrchestrationRunRow(row)).toEqual({
      id: "run-1",
      taskId: "task-1",
      attemptNumber: 3,
      status: "completed",
      workspacePath: "/tmp/worktree",
      threadId: "thread-1",
      piSessionFile: "/tmp/pi-session.json",
      startedAt: "2026-06-06T19:00:00.000Z",
      finishedAt: "2026-06-06T19:05:00.000Z",
      lastEventAt: "2026-06-06T19:04:00.000Z",
      error: undefined,
      proofOfWork: {
        summary: "Done",
        files: ["src/app.ts"],
      },
    });
  });

  it("preserves orchestration run optional fields and proof metadata fallbacks", () => {
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), thread_id: null }).threadId).toBeUndefined();
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), pi_session_file: null }).piSessionFile).toBeUndefined();
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), finished_at: null }).finishedAt).toBeUndefined();
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), last_event_at: null }).lastEventAt).toBeUndefined();
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), error: "failed" }).error).toBe("failed");
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), proof_of_work_json: null }).proofOfWork).toBeUndefined();
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), proof_of_work_json: "not json" }).proofOfWork).toEqual({});
    expect(mapOrchestrationRunRow({ ...baseOrchestrationRunRow(), proof_of_work_json: "[]" }).proofOfWork).toEqual([]);
  });
});

function baseOrchestrationTaskRow(): OrchestrationTaskRow {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Build the thing",
    description: "Implement the scoped task.",
    state: "ready",
    priority: 2,
    labels_json: "[\"project-board\"]",
    blocked_by_json: "[\"LOCAL-0\"]",
    project_path: "/tmp/project",
    branch_name: "codex/task",
    workspace_path: "/tmp/worktree",
    source_kind: "project_board_card",
    source_url: "project-board-card:card-1",
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
  };
}

function baseOrchestrationRunRow(): OrchestrationRunRow {
  return {
    id: "run-1",
    task_id: "task-1",
    attempt_number: 1,
    status: "running",
    workspace_path: "/tmp/worktree",
    thread_id: "thread-1",
    pi_session_file: "/tmp/pi-session.json",
    started_at: "2026-06-06T19:00:00.000Z",
    finished_at: "2026-06-06T19:05:00.000Z",
    last_event_at: "2026-06-06T19:04:00.000Z",
    error: null,
    proof_of_work_json: "{\"summary\":\"Done\"}",
  };
}
