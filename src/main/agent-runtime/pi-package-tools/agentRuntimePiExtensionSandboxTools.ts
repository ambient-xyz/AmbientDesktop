import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  registerPiExtensionSandboxClearHistoryTool,
  type PiExtensionSandboxClearHistoryPermissionRequest,
} from "./agentRuntimePiExtensionSandboxClearHistoryTools";
import {
  registerPiExtensionSandboxInstallTool,
  type PiExtensionSandboxInstallPermissionRequest,
  type PiExtensionSandboxPrivilegedScanUpdatedEvent,
} from "./agentRuntimePiExtensionSandboxInstallTools";
import {
  registerPiExtensionSandboxRunTool,
  type PiExtensionSandboxRunPermissionRequest,
} from "./agentRuntimePiExtensionSandboxRunTools";
import {
  registerPiExtensionSandboxUninstallTool,
  type PiExtensionSandboxUninstallPermissionRequest,
} from "./agentRuntimePiExtensionSandboxUninstallTools";
import { registerPiExtensionSandboxHistoryTool } from "./agentRuntimePiPackageHistoryTools";

export type AgentRuntimePiExtensionSandboxPermissionRequest =
  | PiExtensionSandboxInstallPermissionRequest
  | PiExtensionSandboxRunPermissionRequest
  | PiExtensionSandboxUninstallPermissionRequest
  | PiExtensionSandboxClearHistoryPermissionRequest;

export type AgentRuntimePiExtensionSandboxEvent =
  | PiExtensionSandboxPrivilegedScanUpdatedEvent
  | { type: "plugin-catalog-updated" };

export interface AgentRuntimePiExtensionSandboxToolOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  resolveFirstPartyPluginPermission: (
    input: AgentRuntimePiExtensionSandboxPermissionRequest,
  ) => Promise<boolean> | boolean;
  revokePluginGrantsForLabels: (labels: string[]) => number;
  markPluginToolsStale: () => void;
  emit: (event: AgentRuntimePiExtensionSandboxEvent) => void;
}

export function registerAgentRuntimePiExtensionSandboxTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimePiExtensionSandboxToolOptions,
): void {
  registerPiExtensionSandboxInstallTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    emit: options.emit,
  });

  registerPiExtensionSandboxRunTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerPiExtensionSandboxUninstallTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    revokePluginGrantsForLabels: options.revokePluginGrantsForLabels,
    markPluginToolsStale: options.markPluginToolsStale,
  });

  registerPiExtensionSandboxHistoryTool(pi, {
    workspace: options.workspace,
  });

  registerPiExtensionSandboxClearHistoryTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    emit: options.emit,
  });
}
