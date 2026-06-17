import type { AmbientPermissionGrant } from "../../../shared/types";
import {
  mcpPermissionGrantIdsForDescriptorDrift,
  type McpDescriptorDriftGrantInvalidationInput,
} from "../../mcp/mcpPermissionPolicyService";

export interface PermissionGrantRevocationStore {
  listPermissionGrants(): AmbientPermissionGrant[];
  revokePermissionGrant(grantId: string): AmbientPermissionGrant;
}

export function pluginPermissionGrantMatchesLabelPrefixes(
  grant: Pick<AmbientPermissionGrant, "actionKind" | "targetLabel">,
  labelPrefixes: readonly string[],
): boolean {
  if (grant.actionKind !== "plugin_tool_execute") return false;
  return labelPrefixes.some((prefix) => grant.targetLabel === prefix || grant.targetLabel.startsWith(prefix));
}

export function pluginPermissionGrantIdsForLabelPrefixes(input: {
  grants: readonly Pick<AmbientPermissionGrant, "id" | "actionKind" | "targetLabel">[];
  labelPrefixes: readonly string[];
}): string[] {
  return input.grants
    .filter((grant) => pluginPermissionGrantMatchesLabelPrefixes(grant, input.labelPrefixes))
    .map((grant) => grant.id);
}

export function revokePluginPermissionGrantsForLabelPrefixes(
  input: { labelPrefixes: readonly string[] },
  options: { store: PermissionGrantRevocationStore },
): number {
  const grantIds = pluginPermissionGrantIdsForLabelPrefixes({
    grants: options.store.listPermissionGrants(),
    labelPrefixes: input.labelPrefixes,
  });
  for (const grantId of grantIds) {
    options.store.revokePermissionGrant(grantId);
  }
  return grantIds.length;
}

export function revokeMcpPermissionGrantsForDescriptorDrift(
  input: Omit<McpDescriptorDriftGrantInvalidationInput, "grants">,
  options: {
    store: PermissionGrantRevocationStore;
    emitPermissionGrantRevoked: (grant: AmbientPermissionGrant) => void;
  },
): number {
  const grantIds = mcpPermissionGrantIdsForDescriptorDrift({
    grants: options.store.listPermissionGrants(),
    serverId: input.serverId,
    workloadName: input.workloadName,
    previousDescriptorHash: input.previousDescriptorHash,
    descriptorHash: input.descriptorHash,
  });
  for (const grantId of grantIds) {
    const grant = options.store.revokePermissionGrant(grantId);
    options.emitPermissionGrantRevoked(grant);
  }
  return grantIds.length;
}
