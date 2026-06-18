import { describe, expect, it } from "vitest";
import type { DiagnosticExportSubagentReplayEvidence, DiagnosticExportSubagentReplaySummary } from "../../shared/diagnosticTypes";
import { subagentReplayEvidenceInspectorModel } from "./subagentReplayEvidenceUiModel";

describe("subagent replay evidence UI model", () => {
  it("summarizes diagnostic replay evidence as inspectable counts and rows", () => {
    expect(subagentReplayEvidenceInspectorModel(evidence(), summary())).toMatchObject({
      statusLabel: "1 child run",
      statusTone: "success",
      summary: "Sub-agent replay evidence captured timelines for 1 child run.",
      badges: ["Token-free", "2 runtime events", "3 persisted events", "1 parent mailbox event", "1 callable workflow task", "6 restart repair signals", "1 lifecycle edge"],
      countsRows: [
        { label: "Runs", value: "1" },
        { label: "Child threads", value: "1" },
        { label: "Runtime events", value: "2" },
        { label: "Persisted events", value: "3" },
        { label: "Parent mailbox events", value: "1" },
        { label: "Transcript messages", value: "1" },
        { label: "Callable workflow tasks", value: "1" },
      ],
      childThreadRows: [
        {
          key: "child-1",
          title: "root/0:summarizer",
          detail: "Status: Completed / Collapsed by default",
          meta: "run run-1 / parent run parent-run-1 / parent thread parent-1",
          tone: "success",
        },
      ],
    });
  });

  it("builds runtime, persisted, transcript, and restart repair timelines for the inspector", () => {
    expect(subagentReplayEvidenceInspectorModel(evidence())).toMatchObject({
      runtimeEventRows: [
        {
          key: "runtime:run-1:1",
          title: "Started",
          detail: "Child runtime started.",
          meta: "source Child Runtime / run run-1 / child child-1 / root/0:summarizer",
          tone: "neutral",
        },
        {
          key: "runtime:run-1:2",
          title: "read_file Tool Result (Completed)",
          detail: "Read README.md for summary.",
          meta: "source Child Runtime / run run-1 / child child-1 / root/0:summarizer / artifact /tmp/artifacts/read.json / approval Permission Grant (approval-worker) / worktree isolated / worktree path /repo/.ambient-codex/worktrees/child-1",
          tone: "success",
        },
      ],
      persistedEventRows: [
        {
          key: "persisted:run-1:1",
          title: "Reserved",
          detail: "reserved child thread",
          meta: "source Project Store / run run-1 / child child-1 / root/0:summarizer",
          tone: "neutral",
        },
        {
          key: "persisted:run-1:2",
          title: "Runtime Event",
          detail: "tool result persisted",
          meta: "source Project Store / run run-1 / child child-1 / root/0:summarizer",
          tone: "neutral",
        },
        {
          key: "persisted:run-1:3",
          title: "Completed",
          detail: "child completed",
          meta: "source Project Store / run run-1 / child child-1 / root/0:summarizer",
          tone: "success",
        },
      ],
      parentMailboxRows: [
        {
          key: "parent-mailbox:mailbox-1:1",
          title: "Grouped Completion",
          detail: "Grouped child completion notification.",
          meta: "parent run parent-run-1 / parent thread parent-1 / parent message parent-message-1 / delivery Queued / children run-1 / child sources root/0:summarizer / run run-1 / thread child-1 / idempotency subagent:grouped_completion_notification:abc123",
          tone: "neutral",
        },
      ],
      transcriptRows: [
        {
          key: "transcript:child-1:1",
          title: "Assistant transcript message",
          detail: "Child replay evidence transcript preview for diagnostics.",
          meta: "thread child-1 / run run-1 / child child-1 / 2026-06-05T00:00:04.000Z",
          tone: "neutral",
        },
      ],
      callableWorkflowRows: [
        {
          key: "callable-workflow:workflow-task-1",
          title: "Symphony Map-Reduce (Succeeded)",
          detail: expect.stringContaining("mutation Staged Until Approved"),
          meta: expect.stringContaining("source /repo/.ambient-codex/workflows/replay/main.ts / state /repo/.ambient-codex/workflows/replay/state.json"),
          tone: "success",
        },
      ],
      restartRepairRows: [
        {
          key: "restart-repair:observed-issue-kinds",
          title: "Observed issue kinds",
          detail: "active_run_interrupted, missing_spawn_edge",
          meta: "2 items",
          tone: "neutral",
        },
        {
          key: "restart-repair:callable-workflow:callable-issue-1",
          title: "Callable workflow Active Task Interrupted (Warning)",
          detail: expect.stringContaining("caller Subagent Child Thread"),
          meta: expect.stringContaining("task workflow-task-1"),
          tone: "warning",
        },
        {
          key: "restart-repair:repaired-runs",
          title: "Repaired runs",
          detail: "run-1",
          meta: "1 item",
          tone: "neutral",
        },
        {
          key: "restart-repair:repairable-spawn-edges",
          title: "Repairable spawn edges",
          detail: "run-2",
          meta: "1 item",
          tone: "neutral",
        },
        {
          key: "restart-repair:dangling-spawn-edges",
          title: "Dangling spawn edges",
          detail: "missing-run",
          meta: "1 item",
          tone: "warning",
        },
      ],
      lifecycleEdgeRows: [
        {
          key: "lifecycle-edge:restart-repair",
          title: "Lifecycle Restart Repair",
          detail: "observed active_run_interrupted, missing_spawn_edge / repaired run-1 / repairable spawn edges run-2 / dangling missing-run / 1 callable workflow restart issue",
          meta: "6 restart repair signals",
          tone: "warning",
        },
      ],
    });
  });

  it("surfaces tool-scope denial metadata in parent mailbox replay rows and search", () => {
    const base = evidence();
    const model = subagentReplayEvidenceInspectorModel({
      ...base,
      parentMailboxTimeline: [
        ...base.parentMailboxTimeline,
        {
          sequence: 2,
          id: "parent-mailbox-tool-scope",
          createdAt: "2026-06-05T00:00:05.000Z",
          updatedAt: "2026-06-05T00:00:05.000Z",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          parentMessageId: "parent-message-1",
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          childRunIds: ["run-1"],
          childThreadIds: ["child-1"],
          canonicalTaskPaths: ["root/0:summarizer"],
          childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
          idempotencyKey: "spawn:noninteractive-approval-unavailable",
          payloadPreview: "Requested sub-agent tool scope was denied.",
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          deniedCategoryIds: ["connector.read"],
          deniedToolIds: ["connector_app:gmail.search"],
          deniedCategoryLabels: ["Connector Read (connector.read)"],
          deniedToolLabels: ["Connector App gmail.search / Connector Read (connector.read)"],
        },
      ],
    });
    const row = model?.parentMailboxRows.find((item) => item.key === "parent-mailbox:parent-mailbox-tool-scope:2");

    expect(row).toMatchObject({
      title: "Spawn Failed",
      tone: "danger",
    });
    expect(row?.detail).toContain("failure Tool Scope");
    expect(row?.detail).toContain("approval Non Interactive");
    expect(row?.detail).toContain("approval unavailable");
    expect(row?.detail).toContain("denied categories Connector Read (connector.read)");
    expect(row?.detail).toContain("denied tools Connector App gmail.search / Connector Read (connector.read)");
    expect(row?.meta).toContain("child sources root/0:summarizer / run run-1 / thread child-1");
    expect(row?.meta).toContain("idempotency spawn:noninteractive-approval-unavailable");
    expect(model?.searchText).toContain("tool_scope");
    expect(model?.searchText).toContain("non_interactive");
    expect(model?.searchText).toContain("connector.read");
    expect(model?.searchText).toContain("connector_app:gmail.search");
    expect(model?.searchText).toContain("Connector App gmail.search / Connector Read");
    expect(model?.searchText).toContain("root/0:summarizer / run run-1 / thread child-1");

    const legacyModel = subagentReplayEvidenceInspectorModel({
      ...base,
      parentMailboxTimeline: [
        ...base.parentMailboxTimeline,
        {
          sequence: 3,
          id: "parent-mailbox-tool-scope-legacy",
          createdAt: "2026-06-05T00:00:06.000Z",
          updatedAt: "2026-06-05T00:00:06.000Z",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          childRunIds: ["run-1"],
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          deniedCategoryIds: ["connector.read"],
          deniedToolIds: ["connector_app:gmail.search"],
        },
      ],
    });
    const legacyRow = legacyModel?.parentMailboxRows.find((item) => item.key === "parent-mailbox:parent-mailbox-tool-scope-legacy:3");
    expect(legacyRow?.detail).toContain("denied tools connector_app:gmail.search");
  });

  it("surfaces completion guard metadata in parent mailbox replay rows and search", () => {
    const base = evidence();
    const model = subagentReplayEvidenceInspectorModel({
      ...base,
      parentMailboxTimeline: [
        ...base.parentMailboxTimeline,
        {
          sequence: 2,
          id: "parent-mailbox-guard",
          createdAt: "2026-06-05T00:00:05.000Z",
          updatedAt: "2026-06-05T00:00:05.000Z",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          parentMessageId: "parent-message-1",
          type: "subagent.wait_barrier_attention",
          deliveryState: "queued",
          childRunIds: ["run-1"],
          idempotencyKey: "wait-barrier-attention:guard",
          payloadPreview: "Child result is not synthesis-safe.",
          completionGuardSummary: {
            valid: false,
            synthesisAllowed: false,
            required: true,
            structuredEvidenceCount: 1,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 0,
            reason: "Missing approval provenance.",
          },
        },
      ],
    });
    const row = model?.parentMailboxRows.find((item) => item.key === "parent-mailbox:parent-mailbox-guard:2");

    expect(row).toMatchObject({
      title: "Wait Barrier Attention",
      detail: "completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance. | Child result is not synthesis-safe.",
      meta: expect.stringContaining("completion guard blocked / mutation evidence structured 1 / Ambient 1 / isolated worktree 1 / approval 0 / Missing approval provenance."),
    });
    expect(model?.searchText).toContain("completion guard");
    expect(model?.searchText).toContain("approval 0");
    expect(model?.searchText).toContain("Missing approval provenance.");
  });

  it("surfaces lifecycle metadata in parent mailbox replay rows and search", () => {
    const base = evidence();
    const model = subagentReplayEvidenceInspectorModel({
      ...base,
      parentMailboxTimeline: [
        ...base.parentMailboxTimeline,
        {
          sequence: 2,
          id: "parent-mailbox-lifecycle",
          createdAt: "2026-06-05T00:00:05.000Z",
          updatedAt: "2026-06-05T00:00:05.000Z",
          parentThreadId: "parent-1",
          parentRunId: "parent-run-1",
          parentMessageId: "parent-message-1",
          type: "subagent.wait_barrier_decision",
          deliveryState: "delivered",
          childRunIds: ["run-1", "run-2"],
          childThreadIds: ["child-1"],
          canonicalTaskPaths: ["root/0:summarizer"],
          childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
          idempotencyKey: "barrier:cancel-parent",
          payloadPreview: "Parent cancelled required child work.",
          lifecycleSummary: {
            action: "cancel_parent",
            waitBarrierId: "barrier-1",
            barrierStatus: "cancelled",
            reason: "User stopped the parent.",
            userDecisionPreview: "Stop the parent task.",
            cancelledRunIds: ["run-1"],
            detachedRunIds: ["run-2"],
            unchangedRunIds: ["run-3"],
            cancelledWaitBarrierIds: ["barrier-1"],
            cancelledMailboxEventIds: ["mailbox-followup"],
            parentCancellationRequested: true,
          },
        },
      ],
    });
    const row = model?.parentMailboxRows.find((item) => item.key === "parent-mailbox:parent-mailbox-lifecycle:2");

    expect(row).toMatchObject({
      title: "Wait Barrier Decision",
      tone: "danger",
    });
    expect(row?.detail).toContain("lifecycle Cancel Parent");
    expect(row?.detail).toContain("barrier barrier-1");
    expect(row?.detail).toContain("cancelled run-1");
    expect(row?.detail).toContain("parent cancellation requested");
    expect(row?.meta).toContain("child sources root/0:summarizer / run run-1 / thread child-1");
    expect(row?.meta).toContain("lifecycle Cancel Parent");
    const edgeRow = model?.lifecycleEdgeRows.find((item) => item.key === "lifecycle-edge:parent-mailbox-lifecycle:2");
    expect(edgeRow).toMatchObject({
      title: "Lifecycle Cancel Parent",
      tone: "danger",
      detail: expect.stringContaining("parent cancellation requested"),
      meta: "parent run parent-run-1 / parent message parent-message-1 / children run-1, run-2 / barrier barrier-1 / delivery Delivered",
    });
    expect(model?.searchText).toContain("cancel_parent");
    expect(model?.searchText).toContain("barrier-1");
    expect(model?.searchText).toContain("mailbox-followup");
    expect(model?.searchText).toContain("parentCancellationRequested true");
    expect(model?.searchText).toContain("Stop the parent task.");
  });

  it("surfaces unavailable or failed summaries even when evidence collection produced no bundle object", () => {
    expect(subagentReplayEvidenceInspectorModel(undefined, {
      status: "error",
      message: "Sub-agent replay evidence failed to collect 1 error.",
      runCount: 0,
      childThreadCount: 0,
      persistedRunEventCount: 0,
      runtimeEventCount: 0,
      parentMailboxEventCount: 0,
      transcriptMessageCount: 0,
      callableWorkflowTaskCount: 0,
      truncated: false,
      errorMessages: ["Sub-agent replay evidence failed: permission denied"],
    })).toMatchObject({
      statusLabel: "Replay evidence failed",
      statusTone: "danger",
      summary: "Sub-agent replay evidence failed to collect 1 error.",
      badges: ["Error", "1 collection error"],
      countsRows: [],
      childThreadRows: [],
    });
  });

  it("marks bounded timelines and exposes full search text for saved diagnostic filtering", () => {
    const model = subagentReplayEvidenceInspectorModel({
      ...evidence(),
      truncated: true,
      counts: {
        runs: 3,
        childThreads: 3,
        runtimeEvents: 9,
        persistedRunEvents: 12,
        transcriptMessages: 7,
        parentMailboxEvents: 6,
        callableWorkflowTasks: 2,
      },
      shownCounts: {
        runs: 1,
        childThreads: 1,
        runtimeEvents: 2,
        persistedRunEvents: 3,
        transcriptMessages: 1,
        parentMailboxEvents: 1,
        callableWorkflowTasks: 1,
      },
    });

    expect(model).toMatchObject({
      statusLabel: "3 child runs",
      statusTone: "warning",
      badges: expect.arrayContaining(["Bounded timeline", "9 runtime events", "12 persisted events", "6 parent mailbox events"]),
      countsRows: [
        { label: "Runs", value: "1/3 shown" },
        { label: "Child threads", value: "1/3 shown" },
        { label: "Runtime events", value: "2/9 shown" },
        { label: "Persisted events", value: "3/12 shown" },
        { label: "Parent mailbox events", value: "1/6 shown" },
        { label: "Transcript messages", value: "1/7 shown" },
        { label: "Callable workflow tasks", value: "1/2 shown" },
      ],
    });
    expect(model?.searchText).toContain("root/0:summarizer");
    expect(model?.searchText).toContain("Read README.md for summary.");
    expect(model?.searchText).toContain("approval-worker");
    expect(model?.searchText).toContain("/repo/.ambient-codex/worktrees/child-1");
    expect(model?.searchText).toContain("parent-message-1");
    expect(model?.searchText).toContain("Grouped child completion notification.");
    expect(model?.searchText).toContain("missing_spawn_edge");
    expect(model?.searchText).toContain("workflow-task-1");
    expect(model?.searchText).toContain("workflow-artifact-1");
    expect(model?.searchText).toContain("child_bridge_policy");
    expect(model?.searchText).toContain("/repo/.ambient-codex/workflows/replay/main.ts");
    expect(model?.searchText).toContain("/repo/.ambient-codex/workflows/replay/state.json");
    expect(model?.searchText).toContain("staged_until_approved");
  });
});

