import type { SubagentMaturityGateId, SubagentMaturitySnapshot } from "../../shared/subagentMaturity";

export interface SubagentMaturityLiveHistoryRow {
  id: string;
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}

export interface SubagentMaturityLiveHistoryModel {
  statusLabel: string;
  tone: "success" | "warning";
  rows: SubagentMaturityLiveHistoryRow[];
  searchText: string;
}

const LIVE_HISTORY_GATE_IDS = new Set<SubagentMaturityGateId>([
  "live_dogfood_count",
  "live_dogfood_failure_rate",
  "live_smoke",
]);

const DESKTOP_DOGFOOD_GATE_IDS = new Set<SubagentMaturityGateId>([
  "desktop_dogfood_count",
  "desktop_dogfood_failure_rate",
]);

const WORKFLOW_JITTER_RELEASE_PROFILE_GATE_IDS = new Set<SubagentMaturityGateId>([
  "workflow_jitter_release_profile",
]);

export function subagentMaturityLiveHistoryModel(
  maturity: SubagentMaturitySnapshot,
): SubagentMaturityLiveHistoryModel {
  const history = maturity.liveHistory;
  const evidenceLanes = Array.isArray(history.evidenceLanes) ? history.evidenceLanes : [];
  const missingLaneLabels = evidenceLanes
    .filter((lane) => lane.presentRunCount === 0)
    .map((lane) => lane.label);
  const skippedLaneLabels = evidenceLanes
    .filter((lane) => lane.skippedRunCount > 0)
    .map((lane) => lane.label);
  const failureRate = history.failureRate === undefined ? "n/a" : formatPercent(history.failureRate);
  const failureLimit = formatPercent(maturity.criteria.maxLiveDogfoodFailureRate);
  const liveHistoryBlocked = maturity.blockedGateIds.some((id) => LIVE_HISTORY_GATE_IDS.has(id))
    || maturity.gates.some((gate) => LIVE_HISTORY_GATE_IDS.has(gate.id) && gate.status === "blocked");
  const rows: SubagentMaturityLiveHistoryRow[] = [
    {
      id: "clean-required-live",
      label: "Clean required-live runs",
      value: `${history.cleanRequiredRunCount}/${maturity.criteria.minLiveDogfoodRuns} clean; ${history.requiredRunCount} required-live total.`,
      tone: history.cleanRequiredRunCount >= maturity.criteria.minLiveDogfoodRuns ? "success" : "warning",
    },
    {
      id: "failure-rate",
      label: "Failure rate",
      value: history.failureRate === undefined
        ? `No required-live rows; limit ${failureLimit}.`
        : `${history.failedRequiredRunCount}/${history.requiredRunCount} failed (${failureRate}; limit ${failureLimit}).`,
      tone: history.failureRate !== undefined && history.failureRate <= maturity.criteria.maxLiveDogfoodFailureRate ? "success" : "warning",
    },
    {
      id: "live-pi-smoke",
      label: "Live Pi smoke",
      value: history.livePiSmokePassed ? "Present in required-live history." : "Missing from required-live history.",
      tone: history.livePiSmokePassed ? "success" : "warning",
    },
    {
      id: "latest-required-live",
      label: "Latest required-live",
      value: history.latestCompletedAt ?? "None recorded.",
      tone: history.latestCompletedAt ? "neutral" : "warning",
    },
    {
      id: "skipped-evidence",
      label: "Skipped evidence",
      value: `${history.skippedEvidenceRunCount} skipped-evidence row${history.skippedEvidenceRunCount === 1 ? "" : "s"}; ${history.advisoryRequiredRunCount} advisory row${history.advisoryRequiredRunCount === 1 ? "" : "s"}.`,
      tone: history.skippedEvidenceRunCount === 0 ? "success" : "warning",
    },
  ];
  if (evidenceLanes.length > 0) {
    const fullyObservedCount = evidenceLanes.filter((lane) => lane.presentRunCount > 0 && lane.skippedRunCount === 0).length;
    rows.push({
      id: "live-evidence-lanes",
      label: "Evidence lanes",
      value: `${fullyObservedCount}/${evidenceLanes.length} clean lanes; missing: ${missingLaneLabels.length ? missingLaneLabels.join(", ") : "none"}.`,
      tone: missingLaneLabels.length === 0 && skippedLaneLabels.length === 0 ? "success" : "warning",
    });
  }
  const statusLabel = `${history.cleanRequiredRunCount}/${maturity.criteria.minLiveDogfoodRuns} clean live runs`;
  return {
    statusLabel,
    tone: liveHistoryBlocked ? "warning" : "success",
    rows,
    searchText: [
      "live history",
      "required-live",
      "live_dogfood_count",
      "live_dogfood_failure_rate",
      "live_smoke",
      "Desktop dogfood confidence",
      statusLabel,
      rows.map((row) => `${row.label} ${row.value} ${row.tone}`).join(" "),
      evidenceLanes.map((lane) => `${lane.label} present ${lane.presentRunCount} skipped ${lane.skippedRunCount} latest ${lane.latestStatus ?? "n/a"}`).join(" "),
    ].join(" "),
  };
}

