import type {
  LocalModelResourceRequestedLaunch,
  LocalRuntimeInventoryEntry,
} from "../../shared/localRuntimeTypes";

export type LocalModelRuntimeLifecycleLaunchAction = "start" | "restart";

export function localModelRuntimeLifecycleRequestedLaunch(input: {
  action: LocalModelRuntimeLifecycleLaunchAction;
  entry?: LocalRuntimeInventoryEntry;
}): LocalModelResourceRequestedLaunch | undefined {
  const entry = input.entry;
  if (!entry || entry.running) return undefined;
  return {
    capability: entry.capability,
    id: `local-runtime-lifecycle:${input.action}:${entry.id}`,
    ...(entry.modelId ? { modelId: entry.modelId } : {}),
    ...(entry.modelProfileId ? { profileId: entry.modelProfileId } : {}),
    ...(entry.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: entry.estimatedResidentMemoryBytes } : {}),
  };
}
