import type {
  AmbientPluginRegistry,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  PluginMcpRuntimeSnapshot,
} from "../../shared/pluginTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowAmbientCliCapabilityGrant } from "../../shared/workflowTypes";
import type {
  AmbientPluginHost,
  AmbientPluginStateReader,
  PluginMcpToolRegistration,
} from "./pluginHost";

interface PluginDesktopWorkspace {
  path: string;
}

export interface PluginDesktopStore {
  getWorkspace(): PluginDesktopWorkspace;
  listThreads(): unknown[];
  listMessages(threadId: string): unknown[];
  listPermissionAudit(limit?: number): unknown[];
  listPermissionGrants(input?: unknown): Array<{
    id: string;
    actionKind: string;
    targetLabel: string;
  }>;
  listContextUsageSnapshots(limit?: number): unknown[];
  listOrchestrationBoard(): unknown;
  getSubagentRepairDiagnostics(options?: unknown): unknown;
  isPluginEnabled(pluginId: string): boolean;
  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean;
  isPiPackageEnabled(packageId: string): boolean;
  revokePermissionGrant(grantId: string): void;
}

export interface PluginDesktopRuntime {
  tokenizerStatus(): unknown;
  readLocalModelRuntimeStatus(workspacePath: string): unknown;
}

export interface PluginDesktopHost<Store extends PluginDesktopStore = PluginDesktopStore> {
  store: Store;
  runtime: PluginDesktopRuntime;
}

export interface PluginDesktopAmbientCliCapabilitySearch {
  results: Array<{
    registryPluginId: string;
    packageId: string;
    packageName: string;
    commands: Array<{
      capabilityId: string;
      name: string;
    }>;
  }>;
}

export interface PluginDesktopServiceDependencies<
  Host extends PluginDesktopHost<Store>,
  Store extends PluginDesktopStore,
> {
  defaultStore(): Store;
  defaultHost(): Host;
  pluginHost(): Pick<
    AmbientPluginHost,
    | "buildCodexPluginMcpToolRegistrations"
    | "enabledCodexPlugins"
    | "inspectAmbientCliPackages"
    | "inspectHostedCodexMarketplace"
    | "inspectPiPackages"
    | "listPluginAppAuth"
    | "listRegistry"
    | "readCodexPluginCatalog"
  >;
  allPluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  currentFeatureFlagSnapshot(targetStore: Store): unknown;
  getAgentMemoryDiagnostics(host: Host): unknown;
  getAgentMemoryStarterStatus(host: Host): unknown;
  searchAmbientCliCapabilities(
    workspacePath: string,
    input: {
      query: string;
      kind: "command";
      limit: number;
      includeHealth: boolean;
    },
  ): Promise<PluginDesktopAmbientCliCapabilitySearch>;
}

export function createPluginDesktopService<
  Host extends PluginDesktopHost<Store>,
  Store extends PluginDesktopStore,
