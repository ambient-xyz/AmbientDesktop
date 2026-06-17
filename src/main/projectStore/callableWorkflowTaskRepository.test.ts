import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CallableWorkflowQueuedTaskDraft } from "../callable-workflow/callableWorkflowTaskQueue";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import { mapCallableWorkflowTaskRow } from "./callableWorkflowTaskMappers";
import { mapCallableWorkflowTaskRow as legacyMapCallableWorkflowTaskRow } from "./projectStoreWorkflowMappers";
import { ProjectStoreCallableWorkflowTaskRepository } from "./callableWorkflowTaskRepository";

describe("ProjectStoreCallableWorkflowTaskRepository", () => {
  let db: Database.Database;
  let hydratedTaskIds: string[];
  let repository: ProjectStoreCallableWorkflowTaskRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    seedParentRun(db);
    hydratedTaskIds = [];
    repository = new ProjectStoreCallableWorkflowTaskRepository(db, {
      workflowThreadIdForArtifact: (artifactId) => artifactId === "artifact-1" ? "workflow-thread-1" : undefined,
      hydrateRunTelemetry: (task) => {
        hydratedTaskIds.push(task.id);
        return task;
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy callable workflow mapper import path as re-exports", () => {
    expect(legacyMapCallableWorkflowTaskRow).toBe(mapCallableWorkflowTaskRow);
  });

  it("creates, lists, updates, and finds callable workflow task rows", () => {
    const task = repository.createQueuedTask({
      draft: queuedDraft(),
      parentMessageId: "message-1",
      patternGraphSnapshot: patternGraphSnapshot("created"),
      now: "2026-06-06T18:00:00.000Z",
    });

    expect(task).toMatchObject({
      id: "launch-1",
      launchId: "launch-1",
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      parentMessageId: "message-1",
      status: "queued",
      runnerDeferredReason: "callable_workflow_runner_not_connected",
      patternGraphSnapshot: expect.objectContaining({ updatedAt: "created" }),
      launchCard: expect.objectContaining({
        schemaVersion: "ambient-callable-workflow-launch-card-v1",
        title: "Map Reduce",
      }),
    });
    expect(repository.findCallableWorkflowTaskByLaunchId("launch-1")?.id).toBe(task.id);
    expect(repository.listCallableWorkflowTasksForParentRun("run-1").map((item) => item.id)).toEqual([task.id]);
    expect(repository.listCallableWorkflowTasksForParentThread("thread-1").map((item) => item.id)).toEqual([task.id]);
    expect(repository.listCallableWorkflowTasks().map((item) => item.id)).toEqual([task.id]);

    const updated = repository.updateCallableWorkflowTaskRow({
      id: task.id,
      status: "running",
      statusLabel: "Running",
      runnerDeferredReason: "workflow_run_started",
      workflowArtifactId: "artifact-1",
      workflowRunId: "workflow-run-1",
      updatedAt: "2026-06-06T18:05:00.000Z",
      startedAt: "2026-06-06T18:05:00.000Z",
    });
    expect(updated).toMatchObject({
      id: task.id,
      status: "running",
      workflowArtifactId: "artifact-1",
      workflowThreadId: "workflow-thread-1",
      workflowRunId: "workflow-run-1",
      startedAt: "2026-06-06T18:05:00.000Z",
    });
    expect(hydratedTaskIds).toContain(task.id);
  });

  it("updates pattern graph snapshots without changing task identity", () => {
    const task = repository.createQueuedTask({
      draft: queuedDraft(),
      parentMessageId: undefined,
      now: "2026-06-06T18:00:00.000Z",
    });

    const bound = repository.bindPatternGraphSnapshot({
      id: task.id,
      patternGraphSnapshot: patternGraphSnapshot("bound"),
      updatedAt: "2026-06-06T18:06:00.000Z",
    });

    expect(bound).toMatchObject({
      id: task.id,
      parentMessageId: undefined,
      updatedAt: "2026-06-06T18:06:00.000Z",
      patternGraphSnapshot: expect.objectContaining({ updatedAt: "bound" }),
    });
  });
});

function seedParentRun(db: Database.Database): void {
  db.prepare(
    `INSERT INTO threads
     (id, title, workspace_path, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("thread-1", "Thread", "/tmp/ambient-project", "chat", "2026-06-06T17:55:00.000Z", "2026-06-06T17:55:00.000Z");
  db.prepare(
    `INSERT INTO messages
     (id, thread_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("message-1", "thread-1", "assistant", "", "2026-06-06T17:56:00.000Z");
  db.prepare(
    `INSERT INTO runs
     (id, thread_id, assistant_message_id, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("run-1", "thread-1", "message-1", "running", "2026-06-06T17:57:00.000Z", "2026-06-06T17:57:00.000Z");
}

function queuedDraft(): CallableWorkflowQueuedTaskDraft {
  return {
    id: "launch-1",
    launchId: "launch-1",
    parentThreadId: "thread-1",
    parentRunId: "run-1",
    parentMessageId: "message-1",
    toolCallId: "tool-call-1",
    toolId: "symphony:map_reduce",
    toolName: "ambient_workflow_symphony_map_reduce",
    sourceKind: "symphony_recipe",
    title: "Map Reduce",
    status: "queued",
    statusLabel: "Queued",
    blocking: true,
    defaultCollapsed: true,
    progressVisible: true,
    tokenCostTracking: true,
    pauseResumeCancel: true,
    cancelHandle: "cancel:launch-1",
    runnerTarget: "workflowCompilerService",
    runnerDeferredReason: "callable_workflow_runner_not_connected",
    launchCard: launchCard(),
    executionPlan: {
      launchId: "launch-1",
      workflowRunPlan: {
        launchCard: launchCard(),
      },
      visibleTask: {
        launchCard: launchCard(),
      },
    },
  } as CallableWorkflowQueuedTaskDraft;
}

function launchCard() {
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: "Map Reduce",
    sourceKind: "symphony_recipe",
    riskLevel: "high",
    estimatedAgents: 4,
    maxFanout: 2,
    maxDepth: 2,
    estimatedTokenBudget: 12000,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: 1024,
    localMemoryEstimated: true,
    costEstimateLabel: "medium",
    toolMutationScope: "workspace",
    checkpointResume: "supported",
    approvalFailureHandling: "pause",
    defaultCollapsed: true,
    blocking: true,
    smallSliceRecommended: false,
    requireConfirmation: true,
    requirementIds: ["req-1"],
    metricTemplateIds: ["metric-1"],
    policyWarnings: ["review required"],
  };
}

function patternGraphSnapshot(updatedAt: string): NonNullable<ReturnType<ProjectStoreCallableWorkflowTaskRepository["getCallableWorkflowTask"]>["patternGraphSnapshot"]> {
  return {
    schemaVersion: "ambient-subagent-pattern-graph-v1",
    version: 1,
    patternId: "map_reduce",
    label: "Map Reduce",
    layout: "map_reduce",
    parentThreadId: "thread-1",
    parentMessageId: "message-1",
    workflowTaskId: "launch-1",
    workflowRunId: "workflow-run-1",
    updatedAt,
    nodes: [],
    edges: [],
  };
}
