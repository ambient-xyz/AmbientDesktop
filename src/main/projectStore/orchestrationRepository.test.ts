import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RESTART_INTERRUPTED_LOCAL_TASK_ERROR } from "../orchestration/orchestrationRecovery";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
} from "./orchestrationMappers";
import {
  mapOrchestrationRunRow as legacyMapOrchestrationRunRow,
  mapOrchestrationTaskRow as legacyMapOrchestrationTaskRow,
} from "./projectStoreOrchestrationMappers";
import { ProjectStoreOrchestrationRepository } from "./orchestrationRepository";

describe("ProjectStoreOrchestrationRepository", () => {
  let db: Database.Database;
  let closedDoneTaskIds: Set<string>;
  let claimBlockedTaskIds: string[];
  let syncProjectBoardCardsForLinkedTaskCalls: number;
  let reviewedRunIds: string[];
  let repository: ProjectStoreOrchestrationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    closedDoneTaskIds = new Set();
    claimBlockedTaskIds = [];
    syncProjectBoardCardsForLinkedTaskCalls = 0;
    reviewedRunIds = [];
    repository = new ProjectStoreOrchestrationRepository(db, {
      defaultProjectPath: "/workspace/project",
      projectBoardTaskHasClosedDoneCard: (taskId) => closedDoneTaskIds.has(taskId),
      projectBoardClaimBlockedTaskIds: () => claimBlockedTaskIds,
      syncProjectBoardCardsForLinkedTasks: () => {
        syncProjectBoardCardsForLinkedTaskCalls += 1;
      },
      reviewProjectBoardCardProofForRun: (run) => {
        reviewedRunIds.push(run.id);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy orchestration mapper import path as re-exports", () => {
    expect(legacyMapOrchestrationTaskRow).toBe(mapOrchestrationTaskRow);
    expect(legacyMapOrchestrationRunRow).toBe(mapOrchestrationRunRow);
  });

  it("creates and updates tasks while preserving ordering and project defaults", () => {
    const later = repository.createOrchestrationTask({
      title: "Later task",
      description: "Ship later.",
      state: "Todo",
      labels: [" UI ", "ui", "backend"],
      blockedBy: [" LOCAL-0 ", ""],
    });
    const urgent = repository.createOrchestrationTask({
      title: "Urgent task",
      priority: 1,
      projectPath: "/custom/project",
    });

    expect(later).toMatchObject({
      identifier: "LOCAL-1",
      description: "Ship later.",
      state: "todo",
      labels: ["ui", "backend"],
      blockedBy: ["LOCAL-0"],
      projectPath: "/workspace/project",
    });
    expect(urgent).toMatchObject({ identifier: "LOCAL-2", priority: 1, projectPath: "/custom/project" });
    expect(repository.listOrchestrationTasks().map((task) => task.id)).toEqual([urgent.id, later.id]);

    const updated = repository.updateOrchestrationTask({
      id: later.id,
      title: "Later task updated",
      state: "In Progress",
      priority: null,
      blockedBy: [],
    });
    expect(updated).toMatchObject({ title: "Later task updated", state: "in_progress", priority: undefined, blockedBy: [] });
    expect(syncProjectBoardCardsForLinkedTaskCalls).toBe(1);

    closedDoneTaskIds.add(later.id);
    expect(repository.updateOrchestrationTask({ id: later.id, state: "todo" }).state).toBe("done");
  });

  it("records runs, attempts, scheduler state, latest run lookups, and finish review callbacks", () => {
    const task = repository.createOrchestrationTask({ title: "Run task", priority: 1 });
    const first = repository.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: "/workspace/run-1",
      proofOfWork: { summary: "Prepared" },
    });
    const second = repository.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: "/workspace/run-2",
    });
    const running = repository.updateOrchestrationRun({
      id: second.id,
      status: "running",
      threadId: "thread-1",
      piSessionFile: "pi-session.json",
    });

    expect(first.attemptNumber).toBe(0);
    expect(second.attemptNumber).toBe(1);
    expect(running).toMatchObject({ status: "running", threadId: "thread-1", piSessionFile: "pi-session.json" });
    expect(repository.getOrchestrationSchedulerRuntimeState()).toMatchObject({
      claimedTaskIds: [task.id],
      runningTaskIds: [task.id],
      retryQueuedTaskIds: [],
    });
    expect(repository.latestOrchestrationRunForTask(task.id)?.id).toBe(first.id);
    expect(repository.latestDependencyArtifactRunForTask(task.id)).toBeUndefined();

    const completed = repository.updateOrchestrationRun({
      id: first.id,
      status: "completed",
      finish: true,
      proofOfWork: { summary: "Done" },
    });
    expect(completed.finishedAt).toEqual(expect.any(String));
    expect(repository.latestDependencyArtifactRunForTask(task.id)?.id).toBe(first.id);
    expect(reviewedRunIds).toEqual([first.id]);

    claimBlockedTaskIds = ["claim-blocked-task"];
    expect(repository.getOrchestrationSchedulerRuntimeState().claimedTaskIds).toContain("claim-blocked-task");
  });

  it("preserves restart-interrupted recovery metadata and closed-card run behavior", () => {
    const task = repository.createOrchestrationTask({ title: "Recover task" });
    const run = repository.recordPreparedOrchestrationRun({
      taskId: task.id,
      workspacePath: "/workspace/recover",
    });
    const stalled = repository.updateOrchestrationRun({
      id: run.id,
      status: "stalled",
      error: RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
      proofOfWork: { resumeAvailable: true, recovery: { type: "desktop-restart" } },
    });

    const recovered = repository.recordRestartInterruptedAutoContinueAttempt(stalled.id, new Date("2026-06-06T20:00:00.000Z"));
    expect(recovered.proofOfWork).toMatchObject({
      resumeAvailable: true,
      recovery: {
        type: "desktop-restart",
        autoContinueAttempts: 1,
        lastAutoContinueAt: "2026-06-06T20:00:00.000Z",
      },
    });

    closedDoneTaskIds.add(task.id);
    const ignored = repository.updateOrchestrationRun({ id: stalled.id, status: "completed", finish: true });
    expect(ignored.status).toBe("stalled");
    expect(reviewedRunIds).toEqual([]);
  });
});
