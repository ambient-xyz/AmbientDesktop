import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { ambientRuntimeEnv } from "./toolRuntimeSetupFacade";
import { resolveOrExtractToolHiveExecutable, type ResolveToolHiveExecutableOptions } from "./toolHiveBundle";
import { ensureMcpManagedFileExchangeHostPath, managedFileExchangeFromVolumes, type McpManagedFileExchange } from "./toolRuntimeMcpManagedFileExchangeFacade";
import { readSecretReference } from "./toolRuntimeSecurityFacade";

const execFileAsync = promisify(execFile);

export const TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION = "ambient-toolhive-runtime-state-v1";
export const TOOLHIVE_AMBIENT_GROUP = "ambient";
const defaultTimeoutMs = 30_000;
const maxOutputBufferBytes = 8 * 1024 * 1024;

export type ToolHiveAllowedCommand =
  | "version"
  | "build"
  | "group-list"
  | "group-create"
  | "registry-list"
  | "registry-info"
  | "runtime-check"
  | "run-registry"
  | "run-import"
  | "run-remote"
  | "list"
  | "logs"
  | "stop"
  | "rm";

export interface ToolHiveCommandResult {
  command: ToolHiveAllowedCommand;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ToolHiveCommandInvocation {
  executablePath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export type ToolHiveCommandExecutor = (invocation: ToolHiveCommandInvocation) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface ToolHiveOperationProgress {
  phase: string;
  status: "running" | "complete";
  message: string;
  workloadName?: string;
  command?: ToolHiveAllowedCommand;
  elapsedMs?: number;
}

export interface ToolHiveRuntimeServiceOptions extends ResolveToolHiveExecutableOptions {
  userDataPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executor?: ToolHiveCommandExecutor;
  now?: () => Date;
  timeoutMs?: number;
}

export interface ToolHivePermissionProfileWriteInput {
  serverId: string;
  workloadName: string;
  profile: Record<string, unknown>;
}

export interface ToolHivePermissionProfileWriteResult {
  path: string;
  sha256: string;
}

export interface ToolHivePermissionProfileReadResult {
  server: ToolHiveInstalledServerState;
  profile: Record<string, unknown>;
  path: string;
  sha256: string;
  expectedSha256: string;
  sha256Verified: boolean;
}

export interface ToolHiveRunRegistryServerInput {
  serverId: string;
  workloadName: string;
  permissionProfile: Record<string, unknown>;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  transport?: "stdio" | "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  serverArgs?: string[];
  volumes?: ToolHiveRunVolume[];
}

export interface ToolHiveRunStandardMcpImportInput {
  serverId: string;
  workloadName: string;
  sourceRef: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
  transport?: "stdio" | "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  serverArgs?: string[];
  runtimeImage?: string;
  envVars?: ToolHivePlainEnvVar[];
  volumes?: ToolHiveRunVolume[];
  onProgress?: (progress: ToolHiveOperationProgress) => void;
}

export interface ToolHiveAdoptStandardMcpImportWorkloadInput extends ToolHiveRunStandardMcpImportInput {
  endpoint?: string;
}

export interface ToolHiveBuildProtocolImageInput {
  sourceRef: string;
  tag: string;
  serverArgs?: string[];
  runtimeImage?: string;
}

export interface ToolHiveRunRemoteMcpProxyInput {
  serverId: string;
  workloadName: string;
  remoteUrl: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
  transport: "streamable-http" | "sse";
  proxyMode?: "streamable-http" | "sse";
}

export interface ToolHiveRegisterGuidedLocalBridgeInput {
  serverId: string;
  workloadName: string;
  endpoint: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  permissionProfile: Record<string, unknown>;
}

export interface ToolHiveRegistryListOptions {
  refresh?: boolean;
}

export interface ToolHiveRegistryInfoOptions {
  refresh?: boolean;
}

export interface ToolHiveListWorkloadsOptions {
  all?: boolean;
  group?: string;
}

export interface ToolHiveWaitForWorkloadOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  requireEndpoint?: boolean;
}

export interface ToolHiveRuntimePreflight {
  ok: boolean;
  message: string;
  command: ToolHiveCommandResult;
}

export interface ToolHiveWorkloadSummary {
  name?: string;
  status?: string;
  group?: string;
  endpoint?: string;
  raw: unknown;
}

export type ToolHiveToolDescriptorReviewStatus = "trusted" | "needs-review";
export type ToolHiveMcpToolVisibility = "visible" | "hidden";
export type ToolHiveMcpToolCallPolicy = "default" | "blocked" | "approval-required";
export type ToolHiveInstalledRuntimeLane =
  | "ambient-default-oci"
  | "toolhive-registry"
  | "standard-mcp-import"
  | "remote-mcp-proxy"
  | "guided-local-bridge"
  | "unknown";
export type ToolHiveInstalledReviewStatus = "reviewed" | "needs-review";
export type ToolHiveInstallValidationStatus = "validation_pending" | "ready" | "validation_failed";
export type ToolHiveImageVerificationPolicy = "strict" | "warn" | "ambient-reviewed" | "disabled";

export interface ToolHivePlainEnvVar {
  name: string;
  value: string;
}

export interface ToolHiveRunVolume {
  hostPath: string;
  containerPath: string;
  mode: "ro" | "rw";
  purpose?: string;
}

export interface ToolHiveMcpToolPolicy {
  visibility?: ToolHiveMcpToolVisibility;
  callPolicy?: ToolHiveMcpToolCallPolicy;
  reason?: string;
  updatedAt: string;
}

export interface ToolHiveInstalledServerSourceIdentity {
  runtimeLane: ToolHiveInstalledRuntimeLane;
  sourceKind?: string;
  sourceUrl?: string;
  sourceResolvedCommit?: string;
  registryId?: string;
  packageName?: string;
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
  riskLevel?: "low" | "medium" | "high";
}

export type ToolHiveSecretDerivedBindingKind = "container-env-file" | "remote-bearer-token-file";

export interface ToolHiveSecretDerivedBindingState {
  id: string;
  kind: ToolHiveSecretDerivedBindingKind;
  envName: string;
  secretRef: string;
  runtimeName: string;
  target?: string;
}

export interface ToolHiveSecretBindingState {
  envName: string;
  secretRef: string;
  derivedBindings?: ToolHiveSecretDerivedBindingState[];
}

export interface ToolHiveInstallReviewState {
  status: ToolHiveInstalledReviewStatus;
  outcome?: string;
  reviewedAt?: string;
  summary?: string;
  warningCount?: number;
  blockerCount?: number;
}

export interface ToolHiveInstalledServerState {
  serverId: string;
  workloadName: string;
  activeRevisionId?: string;
  endpoint?: string;
  registrySource?: string;
  sourceIdentity?: ToolHiveInstalledServerSourceIdentity;
  defaultCatalogDescriptorHash?: string;
  defaultCatalogReviewedAt?: string;
  installReview?: ToolHiveInstallReviewState;
  secretBindings?: ToolHiveSecretBindingState[];
  imageVerificationPolicy?: ToolHiveImageVerificationPolicy;
  permissionProfilePath: string;
  permissionProfileSha256: string;
  lastKnownToolDescriptors?: unknown[];
  lastKnownToolDescriptorHash?: string;
  lastToolDiscoveryAt?: string;
  installValidationStatus?: ToolHiveInstallValidationStatus;
  installValidationError?: string;
  installValidationAt?: string;
  toolDescriptorReviewStatus?: ToolHiveToolDescriptorReviewStatus;
  toolDescriptorReviewReason?: string;
  toolPolicies?: Record<string, ToolHiveMcpToolPolicy>;
  runtimeVolumes?: ToolHiveRunVolume[];
  managedFileExchange?: McpManagedFileExchange;
  createdAt: string;
  updatedAt: string;
  lastRunCommand?: string[];
}

export interface ToolHiveToolDescriptorSnapshotResult {
  state: ToolHiveInstalledServerState;
  changed: boolean;
  previousHash?: string;
  descriptorHash: string;
}

export interface ToolHiveToolDescriptorTrustResult {
  state: ToolHiveInstalledServerState;
  descriptorHash: string;
  wasReviewRequired: boolean;
}

export interface ToolHiveRuntimeState {
  schemaVersion: typeof TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION;
  installedServers: ToolHiveInstalledServerState[];
}

export class ToolHiveRuntimeService {
  private readonly options: ToolHiveRuntimeServiceOptions;

