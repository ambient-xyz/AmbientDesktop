import type { DiagnosticExportLocalRuntimeEvidence, DiagnosticExportLocalRuntimeSummary } from "../../shared/diagnosticTypes";

export interface LocalRuntimeEvidenceInspectorModel {
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
  summary: string;
  badges: string[];
  countsRows: Array<{ label: string; value: string }>;
  runtimeRows: LocalRuntimeEvidenceRowModel[];
  ownerRows: LocalRuntimeEvidenceRowModel[];
  blockedActionRows: LocalRuntimeEvidenceRowModel[];
  nextSafeActionRows: LocalRuntimeEvidenceRowModel[];
  memoryRows: LocalRuntimeEvidenceRowModel[];
  searchText: string;
}

export interface LocalRuntimeEvidenceRowModel {
  key: string;
  title: string;
  detail: string;
  meta: string;
  tone: "success" | "warning" | "danger" | "neutral";
}

export function localRuntimeEvidenceInspectorModel(
  evidence: DiagnosticExportLocalRuntimeEvidence | undefined,
  summary?: DiagnosticExportLocalRuntimeSummary,
): LocalRuntimeEvidenceInspectorModel | undefined {
  if (!evidence && !summary) return undefined;

  const statusTone = summary ? summaryTone(summary) : evidenceTone(evidence);
  const statusLabel = summary ? summaryStatusLabel(summary) : evidenceStatusLabel(evidence);
  const boundedEvidence = Boolean(evidence?.truncated || (evidence && evidence.shownCounts.runtimes < evidence.counts.runtimes));
  const badges = [
    summary?.status && summary.status !== "healthy" ? titleCase(summary.status) : undefined,
    boundedEvidence ? "Bounded runtime evidence" : undefined,
    evidence && evidence.counts.activeOwners > 0 ? countLabel(evidence.counts.activeOwners, "active owner") : undefined,
    evidence && evidence.counts.blockedActions > 0 ? countLabel(evidence.counts.blockedActions, "blocked action") : undefined,
    evidence && evidence.counts.nextSafeActions > 0 ? countLabel(evidence.counts.nextSafeActions, "next safe action") : undefined,
    evidence && evidence.runtimes.some((runtime) => runtime.untracked) ? "Untracked runtime present" : undefined,
    evidence?.memoryEvidence.activeResidentMemoryBasis ? `Memory basis ${memoryBasisLabel(evidence.memoryEvidence.activeResidentMemoryBasis)}` : undefined,
    evidence && evidence.memoryEvidence.uncertaintyReasons.length > 0 ? `${evidence.memoryEvidence.uncertaintyReasons.length} memory uncertainty reason${evidence.memoryEvidence.uncertaintyReasons.length === 1 ? "" : "s"}` : undefined,
    summary && summary.errorMessages.length > 0 ? `${summary.errorMessages.length} collection error${summary.errorMessages.length === 1 ? "" : "s"}` : undefined,
  ].filter((badge): badge is string => Boolean(badge));

  const countsRows = evidence ? [
    evidenceCountRow("Runtimes", evidence.counts.runtimes, evidence.shownCounts.runtimes),
    evidenceCountRow("Active owners", evidence.counts.activeOwners, evidence.shownCounts.activeOwners),
    evidenceCountRow("Blocked actions", evidence.counts.blockedActions, evidence.shownCounts.blockedActions),
    evidenceCountRow("Next safe actions", evidence.counts.nextSafeActions, evidence.shownCounts.nextSafeActions),
  ] : [];
  const runtimeRows = evidence?.runtimes.map(runtimeRow) ?? [];
  const ownerRows = evidence?.activeOwners.map(ownerRow) ?? [];
  const blockedActionRows = evidence?.blockedActions.map(blockedActionRow) ?? [];
  const nextSafeActionRows = evidence?.nextSafeActions.map(nextSafeActionRow) ?? [];
  const memoryRows = evidence ? memoryEvidenceRows(evidence.memoryEvidence) : [];

  return {
    statusLabel,
    statusTone,
    summary: summary?.message ?? evidenceSummary(evidence),
    badges,
    countsRows,
    runtimeRows,
    ownerRows,
    blockedActionRows,
    nextSafeActionRows,
    memoryRows,
    searchText: [
      statusLabel,
      summary?.message,
      summary?.errorMessages.join(" "),
      badges.join(" "),
      countsRows.map((row) => `${row.label} ${row.value}`).join(" "),
      runtimeRows.map(rowSearchText).join(" "),
      ownerRows.map(rowSearchText).join(" "),
      blockedActionRows.map(rowSearchText).join(" "),
      nextSafeActionRows.map(rowSearchText).join(" "),
      memoryRows.map(rowSearchText).join(" "),
    ].filter(Boolean).join(" "),
  };
}