function summary(): DiagnosticExportSubagentReplaySummary {
  return {
    status: "healthy",
    message: "Sub-agent replay evidence captured timelines for 1 child run.",
    runCount: 1,
    childThreadCount: 1,
    persistedRunEventCount: 3,
    runtimeEventCount: 2,
    parentMailboxEventCount: 1,
    transcriptMessageCount: 1,
    callableWorkflowTaskCount: 1,
    truncated: false,
    errorMessages: [],
  };
}

function evidence(): DiagnosticExportSubagentReplayEvidence {
  return {
    schemaVersion: "ambient-subagent-replay-evidence-v1",
    source: "diagnostic_export",
    createdAt: "2026-06-05T00:00:00.000Z",
    liveTokens: false,
    truncated: false,
    counts: {
      runs: 1,
      childThreads: 1,
      persistedRunEvents: 3,
      runtimeEvents: 2,
      parentMailboxEvents: 1,
      transcriptMessages: 1,
      callableWorkflowTasks: 1,
    },
    shownCounts: {
      runs: 1,
      childThreads: 1,
      persistedRunEvents: 3,
      runtimeEvents: 2,
      parentMailboxEvents: 1,
      transcriptMessages: 1,
      callableWorkflowTasks: 1,
    },
    childThreads: [{
      threadId: "child-1",
      runId: "run-1",
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      canonicalTaskPath: "root/0:summarizer",
      collapsedByDefault: true,
      status: "completed",
    }],
    runtimeEventTimeline: [
      {
        sequence: 1,
        createdAt: "2026-06-05T00:00:01.000Z",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        source: "child_runtime",
        type: "started",
        messagePreview: "Child runtime started.",
      },
      {
        sequence: 2,
        createdAt: "2026-06-05T00:00:02.000Z",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        source: "child_runtime",
        type: "tool_result",
        status: "completed",
        toolName: "read_file",
        textPreview: "Read README.md for summary.",
        artifactPath: "/tmp/artifacts/read.json",
        approvalSource: "permission_grant",
        approvalId: "approval-worker",
        worktreeIsolated: true,
        worktreePath: "/repo/.ambient-codex/worktrees/child-1",
      },
    ],
    persistedRunEventTimeline: [
      {
        sequence: 1,
        createdAt: "2026-06-05T00:00:01.000Z",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        source: "project_store",
        type: "subagent.reserved",
        textPreview: "reserved child thread",
      },
      {
        sequence: 2,
        createdAt: "2026-06-05T00:00:02.000Z",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        source: "project_store",
        type: "subagent.runtime_event",
        textPreview: "tool result persisted",
      },
      {
        sequence: 3,
        createdAt: "2026-06-05T00:00:03.000Z",
        runId: "run-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-1",
        canonicalTaskPath: "root/0:summarizer",
        roleId: "summarizer",
        source: "project_store",
        type: "subagent.completed",
        textPreview: "child completed",
      },
    ],
    parentMailboxTimeline: [{
      sequence: 1,
      id: "mailbox-1",
      createdAt: "2026-06-05T00:00:03.500Z",
      updatedAt: "2026-06-05T00:00:03.500Z",
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      parentMessageId: "parent-message-1",
      type: "subagent.grouped_completion",
      deliveryState: "queued",
      childRunIds: ["run-1"],
      childThreadIds: ["child-1"],
      canonicalTaskPaths: ["root/0:summarizer"],
      childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
      idempotencyKey: "subagent:grouped_completion_notification:abc123",
      payloadPreview: "Grouped child completion notification.",
    }],
    callableWorkflowTaskTimeline: [{
      sequence: 1,
      taskId: "workflow-task-1",
      launchId: "workflow-launch-1",
      createdAt: "2026-06-05T00:00:04.000Z",
      updatedAt: "2026-06-05T00:00:08.000Z",
      parentThreadId: "parent-1",
      parentRunId: "parent-run-1",
      parentMessageId: "parent-message-1",
      toolName: "ambient_workflow_map_reduce",
      sourceKind: "symphony_recipe",
      title: "Symphony Map-Reduce",
      status: "succeeded",
      statusLabel: "Succeeded",
      blocking: true,
      runnerDeferredReason: "workflow_run_succeeded",
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "workflow-artifact-1",
      workflowArtifactTitle: "Replay Child Mutation",
      workflowArtifactStatus: "ready_for_preview",
      workflowArtifactSourcePath: "/repo/.ambient-codex/workflows/replay/main.ts",
      workflowArtifactStatePath: "/repo/.ambient-codex/workflows/replay/state.json",
      workflowArtifactMutationPolicy: "staged_until_approved",
      workflowRunId: "workflow-run-1",
      workflowRunStatus: "succeeded",
      workflowRunEventTypes: [
        "callable_workflow.task_started",
        "workflow.step.completed",
        "callable_workflow.task_finished",
      ],
      artifactLinkState: "linked",
      runLinkState: "linked",
      callerKind: "subagent_child_thread",
      childThreadId: "child-1",
      childRunId: "run-1",
      subagentRunId: "run-1",
      canonicalTaskPath: "root/0:summarizer",
      approvalSource: "child_bridge_policy",
      approvalScope: "this_child_thread",
      worktreeIsolated: true,
      worktreeStatus: "active",
      nestedFanoutSource: "child_bridge_policy",
      lastEventType: "callable_workflow.task_finished",
      lastEventMessage: "Callable workflow task finished.",
    }],
    transcriptTimeline: [{
      sequence: 1,
      createdAt: "2026-06-05T00:00:04.000Z",
      threadId: "child-1",
      role: "assistant",
      childRunId: "run-1",
      childThreadId: "child-1",
      contentPreview: "Child replay evidence transcript preview for diagnostics.",
    }],
    restartRepair: {
      observedIssueKinds: ["active_run_interrupted", "missing_spawn_edge"],
      repairedRunIds: ["run-1"],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: ["run-2"],
      danglingSpawnEdgeRunIds: ["missing-run"],
      diagnosticRunIds: [],
      callableWorkflowTaskIssues: [{
        sequence: 1,
        issueId: "callable-issue-1",
        kind: "active_task_interrupted",
        severity: "warning",
        messagePreview: "Callable workflow task workflow-task-1 was compiling during restart and needs workflow task reconciliation.",
        taskId: "workflow-task-1",
        taskStatus: "compiling",
        taskStatusLabel: "Compiling",
        blocking: true,
        runnerDeferredReason: "workflow_artifact_not_compiled",
        parentThreadId: "parent-1",
        parentRunId: "parent-run-1",
        callerKind: "subagent_child_thread",
        callerThreadId: "child-1",
        callerRunId: "run-1",
        childThreadId: "child-1",
        childRunId: "run-1",
        subagentRunId: "run-1",
        canonicalTaskPath: "root/0:summarizer",
        childParentThreadId: "parent-1",
        childParentRunId: "parent-run-1",
        approvalSource: "child_bridge_policy",
        approvalScope: "this_child_thread",
        worktreeRequired: true,
        worktreeIsolated: true,
        worktreeStatus: "active",
        nestedFanoutRequired: true,
        nestedFanoutSource: "child_bridge_policy",
      }],
    },
  };
}
