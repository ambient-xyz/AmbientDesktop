import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  automationThreadId,
  mapAutomationScheduleRow,
} from "./automationMappers";
import { mapAutomationScheduleRow as legacyMapAutomationScheduleRow } from "../projectStoreAutomationMappers";
import { ProjectStoreAutomationRepository, type ProjectStoreAutomationRepositoryDeps } from "./automationRepository";

type TestOrchestrationTask = ReturnType<ProjectStoreAutomationRepositoryDeps["getOrchestrationTask"]>;
type TestThreadSummary = ReturnType<ProjectStoreAutomationRepositoryDeps["getThread"]>;
type TestWorkflowRecordingLibraryDescription = ReturnType<ProjectStoreAutomationRepositoryDeps["requireWorkflowRecordingScheduleTarget"]>;

describe("ProjectStoreAutomationRepository", () => {
  let db: Database.Database;
  let task: TestOrchestrationTask;
  let threads: Map<string, TestThreadSummary>;
  let nextThreadId: number;
  let repository: ProjectStoreAutomationRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    task = {
      id: "task-1",
      identifier: "LOCAL-1",
      title: "Summarize expenses",
      state: "ready",
      labels: ["finance"],
      blockedBy: [],
      sourceKind: "local",
      createdAt: "2026-06-06T18:50:00.000Z",
      updatedAt: "2026-06-06T18:55:00.000Z",
    };
    threads = new Map();
    nextThreadId = 1;
    repository = new ProjectStoreAutomationRepository(db, deps());
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy automation mapper import path as re-exports", () => {
    expect(legacyMapAutomationScheduleRow).toBe(mapAutomationScheduleRow);
  });

  it("organizes automation task threads into home and custom folders", () => {
    const home = repository.listAutomationFolders().find((folder) => folder.kind === "home");
    expect(home?.threads[0]).toMatchObject({
      id: automationThreadId("orchestration_task", task.id),
      title: "Summarize expenses",
      status: "ready",
      badges: expect.arrayContaining(["LOCAL-1", "finance"]),
    });

    const custom = repository.createAutomationFolder({ name: "Nightly" }).find((folder) => folder.name === "Nightly");
    expect(custom).toBeTruthy();

    const moved = repository.moveAutomationThread({
      threadId: automationThreadId("orchestration_task", task.id),
      folderId: custom!.id,
    });
    expect(moved.find((folder) => folder.kind === "home")?.threads).toHaveLength(0);
    expect(moved.find((folder) => folder.id === custom!.id)?.threads[0]).toMatchObject({
      sourceId: task.id,
      folderId: custom!.id,
    });
  });

  it("creates, advances, and applies exceptions for local task schedules", () => {
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedules = repository.createAutomationSchedule(
      {
        targetKind: "local_task",
        targetId: task.id,
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
      },
      createdAt,
    );

    expect(schedules[0]).toMatchObject({
      targetKind: "local_task",
      targetId: task.id,
      targetLabel: "LOCAL-1: Summarize expenses",
      preset: "daily",
      timezone: "America/Phoenix",
      enabled: true,
    });
    expect(repository.listDueAutomationSchedules(dueAt).map((schedule) => schedule.id)).toEqual([schedules[0].id]);

    const replacementRunAt = new Date(2026, 0, 1, 11, 0, 0, 0).toISOString();
    const result = repository.rescheduleAutomationScheduleOccurrence(
      {
        scheduleId: schedules[0].id,
        occurrenceAt: schedules[0].nextRunAt,
        replacementRunAt,
        reason: "Avoid overlap.",
      },
      dueAt,
    );
    expect(result.schedules[0]).toMatchObject({ id: schedules[0].id, nextRunAt: replacementRunAt });
    expect(result.exceptions[0]).toMatchObject({
      exceptionKind: "reschedule",
      status: "consumed",
      replacementRunAt,
      reason: "Avoid overlap.",
    });

    const advanced = repository.advanceAutomationSchedule(schedules[0].id, new Date(replacementRunAt));
    expect(advanced.lastRunAt).toBe(replacementRunAt);
  });

  it("creates dedicated threads for workflow playbook schedules through dependencies", () => {
    const schedules = repository.createAutomationSchedule(
      {
        targetKind: "workflow_playbook",
        targetId: "playbook-1",
        preset: "daily",
        timezone: "America/Phoenix",
      },
      new Date(2026, 0, 1, 8, 0, 0, 0),
    );

    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_playbook",
      targetId: "playbook-1",
      targetLabel: "Morning report (current v2)",
      createdTargetVersionId: "2",
      dedicatedThreadId: "thread-1",
    });
    expect(repository.ensureAutomationScheduleDedicatedThread(schedules[0].id)).toMatchObject({
      id: "thread-1",
      title: "Scheduled: Morning report (current)",
    });
  });

  function deps(): ProjectStoreAutomationRepositoryDeps {
    return {
      getWorkspace: () => ({ path: "/workspace/project", name: "project", statePath: "/state", sessionPath: "/session" }),
      listOrchestrationTasks: () => [task],
      listOrchestrationRuns: () => [],
      getOrchestrationTask: (taskId) => {
        if (taskId !== task.id) throw new Error(`Task not found: ${taskId}`);
        return task;
      },
      listWorkflowArtifacts: () => [],
      getWorkflowArtifact: (artifactId) => {
        throw new Error(`Workflow artifact not found: ${artifactId}`);
      },
      listWorkflowRuns: () => [],
      listWorkflowRunEvents: () => [],
      requireWorkflowRecordingScheduleTarget: (id) => {
        if (id !== "playbook-1") throw new Error(`Workflow playbook not found: ${id}`);
        return {
          id,
          title: "Morning report",
          version: 2,
          enabled: true,
          versions: [{ version: 1 }, { version: 2 }],
        } as TestWorkflowRecordingLibraryDescription;
      },
      getLatestApprovedWorkflowVersion: () => undefined,
      getWorkflowVersion: (versionId) => {
        throw new Error(`Workflow version not found: ${versionId}`);
      },
      getWorkflowAgentThreadSummary: (threadId) => {
        throw new Error(`Workflow thread not found: ${threadId}`);
      },
      createThread: (title) => {
        const thread = { id: `thread-${nextThreadId}`, title, workspacePath: "/workspace/project" } as TestThreadSummary;
        nextThreadId += 1;
        threads.set(thread.id, thread);
        return thread;
      },
      getThread: (threadId) => {
        const thread = threads.get(threadId);
        if (!thread) throw new Error(`Thread not found: ${threadId}`);
        return thread;
      },
    };
  }
});
