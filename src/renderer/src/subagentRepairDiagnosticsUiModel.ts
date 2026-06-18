import type { SubagentRepairDiagnosticItem, SubagentRepairDiagnosticsReport, SubagentRepairIssueKind } from "../../shared/subagentTypes";

export interface SubagentRepairDiagnosticsModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "danger";
  summary: string;
  badges: string[];
  searchText: string;
  issueRows: SubagentRepairDiagnosticRowModel[];
  issueGroups: Array<{ label: string; value: string }>;
  affectedRows: Array<{ label: string; value: string }>;
}

export interface SubagentRepairDiagnosticRowModel {
  key: string;
  title: string;
  categoryLabel: string;
  detail: string;
  tone: "warning" | "danger" | "neutral";
  actionLabel: string;
  meta: string;
}

export function subagentRepairDiagnosticsModel(
  report: SubagentRepairDiagnosticsReport | undefined,
): SubagentRepairDiagnosticsModel | undefined {
  if (!report) return undefined;
  const statusTone: SubagentRepairDiagnosticsModel["statusTone"] = report.errorCount > 0
    ? "danger"
    : report.warningCount > 0
      ? "warning"
      : "success";
  const reconciledCount =
    report.repairedRunIds.length +
    report.repairedParentControlBarrierIds.length +
    report.repairedSpawnEdgeRunIds.length +
    report.prunedDanglingSpawnEdgeRunIds.length;
  const statusLabel = report.issueCount === 0
    ? "No repair issues"
    : `${report.issueCount} repair issue${report.issueCount === 1 ? "" : "s"}`;
  const affectedRows = [
    report.affectedRunIds.length ? { label: "Runs", value: idList(report.affectedRunIds) } : undefined,
    report.affectedThreadIds.length ? { label: "Threads", value: idList(report.affectedThreadIds) } : undefined,
    report.affectedBarrierIds.length ? { label: "Barriers", value: idList(report.affectedBarrierIds) } : undefined,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const issueRows = report.issues.map(repairDiagnosticRow);
  const issueGroups = repairIssueGroups(report.issues);
  const snapshotGroup = issueGroups.find((group) => group.label === "Snapshot integrity");
  const badges = [
    report.errorCount > 0 ? `${report.errorCount} error${report.errorCount === 1 ? "" : "s"}` : undefined,
    report.warningCount > 0 ? `${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}` : undefined,
    snapshotGroup ? `Snapshot ${snapshotGroup.value}` : undefined,
    reconciledCount > 0 ? `${reconciledCount} reconciled` : undefined,
    report.diagnosticRunIds.length > 0 ? `${report.diagnosticRunIds.length} diagnostic` : undefined,
    report.truncatedIssues ? "Truncated" : undefined,
  ].filter((item): item is string => Boolean(item));
  const actionSummary = Object.entries(report.actionCounts)
    .map(([action, count]) => `${actionLabel(action)} ${count}`)
    .join("; ");

  return {
    statusLabel,
    statusTone,
    summary: report.issueCount === 0
      ? "Persisted child-thread state is consistent."
      : [
          `${report.errorCount} error${report.errorCount === 1 ? "" : "s"}`,
          `${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}`,
          report.truncatedIssues ? `${report.issueCount - report.shownIssueCount} hidden` : undefined,
        ].filter(Boolean).join(", "),
    badges,
    searchText: [
      statusLabel,
      report.schemaVersion,
      issueGroups.map((group) => `${group.label} ${group.value}`).join(" "),
      actionSummary,
      report.repairedParentControlBarrierIds.join(" "),
      report.repairedSpawnEdgeRunIds.join(" "),
      report.prunedDanglingSpawnEdgeRunIds.join(" "),
      report.issues.map((issue) => `${issueCategoryLabel(issue.kind)} ${issue.kind} ${issue.actionLabel} ${issue.messagePreview} ${issue.runId ?? ""} ${issue.threadId ?? ""} ${issue.barrierId ?? ""}`).join(" "),
    ].join(" "),
    issueRows,
    issueGroups,
    affectedRows,
  };
}

export function subagentRepairRowsForRun(
  report: SubagentRepairDiagnosticsReport | undefined,
  runId: string | undefined,
  threadId?: string,
): SubagentRepairDiagnosticRowModel[] {
  if (!report || (!runId && !threadId)) return [];
  return report.issues
    .filter((issue) => (runId && issue.runId === runId) || (threadId && issue.threadId === threadId))
    .map(repairDiagnosticRow);
}

function repairDiagnosticRow(issue: SubagentRepairDiagnosticItem): SubagentRepairDiagnosticRowModel {
  return {
    key: issue.issueId,
    title: issue.kind.split("_").map(titleCase).join(" "),
    categoryLabel: issueCategoryLabel(issue.kind),
    detail: issue.messagePreview,
    tone: issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "neutral",
    actionLabel: issue.actionLabel,
    meta: [
      issue.runId ? `run ${issue.runId}` : undefined,
      issue.threadId ? `thread ${issue.threadId}` : undefined,
      issue.barrierId ? `barrier ${issue.barrierId}` : undefined,
    ].filter(Boolean).join(" / "),
  };
}

function repairIssueGroups(issues: SubagentRepairDiagnosticItem[]): Array<{ label: string; value: string }> {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const label = issueCategoryLabel(issue.kind);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => ({
      label,
      value: `${count} ${count === 1 ? "issue" : "issues"}`,
    }));
}

function issueCategoryLabel(kind: SubagentRepairIssueKind): string {
  switch (kind) {
    case "missing_feature_flag_snapshot":
    case "subagent_feature_flag_disabled":
    case "missing_role_profile_snapshot":
    case "role_profile_snapshot_mismatch":
    case "missing_model_runtime_snapshot":
    case "model_runtime_snapshot_mismatch":
    case "missing_capacity_lease":
    case "capacity_lease_mismatch":
    case "missing_prompt_snapshot":
    case "prompt_snapshot_mismatch":
    case "missing_tool_scope_snapshot":
    case "tool_scope_snapshot_mismatch":
      return "Snapshot integrity";
    case "missing_lifecycle_start":
    case "missing_lifecycle_stop":
    case "active_run_interrupted":
    case "parent_cancel_control_unreconciled":
      return "Lifecycle";
    case "missing_result_artifact":
    case "invalid_result_artifact":
    case "result_artifact_mismatch":
      return "Result artifact";
    case "missing_parent_thread":
    case "missing_child_thread":
    case "orphan_child_parent_thread":
    case "orphan_child_thread":
    case "thread_run_mismatch":
    case "missing_spawn_edge":
    case "dangling_spawn_edge":
    case "spawn_edge_mismatch":
    case "dangling_wait_barrier_child":
      return "Tree linkage";
  }
}

function idList(ids: string[]): string {
  return ids.length > 5 ? `${ids.slice(0, 5).join(", ")} +${ids.length - 5}` : ids.join(", ");
}

function actionLabel(action: string): string {
  return action.split("_").map(titleCase).join(" ");
}

function titleCase(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
