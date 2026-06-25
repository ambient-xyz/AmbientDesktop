import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  pluginStateReaderFromStore,
  type AgentRuntimePluginDiscoveryStore,
} from "./agentRuntimePluginsFacade";
import {
  createAmbientCliPackageSummaryModelComplete,
  hydrateFirstPartyAmbientCliPackageSummaries,
} from "./ambient-cli-package/agentRuntimeAmbientCliPackageSummaryHydration";
import {
  ambientCapabilityBuilderApplyRepairInput,
  ambientCapabilityBuilderHistoryInput,
  ambientCapabilityBuilderInstallDepsInput,
  ambientCapabilityBuilderListFilesInput,
  ambientCapabilityBuilderMcpRoutePreflight,
  ambientCapabilityBuilderPlanInput,
  ambientCapabilityBuilderPlanText,
  ambientCapabilityBuilderPreviewInput,
  ambientCapabilityBuilderReadFileInput,
  ambientCapabilityBuilderRegisterInput,
  ambientCapabilityBuilderRegistrationRepairInput,
  ambientCapabilityBuilderRemovalPlanInput,
  ambientCapabilityBuilderRepairPlanInput,
  ambientCapabilityBuilderScaffoldInput,
  ambientCapabilityBuilderSecretRequestInput,
  ambientCapabilityBuilderUnregisterInput,
  ambientCapabilityBuilderUpdatePlanInput,
  ambientCapabilityBuilderValidateInput,
  ambientCapabilityBuilderWriteFileInput,
  suggestedCapabilityPackageName,
} from "./agentRuntimeCapabilityBuilderFacade";
import {
  createAgentRuntimePluginToolExtension,
  type AgentRuntimePluginToolAssemblyOptions,
} from "./agentRuntimePluginToolAssembly";
import type { AmbientPluginHost } from "./agentRuntimePluginsFacade";

type AmbientCapabilityBuilderPlanInput = ReturnType<typeof ambientCapabilityBuilderPlanInput>;
type PluginToolAssemblyOptions = AgentRuntimePluginToolAssemblyOptions<AmbientCapabilityBuilderPlanInput>;
type PluginInstallCoreOptions = PluginToolAssemblyOptions["pluginInstallCore"];
type CapabilityBuilderOptions = PluginToolAssemblyOptions["capabilityBuilder"];
type AmbientCliPackageOptions = PluginToolAssemblyOptions["ambientCliPackages"];
type AmbientWorkflowOptions = PluginToolAssemblyOptions["ambientWorkflows"];
type PiPackageOptions = PluginToolAssemblyOptions["piPackages"];
type PluginInstallApplyCallbackOptions = Pick<
  AgentRuntimePluginInstallToolExtensionOptions,
  | "listPermissionGrants"
  | "previewCodexPluginInstall"
  | "commitCodexPluginInstall"
  | "readCodexPluginCatalog"
  | "installCodexPluginDependencies"
  | "shutdownPluginMcpServers"
  | "setPluginEnabled"
  | "markPluginToolsStale"
  | "getModelRuntimeSettings"
>;

type FirstPartyPluginPermissionInput =
  | Parameters<PluginInstallCoreOptions["resolveFirstPartyPluginPermission"]>[0]
  | Parameters<CapabilityBuilderOptions["resolveFirstPartyPluginPermission"]>[0]
  | Parameters<PiPackageOptions["resolveFirstPartyPluginPermission"]>[0];

export interface AgentRuntimePluginInstallToolExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  model: Model<"openai-completions">;
  apiKey: string | undefined;
  mcpAppVersion: PluginInstallCoreOptions["mcpAppVersion"];
  getThread: PluginInstallCoreOptions["getThreadById"];
  createMcpRuntime: PluginInstallCoreOptions["createMcpRuntime"];
  listPermissionGrants: PluginInstallCoreOptions["listPermissionGrants"];
  recordMcpAutowirePlan: PluginInstallCoreOptions["recordMcpAutowirePlan"];
  recordInstallRoutePlan: PluginInstallCoreOptions["recordInstallRoutePlan"];
  browserNavigate: PluginInstallCoreOptions["browserNavigate"];
  emitBrowserState: PluginInstallCoreOptions["emitBrowserState"];
  recordSetupFinalReportBrowserAudit: PluginInstallCoreOptions["recordSetupFinalReportBrowserAudit"];
  withBrowserToolHeartbeat: PluginInstallCoreOptions["withBrowserToolHeartbeat"];
  previewCodexPluginInstall: PluginInstallCoreOptions["previewCodexPluginInstall"];
  commitCodexPluginInstall: PluginInstallCoreOptions["commitCodexPluginInstall"];
  readCodexPluginCatalog: PluginInstallCoreOptions["readCodexPluginCatalog"];
  installCodexPluginDependencies: PluginInstallCoreOptions["installCodexPluginDependencies"];
  shutdownPluginMcpServers: PluginInstallCoreOptions["shutdownPluginMcpServers"];
  setPluginEnabled: PluginInstallCoreOptions["setPluginEnabled"];
  markPluginToolsStale: PluginInstallCoreOptions["markPluginToolsStale"];
  getModelRuntimeSettings: PluginInstallCoreOptions["getModelRuntimeSettings"];
  resolveFirstPartyPluginPermission: (input: FirstPartyPluginPermissionInput) => Promise<boolean> | boolean;
  emitDesktopEvent: (event: DesktopEvent) => void;
  latestInstallRouteLane: CapabilityBuilderOptions["latestInstallRouteLane"];
  mcpAutowirePlanned: CapabilityBuilderOptions["mcpAutowirePlanned"];
  runCapabilityBuilderValidationWithPermission: CapabilityBuilderOptions["runCapabilityBuilderValidationWithPermission"];
  completeRegisteredVoiceProviderSetup: CapabilityBuilderOptions["completeRegisteredVoiceProviderSetup"];
  emitAmbientCliSecretRequested: AmbientCliPackageOptions["emitAmbientCliSecretRequested"];
  isAmbientCliPackageDescribed: AmbientCliPackageOptions["isAmbientCliPackageDescribed"];
  markAmbientCliPackageDescribed: AmbientCliPackageOptions["markAmbientCliPackageDescribed"];
  ambientWorkflowStore: AmbientWorkflowOptions["store"];
  workflowRecordings: AmbientWorkflowOptions["workflowRecordings"];
  markAmbientWorkflowPlaybookDescribed: AmbientWorkflowOptions["markAmbientWorkflowPlaybookDescribed"];
  isAmbientWorkflowPlaybookDescribed: AmbientWorkflowOptions["isAmbientWorkflowPlaybookDescribed"];
  getFeatureFlagSnapshot: AmbientWorkflowOptions["getFeatureFlagSnapshot"];
  getCallableWorkflowRecordedPlaybooks: AmbientWorkflowOptions["getCallableWorkflowRecordedPlaybooks"];
  revokePluginGrantsForLabels: PiPackageOptions["revokePluginGrantsForLabels"];
}

export interface AgentRuntimePluginInstallApplyCallbackStore extends AgentRuntimePluginDiscoveryStore {
  listPermissionGrants: AgentRuntimePluginInstallToolExtensionOptions["listPermissionGrants"];
  setPluginEnabled: AgentRuntimePluginInstallToolExtensionOptions["setPluginEnabled"];
  getModelRuntimeSettings: AgentRuntimePluginInstallToolExtensionOptions["getModelRuntimeSettings"];
}

export interface AgentRuntimePluginInstallApplyCallbackInput {
  pluginHost: Pick<
    AmbientPluginHost,
    | "previewCodexPluginInstall"
    | "commitCodexPluginInstall"
    | "readCodexPluginCatalog"
    | "installCodexPluginDependencies"
    | "shutdownPluginMcpServers"
  >;
  store: AgentRuntimePluginInstallApplyCallbackStore;
  markPluginToolsStale: AgentRuntimePluginInstallToolExtensionOptions["markPluginToolsStale"];
}

export function createAgentRuntimePluginInstallApplyCallbacks(
  input: AgentRuntimePluginInstallApplyCallbackInput,
): PluginInstallApplyCallbackOptions {
  return {
    listPermissionGrants: () => input.store.listPermissionGrants(),
    previewCodexPluginInstall: (workspacePath, installInput) =>
      input.pluginHost.previewCodexPluginInstall(workspacePath, installInput),
    commitCodexPluginInstall: (workspacePath, installInput) =>
      input.pluginHost.commitCodexPluginInstall(workspacePath, installInput),
    readCodexPluginCatalog: (workspacePath) =>
      input.pluginHost.readCodexPluginCatalog(workspacePath, pluginStateReaderFromStore(input.store)),
    installCodexPluginDependencies: (workspacePath, installInput) =>
      input.pluginHost.installCodexPluginDependencies(workspacePath, installInput),
    shutdownPluginMcpServers: () => input.pluginHost.shutdownPluginMcpServers(),
    setPluginEnabled: (pluginId, enabled) => input.store.setPluginEnabled(pluginId, enabled),
    markPluginToolsStale: input.markPluginToolsStale,
    getModelRuntimeSettings: () => input.store.getModelRuntimeSettings(),
  };
}

