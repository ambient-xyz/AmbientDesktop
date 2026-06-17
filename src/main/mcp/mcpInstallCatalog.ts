import { createHash } from "node:crypto";
import {
  MCP_INSTALL_REVIEW_SCHEMA_VERSION,
  TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
  parseMcpAutowireCandidate,
  parseMcpInstallReview,
  parseToolHiveRunPlan,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireOutcome,
  type McpAutowireValidationReport,
  type McpInstallReview,
  type ToolHiveRunPlan,
} from "../mcp-autowire/mcpAutowireSchemas";
import { defaultMcpCatalogByServerId, loadDefaultMcpCatalog, mcpDefaultCatalogDescriptorHash, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { mcpAutowirePhase0Fixtures } from "../mcp-autowire/mcpAutowireFixtures";
import {
  mcpManagedFileExchangeForWorkload,
  mcpManagedFileExchangePermissionMount,
  mcpManagedFileExchangeVolume,
  type McpManagedFileExchange,
} from "./mcpManagedFileExchange";
import {
  TOOLHIVE_AMBIENT_GROUP,
  type ToolHiveSecretDerivedBindingKind,
  type ToolHiveInstalledServerSourceIdentity,
  type ToolHiveInstalledServerState,
  type ToolHiveInstallReviewState,
  type ToolHiveImageVerificationPolicy,
  type ToolHivePlainEnvVar,
  type ToolHiveRuntimeService,
  type ToolHiveRunVolume,
  type ToolHiveSecretBindingState,
  type ToolHiveWorkloadSummary,
} from "../tool-runtime/toolHiveRuntimeService";
import { isSecretReference } from "../secretReferenceStore";

export interface McpServerSearchInput {
  query?: string;
  limit?: number;
  refresh?: boolean;
}

export interface McpServerSearchResult {
  serverId: string;
  title: string;
  description: string;
  catalogSource: McpCatalogSource;
  status?: string;
  tier?: string;
  transport?: string;
  repositoryUrl?: string;
  tags: string[];
  tools: string[];
  installed: boolean;
  workloadName?: string;
  riskHints: string[];
  nextAction?: string;
}

export interface McpSecretBinding {
  envName: string;
  secretRef: string;
}

export interface McpRegistryInstallPreviewInput {
  serverId: string;
  refresh?: boolean;
  secretBindings?: McpSecretBinding[];
  runtimeVolumes?: ToolHiveRunVolume[];
}

export interface McpRegistryInstallPreview {
  serverId: string;
  catalogSource: McpCatalogSource;
  defaultDescriptor?: McpDefaultCatalogDescriptor;
  registryInfo: Record<string, unknown>;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveVolumes: ToolHiveRunVolume[];
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export interface McpStandardImportPreviewInput {
  candidate: unknown;
  candidateRef?: string;
  expectedCandidateHash?: string;
  secretBindings?: McpSecretBinding[];
}

export interface McpPackageMetadataResolution {
  registryType: "npm" | "pypi";
  identifier: string;
  found: boolean;
  normalizedIdentifier?: string;
  repositoryUrl?: string;
  error?: string;
}

export type McpPackageMetadataResolver = (input: {
  registryType: "npm" | "pypi";
  identifier: string;
}) => Promise<McpPackageMetadataResolution>;

export interface McpStandardImportPreview {
  serverId: string;
  catalogSource: "standard-mcp-import";
  candidateRef?: string;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  fallbackRoutes: McpStandardImportFallbackRoute[];
  toolHiveRunSource?: string;
  toolHiveEntrypoint?: string;
  toolHiveServerArgs: string[];
  toolHiveEnvVars: ToolHivePlainEnvVar[];
  toolHiveVolumes: ToolHiveRunVolume[];
  toolHiveRuntimeImage?: string;
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export type McpStandardImportBlockedLaunchShape = {
  kind: "package-bin-entrypoint";
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"];
  packageIdentifier: string;
  command: string;
  fromPackage?: string;
} | {
  kind: "module-entrypoint";
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"];
  packageIdentifier: string;
  module: string;
};

export type McpStandardImportFallbackRoute = {
  kind: "toolhive-registry-install";
  status: "ready";
  blockedShape: McpStandardImportBlockedLaunchShape["kind"];
  serverId: string;
  title?: string;
  reason: string;
  evidenceRefs: string[];
  nextToolName: "ambient_mcp_server_describe";
  nextToolInput: { serverId: string };
} | {
  kind: "custom-source-build";
  status: "available";
  blockedShape: McpStandardImportBlockedLaunchShape["kind"];
  reason: string;
  evidenceRefs: string[];
  nextToolName: "ambient_mcp_autowire_source_build_describe";
  nextToolInput: ({ candidateRef: string } | { candidate: McpAutowireCandidate }) & { expectedCandidateHash?: string };
};

export interface McpRemoteMcpProxyPreviewInput {
  candidate: unknown;
  expectedCandidateHash?: string;
  secretBindings?: McpSecretBinding[];
}

export interface McpRemoteMcpProxyPreview {
  serverId: string;
  catalogSource: "remote-mcp-proxy";
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveRemoteUrl?: string;
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export interface McpDefaultCapabilityInstallPreview {
  serverId: string;
  capabilityId: "scrapling";
  catalogSource: "ambient-default";
  defaultDescriptor: McpDefaultCatalogDescriptor;
  registryInfo: Record<string, unknown>;
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  review: McpInstallReview;
  runPlan?: ToolHiveRunPlan;
  toolHiveRunSource?: string;
  toolHiveServerArgs: string[];
  permissionProfile: {
    path: string;
    sha256: string;
    profile: Record<string, unknown>;
  };
}

export type McpInstallPreview = McpRegistryInstallPreview | McpStandardImportPreview | McpRemoteMcpProxyPreview;

export type McpCatalogSource = "ambient-default" | "toolhive-registry" | "ambient-default+toolhive-registry" | "ambient-recommended-standard-import";

export interface McpInstalledServerSummary {
  serverId: string;
  workloadName: string;
  activeRevisionId?: string;
  registrySource?: string;
  runtimeLane?: string;
  sourceKind?: string;
  sourceUrl?: string;
  sourceResolvedCommit?: string;
  registryId?: string;
  packageRegistryType?: string;
  packageIdentifier?: string;
  packageVersion?: string;
  packageDigest?: string;
  packageSha256?: string;
  sourceBuildRecipeKind?: string;
  sourceBuildRecipeHash?: string;
  toolHiveRunSource?: string;
  candidateId?: string;
  candidateRef?: string;
  candidateHash?: string;
  riskLevel?: string;
  defaultCatalogUpdateStatus?: "current" | "update-available" | "untracked";
  defaultCatalogDescriptorHash?: string;
  installedDefaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReviewStatus?: string;
  installReviewOutcome?: string;
  installReviewSummary?: string;
  imageVerificationPolicy?: string;
  secretBindingCount?: number;
  secretBindingEnvNames?: string[];
  derivedSecretBindingCount?: number;
  derivedSecretBindingKinds?: ToolHiveSecretDerivedBindingKind[];
  permissionProfilePath: string;
  permissionProfileSha256: string;
  createdAt: string;
  updatedAt: string;
  workloadStatus?: string;
  endpoint?: string;
  installValidationStatus?: string;
  installValidationError?: string;
  installValidationAt?: string;
  lastKnownToolCount?: number;
  lastKnownToolDescriptorHash?: string;
  toolDescriptorReviewStatus?: "trusted" | "needs-review";
  toolDescriptorReviewReason?: string;
  lastToolDiscoveryAt?: string;
  toolPolicyCount?: number;
  hiddenToolPolicyCount?: number;
  blockedToolPolicyCount?: number;
  runtimeListError?: string;
}

export interface McpUnmanagedToolHiveWorkloadSummary {
  workloadName: string;
  status?: string;
  endpoint?: string;
  group?: string;
  reason: string;
  nextAction: string;
}

export interface McpInstalledServerInventory {
  servers: McpInstalledServerSummary[];
  unmanagedWorkloads: McpUnmanagedToolHiveWorkloadSummary[];
}

export interface McpDefaultCatalogUpdateDiff {
  field: string;
  installed?: string;
  current: string;
  impact: "runtime" | "source" | "permissions" | "tools" | "secrets" | "review" | "state";
}

export interface McpDefaultCatalogUpdatePreview {
  serverId: string;
  workloadName: string;
  status: "current" | "update-available" | "untracked";
  currentDescriptorHash: string;
  installedDescriptorHash?: string;
  currentReviewedAt: string;
  installedReviewedAt?: string;
  title: string;
  description: string;
  sourceUrl?: string;
  registrySource?: string;
  runtimeLane?: string;
  diffs: McpDefaultCatalogUpdateDiff[];
  nextAction: string;
}

export function mcpServerSearchResultsText(results: McpServerSearchResult[]): string {
  if (!results.length) return "No Ambient MCP catalog entries matched the query.";
  const hasRecommendedImport = results.some((result) => result.catalogSource === "ambient-recommended-standard-import");
  return [
    `Found ${results.length} Ambient MCP catalog entr${results.length === 1 ? "y" : "ies"}.`,
    ...results.map((result) => {
      const status = [result.status, result.tier, result.transport].filter(Boolean).join(", ");
      const source = result.catalogSource === "ambient-default"
        ? "built-in default"
        : result.catalogSource === "ambient-default+toolhive-registry"
          ? "built-in default + ToolHive registry"
          : result.catalogSource === "ambient-recommended-standard-import"
            ? "Ambient-recommended Standard MCP import"
          : "ToolHive registry";
      const installed = result.installed ? `installed as ${result.workloadName}` : "not installed";
      const tools = result.tools.length ? ` Tools: ${result.tools.slice(0, 8).join(", ")}${result.tools.length > 8 ? ", ..." : ""}.` : "";
      const risks = result.riskHints.length ? ` Risks: ${result.riskHints.join(" ")}` : "";
      const nextAction = result.nextAction ? ` Next: ${result.nextAction}` : "";
      return `- ${result.serverId}: ${result.title}${status ? ` (${status})` : ""}; ${source}; ${installed}. ${result.description}${tools}${risks}${nextAction}`;
    }),
    "",
    hasRecommendedImport
      ? "Use ambient_mcp_server_describe with exact serverId values for ToolHive registry/default entries. Built-in defaults are routed by Ambient through the default capability installer. For Ambient-recommended Standard MCP imports, use ambient_mcp_autowire_plan with the listed targetUrl only when no built-in default matches or the user explicitly asks for the generic import."
      : "Use ambient_mcp_server_describe with the exact serverId before requesting install.",
  ].join("\n");
}

export function mcpInstalledServersText(
  servers: McpInstalledServerSummary[],
  input: { unmanagedWorkloads?: McpUnmanagedToolHiveWorkloadSummary[] } = {},
): string {
  const unmanaged = input.unmanagedWorkloads ?? [];
  if (!servers.length && !unmanaged.length) return "No Ambient-managed ToolHive MCP servers are installed.";
  const unmanagedLines = unmanaged.length
    ? [
        "",
        `Unmanaged ToolHive workloads in Ambient group (${unmanaged.length}):`,
        ...unmanaged.map((workload) => {
          const status = workload.status ? ` status=${workload.status}` : "";
          const endpoint = workload.endpoint ? ` endpoint=${workload.endpoint}` : "";
          return `- ${workload.workloadName}:${status}${endpoint}; ${workload.reason} Next: ${workload.nextAction}`;
        }),
      ]
    : [];
  if (!servers.length) {
    return [
      "No Ambient-managed ToolHive MCP servers are installed.",
      ...unmanagedLines,
    ].join("\n");
  }
  return [
    `Found ${servers.length} installed Ambient MCP server${servers.length === 1 ? "" : "s"}.`,
    ...servers.map((server) => {
      const status = server.workloadStatus ? `status=${server.workloadStatus}` : "status=unknown";
      const endpoint = server.endpoint ? ` endpoint=${server.endpoint}` : "";
      const runtimeError = server.runtimeListError ? ` runtimeListError=${server.runtimeListError}` : "";
      const installValidation = server.installValidationStatus
        ? ` installValidation=${server.installValidationStatus}${server.installValidationError ? ` error=${server.installValidationError}` : ""}`
        : "";
      const tools = typeof server.lastKnownToolCount === "number" ? ` lastKnownTools=${server.lastKnownToolCount}` : "";
      const descriptorHash = server.lastKnownToolDescriptorHash ? ` toolDescriptorHash=${server.lastKnownToolDescriptorHash}` : "";
      const source = installedServerSourceText(server);
      const installReview = server.installReviewStatus
        ? ` installReview=${server.installReviewStatus}${server.installReviewOutcome ? ` outcome=${server.installReviewOutcome}` : ""}`
        : "";
      const imageVerification = server.imageVerificationPolicy ? ` imageVerification=${server.imageVerificationPolicy}` : "";
      const derivedSecrets = server.derivedSecretBindingCount
        ? ` derived=${server.derivedSecretBindingCount}${server.derivedSecretBindingKinds?.length ? ` delivery=${server.derivedSecretBindingKinds.join(",")}` : ""}`
        : "";
      const secrets = server.secretBindingCount ? ` secretBindings=${server.secretBindingCount}${server.secretBindingEnvNames?.length ? ` env=${server.secretBindingEnvNames.join(",")}` : ""}${derivedSecrets}` : "";
      const review = server.toolDescriptorReviewStatus ? ` toolDescriptorReview=${server.toolDescriptorReviewStatus}` : "";
      const reason = server.toolDescriptorReviewReason ? ` reviewReason=${server.toolDescriptorReviewReason}` : "";
      const policy = server.toolPolicyCount ? ` toolPolicies=${server.toolPolicyCount} hidden=${server.hiddenToolPolicyCount ?? 0} blocked=${server.blockedToolPolicyCount ?? 0}` : "";
      const catalogUpdate = server.defaultCatalogUpdateStatus
        ? ` defaultCatalog=${server.defaultCatalogUpdateStatus}${server.defaultCatalogDescriptorHash ? ` currentHash=${server.defaultCatalogDescriptorHash}` : ""}${server.installedDefaultCatalogDescriptorHash ? ` installedHash=${server.installedDefaultCatalogDescriptorHash}` : ""}`
        : "";
      return `- ${server.serverId}: workload=${server.workloadName}; ${status}${endpoint}${source}${installReview}${installValidation}${imageVerification}${secrets}${tools}${descriptorHash}${review}${reason}${policy}${catalogUpdate}; profile=${server.permissionProfilePath}${runtimeError}`;
    }),
    "",
    "Use ambient_mcp_server_default_update_describe for servers whose defaultCatalog value is update-available or untracked.",
    "Use ambient_mcp_server_uninstall with the exact serverId or workloadName to remove one installed server.",
    ...unmanagedLines,
  ].join("\n");
}

export function mcpDefaultCatalogUpdatePreviewText(preview: McpDefaultCatalogUpdatePreview): string {
  const diffs = preview.diffs.length
    ? preview.diffs.map((diff) => `- ${diff.field} (${diff.impact}): ${diff.installed ?? "unset"} -> ${diff.current}`).join("\n")
    : "- none";
  return [
    `MCP default catalog update review for ${preview.serverId}.`,
    `Workload: ${preview.workloadName}`,
    `Status: ${preview.status}`,
    `Current reviewed descriptor: ${preview.currentDescriptorHash}`,
    preview.installedDescriptorHash ? `Installed descriptor: ${preview.installedDescriptorHash}` : "Installed descriptor: untracked",
    `Current reviewed at: ${preview.currentReviewedAt}`,
    preview.installedReviewedAt ? `Installed reviewed at: ${preview.installedReviewedAt}` : "Installed reviewed at: untracked",
    preview.sourceUrl ? `Source: ${preview.sourceUrl}` : undefined,
    preview.registrySource ? `Installed source: ${preview.registrySource}` : undefined,
    preview.runtimeLane ? `Runtime lane: ${preview.runtimeLane}` : undefined,
    "",
    "Reviewed default metadata:",
    `- ${preview.title}: ${preview.description}`,
    "",
    "Diff:",
    diffs,
    "",
    "Next action:",
    preview.nextAction,
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpRegistryInstallPreviewText(preview: McpRegistryInstallPreview): string {
  const runPlan = preview.runPlan
    ? [
        "Run plan:",
        `- thv registry server: ${preview.runPlan.serverId}`,
        `- workload: ${preview.runPlan.workloadName}`,
        `- group: ${preview.runPlan.group}`,
        `- isolate network: ${preview.runPlan.isolateNetwork}`,
        `- transport: ${preview.runPlan.transport}`,
        `- permission profile: ${preview.runPlan.permissionProfilePath}`,
        secretRuntimeBindingsText(preview),
        preview.toolHiveVolumes.length ? `- volumes: ${preview.toolHiveVolumes.map((entry) => `${entry.hostPath} -> ${entry.containerPath}:${entry.mode}`).join("; ")}` : undefined,
      ].filter(Boolean).join("\n")
    : "Run plan: not generated because install blockers remain.";
  return [
    preview.review.title,
    `Catalog source: ${preview.catalogSource}`,
    `Outcome: ${preview.review.outcome}`,
    preview.review.summary,
    "",
    `Source: ${preview.review.sourceSummary}`,
    `Runtime: ${preview.review.runtimeSummary}`,
    `Permissions: ${preview.review.permissionSummary}`,
    `Secrets: ${preview.review.secretSummary}`,
    `Validation: ${preview.review.validationSummary}`,
    `Risk: ${preview.candidate.riskSummary.level} - ${preview.candidate.riskSummary.reasons.join(" ")}`,
    "",
    preview.review.blockers.length ? `Blockers:\n${preview.review.blockers.map((item) => `- ${item}`).join("\n")}` : "Blockers: none.",
    preview.review.warnings.length ? `Warnings:\n${preview.review.warnings.map((item) => `- ${item}`).join("\n")}` : "Warnings: none.",
    "",
    runPlan,
  ].join("\n");
}

export function mcpDefaultCapabilityInstallPreviewText(preview: McpDefaultCapabilityInstallPreview): string {
  const runPlan = preview.runPlan
    ? [
        "Run plan:",
        `- thv source: ${preview.toolHiveRunSource}`,
        `- workload: ${preview.runPlan.workloadName}`,
        `- group: ${preview.runPlan.group}`,
        `- isolate network: ${preview.runPlan.isolateNetwork}`,
        `- transport: ${preview.runPlan.transport}`,
        `- permission profile: ${preview.runPlan.permissionProfilePath}`,
        preview.toolHiveServerArgs.length ? `- server args: ${preview.toolHiveServerArgs.join(" ")}` : undefined,
      ].filter(Boolean).join("\n")
    : "Run plan: not generated because install blockers remain.";
  return [
    preview.review.title,
    "Catalog source: ambient-default",
    `Default capability: ${preview.capabilityId}`,
    `Outcome: ${preview.review.outcome}`,
    preview.review.summary,
    "",
    `Source: ${preview.review.sourceSummary}`,
    `Runtime: ${preview.review.runtimeSummary}`,
    `Permissions: ${preview.review.permissionSummary}`,
    `Secrets: ${preview.review.secretSummary}`,
    `Validation: ${preview.review.validationSummary}`,
    `Risk: ${preview.candidate.riskSummary.level} - ${preview.candidate.riskSummary.reasons.join(" ")}`,
    "",
    preview.review.blockers.length ? `Blockers:\n${preview.review.blockers.map((item) => `- ${item}`).join("\n")}` : "Blockers: none.",
    preview.review.warnings.length ? `Warnings:\n${preview.review.warnings.map((item) => `- ${item}`).join("\n")}` : "Warnings: none.",
    "",
    runPlan,
    "",
    `Next: call ambient_mcp_server_install with serverId=${preview.serverId}. Ambient will use the default capability installer and prompt for isolated runtime setup first if Docker/Podman is missing.`,
  ].join("\n");
}

export function mcpStandardImportPreviewText(preview: McpStandardImportPreview): string {
  const runPlan = preview.runPlan
    ? [
        "Run plan:",
        `- thv source: ${preview.toolHiveRunSource}`,
        `- workload: ${preview.runPlan.workloadName}`,
        `- group: ${preview.runPlan.group}`,
        `- isolate network: ${preview.runPlan.isolateNetwork}`,
        `- transport: ${preview.runPlan.transport}`,
        `- permission profile: ${preview.runPlan.permissionProfilePath}`,
        secretRuntimeBindingsText(preview),
        preview.toolHiveEntrypoint ? `- entrypoint: ${preview.toolHiveEntrypoint}` : undefined,
        preview.toolHiveServerArgs.length ? `- server args: ${preview.toolHiveServerArgs.join(" ")}` : undefined,
        preview.toolHiveEnvVars.length ? `- env vars: ${preview.toolHiveEnvVars.map((entry) => entry.name).join(", ")} (values hidden from preview text)` : undefined,
        preview.toolHiveVolumes.length ? `- volumes: ${preview.toolHiveVolumes.map((entry) => `${entry.hostPath} -> ${entry.containerPath}:${entry.mode}`).join("; ")}` : undefined,
        preview.toolHiveRuntimeImage ? `- runtime image: ${preview.toolHiveRuntimeImage}` : undefined,
        preview.imageVerificationPolicy ? `- image verification policy: ${preview.imageVerificationPolicy}` : undefined,
      ].filter(Boolean).join("\n")
    : "Run plan: not generated because install blockers remain.";
  return [
    preview.review.title,
    "Catalog source: standard-mcp-import",
    `Outcome: ${preview.review.outcome}`,
    preview.review.summary,
    "",
    `Source: ${preview.review.sourceSummary}`,
    `Runtime: ${preview.review.runtimeSummary}`,
    `Permissions: ${preview.review.permissionSummary}`,
    `Secrets: ${preview.review.secretSummary}`,
    `Validation: ${preview.review.validationSummary}`,
    `Risk: ${preview.candidate.riskSummary.level} - ${preview.candidate.riskSummary.reasons.join(" ")}`,
    "",
    preview.review.blockers.length ? `Blockers:\n${preview.review.blockers.map((item) => `- ${item}`).join("\n")}` : "Blockers: none.",
    preview.review.warnings.length ? `Warnings:\n${preview.review.warnings.map((item) => `- ${item}`).join("\n")}` : "Warnings: none.",
    "",
    runPlan,
    preview.fallbackRoutes.length ? ["", standardImportFallbackRoutesText(preview.fallbackRoutes)].join("\n") : undefined,
    standardImportInstallNextActionText(preview),
  ].filter((line) => line !== undefined).join("\n");
}

function standardImportInstallNextActionText(preview: McpStandardImportPreview): string | undefined {
  if (!preview.runPlan || preview.review.blockers.length) return undefined;
  const candidateInput = preview.candidateRef
    ? `candidateRef=${preview.candidateRef}${preview.validation.candidateHash ? ` expectedCandidateHash=${preview.validation.candidateHash}` : ""}`
    : `the same candidate JSON${preview.validation.candidateHash ? ` and expectedCandidateHash=${preview.validation.candidateHash}` : ""}`;
  return [
    "",
    `Next: call ambient_mcp_standard_import_install with ${candidateInput}.`,
    "Ambient will request user approval before changing ToolHive, then validate the installed MCP tools.",
    "Do not route this immediate next step back through ambient_tool_search.",
  ].join("\n");
}

function standardImportFallbackRoutesText(routes: McpStandardImportFallbackRoute[]): string {
  const preferred = routes[0];
  const routeLines = routes.map((route, index) => {
    const prefix = index === 0 ? "Preferred" : `Fallback ${index + 1}`;
    if (route.kind === "toolhive-registry-install") {
      return [
        `${prefix}: ToolHive registry install`,
        `- blocked shape: ${route.blockedShape}`,
        `- registry serverId: ${route.serverId}`,
        route.title ? `- title: ${route.title}` : undefined,
        `- reason: ${route.reason}`,
        `- next tool: ${route.nextToolName} ${JSON.stringify(route.nextToolInput)}`,
      ].filter(Boolean).join("\n");
    }
    return [
      `${prefix}: reviewed custom source build`,
      `- blocked shape: ${route.blockedShape}`,
      `- reason: ${route.reason}`,
      `- next tool: ${route.nextToolName} with the same reviewed candidate and expectedCandidateHash from this Standard import request`,
    ].join("\n");
  });
  return [
    "Fallback routes:",
    ...routeLines,
    "",
    preferred ? `Next action: ${standardImportFallbackNextActionText(preferred)}` : undefined,
  ].filter(Boolean).join("\n");
}

function standardImportFallbackNextActionText(route: McpStandardImportFallbackRoute): string {
  if (route.kind === "toolhive-registry-install") return `call ${route.nextToolName} with ${JSON.stringify(route.nextToolInput)}.`;
  return `call ${route.nextToolName} with the same reviewed candidate and expectedCandidateHash from this Standard import request.`;
}

export function mcpRemoteMcpProxyPreviewText(preview: McpRemoteMcpProxyPreview): string {
  const runPlan = preview.runPlan
    ? [
        "Run plan:",
        `- thv remote URL: ${preview.toolHiveRemoteUrl}`,
        `- workload: ${preview.runPlan.workloadName}`,
        `- group: ${preview.runPlan.group}`,
        `- isolate network: ${preview.runPlan.isolateNetwork}`,
        `- transport: ${preview.runPlan.transport}`,
        `- permission profile: ${preview.runPlan.permissionProfilePath}`,
        secretRuntimeBindingsText(preview),
      ].join("\n")
    : "Run plan: not generated because install blockers remain.";
  return [
    preview.review.title,
    "Catalog source: remote-mcp-proxy",
    `Outcome: ${preview.review.outcome}`,
    preview.review.summary,
    "",
    `Source: ${preview.review.sourceSummary}`,
    `Runtime: ${preview.review.runtimeSummary}`,
    `Permissions: ${preview.review.permissionSummary}`,
    `Secrets: ${preview.review.secretSummary}`,
    `Validation: ${preview.review.validationSummary}`,
    `Risk: ${preview.candidate.riskSummary.level} - ${preview.candidate.riskSummary.reasons.join(" ")}`,
    "",
    preview.review.blockers.length ? `Blockers:\n${preview.review.blockers.map((item) => `- ${item}`).join("\n")}` : "Blockers: none.",
    preview.review.warnings.length ? `Warnings:\n${preview.review.warnings.map((item) => `- ${item}`).join("\n")}` : "Warnings: none.",
    "",
    runPlan,
  ].join("\n");
}

export function mcpInstallPreviewText(preview: McpInstallPreview): string {
  if (preview.catalogSource === "standard-mcp-import") return mcpStandardImportPreviewText(preview);
  if (preview.catalogSource === "remote-mcp-proxy") return mcpRemoteMcpProxyPreviewText(preview);
  return mcpRegistryInstallPreviewText(preview);
}

export function mcpInstallPreviewSourceIdentity(preview: McpInstallPreview): ToolHiveInstalledServerSourceIdentity {
  const pkg = preview.candidate.runtime.package;
  const identity: ToolHiveInstalledServerSourceIdentity = {
    runtimeLane: preview.catalogSource === "standard-mcp-import"
      ? "standard-mcp-import"
      : preview.catalogSource === "remote-mcp-proxy"
        ? "remote-mcp-proxy"
        : "toolhive-registry",
    candidateId: preview.candidate.id,
    ...(preview.catalogSource === "standard-mcp-import" && preview.candidateRef ? { candidateRef: preview.candidateRef } : {}),
    riskLevel: preview.candidate.riskSummary.level,
  };
  if (preview.candidate.runtime.sourceKind) identity.sourceKind = preview.candidate.runtime.sourceKind;
  if (preview.candidate.source.url) identity.sourceUrl = preview.candidate.source.url;
  if (preview.candidate.source.resolvedCommit) identity.sourceResolvedCommit = preview.candidate.source.resolvedCommit;
  if (preview.candidate.source.registryId) identity.registryId = preview.candidate.source.registryId;
  if (preview.candidate.source.packageName) identity.packageName = preview.candidate.source.packageName;
  if (pkg?.registryType) identity.packageRegistryType = pkg.registryType;
  if (pkg?.identifier) identity.packageIdentifier = pkg.identifier;
  if (pkg?.version) identity.packageVersion = pkg.version;
  if (pkg?.digest) identity.packageDigest = pkg.digest;
  if (pkg?.fileSha256) identity.packageSha256 = pkg.fileSha256;
  if (preview.candidate.runtime.sourceBuild?.recipeKind) identity.sourceBuildRecipeKind = preview.candidate.runtime.sourceBuild.recipeKind;
  if (preview.candidate.runtime.sourceBuild?.recipeHash) identity.sourceBuildRecipeHash = preview.candidate.runtime.sourceBuild.recipeHash;
  const runSource = preview.catalogSource === "standard-mcp-import"
    ? preview.toolHiveRunSource
    : preview.catalogSource === "remote-mcp-proxy"
      ? preview.toolHiveRemoteUrl
      : preview.runPlan?.sourceRef;
  if (runSource) identity.toolHiveRunSource = runSource;
  if (preview.validation.candidateHash) identity.candidateHash = preview.validation.candidateHash;
  return identity;
}

export function mcpInstallPreviewSecretBindings(preview: McpInstallPreview): ToolHiveSecretBindingState[] {
  return derivedSecretBindingStates(preview.candidate, preview.catalogSource, preview.runPlan?.workloadName ?? preview.serverId, preview.runPlan?.envSecretRefs ?? []);
}

function secretRuntimeBindingsText(preview: McpInstallPreview): string {
  const bindings = mcpInstallPreviewSecretBindings(preview);
  const derived = bindings.flatMap((binding) => binding.derivedBindings ?? []);
  if (!derived.length) return "- secret runtime bindings: none";
  return [
    `- secret runtime bindings: ${derived.map((binding) => `${binding.envName} -> ${binding.kind} ${binding.runtimeName}${binding.target ? ` for ${binding.target}` : ""}`).join("; ")} (Ambient-owned refs; values are not shown)`,
    secretRuntimeBindingPolicyText(derived),
  ].join("\n");
}

function secretRuntimeBindingPolicyText(derived: NonNullable<ToolHiveSecretBindingState["derivedBindings"]>): string {
  const kinds = new Set(derived.map((binding) => binding.kind));
  const policies: string[] = [];
  if (kinds.has("container-env-file")) {
    policies.push("local containerized MCP secrets use short-lived ToolHive --env-file delivery generated from Ambient secret refs; the env file is written outside workspaces, chmod 0600, deleted after launch, and only redacted binding metadata is stored.");
  }
  if (kinds.has("remote-bearer-token-file")) {
    policies.push("Remote MCP proxy secrets use short-lived ToolHive --remote-auth-bearer-token-file delivery generated from Ambient secret refs; the token file is written outside workspaces, chmod 0600, deleted after launch, and only redacted binding metadata is stored.");
  }
  return `- secret delivery policy: ${policies.join(" ")}`;
}

export function mcpInstallPreviewReviewState(preview: McpInstallPreview, reviewedAt?: string): ToolHiveInstallReviewState {
  const review: ToolHiveInstallReviewState = {
    status: preview.review.blockers.length ? "needs-review" : "reviewed",
    outcome: preview.review.outcome,
    summary: preview.review.summary.slice(0, 1_000),
    warningCount: preview.review.warnings.length,
    blockerCount: preview.review.blockers.length,
  };
  if (reviewedAt) review.reviewedAt = reviewedAt;
  return review;
}

function installedServerSourceSummary(identity: ToolHiveInstalledServerSourceIdentity | undefined): Partial<McpInstalledServerSummary> {
  if (!identity) return {};
  return stripUndefined({
    runtimeLane: identity.runtimeLane,
    sourceKind: identity.sourceKind,
    sourceUrl: identity.sourceUrl,
    sourceResolvedCommit: identity.sourceResolvedCommit,
    registryId: identity.registryId,
    packageRegistryType: identity.packageRegistryType,
    packageIdentifier: identity.packageIdentifier,
    packageVersion: identity.packageVersion,
    packageDigest: identity.packageDigest,
    packageSha256: identity.packageSha256,
    sourceBuildRecipeKind: identity.sourceBuildRecipeKind,
    sourceBuildRecipeHash: identity.sourceBuildRecipeHash,
    toolHiveRunSource: identity.toolHiveRunSource,
    candidateId: identity.candidateId,
    candidateRef: identity.candidateRef,
    candidateHash: identity.candidateHash,
    riskLevel: identity.riskLevel,
  });
}

function installedServerSourceText(server: McpInstalledServerSummary): string {
  const parts: string[] = [];
  if (server.runtimeLane) parts.push(`source=${server.runtimeLane}${server.sourceKind ? `/${server.sourceKind}` : ""}`);
  if (server.sourceUrl) parts.push(`sourceUrl=${server.sourceUrl}`);
  if (server.sourceResolvedCommit) parts.push(`commit=${server.sourceResolvedCommit}`);
  if (server.registryId) parts.push(`registryId=${server.registryId}`);
  if (server.packageIdentifier) {
    const packageRef = [
      server.packageRegistryType,
      server.packageIdentifier,
    ].filter(Boolean).join(":");
    const version = server.packageVersion ? `@${server.packageVersion}` : "";
    const digest = server.packageDigest ? ` digest=${server.packageDigest}` : "";
    const sha = server.packageSha256 ? ` sha256=${server.packageSha256}` : "";
    parts.push(`package=${packageRef}${version}${digest}${sha}`);
  }
  if (server.sourceBuildRecipeKind || server.sourceBuildRecipeHash) {
    parts.push(`sourceBuild=${[server.sourceBuildRecipeKind, server.sourceBuildRecipeHash].filter(Boolean).join(":")}`);
  }
  if (server.toolHiveRunSource) parts.push(`runSource=${server.toolHiveRunSource}`);
  if (server.activeRevisionId) parts.push(`activeRevision=${server.activeRevisionId}`);
  if (server.candidateHash) parts.push(`candidateHash=${server.candidateHash}`);
  if (server.riskLevel) parts.push(`risk=${server.riskLevel}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export class McpInstallCatalog {
  private readonly defaultCatalog: McpDefaultCatalogDescriptor[];
  private readonly defaultCatalogByServerId: Map<string, McpDefaultCatalogDescriptor>;
  private readonly packageMetadataResolver?: McpPackageMetadataResolver;

  constructor(
    private readonly toolHive: ToolHiveRuntimeService,
    options: { defaultCatalog?: McpDefaultCatalogDescriptor[]; packageMetadataResolver?: McpPackageMetadataResolver } = {},
  ) {
    this.defaultCatalog = options.defaultCatalog ?? loadDefaultMcpCatalog();
    this.defaultCatalogByServerId = defaultMcpCatalogByServerId(this.defaultCatalog);
    this.packageMetadataResolver = options.packageMetadataResolver;
  }

  async listInstalledServers(): Promise<McpInstalledServerSummary[]> {
    return (await this.listInstalledServerInventory()).servers;
  }

  async listInstalledServerInventory(): Promise<McpInstalledServerInventory> {
    const state = await this.toolHive.readState();
    let workloads: ToolHiveWorkloadSummary[] = [];
    let runtimeListError: string | undefined;
    try {
      workloads = await this.toolHive.listAmbientWorkloadSummaries({ all: true });
    } catch (error) {
      runtimeListError = errorMessage(error);
    }
    const workloadsByName = new Map(workloads.map((workload) => [workload.name, workload]));
    const managedWorkloadNames = new Set(state.installedServers.map((server) => server.workloadName));
    const servers = state.installedServers.map((server) => {
      const workload = workloadsByName.get(server.workloadName);
      const defaultCatalogUpdate = this.defaultCatalogUpdateSummary(server);
      const toolPolicySummary = installedServerToolPolicySummary(server.toolPolicies);
      const endpoint = workload?.endpoint ?? server.endpoint;
      const workloadStatus = workload?.status ?? (server.sourceIdentity?.runtimeLane === "guided-local-bridge" ? "registered-local-bridge" : undefined);
      return {
        serverId: server.serverId,
        workloadName: server.workloadName,
        ...(server.activeRevisionId ? { activeRevisionId: server.activeRevisionId } : {}),
        ...(server.registrySource ? { registrySource: server.registrySource } : {}),
        ...installedServerSourceSummary(server.sourceIdentity),
        ...defaultCatalogUpdate,
        ...(server.installReview?.status ? { installReviewStatus: server.installReview.status } : {}),
        ...(server.installReview?.outcome ? { installReviewOutcome: server.installReview.outcome } : {}),
        ...(server.installReview?.summary ? { installReviewSummary: server.installReview.summary } : {}),
        ...(server.imageVerificationPolicy ? { imageVerificationPolicy: server.imageVerificationPolicy } : {}),
        ...(server.secretBindings?.length
          ? {
              secretBindingCount: server.secretBindings.length,
              secretBindingEnvNames: server.secretBindings.map((binding) => binding.envName),
              ...(installedServerDerivedSecretBindingSummary(server.secretBindings)),
            }
          : {}),
        permissionProfilePath: server.permissionProfilePath,
        permissionProfileSha256: server.permissionProfileSha256,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
        ...(workloadStatus ? { workloadStatus } : {}),
        ...(endpoint ? { endpoint } : {}),
        ...(server.installValidationStatus ? { installValidationStatus: server.installValidationStatus } : {}),
        ...(server.installValidationError ? { installValidationError: server.installValidationError } : {}),
        ...(server.installValidationAt ? { installValidationAt: server.installValidationAt } : {}),
        ...(Array.isArray(server.lastKnownToolDescriptors) ? { lastKnownToolCount: server.lastKnownToolDescriptors.length } : {}),
        ...(server.lastKnownToolDescriptorHash ? { lastKnownToolDescriptorHash: server.lastKnownToolDescriptorHash } : {}),
        ...(server.toolDescriptorReviewStatus ? { toolDescriptorReviewStatus: server.toolDescriptorReviewStatus } : {}),
        ...(server.toolDescriptorReviewReason ? { toolDescriptorReviewReason: server.toolDescriptorReviewReason } : {}),
        ...(server.lastToolDiscoveryAt ? { lastToolDiscoveryAt: server.lastToolDiscoveryAt } : {}),
        ...toolPolicySummary,
        ...(runtimeListError ? { runtimeListError } : {}),
      };
    });
    const unmanagedWorkloads = workloads
      .filter((workload) => workload.name && !managedWorkloadNames.has(workload.name))
      .map((workload) => ({
        workloadName: workload.name!,
        ...(workload.status ? { status: workload.status } : {}),
        ...(workload.endpoint ? { endpoint: workload.endpoint } : {}),
        ...(workload.group ? { group: workload.group } : {}),
        reason: "ToolHive reports this workload in the ambient group, but Ambient has no reviewed install state, permission profile, source identity, or tool descriptor policy for it.",
        nextAction: "Reinstall through ambient_mcp_autowire_plan/review and ambient_mcp_standard_import_describe/install, then remove the unmanaged workload with ToolHive only if the user explicitly asks for manual cleanup.",
      }));
    return { servers, unmanagedWorkloads };
  }

  private defaultCatalogUpdateSummary(server: { serverId: string; defaultCatalogDescriptorHash?: string }): Partial<McpInstalledServerSummary> {
    const descriptor = this.defaultCatalogByServerId.get(server.serverId);
    if (!descriptor) return {};
    const currentHash = mcpDefaultCatalogDescriptorHash(descriptor);
    return {
      defaultCatalogUpdateStatus: server.defaultCatalogDescriptorHash
        ? server.defaultCatalogDescriptorHash === currentHash ? "current" : "update-available"
        : "untracked",
      defaultCatalogDescriptorHash: currentHash,
      ...(server.defaultCatalogDescriptorHash ? { installedDefaultCatalogDescriptorHash: server.defaultCatalogDescriptorHash } : {}),
      defaultCatalogReviewedAt: descriptor.source.reviewedAt,
    };
  }

  async previewDefaultCatalogUpdate(input: { serverId?: string; workloadName?: string }): Promise<McpDefaultCatalogUpdatePreview> {
    const state = await this.toolHive.readState();
    const selected = selectInstalledServerState(state.installedServers, input);
    const descriptor = this.defaultCatalogByServerId.get(selected.serverId);
    if (!descriptor) throw new Error(`No reviewed Ambient default catalog descriptor exists for installed MCP server ${selected.serverId}.`);
    const currentHash = mcpDefaultCatalogDescriptorHash(descriptor);
    const status: McpDefaultCatalogUpdatePreview["status"] = selected.defaultCatalogDescriptorHash
      ? selected.defaultCatalogDescriptorHash === currentHash ? "current" : "update-available"
      : "untracked";
    const diffs = defaultCatalogUpdateDiffs(selected, descriptor, currentHash);
    return {
      serverId: selected.serverId,
      workloadName: selected.workloadName,
      status,
      currentDescriptorHash: currentHash,
      ...(selected.defaultCatalogDescriptorHash ? { installedDescriptorHash: selected.defaultCatalogDescriptorHash } : {}),
      currentReviewedAt: descriptor.source.reviewedAt,
      ...(selected.defaultCatalogReviewedAt ? { installedReviewedAt: selected.defaultCatalogReviewedAt } : {}),
      title: descriptor.title,
      description: descriptor.description,
      ...(descriptor.source.repositoryUrl ? { sourceUrl: descriptor.source.repositoryUrl } : {}),
      ...(selected.registrySource ? { registrySource: selected.registrySource } : {}),
      ...(selected.sourceIdentity?.runtimeLane ? { runtimeLane: selected.sourceIdentity.runtimeLane } : {}),
      diffs,
      nextAction: defaultCatalogUpdateNextAction(status, selected),
    };
  }

  async searchRegistryServers(input: McpServerSearchInput = {}): Promise<McpServerSearchResult[]> {
    const query = normalizeSearchQuery(input.query);
    const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)));
    const [registry, state] = await Promise.all([this.registryListWithDefaults(input), this.toolHive.readState()]);
    const installedByServerId = new Map(state.installedServers.map((server) => [server.serverId, server]));
    const results = registry
      .filter(isRecord)
      .map((entry) => registrySearchResult(
        entry,
        installedByServerId.get(stringField(entry, ["name"]) ?? ""),
        this.catalogSourceForRegistryInfo(entry),
      ));
    results.push(...recommendedStandardMcpImportSearchResults(installedByServerId));
    return scoredSearchResults(results, query).slice(0, limit);
  }

  defaultCapabilityIdForServerId(serverId: string): "scrapling" | undefined {
    return this.defaultCatalogByServerId.get(serverId)?.defaultCapability?.capabilityId;
  }

  async previewRegistryInstall(input: McpRegistryInstallPreviewInput): Promise<McpRegistryInstallPreview> {
    const { registryInfo, catalogSource, defaultDescriptor } = await this.registryInfoWithDefault(input.serverId, input.refresh);
    const volumeReview = reviewedRegistryRuntimeVolumes(input.runtimeVolumes ?? []);
    const candidate = registryCandidateWithRuntimeVolumes(registryInfoToAutowireCandidate(registryInfo), volumeReview.volumes);
    const validation = validateMcpAutowireCandidate(candidate);
    const permissionProfile = registryPermissionProfile(registryInfo, candidate.permissions.filesystem);
    const workloadName = ambientWorkloadName(candidate.source.registryId ?? input.serverId);
    const profileWrite = await this.toolHive.writePermissionProfile({
      serverId: input.serverId,
      workloadName,
      profile: permissionProfile,
    });
    const secretBindings = input.secretBindings ?? [];
    const ambientDefaultOciBlockers = defaultDescriptor?.source.type === "ambient-default-oci"
      ? [
          "This Ambient default OCI capability is owned by the default capability reconciler. Use ambient_mcp_server_describe/install with this serverId in chat, or the Default capabilities action in MCP settings, so Ambient can install the pinned image and workload name deterministically.",
        ]
      : [];
    const runtimeVolumeBlockers = [
      ...volumeReview.blockers,
      ...registryRuntimeVolumeRequirementBlockers(registryInfo, volumeReview.volumes),
    ];
    const review = parseMcpInstallReview(buildInstallReview({
      candidate,
      validation,
      sourceLabel: "ToolHive registry",
      secretBindings,
      ...(ambientDefaultOciBlockers.length || runtimeVolumeBlockers.length
        ? {
            extraBlockers: [...ambientDefaultOciBlockers, ...runtimeVolumeBlockers],
            blockedOutcome: "deferred-unsupported-lane" as const,
          }
        : {}),
      summary: `${candidate.displayName} will be installed from the ToolHive registry and run in the Ambient ToolHive group.`,
      evidenceRefs: ["toolhive-registry-info"],
    }));
    const runPlan = review.blockers.length === 0
      ? parseToolHiveRunPlan({
          schemaVersion: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
          serverId: input.serverId,
          workloadName,
          group: TOOLHIVE_AMBIENT_GROUP,
          isolateNetwork: true,
          permissionProfilePath: profileWrite.path,
          sourceRef: `toolhive-registry:${input.serverId}`,
          transport: normalizeMcpTransport(stringField(registryInfo, ["transport"])),
          envSecretRefs: secretBindings,
          evidenceRefs: ["toolhive-registry-info"],
        })
      : undefined;
    return {
      serverId: input.serverId,
      catalogSource,
      ...(defaultDescriptor ? { defaultDescriptor } : {}),
      registryInfo,
      candidate,
      validation,
      review,
      ...(runPlan ? { runPlan } : {}),
      toolHiveVolumes: volumeReview.volumes,
      permissionProfile: {
        path: profileWrite.path,
        sha256: profileWrite.sha256,
        profile: permissionProfile,
      },
    };
  }

  async previewStandardMcpImport(input: McpStandardImportPreviewInput): Promise<McpStandardImportPreview> {
    const candidate = parseMcpAutowireCandidate(input.candidate);
    const validation = validateMcpAutowireCandidate(candidate);
    const importSpec = standardMcpImportSpec(candidate);
    const imageVerificationPolicy = standardImportImageVerificationPolicy(candidate);
    const packageMetadataBlockers = await this.standardImportPackageMetadataBlockers(candidate);
    const secretBindings = input.secretBindings ?? [];
    const hashBlockers = candidateHashMismatchBlocker(input.expectedCandidateHash, validation.candidateHash);
    const fallbackRoutes = await this.standardImportFallbackRoutes({
      candidate,
      importSpec,
      candidateRef: input.candidateRef,
      expectedCandidateHash: input.expectedCandidateHash,
      packageMetadataBlockers,
      hashBlockers,
    });
    const workloadName = ambientWorkloadName(candidate.id);
    const managedFileExchange = mcpManagedFileExchangeForWorkload(this.toolHive.stateRoot(), workloadName);
    const permissionProfile = candidatePermissionProfile(candidate, managedFileExchange);
    const profileWrite = await this.toolHive.writePermissionProfile({
      serverId: candidate.id,
      workloadName,
      profile: permissionProfile,
    });
    const review = parseMcpInstallReview(buildInstallReview({
      candidate,
      validation,
      sourceLabel: "Standard MCP import",
      secretBindings,
      extraBlockers: [
        ...hashBlockers,
        ...importSpec.blockers,
        ...packageMetadataBlockers,
      ],
      blockedOutcome: hashBlockers.length ? undefined : importSpec.blockedOutcome,
      summary: `${candidate.displayName} will be imported as a reviewed Standard MCP source and run in the Ambient ToolHive group.`,
      evidenceRefs: candidate.evidence.map((entry) => entry.id).slice(0, 20),
    }));
    const runPlan = review.blockers.length === 0 && importSpec.toolHiveRunSource
      ? parseToolHiveRunPlan({
          schemaVersion: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
          serverId: candidate.id,
          workloadName,
          group: TOOLHIVE_AMBIENT_GROUP,
          isolateNetwork: true,
          permissionProfilePath: profileWrite.path,
          sourceRef: importSpec.sourceRef,
          transport: normalizeMcpTransport(candidate.runtime.transport),
          envSecretRefs: secretBindings,
          evidenceRefs: candidate.runtime.evidenceRefs,
        })
      : undefined;
    return {
      serverId: candidate.id,
      catalogSource: "standard-mcp-import",
      ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
      candidate,
      validation,
      review,
      ...(runPlan ? { runPlan } : {}),
      fallbackRoutes,
      ...(importSpec.toolHiveRunSource ? { toolHiveRunSource: importSpec.toolHiveRunSource } : {}),
      ...(importSpec.entrypointSummary ? { toolHiveEntrypoint: importSpec.entrypointSummary } : {}),
      toolHiveServerArgs: importSpec.serverArgs,
      toolHiveEnvVars: importSpec.envVars,
      toolHiveVolumes: [...importSpec.volumes, mcpManagedFileExchangeVolume(managedFileExchange)],
      ...(importSpec.runtimeImage ? { toolHiveRuntimeImage: importSpec.runtimeImage } : {}),
      ...(imageVerificationPolicy ? { imageVerificationPolicy } : {}),
      permissionProfile: {
        path: profileWrite.path,
        sha256: profileWrite.sha256,
        profile: permissionProfile,
      },
    };
  }

  private async standardImportFallbackRoutes(input: {
    candidate: McpAutowireCandidate;
    importSpec: StandardMcpImportSpec;
    candidateRef?: string;
    expectedCandidateHash?: string;
    packageMetadataBlockers: string[];
    hashBlockers: string[];
  }): Promise<McpStandardImportFallbackRoute[]> {
    const blockedShape = input.importSpec.blockedLaunchShape;
    if (!blockedShape) return [];
    if (input.hashBlockers.length) return [];
    if (input.packageMetadataBlockers.length) return [];
    const routes: McpStandardImportFallbackRoute[] = [];
    const registryRoute = await this.exactRegistryFallbackRoute(input.candidate, blockedShape);
    if (registryRoute) routes.push(registryRoute);
    if (input.candidate.source.kind === "github" && input.candidate.source.url) {
      routes.push({
        kind: "custom-source-build",
        status: "available",
        blockedShape: blockedShape.kind,
        reason: [
          "Direct ToolHive package protocol cannot encode this package entrypoint shape.",
          "If no exact ToolHive registry route is acceptable, continue through Ambient's reviewed source-build lane instead of unmanaged shell commands.",
        ].join(" "),
        evidenceRefs: input.candidate.evidence.map((entry) => entry.id).slice(0, 20),
        nextToolName: "ambient_mcp_autowire_source_build_describe",
        nextToolInput: {
          ...(input.candidateRef ? { candidateRef: input.candidateRef } : { candidate: input.candidate }),
          ...(input.expectedCandidateHash ? { expectedCandidateHash: input.expectedCandidateHash } : {}),
        },
      });
    }
    return routes;
  }

  private async exactRegistryFallbackRoute(
    candidate: McpAutowireCandidate,
    blockedShape: McpStandardImportBlockedLaunchShape,
  ): Promise<McpStandardImportFallbackRoute | undefined> {
    let registry: Record<string, unknown>[];
    try {
      registry = await this.registryListWithDefaults({});
    } catch {
      return undefined;
    }
    const match = selectExactRegistryFallback(candidate, blockedShape, registry);
    if (!match) return undefined;
    const serverId = requiredStringField(match, ["name"], "registry server name");
    const title = stringField(match, ["title"]) ?? serverId;
    return {
      kind: "toolhive-registry-install",
      status: "ready",
      blockedShape: blockedShape.kind,
      serverId,
      title,
      reason: [
        "Direct ToolHive package protocol cannot encode this package entrypoint shape.",
        "Ambient found an exact ToolHive registry entry with matching repository and package/source identity, so use the registry install lane.",
      ].join(" "),
      evidenceRefs: ["toolhive-registry-list", ...candidate.evidence.map((entry) => entry.id).slice(0, 12)],
      nextToolName: "ambient_mcp_server_describe",
      nextToolInput: { serverId },
    };
  }

  private async standardImportPackageMetadataBlockers(candidate: McpAutowireCandidate): Promise<string[]> {
    const pkg = candidate.runtime.package;
    if (!this.packageMetadataResolver || !pkg || pkg.registryType === "oci" || pkg.registryType === "mcpb") return [];
    if (pkg.registryType !== "npm" && pkg.registryType !== "pypi") return [];
    const blockers: string[] = [];
    let metadata: McpPackageMetadataResolution;
    try {
      metadata = await this.packageMetadataResolver({
        registryType: pkg.registryType,
        identifier: pkg.identifier,
      });
    } catch (error) {
      blockers.push(`${registryLabel(pkg.registryType)} package ${pkg.identifier} could not be validated before ToolHive import: ${errorMessage(error)}.`);
      return blockers;
    }
    if (!metadata.found) {
      blockers.push(packageMetadataNotFoundBlocker(candidate, pkg, metadata));
      return blockers;
    }
    if (metadata.normalizedIdentifier && !samePackageIdentifier(pkg.registryType, metadata.normalizedIdentifier, pkg.identifier)) {
      blockers.push(`${registryLabel(pkg.registryType)} package validation resolved ${pkg.identifier} to ${metadata.normalizedIdentifier}; rerun autowire with the resolved package coordinate before installing.`);
    }
    if (candidate.source.packageName && !samePackageIdentifier(pkg.registryType, candidate.source.packageName, pkg.identifier)) {
      blockers.push(`Candidate source package ${candidate.source.packageName} conflicts with runtime package ${pkg.identifier}. Rerun autowire or review the candidate before installing.`);
    }
    const sourceRepo = candidate.source.url ? githubRepoKey(candidate.source.url) : undefined;
    const metadataRepo = metadata.repositoryUrl ? githubRepoKey(metadata.repositoryUrl) : undefined;
    if (pkg.registryType === "npm" && sourceRepo && metadataRepo && sourceRepo !== metadataRepo) {
      blockers.push(`Package metadata repository ${metadata.repositoryUrl} does not match candidate source ${candidate.source.url}. Rerun autowire with evidence for the intended package before installing.`);
    }
    return blockers;
  }

  async previewRemoteMcpProxy(input: McpRemoteMcpProxyPreviewInput): Promise<McpRemoteMcpProxyPreview> {
    const candidate = parseMcpAutowireCandidate(input.candidate);
    const validation = validateMcpAutowireCandidate(candidate);
    const proxySpec = remoteMcpProxySpec(candidate, input.secretBindings ?? []);
    const permissionProfile = candidatePermissionProfile(candidate);
    const workloadName = ambientWorkloadName(candidate.id);
    const profileWrite = await this.toolHive.writePermissionProfile({
      serverId: candidate.id,
      workloadName,
      profile: permissionProfile,
    });
    const secretBindings = input.secretBindings ?? [];
    const review = parseMcpInstallReview(buildInstallReview({
      candidate,
      validation,
      sourceLabel: "Remote MCP proxy",
      secretBindings,
      extraBlockers: [
        ...candidateHashMismatchBlocker(input.expectedCandidateHash, validation.candidateHash),
        ...proxySpec.blockers,
      ],
      summary: `${candidate.displayName} will be connected through a reviewed ToolHive remote MCP proxy in the Ambient ToolHive group.`,
      evidenceRefs: candidate.evidence.map((entry) => entry.id).slice(0, 20),
    }));
    const runPlan = review.blockers.length === 0 && proxySpec.remoteUrl
      ? parseToolHiveRunPlan({
          schemaVersion: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
          serverId: candidate.id,
          workloadName,
          group: TOOLHIVE_AMBIENT_GROUP,
          isolateNetwork: true,
          permissionProfilePath: profileWrite.path,
          sourceRef: proxySpec.remoteUrl,
          transport: normalizeRemoteMcpTransport(candidate.runtime.transport),
          envSecretRefs: secretBindings,
          evidenceRefs: candidate.runtime.evidenceRefs,
        })
      : undefined;
    return {
      serverId: candidate.id,
      catalogSource: "remote-mcp-proxy",
      candidate,
      validation,
      review,
      ...(runPlan ? { runPlan } : {}),
      ...(proxySpec.remoteUrl ? { toolHiveRemoteUrl: proxySpec.remoteUrl } : {}),
      permissionProfile: {
        path: profileWrite.path,
        sha256: profileWrite.sha256,
        profile: permissionProfile,
      },
    };
  }

  async previewDefaultCapabilityInstall(input: { capabilityId: "scrapling" }): Promise<McpDefaultCapabilityInstallPreview> {
    const defaultDescriptor = this.defaultCatalog.find((descriptor) => descriptor.defaultCapability?.capabilityId === input.capabilityId);
    if (!defaultDescriptor?.defaultCapability) throw new Error(`No packaged default MCP capability descriptor found for ${input.capabilityId}.`);
    if (defaultDescriptor.source.type !== "ambient-default-oci") {
      throw new Error(`Default capability ${input.capabilityId} must use Ambient-owned OCI metadata, got ${defaultDescriptor.source.type}.`);
    }
    const registryInfo = {
      ...defaultDescriptor.registryInfo,
      ambient_default_catalog: true,
    };
    const candidate = registryInfoToAutowireCandidate(registryInfo);
    const validation = validateMcpAutowireCandidate(candidate);
    const permissionProfile = registryPermissionProfile(registryInfo);
    const workloadName = defaultDescriptor.defaultCapability.workloadName;
    const profileWrite = await this.toolHive.writePermissionProfile({
      serverId: defaultDescriptor.serverId,
      workloadName,
      profile: permissionProfile,
    });
    const toolHiveRunSource = stringField(registryInfo, ["image"]);
    const toolHiveServerArgs = stringArrayField(registryInfo, ["server_args", "serverArgs"]);
    const extraBlockers = [
      ...(toolHiveRunSource ? [] : ["Ambient default OCI capability requires registryInfo.image."]),
      ...(toolHiveRunSource?.includes("@sha256:") ? [] : ["Ambient default OCI capability image must be pinned by digest."]),
      ...toolHiveServerArgs.filter((arg) => !arg.trim()).map(() => "Ambient default OCI capability server_args must contain only non-empty strings."),
    ];
    const review = parseMcpInstallReview(buildInstallReview({
      candidate,
      validation,
      sourceLabel: "Ambient default OCI capability",
      secretBindings: [],
      extraBlockers,
      summary: `${candidate.displayName} will be installed as an Ambient default capability from the pinned OCI image and run in the Ambient ToolHive group.`,
      evidenceRefs: defaultDescriptor.source.evidenceRefs,
    }));
    const runPlan = review.blockers.length === 0 && toolHiveRunSource
      ? parseToolHiveRunPlan({
          schemaVersion: TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
          serverId: defaultDescriptor.serverId,
          workloadName,
          group: TOOLHIVE_AMBIENT_GROUP,
          isolateNetwork: true,
          permissionProfilePath: profileWrite.path,
          sourceRef: toolHiveRunSource,
          transport: normalizeMcpTransport(stringField(registryInfo, ["transport"])),
          envSecretRefs: [],
          evidenceRefs: defaultDescriptor.source.evidenceRefs,
        })
      : undefined;
    return {
      serverId: defaultDescriptor.serverId,
      capabilityId: input.capabilityId,
      catalogSource: "ambient-default",
      defaultDescriptor,
      registryInfo,
      candidate,
      validation,
      review,
      ...(runPlan ? { runPlan } : {}),
      ...(toolHiveRunSource ? { toolHiveRunSource } : {}),
      toolHiveServerArgs,
      permissionProfile: {
        path: profileWrite.path,
        sha256: profileWrite.sha256,
        profile: permissionProfile,
      },
    };
  }

  private async registryListWithDefaults(input: McpServerSearchInput): Promise<Record<string, unknown>[]> {
    const byId = new Map<string, Record<string, unknown>>(this.defaultCatalog.map((descriptor) => [descriptor.serverId, {
      ...descriptor.registryInfo,
      ambient_default_catalog: true,
    }]));
    try {
      for (const entry of await this.toolHive.registryList({ refresh: input.refresh })) {
        if (!isRecord(entry)) continue;
        const serverId = stringField(entry, ["name"]);
        if (!serverId) continue;
        byId.set(serverId, {
          ...entry,
          ...(byId.has(serverId) ? { ambient_default_catalog: true, ambient_live_registry: true } : { ambient_live_registry: true }),
        });
      }
    } catch (error) {
      if (!byId.size) throw error;
    }
    return [...byId.values()];
  }

  private async registryInfoWithDefault(serverId: string, refresh?: boolean): Promise<{
    registryInfo: Record<string, unknown>;
    catalogSource: McpCatalogSource;
    defaultDescriptor?: McpDefaultCatalogDescriptor;
  }> {
    const defaultDescriptor = this.defaultCatalogByServerId.get(serverId);
    if (!refresh && defaultDescriptor) {
      return {
        registryInfo: { ...defaultDescriptor.registryInfo, ambient_default_catalog: true },
        catalogSource: "ambient-default",
        defaultDescriptor,
      };
    }
    try {
      const registryInfo = await this.toolHive.registryInfo(serverId, { refresh });
      return {
        registryInfo: {
          ...registryInfo,
          ...(defaultDescriptor ? { ambient_default_catalog: true, ambient_live_registry: true } : { ambient_live_registry: true }),
        },
        catalogSource: defaultDescriptor ? "ambient-default+toolhive-registry" : "toolhive-registry",
        ...(defaultDescriptor ? { defaultDescriptor } : {}),
      };
    } catch (error) {
      if (!defaultDescriptor) throw error;
      return {
        registryInfo: { ...defaultDescriptor.registryInfo, ambient_default_catalog: true },
        catalogSource: "ambient-default",
        defaultDescriptor,
      };
    }
  }

  private catalogSourceForRegistryInfo(info: Record<string, unknown>): McpCatalogSource {
    const fromDefault = info.ambient_default_catalog === true;
    const fromRegistry = info.ambient_live_registry === true;
    if (fromDefault && fromRegistry) return "ambient-default+toolhive-registry";
    if (fromDefault) return "ambient-default";
    return "toolhive-registry";
  }
}

function installedServerToolPolicySummary(policies: unknown): Partial<McpInstalledServerSummary> {
  if (!policies || typeof policies !== "object" || Array.isArray(policies)) return {};
  const values = Object.values(policies).filter(isRecord);
  if (!values.length) return {};
  return {
    toolPolicyCount: values.length,
    hiddenToolPolicyCount: values.filter((policy) => policy.visibility === "hidden").length,
    blockedToolPolicyCount: values.filter((policy) => policy.callPolicy === "blocked").length,
  };
}

function installedServerDerivedSecretBindingSummary(bindings: ToolHiveSecretBindingState[]): Partial<McpInstalledServerSummary> {
  const derived = bindings.flatMap((binding) => binding.derivedBindings ?? []);
  if (!derived.length) return {};
  return {
    derivedSecretBindingCount: derived.length,
    derivedSecretBindingKinds: [...new Set(derived.map((binding) => binding.kind))],
  };
}

function selectInstalledServerState(
  servers: ToolHiveInstalledServerState[],
  selector: { serverId?: string; workloadName?: string },
): ToolHiveInstalledServerState {
  const serverId = selector.serverId?.trim();
  const workloadName = selector.workloadName?.trim();
  if (!serverId && !workloadName) throw new Error("serverId or workloadName is required.");
  const matches = servers.filter((server) =>
    (!serverId || server.serverId === serverId) &&
    (!workloadName || server.workloadName === workloadName)
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new Error(`Multiple installed Ambient MCP servers match ${serverId ?? workloadName}. Retry with both serverId and workloadName.`);
  }
  throw new Error(`No installed Ambient MCP server matches ${serverId ?? workloadName}.`);
}

function defaultCatalogUpdateDiffs(
  server: ToolHiveInstalledServerState,
  descriptor: McpDefaultCatalogDescriptor,
  currentHash: string,
): McpDefaultCatalogUpdateDiff[] {
  const diffs: McpDefaultCatalogUpdateDiff[] = [];
  addDiff(diffs, "default descriptor hash", server.defaultCatalogDescriptorHash, currentHash, "review");
  addDiff(diffs, "default reviewed at", server.defaultCatalogReviewedAt, descriptor.source.reviewedAt, "review");
  addDiff(diffs, "repository URL", server.sourceIdentity?.sourceUrl, descriptor.source.repositoryUrl, "source");
  addDiff(diffs, "registry source", server.registrySource, "ambient-default", "state", (installed, current) => installed !== current && installed !== "ambient-default+toolhive-registry");

  const currentImage = stringField(descriptor.registryInfo, ["image"]);
  addDiff(diffs, "runtime image/package", server.sourceIdentity?.packageIdentifier, currentImage, "runtime");
  addDiff(diffs, "runtime image/package version", server.sourceIdentity?.packageVersion, currentImage ? ociImageTag(currentImage) : undefined, "runtime");

  const currentTools = stringArrayField(descriptor.registryInfo, ["tools"]).sort((left, right) => left.localeCompare(right));
  const installedTools = installedToolNames(server).sort((left, right) => left.localeCompare(right));
  if (currentTools.length) {
    addDiff(
      diffs,
      "declared tools",
      installedTools.length ? installedTools.join(", ") : undefined,
      currentTools.join(", "),
      "tools",
    );
  }

  const currentSecretNames = envVarRecords(descriptor.registryInfo.env_vars)
    .filter((env) => env.secret)
    .map((env) => env.name)
    .sort((left, right) => left.localeCompare(right));
  const installedSecretNames = (server.secretBindings ?? [])
    .map((binding) => binding.envName)
    .sort((left, right) => left.localeCompare(right));
  if (currentSecretNames.length || installedSecretNames.length) {
    addDiff(
      diffs,
      "declared secret refs",
      installedSecretNames.length ? installedSecretNames.join(", ") : undefined,
      currentSecretNames.length ? currentSecretNames.join(", ") : "none",
      "secrets",
    );
  }

  return diffs;
}

function addDiff(
  diffs: McpDefaultCatalogUpdateDiff[],
  field: string,
  installed: string | undefined,
  current: string | undefined,
  impact: McpDefaultCatalogUpdateDiff["impact"],
  changed: (installed: string | undefined, current: string | undefined) => boolean = (left, right) => Boolean(right) && left !== right,
): void {
  const normalizedCurrent = current?.trim();
  const normalizedInstalled = installed?.trim();
  if (!normalizedCurrent || !changed(normalizedInstalled, normalizedCurrent)) return;
  diffs.push({
    field,
    ...(normalizedInstalled ? { installed: normalizedInstalled } : {}),
    current: normalizedCurrent,
    impact,
  });
}

function installedToolNames(server: ToolHiveInstalledServerState): string[] {
  return (server.lastKnownToolDescriptors ?? []).flatMap((descriptor) => {
    if (!isRecord(descriptor)) return [];
    const name = descriptor.name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

function defaultCatalogUpdateNextAction(status: McpDefaultCatalogUpdatePreview["status"], server: ToolHiveInstalledServerState): string {
  if (status === "current") {
    return "No default-catalog update is pending. Keep using the installed workload unless descriptor drift or runtime health checks require separate action.";
  }
  const action = status === "untracked" ? "adopt the reviewed bundled default descriptor" : "upgrade to the reviewed bundled default descriptor";
  const secretText = server.secretBindings?.length
    ? ` Reuse the existing Ambient secret refs for ${server.secretBindings.map((binding) => binding.envName).join(", ")} if the user approves reinstall.`
    : "";
  return `This review is read-only. To ${action}, ask for explicit approval, remove the old workload with ambient_mcp_server_uninstall using serverId ${server.serverId} and workloadName ${server.workloadName}, then reinstall the same serverId with ambient_mcp_server_install. Do not mark the descriptor current without reinstalling the workload.${secretText}`;
}

export function registryInfoToAutowireCandidate(info: Record<string, unknown>): McpAutowireCandidate {
  const serverId = requiredStringField(info, ["name"], "registry server name");
  const title = stringField(info, ["title"]) ?? serverId;
  const description = stringField(info, ["description"]) ?? "ToolHive registry MCP server.";
  const repositoryUrl = urlStringField(info, ["repository_url", "repositoryUrl"]);
  const image = stringField(info, ["image"]);
  const imageVersion = image ? ociImageTag(image) : undefined;
  const tools = stringArrayField(info, ["tools"]);
  const envVars = envVarRecords(info.env_vars);
  const secrets = envVars
    .filter((env) => env.secret === true)
    .map((env) => ({
      name: env.name,
      required: env.required === true,
      secret: true as const,
      purpose: env.description || `${env.name} secret for ${title}.`,
      evidenceRefs: ["toolhive-registry-info"],
    }));
  const requiredPlainEnv = envVars.filter((env) => env.required === true && env.secret !== true);
  const permissions = registryCandidatePermissions(info);
  const risk = registryRiskSummary(info, secrets);
  const updatePolicy = registryRuntimeUpdatePolicy(info);

  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: `toolhive-registry-${safeIdSegment(serverId)}`,
    displayName: title,
    source: {
      kind: "toolhive-registry",
      ...(repositoryUrl ? { url: repositoryUrl } : {}),
      registryId: serverId,
      evidenceRefs: ["toolhive-registry-info"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "registry",
      transport: normalizeMcpTransport(stringField(info, ["transport"])),
      ...(image
        ? {
            package: {
              registryType: "oci",
              identifier: image,
              ...(imageVersion ? { version: imageVersion } : {}),
              packageArguments: [],
            },
          }
        : {}),
      ...(updatePolicy ? { updatePolicy } : {}),
      evidenceRefs: ["toolhive-registry-info"],
    },
    secrets,
    permissions,
    validationPlan: {
      preflights: ["toolhive-version", "container-runtime", "mcp-tool-discovery"],
      expectedTools: tools,
      evidenceRefs: ["toolhive-registry-info"],
    },
    evidence: [
      {
        id: "toolhive-registry-info",
        type: "registry",
        locator: `toolhive registry info ${serverId}`,
        summary: `${title}: ${description}`,
      },
    ],
    openQuestions: [
      ...requiredPlainEnv.map((env) => ({
        question: `Required non-secret environment value ${env.name} must be configured before install.`,
        impact: "runtime" as const,
        blocksInstall: true,
        evidenceRefs: ["toolhive-registry-info"],
      })),
      ...(permissions.network.mode === "broad"
        ? [{
            question: "This server requests broad outbound network access; confirm this is appropriate for the user's task.",
            impact: "network" as const,
            blocksInstall: false,
            evidenceRefs: ["toolhive-registry-info"],
          }]
        : []),
    ],
    riskSummary: risk,
  };
}

export interface StandardMcpImportSpec {
  toolHiveRunSource?: string;
  sourceRef: string;
  entrypointSummary?: string;
  blockedLaunchShape?: McpStandardImportBlockedLaunchShape;
  serverArgs: string[];
  envVars: ToolHivePlainEnvVar[];
  volumes: ToolHiveRunVolume[];
  runtimeImage?: string;
  blockers: string[];
  blockedOutcome?: McpAutowireOutcome;
}

interface RemoteMcpProxySpec {
  remoteUrl?: string;
  blockers: string[];
}

type McpRuntimePackage = NonNullable<McpAutowireCandidate["runtime"]["package"]>;
type McpRuntimePackageArgument = McpRuntimePackage["packageArguments"][number];

export function createPublicMcpPackageMetadataResolver(fetchImpl: typeof fetch = fetch): McpPackageMetadataResolver {
  return async (input) => {
    if (input.registryType === "npm") {
      const url = npmRegistryMetadataUrl(input.identifier);
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/vnd.npm.install-v1+json,application/json;q=0.9,*/*;q=0.1",
          "user-agent": "Ambient-Desktop-MCP-Import",
        },
      });
      if (response.status === 404) {
        return { registryType: "npm", identifier: input.identifier, found: false, error: `HTTP 404 from ${url}` };
      }
      const text = await response.text();
      if (!response.ok) {
        return { registryType: "npm", identifier: input.identifier, found: false, error: `HTTP ${response.status} from ${url}` };
      }
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return {
        registryType: "npm",
        identifier: input.identifier,
        found: true,
        normalizedIdentifier: stringField(parsed, ["name"]) ?? input.identifier,
        repositoryUrl: repositoryUrlFromPackageMetadata(parsed),
      };
    }

    const url = `https://pypi.org/pypi/${encodeURIComponent(input.identifier)}/json`;
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json,*/*;q=0.1",
        "user-agent": "Ambient-Desktop-MCP-Import",
      },
    });
    if (response.status === 404) {
      return { registryType: "pypi", identifier: input.identifier, found: false, error: `HTTP 404 from ${url}` };
    }
    const text = await response.text();
    if (!response.ok) {
      return { registryType: "pypi", identifier: input.identifier, found: false, error: `HTTP ${response.status} from ${url}` };
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const info = parsed.info && typeof parsed.info === "object" && !Array.isArray(parsed.info)
      ? parsed.info as Record<string, unknown>
      : {};
    return {
      registryType: "pypi",
      identifier: input.identifier,
      found: true,
      normalizedIdentifier: stringField(info, ["name"]) ?? input.identifier,
      repositoryUrl: repositoryUrlFromPackageMetadata(info),
    };
  };
}

function npmRegistryMetadataUrl(identifier: string): string {
  if (identifier.startsWith("@")) {
    const [scope, name] = identifier.split("/");
    if (scope && name) return `https://registry.npmjs.org/${encodeURIComponent(scope)}%2f${encodeURIComponent(name)}`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(identifier)}`;
}

function repositoryUrlFromPackageMetadata(record: Record<string, unknown>): string | undefined {
  const repository = record.repository;
  if (typeof repository === "string") return normalizeRepositoryUrl(repository);
  if (repository && typeof repository === "object" && !Array.isArray(repository)) {
    const url = stringField(repository, ["url"]);
    if (url) return normalizeRepositoryUrl(url);
  }
  const projectUrls = record.project_urls ?? record.projectUrls;
  if (projectUrls && typeof projectUrls === "object" && !Array.isArray(projectUrls)) {
    const urls = projectUrls as Record<string, unknown>;
    for (const key of ["Source", "Source Code", "Homepage", "Repository"]) {
      const value = typeof urls[key] === "string" ? urls[key] : undefined;
      if (value) return normalizeRepositoryUrl(value);
    }
  }
  return normalizeRepositoryUrl(stringField(record, ["home_page", "homepage", "url"]));
}

function normalizeRepositoryUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim();
  normalized = normalized.replace(/^git\+/, "").replace(/^github:/, "https://github.com/");
  normalized = normalized.replace(/^git@github\.com:/, "https://github.com/");
  normalized = normalized.replace(/\.git$/i, "");
  return normalized || undefined;
}

function registryLabel(registryType: "npm" | "pypi"): string {
  return registryType === "npm" ? "NPM" : "PyPI";
}

function packageMetadataNotFoundBlocker(
  candidate: McpAutowireCandidate,
  pkg: NonNullable<McpAutowireCandidate["runtime"]["package"]>,
  metadata: McpPackageMetadataResolution,
): string {
  const base = `${registryLabel(metadata.registryType)} package ${pkg.identifier} was not found by package metadata validation${metadata.error ? `: ${metadata.error}` : ""}.`;
  if (candidate.source.kind !== "github" || !candidate.source.url || candidate.runtime.provider !== "toolhive") {
    return `${base} Rerun ambient_mcp_autowire_plan with the correct package coordinate before installing.`;
  }
  return `${base} This candidate is backed by GitHub source ${candidate.source.url}; do not fall back to unmanaged local commands. Continue through the custom ToolHive source lane: resolve and pin the GitHub commit, create or review a source-build plan or reviewed OCI image, then install only after the candidate uses runtime.sourceKind=custom-image with an OCI image digest and updatePolicy.mode=pinned. If later evidence proves a standard package exists, rerun ambient_mcp_autowire_plan with that coordinate.`;
}

function samePackageIdentifier(registryType: "npm" | "pypi", left: string, right: string): boolean {
  return registryType === "npm"
    ? left.toLowerCase() === right.toLowerCase()
    : normalizePyPiName(left) === normalizePyPiName(right);
}

function normalizePyPiName(value: string): string {
  return value.toLowerCase().replace(/[-_.]+/g, "-");
}

function githubRepoKey(value: string): string | undefined {
  try {
    const normalized = normalizeRepositoryUrl(value);
    if (!normalized) return undefined;
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") return undefined;
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return undefined;
    return `${owner.toLowerCase()}/${repoRaw.replace(/\.git$/i, "").toLowerCase()}`;
  } catch {
    return undefined;
  }
}

export function standardMcpImportSpec(candidate: McpAutowireCandidate): StandardMcpImportSpec {
  const blockers: string[] = [];
  let blockedOutcome: McpAutowireOutcome | undefined;
  if (candidate.recommendedLane !== "standard-mcp") {
    blockers.push(`Standard MCP import requires recommendedLane standard-mcp, got ${candidate.recommendedLane}.`);
  }
  if (candidate.runtime.provider !== "toolhive") {
    blockers.push(`Standard MCP import requires ToolHive runtime provider, got ${candidate.runtime.provider}.`);
  }
  if (candidate.runtime.sourceKind === "registry") {
    blockers.push("Registry-backed candidates must use ambient_mcp_server_describe/install, not Standard MCP import.");
  }
  const volumeResult = reviewedToolHiveVolumes(candidate.permissions.filesystem);
  blockers.push(...volumeResult.blockers);
  if (volumeResult.blockers.length) {
    blockedOutcome = "deferred-unsupported-lane";
  }
  const pkg = candidate.runtime.package;
  if (!pkg) {
    blockers.push("Standard MCP import requires package or image metadata.");
    return { sourceRef: `standard-mcp:${candidate.runtime.sourceKind}:${candidate.id}`, serverArgs: [], envVars: [], volumes: volumeResult.volumes, blockers, ...(blockedOutcome ? { blockedOutcome } : {}) };
  }
  const argResult = fixedToolHiveServerArgs(pkg.packageArguments);
  blockers.push(...argResult.blockers);
  const serverArgs = reviewedStandardMcpServerArgs(pkg, argResult.args, volumeResult.volumes, blockers);
  const entrypointResult = reviewedToolHivePackageEntrypoint(pkg);
  blockers.push(...entrypointResult.blockers);
  const envVars = toolHiveRuntimeCompatibilityEnvVars(pkg.registryType, argResult.envVars);
  const runtimeImage = reviewedToolHiveRuntimeImage(pkg.runtimeImage, pkg.registryType, blockers);
  const version = pkg.version ? `@${pkg.version}` : "";
  const source = (() => {
    if (pkg.registryType === "pypi") return `uvx://${pkg.identifier}${version}`;
    if (pkg.registryType === "npm") return `npx://${pkg.identifier}${version}`;
    if (pkg.registryType === "oci") return pkg.identifier;
    if (pkg.registryType === "mcpb") {
      blockers.push("MCPB package imports are recognized but deferred until ToolHive run support is validated for MCPB sources.");
      blockedOutcome = "deferred-unsupported-lane";
      return undefined;
    }
    blockers.push(`Unsupported Standard MCP package registry type ${pkg.registryType}.`);
    blockedOutcome = "deferred-unsupported-lane";
    return undefined;
  })();
  return {
    ...(source ? { toolHiveRunSource: source } : {}),
    sourceRef: `${candidate.runtime.sourceKind}:${candidate.source.url ?? candidate.source.packageName ?? candidate.id}`,
    ...(entrypointResult.summary ? { entrypointSummary: entrypointResult.summary } : {}),
    ...(entrypointResult.blockedLaunchShape ? { blockedLaunchShape: entrypointResult.blockedLaunchShape } : {}),
    serverArgs,
    envVars,
    volumes: volumeResult.volumes,
    ...(runtimeImage ? { runtimeImage } : {}),
    blockers,
    ...(blockedOutcome || entrypointResult.blockedOutcome ? { blockedOutcome: blockedOutcome ?? entrypointResult.blockedOutcome } : {}),
  };
}

function reviewedToolHiveVolumes(filesystem: McpAutowireCandidate["permissions"]["filesystem"]): { volumes: ToolHiveRunVolume[]; blockers: string[] } {
  const volumes: ToolHiveRunVolume[] = [];
  const blockers: string[] = [];
  if (filesystem.workspaceRead) {
    blockers.push("Standard MCP import requires explicit reviewed extraMounts instead of workspace-wide read access.");
  }
  if (filesystem.workspaceWrite) {
    blockers.push("Standard MCP import does not support workspace-wide write access.");
  }
  filesystem.extraMounts.forEach((mount, index) => {
    const label = `filesystem.extraMounts[${index}]`;
    if (mount.mode !== "read-only") {
      blockers.push(`${label} requests ${mount.mode}; Standard MCP import currently supports only read-only ToolHive mounts.`);
      return;
    }
    if (!safeHostMountPath(mount.path)) {
      blockers.push(`${label} host path is not safe for reviewed ToolHive --volume delivery: ${mount.path}.`);
      return;
    }
    if (!mount.containerPath || !safeContainerMountPath(mount.containerPath)) {
      blockers.push(`${label} requires a safe absolute containerPath before Ambient can pass it to ToolHive --volume.`);
      return;
    }
    volumes.push({
      hostPath: mount.path,
      containerPath: mount.containerPath,
      mode: "ro",
    });
  });
  return { volumes, blockers };
}

function reviewedStandardMcpServerArgs(
  pkg: McpRuntimePackage,
  fixedArgs: string[],
  volumes: ToolHiveRunVolume[],
  blockers: string[],
): string[] {
  if (!isModelContextProtocolFilesystemPackage(pkg)) return fixedArgs;
  const mountArgs = volumes
    .map((volume) => volume.containerPath)
    .filter((containerPath) => safeContainerMountPath(containerPath));
  if (!mountArgs.length) {
    blockers.push("The @modelcontextprotocol/server-filesystem package requires at least one explicit reviewed read-only extraMount; Ambient passes each reviewed containerPath as an allowed directory argument.");
    return fixedArgs;
  }
  const next = [...fixedArgs];
  for (const mountArg of mountArgs) {
    if (!next.includes(mountArg)) next.push(mountArg);
  }
  return next;
}

function isModelContextProtocolFilesystemPackage(pkg: McpRuntimePackage): boolean {
  return pkg.registryType === "npm" && pkg.identifier.toLowerCase() === "@modelcontextprotocol/server-filesystem";
}

function reviewedRegistryRuntimeVolumes(inputVolumes: ToolHiveRunVolume[]): { volumes: ToolHiveRunVolume[]; blockers: string[] } {
  const volumes: ToolHiveRunVolume[] = [];
  const blockers: string[] = [];
  inputVolumes.forEach((volume, index) => {
    const label = `runtimeVolumes[${index}]`;
    if (!volume || typeof volume !== "object") {
      blockers.push(`${label} must be an object with hostPath, containerPath, mode, and optional purpose.`);
      return;
    }
    if (typeof volume.hostPath !== "string" || !safeHostMountPath(volume.hostPath)) {
      blockers.push(`${label}.hostPath is not safe for reviewed ToolHive --volume delivery: ${typeof volume.hostPath === "string" ? volume.hostPath : "(missing)"}.`);
      return;
    }
    if (typeof volume.containerPath !== "string" || !safeContainerMountPath(volume.containerPath)) {
      blockers.push(`${label}.containerPath must be a safe absolute container path.`);
      return;
    }
    if (volume.mode !== "ro" && volume.mode !== "rw") {
      blockers.push(`${label}.mode must be ro or rw.`);
      return;
    }
    volumes.push({
      hostPath: volume.hostPath,
      containerPath: volume.containerPath,
      mode: volume.mode,
      ...(typeof volume.purpose === "string" && volume.purpose.trim() ? { purpose: volume.purpose.trim().slice(0, 300) } : {}),
    });
  });
  return { volumes, blockers };
}

function registryCandidateWithRuntimeVolumes(candidate: McpAutowireCandidate, volumes: ToolHiveRunVolume[]): McpAutowireCandidate {
  if (!volumes.length) return candidate;
  const next = structuredClone(candidate);
  next.permissions.filesystem.extraMounts = [
    ...next.permissions.filesystem.extraMounts,
    ...volumes.map((volume) => ({
      path: volume.hostPath,
      containerPath: volume.containerPath,
      mode: volume.mode === "ro" ? "read-only" as const : "read-write" as const,
      purpose: volume.purpose ?? "Explicit runtime mount requested for this ToolHive registry MCP server.",
    })),
  ];
  return next;
}

function registryRuntimeVolumeRequirementBlockers(info: Record<string, unknown>, volumes: ToolHiveRunVolume[]): string[] {
  if (volumes.length) return [];
  if (!registryServerNeedsExplicitFilesystemMount(info)) return [];
  return [
    "This ToolHive registry server performs local filesystem operations and requires at least one explicit runtimeVolumes mount before install. Pass the requested host path with a safe containerPath such as /projects/<name> and mode=ro unless the user explicitly requested write access.",
  ];
}

function registryServerNeedsExplicitFilesystemMount(info: Record<string, unknown>): boolean {
  const serverId = stringField(info, ["name"]) ?? "";
  const title = stringField(info, ["title"]) ?? "";
  const description = stringField(info, ["description", "overview"]) ?? "";
  const tags = stringArrayField(info, ["tags"]).join(" ");
  const text = `${serverId} ${title} ${description} ${tags}`.toLowerCase();
  if (/\bfilesystem\b/.test(text)) return true;
  return /\blocal[-\s]?files?\b/.test(text);
}

function standardImportImageVerificationPolicy(candidate: McpAutowireCandidate): ToolHiveImageVerificationPolicy | undefined {
  if (candidate.runtime.sourceKind === "custom-image" && candidate.runtime.package?.registryType === "oci") return "ambient-reviewed";
  return undefined;
}

function fixedToolHiveServerArgs(args: McpRuntimePackageArgument[]): { args: string[]; envVars: ToolHivePlainEnvVar[]; blockers: string[] } {
  const result: string[] = [];
  const envVars: ToolHivePlainEnvVar[] = [];
  const blockers: string[] = [];
  for (const arg of args ?? []) {
    if (!arg.isFixed) {
      blockers.push(`Package argument ${arg.name ?? arg.valueHint} is not fixed and needs user review before import.`);
      continue;
    }
    if (arg.type === "positional" && arg.valueHint) {
      result.push(arg.valueHint);
    } else if (arg.type === "positional") {
      blockers.push("Positional package arguments require a fixed valueHint.");
    } else if (arg.type === "switch" && arg.name) {
      result.push(arg.name);
    } else if (arg.type === "switch") {
      blockers.push("Switch package arguments require a fixed flag name.");
    } else if (arg.type === "flag" && arg.name && arg.valueHint) {
      result.push(arg.name);
      result.push(arg.valueHint);
    } else if (arg.type === "flag") {
      blockers.push("Flag package arguments require a fixed flag name and valueHint.");
    } else if (arg.type === "env" && arg.name) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(arg.name)) {
        blockers.push(`Environment argument ${arg.name} is not a valid environment variable name.`);
      } else if (looksSecretEnvName(arg.name)) {
        blockers.push(`Environment argument ${arg.name} looks secret-like; declare it as a secret and bind it with an Ambient-managed secret ref.`);
      } else if (!arg.valueHint || arg.valueHint.length > 4_000 || /[\0\r\n]/.test(arg.valueHint)) {
        blockers.push(`Environment argument ${arg.name} must be a bounded single-line non-secret value.`);
      } else {
        envVars.push({ name: arg.name, value: arg.valueHint });
      }
    } else {
      blockers.push(`Package argument type ${arg.type} is not supported by Standard MCP import yet.`);
    }
  }
  return { args: result, envVars, blockers };
}

function reviewedToolHivePackageEntrypoint(pkg: McpRuntimePackage): { summary?: string; blockers: string[]; blockedLaunchShape?: McpStandardImportBlockedLaunchShape; blockedOutcome?: McpAutowireOutcome } {
  const entrypoint = pkg.entrypoint;
  if (!entrypoint || entrypoint.kind === "default") return { summary: "default package executable", blockers: [] };
  const blockers: string[] = [];
  if (entrypoint.kind === "package-bin") {
    const command = entrypoint.command?.trim();
    if (!command) {
      blockers.push("Package-bin entrypoint override requires a command.");
      return { blockers };
    }
    if (!safePackageEntrypointCommand(command)) {
      blockers.push(`Package-bin entrypoint command is not safe for ToolHive import: ${command}`);
      return { blockers };
    }
    if (sameToolHiveProtocolDefaultExecutable(pkg, command)) {
      return { summary: `package-bin ${command}`, blockers };
    }
    blockers.push([
      `Package-bin entrypoint ${command} from ${pkg.identifier} cannot be encoded by ToolHive ${pkg.registryType} protocol schemes yet.`,
      "Use fixed packageArguments when the default executable has an MCP/server flag, or route through a reviewed custom ToolHive source image.",
    ].join(" "));
    return {
      summary: `package-bin ${command} from ${entrypoint.fromPackage ?? pkg.identifier}`,
      blockers,
      blockedOutcome: "deferred-unsupported-lane",
      blockedLaunchShape: {
        kind: "package-bin-entrypoint",
        registryType: pkg.registryType,
        packageIdentifier: pkg.identifier,
        command,
        ...(entrypoint.fromPackage ? { fromPackage: entrypoint.fromPackage } : {}),
      },
    };
  }
  if (entrypoint.kind === "module") {
    blockers.push([
      `Module entrypoint ${entrypoint.module ?? "(missing)"} from ${pkg.identifier} cannot be encoded by ToolHive ${pkg.registryType} protocol schemes yet.`,
      "Route through a reviewed custom ToolHive source image unless ToolHive adds python -m/module execution support for protocol schemes.",
    ].join(" "));
    return {
      summary: `module ${entrypoint.module ?? "(missing)"}`,
      blockers,
      blockedOutcome: "deferred-unsupported-lane",
      ...(entrypoint.module
        ? {
            blockedLaunchShape: {
              kind: "module-entrypoint" as const,
              registryType: pkg.registryType,
              packageIdentifier: pkg.identifier,
              module: entrypoint.module,
            },
          }
        : {}),
    };
  }
  return { blockers: [`Unsupported package entrypoint kind ${(entrypoint as { kind?: string }).kind ?? "unknown"}.`] };
}

function sameToolHiveProtocolDefaultExecutable(pkg: McpRuntimePackage, command: string): boolean {
  if (pkg.registryType === "pypi") return normalizePackageExecutableName(command) === normalizePackageExecutableName(pkg.identifier);
  if (pkg.registryType === "npm") return command.toLowerCase() === defaultNpmExecutableName(pkg.identifier).toLowerCase();
  return false;
}

function defaultNpmExecutableName(identifier: string): string {
  const parts = identifier.split("/");
  return parts[parts.length - 1] ?? identifier;
}

function normalizePackageExecutableName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

function safePackageEntrypointCommand(value: string): boolean {
  return value.length <= 160 &&
    !value.startsWith("-") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    /^[A-Za-z0-9][A-Za-z0-9_.@+-]*$/.test(value);
}

function toolHiveRuntimeCompatibilityEnvVars(registryType: McpRuntimePackage["registryType"], envVars: ToolHivePlainEnvVar[]): ToolHivePlainEnvVar[] {
  if (registryType !== "npm") return envVars;
  if (envVars.some((entry) => entry.name === "NODE_USE_ENV_PROXY")) return envVars;
  return [...envVars, { name: "NODE_USE_ENV_PROXY", value: "1" }];
}

function looksSecretEnvName(name: string): boolean {
  return /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASS|BEARER|CREDENTIAL|PRIVATE_?KEY)(?:_|$)/i.test(name);
}

function looksSecretLike(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/i.test(value);
}

function reviewedToolHiveRuntimeImage(
  runtimeImage: string | undefined,
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"],
  blockers: string[],
): string | undefined {
  if (!runtimeImage) return undefined;
  if (registryType !== "npm" && registryType !== "pypi") {
    blockers.push(`ToolHive runtime image overrides apply only to npm/npx and PyPI/uvx Standard MCP protocol builds, not ${registryType}.`);
    return undefined;
  }
  if (runtimeImage.length > 512 || runtimeImage.includes("\0") || looksSecretLike(runtimeImage)) {
    blockers.push("ToolHive runtime image override must be a bounded non-secret image reference.");
    return undefined;
  }
  if (runtimeImage.startsWith("-") || runtimeImage.startsWith("./") || runtimeImage.startsWith("../") || runtimeImage.includes("://")) {
    blockers.push(`ToolHive runtime image override cannot be a flag, local path, or URL: ${runtimeImage}`);
    return undefined;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(runtimeImage)) {
    blockers.push(`Invalid ToolHive runtime image override: ${runtimeImage}`);
    return undefined;
  }
  return runtimeImage;
}

function safeHostMountPath(value: string): boolean {
  if (
    value.length > 1_000 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    return false;
  }
  if (!value.startsWith("/")) return false;
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  if (["/", "/Users", "/private", "/tmp", "/var", "/System", "/Library"].includes(normalized)) return false;
  return !normalized.split("/").includes("..");
}

function safeContainerMountPath(value: string): boolean {
  if (
    value.length > 240 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    return false;
  }
  const normalized = value.replace(/\/+$/, "") || "/";
  return normalized.startsWith("/") && normalized !== "/" && !normalized.split("/").includes("..");
}

function remoteMcpProxySpec(candidate: McpAutowireCandidate, secretBindings: McpSecretBinding[]): RemoteMcpProxySpec {
  const blockers: string[] = [];
  if (candidate.recommendedLane !== "remote-mcp") {
    blockers.push(`Remote MCP proxy requires recommendedLane remote-mcp, got ${candidate.recommendedLane}.`);
  }
  if (candidate.runtime.provider !== "remote-mcp") {
    blockers.push(`Remote MCP proxy requires remote-mcp runtime provider, got ${candidate.runtime.provider}.`);
  }
  if (candidate.runtime.sourceKind !== "remote-url") {
    blockers.push(`Remote MCP proxy requires runtime sourceKind remote-url, got ${candidate.runtime.sourceKind}.`);
  }
  if (candidate.runtime.transport !== "streamable-http" && candidate.runtime.transport !== "sse") {
    blockers.push(`Remote MCP proxy requires streamable-http or sse transport, got ${candidate.runtime.transport}.`);
  }
  const remoteUrl = candidate.runtime.remote?.url;
  if (!remoteUrl) {
    blockers.push("Remote MCP proxy requires runtime.remote.url.");
  } else {
    const parsed = safeRemoteMcpUrl(remoteUrl);
    if (!parsed.ok) blockers.push(parsed.message);
  }
  if (candidate.permissions.filesystem.workspaceRead || candidate.permissions.filesystem.workspaceWrite || candidate.permissions.filesystem.extraMounts.length) {
    blockers.push("Remote MCP proxy candidates must not request local filesystem grants.");
  }
  if (candidate.permissions.localApps.length) {
    blockers.push("Remote MCP proxy candidates must not request local app control.");
  }
  if (secretBindings.length) {
    const headers = remoteSecretHeaderNames(candidate);
    if (!headers.length) {
      blockers.push("Remote MCP proxy secret bindings require reviewed remote header metadata.");
    } else if (secretBindings.length > 1 || headers.filter((header) => header.toLowerCase() === "authorization").length !== 1) {
      blockers.push("Remote MCP proxy secret bindings currently support exactly one Authorization bearer-token header.");
    }
  }
  return {
    ...(remoteUrl ? { remoteUrl } : {}),
    blockers,
  };
}

function derivedSecretBindingStates(
  candidate: McpAutowireCandidate,
  catalogSource: McpInstallPreview["catalogSource"],
  workloadName: string,
  secretBindings: McpSecretBinding[],
): ToolHiveSecretBindingState[] {
  if (!secretBindings.length) return [];
  return secretBindings.map((binding) => {
    const derived = derivedSecretBinding(candidate, catalogSource, workloadName, binding);
    return {
      envName: binding.envName,
      secretRef: binding.secretRef,
      ...(derived ? { derivedBindings: [derived] } : {}),
    };
  });
}

function derivedSecretBinding(
  candidate: McpAutowireCandidate,
  catalogSource: McpInstallPreview["catalogSource"],
  workloadName: string,
  binding: McpSecretBinding,
): NonNullable<ToolHiveSecretBindingState["derivedBindings"]>[number] | undefined {
  if (catalogSource === "remote-mcp-proxy") {
    const headerName = remoteSecretHeaderNames(candidate).find((header) => header.toLowerCase() === "authorization");
    if (!headerName) return undefined;
    return {
      id: derivedSecretBindingId(candidate.id, binding, "remote-bearer-token-file", headerName),
      kind: "remote-bearer-token-file",
      envName: binding.envName,
      secretRef: binding.secretRef,
      runtimeName: headerName,
      target: candidate.runtime.remote?.url ?? workloadName,
    };
  }
  return {
    id: derivedSecretBindingId(candidate.id, binding, "container-env-file", binding.envName),
    kind: "container-env-file",
    envName: binding.envName,
    secretRef: binding.secretRef,
    runtimeName: binding.envName,
    target: workloadName,
  };
}

function derivedSecretBindingId(candidateId: string, binding: McpSecretBinding, kind: ToolHiveSecretDerivedBindingKind, runtimeName: string): string {
  return sha256Hex([candidateId, binding.envName, binding.secretRef, kind, runtimeName].join("\0")).slice(0, 24);
}

function remoteSecretHeaderNames(candidate: McpAutowireCandidate): string[] {
  return [...new Set((candidate.runtime.remote?.headers ?? []).map((header) => header.trim()).filter(Boolean))];
}

function candidatePermissionProfile(candidate: McpAutowireCandidate, managedFileExchange?: McpManagedFileExchange): Record<string, unknown> {
  const network = candidate.permissions.network;
  const filesystem = candidate.permissions.filesystem;
  return {
    network: {
      outbound: {
        insecure_allow_all: network.mode === "broad",
        allow_host: network.allowHosts,
        allow_port: network.allowPorts,
      },
    },
    filesystem: {
      workspaceRead: filesystem.workspaceRead,
      workspaceWrite: filesystem.workspaceWrite,
      extraMounts: [
        ...filesystem.extraMounts,
        ...(managedFileExchange ? [mcpManagedFileExchangePermissionMount(managedFileExchange)] : []),
      ],
    },
  };
}

function safeRemoteMcpUrl(value: string): { ok: true } | { ok: false; message: string } {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return { ok: false, message: `Remote MCP URL must use https: ${value}` };
    if (parsed.username || parsed.password) return { ok: false, message: "Remote MCP URL must not contain credentials." };
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost")) {
      return { ok: false, message: `Remote MCP URL must target a public remote host, not ${parsed.hostname || "an empty host"}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: `Invalid remote MCP URL: ${value}` };
  }
}

function candidateHashMismatchBlocker(expected: string | undefined, actual: string | undefined): string[] {
  if (!expected || !actual || expected === actual) return [];
  return [`Candidate hash mismatch: expected ${expected}, got ${actual}. Re-run autowire plan or review the current candidate before proceeding.`];
}

function buildInstallReview(input: {
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  sourceLabel: string;
  secretBindings: McpSecretBinding[];
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

function registrySearchResult(entry: Record<string, unknown>, installed: { workloadName: string } | undefined, catalogSource: McpCatalogSource): McpServerSearchResult {
  const serverId = requiredStringField(entry, ["name"], "registry server name");
  const tags = stringArrayField(entry, ["tags"]);
  const tools = stringArrayField(entry, ["tools"]);
  const riskHints = registryRiskHints(entry);
  const defaultCapability = catalogSource === "ambient-default" || catalogSource === "ambient-default+toolhive-registry";
  return {
    serverId,
    title: stringField(entry, ["title"]) ?? serverId,
    description: stringField(entry, ["description"]) ?? "",
    catalogSource,
    status: stringField(entry, ["status"]),
    tier: stringField(entry, ["tier"]),
    transport: stringField(entry, ["transport"]),
    repositoryUrl: stringField(entry, ["repository_url", "repositoryUrl"]),
    tags,
    tools,
    installed: Boolean(installed),
    ...(installed ? { workloadName: installed.workloadName } : {}),
    riskHints,
    ...(defaultCapability
      ? {
          nextAction:
            `Call ambient_mcp_server_describe with serverId=${serverId}, then ambient_mcp_server_install after approval. Ambient routes built-in defaults through the default capability installer and runtime setup handoff.`,
        }
      : {}),
  };
}

function selectExactRegistryFallback(
  candidate: McpAutowireCandidate,
  blockedShape: McpStandardImportBlockedLaunchShape,
  registry: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const sourceRepo = candidate.source.url ? githubRepoKey(candidate.source.url) : undefined;
  if (!sourceRepo) return undefined;
  const candidateIds = standardImportSemanticIdentifiers(candidate, blockedShape);
  if (!candidateIds.size) return undefined;
  const matches = registry
    .filter((entry) => {
      const registryRepo = stringField(entry, ["repository_url", "repositoryUrl"]);
      if (!registryRepo || githubRepoKey(registryRepo) !== sourceRepo) return false;
      const registryIds = registrySemanticIdentifiers(entry);
      return [...candidateIds].some((id) => registryIds.has(id));
    })
    .map((entry) => ({
      entry,
      score: exactRegistryFallbackScore(candidate, blockedShape, entry),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || (stringField(left.entry, ["name"]) ?? "").localeCompare(stringField(right.entry, ["name"]) ?? ""));
  return matches[0]?.entry;
}

function exactRegistryFallbackScore(
  candidate: McpAutowireCandidate,
  blockedShape: McpStandardImportBlockedLaunchShape,
  entry: Record<string, unknown>,
): number {
  const candidateIds = standardImportSemanticIdentifiers(candidate, blockedShape);
  const registryIds = registrySemanticIdentifiers(entry);
  let score = 0;
  for (const id of candidateIds) {
    if (registryIds.has(id)) score += id.length >= 8 ? 12 : 8;
  }
  const expectedTools = new Set(candidate.validationPlan.expectedTools.map(normalizeIdentifierToken).filter(Boolean));
  const registryTools = stringArrayField(entry, ["tools"]).map(normalizeIdentifierToken).filter(Boolean);
  for (const tool of registryTools) {
    if (expectedTools.has(tool)) score += 2;
  }
  return score;
}

function standardImportSemanticIdentifiers(
  candidate: McpAutowireCandidate,
  blockedShape: McpStandardImportBlockedLaunchShape,
): Set<string> {
  const values = new Set<string>();
  addSemanticIdentifier(values, candidate.id);
  addSemanticIdentifier(values, candidate.displayName);
  addSemanticIdentifier(values, candidate.source.packageName);
  addSemanticIdentifier(values, candidate.runtime.package?.identifier);
  addSemanticIdentifier(values, blockedShape.packageIdentifier);
  if (blockedShape.kind === "package-bin-entrypoint") {
    addSemanticIdentifier(values, blockedShape.command);
    addSemanticIdentifier(values, blockedShape.fromPackage);
  } else {
    addSemanticIdentifier(values, blockedShape.module);
  }
  const sourcePathTail = candidate.source.url ? githubSourcePathTail(candidate.source.url) : undefined;
  addSemanticIdentifier(values, sourcePathTail);
  return values;
}

function registrySemanticIdentifiers(entry: Record<string, unknown>): Set<string> {
  const values = new Set<string>();
  addSemanticIdentifier(values, stringField(entry, ["name"]));
  addSemanticIdentifier(values, stringField(entry, ["title"]));
  addSemanticIdentifier(values, stringField(entry, ["image"]));
  addSemanticIdentifier(values, stringField(entry, ["repository_url", "repositoryUrl"]));
  for (const tag of stringArrayField(entry, ["tags"])) addSemanticIdentifier(values, tag);
  return values;
}

function addSemanticIdentifier(values: Set<string>, raw: string | undefined): void {
  for (const token of semanticIdentifierTokens(raw)) values.add(token);
}

function semanticIdentifierTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[^A-Za-z0-9@._+-]+/)
    .flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed) return [];
      const segments = trimmed.split(/[/.]+/).filter(Boolean);
      return [trimmed, ...segments];
    })
    .map(normalizeIdentifierToken)
    .filter((token) => token.length >= 3 && !SEMANTIC_IDENTIFIER_STOP_TOKENS.has(token));
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const stripped = stripServerAffixes(token);
    if (stripped.length >= 3 && !SEMANTIC_IDENTIFIER_STOP_TOKENS.has(stripped)) expanded.add(stripped);
  }
  return [...expanded];
}

function normalizeIdentifierToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripServerAffixes(token: string): string {
  let value = token;
  let changed = true;
  while (changed) {
    const before = value;
    value = value
      .replace(/^(?:mcp|server|mcp-server|modelcontextprotocol)-+/, "")
      .replace(/-+(?:mcp|server|mcp-server|standard-mcp|source-mcp)$/, "");
    changed = before !== value;
  }
  return value;
}

function githubSourcePathTail(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "github.com") return undefined;
    const segments = url.pathname.split("/").filter(Boolean);
    const treeIndex = segments.findIndex((segment) => segment === "tree" || segment === "blob");
    if (treeIndex >= 0 && segments.length > treeIndex + 2) return segments[segments.length - 1];
    return segments[1];
  } catch {
    return undefined;
  }
}

const SEMANTIC_IDENTIFIER_STOP_TOKENS = new Set([
  "https",
  "github",
  "com",
  "docker",
  "io",
  "ghcr",
  "latest",
  "main",
  "src",
  "tree",
  "blob",
  "mcp",
  "modelcontextprotocol",
  "package",
  "server",
  "servers",
  "source",
  "standard",
]);

function recommendedStandardMcpImportSearchResults(installedByServerId: Map<string, { workloadName: string }>): McpServerSearchResult[] {
  const scrapling = mcpAutowirePhase0Fixtures.scrapling as McpAutowireCandidate;
  const targetUrl = scrapling.source.url ?? "https://github.com/D4Vinci/Scrapling";
  const installed = installedByServerId.get(scrapling.id);
  return [
    {
      serverId: scrapling.id,
      title: scrapling.displayName,
      description: "Reviewed Ambient recommendation for public web scraping via Scrapling's Standard MCP server.json/uvx flow.",
      catalogSource: "ambient-recommended-standard-import",
      status: "recommended",
      tier: "ambient-reviewed",
      transport: scrapling.runtime.transport,
      repositoryUrl: targetUrl,
      tags: ["scrapling", "web", "scraping", "fetch", "browser", "standard-mcp", "uvx"],
      tools: scrapling.validationPlan.expectedTools,
      installed: Boolean(installed),
      ...(installed ? { workloadName: installed.workloadName } : {}),
      riskHints: [
        ...scrapling.riskSummary.reasons,
        "Uses external web or browser/data-extraction capabilities.",
      ],
      nextAction: `Run ambient_mcp_autowire_plan with targetUrl=${targetUrl}, then ambient_mcp_autowire_review for the returned candidateRef.`,
    },
  ];
}

function registryCandidatePermissions(info: Record<string, unknown>): McpAutowireCandidate["permissions"] {
  const permissions = isRecord(info.permissions) ? info.permissions : {};
  const network = isRecord(permissions.network) ? permissions.network : {};
  const outbound = isRecord(network.outbound) ? network.outbound : {};
  const allowHosts = stringArrayField(outbound, ["allow_host", "allowHost", "allow_hosts", "allowHosts"]);
  const allowPorts = numberArrayField(outbound, ["allow_port", "allowPort", "allow_ports", "allowPorts"]);
  const broad = outbound.insecure_allow_all === true || outbound.insecureAllowAll === true;
  return {
    network: broad
      ? {
          mode: "broad",
          allowHosts,
          allowPorts,
          justification: "ToolHive registry permissions request broad outbound network access.",
        }
      : allowHosts.length || allowPorts.length
        ? { mode: "allowlist", allowHosts, allowPorts }
        : { mode: "isolated", allowHosts: [], allowPorts: [] },
    filesystem: {
      workspaceRead: false,
      workspaceWrite: false,
      extraMounts: [],
    },
    localApps: [],
    evidenceRefs: ["toolhive-registry-info"],
  };
}

function registryPermissionProfile(
  info: Record<string, unknown>,
  filesystem?: McpAutowireCandidate["permissions"]["filesystem"],
): Record<string, unknown> {
  const permissions = isRecord(info.permissions)
    ? structuredClone(info.permissions) as Record<string, unknown>
    : {
        network: {
          outbound: {
            insecure_allow_all: false,
          },
        },
      };
  if (filesystem) {
    const existingFilesystem = isRecord(permissions.filesystem) ? permissions.filesystem : {};
    permissions.filesystem = {
      ...existingFilesystem,
      workspaceRead: filesystem.workspaceRead,
      workspaceWrite: filesystem.workspaceWrite,
      extraMounts: filesystem.extraMounts,
    };
  }
  return permissions;
}

function registryRiskSummary(info: Record<string, unknown>, secrets: McpAutowireCandidate["secrets"]): McpAutowireCandidate["riskSummary"] {
  const hints = registryRiskHints(info);
  const level = hints.some((hint) => /broad|required secret|write|database|browser|scrap/i.test(hint))
    ? "high"
    : hints.length || secrets.length
      ? "medium"
      : "low";
  return {
    level,
    reasons: hints.length ? hints : ["ToolHive registry metadata did not declare high-risk permissions."],
    evidenceRefs: ["toolhive-registry-info"],
  };
}

function registryRiskHints(info: Record<string, unknown>): string[] {
  const hints: string[] = [];
  const permissions = isRecord(info.permissions) ? info.permissions : {};
  const network = isRecord(permissions.network) ? permissions.network : {};
  const outbound = isRecord(network.outbound) ? network.outbound : {};
  if (outbound.insecure_allow_all === true || outbound.insecureAllowAll === true) hints.push("Requests broad outbound network access.");
  const envVars = envVarRecords(info.env_vars);
  if (envVars.some((env) => env.required === true && env.secret === true)) hints.push("Requires at least one Ambient-managed secret.");
  if (envVars.some((env) => env.secret === true && env.required !== true)) hints.push("Supports optional secret-backed functionality.");
  const tags = stringArrayField(info, ["tags"]).join(" ").toLowerCase();
  const text = [tags, stringField(info, ["description"]) ?? "", stringField(info, ["overview"]) ?? ""].join(" ").toLowerCase();
  if (/\b(browser|scrap|fetch|search|crawl|web)\b/.test(text)) hints.push("Uses external web or browser/data-extraction capabilities.");
  if (/\b(database|sql|postgres|mysql|redis|memory|knowledge)\b/.test(text)) hints.push("May access persistent data or data stores.");
  return [...new Set(hints)];
}

function registryRuntimeUpdatePolicy(info: Record<string, unknown>): McpAutowireCandidate["runtime"]["updatePolicy"] | undefined {
  const tags = stringArrayField(info, ["tags"]).join(" ");
  const tools = stringArrayField(info, ["tools"]).join(" ");
  const text = [
    tags,
    tools,
    stringField(info, ["title"]) ?? "",
    stringField(info, ["description"]) ?? "",
    stringField(info, ["overview"]) ?? "",
  ].join(" ").toLowerCase();
  if (!/\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|browserless)\b/.test(text)) return undefined;
  return {
    mode: "managed-browser-security",
    reason: "ToolHive registry metadata indicates browser automation/runtime behavior; Ambient treats browser engine updates as a managed security-update lane while the MCP server package/image identity remains separately reviewed.",
    evidenceRefs: ["toolhive-registry-info"],
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

function normalizeMcpTransport(value: string | undefined): "stdio" | "streamable-http" | "sse" {
  if (value === "streamable-http" || value === "sse") return value;
  return "stdio";
}

function normalizeRemoteMcpTransport(value: string | undefined): "streamable-http" | "sse" {
  return value === "sse" ? "sse" : "streamable-http";
}

function normalizeSearchQuery(query: string | undefined): string {
  const trimmed = (query ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  if (["*", "all", "any", "registry", "toolhive registry", "mcp", "mcp servers"].includes(trimmed)) return "";
  return trimmed;
}

function searchHaystack(entry: McpServerSearchResult): string {
  return [
    entry.serverId,
    entry.title,
    entry.description,
    entry.repositoryUrl ?? "",
    entry.tags.join(" "),
    entry.tools.join(" "),
    entry.riskHints.join(" "),
  ].join(" ").toLowerCase();
}

function scoredSearchResults(results: McpServerSearchResult[], query: string): McpServerSearchResult[] {
  if (!query) return results;
  return results
    .map((entry, index) => ({ entry, index, score: searchScore(entry, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.entry);
}

function searchScore(entry: McpServerSearchResult, query: string): number {
  const haystack = searchHaystack(entry);
  let score = haystack.includes(query) ? 100 : 0;
  const tokens = expandedSearchTokens(query);
  if (!tokens.length) return score;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 6 : 3;
  }
  if ((entry.catalogSource === "ambient-default" || entry.catalogSource === "ambient-default+toolhive-registry") && tokens.some((token) => SCRAPING_SEARCH_TOKENS.has(token))) score += 16;
  if (entry.catalogSource === "ambient-recommended-standard-import" && tokens.some((token) => SCRAPING_SEARCH_TOKENS.has(token))) score += 8;
  return score;
}

const SCRAPING_SEARCH_TOKENS = new Set([
  "web",
  "scrape",
  "scraping",
  "scraper",
  "crawl",
  "crawler",
  "fetch",
  "url",
  "browser",
  "automation",
  "puppeteer",
  "playwright",
  "firecrawl",
  "scrapling",
]);

function expandedSearchTokens(query: string): string[] {
  const direct = query
    .split(/[^a-z0-9@._/-]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
  const expanded = new Set(direct);
  if (direct.some((token) => SCRAPING_SEARCH_TOKENS.has(token))) {
    for (const token of SCRAPING_SEARCH_TOKENS) expanded.add(token);
  }
  return [...expanded];
}

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "for", "of", "on", "the", "to", "with"]);

function envVarRecords(value: unknown): Array<{ name: string; description?: string; required?: boolean; secret?: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    const name = stringField(entry, ["name"]);
    if (!name) return [];
    return [{
      name,
      description: stringField(entry, ["description"]),
      required: entry.required === true,
      secret: entry.secret === true,
    }];
  });
}

function requiredStringField(value: Record<string, unknown>, keys: string[], label: string): string {
  const found = stringField(value, keys);
  if (!found) throw new Error(`Missing ${label}.`);
  return found;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function urlStringField(value: unknown, keys: string[]): string | undefined {
  const found = stringField(value, keys);
  if (!found) return undefined;
  try {
    return new URL(found).toString();
  } catch {
    return undefined;
  }
}

function stringArrayField(value: unknown, keys: string[]): string[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  }
  return [];
}

function numberArrayField(value: unknown, keys: string[]): number[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry)) {
      return entry.flatMap((item) => {
        if (typeof item === "number" && Number.isFinite(item)) return [Math.floor(item)];
        if (typeof item === "string" && /^\d+$/.test(item)) return [Number(item)];
        return [];
      });
    }
  }
  return [];
}

function ociImageTag(image: string): string | undefined {
  const withoutDigest = image.split("@", 1)[0] ?? "";
  const slashIndex = withoutDigest.lastIndexOf("/");
  const colonIndex = withoutDigest.lastIndexOf(":");
  if (colonIndex <= slashIndex) return undefined;
  const tag = withoutDigest.slice(colonIndex + 1).trim();
  return tag && tag !== "latest" ? tag : undefined;
}

function ambientWorkloadName(serverId: string): string {
  return `ambient-${safeIdSegment(serverId).slice(0, 52)}-${sha256Hex(serverId).slice(0, 8)}`;
}

function safeIdSegment(value: string): string {
  return value.toLowerCase().replace(/^io\.github\./, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "mcp-server";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
