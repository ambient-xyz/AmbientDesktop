import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";
import type { McpAutowirePlanRevision, McpAutowirePlanRevisionStore } from "./mcpAutowirePlanEdits";
import type { ToolHiveInstalledServerState, ToolHiveRunVolume } from "../tool-runtime/toolHiveRuntimeService";

const legacyEvidenceId = "legacy-installed-state";
const permissionEvidenceId = "legacy-permission-profile";
const filesystemEvidenceId = "legacy-runtime-volumes";

export interface McpAutowireLegacyBackfillInput {
  server: ToolHiveInstalledServerState;
  permissionProfile: Record<string, unknown>;
  store?: McpAutowirePlanRevisionStore;
  putCandidateRef?: (candidate: Record<string, unknown>, candidateHash?: string) => string | undefined;
}

export interface McpAutowireLegacyBackfillResult {
  candidate: McpAutowireCandidate;
  candidateHash: string;
  candidateRef?: string;
  revision: McpAutowirePlanRevision;
}

export function backfillMcpAutowirePlanRevisionFromInstalledServer(input: McpAutowireLegacyBackfillInput): McpAutowireLegacyBackfillResult | undefined {
  if (!input.store) return undefined;
  const candidate = mcpAutowireCandidateFromInstalledServer(input.server, input.permissionProfile);
  if (!candidate) return undefined;
  const validation = validateMcpAutowireCandidate(candidate);
  if (!validation.candidate || !validation.candidateHash || validation.blockers.length) return undefined;
  const candidateRef = input.putCandidateRef?.(validation.candidate as unknown as Record<string, unknown>, validation.candidateHash);
  const revision = input.store.recordCandidate({
    candidate: validation.candidate,
    source: "install",
    summary: `Backfilled legacy installed MCP server ${input.server.serverId} into an Autowire plan revision from Ambient ToolHive state.`,
    candidateRef,
    serverId: input.server.serverId,
    workloadName: input.server.workloadName,
  });
  return {
    candidate: validation.candidate,
    candidateHash: validation.candidateHash,
    ...(candidateRef ? { candidateRef } : {}),
    revision,
  };
}

export function mcpAutowireCandidateFromInstalledServer(
  server: ToolHiveInstalledServerState,
  permissionProfile: Record<string, unknown>,
): McpAutowireCandidate | undefined {
  const identity = server.sourceIdentity;
  if (!identity || identity.runtimeLane !== "standard-mcp-import") return undefined;
  const registryType = standardPackageRegistryType(identity.packageRegistryType);
  const packageIdentifier = identity.packageIdentifier?.trim();
  if (!registryType || !packageIdentifier) return undefined;
  const runtimeSourceKind = runtimeSourceKindFromIdentity(identity.sourceKind, registryType, identity.sourceResolvedCommit);
  const packageArguments = packageArgumentsFromLastRunCommand(server.lastRunCommand, identity.toolHiveRunSource);
  const network = networkPermissionsFromProfile(permissionProfile);
  const filesystem = filesystemPermissionsFromInstalledVolumes(server.runtimeVolumes ?? [], server.managedFileExchange);
  const evidenceRefs = [
    legacyEvidenceId,
    permissionEvidenceId,
    ...(filesystem.extraMounts.length ? [filesystemEvidenceId] : []),
  ];
  const sourceUrl = safeUrl(identity.sourceUrl);
  const pkg: NonNullable<McpAutowireCandidate["runtime"]["package"]> = {
    registryType,
    identifier: packageIdentifier,
    ...(identity.packageVersion ? { version: identity.packageVersion } : {}),
    ...(identity.packageDigest ? { digest: identity.packageDigest } : {}),
    ...(identity.packageSha256 ? { fileSha256: identity.packageSha256 } : {}),
    ...(identity.toolHiveRunSource ? { runtimeHint: identity.toolHiveRunSource } : {}),
    packageArguments,
  };
  const updatePolicy = sourceBuiltUpdatePolicy(identity) ?? browserRuntimeUpdatePolicy(packageIdentifier);
  const sourceBuild = sourceBuildFromIdentity(identity);
  const candidate: McpAutowireCandidate = {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: identity.candidateId || server.serverId,
    displayName: displayNameFromServer(server.serverId),
    source: {
      kind: sourceUrl?.startsWith("https://github.com/") ? "github" : "other",
      ...(sourceUrl ? { url: sourceUrl } : {}),
      ...(identity.sourceResolvedCommit ? { resolvedCommit: identity.sourceResolvedCommit } : {}),
      packageName: identity.packageName ?? packageIdentifier,
      evidenceRefs: [legacyEvidenceId],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: runtimeSourceKind,
      transport: "stdio",
      package: pkg,
      ...(updatePolicy ? { updatePolicy } : {}),
      ...(sourceBuild ? { sourceBuild } : {}),
      evidenceRefs: [legacyEvidenceId],
    },
    secrets: [],
    permissions: {
      network,
      filesystem,
      localApps: [],
      evidenceRefs,
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "mcp-tool-discovery"],
      expectedTools: server.lastKnownToolDescriptors?.map(toolDescriptorName).filter((name): name is string => Boolean(name)).slice(0, 20) ?? [],
      evidenceRefs: [legacyEvidenceId],
    },
    evidence: [
      {
        id: legacyEvidenceId,
        type: "other",
        locator: `ambient-installed-state:${server.workloadName}`,
        summary: "Ambient reconstructed this Autowire candidate from reviewed installed ToolHive state for runtime repair.",
      },
      {
        id: permissionEvidenceId,
        type: "file",
        locator: server.permissionProfilePath,
        summary: "Installed Ambient permission profile used to preserve reviewed runtime network and filesystem boundaries.",
      },
      ...(filesystem.extraMounts.length
        ? [{
            id: filesystemEvidenceId,
            type: "other" as const,
            locator: `ambient-runtime-volumes:${server.workloadName}`,
            summary: "Installed ToolHive runtime volumes used to preserve reviewed mount scope.",
          }]
        : []),
    ],
    openQuestions: [],
    riskSummary: {
      level: identity.riskLevel ?? "medium",
      reasons: ["Backfilled from installed Ambient ToolHive state; review any subsequent permission expansion before reinstall."],
      evidenceRefs: [legacyEvidenceId],
    },
  };
  return candidate;
}

