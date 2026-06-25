import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ContainerRuntimeProbeResult, ContainerRuntimeProbeStatus } from "./mcpContainerRuntimeFacade";
import { mcpDefaultCatalogDescriptorHash, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import type { McpInstalledServerSummary } from "./mcpInstallCatalog";

export const MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION = "ambient-mcp-default-capability-state-v1";

export type McpDefaultCapabilityId = "scrapling";

export type McpDefaultCapabilityStatus =
  | "not_configured"
  | "blocked_runtime"
  | "blocked_descriptor"
  | "blocked_approval"
  | "warming_up"
  | "installing"
  | "installed"
  | "needs_review"
  | "failed";

export type McpDefaultCapabilityNextAction =
  | "none"
  | "install-runtime"
  | "approve-default-capability"
  | "install-default-capability"
  | "review-descriptor"
  | "inspect-failure";

export interface McpDefaultCapabilitySummary {
  schemaVersion: "ambient-mcp-default-capability-v1";
  capabilityId: McpDefaultCapabilityId;
  title: string;
  status: McpDefaultCapabilityStatus;
  nextAction: McpDefaultCapabilityNextAction;
  message: string;
  serverId?: string;
  workloadName: string;
  descriptorHash?: string;
  image?: string;
  imageDigest?: string;
  runtimeStatus: ContainerRuntimeProbeStatus;
  installedWorkloadStatus?: string;
  installedEndpoint?: string;
  unhealthySince?: string;
  retryAfter?: string;
  lastReconciledAt: string;
  appVersion: string;
}

export interface McpDefaultCapabilityState {
  schemaVersion: typeof MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION;
  appVersion?: string;
  updatedAt?: string;
  capabilities: Partial<Record<McpDefaultCapabilityId, McpDefaultCapabilitySummary>>;
}

export interface ReconcileMcpDefaultCapabilitiesOptions {
  statePath: string;
  runtime: Pick<ContainerRuntimeProbeResult, "status" | "checkedAt" | "message">;
  defaultCatalog: readonly McpDefaultCatalogDescriptor[];
  installedServers: readonly McpInstalledServerSummary[];
  appVersion: string;
  now?: () => Date;
}

export const MCP_DEFAULT_CAPABILITY_WARMUP_GRACE_MS = 90_000;

export async function reconcileMcpDefaultCapabilities(
  options: ReconcileMcpDefaultCapabilitiesOptions,
): Promise<McpDefaultCapabilitySummary[]> {
  const existing = await readMcpDefaultCapabilityState(options.statePath);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const scrapling = reconcileScraplingDefaultCapability({
    ...options,
    nowIso: now,
    existing: existing.capabilities.scrapling,
  });
  const state: McpDefaultCapabilityState = {
    schemaVersion: MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION,
    appVersion: options.appVersion,
    updatedAt: now,
    capabilities: {
      ...existing.capabilities,
      scrapling,
    },
  };
  await writeMcpDefaultCapabilityState(options.statePath, state);
  return [scrapling];
}

export function isMcpDefaultCapabilityInstalledServerAvailable(server: McpInstalledServerSummary): boolean {
  const status = server.workloadStatus?.trim().toLowerCase();
  return status === "running" && Boolean(server.endpoint?.trim());
}

export async function readMcpDefaultCapabilityState(statePath: string): Promise<McpDefaultCapabilityState> {
  try {
    return normalizeMcpDefaultCapabilityState(JSON.parse(await readFile(statePath, "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) return defaultMcpDefaultCapabilityState();
    if (isMalformedJsonError(error)) {
      console.warn(`[mcp-default-capabilities] Ignoring malformed default capability state at ${statePath}: ${error instanceof Error ? error.message : String(error)}`);
      return defaultMcpDefaultCapabilityState();
    }
    throw error;
  }
}

export async function writeMcpDefaultCapabilitySummary(
  statePath: string,
  summary: McpDefaultCapabilitySummary,
  options: { appVersion?: string; now?: () => Date } = {},
): Promise<void> {
  const existing = await readMcpDefaultCapabilityState(statePath);
  const now = (options.now ?? (() => new Date()))().toISOString();
  await writeMcpDefaultCapabilityState(statePath, {
    schemaVersion: MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION,
    appVersion: options.appVersion ?? existing.appVersion,
    updatedAt: now,
    capabilities: {
      ...existing.capabilities,
      [summary.capabilityId]: summary,
    },
  });
}

function reconcileScraplingDefaultCapability(input: ReconcileMcpDefaultCapabilitiesOptions & {
  nowIso: string;
  existing?: McpDefaultCapabilitySummary;
}): McpDefaultCapabilitySummary {
  const descriptor = input.defaultCatalog.find((candidate) => candidate.defaultCapability?.capabilityId === "scrapling");
  if (!descriptor?.defaultCapability) {
    return {
      schemaVersion: "ambient-mcp-default-capability-v1",
      capabilityId: "scrapling",
      title: "Scrapling",
      status: "blocked_descriptor",
      nextAction: "inspect-failure",
      message: "Scrapling is queued as a default capability, but no packaged default descriptor was found.",
      workloadName: "ambient-scrapling",
      runtimeStatus: input.runtime.status,
      lastReconciledAt: input.nowIso,
      appVersion: input.appVersion,
    };
  }

  const descriptorHash = mcpDefaultCatalogDescriptorHash(descriptor);
  const image = stringField(descriptor.registryInfo, ["image"]);
  const imageDigest = imageDigestFromRef(image);
  const base = {
    schemaVersion: "ambient-mcp-default-capability-v1" as const,
    capabilityId: "scrapling" as const,
    title: descriptor.title,
    serverId: descriptor.serverId,
    workloadName: descriptor.defaultCapability.workloadName,
    descriptorHash,
    ...(image ? { image } : {}),
    ...(imageDigest ? { imageDigest } : {}),
    runtimeStatus: input.runtime.status,
    lastReconciledAt: input.nowIso,
    appVersion: input.appVersion,
  };

  if (input.runtime.status !== "ready") {
    return {
      ...base,
      status: "blocked_runtime",
      nextAction: "install-runtime",
      message: `Scrapling default capability is blocked until the isolated container runtime is ready. Runtime status: ${input.runtime.status}.`,
    };
  }

  const installed = input.installedServers.find((server) =>
    server.serverId === descriptor.serverId ||
    server.workloadName === descriptor.defaultCapability?.workloadName ||
    server.defaultCatalogDescriptorHash === descriptorHash ||
    server.installedDefaultCatalogDescriptorHash === descriptorHash
  );

  if (!installed) {
    if (input.existing?.status === "failed") {
      return {
        ...base,
        status: "failed",
        nextAction: "install-default-capability",
        message: input.existing.message || "The last Scrapling setup attempt failed. Set up Scrapling again to retry.",
      };
    }
    return {
      ...base,
      status: input.existing?.status === "installing" ? "installing" : "blocked_approval",
      nextAction: input.existing?.status === "installing" ? "install-default-capability" : "approve-default-capability",
      message: input.existing?.status === "installing"
        ? input.existing.message || "Scrapling setup is running."
        : "Runtime is ready. Scrapling is waiting for the default capability approval before Ambient starts the pinned ToolHive workload.",
    };
  }

  if (!isMcpDefaultCapabilityInstalledServerAvailable(installed)) {
    const warmup = warmingScraplingSummary({
      base,
      installed,
      existing: input.existing,
      nowIso: input.nowIso,
    });
    if (warmup) return warmup;
    return {
      ...base,
      status: "failed",
      nextAction: "install-default-capability",
      installedWorkloadStatus: installed.workloadStatus,
      installedEndpoint: installed.endpoint,
      message: [
        "Scrapling has Ambient install state, but ToolHive does not report a running workload endpoint.",
        "Set up Scrapling again to repair the default capability.",
      ].join(" "),
    };
  }

  const installedHash = installed.installedDefaultCatalogDescriptorHash ?? installed.defaultCatalogDescriptorHash;
  if (installedHash && installedHash !== descriptorHash) {
    return {
      ...base,
      status: "needs_review",
      nextAction: "review-descriptor",
      installedWorkloadStatus: installed.workloadStatus,
      installedEndpoint: installed.endpoint,
      message: "Scrapling is installed, but its default descriptor hash differs from the packaged descriptor and needs review before replacement.",
    };
  }

  if (installed.defaultCatalogUpdateStatus === "update-available" || installed.toolDescriptorReviewStatus === "needs-review") {
    return {
      ...base,
      status: "needs_review",
      nextAction: "review-descriptor",
      installedWorkloadStatus: installed.workloadStatus,
      installedEndpoint: installed.endpoint,
      message: "Scrapling is installed, but the descriptor or tool snapshot needs review.",
    };
  }

  return {
    ...base,
    status: "installed",
    nextAction: "none",
    installedWorkloadStatus: installed.workloadStatus,
    installedEndpoint: installed.endpoint,
    message: `Scrapling is installed globally as ToolHive workload ${installed.workloadName}.`,
  };
}

function warmingScraplingSummary(input: {
  base: Omit<McpDefaultCapabilitySummary, "status" | "nextAction" | "message">;
  installed: McpInstalledServerSummary;
  existing?: McpDefaultCapabilitySummary;
  nowIso: string;
}): McpDefaultCapabilitySummary | undefined {
  const nowMs = Date.parse(input.nowIso);
  if (!Number.isFinite(nowMs)) return undefined;
  const previousUnhealthySince = validIso(input.existing?.unhealthySince);
  const firstObservedAt = previousUnhealthySince ?? input.nowIso;
  const retryAfter = previousUnhealthySince
    ? validIso(input.existing?.retryAfter) ?? new Date(Date.parse(firstObservedAt) + MCP_DEFAULT_CAPABILITY_WARMUP_GRACE_MS).toISOString()
    : new Date(nowMs + MCP_DEFAULT_CAPABILITY_WARMUP_GRACE_MS).toISOString();
  if (nowMs >= Date.parse(retryAfter)) return undefined;
  return {
    ...input.base,
    status: "warming_up",
    nextAction: "none",
    installedWorkloadStatus: input.installed.workloadStatus,
    installedEndpoint: input.installed.endpoint,
    unhealthySince: firstObservedAt,
    retryAfter,
    message: [
      "Scrapling has Ambient install state, but ToolHive has not reported a running endpoint yet.",
      `Ambient is giving the existing workload time to warm up until ${retryAfter}.`,
    ].join(" "),
  };
}

async function writeMcpDefaultCapabilityState(statePath: string, state: McpDefaultCapabilityState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(normalizeMcpDefaultCapabilityState(state), null, 2)}\n`, "utf8");
  await rename(tmpPath, statePath);
}

function normalizeMcpDefaultCapabilityState(raw: unknown): McpDefaultCapabilityState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultMcpDefaultCapabilityState();
  const value = raw as Record<string, unknown>;
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  const scrapling = normalizeCapabilitySummary(capabilities.scrapling);
  return {
    schemaVersion: MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION,
    ...(stringValue(value.appVersion) ? { appVersion: stringValue(value.appVersion) } : {}),
    ...(stringValue(value.updatedAt) ? { updatedAt: stringValue(value.updatedAt) } : {}),
    capabilities: {
      ...(scrapling ? { scrapling } : {}),
    },
  };
}

function normalizeCapabilitySummary(value: unknown): McpDefaultCapabilitySummary | undefined {
  if (!isRecord(value)) return undefined;
  if (value.schemaVersion !== "ambient-mcp-default-capability-v1") return undefined;
  if (value.capabilityId !== "scrapling") return undefined;
  const status = defaultCapabilityStatus(value.status);
  const nextAction = defaultCapabilityNextAction(value.nextAction);
  const runtimeStatus = containerRuntimeStatus(value.runtimeStatus);
  const workloadName = stringValue(value.workloadName);
  const lastReconciledAt = stringValue(value.lastReconciledAt);
  const appVersion = stringValue(value.appVersion);
  if (!status || !nextAction || !runtimeStatus || !workloadName || !lastReconciledAt || !appVersion) return undefined;
  return {
    schemaVersion: "ambient-mcp-default-capability-v1",
    capabilityId: "scrapling",
    title: stringValue(value.title) ?? "Scrapling",
    status,
    nextAction,
    message: stringValue(value.message) ?? "",
    ...(stringValue(value.serverId) ? { serverId: stringValue(value.serverId) } : {}),
    workloadName,
    ...(stringValue(value.descriptorHash) ? { descriptorHash: stringValue(value.descriptorHash) } : {}),
    ...(stringValue(value.image) ? { image: stringValue(value.image) } : {}),
    ...(stringValue(value.imageDigest) ? { imageDigest: stringValue(value.imageDigest) } : {}),
    runtimeStatus,
    ...(stringValue(value.installedWorkloadStatus) ? { installedWorkloadStatus: stringValue(value.installedWorkloadStatus) } : {}),
    ...(stringValue(value.installedEndpoint) ? { installedEndpoint: stringValue(value.installedEndpoint) } : {}),
    ...(validIso(stringValue(value.unhealthySince)) ? { unhealthySince: validIso(stringValue(value.unhealthySince)) } : {}),
    ...(validIso(stringValue(value.retryAfter)) ? { retryAfter: validIso(stringValue(value.retryAfter)) } : {}),
    lastReconciledAt,
    appVersion,
  };
}

function defaultMcpDefaultCapabilityState(): McpDefaultCapabilityState {
  return {
    schemaVersion: MCP_DEFAULT_CAPABILITY_STATE_SCHEMA_VERSION,
    capabilities: {},
  };
}

function defaultCapabilityStatus(value: unknown): McpDefaultCapabilityStatus | undefined {
  if (
    value === "not_configured" ||
    value === "blocked_runtime" ||
    value === "blocked_descriptor" ||
    value === "blocked_approval" ||
    value === "warming_up" ||
    value === "installing" ||
    value === "installed" ||
    value === "needs_review" ||
    value === "failed"
  ) {
    return value;
  }
  return undefined;
}

function validIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function defaultCapabilityNextAction(value: unknown): McpDefaultCapabilityNextAction | undefined {
  if (
    value === "none" ||
    value === "install-runtime" ||
    value === "approve-default-capability" ||
    value === "install-default-capability" ||
    value === "review-descriptor" ||
    value === "inspect-failure"
  ) {
    return value;
  }
  return undefined;
}

function containerRuntimeStatus(value: unknown): ContainerRuntimeProbeStatus | undefined {
  if (
    value === "ready" ||
    value === "installed-not-running" ||
    value === "missing" ||
    value === "unsupported" ||
    value === "blocked-by-permissions" ||
    value === "blocked-by-policy"
  ) {
    return value;
  }
  return undefined;
}

function imageDigestFromRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/@sha256:([a-f0-9]{64})$/i);
  return match ? `sha256:${match[1].toLowerCase()}` : undefined;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function isMalformedJsonError(error: unknown): boolean {
  return error instanceof SyntaxError;
}