export function subagentMaturityDesktopDogfoodHistoryModel(
  maturity: SubagentMaturitySnapshot,
): SubagentMaturityLiveHistoryModel {
  const history = maturity.desktopDogfoodHistory;
  const failureRate = history.failureRate === undefined ? "n/a" : formatPercent(history.failureRate);
  const failureLimit = formatPercent(maturity.criteria.maxDesktopDogfoodFailureRate);
  const desktopHistoryBlocked = maturity.blockedGateIds.some((id) => DESKTOP_DOGFOOD_GATE_IDS.has(id))
    || maturity.gates.some((gate) => DESKTOP_DOGFOOD_GATE_IDS.has(gate.id) && gate.status === "blocked");
  const rows: SubagentMaturityLiveHistoryRow[] = [
    {
      id: "ready-desktop-dogfood",
      label: "Ready Desktop dogfood runs",
      value: `${history.readyRunCount}/${maturity.criteria.minDesktopDogfoodRuns} ready; ${history.totalRunCount} total.`,
      tone: history.readyRunCount >= maturity.criteria.minDesktopDogfoodRuns ? "success" : "warning",
    },
    {
      id: "desktop-failure-rate",
      label: "Desktop failure rate",
      value: history.failureRate === undefined
        ? `No Desktop dogfood rows; limit ${failureLimit}.`
        : `${history.failedRunCount}/${history.totalRunCount} failed (${failureRate}; limit ${failureLimit}).`,
      tone: history.failureRate !== undefined && history.failureRate <= maturity.criteria.maxDesktopDogfoodFailureRate ? "success" : "warning",
    },
    {
      id: "desktop-visual-failures",
      label: "Visual assertions",
      value: `${history.visualFailureRunCount} visual-failure row${history.visualFailureRunCount === 1 ? "" : "s"}; ${history.screenshotRunCount} row${history.screenshotRunCount === 1 ? "" : "s"} with screenshots.`,
      tone: history.visualFailureRunCount === 0 && history.readyRunCount > 0 ? "success" : "warning",
    },
    {
      id: "desktop-maturity-failures",
      label: "Maturity assertions",
      value: `${history.maturityFailureRunCount} maturity-failure row${history.maturityFailureRunCount === 1 ? "" : "s"}; ${history.highLoadReadyRunCount} high-load ready row${history.highLoadReadyRunCount === 1 ? "" : "s"}.`,
      tone: history.maturityFailureRunCount === 0 && history.highLoadReadyRunCount >= maturity.criteria.minDesktopDogfoodRuns ? "success" : "warning",
    },
    {
      id: "latest-desktop-dogfood",
      label: "Latest Desktop dogfood",
      value: history.latestGeneratedAt ?? "None recorded.",
      tone: history.latestGeneratedAt ? "neutral" : "warning",
    },
  ];
  const statusLabel = `${history.readyRunCount}/${maturity.criteria.minDesktopDogfoodRuns} ready Desktop runs`;
  return {
    statusLabel,
    tone: desktopHistoryBlocked ? "warning" : "success",
    rows,
    searchText: [
      "desktop dogfood history",
      "full-app dogfood",
      "desktop_dogfood_count",
      "desktop_dogfood_failure_rate",
      "visual assertions",
      "high-load ready",
      statusLabel,
      rows.map((row) => `${row.label} ${row.value} ${row.tone}`).join(" "),
    ].join(" "),
  };
}