function standardPackageRegistryType(value: string | undefined): "npm" | "pypi" | "oci" | undefined {
  if (value === "npm" || value === "pypi" || value === "oci") return value;
  return undefined;
}

function runtimeSourceKindFromIdentity(
  sourceKind: string | undefined,
  registryType: "npm" | "pypi" | "oci",
  resolvedCommit: string | undefined,
): McpAutowireCandidate["runtime"]["sourceKind"] {
  if (sourceKind === "server-json" || sourceKind === "npm" || sourceKind === "pypi" || sourceKind === "oci" || sourceKind === "custom-image") return sourceKind;
  if (registryType === "oci" && resolvedCommit) return "custom-image";
  return registryType;
}

function sourceBuiltUpdatePolicy(identity: NonNullable<ToolHiveInstalledServerState["sourceIdentity"]>): McpAutowireCandidate["runtime"]["updatePolicy"] | undefined {
  if (!identity.sourceResolvedCommit || !identity.packageDigest || standardPackageRegistryType(identity.packageRegistryType) !== "oci") return undefined;
  return {
    mode: "pinned",
    reason: `Backfilled custom image is pinned to commit ${identity.sourceResolvedCommit} and digest ${identity.packageDigest}.`,
    evidenceRefs: [legacyEvidenceId],
  };
}

function sourceBuildFromIdentity(identity: NonNullable<ToolHiveInstalledServerState["sourceIdentity"]>): McpAutowireCandidate["runtime"]["sourceBuild"] | undefined {
  if (
    !identity.sourceUrl ||
    !identity.sourceResolvedCommit ||
    !identity.sourceBuildRecipeKind ||
    !identity.sourceBuildRecipeHash ||
    !identity.packageIdentifier ||
    !identity.packageDigest ||
    standardPackageRegistryType(identity.packageRegistryType) !== "oci"
  ) return undefined;
  if (!["existing-dockerfile", "generated-dockerfile", "existing-reviewed-image"].includes(identity.sourceBuildRecipeKind)) return undefined;
  if (!/^[a-f0-9]{64}$/i.test(identity.sourceBuildRecipeHash)) return undefined;
  return {
    schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
    sourceUrl: identity.sourceUrl,
    resolvedCommit: identity.sourceResolvedCommit,
    recipeKind: identity.sourceBuildRecipeKind as "existing-dockerfile" | "generated-dockerfile" | "existing-reviewed-image",
    recipeHash: identity.sourceBuildRecipeHash,
    imageIdentifier: identity.packageIdentifier,
    imageDigest: identity.packageDigest,
    evidenceRefs: [legacyEvidenceId],
  };
}

