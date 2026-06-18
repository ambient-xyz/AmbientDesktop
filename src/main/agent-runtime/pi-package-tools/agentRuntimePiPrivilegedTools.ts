import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  registerPiPrivilegedClearHistoryTool,
  type PiPrivilegedClearHistoryPermissionRequest,
} from "./agentRuntimePiPrivilegedClearHistoryTools";
import { registerPiPrivilegedDisableTool } from "./agentRuntimePiPrivilegedDisableTools";
import {
  registerPiPrivilegedInstallTool,
  type PiPrivilegedInstallPermissionRequest,
} from "./agentRuntimePiPrivilegedInstallTools";
import { registerPiPrivilegedHistoryTool } from "./agentRuntimePiPackageHistoryTools";
import { registerPiPrivilegedScanTool } from "./agentRuntimePiPrivilegedScanTools";
import {
  registerPiPrivilegedUninstallTool,
  type PiPrivilegedUninstallPermissionRequest,
} from "./agentRuntimePiPrivilegedUninstallTools";

export type AgentRuntimePiPrivilegedPermissionRequest =
  | PiPrivilegedInstallPermissionRequest
  | PiPrivilegedUninstallPermissionRequest
  | PiPrivilegedClearHistoryPermissionRequest;

export interface AgentRuntimePiPrivilegedToolOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  resolveFirstPartyPluginPermission: (
    input: AgentRuntimePiPrivilegedPermissionRequest,
  ) => Promise<boolean> | boolean;
  revokePluginGrantsForLabels: (labels: string[]) => number;
  markPluginToolsStale: () => void;
  emit: (event: { type: "plugin-catalog-updated" }) => void;
}

export function registerAgentRuntimePiPrivilegedTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimePiPrivilegedToolOptions,
): void {
  registerPiPrivilegedScanTool(pi, {
    workspace: options.workspace,
  });

  registerPiPrivilegedInstallTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
  });

  registerPiPrivilegedDisableTool(pi, {
    workspace: options.workspace,
  });

  registerPiPrivilegedUninstallTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    revokePluginGrantsForLabels: options.revokePluginGrantsForLabels,
    markPluginToolsStale: options.markPluginToolsStale,
  });

  registerPiPrivilegedHistoryTool(pi, {
    workspace: options.workspace,
  });

  registerPiPrivilegedClearHistoryTool(pi, {
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    emit: options.emit,
  });
}
