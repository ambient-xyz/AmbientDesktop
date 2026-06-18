import { describe, expect, it } from "vitest";
import {
  callableWorkflowTaskFinishState,
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  compareWorkflowAgentFolders,
  compareWorkflowAgentThreads,
  mapCallableWorkflowTaskRow,
  mapWorkflowAgentThreadRow,
  mapWorkflowAgentFolderRow,
  mapWorkflowArtifactRow,
  mapWorkflowDiscoveryQuestionRow,
  mapWorkflowExplorationTraceRow,
  mapWorkflowGraphSnapshotRow,
  mapWorkflowModelCallRow,
  mapWorkflowRevisionRow,
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
  mapWorkflowVersionRow,
  workflowRunAutomationStatus,
  workflowRunAutomationSummary,
  type CallableWorkflowTaskRow,
  type WorkflowAgentFolderRow,
  type WorkflowAgentThreadRow,
  type WorkflowArtifactRow,
  type WorkflowDiscoveryQuestionRow,
  type WorkflowExplorationTraceRow,
  type WorkflowGraphSnapshotRow,
  type WorkflowModelCallRow,
  type WorkflowRevisionRow,
  type WorkflowRunEventRow,
  type WorkflowRunRow,
  type WorkflowRunScheduleEventRow,
  type WorkflowVersionRow,
} from "./projectStoreWorkflowMappers";
import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowRunStatus } from "../../shared/workflowTypes";

