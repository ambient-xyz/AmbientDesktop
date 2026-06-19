import { dirname, join } from "node:path";
import type {
  AmbientPluginRegistry,
  AmbientPluginRuntime,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginCapabilitySummary,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStartResult,
  AddCodexMarketplaceInput,
  CompletePluginAppAuthInput,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  InstallCodexPluginDependenciesInput,
  InstallPiPackageInput,
  ImportCodexPluginInput,
  PiPackageCatalog,
  SetPiPackageEnabledInput,
  PluginAuthAccountActionInput,
  ReadCodexPluginInput,
  RemoveCodexMarketplaceInput,
  StartPluginAppAuthInput,
  UninstallCodexPluginInput,
  UninstallPiPackageInput,
} from "../../shared/pluginTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import { discoverAmbientCliPackages, type DiscoverAmbientCliPackagesOptions } from "./pluginsAmbientCliFacade";
import {
  addCodexMarketplaceSource,
  previewCodexPluginInstallSource,
  discoverCodexPlugins,
  importCodexPluginFromCache,
  installCodexPluginDependencies,
  removeCodexMarketplaceSource,
  uninstallCodexPlugin,
  commitCodexPluginInstallSource,
  type CodexPluginInstallCommitResult,
  type CodexPluginInstallPreview,
  type CommitCodexPluginInstallInput,
  type PreviewCodexPluginInstallInput,
} from "./codex/codexPlugins";
import {
  discoverPiPackages,
  installPiPackageSource,
  previewPiPackageInstallSource,
  uninstallPiPackageSource,
} from "./pluginsPiFacade";
import {
  codexPluginRuntimeFingerprint,
  PluginMcpSupervisor,
  type PluginMcpLaunchPlan,
  type PluginMcpRuntimeSnapshot,
  type PluginMcpToolInvocation,
  type PluginMcpToolInvocationResult,
  type PluginMcpToolRegistration,
} from "./pluginMcpSupervisor";
import {
  buildAmbientPluginRegistry,
  getAmbientPluginCapabilityDiagnostics,
  listAmbientPluginRuntimeCapabilities,
} from "./capabilityRegistry";
import {
  inspectCodexHostedMarketplace,
  type CodexAppServerMarketplaceClient,
} from "./codexMarketplaceOracle";
import { PluginAuthService, type PluginAuthServiceOptions } from "./pluginAuthService";

export interface AmbientPluginStateReader {
  isPluginEnabled(pluginId: string): boolean;
  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean;
  isPiPackageEnabled?(packageId: string): boolean;
}

export interface AmbientPluginMcpOptions {
  timeoutMs?: number;
  permissionMode?: PermissionMode;
  workspacePath?: string;
  signal?: AbortSignal;
}

export interface AmbientPluginHostOptions {
  auth?: PluginAuthServiceOptions;
  pluginAuth?: PluginAuthService;
  codexMarketplaceClient?: CodexAppServerMarketplaceClient;
}

export class AmbientPluginHost {
  private readonly mcpSupervisor = new PluginMcpSupervisor();
  private readonly pluginAuth: PluginAuthService;
  private readonly codexMarketplaceClient: CodexAppServerMarketplaceClient | undefined;

  constructor(options: AmbientPluginHostOptions = {}) {
    this.pluginAuth = options.pluginAuth ?? new PluginAuthService(options.auth);
    this.codexMarketplaceClient = options.codexMarketplaceClient;
  }

  async readCodexPluginCatalog(workspacePath: string, state?: AmbientPluginStateReader): Promise<CodexPluginCatalog> {
    const catalog = await discoverCodexPlugins(workspacePath);
    return applyCodexPluginState(catalog, state);
  }

  async readCodexPlugin(workspacePath: string, input: ReadCodexPluginInput, state?: AmbientPluginStateReader): Promise<CodexPluginSummary> {
    const catalog = await this.readCodexPluginCatalog(workspacePath, state);
    const plugin = [...catalog.plugins, ...catalog.importCandidates].find((candidate) => candidate.id === input.pluginId);
    if (!plugin) throw new Error("Codex plugin was not found.");
    return plugin;
  }

  async importCodexPlugin(workspacePath: string, input: ImportCodexPluginInput): Promise<CodexPluginSummary> {
    return importCodexPluginFromCache(workspacePath, input);
  }

  async previewCodexPluginInstall(workspacePath: string, input: PreviewCodexPluginInstallInput): Promise<CodexPluginInstallPreview> {
    return previewCodexPluginInstallSource(workspacePath, input);
  }

  async commitCodexPluginInstall(workspacePath: string, input: CommitCodexPluginInstallInput): Promise<CodexPluginInstallCommitResult> {
    return commitCodexPluginInstallSource(workspacePath, input);
  }