function runtimeRow(runtime: DiagnosticExportLocalRuntimeEvidence["runtimes"][number]): LocalRuntimeEvidenceRowModel {
  const lifecycle = [
    `Stop ${runtime.ordinaryStopAllowed ? "allowed" : "blocked"}: ${runtime.stopReason}`,
    `Restart ${runtime.ordinaryRestartAllowed ? "allowed" : "blocked"}: ${runtime.restartReason}`,
    runtime.forceStopRequiresSubagentCancellation || runtime.forceRestartRequiresSubagentCancellation
      ? "Forced Stop/Restart cancels affected sub-agents"
      : undefined,
    runtime.untracked ? "Untracked process; do not assume safe to stop" : undefined,
  ].filter(Boolean).join(" / ");
  return {
    key: `runtime:${runtime.sequence}:${runtime.runtimeEntryId}`,
    title: `${runtime.runtimeEntryId} (${runtime.running ? "Running" : "Stopped"})`,
    detail: truncate([
      `Capability ${statusValueLabel(runtime.capability)}`,
      `Tracking ${statusValueLabel(runtime.trackingStatus)}`,
      runtime.ownerLabels.length ? `In use by ${idList(runtime.ownerLabels)}` : "No active owner labels",
      lifecycle,
    ].filter(Boolean).join(" | "), 320),
    meta: [
      runtime.providerId ? `provider ${runtime.providerId}` : undefined,
      runtime.modelRuntimeId ? `runtime ${runtime.modelRuntimeId}` : undefined,
      runtime.modelProfileId ? `profile ${runtime.modelProfileId}` : undefined,
      runtime.modelId ? `model ${runtime.modelId}` : undefined,
      runtime.pid !== undefined ? `pid ${runtime.pid}` : undefined,
      runtime.endpoint ? `endpoint ${runtime.endpoint}` : undefined,
      runtimeMemoryLabel(runtime),
      runtime.activeLeaseIds.length ? `active leases ${idList(runtime.activeLeaseIds)}` : undefined,
      runtime.staleLeaseIds.length ? `stale leases ${idList(runtime.staleLeaseIds)}` : undefined,
      runtime.crashedLeaseIds.length ? `crashed leases ${idList(runtime.crashedLeaseIds)}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: runtimeTone(runtime),
  };
}

function ownerRow(owner: DiagnosticExportLocalRuntimeEvidence["activeOwners"][number]): LocalRuntimeEvidenceRowModel {
  return {
    key: `owner:${owner.sequence}:${owner.leaseId}`,
    title: `${owner.displayName} (${statusValueLabel(owner.status)})`,
    detail: [
      `Owns ${owner.runtimeEntryId}`,
      `Capability ${statusValueLabel(owner.capabilityKind)}`,
      ownerMemoryLabel(owner),
    ].filter(Boolean).join(" / "),
    meta: [
      `lease ${owner.leaseId}`,
      owner.parentThreadId ? `parent thread ${owner.parentThreadId}` : undefined,
      owner.subagentThreadId ? `sub-agent thread ${owner.subagentThreadId}` : undefined,
      owner.subagentRunId ? `sub-agent run ${owner.subagentRunId}` : undefined,
      owner.providerId ? `provider ${owner.providerId}` : undefined,
      owner.modelRuntimeId ? `runtime ${owner.modelRuntimeId}` : undefined,
      owner.modelProfileId ? `profile ${owner.modelProfileId}` : undefined,
      owner.modelId ? `model ${owner.modelId}` : undefined,
      owner.pid !== undefined ? `pid ${owner.pid}` : undefined,
      owner.endpoint ? `endpoint ${owner.endpoint}` : undefined,
      `acquired ${owner.acquiredAt}`,
      `heartbeat ${owner.lastHeartbeatAt}`,
    ].filter(Boolean).join(" / "),
    tone: ownerTone(owner.status),
  };
}

function blockedActionRow(action: DiagnosticExportLocalRuntimeEvidence["blockedActions"][number]): LocalRuntimeEvidenceRowModel {
  return {
    key: `blocked-action:${action.sequence}:${action.runtimeEntryId}:${action.action}`,
    title: `${statusValueLabel(action.action)} blocked for ${action.runtimeEntryId}`,
    detail: truncate([
      action.reason,
      action.forceAllowed ? "Force available" : "No force path",
      action.forceRequiresSubagentCancellation ? "Forced action must cancel or mark affected sub-agents" : undefined,
      action.untracked ? "Untracked process; ask user before stopping" : undefined,
    ].filter(Boolean).join(" / "), 280),
    meta: [
      action.blockerLeaseIds.length ? `blockers ${idList(action.blockerLeaseIds)}` : undefined,
      action.affectedSubagentLabels.length ? `affected ${idList(action.affectedSubagentLabels)}` : undefined,
      action.affectedSubagentThreadIds.length ? `threads ${idList(action.affectedSubagentThreadIds)}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: action.untracked ? "danger" : action.forceRequiresSubagentCancellation || action.forceAllowed ? "warning" : "danger",
  };
}

function nextSafeActionRow(action: DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]): LocalRuntimeEvidenceRowModel {
  const resolution = action.ownershipResolution;
  return {
    key: `next-safe-action:${action.sequence}:${action.action}:${action.runtimeEntryId ?? action.runtimeId ?? "global"}`,
    title: `${statusValueLabel(action.action)} (${statusValueLabel(action.safety)})`,
    detail: truncate([
      action.reason,
      resolution ? `Ownership resolution: ${statusValueLabel(resolution.resolution)}; ${resolution.reason}` : undefined,
      action.untracked ? "Untracked process remains user-owned" : undefined,
    ].filter(Boolean).join(" / "), 280),
    meta: [
      action.runtimeEntryId ? `runtime entry ${action.runtimeEntryId}` : undefined,
      action.runtimeId ? `runtime ${action.runtimeId}` : undefined,
      action.capability ? `capability ${statusValueLabel(action.capability)}` : undefined,
      action.toolName ? `tool ${action.toolName}` : undefined,
      action.blockerLeaseIds?.length ? `blockers ${idList(action.blockerLeaseIds)}` : undefined,
      action.affectedSubagentLabels?.length ? `affected ${idList(action.affectedSubagentLabels)}` : undefined,
      resolution?.blockerLeaseIds.length ? `resolution blockers ${idList(resolution.blockerLeaseIds)}` : undefined,
    ].filter(Boolean).join(" / "),
    tone: action.untracked ? "danger" : nextSafeActionTone(action.safety),
  };
}

