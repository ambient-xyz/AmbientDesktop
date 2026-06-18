import { describe, expect, it } from "vitest";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import {
  decodeDiagnosticExportHistoryStorage,
  diagnosticExportHistoryEntryId,
  diagnosticExportHistoryModel,
  encodeDiagnosticExportHistoryStorage,
  recordDiagnosticExportHistory,
  selectedDiagnosticExportFromHistory,
} from "./diagnosticExportHistoryUiModel";

describe("diagnostic export history UI model", () => {
  it("records recent diagnostic exports newest first with stable de-duping", () => {
    const first = exportResult({ path: "/tmp/ambient-a.json", createdAt: "2026-06-05T00:00:00.000Z" });
    const second = exportResult({ path: "/tmp/ambient-b.json", createdAt: "2026-06-05T00:01:00.000Z" });
    const duplicate = exportResult({ path: "/tmp/ambient-a.json", createdAt: "2026-06-05T00:00:00.000Z", bytes: 4096 });

    const history = recordDiagnosticExportHistory(
      recordDiagnosticExportHistory(
        recordDiagnosticExportHistory([], first),
        second,
      ),
      duplicate,
    );

    expect(history.map(diagnosticExportHistoryEntryId)).toEqual([
      diagnosticExportHistoryEntryId(duplicate),
      diagnosticExportHistoryEntryId(second),
    ]);
    expect(history[0]?.bytes).toBe(4096);
  });

  it("bounds history to the requested recent export limit", () => {
    const history = [
      exportResult({ path: "/tmp/1.json", createdAt: "2026-06-05T00:00:01.000Z" }),
      exportResult({ path: "/tmp/2.json", createdAt: "2026-06-05T00:00:02.000Z" }),
      exportResult({ path: "/tmp/3.json", createdAt: "2026-06-05T00:00:03.000Z" }),
    ];

    expect(recordDiagnosticExportHistory(history, exportResult({ path: "/tmp/4.json", createdAt: "2026-06-05T00:00:04.000Z" }), 2)
      .map((entry) => entry.path)).toEqual(["/tmp/4.json", "/tmp/1.json"]);
  });

  it("falls back to the newest export when the selected entry is missing", () => {
    const newest = exportResult({ path: "/tmp/newest.json", createdAt: "2026-06-05T00:01:00.000Z" });
    const older = exportResult({ path: "/tmp/older.json", createdAt: "2026-06-05T00:00:00.000Z" });

    expect(selectedDiagnosticExportFromHistory([newest, older], "missing")).toBe(newest);
    expect(selectedDiagnosticExportFromHistory([newest, older], diagnosticExportHistoryEntryId(older))).toBe(older);
  });

  it("summarizes saved replay evidence rows for diagnostic filtering and selection", () => {
    const selected = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics.json",
      createdAt: "2026-06-05T00:00:00.000Z",
      replayStatus: "needs_attention",
      replayMessage: "Sub-agent replay evidence captured bounded timelines for 2 child runs.",
      runCount: 2,
      runtimeEventCount: 4,
      callableWorkflowTaskCount: 1,
      truncated: true,
      includeEvidence: true,
      localRuntimeStatus: "needs_attention",
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      restartBlockedCount: 1,
      featureFlagEnabled: true,
      featureFlagSource: "settings",
      featureFlagSettingsEnabled: true,
    });
    const other = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics-older.json",
      createdAt: "2026-06-04T00:00:00.000Z",
      replayStatus: "healthy",
      includeEvidence: false,
    });

    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))).toMatchObject({
      summary: "2 diagnostic bundles available",
      rows: [
        {
          label: "ambient-diagnostics.json",
          detail: "2026-06-05T00:00:00.000Z / 2.0 KB / ambient.subagents enabled via settings / timeline evidence loaded",
          replayStatus: "Replay needs attention / 2 child runs / 4 runtime events / bounded",
          replayTone: "warning",
          localRuntimeStatus: "Local runtime needs attention / 1 runtime / 1 active lease / 1 stop blocker / 1 restart blocker",
          localRuntimeTone: "warning",
          selected: true,
        },
        {
          label: "ambient-diagnostics-older.json",
          detail: "2026-06-04T00:00:00.000Z / 2.0 KB / summary only",
          replayStatus: "Replay healthy",
          replayTone: "success",
          selected: false,
        },
      ],
    });
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("root/0:summarizer");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("workflow-task-1");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("workflow-artifact-1");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("callable-issue-1");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("active_task_interrupted");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("nested fanout required");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("ambient.subagents enabled via settings");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("active lease 1");
    expect(diagnosticExportHistoryModel([selected, other], diagnosticExportHistoryEntryId(selected))?.searchText).toContain("stop blocker 1");
  });

  it("persists searchable Tencent memory diagnostics without unknown raw fields", () => {
    const selected = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics-memory.json",
      createdAt: "2026-06-13T00:00:00.000Z",
      includeAgentMemory: true,
      includeAgentMemoryStarter: true,
      agentMemoryStatus: "needs_attention",
      agentMemoryMessage: "TencentDB Agent Memory is enabled but the reviewed core module is unavailable.",
      agentMemoryFileCount: 2,
      agentMemoryRuntimeSnapshotCount: 1,
    });
    if (selected.summary?.agentMemory) {
      (selected.summary.agentMemory as typeof selected.summary.agentMemory & { rawMemorySecret?: string }).rawMemorySecret = "do not persist raw memory";
    }
    if (selected.summary?.agentMemoryStarter) {
      (selected.summary.agentMemoryStarter as typeof selected.summary.agentMemoryStarter & { rawStarterLog?: string }).rawStarterLog = "do not persist raw starter";
    }

    const decoded = decodeDiagnosticExportHistoryStorage(encodeDiagnosticExportHistoryStorage({
      history: [selected],
      selectedId: diagnosticExportHistoryEntryId(selected),
    }));
    const model = diagnosticExportHistoryModel(decoded.history, decoded.selectedId);

    expect(decoded.history[0]?.summary?.agentMemory).toMatchObject({
      adapter: "tencentdb",
      status: "needs_attention",
      fileCount: 2,
      rawContentIncluded: false,
    });
    expect(decoded.history[0]?.summary?.agentMemoryStarter).toMatchObject({
      schemaVersion: "ambient-agent-memory-starter-status-v1",
      state: "needs_repair",
      blockers: [{ code: "runtime_missing" }],
      nextActions: ["repair", "open_logs"],
    });
    expect(JSON.stringify(decoded)).not.toContain("do not persist raw memory");
    expect(JSON.stringify(decoded)).not.toContain("do not persist raw starter");
    expect(model?.rows[0]?.detail).toContain("summary only");
    expect(model?.searchText).toContain("Agent memory needs attention");
    expect(model?.searchText).toContain("Agent memory starter needs repair");
    expect(model?.searchText).toContain("runtime_missing");
    expect(model?.searchText).toContain("starter action repair");
    expect(model?.searchText).toContain("raw memory content omitted");
    expect(model?.searchText).toContain("native preflight unavailable");
    expect(model?.searchText).toContain("context injection 512 chars");
  });

  it("preserves saved slash-command feature flag history", () => {
    const selected = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics-slash.json",
      createdAt: "2026-06-16T00:00:00.000Z",
      featureFlagEnabled: true,
      featureFlagSource: "settings",
      featureFlagSettingsEnabled: true,
      slashCommandFeatureFlagEnabled: true,
      slashCommandFeatureFlagSource: "settings",
      slashCommandFeatureFlagSettingsEnabled: true,
    });

    const decoded = decodeDiagnosticExportHistoryStorage(encodeDiagnosticExportHistoryStorage({
      history: [selected],
      selectedId: diagnosticExportHistoryEntryId(selected),
    }));

    expect(decoded.history[0]?.summary?.featureFlags?.flags["ambient.slashCommands"]).toMatchObject({
      id: "ambient.slashCommands",
      enabled: true,
      source: "settings",
      defaultEnabled: false,
      settingsEnabled: true,
    });
  });

  it("persists sanitized diagnostic bundle history and selected replay evidence across restarts", () => {
    const selected = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics.json",
      createdAt: "2026-06-05T00:00:00.000Z",
      replayStatus: "needs_attention",
      runCount: 2,
      runtimeEventCount: 4,
      callableWorkflowTaskCount: 1,
      includeEvidence: true,
      localRuntimeStatus: "needs_attention",
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      restartBlockedCount: 1,
      memoryPolicyOutcome: "ask-to-exceed",
      memoryPolicyReason: "Projected memory needs explicit approval.",
      includeLocalRuntimeEvidence: true,
      featureFlagEnabled: false,
      featureFlagSource: "startup_arg_disable",
      featureFlagSettingsEnabled: true,
    });
    const other = exportResult({
      path: "/Users/travis/Downloads/ambient-diagnostics-older.json",
      createdAt: "2026-06-04T00:00:00.000Z",
      includeEvidence: false,
    }) as DiagnosticExportResult & {
      logs?: unknown[];
      environment?: { ambientApiKey?: string };
    };
    const selectedReplayEvidence = selected.subagents?.replayEvidence as NonNullable<DiagnosticExportResult["subagents"]>["replayEvidence"] & {
      unexpectedSecret?: string;
    };
    selectedReplayEvidence.runtimeEventTimeline = [{
      sequence: 1,
      createdAt: "2026-06-05T00:00:01.000Z",
      runId: "run-1",
      parentRunId: "parent-run",
      childThreadId: "child-1",
      canonicalTaskPath: "root/0:summarizer",
      type: "subagent.runtime_event",
      status: "completed",
      messagePreview: "Worker completed after approval.",
      approvalId: "approval-worker",
      approvalSource: "permission_grant",
      worktreeIsolated: true,
      worktreePath: "/repo/.ambient-codex/worktrees/child-1",
    }];
    selectedReplayEvidence.parentMailboxTimeline = [{
      sequence: 1,
      id: "parent-mailbox-1",
      createdAt: "2026-06-05T00:00:02.000Z",
      updatedAt: "2026-06-05T00:00:03.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message-1",
      type: "subagent.grouped_completion",
      deliveryState: "queued",
      childRunIds: ["run-1"],
      childThreadIds: ["child-1"],
      canonicalTaskPaths: ["root/0:summarizer"],
      childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
      idempotencyKey: "subagent:grouped_completion_notification:abc123",
      payloadPreview: "Grouped child completion notification.",
    }, {
      sequence: 2,
      id: "parent-mailbox-tool-scope",
      createdAt: "2026-06-05T00:00:04.000Z",
      updatedAt: "2026-06-05T00:00:05.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
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
    }, {
      sequence: 3,
      id: "parent-mailbox-guard",
      createdAt: "2026-06-05T00:00:06.000Z",
      updatedAt: "2026-06-05T00:00:07.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
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
    }, {
      sequence: 4,
      id: "parent-mailbox-lifecycle",
      createdAt: "2026-06-05T00:00:08.000Z",
      updatedAt: "2026-06-05T00:00:09.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
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
    }];
    selectedReplayEvidence.callableWorkflowTaskTimeline = [{
      sequence: 1,
      taskId: "workflow-task-1",
      launchId: "workflow-launch-1",
      createdAt: "2026-06-05T00:00:04.000Z",
      updatedAt: "2026-06-05T00:00:05.000Z",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
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
      workflowRunId: "workflow-run-1",
      workflowRunStatus: "succeeded",
      workflowRunEventTypes: ["callable_workflow.task_started", "callable_workflow.task_finished"],
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
      rawExecutionPlan: "do not persist raw workflow plan",
    } as typeof selectedReplayEvidence.callableWorkflowTaskTimeline[number] & { rawExecutionPlan: string }];
    selectedReplayEvidence.unexpectedSecret = "do not persist replay extra";
    if (selected.summary?.localRuntimes) {
      selected.summary.localRuntimes.errorMessages = ["local runtime warning should persist as bounded summary"];
      (selected.summary.localRuntimes as typeof selected.summary.localRuntimes & { unexpectedSecret?: string }).unexpectedSecret = "do not persist local runtime extra";
    }
    const selectedLocalRuntimeEvidence = selected.localRuntimes?.evidence as NonNullable<NonNullable<DiagnosticExportResult["localRuntimes"]>["evidence"]> & {
      unexpectedSecret?: string;
    };
    selectedLocalRuntimeEvidence.runtimes[0] = {
      ...selectedLocalRuntimeEvidence.runtimes[0]!,
      endpoint: "https://localhost.example/health?".concat("a".repeat(700)),
      rawProcessEnvironment: "do not persist raw runtime process env",
    } as typeof selectedLocalRuntimeEvidence.runtimes[number] & { rawProcessEnvironment: string };
    selectedLocalRuntimeEvidence.unexpectedSecret = "do not persist local runtime evidence extra";
    if (other.summary) {
      other.summary.subagents.repairDiagnostics.message = "do not persist repair summary secret";
      other.summary.subagents.observability.errorMessages = ["do not persist observability summary secret"];
    }
    other.logs = [{ message: "do not persist raw logs" }];
    other.environment = { ambientApiKey: "sk-secret-shaped-value" };

    const raw = encodeDiagnosticExportHistoryStorage({
      history: [selected, other],
      selectedId: diagnosticExportHistoryEntryId(selected),
    });
    const decoded = decodeDiagnosticExportHistoryStorage(raw);

    expect(decoded.selectedId).toBe(diagnosticExportHistoryEntryId(selected));
    expect(decoded.history).toHaveLength(2);
    expect(decoded.history[0]?.subagents?.replayEvidence?.childThreads[0]?.canonicalTaskPath).toBe("root/0:summarizer");
    expect(decoded.history[0]?.summary?.featureFlags?.flags["ambient.subagents"]).toMatchObject({
      enabled: false,
      source: "startup_arg_disable",
      settingsEnabled: true,
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.runtimeEventTimeline[0]).toMatchObject({
      approvalId: "approval-worker",
      approvalSource: "permission_grant",
      worktreeIsolated: true,
      worktreePath: "/repo/.ambient-codex/worktrees/child-1",
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.parentMailboxTimeline[0]).toMatchObject({
      id: "parent-mailbox-1",
      parentMessageId: "parent-message-1",
      childRunIds: ["run-1"],
      childThreadIds: ["child-1"],
      canonicalTaskPaths: ["root/0:summarizer"],
      childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
      payloadPreview: "Grouped child completion notification.",
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.parentMailboxTimeline[1]).toMatchObject({
      id: "parent-mailbox-tool-scope",
      failureStage: "tool_scope",
      approvalMode: "non_interactive",
      approvalUnavailable: true,
      childThreadIds: ["child-1"],
      canonicalTaskPaths: ["root/0:summarizer"],
      childSourceLabels: ["root/0:summarizer / run run-1 / thread child-1"],
      deniedCategoryIds: ["connector.read"],
      deniedToolIds: ["connector_app:gmail.search"],
      deniedCategoryLabels: ["Connector Read (connector.read)"],
      deniedToolLabels: ["Connector App gmail.search / Connector Read (connector.read)"],
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.parentMailboxTimeline[2]).toMatchObject({
      id: "parent-mailbox-guard",
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
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.parentMailboxTimeline[3]).toMatchObject({
      id: "parent-mailbox-lifecycle",
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
    });
    expect(decoded.history[0]?.subagents?.replayEvidence?.callableWorkflowTaskTimeline[0]).toMatchObject({
      taskId: "workflow-task-1",
      launchId: "workflow-launch-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message-1",
      workflowThreadId: "workflow-thread-1",
      workflowArtifactId: "workflow-artifact-1",
      workflowRunId: "workflow-run-1",
      artifactLinkState: "linked",
      runLinkState: "linked",
      callerKind: "subagent_child_thread",
      childThreadId: "child-1",
      childRunId: "run-1",
      approvalSource: "child_bridge_policy",
      approvalScope: "this_child_thread",
      worktreeIsolated: true,
      nestedFanoutSource: "child_bridge_policy",
    });
    expect(decoded.history[0]?.summary?.localRuntimes).toMatchObject({
      status: "needs_attention",
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      restartBlockedCount: 1,
      memoryPolicyOutcome: "ask-to-exceed",
      memoryPolicyReason: "Projected memory needs explicit approval.",
      errorMessages: ["local runtime warning should persist as bounded summary"],
    });
    expect(decoded.history[0]?.localRuntimes?.evidence).toMatchObject({
      schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
      runtimes: [
        expect.objectContaining({
          runtimeEntryId: "local-text:runtime-1:5001",
          activeLeaseIds: ["lease-review"],
          ordinaryStopAllowed: false,
          forceStopRequiresSubagentCancellation: true,
        }),
      ],
      activeOwners: [
        expect.objectContaining({
          leaseId: "lease-review",
          displayName: "sub-agent Review worker",
          subagentThreadId: "child-thread",
        }),
      ],
      blockedActions: [
        expect.objectContaining({
          action: "stop",
          blockerLeaseIds: ["lease-review"],
          affectedSubagentThreadIds: ["child-thread"],
        }),
      ],
      nextSafeActions: [
        expect.objectContaining({
          action: "wait-for-owner",
          runtimeEntryId: "local-text:runtime-1:5001",
          blockerLeaseIds: ["lease-review"],
        }),
      ],
    });
    expect(decoded.history[0]?.localRuntimes?.evidence?.runtimes[0]?.endpoint?.length).toBeLessThanOrEqual(500);
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.summary).toBe("2 diagnostic bundles available");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("approval-worker");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("/repo/.ambient-codex/worktrees/child-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("parent-message-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("root/0:summarizer / run run-1 / thread child-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("tool_scope");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("non_interactive");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("connector_app:gmail.search");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("Connector App gmail.search / Connector Read");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("completion guard");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("approval 0");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("cancel_parent");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("barrier-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("mailbox-followup");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("parentCancellationRequested true");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("workflow-task-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("workflow-artifact-1");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("child_bridge_policy");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("Local runtime needs attention");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("memory ask-to-exceed");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("lease-review");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("child-thread");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("wait-for-owner");
    expect(diagnosticExportHistoryModel(decoded.history, decoded.selectedId)?.searchText).toContain("force stop requires subagent cancellation");
    expect(raw).not.toContain("sk-secret-shaped-value");
    expect(raw).not.toContain("do not persist raw logs");
    expect(raw).not.toContain("do not persist repair summary secret");
    expect(raw).not.toContain("do not persist observability summary secret");
    expect(raw).not.toContain("do not persist replay extra");
    expect(raw).not.toContain("do not persist raw workflow plan");
    expect(raw).not.toContain("do not persist local runtime extra");
    expect(raw).not.toContain("do not persist raw runtime process env");
    expect(raw).not.toContain("do not persist local runtime evidence extra");
  });

  it("repairs malformed or stale diagnostic history storage instead of crashing settings", () => {
    const result = exportResult({
      path: "/tmp/ambient-diagnostics.json",
      createdAt: "2026-06-05T00:00:00.000Z",
      includeEvidence: true,
    });
    const decoded = decodeDiagnosticExportHistoryStorage(JSON.stringify({
      schemaVersion: "ambient-diagnostic-export-history-v1",
      selectedId: "missing",
      history: [
        { path: "/tmp/bad.json", createdAt: "2026-06-05T00:00:00.000Z" },
        result,
      ],
    }));

    expect(decodeDiagnosticExportHistoryStorage("{not json")).toEqual({ history: [] });
    expect(decoded.history.map((entry) => entry.path)).toEqual(["/tmp/ambient-diagnostics.json"]);
    expect(decoded.selectedId).toBe(diagnosticExportHistoryEntryId(result));
  });
});

function exportResult(input: {
  path: string;
  createdAt: string;
  bytes?: number;
  replayStatus?: NonNullable<DiagnosticExportResult["summary"]>["subagents"]["replayEvidence"]["status"];
  replayMessage?: string;
  runCount?: number;
  runtimeEventCount?: number;
  callableWorkflowTaskCount?: number;
  truncated?: boolean;
  includeEvidence?: boolean;
  localRuntimeStatus?: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["localRuntimes"]>["status"];
  activeLeaseCount?: number;
  stopBlockedCount?: number;
  restartBlockedCount?: number;
  untrackedCount?: number;
  memoryPolicyOutcome?: string;
  memoryPolicyReason?: string;
  includeLocalRuntimeEvidence?: boolean;
  featureFlagEnabled?: boolean;
  featureFlagSource?: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["featureFlags"]>["flags"]["ambient.subagents"]["source"];
  featureFlagSettingsEnabled?: boolean;
  slashCommandFeatureFlagEnabled?: boolean;
  slashCommandFeatureFlagSource?: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["featureFlags"]>["flags"]["ambient.subagents"]["source"];
  slashCommandFeatureFlagSettingsEnabled?: boolean;
  includeAgentMemory?: boolean;
  includeAgentMemoryStarter?: boolean;
  agentMemoryStatus?: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemory"]>["status"];
  agentMemoryMessage?: string;
  agentMemoryFileCount?: number;
  agentMemoryRuntimeSnapshotCount?: number;
  agentMemoryStarterState?: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]>["state"];
}): DiagnosticExportResult {
  const replayStatus = input.replayStatus ?? "healthy";
  const runCount = input.runCount ?? 0;
  const runtimeEventCount = input.runtimeEventCount ?? 0;
  const callableWorkflowTaskCount = input.callableWorkflowTaskCount ?? 0;
  const includeLocalRuntime = Boolean(input.localRuntimeStatus);
  const activeLeaseCount = input.activeLeaseCount ?? 0;
  const stopBlockedCount = input.stopBlockedCount ?? 0;
  const restartBlockedCount = input.restartBlockedCount ?? 0;
  return {
    path: input.path,
    bytes: input.bytes ?? 2048,
    createdAt: input.createdAt,
    summary: {
      ...(input.featureFlagSource
        ? {
            featureFlags: {
              schemaVersion: "ambient-feature-flags-v1",
              generatedAt: input.createdAt,
              flags: {
                "ambient.subagents": {
                  id: "ambient.subagents",
                  enabled: input.featureFlagEnabled ?? false,
                  source: input.featureFlagSource,
                  defaultEnabled: false,
                  ...(typeof input.featureFlagSettingsEnabled === "boolean"
                    ? { settingsEnabled: input.featureFlagSettingsEnabled }
                    : {}),
                },
                "ambient.memory.tencentdb": {
                  id: "ambient.memory.tencentdb",
                  enabled: false,
                  source: "default",
                  defaultEnabled: false,
                },
                "ambient.slashCommands": {
                  id: "ambient.slashCommands",
                  enabled: input.slashCommandFeatureFlagEnabled ?? false,
                  source: input.slashCommandFeatureFlagSource ?? "default",
                  defaultEnabled: false,
                  ...(typeof input.slashCommandFeatureFlagSettingsEnabled === "boolean"
                    ? { settingsEnabled: input.slashCommandFeatureFlagSettingsEnabled }
                    : {}),
                },
              },
            },
          }
        : {}),
      ...(input.includeAgentMemory
        ? {
            agentMemory: {
              schemaVersion: "ambient-agent-memory-diagnostics-v1",
              adapter: "tencentdb",
              storageScope: "workspace",
              checkedAt: input.createdAt,
              status: input.agentMemoryStatus ?? "healthy",
              message: input.agentMemoryMessage ?? "TencentDB Agent Memory diagnostics are available.",
              featureEnabled: true,
              settingsEnabled: true,
              defaultThreadEnabled: false,
              embedding: {
                enabled: false,
                status: "disabled",
                message: "TencentDB memory embeddings are disabled.",
              },
              activeThreadCount: 1,
              threadEnabledCount: 1,
              dataDir: "/tmp/ambient-memory/tencentdb",
              dataDirExists: true,
              storageSchemaStatus: "current",
              storageSchemaPath: "/tmp/ambient-memory/tencentdb/ambient-memory-schema.json",
              storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
              storageSchemaVersion: "ambient-tencent-memory-storage-v1",
              storageSchemaMessage: "TencentDB Agent Memory storage schema marker is current.",
              fileCount: input.agentMemoryFileCount ?? 0,
              totalBytes: 128,
              topLevelEntryCount: 1,
              rawContentIncluded: false,
              nativePreflight: {
                schemaVersion: "ambient-agent-memory-native-preflight-v1",
                checkedAt: input.createdAt,
                platform: "darwin",
                arch: "arm64",
                nodeModuleVersion: "141",
                coreModuleConfigured: false,
                status: "unavailable",
                message: "Reviewed TencentDB Agent Memory core module is not configured.",
                dependencies: [{
                  name: "sqlite-vec",
                  expectedVersion: "0.1.7-alpha.2",
                  resolvable: false,
                  status: "unavailable",
                  message: "sqlite-vec package metadata is not resolvable without the reviewed TencentDB memory core package.",
                }],
                errors: [],
              },
              runtimeSnapshots: Array.from({ length: input.agentMemoryRuntimeSnapshotCount ?? 0 }, (_, index) => ({
                threadId: `thread-${index + 1}`,
                active: true,
                dataDir: "/tmp/ambient-memory/tencentdb",
                sessionKey: `ambient-thread:thread-${index + 1}`,
                lastContextInjection: {
                  at: input.createdAt,
                  messageCount: 3,
                  originalUserChars: 48,
                  recallContextChars: 300,
                  offloadContextChars: 200,
                  totalInjectedChars: 512,
                  projectedUserMessageChars: 562,
                  truncated: false,
                },
                lastInitialize: {
                  status: "unavailable",
                  at: input.createdAt,
                  message: "missing reviewed package",
                },
              })),
              errors: [],
            },
          }
        : {}),
      ...(input.includeAgentMemoryStarter
        ? {
            agentMemoryStarter: agentMemoryStarterSummary(input.createdAt, input.agentMemoryStarterState ?? "needs_repair"),
          }
        : {}),
      subagents: {
        replayEvidence: {
          status: replayStatus,
          message: input.replayMessage ?? "Sub-agent replay evidence found no persisted child runs.",
          runCount,
          childThreadCount: runCount,
          persistedRunEventCount: 0,
          runtimeEventCount,
          parentMailboxEventCount: 0,
          transcriptMessageCount: 0,
          callableWorkflowTaskCount,
          truncated: input.truncated ?? false,
          errorMessages: [],
        },
        repairDiagnostics: {
          status: "healthy",
          message: "Sub-agent repair diagnostics found no child-tree issues.",
          issueCount: 0,
          shownIssueCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          truncatedIssues: false,
          affectedRunCount: 0,
          affectedThreadCount: 0,
          affectedBarrierCount: 0,
          topActions: [],
          errorMessages: [],
        },
        observability: {
          status: "healthy",
          message: "Sub-agent observability found no recorded sub-agent activity.",
          spawnAttempts: 0,
          failedSpawns: 0,
          failureRate: null,
          waitDurationCount: 0,
          waitDurationTotalMs: 0,
          waitDurationMaxMs: 0,
          childIdleOpenRunCount: 0,
          childIdleTotalMs: 0,
          childIdleMaxMs: 0,
          cancellationCascades: 0,
          childRuntimeAborts: 0,
          toolDenialCount: 0,
          groupedCompletions: 0,
          needsAttentionRequests: 0,
          restartReconciliations: 0,
          tokenCount: 0,
          costMicros: 0,
          errorMessages: [],
        },
        attribution: {
          status: "healthy",
          message: "Sub-agent attribution audit found no child-originating events to inspect.",
          auditedRuntimeEventCount: 0,
          auditedParentMailboxEventCount: 0,
          issueCount: 0,
          shownIssueCount: 0,
          truncatedIssues: false,
          missingAttributionCount: 0,
          mismatchedRunIdCount: 0,
          issueSamples: [],
          errorMessages: [],
        },
      },
      ...(includeLocalRuntime
        ? {
            localRuntimes: {
              status: input.localRuntimeStatus ?? "healthy",
              message: activeLeaseCount || stopBlockedCount || restartBlockedCount
                ? `Local runtime diagnostics found 1 runtime, ${activeLeaseCount} active lease, and ${Math.max(stopBlockedCount, restartBlockedCount)} lifecycle blocker.`
                : "Local runtime diagnostics found 1 runtime with no support signals.",
              runtimeCount: 1,
              runningCount: 1,
              activeLeaseCount,
              stopBlockedCount,
              restartBlockedCount,
              untrackedCount: input.untrackedCount ?? 0,
              staleLeaseCount: 0,
              releasedLeaseCount: 0,
              crashedLeaseCount: 0,
              activeEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
              activeActualResidentMemoryBytes: 4 * 1024 ** 3,
              ...(input.memoryPolicyOutcome ? { memoryPolicyOutcome: input.memoryPolicyOutcome } : {}),
              ...(input.memoryPolicyReason ? { memoryPolicyReason: input.memoryPolicyReason } : {}),
              errorMessages: [],
            },
          }
        : {}),
    },
    ...(input.includeEvidence
      ? {
          subagents: {
            replayEvidence: {
              schemaVersion: "ambient-subagent-replay-evidence-v1",
              source: "diagnostic_export",
              createdAt: input.createdAt,
              liveTokens: false,
              truncated: input.truncated ?? false,
              counts: {
                runs: runCount,
                childThreads: runCount,
                persistedRunEvents: 0,
                runtimeEvents: runtimeEventCount,
                parentMailboxEvents: 0,
                transcriptMessages: 0,
                callableWorkflowTasks: callableWorkflowTaskCount,
              },
              shownCounts: {
                runs: runCount,
                childThreads: runCount,
                persistedRunEvents: 0,
                runtimeEvents: runtimeEventCount,
                parentMailboxEvents: 0,
                transcriptMessages: 0,
                callableWorkflowTasks: callableWorkflowTaskCount,
              },
              childThreads: [{
                threadId: "child-1",
                runId: "run-1",
                canonicalTaskPath: "root/0:summarizer",
              }],
              runtimeEventTimeline: [],
              persistedRunEventTimeline: [],
              parentMailboxTimeline: [],
              callableWorkflowTaskTimeline: callableWorkflowTaskCount
                ? [{
                    sequence: 1,
                    taskId: "workflow-task-1",
                    launchId: "workflow-launch-1",
                    createdAt: input.createdAt,
                    updatedAt: input.createdAt,
                    parentThreadId: "parent-thread",
                    parentRunId: "parent-run",
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
                    workflowRunId: "workflow-run-1",
                    workflowRunStatus: "succeeded",
                    workflowRunEventTypes: ["callable_workflow.task_started", "callable_workflow.task_finished"],
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
                  }]
                : [],
              transcriptTimeline: [],
              restartRepair: {
                observedIssueKinds: [],
                repairedRunIds: [],
                repairedBarrierIds: [],
                repairedParentControlBarrierIds: [],
                repairableSpawnEdgeRunIds: [],
                danglingSpawnEdgeRunIds: [],
                diagnosticRunIds: [],
                callableWorkflowTaskIssues: callableWorkflowTaskCount
                  ? [{
                      sequence: 1,
                      issueId: "callable-issue-1",
                      kind: "active_task_interrupted",
                      severity: "warning",
                      messagePreview: "Callable workflow task workflow-task-1 was compiling during restart.",
                      taskId: "workflow-task-1",
                      taskStatus: "compiling",
                      taskStatusLabel: "Compiling",
                      blocking: true,
                      runnerDeferredReason: "workflow_artifact_not_compiled",
                      parentThreadId: "parent-thread",
                      parentRunId: "parent-run",
                      callerKind: "subagent_child_thread",
                      callerThreadId: "child-1",
                      callerRunId: "run-1",
                      childThreadId: "child-1",
                      childRunId: "run-1",
                      subagentRunId: "run-1",
                      canonicalTaskPath: "root/0:summarizer",
                      childParentThreadId: "parent-thread",
                      childParentRunId: "parent-run",
                      approvalSource: "child_bridge_policy",
                      approvalScope: "this_child_thread",
                      worktreeRequired: true,
                      worktreeIsolated: true,
                      worktreeStatus: "active",
                      nestedFanoutRequired: true,
                      nestedFanoutSource: "child_bridge_policy",
                    }]
                  : [],
              },
            },
          },
        }
      : {}),
    ...(input.includeLocalRuntimeEvidence
      ? {
          localRuntimes: {
            evidence: localRuntimeEvidence(input.createdAt),
          },
        }
      : {}),
  };
}

function agentMemoryStarterSummary(
  checkedAt: string,
  state: NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]>["state"],
): NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]> {
  return {
    schemaVersion: "ambient-agent-memory-starter-status-v1",
    checkedAt,
    operationId: "starter-op-1",
    state,
    settings: {
      featureFlags: { tencentDbMemory: true },
      memory: {
        enabled: true,
        defaultThreadEnabled: false,
        adapter: "tencentdb",
        shortTermOffloadEnabled: false,
        embeddings: {
          enabled: true,
          providerMode: "ambient-managed",
          autoStartProvider: true,
          modelId: "embeddinggemma-300m",
          dimensions: 768,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10_000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      },
    },
    threadScope: {
      activeThreadId: "thread-1",
      activeThreadMemoryEnabled: true,
      defaultThreadEnabled: false,
      enabledThreadCount: 1,
      activeThreadCount: 1,
    },
    assets: {
      model: {
        state: "present",
        artifactId: "embeddinggemma-300m",
        path: "/tmp/ambient-memory/model.gguf",
      },
      runtime: {
        state: "missing",
        artifactId: "llama.cpp-darwin-arm64",
        message: "Shared embedding runtime is missing.",
      },
    },
    runtime: {
      state: "stopped",
      message: "Embedding runtime is not running.",
    },
    embedding: {
      enabled: true,
      status: "unavailable",
      message: "Embedding runtime is not running.",
      providerMode: "ambient-managed",
      modelId: "embeddinggemma-300m",
      runtimeStatus: "stopped",
      running: false,
      autoStartProvider: true,
      preflightEnabled: true,
      sendDimensions: false,
      maxInputChars: 512,
      timeoutMs: 10_000,
      reindexStatus: "unknown",
    },
    nativePreflight: {
      schemaVersion: "ambient-agent-memory-native-preflight-v1",
      checkedAt,
      platform: "darwin",
      arch: "arm64",
      coreModuleConfigured: false,
      status: "unavailable",
      message: "Reviewed TencentDB Agent Memory core module is not configured.",
      dependencies: [],
      errors: [],
    },
    blockers: [{
      code: "runtime_missing",
      message: "Shared embedding runtime is missing.",
      retryable: true,
    }],
    nextActions: ["repair", "open_logs"],
  };
}

function localRuntimeEvidence(createdAt: string): NonNullable<NonNullable<DiagnosticExportResult["localRuntimes"]>["evidence"]> {
  return {
    schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
    source: "diagnostic_export",
    capturedAt: createdAt,
    truncated: false,
    counts: {
      runtimes: 1,
      activeOwners: 1,
      blockedActions: 1,
      nextSafeActions: 1,
    },
    shownCounts: {
      runtimes: 1,
      activeOwners: 1,
      blockedActions: 1,
      nextSafeActions: 1,
    },
    runtimes: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      capability: "local-text",
      trackingStatus: "managed",
      running: true,
      providerId: "local",
      modelRuntimeId: "runtime-1",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      pid: 5001,
      endpoint: "http://127.0.0.1:43123/health",
      estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      actualResidentMemoryBytes: 4 * 1024 ** 3,
      memorySampledAt: createdAt,
      ownerLabels: ["sub-agent Review worker"],
      activeLeaseIds: ["lease-review"],
      staleLeaseIds: [],
      releasedLeaseIds: [],
      crashedLeaseIds: [],
      ordinaryStopAllowed: false,
      ordinaryRestartAllowed: false,
      stopReason: "Ordinary Stop disabled while sub-agent Review worker owns this runtime.",
      restartReason: "Ordinary Restart disabled while sub-agent Review worker owns this runtime.",
      forceStopAllowed: true,
      forceRestartAllowed: true,
      forceStopRequiresSubagentCancellation: true,
      forceRestartRequiresSubagentCancellation: true,
      untracked: false,
    }],
    activeOwners: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      leaseId: "lease-review",
      displayName: "sub-agent Review worker",
      status: "running",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      subagentRunId: "child-run",
      capabilityKind: "local-text",
      providerId: "local",
      modelRuntimeId: "runtime-1",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      actualResidentMemoryBytes: 4 * 1024 ** 3,
      pid: 5001,
      endpoint: "http://127.0.0.1:43123/health",
      acquiredAt: createdAt,
      lastHeartbeatAt: createdAt,
    }],
    blockedActions: [{
      sequence: 1,
      runtimeEntryId: "local-text:runtime-1:5001",
      action: "stop",
      reason: "Ordinary Stop disabled while sub-agent Review worker owns this runtime.",
      blockerLeaseIds: ["lease-review"],
      affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      affectedSubagentThreadIds: ["child-thread"],
      forceAllowed: true,
      forceRequiresSubagentCancellation: true,
      untracked: false,
    }],
    nextSafeActions: [{
      sequence: 1,
      action: "wait-for-owner",
      safety: "blocked",
      reason: "Wait for sub-agent Review worker to release lease-review before ordinary Stop.",
      runtimeEntryId: "local-text:runtime-1:5001",
      capability: "local-text",
      blockerLeaseIds: ["lease-review"],
      affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      ownershipResolution: {
        lifecycleAction: "stop",
        resolution: "cancel-or-mark-affected-subagents",
        requiresInventoryRefresh: true,
        reason: "Forced Stop must cancel or mark affected sub-agents first.",
        blockerLeaseIds: ["lease-review"],
        affectedSubagentLabels: ["sub-agent Review worker (run child-run, thread child-thread, lease lease-review)"],
      },
      untracked: false,
    }],
    memoryEvidence: {
      activeEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
      activeActualResidentMemoryBytes: 4 * 1024 ** 3,
      activeResidentMemoryBasis: "actual-rss",
      projectedSystemMemoryUtilization: 0.62,
      projectedFreeMemoryRatio: 0.38,
      uncertaintyReasons: [],
      entryCountWithActualRss: 1,
      entryCountWithOnlyEstimate: 0,
      entryCountWithUnknownMemory: 0,
    },
  };
}
