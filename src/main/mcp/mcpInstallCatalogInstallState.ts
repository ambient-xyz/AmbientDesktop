import type { McpAutowireCandidate } from "./mcpAutowireFacade";
import type { McpInstallPreview } from "./mcpInstallCatalogTypes";
import type { McpSecretBinding } from "./mcpInstallCatalogStandardImportPreview";
import { sha256Hex } from "./mcpInstallCatalogUtilities";
import type {
  ToolHiveInstalledServerSourceIdentity,
  ToolHiveInstallReviewState,
  ToolHiveSecretBindingState,
  ToolHiveSecretDerivedBindingKind,
} from "./mcpToolRuntimeFacade";

export function mcpInstallPreviewSourceIdentity(preview: McpInstallPreview): ToolHiveInstalledServerSourceIdentity {
  const pkg = preview.candidate.runtime.package;
  const identity: ToolHiveInstalledServerSourceIdentity = {
    runtimeLane:
      preview.catalogSource === "standard-mcp-import"
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
  const runSource =
    preview.catalogSource === "standard-mcp-import"
      ? preview.toolHiveRunSource
      : preview.catalogSource === "remote-mcp-proxy"
        ? preview.toolHiveRemoteUrl
        : preview.runPlan?.sourceRef;
  if (runSource) identity.toolHiveRunSource = runSource;
  if (preview.validation.candidateHash) identity.candidateHash = preview.validation.candidateHash;
  return identity;
}

export function mcpInstallPreviewSecretBindings(preview: McpInstallPreview): ToolHiveSecretBindingState[] {
  return derivedSecretBindingStates(
    preview.candidate,
    preview.catalogSource,
    preview.runPlan?.workloadName ?? preview.serverId,
    preview.runPlan?.envSecretRefs ?? [],
  );
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

function derivedSecretBindingId(
  candidateId: string,
  binding: McpSecretBinding,
  kind: ToolHiveSecretDerivedBindingKind,
  runtimeName: string,
): string {
  return sha256Hex([candidateId, binding.envName, binding.secretRef, kind, runtimeName].join("\0")).slice(0, 24);
}

function remoteSecretHeaderNames(candidate: McpAutowireCandidate): string[] {
  return [...new Set((candidate.runtime.remote?.headers ?? []).map((header) => header.trim()).filter(Boolean))];
}