function memoryEvidenceRows(memory: DiagnosticExportLocalRuntimeEvidence["memoryEvidence"]): LocalRuntimeEvidenceRowModel[] {
  const rows: LocalRuntimeEvidenceRowModel[] = [{
    key: "memory:active",
    title: "Active resident memory",
    detail: [
      `${formatBytes(memory.activeEstimatedResidentMemoryBytes)} estimated`,
      memory.activeActualResidentMemoryBytes !== undefined ? `${formatBytes(memory.activeActualResidentMemoryBytes)} actual` : undefined,
      memory.activeResidentMemoryBasis ? `basis ${memoryBasisLabel(memory.activeResidentMemoryBasis)}` : undefined,
    ].filter(Boolean).join(" / "),
    meta: [
      `${memory.entryCountWithActualRss} actual RSS`,
      `${memory.entryCountWithOnlyEstimate} estimate-only`,
      `${memory.entryCountWithUnknownMemory} unknown`,
    ].join(" / "),
    tone: memory.entryCountWithUnknownMemory > 0 || memory.entryCountWithOnlyEstimate > 0 ? "warning" : "neutral",
  }];

  if (
    memory.requestedEstimatedResidentMemoryBytes !== undefined
    || memory.projectedEstimatedResidentMemoryBytes !== undefined
    || memory.projectedResidentMemoryBytes !== undefined
    || memory.projectedSystemMemoryUtilization !== undefined
    || memory.projectedFreeMemoryBytes !== undefined
    || memory.projectedFreeMemoryRatio !== undefined
  ) {
    rows.push({
      key: "memory:projected",
      title: "Projected memory policy",
      detail: [
        memory.requestedEstimatedResidentMemoryBytes !== undefined ? `request ${formatBytes(memory.requestedEstimatedResidentMemoryBytes)}` : undefined,
        memory.projectedEstimatedResidentMemoryBytes !== undefined ? `estimated ${formatBytes(memory.projectedEstimatedResidentMemoryBytes)}` : undefined,
        memory.projectedResidentMemoryBytes !== undefined ? `resident ${formatBytes(memory.projectedResidentMemoryBytes)}` : undefined,
        memory.projectedSystemMemoryUtilization !== undefined ? `utilization ${formatPercent(memory.projectedSystemMemoryUtilization)}` : undefined,
        memory.projectedFreeMemoryBytes !== undefined ? `free ${formatBytes(memory.projectedFreeMemoryBytes)}` : undefined,
        memory.projectedFreeMemoryRatio !== undefined ? `free ratio ${formatPercent(memory.projectedFreeMemoryRatio)}` : undefined,
      ].filter(Boolean).join(" / "),
      meta: memory.uncertaintyReasons.length ? `uncertainty ${idList(memory.uncertaintyReasons)}` : "No uncertainty recorded",
      tone: projectedMemoryTone(memory),
    });
  }

  if (memory.uncertaintyReasons.length > 0) {
    rows.push({
      key: "memory:uncertainty",
      title: "Memory uncertainty",
      detail: idList(memory.uncertaintyReasons, 6),
      meta: countLabel(memory.uncertaintyReasons.length, "reason"),
      tone: "warning",
    });
  }

  return rows;
}

