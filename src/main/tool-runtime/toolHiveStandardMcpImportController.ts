import { managedFileExchangeFromVolumes } from "./toolRuntimeMcpManagedFileExchangeFacade";
import { isRecord } from "./toolHiveRuntimeStateStore";
import type {
  ToolHiveAllowedCommand,
  ToolHiveCommandResult,
  ToolHiveOperationProgress,
} from "./toolHiveCommandRunner";
import type {
  ToolHiveAdoptStandardMcpImportWorkloadInput,
  ToolHiveImageVerificationPolicy,
  ToolHiveInstallValidationStatus,
  ToolHiveInstalledServerState,
  ToolHivePermissionProfileWriteInput,
  ToolHivePermissionProfileWriteResult,
  ToolHivePlainEnvVar,
  ToolHiveRunStandardMcpImportInput,
  ToolHiveRunVolume,
  ToolHiveSecretBindingState,
  ToolHiveSecretDerivedBindingKind,
  ToolHiveWorkloadSummary,
  ToolHiveRuntimeState,
} from "./toolHiveRuntimeTypes";

interface ToolHiveRunAllowedWithProgressOptions {
  throwOnNonZero?: boolean;
  timeoutMs?: number;
  onProgress?: (progress: ToolHiveOperationProgress) => void;
  workloadName?: string;
  phase: string;
  message: string;
}

interface ToolHiveStandardMcpImportControllerValidators {
  assertSafeToolHiveRef(value: string, label: string): void;
  assertSafeWorkloadName(value: string): void;
  assertSafeToolHiveRunSource(value: string): void;
  assertSafeToolHiveRuntimeImage(value: string): void;
  assertSafeServerArg(value: string): void;
}

export interface ToolHiveStandardMcpImportControllerOptions {
  ambientGroup: string;
  timeoutMs(): number;
  ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined>;
  writePermissionProfile(input: ToolHivePermissionProfileWriteInput): Promise<ToolHivePermissionProfileWriteResult>;
  prepareRunVolumes(volumes: ToolHiveRunVolume[]): Promise<ToolHiveRunVolume[]>;
  prepareSecretRuntimeDelivery(
    workloadName: string,
    secretBindings: ToolHiveSecretBindingState[],
    allowedKinds: ToolHiveSecretDerivedBindingKind[],
    plainEnvVars?: ToolHivePlainEnvVar[],
  ): Promise<{ args: string[]; cleanupPaths: string[] }>;
  cleanupRuntimeSecretFiles(paths: string[]): Promise<void>;
  runAllowedWithProgress(command: ToolHiveAllowedCommand, args: string[], options: ToolHiveRunAllowedWithProgressOptions): Promise<ToolHiveCommandResult>;
  waitForAmbientWorkload(workloadName: string, options?: { timeoutMs?: number; pollIntervalMs?: number; requireEndpoint?: boolean }): Promise<ToolHiveWorkloadSummary>;
  listAmbientWorkloadSummaries(options?: { all?: boolean }): Promise<ToolHiveWorkloadSummary[]>;
  readState(): Promise<ToolHiveRuntimeState>;
  upsertInstalledServer(input: Omit<ToolHiveInstalledServerState, "createdAt" | "updatedAt">): Promise<void>;
  updateInstalledServerInstallValidation(input: {
    workloadName: string;
    status: ToolHiveInstallValidationStatus;
    error?: string;
  }): Promise<ToolHiveInstalledServerState>;
  formatRunImportFailure(result: Pick<ToolHiveCommandResult, "exitCode" | "stdout" | "stderr">): string;
  appendImageVerificationArgs(args: string[], policy?: ToolHiveImageVerificationPolicy): void;
  toolHiveRunVolumeArg(volume: ToolHiveRunVolume): string;
  toolHiveLabelValue(value: string): string;
  redactToolHiveText(value: string): string;
  validators: ToolHiveStandardMcpImportControllerValidators;
}

export class ToolHiveStandardMcpImportController {
  constructor(private readonly options: ToolHiveStandardMcpImportControllerOptions) {}