export function createAgentRuntimePluginInstallToolExtension(
  options: AgentRuntimePluginInstallToolExtensionOptions,
): ExtensionFactory {
  const ambientCliPackageSummaryModelComplete = createAmbientCliPackageSummaryModelComplete({
    model: options.model,
    apiKey: options.apiKey,
  });
  const getThread = () => options.getThread(options.threadId);
  const pluginPermissionOptions = {
    workspace: options.workspace,
    getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  };
  const pluginMutationOptions = {
    ...pluginPermissionOptions,
    markPluginToolsStale: options.markPluginToolsStale,
  };
  const pluginEventOptions = {
    ...pluginMutationOptions,
    emit: options.emitDesktopEvent,
  };

  return createAgentRuntimePluginToolExtension({
    pluginInstallCore: {
      ...pluginEventOptions,
      threadId: options.threadId,
      model: options.model,
      apiKey: options.apiKey,
      mcpAppVersion: options.mcpAppVersion,
      getCurrentThread: getThread,
      getThreadById: options.getThread,
      createMcpRuntime: options.createMcpRuntime,
      listPermissionGrants: options.listPermissionGrants,
      recordMcpAutowirePlan: options.recordMcpAutowirePlan,
      recordInstallRoutePlan: options.recordInstallRoutePlan,
      browserNavigate: options.browserNavigate,
      emitBrowserState: options.emitBrowserState,
      recordSetupFinalReportBrowserAudit: options.recordSetupFinalReportBrowserAudit,
      withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
      previewCodexPluginInstall: options.previewCodexPluginInstall,
      commitCodexPluginInstall: options.commitCodexPluginInstall,
      readCodexPluginCatalog: options.readCodexPluginCatalog,
      installCodexPluginDependencies: options.installCodexPluginDependencies,
      shutdownPluginMcpServers: options.shutdownPluginMcpServers,
      setPluginEnabled: options.setPluginEnabled,
      getModelRuntimeSettings: options.getModelRuntimeSettings,
    },

    capabilityBuilder: {
      ...pluginMutationOptions,
      parsePlanInput: ambientCapabilityBuilderPlanInput,
      planText: ambientCapabilityBuilderPlanText,
      routePreflight: ambientCapabilityBuilderMcpRoutePreflight,
      latestInstallRouteLane: options.latestInstallRouteLane,
      mcpAutowirePlanned: options.mcpAutowirePlanned,
      parseScaffoldInput: ambientCapabilityBuilderScaffoldInput,
      suggestedCapabilityPackageName,
      parsePreviewInput: ambientCapabilityBuilderPreviewInput,
      parseListFilesInput: ambientCapabilityBuilderListFilesInput,
      parseReadFileInput: ambientCapabilityBuilderReadFileInput,
      parseWriteFileInput: ambientCapabilityBuilderWriteFileInput,
      parseSecretRequestInput: ambientCapabilityBuilderSecretRequestInput,
      parseHistoryInput: ambientCapabilityBuilderHistoryInput,
      parseUpdatePlanInput: ambientCapabilityBuilderUpdatePlanInput,
      parseRepairPlanInput: ambientCapabilityBuilderRepairPlanInput,
      parseApplyRepairInput: ambientCapabilityBuilderApplyRepairInput,
      parseRemovalPlanInput: ambientCapabilityBuilderRemovalPlanInput,
      parseUnregisterInput: ambientCapabilityBuilderUnregisterInput,
      parseRegistrationRepairInput: ambientCapabilityBuilderRegistrationRepairInput,
      parseInstallDepsInput: ambientCapabilityBuilderInstallDepsInput,
      parseValidateInput: ambientCapabilityBuilderValidateInput,
      runCapabilityBuilderValidationWithPermission: options.runCapabilityBuilderValidationWithPermission,
      parseRegisterInput: ambientCapabilityBuilderRegisterInput,
      completeRegisteredVoiceProviderSetup: options.completeRegisteredVoiceProviderSetup,
      emitDesktopEvent: options.emitDesktopEvent,
    },

    ambientCliPackages: {
      ...pluginMutationOptions,
      hydrateFirstPartyAmbientCliPackageSummaries: (packageId) =>
        hydrateFirstPartyAmbientCliPackageSummaries({
          workspace: options.workspace,
          model: options.model,
          apiKey: options.apiKey,
          packageId,
        }),
      emitAmbientCliSecretRequested: options.emitAmbientCliSecretRequested,
      isAmbientCliPackageDescribed: options.isAmbientCliPackageDescribed,
      markAmbientCliPackageDescribed: options.markAmbientCliPackageDescribed,
      ...(ambientCliPackageSummaryModelComplete
        ? { modelComplete: ambientCliPackageSummaryModelComplete }
        : {}),
    },

    ambientWorkflows: {
      store: options.ambientWorkflowStore,
      workflowRecordings: options.workflowRecordings,
      markAmbientWorkflowPlaybookDescribed: options.markAmbientWorkflowPlaybookDescribed,
      isAmbientWorkflowPlaybookDescribed: options.isAmbientWorkflowPlaybookDescribed,
      getFeatureFlagSnapshot: options.getFeatureFlagSnapshot,
      getCallableWorkflowRecordedPlaybooks: options.getCallableWorkflowRecordedPlaybooks,
    },

    piPackages: {
      ...pluginEventOptions,
      latestInstallRouteLane: options.latestInstallRouteLane,
      revokePluginGrantsForLabels: options.revokePluginGrantsForLabels,
    },
  });
}