>(
  dependencies: PluginDesktopServiceDependencies<Host, Store>,
) {
  function pluginStateReaderForStore(targetStore: Store): AmbientPluginStateReader {
    return {
      isPluginEnabled: (pluginId) => targetStore.isPluginEnabled(pluginId),
      isPluginTrusted: (pluginId, pluginFingerprint) => targetStore.isPluginTrusted(pluginId, pluginFingerprint),
      isPiPackageEnabled: (packageId) => targetStore.isPiPackageEnabled(packageId),
    };
  }

  async function readCodexPluginCatalog(targetStore = dependencies.defaultStore()): Promise<CodexPluginCatalog> {
    return dependencies.pluginHost().readCodexPluginCatalog(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
  }

  async function readCodexHostedMarketplaceReport(
    targetStore = dependencies.defaultStore(),
  ): Promise<CodexHostedMarketplaceReport> {
    return dependencies.pluginHost().inspectHostedCodexMarketplace(
      targetStore.getWorkspace().path,
      pluginStateReaderForStore(targetStore),
    );
  }

  async function readAmbientPluginRegistry(targetStore = dependencies.defaultStore()): Promise<AmbientPluginRegistry> {
    return dependencies.pluginHost().listRegistry(targetStore.getWorkspace().path, pluginStateReaderForStore(targetStore));
  }

  async function readDiagnosticSection<T>(
    label: string,
    read: () => Promise<T>,
    errors: string[],
  ): Promise<T | undefined> {
    try {
      return await read();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  function createMainDiagnosticSource(host = dependencies.defaultHost()) {
    const targetStore = host.store;
    const targetRuntime = host.runtime;
    return {
      getWorkspace: () => targetStore.getWorkspace(),
      listThreads: () => targetStore.listThreads(),
      listMessages: (threadId: string) => targetStore.listMessages(threadId),
      listPermissionAudit: (limit?: number) => targetStore.listPermissionAudit(limit),
      listPermissionGrants: (input?: unknown) => targetStore.listPermissionGrants(input),
      listContextUsageSnapshots: (limit?: number) => targetStore.listContextUsageSnapshots(limit),
      getContextDiagnostics: () => ({ tokenizer: targetRuntime.tokenizerStatus() }),
      listOrchestrationBoard: () => targetStore.listOrchestrationBoard(),
      getFeatureFlagSnapshot: () => dependencies.currentFeatureFlagSnapshot(targetStore),
      getAgentMemoryDiagnostics: () => dependencies.getAgentMemoryDiagnostics(host),
      getAgentMemoryStarterStatus: () => dependencies.getAgentMemoryStarterStatus(host),
      getSubagentRepairDiagnostics: (options?: unknown) => targetStore.getSubagentRepairDiagnostics(options),
      getLocalModelRuntimeStatus: () => targetRuntime.readLocalModelRuntimeStatus(targetStore.getWorkspace().path),
      getPluginDiagnostics: async () => {
        const errors: string[] = [];
        const workspacePath = targetStore.getWorkspace().path;
        const [registry, codexCatalog, hostedMarketplace, piPackages, ambientCliPackages, appAuth] = await Promise.all([
          readDiagnosticSection("ambient plugin registry", () => readAmbientPluginRegistry(targetStore), errors),
          readDiagnosticSection("Codex plugin catalog", () => readCodexPluginCatalog(targetStore), errors),
          readDiagnosticSection("hosted Codex marketplace", () => readCodexHostedMarketplaceReport(targetStore), errors),
          readDiagnosticSection("Pi package catalog", () =>
            dependencies.pluginHost().inspectPiPackages(workspacePath, pluginStateReaderForStore(targetStore)), errors),
          readDiagnosticSection("Ambient CLI package catalog", () =>
            dependencies.pluginHost().inspectAmbientCliPackages(workspacePath, { includeHealth: true }), errors),
          readDiagnosticSection("plugin app auth", () =>
            dependencies.pluginHost().listPluginAppAuth(workspacePath, pluginStateReaderForStore(targetStore)), errors),
        ]);
        return {
          registry,
          codexCatalog,
          hostedMarketplace,
          piPackages,
          ambientCliPackages,
          appAuth,
          mcpRuntimes: dependencies.allPluginMcpRuntimeSnapshots(),
          errors,
        };
      },
    };
  }

  function revokePluginGrantsForLabels(labelPrefixes: string[], targetStore = dependencies.defaultStore()): number {
    let revoked = 0;
    for (const grant of targetStore.listPermissionGrants()) {
      if (grant.actionKind !== "plugin_tool_execute") continue;
      if (!labelPrefixes.some((prefix) => grant.targetLabel === prefix || grant.targetLabel.startsWith(prefix))) continue;
      targetStore.revokePermissionGrant(grant.id);
      revoked += 1;
    }
    return revoked;
  }

  async function pluginMcpRegistrationsForThread(
    thread: ThreadSummary,
    targetStore = dependencies.defaultStore(),
  ): Promise<PluginMcpToolRegistration[]> {
    const pluginHost = dependencies.pluginHost();
    const enabledPlugins = await pluginHost.enabledCodexPlugins(thread.workspacePath, pluginStateReaderForStore(targetStore));
    return pluginHost.buildCodexPluginMcpToolRegistrations(enabledPlugins, {
      permissionMode: thread.permissionMode,
      workspacePath: thread.workspacePath,
    });
  }

  async function ambientCliCapabilityGrantsForWorkflowRequest(
    workspacePath: string,
    request: string,
  ): Promise<WorkflowAmbientCliCapabilityGrant[]> {
    try {
      const search = await dependencies.searchAmbientCliCapabilities(workspacePath, {
        query: request,
        kind: "command",
        limit: 6,
        includeHealth: false,
      });
      return search.results.flatMap((result) =>
        result.commands.map((command) => ({
          capabilityId: command.capabilityId,
          registryPluginId: result.registryPluginId,
          packageId: result.packageId,
          packageName: result.packageName,
          command: command.name,
        })),
      );
    } catch {
      return [];
    }
  }

  return {
    ambientCliCapabilityGrantsForWorkflowRequest,
    createMainDiagnosticSource,
    pluginMcpRegistrationsForThread,
    pluginStateReaderForStore,
    readAmbientPluginRegistry,
    readCodexHostedMarketplaceReport,
    readCodexPluginCatalog,
    revokePluginGrantsForLabels,
  };
}
