import { describe, expect, it } from "vitest";
import {
  automationThreadId,
  compareAutomationFolders,
  compareAutomationThreads,
  latestOrchestrationRunForTask,
  latestWorkflowRunForArtifact,
  mapAutomationFolderRow,
  mapAutomationOrchestrationTaskThread,
  mapAutomationScheduleExceptionRow,
  mapAutomationScheduleRow,
  mapAutomationWorkflowArtifactThread,
  parseAutomationThreadId,
  type AutomationFolderRow,
  type AutomationScheduleExceptionRow,
  type AutomationScheduleRow,
} from "./automationMappers";
import type { AutomationFolderSummary, AutomationThreadSummary } from "../../shared/automationTypes";
import type {
  OrchestrationRun,
  OrchestrationTask,
  WorkflowArtifactSummary,
  WorkflowRunEvent,
  WorkflowRunSummary
} from "../../shared/workflowTypes";

describe("project store automation mappers", () => {
  it("maps automation folder rows without store state", () => {
    const row: AutomationFolderRow = {
      id: "folder-1",
      name: "Daily automations",
      folder_kind: "custom",
      created_at: "2026-06-06T18:55:00.000Z",
      updated_at: "2026-06-06T18:56:00.000Z",
    };

    expect(mapAutomationFolderRow(row)).toEqual({
      id: "folder-1",
      name: "Daily automations",
      kind: "custom",
      createdAt: "2026-06-06T18:55:00.000Z",
      updatedAt: "2026-06-06T18:56:00.000Z",
      threads: [],
    });
  });

  it("builds stable automation thread ids", () => {
    expect(automationThreadId("workflow_artifact", "artifact-1")).toBe("workflow_artifact:artifact-1");
    expect(automationThreadId("orchestration_task", "task-1")).toBe("orchestration_task:task-1");
  });

  it("parses automation thread ids for stored thread moves", () => {
    expect(parseAutomationThreadId("workflow_artifact:artifact-1")).toEqual({
      kind: "workflow_artifact",
      id: "artifact-1",
    });
    expect(parseAutomationThreadId("orchestration_task:task-1")).toEqual({
      kind: "orchestration_task",
      id: "task-1",
    });
    expect(parseAutomationThreadId("workflow_artifact:artifact:with:colon")).toEqual({
      kind: "workflow_artifact",
      id: "artifact:with:colon",
    });
  });

  it("rejects invalid automation thread ids", () => {
    expect(() => parseAutomationThreadId("workflow_artifact:")).toThrow("Invalid automation thread id: workflow_artifact:");
    expect(() => parseAutomationThreadId("orchestration_task:")).toThrow("Invalid automation thread id: orchestration_task:");
    expect(() => parseAutomationThreadId("unknown:item-1")).toThrow("Invalid automation thread id: unknown:item-1");
    expect(() => parseAutomationThreadId("workflow_artifact")).toThrow("Invalid automation thread id: workflow_artifact");
  });

  it("sorts automation threads by recency and title", () => {
    const alphaOld = baseAutomationThread({
      id: "workflow_artifact:alpha-old",
      title: "Alpha",
      updatedAt: "2026-06-06T19:00:00.000Z",
    });
    const betaNew = baseAutomationThread({
      id: "workflow_artifact:beta-new",
      title: "Beta",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    const alphaNew = baseAutomationThread({
      id: "workflow_artifact:alpha-new",
      title: "Alpha",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });

    expect([alphaOld, betaNew, alphaNew].sort(compareAutomationThreads).map((thread) => thread.id)).toEqual([
      "workflow_artifact:alpha-new",
      "workflow_artifact:beta-new",
      "workflow_artifact:alpha-old",
    ]);
  });

  it("sorts automation folders with home first, then recency and name", () => {
    const staleHome = baseAutomationFolder({
      id: "automation-home",
      kind: "home",
      name: "Home",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const alphaOld = baseAutomationFolder({
      id: "folder-alpha-old",
      name: "Alpha",
      updatedAt: "2026-06-06T19:00:00.000Z",
    });
    const betaNew = baseAutomationFolder({
      id: "folder-beta-new",
      name: "Beta",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    const alphaNew = baseAutomationFolder({
      id: "folder-alpha-new",
      name: "Alpha",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });

    expect([alphaOld, betaNew, staleHome, alphaNew].sort(compareAutomationFolders).map((folder) => folder.id)).toEqual([
      "automation-home",
      "folder-alpha-new",
      "folder-beta-new",
      "folder-alpha-old",
    ]);
  });

  it("finds the first orchestration run for an automation task", () => {
    const matchingRun = baseOrchestrationRun();
    const otherRun: OrchestrationRun = {
      ...baseOrchestrationRun(),
      id: "run-other",
      taskId: "task-other",
    };

    expect(latestOrchestrationRunForTask([otherRun, matchingRun], "task-1")).toEqual(matchingRun);
    expect(latestOrchestrationRunForTask([otherRun], "task-1")).toBeUndefined();
  });

  it("finds the first workflow run for an automation artifact", () => {
    const matchingRun: WorkflowRunSummary = {
      id: "run-1",
      artifactId: "artifact-1",
      status: "succeeded",
      startedAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:05:00.000Z",
      completedAt: "2026-06-06T19:05:00.000Z",
    };
    const otherRun: WorkflowRunSummary = {
      ...matchingRun,
      id: "run-other",
      artifactId: "artifact-other",
    };

    expect(latestWorkflowRunForArtifact([otherRun, matchingRun], "artifact-1")).toEqual(matchingRun);
    expect(latestWorkflowRunForArtifact([otherRun], "artifact-1")).toBeUndefined();
  });

  it("maps workflow artifacts into automation threads without store state", () => {
    const latestRun: WorkflowRunSummary = {
      id: "run-1",
      artifactId: "artifact-1",
      status: "running",
      startedAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:01:00.000Z",
    };
    const latestRunEvents: WorkflowRunEvent[] = [
      {
        id: "event-1",
        runId: "run-1",
        artifactId: "artifact-1",
        seq: 1,
        type: "workflow.started",
        createdAt: "2000-01-01T00:01:00.000Z",
      },
    ];

    expect(
      mapAutomationWorkflowArtifactThread(baseWorkflowArtifactSummary(), {
        folderId: "automation-home",
        latestRun,
        latestRunEvents,
        projectName: "Ambient",
        projectPath: "/workspace",
      }),
    ).toEqual({
      id: "workflow_artifact:artifact-1",
      folderId: "automation-home",
      kind: "workflow_artifact",
      sourceId: "artifact-1",
      title: "Daily report workflow",
      preview: "Collect status and write the report.",
      status: "stale",
      projectName: "Ambient",
      projectPath: "/workspace",
      createdAt: "2026-06-06T19:40:00.000Z",
      updatedAt: "2000-01-01T00:01:00.000Z",
      latestRun: {
        id: "run-1",
        status: "stale",
        startedAt: "2000-01-01T00:00:00.000Z",
        updatedAt: "2000-01-01T00:01:00.000Z",
        completedAt: undefined,
      },
      badges: ["Run stale", "apply after approval", "1 connector", "1 plugin requirement", "file_read", "browser_open", "slack_send"],
    });
  });

  it("maps orchestration tasks into automation threads without store state", () => {
    expect(
      mapAutomationOrchestrationTaskThread(baseOrchestrationTask(), {
        folderId: "automation-home",
        latestRun: baseOrchestrationRun(),
        projectName: "Ambient",
        projectPath: "/workspace",
      }),
    ).toEqual({
      id: "orchestration_task:task-1",
      folderId: "automation-home",
      kind: "orchestration_task",
      sourceId: "task-1",
      title: "Summarize expenses",
      preview: "Create the monthly expense summary.",
      status: "running",
      projectName: "Ambient",
      projectPath: "/workspace",
      createdAt: "2026-06-06T18:50:00.000Z",
      updatedAt: "2026-06-06T19:10:00.000Z",
      latestRun: {
        id: "run-1",
        status: "running",
        startedAt: "2026-06-06T19:00:00.000Z",
        updatedAt: "2026-06-06T19:10:00.000Z",
        completedAt: undefined,
        workspacePath: "/workspace/task",
        threadId: "thread-1",
        attemptNumber: 2,
      },
      underlyingThreadId: "thread-1",
      badges: ["LOCAL-1", "Priority 3", "Workspace ready", "finance", "monthly"],
    });
  });

  it("preserves orchestration task automation thread fallback behavior", () => {
    const task: OrchestrationTask = {
      ...baseOrchestrationTask(),
      description: undefined,
      state: "needs_info",
      priority: undefined,
      labels: [],
      workspacePath: undefined,
    };

    expect(
      mapAutomationOrchestrationTaskThread(task, {
        folderId: "automation-home",
        projectName: "Ambient",
        projectPath: "/workspace",
      }),
    ).toMatchObject({
      id: "orchestration_task:task-1",
      preview: "Local orchestration task",
      status: "needs_info",
      latestRun: undefined,
      underlyingThreadId: undefined,
      badges: ["LOCAL-1"],
      updatedAt: "2026-06-06T18:55:00.000Z",
    });
  });

  it("preserves workflow artifact automation thread fallback behavior", () => {
    const artifact: WorkflowArtifactSummary = {
      ...baseWorkflowArtifactSummary(),
      status: "draft",
      spec: { goal: "Generate a daily report" },
      manifest: { tools: [], mutationPolicy: "read_only" },
    };

    expect(
      mapAutomationWorkflowArtifactThread(artifact, {
        folderId: "automation-home",
        projectName: "Ambient",
        projectPath: "/workspace",
      }),
    ).toMatchObject({
      id: "workflow_artifact:artifact-1",
      folderId: "automation-home",
      preview: "Generate a daily report",
      status: "draft",
      latestRun: undefined,
      badges: ["read only"],
      updatedAt: "2026-06-06T19:45:00.000Z",
    });
  });

  it("maps automation schedule rows without store state", () => {
    const row: AutomationScheduleRow = {
      id: "schedule-1",
      target_kind: "workflow_version",
      target_id: "version-1",
      target_version: 4,
      created_target_version_id: "version-1",
      dedicated_thread_id: "thread-1",
      preset: "advanced",
      cron_expression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: 1,
      skip_if_active: 1,
      concurrency_policy: "skip_if_active",
      next_run_at: "2026-06-08T15:15:00.000Z",
      last_run_at: "2026-06-01T15:15:00.000Z",
      run_limits_json: "{\"idleTimeoutMs\":2500.9,\"maxRunMs\":null}",
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapAutomationScheduleRow(row, "Weekly workflow")).toEqual({
      id: "schedule-1",
      targetKind: "workflow_version",
      targetId: "version-1",
      targetVersion: 4,
      targetLabel: "Weekly workflow",
      preset: "advanced",
      cronExpression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      concurrencyPolicy: "skip_if_active",
      nextRunAt: "2026-06-08T15:15:00.000Z",
      lastRunAt: "2026-06-01T15:15:00.000Z",
      runLimits: {
        idleTimeoutMs: 2500,
        maxRunMs: null,
      },
      createdTargetVersionId: "version-1",
      dedicatedThreadId: "thread-1",
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("preserves automation schedule optional fields and run-limit fallbacks", () => {
    const mapped = mapAutomationScheduleRow({
      ...baseAutomationScheduleRow(),
      target_version: null,
      created_target_version_id: null,
      dedicated_thread_id: null,
      cron_expression: null,
      enabled: 0,
      skip_if_active: 0,
      next_run_at: null,
      last_run_at: null,
      run_limits_json: "{\"idleTimeoutMs\":0,\"maxRunMs\":\"slow\"}",
    }, "Manual task");

    expect(mapped).toMatchObject({
      targetVersion: undefined,
      createdTargetVersionId: undefined,
      dedicatedThreadId: undefined,
      cronExpression: undefined,
      enabled: false,
      skipIfActive: false,
      nextRunAt: undefined,
      lastRunAt: undefined,
      runLimits: undefined,
    });
    expect(mapAutomationScheduleRow({ ...baseAutomationScheduleRow(), run_limits_json: "not json" }, "Manual task").runLimits).toBeUndefined();
    expect(mapAutomationScheduleRow({ ...baseAutomationScheduleRow(), run_limits_json: "[]" }, "Manual task").runLimits).toBeUndefined();
    expect(mapAutomationScheduleRow({ ...baseAutomationScheduleRow(), run_limits_json: null }, "Manual task").runLimits).toBeUndefined();
  });

  it("maps automation schedule exception rows without store state", () => {
    const row: AutomationScheduleExceptionRow = {
      id: "exception-1",
      schedule_id: "schedule-1",
      occurrence_at: "2026-06-08T15:15:00.000Z",
      exception_kind: "reschedule",
      status: "pending",
      replacement_run_at: "2026-06-09T15:15:00.000Z",
      run_limits_json: "{\"idleTimeoutMs\":1000.4,\"maxRunMs\":5000.7}",
      reason: "Avoid overlap.",
      consumed_at: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
    };

    expect(mapAutomationScheduleExceptionRow(row)).toEqual({
      id: "exception-1",
      scheduleId: "schedule-1",
      occurrenceAt: "2026-06-08T15:15:00.000Z",
      exceptionKind: "reschedule",
      status: "pending",
      replacementRunAt: "2026-06-09T15:15:00.000Z",
      runLimits: {
        idleTimeoutMs: 1000,
        maxRunMs: 5000,
      },
      reason: "Avoid overlap.",
      consumedAt: undefined,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
    });
  });

  it("preserves automation schedule exception optional fields and run-limit fallbacks", () => {
    const mapped = mapAutomationScheduleExceptionRow({
      ...baseAutomationScheduleExceptionRow(),
      replacement_run_at: null,
      run_limits_json: null,
      reason: null,
      consumed_at: null,
    });

    expect(mapped).toMatchObject({
      replacementRunAt: undefined,
      runLimits: undefined,
      reason: undefined,
      consumedAt: undefined,
    });
    expect(mapAutomationScheduleExceptionRow({ ...baseAutomationScheduleExceptionRow(), run_limits_json: "not json" }).runLimits).toBeUndefined();
    expect(mapAutomationScheduleExceptionRow({ ...baseAutomationScheduleExceptionRow(), run_limits_json: "[]" }).runLimits).toBeUndefined();
  });
});

function baseAutomationThread(overrides: Partial<AutomationThreadSummary> = {}): AutomationThreadSummary {
  return {
    id: "workflow_artifact:artifact-1",
    folderId: "automation-home",
    kind: "workflow_artifact",
    sourceId: "artifact-1",
    title: "Daily report workflow",
    preview: "Collect status and write the report.",
    status: "approved",
    projectName: "Ambient",
    projectPath: "/workspace",
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    badges: [],
    ...overrides,
  };
}

function baseAutomationFolder(overrides: Partial<AutomationFolderSummary> = {}): AutomationFolderSummary {
  return {
    id: "folder-1",
    name: "Daily automations",
    kind: "custom",
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    threads: [],
    ...overrides,
  };
}

function baseAutomationScheduleRow(): AutomationScheduleRow {
  return {
    id: "schedule-1",
    target_kind: "local_task",
    target_id: "task-1",
    target_version: null,
    created_target_version_id: null,
    dedicated_thread_id: null,
    preset: "manual",
    cron_expression: null,
    timezone: "UTC",
    enabled: 0,
    skip_if_active: 1,
    concurrency_policy: "skip_if_active",
    next_run_at: null,
    last_run_at: null,
    run_limits_json: null,
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
  };
}

function baseOrchestrationTask(): OrchestrationTask {
  return {
    id: "task-1",
    identifier: "LOCAL-1",
    title: "Summarize expenses",
    description: "Create the monthly expense summary.",
    state: "ready",
    priority: 3,
    labels: ["finance", "monthly"],
    blockedBy: [],
    projectPath: "/workspace",
    branchName: "feature/expense-summary",
    workspacePath: "/workspace/task",
    sourceKind: "project_board",
    sourceUrl: "board-card-1",
    createdAt: "2026-06-06T18:50:00.000Z",
    updatedAt: "2026-06-06T18:55:00.000Z",
  };
}

function baseOrchestrationRun(): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 2,
    status: "running",
    workspacePath: "/workspace/task",
    threadId: "thread-1",
    piSessionFile: "/workspace/task/session.json",
    startedAt: "2026-06-06T19:00:00.000Z",
    lastEventAt: "2026-06-06T19:10:00.000Z",
  };
}

function baseWorkflowArtifactSummary(): WorkflowArtifactSummary {
  return {
    id: "artifact-1",
    workflowThreadId: "workflow-thread-1",
    title: "Daily report workflow",
    status: "approved",
    manifest: {
      tools: ["file_read", "browser_open", "slack_send", "ignored-fourth-tool"],
      mutationPolicy: "apply_after_approval",
      connectors: [{} as NonNullable<WorkflowArtifactSummary["manifest"]["connectors"]>[number]],
      pluginCapabilities: [{} as NonNullable<WorkflowArtifactSummary["manifest"]["pluginCapabilities"]>[number]],
    },
    spec: {
      goal: "Generate a daily report",
      summary: "Collect status and write the report.",
    },
    sourcePath: "/tmp/workflow/main.ts",
    statePath: "/tmp/workflow/state.json",
    createdAt: "2026-06-06T19:40:00.000Z",
    updatedAt: "2026-06-06T19:45:00.000Z",
  };
}

function baseAutomationScheduleExceptionRow(): AutomationScheduleExceptionRow {
  return {
    id: "exception-1",
    schedule_id: "schedule-1",
    occurrence_at: "2026-06-08T15:15:00.000Z",
    exception_kind: "skip",
    status: "pending",
    replacement_run_at: null,
    run_limits_json: null,
    reason: null,
    consumed_at: null,
    created_at: "2026-06-06T19:00:00.000Z",
    updated_at: "2026-06-06T19:01:00.000Z",
  };
}
