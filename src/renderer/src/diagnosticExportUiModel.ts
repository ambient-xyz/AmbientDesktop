import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";

export function diagnosticExportStatusMessage(
  result: DiagnosticExportResult,
  formatFileSize: (bytes: number) => string = formatDiagnosticExportFileSize,
): string {
  return diagnosticBundleStatusMessage(result, "Saved", formatFileSize);
}

export function diagnosticImportStatusMessage(
  result: DiagnosticExportResult,
  formatFileSize: (bytes: number) => string = formatDiagnosticExportFileSize,
): string {
  return diagnosticBundleStatusMessage(result, "Imported", formatFileSize);
}

function diagnosticBundleStatusMessage(
  result: DiagnosticExportResult,
  verb: "Saved" | "Imported",
  formatFileSize: (bytes: number) => string,
): string {
  const name = result.path.split(/[\\/]/).pop() || result.path;
  const base = `${verb} ${name} (${formatFileSize(result.bytes)}).`;
  const repair = result.summary?.subagents.repairDiagnostics;
  const observability = result.summary?.subagents.observability;
  const attribution = result.summary?.subagents.attribution;
  const replayEvidence = result.summary?.subagents.replayEvidence;
  const localRuntimes = result.summary?.localRuntimes;
  const agentMemory = result.summary?.agentMemory;
  const agentMemoryStarter = result.summary?.agentMemoryStarter;
  const featureFlags = result.summary?.featureFlags;
  const notices = [
    featureFlags ? diagnosticFeatureFlagNotice(featureFlags) : undefined,
    agentMemory ? diagnosticAgentMemoryNotice(agentMemory) : undefined,
    agentMemoryStarter ? diagnosticAgentMemoryStarterNotice(agentMemoryStarter) : undefined,
    repair ? diagnosticRepairNotice(repair) : undefined,
    observability ? diagnosticObservabilityNotice(observability) : undefined,
    attribution ? diagnosticAttributionNotice(attribution) : undefined,
    replayEvidence ? diagnosticReplayEvidenceNotice(replayEvidence) : undefined,
    localRuntimes ? diagnosticLocalRuntimeNotice(localRuntimes) : undefined,
  ].filter(Boolean);
  return notices.length ? `${base} ${notices.join(" ")}` : base;
}

type RepairSummary = NonNullable<DiagnosticExportResult["summary"]>["subagents"]["repairDiagnostics"];
type ObservabilitySummary = NonNullable<DiagnosticExportResult["summary"]>["subagents"]["observability"];
type AttributionSummary = NonNullable<DiagnosticExportResult["summary"]>["subagents"]["attribution"];
type ReplayEvidenceSummary = NonNullable<DiagnosticExportResult["summary"]>["subagents"]["replayEvidence"];
type LocalRuntimeSummary = NonNullable<NonNullable<DiagnosticExportResult["summary"]>["localRuntimes"]>;
type AgentMemorySummary = NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemory"]>;
type AgentMemoryStarterSummary = NonNullable<NonNullable<DiagnosticExportResult["summary"]>["agentMemoryStarter"]>;
type FeatureFlagsSummary = NonNullable<NonNullable<DiagnosticExportResult["summary"]>["featureFlags"]>;

function diagnosticFeatureFlagNotice(featureFlags: FeatureFlagsSummary): string | undefined {
  const flag = featureFlags.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG];
  if (!flag) return undefined;
  return `${AMBIENT_SUBAGENTS_FEATURE_FLAG} ${flag.enabled ? "enabled" : "disabled"} via ${formatFeatureFlagSource(flag.source)}.`;
}

function formatFeatureFlagSource(source: string): string {
  return source.replace(/_/g, " ");
}

function diagnosticRepairNotice(repair: RepairSummary): string | undefined {
  if (repair.status === "healthy" || repair.status === "unavailable") return undefined;
  if (repair.status === "error") {
    return repair.message;
  }

  const details = [
    repair.errorCount > 0 ? `${repair.errorCount} error${repair.errorCount === 1 ? "" : "s"}` : undefined,
    repair.warningCount > 0 ? `${repair.warningCount} warning${repair.warningCount === 1 ? "" : "s"}` : undefined,
    repair.truncatedIssues ? `${repair.shownIssueCount} shown` : undefined,
  ].filter(Boolean).join(", ");
  return `${repair.message}${details ? ` (${details})` : ""}`;
}

