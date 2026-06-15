import type {
  LocalModelResourceRegistryEntry,
  LocalRuntimeLeaseRecord,
} from "../shared/types";

export function localRuntimeLeaseMatchesResourceEntry(
  lease: LocalRuntimeLeaseRecord,
  entry: LocalModelResourceRegistryEntry,
): boolean {
  if (lease.pid !== undefined && lease.pid === entry.pid) return true;
  if (lease.endpoint && entry.endpointUrl && lease.endpoint === entry.endpointUrl) return true;
  if (lease.modelRuntimeId && (lease.modelRuntimeId === entry.runtimeId || lease.modelRuntimeId === entry.id)) return true;
  if (lease.modelProfileId && lease.modelProfileId === entry.profileId) return true;
  return lease.capabilityKind === entry.capability &&
    lease.modelId !== undefined &&
    entry.modelId !== undefined &&
    lease.modelId === entry.modelId;
}

export function localRuntimeActiveLeaseIdsForResourceEntry(
  entry: LocalModelResourceRegistryEntry,
  leases: LocalRuntimeLeaseRecord[],
): string[] {
  const ids = new Set((entry.activeLeaseIds ?? []).map((id) => id.trim()).filter(Boolean));
  for (const lease of leases) {
    if (localRuntimeLeaseMatchesResourceEntry(lease, entry)) ids.add(lease.leaseId);
  }
  return [...ids];
}
