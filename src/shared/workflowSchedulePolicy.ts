import type { AmbientPermissionGrant, PermissionMode, WorkflowAmbientCliCapabilityGrant, WorkflowArtifactSummary } from "./types";

export interface WorkflowArtifactScheduleBlockOptions {
  permissionMode?: PermissionMode;
  threadId?: string;
  workflowThreadId?: string;
  projectPath?: string;
  workspacePath?: string;
  permissionGrants?: AmbientPermissionGrant[];
}

export interface WorkflowScheduleConnectorGrantUse {
  connectorId: string;
  operation?: string;
  targetLabel: string;
  grant: AmbientPermissionGrant;
}

export interface WorkflowScheduleAmbientCliGrantUse {
  capabilityId: string;
  packageName: string;
  command: string;
  targetLabel: string;
  grant: AmbientPermissionGrant;
}

export function workflowArtifactScheduleBlockReason(
  artifact: Pick<WorkflowArtifactSummary, "id" | "status" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions = {},
): string | undefined {
  if (artifact.status === "ready_for_preview") return "Workflow preview needs approval before scheduled execution.";
  if (artifact.status === "approved") {
    const missingAmbientCliGrants = workflowScheduleMissingAmbientCliGrants(artifact, options);
    if (missingAmbientCliGrants.length > 0) {
      return `Workflow schedule requires reviewed Ambient CLI grant${missingAmbientCliGrants.length === 1 ? "" : "s"} for ${missingAmbientCliGrants.join(", ")}.`;
    }
    const missingAccounts = (artifact.manifest.connectors ?? []).filter((connector) => !connector.accountId?.trim());
    if (missingAccounts.length > 0) {
      return `Workflow schedule requires connector account${missingAccounts.length === 1 ? "" : "s"} for ${missingAccounts
        .map((connector) => connector.connectorId)
        .join(", ")}.`;
    }
    const missingGrants = workflowScheduleMissingConnectorGrants(artifact, options);
    if (missingGrants.length > 0) {
      return `Workflow schedule requires persistent connector grant${missingGrants.length === 1 ? "" : "s"} for ${missingGrants.join(", ")}.`;
    }
    return undefined;
  }
  return `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
}

export function workflowAmbientCliScheduleTargetLabel(capability: WorkflowAmbientCliCapabilityGrant): string {
  return `Run Ambient CLI ${capability.packageName}:${capability.command}`;
}

export function workflowScheduleMissingAmbientCliGrants(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
): string[] {
  const capabilities = artifact.manifest.ambientCliCapabilities ?? [];
  if (options.permissionMode === "full-access") return [];
  return capabilities
    .filter((capability) => !matchingAmbientCliGrantUse(artifact, options, capability))
    .map((capability) => `${capability.packageName}:${capability.command}`);
}

export function workflowArtifactScheduleAmbientCliGrantUses(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
): WorkflowScheduleAmbientCliGrantUse[] {
  if (options.permissionMode === "full-access") return [];
  return (artifact.manifest.ambientCliCapabilities ?? [])
    .map((capability) => matchingAmbientCliGrantUse(artifact, options, capability))
    .filter((use): use is WorkflowScheduleAmbientCliGrantUse => Boolean(use));
}

function workflowScheduleMissingConnectorGrants(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
): string[] {
  if (options.permissionMode === "full-access") return [];
  if (!options.permissionGrants) return [];
  return (artifact.manifest.connectors ?? [])
    .filter((connector) => !matchingConnectorGrantUse(artifact, options, connector.connectorId))
    .map((connector) => connector.connectorId);
}

export function workflowArtifactScheduleConnectorGrantUses(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
): WorkflowScheduleConnectorGrantUse[] {
  if (options.permissionMode === "full-access" || !options.permissionGrants) return [];
  return (artifact.manifest.connectors ?? [])
    .map((connector) => matchingConnectorGrantUse(artifact, options, connector.connectorId))
    .filter((use): use is WorkflowScheduleConnectorGrantUse => Boolean(use));
}

function matchingConnectorGrantUse(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
  connectorId: string,
): WorkflowScheduleConnectorGrantUse | undefined {
  const connector = (artifact.manifest.connectors ?? []).find((candidate) => candidate.connectorId === connectorId);
  if (!connector) return undefined;
  const runtimeGrants = (options.permissionGrants ?? []).filter((grant) => !grant.revokedAt && !isExpired(grant) && !isDiscoveryOnlyGrant(grant));
  const labels = unique([connector.connectorId, ...connector.operations.map((operation) => `${connector.connectorId}:${operation}`)]);
  const grant = runtimeGrants.find((candidate) => connectorGrantMatches(candidate, labels, artifact, options));
  if (!grant) return undefined;
  return {
    connectorId: connector.connectorId,
    operation: connector.operations.find((operation) => grant.targetLabel === `${connector.connectorId}:${operation}`),
    targetLabel: grant.targetLabel,
    grant,
  };
}

function matchingAmbientCliGrantUse(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
  capability: WorkflowAmbientCliCapabilityGrant,
): WorkflowScheduleAmbientCliGrantUse | undefined {
  const targetLabel = workflowAmbientCliScheduleTargetLabel(capability);
  const runtimeGrants = (options.permissionGrants ?? []).filter((grant) => !grant.revokedAt && !isExpired(grant) && !isDiscoveryOnlyGrant(grant));
  const grant = runtimeGrants.find((candidate) => ambientCliGrantMatches(candidate, targetLabel, artifact, options));
  if (!grant) return undefined;
  return {
    capabilityId: capability.capabilityId,
    packageName: capability.packageName,
    command: capability.command,
    targetLabel,
    grant,
  };
}

function ambientCliGrantMatches(
  grant: AmbientPermissionGrant,
  targetLabel: string,
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
): boolean {
  if (grant.actionKind !== "plugin_tool_execute" || grant.targetKind !== "tool") return false;
  if (grant.targetLabel !== targetLabel) return false;
  return permissionGrantScopeMatches(grant, artifact, options);
}

function connectorGrantMatches(
  grant: AmbientPermissionGrant,
  labels: string[],
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
): boolean {
  if (grant.actionKind !== "connector_content_read" || grant.targetKind !== "connector") return false;
  if (!labels.includes(grant.targetLabel)) return false;
  return permissionGrantScopeMatches(grant, artifact, options);
}

function permissionGrantScopeMatches(
  grant: AmbientPermissionGrant,
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
): boolean {
  if (grant.scopeKind === "thread") return Boolean(options.threadId && grant.threadId === options.threadId);
  if (grant.scopeKind === "workflow_thread") return Boolean((options.workflowThreadId ?? artifact.workflowThreadId) && grant.workflowThreadId === (options.workflowThreadId ?? artifact.workflowThreadId));
  if (grant.scopeKind === "project") return Boolean(options.projectPath && grant.projectPath === options.projectPath);
  if (grant.scopeKind === "workspace") return Boolean(options.workspacePath && grant.workspacePath === options.workspacePath);
  return false;
}

function isExpired(grant: AmbientPermissionGrant, now = Date.now()): boolean {
  if (!grant.expiresAt) return false;
  const expiresAt = new Date(grant.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function isDiscoveryOnlyGrant(grant: AmbientPermissionGrant): boolean {
  return Boolean(grant.conditions && typeof grant.conditions === "object" && (grant.conditions as Record<string, unknown>).discoveryOnly === true);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
