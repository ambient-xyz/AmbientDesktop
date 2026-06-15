import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  AmbientPermissionGrant,
  DesktopEvent,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  registerAgentRuntimeMcpServerTools,
  type AgentRuntimeMcpPermissionRequest,
  type AgentRuntimeMcpServerToolsOptions,
} from "./agentRuntimeMcpServerTools";
import {
  registerPluginInstallApplyTools,
  type PluginInstallApplyPermissionRequest,
  type PluginInstallApplyToolRegistrationOptions,
} from "./agentRuntimePluginInstallApplyTools";
import {
  registerPluginInstallPlanningTools,
  registerPluginInstallPreviewTool,
  type PluginInstallPlanningToolRegistrationOptions,
  type PluginInstallPreviewToolRegistrationOptions,
} from "./agentRuntimePluginInstallReadOnlyTools";
import {
  registerSetupFinalReportTool,
  type SetupFinalReportToolRegistrationOptions,
} from "./agentRuntimeSetupFinalReportTools";
import {
  registerJsonRepairTool,
  type JsonRepairToolRegistrationOptions,
} from "./agentRuntimeJsonRepairTools";

export interface AgentRuntimePluginInstallCoreToolOptions {
  threadId: string;
  workspace: WorkspaceState;
  model: Model<"openai-completions">;
  apiKey?: string;
  mcpAppVersion?: string;
  getCurrentThread: () => ThreadSummary;
  getThread: () => ThreadSummary;
  getThreadById: (threadId: string) => ThreadSummary;
  createMcpRuntime: AgentRuntimeMcpServerToolsOptions["createMcpRuntime"];
  listPermissionGrants: () => AmbientPermissionGrant[];
  recordMcpAutowirePlan: () => void;
  recordInstallRoutePlan: PluginInstallPlanningToolRegistrationOptions["recordInstallRoutePlan"];
  browserNavigate: SetupFinalReportToolRegistrationOptions["browserNavigate"];
  emitBrowserState: SetupFinalReportToolRegistrationOptions["emitBrowserState"];
  recordSetupFinalReportBrowserAudit: SetupFinalReportToolRegistrationOptions["recordSetupFinalReportBrowserAudit"];
  withBrowserToolHeartbeat: SetupFinalReportToolRegistrationOptions["withBrowserToolHeartbeat"];
  previewCodexPluginInstall: PluginInstallPreviewToolRegistrationOptions["previewCodexPluginInstall"];
  commitCodexPluginInstall: PluginInstallApplyToolRegistrationOptions["commitCodexPluginInstall"];
  readCodexPluginCatalog: PluginInstallApplyToolRegistrationOptions["readCodexPluginCatalog"];
  installCodexPluginDependencies: PluginInstallApplyToolRegistrationOptions["installCodexPluginDependencies"];
  shutdownPluginMcpServers: PluginInstallApplyToolRegistrationOptions["shutdownPluginMcpServers"];
  setPluginEnabled: PluginInstallApplyToolRegistrationOptions["setPluginEnabled"];
  markPluginToolsStale: PluginInstallApplyToolRegistrationOptions["markPluginToolsStale"];
  getModelRuntimeSettings: JsonRepairToolRegistrationOptions["getModelRuntimeSettings"];
  resolveFirstPartyPluginPermission: (
    input: AgentRuntimeMcpPermissionRequest | PluginInstallApplyPermissionRequest,
  ) => Promise<boolean> | boolean;
  emit: (event: DesktopEvent) => void;
}

export function registerAgentRuntimePluginInstallCoreTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimePluginInstallCoreToolOptions,
): void {
  registerAgentRuntimeMcpServerTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    model: options.model,
    apiKey: options.apiKey,
    mcpAppVersion: options.mcpAppVersion,
    getCurrentThread: options.getCurrentThread,
    getThread: options.getThreadById,
    createMcpRuntime: options.createMcpRuntime,
    listPermissionGrants: options.listPermissionGrants,
    recordMcpAutowirePlan: options.recordMcpAutowirePlan,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    emit: options.emit,
  });

  registerPluginInstallPlanningTools(pi, {
    workspace: options.workspace,
    recordInstallRoutePlan: options.recordInstallRoutePlan,
  });

  registerSetupFinalReportTool(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    browserNavigate: options.browserNavigate,
    emitBrowserState: options.emitBrowserState,
    recordSetupFinalReportBrowserAudit: options.recordSetupFinalReportBrowserAudit,
    withBrowserToolHeartbeat: options.withBrowserToolHeartbeat,
  });

  registerPluginInstallPreviewTool(pi, {
    workspace: options.workspace,
    previewCodexPluginInstall: options.previewCodexPluginInstall,
  });

  registerPluginInstallApplyTools(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    previewCodexPluginInstall: options.previewCodexPluginInstall,
    commitCodexPluginInstall: options.commitCodexPluginInstall,
    readCodexPluginCatalog: options.readCodexPluginCatalog,
    installCodexPluginDependencies: options.installCodexPluginDependencies,
    shutdownPluginMcpServers: options.shutdownPluginMcpServers,
    setPluginEnabled: options.setPluginEnabled,
    markPluginToolsStale: options.markPluginToolsStale,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerJsonRepairTool(pi, {
    model: { id: options.model.id, baseUrl: options.model.baseUrl },
    apiKey: options.apiKey,
    getModelRuntimeSettings: options.getModelRuntimeSettings,
  });
}
