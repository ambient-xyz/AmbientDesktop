import type { AmbientPermissionGrant, PermissionMode, WorkflowAmbientCliCapabilityGrant, WorkflowArtifactSummary, WorkflowConnectorManifestGrant } from "./types";
import {
  googleWorkspaceConnectorGrantTarget,
  googleWorkspaceGrantMatchesTarget,
  type GoogleWorkspaceGrantTarget,
} from "./googleWorkspaceGrantTargets";

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
  targetIdentity?: string;
  grant: AmbientPermissionGrant;
}

export interface WorkflowScheduleConnectorGrantRequirement {
  connectorId: string;
  operation?: string;
  accountId?: string;
  targetLabel: string;
  targetIdentity?: string;
  googleTarget?: GoogleWorkspaceGrantTarget;
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
  if (!options.permissionGrants) return [];
  return workflowScheduleConnectorGrantRequirements(artifact)
    .filter((requirement) => !matchingConnectorGrantUseForRequirement(artifact, options, requirement))
    .map((requirement) => requirement.targetLabel);
}

export function workflowArtifactScheduleConnectorGrantUses(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
): WorkflowScheduleConnectorGrantUse[] {
  if (!options.permissionGrants) return [];
  return workflowScheduleConnectorGrantRequirements(artifact)
    .map((requirement) => matchingConnectorGrantUseForRequirement(artifact, options, requirement))
    .filter((use): use is WorkflowScheduleConnectorGrantUse => Boolean(use));
}

export function workflowScheduleMatchingConnectorGrantUse(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId" | "manifest">,
  options: WorkflowArtifactScheduleBlockOptions,
  connectorId: string,
  operation?: string,
): WorkflowScheduleConnectorGrantUse | undefined {
  const connector = (artifact.manifest.connectors ?? []).find((candidate) => candidate.connectorId === connectorId);
  if (!connector) return undefined;
  const requirement = workflowScheduleConnectorGrantRequirement(connector, operation);
  return requirement ? matchingConnectorGrantUseForRequirement(artifact, options, requirement) : undefined;
}

export function workflowScheduleConnectorGrantRequirements(
  artifact: Pick<WorkflowArtifactSummary, "manifest">,
): WorkflowScheduleConnectorGrantRequirement[] {
  return uniqueRequirements(
    (artifact.manifest.connectors ?? []).flatMap((connector) => {
      const operations = connector.operations.length ? connector.operations : [undefined];
      return operations
        .map((operation) => workflowScheduleConnectorGrantRequirement(connector, operation))
        .filter((requirement): requirement is WorkflowScheduleConnectorGrantRequirement => Boolean(requirement));
    }),
  );
}

export function workflowScheduleConnectorGrantRequirement(
  connector: Pick<WorkflowConnectorManifestGrant, "connectorId" | "accountId" | "operations">,
  operation?: string,
): WorkflowScheduleConnectorGrantRequirement | undefined {
  const googleTarget = googleWorkspaceConnectorGrantTarget({
    connectorId: connector.connectorId,
    operation,
    accountId: connector.accountId,
  });
  if (googleTarget) {
    return {
      connectorId: connector.connectorId,
      operation,
      accountId: connector.accountId,
      targetLabel: googleTarget.label,
      targetIdentity: googleTarget.identity,
      googleTarget,
    };
  }
  const targetLabel = operation ? `${connector.connectorId}:${operation}` : connector.connectorId;
  return {
    connectorId: connector.connectorId,
    operation,
    accountId: connector.accountId,
    targetLabel,
  };
}

export function workflowScheduleConnectorGrantMatches(
  grant: AmbientPermissionGrant,
  requirement: WorkflowScheduleConnectorGrantRequirement,
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
): boolean {
  return connectorGrantMatches(grant, requirement, artifact, options);
}

function matchingConnectorGrantUseForRequirement(
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
  requirement: WorkflowScheduleConnectorGrantRequirement,
): WorkflowScheduleConnectorGrantUse | undefined {
  const runtimeGrants = (options.permissionGrants ?? []).filter((grant) => !grant.revokedAt && !isExpired(grant) && !isDiscoveryOnlyGrant(grant));
  const grant = runtimeGrants.find((candidate) => connectorGrantMatches(candidate, requirement, artifact, options));
  if (!grant) return undefined;
  return {
    connectorId: requirement.connectorId,
    operation: requirement.operation,
    targetLabel: grant.targetLabel,
    targetIdentity: requirement.targetIdentity,
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
  requirement: WorkflowScheduleConnectorGrantRequirement,
  artifact: Pick<WorkflowArtifactSummary, "id" | "workflowThreadId">,
  options: WorkflowArtifactScheduleBlockOptions,
): boolean {
  if (grant.actionKind !== "connector_content_read" || grant.targetKind !== "connector") return false;
  if (requirement.googleTarget) {
    if (!googleWorkspaceGrantMatchesTarget(grant, requirement.googleTarget)) return false;
  } else if (grant.targetLabel !== requirement.targetLabel && grant.targetLabel !== requirement.connectorId) {
    return false;
  }
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

function uniqueRequirements(requirements: WorkflowScheduleConnectorGrantRequirement[]): WorkflowScheduleConnectorGrantRequirement[] {
  const byIdentity = new Map<string, WorkflowScheduleConnectorGrantRequirement>();
  for (const requirement of requirements) {
    const key = requirement.targetIdentity ?? `${requirement.connectorId}\0${requirement.operation ?? ""}\0${requirement.targetLabel}`;
    if (!byIdentity.has(key)) byIdentity.set(key, requirement);
  }
  return [...byIdentity.values()];
}
