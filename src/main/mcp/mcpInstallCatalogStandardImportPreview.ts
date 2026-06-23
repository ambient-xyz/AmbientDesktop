import {
  TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
  parseMcpAutowireCandidate,
  parseMcpInstallReview,
  parseToolHiveRunPlan,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
  type McpAutowireValidationReport,
  type McpInstallReview,
  type ToolHiveRunPlan,
} from "./mcpAutowireFacade";
import { buildInstallReview } from "./mcpInstallReviewBuilder";
import {
  ambientWorkloadName,
  candidateHashMismatchBlocker,
  candidatePermissionProfile,
  errorMessage,
  normalizeMcpTransport,
  normalizeRepositoryUrl,
} from "./mcpInstallCatalogUtilities";
import { mcpManagedFileExchangeForWorkload, mcpManagedFileExchangeVolume } from "./mcpManagedFileExchange";
import { standardImportImageVerificationPolicy, standardMcpImportSpec } from "./mcpStandardImportSpec";
import type { McpStandardImportBlockedLaunchShape, StandardMcpImportSpec } from "./mcpStandardImportSpec";
import {
  TOOLHIVE_AMBIENT_GROUP,
  type ToolHiveImageVerificationPolicy,
  type ToolHivePlainEnvVar,
  type ToolHiveRuntimeService,
  type ToolHiveRunVolume,
} from "./mcpToolRuntimeFacade";

interface McpServerSearchInputLike {
  query?: string;
  limit?: number;
  refresh?: boolean;
}

export interface McpStandardImportPreviewInput {
  candidate: unknown;
  candidateRef?: string;
  expectedCandidateHash?: string;
  secretBindings?: McpSecretBinding[];
}

export interface McpSecretBinding {
  envName: string;
  secretRef: string;
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

export interface McpInstallCatalogStandardImportPreviewOwnerOptions {
  toolHive: Pick<ToolHiveRuntimeService, "stateRoot" | "writePermissionProfile">;
  packageMetadataResolver?: McpPackageMetadataResolver;
  registryListWithDefaults(input: McpServerSearchInputLike): Promise<Record<string, unknown>[]>;
}

export class McpInstallCatalogStandardImportPreviewOwner {
  constructor(private readonly options: McpInstallCatalogStandardImportPreviewOwnerOptions) {}

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
    const managedFileExchange = mcpManagedFileExchangeForWorkload(this.options.toolHive.stateRoot(), workloadName);
    const permissionProfile = candidatePermissionProfile(candidate, managedFileExchange);
    const profileWrite = await this.options.toolHive.writePermissionProfile({
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
      registry = await this.options.registryListWithDefaults({});
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
    if (!this.options.packageMetadataResolver || !pkg || pkg.registryType === "oci" || pkg.registryType === "mcpb") return [];
    if (pkg.registryType !== "npm" && pkg.registryType !== "pypi") return [];
    const blockers: string[] = [];
    let metadata: McpPackageMetadataResolution;
    try {
      metadata = await this.options.packageMetadataResolver({
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

function stringArrayField(value: unknown, keys: string[]): string[] {
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
