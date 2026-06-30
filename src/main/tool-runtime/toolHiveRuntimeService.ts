import { realpath } from "node:fs/promises";
import { ensureMcpManagedFileExchangeHostPath } from "./toolRuntimeMcpManagedFileExchangeFacade";
import { ToolHiveStandardMcpImportController } from "./toolHiveStandardMcpImportController";
import { ToolHiveRuntimeRunController } from "./toolHiveRuntimeRunController";
import { ToolHiveRuntimeCommandController } from "./toolHiveRuntimeCommandController";
import { ToolHiveRuntimeEnvironmentOwner, cleanupRuntimeSecretFiles } from "./toolHiveRuntimeEnvironment";
import { looksToolHiveSecretLike as looksSecretLike } from "./toolHiveRuntimeStringGuards";
import { TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION, ToolHiveRuntimeStateStore } from "./toolHiveRuntimeStateStore";
import {
  ToolHiveCommandRunner,
  redactToolHiveText,
  type ToolHiveCommandResult,
} from "./toolHiveCommandRunner";
import type {
  ToolHiveAdoptStandardMcpImportWorkloadInput,
  ToolHiveBuildProtocolImageInput,
  ToolHiveImageVerificationPolicy,
  ToolHiveInstalledServerState,
  ToolHiveInstallValidationStatus,
  ToolHiveListWorkloadsOptions,
  ToolHiveMcpToolPolicy,
  ToolHivePermissionProfileReadResult,
  ToolHivePermissionProfileWriteInput,
  ToolHivePermissionProfileWriteResult,
  ToolHiveRegisterGuidedLocalBridgeInput,
  ToolHiveRegistryInfoOptions,
  ToolHiveRegistryListOptions,
  ToolHiveRunRegistryServerInput,
  ToolHiveRunRemoteMcpProxyInput,
  ToolHiveRunStandardMcpImportInput,
  ToolHiveRunVolume,
  ToolHiveRuntimePreflight,
  ToolHiveRuntimeServiceOptions,
  ToolHiveRuntimeState,
  ToolHiveToolDescriptorSnapshotResult,
  ToolHiveToolDescriptorTrustResult,
  ToolHiveWaitForWorkloadOptions,
  ToolHiveWorkloadSummary,
} from "./toolHiveRuntimeTypes";

export { TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION };
export { toolHiveWorkloadEndpoint } from "./toolHiveRuntimeCommandController";
export type {
  ToolHiveAllowedCommand,
  ToolHiveCommandExecutor,
  ToolHiveCommandInvocation,
  ToolHiveCommandResult,
  ToolHiveOperationProgress,
} from "./toolHiveCommandRunner";
export type * from "./toolHiveRuntimeTypes";
export const TOOLHIVE_AMBIENT_GROUP = "ambient";