describe("project store workflow mappers", () => {
  it("maps workflow agent folder rows without store state", () => {
    const row: WorkflowAgentFolderRow = {
      id: "folder-1",
      name: "Draft workflows",
      folder_kind: "custom",
      created_at: "2026-06-06T18:50:00.000Z",
      updated_at: "2026-06-06T18:51:00.000Z",
    };

    expect(mapWorkflowAgentFolderRow(row)).toEqual({
      id: "folder-1",
      name: "Draft workflows",
      kind: "custom",
      createdAt: "2026-06-06T18:50:00.000Z",
      updatedAt: "2026-06-06T18:51:00.000Z",
      threads: [],
    });
  });

  it("maps workflow agent thread rows without store state", () => {
    const artifact = mapWorkflowArtifactRow({
      ...baseWorkflowArtifactRow(),
      status: "approved",
      manifest_json: JSON.stringify({
        tools: ["file_read", "browser_open", "slack_send", "ignored-fourth-tool"],
        mutationPolicy: "staged_until_approved",
        connectors: ["google-drive"],
      }),
      spec_json: JSON.stringify({
        goal: "Generate a daily report",
        summary: "Collect status and write the report.",
      }),
    });
    const latestRun = mapWorkflowRunRow({
      ...baseWorkflowRunRow(),
      status: "previewed",
      updated_at: "2026-06-06T20:22:00.000Z",
      completed_at: "2026-06-06T20:23:00.000Z",
    });
    const latestVersion = mapWorkflowVersionRow(baseWorkflowVersionRow());
    const graph = mapWorkflowGraphSnapshotRow(baseWorkflowGraphSnapshotRow());
    const question = mapWorkflowDiscoveryQuestionRow(baseWorkflowDiscoveryQuestionRow());

    expect(
      mapWorkflowAgentThreadRow(
        {
          ...baseWorkflowAgentThreadRow(),
          project_path: "",
          active_artifact_id: artifact.id,
          active_graph_snapshot_id: "stale-graph",
        },
        {
          artifact,
          latestRun,
          latestVersion,
          graph,
          discoveryQuestions: [question],
          projectName: "Ambient",
          fallbackProjectPath: "/workspace",
        },
      ),
    ).toEqual({
      id: "workflow-thread-1",
      folderId: "folder-1",
      chatThreadId: "chat-thread-1",
      projectName: "Ambient",
      projectPath: "/workspace",
      title: "Daily report workflow",
      phase: "approved",
      initialRequest: "Build a daily report workflow",
      preview: "Collect status and write the report.",
      status: "previewed",
      traceMode: "production",
      activeArtifactId: "artifact-1",
      activeGraphSnapshotId: "graph-1",
      latestVersion,
      latestRun: {
        id: "run-1",
        status: "previewed",
        startedAt: "2026-06-06T20:10:00.000Z",
        updatedAt: "2026-06-06T20:22:00.000Z",
        completedAt: "2026-06-06T20:23:00.000Z",
      },
      graph,
      discoveryQuestions: [question],
      badges: ["Approved", "Production traces", "staged until approved", "1 connector", "file_read", "browser_open", "slack_send"],
      createdAt: "2026-06-06T19:10:00.000Z",
      updatedAt: "2026-06-06T20:22:00.000Z",
    });
  });

  it("preserves workflow agent thread fallback behavior", () => {
    expect(
      mapWorkflowAgentThreadRow(
        {
          ...baseWorkflowAgentThreadRow(),
          chat_thread_id: null,
          project_path: "/project",
          phase: "revision",
          initial_request: "",
          active_artifact_id: null,
          active_graph_snapshot_id: "graph-row",
          trace_mode: "debug",
        },
        {
          projectName: "Project",
          fallbackProjectPath: "/fallback",
        },
      ),
    ).toEqual({
      id: "workflow-thread-1",
      folderId: "folder-1",
      chatThreadId: undefined,
      projectName: "Project",
      projectPath: "/project",
      title: "Daily report workflow",
      phase: "revision",
      initialRequest: "",
      preview: "Workflow Agent thread",
      status: "revision",
      traceMode: "debug",
      activeArtifactId: undefined,
      activeGraphSnapshotId: "graph-row",
      latestVersion: undefined,
      latestRun: undefined,
      graph: undefined,
      discoveryQuestions: [],
      badges: ["Revision", "Debug traces"],
      createdAt: "2026-06-06T19:10:00.000Z",
      updatedAt: "2026-06-06T19:15:00.000Z",
    });
  });

  it("sorts workflow agent threads by recency, title, and id", () => {
    const alphaOld = baseWorkflowAgentThreadSummary({
      id: "workflow-thread-alpha-old",
      title: "Alpha",
      updatedAt: "2026-06-06T19:00:00.000Z",
    });
    const betaNew = baseWorkflowAgentThreadSummary({
      id: "workflow-thread-beta-new",
      title: "Beta",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    const alphaNewB = baseWorkflowAgentThreadSummary({
      id: "workflow-thread-alpha-b",
      title: "Alpha",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    const alphaNewA = baseWorkflowAgentThreadSummary({
      id: "workflow-thread-alpha-a",
      title: "Alpha",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });

    expect([alphaOld, betaNew, alphaNewB, alphaNewA].sort(compareWorkflowAgentThreads).map((thread) => thread.id)).toEqual([
      "workflow-thread-alpha-a",
      "workflow-thread-alpha-b",
      "workflow-thread-beta-new",
      "workflow-thread-alpha-old",
    ]);
  });

  it("sorts workflow agent folders with home first, then recency and name", () => {
    const staleHome = baseWorkflowAgentFolderSummary({
      id: "workflow-agent-home",
      kind: "home",
      name: "Home",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const alphaOld = baseWorkflowAgentFolderSummary({
      id: "folder-alpha-old",
      name: "Alpha",
      updatedAt: "2026-06-06T19:00:00.000Z",
    });
    const betaNew = baseWorkflowAgentFolderSummary({
      id: "folder-beta-new",
      name: "Beta",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });
    const alphaNew = baseWorkflowAgentFolderSummary({
      id: "folder-alpha-new",
      name: "Alpha",
      updatedAt: "2026-06-06T20:00:00.000Z",
    });

    expect([alphaOld, betaNew, staleHome, alphaNew].sort(compareWorkflowAgentFolders).map((folder) => folder.id)).toEqual([
      "workflow-agent-home",
      "folder-alpha-new",
      "folder-beta-new",
      "folder-alpha-old",
    ]);
  });

  it("maps workflow artifact rows without store state", () => {
    const row: WorkflowArtifactRow = {
      id: "artifact-1",
      workflow_thread_id: "workflow-thread-1",
      title: "Daily report workflow",
      status: "ready_for_preview",
      manifest_json: JSON.stringify({
        tools: ["file_read", "file_write"],
        mutationPolicy: "staged_until_approved",
        maxToolCalls: 12,
      }),
      spec_json: JSON.stringify({
        goal: "Generate a daily report",
        summary: "Collects status and writes the report.",
        successCriteria: ["Report is written"],
      }),
      source_path: "/tmp/workflow/main.ts",
      state_path: "/tmp/workflow/state.json",
      created_at: "2026-06-06T19:40:00.000Z",
      updated_at: "2026-06-06T19:45:00.000Z",
    };

    expect(mapWorkflowArtifactRow(row)).toEqual({
      id: "artifact-1",
      workflowThreadId: "workflow-thread-1",
      title: "Daily report workflow",
      status: "ready_for_preview",
      manifest: {
        tools: ["file_read", "file_write"],
        mutationPolicy: "staged_until_approved",
        maxToolCalls: 12,
      },
      spec: {
        goal: "Generate a daily report",
        summary: "Collects status and writes the report.",
        successCriteria: ["Report is written"],
      },
      sourcePath: "/tmp/workflow/main.ts",
      statePath: "/tmp/workflow/state.json",
      createdAt: "2026-06-06T19:40:00.000Z",
      updatedAt: "2026-06-06T19:45:00.000Z",
    });
  });

  it("preserves workflow artifact nullable and JSON fallback behavior", () => {
    const mapped = mapWorkflowArtifactRow({
      ...baseWorkflowArtifactRow(),
      workflow_thread_id: null,
      manifest_json: "[]",
      spec_json: "not-json",
    });

    expect(mapped.workflowThreadId).toBeUndefined();
    expect(mapped.manifest).toEqual({ tools: [], mutationPolicy: "read_only" });
    expect(mapped.spec).toEqual({ goal: "" });
  });

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

  it("maps workflow revision rows without store state", () => {
    const row: WorkflowRevisionRow = {
      id: "revision-1",
      workflow_thread_id: "workflow-thread-1",
      base_version_id: "version-1",
      base_artifact_id: "artifact-1",
      requested_change: "Add retry handling",
      proposed_graph_snapshot_id: "graph-2",
      graph_diff_json: JSON.stringify({ addedNodes: ["retry"], removedEdges: [] }),
      source_diff: "diff --git a/workflow.ts b/workflow.ts",
      revision_status: "proposed",
      created_at: "2026-06-06T20:05:00.000Z",
      updated_at: "2026-06-06T20:06:00.000Z",
    };

    expect(
      mapWorkflowRevisionRow(row, {
        proposedVersion: {
          id: "version-2",
          artifactId: "artifact-2",
        },
      }),
    ).toEqual({
      id: "revision-1",
      workflowThreadId: "workflow-thread-1",
      baseVersionId: "version-1",
      baseArtifactId: "artifact-1",
      proposedVersionId: "version-2",
      proposedArtifactId: "artifact-2",
      requestedChange: "Add retry handling",
      proposedGraphSnapshotId: "graph-2",
      graphDiff: { addedNodes: ["retry"], removedEdges: [] },
      sourceDiff: "diff --git a/workflow.ts b/workflow.ts",
      status: "proposed",
      createdAt: "2026-06-06T20:05:00.000Z",
      updatedAt: "2026-06-06T20:06:00.000Z",
    });
  });

  it("preserves workflow revision nullable and JSON fallback behavior", () => {
    expect(
      mapWorkflowRevisionRow({
        ...baseWorkflowRevisionRow(),
        base_version_id: null,
        base_artifact_id: null,
        proposed_graph_snapshot_id: null,
        graph_diff_json: "not-json",
        source_diff: null,
      }),
    ).toEqual({
      id: "revision-1",
      workflowThreadId: "workflow-thread-1",
      baseVersionId: undefined,
      baseArtifactId: undefined,
      proposedVersionId: undefined,
      proposedArtifactId: undefined,
      requestedChange: "Add retry handling",
      proposedGraphSnapshotId: undefined,
      graphDiff: undefined,
      sourceDiff: undefined,
      status: "draft",
      createdAt: "2026-06-06T20:05:00.000Z",
      updatedAt: "2026-06-06T20:06:00.000Z",
    });
  });

  it("maps workflow discovery question rows without store state", () => {
    const row: WorkflowDiscoveryQuestionRow = {
      id: "question-1",
      workflow_thread_id: "workflow-thread-1",
      revision_id: "revision-1",
      question_order: 1,
      category: "data_sources",
      context: "Need a source",
      question: "Which source should the workflow use?",
      choices_json: JSON.stringify([
        {
          id: "repo",
          label: "Repository",
          description: "Use checked-in files",
          recommended: true,
        },
      ]),
      allow_freeform: 1,
      answer_json: JSON.stringify({ choiceId: "repo", answeredAt: "2026-06-06T20:00:00.000Z" }),
      graph_impact: "Adds a data source node",
      provider: "ambient",
      provider_model: "ambient-test",
      policy_context_summary: "Read-only source",
      capability_search_json: JSON.stringify({ results: [] }),
      capability_descriptions_json: JSON.stringify([{ id: "cap-1", title: "Repository read" }]),
      blocked_reasons_json: JSON.stringify(["awaiting user"]),
      access_requests_json: JSON.stringify([{ id: "access-1", status: "pending" }]),
      activity_events_json: JSON.stringify([{ id: "activity-1", kind: "scan", status: "completed", label: "Scanned", createdAt: "2026-06-06T20:00:00.000Z" }]),
      cache_checkpoint_json: JSON.stringify(baseWorkflowPromptCacheCheckpoint()),
      graph_patch_json: JSON.stringify({ summary: "Add source", upsertNodes: [], upsertEdges: [] }),
      created_at: "2026-06-06T19:59:00.000Z",
      answered_at: "2026-06-06T20:00:00.000Z",
    };

    expect(mapWorkflowDiscoveryQuestionRow(row)).toEqual({
      id: "question-1",
      workflowThreadId: "workflow-thread-1",
      revisionId: "revision-1",
      category: "data_sources",
      context: "Need a source",
      question: "Which source should the workflow use?",
      choices: [
        {
          id: "repo",
          label: "Repository",
          description: "Use checked-in files",
          recommended: true,
        },
      ],
      allowFreeform: true,
      answer: { choiceId: "repo", answeredAt: "2026-06-06T20:00:00.000Z" },
      graphImpact: "Adds a data source node",
      provider: "ambient",
      providerModel: "ambient-test",
      policyContextSummary: "Read-only source",
      capabilitySearch: { results: [] },
      capabilityDescriptions: [{ id: "cap-1", title: "Repository read" }],
      blockedReasons: ["awaiting user"],
      accessRequests: [{ id: "access-1", status: "pending" }],
      activityEvents: [{ id: "activity-1", kind: "scan", status: "completed", label: "Scanned", createdAt: "2026-06-06T20:00:00.000Z" }],
      cacheCheckpoint: baseWorkflowPromptCacheCheckpoint(),
      graphPatch: { summary: "Add source", upsertNodes: [], upsertEdges: [] },
      createdAt: "2026-06-06T19:59:00.000Z",
      answeredAt: "2026-06-06T20:00:00.000Z",
    });
  });

  it("preserves workflow discovery question nullable and JSON fallback behavior", () => {
    const mapped = mapWorkflowDiscoveryQuestionRow({
      ...baseWorkflowDiscoveryQuestionRow(),
      revision_id: null,
      choices_json: "not-json",
      allow_freeform: 0,
      answer_json: "[]",
      graph_impact: null,
      provider: null,
      provider_model: null,
      policy_context_summary: null,
      capability_search_json: "[]",
      capability_descriptions_json: "not-json",
      blocked_reasons_json: "not-json",
      access_requests_json: "not-json",
      activity_events_json: "not-json",
      cache_checkpoint_json: "[]",
      graph_patch_json: "not-json",
      answered_at: null,
    });

    expect(mapped.revisionId).toBeUndefined();
    expect(mapped.choices).toEqual([]);
    expect(mapped.allowFreeform).toBe(false);
    expect(mapped.answer).toBeUndefined();
    expect(mapped.graphImpact).toBeUndefined();
    expect(mapped.provider).toBeUndefined();
    expect(mapped.providerModel).toBeUndefined();
    expect(mapped.policyContextSummary).toBeUndefined();
    expect(mapped.capabilitySearch).toBeUndefined();
    expect(mapped.capabilityDescriptions).toEqual([]);
    expect(mapped.blockedReasons).toEqual([]);
    expect(mapped.accessRequests).toEqual([]);
    expect(mapped.activityEvents).toEqual([]);
    expect(mapped.cacheCheckpoint).toBeUndefined();
    expect(mapped.graphPatch).toBeUndefined();
    expect(mapped.answeredAt).toBeUndefined();
  });

  it("maps workflow graph snapshot rows without store state", () => {
    const row: WorkflowGraphSnapshotRow = {
      id: "graph-1",
      workflow_thread_id: "workflow-thread-1",
      snapshot_version: 3,
      snapshot_source: "exploration",
      summary: "Explored workflow shape",
      graph_json: JSON.stringify({
        nodes: [
          {
            id: "request",
            type: "request",
            label: "User request",
            description: "Collect the starting request.",
          },
        ],
        edges: [
          {
            id: "request-to-output",
            source: "request",
            target: "output",
            type: "control_flow",
            label: "then",
          },
        ],
      }),
      artifact_path: "/tmp/workflow/graph.json",
      created_at: "2026-06-06T19:30:00.000Z",
    };

    expect(mapWorkflowGraphSnapshotRow(row)).toEqual({
      id: "graph-1",
      workflowThreadId: "workflow-thread-1",
      version: 3,
      source: "exploration",
      summary: "Explored workflow shape",
      nodes: [
        {
          id: "request",
          type: "request",
          label: "User request",
          description: "Collect the starting request.",
        },
      ],
      edges: [
        {
          id: "request-to-output",
          source: "request",
          target: "output",
          type: "control_flow",
          label: "then",
        },
      ],
      artifactPath: "/tmp/workflow/graph.json",
      createdAt: "2026-06-06T19:30:00.000Z",
    });
  });

  it("preserves workflow graph snapshot fallback behavior", () => {
    for (const graph_json of ["not-json", "[]", JSON.stringify({ nodes: "bad", edges: "bad" })]) {
      const mapped = mapWorkflowGraphSnapshotRow({
        ...baseWorkflowGraphSnapshotRow(),
        graph_json,
        artifact_path: null,
      });

      expect(mapped.nodes).toEqual([]);
      expect(mapped.edges).toEqual([]);
      expect(mapped.artifactPath).toBeUndefined();
    }
  });

  it("maps workflow exploration trace rows without store state", () => {
    const row: WorkflowExplorationTraceRow = {
      id: "trace-1",
      workflow_thread_id: "workflow-thread-1",
      exploration_id: "exploration-1",
      exploration_node_id: "node-1",
      request_text: "Explore the workflow",
      model: "ambient-test",
      capability_manifest_json: JSON.stringify({ tools: ["file_read"] }),
      observations_json: JSON.stringify([{ kind: "note", text: "Observed state" }]),
      events_json: JSON.stringify([
        {
          seq: 1,
          type: "ambient.call.start",
          message: "Started",
          createdAt: "2026-06-06T19:35:00.000Z",
        },
      ]),
      distillation_json: JSON.stringify({ summary: "Useful route found" }),
      run_status: "running",
      graph_snapshot_id: "graph-1",
      latest_progress_json: JSON.stringify({
        workflowThreadId: "workflow-thread-1",
        explorationId: "exploration-1",
        eventType: "ambient.call.start",
        phase: "provider",
        status: "running",
        message: "Calling provider",
        updatedAt: "2026-06-06T19:35:01.000Z",
      }),
      provider_health_json: JSON.stringify({ status: "ok" }),
      retry_metadata_json: JSON.stringify({ recoveryAttemptCount: 1 }),
      error_message: "still running",
      created_at: "2026-06-06T19:34:00.000Z",
      updated_at: "2026-06-06T19:35:00.000Z",
      completed_at: "2026-06-06T19:36:00.000Z",
    };

    expect(mapWorkflowExplorationTraceRow(row)).toEqual({
      id: "trace-1",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore the workflow",
      model: "ambient-test",
      capabilityManifest: { tools: ["file_read"] },
      observations: [{ kind: "note", text: "Observed state" }],
      events: [
        {
          seq: 1,
          type: "ambient.call.start",
          message: "Started",
          createdAt: "2026-06-06T19:35:00.000Z",
        },
      ],
      distillation: { summary: "Useful route found" },
      status: "running",
      graphSnapshotId: "graph-1",
      latestProgress: {
        workflowThreadId: "workflow-thread-1",
        explorationId: "exploration-1",
        eventType: "ambient.call.start",
        phase: "provider",
        status: "running",
        message: "Calling provider",
        updatedAt: "2026-06-06T19:35:01.000Z",
      },
      providerHealth: { status: "ok" },
      retryMetadata: { recoveryAttemptCount: 1 },
      error: "still running",
      createdAt: "2026-06-06T19:34:00.000Z",
      updatedAt: "2026-06-06T19:35:00.000Z",
      completedAt: "2026-06-06T19:36:00.000Z",
    });
  });

  it("preserves workflow exploration trace fallback behavior", () => {
    const mapped = mapWorkflowExplorationTraceRow({
      ...baseWorkflowExplorationTraceRow(),
      model: null,
      capability_manifest_json: "not-json",
      observations_json: "{}",
      events_json: "not-json",
      distillation_json: "not-json",
      run_status: null,
      graph_snapshot_id: null,
      latest_progress_json: "not-json",
      provider_health_json: "not-json",
      retry_metadata_json: "not-json",
      error_message: null,
      updated_at: null,
      completed_at: null,
    });

    expect(mapped).toEqual({
      id: "trace-1",
      workflowThreadId: "workflow-thread-1",
      explorationId: "exploration-1",
      explorationNodeId: "node-1",
      request: "Explore the workflow",
      model: undefined,
      capabilityManifest: undefined,
      observations: [],
      events: [],
      distillation: undefined,
      status: "succeeded",
      graphSnapshotId: undefined,
      latestProgress: undefined,
      providerHealth: undefined,
      retryMetadata: undefined,
      error: undefined,
      createdAt: "2026-06-06T19:34:00.000Z",
      updatedAt: "2026-06-06T19:34:00.000Z",
      completedAt: undefined,
    });
  });

  it("normalizes stored workflow exploration statuses", () => {
    expect(mapWorkflowExplorationTraceRow({ ...baseWorkflowExplorationTraceRow(), run_status: "failed" }).status).toBe("failed");
    expect(mapWorkflowExplorationTraceRow({ ...baseWorkflowExplorationTraceRow(), run_status: "canceled" }).status).toBe("canceled");
    expect(mapWorkflowExplorationTraceRow({ ...baseWorkflowExplorationTraceRow(), run_status: "fallback" }).status).toBe("fallback");
    expect(mapWorkflowExplorationTraceRow({ ...baseWorkflowExplorationTraceRow(), run_status: "unknown" }).status).toBe("succeeded");
    expect(mapWorkflowExplorationTraceRow({ ...baseWorkflowExplorationTraceRow(), run_status: undefined }).status).toBe("succeeded");
  });

  it("maps workflow version rows without store state", () => {
    const row: WorkflowVersionRow = {
      id: "version-1",
      workflow_thread_id: "workflow-thread-1",
      artifact_id: "artifact-1",
      version_number: 4,
      graph_snapshot_id: "graph-1",
      source_path: "/tmp/workflow/main.ts",
      repo_path: "/tmp/workflow",
      git_commit_hash: "abc123",
      version_status: "approved",
      created_by: "compiler",
      created_at: "2026-06-06T19:00:00.000Z",
    };

    expect(mapWorkflowVersionRow(row)).toEqual({
      id: "version-1",
      workflowThreadId: "workflow-thread-1",
      artifactId: "artifact-1",
      version: 4,
      graphSnapshotId: "graph-1",
      sourcePath: "/tmp/workflow/main.ts",
      repoPath: "/tmp/workflow",
      gitCommitHash: "abc123",
      status: "approved",
      createdBy: "compiler",
      createdAt: "2026-06-06T19:00:00.000Z",
    });
  });

  it("preserves workflow version nullable field behavior", () => {
    const mapped = mapWorkflowVersionRow({
      ...baseWorkflowVersionRow(),
      graph_snapshot_id: null,
      git_commit_hash: null,
    });

    expect(mapped.graphSnapshotId).toBeUndefined();
    expect(mapped.gitCommitHash).toBeUndefined();
  });
});

function baseWorkflowArtifactRow(): WorkflowArtifactRow {
  return {
    id: "artifact-1",
    workflow_thread_id: "workflow-thread-1",
    title: "Daily report workflow",
    status: "draft",
    manifest_json: JSON.stringify({ tools: [], mutationPolicy: "read_only" }),
    spec_json: JSON.stringify({ goal: "Generate a daily report" }),
    source_path: "/tmp/workflow/main.ts",
    state_path: "/tmp/workflow/state.json",
    created_at: "2026-06-06T19:40:00.000Z",
    updated_at: "2026-06-06T19:45:00.000Z",
  };
}

function baseWorkflowAgentThreadSummary(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    chatThreadId: "chat-thread-1",
    projectName: "Ambient",
    projectPath: "/workspace",
    title: "Daily report workflow",
    phase: "request",
    initialRequest: "Build a daily report workflow",
    preview: "Workflow Agent thread",
    status: "request",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    ...overrides,
  };
}

function baseWorkflowAgentFolderSummary(overrides: Partial<WorkflowAgentFolderSummary> = {}): WorkflowAgentFolderSummary {
  return {
    id: "folder-1",
    name: "Draft workflows",
    kind: "custom",
    createdAt: "2026-06-06T19:00:00.000Z",
    updatedAt: "2026-06-06T19:05:00.000Z",
    threads: [],
    ...overrides,
  };
}

function baseWorkflowAgentThreadRow(): WorkflowAgentThreadRow {
  return {
    id: "workflow-thread-1",
    folder_id: "folder-1",
    chat_thread_id: "chat-thread-1",
    project_path: "/project",
    title: "Daily report workflow",
    phase: "request",
    initial_request: "Build a daily report workflow",
    active_artifact_id: null,
    active_graph_snapshot_id: null,
    trace_mode: "production",
    created_at: "2026-06-06T19:10:00.000Z",
    updated_at: "2026-06-06T19:15:00.000Z",
  };
}

function baseWorkflowRunEventRow(): WorkflowRunEventRow {
  return {
    id: "event-1",
    run_id: "run-1",
    artifact_id: "artifact-1",
    seq: 1,
    event_type: "workflow.started",
    created_at: "2026-06-06T19:50:00.000Z",
    message: "Started",
    graph_node_id: "node-1",
    graph_edge_id: "edge-1",
    item_key: "item-1",
    data_json: JSON.stringify({ started: true }),
  };
}

function baseWorkflowRunRow(): WorkflowRunRow {
  return {
    id: "run-1",
    artifact_id: "artifact-1",
    status: "created",
    started_at: "2026-06-06T20:10:00.000Z",
    updated_at: "2026-06-06T20:11:00.000Z",
    completed_at: null,
    error: null,
    report_path: null,
    graph_snapshot_id: null,
    provider_health_json: null,
    retry_metadata_json: null,
    recovery_context_json: null,
  };
}

function baseCallableWorkflowTaskRow(): CallableWorkflowTaskRow {
  return {
    id: "task-1",
    launch_id: "launch-1",
    parent_thread_id: "thread-1",
    parent_run_id: "parent-run-1",
    parent_message_id: null,
    tool_call_id: "tool-call-1",
    tool_id: "callable-workflow",
    tool_name: "run_workflow",
    source_kind: "workflow",
    title: "Daily report workflow",
    status: "running",
    status_label: "Running",
    blocking: 1,
    default_collapsed: 0,
    progress_visible: 1,
    token_cost_tracking: 1,
    pause_resume_cancel: 1,
    cancel_handle: "cancel-1",
    runner_target: "workflow-runner",
    runner_deferred_reason: "none",
    workflow_artifact_id: "artifact-1",
    workflow_run_id: "run-1",
    error_message: null,
    pattern_graph_snapshot_json: null,
    execution_plan_json: JSON.stringify({
      toolName: "run_workflow",
      input: { artifactId: "artifact-1" },
    }),
    created_at: "2026-06-06T20:14:00.000Z",
    updated_at: "2026-06-06T20:15:30.000Z",
    started_at: null,
    completed_at: null,
  };
}

function baseCallableWorkflowLaunchCard() {
  return {
    schemaVersion: "ambient-callable-workflow-launch-card-v1",
    title: "Symphony Map-Reduce",
    sourceKind: "symphony_recipe",
    riskLevel: "high",
    estimatedAgents: 12,
    maxFanout: 12,
    maxDepth: 2,
    estimatedTokenBudget: 180_000,
    tokenBudgetEstimated: true,
    estimatedLocalMemoryBytes: 8 * 1024 * 1024 * 1024,
    localMemoryEstimated: true,
    costEstimateLabel: "Budgeted up to 180,000 tokens; provider dollar cost is estimated after runtime pricing is known.",
    toolMutationScope: "Recipe and user scope define allowed tools; mutating child actions require approval, child identifiers, and worktree isolation.",
    checkpointResume: "Compile to a persisted workflow artifact before running; visible runs must expose progress, pause/resume/cancel, and restart evidence.",
    approvalFailureHandling: "Denied, unavailable, or non-interactive approvals leave the workflow blocked or needing attention; the parent must not synthesize it as complete.",
    defaultCollapsed: true,
    blocking: true,
    smallSliceRecommended: true,
    requireConfirmation: true,
    requirementIds: ["estimated_agents", "token_cost_budget"],
    metricTemplateIds: ["map_reduce-metric"],
    policyWarnings: ["May fan out to as many as 12 child threads."],
  } as const;
}

function baseWorkflowModelCallRow(): WorkflowModelCallRow {
  return {
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
}

function baseWorkflowPromptCacheCheckpoint() {
  return {
    id: "checkpoint-1",
    stage: "runtime_call",
    workflowThreadId: "workflow-thread-1",
    stablePrefixHash: "stable",
    stablePrefixChars: 100,
    stablePrefixEstimatedTokens: 25,
    mutableSuffixHash: "mutable",
    mutableSuffixChars: 40,
    mutableSuffixEstimatedTokens: 10,
    requestHash: "request",
    requestEstimatedTokens: 35,
    boundaryLabel: "Runtime call",
    createdAt: "2026-06-06T19:54:00.000Z",
  };
}

function baseWorkflowDiscoveryQuestionRow(): WorkflowDiscoveryQuestionRow {
  return {
    id: "question-1",
    workflow_thread_id: "workflow-thread-1",
    revision_id: "revision-1",
    question_order: 1,
    category: "scope",
    context: "Need scope",
    question: "What should this workflow do?",
    choices_json: JSON.stringify([]),
    allow_freeform: 1,
    answer_json: null,
    graph_impact: null,
    provider: "deterministic",
    provider_model: null,
    policy_context_summary: null,
    capability_search_json: null,
    capability_descriptions_json: null,
    blocked_reasons_json: null,
    access_requests_json: null,
    activity_events_json: null,
    cache_checkpoint_json: null,
    graph_patch_json: null,
    created_at: "2026-06-06T19:59:00.000Z",
    answered_at: null,
  };
}

function baseWorkflowRevisionRow(): WorkflowRevisionRow {
  return {
    id: "revision-1",
    workflow_thread_id: "workflow-thread-1",
    base_version_id: "version-1",
    base_artifact_id: "artifact-1",
    requested_change: "Add retry handling",
    proposed_graph_snapshot_id: "graph-2",
    graph_diff_json: JSON.stringify({ addedNodes: ["retry"] }),
    source_diff: "diff --git a/workflow.ts b/workflow.ts",
    revision_status: "draft",
    created_at: "2026-06-06T20:05:00.000Z",
    updated_at: "2026-06-06T20:06:00.000Z",
  };
}

function baseWorkflowGraphSnapshotRow(): WorkflowGraphSnapshotRow {
  return {
    id: "graph-1",
    workflow_thread_id: "workflow-thread-1",
    snapshot_version: 1,
    snapshot_source: "discovery",
    summary: "Initial workflow shape",
    graph_json: JSON.stringify({ nodes: [], edges: [] }),
    artifact_path: "/tmp/workflow/graph.json",
    created_at: "2026-06-06T19:30:00.000Z",
  };
}

function baseWorkflowExplorationTraceRow(): WorkflowExplorationTraceRow {
  return {
    id: "trace-1",
    workflow_thread_id: "workflow-thread-1",
    exploration_id: "exploration-1",
    exploration_node_id: "node-1",
    request_text: "Explore the workflow",
    model: "ambient-test",
    capability_manifest_json: JSON.stringify({ tools: [] }),
    observations_json: JSON.stringify([]),
    events_json: JSON.stringify([]),
    distillation_json: JSON.stringify({ summary: "Draft" }),
    run_status: "succeeded",
    graph_snapshot_id: "graph-1",
    latest_progress_json: null,
    provider_health_json: null,
    retry_metadata_json: null,
    error_message: null,
    created_at: "2026-06-06T19:34:00.000Z",
    updated_at: "2026-06-06T19:34:00.000Z",
    completed_at: null,
  };
}

function baseWorkflowVersionRow(): WorkflowVersionRow {
  return {
    id: "version-1",
    workflow_thread_id: "workflow-thread-1",
    artifact_id: "artifact-1",
    version_number: 1,
    graph_snapshot_id: "graph-1",
    source_path: "/tmp/workflow/main.ts",
    repo_path: "/tmp/workflow",
    git_commit_hash: "abc123",
    version_status: "ready_for_review",
    created_by: "user_source_edit",
    created_at: "2026-06-06T19:00:00.000Z",
  };
}