function browserRuntimeUpdatePolicy(packageIdentifier: string): McpAutowireCandidate["runtime"]["updatePolicy"] | undefined {
  const normalized = packageIdentifier.toLowerCase();
  if (!/(browser|playwright|puppeteer|firefox|chromium|devtools)/.test(normalized)) return undefined;
  return {
    mode: "managed-browser-security",
    reason: "Legacy installed package name indicates browser automation; Ambient preserves the managed browser security-update policy during repair backfill.",
    evidenceRefs: [legacyEvidenceId],
  };
}

function networkPermissionsFromProfile(profile: Record<string, unknown>): McpAutowireCandidate["permissions"]["network"] {
  const outbound = recordField(recordField(profile, "network"), "outbound");
  const allowHosts = stringArrayField(outbound, ["allow_host", "allowHost", "allow_hosts", "allowHosts"]);
  const allowPorts = numberArrayField(outbound, ["allow_port", "allowPort", "allow_ports", "allowPorts"]);
  if (outbound.insecure_allow_all === true || outbound.insecureAllowAll === true) {
    return {
      mode: "broad",
      allowHosts,
      allowPorts,
      justification: "Backfilled installed permission profile allowed broad outbound network access; preserve it for repair review.",
    };
  }
  if (allowHosts.length || allowPorts.length) return { mode: "allowlist", allowHosts, allowPorts };
  return {
    mode: "isolated",
    allowHosts: [],
    allowPorts: [],
    justification: "Backfilled installed permission profile did not allow outbound network access.",
  };
}

function filesystemPermissionsFromInstalledVolumes(
  volumes: ToolHiveRunVolume[],
  managedFileExchange: ToolHiveInstalledServerState["managedFileExchange"],
): McpAutowireCandidate["permissions"]["filesystem"] {
  return {
    workspaceRead: false,
    workspaceWrite: false,
    extraMounts: volumes
      .filter((volume) => !isManagedFileExchangeVolume(volume, managedFileExchange))
      .map((volume) => ({
        path: volume.hostPath,
        containerPath: volume.containerPath,
        mode: volume.mode === "rw" ? "read-write" : "read-only",
        purpose: volume.purpose ?? "Backfilled reviewed ToolHive runtime volume.",
      })),
  };
}

function isManagedFileExchangeVolume(volume: ToolHiveRunVolume, managedFileExchange: ToolHiveInstalledServerState["managedFileExchange"]): boolean {
  return Boolean(
    managedFileExchange &&
    volume.containerPath === managedFileExchange.containerPath &&
    volume.hostPath === managedFileExchange.hostPath,
  ) || volume.purpose === "ambient-mcp-file-exchange";
}

function packageArgumentsFromLastRunCommand(command: string[] | undefined, toolHiveRunSource: string | undefined): NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"] {
  if (!command?.length) return [];
  const separatorIndex = command.lastIndexOf("--");
  const sourceIndex = toolHiveRunSource ? command.lastIndexOf(toolHiveRunSource) : -1;
  if (separatorIndex < 0 || (sourceIndex >= 0 && separatorIndex < sourceIndex)) return [];
  return packageArgumentsFromServerArgs(command.slice(separatorIndex + 1));
}

function packageArgumentsFromServerArgs(args: string[]): NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"] {
  const result: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (value.startsWith("--") && value.includes("=")) {
      const [name, ...rest] = value.split("=");
      result.push({ type: "flag", name, valueHint: rest.join("="), isFixed: true });
      continue;
    }
    const next = args[index + 1];
    if (value.startsWith("--") && next && !next.startsWith("-")) {
      result.push({ type: "flag", name: value, valueHint: next, isFixed: true });
      index += 1;
      continue;
    }
    if (value.startsWith("-")) {
      result.push({ type: "switch", name: value, isFixed: true });
      continue;
    }
    result.push({ type: "positional", valueHint: value, isFixed: true });
  }
  return result;
}

function toolDescriptorName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function displayNameFromServer(serverId: string): string {
  return serverId
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || serverId;
}

function recordField(input: unknown, key: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArrayField(input: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

function numberArrayField(input: Record<string, unknown>, keys: string[]): number[] {
  for (const key of keys) {
    const value = input[key];
    const raw = Array.isArray(value) ? value : typeof value === "number" ? [value] : [];
    const numbers = raw
      .map((item) => typeof item === "number" ? item : Number.NaN)
      .filter((item) => Number.isInteger(item) && item > 0 && item <= 65535);
    if (numbers.length) return numbers;
  }
  return [];
}