function runtimeTone(runtime: DiagnosticExportLocalRuntimeEvidence["runtimes"][number]): LocalRuntimeEvidenceRowModel["tone"] {
  if (runtime.untracked) return "danger";
  if (!runtime.ordinaryStopAllowed || !runtime.ordinaryRestartAllowed || runtime.activeLeaseIds.length > 0 || runtime.crashedLeaseIds.length > 0) {
    return "warning";
  }
  return runtime.running ? "success" : "neutral";
}

function ownerTone(status: DiagnosticExportLocalRuntimeEvidence["activeOwners"][number]["status"]): LocalRuntimeEvidenceRowModel["tone"] {
  if (status === "crashed") return "danger";
  if (status === "released") return "neutral";
  return "warning";
}

function nextSafeActionTone(safety: DiagnosticExportLocalRuntimeEvidence["nextSafeActions"][number]["safety"]): LocalRuntimeEvidenceRowModel["tone"] {
  if (safety === "blocked") return "danger";
  if (safety === "requires-approval") return "warning";
  if (safety === "safe") return "success";
  return "neutral";
}

function projectedMemoryTone(memory: DiagnosticExportLocalRuntimeEvidence["memoryEvidence"]): LocalRuntimeEvidenceRowModel["tone"] {
  if (memory.projectedFreeMemoryRatio !== undefined && memory.projectedFreeMemoryRatio < 0.2) return "danger";
  if (memory.projectedSystemMemoryUtilization !== undefined && memory.projectedSystemMemoryUtilization >= 0.8) return "warning";
  if (memory.uncertaintyReasons.length > 0) return "warning";
  return "neutral";
}

function evidenceStatusLabel(evidence: DiagnosticExportLocalRuntimeEvidence | undefined): string {
  if (!evidence) return "Local runtime evidence unavailable";
  if (evidence.counts.runtimes === 0) return "No local runtime rows";
  return countLabel(evidence.counts.runtimes, "runtime");
}

function evidenceSummary(evidence: DiagnosticExportLocalRuntimeEvidence | undefined): string {
  if (!evidence) return "Local runtime evidence was not available.";
  if (evidence.counts.runtimes === 0) return "No local runtime rows were present in this diagnostic bundle.";
  return `Captured ${countLabel(evidence.counts.runtimes, "runtime")} with ${countLabel(evidence.counts.activeOwners, "active owner")} and ${countLabel(evidence.counts.blockedActions, "blocked action")}.`;
}