  constructor(options: ToolHiveRuntimeServiceOptions) {
    if (!options.userDataPath.trim()) throw new Error("ToolHiveRuntimeService requires userDataPath.");
    this.options = options;
  }

  async version(): Promise<ToolHiveCommandResult> {
    return this.runAllowed("version", ["version"]);
  }

  async registryList(options: ToolHiveRegistryListOptions = {}): Promise<unknown[]> {
    const args = ["registry", "list", "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.runAllowed("registry-list", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry list");
    if (!Array.isArray(parsed)) throw new Error("ToolHive registry list returned JSON that is not an array.");
    return parsed;
  }

  async registryInfo(serverId: string, options: ToolHiveRegistryInfoOptions = {}): Promise<Record<string, unknown>> {
    assertSafeToolHiveRef(serverId, "serverId");
    const args = ["registry", "info", serverId, "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.runAllowed("registry-info", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry info");
    if (!isRecord(parsed)) throw new Error("ToolHive registry info returned JSON that is not an object.");
    return parsed;
  }

  async preflightRuntime(timeoutSeconds = 5): Promise<ToolHiveRuntimePreflight> {
    const timeout = Math.max(1, Math.min(60, Math.floor(timeoutSeconds)));
    const command = await this.runAllowed("runtime-check", ["runtime", "check", "--timeout", String(timeout)], { throwOnNonZero: false, timeoutMs: (timeout + 2) * 1000 });
    const output = [command.stdout, command.stderr].join("\n").trim();
    return {
      ok: command.exitCode === 0,
      message: command.exitCode === 0 ? output || "ToolHive container runtime is available." : output || "ToolHive container runtime is not available.",
      command,
    };
  }

  async buildProtocolImage(input: ToolHiveBuildProtocolImageInput): Promise<ToolHiveCommandResult> {
    assertSafeToolHiveRunSource(input.sourceRef);
    assertSafeToolHiveRuntimeImage(input.tag);
    if (input.runtimeImage) assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      assertSafeServerArg(arg);
    }
    const args = ["build", "--tag", input.tag];
    if (input.runtimeImage) args.push("--runtime-image", input.runtimeImage);
    args.push(input.sourceRef);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    return this.runAllowed("build", args, { timeoutMs: Math.max(this.timeoutMs(), 300_000) });
  }

  async listGroups(): Promise<string[]> {
    const result = await this.runAllowed("group-list", ["group", "list"]);
    return parseToolHiveGroupList(result.stdout);
  }

  async ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined> {
    const groups = await this.listGroups();
    if (groups.includes(TOOLHIVE_AMBIENT_GROUP)) return undefined;
    return this.runAllowed("group-create", ["group", "create", TOOLHIVE_AMBIENT_GROUP]);
  }

  async listWorkloads(options: ToolHiveListWorkloadsOptions = {}): Promise<unknown[]> {
    const args = ["list", "--format", "json"];
    if (options.all) args.push("--all");
    args.push("--group", options.group ?? TOOLHIVE_AMBIENT_GROUP);
    const result = await this.runAllowed("list", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive workload list");
    if (!Array.isArray(parsed)) throw new Error("ToolHive workload list returned JSON that is not an array.");
    return parsed;
  }

  async listAmbientWorkloadSummaries(options: Omit<ToolHiveListWorkloadsOptions, "group"> = {}): Promise<ToolHiveWorkloadSummary[]> {
    return (await this.listWorkloads({ ...options, group: TOOLHIVE_AMBIENT_GROUP })).map((workload) => ({
      name: stringField(workload, ["name", "workload_name", "workloadName"]),
      status: stringField(workload, ["status", "state"]),
      group: stringField(workload, ["group"]),
      endpoint: toolHiveWorkloadEndpoint(workload),
      raw: workload,
    }));
  }

  async waitForAmbientWorkload(workloadName: string, options: ToolHiveWaitForWorkloadOptions = {}): Promise<ToolHiveWorkloadSummary> {
    assertSafeWorkloadName(workloadName);
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 60_000));
    const pollIntervalMs = Math.max(50, Math.floor(options.pollIntervalMs ?? 500));
    const requireEndpoint = options.requireEndpoint !== false;
    const startedAt = Date.now();
    let lastSummary: ToolHiveWorkloadSummary | undefined;
    let lastError: string | undefined;

    while (Date.now() - startedAt <= timeoutMs) {
      try {
        const summary = (await this.listAmbientWorkloadSummaries({ all: true })).find((candidate) => candidate.name === workloadName);
        if (summary) {
          lastSummary = summary;
          const status = summary.status?.toLowerCase();
          const statusReady = !status || status === "running" || status === "started" || status === "healthy";
          if (statusReady && (!requireEndpoint || summary.endpoint)) return summary;
        }
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(pollIntervalMs);
    }

    const status = lastSummary
      ? `last status=${lastSummary.status ?? "unknown"} endpoint=${lastSummary.endpoint ?? "none"}`
      : lastError
        ? `last error=${lastError}`
        : "workload was not listed";
    throw new Error(`ToolHive workload ${workloadName} did not become ready within ${timeoutMs} ms (${status}).`);
  }

  async writePermissionProfile(input: ToolHivePermissionProfileWriteInput): Promise<ToolHivePermissionProfileWriteResult> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
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
    assertSafeWorkloadName(workloadName);
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

