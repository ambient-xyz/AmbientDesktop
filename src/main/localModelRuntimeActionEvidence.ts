import type {
  LocalModelResourcePolicyDecision,
  LocalRuntimeInventoryEntry,
} from "../shared/types";

export function localRuntimeResidentMemoryEvidenceText(
  entry: LocalRuntimeInventoryEntry | undefined,
): string | undefined {
  if (!entry) return undefined;
  const parts = [
    entry.actualResidentMemoryBytes !== undefined ? `actual RSS ${formatBytes(entry.actualResidentMemoryBytes)}` : undefined,
    entry.estimatedResidentMemoryBytes !== undefined ? `estimate ${formatBytes(entry.estimatedResidentMemoryBytes)}` : undefined,
  ].filter(Boolean);
  return parts.length ? `Runtime memory: ${parts.join("; ")}.` : "Runtime memory: unknown.";
}

export function localRuntimeMemoryPolicyEvidenceText(
  policy: LocalModelResourcePolicyDecision | undefined,
): string | undefined {
  if (!policy) return undefined;
  const projection = [
    policy.projectedSystemMemoryUtilization !== undefined
      ? `projected utilization ${formatPercent(policy.projectedSystemMemoryUtilization)}${policy.maxProjectedMemoryUtilization !== undefined ? ` / ceiling ${formatPercent(policy.maxProjectedMemoryUtilization)}` : ""}`
      : undefined,
    policy.projectedFreeMemoryRatio !== undefined
      ? `projected free ${policy.projectedFreeMemoryBytes !== undefined ? `${formatBytes(policy.projectedFreeMemoryBytes)} ` : ""}(${formatPercent(policy.projectedFreeMemoryRatio)})${policy.minFreeMemoryRatioAfterLaunch !== undefined ? ` / floor ${formatPercent(policy.minFreeMemoryRatioAfterLaunch)}` : ""}`
      : undefined,
    policy.activeActualResidentMemoryBytes !== undefined
      ? `active actual ${formatBytes(policy.activeActualResidentMemoryBytes)}`
      : `active estimate ${formatBytes(policy.activeEstimatedResidentMemoryBytes)}`,
    policy.requestedEstimatedResidentMemoryBytes !== undefined
      ? `requested estimate ${formatBytes(policy.requestedEstimatedResidentMemoryBytes)}`
      : undefined,
  ].filter(Boolean);
  const uncertainty = policy.uncertaintyReasons?.length
    ? ` Uncertainty: ${policy.uncertaintyReasons.join(" ")}`
    : "";
  const projectionText = projection.length ? ` ${projection.join("; ")}.` : "";
  return `Memory policy: ${policy.outcome} - ${policy.reason}${projectionText}${uncertainty}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  return `${Math.round(value * 100)}%`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const mib = bytes / (1024 ** 2);
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}
