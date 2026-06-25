import { mcpDefaultCatalogDescriptorHash, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { errorMessage } from "./mcpInstallCatalogUtilities";
import type {
  McpDefaultCatalogUpdateDiff,
  McpDefaultCatalogUpdatePreview,
  McpInstalledServerInventory,
  McpInstalledServerSummary,
} from "./mcpInstallCatalog";
import type {
  ToolHiveInstalledServerSourceIdentity,
  ToolHiveInstalledServerState,
  ToolHiveRuntimeService,
  ToolHiveSecretBindingState,
  ToolHiveWorkloadSummary,
} from "./mcpToolRuntimeFacade";

export interface McpInstallCatalogInventoryOwnerOptions {
  toolHive: ToolHiveRuntimeService;
  defaultCatalogByServerId: Map<string, McpDefaultCatalogDescriptor>;
}

export class McpInstallCatalogInventoryOwner {
  constructor(private readonly options: McpInstallCatalogInventoryOwnerOptions) {}

  async listInstalledServerInventory(): Promise<McpInstalledServerInventory> {
    const state = await this.options.toolHive.readState();
    let workloads: ToolHiveWorkloadSummary[] = [];
    let runtimeListError: string | undefined;
    try {
      workloads = await this.options.toolHive.listAmbientWorkloadSummaries({ all: true });
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
      const workloadStatus =
        workload?.status ?? (server.sourceIdentity?.runtimeLane === "guided-local-bridge" ? "registered-local-bridge" : undefined);
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
              ...installedServerDerivedSecretBindingSummary(server.secretBindings),
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
        reason:
          "ToolHive reports this workload in the ambient group, but Ambient has no reviewed install state, permission profile, source identity, or tool descriptor policy for it.",
        nextAction:
          "Reinstall through ambient_mcp_autowire_plan/review and ambient_mcp_standard_import_describe/install, then remove the unmanaged workload with ToolHive only if the user explicitly asks for manual cleanup.",
      }));
    return { servers, unmanagedWorkloads };
  }

  async previewDefaultCatalogUpdate(input: { serverId?: string; workloadName?: string }): Promise<McpDefaultCatalogUpdatePreview> {
    const state = await this.options.toolHive.readState();
    const selected = selectInstalledServerState(state.installedServers, input);
    const descriptor = this.options.defaultCatalogByServerId.get(selected.serverId);
    if (!descriptor)
      throw new Error(`No reviewed Ambient default catalog descriptor exists for installed MCP server ${selected.serverId}.`);
    const currentHash = mcpDefaultCatalogDescriptorHash(descriptor);
    const status: McpDefaultCatalogUpdatePreview["status"] = selected.defaultCatalogDescriptorHash
      ? selected.defaultCatalogDescriptorHash === currentHash
        ? "current"
        : "update-available"
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

  private defaultCatalogUpdateSummary(server: {
    serverId: string;
    defaultCatalogDescriptorHash?: string;
  }): Partial<McpInstalledServerSummary> {
    const descriptor = this.options.defaultCatalogByServerId.get(server.serverId);
    if (!descriptor) return {};
    const currentHash = mcpDefaultCatalogDescriptorHash(descriptor);
    return {
      defaultCatalogUpdateStatus: server.defaultCatalogDescriptorHash
        ? server.defaultCatalogDescriptorHash === currentHash
          ? "current"
          : "update-available"
        : "untracked",
      defaultCatalogDescriptorHash: currentHash,
      ...(server.defaultCatalogDescriptorHash ? { installedDefaultCatalogDescriptorHash: server.defaultCatalogDescriptorHash } : {}),
      defaultCatalogReviewedAt: descriptor.source.reviewedAt,
    };
  }
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
  const matches = servers.filter(
    (server) => (!serverId || server.serverId === serverId) && (!workloadName || server.workloadName === workloadName),
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
  addDiff(
    diffs,
    "registry source",
    server.registrySource,
    "ambient-default",
    "state",
    (installed, current) => installed !== current && installed !== "ambient-default+toolhive-registry",
  );

  const currentImage = stringField(descriptor.registryInfo, ["image"]);
  addDiff(diffs, "runtime image/package", server.sourceIdentity?.packageIdentifier, currentImage, "runtime");
  addDiff(
    diffs,
    "runtime image/package version",
    server.sourceIdentity?.packageVersion,
    currentImage ? ociImageTag(currentImage) : undefined,
    "runtime",
  );

  const currentTools = stringArrayField(descriptor.registryInfo, ["tools"]).sort((left, right) => left.localeCompare(right));
  const installedTools = installedToolNames(server).sort((left, right) => left.localeCompare(right));
  if (currentTools.length) {
    addDiff(diffs, "declared tools", installedTools.length ? installedTools.join(", ") : undefined, currentTools.join(", "), "tools");
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
  const action =
    status === "untracked" ? "adopt the reviewed bundled default descriptor" : "upgrade to the reviewed bundled default descriptor";
  const secretText = server.secretBindings?.length
    ? ` Reuse the existing Ambient secret refs for ${server.secretBindings.map((binding) => binding.envName).join(", ")} if the user approves reinstall.`
    : "";
  return `This review is read-only. To ${action}, ask for explicit approval, remove the old workload with ambient_mcp_server_uninstall using serverId ${server.serverId} and workloadName ${server.workloadName}, then reinstall the same serverId with ambient_mcp_server_install. Do not mark the descriptor current without reinstalling the workload.${secretText}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function envVarRecords(value: unknown): Array<{ name: string; description?: string; required?: boolean; secret?: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    const name = stringField(entry, ["name"]);
    if (!name) return [];
    return [
      {
        name,
        description: stringField(entry, ["description"]),
        required: entry.required === true,
        secret: entry.secret === true,
      },
    ];
  });
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
    if (Array.isArray(entry))
      return entry.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