  async runRegistryServer(input: ToolHiveRunRegistryServerInput): Promise<ToolHiveCommandResult> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      assertSafeServerArg(arg);
    }
    const volumes = input.volumes ?? [];
    const runVolumes = await prepareToolHiveRunVolumes(volumes);
    await this.ensureAmbientGroup();
    const profile = await this.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    const args = [
      "run",
      "--name",
      input.workloadName,
      "--group",
      TOOLHIVE_AMBIENT_GROUP,
      "--isolate-network",
      "--permission-profile",
      profile.path,
      "--label",
      `ambient.serverId=${toolHiveLabelValue(input.serverId)}`,
    ];
    if (input.transport) args.push("--transport", input.transport);
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    appendImageVerificationArgs(args, input.imageVerificationPolicy);
    for (const volume of runVolumes) {
      args.push("--volume", toolHiveRunVolumeArg(volume));
    }
    const secretDelivery = await this.prepareSecretRuntimeDelivery(input.workloadName, input.secretBindings ?? [], ["container-env-file"]);
    args.push(...secretDelivery.args);
    args.push(input.serverId);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    try {
      const result = await this.runAllowed("run-registry", args, { timeoutMs: Math.max(this.timeoutMs(), 120_000) });
      await this.upsertInstalledServer({
        serverId: input.serverId,
        workloadName: input.workloadName,
        registrySource: input.registrySource,
        ...(input.sourceIdentity ? { sourceIdentity: input.sourceIdentity } : {}),
        ...(input.defaultCatalogDescriptorHash ? { defaultCatalogDescriptorHash: input.defaultCatalogDescriptorHash } : {}),
        ...(input.defaultCatalogReviewedAt ? { defaultCatalogReviewedAt: input.defaultCatalogReviewedAt } : {}),
        ...(input.installReview ? { installReview: input.installReview } : {}),
        ...(input.secretBindings ? { secretBindings: input.secretBindings } : {}),
        ...(input.imageVerificationPolicy ? { imageVerificationPolicy: input.imageVerificationPolicy } : {}),
        ...(volumes.length ? { runtimeVolumes: volumes } : {}),
        permissionProfilePath: profile.path,
        permissionProfileSha256: profile.sha256,
        installValidationStatus: "validation_pending",
        lastRunCommand: args,
      });
      return result;
    } finally {
      await cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async runStandardMcpImport(input: ToolHiveRunStandardMcpImportInput): Promise<ToolHiveCommandResult> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
    assertSafeToolHiveRunSource(input.sourceRef);
    if (input.runtimeImage) assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      assertSafeServerArg(arg);
    }
    const volumes = input.volumes ?? [];
    const runVolumes = await prepareToolHiveRunVolumes(volumes);
    await this.ensureAmbientGroup();
    const profile = await this.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    const args = [
      "run",
      "--name",
      input.workloadName,
      "--group",
      TOOLHIVE_AMBIENT_GROUP,
      "--isolate-network",
      "--permission-profile",
      profile.path,
      "--label",
      `ambient.serverId=${toolHiveLabelValue(input.serverId)}`,
      "--label",
      `ambient.importSource=${toolHiveLabelValue(input.registrySource ?? "standard-mcp-import")}`,
    ];
    if (input.transport) args.push("--transport", input.transport);
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    appendImageVerificationArgs(args, input.imageVerificationPolicy);
    if (input.runtimeImage) args.push("--runtime-image", input.runtimeImage);
    for (const volume of runVolumes) {
      args.push("--volume", toolHiveRunVolumeArg(volume));
    }
    const secretDelivery = await this.prepareSecretRuntimeDelivery(input.workloadName, input.secretBindings ?? [], ["container-env-file"], input.envVars ?? []);
    args.push(...secretDelivery.args);
    args.push(input.sourceRef);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    try {
      const result = await this.runAllowedWithProgress("run-import", args, {
        timeoutMs: Math.max(this.timeoutMs(), 120_000),
        throwOnNonZero: false,
        onProgress: input.onProgress,
        workloadName: input.workloadName,
        phase: "toolhive-run",
        message: `Starting ToolHive Standard MCP workload ${input.workloadName}.`,
      });
      if (result.exitCode !== 0) {
        if (!isExistingWorkloadConflict(result, input.workloadName)) {
          const failure = formatToolHiveRunImportFailure(result);
          await this.markInstalledServerValidationFailedIfPresent(input.workloadName, failure);
          throw new Error(failure);
        }
        emitToolHiveProgress(input.onProgress, {
          phase: "same-name-conflict",
          status: "running",
          workloadName: input.workloadName,
          message: `ToolHive reported existing workload ${input.workloadName}; inspecting whether Ambient can adopt or replace it.`,
        });
        const workload = await this.waitForAmbientWorkload(input.workloadName, { timeoutMs: 30_000 });
        const adoptable = isAdoptableStandardMcpImportWorkload(workload, input);
        if (!adoptable && !isReplaceableSameNameStandardMcpImportConflict(workload, input)) {
          throw new Error(`ToolHive workload ${input.workloadName} already exists but does not match the expected Ambient import source.`);
        }
        if (!adoptable || !(await this.canAdoptStandardMcpImportRuntime(input, volumes, profile.sha256))) {
          await this.removeStandardMcpImportWorkloadForReinstall(input.workloadName, input.onProgress);
          const retry = await this.runAllowedWithProgress("run-import", args, {
            timeoutMs: Math.max(this.timeoutMs(), 120_000),
            throwOnNonZero: false,
            onProgress: input.onProgress,
            workloadName: input.workloadName,
            phase: "toolhive-rerun",
            message: `Recreating ToolHive Standard MCP workload ${input.workloadName}.`,
          });
          if (retry.exitCode !== 0) {
            const failure = formatToolHiveRunImportFailure(retry);
            await this.markInstalledServerValidationFailedIfPresent(input.workloadName, failure);
            throw new Error(failure);
          }
          emitToolHiveProgress(input.onProgress, {
            phase: "persist-state",
            status: "running",
            workloadName: input.workloadName,
            message: `Recording Ambient install state for ToolHive workload ${input.workloadName}.`,
          });
          await this.persistStandardMcpImportState(input, profile, { lastRunCommand: args });
          return {
            ...retry,
            stdout: [
              retry.stdout.trim(),
              adoptable
                ? `Replaced stale ToolHive workload ${input.workloadName} to apply Ambient runtime volumes.`
                : `Replaced same-name ToolHive workload ${input.workloadName} to apply reviewed Ambient Standard MCP import metadata.`,
            ].filter(Boolean).join("\n"),
            exitCode: 0,
          };
        }
        emitToolHiveProgress(input.onProgress, {
          phase: "persist-state",
          status: "running",
          workloadName: input.workloadName,
          message: `Recording adopted ToolHive workload ${input.workloadName}.`,
        });
        await this.persistStandardMcpImportState(input, profile, { endpoint: workload.endpoint, lastRunCommand: args });
        return {
          ...result,
          stdout: [result.stdout.trim(), `Adopted existing ToolHive workload ${input.workloadName}.`].filter(Boolean).join("\n"),
          exitCode: 0,
        };
      }
      emitToolHiveProgress(input.onProgress, {
        phase: "persist-state",
        status: "running",
        workloadName: input.workloadName,
        message: `Recording Ambient install state for ToolHive workload ${input.workloadName}.`,
      });
      await this.persistStandardMcpImportState(input, profile, { lastRunCommand: args });
      return result;
    } finally {
      await cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async adoptExistingStandardMcpImportWorkload(input: ToolHiveAdoptStandardMcpImportWorkloadInput): Promise<ToolHiveWorkloadSummary | undefined> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
    assertSafeToolHiveRunSource(input.sourceRef);
    if (input.runtimeImage) assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      assertSafeServerArg(arg);
    }
    await prepareToolHiveRunVolumes(input.volumes ?? []);

    const workload = (await this.listAmbientWorkloadSummaries({ all: true }))
      .find((candidate) => candidate.name === input.workloadName);
    if (!workload || !isReadyToolHiveWorkload(workload) || !isAdoptableStandardMcpImportWorkload(workload, input)) {
      return undefined;
    }
    const profile = await this.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    await this.persistStandardMcpImportState(input, profile, {
      endpoint: workload.endpoint ?? input.endpoint,
      lastRunCommand: [
        "adopt-existing",
        input.workloadName,
        input.sourceRef,
      ],
    });
    return workload;
  }

  async runRemoteMcpProxy(input: ToolHiveRunRemoteMcpProxyInput): Promise<ToolHiveCommandResult> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
    assertSafeRemoteMcpUrl(input.remoteUrl);
    await this.ensureAmbientGroup();
    const profile = await this.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    const args = [
      "run",
      "--name",
      input.workloadName,
      "--group",
      TOOLHIVE_AMBIENT_GROUP,
      "--isolate-network",
      "--permission-profile",
      profile.path,
      "--label",
      `ambient.serverId=${toolHiveLabelValue(input.serverId)}`,
      "--label",
      `ambient.importSource=${toolHiveLabelValue(input.registrySource ?? "remote-mcp-proxy")}`,
      "--transport",
      input.transport,
    ];
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    const secretDelivery = await this.prepareSecretRuntimeDelivery(input.workloadName, input.secretBindings ?? [], ["remote-bearer-token-file"]);
    args.push(...secretDelivery.args);
    args.push(input.remoteUrl);
    try {
      const result = await this.runAllowed("run-remote", args, { timeoutMs: Math.max(this.timeoutMs(), 120_000) });
      await this.upsertInstalledServer({
        serverId: input.serverId,
        workloadName: input.workloadName,
        registrySource: input.registrySource ?? "remote-mcp-proxy",
        ...(input.sourceIdentity ? { sourceIdentity: input.sourceIdentity } : {}),
        ...(input.installReview ? { installReview: input.installReview } : {}),
        ...(input.secretBindings ? { secretBindings: input.secretBindings } : {}),
        permissionProfilePath: profile.path,
        permissionProfileSha256: profile.sha256,
        installValidationStatus: "validation_pending",
        lastRunCommand: args,
      });
      return result;
    } finally {
      await cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async registerGuidedLocalBridge(input: ToolHiveRegisterGuidedLocalBridgeInput): Promise<ToolHiveInstalledServerState> {
    assertSafeToolHiveRef(input.serverId, "serverId");
    assertSafeWorkloadName(input.workloadName);
    assertSafeLoopbackMcpEndpoint(input.endpoint);
    const profile = await this.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    await this.upsertInstalledServer({
      serverId: input.serverId,
      workloadName: input.workloadName,
      endpoint: input.endpoint,
      registrySource: input.registrySource ?? "guided-local-bridge",
      ...(input.sourceIdentity ? { sourceIdentity: input.sourceIdentity } : {}),
      ...(input.installReview ? { installReview: input.installReview } : {}),
      ...(input.secretBindings ? { secretBindings: input.secretBindings } : {}),
      permissionProfilePath: profile.path,
      permissionProfileSha256: profile.sha256,
      installValidationStatus: "validation_pending",
    });
    const state = await this.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === input.workloadName);
    if (!server) throw new Error(`Failed to register guided local bridge ${input.workloadName}.`);
    return server;
  }

  async stopWorkload(workloadName: string, timeoutSeconds = 30): Promise<ToolHiveCommandResult> {
    assertSafeWorkloadName(workloadName);
    const timeout = Math.max(1, Math.min(300, Math.floor(timeoutSeconds)));
    return this.runAllowed("stop", ["stop", workloadName, "--timeout", String(timeout)]);
  }

  async removeWorkload(workloadName: string): Promise<ToolHiveCommandResult> {
    assertSafeWorkloadName(workloadName);
    const result = await this.runAllowed("rm", ["rm", workloadName]);
    if (result.exitCode === 0) await this.removeInstalledServer(workloadName);
    return result;
  }

  async removeInstalledServerState(workloadName: string): Promise<void> {
    assertSafeWorkloadName(workloadName);
    await this.removeInstalledServer(workloadName);
  }

  async readWorkloadLogs(workloadName: string, lines = 80): Promise<ToolHiveCommandResult> {
    assertSafeWorkloadName(workloadName);
    const tail = Math.max(1, Math.min(500, Math.floor(lines)));
    const result = await this.runAllowed("logs", ["logs", workloadName, "--tail", String(tail)], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.timeoutMs(), 15_000),
    });
    if (result.exitCode === 0 || !toolHiveLogsTailFlagUnsupported(result)) return result;
    const fallback = await this.runAllowed("logs", ["logs", workloadName], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.timeoutMs(), 15_000),
    });
    return {
      ...fallback,
      stdout: tailTextLines(fallback.stdout, tail),
      stderr: tailTextLines(fallback.stderr, tail),
    };
  }

  async snapshotInstalledServerToolDescriptors(workloadName: string, descriptors: unknown[]): Promise<ToolHiveToolDescriptorSnapshotResult> {
    assertSafeWorkloadName(workloadName);
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
    assertSafeWorkloadName(workloadName);
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
    assertSafeWorkloadName(input.workloadName);
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
    assertSafeWorkloadName(input.workloadName);
    if (input.endpoint) assertSafeLoopbackMcpEndpoint(input.endpoint);
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
    assertSafeWorkloadName(input.workloadName);
    assertSafeAutowireRevisionId(input.activeRevisionId);
    if (input.candidateRef) assertSafeAutowireCandidateRef(input.candidateRef);
    if (input.candidateHash) assertSafeSha256(input.candidateHash, "candidateHash");
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
    assertSafeWorkloadName(workloadName);
    assertSafeMcpToolName(toolName);
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

  async containerRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    const dockerConfig = await this.ensureAmbientDockerConfig();
    return ambientRuntimeEnv(this.options.env ?? process.env, {
      TOOLHIVE_NO_TELEMETRY: "1",
      DOCKER_CONFIG: dockerConfig,
    });
  }

  private async upsertInstalledServer(input: Omit<ToolHiveInstalledServerState, "createdAt" | "updatedAt">): Promise<void> {
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

  private async persistStandardMcpImportState(
    input: ToolHiveRunStandardMcpImportInput,
    profile: ToolHivePermissionProfileWriteResult,
    options: { endpoint?: string; lastRunCommand?: string[] } = {},
  ): Promise<void> {
    const managedFileExchange = managedFileExchangeFromVolumes(input.volumes);
    await this.upsertInstalledServer({
      serverId: input.serverId,
      workloadName: input.workloadName,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      registrySource: input.registrySource ?? "standard-mcp-import",
      ...(input.sourceIdentity ? { sourceIdentity: input.sourceIdentity } : {}),
      ...(input.defaultCatalogDescriptorHash ? { defaultCatalogDescriptorHash: input.defaultCatalogDescriptorHash } : {}),
      ...(input.defaultCatalogReviewedAt ? { defaultCatalogReviewedAt: input.defaultCatalogReviewedAt } : {}),
      ...(input.installReview ? { installReview: input.installReview } : {}),
      ...(input.secretBindings ? { secretBindings: input.secretBindings } : {}),
      ...(input.imageVerificationPolicy ? { imageVerificationPolicy: input.imageVerificationPolicy } : {}),
      ...(input.volumes?.length ? { runtimeVolumes: input.volumes } : {}),
      ...(managedFileExchange ? { managedFileExchange } : {}),
      permissionProfilePath: profile.path,
      permissionProfileSha256: profile.sha256,
      installValidationStatus: "validation_pending",
      ...(options.lastRunCommand ? { lastRunCommand: options.lastRunCommand } : {}),
    });
  }

  private async canAdoptStandardMcpImportRuntime(input: ToolHiveRunStandardMcpImportInput, volumes: ToolHiveRunVolume[], permissionProfileSha256: string): Promise<boolean> {
    const state = await this.readState();
    const existing = state.installedServers.find((server) => server.workloadName === input.workloadName);
    return Boolean(
      existing &&
      isAmbientOwnedStandardMcpImportState(existing, input) &&
      existing.permissionProfileSha256 === permissionProfileSha256 &&
      toolHiveRunVolumesEqual(existing.runtimeVolumes ?? [], volumes)
    );
  }

  private async markInstalledServerValidationFailedIfPresent(workloadName: string, error: string): Promise<void> {
    await this.updateInstalledServerInstallValidation({
      workloadName,
      status: "validation_failed",
      error,
    }).catch(() => undefined);
  }

  private async removeStandardMcpImportWorkloadForReinstall(
    workloadName: string,
    onProgress?: (progress: ToolHiveOperationProgress) => void,
  ): Promise<void> {
    await this.runAllowedWithProgress("stop", ["stop", workloadName, "--timeout", "30"], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.timeoutMs(), 35_000),
      onProgress,
      workloadName,
      phase: "toolhive-stop-existing",
      message: `Stopping existing ToolHive workload ${workloadName} before reinstall.`,
    });
    const remove = await this.runAllowedWithProgress("rm", ["rm", workloadName], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.timeoutMs(), 30_000),
      onProgress,
      workloadName,
      phase: "toolhive-remove-existing",
      message: `Removing existing ToolHive workload ${workloadName} before reinstall.`,
    });
    if (remove.exitCode !== 0 && !isMissingWorkloadRemoval(remove)) {
      throw new Error(`ToolHive workload ${workloadName} has stale Ambient runtime volumes, but ToolHive could not remove it for reinstall: ${redactToolHiveText(remove.stderr || remove.stdout)}`);
    }
  }

  private async removeInstalledServer(workloadName: string): Promise<void> {
    const state = await this.readState();
    state.installedServers = state.installedServers.filter((server) => server.workloadName !== workloadName);
    await this.writeState(state);
  }

  private async prepareSecretRuntimeDelivery(
    workloadName: string,
    secretBindings: ToolHiveSecretBindingState[],
    allowedKinds: ToolHiveSecretDerivedBindingKind[],
    plainEnvVars: ToolHivePlainEnvVar[] = [],
  ): Promise<{ args: string[]; cleanupPaths: string[] }> {
    const derivedBindings = secretBindings.flatMap((binding) => (binding.derivedBindings ?? []).map((derived) => ({ binding, derived })));
    if (!derivedBindings.length && !plainEnvVars.length) return { args: [], cleanupPaths: [] };

    const envEntries: Array<{ name: string; value: string }> = [];
    const bearerTokenEntries: Array<{ name: string; value: string }> = [];
    for (const entry of plainEnvVars) {
      assertSafeEnvName(entry.name);
      assertSafePlainEnvDeliveryValue(entry.value);
      envEntries.push({ name: entry.name, value: entry.value });
    }
    for (const { binding, derived } of derivedBindings) {
      if (binding.envName !== derived.envName || binding.secretRef !== derived.secretRef) {
        throw new Error(`Secret binding ${binding.envName} has inconsistent derived runtime binding metadata.`);
      }
      if (!allowedKinds.includes(derived.kind)) {
        throw new Error(`Secret binding ${binding.envName} uses unsupported runtime delivery ${derived.kind} for this ToolHive run path.`);
      }
      const secretValue = await readSecretReference(derived.secretRef);
      if (secretValue === undefined) throw new Error(`Ambient secret reference for ${derived.envName} was not found.`);
      assertSafeSecretDeliveryValue(secretValue);
      if (derived.kind === "container-env-file") {
        assertSafeEnvName(derived.runtimeName);
        envEntries.push({ name: derived.runtimeName, value: secretValue });
      } else if (derived.kind === "remote-bearer-token-file") {
        if (derived.runtimeName.toLowerCase() !== "authorization") {
          throw new Error(`Remote bearer-token delivery only supports Authorization, got ${derived.runtimeName}.`);
        }
        const tokenValue = normalizedBearerToken(secretValue);
        if (!tokenValue) throw new Error(`Ambient secret reference for ${derived.envName} did not contain a bearer token value.`);
        bearerTokenEntries.push({ name: derived.envName, value: tokenValue });
      }
    }

    if (bearerTokenEntries.length > 1) {
      throw new Error("Remote MCP proxy can bind only one bearer token secret in this ToolHive run path.");
    }

    const args: string[] = [];
    const cleanupPaths: string[] = [];
    const root = join(this.stateRoot(), "runtime-secret-bindings");
    await mkdir(root, { recursive: true, mode: 0o700 });

    if (envEntries.length) {
      const body = `${envEntries.map((entry) => `${entry.name}=${entry.value}`).join("\n")}\n`;
      const path = join(root, `${safeFileSegment(workloadName)}-${sha256Hex(body).slice(0, 12)}.env`);
      await writeRuntimeSecretFile(path, body);
      args.push("--env-file", path);
      cleanupPaths.push(path);
    }

    if (bearerTokenEntries.length) {
      const entry = bearerTokenEntries[0];
      const body = `${entry.value}\n`;
      const path = join(root, `${safeFileSegment(workloadName)}-${sha256Hex(`${entry.name}\0${body}`).slice(0, 12)}.token`);
      await writeRuntimeSecretFile(path, body);
      args.push("--remote-auth", "--remote-auth-bearer-token-file", path);
      cleanupPaths.push(path);
    }

    return { args, cleanupPaths };
  }

  private async runAllowed(command: ToolHiveAllowedCommand, args: string[], options: { throwOnNonZero?: boolean; timeoutMs?: number } = {}): Promise<ToolHiveCommandResult> {
    assertAllowedCommandShape(command, args);
    const startedAt = Date.now();
    const executablePath = (await resolveOrExtractToolHiveExecutable({
      ...this.options,
      env: this.options.env ?? process.env,
      extractionRoot: join(this.options.userDataPath, "mcp", "toolhive", "bundle"),
    })).executablePath;
    const executor = this.options.executor ?? defaultExecutor;
    const result = await executor({
      executablePath,
      args,
      cwd: this.options.cwd ?? process.cwd(),
      env: await this.containerRuntimeEnv(),
      timeoutMs: options.timeoutMs ?? this.timeoutMs(),
    });
    const commandResult: ToolHiveCommandResult = {
      command,
      args,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
    };
    if (result.exitCode !== 0 && options.throwOnNonZero !== false) {
      throw new Error(`ToolHive ${command} failed with exit code ${result.exitCode}: ${redactToolHiveText(result.stderr || result.stdout)}`);
    }
    return commandResult;
  }

  private timeoutMs(): number {
    return Math.max(1, Math.floor(this.options.timeoutMs ?? defaultTimeoutMs));
  }

  private async runAllowedWithProgress(
    command: ToolHiveAllowedCommand,
    args: string[],
    options: {
      throwOnNonZero?: boolean;
      timeoutMs?: number;
      onProgress?: (progress: ToolHiveOperationProgress) => void;
      workloadName?: string;
      phase: string;
      message: string;
    },
  ): Promise<ToolHiveCommandResult> {
    const startedAt = Date.now();
    const emit = (status: ToolHiveOperationProgress["status"], message = options.message) => {
      emitToolHiveProgress(options.onProgress, {
        phase: options.phase,
        status,
        message,
        command,
        workloadName: options.workloadName,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      });
    };
    emit("running");
    const heartbeat = setInterval(() => {
      emit("running", `${options.message} (${formatElapsedMs(Date.now() - startedAt)} elapsed).`);
    }, 5_000);
    heartbeat.unref?.();
    try {
      const result = await this.runAllowed(command, args, options);
      emit("complete", `ToolHive ${command} completed for ${options.workloadName ?? "workload"} in ${formatElapsedMs(Date.now() - startedAt)}.`);
      return result;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async ensureAmbientDockerConfig(): Promise<string> {
    const root = join(this.stateRoot(), "docker-config");
    await mkdir(root, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700).catch(() => undefined);
    const configPath = join(root, "config.json");
    await writeFile(configPath, `${JSON.stringify({})}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(configPath, 0o600).catch(() => undefined);
    return root;
  }

  private nowIso(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function assertAllowedCommandShape(command: ToolHiveAllowedCommand, args: string[]): void {
  const twoPartCommands: ToolHiveAllowedCommand[] = ["group-list", "group-create", "registry-list", "registry-info", "runtime-check"];
  const commandPrefix = args.slice(0, twoPartCommands.includes(command) ? 2 : 1).join(" ");
  const allowed: Record<ToolHiveAllowedCommand, string> = {
    version: "version",
    build: "build",
    "group-list": "group list",
    "group-create": "group create",
    "registry-list": "registry list",
    "registry-info": "registry info",
    "runtime-check": "runtime check",
    "run-registry": "run",
    "run-import": "run",
    "run-remote": "run",
    list: "list",
    logs: "logs",
    stop: "stop",
    rm: "rm",
  };
  if (commandPrefix !== allowed[command]) throw new Error(`ToolHive command ${command} attempted unexpected argv: ${args.join(" ")}`);
  if (args.some((arg) => arg.includes("\0"))) throw new Error("ToolHive command arguments cannot contain NUL bytes.");
}

function appendImageVerificationArgs(args: string[], policy?: ToolHiveImageVerificationPolicy): void {
  const mode = toolHiveImageVerificationMode(policy);
  if (mode) args.push("--image-verification", mode);
}

function toolHiveImageVerificationMode(policy?: ToolHiveImageVerificationPolicy): string | undefined {
  if (!policy || policy === "strict") return undefined;
  if (policy === "ambient-reviewed" || policy === "disabled") return "disabled";
  return policy;
}

async function defaultExecutor(invocation: ToolHiveCommandInvocation): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(invocation.executablePath, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      encoding: "utf8",
      timeout: invocation.timeoutMs,
      maxBuffer: maxOutputBufferBytes,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const stdout = execErrorText(error, "stdout");
    const rawStderr = execErrorText(error, "stderr");
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout,
      stderr: rawStderr || message,
      exitCode: execErrorExitCode(error),
    };
  }
}

function execErrorText(error: unknown, key: "stdout" | "stderr"): string {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function execErrorExitCode(error: unknown): number {
  if (!error || typeof error !== "object") return 1;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (typeof record.signal === "string" || record.killed === true) return 124;
  return 1;
}

function parseJsonOutput(stdout: string, label: string): unknown {
  const normalized = normalizeToolHiveJsonOutput(stdout);
  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeToolHiveJsonOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const lines = stdout.split(/\r?\n/);
  const jsonStart = lines.findIndex((line) => {
    const value = line.trimStart();
    return value.startsWith("{") || value.startsWith("[");
  });
  return jsonStart >= 0 ? lines.slice(jsonStart).join("\n").trim() : trimmed;
}

function parseToolHiveGroupList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "NAME")
    .filter((line) => !line.startsWith("A new version of ToolHive is available:"))
    .filter((line) => !line.startsWith("Currently running:"));
}

export function toolHiveWorkloadEndpoint(workload: unknown): string | undefined {
  const direct = stringField(workload, [
    "endpoint",
    "url",
    "proxy_url",
    "proxyUrl",
    "mcp_url",
    "mcpUrl",
    "sse_url",
    "sseUrl",
    "streamable_http_url",
    "streamableHttpUrl",
  ]);
  if (direct) return direct;
  if (!isRecord(workload)) return undefined;
  const endpoints = workload.endpoints;
  if (Array.isArray(endpoints)) {
    for (const endpoint of endpoints) {
      const value = typeof endpoint === "string" ? endpoint : stringField(endpoint, ["url", "endpoint", "proxyUrl", "proxy_url"]);
      if (value) return value;
    }
  }
  const ports = workload.ports;
  if (Array.isArray(ports)) {
    for (const port of ports) {
      if (!isRecord(port)) continue;
      const host = stringField(port, ["host", "hostIp", "host_ip"]) ?? "127.0.0.1";
      const hostPort = numberField(port, ["hostPort", "host_port", "publishedPort", "published_port", "port"]);
      if (hostPort) return `http://${host}:${hostPort}/mcp`;
    }
  }
  return undefined;
}

function isExistingWorkloadConflict(result: ToolHiveCommandResult, workloadName: string): boolean {
  const output = `${result.stderr}\n${result.stdout}`;
  return new RegExp(`workload\\s+with\\s+name\\s+['"]?${escapeRegExp(workloadName)}['"]?\\s+already\\s+exists`, "i").test(output);
}

function isAdoptableStandardMcpImportWorkload(
  workload: ToolHiveWorkloadSummary,
  input: Pick<ToolHiveRunStandardMcpImportInput, "serverId" | "sourceRef" | "registrySource">,
): boolean {
  if (!workload.endpoint) return false;
  const packageRef = stringField(workload.raw, ["package", "image", "source", "sourceRef", "package_ref"]);
  if (!isAdoptableStandardMcpPackageRef(packageRef, input.sourceRef, input.registrySource)) return false;
  const labels = isRecord(workload.raw) && isRecord(workload.raw.labels) ? workload.raw.labels : undefined;
  if (!labels) return false;
  const serverId = typeof labels["ambient.serverId"] === "string" ? labels["ambient.serverId"] : undefined;
  const importSource = typeof labels["ambient.importSource"] === "string" ? labels["ambient.importSource"] : undefined;
  return serverId === toolHiveLabelValue(input.serverId) && importSource === toolHiveLabelValue(input.registrySource ?? "standard-mcp-import");
}

function isReplaceableSameNameStandardMcpImportConflict(
  workload: ToolHiveWorkloadSummary,
  input: Pick<ToolHiveRunStandardMcpImportInput, "workloadName" | "sourceRef" | "registrySource">,
): boolean {
  if (workload.name !== input.workloadName) return false;
  if (!input.workloadName.startsWith("ambient-") || !input.workloadName.includes("-standard-mcp")) return false;
  const packageRef = stringField(workload.raw, ["package", "image", "source", "sourceRef", "package_ref"]);
  return !packageRef || isAdoptableStandardMcpPackageRef(packageRef, input.sourceRef, input.registrySource);
}

function isAdoptableStandardMcpPackageRef(packageRef: string | undefined, sourceRef: string, registrySource: string | undefined): boolean {
  return Boolean(
    packageRef &&
    (sameToolHiveRunPackageRef(packageRef, sourceRef) ||
      isToolHiveLocalBuiltPackageRef(packageRef, sourceRef) ||
      isAdoptableDefaultOciImageRef(packageRef, sourceRef, registrySource))
  );
}

function sameToolHiveRunPackageRef(left: string, right: string): boolean {
  if (left === right) return true;
  const normalizedLeft = normalizedToolHivePackageRef(left);
  const normalizedRight = normalizedToolHivePackageRef(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizedToolHivePackageRef(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withoutScheme = trimmed
    .replace(/^(?:npx|uvx):\/\//i, "")
    .replace(/^npm:\/\//i, "")
    .replace(/^npm:/i, "");
  return withoutScheme || undefined;
}

function isToolHiveLocalBuiltPackageRef(packageRef: string, sourceRef: string): boolean {
  const match = /^docker\.io\/toolhivelocal\/([^:]+)(?::[^/]+)?$/i.exec(packageRef.trim());
  const expectedSlug = toolHiveLocalBuildSlugForRunSource(sourceRef);
  return Boolean(match?.[1] && expectedSlug && match[1] === expectedSlug);
}

function toolHiveLocalBuildSlugForRunSource(sourceRef: string): string | undefined {
  const match = /^(npx|uvx):\/\/(.+)$/i.exec(sourceRef.trim());
  if (!match) return undefined;
  const packageName = match[2]?.trim();
  if (!packageName) return undefined;
  const packageSlug = packageName
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return packageSlug ? `${match[1]!.toLowerCase()}-${packageSlug}` : undefined;
}

function isAmbientOwnedStandardMcpImportState(
  server: ToolHiveInstalledServerState,
  input: Pick<ToolHiveRunStandardMcpImportInput, "serverId" | "sourceRef" | "registrySource">,
): boolean {
  if (server.serverId !== input.serverId) return false;
  if ((server.registrySource ?? "standard-mcp-import") !== (input.registrySource ?? "standard-mcp-import")) return false;
  if (server.sourceIdentity?.runtimeLane && server.sourceIdentity.runtimeLane !== "standard-mcp-import" && server.sourceIdentity.runtimeLane !== "ambient-default-oci") {
    return false;
  }
  const previousSource = server.sourceIdentity?.toolHiveRunSource;
  return !previousSource || previousSource === input.sourceRef || isAdoptableDefaultOciImageRef(previousSource, input.sourceRef, input.registrySource);
}

function toolHiveRunVolumesEqual(left: ToolHiveRunVolume[], right: ToolHiveRunVolume[]): boolean {
  if (left.length !== right.length) return false;
  return stableRunVolumes(left) === stableRunVolumes(right);
}

function toolHiveRunVolumeArg(volume: ToolHiveRunVolume): string {
  const base = `${volume.hostPath}:${volume.containerPath}`;
  return volume.mode === "ro" ? `${base}:ro` : base;
}

function stableRunVolumes(volumes: ToolHiveRunVolume[]): string {
  return JSON.stringify(volumes
    .map((volume) => ({
      hostPath: volume.hostPath.replace(/\/+$/, "") || "/",
      containerPath: volume.containerPath.replace(/\/+$/, "") || "/",
      mode: volume.mode,
      purpose: volume.purpose ?? "",
    }))
    .sort((left, right) => `${left.containerPath}\0${left.hostPath}\0${left.mode}\0${left.purpose}`
      .localeCompare(`${right.containerPath}\0${right.hostPath}\0${right.mode}\0${right.purpose}`)));
}

function isMissingWorkloadRemoval(result: ToolHiveCommandResult): boolean {
  const output = `${result.stderr}\n${result.stdout}`;
  return /\b(?:not found|no such workload|does not exist|unknown workload)\b/i.test(output);
}

function isAdoptableDefaultOciImageRef(packageRef: string | undefined, sourceRef: string, registrySource: string | undefined): boolean {
  if (registrySource !== "ambient-default-oci" || !packageRef) return false;
  const workloadImage = ociImageRepositoryAndDigest(packageRef);
  const expectedImage = ociImageRepositoryAndDigest(sourceRef);
  return Boolean(workloadImage && expectedImage && workloadImage.repository === expectedImage.repository);
}

function ociImageRepositoryAndDigest(ref: string): { repository: string; digest: string } | undefined {
  const match = /^([^@]+)@sha256:([a-f0-9]{64})$/i.exec(ref.trim());
  if (!match?.[1] || !match[2]) return undefined;
  return { repository: match[1].toLowerCase(), digest: `sha256:${match[2].toLowerCase()}` };
}

function isReadyToolHiveWorkload(workload: ToolHiveWorkloadSummary): boolean {
  const status = workload.status?.trim().toLowerCase();
  return Boolean(workload.endpoint) && (!status || status === "running" || status === "started" || status === "healthy");
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberField(value: unknown, keys: string[]): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) return Math.floor(entry);
    if (typeof entry === "string" && /^\d+$/.test(entry)) return Number(entry);
  }
  return undefined;
}

function assertSafeToolHiveRef(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(value)) {
    throw new Error(`Invalid ToolHive ${label}: ${value}`);
  }
  if (value.includes("://") || value.startsWith("./") || value.startsWith("../")) {
    throw new Error(`ToolHive ${label} must be a registry/server identifier in this runtime path: ${value}`);
  }
}

function assertSafeToolHiveRunSource(value: string): void {
  if (value.length > 512 || value.includes("\0") || looksSecretLike(value)) {
    throw new Error("ToolHive run source must be a bounded non-secret reference.");
  }
  if (value.startsWith("-") || value.startsWith("./") || value.startsWith("../")) {
    throw new Error(`ToolHive run source cannot be a flag or local path: ${value}`);
  }
  if (/^uvx:\/\//.test(value)) {
    if (!/^uvx:\/\/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}(@[A-Za-z0-9][A-Za-z0-9_.-]{0,127})?$/.test(value)) {
      throw new Error(`Invalid ToolHive uvx package source: ${value}`);
    }
    return;
  }
  if (/^npx:\/\//.test(value)) {
    if (!/^npx:\/\/(?:@[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\/)?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}(@[A-Za-z0-9][A-Za-z0-9_.-]{0,127})?$/.test(value)) {
      throw new Error(`Invalid ToolHive npx package source: ${value}`);
    }
    return;
  }
  if (value.includes("://")) throw new Error(`Unsupported ToolHive run source protocol: ${value}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(value)) {
    throw new Error(`Invalid ToolHive image source: ${value}`);
  }
}

function assertSafeToolHiveRuntimeImage(value: string): void {
  if (value.length > 512 || value.includes("\0") || looksSecretLike(value)) {
    throw new Error("ToolHive runtime image must be a bounded non-secret image reference.");
  }
  if (value.startsWith("-") || value.startsWith("./") || value.startsWith("../") || value.includes("://")) {
    throw new Error(`ToolHive runtime image cannot be a flag, local path, or URL: ${value}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(value)) {
    throw new Error(`Invalid ToolHive runtime image reference: ${value}`);
  }
}

function assertSafeToolHiveRunVolume(volume: ToolHiveRunVolume): void {
  assertSafeHostMountPath(volume.hostPath);
  assertSafeContainerMountPath(volume.containerPath);
  if (volume.mode !== "ro" && volume.mode !== "rw") {
    throw new Error(`Invalid ToolHive volume mode: ${volume.mode}`);
  }
}

async function prepareToolHiveRunVolumes(volumes: ToolHiveRunVolume[]): Promise<ToolHiveRunVolume[]> {
  for (const volume of volumes) {
    assertSafeToolHiveRunVolume(volume);
  }
  await ensureManagedRuntimeVolumeDirectories(volumes);
  const prepared = await Promise.all(volumes.map(async (volume) => {
    const hostPath = await canonicalToolHiveHostMountPath(volume.hostPath);
    const normalized = { ...volume, hostPath };
    assertSafeToolHiveRunVolume(normalized);
    return normalized;
  }));
  return prepared;
}

async function canonicalToolHiveHostMountPath(hostPath: string): Promise<string> {
  try {
    return (await realpath(hostPath)).replace(/\/+$/, "") || "/";
  } catch (error) {
    throw new Error(`ToolHive host mount path must exist before install: ${hostPath} (${errorMessage(error)})`);
  }
}

function assertSafeHostMountPath(value: string): void {
  if (
    value.length > 1_000 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    throw new Error("ToolHive host mount paths must be bounded, non-secret, absolute paths without separators unsafe for --volume.");
  }
  if (!value.startsWith("/")) throw new Error(`ToolHive host mount path must be absolute: ${value}`);
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  if (["/", "/Users", "/private", "/tmp", "/var", "/System", "/Library"].includes(normalized)) {
    throw new Error(`ToolHive host mount path is too broad: ${value}`);
  }
  if (normalized.split("/").includes("..")) {
    throw new Error(`ToolHive host mount path cannot contain parent directory segments: ${value}`);
  }
}

function assertSafeContainerMountPath(value: string): void {
  if (
    value.length > 240 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    throw new Error("ToolHive container mount paths must be bounded, non-secret absolute paths.");
  }
  const normalized = value.replace(/\/+$/, "") || "/";
  if (!normalized.startsWith("/") || normalized === "/" || normalized.split("/").includes("..")) {
    throw new Error(`Invalid ToolHive container mount path: ${value}`);
  }
}

function assertSafeRemoteMcpUrl(value: string): void {
  if (value.length > 1_000 || value.includes("\0") || looksSecretLike(value)) {
    throw new Error("Remote MCP URL must be a bounded non-secret HTTPS URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid remote MCP URL: ${value}`);
  }
  if (parsed.protocol !== "https:") throw new Error(`Remote MCP URL must use https: ${value}`);
  if (parsed.username || parsed.password) throw new Error("Remote MCP URL must not contain credentials.");
  if (!parsed.hostname || isLocalRemoteMcpHost(parsed.hostname)) {
    throw new Error(`Remote MCP URL must target a public remote host, not ${parsed.hostname || "an empty host"}.`);
  }
}

function assertSafeLoopbackMcpEndpoint(value: string): void {
  if (value.length > 1_000 || value.includes("\0") || looksSecretLike(value)) {
    throw new Error("Guided local bridge endpoint must be a bounded non-secret URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid guided local bridge endpoint: ${value}`);
  }
  if (parsed.protocol !== "http:") throw new Error(`Guided local bridge endpoint must use http loopback: ${value}`);
  if (parsed.username || parsed.password) throw new Error("Guided local bridge endpoint must not contain credentials.");
  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`Guided local bridge endpoint must target loopback, not ${parsed.hostname}.`);
  }
}

function isLocalRemoteMcpHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost");
}