export class ToolHiveRuntimeService {
  private readonly options: ToolHiveRuntimeServiceOptions;
  private readonly stateStore: ToolHiveRuntimeStateStore;
  private readonly runtimeEnvironment: ToolHiveRuntimeEnvironmentOwner;
  private readonly commandRunner: ToolHiveCommandRunner;
  private readonly commandController: ToolHiveRuntimeCommandController;
  private readonly standardMcpImportController: ToolHiveStandardMcpImportController;
  private readonly runtimeRunController: ToolHiveRuntimeRunController;

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
    this.commandController = new ToolHiveRuntimeCommandController({
      ambientGroup: TOOLHIVE_AMBIENT_GROUP,
      runAllowed: (command, args, runOptions) => this.commandRunner.runAllowed(command, args, runOptions),
      timeoutMs: () => this.commandRunner.timeoutMs(),
      removeInstalledServerState: (workloadName) => this.stateStore.removeInstalledServer(workloadName),
      validators: {
        assertSafeToolHiveRef,
        assertSafeToolHiveRunSource,
        assertSafeToolHiveRuntimeImage,
        assertSafeServerArg,
        assertSafeWorkloadName,
      },
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
    this.runtimeRunController = new ToolHiveRuntimeRunController({
      ambientGroup: TOOLHIVE_AMBIENT_GROUP,
      timeoutMs: () => this.commandRunner.timeoutMs(),
      ensureAmbientGroup: () => this.ensureAmbientGroup(),
      writePermissionProfile: (input) => this.writePermissionProfile(input),
      prepareRunVolumes: (volumes) => prepareToolHiveRunVolumes(volumes),
      prepareSecretRuntimeDelivery: (workloadName, secretBindings, allowedKinds) =>
        this.runtimeEnvironment.prepareSecretRuntimeDelivery(workloadName, secretBindings, allowedKinds),
      cleanupRuntimeSecretFiles: (paths) => cleanupRuntimeSecretFiles(paths),
      runAllowed: (command, args, options) => this.commandRunner.runAllowed(command, args, options),
      readState: () => this.readState(),
      upsertInstalledServer: (input) => this.stateStore.upsertInstalledServer(input),
      appendImageVerificationArgs: (args, policy) => appendImageVerificationArgs(args, policy),
      toolHiveRunVolumeArg: (volume) => toolHiveRunVolumeArg(volume),
      toolHiveLabelValue: (value) => toolHiveLabelValue(value),
      validators: {
        assertSafeToolHiveRef,
        assertSafeWorkloadName,
        assertSafeServerArg,
        assertSafeRemoteMcpUrl,
        assertSafeLoopbackMcpEndpoint,
      },
    });
  }

  async version(): Promise<ToolHiveCommandResult> {
    return this.commandController.version();
  }

  async registryList(options: ToolHiveRegistryListOptions = {}): Promise<unknown[]> {
    return this.commandController.registryList(options);
  }

  async registryInfo(serverId: string, options: ToolHiveRegistryInfoOptions = {}): Promise<Record<string, unknown>> {
    return this.commandController.registryInfo(serverId, options);
  }

  async preflightRuntime(timeoutSeconds = 5): Promise<ToolHiveRuntimePreflight> {
    return this.commandController.preflightRuntime(timeoutSeconds);
  }

  async buildProtocolImage(input: ToolHiveBuildProtocolImageInput): Promise<ToolHiveCommandResult> {
    return this.commandController.buildProtocolImage(input);
  }

  async listGroups(): Promise<string[]> {
    return this.commandController.listGroups();
  }

  async ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined> {
    return this.commandController.ensureAmbientGroup();
  }

  async listWorkloads(options: ToolHiveListWorkloadsOptions = {}): Promise<unknown[]> {
    return this.commandController.listWorkloads(options);
  }

  async listAmbientWorkloadSummaries(options: Omit<ToolHiveListWorkloadsOptions, "group"> = {}): Promise<ToolHiveWorkloadSummary[]> {
    return this.commandController.listAmbientWorkloadSummaries(options);
  }

  async waitForAmbientWorkload(workloadName: string, options: ToolHiveWaitForWorkloadOptions = {}): Promise<ToolHiveWorkloadSummary> {
    return this.commandController.waitForAmbientWorkload(workloadName, options);
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
    return this.runtimeRunController.runRegistryServer(input);
  }

  async runStandardMcpImport(input: ToolHiveRunStandardMcpImportInput): Promise<ToolHiveCommandResult> {
    return this.standardMcpImportController.runStandardMcpImport(input);
  }

  async adoptExistingStandardMcpImportWorkload(
    input: ToolHiveAdoptStandardMcpImportWorkloadInput,
  ): Promise<ToolHiveWorkloadSummary | undefined> {
    return this.standardMcpImportController.adoptExistingStandardMcpImportWorkload(input);
  }

  async runRemoteMcpProxy(input: ToolHiveRunRemoteMcpProxyInput): Promise<ToolHiveCommandResult> {
    return this.runtimeRunController.runRemoteMcpProxy(input);
  }

  async registerGuidedLocalBridge(input: ToolHiveRegisterGuidedLocalBridgeInput): Promise<ToolHiveInstalledServerState> {
    return this.runtimeRunController.registerGuidedLocalBridge(input);
  }

  async stopWorkload(workloadName: string, timeoutSeconds = 30): Promise<ToolHiveCommandResult> {
    return this.commandController.stopWorkload(workloadName, timeoutSeconds);
  }

  async removeWorkload(workloadName: string): Promise<ToolHiveCommandResult> {
    return this.commandController.removeWorkload(workloadName);
  }

  async removeInstalledServerState(workloadName: string): Promise<void> {
    await this.commandController.removeInstalledServerState(workloadName);
  }

  async readWorkloadLogs(workloadName: string, lines = 80): Promise<ToolHiveCommandResult> {
    return this.commandController.readWorkloadLogs(workloadName, lines);
  }

  async snapshotInstalledServerToolDescriptors(
    workloadName: string,
    descriptors: unknown[],
  ): Promise<ToolHiveToolDescriptorSnapshotResult> {
    assertSafeWorkloadName(workloadName);
    return this.stateStore.snapshotInstalledServerToolDescriptors(workloadName, descriptors);
  }

  async trustInstalledServerToolDescriptors(
    workloadName: string,
    expectedDescriptorHash?: string,
  ): Promise<ToolHiveToolDescriptorTrustResult> {
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

  async updateInstalledServerEndpoint(input: { workloadName: string; endpoint?: string }): Promise<ToolHiveInstalledServerState> {
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

function toolHiveRunVolumeArg(volume: ToolHiveRunVolume): string {
  const base = `${volume.hostPath}:${volume.containerPath}`;
  return volume.mode === "ro" ? `${base}:ro` : base;
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
    if (
      !/^npx:\/\/(?:@[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\/)?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}(@[A-Za-z0-9][A-Za-z0-9_.-]{0,127})?$/.test(value)
    ) {
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
  const prepared = await Promise.all(
    volumes.map(async (volume) => {
      const hostPath = await canonicalToolHiveHostMountPath(volume.hostPath);
      const normalized = { ...volume, hostPath };
      assertSafeToolHiveRunVolume(normalized);
      return normalized;
    }),
  );
  return prepared;
}

async function canonicalToolHiveHostMountPath(hostPath: string): Promise<string> {
  try {
    return (await realpath(hostPath)).replace(/\/+$/, "") || "/";
  } catch (error) {
    throw new Error(`ToolHive host mount path must exist before install: ${hostPath} (${errorMessage(error)})`, {
      cause: error,
    });
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
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized.endsWith(".localhost");
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
  return (
    value
      .replace(/[^A-Za-z0-9_.-]+/g, ".")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
      .slice(0, 128) || "mcp-server"
  );
}

export function formatToolHiveRunImportFailure(result: Pick<ToolHiveCommandResult, "exitCode" | "stdout" | "stderr">): string {
  const raw = redactToolHiveText(result.stderr || result.stdout);
  const text = raw.toLowerCase();
  const notes: string[] = [];
  if (/new version of toolhive is available/i.test(raw)) {
    notes.push(
      "ToolHive reported that an update is available; this is advisory unless the pull/import error below repeats with the bundled version.",
    );
  }
  if (result.exitCode === 124) {
    notes.push(
      "The ToolHive run command timed out before reporting a ready workload; inspect package startup logs, dependency downloads, or increase the install timeout for slow first-run packages.",
    );
  }
  if (/image verification is disabled/i.test(raw)) {
    notes.push(
      "Image verification was disabled for this Ambient-reviewed default because Ambient owns the pinned descriptor and permission profile.",
    );
  }
  if (/image not found|failed to retrieve or pull image|not found in registry/.test(text)) {
    notes.push(
      "The container runtime could not pull the requested image. If this is a reviewed multi-platform image, Ambient should verify the registry ref and use the platform-specific Linux child manifest for this host.",
    );
  }
  if (
    /failed to find or create the mcp server|invalid protocol scheme provided for mcp server|failed to build docker image|uv tool install/.test(
      text,
    )
  ) {
    notes.push(
      "ToolHive could not build or interpret the Standard MCP package source; verify the ToolHive source URI support, package installability inside ToolHive's builder image, and whether the server needs required non-secret runtime environment before marking this candidate ready.",
    );
  }
  if (/no container runtime|runtime unavailable|cannot connect|daemon is not reachable/.test(text)) {
    notes.push(
      "The local Docker/Podman runtime is not reachable; open the desktop runtime, wait until its engine is running, then refresh Ambient.",
    );
  }
  return [
    `ToolHive run-import failed with exit code ${result.exitCode}.`,
    notes.length ? `Actionable diagnosis: ${notes.join(" ")}` : undefined,
    "Do not bypass Ambient's MCP installer with shell, raw ToolHive, direct package-manager, or unmanaged local installs; keep the failure inside the managed ToolHive/autowire path and report the installer error.",
    `Raw ToolHive output: ${raw}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureManagedRuntimeVolumeDirectories(volumes: ToolHiveRunVolume[]): Promise<void> {
  await Promise.all(
    volumes
      .filter((volume) => volume.purpose === "ambient-mcp-file-exchange")
      .map((volume) => ensureMcpManagedFileExchangeHostPath(volume)),
  );
}
