import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ToolHiveInstalledServerState,
  ToolHiveInstallValidationStatus,
  ToolHiveMcpToolPolicy,
  ToolHivePermissionProfileReadResult,
  ToolHivePermissionProfileWriteInput,
  ToolHivePermissionProfileWriteResult,
  ToolHiveRuntimeState,
  ToolHiveToolDescriptorSnapshotResult,
  ToolHiveToolDescriptorTrustResult,
} from "./toolHiveRuntimeTypes";

export const TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION = "ambient-toolhive-runtime-state-v1";

export interface ToolHiveRuntimeStateStoreOptions {
  userDataPath: string;
  now?: () => Date;
}

export class ToolHiveRuntimeStateStore {
  constructor(private readonly options: ToolHiveRuntimeStateStoreOptions) {}

  async writePermissionProfile(input: ToolHivePermissionProfileWriteInput): Promise<ToolHivePermissionProfileWriteResult> {
    const profileText = `${JSON.stringify(sortJsonValue(input.profile), null, 2)}\n`;
    const sha256 = sha256Hex(profileText);
    const fileName = `${safeFileSegment(input.workloadName)}-${sha256.slice(0, 12)}.json`;
    const path = join(this.stateRoot(), "permission-profiles", fileName);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, profileText, { encoding: "utf8", mode: 0o600 });
    try {
      await chmod(path, 0o600);
    } catch {
      // chmod is best-effort on platforms/filesystems that do not preserve POSIX modes.
    }
    return { path, sha256 };
  }

  async readInstalledServerPermissionProfile(workloadName: string): Promise<ToolHivePermissionProfileReadResult> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${workloadName}.`);
    const text = await readFile(server.permissionProfilePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) throw new Error(`ToolHive permission profile for workload ${workloadName} is not a JSON object.`);
    const sha256 = sha256Hex(text);
    return {
      server,
      profile: parsed,
      path: server.permissionProfilePath,
      sha256,
      expectedSha256: server.permissionProfileSha256,
      sha256Verified: sha256 === server.permissionProfileSha256,
    };
  }

  async snapshotInstalledServerToolDescriptors(workloadName: string, descriptors: unknown[]): Promise<ToolHiveToolDescriptorSnapshotResult> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${workloadName}.`);
    const now = this.nowIso();
    const stableDescriptors = stableToolDescriptorSnapshot(descriptors);
    const descriptorHash = sha256Hex(JSON.stringify(stableDescriptors));
    const previousHash = server.lastKnownToolDescriptorHash;
    const changed = Boolean(previousHash && previousHash !== descriptorHash);
    server.lastKnownToolDescriptors = stableDescriptors;
    server.lastKnownToolDescriptorHash = descriptorHash;
    server.lastToolDiscoveryAt = now;
    if (changed || server.toolDescriptorReviewStatus === "needs-review") {
      server.toolDescriptorReviewStatus = "needs-review";
      server.toolDescriptorReviewReason = changed
        ? `MCP tool descriptors changed from ${previousHash} to ${descriptorHash}.`
        : server.toolDescriptorReviewReason ?? "MCP tool descriptors require review.";
    } else {
      server.toolDescriptorReviewStatus = "trusted";
      delete server.toolDescriptorReviewReason;
    }
    server.updatedAt = now;
    await this.writeState(state);
    return { state: server, changed, ...(previousHash ? { previousHash } : {}), descriptorHash };
  }

  async trustInstalledServerToolDescriptors(workloadName: string, expectedDescriptorHash?: string): Promise<ToolHiveToolDescriptorTrustResult> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${workloadName}.`);
    const descriptorHash = server.lastKnownToolDescriptorHash;
    if (!descriptorHash) throw new Error(`No MCP tool descriptor snapshot exists for workload ${workloadName}.`);
    if (expectedDescriptorHash && expectedDescriptorHash !== descriptorHash) {
      throw new Error(`MCP tool descriptor snapshot changed before review could be accepted. Expected ${expectedDescriptorHash}, found ${descriptorHash}.`);
    }
    const wasReviewRequired = server.toolDescriptorReviewStatus === "needs-review";
    server.toolDescriptorReviewStatus = "trusted";
    delete server.toolDescriptorReviewReason;
    server.updatedAt = this.nowIso();
    await this.writeState(state);
    return { state: server, descriptorHash, wasReviewRequired };
  }

  async updateInstalledServerInstallValidation(input: {
    workloadName: string;
    status: ToolHiveInstallValidationStatus;
    error?: string;
  }): Promise<ToolHiveInstalledServerState> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === input.workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${input.workloadName}.`);
    const now = this.nowIso();
    server.installValidationStatus = input.status;
    server.installValidationAt = now;
    if (input.status === "validation_failed" && input.error) {
      server.installValidationError = input.error;
    } else {
      delete server.installValidationError;
    }
    server.updatedAt = now;
    await this.writeState(state);
    return server;
  }

  async updateInstalledServerEndpoint(input: {
    workloadName: string;
    endpoint?: string;
  }): Promise<ToolHiveInstalledServerState> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === input.workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${input.workloadName}.`);
    if (input.endpoint) server.endpoint = input.endpoint;
    else delete server.endpoint;
    server.updatedAt = this.nowIso();
    await this.writeState(state);
    return server;
  }

  async updateInstalledServerAutowireRevision(input: {
    workloadName: string;
    activeRevisionId: string;
    candidateRef?: string;
    candidateHash?: string;
  }): Promise<ToolHiveInstalledServerState> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === input.workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${input.workloadName}.`);
    server.activeRevisionId = input.activeRevisionId;
    if (input.candidateRef || input.candidateHash) {
      server.sourceIdentity = {
        ...(server.sourceIdentity ?? { runtimeLane: "unknown" as const }),
        ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
        ...(input.candidateHash ? { candidateHash: input.candidateHash } : {}),
      };
    }
    server.updatedAt = this.nowIso();
    await this.writeState(state);
    return server;
  }

  async updateInstalledServerToolPolicy(
    workloadName: string,
    toolName: string,
    policy: Partial<Omit<ToolHiveMcpToolPolicy, "updatedAt">>,
  ): Promise<ToolHiveInstalledServerState> {
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === workloadName);
    if (!server) throw new Error(`No Ambient ToolHive install state exists for workload ${workloadName}.`);
    const now = this.nowIso();
    const normalized = normalizeToolPolicy(policy, now);
    const nextPolicies = { ...(server.toolPolicies ?? {}) };
    if (normalized) {
      nextPolicies[toolName] = normalized;
      server.toolPolicies = nextPolicies;
    } else {
      delete nextPolicies[toolName];
      if (Object.keys(nextPolicies).length) server.toolPolicies = nextPolicies;
      else delete server.toolPolicies;
    }
    server.updatedAt = now;
    await this.writeState(state);
    return server;
  }

  async readState(): Promise<ToolHiveRuntimeState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath(), "utf8")) as unknown;
      if (!isRecord(parsed) || parsed.schemaVersion !== TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION || !Array.isArray(parsed.installedServers)) {
        return emptyState();
      }
      return {
        schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
        installedServers: parsed.installedServers.filter(isInstalledServerState),
      };
    } catch {
      return emptyState();
    }
  }

  async writeState(state: ToolHiveRuntimeState): Promise<void> {
    await mkdir(dirname(this.statePath()), { recursive: true });
    await writeFile(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async removeState(): Promise<void> {
    await rm(this.statePath(), { force: true });
  }

  stateRoot(): string {
    return join(this.options.userDataPath, "mcp", "toolhive");
  }

  statePath(): string {
    return join(this.stateRoot(), "state.json");
  }

  async upsertInstalledServer(input: Omit<ToolHiveInstalledServerState, "createdAt" | "updatedAt">): Promise<void> {
    const state = await this.readState();
    const now = this.nowIso();
    const existing = state.installedServers.find((server) => server.workloadName === input.workloadName);
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
    } else {
      state.installedServers.push({ ...input, createdAt: now, updatedAt: now });
    }
    const current = state.installedServers.find((server) => server.workloadName === input.workloadName);
    if (current && (input.installValidationStatus === "validation_pending" || input.installValidationStatus === "ready")) {
      delete current.installValidationError;
    }
    await this.writeState(state);
  }

  async removeInstalledServer(workloadName: string): Promise<void> {
    const state = await this.readState();
    state.installedServers = state.installedServers.filter((server) => server.workloadName !== workloadName);
    await this.writeState(state);
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function emptyState(): ToolHiveRuntimeState {
  return { schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION, installedServers: [] };
}

function normalizeToolPolicy(
  policy: Partial<Omit<ToolHiveMcpToolPolicy, "updatedAt">>,
  updatedAt: string,
): ToolHiveMcpToolPolicy | undefined {
  const visibility = policy.visibility === "hidden" ? "hidden" : policy.visibility === "visible" ? "visible" : undefined;
  const callPolicy =
    policy.callPolicy === "blocked" || policy.callPolicy === "approval-required"
      ? policy.callPolicy
      : policy.callPolicy === "default"
        ? "default"
        : undefined;
  const reason = typeof policy.reason === "string" && policy.reason.trim() ? policy.reason.trim().slice(0, 1_000) : undefined;
  const isDefaultVisibility = !visibility || visibility === "visible";
  const isDefaultCallPolicy = !callPolicy || callPolicy === "default";
  if (isDefaultVisibility && isDefaultCallPolicy && !reason) return undefined;
  return {
    ...(visibility ? { visibility } : {}),
    ...(callPolicy ? { callPolicy } : {}),
    ...(reason ? { reason } : {}),
    updatedAt,
  };
}

function isInstalledServerState(value: unknown): value is ToolHiveInstalledServerState {
  if (!isRecord(value)) return false;
  return (
    typeof value.serverId === "string" &&
    typeof value.workloadName === "string" &&
    typeof value.permissionProfilePath === "string" &&
    typeof value.permissionProfileSha256 === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "toolhive-profile";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableToolDescriptorSnapshot(descriptors: unknown[]): unknown[] {
  return descriptors
    .map(sortJsonValue)
    .sort((left, right) => stableDescriptorSortKey(left).localeCompare(stableDescriptorSortKey(right)));
}

function stableDescriptorSortKey(value: unknown): string {
  if (isRecord(value) && typeof value.name === "string") return value.name;
  return JSON.stringify(value);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJsonValue(entry)]));
}
