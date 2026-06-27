import { describe, expect, it } from "vitest";
import type { WorkflowRunStatus } from "../../shared/workflowTypes";
import {
  callableWorkflowTaskFinishState,
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  mapCallableWorkflowTaskRow,
  mapWorkflowModelCallRow,
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
  workflowRunAutomationStatus,
  workflowRunAutomationSummary,
  type CallableWorkflowTaskRow,
  type WorkflowModelCallRow,
  type WorkflowRunEventRow,
  type WorkflowRunRow,
  type WorkflowRunScheduleEventRow,
} from "./projectStoreWorkflowMappers";
import {
  baseCallableWorkflowLaunchCard,
  baseCallableWorkflowTaskRow,
  baseWorkflowModelCallRow,
  baseWorkflowPromptCacheCheckpoint,
  baseWorkflowRunEventRow,
  baseWorkflowRunRow,
} from "./projectStoreWorkflowMappersTestSupport";

describe("project store workflow runtime mappers", () => {
  it("maps workflow run event rows without store state", () => {
    const row: WorkflowRunEventRow = {
      id: "event-1",
      run_id: "run-1",
      artifact_id: "artifact-1",
      seq: 3,
      event_type: "workflow.step.completed",
      created_at: "2026-06-06T19:50:00.000Z",
      message: "Step completed",
      graph_node_id: "node-1",
      graph_edge_id: "edge-1",
      item_key: "item-1",
      data_json: JSON.stringify({ outputPath: "/tmp/workflow/report.md" }),
    };

    expect(mapWorkflowRunEventRow(row)).toEqual({
      id: "event-1",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 3,
      type: "workflow.step.completed",
      createdAt: "2026-06-06T19:50:00.000Z",
      message: "Step completed",
      graphNodeId: "node-1",
      graphEdgeId: "edge-1",
      itemKey: "item-1",
      data: { outputPath: "/tmp/workflow/report.md" },
    });
  });

  it("preserves workflow run event nullable and metadata fallback behavior", () => {
    const mapped = mapWorkflowRunEventRow({
      ...baseWorkflowRunEventRow(),
      message: null,
      graph_node_id: null,
      graph_edge_id: null,
      item_key: null,
      data_json: null,
    });

    expect(mapped.message).toBeUndefined();
    expect(mapped.graphNodeId).toBeUndefined();
    expect(mapped.graphEdgeId).toBeUndefined();
    expect(mapped.itemKey).toBeUndefined();
    expect(mapped.data).toBeUndefined();

    expect(mapWorkflowRunEventRow({ ...baseWorkflowRunEventRow(), data_json: "not-json" }).data).toEqual({});
    expect(mapWorkflowRunEventRow({ ...baseWorkflowRunEventRow(), data_json: "[]" }).data).toEqual([]);
  });

  it("maps workflow run rows without store state", () => {
    const row: WorkflowRunRow = {
      id: "run-1",
      artifact_id: "artifact-1",
      status: "running",
      started_at: "2026-06-06T20:10:00.000Z",
      updated_at: "2026-06-06T20:11:00.000Z",
      completed_at: "2026-06-06T20:12:00.000Z",
      error: "paused for test",
      report_path: "/tmp/workflow/report.json",
      graph_snapshot_id: "graph-1",
      provider_health_json: JSON.stringify({
        status: "ok",
        providerEventCount: 3,
        providerProgressEventCount: 2,
        providerErrorEventCount: 0,
        latestProviderEventType: "provider.progress",
        latestProviderEventAt: "2026-06-06T20:10:30.000Z",
      }),
      retry_metadata_json: JSON.stringify({
        retryEventCount: 1,
        providerRetryEventCount: 1,
        recoveryAttemptCount: 0,
        latestRetryEventType: "provider.retry",
        latestRetryEventAt: "2026-06-06T20:10:45.000Z",
      }),
      recovery_context_json: JSON.stringify({ reason: "transient provider retry" }),
    };

    expect(
      mapWorkflowRunRow(row, {
        scheduledBy: {
          scheduleId: "schedule-1",
          outcome: "started",
          targetKind: "workflow_artifact",
          targetId: "artifact-1",
          targetLabel: "Daily report workflow",
          targetVersionId: "version-1",
          createdTargetVersionId: "version-2",
          grantDecisionSource: "auto",
        },
      }),
    ).toEqual({
      id: "run-1",
      artifactId: "artifact-1",
      status: "running",
      startedAt: "2026-06-06T20:10:00.000Z",
      updatedAt: "2026-06-06T20:11:00.000Z",
      completedAt: "2026-06-06T20:12:00.000Z",
      error: "paused for test",
      reportPath: "/tmp/workflow/report.json",
      scheduledBy: {
        scheduleId: "schedule-1",
        outcome: "started",
        targetKind: "workflow_artifact",
        targetId: "artifact-1",
        targetLabel: "Daily report workflow",
        targetVersionId: "version-1",
        createdTargetVersionId: "version-2",
        grantDecisionSource: "auto",
      },
      graphSnapshotId: "graph-1",
      providerHealth: {
        status: "ok",
        providerEventCount: 3,
        providerProgressEventCount: 2,
        providerErrorEventCount: 0,
        latestProviderEventType: "provider.progress",
        latestProviderEventAt: "2026-06-06T20:10:30.000Z",
      },
      retryMetadata: {
        retryEventCount: 1,
        providerRetryEventCount: 1,
        recoveryAttemptCount: 0,
        latestRetryEventType: "provider.retry",
        latestRetryEventAt: "2026-06-06T20:10:45.000Z",
      },
      recoveryContext: { reason: "transient provider retry" },
    });
  });

  it("preserves workflow run nullable and JSON fallback behavior", () => {
    const mapped = mapWorkflowRunRow({
      ...baseWorkflowRunRow(),
      completed_at: null,
      error: null,
      report_path: null,
      graph_snapshot_id: null,
      provider_health_json: "not-json",
      retry_metadata_json: "not-json",
      recovery_context_json: "not-json",
    });

    expect(mapped.completedAt).toBeUndefined();
    expect(mapped.error).toBeUndefined();
    expect(mapped.reportPath).toBeUndefined();
    expect(mapped.scheduledBy).toBeUndefined();
    expect(mapped.graphSnapshotId).toBeUndefined();
    expect(mapped.providerHealth).toBeUndefined();
    expect(mapped.retryMetadata).toBeUndefined();
    expect(mapped.recoveryContext).toBeUndefined();
    expect(mapWorkflowRunRow({ ...baseWorkflowRunRow(), provider_health_json: "[]" }).providerHealth).toEqual([]);
  });

  it("maps workflow runs into automation run summaries", () => {
    const run = mapWorkflowRunRow({
      ...baseWorkflowRunRow(),
      status: "succeeded",
      completed_at: "2026-06-06T20:12:00.000Z",
    });

    expect(workflowRunAutomationSummary(run)).toEqual({
      id: "run-1",
      status: "succeeded",
      startedAt: "2026-06-06T20:10:00.000Z",
      updatedAt: "2026-06-06T20:11:00.000Z",
      completedAt: "2026-06-06T20:12:00.000Z",
    });
    expect(workflowRunAutomationStatus(run)).toBe("succeeded");
  });

  it("preserves workflow run stale automation status behavior", () => {
    const run = mapWorkflowRunRow({
      ...baseWorkflowRunRow(),
      status: "running",
      updated_at: "2000-01-01T00:00:00.000Z",
    });
    const events = [
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        created_at: "2000-01-01T00:01:00.000Z",
      }),
    ];

    expect(workflowRunAutomationStatus(run, events)).toBe("stale");
    expect(workflowRunAutomationSummary(run, events).status).toBe("stale");
  });

  it("maps workflow run schedule event rows without store state", () => {
    const row: WorkflowRunScheduleEventRow = {
      event_type: "workflow.schedule.skipped",
      data_json: JSON.stringify({
        scheduleId: "schedule-1",
        targetKind: "workflow_artifact",
        targetId: "artifact-1",
        targetLabel: "Daily report workflow",
        targetVersionId: "version-1",
        createdTargetVersionId: "version-2",
        grantDecisionSource: "manual",
      }),
    };

    expect(mapWorkflowRunScheduleSummaryRow(row)).toEqual({
      scheduleId: "schedule-1",
      outcome: "skipped",
      targetKind: "workflow_artifact",
      targetId: "artifact-1",
      targetLabel: "Daily report workflow",
      targetVersionId: "version-1",
      createdTargetVersionId: "version-2",
      grantDecisionSource: "manual",
    });
  });

  it("preserves workflow run schedule summary fallback behavior", () => {
    expect(
      mapWorkflowRunScheduleSummaryRow({
        event_type: "workflow.schedule.started",
        data_json: JSON.stringify({
          scheduleId: "schedule-1",
          targetKind: "not-a-target",
          versionId: "legacy-version-1",
        }),
      }),
    ).toEqual({
      scheduleId: "schedule-1",
      outcome: "started",
      targetKind: undefined,
      targetId: undefined,
      targetLabel: undefined,
      targetVersionId: "legacy-version-1",
      createdTargetVersionId: undefined,
      grantDecisionSource: undefined,
    });

    expect(mapWorkflowRunScheduleSummaryRow(undefined)).toBeUndefined();
    expect(mapWorkflowRunScheduleSummaryRow({ event_type: "workflow.schedule.started", data_json: null })).toBeUndefined();
    expect(mapWorkflowRunScheduleSummaryRow({ event_type: "workflow.schedule.started", data_json: "not-json" })).toBeUndefined();
    expect(
      mapWorkflowRunScheduleSummaryRow({
        event_type: "workflow.schedule.started",
        data_json: JSON.stringify({ scheduleId: "   " }),
      }),
    ).toBeUndefined();
  });

  it("maps callable workflow task rows without store state", () => {
    const row: CallableWorkflowTaskRow = {
      ...baseCallableWorkflowTaskRow(),
      parent_message_id: "message-1",
      workflow_artifact_id: "artifact-1",
      workflow_run_id: "run-1",
      error_message: "waiting for approval",
      pattern_graph_snapshot_json: JSON.stringify({
        schemaVersion: "ambient-subagent-pattern-graph-v1",
        version: 1,
        patternId: "map_reduce",
        label: "Map-Reduce",
        layout: "map_reduce",
        parentThreadId: "thread-1",
        parentMessageId: "message-1",
        workflowTaskId: "task-1",
        workflowRunId: "run-1",
        updatedAt: "2026-06-06T20:15:30.000Z",
        nodes: [],
        edges: [],
      }),
      started_at: "2026-06-06T20:15:00.000Z",
      completed_at: "2026-06-06T20:16:00.000Z",
    };

    expect(mapCallableWorkflowTaskRow(row, { workflowThreadId: "workflow-thread-1" })).toEqual({
      id: "task-1",
      launchId: "launch-1",
      parentThreadId: "thread-1",
      parentRunId: "parent-run-1",
      parentMessageId: "message-1",
      toolCallId: "tool-call-1",
      toolId: "callable-workflow",
      toolName: "run_workflow",
      sourceKind: "workflow",
      title: "Daily report workflow",
      status: "running",
      statusLabel: "Running",
      blocking: true,
      defaultCollapsed: false,
      progressVisible: true,
      tokenCostTracking: true,
      pauseResumeCancel: true,
      cancelHandle: "cancel-1",
      runnerTarget: "workflow-runner",
      runnerDeferredReason: "none",
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "artifact-1",
      workflowRunId: "run-1",
      errorMessage: "waiting for approval",
      patternGraphSnapshot: {
        schemaVersion: "ambient-subagent-pattern-graph-v1",
        version: 1,
        patternId: "map_reduce",
        label: "Map-Reduce",
        layout: "map_reduce",
        parentThreadId: "thread-1",
        parentMessageId: "message-1",
        workflowTaskId: "task-1",
        workflowRunId: "run-1",
        updatedAt: "2026-06-06T20:15:30.000Z",
        nodes: [],
        edges: [],
      },
      executionPlan: {
        toolName: "run_workflow",
        input: { artifactId: "artifact-1" },
      },
      createdAt: "2026-06-06T20:14:00.000Z",
      updatedAt: "2026-06-06T20:15:30.000Z",
      startedAt: "2026-06-06T20:15:00.000Z",
      completedAt: "2026-06-06T20:16:00.000Z",
    });
  });

  it("preserves callable workflow task nullable and JSON fallback behavior", () => {
    const mapped = mapCallableWorkflowTaskRow({
      ...baseCallableWorkflowTaskRow(),
      parent_message_id: null,
      blocking: 0,
      default_collapsed: 1,
      progress_visible: 0,
      token_cost_tracking: 0,
      pause_resume_cancel: 0,
      workflow_artifact_id: null,
      workflow_run_id: null,
      error_message: null,
      pattern_graph_snapshot_json: null,
      execution_plan_json: "not-json",
      started_at: null,
      completed_at: null,
    });

    expect(mapped.parentMessageId).toBeUndefined();
    expect(mapped.blocking).toBe(false);
    expect(mapped.defaultCollapsed).toBe(true);
    expect(mapped.progressVisible).toBe(false);
    expect(mapped.tokenCostTracking).toBe(false);
    expect(mapped.pauseResumeCancel).toBe(false);
    expect(mapped.workflowThreadId).toBeUndefined();
    expect(mapped.workflowArtifactId).toBeUndefined();
    expect(mapped.workflowRunId).toBeUndefined();
    expect(mapped.errorMessage).toBeUndefined();
    expect(mapped.patternGraphSnapshot).toBeUndefined();
    expect(mapped.executionPlan).toBeUndefined();
    expect(mapped.startedAt).toBeUndefined();
    expect(mapped.completedAt).toBeUndefined();
    expect(mapCallableWorkflowTaskRow({ ...baseCallableWorkflowTaskRow(), execution_plan_json: "[]" }).executionPlan).toEqual([]);
  });

  it("hydrates callable workflow launch cards from execution plan JSON", () => {
    const row: CallableWorkflowTaskRow = {
      ...baseCallableWorkflowTaskRow(),
      execution_plan_json: JSON.stringify({
        schemaVersion: "ambient-callable-workflow-execution-plan-v1",
        workflowRunPlan: {
          launchCard: baseCallableWorkflowLaunchCard(),
        },
      }),
    };

    expect(mapCallableWorkflowTaskRow(row).launchCard).toEqual({
      ...baseCallableWorkflowLaunchCard(),
      requirementIds: ["estimated_agents", "token_cost_budget"],
      metricTemplateIds: ["map_reduce-metric"],
      policyWarnings: ["May fan out to as many as 12 child threads."],
    });
  });

  it("maps workflow run statuses into callable workflow task finish state", () => {
    const cases: Array<{
      runStatus: WorkflowRunStatus;
      expected: ReturnType<typeof callableWorkflowTaskFinishState>;
    }> = [
      {
        runStatus: "succeeded",
        expected: {
          status: "succeeded",
          statusLabel: "Succeeded",
          runnerDeferredReason: "workflow_run_succeeded",
          completed: true,
        },
      },
      {
        runStatus: "failed",
        expected: {
          status: "failed",
          statusLabel: "Failed",
          runnerDeferredReason: "workflow_run_failed",
          completed: true,
        },
      },
      {
        runStatus: "canceled",
        expected: {
          status: "canceled",
          statusLabel: "Canceled",
          runnerDeferredReason: "workflow_run_canceled",
          completed: true,
        },
      },
      {
        runStatus: "skipped",
        expected: {
          status: "canceled",
          statusLabel: "Skipped",
          runnerDeferredReason: "workflow_run_skipped",
          completed: true,
        },
      },
      {
        runStatus: "paused",
        expected: {
          status: "paused",
          statusLabel: "Paused",
          runnerDeferredReason: "workflow_run_paused",
          completed: false,
        },
      },
      {
        runStatus: "needs_input",
        expected: {
          status: "paused",
          statusLabel: "Needs input",
          runnerDeferredReason: "workflow_run_needs_input",
          completed: false,
        },
      },
      {
        runStatus: "created",
        expected: {
          status: "running",
          statusLabel: "Running",
          runnerDeferredReason: "workflow_run_started",
          completed: false,
        },
      },
      {
        runStatus: "previewed",
        expected: {
          status: "running",
          statusLabel: "Running",
          runnerDeferredReason: "workflow_run_started",
          completed: false,
        },
      },
      {
        runStatus: "running",
        expected: {
          status: "running",
          statusLabel: "Running",
          runnerDeferredReason: "workflow_run_started",
          completed: false,
        },
      },
    ];

    for (const item of cases) {
      expect(callableWorkflowTaskFinishState(item.runStatus)).toEqual(item.expected);
    }
  });

  it("builds callable workflow task progress snapshots from run telemetry", () => {
    const run = mapWorkflowRunRow({
      ...baseWorkflowRunRow(),
      status: "running",
    });
    const events = [
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-1",
        seq: 1,
        event_type: "step.start",
        graph_node_id: "node-a",
        item_key: null,
        message: null,
        created_at: "2026-06-06T20:11:00.000Z",
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-2",
        seq: 2,
        event_type: "step.end",
        graph_node_id: "node-a",
        item_key: null,
        message: null,
        created_at: "2026-06-06T20:12:00.000Z",
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-3",
        seq: 3,
        event_type: "step.start",
        graph_node_id: null,
        item_key: "item-b",
        message: null,
        created_at: "2026-06-06T20:13:00.000Z",
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-4",
        seq: 4,
        event_type: "step.start",
        graph_node_id: null,
        item_key: null,
        message: null,
        created_at: "2026-06-06T20:14:00.000Z",
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-5",
        seq: 5,
        event_type: "step.end",
        graph_node_id: null,
        item_key: null,
        message: null,
        created_at: "2026-06-06T20:15:00.000Z",
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-6",
        seq: 6,
        event_type: "step.start",
        graph_node_id: null,
        item_key: null,
        message: "Still working",
        created_at: "2026-06-06T20:16:00.000Z",
      }),
    ];
    const modelCalls = [mapWorkflowModelCallRow(baseWorkflowModelCallRow())];

    expect(callableWorkflowTaskProgressSnapshot(run, events, modelCalls)).toEqual({
      workflowRunStatus: "running",
      eventCount: 6,
      modelCallCount: 1,
      completedStepCount: 2,
      activeStepCount: 2,
      lastEventType: "step.start",
      lastEventMessage: "Still working",
      lastEventAt: "2026-06-06T20:16:00.000Z",
    });
  });

  it("builds callable workflow task usage snapshots from workflow events", () => {
    const events = [
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-1",
        data_json: JSON.stringify({ tokenCount: 10.8, costMicros: 50.9 }),
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-2",
        data_json: JSON.stringify({ usage: { tokens: 6.2, costMicros: 20.4 } }),
      }),
      mapWorkflowRunEventRow({
        ...baseWorkflowRunEventRow(),
        id: "event-3",
        data_json: JSON.stringify({ tokens: -1, usage: { tokenCount: "ignored" } }),
      }),
    ];
    const modelCalls = [
      mapWorkflowModelCallRow({
        ...baseWorkflowModelCallRow(),
        cache_checkpoint_json: JSON.stringify({ requestEstimatedTokens: 100.9 }),
      }),
    ];

    expect(callableWorkflowTaskUsageSnapshot(events, modelCalls)).toEqual({
      modelCallCount: 1,
      tokenCount: 16,
      tokenCountEstimated: false,
      costMicros: 70,
      costEstimated: false,
    });
  });

  it("falls back to model call token estimates for callable workflow task usage snapshots", () => {
    const modelCalls = [
      mapWorkflowModelCallRow({
        ...baseWorkflowModelCallRow(),
        id: "call-1",
        cache_checkpoint_json: JSON.stringify({ requestEstimatedTokens: 12.9 }),
      }),
      mapWorkflowModelCallRow({
        ...baseWorkflowModelCallRow(),
        id: "call-2",
        cache_checkpoint_json: JSON.stringify({ requestEstimatedTokens: 2 }),
      }),
      mapWorkflowModelCallRow({
        ...baseWorkflowModelCallRow(),
        id: "call-3",
        cache_checkpoint_json: JSON.stringify({ requestEstimatedTokens: 0 }),
      }),
    ];

    expect(callableWorkflowTaskUsageSnapshot([], modelCalls)).toEqual({
      modelCallCount: 3,
      tokenCount: 14,
      tokenCountEstimated: true,
      costEstimated: false,
    });
    expect(callableWorkflowTaskUsageSnapshot([], [])).toEqual({
      modelCallCount: 0,
      tokenCountEstimated: false,
      costEstimated: false,
    });
  });

  it("maps workflow model call rows without store state", () => {
    const row: WorkflowModelCallRow = {
      id: "call-1",
      run_id: "run-1",
      artifact_id: "artifact-1",
      task: "summarize",
      status: "succeeded",
      input_json: JSON.stringify({ prompt: "Summarize this." }),
      output_json: JSON.stringify({ text: "Summary" }),
      cache_key: "cache-1",
      cache_checkpoint_json: JSON.stringify(baseWorkflowPromptCacheCheckpoint()),
      model: "ambient-test",
      graph_node_id: "node-1",
      graph_edge_id: "edge-1",
      item_key: "item-1",
      validation_error: null,
      started_at: "2026-06-06T19:55:00.000Z",
      completed_at: "2026-06-06T19:55:02.000Z",
      latency_ms: 2000,
    };

    expect(mapWorkflowModelCallRow(row)).toEqual({
      id: "call-1",
      runId: "run-1",
      artifactId: "artifact-1",
      task: "summarize",
      status: "succeeded",
      input: { prompt: "Summarize this." },
      output: { text: "Summary" },
      cacheKey: "cache-1",
      cacheCheckpoint: baseWorkflowPromptCacheCheckpoint(),
      model: "ambient-test",
      graphNodeId: "node-1",
      graphEdgeId: "edge-1",
      itemKey: "item-1",
      validationError: undefined,
      startedAt: "2026-06-06T19:55:00.000Z",
      completedAt: "2026-06-06T19:55:02.000Z",
      latencyMs: 2000,
    });
  });

  it("preserves workflow model call nullable and JSON fallback behavior", () => {
    const mapped = mapWorkflowModelCallRow({
      ...baseWorkflowModelCallRow(),
      run_id: null,
      artifact_id: null,
      input_json: "not-json",
      output_json: null,
      cache_key: null,
      cache_checkpoint_json: "[]",
      model: null,
      graph_node_id: null,
      graph_edge_id: null,
      item_key: null,
      validation_error: null,
    });

    expect(mapped.runId).toBeUndefined();
    expect(mapped.artifactId).toBeUndefined();
    expect(mapped.input).toBeUndefined();
    expect(mapped.output).toBeUndefined();
    expect(mapped.cacheKey).toBeUndefined();
    expect(mapped.cacheCheckpoint).toBeUndefined();
    expect(mapped.model).toBeUndefined();
    expect(mapped.graphNodeId).toBeUndefined();
    expect(mapped.graphEdgeId).toBeUndefined();
    expect(mapped.itemKey).toBeUndefined();
    expect(mapped.validationError).toBeUndefined();
  });
});