function assertSafeWorkloadName(value: string): void {
  if (!/^ambient-[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(value)) {
    throw new Error(`Invalid Ambient ToolHive workload name: ${value}`);
  }
}

function assertSafeAutowireRevisionId(value: string): void {
  if (!/^ambient-mcp-revision:[A-Za-z0-9_.:-]{1,240}$/.test(value) || looksSecretLike(value)) {
    throw new Error(`Invalid MCP Autowire revision id: ${value}`);
  }
}

function assertSafeAutowireCandidateRef(value: string): void {
  if (value.length > 320 || value.includes("\0") || /\s/.test(value) || looksSecretLike(value)) {
    throw new Error("MCP Autowire candidate ref must be a bounded non-secret identifier.");
  }
}

function assertSafeSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${label} must be a sha256 hex digest.`);
  }
}

function assertSafeServerArg(value: string): void {
  if (value.length > 512 || value.includes("\0") || looksSecretLike(value)) {
    throw new Error("ToolHive server arguments must be bounded non-secret strings.");
  }
}

function assertSafeMcpToolName(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,255}$/.test(value)) {
    throw new Error(`Invalid MCP tool name: ${value}`);
  }
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

function looksSecretLike(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/i.test(value);
}

function toolHiveLabelValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, ".").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").slice(0, 128) || "mcp-server";
}

function redactToolHiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, "[REDACTED]");
}

function toolHiveLogsTailFlagUnsupported(result: Pick<ToolHiveCommandResult, "stdout" | "stderr">): boolean {
  return /unknown flag:\s*(?:--tail|tail)|unknown shorthand flag|flag provided but not defined/i.test(`${result.stdout}\n${result.stderr}`);
}

function tailTextLines(text: string, lines: number): string {
  if (!text) return text;
  const hadTrailingNewline = /\r?\n$/.test(text);
  const split = text.replace(/\r?\n$/, "").split(/\r?\n/);
  const tailed = split.length <= lines ? split : split.slice(-lines);
  return `${tailed.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}

export function formatToolHiveRunImportFailure(result: Pick<ToolHiveCommandResult, "exitCode" | "stdout" | "stderr">): string {
  const raw = redactToolHiveText(result.stderr || result.stdout);
  const text = raw.toLowerCase();
  const notes: string[] = [];
  if (/new version of toolhive is available/i.test(raw)) {
    notes.push("ToolHive reported that an update is available; this is advisory unless the pull/import error below repeats with the bundled version.");
  }
  if (result.exitCode === 124) {
    notes.push("The ToolHive run command timed out before reporting a ready workload; inspect package startup logs, dependency downloads, or increase the install timeout for slow first-run packages.");
  }
  if (/image verification is disabled/i.test(raw)) {
    notes.push("Image verification was disabled for this Ambient-reviewed default because Ambient owns the pinned descriptor and permission profile.");
  }
  if (/image not found|failed to retrieve or pull image|not found in registry/.test(text)) {
    notes.push("The container runtime could not pull the requested image. If this is a reviewed multi-platform image, Ambient should verify the registry ref and use the platform-specific Linux child manifest for this host.");
  }
  if (/failed to find or create the mcp server|invalid protocol scheme provided for mcp server|failed to build docker image|uv tool install/.test(text)) {
    notes.push("ToolHive could not build or interpret the Standard MCP package source; verify the ToolHive source URI support, package installability inside ToolHive's builder image, and whether the server needs required non-secret runtime environment before marking this candidate ready.");
  }
  if (/no container runtime|runtime unavailable|cannot connect|daemon is not reachable/.test(text)) {
    notes.push("The local Docker/Podman runtime is not reachable; open the desktop runtime, wait until its engine is running, then refresh Ambient.");
  }
  return [
    `ToolHive run-import failed with exit code ${result.exitCode}.`,
    notes.length ? `Actionable diagnosis: ${notes.join(" ")}` : undefined,
    "Do not bypass Ambient's MCP installer with shell, raw ToolHive, direct package-manager, or unmanaged local installs; keep the failure inside the managed ToolHive/autowire path and report the installer error.",
    `Raw ToolHive output: ${raw}`,
  ].filter(Boolean).join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyState(): ToolHiveRuntimeState {
  return { schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION, installedServers: [] };
}

async function writeRuntimeSecretFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

async function cleanupRuntimeSecretFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true }).catch(() => undefined)));
}

