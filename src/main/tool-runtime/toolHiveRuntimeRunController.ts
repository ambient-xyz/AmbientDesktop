import type {
  ToolHiveAllowedCommand,
  ToolHiveCommandResult,
} from "./toolHiveCommandRunner";
import type {
  ToolHiveImageVerificationPolicy,
  ToolHiveInstalledServerState,
  ToolHivePermissionProfileWriteInput,
  ToolHivePermissionProfileWriteResult,
  ToolHiveRegisterGuidedLocalBridgeInput,
  ToolHiveRunRegistryServerInput,
  ToolHiveRunRemoteMcpProxyInput,
  ToolHiveRunVolume,
  ToolHiveSecretBindingState,
  ToolHiveSecretDerivedBindingKind,
  ToolHiveRuntimeState,
} from "./toolHiveRuntimeTypes";

interface ToolHiveRunAllowedOptions {
  throwOnNonZero?: boolean;
  timeoutMs?: number;
}

interface ToolHiveRuntimeRunControllerValidators {
  assertSafeToolHiveRef(value: string, label: string): void;
  assertSafeWorkloadName(value: string): void;
  assertSafeServerArg(value: string): void;
  assertSafeRemoteMcpUrl(value: string): void;
  assertSafeLoopbackMcpEndpoint(value: string): void;
}

export interface ToolHiveRuntimeRunControllerOptions {
  ambientGroup: string;
  timeoutMs(): number;
  ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined>;
  writePermissionProfile(input: ToolHivePermissionProfileWriteInput): Promise<ToolHivePermissionProfileWriteResult>;
  prepareRunVolumes(volumes: ToolHiveRunVolume[]): Promise<ToolHiveRunVolume[]>;
  prepareSecretRuntimeDelivery(
    workloadName: string,
    secretBindings: ToolHiveSecretBindingState[],
    allowedKinds: ToolHiveSecretDerivedBindingKind[],
  ): Promise<{ args: string[]; cleanupPaths: string[] }>;
  cleanupRuntimeSecretFiles(paths: string[]): Promise<void>;
  runAllowed(command: ToolHiveAllowedCommand, args: string[], options?: ToolHiveRunAllowedOptions): Promise<ToolHiveCommandResult>;
  readState(): Promise<ToolHiveRuntimeState>;
  upsertInstalledServer(input: Omit<ToolHiveInstalledServerState, "createdAt" | "updatedAt">): Promise<void>;
  appendImageVerificationArgs(args: string[], policy?: ToolHiveImageVerificationPolicy): void;
  toolHiveRunVolumeArg(volume: ToolHiveRunVolume): string;
  toolHiveLabelValue(value: string): string;
  validators: ToolHiveRuntimeRunControllerValidators;
}

export class ToolHiveRuntimeRunController {
  constructor(private readonly options: ToolHiveRuntimeRunControllerOptions) {}

  async runRegistryServer(input: ToolHiveRunRegistryServerInput): Promise<ToolHiveCommandResult> {
    const { validators } = this.options;
    validators.assertSafeToolHiveRef(input.serverId, "serverId");
    validators.assertSafeWorkloadName(input.workloadName);
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
    ];
    if (input.transport) args.push("--transport", input.transport);
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    this.options.appendImageVerificationArgs(args, input.imageVerificationPolicy);
    for (const volume of runVolumes) {
      args.push("--volume", this.options.toolHiveRunVolumeArg(volume));
    }
    const secretDelivery = await this.options.prepareSecretRuntimeDelivery(input.workloadName, input.secretBindings ?? [], [
      "container-env-file",
    ]);
    args.push(...secretDelivery.args);
    args.push(input.serverId);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    try {
      const result = await this.options.runAllowed("run-registry", args, { timeoutMs: Math.max(this.options.timeoutMs(), 120_000) });
      await this.options.upsertInstalledServer({
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
      await this.options.cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async runRemoteMcpProxy(input: ToolHiveRunRemoteMcpProxyInput): Promise<ToolHiveCommandResult> {
    const { validators } = this.options;
    validators.assertSafeToolHiveRef(input.serverId, "serverId");
    validators.assertSafeWorkloadName(input.workloadName);
    validators.assertSafeRemoteMcpUrl(input.remoteUrl);
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
      `ambient.importSource=${this.options.toolHiveLabelValue(input.registrySource ?? "remote-mcp-proxy")}`,
      "--transport",
      input.transport,
    ];
    if (input.proxyMode) args.push("--proxy-mode", input.proxyMode);
    const secretDelivery = await this.options.prepareSecretRuntimeDelivery(input.workloadName, input.secretBindings ?? [], [
      "remote-bearer-token-file",
    ]);
    args.push(...secretDelivery.args);
    args.push(input.remoteUrl);
    try {
      const result = await this.options.runAllowed("run-remote", args, { timeoutMs: Math.max(this.options.timeoutMs(), 120_000) });
      await this.options.upsertInstalledServer({
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
      await this.options.cleanupRuntimeSecretFiles(secretDelivery.cleanupPaths);
    }
  }

  async registerGuidedLocalBridge(input: ToolHiveRegisterGuidedLocalBridgeInput): Promise<ToolHiveInstalledServerState> {
    const { validators } = this.options;
    validators.assertSafeToolHiveRef(input.serverId, "serverId");
    validators.assertSafeWorkloadName(input.workloadName);
    validators.assertSafeLoopbackMcpEndpoint(input.endpoint);
    const profile = await this.options.writePermissionProfile({
      serverId: input.serverId,
      workloadName: input.workloadName,
      profile: input.permissionProfile,
    });
    await this.options.upsertInstalledServer({
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
    const state = await this.options.readState();
    const server = state.installedServers.find((candidate) => candidate.workloadName === input.workloadName);
    if (!server) throw new Error(`Failed to register guided local bridge ${input.workloadName}.`);
    return server;
  }
}