function diagnosticAgentMemoryNotice(agentMemory: AgentMemorySummary): string | undefined {
  if (agentMemory.status === "healthy" || agentMemory.status === "unavailable") return undefined;
  if (agentMemory.status === "error") return agentMemory.message;
  const details = [
    agentMemory.fileCount > 0 ? `${agentMemory.fileCount} memory file${agentMemory.fileCount === 1 ? "" : "s"}` : undefined,
    agentMemory.runtimeSnapshots.length > 0 ? `${agentMemory.runtimeSnapshots.length} runtime snapshot${agentMemory.runtimeSnapshots.length === 1 ? "" : "s"}` : undefined,
    agentMemory.errors.length > 0 ? `${agentMemory.errors.length} error${agentMemory.errors.length === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean).join(", ");
  return `${agentMemory.message}${details ? ` (${details})` : ""}`;
}

function diagnosticAgentMemoryStarterNotice(starter: AgentMemoryStarterSummary): string | undefined {
  if (starter.state === "ready" || starter.state === "off") return undefined;
  const details = [
    starter.nextActions.length > 0 ? `next: ${starter.nextActions.join(", ")}` : undefined,
    starter.blockers.length > 0 ? `${starter.blockers.length} blocker${starter.blockers.length === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean).join(", ");
  return `Agent memory starter ${starter.state.replace(/_/g, " ")}${details ? ` (${details})` : ""}.`;
}

function diagnosticObservabilityNotice(observability: ObservabilitySummary): string | undefined {
  if (observability.status === "healthy" || observability.status === "unavailable") return undefined;
  if (observability.status === "error") return observability.message;
  const details = [
    observability.failedSpawns > 0 ? `${observability.failedSpawns} failed spawn${observability.failedSpawns === 1 ? "" : "s"}` : undefined,
    observability.toolDenialCount > 0 ? `${observability.toolDenialCount} tool denial${observability.toolDenialCount === 1 ? "" : "s"}` : undefined,
    observability.cancellationCascades > 0 ? `${observability.cancellationCascades} cancellation cascade${observability.cancellationCascades === 1 ? "" : "s"}` : undefined,
    observability.restartReconciliations > 0 ? `${observability.restartReconciliations} restart reconciliation${observability.restartReconciliations === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean).join(", ");
  return `${observability.message}${details ? ` (${details})` : ""}`;
}

function diagnosticAttributionNotice(attribution: AttributionSummary): string | undefined {
  if (attribution.status === "healthy" || attribution.status === "unavailable") return undefined;
  if (attribution.status === "error") return attribution.message;
  const details = [
    attribution.missingAttributionCount > 0 ? `${attribution.missingAttributionCount} missing attribution` : undefined,
    attribution.mismatchedRunIdCount > 0 ? `${attribution.mismatchedRunIdCount} mismatched run id${attribution.mismatchedRunIdCount === 1 ? "" : "s"}` : undefined,
    attribution.truncatedIssues ? `${attribution.shownIssueCount} shown` : undefined,
  ].filter(Boolean).join(", ");
  return `${attribution.message}${details ? ` (${details})` : ""}`;
}

function diagnosticReplayEvidenceNotice(replayEvidence: ReplayEvidenceSummary): string | undefined {
  if (replayEvidence.status === "healthy" || replayEvidence.status === "unavailable") return undefined;
  if (replayEvidence.status === "error") return replayEvidence.message;
  const details = [
    replayEvidence.runtimeEventCount > 0 ? `${replayEvidence.runtimeEventCount} runtime event${replayEvidence.runtimeEventCount === 1 ? "" : "s"}` : undefined,
    replayEvidence.persistedRunEventCount > 0 ? `${replayEvidence.persistedRunEventCount} persisted event${replayEvidence.persistedRunEventCount === 1 ? "" : "s"}` : undefined,
    replayEvidence.truncated ? "bounded timeline" : undefined,
  ].filter(Boolean).join(", ");
  return `${replayEvidence.message}${details ? ` (${details})` : ""}`;
}

function diagnosticLocalRuntimeNotice(localRuntimes: LocalRuntimeSummary): string | undefined {
  if (localRuntimes.status === "healthy" || localRuntimes.status === "unavailable") return undefined;
  if (localRuntimes.status === "error") return localRuntimes.message;
  const details = [
    localRuntimes.activeLeaseCount > 0 ? `${localRuntimes.activeLeaseCount} active lease${localRuntimes.activeLeaseCount === 1 ? "" : "s"}` : undefined,
    localRuntimes.stopBlockedCount > 0 ? `${localRuntimes.stopBlockedCount} stop blocker${localRuntimes.stopBlockedCount === 1 ? "" : "s"}` : undefined,
    localRuntimes.restartBlockedCount > 0 ? `${localRuntimes.restartBlockedCount} restart blocker${localRuntimes.restartBlockedCount === 1 ? "" : "s"}` : undefined,
    localRuntimes.untrackedCount > 0 ? `${localRuntimes.untrackedCount} untracked process${localRuntimes.untrackedCount === 1 ? "" : "es"}` : undefined,
    localRuntimes.memoryPolicyOutcome && localRuntimes.memoryPolicyOutcome !== "within-limit" && localRuntimes.memoryPolicyOutcome !== "unlimited"
      ? `memory ${localRuntimes.memoryPolicyOutcome}`
      : undefined,
  ].filter(Boolean).join(", ");
  return `${localRuntimes.message}${details ? ` (${details})` : ""}`;
}

function formatDiagnosticExportFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
