import { describe, expect, it } from "vitest";
import type { SubagentRepairDiagnosticsReport } from "../../shared/types";
import { subagentRepairDiagnosticsModel, subagentRepairRowsForRun } from "./subagentRepairDiagnosticsUiModel";

describe("subagent repair diagnostics UI model", () => {
  it("summarizes repair diagnostics with bounded issue rows and action labels", () => {
    expect(subagentRepairDiagnosticsModel(report())).toMatchObject({
      statusLabel: "2 repair issues",
      statusTone: "danger",
      summary: "1 error, 1 warning",
      badges: ["1 error", "1 warning", "2 reconciled", "1 diagnostic"],
      affectedRows: [
        { label: "Runs", value: "run-1, run-2" },
        { label: "Threads", value: "child-1, child-2" },
        { label: "Barriers", value: "barrier-1" },
      ],
      issueGroups: [
        { label: "Lifecycle", value: "1 issue" },
        { label: "Tree linkage", value: "1 issue" },
      ],
      issueRows: [
        {
          key: "active_run_interrupted:run-1:child-1:parent-run:",
          title: "Active Run Interrupted",
          categoryLabel: "Lifecycle",
          detail: "Run was active at restart.",
          tone: "warning",
          actionLabel: "Run startup reconciliation",
          meta: "run run-1 / thread child-1",
        },
        {
          key: "missing_spawn_edge:run-2:child-2:parent-run:",
          title: "Missing Spawn Edge",
          categoryLabel: "Tree linkage",
          detail: "Missing edge.",
          tone: "danger",
          actionLabel: "Repair spawn edge",
          meta: "run run-2 / thread child-2 / barrier barrier-1",
        },
      ],
    });
    expect(subagentRepairDiagnosticsModel(report())?.searchText).toContain("missing_spawn_edge");
    expect(subagentRepairDiagnosticsModel(report())?.searchText).toContain("Tree linkage");
  });

  it("groups snapshot integrity issues for repair settings and search", () => {
    const model = subagentRepairDiagnosticsModel({
      ...report(),
      issueCount: 3,
      shownIssueCount: 3,
      errorCount: 3,
      warningCount: 0,
      repairedRunIds: [],
      repairedSpawnEdgeRunIds: [],
      prunedDanglingSpawnEdgeRunIds: [],
      diagnosticRunIds: ["run-snapshot"],
      affectedRunIds: ["run-snapshot"],
      affectedThreadIds: ["child-snapshot"],
      affectedBarrierIds: [],
      actionCounts: {
        inspect_run_snapshot: 3,
      },
      issues: [
        {
          issueId: "missing_role_profile_snapshot:run-snapshot:child-snapshot:parent-run:",
          kind: "missing_role_profile_snapshot",
          severity: "error",
          messagePreview: "Missing role profile snapshot.",
          runId: "run-snapshot",
          threadId: "child-snapshot",
          parentThreadId: "parent-1",
          parentRunId: "parent-run",
          action: "inspect_run_snapshot",
          actionLabel: "Inspect run snapshot",
          destructive: false,
        },
        {
          issueId: "missing_model_runtime_snapshot:run-snapshot:child-snapshot:parent-run:",
          kind: "missing_model_runtime_snapshot",
          severity: "error",
          messagePreview: "Missing runtime snapshot.",
          runId: "run-snapshot",
          threadId: "child-snapshot",
          parentThreadId: "parent-1",
          parentRunId: "parent-run",
          action: "inspect_run_snapshot",
          actionLabel: "Inspect run snapshot",
          destructive: false,
        },
        {
          issueId: "tool_scope_snapshot_mismatch:run-snapshot:child-snapshot:parent-run:",
          kind: "tool_scope_snapshot_mismatch",
          severity: "error",
          messagePreview: "Tool scope snapshot mismatch.",
          runId: "run-snapshot",
          threadId: "child-snapshot",
          parentThreadId: "parent-1",
          parentRunId: "parent-run",
          action: "inspect_run_snapshot",
          actionLabel: "Inspect run snapshot",
          destructive: false,
        },
      ],
    });

    expect(model).toMatchObject({
      badges: ["3 errors", "Snapshot 3 issues", "1 diagnostic"],
      issueGroups: [{ label: "Snapshot integrity", value: "3 issues" }],
      issueRows: [
        expect.objectContaining({
          title: "Missing Role Profile Snapshot",
          categoryLabel: "Snapshot integrity",
        }),
        expect.objectContaining({
          title: "Missing Model Runtime Snapshot",
          categoryLabel: "Snapshot integrity",
        }),
        expect.objectContaining({
          title: "Tool Scope Snapshot Mismatch",
          categoryLabel: "Snapshot integrity",
        }),
      ],
    });
    expect(model?.searchText).toContain("Snapshot integrity");
    expect(model?.searchText).toContain("tool_scope_snapshot_mismatch");
  });

  it("shows healthy reports without issue rows", () => {
    expect(subagentRepairDiagnosticsModel({
      ...report(),
      issueCount: 0,
      shownIssueCount: 0,
      errorCount: 0,
      warningCount: 0,
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairedSpawnEdgeRunIds: [],
      prunedDanglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      affectedRunIds: [],
      affectedThreadIds: [],
      affectedBarrierIds: [],
      actionCounts: {},
      issues: [],
    })).toMatchObject({
      statusLabel: "No repair issues",
      statusTone: "success",
      summary: "Persisted child-thread state is consistent.",
      badges: [],
      issueGroups: [],
      issueRows: [],
    });
  });

  it("counts parent-control barrier repairs as reconciled work", () => {
    const model = subagentRepairDiagnosticsModel({
      ...report(),
      issueCount: 1,
      shownIssueCount: 1,
      errorCount: 0,
      warningCount: 1,
      repairedRunIds: [],
      repairedParentControlBarrierIds: ["barrier-cancel-parent"],
      repairedSpawnEdgeRunIds: [],
      prunedDanglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      affectedRunIds: [],
      affectedThreadIds: [],
      affectedBarrierIds: ["barrier-cancel-parent"],
      actionCounts: {
        auto_reconcile_restart: 1,
      },
      issues: [{
        issueId: "parent_cancel_control_unreconciled:::parent-run:barrier-cancel-parent",
        kind: "parent_cancel_control_unreconciled",
        severity: "warning",
        messagePreview: "Parent cancel control was pending at restart.",
        parentRunId: "parent-run",
        barrierId: "barrier-cancel-parent",
        action: "auto_reconcile_restart",
        actionLabel: "Run startup reconciliation",
        destructive: false,
      }],
    });

    expect(model).toMatchObject({
      badges: ["1 warning", "1 reconciled"],
      affectedRows: [{ label: "Barriers", value: "barrier-cancel-parent" }],
    });
    expect(model?.searchText).toContain("barrier-cancel-parent");
  });

  it("filters report rows for a selected child run or thread", () => {
    expect(subagentRepairRowsForRun(report(), "run-2")).toEqual([
      expect.objectContaining({
        title: "Missing Spawn Edge",
        actionLabel: "Repair spawn edge",
      }),
    ]);
    expect(subagentRepairRowsForRun(report(), undefined, "child-1")).toEqual([
      expect.objectContaining({
        title: "Active Run Interrupted",
      }),
    ]);
  });
});