  async runStandardMcpImport(input: ToolHiveRunStandardMcpImportInput): Promise<ToolHiveCommandResult> {
    const { validators } = this.options;
    validators.assertSafeToolHiveRef(input.serverId, "serverId");
    validators.assertSafeWorkloadName(input.workloadName);
    validators.assertSafeToolHiveRunSource(input.sourceRef);
    if (input.runtimeImage) validators.assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      validators.assertSafeServerArg(arg);
    }
    const volumes = input.volumes ?? [];
    const runVolumes = await this.options.prepareRunVolumes(volumes);
    await this.options.ensureAmbientGroup();
    const profile = await this.options.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    const args = [
      "run",
      "--name",
      input.workloadName,
      "--group",
      this.options.ambientGroup,
      "--isolate-network",
      "--permission-profile",
      profile.path,
      "--label",
      `ambient.serverId=${this.options.toolHiveLabelValue(input.serverId)}`,
      "--label",
      `ambient.importSource=${this.options.toolHiveLabelValue(input.registrySource ?? "standard-mcp-import")}`,
    ];
    if (input.transport) args.push("--transport", input.transport);
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    this.options.appendImageVerificationArgs(args, input.imageVerificationPolicy);
    if (input.runtimeImage) args.push("--runtime-image", input.runtimeImage);
    for (const volume of runVolumes) {
      args.push("--volume", this.options.toolHiveRunVolumeArg(volume));
    }
    const secretDelivery = await this.options.prepareSecretRuntimeDelivery(
      input.workloadName,
      input.secretBindings ?? [],
      ["container-env-file"],
      input.envVars ?? [],
    );
    args.push(...secretDelivery.args);
    args.push(input.sourceRef);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    try {
      const result = await this.options.runAllowedWithProgress("run-import", args, {
        timeoutMs: Math.max(this.options.timeoutMs(), 120_000),
        throwOnNonZero: false,
        onProgress: input.onProgress,
        workloadName: input.workloadName,
        phase: "toolhive-run",
        message: `Starting ToolHive Standard MCP workload ${input.workloadName}.`,
      });
      if (result.exitCode !== 0) {
        return this.handleRunImportFailure(input, volumes, profile, args, result);
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
      await this.options.cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async adoptExistingStandardMcpImportWorkload(input: ToolHiveAdoptStandardMcpImportWorkloadInput): Promise<ToolHiveWorkloadSummary | undefined> {
    const { validators } = this.options;
    validators.assertSafeToolHiveRef(input.serverId, "serverId");
    validators.assertSafeWorkloadName(input.workloadName);
    validators.assertSafeToolHiveRunSource(input.sourceRef);
    if (input.runtimeImage) validators.assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      validators.assertSafeServerArg(arg);
    }
    await this.options.prepareRunVolumes(input.volumes ?? []);

    const workload = (await this.options.listAmbientWorkloadSummaries({ all: true }))
      .find((candidate) => candidate.name === input.workloadName);
    if (!workload || !isReadyToolHiveWorkload(workload) || !isAdoptableStandardMcpImportWorkload(workload, input, this.options.toolHiveLabelValue)) {
      return undefined;
    }
    const profile = await this.options.writePermissionProfile({
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

  private async handleRunImportFailure(
    input: ToolHiveRunStandardMcpImportInput,
    volumes: ToolHiveRunVolume[],
    profile: ToolHivePermissionProfileWriteResult,
    args: string[],
    result: ToolHiveCommandResult,
  ): Promise<ToolHiveCommandResult> {
    if (!isExistingWorkloadConflict(result, input.workloadName)) {
      const failure = this.options.formatRunImportFailure(result);
      await this.markInstalledServerValidationFailedIfPresent(input.workloadName, failure);
      throw new Error(failure);
    }
    emitToolHiveProgress(input.onProgress, {
      phase: "same-name-conflict",
      status: "running",
      workloadName: input.workloadName,
      message: `ToolHive reported existing workload ${input.workloadName}; inspecting whether Ambient can adopt or replace it.`,
    });
    const workload = await this.options.waitForAmbientWorkload(input.workloadName, { timeoutMs: 30_000 });
    const adoptable = isAdoptableStandardMcpImportWorkload(workload, input, this.options.toolHiveLabelValue);
    if (!adoptable && !isReplaceableSameNameStandardMcpImportConflict(workload, input)) {
      throw new Error(`ToolHive workload ${input.workloadName} already exists but does not match the expected Ambient import source.`);
    }
    if (!adoptable || !(await this.canAdoptStandardMcpImportRuntime(input, volumes, profile.sha256))) {
      return this.replaceStandardMcpImportWorkload(input, profile, args, adoptable);
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

  private async replaceStandardMcpImportWorkload(
    input: ToolHiveRunStandardMcpImportInput,
    profile: ToolHivePermissionProfileWriteResult,
    args: string[],
    adoptable: boolean,
  ): Promise<ToolHiveCommandResult> {
    await this.removeStandardMcpImportWorkloadForReinstall(input.workloadName, input.onProgress);
    const retry = await this.options.runAllowedWithProgress("run-import", args, {
      timeoutMs: Math.max(this.options.timeoutMs(), 120_000),
      throwOnNonZero: false,
      onProgress: input.onProgress,
      workloadName: input.workloadName,
      phase: "toolhive-rerun",
      message: `Recreating ToolHive Standard MCP workload ${input.workloadName}.`,
    });
    if (retry.exitCode !== 0) {
      const failure = this.options.formatRunImportFailure(retry);
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

  private async persistStandardMcpImportState(
    input: ToolHiveRunStandardMcpImportInput,
    profile: ToolHivePermissionProfileWriteResult,
    options: { endpoint?: string; lastRunCommand?: string[] } = {},
  ): Promise<void> {
    const managedFileExchange = managedFileExchangeFromVolumes(input.volumes);
    await this.options.upsertInstalledServer({
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
    const state = await this.options.readState();
    const existing = state.installedServers.find((server) => server.workloadName === input.workloadName);
    return Boolean(
      existing &&
      isAmbientOwnedStandardMcpImportState(existing, input) &&
      existing.permissionProfileSha256 === permissionProfileSha256 &&
      toolHiveRunVolumesEqual(existing.runtimeVolumes ?? [], volumes)
    );
  }

  private async markInstalledServerValidationFailedIfPresent(workloadName: string, error: string): Promise<void> {
    await this.options.updateInstalledServerInstallValidation({
      workloadName,
      status: "validation_failed",
      error,
    }).catch(() => undefined);
  }

  private async removeStandardMcpImportWorkloadForReinstall(
    workloadName: string,
    onProgress?: (progress: ToolHiveOperationProgress) => void,
  ): Promise<void> {
    await this.options.runAllowedWithProgress("stop", ["stop", workloadName, "--timeout", "30"], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.options.timeoutMs(), 35_000),
      onProgress,
      workloadName,
      phase: "toolhive-stop-existing",
      message: `Stopping existing ToolHive workload ${workloadName} before reinstall.`,
    });
    const remove = await this.options.runAllowedWithProgress("rm", ["rm", workloadName], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.options.timeoutMs(), 30_000),
      onProgress,
      workloadName,
      phase: "toolhive-remove-existing",
      message: `Removing existing ToolHive workload ${workloadName} before reinstall.`,
    });
    if (remove.exitCode !== 0 && !isMissingWorkloadRemoval(remove)) {
      throw new Error(`ToolHive workload ${workloadName} has stale Ambient runtime volumes, but ToolHive could not remove it for reinstall: ${this.options.redactToolHiveText(remove.stderr || remove.stdout)}`);
    }
  }
}

function isExistingWorkloadConflict(result: ToolHiveCommandResult, workloadName: string): boolean {
  const output = `${result.stderr}\n${result.stdout}`;
  return new RegExp(`workload\\s+with\\s+name\\s+['"]?${escapeRegExp(workloadName)}['"]?\\s+already\\s+exists`, "i").test(output);
}

function isAdoptableStandardMcpImportWorkload(
  workload: ToolHiveWorkloadSummary,
  input: Pick<ToolHiveRunStandardMcpImportInput, "serverId" | "sourceRef" | "registrySource">,
  toolHiveLabelValue: (value: string) => string,
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

function emitToolHiveProgress(
  onProgress: ((progress: ToolHiveOperationProgress) => void) | undefined,
  progress: ToolHiveOperationProgress,
): void {
  try {
    onProgress?.(progress);
  } catch {
    // Progress callbacks must not alter ToolHive runtime state.
  }
}