  async addCodexMarketplace(workspacePath: string, input: AddCodexMarketplaceInput): Promise<void> {
    await addCodexMarketplaceSource(workspacePath, input);
  }

  async removeCodexMarketplace(workspacePath: string, input: RemoveCodexMarketplaceInput): Promise<void> {
    await removeCodexMarketplaceSource(workspacePath, input);
  }

  async uninstallCodexPlugin(workspacePath: string, input: UninstallCodexPluginInput): Promise<void> {
    await uninstallCodexPlugin(workspacePath, input);
  }

  async installCodexPluginDependencies(
    workspacePath: string,
    input: InstallCodexPluginDependenciesInput,
  ): Promise<CodexPluginDependencyInstallResult> {
    return installCodexPluginDependencies(workspacePath, input);
  }

  async inspectHostedCodexMarketplace(workspacePath: string, state?: AmbientPluginStateReader): Promise<CodexHostedMarketplaceReport> {
    const catalog = await this.readCodexPluginCatalog(workspacePath, state);
    return inspectCodexHostedMarketplace(catalog, workspacePath, { client: this.codexMarketplaceClient });
  }

  async inspectPiPackages(workspacePath: string, state?: AmbientPluginStateReader): Promise<PiPackageCatalog> {
    return discoverPiPackages(workspacePath, { isPackageEnabled: (packageId) => state?.isPiPackageEnabled?.(packageId) ?? false });
  }

  async inspectAmbientCliPackages(workspacePath: string, options?: DiscoverAmbientCliPackagesOptions) {
    return discoverAmbientCliPackages(workspacePath, options);
  }

  async installPiPackage(workspacePath: string, input: InstallPiPackageInput, state?: AmbientPluginStateReader): Promise<PiPackageCatalog> {
    await installPiPackageSource(workspacePath, input);
    return this.inspectPiPackages(workspacePath, state);
  }

  async previewPiPackageInstall(workspacePath: string, input: InstallPiPackageInput) {
    return previewPiPackageInstallSource(workspacePath, input);
  }

  async uninstallPiPackage(workspacePath: string, input: UninstallPiPackageInput, state?: AmbientPluginStateReader): Promise<PiPackageCatalog> {
    await uninstallPiPackageSource(workspacePath, input);
    return this.inspectPiPackages(workspacePath, state);
  }

  async validatePiPackageEnablement(
    workspacePath: string,
    input: SetPiPackageEnabledInput,
    state?: AmbientPluginStateReader,
  ): Promise<void> {
    if (!input.enabled) return;
    const catalog = await this.inspectPiPackages(workspacePath, state);
    const pkg = catalog.packages.find((item) => item.id === input.packageId);
    if (!pkg) throw new Error("Pi package was not found.");
    if (!pkg.installed) throw new Error("Install this Pi package in Ambient before enabling it.");
    if (pkg.errors.length > 0 || pkg.compatibilityTier === "unsupported") throw new Error("Unsupported Pi packages cannot be enabled.");
    if (pkg.resourceCounts.extension > 0) {
      throw new Error("Pi packages with extensions cannot be enabled until Ambient has Pi extension trust and sandboxing.");
    }
    if (pkg.resourceCounts.skill === 0 && pkg.resourceCounts.prompt === 0 && pkg.resourceCounts.theme === 0) {
      throw new Error("This Pi package does not expose declarative resources that Ambient can enable.");
    }
  }

  async enabledPiSkillPaths(workspacePath: string, state: AmbientPluginStateReader): Promise<string[]> {
    const catalog = await this.inspectPiPackages(workspacePath, state);
    return catalog.packages.flatMap((pkg) => {
      if (!pkg.enabled || !pkg.installed || pkg.errors.length > 0 || pkg.resourceCounts.extension > 0 || !pkg.rootPath) return [];
      return pkg.resources.filter((resource) => resource.kind === "skill").map((resource) => piSkillPath(pkg.rootPath!, resource.path));
    });
  }

  async listRegistry(workspacePath: string, state?: AmbientPluginStateReader): Promise<AmbientPluginRegistry> {
    const [codexCatalog, piPackageCatalog, ambientCliCatalog] = await Promise.all([
      this.readCodexPluginCatalog(workspacePath, state),
      this.inspectPiPackages(workspacePath, state),
      this.inspectAmbientCliPackages(workspacePath),
    ]);
    const appAuth = this.pluginAuth.authIndexForPlugins([...codexCatalog.plugins, ...codexCatalog.importCandidates]);
    return buildAmbientPluginRegistry({ codexCatalog, piPackageCatalog, ambientCliCatalog, appAuth });
  }

  async listRuntimeCapabilities(
    workspacePath: string,
    runtime: AmbientPluginRuntime,
    state?: AmbientPluginStateReader,
  ): Promise<AmbientPluginCapabilitySummary[]> {
    return listAmbientPluginRuntimeCapabilities(await this.listRegistry(workspacePath, state), runtime);
  }

