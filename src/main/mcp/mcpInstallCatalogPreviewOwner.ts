import {
  TOOLHIVE_RUN_PLAN_SCHEMA_VERSION,
  parseMcpAutowireCandidate,
  parseMcpInstallReview,
  parseToolHiveRunPlan,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireFacade";
import type { McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { buildInstallReview } from "./mcpInstallReviewBuilder";
import type {
  McpCatalogSource,
  McpDefaultCapabilityInstallPreview,
  McpRegistryInstallPreview,
  McpRegistryInstallPreviewInput,
  McpRemoteMcpProxyPreview,
  McpRemoteMcpProxyPreviewInput,
} from "./mcpInstallCatalogTypes";
import type { McpSecretBinding } from "./mcpInstallCatalogStandardImportPreview";
import {
  ambientWorkloadName,
  candidateHashMismatchBlocker,
  candidatePermissionProfile,
  normalizeMcpTransport,
  safeContainerMountPath,
  safeHostMountPath,
  safeIdSegment,
} from "./mcpInstallCatalogUtilities";
import { TOOLHIVE_AMBIENT_GROUP, type ToolHiveRuntimeService, type ToolHiveRunVolume } from "./mcpToolRuntimeFacade";

export interface McpInstallCatalogPreviewOwnerOptions {
  toolHive: ToolHiveRuntimeService;
  defaultCatalog: McpDefaultCatalogDescriptor[];
  defaultCatalogByServerId: Map<string, McpDefaultCatalogDescriptor>;
}

export class McpInstallCatalogPreviewOwner {
  constructor(private readonly options: McpInstallCatalogPreviewOwnerOptions) {}

  async previewRegistryInstall(input: McpRegistryInstallPreviewInput): Promise<McpRegistryInstallPreview> {
    const { registryInfo, catalogSource, defaultDescriptor } = await this.registryInfoWithDefault(input.serverId, input.refresh);
    const volumeReview = reviewedRegistryRuntimeVolumes(input.runtimeVolumes ?? []);
    const candidate = registryCandidateWithRuntimeVolumes(registryInfoToAutowireCandidate(registryInfo), volumeReview.volumes);
    const validation = validateMcpAutowireCandidate(candidate);
    const permissionProfile = registryPermissionProfile(registryInfo, candidate.permissions.filesystem);
    const workloadName = ambientWorkloadName(candidate.source.registryId ?? input.serverId);
    const profileWrite = await this.options.toolHive.writePermissionProfile({
      serverId: input.serverId,
      workloadName,
      profile: permissionProfile,
    });
    const secretBindings = input.secretBindings ?? [];
    const ambientDefaultOciBlockers =
      defaultDescriptor?.source.type === "ambient-default-oci"
        ? [
            "This Ambient default OCI capability is owned by the default capability reconciler. Use ambient_mcp_server_describe/install with this serverId in chat, or the Default capabilities action in MCP settings, so Ambient can install the pinned image and workload name deterministically.",
          ]
        : [];
    const runtimeVolumeBlockers = [
      ...volumeReview.blockers,
      ...registryRuntimeVolumeRequirementBlockers(registryInfo, volumeReview.volumes),
    ];
    const review = parseMcpInstallReview(
      buildInstallReview({
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
      }),
    );
    const runPlan =
      review.blockers.length === 0
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

  async previewRemoteMcpProxy(input: McpRemoteMcpProxyPreviewInput): Promise<McpRemoteMcpProxyPreview> {
    const candidate = parseMcpAutowireCandidate(input.candidate);
    const validation = validateMcpAutowireCandidate(candidate);
    const proxySpec = remoteMcpProxySpec(candidate, input.secretBindings ?? []);
    const permissionProfile = candidatePermissionProfile(candidate);
    const workloadName = ambientWorkloadName(candidate.id);
    const profileWrite = await this.options.toolHive.writePermissionProfile({
      serverId: candidate.id,
      workloadName,
      profile: permissionProfile,
    });
    const secretBindings = input.secretBindings ?? [];
    const review = parseMcpInstallReview(
      buildInstallReview({
        candidate,
        validation,
        sourceLabel: "Remote MCP proxy",
        secretBindings,
        extraBlockers: [...candidateHashMismatchBlocker(input.expectedCandidateHash, validation.candidateHash), ...proxySpec.blockers],
        summary: `${candidate.displayName} will be connected through a reviewed ToolHive remote MCP proxy in the Ambient ToolHive group.`,
        evidenceRefs: candidate.evidence.map((entry) => entry.id).slice(0, 20),
      }),
    );
    const runPlan =
      review.blockers.length === 0 && proxySpec.remoteUrl
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

  async previewDefaultCapabilityInstall(input: {
    capabilityId: McpDefaultCapabilityInstallPreview["capabilityId"];
  }): Promise<McpDefaultCapabilityInstallPreview> {
    const defaultDescriptor = this.options.defaultCatalog.find(
      (descriptor) => descriptor.defaultCapability?.capabilityId === input.capabilityId,
    );
    if (!defaultDescriptor?.defaultCapability)
      throw new Error(`No packaged default MCP capability descriptor found for ${input.capabilityId}.`);
    if (defaultDescriptor.source.type !== "ambient-default-oci") {
      throw new Error(
        `Default capability ${input.capabilityId} must use Ambient-owned OCI metadata, got ${defaultDescriptor.source.type}.`,
      );
    }
    const registryInfo = {
      ...defaultDescriptor.registryInfo,
      ambient_default_catalog: true,
    };
    const candidate = registryInfoToAutowireCandidate(registryInfo);
    const validation = validateMcpAutowireCandidate(candidate);
    const permissionProfile = registryPermissionProfile(registryInfo);
    const workloadName = defaultDescriptor.defaultCapability.workloadName;
    const profileWrite = await this.options.toolHive.writePermissionProfile({
      serverId: defaultDescriptor.serverId,
      workloadName,
      profile: permissionProfile,
    });
    const toolHiveRunSource = stringField(registryInfo, ["image"]);
    const toolHiveServerArgs = stringArrayField(registryInfo, ["server_args", "serverArgs"]);
    const extraBlockers = [
      ...(toolHiveRunSource ? [] : ["Ambient default OCI capability requires registryInfo.image."]),
      ...(toolHiveRunSource?.includes("@sha256:") ? [] : ["Ambient default OCI capability image must be pinned by digest."]),
      ...toolHiveServerArgs
        .filter((arg) => !arg.trim())
        .map(() => "Ambient default OCI capability server_args must contain only non-empty strings."),
    ];
    const review = parseMcpInstallReview(
      buildInstallReview({
        candidate,
        validation,
        sourceLabel: "Ambient default OCI capability",
        secretBindings: [],
        extraBlockers,
        summary: `${candidate.displayName} will be installed as an Ambient default capability from the pinned OCI image and run in the Ambient ToolHive group.`,
        evidenceRefs: defaultDescriptor.source.evidenceRefs,
      }),
    );
    const runPlan =
      review.blockers.length === 0 && toolHiveRunSource
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

  private async registryInfoWithDefault(
    serverId: string,
    refresh?: boolean,
  ): Promise<{
    registryInfo: Record<string, unknown>;
    catalogSource: McpCatalogSource;
    defaultDescriptor?: McpDefaultCatalogDescriptor;
  }> {
    const defaultDescriptor = this.options.defaultCatalogByServerId.get(serverId);
    if (!refresh && defaultDescriptor) {
      return {
        registryInfo: { ...defaultDescriptor.registryInfo, ambient_default_catalog: true },
        catalogSource: "ambient-default",
        defaultDescriptor,
      };
    }
    try {
      const registryInfo = await this.options.toolHive.registryInfo(serverId, { refresh });
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
}

export function catalogSourceForRegistryInfo(info: Record<string, unknown>): McpCatalogSource {
  const fromDefault = info.ambient_default_catalog === true;
  const fromRegistry = info.ambient_live_registry === true;
  if (fromDefault && fromRegistry) return "ambient-default+toolhive-registry";
  if (fromDefault) return "ambient-default";
  return "toolhive-registry";
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
        ? [
            {
              question: "This server requests broad outbound network access; confirm this is appropriate for the user's task.",
              impact: "network" as const,
              blocksInstall: false,
              evidenceRefs: ["toolhive-registry-info"],
            },
          ]
        : []),
    ],
    riskSummary: risk,
  };
}

interface RemoteMcpProxySpec {
  remoteUrl?: string;
  blockers: string[];
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
      blockers.push(
        `${label}.hostPath is not safe for reviewed ToolHive --volume delivery: ${typeof volume.hostPath === "string" ? volume.hostPath : "(missing)"}.`,
      );
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
      mode: volume.mode === "ro" ? ("read-only" as const) : ("read-write" as const),
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
  if (
    candidate.permissions.filesystem.workspaceRead ||
    candidate.permissions.filesystem.workspaceWrite ||
    candidate.permissions.filesystem.extraMounts.length
  ) {
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
    ? (structuredClone(info.permissions) as Record<string, unknown>)
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

export function registryRiskHints(info: Record<string, unknown>): string[] {
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
  ]
    .join(" ")
    .toLowerCase();
  if (!/\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|browserless)\b/.test(text))
    return undefined;
  return {
    mode: "managed-browser-security",
    reason:
      "ToolHive registry metadata indicates browser automation/runtime behavior; Ambient treats browser engine updates as a managed security-update lane while the MCP server package/image identity remains separately reviewed.",
    evidenceRefs: ["toolhive-registry-info"],
  };
}

function normalizeRemoteMcpTransport(value: string | undefined): "streamable-http" | "sse" {
  return value === "sse" ? "sse" : "streamable-http";
}

function remoteSecretHeaderNames(candidate: McpAutowireCandidate): string[] {
  return [...new Set((candidate.runtime.remote?.headers ?? []).map((header) => header.trim()).filter(Boolean))];
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
    if (Array.isArray(entry))
      return entry.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
