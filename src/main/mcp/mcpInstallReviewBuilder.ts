import {
  MCP_INSTALL_REVIEW_SCHEMA_VERSION,
  type McpAutowireCandidate,
  type McpAutowireOutcome,
  type McpAutowireValidationReport,
  type McpInstallReview,
} from "./mcpAutowireFacade";
import { isSecretReference } from "./mcpSecurityFacade";
import { TOOLHIVE_AMBIENT_GROUP } from "./mcpToolRuntimeFacade";

interface McpInstallReviewSecretBinding {
  envName: string;
  secretRef: string;
}

export function buildInstallReview(input: {
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  sourceLabel: string;
  secretBindings: McpInstallReviewSecretBinding[];
  summary: string;
  evidenceRefs: string[];
  extraBlockers?: string[];
  blockedOutcome?: McpAutowireOutcome;
}): McpInstallReview {
  const requiredSecrets = input.candidate.secrets.filter((secret) => secret.required);
  const declaredSecretNames = new Set(input.candidate.secrets.map((secret) => secret.name));
  const boundSecretNames = new Set(input.secretBindings.map((binding) => binding.envName));
  const missingRequiredSecrets = requiredSecrets.filter((secret) => !boundSecretNames.has(secret.name));
  const unknownSecretBindings = input.secretBindings.filter((binding) => !declaredSecretNames.has(binding.envName));
  const duplicateSecretBindings = input.secretBindings.filter((binding, index) => input.secretBindings.findIndex((item) => item.envName === binding.envName) !== index);
  const invalidSecretRefs = input.secretBindings.filter((binding) => !isSecretReference(binding.secretRef.trim()));
  const blockers = [
    ...input.validation.blockers.map((issue) => `${issue.code}: ${issue.message}`),
    ...missingRequiredSecrets.map((secret) => `Required secret ${secret.name} must be bound through ambient_mcp_secret_request before install; never ask for the value in chat or create placeholder secret files.`),
    ...unknownSecretBindings.map((binding) => `Secret binding ${binding.envName} is not declared by ${input.sourceLabel} metadata for this server.`),
    ...duplicateSecretBindings.map((binding) => `Secret binding ${binding.envName} is duplicated.`),
    ...invalidSecretRefs.map((binding) => `Secret binding ${binding.envName} must use an Ambient-managed secret reference.`),
    ...(input.extraBlockers ?? []),
  ];
  const warnings = [
    ...input.validation.warnings.map((issue) => `${issue.code}: ${issue.message}`),
    ...input.candidate.secrets.filter((secret) => !secret.required && !boundSecretNames.has(secret.name)).map((secret) => `Optional secret ${secret.name} is not bound; the server may run with lower limits or reduced functionality.`),
  ];
  return {
    schemaVersion: MCP_INSTALL_REVIEW_SCHEMA_VERSION,
    candidateId: input.candidate.id,
    title: `Install ${input.candidate.displayName}`,
    recommendedLane: input.candidate.recommendedLane,
    outcome: blockers.length
      ? input.blockedOutcome ?? (input.validation.outcome === "ready" ? "needs-evidence" : input.validation.outcome)
      : input.validation.outcome,
    summary: input.summary,
    sourceSummary: sourceSummary(input.candidate),
    runtimeSummary: runtimeSummary(input.candidate),
    permissionSummary: permissionSummary(input.candidate),
    secretSummary: secretSummary(input.candidate),
    validationSummary: validationSummary(input.candidate),
    blockers,
    warnings,
    evidenceRefs: input.evidenceRefs,
  };
}

function sourceSummary(candidate: McpAutowireCandidate): string {
  const parts = [
    `source kind ${candidate.source.kind}`,
    candidate.source.registryId ? `registry id ${candidate.source.registryId}` : undefined,
    candidate.source.packageName ? `package ${candidate.source.packageName}` : undefined,
    candidate.source.url ? `url ${candidate.source.url}` : undefined,
    candidate.source.resolvedCommit ? `commit ${candidate.source.resolvedCommit}` : undefined,
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}

function runtimeSummary(candidate: McpAutowireCandidate): string {
  const entrypoint = candidate.runtime.package?.entrypoint
    ? ` entrypoint ${candidate.runtime.package.entrypoint.kind}${candidate.runtime.package.entrypoint.command ? `:${candidate.runtime.package.entrypoint.command}` : ""}${candidate.runtime.package.entrypoint.module ? `:${candidate.runtime.package.entrypoint.module}` : ""}`
    : "";
  const args = candidate.runtime.package?.packageArguments?.length
    ? ` args ${candidate.runtime.package.packageArguments.map((arg) => packageArgumentSummary(arg)).join(" ")}`
    : "";
  const pkg = candidate.runtime.package
    ? ` using ${candidate.runtime.package.registryType}:${candidate.runtime.package.identifier}${candidate.runtime.package.version ? `@${candidate.runtime.package.version}` : ""}${entrypoint}${args}`
    : "";
  const runtimeImage = candidate.runtime.package?.runtimeImage ? ` with runtime image ${candidate.runtime.package.runtimeImage}` : "";
  const remote = candidate.runtime.remote?.url ? ` remote ${candidate.runtime.remote.url}` : "";
  const updatePolicy = candidate.runtime.updatePolicy ? ` Update policy: ${candidate.runtime.updatePolicy.mode}.` : "";
  return `ToolHive ${candidate.runtime.sourceKind}/${candidate.runtime.transport} MCP runtime${pkg}${runtimeImage}${remote}; workload will run in group ${TOOLHIVE_AMBIENT_GROUP}.${updatePolicy}`;
}

function packageArgumentSummary(arg: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"][number]): string {
  if (arg.type === "switch") return arg.name ?? "(switch?)";
  if (arg.type === "flag") return `${arg.name ?? "(flag?)"}=${arg.valueHint ?? "(value?)"}`;
  if (arg.type === "env") return `${arg.name ?? "(env?)"}=<non-secret>`;
  return arg.valueHint ?? arg.name ?? "(arg?)";
}

function permissionSummary(candidate: McpAutowireCandidate): string {
  const network = candidate.permissions.network;
  const hosts = network.allowHosts.length ? ` hosts ${network.allowHosts.join(", ")}` : "";
  const ports = network.allowPorts.length ? ` ports ${network.allowPorts.join(", ")}` : "";
  const mounts = candidate.permissions.filesystem.extraMounts.length
    ? ` extra mounts=${candidate.permissions.filesystem.extraMounts.map((mount) => `${mount.path}${mount.containerPath ? `->${mount.containerPath}` : ""}:${mount.mode}`).join(", ")}`
    : "";
  return `Network ${network.mode}${hosts}${ports}; workspace read=${candidate.permissions.filesystem.workspaceRead}; workspace write=${candidate.permissions.filesystem.workspaceWrite};${mounts || " extra mounts=none"}.`;
}

function secretSummary(candidate: McpAutowireCandidate): string {
  if (!candidate.secrets.length) return "No secrets declared by MCP metadata.";
  return candidate.secrets.map((secret) => `${secret.required ? "Required" : "Optional"} ${secret.name}: ${secret.purpose}`).join(" ");
}

function validationSummary(candidate: McpAutowireCandidate): string {
  const tools = candidate.validationPlan.expectedTools.length
    ? ` Expected tools: ${candidate.validationPlan.expectedTools.slice(0, 12).join(", ")}${candidate.validationPlan.expectedTools.length > 12 ? ", ..." : ""}.`
    : "";
  return `Preflight: ${candidate.validationPlan.preflights.join(", ")}.${tools}`;
}
