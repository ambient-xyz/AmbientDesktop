import { realpath } from "node:fs/promises";
import type { ResolveToolHiveExecutableOptions } from "./toolHiveBundle";
import { ensureMcpManagedFileExchangeHostPath, type McpManagedFileExchange } from "./toolRuntimeMcpManagedFileExchangeFacade";
import { ToolHiveStandardMcpImportController } from "./toolHiveStandardMcpImportController";
import { ToolHiveRuntimeEnvironmentOwner, cleanupRuntimeSecretFiles } from "./toolHiveRuntimeEnvironment";
import { looksToolHiveSecretLike as looksSecretLike } from "./toolHiveRuntimeStringGuards";
import {
  TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
  ToolHiveRuntimeStateStore,
  isRecord,
} from "./toolHiveRuntimeStateStore";
import {
  ToolHiveCommandRunner,
  redactToolHiveText,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandResult,
  type ToolHiveOperationProgress,
} from "./toolHiveCommandRunner";

export { TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION };
export type {
  ToolHiveAllowedCommand,
  ToolHiveCommandExecutor,
  ToolHiveCommandInvocation,
  ToolHiveCommandResult,
  ToolHiveOperationProgress,
} from "./toolHiveCommandRunner";
export const TOOLHIVE_AMBIENT_GROUP = "ambient";

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
  private readonly stateStore: ToolHiveRuntimeStateStore;
  private readonly runtimeEnvironment: ToolHiveRuntimeEnvironmentOwner;
  private readonly commandRunner: ToolHiveCommandRunner;
  private readonly standardMcpImportController: ToolHiveStandardMcpImportController;

  constructor(options: ToolHiveRuntimeServiceOptions) {
    if (!options.userDataPath.trim()) throw new Error("ToolHiveRuntimeService requires userDataPath.");
    this.options = options;
    this.stateStore = new ToolHiveRuntimeStateStore({ userDataPath: options.userDataPath, now: options.now });
    this.runtimeEnvironment = new ToolHiveRuntimeEnvironmentOwner({
      env: () => this.options.env ?? process.env,
      stateRoot: () => this.stateRoot(),
    });
    this.commandRunner = new ToolHiveCommandRunner({
      ...options,
      containerRuntimeEnv: () => this.runtimeEnvironment.containerRuntimeEnv(),
    });
    this.standardMcpImportController = new ToolHiveStandardMcpImportController({
      ambientGroup: TOOLHIVE_AMBIENT_GROUP,
      timeoutMs: () => this.commandRunner.timeoutMs(),
      ensureAmbientGroup: () => this.ensureAmbientGroup(),
      writePermissionProfile: (input) => this.writePermissionProfile(input),
      prepareRunVolumes: (volumes) => prepareToolHiveRunVolumes(volumes),
      prepareSecretRuntimeDelivery: (workloadName, secretBindings, allowedKinds, plainEnvVars) =>
        this.runtimeEnvironment.prepareSecretRuntimeDelivery(workloadName, secretBindings, allowedKinds, plainEnvVars),
      cleanupRuntimeSecretFiles: (paths) => cleanupRuntimeSecretFiles(paths),
      runAllowedWithProgress: (command, args, runOptions) => this.commandRunner.runAllowedWithProgress(command, args, runOptions),
      waitForAmbientWorkload: (workloadName, waitOptions) => this.waitForAmbientWorkload(workloadName, waitOptions),
      listAmbientWorkloadSummaries: (listOptions) => this.listAmbientWorkloadSummaries(listOptions),
      readState: () => this.readState(),
      upsertInstalledServer: (input) => this.stateStore.upsertInstalledServer(input),
      updateInstalledServerInstallValidation: (input) => this.updateInstalledServerInstallValidation(input),
      formatRunImportFailure: (result) => formatToolHiveRunImportFailure(result),
      appendImageVerificationArgs: (args, policy) => appendImageVerificationArgs(args, policy),
      toolHiveRunVolumeArg: (volume) => toolHiveRunVolumeArg(volume),
      toolHiveLabelValue: (value) => toolHiveLabelValue(value),
      redactToolHiveText: (value) => redactToolHiveText(value),
      validators: {
        assertSafeToolHiveRef,
        assertSafeWorkloadName,
        assertSafeToolHiveRunSource,
        assertSafeToolHiveRuntimeImage,
        assertSafeServerArg,
      },
    });
  }

  async version(): Promise<ToolHiveCommandResult> {
    return this.commandRunner.runAllowed("version", ["version"]);
  }

  async registryList(options: ToolHiveRegistryListOptions = {}): Promise<unknown[]> {
    const args = ["registry", "list", "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.commandRunner.runAllowed("registry-list", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry list");
    if (!Array.isArray(parsed)) throw new Error("ToolHive registry list returned JSON that is not an array.");
    return parsed;
  }

  async registryInfo(serverId: string, options: ToolHiveRegistryInfoOptions = {}): Promise<Record<string, unknown>> {
    assertSafeToolHiveRef(serverId, "serverId");
    const args = ["registry", "info", serverId, "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.commandRunner.runAllowed("registry-info", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry info");
    if (!isRecord(parsed)) throw new Error("ToolHive registry info returned JSON that is not an object.");
    return parsed;
  }

  async preflightRuntime(timeoutSeconds = 5): Promise<ToolHiveRuntimePreflight> {
    const timeout = Math.max(1, Math.min(60, Math.floor(timeoutSeconds)));
    const command = await this.commandRunner.runAllowed("runtime-check", ["runtime", "check", "--timeout", String(timeout)], { throwOnNonZero: false, timeoutMs: (timeout + 2) * 1000 });
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
    return this.commandRunner.runAllowed("build", args, { timeoutMs: Math.max(this.commandRunner.timeoutMs(), 300_000) });
  }

  async listGroups(): Promise<string[]> {
    const result = await this.commandRunner.runAllowed("group-list", ["group", "list"]);
    return parseToolHiveGroupList(result.stdout);
  }

  async ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined> {
    const groups = await this.listGroups();
    if (groups.includes(TOOLHIVE_AMBIENT_GROUP)) return undefined;
    return this.commandRunner.runAllowed("group-create", ["group", "create", TOOLHIVE_AMBIENT_GROUP]);
  }

  async listWorkloads(options: ToolHiveListWorkloadsOptions = {}): Promise<unknown[]> {
    const args = ["list", "--format", "json"];
    if (options.all) args.push("--all");
    args.push("--group", options.group ?? TOOLHIVE_AMBIENT_GROUP);
    const result = await this.commandRunner.runAllowed("list", args);
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
    return this.stateStore.writePermissionProfile(input);
  }

  async readInstalledServerPermissionProfile(workloadName: string): Promise<ToolHivePermissionProfileReadResult> {
    assertSafeWorkloadName(workloadName);
    return this.stateStore.readInstalledServerPermissionProfile(workloadName);
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
    const secretDelivery = await this.runtimeEnvironment.prepareSecretRuntimeDelivery(
      input.workloadName,
      input.secretBindings ?? [],
      ["container-env-file"],
    );
    args.push(...secretDelivery.args);
    args.push(input.serverId);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    try {
      const result = await this.commandRunner.runAllowed("run-registry", args, { timeoutMs: Math.max(this.commandRunner.timeoutMs(), 120_000) });
      await this.stateStore.upsertInstalledServer({
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
    return this.standardMcpImportController.runStandardMcpImport(input);
  }

  async adoptExistingStandardMcpImportWorkload(input: ToolHiveAdoptStandardMcpImportWorkloadInput): Promise<ToolHiveWorkloadSummary | undefined> {
    return this.standardMcpImportController.adoptExistingStandardMcpImportWorkload(input);
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
    const secretDelivery = await this.runtimeEnvironment.prepareSecretRuntimeDelivery(
      input.workloadName,
      input.secretBindings ?? [],
      ["remote-bearer-token-file"],
    );
    args.push(...secretDelivery.args);
    args.push(input.remoteUrl);
    try {
      const result = await this.commandRunner.runAllowed("run-remote", args, { timeoutMs: Math.max(this.commandRunner.timeoutMs(), 120_000) });
      await this.stateStore.upsertInstalledServer({
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
    await this.stateStore.upsertInstalledServer({
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
    return this.commandRunner.runAllowed("stop", ["stop", workloadName, "--timeout", String(timeout)]);
  }

  async removeWorkload(workloadName: string): Promise<ToolHiveCommandResult> {
    assertSafeWorkloadName(workloadName);
    const result = await this.commandRunner.runAllowed("rm", ["rm", workloadName]);
    if (result.exitCode === 0) await this.stateStore.removeInstalledServer(workloadName);
    return result;
  }

  async removeInstalledServerState(workloadName: string): Promise<void> {
    assertSafeWorkloadName(workloadName);
    await this.stateStore.removeInstalledServer(workloadName);
  }

  async readWorkloadLogs(workloadName: string, lines = 80): Promise<ToolHiveCommandResult> {
    assertSafeWorkloadName(workloadName);
    const tail = Math.max(1, Math.min(500, Math.floor(lines)));
    const result = await this.commandRunner.runAllowed("logs", ["logs", workloadName, "--tail", String(tail)], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.commandRunner.timeoutMs(), 15_000),
    });
    if (result.exitCode === 0 || !toolHiveLogsTailFlagUnsupported(result)) return result;
    const fallback = await this.commandRunner.runAllowed("logs", ["logs", workloadName], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.commandRunner.timeoutMs(), 15_000),
    });
    return {
      ...fallback,
      stdout: tailTextLines(fallback.stdout, tail),
      stderr: tailTextLines(fallback.stderr, tail),
    };
  }

  async snapshotInstalledServerToolDescriptors(workloadName: string, descriptors: unknown[]): Promise<ToolHiveToolDescriptorSnapshotResult> {
    assertSafeWorkloadName(workloadName);
    return this.stateStore.snapshotInstalledServerToolDescriptors(workloadName, descriptors);
  }

  async trustInstalledServerToolDescriptors(workloadName: string, expectedDescriptorHash?: string): Promise<ToolHiveToolDescriptorTrustResult> {
    assertSafeWorkloadName(workloadName);
    return this.stateStore.trustInstalledServerToolDescriptors(workloadName, expectedDescriptorHash);
  }

  async updateInstalledServerInstallValidation(input: {
    workloadName: string;
    status: ToolHiveInstallValidationStatus;
    error?: string;
  }): Promise<ToolHiveInstalledServerState> {
    assertSafeWorkloadName(input.workloadName);
    return this.stateStore.updateInstalledServerInstallValidation(input);
  }

  async updateInstalledServerEndpoint(input: {
    workloadName: string;
    endpoint?: string;
  }): Promise<ToolHiveInstalledServerState> {
    assertSafeWorkloadName(input.workloadName);
    if (input.endpoint) assertSafeLoopbackMcpEndpoint(input.endpoint);
    return this.stateStore.updateInstalledServerEndpoint(input);
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
    return this.stateStore.updateInstalledServerAutowireRevision(input);
  }

  async updateInstalledServerToolPolicy(
    workloadName: string,
    toolName: string,
    policy: Partial<Omit<ToolHiveMcpToolPolicy, "updatedAt">>,
  ): Promise<ToolHiveInstalledServerState> {
    assertSafeWorkloadName(workloadName);
    assertSafeMcpToolName(toolName);
    return this.stateStore.updateInstalledServerToolPolicy(workloadName, toolName, policy);
  }

  async readState(): Promise<ToolHiveRuntimeState> {
    return this.stateStore.readState();
  }

  async writeState(state: ToolHiveRuntimeState): Promise<void> {
    await this.stateStore.writeState(state);
  }

  async removeState(): Promise<void> {
    await this.stateStore.removeState();
  }

  stateRoot(): string {
    return this.stateStore.stateRoot();
  }

  statePath(): string {
    return this.stateStore.statePath();
  }

  async containerRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    return this.runtimeEnvironment.containerRuntimeEnv();
  }
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

function toolHiveRunVolumeArg(volume: ToolHiveRunVolume): string {
  const base = `${volume.hostPath}:${volume.containerPath}`;
  return volume.mode === "ro" ? `${base}:ro` : base;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
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

function toolHiveLabelValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, ".").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").slice(0, 128) || "mcp-server";
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

async function ensureManagedRuntimeVolumeDirectories(volumes: ToolHiveRunVolume[]): Promise<void> {
  await Promise.all(volumes
    .filter((volume) => volume.purpose === "ambient-mcp-file-exchange")
    .map((volume) => ensureMcpManagedFileExchangeHostPath(volume)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