  async getCapabilityDiagnostics(
    workspacePath: string,
    capabilityId: string,
    state?: AmbientPluginStateReader,
  ): Promise<AmbientPluginCapabilityDiagnostics> {
    return getAmbientPluginCapabilityDiagnostics(await this.listRegistry(workspacePath, state), capabilityId);
  }

  listPluginAppAuth(workspacePath: string, state?: AmbientPluginStateReader) {
    return this.readCodexPluginCatalog(workspacePath, state).then((catalog) =>
      this.pluginAuth.listAppAuthStates([...catalog.plugins, ...catalog.importCandidates]),
    );
  }

  startPluginAppAuth(input: StartPluginAppAuthInput): AmbientPluginAuthStartResult {
    const pending = this.pluginAuth.startConnectForApp(input);
    return {
      connectorId: input.connectorId,
      providerId: pending.providerId,
      requestedScopes: pending.requestedScopes,
      authorizationUrl: pending.authorizationUrl,
      state: pending.state,
      expiresAt: pending.expiresAt,
    };
  }

  completePluginAppAuth(input: CompletePluginAppAuthInput): Promise<AmbientPluginAuthAccountSummary> {
    return this.pluginAuth.completeConnect(input);
  }

  revokePluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary> {
    return this.pluginAuth.revokeAccount(input.accountId);
  }

  disconnectPluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary> {
    return this.pluginAuth.disconnectAccount(input.accountId);
  }

  testPluginAuthAccount(input: PluginAuthAccountActionInput): Promise<AmbientPluginAuthAccountSummary> {
    return this.pluginAuth.testAccount(input.accountId);
  }

  async inspectCodexPluginMcp(
    workspacePath: string,
    state: AmbientPluginStateReader | undefined,
    options: AmbientPluginMcpOptions = {},
  ): Promise<CodexPluginMcpInspectionCatalog> {
    const catalog = await this.readCodexPluginCatalog(workspacePath, state);
    return this.mcpSupervisor.inspectPluginMcpServers(catalog.plugins, {
      timeoutMs: options.timeoutMs,
      permissionMode: options.permissionMode,
      workspacePath: options.workspacePath ?? workspacePath,
    });
  }

  async enabledCodexPlugins(workspacePath: string, state: AmbientPluginStateReader): Promise<CodexPluginSummary[]> {
    const catalog = await this.readCodexPluginCatalog(workspacePath, state);
    return catalog.plugins.filter((plugin) => plugin.enabled && plugin.errors.length === 0);
  }

  async buildCodexPluginMcpToolRegistrations(
    plugins: CodexPluginSummary[],
    options: AmbientPluginMcpOptions = {},
  ): Promise<PluginMcpToolRegistration[]> {
    return this.mcpSupervisor.buildPluginMcpToolRegistrations(plugins, options);
  }

  async callCodexPluginMcpTool(
    plan: PluginMcpLaunchPlan,
    invocation: PluginMcpToolInvocation,
    options: AmbientPluginMcpOptions = {},
  ): Promise<PluginMcpToolInvocationResult> {
    return this.mcpSupervisor.callPluginMcpTool(plan, invocation, options);
  }

  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return this.mcpSupervisor.snapshots();
  }

  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.mcpSupervisor.restartRuntime(key);
  }

  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.mcpSupervisor.stopRuntimeByKey(key);
  }

  async shutdownPluginMcpServers(): Promise<void> {
    await this.mcpSupervisor.shutdown();
  }

  async shutdownPluginMcpServersForWorkspace(workspacePath: string): Promise<void> {
    await this.mcpSupervisor.shutdownWorkspace(workspacePath);
  }
}

function applyCodexPluginState(catalog: CodexPluginCatalog, state: AmbientPluginStateReader | undefined): CodexPluginCatalog {
  if (!state) return catalog;
  return {
    ...catalog,
    plugins: catalog.plugins.map((plugin) => ({
      ...plugin,
      enabled: state.isPluginEnabled(plugin.id),
      trusted: state.isPluginTrusted(plugin.id, codexPluginRuntimeFingerprint(plugin)),
    })),
    importCandidates: catalog.importCandidates.map((plugin) => ({
      ...plugin,
      enabled: false,
      trusted: false,
    })),
  };
}

export type {
  PluginMcpLaunchPlan,
  PluginMcpRuntimeSnapshot,
  PluginMcpToolInvocation,
  PluginMcpToolInvocationResult,
  PluginMcpToolRegistration,
};

export { codexPluginRuntimeFingerprint as codexPluginTrustFingerprint };

function piSkillPath(rootPath: string, resourcePath: string): string {
  const absolute = resourcePath.startsWith("/") ? resourcePath : join(rootPath, resourcePath);
  return absolute.endsWith(".md") ? dirname(absolute) : absolute;
}