export function subagentMaturityWorkflowJitterReleaseProfileModel(
  maturity: SubagentMaturitySnapshot,
): SubagentMaturityLiveHistoryModel {
  const profile = maturity.workflowJitterReleaseProfile;
  const profileBlocked = maturity.blockedGateIds.some((id) => WORKFLOW_JITTER_RELEASE_PROFILE_GATE_IDS.has(id))
    || maturity.gates.some((gate) => WORKFLOW_JITTER_RELEASE_PROFILE_GATE_IDS.has(gate.id) && gate.status === "blocked");
  const missingFamilies = profile.missingLiveFamilies.length ? profile.missingLiveFamilies.join(", ") : "none";
  const liveFamilies = profile.liveFamilies.length ? profile.liveFamilies.join(", ") : "none";
  const rows: SubagentMaturityLiveHistoryRow[] = [
    {
      id: "workflow-jitter-ready",
      label: "Release profile",
      value: profile.ready ? "Ready for graduation evidence." : "Missing or not release-ready.",
      tone: profile.ready ? "success" : "warning",
    },
    {
      id: "workflow-jitter-mode",
      label: "Mode",
      value: `profile ${profile.matrixProfile ?? "missing"}; release profile ${profile.releaseProfile ? "yes" : "no"}; live required ${profile.liveRequired ? "yes" : "no"}; live skipped ${profile.liveSkipped ? "yes" : "no"}.`,
      tone: profile.matrixProfile === "release" && profile.releaseProfile && profile.liveRequired && !profile.liveSkipped ? "success" : "warning",
    },
    {
      id: "workflow-jitter-live-volume",
      label: "Live workflow dogfood",
      value: `${profile.liveDogfoodRunCount}/10 UI dogfood runs; ${profile.livePromptVariantCount}/120 live prompt variants.`,
      tone: profile.liveDogfoodRunCount >= 10 && profile.livePromptVariantCount >= 120 ? "success" : "warning",
    },
    {
      id: "workflow-jitter-deterministic-stress",
      label: "Deterministic stress",
      value: `${profile.deterministicStressUnitCount}/1000 stress units.`,
      tone: profile.deterministicStressUnitCount >= 1000 ? "success" : "warning",
    },
    {
      id: "workflow-jitter-live-families",
      label: "Live families",
      value: `${profile.liveFamilies.length}/6 families: ${liveFamilies}; missing: ${missingFamilies}.`,
      tone: profile.missingLiveFamilies.length === 0 ? "success" : "warning",
    },
    {
      id: "workflow-jitter-issues",
      label: "Issues",
      value: `${profile.blockingIssueCount} blocking; ${profile.advisoryIssueCount} advisory; ${profile.productOrTestFailureCount} product/test; ${profile.providerDegradedCount} degraded; ${profile.environmentSkippedCount} skipped; ${profile.promotionCandidateCount} promotion candidates.`,
      tone: profile.blockingIssueCount === 0 &&
        profile.productOrTestFailureCount === 0 &&
        profile.providerDegradedCount === 0 &&
        profile.environmentSkippedCount === 0 &&
        profile.promotionCandidateCount === 0
        ? "success"
        : "warning",
    },
    {
      id: "workflow-jitter-latest-report",
      label: "Latest report",
      value: profile.latestGeneratedAt
        ? `${profile.latestGeneratedAt}; ${profile.reportPath ?? "path not recorded"}.`
        : "None recorded.",
      tone: profile.latestGeneratedAt ? "neutral" : "warning",
    },
  ];
  const statusLabel = profile.ready
    ? "workflow jitter release profile ready"
    : "workflow jitter release profile blocked";
  return {
    statusLabel,
    tone: profileBlocked ? "warning" : "success",
    rows,
    searchText: [
      "workflow jitter release profile",
      "workflow_jitter_release_profile",
      "release-profile workflow evidence",
      "matrix.release-profile",
      statusLabel,
      rows.map((row) => `${row.label} ${row.value} ${row.tone}`).join(" "),
      `families ${liveFamilies}`,
      `missing families ${missingFamilies}`,
      profile.matrixReportPath ?? "",
      profile.reportPath ?? "",
    ].join(" "),
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