async function ensureManagedRuntimeVolumeDirectories(volumes: ToolHiveRunVolume[]): Promise<void> {
  await Promise.all(volumes
    .filter((volume) => volume.purpose === "ambient-mcp-file-exchange")
    .map((volume) => ensureMcpManagedFileExchangeHostPath(volume)));
}

function assertSafeEnvName(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value)) {
    throw new Error(`Invalid runtime environment variable name: ${value}`);
  }
}

function assertSafeSecretDeliveryValue(value: string): void {
  if (!value || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new Error("Ambient secret value cannot be delivered to ToolHive because it is empty or multi-line.");
  }
}

function assertSafePlainEnvDeliveryValue(value: string): void {
  if (!value || value.length > 4_000 || value.includes("\0") || value.includes("\n") || value.includes("\r") || looksSecretLike(value)) {
    throw new Error("Plain MCP runtime environment values must be bounded, non-empty, single-line, and non-secret.");
  }
}

function normalizedBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "toolhive-profile";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function emitToolHiveProgress(
  onProgress: ((progress: ToolHiveOperationProgress) => void) | undefined,
  progress: ToolHiveOperationProgress,
): void {
  if (!onProgress) return;
  try {
    onProgress(progress);
  } catch {
    // Progress observers must not change ToolHive command semantics.
  }
}

function formatElapsedMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function stableToolDescriptorSnapshot(descriptors: unknown[]): unknown[] {
  return descriptors
    .map(sortJsonValue)
    .sort((left, right) => stableDescriptorSortKey(left).localeCompare(stableDescriptorSortKey(right)));
}

function stableDescriptorSortKey(value: unknown): string {
  const name = stringField(value, ["name"]) ?? "";
  return `${name}\0${JSON.stringify(value)}`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJsonValue(entry)]));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