function evidenceTone(evidence: DiagnosticExportLocalRuntimeEvidence | undefined): LocalRuntimeEvidenceInspectorModel["statusTone"] {
  if (!evidence) return "neutral";
  if (evidence.runtimes.some((runtime) => runtime.untracked)) return "danger";
  if (evidence.truncated || evidence.counts.blockedActions > 0 || evidence.counts.activeOwners > 0) return "warning";
  return "success";
}

function summaryStatusLabel(summary: DiagnosticExportLocalRuntimeSummary): string {
  if (summary.status === "error") return "Local runtime evidence failed";
  if (summary.status === "unavailable") return "Local runtime evidence unavailable";
  if (summary.activeLeaseCount > 0) return countLabel(summary.activeLeaseCount, "active lease");
  if (summary.stopBlockedCount > 0 || summary.restartBlockedCount > 0) {
    return countLabel(summary.stopBlockedCount + summary.restartBlockedCount, "blocked lifecycle action");
  }
  if (summary.runtimeCount > 0) return countLabel(summary.runtimeCount, "runtime");
  return "No local runtime rows";
}

function summaryTone(summary: DiagnosticExportLocalRuntimeSummary): LocalRuntimeEvidenceInspectorModel["statusTone"] {
  if (summary.status === "error") return "danger";
  if (summary.status === "needs_attention" || summary.stopBlockedCount > 0 || summary.restartBlockedCount > 0 || summary.untrackedCount > 0 || summary.errorMessages.length > 0) {
    return "warning";
  }
  if (summary.status === "healthy") return "success";
  return "neutral";
}

function evidenceCountRow(label: string, total: number, shown: number): { label: string; value: string } {
  return { label, value: total === shown ? String(total) : `${shown}/${total} shown` };
}

function runtimeMemoryLabel(runtime: DiagnosticExportLocalRuntimeEvidence["runtimes"][number]): string | undefined {
  const labels = [
    runtime.actualResidentMemoryBytes !== undefined ? `Actual RSS ${formatBytes(runtime.actualResidentMemoryBytes)}` : undefined,
    runtime.estimatedResidentMemoryBytes !== undefined ? `Estimate ${formatBytes(runtime.estimatedResidentMemoryBytes)}` : undefined,
    runtime.memorySampledAt ? `sampled ${runtime.memorySampledAt}` : undefined,
  ].filter(Boolean);
  return labels.length ? labels.join(" / ") : undefined;
}

function ownerMemoryLabel(owner: DiagnosticExportLocalRuntimeEvidence["activeOwners"][number]): string | undefined {
  const labels = [
    owner.actualResidentMemoryBytes !== undefined ? `${formatBytes(owner.actualResidentMemoryBytes)} actual` : undefined,
    owner.estimatedResidentMemoryBytes !== undefined ? `${formatBytes(owner.estimatedResidentMemoryBytes)} estimated` : undefined,
  ].filter(Boolean);
  return labels.length ? labels.join("; ") : undefined;
}

function memoryBasisLabel(value: string): string {
  if (value === "actual-rss") return "Actual RSS";
  if (value === "estimate-only") return "Estimate only";
  if (value === "mixed") return "Mixed";
  if (value === "unknown") return "Unknown";
  return statusValueLabel(value);
}

function statusValueLabel(value: string): string {
  return titleCase(value.replace(/\./g, " "));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function idList(values: readonly string[], limit = 3): string {
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} +${values.length - limit} more`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function rowSearchText(row: LocalRuntimeEvidenceRowModel): string {
  return `${row.key} ${row.title} ${row.detail} ${row.meta} ${row.tone}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}

function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${formatNumber(gib)} GiB`;
  const mib = bytes / 1024 ** 2;
  if (mib >= 1) return `${formatNumber(mib)} MiB`;
  return `${bytes.toLocaleString()} B`;
}

function formatNumber(value: number): string {
  if (value >= 10) return Math.round(value).toLocaleString();
  return value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