function report(): SubagentRepairDiagnosticsReport {
  return {
    schemaVersion: "ambient-subagent-repair-diagnostics-v1",
    createdAt: "2026-06-05T00:00:00.000Z",
    issueCount: 2,
    shownIssueCount: 2,
    truncatedIssues: false,
    affectedIdsTruncated: false,
    errorCount: 1,
    warningCount: 1,
    infoCount: 0,
    repairedRunIds: ["run-1"],
    repairedBarrierIds: [],
    repairedParentControlBarrierIds: [],
    repairedSpawnEdgeRunIds: ["run-2"],
    prunedDanglingSpawnEdgeRunIds: [],
    diagnosticRunIds: ["run-2"],
    affectedRunIds: ["run-1", "run-2"],
    affectedThreadIds: ["child-1", "child-2"],
    affectedBarrierIds: ["barrier-1"],
    actionCounts: {
      auto_reconcile_restart: 1,
      repair_spawn_edge: 1,
    },
    issues: [
      {
        issueId: "active_run_interrupted:run-1:child-1:parent-run:",
        kind: "active_run_interrupted",
        severity: "warning",
        messagePreview: "Run was active at restart.",
        runId: "run-1",
        threadId: "child-1",
        parentThreadId: "parent-1",
        parentRunId: "parent-run",
        action: "auto_reconcile_restart",
        actionLabel: "Run startup reconciliation",
        destructive: false,
      },
      {
        issueId: "missing_spawn_edge:run-2:child-2:parent-run:",
        kind: "missing_spawn_edge",
        severity: "error",
        messagePreview: "Missing edge.",
        runId: "run-2",
        threadId: "child-2",
        parentThreadId: "parent-1",
        parentRunId: "parent-run",
        barrierId: "barrier-1",
        action: "repair_spawn_edge",
        actionLabel: "Repair spawn edge",
        destructive: false,
      },
    ],
  };
}
