import type {
  McpDefaultCapabilityInstallPreview,
  McpDefaultCatalogUpdatePreview,
  McpInstallPreview,
  McpInstalledServerSummary,
  McpRemoteMcpProxyPreview,
  McpRegistryInstallPreview,
  McpServerSearchResult,
  McpUnmanagedToolHiveWorkloadSummary,
} from "./mcpInstallCatalogTypes";
import { mcpInstallPreviewSecretBindings } from "./mcpInstallCatalogInstallState";
import type { McpStandardImportFallbackRoute, McpStandardImportPreview } from "./mcpInstallCatalogStandardImportPreview";
import type { ToolHiveSecretBindingState } from "./mcpToolRuntimeFacade";

export function mcpServerSearchResultsText(results: McpServerSearchResult[]): string {
  if (!results.length) return "No Ambient MCP catalog entries matched the query.";
  const hasRecommendedImport = results.some((result) => result.catalogSource === "ambient-recommended-standard-import");
  return [
    `Found ${results.length} Ambient MCP catalog entr${results.length === 1 ? "y" : "ies"}.`,
    ...results.map((result) => {
      const status = [result.status, result.tier, result.transport].filter(Boolean).join(", ");
      const source =
        result.catalogSource === "ambient-default"
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
    return ["No Ambient-managed ToolHive MCP servers are installed.", ...unmanagedLines].join("\n");
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
      const secrets = server.secretBindingCount
        ? ` secretBindings=${server.secretBindingCount}${server.secretBindingEnvNames?.length ? ` env=${server.secretBindingEnvNames.join(",")}` : ""}${derivedSecrets}`
        : "";
      const review = server.toolDescriptorReviewStatus ? ` toolDescriptorReview=${server.toolDescriptorReviewStatus}` : "";
      const reason = server.toolDescriptorReviewReason ? ` reviewReason=${server.toolDescriptorReviewReason}` : "";
      const policy = server.toolPolicyCount
        ? ` toolPolicies=${server.toolPolicyCount} hidden=${server.hiddenToolPolicyCount ?? 0} blocked=${server.blockedToolPolicyCount ?? 0}`
        : "";
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
  ]
    .filter((line) => line !== undefined)
    .join("\n");
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
        preview.toolHiveVolumes.length
          ? `- volumes: ${preview.toolHiveVolumes.map((entry) => `${entry.hostPath} -> ${entry.containerPath}:${entry.mode}`).join("; ")}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n")
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
      ]
        .filter(Boolean)
        .join("\n")
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
        preview.toolHiveEnvVars.length
          ? `- env vars: ${preview.toolHiveEnvVars.map((entry) => entry.name).join(", ")} (values hidden from preview text)`
          : undefined,
        preview.toolHiveVolumes.length
          ? `- volumes: ${preview.toolHiveVolumes.map((entry) => `${entry.hostPath} -> ${entry.containerPath}:${entry.mode}`).join("; ")}`
          : undefined,
        preview.toolHiveRuntimeImage ? `- runtime image: ${preview.toolHiveRuntimeImage}` : undefined,
        preview.imageVerificationPolicy ? `- image verification policy: ${preview.imageVerificationPolicy}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
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
  ]
    .filter((line) => line !== undefined)
    .join("\n");
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
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `${prefix}: reviewed custom source build`,
      `- blocked shape: ${route.blockedShape}`,
      `- reason: ${route.reason}`,
      `- next tool: ${route.nextToolName} with the same reviewed candidate and expectedCandidateHash from this Standard import request`,
    ].join("\n");
  });
  return ["Fallback routes:", ...routeLines, "", preferred ? `Next action: ${standardImportFallbackNextActionText(preferred)}` : undefined]
    .filter(Boolean)
    .join("\n");
}

function standardImportFallbackNextActionText(route: McpStandardImportFallbackRoute): string {
  if (route.kind === "toolhive-registry-install") return `call ${route.nextToolName} with ${JSON.stringify(route.nextToolInput)}.`;
  return `call ${route.nextToolName} with the same reviewed candidate and expectedCandidateHash from this Standard import request.`;
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
    policies.push(
      "local containerized MCP secrets use short-lived ToolHive --env-file delivery generated from Ambient secret refs; the env file is written outside workspaces, chmod 0600, deleted after launch, and only redacted binding metadata is stored.",
    );
  }
  if (kinds.has("remote-bearer-token-file")) {
    policies.push(
      "Remote MCP proxy secrets use short-lived ToolHive --remote-auth-bearer-token-file delivery generated from Ambient secret refs; the token file is written outside workspaces, chmod 0600, deleted after launch, and only redacted binding metadata is stored.",
    );
  }
  return `- secret delivery policy: ${policies.join(" ")}`;
}

function installedServerSourceText(server: McpInstalledServerSummary): string {
  const parts: string[] = [];
  if (server.runtimeLane) parts.push(`source=${server.runtimeLane}${server.sourceKind ? `/${server.sourceKind}` : ""}`);
  if (server.sourceUrl) parts.push(`sourceUrl=${server.sourceUrl}`);
  if (server.sourceResolvedCommit) parts.push(`commit=${server.sourceResolvedCommit}`);
  if (server.registryId) parts.push(`registryId=${server.registryId}`);
  if (server.packageIdentifier) {
    const packageRef = [server.packageRegistryType, server.packageIdentifier].filter(Boolean).join(":");
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
